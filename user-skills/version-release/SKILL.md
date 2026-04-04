---
name: version-release
description: >
  버전 관리, CHANGELOG 작성, 릴리즈 노트 생성. 시맨틱 버저닝 정책에 따라 버전 업,
  CHANGELOG.md 자동 생성/갱신. merge-branch에서 qa/main PR 시 자동 호출.
  트리거: 버전업해, 체인지로그, 릴리즈노트, changelog, release note, version up, bump version
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

## Version Management & CHANGELOG

Manage versions following Semantic Versioning (SemVer) and create or update `CHANGELOG.md`.

---

### Version Policy (SemVer)

#### Beta (0.x.x) — Pre-release

| Change Type | Version Bump | Example |
|-------------|-------------|---------|
| Bug fix, minor change | **patch** ↑ | 0.1.0 → 0.1.1 |
| New feature | **minor** ↑ | 0.1.3 → 0.2.0 |
| Breaking change | **minor** ↑ | 0.2.1 → 0.3.0 |

In beta, breaking changes also bump minor — 0.x.x inherently signals "unstable API".

#### Stable (1.x.x+) — Production

| Change Type | Version Bump | Example |
|-------------|-------------|---------|
| Bug fix | **patch** ↑ | 1.2.3 → 1.2.4 |
| New feature (backward-compatible) | **minor** ↑ | 1.2.4 → 1.3.0 |
| Breaking change | **major** ↑ | 1.3.0 → 2.0.0 |

#### Promoting to Stable (0.x → 1.0.0)

If the current version is 0.x.x and the user says "stable release" or "1.0 release", bump to 1.0.0.

---

### Mode 1: Bump Version

Increment the version in `package.json` (or `Cargo.toml`, `pyproject.toml`, etc.).

1. **Read current version** from the project config file.
2. **Analyze changes**: review commit log since the last version tag.
   ```bash
   git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD --oneline
   ```
3. **Decide version bump**:
   - Default: bump **minor**
   - If only `fix:` commits → suggest **patch**
   - If breaking change detected (`feat!:`, `BREAKING CHANGE`) → ask user before bumping **major**
   - If the user specifies explicitly ("patch only", "go major"), follow that.
4. **Update version file**: `package.json`, `Cargo.toml`, etc.
5. **Update CHANGELOG.md** (see format below).
6. **Create git tag**: `v{version}`

---

### Mode 2: Changelog / Release Notes

Create or update `CHANGELOG.md`.

1. **Collect commits**: gather all commits since the last tag.
2. **Categorize**: group by Conventional Commits prefix.
3. **Update CHANGELOG.md**.

#### CHANGELOG.md Format (Keep a Changelog)

```markdown
# Changelog

## [1.3.0] - 2026-04-04

### Added
- Description of new feature

### Changed
- Description of changed behavior

### Fixed
- Description of bug fix

### Removed
- Description of removed feature

## [1.2.4] - 2026-03-28
...
```

**Commit prefix → Category mapping:**

| Prefix | Category |
|--------|----------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:`, `perf:` | Changed |
| `docs:` | (excluded from CHANGELOG) |
| `chore:`, `style:`, `test:` | (excluded from CHANGELOG) |
| `feat!:`, `BREAKING CHANGE` | Changed (breaking) |

`docs`, `chore`, `style`, and `test` have no user-facing impact and are excluded from the CHANGELOG.

---

### Integration with merge-branch

When `/merge-branch` creates a PR to `qa` or `main`, this skill is called automatically:

1. Bump the version and update `CHANGELOG.md`.
2. Include the changes in the commit.
3. Include the CHANGELOG content in the PR body.

---

### Integration with commit-push (auto patch)

If `skills.version-release.autoPatch` is `true` in `.claude/settings.local.json`,
`/commit-push` will automatically bump the patch version.

Default is `false` — on the first "bump version" run, ask the user whether to enable auto-patching.

---

### Notes

- If `CHANGELOG.md` does not exist, create it from scratch.
- If `CHANGELOG.md` already exists, prepend the new version section (preserve existing content).
- Do not overwrite an existing git tag.
- For projects with no version file (pure scripts, etc.), update only `CHANGELOG.md`.
