---
name: merge-branch
description: >
  현재 브랜치를 대상 브랜치에 머지 또는 PR 생성. develop은 직접 머지, main/qa는 PR.
  트리거: 머지해, 디벨롭에 머지해, qa에 PR해, 메인에 피알해, PR올려, merge, pull request
allowed-tools: Bash, Read
---

## Branch Merge / PR Creation

Integrate the current branch into a target branch.
Depending on the target branch, take either the **direct merge** or **PR creation** path.

### Determining the target branch

1. Use whatever the user specifies ("merge to main" → `main`, "merge to develop" → `develop`).
2. If not specified, auto-detect:
   ```bash
   git branch -a | grep -qE '(develop|dev)$' && echo develop || echo main
   ```

### Merge vs PR decision

| Target branch | Default approach | Reason |
|--------------|-----------------|--------|
| `main`, `master` | **Create PR** | Protected branch — no direct merge |
| `qa`, `staging`, `release` | **Create PR** | Validation branch — review required |
| `develop`, `dev`, and others | **Direct merge** | Development branch — fast integration |

If the user says "create a PR", always create a PR regardless of the target.

**If the user says "merge" but the target is a PR branch:**
> "{target} is a branch that should be integrated via PR. Do you still want to merge directly?"

If the user agrees, perform a direct merge. If not, create a PR.

---

### Path A: Direct merge (develop, etc.)

1. **Safety checks**:
   - If the current branch is the same as the target → exit.
   - If there are uncommitted changes → call `/commit-push`.

2. **Update the target branch**:
   ```bash
   git checkout <target>
   git pull origin <target>
   ```

3. **Merge**:
   ```bash
   git merge <branch-name> --no-edit
   ```
   On conflict → report to the user and provide `git merge --abort` instructions.

4. **Push**: `git push origin <target>`

5. **Delete the branch** (local + remote):
   ```bash
   git branch -d <branch-name>
   git push origin --delete <branch-name>
   ```

6. **Report result**:
   ```
   ✅ <branch-name> → <target> merge complete
   - Local/remote branch deleted
   ```

---

### Path B: PR creation (main, qa, etc.)

1. **Safety check**: If there are uncommitted changes → call `/commit-push`.

2. **Version & CHANGELOG**: Call the `version-release` skill.
   - Bump the version + update `CHANGELOG.md`.
   - Include the changes in the commit.

3. **Push to remote**: Push the current branch to remote.
   ```bash
   git push -u origin <branch-name>
   ```

4. **Create PR**:
   ```bash
   gh pr create --base <target> --title "<title>" --body "<body>"
   ```
   - Title: auto-generated from the branch name and commit log.
   - Body: includes the latest version section from CHANGELOG.

4. **Report result**:
   ```
   ✅ PR created
   - <PR URL>
   - <branch-name> → <target>
   ```

---

### Notes

- On conflict, do not auto-resolve — report to the user.
- If `gh` CLI is not installed, PR creation is not possible → guide the user to install it.
- Never force-push.
