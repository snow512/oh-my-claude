#!/usr/bin/env node

'use strict';

const { runInit, runProjectInit, runClone, runBackup, runRestore } = require('./installer');
const { renderBanner } = require('./ui');

const command = process.argv[2];

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
    renderBanner();
    console.log(`  Usage:
    omc init              Set up user-level Claude Code settings & skills
    omc project-init      Set up project-level permissions & skills
    omc clone             Export current Claude environment as portable package
    omc backup            Snapshot ~/.claude/ to a tarball
    omc restore <file>    Restore from a backup tarball
    omc --help            Show this help message

  Alias: oh-my-claude = omc
`);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "omc --help" for usage');
    process.exit(1);
}
