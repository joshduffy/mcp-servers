<p align="center">
  <img src="https://raw.githubusercontent.com/joshduffy/mcp-servers/main/assets/logo.svg" width="120" alt="MCP Servers">
</p>

<h1 align="center">MCP Servers</h1>

<p align="center">
  <strong>Privacy-first MCP servers that never phone home</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcp-servers-cli"><img src="https://img.shields.io/npm/v/mcp-servers-cli?color=00B4A0&label=npm" alt="npm"></a>
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
npx mcp-servers-cli init
```

That's it. The CLI will:
1. Detect which tools you use (Linear, Notion, Obsidian, etc.)
2. Walk you through API key setup
3. Auto-configure Claude Code

**Or install manually:**

```bash
npm install -g mcp-servers-cli

# Add a specific server
mcp-servers add linear
mcp-servers add postgres
mcp-servers add obsidian
```

---

## Available Servers

| Server | Description | Type | Install |
|--------|-------------|------|---------|
| **linear** | Issue tracking & project management | Cloud | `mcp-servers add linear` |
| **postgres** | Query PostgreSQL databases | Local | `mcp-servers add postgres` |
| **notion** | Search & create Notion pages | Cloud | `mcp-servers add notion` |
| **obsidian** | Search your local Obsidian vault | Local | `mcp-servers add obsidian` |
| **sqlite** | Query local SQLite databases | Local | `mcp-servers add sqlite` |
| **github** | Access repos, issues, and PRs | Cloud | `mcp-servers add github` |
| **filesystem** | Read and search local files | Local | `mcp-servers add filesystem` |

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

### GitHub: Manage Repos & Issues

```
You: "What PRs need my review?"
Claude: Found 3 open PRs requesting your review:
        #142 - Add dark mode support (from @alex)
        #139 - Fix memory leak in worker (from @sam)
        #138 - Update dependencies (from dependabot)

You: "Create an issue for the login bug"
Claude: Created issue #156: "Login redirect fails on Safari"
        https://github.com/myorg/app/issues/156
```

### SQLite: Query Local Databases

```
You: "What tables are in the analytics database?"
Claude: Found 5 tables:
        - events (1.2M rows) - user events with timestamps
        - sessions (89K rows) - session tracking
        - users (12K rows) - user profiles
        ...

You: "Show me the top pages by views"
Claude: SELECT page, COUNT(*) as views FROM events
        WHERE type = 'pageview' GROUP BY page ORDER BY views DESC

        /dashboard    45,231
        /settings     12,847
        /profile       8,392
```

### Filesystem: Read & Search Files

```
You: "Find all TypeScript files with 'auth' in the name"
Claude: Found 8 files matching **/*auth*.ts:
        src/lib/auth.ts
        src/middleware/authMiddleware.ts
        src/hooks/useAuth.ts
        ...

You: "Search for TODO comments in the src folder"
Claude: Found 12 TODOs:
        src/api/users.ts:42 - TODO: Add rate limiting
        src/components/Form.tsx:89 - TODO: Validate email format
        ...
```

---

## Configuration

### Auto-Configuration (Recommended)

```bash
npx mcp-servers-cli init
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
| postgres | `POSTGRES_URL` | PostgreSQL connection string |
| notion | `NOTION_API_KEY` | [Create integration](https://www.notion.so/my-integrations) |
| obsidian | `OBSIDIAN_VAULT` | Path to your vault folder |
| sqlite | `SQLITE_PATH` | Path to SQLite database file |
| github | `GITHUB_TOKEN` | [Create token](https://github.com/settings/tokens) |
| filesystem | `FS_ROOT` | Root directory to allow access to |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Claude / Cursor / IDE                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ MCP Protocol
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                            mcp-servers-cli                                  │
│                                                                             │
│   Cloud Servers              Local Servers                                  │
│   ┌────────┐ ┌────────┐      ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│   │ Linear │ │ Notion │      │Postgres│ │Obsidian│ │ SQLite │ │  Files │  │
│   └───┬────┘ └───┬────┘      └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘  │
│       │          │               │          │          │          │        │
│   ┌───┴────┐     │               │          │          │          │        │
│   │ GitHub │     │               │          │          │          │        │
│   └───┬────┘     │               │          │          │          │        │
└───────┼──────────┼───────────────┼──────────┼──────────┼──────────┼────────┘
        │          │               │          │          │          │
        ▼          ▼               ▼          ▼          ▼          ▼
   External     External        Local      Local      Local      Local
     APIs         APIs         Database    Vault     Database   Filesystem
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

- **New servers**: Todoist, Cal.com, Raycast, Slack, Discord
- **Improvements**: Better error messages, more tools per server
- **Documentation**: Tutorials, video guides

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Comparison

| Feature | mcp-servers-cli | Other MCP Servers |
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
