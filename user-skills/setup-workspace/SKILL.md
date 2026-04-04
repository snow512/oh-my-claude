---
name: setup-workspace
description: >
  병렬 개발용 워크스페이스 생성 및 관리. 동일 프로젝트를 하드 클론하여 독립 환경으로 구성.
  포트 충돌 방지, .env 자동 세팅, 의존성 설치까지 한 번에 처리.
  트리거: 워크스페이스만들어, 워크스페이스설정해, setup workspace, new workspace, 병렬개발
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
user-invocable: true
---

## 병렬 워크스페이스 관리

동일 프로젝트를 여러 디렉토리에 클론하여 독립적으로 병렬 개발한다.
git worktree 대신 하드 클론 방식 — 각 워크스페이스가 완전히 독립된 git 저장소.

---

### 모드 1: 워크스페이스 만들어

새 워크스페이스를 생성한다.

#### 1단계: 현재 프로젝트 분석

```bash
# 프로젝트 루트 & 리모트 URL
git rev-parse --show-toplevel
git remote get-url origin

# 현재 디렉토리명에서 프로젝트명 추출
basename $(git rev-parse --show-toplevel)

# 기존 워크스페이스 확인 (형제 디렉토리)
ls -d ../$(basename $(pwd))* 2>/dev/null
```

#### 2단계: 워크스페이스 이름 결정

기존 워크스페이스를 확인하고 다음 이름을 제안한다:

| 기존 | 새 워크스페이스 |
|------|---------------|
| `my-project` | `my-project-ws2` |
| `my-project`, `my-project-ws2` | `my-project-ws3` |

사용자가 이름을 지정하면 그대로 사용.

#### 3단계: 클론

```bash
git clone <remote-url> ../<새 워크스페이스명>
cd ../<새 워크스페이스명>
git checkout -b <브랜치명>  # 사용자가 지정하면
```

#### 4단계: 포트 할당

포트 충돌을 방지하기 위해 워크스페이스 번호에 따라 포트 대역을 자동 할당한다.

**포트 규칙: `{base} + (N * 10)`**

기존 워크스페이스의 `.env`에서 사용 중인 포트를 확인하고, 충돌하지 않는 다음 대역을 할당.

예시 (base=3000):
| 워크스페이스 | FE | BE | DB |
|-------------|------|------|------|
| 원본 | 3000 | 3001 | 3002 |
| ws2 | 3010 | 3011 | 3012 |
| ws3 | 3020 | 3021 | 3022 |

실제 base 포트는 프로젝트의 기존 `.env`에서 감지한다.

#### 5단계: .env 파일 세팅

원본 워크스페이스의 `.env` 파일들을 복사하고 포트만 변경한다.

```bash
# 루트, backend, frontend 등 모든 .env 파일 찾기
find . -name ".env" -not -path "*/node_modules/*"
```

각 `.env` 파일에서 포트 관련 값을 새 대역으로 치환:
- `PORT=`, `DB_PORT=`, `VITE_PORT=` 등 포트 변수
- `CORS_ORIGIN`, `VITE_API_URL` 등 URL에 포함된 포트
- Docker 컨테이너명, 볼륨명, 네트워크명 — 워크스페이스별로 고유하게

#### 6단계: 의존성 설치 & 초기화

프로젝트 유형에 맞게 자동 실행:

```bash
# Node.js
npm install  # 또는 각 서브디렉토리별로

# Python
pip install -r requirements.txt  # 또는 poetry install

# Docker
docker compose up -d  # DB 등 인프라

# 시드 데이터 (있으면)
npm run seed  # 또는 프로젝트에 맞는 시드 명령
```

#### 7단계: 결과 보고

```
Workspace created!

- Path: ../<워크스페이스명>
- Branch: <브랜치명>
- Ports: FE <port>, BE <port>, DB <port>
- Dependencies: ✅ installed
- Docker: ✅ running (or N/A)

To start developing:
  cd ../<워크스페이스명>
```

---

### 모드 2: 워크스페이스 목록

"워크스페이스 목록" 또는 "워크스페이스 확인해"로 현재 프로젝트의 모든 워크스페이스를 확인.

```bash
# 형제 디렉토리 중 같은 remote를 가진 것 찾기
REMOTE=$(git remote get-url origin)
for dir in ../*; do
  if [ -d "$dir/.git" ] && git -C "$dir" remote get-url origin 2>/dev/null | grep -q "$REMOTE"; then
    echo "$dir"
  fi
done
```

각 워크스페이스의 브랜치, 포트, 상태를 요약 보고.

---

### 모드 3: 워크스페이스 삭제

"워크스페이스 삭제해"로 사용하지 않는 워크스페이스를 정리.

1. Docker 컨테이너/볼륨 정리: `docker compose down -v`
2. 디렉토리 삭제 전 미커밋 변경 확인 → 있으면 경고
3. 사용자 확인 후 삭제

---

### 주의사항

- 원본 워크스페이스는 삭제하지 않음
- `.env` 파일은 `.gitignore`에 포함되어야 함 (커밋 안 됨)
- Docker 컨테이너명/볼륨명/네트워크명을 워크스페이스별로 다르게 해야 충돌 방지
- 각 워크스페이스는 독립 git 저장소이므로 브랜치/커밋이 서로 영향 없음
