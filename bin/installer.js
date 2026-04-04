'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderBanner, renderStep, progressLine, ask, checkbox, renderSummary, renderDone } = require('./ui');

const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// --- Utilities ---

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
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
    if (entry.isDirectory()) { count += copyDirRecursive(srcPath, destPath); }
    else { fs.copyFileSync(srcPath, destPath); count++; }
  }
  return count;
}

function backup(filePath) {
  try {
    const bakPath = `${filePath}.bak.${timestamp()}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
  } catch { return null; }
}

function loadPreset(name) {
  const presetPath = path.join(PACKAGE_ROOT, 'presets', name);
  const preset = readJson(presetPath);
  if (!preset || !preset.permissions) {
    console.error(`ERROR: ${name} is missing or invalid`);
    process.exit(1);
  }
  return preset;
}

function getAvailableSkills() {
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  try {
    return fs.readdirSync(skillsSrc, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        let desc = '';
        try {
          const content = fs.readFileSync(path.join(skillsSrc, e.name, 'SKILL.md'), 'utf-8');
          const match = content.match(/description:\s*>?\s*\n?\s*(.+)/);
          if (match) desc = match[1].trim().slice(0, 50);
        } catch {}
        return { name: e.name, desc: desc || '(no description)' };
      });
  } catch { return []; }
}

// --- Step 1: Settings ---

async function applySettings(settingsPath, useDefaults) {
  const preset = loadPreset('user.json');
  const bakPath = backup(settingsPath);

  const existing = readJson(settingsPath) || {};
  const merged = {
    ...existing,
    permissions: preset.permissions,
    enabledPlugins: preset.enabledPlugins,
    extraKnownMarketplaces: preset.extraKnownMarketplaces,
  };

  const allowCount = preset.permissions.allow?.length || 0;
  const denyCount = preset.permissions.deny?.length || 0;
  const pluginCount = Object.keys(preset.enabledPlugins || {}).length;

  await progressLine(`Applying permissions (${allowCount} allow, ${denyCount} deny)`, () => {
    writeJson(settingsPath, merged);
  });

  await progressLine(`Enabling plugins (${pluginCount})`, () => {});
  await progressLine('Configuring marketplaces', () => {});

  if (bakPath) {
    const { C, style } = require('./ui');
    console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + bakPath, C.gray)}`);
  }

  return {
    ok: true,
    label: 'Settings',
    detail: `${allowCount} allow, ${denyCount} deny, ${pluginCount} plugins`,
  };
}

// --- Step 2: User Skills ---

async function installSkills(useDefaults) {
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');
  const available = getAvailableSkills();

  if (available.length === 0) {
    return { ok: false, label: 'Skills', detail: 'no skills found' };
  }

  let selectedNames;

  if (useDefaults) {
    selectedNames = available.map(s => s.name);
    await progressLine(`Installing all ${available.length} skills`, () => {
      for (const name of selectedNames) {
        copyDirRecursive(path.join(skillsSrc, name), path.join(skillsDest, name));
      }
    });
  } else {
    console.log('');
    selectedNames = await checkbox(available);
    for (const name of selectedNames) {
      copyDirRecursive(path.join(skillsSrc, name), path.join(skillsDest, name));
    }
    console.log(`  ${require('./ui').style('✓', require('./ui').C.green)} ${selectedNames.length} skills installed`);
  }

  return {
    ok: true,
    label: 'Skills',
    detail: `${selectedNames.length}/${available.length} installed`,
  };
}

// --- Step 3: Status Line ---

async function installStatusLine(settingsPath, useDefaults) {
  const statuslineSrc = path.join(PACKAGE_ROOT, 'statusline-command.sh');
  const statuslineDest = path.join(CLAUDE_DIR, 'statusline-command.sh');

  if (!fs.existsSync(statuslineSrc)) {
    return { ok: false, label: 'Status Line', detail: 'not available' };
  }

  let install = useDefaults;

  if (!useDefaults) {
    const alreadyExists = fs.existsSync(statuslineDest);
    const q = alreadyExists ? 'Status line exists. Overwrite?' : 'Install custom status line?';
    install = await ask(q, true);
  }

  if (install) {
    await progressLine('Installing status line', () => {
      fs.copyFileSync(statuslineSrc, statuslineDest);
      fs.chmodSync(statuslineDest, 0o755);

      const currentSettings = readJson(settingsPath) || {};
      if (!currentSettings.statusLine) {
        writeJson(settingsPath, {
          ...currentSettings,
          statusLine: {
            type: 'command',
            command: `bash ${statuslineDest}`,
          },
        });
      }
    });
    return { ok: true, label: 'Status Line', detail: 'installed' };
  }

  return { ok: false, label: 'Status Line', detail: 'skipped' };
}

// --- Main: init ---

async function runInit() {
  renderBanner();

  const useDefaults = await ask('Use defaults? (install everything)', true);

  // Step 1
  renderStep(1, 4, 'Settings');
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settingsResult = await applySettings(settingsPath, useDefaults);

  // Step 2
  renderStep(2, 4, 'User Skills');
  const skillsResult = await installSkills(useDefaults);

  // Step 3
  renderStep(3, 4, 'Status Line');
  const statusResult = await installStatusLine(settingsPath, useDefaults);

  // Step 4
  renderStep(4, 4, 'Summary');
  renderSummary([settingsResult, skillsResult, statusResult]);
  renderDone();
}

// --- Main: project-init ---

function runProjectInit() {
  const { C, style } = require('./ui');

  console.log('\noh-my-claude project-init\n');

  let projectRoot;
  try {
    projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    projectRoot = process.cwd();
  }

  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const preset = loadPreset('project.json');

  const bakPath = backup(settingsPath);
  if (bakPath) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + bakPath, C.gray)}`);

  const existing = readJson(settingsPath) || {};
  writeJson(settingsPath, { ...existing, permissions: preset.permissions });

  console.log(`\n  ${style('Project:', C.bold)} ${style(projectRoot, C.cyan)}\n`);
  console.log(`  ${style('✓', C.green)} allow: ${preset.permissions.allow.join(', ')}`);

  // Project skills
  const skillsSrc = path.join(PACKAGE_ROOT, 'project-skills');
  const skillsDest = path.join(claudeDir, 'skills');
  const copiedSkills = [];
  try {
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirRecursive(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
      copiedSkills.push(entry.name);
    }
  } catch {}

  if (copiedSkills.length > 0) {
    console.log(`\n  ${style('✓', C.green)} ${copiedSkills.length} project skills installed`);
  }

  console.log('\n  Done!\n');
}

module.exports = { runInit, runProjectInit };
