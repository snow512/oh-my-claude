## 병렬 워크스페이스 관리

동일 프로젝트를 여러 디렉토리에 클론하여 독립적으로 병렬 개발한다.
git worktree 대신 하드 클론 방식 — 각 워크스페이스가 완전히 독립된 git 저장소.

### 번들 스크립트

이 스킬은 `scripts/` 디렉토리에 쉘 스크립트를 포함한다:
- `scripts/create-workspace.sh` — 클론 + 포트 할당 + env 세팅 + 의존성 설치
- `scripts/list-workspaces.sh` — 같은 remote를 가진 형제 워크스페이스 목록
- `scripts/detect-ports.sh` — .env 파일에서 포트 정보 추출

---

### 모드 1: 워크스페이스 만들어

```bash
${CLAUDE_SKILL_ROOT}/scripts/create-workspace.sh <워크스페이스명> [브랜치명] [포트오프셋]
```

사용자에게 워크스페이스 이름을 물어보고, 선택적으로 브랜치명을 받는다.
포트 오프셋은 자동 감지 (기존 워크스페이스 수 기반).

**스크립트가 수행하는 작업:**
1. 같은 remote에서 형제 디렉토리로 `git clone`
2. 브랜치 생성/체크아웃
3. 원본 `.env` 파일 복사 후 포트를 오프셋만큼 증가 (base + N*10)
4. Docker 컨테이너/볼륨명에 워크스페이스 접미사 추가
5. `npm install` / `pip install` 등 의존성 설치

**실행 전 확인:**
- 먼저 `scripts/detect-ports.sh`로 현재 포트 상황 파악
- 사용자에게 이름과 포트 대역 확인 후 진행

---

### 모드 2: 워크스페이스 목록

```bash
${CLAUDE_SKILL_ROOT}/scripts/list-workspaces.sh
```

각 워크스페이스의 브랜치, 미커밋 수, 사용 포트를 요약 보고.

---

### 모드 3: 워크스페이스 삭제

"워크스페이스 삭제해"로 사용하지 않는 워크스페이스를 정리.

1. `scripts/list-workspaces.sh`로 목록 표시
2. 사용자에게 삭제할 워크스페이스 확인
3. 미커밋 변경 있으면 경고
4. Docker 정리: `docker compose down -v`
5. 디렉토리 삭제

---

### 주의사항

- 원본 워크스페이스는 삭제하지 않음
- `.env` 파일은 `.gitignore`에 포함되어야 함
- Docker 컨테이너명/볼륨명을 워크스페이스별로 다르게 해야 충돌 방지
