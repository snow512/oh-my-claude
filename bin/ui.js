'use strict';

const readline = require('readline');

// --- Color System ---

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

const C = isTTY ? {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[38;5;81m',
  green:   '\x1b[38;5;82m',
  red:     '\x1b[38;5;196m',
  yellow:  '\x1b[38;5;226m',
  magenta: '\x1b[38;5;205m',
  gray:    '\x1b[38;5;245m',
  blue:    '\x1b[38;5;75m',
} : Object.fromEntries(
  ['reset','bold','dim','cyan','green','red','yellow','magenta','gray','blue'].map(k => [k, ''])
);

function style(text, ...codes) {
  return codes.join('') + text + C.reset;
}

// --- Cursor ---

const cursor = {
  hide: () => isTTY && process.stdout.write('\x1b[?25l'),
  show: () => isTTY && process.stdout.write('\x1b[?25h'),
};

// Ensure cursor is restored on exit
process.on('exit', cursor.show);
process.on('SIGINT', () => { cursor.show(); process.exit(0); });

// --- Banner ---

function renderBanner() {
  const title = 'oh-my-claude';
  const subtitle = 'Claude Code Environment Bootstrap';
  const width = subtitle.length + 4;
  const line = '─'.repeat(width);

  console.log('');
  console.log(`  ${style('┌' + line + '┐', C.blue)}`);
  console.log(`  ${style('│', C.blue)}  ${style(title, C.bold, C.cyan)}${' '.repeat(width - title.length - 2)}${style('│', C.blue)}`);
  console.log(`  ${style('│', C.blue)}  ${style(subtitle, C.gray)}${' '.repeat(width - subtitle.length - 2)}${style('│', C.blue)}`);
  console.log(`  ${style('┌' + line + '┐', C.blue).replace(/┌/g, '└').replace(/┐/g, '┘')}`);
  console.log('');
}

// --- Step Indicator ---

function renderStep(current, total, label) {
  console.log(`\n  ${style(`Step ${current}/${total}`, C.cyan, C.bold)} ${style('—', C.gray)} ${style(label, C.bold)}`);
}

// --- Progress Line (Spinner) ---

async function progressLine(label, action) {
  if (!isTTY) {
    const result = await action();
    console.log(`  ${style('✓', C.green)} ${label}`);
    return result;
  }

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  cursor.hide();
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${style(frames[i % frames.length], C.cyan)} ${style(label, C.gray)}`);
    i++;
  }, 80);

  try {
    const result = await action();
    clearInterval(interval);
    process.stdout.write(`\r  ${style('✓', C.green)} ${label}${' '.repeat(20)}\n`);
    cursor.show();
    return result;
  } catch (err) {
    clearInterval(interval);
    process.stdout.write(`\r  ${style('✗', C.red)} ${label}${' '.repeat(20)}\n`);
    cursor.show();
    throw err;
  }
}

// --- Ask (Y/n prompt) ---

function ask(question, defaultYes = true) {
  const hint = defaultYes ? style('[Y/n]', C.gray) : style('[y/N]', C.gray);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} ${hint}: `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes');
    });
  });
}

// --- Checkbox Selector ---

function checkbox(items) {
  if (!isTTY) {
    // Non-interactive: select all
    return Promise.resolve(items.map(item => item.name));
  }

  return new Promise((resolve) => {
    const selected = items.map(() => true);
    let cursorPos = 0;

    // Calculate box width
    const maxName = Math.max(...items.map(i => i.name.length));
    const maxDesc = Math.max(...items.map(i => i.desc.length));
    const termWidth = process.stdout.columns || 80;
    const innerWidth = Math.min(4 + maxName + 3 + maxDesc + 1, termWidth - 8);

    function pad(str, len) {
      const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
      return str + ' '.repeat(Math.max(0, len - visible.length));
    }

    function renderRow(i) {
      const arrow = i === cursorPos ? style('›', C.cyan) : ' ';
      const check = selected[i] ? style('◉', C.green) : style('○', C.gray);
      const name = selected[i] ? style(items[i].name, C.bold) : style(items[i].name, C.dim);
      const desc = style('— ' + items[i].desc, C.gray);
      const content = `${arrow} ${check} ${name} ${desc}`;
      return `  ${style('│', C.blue)} ${pad(content, innerWidth)}${style('│', C.blue)}`;
    }

    const totalLines = items.length + 3; // top border + items + bottom border + hint
    let firstRender = true;

    function render() {
      if (!firstRender) {
        process.stdout.write(`\x1b[${totalLines}A\x1b[0J`);
      }
      firstRender = false;

      const hLine = '─'.repeat(innerWidth + 2);
      console.log(`  ${style('┌' + hLine + '┐', C.blue)}`);
      for (let i = 0; i < items.length; i++) {
        console.log(renderRow(i));
      }
      console.log(`  ${style('└' + hLine + '┘', C.blue)}`);
      process.stdout.write(`  ${style('↑↓', C.cyan)} move  ${style('space', C.cyan)} toggle  ${style('a', C.cyan)} all  ${style('n', C.cyan)} none  ${style('enter', C.cyan)} confirm`);
    }

    cursor.hide();
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    const onData = (key) => {
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        cursor.show();
        console.log('\n');
        resolve(items.filter((_, i) => selected[i]).map(item => item.name));
        return;
      }
      if (key === ' ') {
        selected[cursorPos] = !selected[cursorPos];
      } else if (key === 'a') {
        selected.fill(true);
      } else if (key === 'n') {
        selected.fill(false);
      } else if (key === '\x1b[A' || key === 'k') {
        cursorPos = (cursorPos - 1 + items.length) % items.length;
      } else if (key === '\x1b[B' || key === 'j') {
        cursorPos = (cursorPos + 1) % items.length;
      } else if (key === '\x03') {
        cursor.show();
        process.exit(0);
      }
      render();
    };

    process.stdin.on('data', onData);
  });
}

// --- Summary ---

function renderSummary(results) {
  console.log('');
  for (const r of results) {
    const icon = r.ok ? style('✓', C.green) : style('⏭', C.gray);
    console.log(`  ${icon} ${style(r.label + ':', C.bold)} ${style(r.detail, C.gray)}`);
  }
}

function renderDone() {
  console.log(`\n  ${style('⚠️  Plugins will be auto-installed on next Claude Code session.', C.yellow)}`);
  console.log(`\n  Done! 🎉\n`);
}

module.exports = { C, style, cursor, renderBanner, renderStep, progressLine, ask, checkbox, renderSummary, renderDone };
