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
exports.runSecurityInit = runSecurityInit;
exports.runSecurityCheck = runSecurityCheck;
exports.runSecurityDiff = runSecurityDiff;
exports.runSecurity = runSecurity;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const ui_1 = require("./ui");
const utils_1 = require("./utils");
const registry_1 = require("./providers/registry");
const VALID_LEVELS = ['loose', 'normal', 'strict'];
// --- Helpers ---
function loadLevel(level) {
    const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'security', `${level}.json`);
    const data = (0, utils_1.readJson)(presetPath);
    if (!data) {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} security preset not found: ${presetPath}\n`);
        process.exit(1);
    }
    return data;
}
function loadSecurityBlock(level) {
    const fileName = level === 'strict' ? 'strict-md.md' : 'normal-md.md';
    const blockPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'security', fileName);
    try {
        return fs.readFileSync(blockPath, 'utf-8').trim();
    }
    catch {
        return null;
    }
}
function parseLevel(value) {
    const v = (value || 'normal').toLowerCase();
    if (!VALID_LEVELS.includes(v)) {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} invalid level "${value}". Use loose|normal|strict\n`);
        process.exit(1);
    }
    return v;
}
// --- Help ---
function showSecurityHelp() {
    (0, ui_1.renderBanner)();
    const c = ui_1.C.cyan;
    const b = ui_1.C.bold;
    const g = ui_1.C.gray;
    console.log(`  ${(0, ui_1.style)('Usage:', b)} cup security <subcommand> [options]\n`);
    console.log(`  ${(0, ui_1.style)('Subcommands', b)}`);
    console.log(`    ${(0, ui_1.style)('init', c)}              Apply a security level (deny rules + guidance block)`);
    console.log(`      ${(0, ui_1.style)('--level=<level>', g)} loose | normal | strict (default: normal)`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Skip confirmation`);
    console.log(`    ${(0, ui_1.style)('check', c)}             Audit current security posture`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)`);
    console.log(`      ${(0, ui_1.style)('--verbose, -v', g)}   Show detailed findings`);
    console.log(`    ${(0, ui_1.style)('diff', c)}              Show difference between current and target level`);
    console.log(`      ${(0, ui_1.style)('--level=<level>', g)} Target level to compare against`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)\n`);
    console.log(`  ${(0, ui_1.style)('Levels', b)}`);
    console.log(`    ${(0, ui_1.style)('loose', c)}    — fast experiments, personal toy projects (minimal deny rules)`);
    console.log(`    ${(0, ui_1.style)('normal', c)}   — default for daily development (7 deny rules + sensitive-data guard)`);
    console.log(`    ${(0, ui_1.style)('strict', c)}   — production code, team collaboration (12 deny rules + extra guards)\n`);
}
// --- Init ---
async function runSecurityInit(opts) {
    (0, ui_1.renderBanner)();
    const level = parseLevel(opts.level);
    const config = loadLevel(level);
    const block = level === 'loose' ? null : loadSecurityBlock(level);
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (providers.length === 0) {
        console.log(`  ${(0, ui_1.style)('No LLM CLI tools detected.', ui_1.C.red)}\n`);
        process.exit(1);
    }
    console.log(`  ${(0, ui_1.style)('Applying security level:', ui_1.C.bold)} ${(0, ui_1.style)(level, ui_1.C.cyan)}`);
    console.log(`  ${(0, ui_1.style)(config.description, ui_1.C.gray)}\n`);
    if (!opts.yes) {
        const ok = await (0, ui_1.ask)(`Apply to ${providers.length} provider(s)?`, true);
        if (!ok) {
            console.log(`  ${(0, ui_1.style)('Aborted.', ui_1.C.gray)}\n`);
            return;
        }
    }
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`\n  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        provider.backupSettings();
        provider.applySecurityLevel(config);
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Permissions applied`);
        if (block) {
            provider.writeSecurityBlock(block);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${provider.instructionFileName} security block installed`);
        }
        else {
            provider.removeSecurityBlock();
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Security block skipped (loose level)`);
        }
    }
    console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(`Security level "${level}" applied`, ui_1.C.bold)}\n`);
}
function checkProvider(provider, verbose) {
    let warnings = 0;
    let failures = 0;
    const ok = (msg) => { console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${msg}`); };
    const warn = (msg) => { console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} ${msg}`); warnings++; };
    const fail = (msg) => { console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${msg}`); failures++; };
    const detail = (lines) => { if (verbose)
        for (const l of lines)
            console.log(`    ${(0, ui_1.style)(l, ui_1.C.gray)}`); };
    // 1. deny rules
    const perms = provider.getCurrentPermissions();
    if (perms.deny.length === 0) {
        fail('No deny rules — destructive commands not blocked');
    }
    else if (perms.deny.length < 5) {
        warn(`Only ${perms.deny.length} deny rules — consider applying normal or strict`);
        detail(perms.deny);
    }
    else {
        ok(`${perms.deny.length} deny rules active`);
        detail(perms.deny);
    }
    // 2. cup-security block in instruction file
    const block = provider.readSecurityBlock();
    if (block) {
        const isStrict = block.includes('strict');
        ok(`${provider.instructionFileName} security block installed (${isStrict ? 'strict' : 'normal'})`);
    }
    else {
        warn(`${provider.instructionFileName} has no security block — run "cup security init"`);
    }
    // 3. .cup-auth permission (Claude only — auth file lives there)
    if (provider.name === 'claude') {
        const authPath = path.join(provider.homeDir, '.cup-auth');
        if (fs.existsSync(authPath)) {
            const mode = fs.statSync(authPath).mode & 0o777;
            if (mode === 0o600) {
                ok(`.cup-auth file permission is 0600`);
            }
            else {
                fail(`.cup-auth has insecure permission ${mode.toString(8)} (expected 600)`);
            }
        }
    }
    // 4. Codex sandbox mode
    if (provider.name === 'codex') {
        const settings = provider.readSettings();
        const mode = settings?.sandbox_mode;
        if (mode === 'danger-full-access') {
            fail(`sandbox_mode = "${mode}" — file system fully exposed`);
        }
        else if (mode) {
            ok(`sandbox_mode = "${mode}"`);
        }
        else {
            warn(`sandbox_mode not configured`);
        }
    }
    return { ok: failures === 0 && warnings === 0, warnings, failures };
}
function checkSystem(verbose) {
    let warnings = 0;
    let failures = 0;
    const ok = (msg) => { console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${msg}`); };
    const warn = (msg) => { console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} ${msg}`); warnings++; };
    const fail = (msg) => { console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${msg}`); failures++; };
    // Home-dir secrets
    const npmrc = path.join(utils_1.HOME_DIR, '.npmrc');
    if (fs.existsSync(npmrc)) {
        const mode = fs.statSync(npmrc).mode & 0o777;
        const content = fs.readFileSync(npmrc, 'utf-8');
        const hasToken = /authToken|_auth|_password/.test(content);
        if (hasToken && mode !== 0o600) {
            fail(`~/.npmrc contains a token but permission is ${mode.toString(8)} (expected 600)`);
        }
        else if (hasToken) {
            ok(`~/.npmrc has token + 0600 permission`);
        }
        else if (verbose) {
            ok(`~/.npmrc exists, no token detected`);
        }
    }
    // Current git repo: .env tracked?
    try {
        const root = (0, child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        const tracked = (0, child_process_1.execFileSync)('git', ['ls-files', '.env', '.env.*'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: root }).trim();
        if (tracked) {
            fail(`current git repo tracks .env files: ${tracked.split('\n').join(', ')}`);
        }
        else if (verbose) {
            ok(`current git repo does not track .env files`);
        }
    }
    catch {
        // not a git repo, skip
    }
    return { ok: failures === 0 && warnings === 0, warnings, failures };
}
function runSecurityCheck(opts) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Security check', ui_1.C.bold)}\n`);
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    let totalWarnings = 0;
    let totalFailures = 0;
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)(`Provider: ${provider.displayName}`, ui_1.C.bold)}\n`);
        }
        const result = checkProvider(provider, opts.verbose ?? false);
        totalWarnings += result.warnings;
        totalFailures += result.failures;
        console.log('');
    }
    console.log(`  ${(0, ui_1.style)('── System ──', ui_1.C.bold, ui_1.C.cyan)}\n`);
    const sysResult = checkSystem(opts.verbose ?? false);
    totalWarnings += sysResult.warnings;
    totalFailures += sysResult.failures;
    console.log('');
    if (totalFailures === 0 && totalWarnings === 0) {
        console.log(`  ${(0, ui_1.style)('All security checks passed!', ui_1.C.green, ui_1.C.bold)}\n`);
    }
    else {
        if (totalFailures > 0)
            console.log(`  ${(0, ui_1.style)(`${totalFailures} failure(s)`, ui_1.C.red, ui_1.C.bold)}`);
        if (totalWarnings > 0)
            console.log(`  ${(0, ui_1.style)(`${totalWarnings} warning(s)`, ui_1.C.yellow, ui_1.C.bold)}`);
        console.log('');
    }
}
// --- Diff ---
function runSecurityDiff(opts) {
    (0, ui_1.renderBanner)();
    const level = parseLevel(opts.level);
    const target = loadLevel(level);
    console.log(`  ${(0, ui_1.style)('Security diff:', ui_1.C.bold)} current vs ${(0, ui_1.style)(level, ui_1.C.cyan)}\n`);
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        const current = provider.getCurrentPermissions();
        let targetDeny = [];
        if (provider.name === 'claude') {
            targetDeny = target.providers.claude?.deny || [];
        }
        else if (provider.name === 'gemini') {
            targetDeny = (target.providers.gemini?.policies || []).map(p => String(p.argsPattern || ''));
        }
        else if (provider.name === 'codex') {
            const mode = target.providers.codex?.sandbox_mode || '';
            const settings = provider.readSettings();
            const currentMode = settings?.sandbox_mode;
            if (currentMode === mode) {
                console.log(`  ${(0, ui_1.style)('=', ui_1.C.gray)} sandbox_mode unchanged: ${mode}`);
            }
            else {
                console.log(`  ${(0, ui_1.style)('-', ui_1.C.red)} sandbox_mode: ${currentMode || '(none)'}`);
                console.log(`  ${(0, ui_1.style)('+', ui_1.C.green)} sandbox_mode: ${mode}`);
            }
            console.log('');
            continue;
        }
        const currentSet = new Set(current.deny);
        const targetSet = new Set(targetDeny);
        const removed = current.deny.filter(r => !targetSet.has(r));
        const added = targetDeny.filter(r => !currentSet.has(r));
        const unchanged = current.deny.filter(r => targetSet.has(r));
        for (const r of unchanged)
            console.log(`  ${(0, ui_1.style)('=', ui_1.C.gray)} ${(0, ui_1.style)(r, ui_1.C.gray)}`);
        for (const r of removed)
            console.log(`  ${(0, ui_1.style)('-', ui_1.C.red)} ${r}`);
        for (const r of added)
            console.log(`  ${(0, ui_1.style)('+', ui_1.C.green)} ${r}`);
        if (removed.length === 0 && added.length === 0) {
            console.log(`  ${(0, ui_1.style)('(no changes)', ui_1.C.gray)}`);
        }
        console.log('');
    }
}
// --- Router ---
async function runSecurity(subcommand, opts) {
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
            console.error(`  ${(0, ui_1.style)('Unknown subcommand:', ui_1.C.red)} ${subcommand}`);
            console.error(`  Run ${(0, ui_1.style)('cup security', ui_1.C.cyan)} for usage\n`);
            process.exit(1);
    }
}
