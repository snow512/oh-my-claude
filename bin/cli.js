#!/usr/bin/env node

'use strict';

const { runInit, runProjectInit, runClone, runBackup, runRestore, runStatus, runDoctor, runUpdate } = require('./installer');
const { renderBanner, C, style } = require('./ui');

// --- Parse args ---
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-') && !a.includes('=')));
const command = args.find(a => !a.startsWith('-')) || (flags.has('--version') ? '--version' : flags.has('-h') || flags.has('--help') ? '--help' : undefined);
const getFlag = (name) => {
  const val = args.find(a => a.startsWith(`--${name}=`));
  return val ? val.split('=')[1] : null;
};

const opts = {
  force:   flags.has('--force') || flags.has('-f'),
  yes:     flags.has('--yes') || flags.has('-y'),
  json:    flags.has('--json'),
  verbose: flags.has('--verbose') || flags.has('-v'),
  lang:    getFlag('lang'),                          // --lang=ko
  output:  getFlag('output') || getFlag('out'),      // --output=./my-backup
};

// --- Help ---

function showHelp() {
  renderBanner();

  const c = C.cyan;
  const b = C.bold;
  const g = C.gray;

  console.log(`  ${style('Usage:', b)} omc <command> [options]\n`);

  console.log(`  ${style('Setup', b)}`);
  console.log(`    ${style('init', c)}              Interactive environment setup`);
  console.log(`      ${style('--yes, -y', g)}       Skip prompts, install everything (default settings)`);
  console.log(`      ${style('--lang=ko', g)}       Set skill language (en|ko, default: auto-detect)`);
  console.log(`    ${style('project-init', c)}      Set up project-level permissions`);
  console.log(`      ${style('--force, -f', g)}     Overwrite without backup`);
  console.log(`    ${style('update', c)}            Check & apply updates from repo`);
  console.log(`      ${style('--yes, -y', g)}       Apply all updates without asking`);
  console.log(`      ${style('--force, -f', g)}     Force update even if up to date\n`);

  console.log(`  ${style('Info', b)}`);
  console.log(`    ${style('status', c)}            Show current environment summary`);
  console.log(`      ${style('--json', g)}          Output as JSON`);
  console.log(`    ${style('doctor', c)}            Diagnose configuration issues`);
  console.log(`      ${style('--verbose, -v', g)}   Show all checks (not just issues)\n`);

  console.log(`  ${style('Environment', b)}`);
  console.log(`    ${style('clone', c)}             Export ~/.claude/ as portable package`);
  console.log(`      ${style('--output=<dir>', g)}  Output directory (default: ./claude-env-{timestamp})`);
  console.log(`    ${style('backup', c)}            Snapshot ~/.claude/ to .tar.gz`);
  console.log(`      ${style('--output=<file>', g)} Output file path`);
  console.log(`    ${style('restore', c)} <file>    Restore from backup`);
  console.log(`      ${style('--force, -f', g)}     Restore without backup of current settings\n`);

  console.log(`  ${style('Global Options', b)}`);
  console.log(`    ${style('--help, -h', c)}        Show this help message`);
  console.log(`    ${style('--version', c)}         Show version\n`);

  console.log(`  ${style('Alias:', g)} oh-my-claude = omc\n`);
}

// --- Version ---

function showVersion() {
  const pkg = require('../package.json');
  console.log(`oh-my-claude v${pkg.version}`);
}

// --- Route ---

switch (command) {
  case 'init':         runInit(opts); break;
  case 'project-init': runProjectInit(opts); break;
  case 'clone':        runClone(opts); break;
  case 'backup':       runBackup(opts); break;
  case 'restore':      runRestore(args.find(a => !a.startsWith('-') && a !== 'restore'), opts); break;
  case 'status':       runStatus(opts); break;
  case 'doctor':       runDoctor(opts); break;
  case 'update':       runUpdate(opts); break;
  case '--version':    showVersion(); break;
  case '--help': case '-h': case undefined:
    showHelp(); break;
  default:
    console.error(`\n  ${style('Unknown command:', C.red)} ${command}`);
    console.error(`  Run ${style('omc --help', C.cyan)} for usage\n`);
    process.exit(1);
}
