---
name: restart-server
description: >
  개발 서버 재기동 또는 중지. 프로젝트 유형(Node, Python, Go, Docker 등)을 자동 감지하여
  적절한 방식으로 재시작. 풀스택, 단일 서버, Docker 모두 지원.
  트리거: 서버재기동해, 서버 재시작해, 서버내려, 서버 중지해, restart server, stop server
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

## 서버 재기동 / 중지

현재 프로젝트의 개발 서버를 재기동하거나 중지한다.
프로젝트 유형을 자동 감지하여 적절한 방식으로 처리한다.

- "서버재기동해" → 중지 + 시작
- "서버내려" / "서버 중지해" → 중지만

---

### 1단계: 프로젝트 유형 감지

| 확인 대상 | 판별 결과 |
|-----------|----------|
| `docker-compose.yml` + 서버 코드 | Docker + 로컬 혼합 |
| `docker-compose.yml` 만 | Docker 기반 |
| `backend/` + `frontend/` (또는 `server/` + `client/`) | 풀스택 (분리형) |
| `frontend/` 또는 `client/` 만 | 프론트엔드 전용 |
| `backend/` 또는 `server/` 만 | 백엔드 전용 |
| `package.json` + `dev` 스크립트 | Node.js 단일 |
| `manage.py` 또는 `app.py` 또는 `main.py` | Python (Django/Flask/FastAPI) |
| `go.mod` + `main.go` | Go |
| `Cargo.toml` | Rust |

#### 포트 감지

다음 위치에서 포트 정보를 찾는다:
- `.env`, `backend/.env`, `server/.env`, `frontend/.env`
- `package.json`의 scripts 내 `--port` 플래그
- `docker-compose.yml`의 ports 매핑
- `vite.config.*`의 server.port 설정
- Django `settings.py`, Flask/FastAPI 실행 명령의 포트

---

### 2단계: 기존 프로세스 중지

우선순위 순서로 시도:

1. **`stop.sh` 존재** → `./stop.sh` 실행
2. **Docker** → `docker compose down` 또는 `docker compose stop`
3. **포트 기반** → 감지된 포트를 사용하는 프로세스를 종료
   ```bash
   ss -tlnp | grep :<PORT>
   kill <PID>  # graceful 먼저, 실패 시 kill -9
   ```

"서버내려" 모드면 여기서 종료.

---

### 3단계: 서버 시작

프로젝트 유형에 따라 분기한다.

#### A. 스크립트 기반 (`server.sh` / `client.sh` 존재)

```bash
./server.sh   # 백그라운드
# 5초 대기, 포트 확인
./client.sh   # 백그라운드
# 5초 대기, 포트 확인
```

#### B. Node.js (package.json 기반)

`package.json`의 scripts에서 적절한 dev 명령을 찾아 실행한다.

| 프로젝트 유형 | 실행 명령 |
|--------------|----------|
| 풀스택 (루트 dev가 concurrently) | `npm run dev` |
| 풀스택 (분리형) | 백엔드: `npm run start:dev` 또는 `npm run dev`, 프론트엔드: `npm run dev` |
| 프론트엔드 전용 | `npm run dev` |
| 백엔드 전용 | `npm run start:dev` 또는 `npm run dev` |
| 단일 서버 | `npm start` 또는 `node server.js` |

#### C. Python

| 프레임워크 | 실행 명령 |
|-----------|----------|
| Django | `python manage.py runserver` |
| Flask | `flask run` 또는 `python app.py` |
| FastAPI | `uvicorn main:app --reload` |

#### D. Go

```bash
go run . 또는 go run main.go
```

#### E. Docker

```bash
docker compose up -d
```

Docker + 로컬 서버 조합인 경우 Docker(DB 등) 먼저 올린 후 서버 시작.

---

### 4단계: 구동 확인

감지된 모든 포트가 LISTEN 상태인지 확인한다.

```bash
ss -tlnp | grep :<PORT>
```

```
Server restart complete!
- Backend: port XXXX ✓
- Frontend: port XXXX ✓
```

---

### 5단계: 스크립트 미존재 시 생성 제안

풀스택 프로젝트인데 `server.sh`, `client.sh`, `stop.sh`가 없으면:

> "이 프로젝트에 서버 관리 스크립트가 없습니다. 다음 재기동을 위해 자동 생성할까요?"

동의하면 프로젝트 구조에 맞는 스크립트를 생성한다:
- 감지된 포트 번호, 디렉토리 경로, Docker 사용 여부 반영
- PID 파일 관리 포함
- `chmod +x` 실행 권한 부여

---

### 주의사항

- Docker(DB 등)가 필요한 프로젝트는 Docker를 먼저 실행
- 포트 충돌 시 graceful kill → force kill 순서
- CLI 전용 프로젝트(`bin/` 구조)는 서버가 없으므로 안내 메시지만 출력
