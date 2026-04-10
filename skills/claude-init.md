---
name: claude-init
description: User-level Claude Code environment setup logic — settings.json merge, plugin activation, user skills copy
allowed-tools: Bash
user-invocable: false
---

## Claude Code Initial Setup

Run the `npx claude-up init` command to configure the user-level environment.

### What It Does

1. Apply permissions, enabledPlugins, and marketplaces to `~/.claude/settings.json`
2. Copy user skills to `~/.claude/skills/`
3. Existing settings are automatically backed up

### Run

```bash
npx claude-up init
```
