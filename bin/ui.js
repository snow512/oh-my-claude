"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cursor = exports.C = void 0;
exports.style = style;
exports.renderBanner = renderBanner;
exports.renderStep = renderStep;
exports.progressLine = progressLine;
exports.ask = ask;
exports.checkbox = checkbox;
exports.renderSummary = renderSummary;
exports.renderDone = renderDone;
const readline = __importStar(require("readline"));
// --- Color System ---
const isTTY = !!(process.stdout.isTTY && !process.env.NO_COLOR);
exports.C = isTTY ? {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[38;5;81m',
    green: '\x1b[38;5;82m',
    red: '\x1b[38;5;196m',
    yellow: '\x1b[38;5;226m',
    magenta: '\x1b[38;5;205m',
    gray: '\x1b[38;5;245m',
    blue: '\x1b[38;5;75m',
} : Object.fromEntries(['reset', 'bold', 'dim', 'cyan', 'green', 'red', 'yellow', 'magenta', 'gray', 'blue'].map(k => [k, '']));
function style(text, ...codes) {
    return codes.join('') + text + exports.C.reset;
}
// --- Cursor ---
exports.cursor = {
    hide: () => isTTY && process.stdout.write('\x1b[?25l'),
    show: () => isTTY && process.stdout.write('\x1b[?25h'),
};
process.on('exit', exports.cursor.show);
process.on('SIGINT', () => { exports.cursor.show(); process.exit(0); });
// --- Banner ---
function renderBanner() {
    const title = 'claude-up';
    const subtitle = 'LLM Environment Bootstrap';
    const width = subtitle.length + 4;
    const line = '─'.repeat(width);
    console.log('');
    console.log(`  ${style('┌' + line + '┐', exports.C.blue)}`);
    console.log(`  ${style('│', exports.C.blue)}  ${style(title, exports.C.bold, exports.C.cyan)}${' '.repeat(width - title.length - 2)}${style('│', exports.C.blue)}`);
    console.log(`  ${style('│', exports.C.blue)}  ${style(subtitle, exports.C.gray)}${' '.repeat(width - subtitle.length - 2)}${style('│', exports.C.blue)}`);
    console.log(`  ${style('┌' + line + '┐', exports.C.blue).replace(/┌/g, '└').replace(/┐/g, '┘')}`);
    console.log('');
}
// --- Step Indicator ---
function renderStep(current, total, label) {
    console.log(`\n  ${style(`Step ${current}/${total}`, exports.C.cyan, exports.C.bold)} ${style('—', exports.C.gray)} ${style(label, exports.C.bold)}`);
}
// --- Progress Line (Spinner) ---
async function progressLine(label, action) {
    if (!isTTY) {
        const result = await action();
        console.log(`  ${style('✓', exports.C.green)} ${label}`);
        return result;
    }
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    exports.cursor.hide();
    const interval = setInterval(() => {
        process.stdout.write(`\r  ${style(frames[i % frames.length], exports.C.cyan)} ${style(label, exports.C.gray)}`);
        i++;
    }, 80);
    try {
        const result = await action();
        clearInterval(interval);
        process.stdout.write(`\r  ${style('✓', exports.C.green)} ${label}${' '.repeat(20)}\n`);
        exports.cursor.show();
        return result;
    }
    catch (err) {
        clearInterval(interval);
        process.stdout.write(`\r  ${style('✗', exports.C.red)} ${label}${' '.repeat(20)}\n`);
        exports.cursor.show();
        throw err;
    }
}
// --- Ask (Y/n prompt) ---
function ask(question, defaultYes = true) {
    const hint = defaultYes ? style('[Y/n]', exports.C.gray) : style('[y/N]', exports.C.gray);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`  ${question} ${hint}: `, (answer) => {
            rl.close();
            const a = answer.trim().toLowerCase();
            if (a === '')
                resolve(defaultYes);
            else
                resolve(a === 'y' || a === 'yes');
        });
    });
}
// --- Checkbox Selector ---
function checkbox(items) {
    if (!isTTY) {
        return Promise.resolve(items.map(item => item.name));
    }
    return new Promise((resolve) => {
        const selected = items.map(() => true);
        let cursorPos = 0;
        const maxName = Math.max(...items.map(i => i.name.length));
        const maxDesc = Math.max(...items.map(i => i.desc.length));
        const termWidth = process.stdout.columns || 80;
        const innerWidth = Math.min(4 + maxName + 3 + maxDesc + 1, termWidth - 8);
        function pad(str, len) {
            const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
            return str + ' '.repeat(Math.max(0, len - visible.length));
        }
        function renderRow(i) {
            const arrow = i === cursorPos ? style('›', exports.C.cyan) : ' ';
            const check = selected[i] ? style('◉', exports.C.green) : style('○', exports.C.gray);
            const name = selected[i] ? style(items[i].name, exports.C.bold) : style(items[i].name, exports.C.dim);
            const desc = style('— ' + items[i].desc, exports.C.gray);
            const content = `${arrow} ${check} ${name} ${desc}`;
            return `  ${style('│', exports.C.blue)} ${pad(content, innerWidth)}${style('│', exports.C.blue)}`;
        }
        const totalLines = items.length + 3;
        let firstRender = true;
        function render() {
            if (!firstRender) {
                process.stdout.write(`\x1b[${totalLines}A\x1b[0J`);
            }
            firstRender = false;
            const hLine = '─'.repeat(innerWidth + 2);
            console.log(`  ${style('┌' + hLine + '┐', exports.C.blue)}`);
            for (let i = 0; i < items.length; i++) {
                console.log(renderRow(i));
            }
            console.log(`  ${style('└' + hLine + '┘', exports.C.blue)}`);
            process.stdout.write(`  ${style('↑↓', exports.C.cyan)} move  ${style('space', exports.C.cyan)} toggle  ${style('a', exports.C.cyan)} all  ${style('n', exports.C.cyan)} none  ${style('enter', exports.C.cyan)} confirm`);
        }
        exports.cursor.hide();
        render();
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf-8');
        const onData = (key) => {
            if (key === '\r' || key === '\n') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', onData);
                exports.cursor.show();
                console.log('\n');
                resolve(items.filter((_, i) => selected[i]).map(item => item.name));
                return;
            }
            if (key === ' ') {
                selected[cursorPos] = !selected[cursorPos];
            }
            else if (key === 'a') {
                selected.fill(true);
            }
            else if (key === 'n') {
                selected.fill(false);
            }
            else if (key === '\x1b[A' || key === 'k') {
                cursorPos = (cursorPos - 1 + items.length) % items.length;
            }
            else if (key === '\x1b[B' || key === 'j') {
                cursorPos = (cursorPos + 1) % items.length;
            }
            else if (key === '\x03') {
                exports.cursor.show();
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
        const icon = r.ok ? style('✓', exports.C.green) : style('⏭', exports.C.gray);
        console.log(`  ${icon} ${style(r.label + ':', exports.C.bold)} ${style(r.detail, exports.C.gray)}`);
    }
}
function renderDone(providerNames) {
    if (!providerNames || providerNames.includes('claude')) {
        console.log(`\n  ${style('⚠️  Plugins will be auto-installed on next Claude Code session.', exports.C.yellow)}`);
    }
    console.log(`\n  Done! 🎉\n`);
}
