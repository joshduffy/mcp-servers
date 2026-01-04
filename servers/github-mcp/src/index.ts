#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable not set');
    }
    octokit = new Octokit({ auth: GITHUB_TOKEN });
  }
  return octokit;
}

// Helper to parse owner/repo from various formats
function parseRepo(repo: string): { owner: string; repo: string } {
  // Handle full URLs
  if (repo.includes('github.com')) {
    const match = repo.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
  }
  // Handle owner/repo format
  const parts = repo.split('/');
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  throw new Error(`Invalid repository format: ${repo}. Use owner/repo or full URL.`);
}

// Create server
const server = new Server(
  {
    name: 'github-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_repos',
      description: 'List repositories for the authenticated user or a specific user/org',
      inputSchema: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
            description: 'Username or org to list repos for (omit for authenticated user)',
          },
          type: {
            type: 'string',
            enum: ['all', 'owner', 'public', 'private', 'member'],
            description: 'Type of repos to list (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Max number of repos to return (default: 30)',
          },
        },
      },
    },
    {
      name: 'get_repo',
      description: 'Get detailed information about a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format or full GitHub URL',
          },
        },
        required: ['repo'],
      },
    },
    {
      name: 'search_code',
      description: 'Search for code across GitHub repositories',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (can include qualifiers like repo:, language:, path:)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 20)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_repos',
      description: 'Search for repositories on GitHub',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (can include qualifiers like language:, stars:, topic:)',
          },
          sort: {
            type: 'string',
            enum: ['stars', 'forks', 'updated', 'help-wanted-issues'],
            description: 'Sort field',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 20)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_issues',
      description: 'List issues in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'all'],
            description: 'Issue state filter (default: open)',
          },
          labels: {
            type: 'string',
            description: 'Comma-separated list of labels to filter by',
          },
          limit: {
            type: 'number',
            description: 'Max issues to return (default: 30)',
          },
        },
        required: ['repo'],
      },
    },
    {
      name: 'get_issue',
      description: 'Get detailed information about a specific issue',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          issue_number: {
            type: 'number',
            description: 'Issue number',
          },
        },
        required: ['repo', 'issue_number'],
      },
    },
    {
      name: 'create_issue',
      description: 'Create a new issue in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          title: {
            type: 'string',
            description: 'Issue title',
          },
          body: {
            type: 'string',
            description: 'Issue body/description',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Labels to add to the issue',
          },
        },
        required: ['repo', 'title'],
      },
    },
    {
      name: 'list_prs',
      description: 'List pull requests in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'all'],
            description: 'PR state filter (default: open)',
          },
          limit: {
            type: 'number',
            description: 'Max PRs to return (default: 30)',
          },
        },
        required: ['repo'],
      },
    },
    {
      name: 'get_pr',
      description: 'Get detailed information about a pull request including diff stats',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          pr_number: {
            type: 'number',
            description: 'Pull request number',
          },
        },
        required: ['repo', 'pr_number'],
      },
    },
    {
      name: 'get_file',
      description: 'Get contents of a file from a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          path: {
            type: 'string',
            description: 'Path to file in repository',
          },
          ref: {
            type: 'string',
            description: 'Branch, tag, or commit SHA (default: default branch)',
          },
        },
        required: ['repo', 'path'],
      },
    },
    {
      name: 'list_commits',
      description: 'List recent commits in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
          branch: {
            type: 'string',
            description: 'Branch name (default: default branch)',
          },
          path: {
            type: 'string',
            description: 'Only show commits affecting this path',
          },
          limit: {
            type: 'number',
            description: 'Max commits to return (default: 30)',
          },
        },
        required: ['repo'],
      },
    },
    {
      name: 'list_branches',
      description: 'List branches in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'Repository in owner/repo format',
          },
        },
        required: ['repo'],
      },
    },
    {
      name: 'get_user',
      description: 'Get information about a GitHub user',
      inputSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'GitHub username (omit for authenticated user)',
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = getOctokit();

  try {
    switch (name) {
      case 'list_repos': {
        const { user, type = 'all', limit = 30 } = args as {
          user?: string;
          type?: 'all' | 'owner' | 'public' | 'private' | 'member';
          limit?: number;
        };

        let repos;
        if (user) {
          // listForUser only supports: all, owner, member
          const userType = type === 'public' || type === 'private' ? 'owner' : type;
          repos = await client.repos.listForUser({
            username: user,
            type: userType as 'all' | 'owner' | 'member',
            per_page: Math.min(limit, 100),
            sort: 'updated',
          });
        } else {
          repos = await client.repos.listForAuthenticatedUser({
            type,
            per_page: Math.min(limit, 100),
            sort: 'updated',
          });
        }

        const formatted = repos.data
          .map((r) => {
            const visibility = r.private ? '🔒' : '🌐';
            const stars = r.stargazers_count ? `⭐${r.stargazers_count}` : '';
            const lang = r.language ? `[${r.language}]` : '';
            return `${visibility} **${r.full_name}** ${lang} ${stars}\n   ${r.description || 'No description'}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Found ${repos.data.length} repositories:\n\n${formatted}` }] };
      }

      case 'get_repo': {
        const { repo } = args as { repo: string };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.repos.get({ owner, repo: repoName });

        const info = [
          `# ${data.full_name}`,
          data.description || '',
          '',
          `- **Visibility:** ${data.private ? 'Private' : 'Public'}`,
          `- **Language:** ${data.language || 'Not specified'}`,
          `- **Stars:** ${data.stargazers_count}`,
          `- **Forks:** ${data.forks_count}`,
          `- **Open Issues:** ${data.open_issues_count}`,
          `- **Default Branch:** ${data.default_branch}`,
          `- **Created:** ${new Date(data.created_at).toLocaleDateString()}`,
          `- **Updated:** ${new Date(data.updated_at).toLocaleDateString()}`,
          '',
          `**URL:** ${data.html_url}`,
          data.homepage ? `**Homepage:** ${data.homepage}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      case 'search_code': {
        const { query, limit = 20 } = args as { query: string; limit?: number };

        const { data } = await client.search.code({
          q: query,
          per_page: Math.min(limit, 100),
        });

        if (data.total_count === 0) {
          return { content: [{ type: 'text', text: `No code found matching: ${query}` }] };
        }

        const formatted = data.items
          .map((item) => `**${item.repository.full_name}** - \`${item.path}\`\n   ${item.html_url}`)
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${data.total_count} results (showing ${data.items.length}):\n\n${formatted}`,
            },
          ],
        };
      }

      case 'search_repos': {
        const { query, sort, limit = 20 } = args as {
          query: string;
          sort?: 'stars' | 'forks' | 'updated' | 'help-wanted-issues';
          limit?: number;
        };

        const { data } = await client.search.repos({
          q: query,
          sort,
          per_page: Math.min(limit, 100),
        });

        if (data.total_count === 0) {
          return { content: [{ type: 'text', text: `No repositories found matching: ${query}` }] };
        }

        const formatted = data.items
          .map((r) => {
            const stars = `⭐${r.stargazers_count}`;
            const lang = r.language ? `[${r.language}]` : '';
            return `**${r.full_name}** ${lang} ${stars}\n   ${r.description || 'No description'}`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${data.total_count} repositories (showing ${data.items.length}):\n\n${formatted}`,
            },
          ],
        };
      }

      case 'list_issues': {
        const { repo, state = 'open', labels, limit = 30 } = args as {
          repo: string;
          state?: 'open' | 'closed' | 'all';
          labels?: string;
          limit?: number;
        };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.issues.listForRepo({
          owner,
          repo: repoName,
          state,
          labels,
          per_page: Math.min(limit, 100),
        });

        // Filter out PRs (they come in the issues endpoint)
        const issues = data.filter((i) => !i.pull_request);

        if (issues.length === 0) {
          return { content: [{ type: 'text', text: `No ${state} issues found in ${repo}` }] };
        }

        const formatted = issues
          .map((i) => {
            const labels = i.labels
              .map((l) => (typeof l === 'string' ? l : l.name))
              .filter(Boolean)
              .join(', ');
            const labelStr = labels ? ` [${labels}]` : '';
            return `#${i.number} **${i.title}**${labelStr}\n   ${i.html_url}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Found ${issues.length} ${state} issues:\n\n${formatted}` }] };
      }

      case 'get_issue': {
        const { repo, issue_number } = args as { repo: string; issue_number: number };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.issues.get({
          owner,
          repo: repoName,
          issue_number,
        });

        const labels = data.labels
          .map((l) => (typeof l === 'string' ? l : l.name))
          .filter(Boolean)
          .join(', ');

        const info = [
          `# #${data.number}: ${data.title}`,
          '',
          `- **State:** ${data.state}`,
          `- **Author:** @${data.user?.login}`,
          `- **Created:** ${new Date(data.created_at).toLocaleDateString()}`,
          labels ? `- **Labels:** ${labels}` : '',
          data.assignees?.length
            ? `- **Assignees:** ${data.assignees.map((a) => `@${a.login}`).join(', ')}`
            : '',
          '',
          '## Description',
          data.body || '*No description provided*',
          '',
          `**URL:** ${data.html_url}`,
        ]
          .filter(Boolean)
          .join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      case 'create_issue': {
        const { repo, title, body, labels } = args as {
          repo: string;
          title: string;
          body?: string;
          labels?: string[];
        };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.issues.create({
          owner,
          repo: repoName,
          title,
          body,
          labels,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Issue created: #${data.number} - ${data.title}\n${data.html_url}`,
            },
          ],
        };
      }

      case 'list_prs': {
        const { repo, state = 'open', limit = 30 } = args as {
          repo: string;
          state?: 'open' | 'closed' | 'all';
          limit?: number;
        };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.pulls.list({
          owner,
          repo: repoName,
          state,
          per_page: Math.min(limit, 100),
        });

        if (data.length === 0) {
          return { content: [{ type: 'text', text: `No ${state} pull requests found in ${repo}` }] };
        }

        const formatted = data
          .map((pr) => {
            const draft = pr.draft ? '📝 DRAFT ' : '';
            const merged = pr.merged_at ? '✅ MERGED ' : '';
            return `#${pr.number} ${draft}${merged}**${pr.title}**\n   ${pr.user?.login} → ${pr.base.ref}\n   ${pr.html_url}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Found ${data.length} ${state} PRs:\n\n${formatted}` }] };
      }

      case 'get_pr': {
        const { repo, pr_number } = args as { repo: string; pr_number: number };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.pulls.get({
          owner,
          repo: repoName,
          pull_number: pr_number,
        });

        const info = [
          `# PR #${data.number}: ${data.title}`,
          data.draft ? '**DRAFT**' : '',
          '',
          `- **State:** ${data.merged ? 'Merged' : data.state}`,
          `- **Author:** @${data.user?.login}`,
          `- **Branch:** ${data.head.ref} → ${data.base.ref}`,
          `- **Created:** ${new Date(data.created_at).toLocaleDateString()}`,
          data.merged_at ? `- **Merged:** ${new Date(data.merged_at).toLocaleDateString()}` : '',
          '',
          '## Changes',
          `- **Commits:** ${data.commits}`,
          `- **Files Changed:** ${data.changed_files}`,
          `- **Additions:** +${data.additions}`,
          `- **Deletions:** -${data.deletions}`,
          '',
          '## Description',
          data.body || '*No description provided*',
          '',
          `**URL:** ${data.html_url}`,
        ]
          .filter(Boolean)
          .join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      case 'get_file': {
        const { repo, path, ref } = args as { repo: string; path: string; ref?: string };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.repos.getContent({
          owner,
          repo: repoName,
          path,
          ref,
        });

        if (Array.isArray(data)) {
          // It's a directory
          const files = data
            .map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`)
            .join('\n');
          return { content: [{ type: 'text', text: `Contents of ${path}:\n\n${files}` }] };
        }

        if (data.type !== 'file' || !('content' in data)) {
          return { content: [{ type: 'text', text: `${path} is not a file` }] };
        }

        const content = Buffer.from(data.content, 'base64').toString('utf-8');

        return {
          content: [
            {
              type: 'text',
              text: `**${path}** (${data.size} bytes)\n\n\`\`\`\n${content}\n\`\`\``,
            },
          ],
        };
      }

      case 'list_commits': {
        const { repo, branch, path, limit = 30 } = args as {
          repo: string;
          branch?: string;
          path?: string;
          limit?: number;
        };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.repos.listCommits({
          owner,
          repo: repoName,
          sha: branch,
          path,
          per_page: Math.min(limit, 100),
        });

        const formatted = data
          .map((c) => {
            const sha = c.sha.substring(0, 7);
            const date = new Date(c.commit.author?.date || '').toLocaleDateString();
            const msg = c.commit.message.split('\n')[0];
            return `\`${sha}\` ${msg}\n   ${c.commit.author?.name} - ${date}`;
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: `Recent commits:\n\n${formatted}` }] };
      }

      case 'list_branches': {
        const { repo } = args as { repo: string };
        const { owner, repo: repoName } = parseRepo(repo);

        const { data } = await client.repos.listBranches({
          owner,
          repo: repoName,
          per_page: 100,
        });

        const formatted = data.map((b) => `- ${b.name}${b.protected ? ' 🔒' : ''}`).join('\n');

        return { content: [{ type: 'text', text: `Branches in ${repo}:\n\n${formatted}` }] };
      }

      case 'get_user': {
        const { username } = args as { username?: string };

        let data;
        if (username) {
          data = (await client.users.getByUsername({ username })).data;
        } else {
          data = (await client.users.getAuthenticated()).data;
        }

        const info = [
          `# ${data.name || data.login}`,
          data.bio || '',
          '',
          `- **Username:** @${data.login}`,
          data.company ? `- **Company:** ${data.company}` : '',
          data.location ? `- **Location:** ${data.location}` : '',
          `- **Public Repos:** ${data.public_repos}`,
          `- **Followers:** ${data.followers}`,
          `- **Following:** ${data.following}`,
          data.blog ? `- **Website:** ${data.blog}` : '',
          '',
          `**Profile:** ${data.html_url}`,
        ]
          .filter(Boolean)
          .join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }] };
  }
});

// Start server
async function main() {
  if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable not set');
    console.error('Usage: GITHUB_TOKEN=ghp_xxx github-mcp');
    console.error('Get a token at: https://github.com/settings/tokens');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GitHub MCP server running');
}

main().catch(console.error);
