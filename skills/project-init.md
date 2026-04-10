---
name: project-init
description: Project-level permissions and skills setup logic — apply destructive permissions to settings.local.json
allowed-tools: Bash
user-invocable: false
---

## Project Initial Setup

Run the `npx claude-up project-init` command to configure project-level permissions.

### What It Does

1. Apply destructive permissions (Write, Edit, Bash, etc.) to `.claude/settings.local.json`
2. Copy common project skills to `.claude/skills/`
3. Existing settings are automatically backed up

### Run

```bash
npx claude-up project-init
```
