#!/usr/bin/env node

'use strict';

const { runInit, runProjectInit } = require('./installer');
const { renderBanner } = require('./ui');

const command = process.argv[2];

switch (command) {
  case 'init':
    runInit();
    break;
  case 'project-init':
    runProjectInit();
    break;
  case '--help':
  case '-h':
  case undefined:
    renderBanner();
    console.log(`  Usage:
    oh-my-claude init            Set up user-level Claude Code settings & skills
    oh-my-claude project-init    Set up project-level permissions & skills
    oh-my-claude --help          Show this help message
`);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "oh-my-claude --help" for usage');
    process.exit(1);
}
