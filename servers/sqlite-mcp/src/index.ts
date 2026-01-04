#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Configuration
const DB_PATH = process.env.SQLITE_PATH || process.env.SQLITE_DATABASE;
const READ_ONLY = process.env.SQLITE_READONLY !== 'false'; // Default to read-only for safety
const MAX_ROWS = parseInt(process.env.SQLITE_MAX_ROWS || '100', 10);

let db: Database.Database | null = null;

interface TableInfo {
  name: string;
  type: string;
  columns: ColumnInfo[];
  rowCount: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

function getDatabase(): Database.Database {
  if (!db) {
    if (!DB_PATH) {
      throw new Error('SQLITE_PATH environment variable not set');
    }

    const dbPath = resolve(DB_PATH.replace(/^~/, process.env.HOME || ''));

    if (!existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`);
    }

    db = new Database(dbPath, { readonly: READ_ONLY });
    console.error(`Connected to SQLite database: ${dbPath} (read-only: ${READ_ONLY})`);
  }
  return db;
}

// Security: Validate identifier names to prevent SQL injection
// SQLite identifiers can contain letters, digits, underscores, and $ (but we restrict to safer subset)
function validateIdentifier(name: string, type: 'table' | 'column' | 'schema' = 'table'): string {
  // Allow alphanumeric, underscore, and common characters in identifiers
  // SQLite allows almost any character in double-quoted identifiers, but we restrict for safety
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    // Check if it's a valid identifier that just needs quoting (spaces, etc.)
    // Only allow alphanumeric, spaces, underscores, and hyphens
    if (!/^[a-zA-Z0-9_ -]+$/.test(name)) {
      throw new Error(`Invalid ${type} name: contains disallowed characters`);
    }
  }
  // Return the name - it will be used with double-quote escaping
  return name;
}

// Security: Safely quote an identifier for SQL
function quoteIdentifier(name: string): string {
  // Escape any double quotes by doubling them (SQL standard)
  return `"${name.replace(/"/g, '""')}"`;
}

function listTables(): TableInfo[] {
  const database = getDatabase();

  const tables = database
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view')
       AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )
    .all() as { name: string; type: string }[];

  return tables.map((table) => {
    // Validate table name from sqlite_master (should be safe, but defense in depth)
    const safeName = quoteIdentifier(table.name);

    // Get column info
    const columns = database.prepare(`PRAGMA table_info(${safeName})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }[];

    // Get row count
    const countResult = database.prepare(`SELECT COUNT(*) as count FROM ${safeName}`).get() as {
      count: number;
    };

    return {
      name: table.name,
      type: table.type,
      columns: columns.map((col) => ({
        name: col.name,
        type: col.type || 'ANY',
        nullable: col.notnull === 0,
        primaryKey: col.pk === 1,
        defaultValue: col.dflt_value,
      })),
      rowCount: countResult.count,
    };
  });
}

function describeTable(tableName: string): TableInfo | null {
  // Validate user-provided table name
  validateIdentifier(tableName, 'table');

  const tables = listTables();
  return tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase()) || null;
}

function executeQuery(sql: string): QueryResult {
  const database = getDatabase();

  // Security: Only allow read-only queries
  if (READ_ONLY) {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    // Must start with SELECT, WITH (for CTEs), or EXPLAIN
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('EXPLAIN')) {
      throw new Error('Only SELECT, WITH, and EXPLAIN queries are allowed in read-only mode');
    }

    // Block dangerous keywords using word boundary matching
    // This prevents false positives like column names containing these words
    const dangerous = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
      'ATTACH', 'DETACH', 'REPLACE', 'TRUNCATE',
      'PRAGMA', 'VACUUM', 'REINDEX', 'ANALYZE'
    ];

    for (const keyword of dangerous) {
      // Match keyword as whole word (not part of identifier)
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(sql)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}`);
      }
    }

    // Block semicolons to prevent multi-statement attacks
    // (SQLite's better-sqlite3 already blocks this, but belt-and-suspenders)
    // Regex matches semicolon followed by any non-whitespace
    if (/;[\s]*\S/.test(sql)) {
      throw new Error('Multiple statements are not allowed');
    }
  }

  try {
    const stmt = database.prepare(sql);
    const rows = stmt.all() as Record<string, unknown>[];

    const truncated = rows.length > MAX_ROWS;
    const limitedRows = rows.slice(0, MAX_ROWS);

    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

    return {
      columns,
      rows: limitedRows,
      rowCount: rows.length,
      truncated,
    };
  } catch (error) {
    throw new Error(`Query failed: ${error instanceof Error ? error.message : error}`);
  }
}

function searchTables(searchTerm: string, tableName?: string): { table: string; matches: Record<string, unknown>[] }[] {
  const database = getDatabase();
  const results: { table: string; matches: Record<string, unknown>[] }[] = [];

  // Validate user-provided table name if specified
  if (tableName) {
    validateIdentifier(tableName, 'table');
  }

  const tables = tableName ? [{ name: tableName }] : listTables();

  for (const table of tables) {
    try {
      const safeTableName = quoteIdentifier(table.name);

      // Get text columns
      const columns = database.prepare(`PRAGMA table_info(${safeTableName})`).all() as {
        name: string;
        type: string;
      }[];

      const textColumns = columns.filter((col) => {
        const type = col.type.toUpperCase();
        return type.includes('TEXT') || type.includes('VARCHAR') || type.includes('CHAR') || type === '';
      });

      if (textColumns.length === 0) continue;

      // Build search query with safely quoted column names
      const conditions = textColumns.map((col) => `${quoteIdentifier(col.name)} LIKE '%' || ? || '%'`).join(' OR ');

      const query = `SELECT * FROM ${safeTableName} WHERE ${conditions} LIMIT 10`;
      const params = textColumns.map(() => searchTerm);

      const matches = database.prepare(query).all(...params) as Record<string, unknown>[];

      if (matches.length > 0) {
        results.push({ table: table.name, matches });
      }
    } catch {
      // Skip tables that can't be searched
    }
  }

  return results;
}

function getTableSample(tableName: string, limit: number = 5): Record<string, unknown>[] {
  const database = getDatabase();

  // Validate user-provided table name
  validateIdentifier(tableName, 'table');
  const safeTableName = quoteIdentifier(tableName);

  try {
    return database.prepare(`SELECT * FROM ${safeTableName} LIMIT ?`).all(limit) as Record<string, unknown>[];
  } catch (error) {
    throw new Error(`Failed to sample table: ${error instanceof Error ? error.message : error}`);
  }
}

// Create server
const server = new Server(
  {
    name: 'sqlite-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_tables',
      description: 'List all tables and views in the SQLite database with their schemas',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'describe_table',
      description: 'Get detailed schema information for a specific table',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Name of the table to describe',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'query',
      description: 'Execute a SQL query against the database (read-only by default)',
      inputSchema: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'SQL query to execute (SELECT only in read-only mode)',
          },
        },
        required: ['sql'],
      },
    },
    {
      name: 'search',
      description: 'Search for a term across all text columns in the database',
      inputSchema: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'Search term to find',
          },
          table: {
            type: 'string',
            description: 'Optional: limit search to a specific table',
          },
        },
        required: ['term'],
      },
    },
    {
      name: 'sample',
      description: 'Get sample rows from a table to understand its data',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Name of the table to sample',
          },
          limit: {
            type: 'number',
            description: 'Number of rows to return (default: 5, max: 20)',
          },
        },
        required: ['table'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_tables': {
        const tables = listTables();

        if (tables.length === 0) {
          return { content: [{ type: 'text', text: 'No tables found in database' }] };
        }

        const formatted = tables
          .map((t) => {
            const cols = t.columns.map((c) => {
              const pk = c.primaryKey ? ' [PK]' : '';
              const nullable = c.nullable ? '' : ' NOT NULL';
              return `    ${c.name}: ${c.type}${pk}${nullable}`;
            });
            return `**${t.name}** (${t.type}, ${t.rowCount.toLocaleString()} rows)\n${cols.join('\n')}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Found ${tables.length} tables:\n\n${formatted}` }] };
      }

      case 'describe_table': {
        const tableName = (args as { table: string }).table;
        const table = describeTable(tableName);

        if (!table) {
          return { content: [{ type: 'text', text: `Table not found: ${tableName}` }] };
        }

        const cols = table.columns
          .map((c) => {
            const flags = [];
            if (c.primaryKey) flags.push('PRIMARY KEY');
            if (!c.nullable) flags.push('NOT NULL');
            if (c.defaultValue) flags.push(`DEFAULT ${c.defaultValue}`);
            const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
            return `  - ${c.name}: ${c.type}${flagStr}`;
          })
          .join('\n');

        const info = [
          `# ${table.name}`,
          `Type: ${table.type}`,
          `Rows: ${table.rowCount.toLocaleString()}`,
          '',
          '## Columns',
          cols,
        ].join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      case 'query': {
        const sql = (args as { sql: string }).sql;
        const result = executeQuery(sql);

        if (result.rows.length === 0) {
          return { content: [{ type: 'text', text: 'Query returned no results' }] };
        }

        // Format as markdown table
        const header = `| ${result.columns.join(' | ')} |`;
        const separator = `| ${result.columns.map(() => '---').join(' | ')} |`;
        const rows = result.rows
          .map((row) => `| ${result.columns.map((col) => String(row[col] ?? 'NULL')).join(' | ')} |`)
          .join('\n');

        let output = `${header}\n${separator}\n${rows}`;

        if (result.truncated) {
          output += `\n\n*Results truncated. Showing ${MAX_ROWS} of ${result.rowCount} rows.*`;
        }

        return { content: [{ type: 'text', text: output }] };
      }

      case 'search': {
        const { term, table } = args as { term: string; table?: string };
        const results = searchTables(term, table);

        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No matches found for "${term}"` }] };
        }

        const formatted = results
          .map((r) => {
            const rows = r.matches
              .slice(0, 3)
              .map((row) => `  ${JSON.stringify(row)}`)
              .join('\n');
            const more = r.matches.length > 3 ? `  ... and ${r.matches.length - 3} more` : '';
            return `**${r.table}** (${r.matches.length} matches):\n${rows}${more}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Search results for "${term}":\n\n${formatted}` }] };
      }

      case 'sample': {
        const { table, limit = 5 } = args as { table: string; limit?: number };
        const actualLimit = Math.min(limit, 20);
        const rows = getTableSample(table, actualLimit);

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `Table "${table}" is empty` }] };
        }

        const columns = Object.keys(rows[0]);
        const header = `| ${columns.join(' | ')} |`;
        const separator = `| ${columns.map(() => '---').join(' | ')} |`;
        const rowsFormatted = rows
          .map((row) => `| ${columns.map((col) => String(row[col] ?? 'NULL')).join(' | ')} |`)
          .join('\n');

        return { content: [{ type: 'text', text: `Sample from ${table}:\n\n${header}\n${separator}\n${rowsFormatted}` }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : error}` }] };
  }
});

// List resources (tables as resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const tables = listTables();

    return {
      resources: tables.map((t) => ({
        uri: `sqlite://${t.name}`,
        name: t.name,
        mimeType: 'application/json',
        description: `${t.type} with ${t.rowCount} rows`,
      })),
    };
  } catch {
    return { resources: [] };
  }
});

// Read resource (table schema)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const tableName = uri.replace('sqlite://', '');

  const table = describeTable(tableName);

  if (!table) {
    throw new Error(`Table not found: ${tableName}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(table, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  if (!DB_PATH) {
    console.error('Error: SQLITE_PATH environment variable not set');
    console.error('Usage: SQLITE_PATH=/path/to/database.db sqlite-mcp');
    process.exit(1);
  }

  // Verify database exists
  const dbPath = resolve(DB_PATH.replace(/^~/, process.env.HOME || ''));
  if (!existsSync(dbPath)) {
    console.error(`Error: Database file not found: ${dbPath}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`SQLite MCP server running. Database: ${dbPath}`);
}

main().catch(console.error);
