import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  servers: Record<string, ServerConfig>;
}

export function getConfigPath(): string {
  // Check for Claude Code config location
  const claudeDir = join(homedir(), '.claude');
  return join(claudeDir, 'mcp.json');
}

export function readConfig(): McpConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { servers: {} };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as McpConfig;
  } catch {
    return { servers: {} };
  }
}

export function writeConfig(config: McpConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function addServer(name: string, serverConfig: ServerConfig): void {
  const config = readConfig();
  config.servers[name] = serverConfig;
  writeConfig(config);
}

export function removeServer(name: string): boolean {
  const config = readConfig();

  if (!config.servers[name]) {
    return false;
  }

  delete config.servers[name];
  writeConfig(config);
  return true;
}

export function hasServer(name: string): boolean {
  const config = readConfig();
  return !!config.servers[name];
}

export function getServerConfig(name: string): ServerConfig | null {
  const config = readConfig();
  return config.servers[name] || null;
}

export function listConfiguredServers(): string[] {
  const config = readConfig();
  return Object.keys(config.servers);
}
