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
