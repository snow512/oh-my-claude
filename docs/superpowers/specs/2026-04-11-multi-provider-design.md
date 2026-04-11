# Multi-Provider Support Design

> claude-up을 Claude Code, Gemini CLI, Codex CLI 세 가지 터미널 LLM 도구에 대응하는 멀티 프로바이더 환경 관리 도구로 확장.

## Decisions

| 항목 | 결정 |
|------|------|
| 지원 범위 | 풀 부트스트랩 (스킬, 지침, 권한, 플러그인, 세션, 싱크) |
| 프로바이더 선택 | 자동감지 + `--provider` 플래그로 오버라이드 |
| 의존성 | 경량 TOML 라이브러리 1개 허용 (`smol-toml`) |
| 프리셋 구조 | 혼합: 공통(스킬, 지침)은 통합, 고유(권한, 플러그인)는 분리 |
| 스킬 호환 | 공통 본문(SKILL.md) + 프로바이더별 메타(`meta/{provider}.yaml`) |
| CLI 이름 | `cup` 유지, Claude가 메인, Gemini/Codex는 확장 지원 |
| 세션 관리 | 프로바이더별 구현 |
| 아키텍처 | Provider 어댑터 패턴 |

---

## Current State (As-Is)

구현 에이전트가 참조할 현재 코드 구조 전체 기술.

### Project Layout

```
claude-up/
├── src/
│   ├── cli.ts              # CLI entry (arg parse + command routing)
│   ├── installer.ts        # init/install/project-init/clone/backup/restore/status/doctor/update/sessions/resume/uninstall
│   ├── sync.ts             # login/push/pull (GitHub Gist cloud sync)
│   └── ui.ts               # colors, banner, spinner, checkbox, ask
├── bin/                    # Compiled JS output (tsc → bin/)
├── presets/
│   ├── user.json           # Claude user-level preset
│   ├── project.json        # Claude project-level preset
│   └── claude-md.md        # CLAUDE.md cup-managed block template
├── user-skills/            # 13 skills (en + ko)
│   └── {name}/SKILL.md, SKILL.ko.md
├── project-skills/         # (empty, .gitkeep)
├── commands/               # Claude plugin commands
│   ├── claude-init.md
│   └── project-init.md
├── skills/                 # Claude plugin skills
│   ├── claude-init.md
│   └── project-init.md
├── plugin.json             # Claude plugin manifest
├── statusline-command.sh   # Claude status bar script
├── package.json            # @snow512/claude-up
├── tsconfig.json           # ES2020, commonjs, outDir: ./bin
└── tests/
    ├── utils.test.ts       # Unit tests (node:test)
    └── sync.test.ts        # Sync unit tests
```

### Build & Test

```bash
npm run build    # tsc → bin/
npm test         # tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js
```

- TypeScript strict mode, target ES2020, module commonjs
- tsconfig.json: `rootDir: ./src`, `outDir: ./bin`
- Test tsconfig: separate `tsconfig.test.json` outputs to `dist-test/`
- Zero runtime dependencies (Node.js built-in only: fs, path, readline, child_process, https, os, stream)

### Key Constants & Exports (installer.ts)

```typescript
export const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
export const PACKAGE_ROOT = path.resolve(__dirname, '..');

// Shared utilities exported for sync.ts to import:
export { readJson, writeJson, isDirChanged, backup }
export type { Opts }
```

### Opts Interface (shared across all commands)

```typescript
export interface Opts {
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  verbose?: boolean;
  fork?: boolean;
  all?: boolean;
  lang?: string;
  output?: string;
  project?: string;
  limit?: number;
}
```

### Current Preset: presets/user.json

```json
{
  "name": "default",
  "description": "Default user-level Claude Code settings",
  "permissions": {
    "allow": [
      "Read(*)", "Glob(*)", "Grep(*)", "WebSearch", "WebFetch(*)",
      "Task(*)", "TodoWrite(*)", "AskUserQuestion(*)", "Skill(*)",
      "mcp__ide__getDiagnostics"
    ],
    "deny": [
      "Bash(rm -rf:*)", "Bash(git push --force:*)", "Bash(git push -f:*)",
      "Bash(git reset --hard:*)", "Bash(git clean -f:*)",
      "Bash(git checkout -- .:*)", "Bash(git branch -D:*)"
    ]
  },
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "plugin-dev@claude-plugins-official": true,
    "ralph-loop@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "microsoft-docs@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "claude-code-setup@claude-plugins-official": true
  },
  "extraKnownMarketplaces": {
    "claude-plugins-official": {
      "source": { "source": "github", "repo": "anthropics/claude-plugins-official" }
    }
  }
}
```

### Current Preset: presets/project.json

```json
{
  "name": "default",
  "description": "Default project-level permissions for destructive operations",
  "permissions": {
    "allow": ["Write(*)", "Edit(*)", "Bash(*)", "NotebookEdit(*)"]
  }
}
```

### Current Skill Format (SKILL.md)

```yaml
---
name: commit-push
model: sonnet
description: >
  현재 변경사항을 커밋하고 푸시. 커밋 전에 프로젝트에 맞는 린터를 자동 실행하여 깨끗한 코드만 커밋.
  트리거: 커밋 푸쉬해, 커푸, 커밋해, 커밋만해, commit, push
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

## Commit & Push
(... skill body ...)
```

- YAML frontmatter: `name`, `model`, `description`, `allowed-tools`
- Body: Markdown instructions
- Korean variant: `SKILL.ko.md` — same frontmatter, Korean body
- On install: if `--lang=ko`, SKILL.ko.md overwrites SKILL.md; then SKILL.ko.md is deleted from dest

### Current CLAUDE.md Template (presets/claude-md.md)

```markdown
<!-- <cup> — managed by claude-up, do not edit manually -->

## claude-up Skills

Available skills (say the trigger phrase to use):

| Skill | Trigger (EN) | Trigger (KO) |
|-------|-------------|-------------|
| clean-code | clean code, lint | 코드정리해, 린트해 |
(... 13 skills ...)

## Skill Settings
(... settings.local.json usage ...)

## Commit Rules
(... conventional commits ...)

<!-- </cup> -->
```

### Current CLI Routing (cli.ts)

```typescript
// Flag parsing
const opts: Opts = {
  force, yes, json, verbose, fork, all, lang, output, project, limit
};

// Commands → functions
switch (command) {
  case 'init':         runInit(opts);
  case 'install':      runInstall(subcommand, opts);
  case 'project-init': runProjectInit(opts);
  case 'clone':        runClone(opts);
  case 'backup':       runBackup(opts);
  case 'restore':      runRestore(subcommand, opts);
  case 'status':       runStatus(opts);
  case 'doctor':       runDoctor(opts);
  case 'update':       runUpdate(opts);
  case 'sessions':     runSessions(opts);
  case 'resume':       runResume(subcommand, opts);
  case 'uninstall':    runUninstall(opts);
  case 'login':        runLogin(opts);
  case 'push':         runPush(restArgs, opts);
  case 'pull':         runPull(opts);
}
```

### Current Sync Constants (sync.ts)

```typescript
const AUTH_PATH = path.join(CLAUDE_DIR, '.cup-auth');
const GIST_PREFIX = 'cup-skill--';
const MANIFEST_FILE = 'cup-manifest.json';
const SETTINGS_FILE = 'cup-settings.json';
const CLAUDE_MD_FILE = 'cup-claude-md.md';
const CUP_START = '<!-- <cup>';
const CUP_END = '<!-- </cup> -->';
const SYNC_SETTINGS_KEYS = ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'];
```

### Current installer.ts Function Map

| Function | Lines | Purpose | Claude-specific? |
|----------|-------|---------|-----------------|
| `readJson(path)` | 64-67 | Read JSON file | No |
| `writeJson(path, data)` | 69-72 | Write JSON file | No |
| `copyDirRecursive(src, dest)` | 74-85 | Deep copy directory | No |
| `backup(path)` | 87-93 | Create .bak.{timestamp} | No |
| `isDirChanged(src, dest)` | 95-114 | Compare directories | No |
| `loadPreset(name)` | 116-124 | Load from presets/ | No |
| `getAvailableSkills()` | 126-141 | List user-skills/ | No |
| `configureAllow(preset, defaults)` | 145-156 | Interactive allow picker | **Yes** — Claude format |
| `configureDeny(preset, defaults)` | 158-169 | Interactive deny picker | **Yes** — Claude format |
| `configurePlugins(preset, defaults)` | 171-182 | Interactive plugin picker | **Yes** — Claude format |
| `copySkillWithLang(src, dest, lang)` | 184-193 | Copy skill + lang override | Partially — path only |
| `installSkills(defaults, lang)` | 195-223 | Copy skills to ~/.claude/skills | **Yes** — Claude path |
| `installStatusLine(settingsPath, defaults)` | 225-253 | Install status bar | **Yes** — Claude only |
| `runInit(opts)` | 257-326 | Main init flow | **Yes** — Claude pipeline |
| `runInstall(target, opts)` | 330-386 | Install specific component | **Yes** — Claude settings |
| `runProjectInit(opts)` | 390-421 | Project-level setup | **Yes** — .claude/ |
| `runClone(opts)` | 425-459 | Export ~/.claude/ | **Yes** — Claude items |
| `runBackup(opts)` | 463-476 | tar.gz snapshot | **Yes** — ~/.claude/ path |
| `runRestore(source, opts)` | 480-516 | Restore from backup | **Yes** — Claude items |
| `runStatus(opts)` | 520-558 | Show env summary | **Yes** — Claude settings |
| `runDoctor(opts)` | 562-641 | Diagnose issues | **Yes** — Claude checks |
| `runUpdate(opts)` | 645-741 | Check & apply updates | **Yes** — Claude settings |
| `getSessionList(opts)` | 745-798 | Parse .jsonl sessions | **Yes** — Claude format |
| `runSessions(opts)` | 800-817 | Display sessions | **Yes** — Claude format |
| `runResume(id, opts)` | 821-854 | Resume via `claude --resume` | **Yes** — Claude CLI |
| `installClaudeMd(defaults)` | 884-923 | Manage CLAUDE.md cup block | **Yes** — CLAUDE.md |
| `runUninstall(opts)` | 927-1034 | Remove cup from Claude | **Yes** — Claude settings |

### Current sync.ts Function Map

| Function | Purpose | Claude-specific? |
|----------|---------|-----------------|
| `loadAuth()` / `saveAuth()` | Read/write .cup-auth | No (generic) |
| `githubApi()` | GitHub REST client | No (generic) |
| `detectLang()` | Check skill language | **Yes** — ~/.claude/skills path |
| `buildManifest()` | Diff repo vs local skills | **Yes** — paths |
| `extractCupBlock(path)` | Read cup markers from MD | No (generic markers) |
| `applyCupBlock(path, block)` | Write cup markers to MD | No (generic) |
| `runLogin(opts)` | GitHub token setup | No (generic) |
| `runPush(args, opts)` | Upload to Gist | **Yes** — SYNC_SETTINGS_KEYS |
| `runPull(opts)` | Download from Gist | **Yes** — Claude paths/keys |

### Current ui.ts (No changes needed)

All UI functions are provider-agnostic:
- `renderBanner()` — prints "claude-up" title (will change subtitle)
- `renderStep(current, total, label)` — step indicator
- `progressLine(label, action)` — spinner
- `ask(question, defaultYes)` — Y/n prompt
- `checkbox(items)` — interactive multi-select
- `renderSummary(results)` — summary table
- `renderDone()` — completion message

---

## Architecture (To-Be)

### Provider Adapter Pattern

```
src/
├── providers/
│   ├── types.ts          # Provider 인터페이스, 공통 타입, PermissionIntents
│   ├── registry.ts       # detectProviders(), resolveProviders()
│   ├── claude.ts         # ClaudeProvider implements Provider
│   ├── gemini.ts         # GeminiProvider implements Provider
│   └── codex.ts          # CodexProvider implements Provider
├── installer.ts          # Provider 인터페이스를 통해 호출 (기존 로직 리팩토링)
├── sync.ts               # 프로바이더별 키 필터링
├── cli.ts                # --provider 플래그 추가
└── ui.ts                 # renderBanner() subtitle 변경만
```

### Preset Structure

```
presets/
├── common.json           # 공통: 스킬 목록, 권한 인텐트, 지침 블록 참조
├── claude.json           # Claude 전용: permissions (native), enabledPlugins, marketplaces
├── gemini.json           # Gemini 전용: policies (TOML rules), extensions
├── codex.json            # Codex 전용: approval_policy, plugins, features
├── claude-md.md          # CLAUDE.md cup block template (기존 유지)
├── gemini-md.md          # GEMINI.md cup block template (신규)
├── agents-md.md          # AGENTS.md cup block template (신규)
└── project/
    ├── claude.json       # .claude/settings.local.json
    ├── gemini.json       # .gemini/settings.json (project)
    └── codex.json        # .codex/config.toml (project)
```

### Skill Structure (변경)

```
user-skills/
├── commit-push/
│   ├── SKILL.md          # 공통 본문 (frontmatter 없음!)
│   ├── SKILL.ko.md       # 한국어 본문 (frontmatter 없음!)
│   └── meta/
│       ├── claude.yaml   # Claude frontmatter 필드
│       ├── gemini.yaml   # Gemini frontmatter 필드
│       └── codex.yaml    # Codex frontmatter 필드
```

**중요: 마이그레이션 시 기존 SKILL.md의 frontmatter를 meta/claude.yaml로 분리해야 함.**

현재 SKILL.md:
```yaml
---
name: commit-push
model: sonnet
description: >
  ...
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

## Body content...
```

변경 후:

`meta/claude.yaml`:
```yaml
name: commit-push
model: sonnet
description: >
  현재 변경사항을 커밋하고 푸시. 트리거: 커밋 푸쉬해, 커푸, commit, push
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
```

`SKILL.md` (frontmatter 제거, 본문만):
```markdown
## Commit & Push

Commit and push the current changes.
(...)
```

설치 시 `buildSkillContent(body, meta)` 가 frontmatter + body를 조합하여 최종 SKILL.md 생성.

---

## Provider Interface

```typescript
// src/providers/types.ts

export type ProviderName = 'claude' | 'gemini' | 'codex';

export interface Provider {
  // --- Identity ---
  readonly name: ProviderName;
  readonly displayName: string;         // 'Claude Code' | 'Gemini CLI' | 'Codex CLI'
  readonly cliCommand: string;          // 'claude' | 'gemini' | 'codex'

  // --- Paths ---
  readonly homeDir: string;             // ~/.claude | ~/.gemini | ~/.codex
  readonly projectDir: string;          // .claude | .gemini | .codex
  readonly settingsFileName: string;    // settings.json | settings.json | config.toml
  readonly instructionFileName: string; // CLAUDE.md | GEMINI.md | AGENTS.md
  readonly skillsDir: string;           // ~/.claude/skills | (gemini ext) | ~/.agents/skills

  // --- Detection ---
  isInstalled(): boolean;

  // --- Settings ---
  readSettings(): Record<string, unknown> | null;
  writeSettings(data: Record<string, unknown>): void;
  getSettingsPath(): string;
  getProjectSettingsPath(projectRoot: string): string;

  // --- Permissions ---
  mergePermissions(intents: PermissionIntents): void;
  getCurrentPermissions(): { allow: string[]; deny: string[] };

  // --- Plugins / Extensions ---
  enablePlugins(plugins: string[]): void;
  getEnabledPlugins(): string[];
  getAvailablePlugins(): PluginInfo[];

  // --- Skills ---
  installSkill(skillDir: string, skillName: string, lang: string): void;
  getInstalledSkills(): string[];
  buildSkillContent(body: string, meta: Record<string, unknown>): string;
  getSkillMeta(skillName: string): Record<string, unknown> | null;

  // --- Instruction File ---
  getInstructionFilePath(scope: 'global' | 'project'): string;
  getInstructionTemplate(): string;
  readCupBlock(): string | null;
  writeCupBlock(content: string): void;

  // --- Sessions ---
  listSessions(opts: SessionOpts): SessionInfo[];
  resumeSession(id: string, fork?: boolean): void;

  // --- Status Line (optional) ---
  installStatusLine?(): void;
  hasStatusLine?(): boolean;

  // --- Backup ---
  backupSettings(): string | null;
  getBackupExcludes(): string[];

  // --- Init Steps (프로바이더별 설치 단계 정의) ---
  getInitSteps(): InitStep[];
}

export interface InitStep {
  label: string;                         // 'Permissions (allow)'
  execute(useDefaults: boolean): Promise<StepResult>;
}

export interface StepResult {
  ok: boolean;
  label: string;
  detail: string;
}

export interface PermissionIntents {
  allow: string[];   // ['read-files', 'search', 'web-fetch', 'tasks']
  deny: string[];    // ['force-push', 'hard-reset', 'rm-rf', 'branch-delete']
}

export interface PluginInfo {
  id: string;
  name: string;
  description?: string;
}

export interface SessionInfo {
  id: string;
  project: string;
  date: Date;
  size: number;
  firstMessage: string;
}

export interface SessionOpts {
  all?: boolean;
  project?: string;
  limit?: number;
}

export interface SyncKeys {
  settingsKeys: string[];              // 싱크 대상 설정 키 목록
  instructionFileKey: string;          // Gist 파일명 (cup-claude-md.md 등)
}
```

---

## Provider Details

### Claude Code

| 항목 | 값 |
|------|---|
| homeDir | `~/.claude/` |
| projectDir | `.claude/` |
| settingsFile | `settings.json` (JSON) |
| projectSettingsFile | `settings.local.json` |
| instructionFile | `CLAUDE.md` |
| skillsDir | `~/.claude/skills/` |
| configFormat | JSON |
| permissions | `permissions.allow[]` / `permissions.deny[]` (in settings.json) |
| plugins | `enabledPlugins: Record<string, boolean>` + `extraKnownMarketplaces` |
| sessions | `~/.claude/projects/{encoded-path}/*.jsonl` |
| resume | `claude --resume <id>` (fork: `--fork-session`) |
| statusLine | `statusLine: { type: "command", command: "bash ~/.claude/statusline-command.sh" }` |
| syncKeys | `['permissions', 'enabledPlugins', 'extraKnownMarketplaces']` |

**Claude 세션 경로 인코딩**: `/home/user/Workspace/project` → `~/.claude/projects/-home-user-Workspace-project/`

**Claude 세션 JSONL 구조**:
```json
{"type":"user","message":{"content":"hello"}}
{"type":"assistant","message":{"content":"hi"}}
```
- `<local-command-caveat>`, `<command-` 접두어 메시지는 스킵
- 첫 번째 유효한 user message를 `firstMessage`로 사용

### Gemini CLI

| 항목 | 값 |
|------|---|
| homeDir | `~/.gemini/` |
| projectDir | `.gemini/` |
| settingsFile | `settings.json` (JSON) |
| projectSettingsFile | `settings.json` |
| instructionFile | `GEMINI.md` |
| skillsDir | `~/.gemini/extensions/cup/skills/` (cup 전용 확장 디렉토리) |
| configFormat | JSON (settings) + TOML (policies) |
| permissions | `~/.gemini/policies/*.toml` — TOML rule files |
| plugins | Extensions: installed via `gemini extensions install` |
| sessions | TBD (연구 필요 — Gemini CLI 세션 히스토리 경로 확인) |
| resume | TBD |
| statusLine | N/A |
| syncKeys | `['general', 'tools', 'security']` |

**Gemini policy TOML 형식**:
```toml
[[rules]]
toolName = "shell"
argsPattern = "git push.*--force"
decision = "deny"
priority = 500
```

**Gemini settings.json 주요 키**:
```json
{
  "general": { "defaultApprovalMode": "default" },
  "tools": {
    "allowed": ["read_file", "glob", "grep"],
    "exclude": [],
    "sandbox": "docker"
  },
  "security": { "disableYoloMode": true },
  "mcpServers": {}
}
```

**Gemini 스킬 설치**: Extension skill 형태로 `~/.gemini/extensions/cup/skills/` 에 배치.
Gemini extension은 `gemini-extension.json` manifest가 필요할 수 있음.
최소 구현: 스킬 파일만 직접 배치하고, 필요시 extension manifest 생성.

### Codex CLI

| 항목 | 값 |
|------|---|
| homeDir | `~/.codex/` |
| projectDir | `.codex/` |
| settingsFile | `config.toml` (TOML) |
| projectSettingsFile | `config.toml` |
| instructionFile | `AGENTS.md` |
| skillsDir | `~/.agents/skills/` (주의: `~/.codex/`가 아님!) |
| configFormat | TOML |
| permissions | `approval_policy` key + `[permissions.*]` tables in config.toml |
| plugins | `[plugins."name@publisher"]` in config.toml |
| sessions | `~/.codex/log/` (연구 필요) |
| resume | TBD |
| statusLine | N/A |
| syncKeys | `['approval_policy', 'plugins', 'features']` |
| dependency | `smol-toml` 필요 |

**Codex config.toml 주요 구조**:
```toml
model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "live"
personality = "pragmatic"

[features]
shell_tool = true
multi_agent = true
undo = true
codex_hooks = true

[plugins."superpowers@openai-plugins"]
enabled = true

[mcp_servers.example]
command = "npx"
args = ["-y", "some-mcp-server"]
```

**Codex 스킬 형식**: `~/.agents/skills/{name}/SKILL.md` — YAML frontmatter + markdown.
Codex는 `name`, `description` frontmatter를 사용. `allowed-tools`는 별도 파일이나 다른 키일 수 있음.

---

## Permission Intent Mapping

공통 인텐트(intent)를 각 프로바이더 네이티브 포맷으로 변환.

### Allow Intents

| Intent | Claude (settings.json) | Gemini (settings.json tools.allowed) | Codex (config.toml) |
|--------|--------|---------------------|---------------------|
| `read-files` | `"Read(*)"` | `"read_file"` | default in `"on-request"` |
| `search` | `"Glob(*)"`, `"Grep(*)"` | `"glob"`, `"grep"` | default |
| `web-fetch` | `"WebFetch(*)"` | `"web_fetch"` | `web_search = "live"` |
| `web-search` | `"WebSearch"` | (same tool) | `web_search = "live"` |
| `tasks` | `"Task(*)"`, `"TodoWrite(*)"` | N/A | N/A |
| `ask-user` | `"AskUserQuestion(*)"` | N/A (built-in) | N/A (built-in) |
| `skill` | `"Skill(*)"` | N/A (built-in) | N/A |
| `ide-diagnostics` | `"mcp__ide__getDiagnostics"` | N/A | N/A |

### Deny Intents

| Intent | Claude (settings.json deny) | Gemini (policies/*.toml) | Codex (config.toml) |
|--------|--------|---------------------|---------------------|
| `force-push` | `"Bash(git push --force:*)"`, `"Bash(git push -f:*)"` | `toolName="shell", argsPattern="git push.*(--force\|-f)", decision="deny"` | (sandbox enforcement) |
| `hard-reset` | `"Bash(git reset --hard:*)"` | `toolName="shell", argsPattern="git reset.*--hard", decision="deny"` | (sandbox) |
| `rm-rf` | `"Bash(rm -rf:*)"` | `toolName="shell", argsPattern="rm\\s+-rf", decision="deny"` | (sandbox) |
| `branch-delete` | `"Bash(git branch -D:*)"` | `toolName="shell", argsPattern="git branch.*-D", decision="deny"` | (sandbox) |
| `force-checkout` | `"Bash(git checkout -- .:*)"` | `toolName="shell", argsPattern="git checkout.*--\\s*\\.", decision="deny"` | (sandbox) |
| `git-clean` | `"Bash(git clean -f:*)"` | `toolName="shell", argsPattern="git clean.*-f", decision="deny"` | (sandbox) |

**참고**: Codex의 deny 메커니즘은 OS 샌드박스 기반이라 TOML 규칙보다는 `sandbox_mode` 설정에 의존. deny intent 매핑은 가능한 범위에서만 적용.

---

## Registry & Auto-Detection

```typescript
// src/providers/registry.ts

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { Provider, ProviderName } from './types';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { CodexProvider } from './codex';

const ALL_PROVIDERS: Record<ProviderName, () => Provider> = {
  claude: () => new ClaudeProvider(),
  gemini: () => new GeminiProvider(),
  codex:  () => new CodexProvider(),
};

function commandExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/** 설치된 프로바이더 자동감지 */
export function detectProviders(): Provider[] {
  return Object.values(ALL_PROVIDERS)
    .map(factory => factory())
    .filter(p => p.isInstalled());
}

/** --provider 플래그 파싱. 미지정 시 자동감지. */
export function resolveProviders(providerFlag?: string): Provider[] {
  if (!providerFlag) return detectProviders();

  const names = providerFlag.split(',').map(s => s.trim()) as ProviderName[];
  return names.map(name => {
    const factory = ALL_PROVIDERS[name];
    if (!factory) {
      const valid = Object.keys(ALL_PROVIDERS).join(', ');
      throw new Error(`Unknown provider: ${name}. Valid: ${valid}`);
    }
    return factory();
  });
}

/** 특정 프로바이더 이름으로 인스턴스 생성 */
export function getProvider(name: ProviderName): Provider {
  return ALL_PROVIDERS[name]();
}
```

`isInstalled()` 구현 가이드:
- `commandExists('claude')` 또는 `fs.existsSync(homeDir)` → true
- CLI가 없어도 설정 디렉토리가 있으면 설치된 것으로 간주 (이전에 쓴 적 있으므로)

---

## Skill Installation Flow (상세)

### 현재 방식 (Claude only)

```
user-skills/commit-push/SKILL.md  →  ~/.claude/skills/commit-push/SKILL.md
(frontmatter 포함된 완성된 파일을 그대로 복사)
```

### 변경 후 방식 (Multi-provider)

```
1. user-skills/commit-push/SKILL.md 읽기 (본문만, frontmatter 없음)
2. user-skills/commit-push/meta/claude.yaml 읽기
3. provider.buildSkillContent(body, meta) 호출
4. 결과를 provider.skillsDir/commit-push/SKILL.md에 쓰기
```

### buildSkillContent 구현

```typescript
// Claude: YAML frontmatter + body
buildSkillContent(body: string, meta: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, val] of Object.entries(meta)) {
    if (typeof val === 'string' && val.includes('\n')) {
      lines.push(`${key}: >`);
      for (const line of val.split('\n')) lines.push(`  ${line}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

// Gemini: 동일 YAML frontmatter 형식 (키 이름만 다를 수 있음)
// Codex: 동일 YAML frontmatter 형식 (name, description)
```

### meta/claude.yaml 파일 형식

순수 YAML. 파싱은 간단한 key-value로 충분 (중첩 없음):

```yaml
name: commit-push
model: sonnet
description: >
  현재 변경사항을 커밋하고 푸시.
  트리거: 커밋 푸쉬해, 커푸, commit, push
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
```

**YAML 파싱**: 전체 YAML 라이브러리는 불필요. 간단한 key-value + multiline string 파싱으로 충분.
smol-toml은 TOML 전용이므로 YAML 파싱은 직접 구현 (현재 스킬 description 파싱과 동일 수준).

---

## CLI Changes

### Opts 확장

```typescript
export interface Opts {
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  verbose?: boolean;
  fork?: boolean;
  all?: boolean;
  lang?: string;
  output?: string;
  project?: string;
  limit?: number;
  provider?: string;        // 신규: 'claude', 'gemini', 'codex', 'claude,gemini'
}
```

### cli.ts 변경

```typescript
// Flag 추가
provider: getFlag('provider') || undefined,

// Help 텍스트에 --provider 추가
console.log(`  ${style('Global Options', b)}`);
console.log(`    ${style('--provider=<name>', c)}  Target provider (claude,gemini,codex)`);
console.log(`    ${style('', g)}                Auto-detect if omitted`);
```

### Banner 변경 (ui.ts)

```typescript
export function renderBanner(): void {
  const title = 'claude-up';
  const subtitle = 'LLM Environment Bootstrap';  // 변경: Claude Code → LLM
  // ... 나머지 동일
}
```

### Init Flow 변경

```typescript
export async function runInit(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log('  No LLM CLI tools detected. Install Claude Code, Gemini CLI, or Codex CLI first.');
    process.exit(1);
  }

  // 감지된 프로바이더 표시
  console.log(`  Detected: ${providers.map(p => p.displayName).join(', ')}`);

  const useDefaults = opts.yes || await ask('Use defaults? (install everything)', true);
  // ... lang 선택 로직 (기존과 동일)

  for (const provider of providers) {
    console.log(`\n  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);

    const steps = provider.getInitSteps();
    const results: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      renderStep(i + 1, steps.length, steps[i].label);
      const result = await steps[i].execute(useDefaults);
      results.push(result);
    }

    renderSummary(results.map(r => ({ ok: r.ok, label: r.label, detail: r.detail })));
  }

  renderDone();
}
```

### 모든 명령의 Provider 대응

| Command | Multi-provider 동작 |
|---------|---------------------|
| `init` | 각 프로바이더에 대해 순차 실행 |
| `install` | 각 프로바이더에 대해 해당 컴포넌트 설치 |
| `project-init` | 각 프로바이더에 대해 프로젝트 설정 |
| `status` | 각 프로바이더 상태 출력 |
| `doctor` | 각 프로바이더 진단 |
| `update` | 각 프로바이더에 대해 업데이트 |
| `clone` | 각 프로바이더 홈 디렉토리 export |
| `backup` | 각 프로바이더 홈 디렉토리 tar.gz |
| `restore` | 프로바이더 자동감지 후 복원 |
| `sessions` | 각 프로바이더 세션 통합 목록 |
| `resume` | 세션 ID로 프로바이더 자동 판별 후 resume |
| `uninstall` | 각 프로바이더에서 cup 제거 |
| `login` | 변경 없음 (GitHub token, 프로바이더 무관) |
| `push` | 모든 프로바이더 설정 + 스킬 업로드 |
| `pull` | 감지된 프로바이더에 대해 각각 적용 |

---

## Cloud Sync Changes

### Gist 파일 구조 (변경 후)

```
cup-manifest.json                           # { version, providers, skills, lang }
cup-settings--claude.json                   # Claude settings (filtered)
cup-settings--gemini.json                   # Gemini settings (filtered)
cup-settings--codex.toml                    # Codex settings (filtered)
cup-claude-md.md                            # CLAUDE.md cup block
cup-gemini-md.md                            # GEMINI.md cup block
cup-agents-md.md                            # AGENTS.md cup block
cup-skill--commit-push.md                   # 공통 스킬 본문
cup-skill-meta--commit-push--claude.yaml    # Claude 스킬 메타
cup-skill-meta--commit-push--gemini.yaml    # Gemini 스킬 메타
cup-skill-meta--commit-push--codex.yaml     # Codex 스킬 메타
```

### Manifest 확장

```typescript
interface SyncManifest {
  version: string;          // '2' (v1 = Claude only, v2 = multi-provider)
  timestamp: string;
  providers: ProviderName[];
  skills: {
    installed: string[];
    removed: string[];
    modified: string[];
    custom: string[];
  };
  lang: string;
}
```

### 하위 호환

- 기존 `cup-settings.json` (v1) 파일 발견 시 → Claude용으로 간주
- manifest version이 `'1'` 또는 없으면 → 기존 로직 사용
- manifest version이 `'2'`이면 → 멀티 프로바이더 로직 사용

### Provider별 SyncKeys

```typescript
// ClaudeProvider
getSyncKeys(): SyncKeys {
  return {
    settingsKeys: ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'],
    instructionFileKey: 'cup-claude-md.md',
  };
}

// GeminiProvider
getSyncKeys(): SyncKeys {
  return {
    settingsKeys: ['general', 'tools', 'security'],
    instructionFileKey: 'cup-gemini-md.md',
  };
}

// CodexProvider
getSyncKeys(): SyncKeys {
  return {
    settingsKeys: ['approval_policy', 'plugins', 'features'],
    instructionFileKey: 'cup-agents-md.md',
  };
}
```

---

## Preset Files (상세)

### presets/common.json

```json
{
  "permissions": {
    "allow_intents": [
      "read-files",
      "search",
      "web-fetch",
      "web-search",
      "tasks",
      "ask-user",
      "skill",
      "ide-diagnostics"
    ],
    "deny_intents": [
      "force-push",
      "hard-reset",
      "rm-rf",
      "branch-delete",
      "force-checkout",
      "git-clean"
    ]
  },
  "skills": [
    "branch-sync", "clean-code", "clean-ui", "commit-push",
    "doc-structure", "enhance", "merge-branch", "project-sync",
    "ralph-loop-run", "restart-server", "security-audit",
    "setup-workspace", "version-release"
  ]
}
```

### presets/claude.json

기존 `presets/user.json`을 rename. 내용 동일:
```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", ...],
    "deny": ["Bash(rm -rf:*)", ...]
  },
  "enabledPlugins": { ... },
  "extraKnownMarketplaces": { ... }
}
```

### presets/gemini.json (신규)

```json
{
  "settings": {
    "general": {
      "defaultApprovalMode": "default"
    },
    "tools": {
      "allowed": ["read_file", "glob", "grep", "web_fetch", "web_search"],
      "sandbox": "docker"
    },
    "security": {
      "disableYoloMode": true
    }
  },
  "policies": [
    { "toolName": "shell", "argsPattern": "git push.*(--force|-f)", "decision": "deny", "priority": 500 },
    { "toolName": "shell", "argsPattern": "git reset.*--hard", "decision": "deny", "priority": 500 },
    { "toolName": "shell", "argsPattern": "rm\\s+-rf", "decision": "deny", "priority": 500 },
    { "toolName": "shell", "argsPattern": "git clean.*-f", "decision": "deny", "priority": 500 },
    { "toolName": "shell", "argsPattern": "git checkout.*--\\s*\\.", "decision": "deny", "priority": 500 },
    { "toolName": "shell", "argsPattern": "git branch.*-D", "decision": "deny", "priority": 500 }
  ]
}
```

### presets/codex.json (신규)

```json
{
  "settings": {
    "approval_policy": "on-request",
    "sandbox_mode": "workspace-write",
    "web_search": "live",
    "features": {
      "shell_tool": true,
      "multi_agent": true,
      "undo": true,
      "codex_hooks": true
    }
  }
}
```

### presets/project/claude.json

기존 `presets/project.json`을 이동:
```json
{
  "permissions": { "allow": ["Write(*)", "Edit(*)", "Bash(*)", "NotebookEdit(*)"] }
}
```

### presets/project/gemini.json (신규)

```json
{
  "settings": {
    "tools": {
      "allowed": ["write_file", "edit_file", "shell"]
    }
  }
}
```

### presets/project/codex.json (신규)

```json
{
  "settings": {
    "approval_policy": "on-request",
    "sandbox_mode": "workspace-write",
    "sandbox_workspace_write": {
      "network_access": true
    }
  }
}
```

---

## Instruction File Templates

### presets/gemini-md.md (신규)

```markdown
<!-- <cup> — managed by claude-up, do not edit manually -->

## claude-up Skills

Available skills (say the trigger phrase to use):

| Skill | Trigger (EN) | Trigger (KO) |
|-------|-------------|-------------|
| clean-code | clean code, lint | 코드정리해, 린트해 |
| clean-ui | clean ui | UI정리해 |
(... 13 skills, 동일 내용 ...)

## Commit Rules

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Follow the language of existing commit log

<!-- </cup> -->
```

### presets/agents-md.md (신규)

AGENTS.md 용 — 내용은 gemini-md.md와 거의 동일하되, Codex 고유 표현으로 조정.

---

## Migration Plan (Implementation Phases)

### Phase 1: Provider 인터페이스 + Claude 어댑터 추출

**목표**: 기존 동작 100% 유지하면서 구조만 변경.

**파일 변경**:
1. `src/providers/types.ts` 생성 — 위의 인터페이스 정의
2. `src/providers/claude.ts` 생성 — `installer.ts`에서 Claude 종속 로직 추출
3. `src/providers/registry.ts` 생성 — 감지 + 해석 (Claude만)
4. `src/installer.ts` 수정 — Provider 인터페이스를 통해 호출
5. `src/cli.ts` 수정 — `--provider` 플래그 추가 (파싱만, 로직은 기존과 동일)
6. `presets/user.json` → `presets/claude.json` rename
7. `presets/project.json` → `presets/project/claude.json` 이동
8. `presets/common.json` 생성

**검증**: `npm test` 통과 + `cup init --yes` 동작 확인 + `cup doctor` 동작 확인.

**주의사항**:
- `installer.ts`에서 직접 `CLAUDE_DIR`을 참조하던 모든 곳을 `provider.homeDir`로 변경
- `PACKAGE_ROOT`는 유지 (프리셋/스킬 소스 경로)
- `readJson`, `writeJson`, `backup`, `isDirChanged`, `copyDirRecursive`는 유틸리티로 유지
- `sync.ts`가 `installer.ts`에서 import하는 것들(`CLAUDE_DIR`, `readJson` 등)은 별도 `utils.ts`로 분리 권장

### Phase 2: Gemini Provider

**파일 변경**:
1. `src/providers/gemini.ts` 생성
2. `presets/gemini.json` 생성
3. `presets/project/gemini.json` 생성
4. `presets/gemini-md.md` 생성
5. `user-skills/*/meta/gemini.yaml` 생성 (13개)
6. `package.json`에 `smol-toml` 의존성 추가 (정책 TOML 쓰기용)

**검증**: `cup init --provider=gemini --yes` + `cup doctor --provider=gemini`

### Phase 3: Codex Provider

**파일 변경**:
1. `src/providers/codex.ts` 생성
2. `presets/codex.json` 생성
3. `presets/project/codex.json` 생성
4. `presets/agents-md.md` 생성
5. `user-skills/*/meta/codex.yaml` 생성 (13개)

**검증**: `cup init --provider=codex --yes` + `cup doctor --provider=codex`

### Phase 4: Multi-provider Init Flow

**파일 변경**:
1. `src/installer.ts` — 멀티 프로바이더 루프 (위 "Init Flow 변경" 참조)
2. `src/cli.ts` — 모든 커맨드에 `resolveProviders(opts.provider)` 적용
3. `src/ui.ts` — `renderBanner()` subtitle 변경, `renderDone()` 프로바이더별 메시지

**검증**: `cup init` (자동감지) + `cup init --provider=claude,gemini` + `cup status`

### Phase 5: Cloud Sync

**파일 변경**:
1. `src/sync.ts` — 멀티 프로바이더 Gist 구조
2. Manifest v2 형식
3. 하위 호환 로직

**검증**: `cup push` + `cup pull` (기존 v1 Gist 호환 확인)

### Phase 6: 세션 관리

**파일 변경**:
1. 각 프로바이더에 `listSessions()`, `resumeSession()` 구현
2. `installer.ts` — 통합 세션 목록 (프로바이더 컬럼 추가)

**검증**: `cup sessions --all` + `cup resume`

---

## Testing Strategy

### 기존 테스트 유지

- `tests/utils.test.ts` — 유틸리티 함수 테스트 (변경 불필요, 함수가 utils.ts로 이동해도 로직 동일)
- `tests/sync.test.ts` — Gist sync 테스트 (v2 manifest 테스트 추가 필요)

### 신규 테스트

```
tests/
├── utils.test.ts           # 기존 유지
├── sync.test.ts            # v2 manifest + 하위 호환 테스트 추가
├── providers/
│   ├── registry.test.ts    # detectProviders, resolveProviders
│   ├── claude.test.ts      # ClaudeProvider 메서드 테스트
│   ├── gemini.test.ts      # GeminiProvider 메서드 테스트
│   └── codex.test.ts       # CodexProvider 메서드 테스트
├── skill-build.test.ts     # buildSkillContent (meta + body 조합)
└── intent-mapping.test.ts  # PermissionIntents → native 변환
```

**테스트 패턴**: 기존과 동일 — `node:test`, `node:assert/strict`, tmpdir 기반 fixtures.

---

## Dependencies

### 런타임

```json
{
  "dependencies": {
    "smol-toml": "^1.3.0"
  }
}
```

단 하나의 런타임 의존성. Gemini policies TOML 쓰기 + Codex config.toml 읽기/쓰기에 사용.

### YAML 파싱

스킬 meta/*.yaml은 전체 YAML 라이브러리 불필요. 현재 코드에서 이미 하는 수준의 간단한 key-value 파싱:

```typescript
function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = '';
  let multiline = false;
  let multilineValue = '';

  for (const line of content.split('\n')) {
    if (multiline) {
      if (line.startsWith('  ')) {
        multilineValue += (multilineValue ? '\n' : '') + line.slice(2);
        continue;
      } else {
        result[currentKey] = multilineValue.trim();
        multiline = false;
      }
    }
    const match = line.match(/^(\S+):\s*(.*)$/);
    if (match) {
      currentKey = match[1];
      const val = match[2].trim();
      if (val === '>' || val === '|') {
        multiline = true;
        multilineValue = '';
      } else {
        result[currentKey] = val;
      }
    }
  }
  if (multiline) result[currentKey] = multilineValue.trim();
  return result;
}
```

---

## File Impact Summary

| 파일 | 변경 | Phase |
|------|------|-------|
| `src/providers/types.ts` | 신규 — 인터페이스 + 타입 | 1 |
| `src/providers/registry.ts` | 신규 — 감지/해석 | 1 |
| `src/providers/claude.ts` | 신규 — Claude 어댑터 | 1 |
| `src/providers/gemini.ts` | 신규 — Gemini 어댑터 | 2 |
| `src/providers/codex.ts` | 신규 — Codex 어댑터 | 3 |
| `src/installer.ts` | 수정 — Provider 인터페이스 사용 | 1, 4 |
| `src/sync.ts` | 수정 — 멀티 프로바이더 Gist 구조 | 5 |
| `src/cli.ts` | 수정 — `--provider` 플래그 | 1, 4 |
| `src/ui.ts` | 수정 — subtitle 변경 | 4 |
| `presets/common.json` | 신규 | 1 |
| `presets/claude.json` | rename from `presets/user.json` | 1 |
| `presets/gemini.json` | 신규 | 2 |
| `presets/codex.json` | 신규 | 3 |
| `presets/gemini-md.md` | 신규 | 2 |
| `presets/agents-md.md` | 신규 | 3 |
| `presets/project/claude.json` | 이동 from `presets/project.json` | 1 |
| `presets/project/gemini.json` | 신규 | 2 |
| `presets/project/codex.json` | 신규 | 3 |
| `user-skills/*/meta/claude.yaml` | 신규 (13파일) | 1 |
| `user-skills/*/meta/gemini.yaml` | 신규 (13파일) | 2 |
| `user-skills/*/meta/codex.yaml` | 신규 (13파일) | 3 |
| `user-skills/*/SKILL.md` | 수정 — frontmatter 제거 | 1 |
| `user-skills/*/SKILL.ko.md` | 수정 — frontmatter 제거 | 1 |
| `package.json` | 수정 — `smol-toml` 추가, `files` 배열 확인 | 2 |
| `tsconfig.json` | 확인 — providers/ 자동 포함 (src/** 이므로 OK) | 1 |
| `plugin.json` | 변경 없음 (Claude plugin은 그대로) | - |
| `tests/providers/*.test.ts` | 신규 | 1-3 |

---

## Risks & Mitigations

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Gemini/Codex CLI가 빠르게 변경됨 | 어댑터 호환 깨짐 | 어댑터 격리로 변경 범위 최소화. 버전별 분기 가능. |
| 권한 모델 차이가 너무 큼 | 공통 인텐트 매핑 손실 | 네이티브 프리셋 분리로 100% 커버. 인텐트는 best-effort. |
| TOML 라이브러리 유지보수 중단 | 빌드 실패 | smol-toml은 활발, 대안 다수 (iarna/toml, toml-es). |
| 스킬 메타 관리 부담 | 13스킬 x 3프로바이더 = 39 meta 파일 | 기본 메타 템플릿으로 자동 생성하는 스크립트 제공. |
| 세션 포맷 비공개/변경 | resume 구현 불가 | 가능한 범위만 구현, graceful fallback (에러 대신 "not supported" 메시지). |
| Gemini 스킬 경로 불확실 | 설치해도 인식 안 될 수 있음 | 실제 Gemini CLI로 테스트 필수. extension manifest 필요 시 생성. |
| Codex 스킬 경로 `~/.agents/`가 Codex 전용인지 불명 | 다른 도구와 충돌 가능 | Codex 문서 재확인. 필요 시 `~/.codex/skills/`로 대체. |

---

## Out of Scope

- IDE 확장 (VS Code, JetBrains) 통합
- 프로바이더간 세션 마이그레이션
- 멀티 프로바이더 동시 실행 오케스트레이션
- 자체 LLM 프로바이더 구현
- Gemini/Codex plugin manifest 등록 (cup은 Claude plugin만)
- 도구별 고유 기능 (Gemini themes, Codex apps) 관리
