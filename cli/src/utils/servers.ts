import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerInfo {
  name: string;
  displayName: string;
  description: string;
  envVars: EnvVarInfo[];
  local: boolean; // true if server accesses only local resources
}

export interface EnvVarInfo {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
  helpUrl?: string;
}

export const AVAILABLE_SERVERS: ServerInfo[] = [
  {
    name: 'linear',
    displayName: 'Linear',
    description: 'Issue tracking and project management',
    local: false,
    envVars: [
      {
        name: 'LINEAR_API_KEY',
        description: 'Your Linear API key',
        required: true,
        secret: true,
        example: 'lin_api_xxxxxxxxxxxxx',
        helpUrl: 'https://linear.app/settings/api',
      },
    ],
  },
  {
    name: 'postgres',
    displayName: 'PostgreSQL',
    description: 'Query PostgreSQL databases',
    local: true,
    envVars: [
      {
        name: 'POSTGRES_URL',
        description: 'PostgreSQL connection string',
        required: true,
        secret: true,
        example: 'postgresql://user:pass@localhost:5432/dbname',
      },
    ],
  },
  {
    name: 'notion',
    displayName: 'Notion',
    description: 'Search and create Notion pages',
    local: false,
    envVars: [
      {
        name: 'NOTION_API_KEY',
        description: 'Notion integration token',
        required: true,
        secret: true,
        example: 'secret_xxxxxxxxxxxxx',
        helpUrl: 'https://www.notion.so/my-integrations',
      },
    ],
  },
  {
    name: 'obsidian',
    displayName: 'Obsidian',
    description: 'Search your local Obsidian vault',
    local: true,
    envVars: [
      {
        name: 'OBSIDIAN_VAULT',
        description: 'Path to your Obsidian vault folder',
        required: true,
        secret: false,
        example: '~/Documents/MyVault',
      },
    ],
  },
  {
    name: 'sqlite',
    displayName: 'SQLite',
    description: 'Query local SQLite databases',
    local: true,
    envVars: [
      {
        name: 'SQLITE_PATH',
        description: 'Path to SQLite database file',
        required: true,
        secret: false,
        example: '~/data/app.db',
      },
    ],
  },
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Access GitHub repos, issues, and PRs',
    local: false,
    envVars: [
      {
        name: 'GITHUB_TOKEN',
        description: 'GitHub personal access token',
        required: true,
        secret: true,
        example: 'ghp_xxxxxxxxxxxxx',
        helpUrl: 'https://github.com/settings/tokens',
      },
    ],
  },
  {
    name: 'filesystem',
    displayName: 'Filesystem',
    description: 'Read and search local files',
    local: true,
    envVars: [
      {
        name: 'FS_ROOT',
        description: 'Root directory to allow access to',
        required: true,
        secret: false,
        example: '~/Projects',
      },
    ],
  },
];

export function getServerInfo(name: string): ServerInfo | null {
  return AVAILABLE_SERVERS.find(s => s.name === name) || null;
}

export function getServerPath(name: string): string {
  // In production (npm package), servers are in ../servers/<name>-mcp/dist/index.js
  // relative to the cli/dist directory
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..', '..', 'servers', `${name}-mcp`, 'dist', 'index.js');
}

export function isServerAvailable(name: string): boolean {
  // Check if server is in the available list
  return AVAILABLE_SERVERS.some(s => s.name === name);
}

export function isServerImplemented(name: string): boolean {
  // These servers have actual implementations
  const implemented = ['linear', 'postgres', 'notion', 'obsidian', 'sqlite', 'github', 'filesystem'];
  return implemented.includes(name);
}
