#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// Interactive checkbox selector with arrow keys
function checkbox(items) {
  return new Promise((resolve) => {
    const selected = items.map(() => true); // all selected by default
    let cursor = 0;

    let firstRender = true;

    function render() {
      if (!firstRender) {
        process.stdout.write(`\x1b[${items.length + 1}A\x1b[0J`);
      }
      firstRender = false;

      console.log('  (↑↓ move, space toggle, a all, n none, enter confirm)');
      for (let i = 0; i < items.length; i++) {
        const check = selected[i] ? '◉' : '○';
        const arrow = i === cursor ? '›' : ' ';
        const dim = selected[i] ? '' : '\x1b[2m';
        const reset = '\x1b[0m';
        console.log(`  ${arrow} ${check} ${dim}${items[i].name} — ${items[i].desc}${reset}`);
      }
    }

    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (key) => {
      if (key === '\r' || key === '\n') {
        // Enter — confirm
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners('data');
        console.log('');
        resolve(items.filter((_, i) => selected[i]).map(item => item.name));
        return;
      }
      if (key === ' ') {
        selected[cursor] = !selected[cursor];
        render();
      } else if (key === 'a') {
        selected.fill(true);
        render();
      } else if (key === 'n') {
        selected.fill(false);
        render();
      } else if (key === '\x1b[A' || key === 'k') {
        // Up
        cursor = (cursor - 1 + items.length) % items.length;
        render();
      } else if (key === '\x1b[B' || key === 'j') {
        // Down
        cursor = (cursor + 1) % items.length;
        render();
      } else if (key === '\x03') {
        // Ctrl+C
        process.exit(0);
      }
    });
  });
}

async function init() {
  console.log('oh-my-claude init\n');

  // Ask: use defaults?
  const useDefaults = await ask('Use default settings? (install everything) [Y/n] ');
  const isDefault = useDefaults === '' || useDefaults === 'y' || useDefaults === 'yes';

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

  // Skills
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');

  try {
    const available = fs.readdirSync(skillsSrc, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const skillFile = path.join(skillsSrc, e.name, 'SKILL.md');
        let desc = '';
        try {
          const content = fs.readFileSync(skillFile, 'utf-8');
          const match = content.match(/description:\s*>?\s*\n?\s*(.+)/);
          if (match) desc = match[1].trim().slice(0, 50);
        } catch {}
        return { name: e.name, desc: desc || '(no description)' };
      });

    let selectedSkills;
    if (isDefault) {
      selectedSkills = available.map(s => s.name);
      console.log(`\n[User Skills] ✅ All ${available.length} skills installed`);
    } else {
      console.log(`\n[User Skills] Select skills to install:\n`);
      selectedSkills = await checkbox(available);
      console.log(`  ✅ ${selectedSkills.length}/${available.length} skills installed`);
    }

    for (const name of selectedSkills) {
      copyDirRecursive(path.join(skillsSrc, name), path.join(skillsDest, name));
    }
  } catch {
    // user-skills directory doesn't exist
  }

  // Status line
  const statuslineSrc = path.join(PACKAGE_ROOT, 'statusline-command.sh');
  const statuslineDest = path.join(CLAUDE_DIR, 'statusline-command.sh');

  if (fs.existsSync(statuslineSrc)) {
    let install = isDefault;
    if (!isDefault) {
      const alreadyExists = fs.existsSync(statuslineDest);
      const q = alreadyExists
        ? '\nStatus line already exists. Overwrite? (y/n) '
        : '\nInstall custom status line? (y/n) ';
      const answer = await ask(q);
      install = answer === 'y' || answer === 'yes';
    }

    if (install) {
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
      console.log('\n[Status Line] ✅ installed');
    } else {
      console.log('\n[Status Line] ⏭️  skipped');
    }
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

  const copiedSkills = [];
  const skillsSrc = path.join(PACKAGE_ROOT, 'project-skills');
  const skillsDest = path.join(claudeDir, 'skills');
  try {
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirRecursive(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
      copiedSkills.push(entry.name);
    }
  } catch {}

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
