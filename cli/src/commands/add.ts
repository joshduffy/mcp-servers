import { createInterface } from 'node:readline';
import { addServer, hasServer, getConfigPath } from '../utils/config.js';
import { getServerInfo, isServerImplemented, AVAILABLE_SERVERS } from '../utils/servers.js';
import { detectServer } from '../utils/detect.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

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

async function promptSecret(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function add(serverName: string): Promise<void> {
  const serverInfo = getServerInfo(serverName);

  if (!serverInfo) {
    console.error(`${COLORS.red}Error:${COLORS.reset} Unknown server: ${serverName}`);
    console.log('\nAvailable servers:');
    for (const s of AVAILABLE_SERVERS) {
      const status = isServerImplemented(s.name) ? '' : ` ${COLORS.dim}(coming soon)${COLORS.reset}`;
      console.log(`  - ${s.name}: ${s.description}${status}`);
    }
    process.exit(1);
  }

  if (!isServerImplemented(serverName)) {
    console.error(`${COLORS.yellow}!${COLORS.reset} ${serverInfo.displayName} server is coming soon!`);
    console.log('Available now: linear, postgres, notion, obsidian');
    process.exit(1);
  }

  if (hasServer(serverName)) {
    console.log(`${COLORS.yellow}!${COLORS.reset} ${serverInfo.displayName} is already configured`);
    console.log(`Config: ${getConfigPath()}`);
    process.exit(0);
  }

  console.log(`\n${COLORS.bold}Adding ${serverInfo.displayName}${COLORS.reset}`);
  console.log(`${COLORS.dim}${serverInfo.description}${COLORS.reset}\n`);

  // Try to detect existing values
  const detection = detectServer(serverName);
  const env: Record<string, string> = {};

  for (const envVar of serverInfo.envVars) {
    const suggestedValue = detection?.suggestedEnv?.[envVar.name];

    let promptText = envVar.description;
    if (envVar.helpUrl) {
      promptText += `\n${COLORS.dim}Get it here: ${envVar.helpUrl}${COLORS.reset}`;
    }
    if (envVar.example) {
      promptText += `\n${COLORS.dim}Example: ${envVar.example}${COLORS.reset}`;
    }

    console.log(promptText);

    let value: string;
    if (envVar.secret) {
      value = await promptSecret(envVar.name);
    } else {
      value = await prompt(envVar.name, suggestedValue);
    }

    if (!value && envVar.required) {
      console.error(`${COLORS.red}Error:${COLORS.reset} ${envVar.name} is required`);
      process.exit(1);
    }

    if (value) {
      env[envVar.name] = value;
    }
  }

  // Add to config
  addServer(serverName, {
    command: 'npx',
    args: ['mcp-servers-cli', 'run', serverName],
    env,
  });

  console.log(`\n${COLORS.green}✓${COLORS.reset} ${serverInfo.displayName} added successfully!`);
  console.log(`${COLORS.dim}Config: ${getConfigPath()}${COLORS.reset}`);
  console.log(`\n${COLORS.dim}Restart Claude Code to load the new server.${COLORS.reset}\n`);
}
