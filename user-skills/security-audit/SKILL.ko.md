## 보안 점검

프로젝트 코드와 Claude 설정 모두를 대상으로 보안 취약점을 점검한다.
발견된 이슈를 보고하고, 사용자 확인 후 수정까지 수행한다.

---

### 1단계: 코드 시크릿 스캔

프로젝트 소스에서 하드코딩된 비밀번호, API 키, 토큰 등을 탐지한다.

```bash
# git 추적 파일 중 소스 코드만 대상
git ls-files | grep -vE '(node_modules|dist|build|\.git|\.env\.example)'
```

**탐지 패턴:**

| 유형 | 패턴 예시 |
|------|----------|
| API 키 | `AKIA`, `sk-`, `ghp_`, `gho_`, `glpat-`, `xoxb-`, `xoxp-` |
| 비밀번호 | `password = "..."`, `passwd`, `secret = "..."`, `pwd=` |
| 토큰 | `token = "..."`, `Bearer `, `Authorization: Basic` |
| 프라이빗 키 | `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----` |
| DB 연결 | `mongodb://...@`, `postgres://...@`, `mysql://...@` (인라인 비밀번호) |
| AWS | `aws_access_key_id`, `aws_secret_access_key` 에 값이 직접 할당 |

**제외 대상:**
- `.env.example` (빈 값 또는 플레이스홀더)
- 테스트 픽스처의 명시적 더미 값 (`test`, `dummy`, `changeme`, `xxx`)
- 환경변수 참조 (`process.env.`, `os.environ`)

---

### 2단계: .env 파일 점검

```bash
find . -name ".env*" -not -path "*/node_modules/*"
```

| 체크 | 이슈 |
|------|------|
| `.env`가 `.gitignore`에 있는지 | 없으면 **[critical]** — 시크릿이 git에 커밋될 수 있음 |
| `.env`가 git에 커밋되었는지 | `git ls-files .env` — 있으면 **[critical]** |
| `.env.example` 존재 여부 | 없으면 **[warning]** — 팀원이 필요한 변수를 모름 |
| `.env`에 실제 프로덕션 값이 있는지 | DB 호스트가 localhost가 아닌 실제 서버면 **[warning]** |

---

### 3단계: Claude 설정 보안 점검

`~/.claude/settings.json`과 `.claude/settings.local.json`을 읽고 권한을 분석한다.

#### 유저 레벨 (`settings.json`)

| 체크 | 이슈 |
|------|------|
| `Bash(*)` 가 allow에 있는지 | **[critical]** — 모든 bash 명령 무제한 허용. 유저 레벨에서는 위험 |
| `Write(*)` 가 allow에 있는지 | **[critical]** — 유저 레벨에서 모든 파일 쓰기 허용은 위험 |
| deny에 `rm -rf` 계열이 있는지 | 없으면 **[warning]** — 파괴적 명령 미차단 |
| deny에 `git push --force` 가 있는지 | 없으면 **[warning]** — force push 미차단 |
| deny에 `git reset --hard` 가 있는지 | 없으면 **[warning]** — 히스토리 파괴 미차단 |
| deny에 민감파일 읽기가 있는지 | `.env`, `.ssh/id_*`, `.aws/credentials` 등 |

#### 프로젝트 레벨 (`settings.local.json`)

| 체크 | 이슈 |
|------|------|
| `Bash(*)` 가 allow에 있는지 | **[info]** — 프로젝트 레벨에서는 일반적이지만 인지 필요 |
| 과도하게 넓은 권한이 있는지 | 필요한 것만 열어뒀는지 체크 |

#### 누락된 deny 규칙 추천

현재 deny 목록과 권장 목록을 비교하여 누락된 규칙을 제안한다:

```
권장 deny 규칙:
- Bash(rm -rf:*)           — 재귀 삭제
- Bash(git push --force:*) — force push
- Bash(git push -f:*)      — force push (단축)
- Bash(git reset --hard:*) — hard reset
- Bash(git clean -f:*)     — untracked 파일 삭제
- Bash(git checkout -- .:*)— 작업 내용 폐기
- Bash(git branch -D:*)    — 브랜치 강제 삭제
- Read(./.env)             — 환경변수 직접 읽기
- Read(./.env.*)           — 환경변수 직접 읽기
- Read(~/.ssh/id_*)        — SSH 키
- Read(~/.aws/credentials) — AWS 인증
```

---

### 4단계: 의존성 보안 점검

프로젝트에 맞는 보안 감사를 실행한다.

| 프로젝트 유형 | 명령 |
|---|---|
| Node.js | `npm audit` |
| Python | `pip audit` 또는 `safety check` (설치되어 있으면) |
| Go | `go vuln check` (설치되어 있으면) |

감사 도구가 없으면 이 단계를 건너뛴다.

---

### 5단계: 보고

```
## 보안 점검 결과

### 🔴 Critical ({N}건)
- `src/config.ts:15` — AWS access key 하드코딩
- `.env`가 .gitignore에 없음
- settings.json에 Bash(*) 가 유저 레벨 allow에 있음

### 🟡 Warning ({N}건)
- deny에 `git push --force` 누락
- deny에 민감파일 읽기 차단 없음
- .env.example 파일 없음

### 🔵 Info ({N}건)
- npm audit: 2 moderate vulnerabilities
- settings.local.json에 Bash(*) 허용 (프로젝트 레벨)

### 추천 조치
1. AWS key를 환경변수로 이동
2. .gitignore에 .env 추가
3. deny 규칙 5개 추가 제안
```

---

### 6단계: 수정

각 이슈에 대해 수정 여부를 물어보고 수행한다.

- **시크릿 하드코딩** → 환경변수 참조로 교체 + `.env.example`에 키 이름 추가
- **`.gitignore` 누락** → `.gitignore`에 `.env` 추가
- **deny 규칙 누락** → `settings.json`에 deny 규칙 추가
- **npm audit fix** → `npm audit fix` 실행 (breaking change는 물어봄)

```
Fix critical issues? [Y/n]: y
  ✓ Moved AWS key to environment variable
  ✓ Added .env to .gitignore
  ✓ Added 5 deny rules to settings.json

Fix warnings? [y/N]: y
  ✓ Created .env.example
  ✓ Ran npm audit fix (2 vulnerabilities fixed)
```

---

### 주의사항

- `.env` 파일 내용은 보고서에 값을 노출하지 않음 (키 이름만 표시)
- git에 이미 커밋된 시크릿은 히스토리에 남아있음을 경고
- deny 규칙 추가 시 기존 설정을 백업 후 수정
- false positive 가능 — 테스트 코드의 더미 값을 시크릿으로 오탐할 수 있음
