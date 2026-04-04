---
name: project-sync
description: >
  프로젝트 최신화 — git pull, 변경 커밋 브리핑, 의존성 설치, 변경된 문서 요약까지 한 번에.
  다른 팀원이 뭘 했는지 빠르게 파악하고 바로 개발 시작할 수 있게 해줌.
  트리거: 프로젝트 최신화해, 최신화해, 풀해, pull, sync project, 뭐바뀌었어
allowed-tools: Bash, Read, Glob, Grep
user-invocable: true
---

## Project Sync

Pull the latest changes from the remote, brief what changed, and install dependencies — all in one step.

---

### Step 1: Git Pull

```bash
git fetch --prune
git pull
```

Compare HEAD before and after the pull to check whether new commits were received.

---

### Step 2: Commit Briefing

If new commits were received, summarize them:

```bash
# Record HEAD before pulling
OLD_HEAD=$(git rev-parse HEAD)
git pull
# Compare after pulling
git log $OLD_HEAD..HEAD --oneline
git diff --stat $OLD_HEAD..HEAD
```

**Briefing format:**
```
## Project sync complete

### New commits ({N})
- abc1234 feat: add login page (by John Doe)
- def5678 fix: fix payment bug (by Jane Smith)
...

### Changed files summary
- frontend/src/ — 15 files changed
- backend/src/ — 3 files changed
- docs/ — 2 files changed
```

If there are no new commits, print "Already up to date."

---

### Step 3: Install Dependencies

If any dependency-related files were changed, install automatically:

| Changed file | Command | Location |
|---|---|---|
| `package.json` or `package-lock.json` | `npm install` | That directory |
| `requirements.txt` | `pip install -r requirements.txt` | That directory |
| `pyproject.toml` | `poetry install` or `pip install -e .` | That directory |
| `go.mod` | `go mod download` | Project root |
| `Cargo.toml` | `cargo build` | Project root |
| `docker-compose.yml` | `docker compose pull` | Project root |

Skip this step if no dependency files changed.

For full-stack projects, run independently for each subdirectory (frontend, backend, etc.).

---

### Step 4: Load Change Context

Read the changed content and load it into the current session's context,
so follow-up questions like "what changed?" can be answered immediately.

**Document changes:**
```bash
git diff --name-only $OLD_HEAD..HEAD -- docs/ CLAUDE.md
```
Read changed documents and summarize the key changes.

**Code changes:**
```bash
git diff $OLD_HEAD..HEAD --stat
git log $OLD_HEAD..HEAD --format="%h %s (%an)"
```
Read the diff of key changed files to understand what was added, modified, or removed.

**Report format:**
```
### Change summary
- Refund endpoint added to payment API (by John Doe)
- Redis cache layer introduced — installation instructions added to setup.md
- CLAUDE.md changed: ⚠️ New linting rules added
```

If `CLAUDE.md` was changed, always read it and highlight it separately.

---

### Notes

- If there are uncommitted local changes before pulling, warn the user → suggest stash or commit.
- Report merge conflicts to the user.
- If dependency installation fails, report the error and continue.
