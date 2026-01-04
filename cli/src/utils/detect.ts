import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

export interface DetectionResult {
  server: string;
  detected: boolean;
  details?: string;
  suggestedEnv?: Record<string, string>;
}

function checkEnvVar(name: string): string | null {
  return process.env[name] || null;
}

function findObsidianVault(): string | null {
  const home = homedir();

  // Common Obsidian vault locations
  const commonPaths = [
    join(home, 'Documents', 'Obsidian'),
    join(home, 'Documents', 'Notes'),
    join(home, 'Documents', 'Vault'),
    join(home, 'Obsidian'),
    join(home, 'Notes'),
    join(home, 'iCloud~md~obsidian', 'Documents'),
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      // Check if it looks like an Obsidian vault (has .obsidian folder or .md files)
      try {
        const entries = readdirSync(path);
        if (entries.includes('.obsidian') || entries.some(e => e.endsWith('.md'))) {
          return path;
        }
      } catch {
        // Can't read directory
      }
    }
  }

  return null;
}

function checkPostgres(): { found: boolean; url?: string } {
  // Check for POSTGRES_URL or DATABASE_URL
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url && url.startsWith('postgres')) {
    return { found: true, url };
  }

  // Check if postgres is running locally
  try {
    execSync('pg_isready -q', { stdio: 'ignore' });
    return { found: true, url: 'postgresql://localhost:5432/postgres' };
  } catch {
    // Not running or not installed
  }

  // Check for common postgres config files
  const pgpassPath = join(homedir(), '.pgpass');
  if (existsSync(pgpassPath)) {
    return { found: true };
  }

  return { found: false };
}

function checkLinear(): { found: boolean; key?: string } {
  const key = process.env.LINEAR_API_KEY;
  if (key) {
    return { found: true, key };
  }

  // Check common dotenv files
  const envFiles = ['.env', '.env.local', '.env.development'];
  for (const file of envFiles) {
    const path = join(process.cwd(), file);
    if (existsSync(path)) {
      try {
        const { readFileSync } = require('fs');
        const content = readFileSync(path, 'utf-8');
        if (content.includes('LINEAR_API_KEY')) {
          return { found: true };
        }
      } catch {
        // Can't read file
      }
    }
  }

  return { found: false };
}

function checkNotion(): { found: boolean; key?: string } {
  const key = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  if (key) {
    return { found: true, key };
  }

  return { found: false };
}

export function detectServers(): DetectionResult[] {
  const results: DetectionResult[] = [];

  // Linear
  const linearCheck = checkLinear();
  results.push({
    server: 'linear',
    detected: linearCheck.found,
    details: linearCheck.found
      ? linearCheck.key ? 'API key found in environment' : 'API key found in .env file'
      : undefined,
    suggestedEnv: linearCheck.key ? { LINEAR_API_KEY: linearCheck.key } : undefined,
  });

  // Postgres
  const pgCheck = checkPostgres();
  results.push({
    server: 'postgres',
    detected: pgCheck.found,
    details: pgCheck.found
      ? pgCheck.url ? `Found: ${pgCheck.url.replace(/:[^:@]+@/, ':***@')}` : 'PostgreSQL detected'
      : undefined,
    suggestedEnv: pgCheck.url ? { POSTGRES_URL: pgCheck.url } : undefined,
  });

  // Notion
  const notionCheck = checkNotion();
  results.push({
    server: 'notion',
    detected: notionCheck.found,
    details: notionCheck.found ? 'API key found in environment' : undefined,
    suggestedEnv: notionCheck.key ? { NOTION_API_KEY: notionCheck.key } : undefined,
  });

  // Obsidian
  const vaultPath = checkEnvVar('OBSIDIAN_VAULT') || findObsidianVault();
  results.push({
    server: 'obsidian',
    detected: !!vaultPath,
    details: vaultPath ? `Found vault: ${vaultPath}` : undefined,
    suggestedEnv: vaultPath ? { OBSIDIAN_VAULT: vaultPath } : undefined,
  });

  return results;
}

export function detectServer(name: string): DetectionResult | null {
  const results = detectServers();
  return results.find(r => r.server === name) || null;
}
