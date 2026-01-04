#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fg from 'fast-glob';
import ignore from 'ignore';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { resolve, relative, join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

// Configuration
const FS_ROOT = process.env.FS_ROOT?.replace(/^~/, homedir()) || process.cwd();
const MAX_FILE_SIZE = parseInt(process.env.FS_MAX_SIZE || '1048576', 10); // 1MB default
const MAX_RESULTS = parseInt(process.env.FS_MAX_RESULTS || '100', 10);

// Default patterns to ignore
const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '__pycache__',
  '*.pyc',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.*',
  '*.log',
];

// Create ignore filter
const ig = ignore().add(DEFAULT_IGNORES);

// Resolve and validate path is within root
function resolvePath(inputPath: string): string {
  const expanded = inputPath.replace(/^~/, homedir());
  const resolved = resolve(FS_ROOT, expanded);

  // Security: ensure path is within root
  const normalizedRoot = resolve(FS_ROOT);
  const normalizedPath = resolve(resolved);

  if (!normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`Access denied: path is outside root directory`);
  }

  return normalizedPath;
}

// Get relative path from root
function getRelativePath(absolutePath: string): string {
  return relative(FS_ROOT, absolutePath) || '.';
}

// Check if path should be ignored
function shouldIgnore(relativePath: string): boolean {
  return ig.ignores(relativePath);
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Detect if file is likely binary
function isBinaryFile(buffer: Buffer): boolean {
  // Check for null bytes in first 8KB
  const sample = buffer.slice(0, 8192);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

// Read file with size limit
async function readFileContent(filePath: string): Promise<{ content: string; truncated: boolean; binary: boolean }> {
  const stats = await stat(filePath);

  if (stats.size > MAX_FILE_SIZE) {
    const buffer = Buffer.alloc(MAX_FILE_SIZE);
    const fd = await import('node:fs').then((fs) =>
      fs.promises.open(filePath, 'r').then(async (handle) => {
        await handle.read(buffer, 0, MAX_FILE_SIZE, 0);
        await handle.close();
        return buffer;
      })
    );

    if (isBinaryFile(fd)) {
      return { content: '[Binary file]', truncated: false, binary: true };
    }

    return { content: fd.toString('utf-8'), truncated: true, binary: false };
  }

  const buffer = await readFile(filePath);

  if (isBinaryFile(buffer)) {
    return { content: '[Binary file]', truncated: false, binary: true };
  }

  return { content: buffer.toString('utf-8'), truncated: false, binary: false };
}

// List directory contents
async function listDir(dirPath: string, recursive: boolean = false): Promise<
  {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
  }[]
> {
  const results: { name: string; path: string; type: 'file' | 'directory'; size?: number }[] = [];

  async function scanDir(currentPath: string, depth: number = 0) {
    if (depth > 10) return; // Limit recursion depth

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relPath = getRelativePath(fullPath);

      if (shouldIgnore(relPath)) continue;

      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
        });

        if (recursive && results.length < MAX_RESULTS) {
          await scanDir(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const stats = await stat(fullPath).catch(() => null);
        results.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stats?.size,
        });
      }

      if (results.length >= MAX_RESULTS) break;
    }
  }

  await scanDir(dirPath);
  return results;
}

// Search for files by pattern
async function searchFiles(pattern: string, searchPath: string = ''): Promise<string[]> {
  const basePath = searchPath ? resolvePath(searchPath) : FS_ROOT;

  const files = await fg(pattern, {
    cwd: basePath,
    ignore: DEFAULT_IGNORES,
    onlyFiles: true,
    absolute: false,
    dot: false,
  });

  return files.slice(0, MAX_RESULTS).map((f) => (searchPath ? join(searchPath, f) : f));
}

// Search file contents
async function searchContent(
  query: string,
  pattern: string = '**/*',
  searchPath: string = ''
): Promise<{ file: string; line: number; content: string }[]> {
  const basePath = searchPath ? resolvePath(searchPath) : FS_ROOT;
  const results: { file: string; line: number; content: string }[] = [];

  const files = await fg(pattern, {
    cwd: basePath,
    ignore: DEFAULT_IGNORES,
    onlyFiles: true,
    absolute: true,
    dot: false,
  });

  const queryLower = query.toLowerCase();

  for (const file of files) {
    if (results.length >= MAX_RESULTS) break;

    try {
      const { content, binary } = await readFileContent(file);
      if (binary) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          results.push({
            file: getRelativePath(file),
            line: i + 1,
            content: lines[i].trim().substring(0, 200),
          });

          if (results.length >= MAX_RESULTS) break;
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

// Build directory tree
async function buildTree(dirPath: string, maxDepth: number = 3): Promise<string> {
  const lines: string[] = [];

  async function traverse(currentPath: string, prefix: string, depth: number) {
    if (depth > maxDepth) {
      lines.push(`${prefix}...`);
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    const filtered = entries.filter((e) => !shouldIgnore(e.name));
    const sorted = filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const isLast = i === sorted.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const icon = entry.isDirectory() ? '📁 ' : '📄 ';

      lines.push(`${prefix}${connector}${icon}${entry.name}`);

      if (entry.isDirectory()) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        await traverse(join(currentPath, entry.name), newPrefix, depth + 1);
      }
    }
  }

  lines.push(`📁 ${basename(dirPath) || FS_ROOT}`);
  await traverse(dirPath, '', 0);

  return lines.join('\n');
}

// Create server
const server = new Server(
  {
    name: 'filesystem-mcp',
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
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file (relative to root)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'read_files',
      description: 'Read multiple files at once',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to files (relative to root)',
          },
        },
        required: ['paths'],
      },
    },
    {
      name: 'list_directory',
      description: 'List contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path (relative to root, default: root)',
          },
          recursive: {
            type: 'boolean',
            description: 'List recursively (default: false)',
          },
        },
      },
    },
    {
      name: 'search_files',
      description: 'Search for files by glob pattern (e.g., "**/*.ts", "src/**/*.json")',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (default: root)',
          },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'search_content',
      description: 'Search for text within files (case-insensitive)',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text to search for',
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern to filter files (default: **/*)',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (default: root)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_info',
      description: 'Get detailed information about a file or directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to file or directory',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'tree',
      description: 'Show directory structure as a tree',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path (default: root)',
          },
          depth: {
            type: 'number',
            description: 'Max depth to display (default: 3)',
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'read_file': {
        const { path } = args as { path: string };
        const filePath = resolvePath(path);

        await access(filePath);
        const { content, truncated, binary } = await readFileContent(filePath);

        if (binary) {
          return { content: [{ type: 'text', text: `${path}: [Binary file - cannot display]` }] };
        }

        let output = `**${path}**\n\n\`\`\`\n${content}\n\`\`\``;
        if (truncated) {
          output += `\n\n*File truncated at ${formatSize(MAX_FILE_SIZE)}*`;
        }

        return { content: [{ type: 'text', text: output }] };
      }

      case 'read_files': {
        const { paths } = args as { paths: string[] };
        const outputs: string[] = [];

        for (const path of paths.slice(0, 10)) {
          try {
            const filePath = resolvePath(path);
            await access(filePath);
            const { content, truncated, binary } = await readFileContent(filePath);

            if (binary) {
              outputs.push(`## ${path}\n[Binary file - cannot display]`);
            } else {
              let output = `## ${path}\n\`\`\`\n${content}\n\`\`\``;
              if (truncated) {
                output += `\n*Truncated*`;
              }
              outputs.push(output);
            }
          } catch (error) {
            outputs.push(`## ${path}\nError: ${error instanceof Error ? error.message : error}`);
          }
        }

        return { content: [{ type: 'text', text: outputs.join('\n\n---\n\n') }] };
      }

      case 'list_directory': {
        const { path = '', recursive = false } = args as { path?: string; recursive?: boolean };
        const dirPath = resolvePath(path || '.');

        const entries = await listDir(dirPath, recursive);

        if (entries.length === 0) {
          return { content: [{ type: 'text', text: `Directory is empty or all files are ignored` }] };
        }

        const formatted = entries
          .map((e) => {
            const icon = e.type === 'directory' ? '📁' : '📄';
            const size = e.size !== undefined ? ` (${formatSize(e.size)})` : '';
            return `${icon} ${e.path}${size}`;
          })
          .join('\n');

        const truncated = entries.length >= MAX_RESULTS ? `\n\n*Results limited to ${MAX_RESULTS} entries*` : '';

        return { content: [{ type: 'text', text: `Contents of ${path || 'root'}:\n\n${formatted}${truncated}` }] };
      }

      case 'search_files': {
        const { pattern, path = '' } = args as { pattern: string; path?: string };

        const files = await searchFiles(pattern, path);

        if (files.length === 0) {
          return { content: [{ type: 'text', text: `No files found matching: ${pattern}` }] };
        }

        const formatted = files.map((f) => `📄 ${f}`).join('\n');
        const truncated = files.length >= MAX_RESULTS ? `\n\n*Results limited to ${MAX_RESULTS} files*` : '';

        return { content: [{ type: 'text', text: `Files matching "${pattern}":\n\n${formatted}${truncated}` }] };
      }

      case 'search_content': {
        const { query, pattern = '**/*', path = '' } = args as {
          query: string;
          pattern?: string;
          path?: string;
        };

        const results = await searchContent(query, pattern, path);

        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No matches found for: ${query}` }] };
        }

        const formatted = results
          .map((r) => `**${r.file}:${r.line}**\n   ${r.content}`)
          .join('\n\n');

        const truncated = results.length >= MAX_RESULTS ? `\n\n*Results limited to ${MAX_RESULTS} matches*` : '';

        return {
          content: [{ type: 'text', text: `Search results for "${query}":\n\n${formatted}${truncated}` }],
        };
      }

      case 'get_info': {
        const { path } = args as { path: string };
        const filePath = resolvePath(path);

        const stats = await stat(filePath);

        const info = [
          `# ${basename(path)}`,
          '',
          `- **Type:** ${stats.isDirectory() ? 'Directory' : 'File'}`,
          `- **Size:** ${formatSize(stats.size)}`,
          `- **Created:** ${stats.birthtime.toLocaleString()}`,
          `- **Modified:** ${stats.mtime.toLocaleString()}`,
          `- **Permissions:** ${stats.mode.toString(8).slice(-3)}`,
          '',
          `**Full path:** ${filePath}`,
        ].join('\n');

        return { content: [{ type: 'text', text: info }] };
      }

      case 'tree': {
        const { path = '', depth = 3 } = args as { path?: string; depth?: number };
        const dirPath = resolvePath(path || '.');

        const tree = await buildTree(dirPath, Math.min(depth, 5));

        return { content: [{ type: 'text', text: tree }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }] };
  }
});

// List resources (root directory)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: `file://${FS_ROOT}`,
        name: basename(FS_ROOT) || 'root',
        mimeType: 'inode/directory',
        description: `Root directory: ${FS_ROOT}`,
      },
    ],
  };
});

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (!uri.startsWith('file://')) {
    throw new Error('Invalid URI scheme');
  }

  const filePath = uri.replace('file://', '');

  // Verify it's within root
  resolvePath(relative(FS_ROOT, filePath));

  const stats = await stat(filePath);

  if (stats.isDirectory()) {
    const entries = await listDir(filePath, false);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(entries, null, 2),
        },
      ],
    };
  }

  const { content, binary } = await readFileContent(filePath);

  return {
    contents: [
      {
        uri,
        mimeType: binary ? 'application/octet-stream' : 'text/plain',
        text: content,
      },
    ],
  };
});

// Start server
async function main() {
  const rootPath = resolve(FS_ROOT);

  try {
    await access(rootPath);
  } catch {
    console.error(`Error: Root directory not accessible: ${rootPath}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Filesystem MCP server running. Root: ${rootPath}`);
}

main().catch(console.error);
