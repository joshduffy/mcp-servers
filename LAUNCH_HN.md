# Hacker News Launch

## Title Options (pick one)

1. **Show HN: Privacy-first MCP servers for Claude – Linear, Postgres, Obsidian**
2. **Show HN: MCP servers that never phone home – connect Claude to your tools locally**
3. **Show HN: @pulselab/mcp-servers – one-command setup for Claude integrations**

## URL

https://github.com/joshduffy/mcp-servers

---

## First Comment (post immediately after submission)

Hi HN! I built this after getting frustrated with the MCP server ecosystem.

**The problem:** Most MCP servers require you to clone repos, build from source, and manually edit JSON config files. Many are abandoned or poorly maintained. And some phone home with your data.

**The solution:** A curated collection of privacy-first MCP servers with one-command installation:

```
npx @pulselab/mcp-servers init
```

That's it. It detects which tools you use and configures everything.

**Current servers:**
- Linear (issue tracking)
- Postgres (database queries)
- Notion (workspace access)
- Obsidian (local vault search) ← this one's new, searches your markdown notes locally

**Privacy approach:** Everything runs on your machine. API calls go directly from your computer to the service. We're never in the middle, no analytics, no accounts.

**Why Obsidian?** There wasn't a good MCP server for it, and Obsidian users tend to be privacy-conscious (which aligns with our approach). It parses frontmatter, extracts tags, computes backlinks, and searches content.

Tech: TypeScript, MCP SDK, runs with Claude Code/Cursor/Continue.

Would love feedback on:
1. What servers would you want to see next? (SQLite, Todoist, Cal.com are on the roadmap)
2. Any privacy concerns I should address?
3. Is the one-command install actually working for people?

Code: https://github.com/joshduffy/mcp-servers

---

## Responding to Comments

### If asked "why not just use X?"

> Fair question. The main differences:
> 1. One-command install vs clone+build
> 2. Multiple servers bundled together
> 3. Explicit privacy-first design (no telemetry, runs locally)
> 4. Active maintenance under one roof
>
> If X works for you, great! This is for people who want a batteries-included option.

### If asked about security

> Great concern. A few things:
> 1. All code is open source and auditable
> 2. API keys stay on your machine in ~/.claude/mcp.json
> 3. No network calls except to the services you configure
> 4. We never see your data – the server just bridges Claude to your existing tools

### If asked "how is this different from official MCP servers?"

> The official repo (modelcontextprotocol/servers) has reference implementations. They're great for learning but:
> 1. Require manual setup
> 2. Are individual repos, not bundled
> 3. Don't have the auto-configuration CLI
>
> Think of this as the "create-react-app" for MCP – opinionated, batteries-included.

### If someone finds a bug

> Thanks for reporting! Can you open an issue with:
> 1. Your OS/Node version
> 2. The command you ran
> 3. The error message
>
> I'll prioritize fixes.

---

## Best Time to Post

- Tuesday-Thursday, 8-9am EST (HN traffic peak)
- Avoid weekends, holidays, major tech news days
