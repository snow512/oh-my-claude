#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const installer_1 = require("./installer");
const ui_1 = require("./ui");
const sync_1 = require("./sync");
// --- Parse args ---
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-') && !a.includes('=')));
const command = args.find(a => !a.startsWith('-'))
    || (flags.has('--version') ? '--version' : flags.has('-h') || flags.has('--help') ? '--help' : undefined);
const subcommand = args.filter(a => !a.startsWith('-'))[1];
const restArgs = args.filter(a => !a.startsWith('-')).slice(1);
const getFlag = (name) => {
    const val = args.find(a => a.startsWith(`--${name}=`));
    return val ? val.split('=')[1] : null;
};
const opts = {
    force: flags.has('--force') || flags.has('-f'),
    yes: flags.has('--yes') || flags.has('-y'),
    json: flags.has('--json'),
    verbose: flags.has('--verbose') || flags.has('-v'),
    fork: flags.has('--fork'),
    all: flags.has('--all') || flags.has('-a'),
    lang: getFlag('lang') || undefined,
    output: getFlag('output') || getFlag('out') || undefined,
    project: getFlag('project') || undefined,
    limit: parseInt(getFlag('limit') || '10', 10),
};
// --- Help ---
function showHelp() {
    (0, ui_1.renderBanner)();
    const c = ui_1.C.cyan;
    const b = ui_1.C.bold;
    const g = ui_1.C.gray;
    console.log(`  ${(0, ui_1.style)('Usage:', b)} omc <command> [options]\n`);
    console.log(`  ${(0, ui_1.style)('Setup', b)}`);
    console.log(`    ${(0, ui_1.style)('init', c)}              Interactive environment setup`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Skip prompts, install everything`);
    console.log(`      ${(0, ui_1.style)('--lang=ko', g)}       Set skill language (en|ko, default: auto-detect)`);
    console.log(`    ${(0, ui_1.style)('install', c)} <target>  Install a specific component`);
    console.log(`      ${(0, ui_1.style)('skills', g)}          Install user skills only`);
    console.log(`      ${(0, ui_1.style)('plugins', g)}         Apply plugins to settings.json`);
    console.log(`      ${(0, ui_1.style)('permissions', g)}     Apply permissions to settings.json`);
    console.log(`      ${(0, ui_1.style)('statusline', g)}      Install status line script`);
    console.log(`      ${(0, ui_1.style)('all', g)}             Install everything (= init -y)`);
    console.log(`      ${(0, ui_1.style)('--lang=ko', g)}       Skill language (for install skills)`);
    console.log(`      ${(0, ui_1.style)('--force, -f', g)}     Overwrite without asking`);
    console.log(`    ${(0, ui_1.style)('project-init', c)}      Set up project-level permissions`);
    console.log(`      ${(0, ui_1.style)('--force, -f', g)}     Overwrite without backup`);
    console.log(`    ${(0, ui_1.style)('update', c)}            Check & apply updates from repo`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Apply all updates without asking`);
    console.log(`      ${(0, ui_1.style)('--force, -f', g)}     Force update even if up to date\n`);
    console.log(`  ${(0, ui_1.style)('Sessions', b)}`);
    console.log(`    ${(0, ui_1.style)('sessions', c)}          List recent sessions across projects`);
    console.log(`      ${(0, ui_1.style)('--all, -a', g)}       All projects (default: current only)`);
    console.log(`      ${(0, ui_1.style)('--project=<name>', g)} Filter by project`);
    console.log(`      ${(0, ui_1.style)('--limit=<n>', g)}     Number to show (default: 10)`);
    console.log(`    ${(0, ui_1.style)('resume', c)} [id]       Resume a session (picker if no id)`);
    console.log(`      ${(0, ui_1.style)('--fork', g)}          Fork as new session\n`);
    console.log(`  ${(0, ui_1.style)('Info', b)}`);
    console.log(`    ${(0, ui_1.style)('status', c)}            Show current environment summary`);
    console.log(`      ${(0, ui_1.style)('--json', g)}          Output as JSON`);
    console.log(`    ${(0, ui_1.style)('doctor', c)}            Diagnose configuration issues`);
    console.log(`      ${(0, ui_1.style)('--verbose, -v', g)}   Show all checks\n`);
    console.log(`  ${(0, ui_1.style)('Environment', b)}`);
    console.log(`    ${(0, ui_1.style)('clone', c)}             Export ~/.claude/ as portable package`);
    console.log(`      ${(0, ui_1.style)('--output=<dir>', g)}  Output directory`);
    console.log(`    ${(0, ui_1.style)('backup', c)}            Snapshot ~/.claude/ to .tar.gz`);
    console.log(`      ${(0, ui_1.style)('--output=<file>', g)} Output file path`);
    console.log(`    ${(0, ui_1.style)('restore', c)} <file>    Restore from backup`);
    console.log(`      ${(0, ui_1.style)('--force, -f', g)}     Skip backup of current settings`);
    console.log(`    ${(0, ui_1.style)('uninstall', c)}         Remove oh-my-claude (skills, settings, CLAUDE.md)`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Remove everything without asking\n`);
    console.log(`  ${(0, ui_1.style)('Sync', b)}`);
    console.log(`    ${(0, ui_1.style)('login', c)}             Set up GitHub token for cloud sync`);
    console.log(`      ${(0, ui_1.style)('--force, -f', g)}     Replace existing token`);
    console.log(`    ${(0, ui_1.style)('push', c)} [skills...]   Upload settings & skills to cloud`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Push without asking`);
    console.log(`    ${(0, ui_1.style)('pull', c)}              Download settings & skills from cloud`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Apply all without asking\n`);
    console.log(`  ${(0, ui_1.style)('Global Options', b)}`);
    console.log(`    ${(0, ui_1.style)('--help, -h', c)}        Show this help message`);
    console.log(`    ${(0, ui_1.style)('--version', c)}         Show version\n`);
    console.log(`  ${(0, ui_1.style)('Alias:', g)} oh-my-claude = omc\n`);
}
function showVersion() {
    const pkg = require('../package.json');
    console.log(`oh-my-claude v${pkg.version}`);
}
// --- Route ---
switch (command) {
    case 'init':
        (0, installer_1.runInit)(opts);
        break;
    case 'install':
        (0, installer_1.runInstall)(subcommand, opts);
        break;
    case 'project-init':
        (0, installer_1.runProjectInit)(opts);
        break;
    case 'clone':
        (0, installer_1.runClone)(opts);
        break;
    case 'backup':
        (0, installer_1.runBackup)(opts);
        break;
    case 'restore':
        (0, installer_1.runRestore)(subcommand, opts);
        break;
    case 'status':
        (0, installer_1.runStatus)(opts);
        break;
    case 'doctor':
        (0, installer_1.runDoctor)(opts);
        break;
    case 'update':
        (0, installer_1.runUpdate)(opts);
        break;
    case 'sessions':
        (0, installer_1.runSessions)(opts);
        break;
    case 'resume':
        (0, installer_1.runResume)(subcommand, opts);
        break;
    case 'uninstall':
        (0, installer_1.runUninstall)(opts);
        break;
    case 'login':
        (0, sync_1.runLogin)(opts);
        break;
    case 'push':
        (0, sync_1.runPush)(restArgs.length > 0 ? restArgs : undefined, opts);
        break;
    case 'pull':
        (0, sync_1.runPull)(opts);
        break;
    case '--version':
        showVersion();
        break;
    case '--help':
    case '-h':
    case undefined:
        showHelp();
        break;
    default:
        console.error(`\n  ${(0, ui_1.style)('Unknown command:', ui_1.C.red)} ${command}`);
        console.error(`  Run ${(0, ui_1.style)('omc --help', ui_1.C.cyan)} for usage\n`);
        process.exit(1);
}
