'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderBanner, renderStep, progressLine, ask, checkbox, renderSummary, renderDone, C, style } = require('./ui');

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

// --- Step 1: Permissions (allow) ---

async function configureAllow(preset, useDefaults) {
  const allAllow = preset.permissions.allow || [];

  if (useDefaults) {
    await progressLine(`Applying ${allAllow.length} allow rules`, () => {});
    return allAllow;
  }

  console.log('');
  const items = allAllow.map(r => ({ name: r, desc: '' }));
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allAllow.length} allow rules selected`);
  return selected;
}

// --- Step 2: Permissions (deny) ---

async function configureDeny(preset, useDefaults) {
  const allDeny = preset.permissions.deny || [];

  if (useDefaults) {
    await progressLine(`Applying ${allDeny.length} deny rules`, () => {});
    return allDeny;
  }

  console.log('');
  const items = allDeny.map(r => ({ name: r, desc: '' }));
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allDeny.length} deny rules selected`);
  return selected;
}

// --- Step 3: Plugins ---

async function configurePlugins(preset, useDefaults) {
  const allPlugins = Object.keys(preset.enabledPlugins || {});

  if (useDefaults) {
    await progressLine(`Enabling ${allPlugins.length} plugins`, () => {});
    return allPlugins;
  }

  console.log('');
  const items = allPlugins.map(p => {
    const name = p.replace(/@.*$/, '');
    return { name: p, desc: name };
  });
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allPlugins.length} plugins selected`);
  return selected;
}

// --- Step 4: User Skills ---

async function installSkills(useDefaults) {
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');
  const available = getAvailableSkills();

  if (available.length === 0) {
    return { ok: false, label: 'Skills', detail: 'no skills found', selected: [] };
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
    console.log(`  ${style('✓', C.green)} ${selectedNames.length} skills installed`);
  }

  return {
    ok: true,
    label: 'Skills',
    detail: `${selectedNames.length}/${available.length} installed`,
    selected: selectedNames,
  };
}

// --- Step 5: Status Line ---

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
  const totalSteps = 6;

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const preset = loadPreset('user.json');
  const bakPath = backup(settingsPath);

  if (bakPath) {
    console.log(`\n  ${style('💾', C.gray)} ${style('Backup: ' + bakPath, C.gray)}`);
  }

  // Step 1: Allow permissions
  renderStep(1, totalSteps, 'Permissions (allow)');
  const selectedAllow = await configureAllow(preset, useDefaults);

  // Step 2: Deny permissions
  renderStep(2, totalSteps, 'Permissions (deny)');
  const selectedDeny = await configureDeny(preset, useDefaults);

  // Step 3: Plugins
  renderStep(3, totalSteps, 'Plugins');
  const selectedPlugins = await configurePlugins(preset, useDefaults);

  // Write settings
  const existing = readJson(settingsPath) || {};
  const enabledPlugins = {};
  for (const p of selectedPlugins) { enabledPlugins[p] = true; }

  writeJson(settingsPath, {
    ...existing,
    permissions: { allow: selectedAllow, deny: selectedDeny },
    enabledPlugins,
    extraKnownMarketplaces: preset.extraKnownMarketplaces,
  });

  await progressLine('Configuring marketplaces', () => {});

  // Step 4: Skills
  renderStep(4, totalSteps, 'User Skills');
  const skillsResult = await installSkills(useDefaults);

  // Step 5: Status Line
  renderStep(5, totalSteps, 'Status Line');
  const statusResult = await installStatusLine(settingsPath, useDefaults);

  // Step 6: Summary
  renderStep(6, totalSteps, 'Summary');
  renderSummary([
    { ok: true, label: 'Allow rules', detail: `${selectedAllow.length} configured` },
    { ok: true, label: 'Deny rules', detail: `${selectedDeny.length} configured` },
    { ok: true, label: 'Plugins', detail: `${selectedPlugins.length} enabled` },
    { ok: skillsResult.ok, label: skillsResult.label, detail: skillsResult.detail },
    { ok: statusResult.ok, label: statusResult.label, detail: statusResult.detail },
  ]);
  renderDone();
}

// --- Main: project-init ---

function runProjectInit() {
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
    console.log(`\n  ${style('✓', C.green)} ${copiedSkills.length} project skills installed`);
  }

  console.log('\n  Done!\n');
}

// --- Clone: export current Claude environment ---

async function runClone() {
  renderBanner();
  console.log(`  ${style('Exporting current Claude environment...', C.bold)}\n`);

  const ts = timestamp();
  const outDir = path.join(process.cwd(), `claude-env-${ts}`);
  fs.mkdirSync(outDir, { recursive: true });

  const items = [
    { src: path.join(CLAUDE_DIR, 'settings.json'), dest: 'settings.json', label: 'Settings' },
    { src: path.join(CLAUDE_DIR, 'statusline-command.sh'), dest: 'statusline-command.sh', label: 'Status line' },
    { src: path.join(CLAUDE_DIR, 'skills'), dest: 'skills', label: 'User skills', dir: true },
    { src: path.join(CLAUDE_DIR, 'commands'), dest: 'commands', label: 'User commands', dir: true },
  ];

  let count = 0;
  for (const item of items) {
    if (!fs.existsSync(item.src)) {
      console.log(`  ${style('⏭', C.gray)}  ${item.label} — not found`);
      continue;
    }
    const destPath = path.join(outDir, item.dest);
    if (item.dir) {
      copyDirRecursive(item.src, destPath);
    } else {
      fs.copyFileSync(item.src, destPath);
    }
    console.log(`  ${style('✓', C.green)} ${item.label}`);
    count++;
  }

  // Also export installed plugins list
  const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  if (fs.existsSync(pluginsFile)) {
    fs.mkdirSync(path.join(outDir, 'plugins'), { recursive: true });
    fs.copyFileSync(pluginsFile, path.join(outDir, 'plugins', 'installed_plugins.json'));
    console.log(`  ${style('✓', C.green)} Installed plugins list`);
    count++;
  }

  console.log(`\n  ${style('✓', C.green)} ${style(`${count} items exported to:`, C.bold)}`);
  console.log(`  ${style(outDir, C.cyan)}`);
  console.log(`\n  To apply on another machine:`);
  console.log(`  ${style('1.', C.gray)} Copy this folder to the target machine`);
  console.log(`  ${style('2.', C.gray)} Run: ${style('omc restore <path-to-folder>', C.cyan)}\n`);
}

// --- Backup: snapshot ~/.claude/ ---

async function runBackup() {
  renderBanner();

  const ts = timestamp();
  const tarName = `claude-backup-${ts}.tar.gz`;
  const tarPath = path.join(process.cwd(), tarName);

  console.log(`  ${style('Creating backup...', C.bold)}\n`);

  await progressLine('Compressing ~/.claude/', () => {
    execFileSync('tar', [
      '--exclude', '*/plugins/cache/*',
      '--exclude', '*/plugins/marketplaces/*',
      '-czf', tarPath,
      '-C', path.dirname(CLAUDE_DIR),
      path.basename(CLAUDE_DIR),
    ], { stdio: 'pipe' });
  });

  const size = fs.statSync(tarPath).size;
  const sizeStr = size > 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${(size / 1024).toFixed(0)} KB`;

  console.log(`\n  ${style('✓', C.green)} ${style('Backup created:', C.bold)} ${style(tarName, C.cyan)}`);
  console.log(`  ${style('Size:', C.gray)} ${sizeStr}`);
  console.log(`  ${style('Restore with:', C.gray)} ${style(`omc restore ${tarName}`, C.cyan)}\n`);
}

// --- Restore: restore from backup ---

async function runRestore(source) {
  renderBanner();

  if (!source) {
    console.error(`  ${style('ERROR:', C.red)} Please specify a backup file or clone folder`);
    console.error(`  ${style('Usage:', C.gray)} omc restore <file.tar.gz | clone-folder>\n`);
    process.exit(1);
  }

  if (!fs.existsSync(source)) {
    console.error(`  ${style('ERROR:', C.red)} Not found: ${source}\n`);
    process.exit(1);
  }

  const stat = fs.statSync(source);

  // Backup existing
  const bakPath = backup(path.join(CLAUDE_DIR, 'settings.json'));
  if (bakPath) {
    console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + bakPath, C.gray)}\n`);
  }

  if (stat.isDirectory()) {
    // Restore from clone folder
    console.log(`  ${style('Restoring from clone folder...', C.bold)}\n`);

    const items = [
      { src: 'settings.json', dest: path.join(CLAUDE_DIR, 'settings.json'), label: 'Settings' },
      { src: 'statusline-command.sh', dest: path.join(CLAUDE_DIR, 'statusline-command.sh'), label: 'Status line' },
      { src: 'skills', dest: path.join(CLAUDE_DIR, 'skills'), label: 'User skills', dir: true },
      { src: 'commands', dest: path.join(CLAUDE_DIR, 'commands'), label: 'User commands', dir: true },
    ];

    let count = 0;
    for (const item of items) {
      const srcPath = path.join(source, item.src);
      if (!fs.existsSync(srcPath)) {
        console.log(`  ${style('⏭', C.gray)}  ${item.label} — not in backup`);
        continue;
      }
      if (item.dir) {
        copyDirRecursive(srcPath, item.dest);
      } else {
        fs.mkdirSync(path.dirname(item.dest), { recursive: true });
        fs.copyFileSync(srcPath, item.dest);
      }
      console.log(`  ${style('✓', C.green)} ${item.label}`);
      count++;
    }

    console.log(`\n  ${style('✓', C.green)} ${style(`${count} items restored`, C.bold)}\n`);

  } else if (source.endsWith('.tar.gz') || source.endsWith('.tgz')) {
    // Restore from tarball
    console.log(`  ${style('Restoring from backup...', C.bold)}\n`);

    await progressLine('Extracting backup', () => {
      execFileSync('tar', [
        'xzf', path.resolve(source),
        '-C', path.dirname(CLAUDE_DIR),
      ], { stdio: 'pipe' });
    });

    console.log(`\n  ${style('✓', C.green)} ${style('Restore complete', C.bold)}\n`);

  } else {
    console.error(`  ${style('ERROR:', C.red)} Unsupported format. Use .tar.gz or a clone folder\n`);
    process.exit(1);
  }
}

module.exports = { runInit, runProjectInit, runClone, runBackup, runRestore };
