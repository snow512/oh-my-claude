# Architecture

## Overview

claude-up은 터미널 기반 LLM CLI 도구(Claude Code, Gemini CLI, Codex CLI)의 환경을 부트스트랩하고 관리하는 npm CLI + Claude plugin hybrid 도구.

```
Terminal              Claude Code session
  cup init              /claude-init
      \                    /
       bin/cli.js (router)
            |
       Provider Adapter Pattern
       ├── ClaudeProvider   → ~/.claude/
       ├── GeminiProvider   → ~/.gemini/
       └── CodexProvider    → ~/.codex/
```

## Project Structure

```
claude-up/
├── src/
│   ├── cli.ts                  # CLI entry (arg parse + command routing)
│   ├── installer.ts            # init/install/project-init/clone/backup/restore/status/doctor/update/sessions/resume/uninstall
│   ├── sync.ts                 # login/push/pull (GitHub Gist cloud sync)
│   ├── ui.ts                   # Terminal UI (colors, banner, spinner, checkbox, ask)
│   ├── utils.ts                # Shared utilities (readJson, writeJson, backup, parseSimpleYaml)
│   └── providers/
│       ├── types.ts            # Provider interface + shared types
│       ├── registry.ts         # Auto-detection + --provider flag resolution
│       ├── claude.ts           # ClaudeProvider (settings.json, CLAUDE.md, ~/.claude/skills/)
│       ├── gemini.ts           # GeminiProvider (settings.json, policies TOML, GEMINI.md, ~/.gemini/skills/)
│       └── codex.ts            # CodexProvider (config.toml, AGENTS.md, ~/.agents/skills/)
├── bin/                        # Compiled JS (tsc output)
├── presets/
│   ├── common.json             # Shared: permission intents, skill list
│   ├── claude.json             # Claude: permissions, enabledPlugins, marketplaces
│   ├── gemini.json             # Gemini: settings, policies
│   ├── codex.json              # Codex: settings (TOML source)
│   ├── claude-md.md            # CLAUDE.md cup-managed block template
│   ├── gemini-md.md            # GEMINI.md cup-managed block template
│   ├── agents-md.md            # AGENTS.md cup-managed block template
│   └── project/
│       ├── claude.json         # .claude/settings.local.json
│       ├── gemini.json         # .gemini/settings.json (project)
│       └── codex.json          # .codex/config.toml (project)
├── user-skills/                # 13 skills (en + ko + meta)
│   └── {name}/
│       ├── SKILL.md            # English body (no frontmatter)
│       ├── SKILL.ko.md         # Korean body (no frontmatter)
│       └── meta/
│           ├── claude.yaml     # Claude frontmatter (allowed-tools, etc.)
│           ├── gemini.yaml     # Gemini frontmatter (tools, etc.)
│           └── codex.yaml      # Codex frontmatter (tools, etc.)
├── project-skills/             # Project-level skills (.gitkeep)
├── commands/                   # Claude plugin commands (/claude-init, /project-init)
├── skills/                     # Claude plugin skills
├── plugin.json                 # Claude plugin manifest
├── statusline-command.sh       # Claude status bar script
└── package.json                # @snow512/claude-up
```

## Provider Adapter Pattern

모든 프로바이더별 로직은 `Provider` 인터페이스를 통해 추상화.

### Provider Interface (주요 메서드)

| 메서드 | 역할 |
|--------|------|
| `isInstalled()` | CLI 존재 여부 또는 홈 디렉토리 존재 확인 |
| `readSettings()` / `writeSettings()` | 네이티브 설정 읽기/쓰기 (JSON or TOML) |
| `mergePermissions()` | 프리셋 권한을 네이티브 포맷으로 적용 |
| `enablePlugins()` | 플러그인/확장 활성화 |
| `installSkill()` | meta + body 조합하여 스킬 설치 |
| `readCupBlock()` / `writeCupBlock()` | 지침 파일(CLAUDE.md 등)의 cup 블록 관리 |
| `listSessions()` / `resumeSession()` | 세션 목록/재개 |
| `getInitSteps()` | 프로바이더별 초기화 단계 정의 |
| `getSyncKeys()` | 클라우드 싱크 대상 키 정의 |

### Provider 비교

| | Claude | Gemini | Codex |
|---|---|---|---|
| homeDir | `~/.claude/` | `~/.gemini/` | `~/.codex/` |
| settings | `settings.json` (JSON) | `settings.json` (JSON) | `config.toml` (TOML) |
| instruction | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` |
| skills | `~/.claude/skills/` | `~/.gemini/skills/` | `~/.agents/skills/` |
| permissions | JSON allow/deny arrays | TOML policy rules | TOML approval_policy + sandbox |
| plugins | `enabledPlugins` record | Extensions (CLI managed) | `[plugins]` TOML table |

### Registry

```typescript
detectProviders()       // which, fs.existsSync로 설치 여부 감지
resolveProviders(flag?) // --provider=claude,gemini 파싱, 미지정 시 자동감지
getProvider(name)       // 특정 프로바이더 인스턴스 생성
```

## Skill Installation Flow

```
1. user-skills/{name}/SKILL.md      → 공통 본문 읽기 (frontmatter 없음)
2. user-skills/{name}/meta/claude.yaml → 프로바이더 메타 읽기
3. provider.buildSkillContent(body, meta)  → frontmatter + body 조합
4. ~/.claude/skills/{name}/SKILL.md  → 최종 파일 쓰기
```

한국어: `--lang=ko` 시 SKILL.ko.md를 본문으로 사용, 메타는 동일.

## Cloud Sync (Gist)

### 파일 구조

```
cup-manifest.json                  # { version, providers, skills, lang }
cup-settings--claude.json          # Claude settings (filtered)
cup-settings--gemini.json          # Gemini settings (filtered)
cup-settings--codex.toml           # Codex settings (filtered)
cup-claude-md.md                   # CLAUDE.md cup block
cup-gemini-md.md                   # GEMINI.md cup block
cup-agents-md.md                   # AGENTS.md cup block
cup-skill--{name}.md              # Skill content
```

하위 호환: v1 `cup-settings.json` → Claude용으로 간주.

## Data Flow

```
cup init
  → resolveProviders(opts.provider)
  → for each provider:
      → provider.backupSettings()
      → provider.getInitSteps()
      → for each step:
          → step.execute(useDefaults, lang)
              → readJson / writeJson / writePolicies
              → installSkill (meta + body → SKILL.md)
              → writeCupBlock (instruction file)
      → renderSummary(results)
```

## Dependencies

- **Runtime**: `smol-toml` (TOML read/write for Codex config.toml, Gemini policies)
- **Dev**: `typescript`, `@types/node`
- Node.js >= 18
