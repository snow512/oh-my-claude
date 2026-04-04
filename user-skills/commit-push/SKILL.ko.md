---
name: commit-push
model: sonnet
description: >
  현재 변경사항을 커밋하고 푸시. 커밋 전에 프로젝트에 맞는 린터를 자동 실행하여 깨끗한 코드만 커밋.
  트리거: 커밋 푸쉬해, 커푸, 커밋해, 커밋만해, commit, push
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

## 커밋 & 푸시

현재 작업된 변경사항을 커밋하고 푸시한다.
커밋 전에 프로젝트 유형에 맞는 린터를 자동 실행하여 코드 품질을 검증한다.

### 모드

- **커밋+푸시** (기본): "커푸", "커밋 푸쉬해" → 커밋 후 푸시까지
- **커밋만**: "커밋해", "커밋만해" → 커밋만, 푸시 없음

---

### 1단계: 상태 확인

```bash
git status
git diff --stat
git diff --stat --cached
git log --oneline -5
```

변경사항이 없으면 "Nothing to commit." 출력 후 종료.

---

### 2단계: 프로젝트 감지 & 린터 실행

변경된 파일 중 소스 코드 파일이 있으면 해당 프로젝트의 린터를 실행한다.

**린터 설정이 없는 경우:**
먼저 `.claude/settings.local.json`의 `skills.commit-push.linterDeclined`를 확인한다.
이전에 거부한 적이 있으면 다시 묻지 않고 건너뛴다.

처음이라면 설치 여부를 물어본다. 동의하면 설치 후 실행, 거부하면 `settings.local.json`에 기록:
```json
{ "skills": { "commit-push": { "linterDeclined": true } } }
```

**감지 방법:**

```bash
# 변경된 소스 파일 추출
CHANGED=$(git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard)

# 린터 설정 확인
ls .eslintrc* eslint.config.* 2>/dev/null    # ESLint (JS/TS)
ls pyproject.toml setup.cfg .flake8 2>/dev/null  # Python linters
ls .golangci.yml 2>/dev/null                  # Go
```

**린터 실행 규칙:**

| 프로젝트 유형 | 린터 | 실행 조건 |
|---------------|------|----------|
| JS/TS (ESLint 설정 있음) | `npx eslint <files>` | `.ts`, `.tsx`, `.js`, `.jsx` 변경 시 |
| Python (ruff/flake8 설정 있음) | `ruff check <files>` 또는 `flake8 <files>` | `.py` 변경 시 |
| Go (golangci-lint 설정 있음) | `golangci-lint run <files>` | `.go` 변경 시 |

**풀스택 프로젝트:** 여러 디렉토리에 독립적인 린터 설정이 있으면 각각에서 실행한다. 해당 디렉토리 내의 변경 파일만 전달한다.

**린터 결과 처리:**
- error → `--fix` (또는 해당 린터의 자동 수정 옵션) 시도 → 재검증
- 자동 수정 불가한 error가 남으면 → 사용자에게 보고, **커밋 중단**
- warning만 → 자동 수정 후 진행
- clean → 통과

---

### 3단계: 문서 갱신 (docs/ 폴더가 있는 프로젝트)

`docs/` 폴더가 존재하면 `doc-structure` 스킬의 모드 2(문서 갱신)를 호출한다.
변경된 코드가 문서에 영향을 주는지 분석하고, 필요하면 문서를 수정한다.
수정된 문서 파일은 이후 커밋에 함께 포함된다.

`docs/` 폴더가 없으면 이 단계를 건너뛴다.

---

### 4단계: 커밋

변경 내용을 분석하여 커밋 메시지를 작성한다.

**커밋 메시지 규칙:**
- Conventional Commits prefix: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:` 등
- 간결하게 변경 요약 (1~2줄)
- 변경 범위가 넓으면 body에 주요 변경 사항 나열
- `Co-Authored-By: Claude <noreply@anthropic.com>` 포함

**커밋 메시지 언어:**
- 프로젝트의 기존 커밋 로그 언어를 따른다 (`git log --oneline -10`으로 확인)
- 기존 커밋이 한국어면 한국어, 영어면 영어

**스테이징:**
- `git add`는 변경된 파일만 명시적으로 추가
- `git add -A` 사용 금지 — 의도하지 않은 파일 포함 방지
- 린터 --fix가 수정한 파일도 함께 스테이징

```bash
git add <file1> <file2> ...
git commit -m "$(cat <<'EOF'
feat: commit message here

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### 5단계: 푸시 (커밋+푸시 모드)

"커밋만" 모드가 아닌 경우 `git push`를 실행한다.

```bash
git push
```

리모트가 없거나 upstream이 설정되지 않은 경우:
```bash
git push -u origin $(git rev-parse --abbrev-ref HEAD)
```

---

### 주의사항

- `.env`, `.env.*`, credentials, secrets 등 민감 파일은 커밋하지 않는다
- `package-lock.json`, `yarn.lock` 등 락파일은 변경이 있으면 함께 커밋한다
- 린터 설정이 없으면 린팅을 건너뛴다 (설치를 강요하지 않음)
- force push는 하지 않는다
- pre-commit hook이 실패하면 원인을 파악하고 수정한다 (--no-verify 사용 금지)
