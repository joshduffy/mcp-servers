<p align="center">
  <img src="https://raw.githubusercontent.com/joshduffy/mcp-servers/main/assets/logo.svg" width="120" alt="MCP Servers">
</p>

<h1 align="center">MCP Servers</h1>

<p align="center">
  <strong>Privacy-first MCP servers that never phone home</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pulselab/mcp-servers"><img src="https://img.shields.io/npm/v/@pulselab/mcp-servers?color=00B4A0&label=npm" alt="npm"></a>
  <a href="https://github.com/joshduffy/mcp-servers/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/joshduffy/mcp-servers/stargazers"><img src="https://img.shields.io/github/stars/joshduffy/mcp-servers?color=yellow" alt="Stars"></a>
  <a href="https://pulselab.cc"><img src="https://img.shields.io/badge/by-pulselab.cc-FF6B9D" alt="pulselab.cc"></a>
</p>

<p align="center">
  Connect Claude to your tools without sacrificing privacy.<br>
  All servers run 100% locally. Your data stays yours.
</p>

---

## Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/joshduffy/mcp-servers/main/assets/demo.svg" width="800" alt="MCP Servers Demo">
</p>

```bash
# Ask Claude about your Linear issues
> "What bugs are assigned to me?"

# Query your local Postgres database
> "Show me users who signed up this week"

# Search your Obsidian vault
> "Find my notes about authentication"
```

---

## Install in 30 Seconds

```bash
npx @pulselab/mcp-servers init
```

That's it. The CLI will:
1. Detect which tools you use (Linear, Notion, Obsidian, etc.)
2. Walk you through API key setup
3. Auto-configure Claude Code

**Or install manually:**

```bash
npm install -g @pulselab/mcp-servers

# Add a specific server
mcp-servers add linear
mcp-servers add postgres
mcp-servers add obsidian
```

---

## Available Servers

| Server | Description | Install |
|--------|-------------|---------|
| **linear** | Issue tracking & project management | `mcp-servers add linear` |
| **postgres** | Query local/remote PostgreSQL databases | `mcp-servers add postgres` |
| **notion** | Search & create Notion pages | `mcp-servers add notion` |
| **obsidian** | Search your local Obsidian vault | `mcp-servers add obsidian` |

### Coming Soon

| Server | Description | Status |
|--------|-------------|--------|
| **sqlite** | Query local SQLite databases | In Progress |
| **todoist** | Task management | Planned |
| **cal** | Calendar integration | Planned |

---

## Why These Servers?

### Privacy by Default

Every server runs **locally on your machine**. We never:
- Send your data to external servers
- Require account creation
- Phone home for analytics

Your Linear issues, database queries, and Obsidian notes stay on your computer.

### Batteries Included

Other MCP servers make you:
- Clone repos and build from source
- Manually edit JSON config files
- Figure out dependencies yourself

We give you **one command** and you're done.

### Production Ready

- Full TypeScript with strict types
- Comprehensive error handling
- Rate limiting built-in
- Works with Claude Code, Cursor, Continue, and any MCP client

---

## Quick Examples

### Linear: Manage Issues

```
You: "What issues are in the current sprint?"
Claude: I found 12 issues in Sprint 24:
        - AUTH-142: Fix login redirect (In Progress)
        - AUTH-143: Add 2FA support (Todo)
        ...

You: "Create a bug for the header alignment issue"
Claude: Created issue AUTH-156: "Header alignment issue"
        Priority: Medium, Status: Backlog
```

### Postgres: Query Your Database

```
You: "How many users signed up this month?"
Claude: I ran: SELECT COUNT(*) FROM users WHERE created_at > '2026-01-01'
        Result: 1,247 new users this month

You: "Show me the schema for the orders table"
Claude: orders table:
        - id: uuid (primary key)
        - user_id: uuid (foreign key → users)
        - total: decimal(10,2)
        - status: varchar (pending/paid/shipped)
        - created_at: timestamp
```

### Obsidian: Search Your Notes

```
You: "Find my notes about React patterns"
Claude: Found 3 relevant notes:
        1. React/Component Patterns.md - compound components, render props
        2. React/State Management.md - Redux vs Zustand comparison
        3. Projects/App Refactor.md - mentions React context patterns

You: "What did I write about authentication last week?"
Claude: From your daily notes (Jan 2-4):
        - Researched OAuth 2.0 PKCE flow
        - Decided on NextAuth.js for the project
        - TODO: Set up Google provider
```

---

## Configuration

### Auto-Configuration (Recommended)

```bash
npx @pulselab/mcp-servers init
```

### Manual Configuration

Add to `~/.claude/mcp.json`:

```json
{
  "servers": {
    "linear": {
      "command": "mcp-servers",
      "args": ["run", "linear"],
      "env": {
        "LINEAR_API_KEY": "lin_api_xxxxx"
      }
    },
    "postgres": {
      "command": "mcp-servers",
      "args": ["run", "postgres"],
      "env": {
        "POSTGRES_URL": "postgresql://localhost:5432/mydb"
      }
    },
    "obsidian": {
      "command": "mcp-servers",
      "args": ["run", "obsidian"],
      "env": {
        "OBSIDIAN_VAULT": "~/Documents/MyVault"
      }
    }
  }
}
```

### Environment Variables

| Server | Variable | Description |
|--------|----------|-------------|
| linear | `LINEAR_API_KEY` | [Get your API key](https://linear.app/settings/api) |
| postgres | `POSTGRES_URL` | Connection string |
| notion | `NOTION_API_KEY` | [Create integration](https://www.notion.so/my-integrations) |
| obsidian | `OBSIDIAN_VAULT` | Path to your vault folder |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Claude / Cursor / IDE                │
└─────────────────────────┬───────────────────────────────┘
                          │ MCP Protocol
┌─────────────────────────▼───────────────────────────────┐
│                   @pulselab/mcp-servers                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Linear  │ │ Postgres │ │  Notion  │ │ Obsidian │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
└───────┼────────────┼────────────┼────────────┼─────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
   Linear API    Local DB    Notion API   Local Files
   (HTTPS)      (localhost)   (HTTPS)     (filesystem)
```

All processing happens locally. API calls go directly from your machine to the service—we're never in the middle.

---

## Development

```bash
# Clone and install
git clone https://github.com/joshduffy/mcp-servers.git
cd mcp-servers
npm install

# Build all servers
npm run build

# Run a specific server in dev mode
npm run dev --workspace=servers/linear-mcp

# Run tests
npm test
```

### Creating a New Server

```bash
# Scaffold a new server
npm run create-server my-server

# This creates:
# servers/my-server-mcp/
# ├── src/
# │   ├── index.ts      # Entry point
# │   ├── tools.ts      # Tool definitions
# │   └── client.ts     # API client
# ├── package.json
# └── tsconfig.json
```

---

## Contributing

We welcome contributions! Areas we'd love help with:

- **New servers**: SQLite, Todoist, Cal.com, Raycast
- **Improvements**: Better error messages, more tools per server
- **Documentation**: Tutorials, video guides

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Comparison

| Feature | @pulselab/mcp-servers | Other MCP Servers |
|---------|----------------------|-------------------|
| One-command install | ✅ `npx init` | ❌ Clone + build |
| Auto-configuration | ✅ Detects your tools | ❌ Manual JSON editing |
| Privacy-first | ✅ 100% local | ⚠️ Varies |
| Multiple servers | ✅ Bundled together | ❌ Separate repos |
| TypeScript | ✅ Full types | ⚠️ Varies |
| Maintained | ✅ Active | ⚠️ Many abandoned |

---

## Links

- [MCP Protocol Spec](https://github.com/modelcontextprotocol/specification)
- [Claude Code](https://claude.ai/claude-code)
- [pulselab.cc](https://pulselab.cc) - Privacy-first software

---

<p align="center">
  <sub>Built with care by <a href="https://pulselab.cc">pulselab.cc</a></sub>
</p>
