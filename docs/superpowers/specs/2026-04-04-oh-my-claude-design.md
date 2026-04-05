# oh-my-claude Design Spec

## Overview

An **npm CLI + Claude plugin hybrid** that bootstraps and manages Claude Code environments.
Run `npx oh-my-claude init` once on a new machine to replicate an identical Claude Code environment.
Inside a Claude session, use `/claude-init` or `/project-init` for the same functionality.

## Architecture: Hybrid (npm CLI + Claude Plugin)

**Two entry points, one logic**

| Entry Point | When to Use | How to Run |
|-------------|------------|------------|
| **npm CLI** | New machine, without Claude Code | `npx oh-my-claude init` |
| **Claude plugin** | Inside a Claude session | `/claude-init` (or Korean triggers) |

Plugin commands are thin wrappers that call `npx oh-my-claude <command>`.
All logic lives in `bin/` — no code duplication.

## Project Structure

```
oh-my-claude/
├── package.json                          # npm package (bin: oh-my-claude, omc)
├── plugin.json                           # Claude plugin manifest
├── README.md
├── bin/
│   ├── cli.js                            # CLI entry point (command routing)
│   ├── ui.js                             # UI rendering (colors, banner, checkbox, spinner)
│   └── installer.js                      # All command logic
├── presets/
│   ├── user.json                         # User-level: permissions + plugins + marketplaces
│   └── project.json                      # Project-level: destructive permissions
├── user-skills/                          # Copied to ~/.claude/skills/
│   ├── */SKILL.md                        # English (default)
│   └── */SKILL.ko.md                     # Korean
├── project-skills/                       # Copied to .claude/skills/
├── statusline-command.sh                 # Custom status bar script
├── skills/                               # Claude plugin skills
│   ├── claude-init.md
│   └── project-init.md
└── commands/                             # Claude plugin commands (CLI wrappers)
    ├── claude-init.md
    └── project-init.md
```

## CLI Commands

```bash
omc init                  # Interactive setup (permissions, plugins, skills, statusline)
omc install <target>      # Install individual component (skills|plugins|permissions|statusline|all)
omc project-init          # Project-level permissions
omc update                # Check & apply updates
omc sessions              # List sessions
omc resume [id]           # Resume a session
omc status                # Environment summary
omc doctor                # Diagnose issues
omc clone                 # Export environment
omc backup                # Snapshot to .tar.gz
omc restore <file>        # Restore from backup
```

Alias: `oh-my-claude` = `omc`

## Presets

### presets/user.json

Contains:
- `permissions.allow` — safe default allow rules (Read, Glob, Grep, etc.)
- `permissions.deny` — destructive command blocks (rm -rf, force push, etc.)
- `enabledPlugins` — curated plugin list (14 plugins)
- `extraKnownMarketplaces` — official plugin marketplace

### presets/project.json

Contains:
- `permissions.allow` — destructive operations unlocked per-project (Write, Edit, Bash, NotebookEdit)

## User Skills (13)

| Skill | Purpose |
|-------|---------|
| branch-sync | Bidirectional branch sync |
| clean-code | Lint → analyze → fix → /simplify |
| clean-ui | UI code quality (a11y, tokens, patterns) |
| commit-push | Lint → docs → commit → push |
| doc-structure | Generate/update project docs |
| enhance | Active code/UX/UI improvement |
| merge-branch | Direct merge or PR creation |
| project-sync | git pull + briefing + deps |
| ralph-loop-run | Auto-iterate with completion detection |
| restart-server | Auto-detect project → restart/stop |
| security-audit | Secrets + .env + permissions scan |
| setup-workspace | Hard-clone parallel workspaces |
| version-release | SemVer + CHANGELOG.md |

Skills support en/ko. `SKILL.md` = English (default), `SKILL.ko.md` = Korean.

## Design Decisions

1. **Hybrid architecture**: npm CLI handles logic, Claude plugin is a thin wrapper. Solves the chicken-and-egg problem — can bootstrap without Claude Code.
2. **Zero runtime dependencies**: `bin/*.js` uses only Node.js built-in modules (fs, path, readline, child_process).
3. **Direct settings.json manipulation**: Claude Code CLI has limited settings management, so direct file operations are most reliable.
4. **Merge strategy**: Overwrite only preset keys, preserve other existing keys (statusLine, etc.).
5. **Skill overwrite policy**: Repo is source of truth → overwrite. Local-only skills are not deleted.
6. **Backup required**: Always create `.bak.{timestamp}` before modifying settings.
7. **Plugin installation delegation**: Writing `enabledPlugins` to settings.json triggers Claude Code to auto-install on next session.
8. **i18n**: Skills support en/ko via SKILL.md/SKILL.ko.md pattern with system locale auto-detection.
