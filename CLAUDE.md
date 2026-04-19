# claude-up

Multi-LLM environment bootstrap + management tool. Claude Code (main) + Gemini CLI + Codex CLI.
npm CLI + Claude plugin hybrid.

## Project Structure

```
claude-up/
├── src/
│   ├── cli.ts              # CLI entry point (command routing, --provider flag)
│   ├── installer.ts        # init/install/project-init/clone/backup/restore/status/doctor/update/sessions/resume/uninstall
│   ├── sync.ts             # login/push/pull (GitHub Gist cloud sync, multi-provider)
│   ├── ui.ts               # UI rendering (colors, banner, checkbox, spinner)
│   ├── utils.ts            # Shared utilities (readJson, writeJson, backup, parseSimpleYaml)
│   └── providers/
│       ├── types.ts        # Provider interface + shared types
│       ├── registry.ts     # Auto-detection + --provider resolution
│       ├── claude.ts       # ClaudeProvider (settings.json, CLAUDE.md)
│       ├── gemini.ts       # GeminiProvider (settings.json, policies TOML, GEMINI.md)
│       └── codex.ts        # CodexProvider (config.toml, AGENTS.md)
├── bin/                    # Compiled JS output (tsc → bin/)
├── presets/
│   ├── common.json         # Shared permission intents + skill list
│   ├── claude.json         # Claude: permissions, enabledPlugins, marketplaces
│   ├── gemini.json         # Gemini: settings, policies
│   ├── codex.json          # Codex: settings (TOML source)
│   ├── claude-md.md        # CLAUDE.md cup block template
│   ├── gemini-md.md        # GEMINI.md cup block template
│   ├── agents-md.md        # AGENTS.md cup block template
│   └── project/            # Project-level presets (per provider)
├── user-skills/            # 13 skills (en + ko + meta per provider)
│   └── {name}/
│       ├── SKILL.md        # English body (no frontmatter)
│       ├── SKILL.ko.md     # Korean body
│       └── meta/
│           ├── claude.yaml # Claude frontmatter
│           ├── gemini.yaml # Gemini frontmatter
│           └── codex.yaml  # Codex frontmatter
├── project-skills/         # Project-level skills
├── commands/               # Claude plugin commands
├── skills/                 # Claude plugin skills
├── plugin.json             # Claude plugin manifest
├── statusline-command.sh   # Claude status bar script
└── package.json            # @snow512/claude-up
```

## Key Rules

- **Provider Adapter Pattern**: All provider-specific logic lives in `src/providers/{name}.ts` implementing `Provider` interface
- **Skill structure**: Body (SKILL.md) has no frontmatter; meta/{provider}.yaml has provider-specific frontmatter. `buildSkillContent()` combines them at install time.
- **bin/*.js**: One runtime dependency (`smol-toml` for TOML read/write). Everything else uses Node.js built-ins.
- **CLI output**: English
- **When modifying user-skills**: Update SKILL.md (body) + meta/*.yaml (frontmatter) separately
- **Preset merge strategy**: Overwrite only preset keys; preserve other existing keys
- **Skill overwrite policy**: Repo is source of truth → overwrite. Local-only skills are not deleted
- **Backup required**: Always create `.bak.{timestamp}` before modifying settings files
- **i18n**: Skills support en/ko. SKILL.md = English, SKILL.ko.md = Korean. meta/ is shared.

## Provider Details

| | Claude (main) | Gemini | Codex |
|---|---|---|---|
| homeDir | `~/.claude/` | `~/.gemini/` | `~/.codex/` |
| settings | `settings.json` | `settings.json` | `config.toml` |
| instruction | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` |
| skillsDir | `~/.claude/skills/` | `~/.gemini/skills/` | `~/.agents/skills/` |
| permissions | JSON allow/deny | TOML policies | TOML approval_policy |
| preset | `presets/claude.json` | `presets/gemini.json` | `presets/codex.json` |

## CLI Commands

```bash
cup init [--provider=claude,gemini,codex]   # Interactive environment setup
cup install <target> [--provider=...]       # Install specific component
cup project-init [--provider=...]           # Set up project-level permissions
cup update [--provider=...]                 # Check & apply updates from repo
cup status [--provider=...]                 # Show current environment summary
cup doctor [--provider=...]                 # Diagnose configuration issues
cup clone [--provider=...]                  # Export as portable package
cup backup [--provider=...]                 # Snapshot to .tar.gz
cup restore <file> [--provider=...]         # Restore from backup
cup uninstall [--provider=...]              # Remove cup settings
cup sessions [--all]                        # List sessions (all providers)
cup resume [id] [--fork]                    # Resume a session
cup login                                   # GitHub token for cloud sync
cup push [skills...]                        # Upload to Gist (multi-provider)
cup pull [--provider=...]                   # Download from Gist
cup security                                # Security subcommand help
cup security init [--level=loose|normal|strict]  # Apply security level
cup security check [--verbose]              # Audit current security posture
cup security diff [--level=...]             # Compare current vs target level
cup guidance                                # Guidance subcommand help
cup guidance init [--categories=...]        # Install instruction categories
cup guidance list                           # Show available + installed categories
cup guidance remove [--categories=...]      # Uninstall guidance categories
```

Alias: `claude-up` = `cup`
Auto-detect: `--provider` 미지정 시 설치된 도구 전부 대상

## User Skills (15)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| branch-sync | sync, pull from | Bidirectional/unidirectional branch sync |
| clean-code | clean code | Project detection → lint → analyze → fix → /simplify |
| clean-ui | clean ui | UI code quality (a11y, design tokens, component patterns) |
| commit-push | commit, push | Lint → update docs → commit → push |
| doc-structure | document, update docs | Generate docs from source / update docs from changes |
| enhance | harden, improve, unify UI | Active code hardening + UX improvement + UI consistency |
| guidance-promote | promote guidance, 지침승격해 | Promote project-level LLM rules to user (global) instruction file |
| merge-branch | merge, create PR | Direct merge to develop / PR for main·qa |
| oneshot | 원스탑구현해, oneshot | Plan → implement → quality loop → test → commit (full pipeline) |
| project-sync | pull, sync project | git pull + commit briefing + deps install + doc summary |
| ralph-loop-run | ralph loop | Auto-determine iterations & completion condition |
| restart-server | restart server, stop | Auto-detect project type → restart/stop server |
| security-audit | security audit | Secret scan + .env check + permission audit + dep security |
| setup-workspace | setup workspace | Hard-clone parallel workspaces (auto port assignment) |
| version-release | bump version, changelog | SemVer version management + CHANGELOG.md generation |

## Skill Settings Storage

When a skill needs to remember per-project settings, store in `.claude/settings.local.json`:
```json
{
  "permissions": { ... },
  "skills": {
    "clean-code": { "linterDeclined": true },
    "commit-push": { "linterDeclined": true }
  }
}
```

## Commit Rules

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Include `Co-Authored-By: Claude <noreply@anthropic.com>`
- Commit message language: Follow existing project log (this project uses Korean + English mix)

## GitHub

- Repository: https://github.com/snow512/claude-up
- Package: `@snow512/claude-up@0.1.0-beta` (GitHub Packages)
