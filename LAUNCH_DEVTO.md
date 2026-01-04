---
title: I Built Privacy-First MCP Servers So Claude Can Access Your Tools Without Phoning Home
published: true
description: Connect Claude to Linear, Postgres, Notion, and Obsidian with one command. No data leaves your machine.
tags: ai, claude, mcp, opensource
cover_image: https://raw.githubusercontent.com/joshduffy/mcp-servers/main/assets/cover.png
---

# I Built Privacy-First MCP Servers So Claude Can Access Your Tools Without Phoning Home

Last month I burned 3 hours trying to set up an MCP server for Linear. Clone the repo. Install dependencies. Build from source. Manually edit JSON config. Debug why it wasn't connecting.

Then I did it again for Postgres. And again for Notion.

I thought: **there has to be a better way.**

## The Problem with MCP Servers Today

The Model Context Protocol is amazing – it lets AI assistants like Claude connect to external tools and data sources. But the ecosystem is fragmented:

- **3,000+ servers** scattered across GitHub
- Most require **manual setup** (clone, build, configure)
- Many are **abandoned** or poorly maintained
- Some **phone home** with your data

As someone who cares about privacy, that last point bothered me most.

## The Solution: One Command, Privacy by Default

I built [@pulselab/mcp-servers](https://github.com/joshduffy/mcp-servers) – a curated collection of MCP servers that:

1. **Install in 30 seconds** with one command
2. **Run 100% locally** – your data never leaves your machine
3. **Bundle multiple servers** in one package
4. **Auto-configure** for Claude Code

```bash
npx @pulselab/mcp-servers init
```

That's it. The CLI detects which tools you use, walks you through API key setup, and configures everything automatically.

## Available Servers

### Linear

Connect Claude to your issue tracker:

```
You: "What bugs are assigned to me?"

Claude: Found 3 bugs assigned to you:
        1. AUTH-142: Login redirect fails on mobile
        2. API-89: Rate limiting not working
        3. UI-234: Dark mode toggle broken
```

### Postgres

Query your databases with natural language:

```
You: "How many users signed up this week?"

Claude: I ran: SELECT COUNT(*) FROM users
        WHERE created_at > NOW() - INTERVAL '7 days'

        Result: 847 new users this week
```

### Notion

Search and create pages in your workspace:

```
You: "Find my notes about the Q1 roadmap"

Claude: Found 2 relevant pages:
        1. Q1 2026 Product Roadmap
        2. Engineering Q1 Planning Notes
```

### Obsidian (New!)

This one's my favorite. Search your local Obsidian vault:

```
You: "What did I write about authentication last week?"

Claude: From your daily notes (Jan 2-4):
        - Researched OAuth 2.0 PKCE flow
        - Decided on NextAuth.js
        - TODO: Set up Google provider
```

The Obsidian server:
- Parses frontmatter metadata
- Extracts tags (both frontmatter and inline)
- Computes backlinks between notes
- Searches content, titles, and tags
- Finds recent and daily notes

And it's completely local – your notes never leave your computer.

## How It Works

```
┌─────────────────────────────────────────────┐
│           Claude / Cursor / IDE              │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol
┌──────────────────▼──────────────────────────┐
│          @pulselab/mcp-servers              │
│  ┌────────┐ ┌────────┐ ┌────────┐          │
│  │ Linear │ │Postgres│ │Obsidian│   ...    │
│  └───┬────┘ └───┬────┘ └───┬────┘          │
└──────┼──────────┼──────────┼────────────────┘
       │          │          │
       ▼          ▼          ▼
   Linear API  Local DB   Local Files
```

The key insight: **we're never in the middle**.

API calls go directly from your machine to the service. We don't proxy anything. We don't collect analytics. We don't even know you're using it.

## Privacy Guarantees

1. **No telemetry** – we don't track usage
2. **No accounts** – no sign-up required
3. **No cloud** – everything runs locally
4. **Open source** – audit the code yourself

Your Linear issues stay between you and Linear. Your database queries stay on your network. Your Obsidian notes never leave your filesystem.

## Installation

### Automatic (Recommended)

```bash
npx @pulselab/mcp-servers init
```

The CLI will:
1. Detect which tools you have (Linear, Notion, Obsidian vault)
2. Prompt for API keys
3. Write the config to `~/.claude/mcp.json`

### Manual

```bash
npm install -g @pulselab/mcp-servers

# Add servers individually
mcp-servers add linear
mcp-servers add postgres
mcp-servers add obsidian
```

### Configuration

The config lives in `~/.claude/mcp.json`:

```json
{
  "servers": {
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

## What's Next?

I'm working on:

- **SQLite** – query local databases
- **Todoist** – task management
- **Cal.com** – calendar integration
- **Apple Notes** – for the Apple ecosystem folks

## Try It Out

```bash
npx @pulselab/mcp-servers init
```

GitHub: [github.com/joshduffy/mcp-servers](https://github.com/joshduffy/mcp-servers)

I'd love to hear:
- What servers would you want?
- Any privacy concerns?
- Bugs or issues?

Drop a comment or open an issue on GitHub.

---

*Built by [pulselab.cc](https://pulselab.cc) – privacy-first software that never phones home.*
