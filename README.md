# claude-up

Bootstrap and manage your Claude Code environment. npm CLI + Claude plugin hybrid.

One command sets up permissions, plugins, skills, and status line. Works from the terminal and inside Claude Code sessions.

## Install

```bash
npx claude-up init
```

Or install globally:

```bash
npm install -g claude-up
cup init
```

Answer one prompt (`Use defaults? [Y/n]`) and everything is configured:

```
  ┌─────────────────────────────────────┐
  │  claude-up                          │
  │  Claude Code Environment Bootstrap  │
  └─────────────────────────────────────┘

  Use defaults? (install everything) [Y/n]:

  Step 1/6 — Permissions (allow)    ✓ 10 rules
  Step 2/6 — Permissions (deny)     ✓ 7 rules
  Step 3/6 — Plugins                ✓ 14 enabled
  Step 4/6 — User Skills            ✓ 13 installed (en)
  Step 5/6 — Status Line            ✓ installed
  Step 6/6 — Summary                Done!
```

## Commands

```
cup init              Interactive environment setup
cup install <target>  Install a specific component (skills|plugins|permissions|statusline|all)
cup project-init      Set up project-level permissions
cup update            Apply updates from repo

cup sessions          List recent sessions
cup resume [id]       Resume a session

cup status            Environment summary
cup doctor            Diagnose configuration issues

cup clone             Export ~/.claude/ as portable package
cup backup            Snapshot to .tar.gz
cup restore <file>    Restore from backup
cup uninstall         Remove claude-up settings

cup login             Set up GitHub token for cloud sync
cup push              Upload settings & skills to GitHub Gist
cup pull              Download settings & skills from GitHub Gist
```

Common flags: `--yes` (skip prompts), `--force` (overwrite), `--lang=ko` (Korean skills), `--json` (machine output).

## Skills

13 built-in skills with English and Korean trigger support:

| Skill | Trigger | What it does |
|-------|---------|--------------|
| branch-sync | sync, pull from | Bidirectional branch sync |
| clean-code | clean code | Lint, analyze, fix, simplify |
| clean-ui | clean ui | UI quality (a11y, design tokens, patterns) |
| commit-push | commit, push | Lint, update docs, commit, push |
| doc-structure | document, update docs | Generate or update project docs |
| enhance | harden, improve | Active code/UX/UI improvement |
| merge-branch | merge, create PR | Direct merge or PR creation |
| project-sync | pull, sync | git pull + briefing + deps |
| ralph-loop-run | ralph loop | Auto-iterate with completion detection |
| restart-server | restart, stop | Auto-detect project type, restart/stop |
| security-audit | security audit | Secrets + .env + permissions scan |
| setup-workspace | setup workspace | Hard-clone parallel workspaces |
| version-release | bump version | SemVer + CHANGELOG.md generation |

## Cloud Sync

Sync your settings and skills across machines via GitHub Gist:

```bash
cup login             # One-time GitHub token setup
cup push              # Upload current state
cup pull              # Download and apply on another machine
```

## Claude Plugin

claude-up also works as a Claude Code plugin. Two built-in commands:

| Command | Trigger |
|---------|---------|
| `/claude-init` | `cup init` inside a session |
| `/project-init` | `cup project-init` inside a session |

## Customization

Fork this repo and edit:

- `presets/user.json` — permissions (allow/deny), plugins, marketplaces
- `presets/project.json` — project-level permissions
- `user-skills/` — add, remove, or edit skills
- `statusline-command.sh` — customize the status bar

Run `cup update` to apply changes.

## Architecture

```
Terminal              Claude Code session
  cup init              /claude-init
      \                    /
       bin/cli.js (router)
            |
       bin/installer.js    reads presets/ → writes ~/.claude/
       bin/sync.js         GitHub Gist API for cloud sync
       bin/ui.js           colors, spinner, checkbox, banner
```

- Zero runtime dependencies (Node.js built-in modules only)
- TypeScript source (`src/`) compiled to `bin/`
- Node.js >= 18

## License

MIT
