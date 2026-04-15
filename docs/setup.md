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
