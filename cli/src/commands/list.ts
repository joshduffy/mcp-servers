import { listConfiguredServers, getConfigPath } from '../utils/config.js';
import { AVAILABLE_SERVERS, isServerImplemented } from '../utils/servers.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

export async function list(): Promise<void> {
  const configured = listConfiguredServers();

  console.log(`\n${COLORS.bold}Available MCP Servers${COLORS.reset}\n`);

  // Group by status
  const implemented = AVAILABLE_SERVERS.filter(s => isServerImplemented(s.name));
  const comingSoon = AVAILABLE_SERVERS.filter(s => !isServerImplemented(s.name));

  // Show implemented servers
  console.log(`${COLORS.green}Ready to use:${COLORS.reset}`);
  for (const server of implemented) {
    const isConfigured = configured.includes(server.name);
    const status = isConfigured
      ? `${COLORS.green}[configured]${COLORS.reset}`
      : `${COLORS.dim}[not configured]${COLORS.reset}`;

    const localBadge = server.local ? `${COLORS.blue}[local]${COLORS.reset} ` : '';

    console.log(`  ${server.name.padEnd(12)} ${localBadge}${server.description} ${status}`);
  }

  // Show coming soon
  if (comingSoon.length > 0) {
    console.log(`\n${COLORS.yellow}Coming soon:${COLORS.reset}`);
    for (const server of comingSoon) {
      const localBadge = server.local ? `${COLORS.blue}[local]${COLORS.reset} ` : '';
      console.log(`  ${COLORS.dim}${server.name.padEnd(12)} ${localBadge}${server.description}${COLORS.reset}`);
    }
  }

  // Show config info
  console.log(`\n${COLORS.dim}Config: ${getConfigPath()}${COLORS.reset}`);
  console.log(`${COLORS.dim}Add a server: mcp-servers add <name>${COLORS.reset}\n`);
}
