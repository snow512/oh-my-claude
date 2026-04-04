# oh-my-claude Design Spec

## Overview

Claude Code 환경을 한 번에 셋업하고 지속적으로 관리하는 **npm CLI + Claude 플러그인 하이브리드**.
새 머신에서 `npx oh-my-claude init` 한 번이면 동일한 Claude Code 환경이 복제되고,
Claude 세션 내에서도 `/claude-init`으로 같은 작업을 수행할 수 있다.

## Architecture: Hybrid (npm CLI + Claude Plugin)

**두 진입점, 하나의 로직**

| 진입점 | 사용 시점 | 실행 방법 |
|--------|----------|----------|
| **npm CLI** | 새 머신, Claude Code 없이 | `npx oh-my-claude init` |
| **Claude 플러그인** | Claude 세션 내에서 | `/claude-init` (클로드초기설정해) |

Claude 플러그인 커맨드는 내부에서 `npx oh-my-claude <command>`를 호출하는 얇은 래퍼.
실제 로직은 `bin/cli.js` 한 곳에만 존재하여 코드 중복 없음.

## Project Structure

```
oh-my-claude/
├── package.json                          # npm package (bin: oh-my-claude)
├── plugin.json                           # Claude 플러그인 매니페스트
├── README.md
├── bin/
│   └── cli.js                            # CLI 진입점 + 실제 로직
├── presets/
│   ├── user.json                         # 유저 레벨: permissions + plugins + marketplaces
│   └── project.json                      # 프로젝트 레벨: 파괴적 권한
├── user-skills/                          # ~/.claude/skills/로 복사될 스킬들
│   ├── check-progress/SKILL.md
│   ├── claude-permissions/
│   │   ├── SKILL.md
│   │   └── permissions.json
│   ├── clean-code/SKILL.md
│   ├── commit-push/SKILL.md
│   ├── doc-structure/SKILL.md
│   ├── merge-develop/SKILL.md
│   ├── project-directives/SKILL.md
│   ├── ralph-loop-run/SKILL.md
│   ├── restart-server/SKILL.md
│   ├── setup-worktree/SKILL.md
│   └── ui-cleanup/SKILL.md
├── project-skills/                       # .claude/skills/로 복사될 프로젝트 공통 스킬
│   └── (향후 추가)
├── skills/
│   ├── claude-init.md                    # Claude 플러그인 스킬
│   └── project-init.md                   # Claude 플러그인 스킬
└── commands/
    ├── claude-init.md                    # /claude-init → npx oh-my-claude init
    └── project-init.md                   # /project-init → npx oh-my-claude project-init
```

## npm CLI

### package.json

```json
{
  "name": "oh-my-claude",
  "version": "1.0.0",
  "description": "Bootstrap and manage your Claude Code environment",
  "bin": {
    "oh-my-claude": "./bin/cli.js"
  },
  "files": [
    "bin/",
    "presets/",
    "user-skills/",
    "project-skills/",
    "plugin.json",
    "skills/",
    "commands/"
  ]
}
```

### CLI Commands

```bash
npx oh-my-claude init            # 유저 레벨 초기 설정
npx oh-my-claude project-init    # 프로젝트 레벨 초기 설정
npx oh-my-claude --help          # 도움말
```

### bin/cli.js 로직

순수 Node.js로 작성. 외부 의존성 없음 (fs, path, child_process만 사용).

#### `init` 서브커맨드

1. **현재 상태 확인**: `~/.claude/settings.json` 존재 여부, `~/.claude/skills/` 목록
2. **기존 설정 백업**: `~/.claude/settings.json` → `~/.claude/settings.json.bak.{timestamp}`
3. **프리셋 적용**: `presets/user.json` 읽기 → `~/.claude/settings.json`에 머지
   - 기존 settings.json이 있으면 `permissions`, `enabledPlugins`, `extraKnownMarketplaces` 키만 덮어쓰기
   - 기존 settings.json의 다른 키(statusLine 등)는 보존
4. **유저 스킬 복사**: `user-skills/`의 모든 디렉토리를 `~/.claude/skills/`로 복사
   - 이미 존재하는 스킬은 덮어쓰기 (저장소가 최신)
   - 저장소에 없는 로컬 스킬은 유지 (삭제하지 않음)
5. **결과 출력**

```
oh-my-claude init 완료!

[설정]
  ✅ permissions: allow 10개, deny 7개
  ✅ enabledPlugins: 14개
  ✅ marketplaces: claude-plugins-official
  💾 백업: ~/.claude/settings.json.bak.20260404-123456

[유저 스킬] (11개)
  ✅ commit-push
  ✅ clean-code
  ✅ restart-server
  ✅ claude-permissions
  ...

⚠️  플러그인은 다음 Claude Code 세션 시작 시 자동 설치됩니다.
```

**참고**: `enabledPlugins`를 settings.json에 쓰면 Claude Code가 다음 세션에서 자동으로 설치를 처리한다. CLI에서 별도로 `claude plugin install`을 실행할 필요 없음.

#### `project-init` 서브커맨드

1. **프로젝트 루트 확인**: `git rev-parse --show-toplevel` 또는 현재 디렉토리
2. **`.claude/` 디렉토리 생성**: 없으면 `mkdir -p .claude`
3. **기존 설정 백업**: `.claude/settings.local.json` → `.claude/settings.local.json.bak.{timestamp}`
4. **프리셋 적용**: `presets/project.json` 읽기 → `.claude/settings.local.json`에 머지
   - 기존 파일이 있으면 `permissions` 키만 덮어쓰기, 나머지 보존
5. **프로젝트 스킬 복사**: `project-skills/`의 스킬을 `.claude/skills/`로 복사
6. **결과 출력**

```
oh-my-claude project-init 완료!

프로젝트: /home/user/my-project

[권한]
  ✅ allow: Write(*), Edit(*), Bash(*), NotebookEdit(*)
  💾 백업: .claude/settings.local.json.bak.20260404-123456

[프로젝트 스킬]
  (없음)
```

## Claude Plugin Commands

### /claude-init (클로드초기설정해)

```markdown
---
name: claude-init
description: 유저 레벨 Claude Code 환경 초기 설정 (클로드초기설정해, 환경설정해)
allowed-tools: Bash
---

`npx oh-my-claude init`를 실행하고 결과를 사용자에게 보여준다.
```

### /project-init (프로젝트초기설정해)

```markdown
---
name: project-init
description: 프로젝트 레벨 권한 및 스킬 초기 설정 (프로젝트초기설정해, 프로젝트설정해, 권한설정해)
allowed-tools: Bash
---

`npx oh-my-claude project-init`를 실행하고 결과를 사용자에게 보여준다.
```

## Presets

### presets/user.json

```json
{
  "name": "default",
  "description": "Default user-level Claude Code settings",
  "permissions": {
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "WebSearch",
      "WebFetch(*)",
      "Task(*)",
      "TodoWrite(*)",
      "AskUserQuestion(*)",
      "Skill(*)",
      "mcp__ide__getDiagnostics"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git reset --hard:*)",
      "Bash(git clean -f:*)",
      "Bash(git checkout -- .:*)",
      "Bash(git branch -D:*)"
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
      "source": {
        "source": "github",
        "repo": "anthropics/claude-plugins-official"
      }
    }
  }
}
```

### presets/project.json

```json
{
  "name": "default",
  "description": "Default project-level permissions for destructive operations",
  "permissions": {
    "allow": [
      "Write(*)",
      "Edit(*)",
      "Bash(*)",
      "NotebookEdit(*)"
    ]
  }
}
```

## User Skills (11개)

`user-skills/` 디렉토리에 현재 `~/.claude/skills/`의 스킬 전체를 포함.
각 스킬은 원본 디렉토리 구조를 그대로 유지한다.

| 스킬명 | 파일 | 설명 |
|--------|------|------|
| check-progress | SKILL.md | 진행사항 파악 |
| claude-permissions | SKILL.md, permissions.json | 프로젝트 권한 설정 |
| clean-code | SKILL.md | 코드 정리 |
| commit-push | SKILL.md | 커밋 & 푸시 |
| doc-structure | SKILL.md | 문서 폴더 구조 참조 |
| merge-develop | SKILL.md | develop 머지 |
| project-directives | SKILL.md | 프로젝트 관리 매직 커맨드 |
| ralph-loop-run | SKILL.md | 랄프루프 반복 실행 |
| restart-server | SKILL.md | 서버 재기동 |
| setup-worktree | SKILL.md | 워크트리 설정 가이드 |
| ui-cleanup | SKILL.md | UI 코드 정리 |

## Project Skills

`project-skills/` 디렉토리는 초기에는 비어있다.
프로젝트에 공통으로 필요한 스킬이 생기면 여기에 추가한다.

## Distribution

- **npm**: `npm publish` → 누구나 `npx oh-my-claude init`으로 사용
- **Claude 플러그인**: GitHub 저장소를 마켓플레이스로 등록 또는 로컬 설치
- **커스터마이징**: fork 후 `presets/`와 `user-skills/` 수정

## Design Decisions

1. **Hybrid 구조**: npm CLI가 실제 로직을 담당하고, Claude 플러그인은 얇은 래퍼. 새 머신에서 Claude Code 없이도 부트스트랩 가능 (닭과 달걀 문제 해결).
2. **Zero dependencies**: `bin/cli.js`는 Node.js 내장 모듈(fs, path, child_process)만 사용. `npx`로 즉시 실행 가능.
3. **settings.json 직접 수정**: Claude Code CLI에 settings 관리 명령이 제한적이므로 파일 직접 조작이 가장 확실함.
4. **머지 전략**: 프리셋의 키만 덮어쓰고 기존 설정의 다른 키는 보존. 사용자의 커스텀 설정(statusLine 등)을 날리지 않음.
5. **스킬 덮어쓰기 정책**: 저장소의 스킬이 최신이라고 가정하고 덮어쓰기. 로컬에만 있는 스킬은 삭제하지 않음.
6. **백업 필수**: 기존 설정을 항상 백업 후 적용.
7. **플러그인 설치 위임**: `enabledPlugins`를 settings.json에 쓰면 Claude Code가 다음 세션에서 자동 설치. CLI에서 별도 설치 불필요.
