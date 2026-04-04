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

function isDirChanged(srcDir, destDir) {
  try {
    const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of srcEntries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (isDirChanged(srcPath, destPath)) return true;
      } else {
        if (!fs.existsSync(destPath)) return true;
        const srcContent = fs.readFileSync(srcPath);
        const destContent = fs.readFileSync(destPath);
        if (!srcContent.equals(destContent)) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
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

// --- Status: show current environment ---

function runStatus() {
  renderBanner();
  console.log(`  ${style('Environment Status', C.bold)}\n`);

  // Settings
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath);

  if (settings) {
    const allow = settings.permissions?.allow?.length || 0;
    const deny = settings.permissions?.deny?.length || 0;
    const plugins = Object.keys(settings.enabledPlugins || {}).length;
    const hasStatusLine = !!settings.statusLine;

    console.log(`  ${style('Settings', C.bold)} ${style(settingsPath, C.gray)}`);
    console.log(`    Permissions: ${style(`${allow} allow`, C.green)}, ${style(`${deny} deny`, C.red)}`);
    console.log(`    Plugins:     ${style(`${plugins} enabled`, C.cyan)}`);
    console.log(`    Status line: ${hasStatusLine ? style('configured', C.green) : style('not set', C.gray)}`);
  } else {
    console.log(`  ${style('Settings', C.bold)} ${style('not found', C.red)}`);
  }

  // Skills
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  let skillNames = [];
  try {
    skillNames = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {}

  console.log(`\n  ${style('User Skills', C.bold)} ${style(`(${skillNames.length})`, C.gray)}`);
  if (skillNames.length > 0) {
    for (const name of skillNames.sort()) {
      console.log(`    ${style('•', C.cyan)} ${name}`);
    }
  } else {
    console.log(`    ${style('(none)', C.gray)}`);
  }

  // Plugins detail
  if (settings?.enabledPlugins) {
    const pluginNames = Object.keys(settings.enabledPlugins);
    console.log(`\n  ${style('Plugins', C.bold)} ${style(`(${pluginNames.length})`, C.gray)}`);
    for (const name of pluginNames.sort()) {
      const short = name.replace(/@.*$/, '');
      console.log(`    ${style('•', C.cyan)} ${short}`);
    }
  }

  // Status line
  const statuslinePath = path.join(CLAUDE_DIR, 'statusline-command.sh');
  console.log(`\n  ${style('Status Line', C.bold)}`);
  if (fs.existsSync(statuslinePath)) {
    console.log(`    ${style('✓', C.green)} ${statuslinePath}`);
  } else {
    console.log(`    ${style('✗', C.gray)} not installed`);
  }

  console.log('');
}

// --- Doctor: diagnose issues ---

function runDoctor() {
  renderBanner();
  console.log(`  ${style('Checking configuration...', C.bold)}\n`);

  let issues = 0;
  let warnings = 0;

  function ok(msg) { console.log(`  ${style('✓', C.green)} ${msg}`); }
  function warn(msg) { console.log(`  ${style('!', C.yellow)} ${msg}`); warnings++; }
  function fail(msg) { console.log(`  ${style('✗', C.red)} ${msg}`); issues++; }

  // 1. ~/.claude/ directory
  if (fs.existsSync(CLAUDE_DIR)) {
    ok('~/.claude/ directory exists');
  } else {
    fail('~/.claude/ directory not found — run "omc init"');
    console.log(`\n  ${style(`${issues} issues`, C.red)}\n`);
    return;
  }

  // 2. settings.json
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath);
  if (settings) {
    ok('settings.json is valid JSON');
  } else if (fs.existsSync(settingsPath)) {
    fail('settings.json exists but is invalid JSON');
  } else {
    fail('settings.json not found — run "omc init"');
  }

  // 3. Permissions
  if (settings?.permissions?.allow?.length > 0) {
    ok(`permissions.allow: ${settings.permissions.allow.length} rules`);
  } else {
    warn('No allow permissions configured');
  }

  if (settings?.permissions?.deny?.length > 0) {
    ok(`permissions.deny: ${settings.permissions.deny.length} rules`);
  } else {
    warn('No deny permissions configured — destructive commands not blocked');
  }

  // 4. Plugins
  if (settings?.enabledPlugins && Object.keys(settings.enabledPlugins).length > 0) {
    ok(`${Object.keys(settings.enabledPlugins).length} plugins enabled`);
  } else {
    warn('No plugins enabled');
  }

  // 5. Marketplaces
  if (settings?.extraKnownMarketplaces) {
    ok('Marketplace configured');
  } else {
    warn('No marketplace configured — plugins may not auto-install');
  }

  // 6. Skills directory
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory());
    if (skills.length > 0) {
      ok(`${skills.length} user skills installed`);

      // Check each skill has SKILL.md
      let broken = 0;
      for (const s of skills) {
        if (!fs.existsSync(path.join(skillsDir, s.name, 'SKILL.md'))) {
          fail(`Skill "${s.name}" missing SKILL.md`);
          broken++;
        }
      }
      if (broken === 0) ok('All skills have valid SKILL.md');
    } else {
      warn('Skills directory is empty');
    }
  } else {
    warn('No skills directory — run "omc init"');
  }

  // 7. Status line
  const statuslinePath = path.join(CLAUDE_DIR, 'statusline-command.sh');
  if (fs.existsSync(statuslinePath)) {
    const stat = fs.statSync(statuslinePath);
    if (stat.mode & 0o111) {
      ok('statusline-command.sh is executable');
    } else {
      warn('statusline-command.sh exists but is not executable');
    }
    if (settings?.statusLine) {
      ok('statusLine configured in settings.json');
    } else {
      warn('statusline-command.sh exists but statusLine not configured in settings.json');
    }
  }

  // 8. Backup files
  try {
    const backups = fs.readdirSync(CLAUDE_DIR).filter(f => f.includes('.bak.'));
    if (backups.length > 5) {
      warn(`${backups.length} backup files in ~/.claude/ — consider cleaning up`);
    }
  } catch {}

  // Summary
  console.log('');
  if (issues === 0 && warnings === 0) {
    console.log(`  ${style('All checks passed!', C.green, C.bold)}\n`);
  } else {
    if (issues > 0) console.log(`  ${style(`${issues} issue(s)`, C.red, C.bold)}`);
    if (warnings > 0) console.log(`  ${style(`${warnings} warning(s)`, C.yellow, C.bold)}`);
    console.log('');
  }
}

// --- Update: pull latest skills from repo ---

async function runUpdate() {
  renderBanner();
  console.log(`  ${style('Updating skills from repo...', C.bold)}\n`);

  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');

  // Get repo skills
  const repoSkills = new Set();
  try {
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (entry.isDirectory()) repoSkills.add(entry.name);
    }
  } catch {
    console.error(`  ${style('ERROR:', C.red)} user-skills/ not found\n`);
    return;
  }

  // Get local skills
  const localSkills = new Set();
  try {
    for (const entry of fs.readdirSync(skillsDest, { withFileTypes: true })) {
      if (entry.isDirectory()) localSkills.add(entry.name);
    }
  } catch {}

  // Compare and update only changed skills
  let updated = 0;
  let added = 0;
  let skipped = 0;

  for (const name of repoSkills) {
    const srcDir = path.join(skillsSrc, name);
    const destDir = path.join(skillsDest, name);

    if (!localSkills.has(name)) {
      await progressLine(`Adding ${name} (new)`, () => {
        copyDirRecursive(srcDir, destDir);
      });
      added++;
      continue;
    }

    // Check if any file differs
    const changed = isDirChanged(srcDir, destDir);
    if (changed) {
      await progressLine(`Updating ${name}`, () => {
        copyDirRecursive(srcDir, destDir);
      });
      updated++;
    } else {
      console.log(`  ${style('–', C.gray)} ${style(name, C.gray)} (up to date)`);
      skipped++;
    }
  }

  // Detect removed skills (in local but not in repo)
  const removed = [];
  for (const name of localSkills) {
    if (!repoSkills.has(name)) {
      removed.push(name);
    }
  }

  if (removed.length > 0) {
    console.log(`\n  ${style('Skills not in repo (local only):', C.yellow)}`);
    for (const name of removed) {
      console.log(`    ${style('•', C.yellow)} ${name}`);
    }
    const shouldDelete = await ask('Remove these local-only skills?', false);
    if (shouldDelete) {
      for (const name of removed) {
        const skillPath = path.join(skillsDest, name);
        fs.rmSync(skillPath, { recursive: true });
        console.log(`  ${style('✗', C.red)} Removed ${name}`);
      }
    } else {
      console.log(`  ${style('⏭', C.gray)}  Kept local-only skills`);
    }
  }

  const parts = [];
  if (updated > 0) parts.push(`${updated} updated`);
  if (added > 0) parts.push(`${added} added`);
  if (skipped > 0) parts.push(`${skipped} up to date`);
  console.log(`\n  ${style('✓', C.green)} ${style(parts.join(', '), C.bold)}\n`);
}

module.exports = { runInit, runProjectInit, runClone, runBackup, runRestore, runStatus, runDoctor, runUpdate };
