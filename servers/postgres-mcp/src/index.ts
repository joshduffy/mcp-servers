#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pg from 'pg';

const { Pool } = pg;

// Connection config from environment
const connectionConfig = process.env.POSTGRES_URL
  ? { connectionString: process.env.POSTGRES_URL }
  : {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB || 'postgres',
    };

const pool = new Pool(connectionConfig);

const server = new Server(
  {
    name: 'postgres-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pg_list_tables',
      description: 'List all tables in the database',
      inputSchema: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
          },
        },
      },
    },
    {
      name: 'pg_describe_table',
      description: 'Get the structure of a table (columns, types, constraints)',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'pg_query',
      description: 'Execute a read-only SQL query. Only SELECT statements are allowed.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL SELECT query',
          },
          limit: {
            type: 'number',
            description: 'Maximum rows to return (default: 100)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'pg_explain',
      description: 'Get the execution plan for a query',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL query to explain',
          },
          analyze: {
            type: 'boolean',
            description: 'Run EXPLAIN ANALYZE (actually executes the query)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'pg_list_schemas',
      description: 'List all schemas in the database',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'pg_table_stats',
      description: 'Get statistics about a table (row count, size, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
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
      case 'pg_list_tables': {
        const schema = (args as any).schema || 'public';

        const result = await pool.query(
          `SELECT table_name, table_type
           FROM information_schema.tables
           WHERE table_schema = $1
           ORDER BY table_name`,
          [schema]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'pg_describe_table': {
        const { table, schema = 'public' } = args as any;

        const columnsResult = await pool.query(
          `SELECT
             column_name,
             data_type,
             is_nullable,
             column_default,
             character_maximum_length
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [schema, table]
        );

        const constraintsResult = await pool.query(
          `SELECT
             tc.constraint_name,
             tc.constraint_type,
             kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_schema = $1 AND tc.table_name = $2`,
          [schema, table]
        );

        const indexesResult = await pool.query(
          `SELECT indexname, indexdef
           FROM pg_indexes
           WHERE schemaname = $1 AND tablename = $2`,
          [schema, table]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  table: `${schema}.${table}`,
                  columns: columnsResult.rows,
                  constraints: constraintsResult.rows,
                  indexes: indexesResult.rows,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'pg_query': {
        const { query, limit = 100 } = args as any;

        // Security: Validate query is read-only
        const trimmedQuery = query.trim().toLowerCase();

        // Block dangerous keywords anywhere in query
        const dangerous = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy'];
        for (const keyword of dangerous) {
          // Check for keyword as whole word (not part of column/table name)
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(query)) {
            return {
              content: [{ type: 'text', text: `Error: Query contains forbidden keyword: ${keyword.toUpperCase()}` }],
              isError: true,
            };
          }
        }

        // Must start with SELECT or WITH (for CTEs)
        if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('with')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Only SELECT queries are allowed for safety. Use pg_describe_table for schema info.',
              },
            ],
            isError: true,
          };
        }

        // Add LIMIT if not present
        let safeQuery = query;
        if (!trimmedQuery.includes('limit')) {
          safeQuery = `${query} LIMIT ${limit}`;
        }

        // Execute in read-only transaction for additional safety
        const client = await pool.connect();
        try {
          await client.query('BEGIN TRANSACTION READ ONLY');
          const result = await client.query(safeQuery);
          await client.query('COMMIT');

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    rowCount: result.rowCount,
                    rows: result.rows,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      case 'pg_explain': {
        const { query, analyze = false } = args as any;

        // Security: Validate query is read-only (same rules as pg_query)
        const trimmedQuery = query.trim().toLowerCase();

        const dangerous = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy'];
        for (const keyword of dangerous) {
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(query)) {
            return {
              content: [{ type: 'text', text: `Error: Query contains forbidden keyword: ${keyword.toUpperCase()}` }],
              isError: true,
            };
          }
        }

        if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('with')) {
          return {
            content: [{ type: 'text', text: 'Error: Only SELECT queries can be explained for safety.' }],
            isError: true,
          };
        }

        // Execute in read-only transaction (EXPLAIN ANALYZE will execute the query)
        const client = await pool.connect();
        try {
          await client.query('BEGIN TRANSACTION READ ONLY');
          const explainQuery = analyze ? `EXPLAIN ANALYZE ${query}` : `EXPLAIN ${query}`;
          const result = await client.query(explainQuery);
          await client.query('COMMIT');

          const plan = result.rows.map((r) => r['QUERY PLAN']).join('\n');
          return { content: [{ type: 'text', text: plan }] };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      case 'pg_list_schemas': {
        const result = await pool.query(
          `SELECT schema_name
           FROM information_schema.schemata
           WHERE schema_name NOT LIKE 'pg_%'
             AND schema_name != 'information_schema'
           ORDER BY schema_name`
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows.map((r) => r.schema_name), null, 2),
            },
          ],
        };
      }

      case 'pg_table_stats': {
        const { table, schema = 'public' } = args as any;

        const result = await pool.query(
          `SELECT
             pg_size_pretty(pg_total_relation_size($1::regclass)) as total_size,
             pg_size_pretty(pg_table_size($1::regclass)) as table_size,
             pg_size_pretty(pg_indexes_size($1::regclass)) as indexes_size,
             (SELECT reltuples::bigint FROM pg_class WHERE oid = $1::regclass) as estimated_rows
          `,
          [`${schema}.${table}`]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows[0], null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Database error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  // Test connection
  try {
    await pool.query('SELECT 1');
    console.error('Postgres MCP server connected to database');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down...');
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Postgres MCP server started');
}

main().catch(console.error);
