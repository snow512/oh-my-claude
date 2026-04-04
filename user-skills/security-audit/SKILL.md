---
name: security-audit
description: >
  보안 점검 — 코드 내 하드코딩된 시크릿, .env 노출, 위험한 권한, 누락된 deny 규칙,
  Claude 설정의 과도한 퍼미션까지 점검하고 수정 제안.
  트리거: 보안점검해, 보안검사해, security audit, 시크릿점검, 퍼미션점검해
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
user-invocable: true
---

## Security Audit

Scan both project code and Claude configuration for security vulnerabilities.
Report all findings, then fix them after user confirmation.

---

### Step 1: Scan Code for Secrets

Detect hardcoded passwords, API keys, and tokens in project source files.

```bash
# Target only source code among git-tracked files
git ls-files | grep -vE '(node_modules|dist|build|\.git|\.env\.example)'
```

**Detection Patterns:**

| Type | Example Patterns |
|------|-----------------|
| API keys | `AKIA`, `sk-`, `ghp_`, `gho_`, `glpat-`, `xoxb-`, `xoxp-` |
| Passwords | `password = "..."`, `passwd`, `secret = "..."`, `pwd=` |
| Tokens | `token = "..."`, `Bearer `, `Authorization: Basic` |
| Private keys | `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----` |
| DB connections | `mongodb://...@`, `postgres://...@`, `mysql://...@` (inline passwords) |
| AWS | `aws_access_key_id`, `aws_secret_access_key` with a direct value assigned |

**Exclusions:**
- `.env.example` (empty values or placeholders)
- Explicit dummy values in test fixtures (`test`, `dummy`, `changeme`, `xxx`)
- Environment variable references (`process.env.`, `os.environ`)

---

### Step 2: Check .env Files

```bash
find . -name ".env*" -not -path "*/node_modules/*"
```

| Check | Issue |
|-------|-------|
| `.env` is in `.gitignore` | If missing: **[critical]** — secrets may be committed to git |
| `.env` is committed to git | `git ls-files .env` — if found: **[critical]** |
| `.env.example` exists | If missing: **[warning]** — teammates won't know required variables |
| `.env` contains real production values | If DB host is not localhost: **[warning]** |

---

### Step 3: Audit Claude Configuration Security

Read `~/.claude/settings.json` and `.claude/settings.local.json` and analyze permissions.

#### User Level (`settings.json`)

| Check | Issue |
|-------|-------|
| `Bash(*)` is in allow | **[critical]** — unrestricted bash execution; dangerous at user level |
| `Write(*)` is in allow | **[critical]** — unrestricted file writes at user level is dangerous |
| `rm -rf` variants are in deny | If missing: **[warning]** — destructive commands not blocked |
| `git push --force` is in deny | If missing: **[warning]** — force push not blocked |
| `git reset --hard` is in deny | If missing: **[warning]** — history destruction not blocked |
| Sensitive file reads are in deny | `.env`, `.ssh/id_*`, `.aws/credentials`, etc. |

#### Project Level (`settings.local.json`)

| Check | Issue |
|-------|-------|
| `Bash(*)` is in allow | **[info]** — common at project level, but worth being aware of |
| Overly broad permissions exist | Verify only necessary permissions are granted |

#### Recommended Missing Deny Rules

Compare the current deny list against the recommended list and suggest any missing rules:

```
Recommended deny rules:
- Bash(rm -rf:*)           — recursive deletion
- Bash(git push --force:*) — force push
- Bash(git push -f:*)      — force push (short form)
- Bash(git reset --hard:*) — hard reset
- Bash(git clean -f:*)     — delete untracked files
- Bash(git checkout -- .:*)— discard working changes
- Bash(git branch -D:*)    — force delete branch
- Read(./.env)             — direct env var read
- Read(./.env.*)           — direct env var read
- Read(~/.ssh/id_*)        — SSH keys
- Read(~/.aws/credentials) — AWS credentials
```

---

### Step 4: Dependency Security Audit

Run a security audit appropriate for the project type.

| Project Type | Command |
|-------------|---------|
| Node.js | `npm audit` |
| Python | `pip audit` or `safety check` (if installed) |
| Go | `go vuln check` (if installed) |

Skip this step if no audit tool is available.

---

### Step 5: Report

```
## Security Audit Results

### Critical ({N} issues)
- `src/config.ts:15` — AWS access key hardcoded
- `.env` is not in .gitignore
- `Bash(*)` is in user-level allow in settings.json

### Warning ({N} issues)
- `git push --force` missing from deny
- No sensitive file read blocks in deny
- .env.example file missing

### Info ({N} issues)
- npm audit: 2 moderate vulnerabilities
- `Bash(*)` allowed in settings.local.json (project level)

### Recommended Actions
1. Move AWS key to environment variable
2. Add .env to .gitignore
3. Add 5 suggested deny rules
```

---

### Step 6: Fix

Ask for confirmation before fixing each issue.

- **Hardcoded secrets** → replace with environment variable references + add key names to `.env.example`
- **Missing `.gitignore` entry** → add `.env` to `.gitignore`
- **Missing deny rules** → add deny rules to `settings.json`
- **npm audit fix** → run `npm audit fix` (ask before applying breaking changes)

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

### Notes

- Do not expose values from `.env` files in the report — show key names only.
- Warn that secrets already committed to git remain in history.
- Back up configuration files before adding deny rules.
- False positives are possible — dummy values in test code may be flagged as secrets.
