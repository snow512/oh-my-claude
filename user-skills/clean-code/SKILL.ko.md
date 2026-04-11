## 코드정리해

미푸시 커밋 또는 언스테이징 변경 파일을 대상으로 클린코드 작업을 수행한다.
사용자가 "전체"라고 명시하면 프로젝트 전체를 대상으로 한다.

---

### 1단계: 프로젝트 감지

프로젝트 루트에서 아래를 확인하여 기술 스택을 파악한다.

```bash
# 프로젝트 루트
git rev-parse --show-toplevel

# 패키지 매니저 & 설정 파일 확인
ls package.json tsconfig.json .eslintrc* eslint.config.* pyproject.toml Cargo.toml go.mod 2>/dev/null
```

**감지 매트릭스:**

| 파일/디렉토리 | 판별 결과 |
|---------------|----------|
| `tsconfig.json` | TypeScript |
| `package.json` + `.ts`/`.tsx` 파일 | TypeScript (JS 혼용 가능) |
| `package.json` + `.js`/`.jsx` 만 | JavaScript |
| `.eslintrc*` 또는 `eslint.config.*` | ESLint 설정 있음 |
| `frontend/` + `backend/` | 풀스택 (각각 독립 감지) |
| `pyproject.toml` 또는 `requirements.txt` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |

풀스택 프로젝트는 frontend/backend 각각에 대해 독립적으로 감지하고 처리한다.

**빌드/린트 명령 감지:**

`package.json`의 `scripts` 섹션에서 실제 사용 가능한 명령을 확인한다.

```bash
# 린트 명령 확인
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/lint|eslint/)).join(','))"

# 빌드 명령 확인
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/^build$/)).join(','))"

# 테스트 명령 확인
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/^test$/)).join(','))"
```

---

### 2단계: 대상 파일 식별

```bash
# 미푸시 커밋의 변경 파일
git diff --name-only @{upstream}..HEAD 2>/dev/null || git diff --name-only origin/$(git rev-parse --abbrev-ref HEAD)..HEAD 2>/dev/null

# 언스테이징/스테이징 변경 파일
git diff --name-only
git diff --name-only --cached

# 언트래킹 파일
git ls-files --others --exclude-standard
```

- 위 결과를 합쳐 **중복 제거** → 대상 파일 목록
- 제외 대상: `.env`, `*lock*`, `dist/`, `build/`, `node_modules/`, `.next/`, 이미지/폰트 등 바이너리
- 사용자가 **"전체"**를 명시한 경우: `src/` 하위 전체 (또는 프로젝트 구조에 맞는 소스 디렉토리)

---

### 3단계: 린터 실행

프로젝트의 린터 설정을 확인하고 실행한다.

**린터 설정이 없는 경우:**

먼저 `.claude/settings.local.json`의 `skills.clean-code.linterDeclined`를 확인한다.
이전에 거부한 적이 있으면 다시 묻지 않고 린터 단계를 건너뛴다.

처음이라면 사용자에게 설치 여부를 물어본다:
> "이 프로젝트에 린터 설정이 없습니다. 설치할까요? (프로젝트에 맞는 기본 설정으로 세팅합니다)"

사용자가 동의하면:
- JS/TS: `npm init @eslint/config@latest` 실행
- Python: `pip install ruff` + `ruff.toml` 생성
- 설치 후 린터를 실행

사용자가 거부하면:
- `.claude/settings.local.json`에 기록하여 다시 묻지 않음:
  ```json
  { "skills": { "clean-code": { "linterDeclined": true } } }
  ```
- 린터 단계를 건너뛴다

**풀스택 프로젝트 처리:**
frontend와 backend에 각각 린터가 있으면 독립적으로 실행한다.

```bash
# 변경된 TS/JS 파일만 추출
CHANGED_FILES=$(echo "$ALL_FILES" | grep -E '\.(ts|tsx|js|jsx)$')

# 해당 디렉토리에서 ESLint 실행
npx eslint $CHANGED_FILES
```

**ESLint 결과 처리:**
- error가 있으면 → `npx eslint --fix`로 자동 수정 시도 → 재검증
- 자동 수정 불가한 error가 남으면 → 사용자에게 보고
- warning만 있으면 → `npx eslint --fix`로 자동 수정
- 0 errors, 0 warnings → 통과

**기술별 ESLint 참고사항:**
- **React/Next.js**: `react-hooks/exhaustive-deps` warning은 의도적인 경우가 많으므로 무시하지 않되 맥락을 파악
- **NestJS**: 데코레이터가 많아 일부 no-unused-vars 경고가 발생할 수 있음 — DI 패턴을 이해하고 판단
- **Monorepo**: 루트와 패키지 레벨 ESLint 설정이 다를 수 있음 — 가장 가까운 설정 파일 기준으로 실행

---

### 4단계: 코드 분석

대상 파일을 **모두 읽고** 아래 관점으로 분석한다.
Agent 도구를 활용하여 병렬로 분석하면 효율적이다.

#### 체크 항목

| # | 카테고리 | 체크 내용 |
|---|----------|----------|
| 1 | **버그헌팅** | null/undefined 미처리, off-by-one, 비동기 에러 누락, race condition, 메모리 누수 (이벤트 리스너 미해제), 무한 루프 가능성 |
| 2 | **컨벤션** | 네이밍 일관성, 파일/함수 구조, import 순서, 불필요한 주석, 코딩 스타일 통일 |
| 3 | **예방적 수정** | 타입 안전성 부족 (`any` 남용), 경계값 미처리, optional chaining 누락, 빈 배열/객체 방어 |
| 4 | **로그 보강** | catch 블록에 에러 로그 누락, 중요 분기점 디버깅 정보 부재 |
| 5 | **성능** | 불필요한 리렌더링, N+1 쿼리 패턴, 대량 데이터 미페이지네이션 |
| 6 | **보안** | XSS 가능성, SQL 인젝션, 민감정보 노출, 인증/인가 누락 |

**기술별 추가 체크:**

- **React/Next.js**: useEffect 의존성 배열, key prop 누락, 불필요한 리렌더링, Server/Client Component 혼동
- **NestJS**: Guard/Interceptor 누락, DTO validation 미적용, 순환 의존성
- **Express/Fastify**: 미들웨어 순서, 에러 핸들러 누락, async 핸들러 미래핑
- **Python**: type hint 누락, bare except, mutable default argument
- **일반**: 환경변수 하드코딩, 매직 넘버/문자열

---

### 5단계: 발견사항 보고

```
## 코드 정리 분석 결과

프로젝트: {프로젝트 유형} ({감지된 기술 스택})
대상: {N}개 파일

### ESLint ({있으면})
- errors: {N}개 (자동 수정: {M}개)
- warnings: {N}개

### 발견 사항 ({총 건수}건)

#### 🐛 버그헌팅 ({N}건)
- `파일:라인` — 설명 [critical|warning|info]

#### 📐 컨벤션 ({N}건)
...

(발견 건수가 0인 카테고리는 생략)
```

---

### 6단계: 수정 수행

- 보고 후 **사용자 확인 없이** 바로 수정 진행
- 단, `[critical]` 이슈가 있으면 먼저 사용자에게 알리고 수정 방향을 확인
- 수정 시 **기능 변경 없이** 코드 품질만 개선 (동작이 바뀌면 안 됨)

---

### 7단계: /simplify로 중복 코드 제거

수정이 끝난 후 `/simplify` 스킬을 호출하여 추가 정리를 수행한다.
이 단계에서 3개 리뷰 에이전트(코드 재사용, 코드 품질, 효율성)가 병렬로 분석하고 발견된 이슈를 수정한다.

`/simplify`가 발견하는 것들:
- 중복 로직 → 공통 유틸로 추출
- 불필요한 래퍼/추상화 제거
- copy-paste 코드 통합
- 비효율적 패턴 개선

---

### 8단계: 빌드 & 테스트 검증

감지된 프로젝트에 맞는 명령을 실행한다.

```bash
# 빌드 (감지된 명령 사용)
npm run build    # 또는 감지된 빌드 스크립트

# 테스트 (있으면)
npm test         # 또는 감지된 테스트 스크립트
```

빌드/테스트 실패 시 → 수정 내용을 되돌리고 원인 보고.

---

### 9단계: 수정 요약

```
## 코드 정리 완료

프로젝트: {프로젝트 유형}
수정: {N}건 / 스킵: {M}건
ESLint: ✅ {수정}건 자동 수정
/simplify: ✅ {N}건 개선
빌드: ✅ 성공
테스트: ✅ {통과}/{전체} 통과

### 수정 내역
- `파일` — 변경 내용 요약
```

---

### 주의사항

- **기능 변경 금지** — 동작이 달라지는 수정은 하지 않음
- **과도한 리팩토링 금지** — 파일 구조 변경, 대규모 추상화 도입 등은 하지 않음
- **커밋하지 않음** — 수정만 하고 커밋은 사용자가 별도로 요청
- **빌드/테스트 실패 시 롤백** — 수정으로 인해 깨진 것이 있으면 되돌림
- 프로젝트에 ESLint가 없으면 ESLint 단계를 건너뜀 (설치를 강요하지 않음)
- `/simplify`에서 발견한 이슈 중 false positive는 스킵
