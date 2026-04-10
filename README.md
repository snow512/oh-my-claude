# claude-up

Bootstrap and manage your Claude Code environment — npm CLI + Claude plugin hybrid.

Like oh-my-zsh for your shell, claude-up sets up permissions, plugins, skills, and status line with a single command. Works both from the terminal and inside Claude Code sessions.

---

## Quick Start

```bash
# Full interactive setup
npx claude-up init

# Or use the alias
cup init
```

That's it. Answer one question (`Use defaults? [Y/n]`) and everything is configured.

### Inside a Claude Code session

| What you type | What runs |
|---|---|
| `클로드초기설정해` / `setup` | `/claude-init` → `cup init` |
| `프로젝트초기설정해` / `project setup` | `/project-init` → `cup project-init` |

---

## Commands

```
Usage: cup <command> [options]

Setup
  init                  Interactive environment setup (all-in-one)
    --yes, -y           Skip prompts, install everything
    --lang=ko           Set skill language (en|ko, auto-detected)
  install <target>      Install a specific component
    skills              Install user skills only
    plugins             Apply plugins to settings.json
    permissions         Apply permissions to settings.json
    statusline          Install status line script
    all                 Install everything (= init -y)
  project-init          Set up project-level permissions
  update                Check & apply updates from repo
    --yes, -y           Apply all without asking
    --force, -f         Force even if up to date

Sessions
  sessions              List recent sessions
    --all, -a           All projects (default: current only)
    --project=<name>    Filter by project
  resume [id]           Resume a session (picker if no id)
    --fork              Fork as new session

Info
  status                Environment summary
    --json              JSON output
  doctor                Diagnose issues

Environment
  clone                 Export ~/.claude/ as portable package
  backup                Snapshot to .tar.gz
  restore <file>        Restore from backup
```

### Example: `cup init`

```
┌─────────────────────────────────────┐
│  claude-up                       │
│  Claude Code Environment Bootstrap  │
└─────────────────────────────────────┘

Use defaults? (install everything) [Y/n]:

Step 1/6 — Permissions (allow)
  ✓ Applying 10 allow rules

Step 2/6 — Permissions (deny)
  ✓ Applying 7 deny rules

Step 3/6 — Plugins
  ✓ Enabling 14 plugins

Step 4/6 — User Skills
  ✓ Installing all 13 skills (en)

Step 5/6 — Status Line
  ✓ Installing status line

Step 6/6 — Summary
  ✓ Allow rules: 10 configured
  ✓ Deny rules: 7 configured
  ✓ Plugins: 14 enabled
  ✓ Skills: 13/13 installed
  ✓ Status Line: installed

Done! 🎉
```

---

## User Skills (13)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| branch-sync | sync, pull from | Bidirectional branch sync |
| clean-code | clean code | Lint → analyze → fix → /simplify |
| clean-ui | clean ui | UI code quality (a11y, tokens, patterns) |
| commit-push | commit, push | Lint → docs → commit → push |
| doc-structure | document, update docs | Generate/update project docs |
| enhance | harden, improve, unify UI | Active code/UX/UI improvement |
| merge-branch | merge, create PR | Direct merge or PR creation |
| project-sync | pull, sync | git pull + briefing + deps |
| ralph-loop-run | ralph loop | Auto-iterate with completion detection |
| restart-server | restart, stop server | Auto-detect project → restart/stop |
| security-audit | security audit | Secrets + .env + permissions scan |
| setup-workspace | setup workspace | Hard-clone parallel workspaces |
| version-release | bump version, changelog | SemVer + CHANGELOG.md |

All skills support both English and Korean triggers. Skills are available in English (default) and Korean (`--lang=ko`).

---

## Customization

Fork this repo and edit:

- **`presets/user.json`** — permissions (allow/deny), plugins, marketplaces
- **`presets/project.json`** — project-level permissions
- **`user-skills/`** — add, remove, or edit skills
- **`statusline-command.sh`** — customize the status bar

Run `cup update` to pull latest changes after editing.

---

## How It Works

```
Terminal: cup init
    ↓
CLI (bin/cli.js → installer.js) reads presets + copies skills
    ↓
~/.claude/settings.json + ~/.claude/skills/ updated

Claude session: "클로드초기설정해"
    ↓
Plugin command: /claude-init
    ↓
Runs: npx claude-up init (same CLI)
```

The CLI does the actual work. Plugin commands are thin wrappers.

---

## License

MIT
