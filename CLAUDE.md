# oh-my-claude

Claude Code 환경 부트스트랩 + 관리 도구. npm CLI + Claude 플러그인 하이브리드.

## 프로젝트 구조

```
oh-my-claude/
├── bin/
│   ├── cli.js              # CLI 엔트리포인트 (커맨드 라우팅)
│   ├── ui.js               # UI 렌더링 (색상, 배너, 체크박스, 스피너)
│   └── installer.js        # init/project-init/clone/backup/restore/status/doctor/update 로직
├── package.json            # npm package (bin: oh-my-claude, omc)
├── plugin.json             # Claude 플러그인 매니페스트
├── statusline-command.sh   # 커스텀 상태바 스크립트
├── presets/
│   ├── user.json           # 유저 레벨 설정 (permissions, plugins, marketplaces)
│   └── project.json        # 프로젝트 레벨 설정 (파괴적 권한)
├── user-skills/            # ~/.claude/skills/로 복사되는 유저 스킬
├── project-skills/         # .claude/skills/로 복사되는 프로젝트 스킬
├── commands/               # Claude 플러그인 커맨드 (CLI 래퍼)
└── skills/                 # Claude 플러그인 스킬
```

## 핵심 규칙

- **bin/*.js**: Zero dependencies. Node.js 내장 모듈만 사용 (fs, path, readline, child_process)
- **CLI 출력**: 영어로 통일
- **user-skills 수정 시**: 저장소 + `~/.claude/skills/` 양쪽 모두 업데이트
- **프리셋 머지 전략**: 프리셋 키만 덮어쓰고 기존 설정의 다른 키(statusLine 등)는 보존
- **스킬 덮어쓰기 정책**: 저장소가 최신 → 덮어쓰기. 로컬에만 있는 스킬은 삭제 안 함
- **백업 필수**: 설정 파일 수정 전 항상 `.bak.{timestamp}` 백업

## CLI 커맨드

```bash
omc init              # 인터랙티브 환경 설정 (permissions, plugins, skills, statusline)
omc project-init      # 프로젝트 레벨 권한 설정
omc update            # 저장소에서 변경된 스킬만 업데이트
omc status            # 현재 환경 요약 (permissions, plugins, skills)
omc doctor            # 설정 문제 진단
omc clone             # 현재 ~/.claude/ 환경을 포터블 폴더로 추출
omc backup            # ~/.claude/ 전체를 tar.gz 스냅샷
omc restore <file>    # 백업/클론에서 복원
```

별칭: `oh-my-claude` = `omc`

## 유저 스킬 (13개)

| 스킬 | 트리거 | 용도 |
|------|--------|------|
| branch-sync | 싱크해, 가져와 | 브랜치 양방향/단방향 동기화 |
| clean-code | 코드정리해 | 프로젝트 감지 → 린팅 → 분석 → 수정 → /simplify |
| clean-ui | UI정리해 | UI 코드 품질 (접근성, 디자인 토큰, 컴포넌트 패턴) |
| commit-push | 커푸, 커밋해 | 린터 → 문서갱신 → 커밋 → 푸시 |
| doc-structure | 문서화해, 문서정리해 | 소스 분석 문서 생성 / 변경 기반 문서 갱신 |
| enhance | 보강해, 개선해, UI개선해 | 적극적 코드 보강 + UX 개선 + UI 통일성 |
| merge-branch | 머지해, PR올려 | develop 직접 머지 / main·qa는 PR 생성 |
| project-sync | 최신화해, 풀해 | git pull + 커밋 브리핑 + 의존성 설치 + 문서 요약 |
| ralph-loop-run | 랄프루프해 | 종료 조건·횟수 자동 판단 후 반복 실행 |
| restart-server | 서버재기동해, 서버내려 | 프로젝트 유형 감지 → 서버 재시작/중지 |
| security-audit | 보안점검해 | 시크릿 스캔 + .env 점검 + Claude 권한 점검 + 의존성 보안 |
| setup-workspace | 워크스페이스만들어 | 하드 클론 병렬 워크스페이스 (포트 자동 할당) |
| version-release | 버전업해, 체인지로그 | SemVer 버전 관리 + CHANGELOG.md 생성 |

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
