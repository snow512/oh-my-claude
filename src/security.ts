import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { renderBanner, ask, C, style } from './ui';
import { readJson, PACKAGE_ROOT, HOME_DIR } from './utils';
import { resolveProviders } from './providers/registry';
import type { Provider, SecurityLevelConfig } from './providers/types';
import type { Opts } from './installer';

// --- Types ---

type Level = 'loose' | 'normal' | 'strict';

const VALID_LEVELS: Level[] = ['loose', 'normal', 'strict'];

// --- Helpers ---

function loadLevel(level: Level): SecurityLevelConfig {
  const presetPath = path.join(PACKAGE_ROOT, 'presets', 'security', `${level}.json`);
  const data = readJson(presetPath);
  if (!data) {
    console.error(`  ${style('ERROR:', C.red)} security preset not found: ${presetPath}\n`);
    process.exit(1);
  }
  return data as unknown as SecurityLevelConfig;
}

function loadSecurityBlock(level: Level): string | null {
  const fileName = level === 'strict' ? 'strict-md.md' : 'normal-md.md';
  const blockPath = path.join(PACKAGE_ROOT, 'presets', 'security', fileName);
  try {
    return fs.readFileSync(blockPath, 'utf-8').trim();
  } catch { return null; }
}

function parseLevel(value: string | undefined): Level {
  const v = (value || 'normal').toLowerCase();
  if (!VALID_LEVELS.includes(v as Level)) {
    console.error(`  ${style('ERROR:', C.red)} invalid level "${value}". Use loose|normal|strict\n`);
    process.exit(1);
  }
  return v as Level;
}

// --- Help ---

function showSecurityHelp(): void {
  renderBanner();
  const c = C.cyan;
  const b = C.bold;
  const g = C.gray;

  console.log(`  ${style('Usage:', b)} cup security <subcommand> [options]\n`);

  console.log(`  ${style('Subcommands', b)}`);
  console.log(`    ${style('init', c)}              Apply a security level (deny rules + guidance block)`);
  console.log(`      ${style('--level=<level>', g)} loose | normal | strict (default: normal)`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)`);
  console.log(`      ${style('--yes, -y', g)}       Skip confirmation`);
  console.log(`    ${style('check', c)}             Audit current security posture`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)`);
  console.log(`      ${style('--verbose, -v', g)}   Show detailed findings`);
  console.log(`    ${style('diff', c)}              Show difference between current and target level`);
  console.log(`      ${style('--level=<level>', g)} Target level to compare against`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)\n`);

  console.log(`  ${style('Levels', b)}`);
  console.log(`    ${style('loose', c)}    — fast experiments, personal toy projects (minimal deny rules)`);
  console.log(`    ${style('normal', c)}   — default for daily development (7 deny rules + sensitive-data guard)`);
  console.log(`    ${style('strict', c)}   — production code, team collaboration (12 deny rules + extra guards)\n`);
}

// --- Init ---

export async function runSecurityInit(opts: Opts): Promise<void> {
  renderBanner();

  const level = parseLevel(opts.level);
  const config = loadLevel(level);
  const block = level === 'loose' ? null : loadSecurityBlock(level);

  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log(`  ${style('No LLM CLI tools detected.', C.red)}\n`);
    process.exit(1);
  }

  console.log(`  ${style('Applying security level:', C.bold)} ${style(level, C.cyan)}`);
  console.log(`  ${style(config.description, C.gray)}\n`);

  if (!opts.yes) {
    const ok = await ask(`Apply to ${providers.length} provider(s)?`, true);
    if (!ok) { console.log(`  ${style('Aborted.', C.gray)}\n`); return; }
  }

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`\n  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }

    provider.backupSettings();
    provider.applySecurityLevel(config);
    console.log(`  ${style('✓', C.green)} Permissions applied`);

    if (block) {
      provider.writeSecurityBlock(block);
      console.log(`  ${style('✓', C.green)} ${provider.instructionFileName} security block installed`);
    } else {
      provider.removeSecurityBlock();
      console.log(`  ${style('⏭', C.gray)}  Security block skipped (loose level)`);
    }
  }

  console.log(`\n  ${style('✓', C.green)} ${style(`Security level "${level}" applied`, C.bold)}\n`);
}

// --- Check ---

interface CheckResult {
  ok: boolean;
  warnings: number;
  failures: number;
}

function checkProvider(provider: Provider, verbose: boolean): CheckResult {
  let warnings = 0;
  let failures = 0;
  const ok = (msg: string): void => { console.log(`  ${style('✓', C.green)} ${msg}`); };
  const warn = (msg: string): void => { console.log(`  ${style('!', C.yellow)} ${msg}`); warnings++; };
  const fail = (msg: string): void => { console.log(`  ${style('✗', C.red)} ${msg}`); failures++; };
  const detail = (lines: string[]): void => { if (verbose) for (const l of lines) console.log(`    ${style(l, C.gray)}`); };

  // 1. deny rules
  const perms = provider.getCurrentPermissions();
  if (perms.deny.length === 0) {
    fail('No deny rules — destructive commands not blocked');
  } else if (perms.deny.length < 5) {
    warn(`Only ${perms.deny.length} deny rules — consider applying normal or strict`);
    detail(perms.deny);
  } else {
    ok(`${perms.deny.length} deny rules active`);
    detail(perms.deny);
  }

  // 2. cup-security block in instruction file
  const block = provider.readSecurityBlock();
  if (block) {
    const isStrict = block.includes('strict');
    ok(`${provider.instructionFileName} security block installed (${isStrict ? 'strict' : 'normal'})`);
  } else {
    warn(`${provider.instructionFileName} has no security block — run "cup security init"`);
  }

  // 3. .cup-auth permission (Claude only — auth file lives there)
  if (provider.name === 'claude') {
    const authPath = path.join(provider.homeDir, '.cup-auth');
    if (fs.existsSync(authPath)) {
      const mode = fs.statSync(authPath).mode & 0o777;
      if (mode === 0o600) {
        ok(`.cup-auth file permission is 0600`);
      } else {
        fail(`.cup-auth has insecure permission ${mode.toString(8)} (expected 600)`);
      }
    }
  }

  // 4. Codex sandbox mode
  if (provider.name === 'codex') {
    const settings = provider.readSettings();
    const mode = settings?.sandbox_mode as string | undefined;
    if (mode === 'danger-full-access') {
      fail(`sandbox_mode = "${mode}" — file system fully exposed`);
    } else if (mode) {
      ok(`sandbox_mode = "${mode}"`);
    } else {
      warn(`sandbox_mode not configured`);
    }
  }

  return { ok: failures === 0 && warnings === 0, warnings, failures };
}

function checkSystem(verbose: boolean): CheckResult {
  let warnings = 0;
  let failures = 0;
  const ok = (msg: string): void => { console.log(`  ${style('✓', C.green)} ${msg}`); };
  const warn = (msg: string): void => { console.log(`  ${style('!', C.yellow)} ${msg}`); warnings++; };
  const fail = (msg: string): void => { console.log(`  ${style('✗', C.red)} ${msg}`); failures++; };

  // Home-dir secrets
  const npmrc = path.join(HOME_DIR, '.npmrc');
  if (fs.existsSync(npmrc)) {
    const mode = fs.statSync(npmrc).mode & 0o777;
    const content = fs.readFileSync(npmrc, 'utf-8');
    const hasToken = /authToken|_auth|_password/.test(content);
    if (hasToken && mode !== 0o600) {
      fail(`~/.npmrc contains a token but permission is ${mode.toString(8)} (expected 600)`);
    } else if (hasToken) {
      ok(`~/.npmrc has token + 0600 permission`);
    } else if (verbose) {
      ok(`~/.npmrc exists, no token detected`);
    }
  }

  // Current git repo: .env tracked?
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const tracked = execFileSync('git', ['ls-files', '.env', '.env.*'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: root }).trim();
    if (tracked) {
      fail(`current git repo tracks .env files: ${tracked.split('\n').join(', ')}`);
    } else if (verbose) {
      ok(`current git repo does not track .env files`);
    }
  } catch {
    // not a git repo, skip
  }

  return { ok: failures === 0 && warnings === 0, warnings, failures };
}

export function runSecurityCheck(opts: Opts): void {
  renderBanner();
  console.log(`  ${style('Security check', C.bold)}\n`);

  const providers = resolveProviders(opts.provider);
  let totalWarnings = 0;
  let totalFailures = 0;

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}\n`);
    } else {
      console.log(`  ${style(`Provider: ${provider.displayName}`, C.bold)}\n`);
    }
    const result = checkProvider(provider, opts.verbose ?? false);
    totalWarnings += result.warnings;
    totalFailures += result.failures;
    console.log('');
  }

  console.log(`  ${style('── System ──', C.bold, C.cyan)}\n`);
  const sysResult = checkSystem(opts.verbose ?? false);
  totalWarnings += sysResult.warnings;
  totalFailures += sysResult.failures;
  console.log('');

  if (totalFailures === 0 && totalWarnings === 0) {
    console.log(`  ${style('All security checks passed!', C.green, C.bold)}\n`);
  } else {
    if (totalFailures > 0) console.log(`  ${style(`${totalFailures} failure(s)`, C.red, C.bold)}`);
    if (totalWarnings > 0) console.log(`  ${style(`${totalWarnings} warning(s)`, C.yellow, C.bold)}`);
    console.log('');
  }
}

// --- Diff ---

export function runSecurityDiff(opts: Opts): void {
  renderBanner();
  const level = parseLevel(opts.level);
  const target = loadLevel(level);

  console.log(`  ${style('Security diff:', C.bold)} current vs ${style(level, C.cyan)}\n`);

  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }

    const current = provider.getCurrentPermissions();
    let targetDeny: string[] = [];

    if (provider.name === 'claude') {
      targetDeny = target.providers.claude?.deny || [];
    } else if (provider.name === 'gemini') {
      targetDeny = (target.providers.gemini?.policies || []).map(p => String(p.argsPattern || ''));
    } else if (provider.name === 'codex') {
      const mode = target.providers.codex?.sandbox_mode || '';
      const settings = provider.readSettings();
      const currentMode = settings?.sandbox_mode as string | undefined;
      if (currentMode === mode) {
        console.log(`  ${style('=', C.gray)} sandbox_mode unchanged: ${mode}`);
      } else {
        console.log(`  ${style('-', C.red)} sandbox_mode: ${currentMode || '(none)'}`);
        console.log(`  ${style('+', C.green)} sandbox_mode: ${mode}`);
      }
      console.log('');
      continue;
    }

    const currentSet = new Set(current.deny);
    const targetSet = new Set(targetDeny);

    const removed = current.deny.filter(r => !targetSet.has(r));
    const added = targetDeny.filter(r => !currentSet.has(r));
    const unchanged = current.deny.filter(r => targetSet.has(r));

    for (const r of unchanged) console.log(`  ${style('=', C.gray)} ${style(r, C.gray)}`);
    for (const r of removed) console.log(`  ${style('-', C.red)} ${r}`);
    for (const r of added) console.log(`  ${style('+', C.green)} ${r}`);

    if (removed.length === 0 && added.length === 0) {
      console.log(`  ${style('(no changes)', C.gray)}`);
    }
    console.log('');
  }
}

// --- Router ---

export async function runSecurity(subcommand: string | undefined, opts: Opts): Promise<void> {
  switch (subcommand) {
    case 'init':
      await runSecurityInit(opts);
      break;
    case 'check':
      runSecurityCheck(opts);
      break;
    case 'diff':
      runSecurityDiff(opts);
      break;
    case undefined:
    case 'help':
      showSecurityHelp();
      break;
    default:
      console.error(`  ${style('Unknown subcommand:', C.red)} ${subcommand}`);
      console.error(`  Run ${style('cup security', C.cyan)} for usage\n`);
      process.exit(1);
  }
}
