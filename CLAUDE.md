# oh-my-claude

Claude Code 환경 부트스트랩 + 관리 도구. npm CLI + Claude 플러그인 하이브리드.

## 프로젝트 구조

```
oh-my-claude/
├── bin/cli.js              # CLI 진입점 (모든 로직)
├── package.json            # npm package (bin: oh-my-claude)
├── plugin.json             # Claude 플러그인 매니페스트
├── presets/
│   ├── user.json           # 유저 레벨 설정 (permissions, plugins, marketplaces)
│   └── project.json        # 프로젝트 레벨 설정 (파괴적 권한)
├── user-skills/            # ~/.claude/skills/로 복사되는 유저 스킬
├── project-skills/         # .claude/skills/로 복사되는 프로젝트 스킬
├── commands/               # Claude 플러그인 커맨드 (CLI 래퍼)
└── skills/                 # Claude 플러그인 스킬
```

## 핵심 규칙

- **bin/cli.js**: Zero dependencies. Node.js 내장 모듈만 사용 (fs, path, child_process)
- **CLI 출력**: 영어로 통일
- **user-skills 수정 시**: 저장소 + `~/.claude/skills/` 양쪽 모두 업데이트
- **프리셋 머지 전략**: 프리셋 키만 덮어쓰고 기존 설정의 다른 키(statusLine 등)는 보존
- **스킬 덮어쓰기 정책**: 저장소가 최신 → 덮어쓰기. 로컬에만 있는 스킬은 삭제 안 함
- **백업 필수**: 설정 파일 수정 전 항상 `.bak.{timestamp}` 백업

## CLI 커맨드

```bash
npx github:snow512/oh-my-claude init            # 유저 레벨 설정 + 스킬 복사
npx github:snow512/oh-my-claude project-init     # 프로젝트 레벨 권한 설정
```

## 유저 스킬 (9개)

| 스킬 | 트리거 | 용도 |
|------|--------|------|
| clean-code | 코드정리해 | 프로젝트 감지 → 린팅 → 분석 → 수정 → /simplify |
| commit-push | 커푸, 커밋해 | 린터 → 문서갱신 → 커밋 → 푸시 |
| doc-structure | 문서화해, 문서정리해 | 소스 분석 문서 생성 / 변경 기반 문서 갱신 |
| merge-develop | 디벨롭에 머지해 | 현재 브랜치 → develop 머지 + 삭제 |
| project-directives | (자동 참조) | 매직 커맨드 라우팅 |
| ralph-loop-run | 랄프루프해 | ralph-loop 플러그인으로 반복 실행 |
| restart-server | 서버재기동해 | 프로젝트 유형 감지 → 서버 재시작 |
| setup-worktree | (참조용) | 워크트리 포트 체계 + 설정 가이드 |
| ui-cleanup | 유아이정리해 | UI 코드 품질 점검 + 수정 |

## 스킬 설정 저장

스킬이 프로젝트별 설정을 기억해야 할 때 `.claude/settings.local.json`에 저장:
```json
{
  "permissions": { ... },
  "skills": {
    "clean-code": { "linterDeclined": true },
    "commit-push": { "linterDeclined": true }
  }
}
```

## 커밋 규칙

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- `Co-Authored-By: Claude <noreply@anthropic.com>` 포함
- 커밋 메시지 언어: 프로젝트 기존 로그 따름 (이 프로젝트는 한국어 + 영어 혼용)

## GitHub

- 저장소: https://github.com/snow512/oh-my-claude
- npm publish 예정 (아직 미등록)
