# oh-my-claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** npm CLI + Claude 플러그인 하이브리드로 Claude Code 환경을 부트스트랩하고 관리하는 도구를 만든다.

**Architecture:** `bin/cli.js`에 모든 로직을 담고, Claude 플러그인 커맨드는 CLI를 호출하는 래퍼. 프리셋(JSON)과 유저 스킬(md 파일)을 저장소에 포함하여 복사 기반으로 환경을 복제한다.

**Tech Stack:** Node.js (built-in modules only: fs, path), Claude Code plugin format (markdown skills/commands)

---

## File Structure

```
oh-my-claude/
├── package.json                          # npm package manifest
├── plugin.json                           # Claude plugin manifest
├── bin/
│   └── cli.js                            # CLI entry point + all logic
├── presets/
│   ├── user.json                         # User-level settings preset
│   └── project.json                      # Project-level settings preset
├── user-skills/                          # Skills to copy to ~/.claude/skills/
│   ├── check-progress/SKILL.md
│   ├── claude-permissions/
│   │   ├── SKILL.md
│   │   └── permissions.json
│   ├── clean-code/SKILL.md
│   ├── commit-push/SKILL.md
│   ├── doc-structure/SKILL.md
│   ├── merge-develop/SKILL.md
│   ├── project-directives/SKILL.md
│   ├── ralph-loop-run/SKILL.md
│   ├── restart-server/SKILL.md
│   ├── setup-worktree/SKILL.md
│   └── ui-cleanup/SKILL.md
├── project-skills/
│   └── .gitkeep
├── skills/
│   ├── claude-init.md
│   └── project-init.md
└── commands/
    ├── claude-init.md
    └── project-init.md
```

---

### Task 1: package.json + plugin.json

**Files:**
- Create: `package.json`
- Create: `plugin.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "oh-my-claude",
  "version": "1.0.0",
  "description": "Bootstrap and manage your Claude Code environment — npm CLI + Claude plugin hybrid",
  "bin": {
    "oh-my-claude": "./bin/cli.js"
  },
  "files": [
    "bin/",
    "presets/",
    "user-skills/",
    "project-skills/",
    "plugin.json",
    "skills/",
    "commands/"
  ],
  "keywords": [
    "claude",
    "claude-code",
    "bootstrap",
    "dotfiles",
    "cli"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/psygon/oh-my-claude.git"
  }
}
```

- [ ] **Step 2: Create plugin.json**

```json
{
  "name": "oh-my-claude",
  "version": "1.0.0",
  "description": "Bootstrap and manage your Claude Code environment",
  "skills": [
    "skills/claude-init.md",
    "skills/project-init.md"
  ],
  "commands": [
    "commands/claude-init.md",
    "commands/project-init.md"
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json plugin.json
git commit -m "chore: init package.json and plugin.json"
```

---

### Task 2: Presets

**Files:**
- Create: `presets/user.json`
- Create: `presets/project.json`

- [ ] **Step 1: Create presets/user.json**

현재 `~/.claude/settings.json`에서 추출한 유저 레벨 설정:

```json
{
  "name": "default",
  "description": "Default user-level Claude Code settings",
  "permissions": {
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "WebSearch",
      "WebFetch(*)",
      "Task(*)",
      "TodoWrite(*)",
      "AskUserQuestion(*)",
      "Skill(*)",
      "mcp__ide__getDiagnostics"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git reset --hard:*)",
      "Bash(git clean -f:*)",
      "Bash(git checkout -- .:*)",
      "Bash(git branch -D:*)"
    ]
  },
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "plugin-dev@claude-plugins-official": true,
    "ralph-loop@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "microsoft-docs@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "claude-code-setup@claude-plugins-official": true
  },
  "extraKnownMarketplaces": {
    "claude-plugins-official": {
      "source": {
        "source": "github",
        "repo": "anthropics/claude-plugins-official"
      }
    }
  }
}
```

- [ ] **Step 2: Create presets/project.json**

```json
{
  "name": "default",
  "description": "Default project-level permissions for destructive operations",
  "permissions": {
    "allow": [
      "Write(*)",
      "Edit(*)",
      "Bash(*)",
      "NotebookEdit(*)"
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add presets/
git commit -m "feat: add user and project presets"
```

---

### Task 3: User Skills 복사

**Files:**
- Create: `user-skills/` 디렉토리 (11개 스킬, 각각 원본 그대로 복사)

- [ ] **Step 1: 모든 유저 스킬을 ~/.claude/skills/에서 user-skills/로 복사**

```bash
cp -r ~/.claude/skills/check-progress user-skills/
cp -r ~/.claude/skills/claude-permissions user-skills/
cp -r ~/.claude/skills/clean-code user-skills/
cp -r ~/.claude/skills/commit-push user-skills/
cp -r ~/.claude/skills/doc-structure user-skills/
cp -r ~/.claude/skills/merge-develop user-skills/
cp -r ~/.claude/skills/project-directives user-skills/
cp -r ~/.claude/skills/ralph-loop-run user-skills/
cp -r ~/.claude/skills/restart-server user-skills/
cp -r ~/.claude/skills/setup-worktree user-skills/
cp -r ~/.claude/skills/ui-cleanup user-skills/
```

- [ ] **Step 2: project-skills/.gitkeep 생성**

빈 디렉토리 유지를 위한 `.gitkeep` 파일.

- [ ] **Step 3: 파일 확인**

```bash
find user-skills/ -type f | sort
```

Expected: 12개 파일 (SKILL.md 11개 + permissions.json 1개)

- [ ] **Step 4: Commit**

```bash
git add user-skills/ project-skills/
git commit -m "feat: add user skills and project-skills placeholder"
```

---

### Task 4: bin/cli.js — init 커맨드

**Files:**
- Create: `bin/cli.js`

- [ ] **Step 1: CLI 엔트리포인트 + init 로직 작성**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  let count = 0;
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const bakPath = `${filePath}.bak.${timestamp()}`;
  fs.copyFileSync(filePath, bakPath);
  return bakPath;
}

// --- init command ---

function init() {
  console.log('oh-my-claude init\n');

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const presetPath = path.join(PACKAGE_ROOT, 'presets', 'user.json');
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');

  // 1. Load preset
  const preset = readJson(presetPath);
  if (!preset) {
    console.error('ERROR: presets/user.json not found');
    process.exit(1);
  }

  // 2. Backup existing settings
  const bakPath = backup(settingsPath);
  if (bakPath) console.log(`💾 백업: ${bakPath}`);

  // 3. Merge preset into settings
  const existing = readJson(settingsPath) || {};
  const merged = {
    ...existing,
    permissions: preset.permissions,
    enabledPlugins: preset.enabledPlugins,
    extraKnownMarketplaces: preset.extraKnownMarketplaces,
  };
  writeJson(settingsPath, merged);

  const allowCount = preset.permissions.allow?.length || 0;
  const denyCount = preset.permissions.deny?.length || 0;
  const pluginCount = Object.keys(preset.enabledPlugins || {}).length;

  console.log('\n[설정]');
  console.log(`  ✅ permissions: allow ${allowCount}개, deny ${denyCount}개`);
  console.log(`  ✅ enabledPlugins: ${pluginCount}개`);
  console.log(`  ✅ marketplaces: ${Object.keys(preset.extraKnownMarketplaces || {}).join(', ')}`);

  // 4. Copy user skills
  const copiedSkills = [];
  if (fs.existsSync(skillsSrc)) {
    for (const dir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, dir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const destDir = path.join(skillsDest, dir);
      copyDirRecursive(srcDir, destDir);
      copiedSkills.push(dir);
    }
  }

  console.log(`\n[유저 스킬] (${copiedSkills.length}개)`);
  for (const name of copiedSkills) {
    console.log(`  ✅ ${name}`);
  }

  console.log('\n⚠️  플러그인은 다음 Claude Code 세션 시작 시 자동 설치됩니다.');
  console.log('\n완료!');
}

// --- project-init command ---

function projectInit() {
  console.log('oh-my-claude project-init\n');

  // 1. Find project root
  let projectRoot;
  try {
    projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    projectRoot = process.cwd();
  }

  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const presetPath = path.join(PACKAGE_ROOT, 'presets', 'project.json');
  const skillsSrc = path.join(PACKAGE_ROOT, 'project-skills');
  const skillsDest = path.join(claudeDir, 'skills');

  // 2. Load preset
  const preset = readJson(presetPath);
  if (!preset) {
    console.error('ERROR: presets/project.json not found');
    process.exit(1);
  }

  // 3. Backup existing settings
  const bakPath = backup(settingsPath);
  if (bakPath) console.log(`💾 백업: ${bakPath}`);

  // 4. Merge preset into settings
  const existing = readJson(settingsPath) || {};
  const merged = {
    ...existing,
    permissions: preset.permissions,
  };
  writeJson(settingsPath, merged);

  console.log(`프로젝트: ${projectRoot}\n`);
  console.log('[권한]');
  console.log(`  ✅ allow: ${preset.permissions.allow.join(', ')}`);

  // 5. Copy project skills
  const copiedSkills = [];
  if (fs.existsSync(skillsSrc)) {
    for (const entry of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, entry);
      if (entry === '.gitkeep') continue;
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const destDir = path.join(skillsDest, entry);
      copyDirRecursive(srcDir, destDir);
      copiedSkills.push(entry);
    }
  }

  if (copiedSkills.length > 0) {
    console.log(`\n[프로젝트 스킬] (${copiedSkills.length}개)`);
    for (const name of copiedSkills) {
      console.log(`  ✅ ${name}`);
    }
  }

  console.log('\n완료!');
}

// --- main ---

const command = process.argv[2];

switch (command) {
  case 'init':
    init();
    break;
  case 'project-init':
    projectInit();
    break;
  case '--help':
  case '-h':
  case undefined:
    console.log(`
oh-my-claude — Bootstrap and manage your Claude Code environment

Usage:
  oh-my-claude init            Set up user-level Claude Code settings & skills
  oh-my-claude project-init    Set up project-level permissions & skills
  oh-my-claude --help          Show this help message
`);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "oh-my-claude --help" for usage');
    process.exit(1);
}
```

- [ ] **Step 2: 실행 권한 부여**

```bash
chmod +x bin/cli.js
```

- [ ] **Step 3: 로컬 테스트 — help**

```bash
node bin/cli.js --help
```

Expected:
```
oh-my-claude — Bootstrap and manage your Claude Code environment

Usage:
  oh-my-claude init            Set up user-level Claude Code settings & skills
  oh-my-claude project-init    Set up project-level permissions & skills
  oh-my-claude --help          Show this help message
```

- [ ] **Step 4: 로컬 테스트 — init**

```bash
node bin/cli.js init
```

Expected: settings.json 머지 + 스킬 복사 결과 출력

- [ ] **Step 5: 로컬 테스트 — project-init**

프로젝트 디렉토리에서:
```bash
node bin/cli.js project-init
```

Expected: .claude/settings.local.json 생성 + 권한 적용 결과 출력

- [ ] **Step 6: Commit**

```bash
git add bin/
git commit -m "feat: implement CLI with init and project-init commands"
```

---

### Task 5: Claude Plugin Commands & Skills

**Files:**
- Create: `commands/claude-init.md`
- Create: `commands/project-init.md`
- Create: `skills/claude-init.md`
- Create: `skills/project-init.md`

- [ ] **Step 1: Create commands/claude-init.md**

```markdown
---
name: claude-init
description: 유저 레벨 Claude Code 환경 초기 설정. 트리거: 클로드초기설정해, 환경설정해, setup
allowed-tools: Bash
user-invocable: true
---

유저 레벨 Claude Code 환경을 초기 설정합니다.

`npx oh-my-claude init`를 실행하고 결과를 사용자에게 보여주세요.
```

- [ ] **Step 2: Create commands/project-init.md**

```markdown
---
name: project-init
description: 프로젝트 레벨 권한 및 스킬 초기 설정. 트리거: 프로젝트초기설정해, 프로젝트설정해, 권한설정해
allowed-tools: Bash
user-invocable: true
---

프로젝트 레벨 권한과 스킬을 초기 설정합니다.

`npx oh-my-claude project-init`를 실행하고 결과를 사용자에게 보여주세요.
```

- [ ] **Step 3: Create skills/claude-init.md**

```markdown
---
name: claude-init
description: 유저 레벨 Claude Code 환경 초기 설정 로직 — settings.json 머지, 플러그인 활성화, 유저 스킬 복사
allowed-tools: Bash
user-invocable: false
---

## Claude Code 초기 설정

`npx oh-my-claude init` 명령을 실행하여 유저 레벨 환경을 설정합니다.

### 수행 내용

1. `~/.claude/settings.json`에 permissions, enabledPlugins, marketplaces 적용
2. `~/.claude/skills/`에 유저 스킬 복사
3. 기존 설정은 자동 백업됨

### 실행

```bash
npx oh-my-claude init
```
```

- [ ] **Step 4: Create skills/project-init.md**

```markdown
---
name: project-init
description: 프로젝트 레벨 권한 및 스킬 초기 설정 로직 — settings.local.json에 파괴적 권한 적용
allowed-tools: Bash
user-invocable: false
---

## 프로젝트 초기 설정

`npx oh-my-claude project-init` 명령을 실행하여 프로젝트 레벨 권한을 설정합니다.

### 수행 내용

1. `.claude/settings.local.json`에 Write, Edit, Bash 등 파괴적 권한 적용
2. `.claude/skills/`에 프로젝트 공통 스킬 복사
3. 기존 설정은 자동 백업됨

### 실행

```bash
npx oh-my-claude project-init
```
```

- [ ] **Step 5: Commit**

```bash
git add commands/ skills/
git commit -m "feat: add Claude plugin commands and skills"
```

---

### Task 6: 통합 테스트 + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: npx 로컬 테스트**

```bash
npm link
oh-my-claude --help
oh-my-claude init
oh-my-claude project-init
npm unlink -g oh-my-claude
```

각 명령이 정상 동작하는지 확인.

- [ ] **Step 2: Create README.md**

설치 방법, 커맨드 사용법, 커스터마이징 가이드 포함.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

### Task 7: Git init + 최종 확인

- [ ] **Step 1: Git 저장소 초기화** (아직 안 되어 있으면)

```bash
cd /home/psygon/Workspace/claude-utils-plugin
git init
```

- [ ] **Step 2: .gitignore 생성**

```
node_modules/
*.bak.*
```

- [ ] **Step 3: 전체 파일 구조 확인**

```bash
find . -not -path './.git/*' -not -path './node_modules/*' -not -path './docs/*' | sort
```

Expected output includes all files from the File Structure section above.

- [ ] **Step 4: 최종 init 테스트**

```bash
node bin/cli.js init
```

settings.json이 정상 머지되고, 스킬이 복사되는지 확인.

- [ ] **Step 5: Initial commit** (Task 1-6을 하나로 모으는 경우)

```bash
git add -A
git commit -m "feat: oh-my-claude v1.0.0 — Claude Code environment bootstrap CLI + plugin"
```
