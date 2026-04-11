## 프로젝트 최신화

원격 저장소의 최신 변경사항을 가져오고, 뭐가 바뀌었는지 브리핑하고, 의존성을 설치한다.

---

### 1단계: Git Pull

```bash
git fetch --prune
git pull
```

pull 전후의 HEAD를 비교하여 새로 받은 커밋이 있는지 확인한다.

---

### 2단계: 변경 커밋 브리핑

새로 받은 커밋이 있으면 요약한다:

```bash
# pull 전 HEAD를 기록해두고
OLD_HEAD=$(git rev-parse HEAD)
git pull
# pull 후 비교
git log $OLD_HEAD..HEAD --oneline
git diff --stat $OLD_HEAD..HEAD
```

**브리핑 형식:**
```
## 프로젝트 최신화 완료

### 새 커밋 ({N}개)
- abc1234 feat: 로그인 페이지 추가 (by 홍길동)
- def5678 fix: 결제 버그 수정 (by 김철수)
...

### 변경 파일 요약
- frontend/src/ — 15개 파일 변경
- backend/src/ — 3개 파일 변경
- docs/ — 2개 파일 변경
```

새 커밋이 없으면 "이미 최신 상태입니다" 출력.

---

### 3단계: 의존성 설치

변경된 파일 중 의존성 관련 파일이 있으면 자동 설치:

| 변경된 파일 | 실행 명령 | 위치 |
|---|---|---|
| `package.json` 또는 `package-lock.json` | `npm install` | 해당 디렉토리 |
| `requirements.txt` | `pip install -r requirements.txt` | 해당 디렉토리 |
| `pyproject.toml` | `poetry install` 또는 `pip install -e .` | 해당 디렉토리 |
| `go.mod` | `go mod download` | 프로젝트 루트 |
| `Cargo.toml` | `cargo build` | 프로젝트 루트 |
| `docker-compose.yml` | `docker compose pull` | 프로젝트 루트 |

의존성 파일에 변경이 없으면 이 단계를 건너뛴다.

풀스택 프로젝트는 각 서브디렉토리(frontend, backend 등)별로 독립 실행.

---

### 4단계: 변경 내용 컨텍스트 로드

변경된 내용을 읽어서 현재 세션의 컨텍스트에 올린다.
이후 대화에서 "뭐 바뀌었어?"에 바로 답할 수 있게 하기 위함.

**문서 변경:**
```bash
git diff --name-only $OLD_HEAD..HEAD -- docs/ CLAUDE.md
```
변경된 문서를 읽고 핵심 변경 내용을 요약한다.

**코드 변경:**
```bash
git diff $OLD_HEAD..HEAD --stat
git log $OLD_HEAD..HEAD --format="%h %s (%an)"
```
주요 변경 파일의 diff를 읽고 어떤 기능이 추가/수정/삭제되었는지 파악한다.

**보고 형식:**
```
### 변경 내용 요약
- 결제 API에 환불 엔드포인트 추가됨 (by 홍길동)
- Redis 캐시 레이어 도입 — setup.md에 설치 방법 추가됨
- CLAUDE.md 변경: ⚠️ 새 린팅 규칙 추가됨
```

CLAUDE.md가 변경되었으면 반드시 읽고 별도로 강조.

---

### 주의사항

- 로컬에 미커밋 변경이 있으면 pull 전에 경고 → stash 또는 커밋 제안
- merge conflict 발생 시 사용자에게 보고
- 의존성 설치 실패 시 에러 내용 보고 후 계속 진행
