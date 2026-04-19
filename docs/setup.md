# Setup

## Requirements

- Node.js >= 18
- npm (comes with Node.js)
- One or more LLM CLI tools:
  - [Claude Code](https://claude.ai/claude-code) (`npm i -g @anthropic-ai/claude-code`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`npm i -g @google/gemini-cli`)
  - [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`)

## Install

### Quick (npx)

```bash
npx @snow512/claude-up init
```

### Global install

```bash
npm install -g @snow512/claude-up
cup init
```

### From source

```bash
git clone https://github.com/snow512/claude-up.git
cd claude-up
npm install
npm run build
node bin/cli.js init
```

## Build

```bash
npm run build       # tsc → bin/
npm test            # tsc -p tsconfig.test.json && node --test
```

- TypeScript strict mode
- Target: ES2020, Module: CommonJS
- Source: `src/` → Output: `bin/`
- Tests: `tests/` → Output: `dist-test/`

## CLI Commands

```bash
# Setup
cup init [--provider=claude,gemini,codex] [--yes] [--lang=ko]
cup install <skills|plugins|permissions|statusline|all> [--provider=...] [--force]
cup project-init [--provider=...] [--force]
cup update [--provider=...] [--yes] [--force]

# Sessions
cup sessions [--all] [--project=<name>] [--limit=<n>]
cup resume [id] [--fork]

# Info
cup status [--provider=...] [--json]
cup doctor [--provider=...] [--verbose]

# Environment
cup clone [--provider=...] [--output=<dir>]
cup backup [--type=all|cup] [--provider=...] [--output=<file>]
cup restore [file] [--type=all|cup] [--provider=...] [--force]
cup clean [--provider=...] [--yes]
cup uninstall [--provider=...] [--yes]

# Sync
cup login [--force]
cup push [skills...] [--yes]
cup pull [--provider=...] [--yes]

# Security
cup security                                           # Show security help
cup security init [--level=loose|normal|strict] [--provider=...] [--yes]
cup security check [--provider=...] [--verbose]
cup security diff [--level=...] [--provider=...]

# Guidance
cup guidance                                           # Show guidance help
cup guidance init [--categories=language,scope,design,deployment,commit] [--provider=...] [--yes]
cup guidance list [--provider=...]
cup guidance remove [--categories=...] [--provider=...] [--yes]
```

## Security Levels

`cup security init`로 보안 레벨을 한 번에 설정할 수 있습니다 (기본 `normal`).
`cup init` 실행 시에도 자동으로 normal 레벨이 적용됩니다.

| Level | 용도 |
|-------|------|
| `loose` | 빠른 실험, 토이 프로젝트 |
| `normal` | 일반 개발 (default) |
| `strict` | 프로덕션 코드, 팀 협업 |

`cup security check`로 현재 보안 상태를 점검할 수 있습니다.

## Guidance Categories

`cup guidance init`은 LLM 응답 지침을 user instruction file (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md`) 에 카테고리별 marker block 으로 주입합니다. `cup init` 실행 시 마지막 단계에서 자동 적용 (default: 전체 카테고리).

| Category | 내용 |
|----------|------|
| `language` | Response 언어 규칙 (Korean + selective English) |
| `scope` | 요청 범위 확장 금지; observation vs instruction 구분 |
| `design` | 구조적 문제 발생 시 patch 대신 redesign; identity explicit |
| `deployment` | Production 배포는 명시적 지시 필요 |
| `commit` | Conventional Commits + `Co-Authored-By` |

`cup guidance list`로 현재 적용된 카테고리를 확인할 수 있고, `cup guidance remove --categories=...`로 개별 제거할 수 있습니다. 각 카테고리는 `<!-- <cup-guidance-<id>> --> ... <!-- </cup-guidance-<id>> -->` marker 로 감싸져 있어 다른 섹션과 섞여도 안전하게 관리됩니다.

## Provider Auto-Detection

`--provider` 미지정 시 설치된 도구를 자동감지:

- `which claude` 또는 `~/.claude/` 존재 → Claude
- `which gemini` 또는 `~/.gemini/` 존재 → Gemini
- `which codex` 또는 `~/.codex/` 존재 → Codex

명시적 지정: `cup init --provider=claude,gemini`

## Publishing

```bash
# GitHub Packages (scoped @snow512)
npm publish
```

Registry: `https://npm.pkg.github.com` (configured in `publishConfig`)
