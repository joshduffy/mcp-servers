#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import matter from 'gray-matter';

// Configuration
const VAULT_PATH = process.env.OBSIDIAN_VAULT || process.env.HOME + '/Documents/Obsidian';
const MAX_RESULTS = 20;
const MAX_CONTENT_LENGTH = 10000;

interface NoteMetadata {
  path: string;
  title: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  created?: string;
  modified?: string;
  frontmatter: Record<string, unknown>;
}

interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  score: number;
  tags: string[];
}

// Note cache for performance
const noteCache = new Map<string, NoteMetadata>();
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 seconds

function getAllMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip hidden files/folders and common non-note directories
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      getAllMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(fullPath);
    }
  }

  return files;
}

function extractLinks(content: string): string[] {
  const links: string[] = [];
  // Wiki-style links: [[Note Name]] or [[Note Name|Display Text]]
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.push(match[1].trim());
  }

  return [...new Set(links)];
}

function extractTags(content: string, frontmatter: Record<string, unknown>): string[] {
  const tags: string[] = [];

  // Tags from frontmatter
  if (Array.isArray(frontmatter.tags)) {
    tags.push(...frontmatter.tags.map(String));
  } else if (typeof frontmatter.tags === 'string') {
    tags.push(frontmatter.tags);
  }

  // Inline tags: #tag-name
  const tagRegex = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }

  return [...new Set(tags)];
}

function parseNote(filePath: string): NoteMetadata {
  const content = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(content);
  const stats = statSync(filePath);

  const relativePath = relative(VAULT_PATH, filePath);
  const title = frontmatter.title || basename(filePath, '.md');

  return {
    path: relativePath,
    title,
    tags: extractTags(body, frontmatter),
    links: extractLinks(body),
    backlinks: [], // Computed separately
    created: frontmatter.created || stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    frontmatter,
  };
}

function refreshCache(): void {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL && noteCache.size > 0) {
    return;
  }

  noteCache.clear();
  const files = getAllMarkdownFiles(VAULT_PATH);

  // First pass: parse all notes
  for (const file of files) {
    try {
      const metadata = parseNote(file);
      noteCache.set(metadata.path, metadata);
    } catch {
      // Skip unparseable files
    }
  }

  // Second pass: compute backlinks
  for (const [, note] of noteCache) {
    for (const link of note.links) {
      // Find the linked note
      for (const [path, targetNote] of noteCache) {
        if (
          targetNote.title.toLowerCase() === link.toLowerCase() ||
          basename(path, '.md').toLowerCase() === link.toLowerCase()
        ) {
          targetNote.backlinks.push(note.path);
        }
      }
    }
  }

  lastCacheUpdate = now;
}

function searchNotes(query: string): SearchResult[] {
  refreshCache();

  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/);

  for (const [path, note] of noteCache) {
    let score = 0;
    const fullPath = join(VAULT_PATH, path);

    // Title match (highest weight)
    if (note.title.toLowerCase().includes(queryLower)) {
      score += 100;
    }

    // Tag match
    for (const tag of note.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 50;
      }
    }

    // Content match
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const contentLower = content.toLowerCase();

      for (const term of queryTerms) {
        const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        score += matches * 10;
      }

      if (score > 0) {
        // Extract excerpt around first match
        const matchIndex = contentLower.indexOf(queryLower);
        let excerpt = '';

        if (matchIndex >= 0) {
          const start = Math.max(0, matchIndex - 50);
          const end = Math.min(content.length, matchIndex + queryLower.length + 100);
          excerpt = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
        } else {
          excerpt = content.slice(0, 150).trim() + '...';
        }

        results.push({
          path,
          title: note.title,
          excerpt: excerpt.replace(/\n/g, ' '),
          score,
          tags: note.tags,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

function readNote(notePath: string): { content: string; metadata: NoteMetadata } | null {
  refreshCache();

  // Handle both relative and absolute paths
  let fullPath = notePath;
  if (!notePath.startsWith('/')) {
    fullPath = join(VAULT_PATH, notePath);
  }

  // Add .md extension if missing
  if (!fullPath.endsWith('.md')) {
    fullPath += '.md';
  }

  if (!existsSync(fullPath)) {
    // Try to find by title
    for (const [path, note] of noteCache) {
      if (note.title.toLowerCase() === notePath.toLowerCase() || basename(path, '.md').toLowerCase() === notePath.toLowerCase()) {
        fullPath = join(VAULT_PATH, path);
        break;
      }
    }
  }

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const relativePath = relative(VAULT_PATH, fullPath);
    const metadata = noteCache.get(relativePath) || parseNote(fullPath);

    return {
      content: content.slice(0, MAX_CONTENT_LENGTH),
      metadata,
    };
  } catch {
    return null;
  }
}

function listNotesByTag(tag: string): NoteMetadata[] {
  refreshCache();

  const results: NoteMetadata[] = [];
  const tagLower = tag.toLowerCase().replace(/^#/, '');

  for (const [, note] of noteCache) {
    if (note.tags.some((t) => t.toLowerCase() === tagLower)) {
      results.push(note);
    }
  }

  return results.slice(0, MAX_RESULTS);
}

function getRecentNotes(days: number = 7): NoteMetadata[] {
  refreshCache();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const results: NoteMetadata[] = [];

  for (const [, note] of noteCache) {
    if (note.modified && new Date(note.modified) >= cutoff) {
      results.push(note);
    }
  }

  return results
    .sort((a, b) => new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime())
    .slice(0, MAX_RESULTS);
}

function getDailyNotes(dateStr?: string): NoteMetadata[] {
  refreshCache();

  const results: NoteMetadata[] = [];
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  for (const [path, note] of noteCache) {
    // Common daily note patterns
    if (
      path.includes(targetDate) ||
      note.title.includes(targetDate) ||
      path.match(/\d{4}-\d{2}-\d{2}/) ||
      path.toLowerCase().includes('daily')
    ) {
      results.push(note);
    }
  }

  return results.slice(0, MAX_RESULTS);
}

// Create server
const server = new Server(
  {
    name: 'obsidian-mcp',
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
      name: 'search_notes',
      description: 'Search for notes in the Obsidian vault by content, title, or tags',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query - matches against note titles, content, and tags',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_note',
      description: 'Read the full content of a specific note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault) or note title',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_by_tag',
      description: 'List all notes with a specific tag',
      inputSchema: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Tag to filter by (with or without #)',
          },
        },
        required: ['tag'],
      },
    },
    {
      name: 'recent_notes',
      description: 'Get recently modified notes',
      inputSchema: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days to look back (default: 7)',
          },
        },
      },
    },
    {
      name: 'daily_notes',
      description: 'Get daily notes for a specific date or today',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format (default: today)',
          },
        },
      },
    },
    {
      name: 'get_backlinks',
      description: 'Find all notes that link to a specific note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note or note title',
          },
        },
        required: ['path'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'search_notes': {
      const query = (args as { query: string }).query;
      const results = searchNotes(query);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No notes found matching "${query}"` }] };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   Path: ${r.path}\n   Tags: ${r.tags.length > 0 ? r.tags.map((t) => `#${t}`).join(' ') : 'none'}\n   Excerpt: ${r.excerpt}`
        )
        .join('\n\n');

      return { content: [{ type: 'text', text: `Found ${results.length} notes:\n\n${formatted}` }] };
    }

    case 'read_note': {
      const path = (args as { path: string }).path;
      const result = readNote(path);

      if (!result) {
        return { content: [{ type: 'text', text: `Note not found: ${path}` }] };
      }

      const { content, metadata } = result;
      const header = [
        `# ${metadata.title}`,
        `Path: ${metadata.path}`,
        `Tags: ${metadata.tags.length > 0 ? metadata.tags.map((t) => `#${t}`).join(' ') : 'none'}`,
        `Links to: ${metadata.links.length > 0 ? metadata.links.join(', ') : 'none'}`,
        `Backlinks: ${metadata.backlinks.length > 0 ? metadata.backlinks.join(', ') : 'none'}`,
        `Modified: ${metadata.modified}`,
        '---',
      ].join('\n');

      return { content: [{ type: 'text', text: `${header}\n\n${content}` }] };
    }

    case 'list_by_tag': {
      const tag = (args as { tag: string }).tag;
      const results = listNotesByTag(tag);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No notes found with tag #${tag.replace(/^#/, '')}` }] };
      }

      const formatted = results.map((n) => `- **${n.title}** (${n.path})`).join('\n');

      return { content: [{ type: 'text', text: `Notes with #${tag.replace(/^#/, '')}:\n\n${formatted}` }] };
    }

    case 'recent_notes': {
      const days = (args as { days?: number }).days || 7;
      const results = getRecentNotes(days);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No notes modified in the last ${days} days` }] };
      }

      const formatted = results.map((n) => `- **${n.title}** - ${n.modified?.split('T')[0]} (${n.path})`).join('\n');

      return { content: [{ type: 'text', text: `Recent notes (last ${days} days):\n\n${formatted}` }] };
    }

    case 'daily_notes': {
      const date = (args as { date?: string }).date;
      const results = getDailyNotes(date);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No daily notes found for ${date || 'today'}` }] };
      }

      const formatted = results.map((n) => `- **${n.title}** (${n.path})`).join('\n');

      return { content: [{ type: 'text', text: `Daily notes:\n\n${formatted}` }] };
    }

    case 'get_backlinks': {
      const path = (args as { path: string }).path;
      const result = readNote(path);

      if (!result) {
        return { content: [{ type: 'text', text: `Note not found: ${path}` }] };
      }

      const { metadata } = result;

      if (metadata.backlinks.length === 0) {
        return { content: [{ type: 'text', text: `No backlinks found for "${metadata.title}"` }] };
      }

      const formatted = metadata.backlinks.map((b) => `- ${b}`).join('\n');

      return { content: [{ type: 'text', text: `Notes linking to "${metadata.title}":\n\n${formatted}` }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

// List resources (vault structure)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  refreshCache();

  const resources = [];
  for (const [path, note] of noteCache) {
    resources.push({
      uri: `obsidian://${path}`,
      name: note.title,
      mimeType: 'text/markdown',
    });
  }

  return { resources: resources.slice(0, 100) };
});

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const path = uri.replace('obsidian://', '');
  const result = readNote(path);

  if (!result) {
    throw new Error(`Note not found: ${path}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: result.content,
      },
    ],
  };
});

// Start server
async function main() {
  if (!existsSync(VAULT_PATH)) {
    console.error(`Obsidian vault not found at: ${VAULT_PATH}`);
    console.error('Set OBSIDIAN_VAULT environment variable to your vault path');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Obsidian MCP server running. Vault: ${VAULT_PATH}`);
}

main().catch(console.error);
