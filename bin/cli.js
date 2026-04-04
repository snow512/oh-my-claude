#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function backup(filePath) {
  try {
    const bakPath = `${filePath}.bak.${timestamp()}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
  } catch {
    return null;
  }
}

function loadPreset(presetPath) {
  const preset = readJson(presetPath);
  if (!preset || !preset.permissions) {
    console.error(`ERROR: ${path.basename(presetPath)} is missing or invalid`);
    process.exit(1);
  }
  return preset;
}

function backupAndLog(filePath) {
  const bakPath = backup(filePath);
  if (bakPath) console.log(`💾 Backup: ${bakPath}`);
}

function copySkills(src, dest) {
  const copied = [];
  try {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirRecursive(path.join(src, entry.name), path.join(dest, entry.name));
      copied.push(entry.name);
    }
  } catch {
    // src directory doesn't exist — no skills to copy
  }
  return copied;
}

function init() {
  console.log('oh-my-claude init\n');

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const preset = loadPreset(path.join(PACKAGE_ROOT, 'presets', 'user.json'));

  backupAndLog(settingsPath);

  const existing = readJson(settingsPath) || {};
  writeJson(settingsPath, {
    ...existing,
    permissions: preset.permissions,
    enabledPlugins: preset.enabledPlugins,
    extraKnownMarketplaces: preset.extraKnownMarketplaces,
  });

  const allowCount = preset.permissions.allow?.length || 0;
  const denyCount = preset.permissions.deny?.length || 0;
  const pluginCount = Object.keys(preset.enabledPlugins || {}).length;

  console.log('\n[Settings]');
  console.log(`  ✅ permissions: ${allowCount} allow, ${denyCount} deny`);
  console.log(`  ✅ enabledPlugins: ${pluginCount}`);
  console.log(`  ✅ marketplaces: ${Object.keys(preset.extraKnownMarketplaces || {}).join(', ')}`);

  const copiedSkills = copySkills(
    path.join(PACKAGE_ROOT, 'user-skills'),
    path.join(CLAUDE_DIR, 'skills'),
  );

  console.log(`\n[User Skills] (${copiedSkills.length})`);
  for (const name of copiedSkills) {
    console.log(`  ✅ ${name}`);
  }

  console.log('\n⚠️  Plugins will be auto-installed on next Claude Code session.');
  console.log('\nDone!');
}

function projectInit() {
  console.log('oh-my-claude project-init\n');

  let projectRoot;
  try {
    projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    projectRoot = process.cwd();
  }

  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const preset = loadPreset(path.join(PACKAGE_ROOT, 'presets', 'project.json'));

  backupAndLog(settingsPath);

  const existing = readJson(settingsPath) || {};
  writeJson(settingsPath, {
    ...existing,
    permissions: preset.permissions,
  });

  console.log(`Project: ${projectRoot}\n`);
  console.log('[Permissions]');
  console.log(`  ✅ allow: ${preset.permissions.allow.join(', ')}`);

  const copiedSkills = copySkills(
    path.join(PACKAGE_ROOT, 'project-skills'),
    path.join(claudeDir, 'skills'),
  );

  if (copiedSkills.length > 0) {
    console.log(`\n[Project Skills] (${copiedSkills.length})`);
    for (const name of copiedSkills) {
      console.log(`  ✅ ${name}`);
    }
  }

  console.log('\nDone!');
}

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
