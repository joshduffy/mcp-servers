import { createInterface } from 'node:readline';
import { detectServers, DetectionResult } from '../utils/detect.js';
import { addServer, getConfigPath, hasServer, readConfig } from '../utils/config.js';
import { AVAILABLE_SERVERS, getServerInfo, isServerImplemented } from '../utils/servers.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string): void {
  console.log(message);
}

function success(message: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
}

function warn(message: string): void {
  console.log(`${COLORS.yellow}!${COLORS.reset} ${message}`);
}

function info(message: string): void {
  console.log(`${COLORS.blue}ℹ${COLORS.reset} ${message}`);
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` ${COLORS.dim}(${defaultValue})${COLORS.reset}` : '';
    rl.question(`${question}${defaultText}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await prompt(`${question} [${hint}]`);

  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function promptSecret(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Note: This doesn't actually hide input in all terminals
    // For true secret input, we'd need a library like 'read'
    rl.question(`${question}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setupServer(detection: DetectionResult): Promise<boolean> {
  const serverInfo = getServerInfo(detection.server);
  if (!serverInfo) return false;

  log('');
  log(`${COLORS.bold}Setting up ${serverInfo.displayName}${COLORS.reset}`);
  log(`${COLORS.dim}${serverInfo.description}${COLORS.reset}`);

  if (!isServerImplemented(detection.server)) {
    warn(`${serverInfo.displayName} server is coming soon!`);
    return false;
  }

  const env: Record<string, string> = {};

  for (const envVar of serverInfo.envVars) {
    // Check if we detected a value
    const suggestedValue = detection.suggestedEnv?.[envVar.name];

    if (suggestedValue && !envVar.secret) {
      // For non-secret values, show what we found and confirm
      const useDetected = await confirm(
        `  Found ${envVar.name}: ${suggestedValue}\n  Use this value?`
      );

      if (useDetected) {
        env[envVar.name] = suggestedValue;
        continue;
      }
    }

    // Prompt for value
    let promptText = `  ${envVar.description}`;
    if (envVar.helpUrl) {
      promptText += `\n  ${COLORS.dim}Get it here: ${envVar.helpUrl}${COLORS.reset}`;
    }
    if (envVar.example) {
      promptText += `\n  ${COLORS.dim}Example: ${envVar.example}${COLORS.reset}`;
    }

    log(promptText);

    let value: string;
    if (envVar.secret) {
      value = await promptSecret(`  ${envVar.name}`);
    } else {
      value = await prompt(`  ${envVar.name}`, suggestedValue);
    }

    if (!value && envVar.required) {
      warn(`  Skipping ${serverInfo.displayName} - ${envVar.name} is required`);
      return false;
    }

    if (value) {
      env[envVar.name] = value;
    }
  }

  // Add to config
  addServer(detection.server, {
    command: 'npx',
    args: ['mcp-servers-cli', 'run', detection.server],
    env,
  });

  success(`${serverInfo.displayName} configured!`);
  return true;
}

export async function init(): Promise<void> {
  log('');
  log(`${COLORS.bold}${COLORS.cyan}@pulselab/mcp-servers${COLORS.reset} setup wizard`);
  log(`${COLORS.dim}Privacy-first MCP servers for Claude${COLORS.reset}`);
  log('');

  // Check for existing config
  const existingConfig = readConfig();
  const existingServers = Object.keys(existingConfig.servers);

  if (existingServers.length > 0) {
    log(`Found existing configuration with ${existingServers.length} server(s):`);
    for (const server of existingServers) {
      log(`  - ${server}`);
    }
    log('');

    const addMore = await confirm('Would you like to add more servers?');
    if (!addMore) {
      info(`Config location: ${getConfigPath()}`);
      return;
    }
  }

  // Detect installed tools
  log('Detecting installed tools...');
  log('');

  const detections = detectServers();
  const detected = detections.filter(d => d.detected);
  const notDetected = detections.filter(d => !d.detected);

  // Show detected tools
  if (detected.length > 0) {
    log(`${COLORS.green}Found ${detected.length} tool(s):${COLORS.reset}`);
    for (const d of detected) {
      const serverInfo = getServerInfo(d.server);
      const status = hasServer(d.server) ? `${COLORS.dim}(already configured)${COLORS.reset}` : '';
      log(`  ${COLORS.green}✓${COLORS.reset} ${serverInfo?.displayName || d.server} ${status}`);
      if (d.details) {
        log(`    ${COLORS.dim}${d.details}${COLORS.reset}`);
      }
    }
    log('');
  }

  // Show not detected
  if (notDetected.length > 0) {
    log(`${COLORS.dim}Not detected (can add manually):${COLORS.reset}`);
    for (const d of notDetected) {
      const serverInfo = getServerInfo(d.server);
      log(`  ${COLORS.dim}○ ${serverInfo?.displayName || d.server}${COLORS.reset}`);
    }
    log('');
  }

  // Setup detected servers
  let configuredCount = 0;

  for (const detection of detected) {
    if (hasServer(detection.server)) {
      continue; // Already configured
    }

    const serverInfo = getServerInfo(detection.server);
    const shouldSetup = await confirm(
      `Configure ${serverInfo?.displayName || detection.server}?`
    );

    if (shouldSetup) {
      const success = await setupServer(detection);
      if (success) configuredCount++;
    }
  }

  // Offer to add non-detected servers
  const addOthers = await confirm('\nWould you like to add any other servers?', false);

  if (addOthers) {
    log('');
    log('Available servers:');

    const availableToAdd = AVAILABLE_SERVERS.filter(
      s => !hasServer(s.name) && isServerImplemented(s.name)
    );

    for (let i = 0; i < availableToAdd.length; i++) {
      const s = availableToAdd[i];
      log(`  ${i + 1}. ${s.displayName} - ${s.description}`);
    }

    log('');
    const choice = await prompt('Enter number to add (or press Enter to skip)');

    if (choice) {
      const index = parseInt(choice, 10) - 1;
      if (index >= 0 && index < availableToAdd.length) {
        const server = availableToAdd[index];
        const detection: DetectionResult = {
          server: server.name,
          detected: false,
        };
        const success = await setupServer(detection);
        if (success) configuredCount++;
      }
    }
  }

  // Summary
  log('');
  log(`${COLORS.bold}Setup complete!${COLORS.reset}`);
  log('');

  if (configuredCount > 0) {
    success(`Configured ${configuredCount} new server(s)`);
  }

  const totalServers = Object.keys(readConfig().servers).length;
  info(`Total servers configured: ${totalServers}`);
  info(`Config saved to: ${getConfigPath()}`);

  log('');
  log(`${COLORS.dim}Restart Claude Code to load the new servers.${COLORS.reset}`);
  log('');
}
