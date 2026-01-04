#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@notionhq/client';

const API_KEY = process.env.NOTION_API_KEY;

if (!API_KEY) {
  console.error('NOTION_API_KEY environment variable is required');
  process.exit(1);
}

const notion = new Client({ auth: API_KEY });

const server = new Server(
  {
    name: 'notion-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to extract text from rich text
function extractText(richText: any[]): string {
  return richText?.map((t) => t.plain_text).join('') || '';
}

// Helper to extract page content
async function getPageContent(pageId: string): Promise<string> {
  const blocks = await notion.blocks.children.list({ block_id: pageId });
  const content: string[] = [];

  for (const block of blocks.results as any[]) {
    switch (block.type) {
      case 'paragraph':
        content.push(extractText(block.paragraph.rich_text));
        break;
      case 'heading_1':
        content.push(`# ${extractText(block.heading_1.rich_text)}`);
        break;
      case 'heading_2':
        content.push(`## ${extractText(block.heading_2.rich_text)}`);
        break;
      case 'heading_3':
        content.push(`### ${extractText(block.heading_3.rich_text)}`);
        break;
      case 'bulleted_list_item':
        content.push(`• ${extractText(block.bulleted_list_item.rich_text)}`);
        break;
      case 'numbered_list_item':
        content.push(`1. ${extractText(block.numbered_list_item.rich_text)}`);
        break;
      case 'code':
        content.push(`\`\`\`${block.code.language}\n${extractText(block.code.rich_text)}\n\`\`\``);
        break;
      case 'quote':
        content.push(`> ${extractText(block.quote.rich_text)}`);
        break;
      case 'divider':
        content.push('---');
        break;
    }
  }

  return content.join('\n\n');
}

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'notion_search',
      description: 'Search for pages and databases in Notion',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          filter: {
            type: 'string',
            enum: ['page', 'database'],
            description: 'Filter by type (optional)',
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default: 10)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'notion_get_page',
      description: 'Get the content of a Notion page',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            description: 'Page ID (from URL or search results)',
          },
        },
        required: ['pageId'],
      },
    },
    {
      name: 'notion_query_database',
      description: 'Query entries from a Notion database',
      inputSchema: {
        type: 'object',
        properties: {
          databaseId: {
            type: 'string',
            description: 'Database ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default: 20)',
          },
        },
        required: ['databaseId'],
      },
    },
    {
      name: 'notion_create_page',
      description: 'Create a new page in Notion',
      inputSchema: {
        type: 'object',
        properties: {
          parentPageId: {
            type: 'string',
            description: 'Parent page ID',
          },
          title: {
            type: 'string',
            description: 'Page title',
          },
          content: {
            type: 'string',
            description: 'Page content (plain text, will be added as a paragraph)',
          },
        },
        required: ['parentPageId', 'title'],
      },
    },
    {
      name: 'notion_list_databases',
      description: 'List all databases the integration has access to',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'notion_search': {
        const { query, filter, limit = 10 } = args as any;

        const searchParams: any = {
          query,
          page_size: limit,
        };

        if (filter) {
          searchParams.filter = { property: 'object', value: filter };
        }

        const results = await notion.search(searchParams);

        const items = results.results.map((item: any) => {
          const title =
            item.object === 'page'
              ? extractText(item.properties?.title?.title || item.properties?.Name?.title || [])
              : item.title?.[0]?.plain_text || 'Untitled';

          return {
            id: item.id,
            type: item.object,
            title: title || 'Untitled',
            url: item.url,
            lastEdited: item.last_edited_time,
          };
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
        };
      }

      case 'notion_get_page': {
        const { pageId } = args as any;

        const page = await notion.pages.retrieve({ page_id: pageId });
        const content = await getPageContent(pageId);

        const pageData = page as any;
        const title = extractText(
          pageData.properties?.title?.title ||
            pageData.properties?.Name?.title ||
            []
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: pageData.id,
                  title: title || 'Untitled',
                  url: pageData.url,
                  createdTime: pageData.created_time,
                  lastEditedTime: pageData.last_edited_time,
                  content,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'notion_query_database': {
        const { databaseId, limit = 20 } = args as any;

        const results = await notion.databases.query({
          database_id: databaseId,
          page_size: limit,
        });

        const entries = results.results.map((page: any) => {
          const props: any = {};

          for (const [key, value] of Object.entries(page.properties) as any) {
            switch (value.type) {
              case 'title':
                props[key] = extractText(value.title);
                break;
              case 'rich_text':
                props[key] = extractText(value.rich_text);
                break;
              case 'number':
                props[key] = value.number;
                break;
              case 'select':
                props[key] = value.select?.name;
                break;
              case 'multi_select':
                props[key] = value.multi_select?.map((s: any) => s.name);
                break;
              case 'date':
                props[key] = value.date?.start;
                break;
              case 'checkbox':
                props[key] = value.checkbox;
                break;
              case 'url':
                props[key] = value.url;
                break;
              case 'email':
                props[key] = value.email;
                break;
              case 'status':
                props[key] = value.status?.name;
                break;
            }
          }

          return {
            id: page.id,
            url: page.url,
            properties: props,
          };
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
        };
      }

      case 'notion_create_page': {
        const { parentPageId, title, content } = args as any;

        const children: any[] = [];

        if (content) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content } }],
            },
          });
        }

        const page = await notion.pages.create({
          parent: { page_id: parentPageId },
          properties: {
            title: {
              title: [{ type: 'text', text: { content: title } }],
            },
          },
          children,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: page.id,
                  url: (page as any).url,
                  message: 'Page created successfully',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'notion_list_databases': {
        const results = await notion.search({
          filter: { property: 'object', value: 'database' },
          page_size: 50,
        });

        const databases = results.results.map((db: any) => ({
          id: db.id,
          title: db.title?.[0]?.plain_text || 'Untitled',
          url: db.url,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(databases, null, 2) }],
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
      content: [{ type: 'text', text: `Notion error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Notion MCP server started');
}

main().catch(console.error);
