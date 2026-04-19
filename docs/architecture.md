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
│   ├── installer.ts            # init/install/project-init/clone/backup/restore/clean/status/doctor/update/sessions/resume/uninstall
│   ├── security.ts             # security init/check/diff (level: loose/normal/strict)
│   ├── guidance.ts             # guidance init/list/remove (categories: language/scope/…)
│   ├── sync.ts                 # login/push/pull (GitHub Gist cloud sync)
│   ├── ui.ts                   # Terminal UI (colors, banner, spinner, checkbox, ask)
│   ├── utils.ts                # Shared utilities (readJson, writeJson, backup, parseSimpleYaml)
│   └── providers/
│       ├── types.ts            # Provider interface + shared types
│       ├── base.ts             # Shared helpers (buildSkillContent, generic marker-block I/O for cup/security/guidance, session scan)
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
├── user-skills/                # 15 skills (en + ko + meta)
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
| `applySecurityLevel()` / `read/write/removeSecurityBlock()` | 보안 레벨 적용 + cup-security 블록 관리 |
| `read/write/removeGuidanceBlock(category)` / `listInstalledGuidance()` | 카테고리별 cup-guidance-* 블록 관리 |
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

## Security Levels

`cup security` 명령군은 3단계 보안 레벨을 제공한다:

| Level | deny rules | Instruction block | Codex sandbox | Use case |
|-------|------------|-------------------|---------------|----------|
| `loose` | 2 (rm -rf /, force-push) | 없음 | `danger-full-access` | 빠른 실험, 토이 프로젝트 |
| `normal` (default) | 7 (현재 baseline) | 민감정보 커밋 점검 | `workspace-write` | 일반 개발 |
| `strict` | 12 (normal + curl\|bash, eval, chmod 777 등) | normal + 외부호출/배포 가드 | `read-only` | 프로덕션, 팀 협업 |

### 파일 구조

```
presets/security/
├── loose.json           # 레벨별 deny + sandbox + policies
├── normal.json
├── strict.json
├── normal-md.md         # cup-security 블록 (instruction file에 주입)
└── strict-md.md
```

### 작동 방식

1. `cup security init --level=<lvl>`은 `presets/security/<lvl>.json`을 읽어서 각 프로바이더에 적용
2. `Provider.applySecurityLevel(config)`은 프로바이더 네이티브 포맷으로 변환:
   - Claude → `permissions.deny[]` 갱신
   - Gemini → `~/.gemini/policies/cup-deny.toml` 재생성
   - Codex → `config.toml`의 `sandbox_mode` 갱신
3. loose가 아닌 경우 `cup-security` 블록을 instruction file에 주입 (별도 마커 `<!-- <cup-security> -->`)
4. `cup init` 실행 시 마지막 단계에서 `applySecurityToProvider` 자동 호출 (default: normal)

## Guidance Categories

`cup guidance` 는 LLM 응답 지침을 user instruction file 에 카테고리별 marker block 으로 주입한다. Security 와 동일한 pattern(별도 marker block, preset body, provider 공통 helper)이지만 **category 단위로 선택·설치·제거** 가능한 점이 다르다.

| Category | 내용 |
|----------|------|
| `language` | Korean 베이스 + selective English 사용 규칙 |
| `scope` | 요청 범위 확장 금지; observation vs instruction 구분 |
| `design` | 구조적 문제 발생 시 patch 대신 redesign; explicit identity |
| `deployment` | Production 배포 명시적 승인 |
| `commit` | Conventional Commits + `Co-Authored-By` |

### 파일 구조

```
presets/guidance/
├── index.json           # categories metadata (id, title, description)
├── language.md          # category body (no markers — markers added at install time)
├── scope.md
├── design.md
├── deployment.md
└── commit.md
```

### Marker

각 카테고리는 설치 시 `<!-- <cup-guidance-<id>> -->` ... `<!-- </cup-guidance-<id>> -->` marker 로 감싸진다. Category id 는 `[a-z0-9_-]+` 패턴.

### 작동 방식

1. `cup guidance init --categories=<ids>` (혹은 interactive checkbox) → 각 카테고리의 preset body 를 읽어 marker 로 wrap, `Provider.writeGuidanceBlock(id, block)` 로 instruction file 에 insert/replace.
2. `cup guidance list` → instruction file 을 스캔해 설치된 marker 의 id 를 추출(`listInstalledGuidance`), preset index 와 비교해 ✓/· 표시.
3. `cup guidance remove --categories=<ids>` → `Provider.removeGuidanceBlock(id)` 로 marker block 만 삭제.
4. `cup init` 마지막 step 에서 `applyGuidanceToProvider` 가 자동 호출 (default: 전체 카테고리, `--categories=` 로 제한 가능, interactive 모드에서는 checkbox 로 선택).

### User 영역 확장

User 가 직접 custom category 를 만들거나 `guidance-promote` skill 을 통해 project instruction file 의 rule 을 user 영역으로 승격할 수 있다. Preset 에 없는 id 는 `cup guidance list` 에서 `? <id> (unknown category)` 로 표시된다.

## Dependencies

- **Runtime**: `smol-toml` (TOML read/write for Codex config.toml, Gemini policies)
- **Dev**: `typescript`, `@types/node`
- Node.js >= 18
