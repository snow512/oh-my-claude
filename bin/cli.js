#!/usr/bin/env node

'use strict';

const { runInit, runProjectInit, runClone, runBackup, runRestore } = require('./installer');
const { renderBanner, C, style } = require('./ui');

const command = process.argv[2];

function showHelp() {
  renderBanner();

  const g = C.gray;
  const c = C.cyan;
  const b = C.bold;

  console.log(`  ${style('Usage:', b)} omc <command>\n`);

  console.log(`  ${style('Setup', b)}`);
  console.log(`    ${style('init', c)}              Interactive environment setup (settings, skills, plugins)`);
  console.log(`    ${style('project-init', c)}      Set up project-level permissions & skills\n`);

  console.log(`  ${style('Environment', b)}`);
  console.log(`    ${style('clone', c)}             Export current ~/.claude/ as portable package`);
  console.log(`    ${style('backup', c)}            Snapshot ~/.claude/ to a .tar.gz`);
  console.log(`    ${style('restore', c)} <file>    Restore from backup (.tar.gz or clone folder)\n`);

  console.log(`  ${style('Options', b)}`);
  console.log(`    ${style('--help, -h', c)}        Show this help message\n`);

  console.log(`  ${style('Alias:', g)} oh-my-claude = omc\n`);
}

switch (command) {
  case 'init':
    runInit();
    break;
  case 'project-init':
    runProjectInit();
    break;
  case 'clone':
    runClone();
    break;
  case 'backup':
    runBackup();
    break;
  case 'restore':
    runRestore(process.argv[3]);
    break;
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`\n  ${style('Unknown command:', C.red)} ${command}`);
    console.error(`  Run ${style('omc --help', C.cyan)} for usage\n`);
    process.exit(1);
}
