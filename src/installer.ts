import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import { renderBanner, renderStep, progressLine, ask, checkbox, renderSummary, renderDone, C, style } from './ui';
import type { SummaryResult, CheckboxItem } from './ui';
import { readJson, writeJson, copyDirRecursive, isDirChanged, backup, timestamp, humanTimestamp, PACKAGE_ROOT, HOME_DIR } from './utils';
import { resolveProviders, getProvider } from './providers/registry';
import type { Provider, SecurityLevelConfig } from './providers/types';
import { applyGuidanceCategories, getGuidanceCategories, parseCategories as parseGuidanceCategories, InvalidCategoriesError } from './guidance';

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
  provider?: string;
  level?: string;
  type?: string;
  categories?: string;
}

interface CloneItem {
  src: string;
  dest: string;
  label: string;
  dir?: boolean;
}

// --- Backward compat exports (used by sync.ts) ---

export const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
export { readJson, writeJson, isDirChanged, backup, PACKAGE_ROOT };

// --- Main: init ---

export async function runInit(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log(`  ${style('No LLM CLI tools detected.', C.red)} Install Claude Code, Gemini CLI, or Codex CLI first.\n`);
    process.exit(1);
  }

  if (providers.length > 1) {
    console.log(`  ${style('Detected:', C.bold)} ${providers.map(p => p.displayName).join(', ')}\n`);
  }

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

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`\n  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }

    try {
      const zipPath = await createCupBackup(provider);
      if (zipPath) console.log(`\n  ${style('💾', C.gray)} ${style('Cup backup: ' + zipPath, C.gray)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`\n  ${style('⚠', C.yellow)} ${style('Cup backup skipped: ' + msg, C.gray)}`);
    }

    const steps = provider.getInitSteps();
    const totalSteps = steps.length + 2; // +1 security, +1 guidance
    const results: SummaryResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      renderStep(i + 1, totalSteps, steps[i].label);
      const result = await steps[i].execute(useDefaults, lang);
      results.push({ ok: result.ok, label: result.label, detail: result.detail });
    }

    // Security step: auto-applied at level=normal unless --level overrides
    renderStep(steps.length + 1, totalSteps, 'Security');
    const securityResult = applySecurityToProvider(provider, opts.level || 'normal');
    results.push({ ok: securityResult.ok, label: securityResult.label, detail: securityResult.detail });

    // Guidance step: apply selected categories (default: all)
    renderStep(totalSteps, totalSteps, 'Guidance');
    const guidanceResult = await applyGuidanceToProvider(provider, opts, useDefaults);
    results.push({ ok: guidanceResult.ok, label: guidanceResult.label, detail: guidanceResult.detail });

    renderSummary(results);
  }

  renderDone(providers.map(p => p.name));
}

function applySecurityToProvider(provider: Provider, level: string): SummaryResult {
  const validLevels = ['loose', 'normal', 'strict'];
  const lvl = validLevels.includes(level) ? level : 'normal';
  const presetPath = path.join(PACKAGE_ROOT, 'presets', 'security', `${lvl}.json`);
  const config = readJson(presetPath) as unknown as SecurityLevelConfig | null;
  if (!config) {
    return { ok: false, label: 'Security', detail: `preset missing: ${lvl}` };
  }

  provider.applySecurityLevel(config);

  if (lvl !== 'loose') {
    const blockFile = lvl === 'strict' ? 'strict-md.md' : 'normal-md.md';
    const blockPath = path.join(PACKAGE_ROOT, 'presets', 'security', blockFile);
    try {
      const block = fs.readFileSync(blockPath, 'utf-8').trim();
      provider.writeSecurityBlock(block);
    } catch {}
  } else {
    provider.removeSecurityBlock();
  }

  return { ok: true, label: 'Security', detail: `level: ${lvl}` };
}

async function applyGuidanceToProvider(provider: Provider, opts: Opts, useDefaults: boolean): Promise<SummaryResult> {
  const all = getGuidanceCategories();

  let ids: string[];
  if (opts.categories) {
    try { ids = parseGuidanceCategories(opts.categories, all); }
    catch (err) {
      if (err instanceof InvalidCategoriesError) return { ok: false, label: 'Guidance', detail: `unknown: ${err.invalid.join(', ')}` };
      throw err;
    }
  } else if (useDefaults) {
    ids = all.map(c => c.id);
  } else {
    const items: CheckboxItem[] = all.map(c => ({ name: c.id, desc: c.description }));
    console.log(`\n  ${style('Select guidance categories to install:', C.bold)}`);
    ids = await checkbox(items);
  }

  if (ids.length === 0) return { ok: true, label: 'Guidance', detail: 'skipped' };

  applyGuidanceCategories(provider, ids);
  return { ok: true, label: 'Guidance', detail: ids.join(', ') };
}

// --- Install ---

export async function runInstall(target: string | undefined, opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);
  const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
  const lang = opts.lang || (sysLocale.startsWith('ko') ? 'ko' : 'en');

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`\n  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }

    switch (target) {
      case 'skills': {
        console.log(`  ${style('Installing skills...', C.bold)}\n`);
        const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
        const available = provider.getAvailableSkillsFromRepo();
        const names = available.map(s => s.name);
        for (const name of names) {
          provider.installSkill(path.join(skillsSrc, name), name, lang);
        }
        console.log(`\n  ${style('✓', C.green)} ${style(`${names.length} skills installed (${lang})`, C.bold)}\n`);
        break;
      }
      case 'plugins': {
        console.log(`  ${style('Applying plugins...', C.bold)}\n`);
        if (!opts.force) { const b = provider.backupSettings(); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }
        const available = provider.getAvailablePlugins();
        provider.enablePlugins(available.map(p => p.id));
        console.log(`  ${style('✓', C.green)} ${available.length} plugins enabled`);
        console.log(`\n  ${style('⚠️  Plugins will be auto-installed on next session.', C.yellow)}\n`);
        break;
      }
      case 'permissions': {
        console.log(`  ${style('Applying permissions...', C.bold)}\n`);
        if (!opts.force) { const b = provider.backupSettings(); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }
        provider.mergePermissions({ allow: [], deny: [] }); // uses preset internally
        const perms = provider.getCurrentPermissions();
        console.log(`  ${style('✓', C.green)} ${perms.allow.length} allow, ${perms.deny.length} deny\n`);
        break;
      }
      case 'statusline': {
        if (!provider.installStatusLine) {
          console.log(`  ${style('⏭', C.gray)}  Status line not available for ${provider.displayName}\n`);
          break;
        }
        console.log(`  ${style('Installing status line...', C.bold)}\n`);
        provider.installStatusLine();
        console.log(`  ${style('✓', C.green)} Status line installed\n`);
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
}

// --- Project Init ---

export function runProjectInit(opts: Opts = {}): void {
  console.log('\nclaude-up project-init\n');
  let projectRoot: string;
  try { projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim(); }
  catch { projectRoot = process.cwd(); }

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }

    const settingsPath = provider.getProjectSettingsPath(projectRoot);
    if (!opts.force) { const b = backup(settingsPath); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}`); }

    // Load project preset for this provider
    const presetPath = path.join(PACKAGE_ROOT, 'presets', 'project', `${provider.name}.json`);
    const preset = readJson(presetPath);
    if (!preset) {
      console.log(`  ${style('⏭', C.gray)}  No project preset for ${provider.displayName}`);
      continue;
    }

    const existing = readJson(settingsPath) || {};
    writeJson(settingsPath, { ...existing, permissions: (preset as Record<string, unknown>).permissions });

    console.log(`\n  ${style('Project:', C.bold)} ${style(projectRoot, C.cyan)}`);
    const perms = (preset as Record<string, unknown>).permissions as { allow?: string[] };
    console.log(`  ${style('✓', C.green)} allow: ${(perms.allow || []).join(', ')}`);

    // Copy project skills
    const copiedSkills: string[] = [];
    const skillsSrc = path.join(PACKAGE_ROOT, 'project-skills');
    const claudeDir = path.join(projectRoot, provider.projectDir);
    const skillsDest = path.join(claudeDir, 'skills');
    try {
      for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        copyDirRecursive(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
        copiedSkills.push(entry.name);
      }
    } catch {}

    if (copiedSkills.length > 0) console.log(`\n  ${style('✓', C.green)} ${copiedSkills.length} project skills installed`);
  }

  console.log('\n  Done!\n');
}

// --- Clone ---

export async function runClone(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    const label = providers.length > 1 ? ` (${provider.displayName})` : '';
    console.log(`  ${style(`Exporting${label} current environment...`, C.bold)}\n`);

    const outDir = opts.output || path.join(process.cwd(), `${provider.name}-env-${timestamp()}`);
    fs.mkdirSync(outDir, { recursive: true });

    const items: CloneItem[] = [
      { src: path.join(provider.homeDir, provider.settingsFileName), dest: provider.settingsFileName, label: 'Settings' },
      { src: path.join(provider.homeDir, 'skills'), dest: 'skills', label: 'User skills', dir: true },
    ];

    // Claude-specific items
    if (provider.name === 'claude') {
      items.splice(1, 0, { src: path.join(provider.homeDir, 'statusline-command.sh'), dest: 'statusline-command.sh', label: 'Status line' });
      items.push({ src: path.join(provider.homeDir, 'commands'), dest: 'commands', label: 'User commands', dir: true });
    }

    let count = 0;
    for (const item of items) {
      if (!fs.existsSync(item.src)) { console.log(`  ${style('⏭', C.gray)}  ${item.label} — not found`); continue; }
      const destPath = path.join(outDir, item.dest);
      if (item.dir) copyDirRecursive(item.src, destPath);
      else fs.copyFileSync(item.src, destPath);
      console.log(`  ${style('✓', C.green)} ${item.label}`);
      count++;
    }

    // Claude: installed plugins list
    if (provider.name === 'claude') {
      const pluginsFile = path.join(provider.homeDir, 'plugins', 'installed_plugins.json');
      if (fs.existsSync(pluginsFile)) {
        fs.mkdirSync(path.join(outDir, 'plugins'), { recursive: true });
        fs.copyFileSync(pluginsFile, path.join(outDir, 'plugins', 'installed_plugins.json'));
        console.log(`  ${style('✓', C.green)} Installed plugins list`);
        count++;
      }
    }

    console.log(`\n  ${style('✓', C.green)} ${style(`${count} items exported to:`, C.bold)}`);
    console.log(`  ${style(outDir, C.cyan)}\n`);
  }
}

// --- Backup ---

function getRepoSkillNames(): Set<string> {
  const names = new Set<string>();
  try {
    for (const e of fs.readdirSync(path.join(PACKAGE_ROOT, 'user-skills'), { withFileTypes: true })) {
      if (e.isDirectory()) names.add(e.name);
    }
  } catch {}
  return names;
}

/** Returns HOME_DIR-relative paths for files/dirs that `cup init` creates or modifies. */
function getCupManagedRelPaths(provider: Provider): string[] {
  const rel = (abs: string): string => path.relative(HOME_DIR, abs);
  const result: string[] = [];

  const settingsPath = path.join(provider.homeDir, provider.settingsFileName);
  if (fs.existsSync(settingsPath)) result.push(rel(settingsPath));

  if (provider.hasStatusLine) {
    const slPath = path.join(provider.homeDir, 'statusline-command.sh');
    if (fs.existsSync(slPath)) result.push(rel(slPath));
  }

  try {
    const instrPath = provider.getInstructionFilePath('global');
    if (fs.existsSync(instrPath)) result.push(rel(instrPath));
  } catch {}

  const repoSkills = getRepoSkillNames();
  for (const name of provider.getInstalledSkills()) {
    if (repoSkills.has(name)) {
      const skillPath = path.join(provider.skillsDir, name);
      if (fs.existsSync(skillPath)) result.push(rel(skillPath));
    }
  }

  return result.filter(p => !p.startsWith('..'));
}

/** Creates a cup-scope zip backup at ~/.claude/cup/backups/<timestamp>.zip. Returns the zip path, or null if nothing to back up. */
export async function createCupBackup(provider: Provider, outputOverride?: string): Promise<string | null> {
  const relPaths = getCupManagedRelPaths(provider);
  if (relPaths.length === 0) return null;

  const backupsDir = path.join(provider.homeDir, 'cup', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const zipPath = outputOverride || path.join(backupsDir, `${humanTimestamp()}.zip`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  await progressLine(`Zipping cup files → ${path.basename(zipPath)}`, () => {
    execFileSync('zip', ['-rq', zipPath, ...relPaths], { cwd: HOME_DIR, stdio: 'pipe' });
  });

  return zipPath;
}

export async function runBackup(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);
  const type = opts.type || 'all';
  if (type !== 'all' && type !== 'cup') {
    console.error(`  ${style('ERROR:', C.red)} --type must be "all" or "cup"\n`);
    process.exit(1);
  }

  for (const provider of providers) {
    if (type === 'cup') {
      console.log(`  ${style(`Creating ${provider.displayName} cup backup...`, C.bold)}\n`);
      const zipPath = await createCupBackup(provider, opts.output);
      if (!zipPath) {
        console.log(`  ${style('ℹ', C.cyan)} Nothing to back up — no cup-managed files found.\n`);
        continue;
      }
      const size = fs.statSync(zipPath).size;
      const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
      console.log(`\n  ${style('✓', C.green)} ${style('Cup backup created:', C.bold)} ${style(zipPath, C.cyan)}`);
      console.log(`  ${style('Size:', C.gray)} ${sizeStr}\n`);
      continue;
    }

    const tarPath = opts.output || path.join(process.cwd(), `${provider.name}-backup-${timestamp()}.tar.gz`);
    console.log(`  ${style(`Creating ${provider.displayName} backup...`, C.bold)}\n`);

    const excludes = provider.getBackupExcludes();
    const excludeArgs = excludes.flatMap(e => ['--exclude', e]);

    await progressLine(`Compressing ~/${path.basename(provider.homeDir)}/`, () => {
      execFileSync('tar', [...excludeArgs, '-czf', tarPath, '-C', path.dirname(provider.homeDir), path.basename(provider.homeDir)], { stdio: 'pipe' });
    });

    const size = fs.statSync(tarPath).size;
    const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
    console.log(`\n  ${style('✓', C.green)} ${style('Backup created:', C.bold)} ${style(path.basename(tarPath), C.cyan)}`);
    console.log(`  ${style('Size:', C.gray)} ${sizeStr}\n`);
  }
}

// --- Restore ---

export async function runRestore(source: string | undefined, opts: Opts = {}): Promise<void> {
  renderBanner();

  const type = opts.type || 'all';
  if (type !== 'all' && type !== 'cup') {
    console.error(`  ${style('ERROR:', C.red)} --type must be "all" or "cup"\n`);
    process.exit(1);
  }

  const provider = opts.provider ? resolveProviders(opts.provider)[0] : getProvider('claude');

  if (type === 'cup') {
    if (!source) {
      const backupsDir = path.join(provider.homeDir, 'cup', 'backups');
      if (!fs.existsSync(backupsDir)) {
        console.error(`  ${style('ERROR:', C.red)} No cup backups directory: ${backupsDir}\n`);
        process.exit(1);
      }
      const zips = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip')).sort();
      if (zips.length === 0) {
        console.error(`  ${style('ERROR:', C.red)} No .zip backups found in ${backupsDir}\n`);
        process.exit(1);
      }
      source = path.join(backupsDir, zips[zips.length - 1]);
      console.log(`  ${style('Using latest:', C.gray)} ${style(source, C.cyan)}\n`);
    }
    if (!fs.existsSync(source)) { console.error(`  ${style('ERROR:', C.red)} Not found: ${source}\n`); process.exit(1); }

    if (!opts.force) { const b = provider.backupSettings(); if (b) console.log(`  ${style('💾', C.gray)} ${style('Safety backup: ' + b, C.gray)}\n`); }
    console.log(`  ${style('Restoring cup backup...', C.bold)}\n`);
    await progressLine('Extracting zip', () => {
      execFileSync('unzip', ['-oq', path.resolve(source!), '-d', HOME_DIR], { stdio: 'pipe' });
    });
    console.log(`\n  ${style('✓', C.green)} ${style('Cup restore complete', C.bold)}\n`);
    return;
  }

  if (!source) { console.error(`  ${style('ERROR:', C.red)} Please specify a backup file or clone folder\n`); process.exit(1); }
  if (!fs.existsSync(source)) { console.error(`  ${style('ERROR:', C.red)} Not found: ${source}\n`); process.exit(1); }

  const stat = fs.statSync(source);
  if (!opts.force) { const b = provider.backupSettings(); if (b) console.log(`  ${style('💾', C.gray)} ${style('Backup: ' + b, C.gray)}\n`); }

  if (stat.isDirectory()) {
    console.log(`  ${style('Restoring from clone folder...', C.bold)}\n`);
    const items: CloneItem[] = [
      { src: provider.settingsFileName, dest: path.join(provider.homeDir, provider.settingsFileName), label: 'Settings' },
      { src: 'statusline-command.sh', dest: path.join(provider.homeDir, 'statusline-command.sh'), label: 'Status line' },
      { src: 'skills', dest: path.join(provider.homeDir, 'skills'), label: 'User skills', dir: true },
      { src: 'commands', dest: path.join(provider.homeDir, 'commands'), label: 'User commands', dir: true },
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
      execFileSync('tar', ['xzf', path.resolve(source), '-C', path.dirname(provider.homeDir)], { stdio: 'pipe' });
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

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style('Environment Status', C.bold)}\n`);
    }

    const settings = provider.readSettings();

    if (settings) {
      const perms = provider.getCurrentPermissions();
      const plugins = provider.getEnabledPlugins();
      console.log(`  ${style('Settings', C.bold)} ${style(provider.getSettingsPath(), C.gray)}`);
      console.log(`    Permissions: ${style(`${perms.allow.length} allow`, C.green)}, ${style(`${perms.deny.length} deny`, C.red)}`);
      console.log(`    Plugins:     ${style(`${plugins.length} enabled`, C.cyan)}`);
      if (provider.hasStatusLine) {
        console.log(`    Status line: ${provider.hasStatusLine() ? style('configured', C.green) : style('not set', C.gray)}`);
      }
    } else {
      console.log(`  ${style('Settings', C.bold)} ${style('not found', C.red)}`);
    }

    const skills = provider.getInstalledSkills();
    console.log(`\n  ${style('User Skills', C.bold)} ${style(`(${skills.length})`, C.gray)}`);
    for (const name of skills.sort()) console.log(`    ${style('•', C.cyan)} ${name}`);
    if (skills.length === 0) console.log(`    ${style('(none)', C.gray)}`);

    const plugins = provider.getEnabledPlugins();
    if (plugins.length > 0) {
      console.log(`\n  ${style('Plugins', C.bold)} ${style(`(${plugins.length})`, C.gray)}`);
      for (const name of plugins.sort()) console.log(`    ${style('•', C.cyan)} ${name.replace(/@.*$/, '')}`);
    }

    if (provider.hasStatusLine) {
      const statuslinePath = path.join(provider.homeDir, 'statusline-command.sh');
      console.log(`\n  ${style('Status Line', C.bold)}`);
      console.log(fs.existsSync(statuslinePath) ? `    ${style('✓', C.green)} ${statuslinePath}` : `    ${style('✗', C.gray)} not installed`);
    }

    console.log('');
  }
}

// --- Doctor ---

export function runDoctor(opts: Opts = {}): void {
  renderBanner();

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style('Checking configuration...', C.bold)}\n`);
    }

    const v = opts.verbose ?? false;
    let issues = 0;
    let warnings = 0;
    const ok = (msg: string): void => { console.log(`  ${style('✓', C.green)} ${msg}`); };
    const warn = (msg: string): void => { console.log(`  ${style('!', C.yellow)} ${msg}`); warnings++; };
    const fail = (msg: string): void => { console.log(`  ${style('✗', C.red)} ${msg}`); issues++; };
    const detail = (lines: string[]): void => { if (v) for (const l of lines) console.log(`    ${style(l, C.gray)}`); };

    if (!fs.existsSync(provider.homeDir)) { fail(`~/${path.basename(provider.homeDir)}/ not found — run "cup init"`); continue; }
    ok(`~/${path.basename(provider.homeDir)}/ directory exists`);

    const settings = provider.readSettings();
    if (settings) ok(`${provider.settingsFileName} is valid`);
    else if (fs.existsSync(provider.getSettingsPath())) fail(`${provider.settingsFileName} is invalid`);
    else fail(`${provider.settingsFileName} not found`);

    const perms = provider.getCurrentPermissions();
    if (perms.allow.length) {
      ok(`permissions allow: ${perms.allow.length} rules`);
      detail(perms.allow);
    } else warn('No allow permissions');
    if (perms.deny.length) {
      ok(`permissions deny: ${perms.deny.length} rules`);
      detail(perms.deny);
    } else warn('No deny permissions — destructive commands not blocked');

    const plugins = provider.getEnabledPlugins();
    if (plugins.length > 0) {
      ok(`${plugins.length} plugins enabled`);
      detail(plugins);
    } else warn('No plugins enabled');

    // Claude-specific: marketplace check
    if (provider.name === 'claude' && settings) {
      if (settings.extraKnownMarketplaces) ok('Marketplace configured');
      else warn('No marketplace configured');
    }

    const skills = provider.getInstalledSkills();
    if (skills.length > 0) {
      ok(`${skills.length} user skills installed`);
      detail(skills);
      let broken = 0;
      for (const s of skills) {
        if (!fs.existsSync(path.join(provider.skillsDir, s, 'SKILL.md'))) { fail(`"${s}" missing SKILL.md`); broken++; }
      }
      if (broken === 0) ok('All skills have valid SKILL.md');
    } else warn('Skills directory is empty or missing');

    // Claude-specific: statusline check
    if (provider.hasStatusLine) {
      const slPath = path.join(provider.homeDir, 'statusline-command.sh');
      if (fs.existsSync(slPath)) {
        if (fs.statSync(slPath).mode & 0o111) ok('statusline-command.sh is executable');
        else warn('statusline-command.sh not executable');
        if (settings?.statusLine) ok('statusLine configured');
        else warn('statusLine not configured in settings');
      }
    }

    // Backup file warning
    try {
      const backups = fs.readdirSync(provider.homeDir).filter(f => f.includes('.bak.'));
      if (backups.length > 5) {
        const totalKB = backups.reduce((sum, f) => {
          try { return sum + fs.statSync(path.join(provider.homeDir, f)).size; } catch { return sum; }
        }, 0);
        warn(`${backups.length} cup backup files (${Math.round(totalKB / 1024)}KB) — created by "cup init/update" before overwriting settings. Run "rm ~/${path.basename(provider.homeDir)}/*.bak.*" to clean up`);
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
}

// --- Update ---

export async function runUpdate(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style('Checking for updates...', C.bold)}\n`);
    }

    // Permissions update
    const presetPath = path.join(PACKAGE_ROOT, 'presets', `${provider.name}.json`);
    const preset = readJson(presetPath) as Record<string, unknown> | null;
    if (preset?.permissions) {
      const pPerms = JSON.stringify(preset.permissions);
      const settings = provider.readSettings() || {};
      const lPerms = JSON.stringify(settings.permissions || {});
      if (opts.force || pPerms !== lPerms) {
        console.log(`  ${style('!', C.yellow)} Permissions changed`);
        if (opts.yes || await ask('Update permissions?', true)) {
          provider.mergePermissions({ allow: [], deny: [] });
          console.log(`  ${style('✓', C.green)} Permissions updated\n`);
        } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
      } else console.log(`  ${style('–', C.gray)} Permissions (up to date)`);

      // Plugins
      if (preset.enabledPlugins) {
        const pPlugins = JSON.stringify(Object.keys(preset.enabledPlugins as Record<string, boolean>).sort());
        const lPlugins = JSON.stringify(provider.getEnabledPlugins().sort());
        if (opts.force || pPlugins !== lPlugins) {
          console.log(`  ${style('!', C.yellow)} Plugins changed`);
          if (opts.yes || await ask('Update plugins?', true)) {
            provider.enablePlugins(Object.keys(preset.enabledPlugins as Record<string, boolean>));
            console.log(`  ${style('✓', C.green)} Plugins updated\n`);
          } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
        } else console.log(`  ${style('–', C.gray)} Plugins (up to date)`);
      }
    }

    // Statusline
    if (provider.installStatusLine) {
      const slSrc = path.join(PACKAGE_ROOT, 'statusline-command.sh');
      const slDest = path.join(provider.homeDir, 'statusline-command.sh');
      if (fs.existsSync(slSrc) && fs.existsSync(slDest)) {
        if (!fs.readFileSync(slSrc).equals(fs.readFileSync(slDest))) {
          console.log(`  ${style('!', C.yellow)} Status line changed`);
          if (opts.yes || await ask('Update status line?', true)) {
            provider.installStatusLine();
            console.log(`  ${style('✓', C.green)} Updated\n`);
          } else console.log(`  ${style('⏭', C.gray)}  Skipped\n`);
        } else console.log(`  ${style('–', C.gray)} Status line (up to date)`);
      }
    }

    // Skills
    let lang = 'en';
    try {
      const installed = provider.getInstalledSkills();
      if (installed.length > 0) {
        const c = fs.readFileSync(path.join(provider.skillsDir, installed[0], 'SKILL.md'), 'utf-8');
        if (/[\uAC00-\uD7AF]/.test(c.split('---')[2] || '')) lang = 'ko';
      }
    } catch {}

    console.log(`\n  ${style(`Skills (${lang}):`, C.bold)}`);
    const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');

    const repoSkills = new Set<string>();
    try { for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) { if (e.isDirectory()) repoSkills.add(e.name); } }
    catch { console.error(`  ${style('ERROR:', C.red)} user-skills/ not found\n`); continue; }

    const localSkills = new Set(provider.getInstalledSkills());
    const newSkills: string[] = [], changedSkills: string[] = [], upToDate: string[] = [], removedSkills: string[] = [];

    for (const name of repoSkills) {
      if (!localSkills.has(name)) newSkills.push(name);
      else if (opts.force || isDirChanged(path.join(skillsSrc, name), path.join(provider.skillsDir, name))) changedSkills.push(name);
      else upToDate.push(name);
    }
    for (const name of localSkills) { if (!repoSkills.has(name)) removedSkills.push(name); }

    for (const n of upToDate) console.log(`  ${style('–', C.gray)} ${style(n, C.gray)} (up to date)`);
    for (const n of changedSkills) console.log(`  ${style('!', C.yellow)} ${n} (changed)`);
    for (const n of newSkills) console.log(`  ${style('+', C.green)} ${n} (new)`);
    for (const n of removedSkills) console.log(`  ${style('?', C.yellow)} ${n} (local only)`);

    if (changedSkills.length > 0 && (opts.yes || await ask(`Update ${changedSkills.length} changed skill(s)?`, true))) {
      for (const n of changedSkills) { provider.installSkill(path.join(skillsSrc, n), n, lang); console.log(`  ${style('✓', C.green)} ${n} updated`); }
    }
    if (newSkills.length > 0 && (opts.yes || await ask(`Install ${newSkills.length} new skill(s)?`, true))) {
      for (const n of newSkills) { provider.installSkill(path.join(skillsSrc, n), n, lang); console.log(`  ${style('✓', C.green)} ${n} added`); }
    }
    if (removedSkills.length > 0 && (opts.yes || await ask(`Remove ${removedSkills.length} local-only skill(s)?`, false))) {
      for (const n of removedSkills) { fs.rmSync(path.join(provider.skillsDir, n), { recursive: true }); console.log(`  ${style('✗', C.red)} ${n} removed`); }
    }

    console.log(`\n  ${style('✓', C.green)} ${style('Update check complete', C.bold)}\n`);
  }
}

// --- Sessions ---

export function runSessions(opts: Opts = {}): void {
  renderBanner();

  const providers = resolveProviders(opts.provider);
  const allSessions: Array<{ provider: string } & { id: string; project: string; date: Date; size: number; firstMessage: string }> = [];

  for (const provider of providers) {
    const sessions = provider.listSessions({
      all: opts.all,
      project: opts.project,
      limit: opts.limit,
    });
    for (const s of sessions) {
      allSessions.push({ provider: provider.name, ...s });
    }
  }

  allSessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  const limited = allSessions.slice(0, opts.limit || 10);

  if (limited.length === 0) { console.log(`  ${style('No sessions found.', C.gray)}\n`); return; }

  const scope = opts.all ? 'all projects' : opts.project || 'current project';
  console.log(`  ${style(`Recent sessions (${scope}):`, C.bold)}\n`);

  for (const s of limited) {
    const date = s.date.toISOString().slice(0, 16).replace('T', ' ');
    const sizeStr = s.size > 1048576 ? `${(s.size / 1048576).toFixed(1)}MB` : `${(s.size / 1024).toFixed(0)}KB`;
    const msg = s.firstMessage.length > 60 ? s.firstMessage.slice(0, 60) + '...' : s.firstMessage;
    const providerTag = providers.length > 1 ? style(` [${s.provider}]`, C.gray) : '';
    console.log(`  ${style(date, C.gray)}  ${style(s.id.slice(0, 8), C.gray)}  ${style(s.project, C.cyan)}${providerTag}`);
    console.log(`    ${style(msg, C.dim)}  ${style(sizeStr, C.gray)}`);
  }

  console.log(`\n  ${style('Resume:', C.gray)} ${style('cup resume <id>', C.cyan)}\n`);
}

// --- Resume ---

export async function runResume(sessionId: string | undefined, opts: Opts = {}): Promise<void> {
  const providers = resolveProviders(opts.provider);

  if (!sessionId) {
    const allSessions: Array<{ provider: Provider } & { id: string; project: string; date: Date; size: number; firstMessage: string }> = [];
    for (const provider of providers) {
      for (const s of provider.listSessions({ ...opts, all: true, limit: 20 })) {
        allSessions.push({ provider, ...s });
      }
    }
    allSessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    if (allSessions.length === 0) { console.error(`  ${style('No sessions found.', C.red)}\n`); return; }

    const items: CheckboxItem[] = allSessions.slice(0, 20).map(s => ({
      name: s.id,
      desc: `${s.date.toISOString().slice(0, 10)} ${s.project} — ${s.firstMessage.slice(0, 40)}`,
    }));

    renderBanner();
    console.log(`  ${style('Select a session to resume:', C.bold)}\n`);
    const selected = await checkbox(items);
    if (!selected || selected.length === 0) return;
    sessionId = selected[0];

    // Find the provider for this session
    const match = allSessions.find(s => s.id === sessionId);
    if (match) {
      match.provider.resumeSession(sessionId, opts.fork);
      return;
    }
  }

  // Resolve session ID (partial match)
  for (const provider of providers) {
    const sessions = provider.listSessions({ all: true, limit: 100 });
    const match = sessions.find(s => s.id.startsWith(sessionId!));
    if (match) {
      console.log(`\n  ${style('Resuming:', C.bold)} ${style(match.id.slice(0, 8) + '...', C.cyan)}`);
      if (opts.fork) console.log(`  ${style('(forked)', C.gray)}`);
      console.log('');
      provider.resumeSession(match.id, opts.fork);
      return;
    }
  }

  console.error(`  ${style('Session not found:', C.red)} ${sessionId}\n`);
}

// --- Uninstall ---

export async function runUninstall(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style('Uninstalling claude-up...', C.bold)}\n`);
    }

    // 1. Remove cup block from instruction file
    const cupBlock = provider.readCupBlock();
    if (cupBlock) {
      if (opts.yes || await ask(`Remove claude-up section from ${provider.instructionFileName}?`, true)) {
        const filePath = provider.getInstructionFilePath('global');
        const content = fs.readFileSync(filePath, 'utf-8');
        const CUP_START = '<!-- <cup>';
        const CUP_END = '<!-- </cup> -->';
        const startIdx = content.indexOf(CUP_START);
        const endIdx = content.indexOf(CUP_END);
        if (startIdx !== -1 && endIdx !== -1) {
          const cleaned = (content.slice(0, startIdx) + content.slice(endIdx + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
          fs.writeFileSync(filePath, cleaned + '\n');
          console.log(`  ${style('✓', C.green)} ${provider.instructionFileName} — cup section removed`);
        }
      } else {
        console.log(`  ${style('⏭', C.gray)}  ${provider.instructionFileName} skipped`);
      }
    }

    // 2. Remove skills
    const installed = provider.getInstalledSkills();
    if (installed.length > 0) {
      const repoSkills = new Set<string>();
      try {
        for (const e of fs.readdirSync(path.join(PACKAGE_ROOT, 'user-skills'), { withFileTypes: true })) {
          if (e.isDirectory()) repoSkills.add(e.name);
        }
      } catch {}

      const cupSkills = installed.filter(s => repoSkills.has(s));
      const userSkills = installed.filter(s => !repoSkills.has(s));

      if (cupSkills.length > 0) {
        if (opts.yes || await ask(`Remove ${cupSkills.length} claude-up skills?`, true)) {
          for (const name of cupSkills) fs.rmSync(path.join(provider.skillsDir, name), { recursive: true });
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
    if (provider.hasStatusLine) {
      const statuslineDest = path.join(provider.homeDir, 'statusline-command.sh');
      if (fs.existsSync(statuslineDest)) {
        if (opts.yes || await ask('Remove status line?', true)) {
          fs.unlinkSync(statuslineDest);
          const settings = provider.readSettings();
          if (settings?.statusLine) {
            delete settings.statusLine;
            provider.writeSettings(settings);
          }
          console.log(`  ${style('✓', C.green)} Status line removed`);
        } else {
          console.log(`  ${style('⏭', C.gray)}  Status line skipped`);
        }
      }
    }

    // 4. Clean settings
    const settings = provider.readSettings();
    if (settings) {
      let changed = false;
      if (settings.permissions) {
        if (opts.yes || await ask('Reset permissions to empty?', false)) {
          delete settings.permissions;
          changed = true;
          console.log(`  ${style('✓', C.green)} Permissions removed`);
        } else {
          console.log(`  ${style('⏭', C.gray)}  Permissions kept`);
        }
      }
      if (settings.enabledPlugins) {
        if (opts.yes || await ask('Remove plugin list?', false)) {
          delete settings.enabledPlugins;
          delete settings.extraKnownMarketplaces;
          changed = true;
          console.log(`  ${style('✓', C.green)} Plugin list removed`);
        } else {
          console.log(`  ${style('⏭', C.gray)}  Plugins kept`);
        }
      }
      if (changed) provider.writeSettings(settings);
    }

    console.log(`\n  ${style('✓', C.green)} ${style('Uninstall complete', C.bold)}`);
    console.log(`  ${style('Note:', C.gray)} ${provider.settingsFileName} and ~/${path.basename(provider.homeDir)}/ directory are preserved.\n`);
  }
}

// --- Clean ---

export async function runClean(opts: Opts = {}): Promise<void> {
  renderBanner();

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style('Cleaning cup-managed files...', C.bold)}\n`);
    }

    const relPaths = getCupManagedRelPaths(provider);
    if (relPaths.length === 0) {
      console.log(`  ${style('ℹ', C.cyan)} Nothing to clean.\n`);
      continue;
    }

    const repoSkills = getRepoSkillNames();
    const cupSkills = provider.getInstalledSkills().filter(s => repoSkills.has(s));
    const instrPath = provider.getInstructionFilePath('global');
    const slPath = path.join(provider.homeDir, 'statusline-command.sh');
    const settingsPath = path.join(provider.homeDir, provider.settingsFileName);

    console.log(`  Will back up then remove:`);
    console.log(`    • ${cupSkills.length} cup skills`);
    if (fs.existsSync(settingsPath)) console.log(`    • ${provider.settingsFileName} — cup keys only`);
    if (provider.hasStatusLine && fs.existsSync(slPath)) console.log(`    • statusline-command.sh`);
    if (fs.existsSync(instrPath)) console.log(`    • ${provider.instructionFileName} — cup block only`);
    console.log('');

    if (!opts.yes && !(await ask('Proceed?', true))) {
      console.log(`  ${style('Cancelled.', C.gray)}\n`);
      continue;
    }

    let zipPath: string | null = null;
    try {
      zipPath = await createCupBackup(provider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n  ${style('Backup failed:', C.red)} ${msg}`);
      console.error(`  ${style('Aborted — nothing removed.', C.gray)}\n`);
      continue;
    }
    if (zipPath) console.log(`\n  ${style('💾', C.gray)} ${style('Backup: ' + zipPath, C.gray)}\n`);

    for (const name of cupSkills) {
      fs.rmSync(path.join(provider.skillsDir, name), { recursive: true, force: true });
    }
    if (cupSkills.length > 0) console.log(`  ${style('✓', C.green)} ${cupSkills.length} cup skills removed`);

    const block = provider.readCupBlock();
    if (block && fs.existsSync(instrPath)) {
      const content = fs.readFileSync(instrPath, 'utf-8');
      const CUP_START = '<!-- <cup>';
      const CUP_END = '<!-- </cup> -->';
      const s = content.indexOf(CUP_START);
      const e = content.indexOf(CUP_END);
      if (s !== -1 && e !== -1) {
        const cleaned = (content.slice(0, s) + content.slice(e + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
        fs.writeFileSync(instrPath, cleaned + '\n');
        console.log(`  ${style('✓', C.green)} ${provider.instructionFileName} — cup section removed`);
      }
    }

    if (provider.hasStatusLine && fs.existsSync(slPath)) {
      fs.unlinkSync(slPath);
      console.log(`  ${style('✓', C.green)} Status line removed`);
    }

    const settings = provider.readSettings();
    if (settings) {
      let changed = false;
      for (const key of ['permissions', 'enabledPlugins', 'extraKnownMarketplaces', 'statusLine']) {
        if (settings[key] !== undefined) { delete settings[key]; changed = true; }
      }
      if (changed) {
        provider.writeSettings(settings);
        console.log(`  ${style('✓', C.green)} Cup keys cleared from ${provider.settingsFileName}`);
      }
    }

    console.log(`\n  ${style('✓', C.green)} ${style('Clean complete', C.bold)}`);
    if (zipPath) {
      console.log(`  ${style('Restore with:', C.gray)} ${style(`cup restore --type=cup`, C.cyan)}\n`);
    }
  }
}
