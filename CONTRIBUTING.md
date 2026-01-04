# Contributing to MCP Servers

Thanks for your interest in contributing! This project welcomes contributions of all kinds.

## Ways to Contribute

### Add a New Server

We're looking for servers that:
- Solve a real problem for developers
- Respect user privacy (prefer local-first)
- Have clear documentation

**Servers we'd love to see:**
- SQLite (local database queries)
- Todoist (task management)
- Cal.com (calendar integration)
- Raycast (Mac productivity)
- Apple Notes (local notes)

### Improve Existing Servers

- Add new tools/capabilities
- Improve error handling
- Add tests
- Better documentation

### Documentation

- Usage tutorials
- Video guides
- Translations

## Development Setup

```bash
# Clone the repo
git clone https://github.com/joshduffy/mcp-servers.git
cd mcp-servers

# Install dependencies
npm install

# Build all servers
npm run build

# Run a server in dev mode
npm run dev --workspace=servers/linear-mcp
```

## Creating a New Server

1. Create the directory structure:

```
servers/myserver-mcp/
├── src/
│   └── index.ts
├── package.json
└── tsconfig.json
```

2. Use this template for `package.json`:

```json
{
  "name": "@pulselab/myserver-mcp",
  "version": "0.1.0",
  "description": "MCP server for ...",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

3. Implement using the MCP SDK:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'myserver-mcp',
  version: '0.1.0',
}, {
  capabilities: { tools: {} },
});

// Add your tools here
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [/* your tools */],
}));

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Code Style

- TypeScript with strict mode
- No `any` types (use `unknown` and type guards)
- Meaningful variable names
- Comments for complex logic

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-server`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with a clear message
6. Open a PR with description of changes

## Questions?

Open an issue or reach out at [pulselab.cc](https://pulselab.cc).
