# Deployment

## Branch Strategy

```
feature → develop → qa → main
```

| Branch | Purpose | Merge method |
|--------|---------|--------------|
| `develop` | Active development, daily work | Direct merge from feature |
| `qa` | QA validation (current: direct merge during beta) | Direct merge from develop |
| `main` | Production / published | Direct merge from develop during beta; PR after GA |

**Note**: Currently in beta (`0.1.0-beta`), so direct merges to `qa`/`main` are allowed.
After 1.0 release, switch to PR-based merges for `qa`/`main`.

## Workflow

### Development → QA → Production

1. **Feature work** on `develop`
   ```bash
   git checkout develop
   # make changes, commit
   git push origin develop
   ```

2. **Merge to qa** (for validation)
   ```bash
   git checkout qa
   git pull origin qa
   git merge develop --no-edit
   git push origin qa
   ```

3. **Merge to main** (for release)
   ```bash
   git checkout main
   git pull origin main
   git merge develop --no-edit
   git push origin main
   ```

4. **Publish to npm** (optional, from any branch)
   ```bash
   npm run build
   npm publish
   ```

## Publishing

### Target

- **Registry**: GitHub Packages (`https://npm.pkg.github.com`)
- **Package name**: `@snow512/claude-up`
- **Configured in**: `package.json` → `publishConfig.registry`

### Prerequisites

1. GitHub Personal Access Token (classic) with `write:packages` scope
2. `~/.npmrc` configured:
   ```
   @snow512:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=ghp_xxxxx
   ```
   **Warning**: Never commit `.npmrc` with tokens. `.gitignore` already excludes it.

### Publish steps

```bash
npm run build                # Compile TS → bin/
npm test                     # Run test suite
npm version patch|minor|major  # Bump version in package.json
git push --follow-tags       # Push tag
npm publish                  # Upload to GitHub Packages
```

### Install from GitHub Packages

```bash
# One-time npm config
echo "@snow512:registry=https://npm.pkg.github.com" >> ~/.npmrc

# Install
npm install -g @snow512/claude-up
```

## Environment Variables

claude-up itself has no runtime env vars. It reads from:

| Path | Purpose |
|------|---------|
| `~/.claude/.cup-auth` | GitHub token for cloud sync (chmod 600) |
| `~/.claude/settings.json` | Claude Code settings |
| `~/.gemini/settings.json` | Gemini CLI settings |
| `~/.codex/config.toml` | Codex CLI settings |
| `$LANG`, `$LC_ALL`, `$LANGUAGE` | Skill language auto-detection (ko/en) |

## Pre-release Checklist

Before publishing a new version:

- [ ] `npm run build` — compiles without errors
- [ ] `npm test` — all 51 tests pass
- [ ] `node bin/cli.js doctor` — no errors on Claude, Gemini, Codex
- [ ] `node bin/cli.js --version` — matches `package.json`
- [ ] `CHANGELOG.md` updated (if exists)
- [ ] `README.md` reflects new features
- [ ] No sensitive info in `bin/` output files
- [ ] `.gitignore` includes `.npmrc`, `node_modules/`, `dist-test/`

## Rollback

Rollbacks are done by publishing the previous version as a new version:

```bash
git checkout <previous-commit>
npm run build
npm version patch
npm publish
```

**Do NOT** use `npm unpublish` — GitHub Packages disallows unpublishing within 72 hours and disrupts users.

## Deployment Files

| File | Purpose |
|------|---------|
| `package.json` | Package manifest + `publishConfig` + `files` array |
| `tsconfig.json` | TypeScript compile config (target: bin/) |
| `bin/` | Compiled JS (published to npm) |
| `.gitattributes` | Marks `bin/*.js` as generated (GitHub linguist) |
| `.gitignore` | Excludes `.npmrc`, `node_modules/`, `dist-test/` |

No Docker, no CI/CD workflows configured yet.

## External Services

| Service | Purpose |
|---------|---------|
| GitHub Packages | npm package hosting |
| GitHub Gists | Cloud sync for settings/skills (`cup push`/`pull`) |
| GitHub API | OAuth token validation (`cup login`) |

No databases, no cron, no message queues.
