#!/usr/bin/env node

import { init } from './commands/init.js';
import { add } from './commands/add.js';
import { run } from './commands/run.js';
import { list } from './commands/list.js';

const VERSION = '0.1.0';

const HELP = `
\x1b[1m@pulselab/mcp-servers\x1b[0m v${VERSION}
Privacy-first MCP servers for Claude

\x1b[1mUSAGE:\x1b[0m
  mcp-servers <command> [options]
  npx @pulselab/mcp-servers <command>

\x1b[1mCOMMANDS:\x1b[0m
  init              Interactive setup wizard
  add <server>      Add a specific server
  run <server>      Run a server (used by Claude)
  list              List available servers

\x1b[1mSERVERS:\x1b[0m
  linear            Linear issue tracking
  postgres          PostgreSQL database
  notion            Notion workspace
  obsidian          Obsidian vault (local)

\x1b[1mEXAMPLES:\x1b[0m
  npx @pulselab/mcp-servers init
  mcp-servers add linear
  mcp-servers add obsidian

\x1b[1mOPTIONS:\x1b[0m
  -h, --help        Show help
  -v, --version     Show version

\x1b[2mhttps://github.com/joshduffy/mcp-servers\x1b[0m
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '-h' || command === '--help') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === '-v' || command === '--version') {
    console.log(`@pulselab/mcp-servers v${VERSION}`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init':
        await init();
        break;

      case 'add':
        const serverToAdd = args[1];
        if (!serverToAdd) {
          console.error('\x1b[31mError:\x1b[0m Please specify a server to add');
          console.error('Usage: mcp-servers add <server>');
          console.error('Available: linear, postgres, notion, obsidian');
          process.exit(1);
        }
        await add(serverToAdd);
        break;

      case 'run':
        const serverToRun = args[1];
        if (!serverToRun) {
          console.error('\x1b[31mError:\x1b[0m Please specify a server to run');
          process.exit(1);
        }
        await run(serverToRun);
        break;

      case 'list':
        await list();
        break;

      default:
        console.error(`\x1b[31mError:\x1b[0m Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error('\x1b[31mError:\x1b[0m', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
