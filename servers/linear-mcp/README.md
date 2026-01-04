# linear-mcp

MCP server for [Linear](https://linear.app) issue tracking.

## Setup

1. Get your Linear API key from [Settings > API](https://linear.app/settings/api)

2. Add to your Claude Code MCP config (`~/.claude/mcp.json`):

```json
{
  "servers": {
    "linear": {
      "command": "node",
      "args": ["/path/to/linear-mcp/dist/index.js"],
      "env": {
        "LINEAR_API_KEY": "lin_api_..."
      }
    }
  }
}
```

## Tools

### linear_list_issues

List issues with optional filters.

```
"show my assigned issues"
"list issues in the ENG team"
"what issues are in progress?"
```

### linear_create_issue

Create a new issue.

```
"create issue: Add dark mode support in ENG team"
```

### linear_search

Search across all issues.

```
"search for authentication issues"
```

### linear_get_issue

Get full details of an issue.

```
"get details of ENG-123"
```

### linear_update_issue

Update an existing issue.

```
"mark ENG-123 as high priority"
```

### linear_list_teams

List all teams in the workspace.

```
"what teams exist?"
```
