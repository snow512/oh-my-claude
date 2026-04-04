---
name: branch-sync
description: >
  브랜치 양방향 동기화 — 현재 브랜치와 대상 브랜치 사이의 커밋을 양방향으로 맞춘다.
  단방향(가져오기만/보내기만)도 지원. 충돌 시 안전하게 중단.
  트리거: 싱크해, 디벨롭에 싱크해, 브랜치 동기화해, sync, 가져와, 당겨와
allowed-tools: Bash, Read, Glob, Grep
user-invocable: true
---

## Branch Sync

Synchronize commits between the current branch and a target branch.

---

### Sync Modes

| Trigger | Mode | Behavior |
|---------|------|----------|
| "싱크해", "디벨롭에 싱크해" | **Bidirectional** | target → current + current → target |
| "디벨롭 가져와", "당겨와" | **Pull only** | target → current only |
| "디벨롭에 보내", "푸시해" | **Push only** | current → target only (calls merge-branch) |

---

### Determining the Target Branch

1. If the user specifies one explicitly, use it as-is ("디벨롭에 싱크해" → `develop`)
2. If not specified, auto-detect:
   ```bash
   # Use develop if develop/dev exists, otherwise fall back to main
   git branch -a | grep -qE '(develop|dev)$' && echo develop || echo main
   ```

---

### Execution Steps (Bidirectional)

#### Step 1: Pre-flight Check

```bash
git status --porcelain
```

If there are uncommitted changes:
> "There are uncommitted changes. Would you like to commit first, or stash and sync?"
- Commit → call `/commit-push` (commit-only mode)
- Stash → run `git stash`, sync, then `git stash pop`

#### Step 2: target → current (Pull)

```bash
git fetch origin
git merge origin/<target> --no-edit
```

If a conflict occurs:
```
⚠️ Conflict detected while pulling from target
Conflicting files:
- src/app.ts
- src/config.ts

Attempt auto-resolution, or abort?
```
- Abort → `git merge --abort` and exit
- Attempt → try to resolve (abort if resolution fails)

#### Step 3: current → target (Push)

```bash
git push origin <current-branch>

git checkout <target>
git pull origin <target>
git merge <current-branch> --no-edit
git push origin <target>
git checkout <current-branch>
```

Handle conflicts the same way as Step 2.

#### Step 4: Report

```
✅ Branch sync complete

<current-branch> ↔ <target>

Pulled commits: {N}
  - abc1234 feat: add login (by John)
  - ...

Pushed commits: {M}
  - def5678 fix: payment bug (by me)
  - ...
```

---

### Execution Steps (Pull Only)

Perform Step 1 and Step 2 only. Skip Step 3.

---

### Notes

- If a conflict in Step 2 (pull) cannot be resolved during a bidirectional sync, Step 3 (push) is skipped entirely
- Pushing to main/master requires an extra confirmation, even in bidirectional mode
- Never force push
- Uses merge, not rebase — commit history is preserved
