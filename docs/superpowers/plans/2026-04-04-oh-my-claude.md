# oh-my-claude Implementation Plan

> This plan has been fully executed. Kept for reference.

**Goal:** Build an npm CLI + Claude plugin hybrid that bootstraps and manages Claude Code environments.

**Architecture:** All logic in `bin/` (cli.js, ui.js, installer.js). Claude plugin commands are thin wrappers that call the CLI. Presets (JSON) and user skills (md files) are bundled in the repo and copied on install.

**Tech Stack:** Node.js (built-in modules only: fs, path, readline, child_process), Claude Code plugin format (markdown skills/commands)

---

## Implemented Structure

```
oh-my-claude/
├── bin/
│   ├── cli.js              # Entry point + command routing
│   ├── ui.js               # UI: colors, banner, spinner, checkbox, prompts
│   └── installer.js        # All command logic
├── package.json            # npm package (bin: oh-my-claude, omc)
├── plugin.json             # Claude plugin manifest
├── statusline-command.sh   # Custom status bar
├── tsconfig.json           # TypeScript config (migration planned)
├── presets/
│   ├── user.json           # User-level settings
│   └── project.json        # Project-level settings
├── user-skills/            # 13 skills (en + ko)
├── project-skills/         # Project skills (empty, extensible)
├── commands/               # Claude plugin commands
├── skills/                 # Claude plugin skills
└── docs/                   # Design specs and plans
```

## Commands Implemented

| Command | Purpose |
|---------|---------|
| `omc init` | Interactive environment setup (6-step wizard) |
| `omc install <target>` | Install individual components |
| `omc project-init` | Project-level permissions |
| `omc update` | Check & apply updates (permissions, plugins, statusline, skills) |
| `omc sessions` | List sessions across projects |
| `omc resume [id]` | Resume a session from any project |
| `omc status` | Environment summary |
| `omc doctor` | Configuration diagnostics |
| `omc clone` | Export environment as portable package |
| `omc backup` | Snapshot to .tar.gz |
| `omc restore <file>` | Restore from backup |

## Key Features

- Interactive checkbox selector (arrow keys, space toggle) — zero dependencies
- Braille dot spinner animation
- Box-drawing banner
- System locale auto-detection for skill language
- Change detection for smart updates (only update what changed)
- Session management across projects
