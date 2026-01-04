#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { LinearClient } from '@linear/sdk';

const API_KEY = process.env.LINEAR_API_KEY;
const RATE_LIMIT_RPM = parseInt(process.env.LINEAR_RATE_LIMIT || '30', 10); // requests per minute

if (!API_KEY) {
  console.error('LINEAR_API_KEY environment variable is required');
  process.exit(1);
}

const linear = new LinearClient({ apiKey: API_KEY });

// Rate limiter using sliding window
class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequestsPerMinute: number) {
    this.windowMs = 60 * 1000;
    this.maxRequests = maxRequestsPerMinute;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow);
      throw new Error(
        `Rate limit exceeded (${this.maxRequests}/min). ` +
        `Try again in ${Math.ceil(waitTime / 1000)} seconds. ` +
        `Set LINEAR_RATE_LIMIT env var to adjust.`
      );
    }

    this.timestamps.push(now);
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_RPM);

const server = new Server(
  {
    name: 'linear-mcp',
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
      name: 'linear_list_issues',
      description: 'List issues from Linear. Can filter by assignee, team, or state.',
      inputSchema: {
        type: 'object',
        properties: {
          assignedToMe: {
            type: 'boolean',
            description: 'Only show issues assigned to the authenticated user',
          },
          teamKey: {
            type: 'string',
            description: 'Filter by team key (e.g., "ENG")',
          },
          state: {
            type: 'string',
            description: 'Filter by state name (e.g., "In Progress", "Todo")',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of issues to return (default: 20)',
          },
        },
      },
    },
    {
      name: 'linear_create_issue',
      description: 'Create a new issue in Linear',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Issue title',
          },
          description: {
            type: 'string',
            description: 'Issue description (supports markdown)',
          },
          teamKey: {
            type: 'string',
            description: 'Team key to create the issue in',
          },
          priority: {
            type: 'number',
            description: 'Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)',
          },
        },
        required: ['title', 'teamKey'],
      },
    },
    {
      name: 'linear_search',
      description: 'Search for issues in Linear',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
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
      name: 'linear_get_issue',
      description: 'Get details of a specific issue by ID or identifier',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Issue ID or identifier (e.g., "ENG-123")',
          },
        },
        required: ['issueId'],
      },
    },
    {
      name: 'linear_update_issue',
      description: 'Update an existing issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Issue ID or identifier',
          },
          title: {
            type: 'string',
            description: 'New title',
          },
          description: {
            type: 'string',
            description: 'New description',
          },
          stateId: {
            type: 'string',
            description: 'New state ID',
          },
          priority: {
            type: 'number',
            description: 'New priority',
          },
        },
        required: ['issueId'],
      },
    },
    {
      name: 'linear_list_teams',
      description: 'List all teams in the workspace',
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
    // Check rate limit before processing
    await rateLimiter.checkLimit();

    switch (name) {
      case 'linear_list_issues': {
        const { assignedToMe, teamKey, state, limit = 20 } = args as any;

        let filter: any = {};

        if (assignedToMe) {
          const me = await linear.viewer;
          filter.assignee = { id: { eq: me.id } };
        }

        if (teamKey) {
          const teams = await linear.teams({ filter: { key: { eq: teamKey } } });
          const team = teams.nodes[0];
          if (team) {
            filter.team = { id: { eq: team.id } };
          }
        }

        if (state) {
          filter.state = { name: { eq: state } };
        }

        const issues = await linear.issues({
          filter,
          first: limit,
        });

        const results = await Promise.all(
          issues.nodes.map(async (issue) => {
            const issueState = await issue.state;
            const assignee = await issue.assignee;
            return {
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              state: issueState?.name,
              priority: issue.priority,
              assignee: assignee?.name,
              url: issue.url,
            };
          })
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'linear_create_issue': {
        const { title, description, teamKey, priority } = args as any;

        const teams = await linear.teams({ filter: { key: { eq: teamKey } } });
        const team = teams.nodes[0];

        if (!team) {
          return {
            content: [{ type: 'text', text: `Team "${teamKey}" not found` }],
            isError: true,
          };
        }

        const issue = await linear.createIssue({
          title,
          description,
          teamId: team.id,
          priority,
        });

        const created = await issue.issue;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: created?.id,
                  identifier: created?.identifier,
                  title: created?.title,
                  url: created?.url,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'linear_search': {
        const { query, limit = 10 } = args as any;

        const results = await linear.searchIssues(query, { first: limit });

        const issues = await Promise.all(
          results.nodes.map(async (issue) => ({
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          }))
        );

        return {
          content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }],
        };
      }

      case 'linear_get_issue': {
        const { issueId } = args as any;

        const issue = await linear.issue(issueId);

        if (!issue) {
          return {
            content: [{ type: 'text', text: `Issue "${issueId}" not found` }],
            isError: true,
          };
        }

        const state = await issue.state;
        const assignee = await issue.assignee;
        const team = await issue.team;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: issue.id,
                  identifier: issue.identifier,
                  title: issue.title,
                  description: issue.description,
                  state: state?.name,
                  priority: issue.priority,
                  assignee: assignee?.name,
                  team: team?.name,
                  url: issue.url,
                  createdAt: issue.createdAt,
                  updatedAt: issue.updatedAt,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'linear_update_issue': {
        const { issueId, ...updates } = args as any;

        await linear.updateIssue(issueId, updates);

        return {
          content: [{ type: 'text', text: `Issue ${issueId} updated successfully` }],
        };
      }

      case 'linear_list_teams': {
        const teams = await linear.teams();

        const results = teams.nodes.map((team) => ({
          id: team.id,
          key: team.key,
          name: team.name,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
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
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Linear MCP server started');
}

main().catch(console.error);
