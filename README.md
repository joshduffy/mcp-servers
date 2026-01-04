# MCP Servers

A collection of [Model Context Protocol](https://github.com/modelcontextprotocol) servers for AI coding tools.

MCP allows AI assistants like Claude to connect to external data sources and tools. These servers provide ready-to-use integrations for common developer tools.

## Available Servers

| Server | Description | Status |
|--------|-------------|--------|
| [linear-mcp](./servers/linear-mcp) | Linear issue tracking | Ready |
| [postgres-mcp](./servers/postgres-mcp) | PostgreSQL database | Ready |
| [notion-mcp](./servers/notion-mcp) | Notion workspace | Ready |

## Quick Start

### 1. Install a Server

```bash
# Clone the repo
git clone https://github.com/joshduffy/mcp-servers.git
cd mcp-servers

# Install dependencies
npm install

# Build all servers
npm run build
```

### 2. Configure Claude Code

Add to your `~/.claude/mcp.json`:

```json
{
  "servers": {
    "linear": {
      "command": "node",
      "args": ["/path/to/mcp-servers/servers/linear-mcp/dist/index.js"],
      "env": {
        "LINEAR_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Use with Claude

```
> claude "what issues are assigned to me in Linear?"
> claude "create a new issue for adding dark mode"
```

## Server Details

### linear-mcp

Connect Claude to your Linear workspace.

**Capabilities:**
- List issues, projects, and teams
- Create and update issues
- Search across workspace
- Manage issue assignments

**Environment Variables:**
- `LINEAR_API_KEY` - Your Linear API key

### postgres-mcp

Query and explore PostgreSQL databases.

**Capabilities:**
- List tables and schemas
- Describe table structure
- Execute read-only queries
- Explain query plans

**Environment Variables:**
- `POSTGRES_URL` - Connection string (or individual vars below)
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

### notion-mcp

Access your Notion workspace.

**Capabilities:**
- Search pages and databases
- Read page content
- List database entries
- Create new pages

**Environment Variables:**
- `NOTION_API_KEY` - Notion integration token

## Creating Your Own MCP Server

See the [MCP documentation](https://github.com/modelcontextprotocol/specification) for the protocol specification.

Basic structure:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server';

const server = new Server({
  name: 'my-mcp-server',
  version: '1.0.0',
});

server.addTool({
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: { ... },
  handler: async (params) => { ... }
});

server.start();
```

## License

MIT
