import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import { renderBanner, renderStep, progressLine, ask, checkbox, renderSummary, renderDone, C, style } from './ui';
import type { SummaryResult, CheckboxItem } from './ui';

// --- Types ---

export interface Opts {
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  verbose?: boolean;
  fork?: boolean;
  all?: boolean;
  lang?: string;
  output?: string;
  project?: string;
  limit?: number;
}

interface Preset {
  permissions: { allow?: string[]; deny?: string[] };
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, unknown>;
}

interface SkillInfo {
  name: string;
  desc: string;
}

interface SkillResult extends SummaryResult {
  selected?: string[];
}

interface SessionInfo {
  id: string;
  project: string;
  date: Date;
  size: number;
  firstMessage: string;
}

interface CloneItem {
  src: string;
  dest: string;
  label: string;
  dir?: boolean;
}

// --- Constants ---

export const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
export const PACKAGE_ROOT = path.resolve(__dirname, '..');

// --- Utilities ---

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export function readJson(filePath: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

export function writeJson(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function copyDirRecursive(src: string, dest: string): number {
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

export function backup(filePath: string): string | null {
  try {
    const bakPath = `${filePath}.bak.${timestamp()}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
  } catch { return null; }
}

export function isDirChanged(srcDir: string, destDir: string): boolean {
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

function loadPreset(name: string): Preset {
  const presetPath = path.join(PACKAGE_ROOT, 'presets', name);
  const preset = readJson(presetPath) as Preset | null;
  if (!preset || !preset.permissions) {
    console.error(`ERROR: ${name} is missing or invalid`);
    process.exit(1);
  }
  return preset;
}

function getAvailableSkills(): SkillInfo[] {
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

// --- Steps ---

async function configureAllow(preset: Preset, useDefaults: boolean): Promise<string[]> {
  const allAllow = preset.permissions.allow || [];
  if (useDefaults) {
    await progressLine(`Applying ${allAllow.length} allow rules`, () => {});
    return allAllow;
  }
  console.log('');
  const items: CheckboxItem[] = allAllow.map(r => ({ name: r, desc: '' }));
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allAllow.length} allow rules selected`);
  return selected;
}

async function configureDeny(preset: Preset, useDefaults: boolean): Promise<string[]> {
  const allDeny = preset.permissions.deny || [];
  if (useDefaults) {
    await progressLine(`Applying ${allDeny.length} deny rules`, () => {});
    return allDeny;
  }
  console.log('');
  const items: CheckboxItem[] = allDeny.map(r => ({ name: r, desc: '' }));
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allDeny.length} deny rules selected`);
  return selected;
}

async function configurePlugins(preset: Preset, useDefaults: boolean): Promise<string[]> {
  const allPlugins = Object.keys(preset.enabledPlugins || {});
  if (useDefaults) {
    await progressLine(`Enabling ${allPlugins.length} plugins`, () => {});
    return allPlugins;
  }
  console.log('');
  const items: CheckboxItem[] = allPlugins.map(p => ({ name: p, desc: p.replace(/@.*$/, '') }));
  const selected = await checkbox(items);
  console.log(`  ${style('✓', C.green)} ${selected.length}/${allPlugins.length} plugins selected`);
  return selected;
}

function copySkillWithLang(srcDir: string, destDir: string, lang: string): void {
  copyDirRecursive(srcDir, destDir);
  if (lang === 'ko') {
    const koFile = path.join(srcDir, 'SKILL.ko.md');
    const destFile = path.join(destDir, 'SKILL.md');
    if (fs.existsSync(koFile)) fs.copyFileSync(koFile, destFile);
  }
  const destKo = path.join(destDir, 'SKILL.ko.md');
  try { fs.unlinkSync(destKo); } catch {}
}

async function installSkills(useDefaults: boolean, lang: string): Promise<SkillResult> {
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');
  const available = getAvailableSkills();

  if (available.length === 0) {
    return { ok: false, label: 'Skills', detail: 'no skills found', selected: [] };
  }

  let selectedNames: string[];

  if (useDefaults) {
    selectedNames = available.map(s => s.name);
    await progressLine(`Installing all ${available.length} skills (${lang})`, () => {
      for (const name of selectedNames) {
        copySkillWithLang(path.join(skillsSrc, name), path.join(skillsDest, name), lang);
      }
    });
  } else {
    console.log('');
    selectedNames = await checkbox(available);
    for (const name of selectedNames) {
      copySkillWithLang(path.join(skillsSrc, name), path.join(skillsDest, name), lang);
    }
    console.log(`  ${style('✓', C.green)} ${selectedNames.length} skills installed (${lang})`);
  }

  return { ok: true, label: 'Skills', detail: `${selectedNames.length}/${available.length} installed`, selected: selectedNames };
}

async function installStatusLine(settingsPath: string, useDefaults: boolean): Promise<SummaryResult> {
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
      if (!(currentSettings as Record<string, unknown>).statusLine) {
        writeJson(settingsPath, { ...currentSettings, statusLine: { type: 'command', command: `bash ${statuslineDest}` } });
      }
    });
    return { ok: true, label: 'Status Line', detail: 'installed' };
  }

  return { ok: false, label: 'Status Line', detail: 'skipped' };
}

// --- Main: init ---

export async function runInit(opts: Opts = {}): Promise<void> {
  renderBanner();

  const useDefaults = opts.yes || await ask('Use defaults? (install everything)', true);
  const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
  const detectedLang = sysLocale.startsWith('ko') ? 'ko' : 'en';

  let lang = opts.lang || detectedLang;
  if (!useDefaults && !opts.lang) {
    const defaultHint = detectedLang === 'ko' ? `en/${style('[ko]', C.gray)}` : `${style('[en]', C.gray)}/ko`;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    lang = await new Promise<string>((resolve) => {
      rl.question(`  Skill language? ${defaultHint}: `, (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === '') resolve(detectedLang);
        else resolve(a === 'ko' ? 'ko' : 'en');
      });
    });
  }

  const totalSteps = 7;
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const preset = loadPreset('user.json');
  const bakPath = backup(settingsPath);

  if (bakPath) console.log(`\n  ${style('💾', C.gray)} ${style('Backup: ' + bakPath, C.gray)}`);

  renderStep(1, totalSteps, 'Permissions (allow)');
  const selectedAllow = await configureAllow(preset, useDefaults);

  renderStep(2, totalSteps, 'Permissions (deny)');
  const selectedDeny = await configureDeny(preset, useDefaults);

  renderStep(3, totalSteps, 'Plugins');
  const selectedPlugins = await configurePlugins(preset, useDefaults);

  const existing = readJson(settingsPath) || {};
  const enabledPlugins: Record<string, boolean> = {};
  for (const p of selectedPlugins) { enabledPlugins[p] = true; }

  writeJson(settingsPath, {
    ...existing,
    permissions: { allow: selectedAllow, deny: selectedDeny },
    enabledPlugins,
    extraKnownMarketplaces: preset.extraKnownMarketplaces,
  });

  await progressLine('Configuring marketplaces', () => {});

  renderStep(4, totalSteps, 'User Skills');
  const skillsResult = await installSkills(useDefaults, lang);

  renderStep(5, totalSteps, 'Status Line');
  const statusResult = await installStatusLine(settingsPath, useDefaults);

  renderStep(6, totalSteps, 'CLAUDE.md');
  const claudeMdResult = await installClaudeMd(useDefaults);

  renderStep(7, totalSteps, 'Summary');
  renderSummary([
    { ok: true, label: 'Allow rules', detail: `${selectedAllow.length} configured` },
    { ok: true, label: 'Deny rules', detail: `${selectedDeny.length} configured` },
    { ok: true, label: 'Plugins', detail: `${selectedPlugins.length} enabled` },
    { ok: skillsResult.ok, label: skillsResult.label, detail: skillsResult.detail },
    { ok: statusResult.ok, label: statusResult.label, detail: statusResult.detail },
    { ok: claudeMdResult.ok, label: claudeMdResult.label, detail: claudeMdResult.detail },
  ]);
  renderDone();
}

// --- Install ---

export async function runInstall(target: string | undefined, opts: Opts = {}): Promise<void> {
  renderBanner();
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const preset = loadPreset('user.json');
  const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
  const lang = opts.lang || (sysLocale.startsWith('ko') ? 'ko' : 'en');

  switch (target) {
    case 'skills': {
      console.log(`  ${style('Installing skills...', C.bold)}\n`);
      const result = await installSkills(!!opts.force, lang);
      console.log(`\n  ${style('✓', C.green)} ${style(result.detail, C.bold)}\n`);
      break;
    }
    case 'plugins': {
      console.log(`  ${style('Applying plugins...', C.bold)}\n`);
      if (!opts.force) { const b = backup(settingsPath); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }
      const ex = readJson(settingsPath) || {};
      (ex as Record<string, unknown>).enabledPlugins = preset.enabledPlugins;
      (ex as Record<string, unknown>).extraKnownMarketplaces = preset.extraKnownMarketplaces;
      writeJson(settingsPath, ex);
      console.log(`  ${style('✓', C.green)} ${Object.keys(preset.enabledPlugins || {}).length} plugins enabled`);
      console.log(`\n  ${style('⚠️  Plugins will be auto-installed on next session.', C.yellow)}\n`);
      break;
    }
    case 'permissions': {
      console.log(`  ${style('Applying permissions...', C.bold)}\n`);
      if (!opts.force) { const b = backup(settingsPath); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }
      const ex = readJson(settingsPath) || {};
      (ex as Record<string, unknown>).permissions = preset.permissions;
      writeJson(settingsPath, ex);
      console.log(`  ${style('✓', C.green)} ${preset.permissions.allow?.length || 0} allow, ${preset.permissions.deny?.length || 0} deny\n`);
      break;
    }
    case 'statusline': {
      console.log(`  ${style('Installing status line...', C.bold)}\n`);
      const src = path.join(PACKAGE_ROOT, 'statusline-command.sh');
      const dest = path.join(CLAUDE_DIR, 'statusline-command.sh');
      if (!fs.existsSync(src)) { console.error(`  ${style('ERROR:', C.red)} statusline-command.sh not found\n`); break; }
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o755);
      const ex = readJson(settingsPath) || {};
      if (!(ex as Record<string, unknown>).statusLine) {
        (ex as Record<string, unknown>).statusLine = { type: 'command', command: `bash ${dest}` };
        writeJson(settingsPath, ex);
      }
      console.log(`  ${style('✓', C.green)} ${dest}\n`);
      break;
    }
    case 'all':
      return runInit({ ...opts, yes: true });
    default:
      console.error(`  ${style('Unknown target:', C.red)} ${target || '(none)'}`);
      console.error(`\n  Available: ${style('skills', C.cyan)}, ${style('plugins', C.cyan)}, ${style('permissions', C.cyan)}, ${style('statusline', C.cyan)}, ${style('all', C.cyan)}\n`);
      process.exit(1);
  }
}

// --- Project Init ---

export function runProjectInit(opts: Opts = {}): void {
  console.log('\nclaude-up project-init\n');
  let projectRoot: string;
  try { projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim(); }
  catch { projectRoot = process.cwd(); }

  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const preset = loadPreset('project.json');

  if (!opts.force) { const b = backup(settingsPath); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }

  const existing = readJson(settingsPath) || {};
  writeJson(settingsPath, { ...existing, permissions: preset.permissions });

  console.log(`\n  ${style('Project:', C.bold)} ${style(projectRoot, C.cyan)}\n`);
  console.log(`  ${style('✓', C.green)} allow: ${(preset.permissions.allow || []).join(', ')}`);

  const copiedSkills: string[] = [];
  const skillsSrc = path.join(PACKAGE_ROOT, 'project-skills');
  const skillsDest = path.join(claudeDir, 'skills');
  try {
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirRecursive(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
      copiedSkills.push(entry.name);
    }
  } catch {}

  if (copiedSkills.length > 0) console.log(`\n  ${style('✓', C.green)} ${copiedSkills.length} project skills installed`);
  console.log('\n  Done!\n');
}

// --- Clone ---

export async function runClone(opts: Opts = {}): Promise<void> {
  renderBanner();
  console.log(`  ${style('Exporting current Claude environment...', C.bold)}\n`);

  const outDir = opts.output || path.join(process.cwd(), `claude-env-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const items: CloneItem[] = [
    { src: path.join(CLAUDE_DIR, 'settings.json'), dest: 'settings.json', label: 'Settings' },
    { src: path.join(CLAUDE_DIR, 'statusline-command.sh'), dest: 'statusline-command.sh', label: 'Status line' },
    { src: path.join(CLAUDE_DIR, 'skills'), dest: 'skills', label: 'User skills', dir: true },
    { src: path.join(CLAUDE_DIR, 'commands'), dest: 'commands', label: 'User commands', dir: true },
  ];

  let count = 0;
  for (const item of items) {
    if (!fs.existsSync(item.src)) { console.log(`  ${style('⏭', C.gray)}  ${item.label} — not found`); continue; }
    const destPath = path.join(outDir, item.dest);
    if (item.dir) copyDirRecursive(item.src, destPath);
    else fs.copyFileSync(item.src, destPath);
    console.log(`  ${style('✓', C.green)} ${item.label}`);
    count++;
  }

  const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  if (fs.existsSync(pluginsFile)) {
    fs.mkdirSync(path.join(outDir, 'plugins'), { recursive: true });
    fs.copyFileSync(pluginsFile, path.join(outDir, 'plugins', 'installed_plugins.json'));
    console.log(`  ${style('✓', C.green)} Installed plugins list`);
    count++;
  }

  console.log(`\n  ${style('✓', C.green)} ${style(`${count} items exported to:`, C.bold)}`);
  console.log(`  ${style(outDir, C.cyan)}\n`);
}

// --- Backup ---

export async function runBackup(opts: Opts = {}): Promise<void> {
  renderBanner();
  const tarPath = opts.output || path.join(process.cwd(), `claude-backup-${timestamp()}.tar.gz`);
  console.log(`  ${style('Creating backup...', C.bold)}\n`);

  await progressLine('Compressing ~/.claude/', () => {
    execFileSync('tar', ['--exclude', '*/plugins/cache/*', '--exclude', '*/plugins/marketplaces/*', '-czf', tarPath, '-C', path.dirname(CLAUDE_DIR), path.basename(CLAUDE_DIR)], { stdio: 'pipe' });
  });

  const size = fs.statSync(tarPath).size;
  const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
  console.log(`\n  ${style('✓', C.green)} ${style('Backup created:', C.bold)} ${style(path.basename(tarPath), C.cyan)}`);
  console.log(`  ${style('Size:', C.gray)} ${sizeStr}\n`);
}

// --- Restore ---

export async function runRestore(source: string | undefined, opts: Opts = {}): Promise<void> {
  renderBanner();
  if (!source) { console.error(`  ${style('ERROR:', C.red)} Please specify a backup file or clone folder\n`); process.exit(1); }
  if (!fs.existsSync(source)) { console.error(`  ${style('ERROR:', C.red)} Not found: ${source}\n`); process.exit(1); }

  const stat = fs.statSync(source);
  if (!opts.force) { const b = backup(path.join(CLAUDE_DIR, 'settings.json')); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}\n`); }

  if (stat.isDirectory()) {
    console.log(`  ${style('Restoring from clone folder...', C.bold)}\n`);
    const items: CloneItem[] = [
      { src: 'settings.json', dest: path.join(CLAUDE_DIR, 'settings.json'), label: 'Settings' },
      { src: 'statusline-command.sh', dest: path.join(CLAUDE_DIR, 'statusline-command.sh'), label: 'Status line' },
      { src: 'skills', dest: path.join(CLAUDE_DIR, 'skills'), label: 'User skills', dir: true },
      { src: 'commands', dest: path.join(CLAUDE_DIR, 'commands'), label: 'User commands', dir: true },
    ];
    let count = 0;
    for (const item of items) {
      const srcPath = path.join(source, item.src);
      if (!fs.existsSync(srcPath)) { console.log(`  ${style('⏭', C.gray)}  ${item.label} — not in backup`); continue; }
      if (item.dir) copyDirRecursive(srcPath, item.dest);
      else { fs.mkdirSync(path.dirname(item.dest), { recursive: true }); fs.copyFileSync(srcPath, item.dest); }
      console.log(`  ${style('✓', C.green)} ${item.label}`);
      count++;
    }
    console.log(`\n  ${style('✓', C.green)} ${style(`${count} items restored`, C.bold)}\n`);
  } else if (source.endsWith('.tar.gz') || source.endsWith('.tgz')) {
    console.log(`  ${style('Restoring from backup...', C.bold)}\n`);
    await progressLine('Extracting backup', () => {
      execFileSync('tar', ['xzf', path.resolve(source), '-C', path.dirname(CLAUDE_DIR)], { stdio: 'pipe' });
    });
    console.log(`\n  ${style('✓', C.green)} ${style('Restore complete', C.bold)}\n`);
  } else {
    console.error(`  ${style('ERROR:', C.red)} Unsupported format\n`);
    process.exit(1);
  }
}

// --- Status ---

export function runStatus(opts: Opts = {}): void {
  renderBanner();
  console.log(`  ${style('Environment Status', C.bold)}\n`);

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath) as Record<string, unknown> | null;

  if (settings) {
    const perms = settings.permissions as { allow?: string[]; deny?: string[] } | undefined;
    const allow = perms?.allow?.length || 0;
    const deny = perms?.deny?.length || 0;
    const plugins = Object.keys((settings.enabledPlugins as Record<string, boolean>) || {}).length;
    console.log(`  ${style('Settings', C.bold)} ${style(settingsPath, C.gray)}`);
    console.log(`    Permissions: ${style(`${allow} allow`, C.green)}, ${style(`${deny} deny`, C.red)}`);
    console.log(`    Plugins:     ${style(`${plugins} enabled`, C.cyan)}`);
    console.log(`    Status line: ${settings.statusLine ? style('configured', C.green) : style('not set', C.gray)}`);
  } else {
    console.log(`  ${style('Settings', C.bold)} ${style('not found', C.red)}`);
  }

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  let skillNames: string[] = [];
  try { skillNames = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch {}

  console.log(`\n  ${style('User Skills', C.bold)} ${style(`(${skillNames.length})`, C.gray)}`);
  for (const name of skillNames.sort()) console.log(`    ${style('•', C.cyan)} ${name}`);
  if (skillNames.length === 0) console.log(`    ${style('(none)', C.gray)}`);

  if (settings?.enabledPlugins) {
    const pluginNames = Object.keys(settings.enabledPlugins as Record<string, boolean>);
    console.log(`\n  ${style('Plugins', C.bold)} ${style(`(${pluginNames.length})`, C.gray)}`);
    for (const name of pluginNames.sort()) console.log(`    ${style('•', C.cyan)} ${name.replace(/@.*$/, '')}`);
  }

  const statuslinePath = path.join(CLAUDE_DIR, 'statusline-command.sh');
  console.log(`\n  ${style('Status Line', C.bold)}`);
  console.log(fs.existsSync(statuslinePath) ? `    ${style('✓', C.green)} ${statuslinePath}` : `    ${style('✗', C.gray)} not installed`);
  console.log('');
}

// --- Doctor ---

export function runDoctor(opts: Opts = {}): void {
  renderBanner();
  console.log(`  ${style('Checking configuration...', C.bold)}\n`);

  const v = opts.verbose ?? false;
  let issues = 0;
  let warnings = 0;
  const ok = (msg: string): void => { console.log(`  ${style('✓', C.green)} ${msg}`); };
  const warn = (msg: string): void => { console.log(`  ${style('!', C.yellow)} ${msg}`); warnings++; };
  const fail = (msg: string): void => { console.log(`  ${style('✗', C.red)} ${msg}`); issues++; };
  const detail = (lines: string[]): void => { if (v) for (const l of lines) console.log(`    ${style(l, C.gray)}`); };

  if (!fs.existsSync(CLAUDE_DIR)) { fail('~/.claude/ not found — run "cup init"'); return; }
  ok('~/.claude/ directory exists');

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath) as Record<string, unknown> | null;
  if (settings) ok('settings.json is valid JSON');
  else if (fs.existsSync(settingsPath)) fail('settings.json is invalid JSON');
  else fail('settings.json not found');

  const perms = (settings?.permissions as { allow?: string[]; deny?: string[] }) || {};
  if (perms.allow?.length) {
    ok(`permissions.allow: ${perms.allow.length} rules`);
    detail(perms.allow);
  } else warn('No allow permissions');
  if (perms.deny?.length) {
    ok(`permissions.deny: ${perms.deny.length} rules`);
    detail(perms.deny);
  } else warn('No deny permissions — destructive commands not blocked');

  const ep = settings?.enabledPlugins as Record<string, boolean> | undefined;
  const pluginNames = ep ? Object.keys(ep) : [];
  if (pluginNames.length > 0) {
    ok(`${pluginNames.length} plugins enabled`);
    detail(pluginNames);
  } else warn('No plugins enabled');

  if (settings?.extraKnownMarketplaces) ok('Marketplace configured');
  else warn('No marketplace configured');

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory());
    if (skills.length > 0) {
      ok(`${skills.length} user skills installed`);
      detail(skills.map(s => s.name));
      let broken = 0;
      for (const s of skills) { if (!fs.existsSync(path.join(skillsDir, s.name, 'SKILL.md'))) { fail(`"${s.name}" missing SKILL.md`); broken++; } }
      if (broken === 0) ok('All skills have valid SKILL.md');
    } else warn('Skills directory is empty');
  } else warn('No skills directory');

  const slPath = path.join(CLAUDE_DIR, 'statusline-command.sh');
  if (fs.existsSync(slPath)) {
    if (fs.statSync(slPath).mode & 0o111) ok('statusline-command.sh is executable');
    else warn('statusline-command.sh not executable');
    if (settings?.statusLine) ok('statusLine configured');
    else warn('statusLine not configured in settings.json');
  }

  try {
    const backups = fs.readdirSync(CLAUDE_DIR).filter(f => f.includes('.bak.'));
    if (backups.length > 5) {
      const totalKB = backups.reduce((sum, f) => {
        try { return sum + fs.statSync(path.join(CLAUDE_DIR, f)).size; } catch { return sum; }
      }, 0);
      warn(`${backups.length} cup backup files (${Math.round(totalKB / 1024)}KB) — created by "cup init/update" before overwriting settings. Run "rm ~/.claude/*.bak.*" to clean up`);
      detail(backups);
    }
  } catch {}

  console.log('');
  if (issues === 0 && warnings === 0) console.log(`  ${style('All checks passed!', C.green, C.bold)}\n`);
  else {
    if (issues > 0) console.log(`  ${style(`${issues} issue(s)`, C.red, C.bold)}`);
    if (warnings > 0) console.log(`  ${style(`${warnings} warning(s)`, C.yellow, C.bold)}`);
    console.log('');
  }
}

// --- Update ---

export async function runUpdate(opts: Opts = {}): Promise<void> {
  renderBanner();
  console.log(`  ${style('Checking for updates...', C.bold)}\n`);

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath) || {} as Record<string, unknown>;
  const preset = loadPreset('user.json');

  // Permissions
  const pAllow = JSON.stringify((preset.permissions.allow || []));
  const lAllow = JSON.stringify(((settings as Record<string, unknown>).permissions as { allow?: string[] })?.allow || []);
  const pDeny = JSON.stringify((preset.permissions.deny || []));
  const lDeny = JSON.stringify(((settings as Record<string, unknown>).permissions as { deny?: string[] })?.deny || []);

  if (opts.force || pAllow !== lAllow || pDeny !== lDeny) {
    console.log(`  ${style('!', C.yellow)} Permissions changed`);
    if (opts.yes || await ask('Update permissions?', true)) {
      (settings as Record<string, unknown>).permissions = preset.permissions;
      writeJson(settingsPath, settings as Record<string, unknown>);
      console.log(`  ${style('✓', C.green)} Permissions updated\n`);
    } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
  } else console.log(`  ${style('–', C.gray)} Permissions (up to date)`);

  // Plugins
  const pPlugins = JSON.stringify(Object.keys(preset.enabledPlugins || {}).sort());
  const lPlugins = JSON.stringify(Object.keys(((settings as Record<string, unknown>).enabledPlugins as Record<string, boolean>) || {}).sort());

  if (opts.force || pPlugins !== lPlugins) {
    console.log(`  ${style('!', C.yellow)} Plugins changed`);
    if (opts.yes || await ask('Update plugins?', true)) {
      (settings as Record<string, unknown>).enabledPlugins = preset.enabledPlugins;
      writeJson(settingsPath, settings as Record<string, unknown>);
      console.log(`  ${style('✓', C.green)} Plugins updated\n`);
    } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
  } else console.log(`  ${style('–', C.gray)} Plugins (up to date)`);

  // Statusline
  const slSrc = path.join(PACKAGE_ROOT, 'statusline-command.sh');
  const slDest = path.join(CLAUDE_DIR, 'statusline-command.sh');
  if (fs.existsSync(slSrc) && fs.existsSync(slDest)) {
    if (!fs.readFileSync(slSrc).equals(fs.readFileSync(slDest))) {
      console.log(`  ${style('!', C.yellow)} Status line changed`);
      if (opts.yes || await ask('Update status line?', true)) {
        fs.copyFileSync(slSrc, slDest);
        console.log(`  ${style('✓', C.green)} Updated\n`);
      } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
    } else console.log(`  ${style('–', C.gray)} Status line (up to date)`);
  }

  // Skills
  let lang = 'en';
  const skillsDest = path.join(CLAUDE_DIR, 'skills');
  try {
    const first = fs.readdirSync(skillsDest, { withFileTypes: true }).find(e => e.isDirectory());
    if (first) {
      const c = fs.readFileSync(path.join(skillsDest, first.name, 'SKILL.md'), 'utf-8');
      if (/[\uAC00-\uD7AF]/.test(c.split('---')[2] || '')) lang = 'ko';
    }
  } catch {}

  console.log(`\n  ${style(`Skills (${lang}):`, C.bold)}`);
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');

  const repoSkills = new Set<string>();
  try { for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) { if (e.isDirectory()) repoSkills.add(e.name); } }
  catch { console.error(`  ${style('ERROR:', C.red)} user-skills/ not found\n`); return; }

  const localSkills = new Set<string>();
  try { for (const e of fs.readdirSync(skillsDest, { withFileTypes: true })) { if (e.isDirectory()) localSkills.add(e.name); } }
  catch {}

  const newSkills: string[] = [], changedSkills: string[] = [], upToDate: string[] = [], removedSkills: string[] = [];

  for (const name of repoSkills) {
    if (!localSkills.has(name)) newSkills.push(name);
    else if (opts.force || isDirChanged(path.join(skillsSrc, name), path.join(skillsDest, name))) changedSkills.push(name);
    else upToDate.push(name);
  }
  for (const name of localSkills) { if (!repoSkills.has(name)) removedSkills.push(name); }

  for (const n of upToDate) console.log(`  ${style('–', C.gray)} ${style(n, C.gray)} (up to date)`);
  for (const n of changedSkills) console.log(`  ${style('!', C.yellow)} ${n} (changed)`);
  for (const n of newSkills) console.log(`  ${style('+', C.green)} ${n} (new)`);
  for (const n of removedSkills) console.log(`  ${style('?', C.yellow)} ${n} (local only)`);

  if (changedSkills.length > 0 && (opts.yes || await ask(`Update ${changedSkills.length} changed skill(s)?`, true))) {
    for (const n of changedSkills) { copySkillWithLang(path.join(skillsSrc, n), path.join(skillsDest, n), lang); console.log(`  ${style('✓', C.green)} ${n} updated`); }
  }
  if (newSkills.length > 0 && (opts.yes || await ask(`Install ${newSkills.length} new skill(s)?`, true))) {
    for (const n of newSkills) { copySkillWithLang(path.join(skillsSrc, n), path.join(skillsDest, n), lang); console.log(`  ${style('✓', C.green)} ${n} added`); }
  }
  if (removedSkills.length > 0 && (opts.yes || await ask(`Remove ${removedSkills.length} local-only skill(s)?`, false))) {
    for (const n of removedSkills) { fs.rmSync(path.join(skillsDest, n), { recursive: true }); console.log(`  ${style('✗', C.red)} ${n} removed`); }
  }

  console.log(`\n  ${style('✓', C.green)} ${style('Update check complete', C.bold)}\n`);
}

// --- Sessions ---

function getSessionList(opts: Opts = {}): SessionInfo[] {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const projects = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory());

  let cwd: string;
  try { cwd = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim(); }
  catch { cwd = process.cwd(); }
  const cwdEncoded = cwd.replace(/\//g, '-');

  const sessions: SessionInfo[] = [];

  for (const proj of projects) {
    const projPath = path.join(projectsDir, proj.name);
    const projName = proj.name.replace(/^-home-[^-]+-(Workspace-|Garage-)?/, '').replace(/^-/, '') || proj.name;

    if (opts.project) { if (!projName.toLowerCase().includes(opts.project.toLowerCase())) continue; }
    else if (!opts.all) { if (!proj.name.includes(cwdEncoded.slice(1))) continue; }

    let files: string[];
    try { files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }

    for (const file of files) {
      const filePath = path.join(projPath, file);
      try {
        const stat = fs.statSync(filePath);
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4000);
        fs.readSync(fd, buf, 0, 4000, 0);
        fs.closeSync(fd);

        let firstMessage = '';
        for (const line of buf.toString('utf-8').split('\n')) {
          try {
            const obj = JSON.parse(line);
            if (obj.type === 'user' && obj.message?.content) {
              const content = typeof obj.message.content === 'string' ? obj.message.content : JSON.stringify(obj.message.content);
              if (content.startsWith('<local-command-caveat>') || content.startsWith('<command-')) continue;
              firstMessage = content.replace(/<[^>]+>/g, '').trim().slice(0, 80);
              break;
            }
          } catch {}
        }

        sessions.push({ id: file.replace('.jsonl', ''), project: projName, date: stat.mtime, size: stat.size, firstMessage: firstMessage || '(empty)' });
      } catch {}
    }
  }

  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return sessions.slice(0, opts.limit || 10);
}

export function runSessions(opts: Opts = {}): void {
  renderBanner();
  const sessions = getSessionList(opts);
  if (sessions.length === 0) { console.log(`  ${style('No sessions found.', C.gray)}\n`); return; }

  const scope = opts.all ? 'all projects' : opts.project || 'current project';
  console.log(`  ${style(`Recent sessions (${scope}):`, C.bold)}\n`);

  for (const s of sessions) {
    const date = s.date.toISOString().slice(0, 16).replace('T', ' ');
    const sizeStr = s.size > 1048576 ? `${(s.size / 1048576).toFixed(1)}MB` : `${(s.size / 1024).toFixed(0)}KB`;
    const msg = s.firstMessage.length > 60 ? s.firstMessage.slice(0, 60) + '...' : s.firstMessage;
    console.log(`  ${style(date, C.gray)}  ${style(s.id.slice(0, 8), C.gray)}  ${style(s.project, C.cyan)}`);
    console.log(`    ${style(msg, C.dim)}  ${style(sizeStr, C.gray)}`);
  }

  console.log(`\n  ${style('Resume:', C.gray)} ${style('cup resume <id>', C.cyan)}\n`);
}

// --- Resume ---

export async function runResume(sessionId: string | undefined, opts: Opts = {}): Promise<void> {
  if (!sessionId) {
    const sessions = getSessionList({ ...opts, all: true, limit: 20 });
    if (sessions.length === 0) { console.error(`  ${style('No sessions found.', C.red)}\n`); return; }

    const items: CheckboxItem[] = sessions.map(s => ({
      name: s.id,
      desc: `${s.date.toISOString().slice(0, 10)} ${s.project} — ${s.firstMessage.slice(0, 40)}`,
    }));

    renderBanner();
    console.log(`  ${style('Select a session to resume:', C.bold)}\n`);
    const selected = await checkbox(items);
    if (!selected || selected.length === 0) return;
    sessionId = selected[0];
  }

  if (sessionId.length < 36) {
    const sessions = getSessionList({ all: true, limit: 100 });
    const match = sessions.find(s => s.id.startsWith(sessionId!));
    if (match) sessionId = match.id;
    else { console.error(`  ${style('Session not found:', C.red)} ${sessionId}\n`); return; }
  }

  console.log(`\n  ${style('Resuming:', C.bold)} ${style(sessionId.slice(0, 8) + '...', C.cyan)}`);
  if (opts.fork) console.log(`  ${style('(forked)', C.gray)}`);
  console.log('');

  const claudeArgs = ['--resume', sessionId];
  if (opts.fork) claudeArgs.push('--fork-session');

  try { execFileSync('claude', claudeArgs, { stdio: 'inherit' }); }
  catch (err: unknown) { if ((err as { status?: number }).status) process.exit((err as { status: number }).status); }
}

// --- CLAUDE.md management ---

const CUP_START = '<!-- <cup> — managed by claude-up, do not edit manually -->';
const CUP_END = '<!-- </cup> -->';

function getCupContent(): string {
  const templatePath = path.join(PACKAGE_ROOT, 'presets', 'claude-md.md');
  return fs.readFileSync(templatePath, 'utf-8').trim();
}

function hasCupBlock(content: string): boolean {
  return content.includes(CUP_START) && content.includes(CUP_END);
}

function extractCupBlock(content: string): string {
  const startIdx = content.indexOf(CUP_START);
  const endIdx = content.indexOf(CUP_END);
  if (startIdx === -1 || endIdx === -1) return '';
  return content.slice(startIdx, endIdx + CUP_END.length);
}

function removeCupBlock(content: string): string {
  const startIdx = content.indexOf(CUP_START);
  const endIdx = content.indexOf(CUP_END);
  if (startIdx === -1 || endIdx === -1) return content;
  return (content.slice(0, startIdx) + content.slice(endIdx + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
}

export async function installClaudeMd(useDefaults: boolean): Promise<SummaryResult> {
  const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
  const cupContent = getCupContent();

  const existing = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf-8') : '';

  if (hasCupBlock(existing)) {
    const currentBlock = extractCupBlock(existing);
    if (currentBlock.trim() === cupContent.trim()) {
      return { ok: true, label: 'CLAUDE.md', detail: 'up to date' };
    }

    // Block exists but content changed — check if user modified it
    let install = useDefaults;
    if (!useDefaults) {
      install = await ask('CLAUDE.md cup section has updates. Apply?', true);
    }

    if (install) {
      const updated = existing.replace(currentBlock, cupContent);
      fs.writeFileSync(claudeMdPath, updated);
      return { ok: true, label: 'CLAUDE.md', detail: 'updated' };
    }
    return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
  }

  // No cup block yet — append
  let install = useDefaults;
  if (!useDefaults) {
    install = await ask('Add claude-up section to CLAUDE.md?', true);
  }

  if (install) {
    const newContent = existing ? existing.trimEnd() + '\n\n' + cupContent + '\n' : cupContent + '\n';
    fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
    fs.writeFileSync(claudeMdPath, newContent);
    return { ok: true, label: 'CLAUDE.md', detail: 'installed' };
  }
  return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
}

// --- Uninstall ---

export async function runUninstall(opts: Opts = {}): Promise<void> {
  renderBanner();
  console.log(`  ${style('Uninstalling claude-up...', C.bold)}\n`);

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const skillsDest = path.join(CLAUDE_DIR, 'skills');
  const statuslineDest = path.join(CLAUDE_DIR, 'statusline-command.sh');
  const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');

  // 1. Remove cup block from CLAUDE.md
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (hasCupBlock(content)) {
      const cleaned = removeCupBlock(content);
      if (cleaned !== content) {
        if (opts.yes || await ask('Remove claude-up section from CLAUDE.md?', true)) {
          fs.writeFileSync(claudeMdPath, cleaned + '\n');
          console.log(`  ${style('✓', C.green)} CLAUDE.md — cup section removed`);
        } else {
          console.log(`  ${style('⏭', C.gray)}  CLAUDE.md skipped`);
        }
      }
    }
  }

  // 2. Remove skills
  if (fs.existsSync(skillsDest)) {
    const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
    const repoSkills = new Set<string>();
    try {
      for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
        if (e.isDirectory()) repoSkills.add(e.name);
      }
    } catch {}

    const localSkills = fs.readdirSync(skillsDest, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    const cupSkills = localSkills.filter(s => repoSkills.has(s));
    const userSkills = localSkills.filter(s => !repoSkills.has(s));

    if (cupSkills.length > 0) {
      if (opts.yes || await ask(`Remove ${cupSkills.length} claude-up skills?`, true)) {
        for (const name of cupSkills) {
          fs.rmSync(path.join(skillsDest, name), { recursive: true });
        }
        console.log(`  ${style('✓', C.green)} ${cupSkills.length} skills removed`);
      } else {
        console.log(`  ${style('⏭', C.gray)}  Skills skipped`);
      }
    }

    if (userSkills.length > 0) {
      console.log(`  ${style('ℹ', C.cyan)} ${userSkills.length} user-created skill(s) kept: ${userSkills.join(', ')}`);
    }
  }

  // 3. Remove statusline
  if (fs.existsSync(statuslineDest)) {
    if (opts.yes || await ask('Remove status line?', true)) {
      fs.unlinkSync(statuslineDest);

      // Remove statusLine from settings
      const settings = readJson(settingsPath);
      if (settings && (settings as Record<string, unknown>).statusLine) {
        delete (settings as Record<string, unknown>).statusLine;
        writeJson(settingsPath, settings);
      }
      console.log(`  ${style('✓', C.green)} Status line removed`);
    } else {
      console.log(`  ${style('⏭', C.gray)}  Status line skipped`);
    }
  }

  // 4. Clean settings (permissions, plugins) — ask because user may have customized
  const settings = readJson(settingsPath);
  if (settings) {
    const modified = { ...(settings as Record<string, unknown>) };
    let changed = false;

    if (modified.permissions) {
      if (opts.yes || await ask('Reset permissions to empty?', false)) {
        delete modified.permissions;
        changed = true;
        console.log(`  ${style('✓', C.green)} Permissions removed`);
      } else {
        console.log(`  ${style('⏭', C.gray)}  Permissions kept (user may have customized)`);
      }
    }

    if (modified.enabledPlugins) {
      if (opts.yes || await ask('Remove plugin list? (plugins stay installed)', false)) {
        delete modified.enabledPlugins;
        delete modified.extraKnownMarketplaces;
        changed = true;
        console.log(`  ${style('✓', C.green)} Plugin list removed`);
      } else {
        console.log(`  ${style('⏭', C.gray)}  Plugins kept`);
      }
    }

    if (changed) writeJson(settingsPath, modified);
  }

  console.log(`\n  ${style('✓', C.green)} ${style('Uninstall complete', C.bold)}`);
  console.log(`  ${style('Note:', C.gray)} settings.json and ~/.claude/ directory are preserved.\n`);
}
