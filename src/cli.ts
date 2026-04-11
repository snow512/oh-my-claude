#!/usr/bin/env node

import { runInit, runProjectInit, runInstall, runClone, runBackup, runRestore, runStatus, runDoctor, runUpdate, runSessions, runResume, runUninstall } from './installer';
import type { Opts } from './installer';
import { renderBanner, C, style } from './ui';
import { runLogin, runPush, runPull } from './sync';

// --- Parse args ---

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-') && !a.includes('=')));
const command = args.find(a => !a.startsWith('-'))
  || (flags.has('--version') ? '--version' : flags.has('-h') || flags.has('--help') ? '--help' : undefined);
const subcommand = args.filter(a => !a.startsWith('-'))[1];
const restArgs = args.filter(a => !a.startsWith('-')).slice(1);

const getFlag = (name: string): string | null => {
  const val = args.find(a => a.startsWith(`--${name}=`));
  return val ? val.split('=')[1] : null;
};

const opts: Opts = {
  force:    flags.has('--force') || flags.has('-f'),
  yes:      flags.has('--yes') || flags.has('-y'),
  json:     flags.has('--json'),
  verbose:  flags.has('--verbose') || flags.has('-v'),
  fork:     flags.has('--fork'),
  all:      flags.has('--all') || flags.has('-a'),
  lang:     getFlag('lang') || undefined,
  output:   getFlag('output') || getFlag('out') || undefined,
  project:  getFlag('project') || undefined,
  limit:    parseInt(getFlag('limit') || '10', 10),
  provider: getFlag('provider') || undefined,
};

// --- Help ---

function showHelp(): void {
  renderBanner();

  const c = C.cyan;
  const b = C.bold;
  const g = C.gray;

  console.log(`  ${style('Usage:', b)} cup <command> [options]\n`);

  console.log(`  ${style('Setup', b)}`);
  console.log(`    ${style('init', c)}              Interactive environment setup`);
  console.log(`      ${style('--yes, -y', g)}       Skip prompts, install everything`);
  console.log(`      ${style('--lang=ko', g)}       Set skill language (en|ko, default: auto-detect)`);
  console.log(`    ${style('install', c)} <target>  Install a specific component`);
  console.log(`      ${style('skills', g)}          Install user skills only`);
  console.log(`      ${style('plugins', g)}         Apply plugins to settings.json`);
  console.log(`      ${style('permissions', g)}     Apply permissions to settings.json`);
  console.log(`      ${style('statusline', g)}      Install status line script`);
  console.log(`      ${style('all', g)}             Install everything (= init -y)`);
  console.log(`      ${style('--lang=ko', g)}       Skill language (for install skills)`);
  console.log(`      ${style('--force, -f', g)}     Overwrite without asking`);
  console.log(`    ${style('project-init', c)}      Set up project-level permissions`);
  console.log(`      ${style('--force, -f', g)}     Overwrite without backup`);
  console.log(`    ${style('update', c)}            Check & apply updates from repo`);
  console.log(`      ${style('--yes, -y', g)}       Apply all updates without asking`);
  console.log(`      ${style('--force, -f', g)}     Force update even if up to date\n`);

  console.log(`  ${style('Sessions', b)}`);
  console.log(`    ${style('sessions', c)}          List recent sessions across projects`);
  console.log(`      ${style('--all, -a', g)}       All projects (default: current only)`);
  console.log(`      ${style('--project=<name>', g)} Filter by project`);
  console.log(`      ${style('--limit=<n>', g)}     Number to show (default: 10)`);
  console.log(`    ${style('resume', c)} [id]       Resume a session (picker if no id)`);
  console.log(`      ${style('--fork', g)}          Fork as new session\n`);

  console.log(`  ${style('Info', b)}`);
  console.log(`    ${style('status', c)}            Show current environment summary`);
  console.log(`      ${style('--json', g)}          Output as JSON`);
  console.log(`    ${style('doctor', c)}            Diagnose configuration issues`);
  console.log(`      ${style('--verbose, -v', g)}   Show all checks\n`);

  console.log(`  ${style('Environment', b)}`);
  console.log(`    ${style('clone', c)}             Export ~/.claude/ as portable package`);
  console.log(`      ${style('--output=<dir>', g)}  Output directory`);
  console.log(`    ${style('backup', c)}            Snapshot ~/.claude/ to .tar.gz`);
  console.log(`      ${style('--output=<file>', g)} Output file path`);
  console.log(`    ${style('restore', c)} <file>    Restore from backup`);
  console.log(`      ${style('--force, -f', g)}     Skip backup of current settings`);
  console.log(`    ${style('uninstall', c)}         Remove claude-up (skills, settings, CLAUDE.md)`);
  console.log(`      ${style('--yes, -y', g)}       Remove everything without asking\n`);

  console.log(`  ${style('Sync', b)}`);
  console.log(`    ${style('login', c)}             Set up GitHub token for cloud sync`);
  console.log(`      ${style('--force, -f', g)}     Replace existing token`);
  console.log(`    ${style('push', c)} [skills...]   Upload settings & skills to cloud`);
  console.log(`      ${style('--yes, -y', g)}       Push without asking`);
  console.log(`    ${style('pull', c)}              Download settings & skills from cloud`);
  console.log(`      ${style('--yes, -y', g)}       Apply all without asking\n`);

  console.log(`  ${style('Global Options', b)}`);
  console.log(`    ${style('--provider=<name>', c)}  Target provider (claude,gemini,codex; auto-detect if omitted)`);
  console.log(`    ${style('--help, -h', c)}        Show this help message`);
  console.log(`    ${style('--version', c)}         Show version\n`);

  console.log(`  ${style('Alias:', g)} claude-up = cup\n`);
}

function showVersion(): void {
  const pkg = require('../package.json');
  console.log(`claude-up v${pkg.version}`);
}

// --- Route ---

switch (command) {
  case 'init':         runInit(opts); break;
  case 'install':      runInstall(subcommand, opts); break;
  case 'project-init': runProjectInit(opts); break;
  case 'clone':        runClone(opts); break;
  case 'backup':       runBackup(opts); break;
  case 'restore':      runRestore(subcommand, opts); break;
  case 'status':       runStatus(opts); break;
  case 'doctor':       runDoctor(opts); break;
  case 'update':       runUpdate(opts); break;
  case 'sessions':     runSessions(opts); break;
  case 'resume':       runResume(subcommand, opts); break;
  case 'uninstall':    runUninstall(opts); break;
  case 'login':        runLogin(opts); break;
  case 'push':         runPush(restArgs.length > 0 ? restArgs : undefined, opts); break;
  case 'pull':         runPull(opts); break;
  case '--version':    showVersion(); break;
  case '--help': case '-h': case undefined:
    showHelp(); break;
  default:
    console.error(`\n  ${style('Unknown command:', C.red)} ${command}`);
    console.error(`  Run ${style('cup --help', C.cyan)} for usage\n`);
    process.exit(1);
}
