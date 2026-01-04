import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServerInfo, isServerImplemented, AVAILABLE_SERVERS } from '../utils/servers.js';

export async function run(serverName: string): Promise<void> {
  const serverInfo = getServerInfo(serverName);

  if (!serverInfo) {
    console.error(`Error: Unknown server: ${serverName}`);
    console.error('Available servers:', AVAILABLE_SERVERS.map(s => s.name).join(', '));
    process.exit(1);
  }

  if (!isServerImplemented(serverName)) {
    console.error(`Error: ${serverInfo.displayName} server is not yet implemented`);
    process.exit(1);
  }

  // Find the server entry point
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Try multiple possible locations
  const possiblePaths = [
    // When installed via npm (production)
    join(__dirname, '..', '..', 'servers', `${serverName}-mcp`, 'dist', 'index.js'),
    // When running from source (development)
    join(__dirname, '..', '..', '..', 'servers', `${serverName}-mcp`, 'dist', 'index.js'),
    // Alternative development path
    join(process.cwd(), 'servers', `${serverName}-mcp`, 'dist', 'index.js'),
  ];

  let serverPath: string | null = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      serverPath = path;
      break;
    }
  }

  if (!serverPath) {
    console.error(`Error: Server not found for ${serverName}`);
    console.error('Searched paths:');
    for (const path of possiblePaths) {
      console.error(`  - ${path}`);
    }
    console.error('\nTry rebuilding: npm run build');
    process.exit(1);
  }

  // Spawn the server process, inheriting stdio for MCP communication
  const child = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`Error starting server: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Handle signals for clean shutdown
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}
