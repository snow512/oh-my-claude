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
exports.PACKAGE_ROOT = exports.CLAUDE_DIR = void 0;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.backup = backup;
exports.isDirChanged = isDirChanged;
exports.runInit = runInit;
exports.runInstall = runInstall;
exports.runProjectInit = runProjectInit;
exports.runClone = runClone;
exports.runBackup = runBackup;
exports.runRestore = runRestore;
exports.runStatus = runStatus;
exports.runDoctor = runDoctor;
exports.runUpdate = runUpdate;
exports.runSessions = runSessions;
exports.runResume = runResume;
exports.installClaudeMd = installClaudeMd;
exports.runUninstall = runUninstall;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const child_process_1 = require("child_process");
const ui_1 = require("./ui");
// --- Constants ---
exports.CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
exports.PACKAGE_ROOT = path.resolve(__dirname, '..');
// --- Utilities ---
function timestamp() {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
            continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            count += copyDirRecursive(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}
function backup(filePath) {
    try {
        const bakPath = `${filePath}.bak.${timestamp()}`;
        fs.copyFileSync(filePath, bakPath);
        return bakPath;
    }
    catch {
        return null;
    }
}
function isDirChanged(srcDir, destDir) {
    try {
        const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of srcEntries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);
            if (entry.isDirectory()) {
                if (isDirChanged(srcPath, destPath))
                    return true;
            }
            else {
                if (!fs.existsSync(destPath))
                    return true;
                const srcContent = fs.readFileSync(srcPath);
                const destContent = fs.readFileSync(destPath);
                if (!srcContent.equals(destContent))
                    return true;
            }
        }
        return false;
    }
    catch {
        return true;
    }
}
function loadPreset(name) {
    const presetPath = path.join(exports.PACKAGE_ROOT, 'presets', name);
    const preset = readJson(presetPath);
    if (!preset || !preset.permissions) {
        console.error(`ERROR: ${name} is missing or invalid`);
        process.exit(1);
    }
    return preset;
}
function getAvailableSkills() {
    const skillsSrc = path.join(exports.PACKAGE_ROOT, 'user-skills');
    try {
        return fs.readdirSync(skillsSrc, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => {
            let desc = '';
            try {
                const content = fs.readFileSync(path.join(skillsSrc, e.name, 'SKILL.md'), 'utf-8');
                const match = content.match(/description:\s*>?\s*\n?\s*(.+)/);
                if (match)
                    desc = match[1].trim().slice(0, 50);
            }
            catch { }
            return { name: e.name, desc: desc || '(no description)' };
        });
    }
    catch {
        return [];
    }
}
// --- Steps ---
async function configureAllow(preset, useDefaults) {
    const allAllow = preset.permissions.allow || [];
    if (useDefaults) {
        await (0, ui_1.progressLine)(`Applying ${allAllow.length} allow rules`, () => { });
        return allAllow;
    }
    console.log('');
    const items = allAllow.map(r => ({ name: r, desc: '' }));
    const selected = await (0, ui_1.checkbox)(items);
    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${selected.length}/${allAllow.length} allow rules selected`);
    return selected;
}
async function configureDeny(preset, useDefaults) {
    const allDeny = preset.permissions.deny || [];
    if (useDefaults) {
        await (0, ui_1.progressLine)(`Applying ${allDeny.length} deny rules`, () => { });
        return allDeny;
    }
    console.log('');
    const items = allDeny.map(r => ({ name: r, desc: '' }));
    const selected = await (0, ui_1.checkbox)(items);
    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${selected.length}/${allDeny.length} deny rules selected`);
    return selected;
}
async function configurePlugins(preset, useDefaults) {
    const allPlugins = Object.keys(preset.enabledPlugins || {});
    if (useDefaults) {
        await (0, ui_1.progressLine)(`Enabling ${allPlugins.length} plugins`, () => { });
        return allPlugins;
    }
    console.log('');
    const items = allPlugins.map(p => ({ name: p, desc: p.replace(/@.*$/, '') }));
    const selected = await (0, ui_1.checkbox)(items);
    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${selected.length}/${allPlugins.length} plugins selected`);
    return selected;
}
function copySkillWithLang(srcDir, destDir, lang) {
    copyDirRecursive(srcDir, destDir);
    if (lang === 'ko') {
        const koFile = path.join(srcDir, 'SKILL.ko.md');
        const destFile = path.join(destDir, 'SKILL.md');
        if (fs.existsSync(koFile))
            fs.copyFileSync(koFile, destFile);
    }
    const destKo = path.join(destDir, 'SKILL.ko.md');
    try {
        fs.unlinkSync(destKo);
    }
    catch { }
}
async function installSkills(useDefaults, lang) {
    const skillsSrc = path.join(exports.PACKAGE_ROOT, 'user-skills');
    const skillsDest = path.join(exports.CLAUDE_DIR, 'skills');
    const available = getAvailableSkills();
    if (available.length === 0) {
        return { ok: false, label: 'Skills', detail: 'no skills found', selected: [] };
    }
    let selectedNames;
    if (useDefaults) {
        selectedNames = available.map(s => s.name);
        await (0, ui_1.progressLine)(`Installing all ${available.length} skills (${lang})`, () => {
            for (const name of selectedNames) {
                copySkillWithLang(path.join(skillsSrc, name), path.join(skillsDest, name), lang);
            }
        });
    }
    else {
        console.log('');
        selectedNames = await (0, ui_1.checkbox)(available);
        for (const name of selectedNames) {
            copySkillWithLang(path.join(skillsSrc, name), path.join(skillsDest, name), lang);
        }
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${selectedNames.length} skills installed (${lang})`);
    }
    return { ok: true, label: 'Skills', detail: `${selectedNames.length}/${available.length} installed`, selected: selectedNames };
}
async function installStatusLine(settingsPath, useDefaults) {
    const statuslineSrc = path.join(exports.PACKAGE_ROOT, 'statusline-command.sh');
    const statuslineDest = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
    if (!fs.existsSync(statuslineSrc)) {
        return { ok: false, label: 'Status Line', detail: 'not available' };
    }
    let install = useDefaults;
    if (!useDefaults) {
        const alreadyExists = fs.existsSync(statuslineDest);
        const q = alreadyExists ? 'Status line exists. Overwrite?' : 'Install custom status line?';
        install = await (0, ui_1.ask)(q, true);
    }
    if (install) {
        await (0, ui_1.progressLine)('Installing status line', () => {
            fs.copyFileSync(statuslineSrc, statuslineDest);
            fs.chmodSync(statuslineDest, 0o755);
            const currentSettings = readJson(settingsPath) || {};
            if (!currentSettings.statusLine) {
                writeJson(settingsPath, { ...currentSettings, statusLine: { type: 'command', command: `bash ${statuslineDest}` } });
            }
        });
        return { ok: true, label: 'Status Line', detail: 'installed' };
    }
    return { ok: false, label: 'Status Line', detail: 'skipped' };
}
// --- Main: init ---
async function runInit(opts = {}) {
    (0, ui_1.renderBanner)();
    const useDefaults = opts.yes || await (0, ui_1.ask)('Use defaults? (install everything)', true);
    const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
    const detectedLang = sysLocale.startsWith('ko') ? 'ko' : 'en';
    let lang = opts.lang || detectedLang;
    if (!useDefaults && !opts.lang) {
        const defaultHint = detectedLang === 'ko' ? `en/${(0, ui_1.style)('[ko]', ui_1.C.gray)}` : `${(0, ui_1.style)('[en]', ui_1.C.gray)}/ko`;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        lang = await new Promise((resolve) => {
            rl.question(`  Skill language? ${defaultHint}: `, (answer) => {
                rl.close();
                const a = answer.trim().toLowerCase();
                if (a === '')
                    resolve(detectedLang);
                else
                    resolve(a === 'ko' ? 'ko' : 'en');
            });
        });
    }
    const totalSteps = 7;
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const preset = loadPreset('user.json');
    const bakPath = backup(settingsPath);
    if (bakPath)
        console.log(`\n  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + bakPath, ui_1.C.gray)}`);
    (0, ui_1.renderStep)(1, totalSteps, 'Permissions (allow)');
    const selectedAllow = await configureAllow(preset, useDefaults);
    (0, ui_1.renderStep)(2, totalSteps, 'Permissions (deny)');
    const selectedDeny = await configureDeny(preset, useDefaults);
    (0, ui_1.renderStep)(3, totalSteps, 'Plugins');
    const selectedPlugins = await configurePlugins(preset, useDefaults);
    const existing = readJson(settingsPath) || {};
    const enabledPlugins = {};
    for (const p of selectedPlugins) {
        enabledPlugins[p] = true;
    }
    writeJson(settingsPath, {
        ...existing,
        permissions: { allow: selectedAllow, deny: selectedDeny },
        enabledPlugins,
        extraKnownMarketplaces: preset.extraKnownMarketplaces,
    });
    await (0, ui_1.progressLine)('Configuring marketplaces', () => { });
    (0, ui_1.renderStep)(4, totalSteps, 'User Skills');
    const skillsResult = await installSkills(useDefaults, lang);
    (0, ui_1.renderStep)(5, totalSteps, 'Status Line');
    const statusResult = await installStatusLine(settingsPath, useDefaults);
    (0, ui_1.renderStep)(6, totalSteps, 'CLAUDE.md');
    const claudeMdResult = await installClaudeMd(useDefaults);
    (0, ui_1.renderStep)(7, totalSteps, 'Summary');
    (0, ui_1.renderSummary)([
        { ok: true, label: 'Allow rules', detail: `${selectedAllow.length} configured` },
        { ok: true, label: 'Deny rules', detail: `${selectedDeny.length} configured` },
        { ok: true, label: 'Plugins', detail: `${selectedPlugins.length} enabled` },
        { ok: skillsResult.ok, label: skillsResult.label, detail: skillsResult.detail },
        { ok: statusResult.ok, label: statusResult.label, detail: statusResult.detail },
        { ok: claudeMdResult.ok, label: claudeMdResult.label, detail: claudeMdResult.detail },
    ]);
    (0, ui_1.renderDone)();
}
// --- Install ---
async function runInstall(target, opts = {}) {
    (0, ui_1.renderBanner)();
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const preset = loadPreset('user.json');
    const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
    const lang = opts.lang || (sysLocale.startsWith('ko') ? 'ko' : 'en');
    switch (target) {
        case 'skills': {
            console.log(`  ${(0, ui_1.style)('Installing skills...', ui_1.C.bold)}\n`);
            const result = await installSkills(!!opts.force, lang);
            console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(result.detail, ui_1.C.bold)}\n`);
            break;
        }
        case 'plugins': {
            console.log(`  ${(0, ui_1.style)('Applying plugins...', ui_1.C.bold)}\n`);
            if (!opts.force) {
                const b = backup(settingsPath);
                if (b)
                    console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
            }
            const ex = readJson(settingsPath) || {};
            ex.enabledPlugins = preset.enabledPlugins;
            ex.extraKnownMarketplaces = preset.extraKnownMarketplaces;
            writeJson(settingsPath, ex);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${Object.keys(preset.enabledPlugins || {}).length} plugins enabled`);
            console.log(`\n  ${(0, ui_1.style)('⚠️  Plugins will be auto-installed on next session.', ui_1.C.yellow)}\n`);
            break;
        }
        case 'permissions': {
            console.log(`  ${(0, ui_1.style)('Applying permissions...', ui_1.C.bold)}\n`);
            if (!opts.force) {
                const b = backup(settingsPath);
                if (b)
                    console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
            }
            const ex = readJson(settingsPath) || {};
            ex.permissions = preset.permissions;
            writeJson(settingsPath, ex);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${preset.permissions.allow?.length || 0} allow, ${preset.permissions.deny?.length || 0} deny\n`);
            break;
        }
        case 'statusline': {
            console.log(`  ${(0, ui_1.style)('Installing status line...', ui_1.C.bold)}\n`);
            const src = path.join(exports.PACKAGE_ROOT, 'statusline-command.sh');
            const dest = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
            if (!fs.existsSync(src)) {
                console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} statusline-command.sh not found\n`);
                break;
            }
            fs.copyFileSync(src, dest);
            fs.chmodSync(dest, 0o755);
            const ex = readJson(settingsPath) || {};
            if (!ex.statusLine) {
                ex.statusLine = { type: 'command', command: `bash ${dest}` };
                writeJson(settingsPath, ex);
            }
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${dest}\n`);
            break;
        }
        case 'all':
            return runInit({ ...opts, yes: true });
        default:
            console.error(`  ${(0, ui_1.style)('Unknown target:', ui_1.C.red)} ${target || '(none)'}`);
            console.error(`\n  Available: ${(0, ui_1.style)('skills', ui_1.C.cyan)}, ${(0, ui_1.style)('plugins', ui_1.C.cyan)}, ${(0, ui_1.style)('permissions', ui_1.C.cyan)}, ${(0, ui_1.style)('statusline', ui_1.C.cyan)}, ${(0, ui_1.style)('all', ui_1.C.cyan)}\n`);
            process.exit(1);
    }
}
// --- Project Init ---
function runProjectInit(opts = {}) {
    console.log('\nclaude-up project-init\n');
    let projectRoot;
    try {
        projectRoot = (0, child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
    }
    catch {
        projectRoot = process.cwd();
    }
    const claudeDir = path.join(projectRoot, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.local.json');
    const preset = loadPreset('project.json');
    if (!opts.force) {
        const b = backup(settingsPath);
        if (b)
            console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
    }
    const existing = readJson(settingsPath) || {};
    writeJson(settingsPath, { ...existing, permissions: preset.permissions });
    console.log(`\n  ${(0, ui_1.style)('Project:', ui_1.C.bold)} ${(0, ui_1.style)(projectRoot, ui_1.C.cyan)}\n`);
    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} allow: ${(preset.permissions.allow || []).join(', ')}`);
    const copiedSkills = [];
    const skillsSrc = path.join(exports.PACKAGE_ROOT, 'project-skills');
    const skillsDest = path.join(claudeDir, 'skills');
    try {
        for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            copyDirRecursive(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
            copiedSkills.push(entry.name);
        }
    }
    catch { }
    if (copiedSkills.length > 0)
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${copiedSkills.length} project skills installed`);
    console.log('\n  Done!\n');
}
// --- Clone ---
async function runClone(opts = {}) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Exporting current Claude environment...', ui_1.C.bold)}\n`);
    const outDir = opts.output || path.join(process.cwd(), `claude-env-${timestamp()}`);
    fs.mkdirSync(outDir, { recursive: true });
    const items = [
        { src: path.join(exports.CLAUDE_DIR, 'settings.json'), dest: 'settings.json', label: 'Settings' },
        { src: path.join(exports.CLAUDE_DIR, 'statusline-command.sh'), dest: 'statusline-command.sh', label: 'Status line' },
        { src: path.join(exports.CLAUDE_DIR, 'skills'), dest: 'skills', label: 'User skills', dir: true },
        { src: path.join(exports.CLAUDE_DIR, 'commands'), dest: 'commands', label: 'User commands', dir: true },
    ];
    let count = 0;
    for (const item of items) {
        if (!fs.existsSync(item.src)) {
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${item.label} — not found`);
            continue;
        }
        const destPath = path.join(outDir, item.dest);
        if (item.dir)
            copyDirRecursive(item.src, destPath);
        else
            fs.copyFileSync(item.src, destPath);
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${item.label}`);
        count++;
    }
    const pluginsFile = path.join(exports.CLAUDE_DIR, 'plugins', 'installed_plugins.json');
    if (fs.existsSync(pluginsFile)) {
        fs.mkdirSync(path.join(outDir, 'plugins'), { recursive: true });
        fs.copyFileSync(pluginsFile, path.join(outDir, 'plugins', 'installed_plugins.json'));
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Installed plugins list`);
        count++;
    }
    console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(`${count} items exported to:`, ui_1.C.bold)}`);
    console.log(`  ${(0, ui_1.style)(outDir, ui_1.C.cyan)}\n`);
}
// --- Backup ---
async function runBackup(opts = {}) {
    (0, ui_1.renderBanner)();
    const tarPath = opts.output || path.join(process.cwd(), `claude-backup-${timestamp()}.tar.gz`);
    console.log(`  ${(0, ui_1.style)('Creating backup...', ui_1.C.bold)}\n`);
    await (0, ui_1.progressLine)('Compressing ~/.claude/', () => {
        (0, child_process_1.execFileSync)('tar', ['--exclude', '*/plugins/cache/*', '--exclude', '*/plugins/marketplaces/*', '-czf', tarPath, '-C', path.dirname(exports.CLAUDE_DIR), path.basename(exports.CLAUDE_DIR)], { stdio: 'pipe' });
    });
    const size = fs.statSync(tarPath).size;
    const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
    console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Backup created:', ui_1.C.bold)} ${(0, ui_1.style)(path.basename(tarPath), ui_1.C.cyan)}`);
    console.log(`  ${(0, ui_1.style)('Size:', ui_1.C.gray)} ${sizeStr}\n`);
}
// --- Restore ---
async function runRestore(source, opts = {}) {
    (0, ui_1.renderBanner)();
    if (!source) {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} Please specify a backup file or clone folder\n`);
        process.exit(1);
    }
    if (!fs.existsSync(source)) {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} Not found: ${source}\n`);
        process.exit(1);
    }
    const stat = fs.statSync(source);
    if (!opts.force) {
        const b = backup(path.join(exports.CLAUDE_DIR, 'settings.json'));
        if (b)
            console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}\n`);
    }
    if (stat.isDirectory()) {
        console.log(`  ${(0, ui_1.style)('Restoring from clone folder...', ui_1.C.bold)}\n`);
        const items = [
            { src: 'settings.json', dest: path.join(exports.CLAUDE_DIR, 'settings.json'), label: 'Settings' },
            { src: 'statusline-command.sh', dest: path.join(exports.CLAUDE_DIR, 'statusline-command.sh'), label: 'Status line' },
            { src: 'skills', dest: path.join(exports.CLAUDE_DIR, 'skills'), label: 'User skills', dir: true },
            { src: 'commands', dest: path.join(exports.CLAUDE_DIR, 'commands'), label: 'User commands', dir: true },
        ];
        let count = 0;
        for (const item of items) {
            const srcPath = path.join(source, item.src);
            if (!fs.existsSync(srcPath)) {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${item.label} — not in backup`);
                continue;
            }
            if (item.dir)
                copyDirRecursive(srcPath, item.dest);
            else {
                fs.mkdirSync(path.dirname(item.dest), { recursive: true });
                fs.copyFileSync(srcPath, item.dest);
            }
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${item.label}`);
            count++;
        }
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(`${count} items restored`, ui_1.C.bold)}\n`);
    }
    else if (source.endsWith('.tar.gz') || source.endsWith('.tgz')) {
        console.log(`  ${(0, ui_1.style)('Restoring from backup...', ui_1.C.bold)}\n`);
        await (0, ui_1.progressLine)('Extracting backup', () => {
            (0, child_process_1.execFileSync)('tar', ['xzf', path.resolve(source), '-C', path.dirname(exports.CLAUDE_DIR)], { stdio: 'pipe' });
        });
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Restore complete', ui_1.C.bold)}\n`);
    }
    else {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} Unsupported format\n`);
        process.exit(1);
    }
}
// --- Status ---
function runStatus(opts = {}) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Environment Status', ui_1.C.bold)}\n`);
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const settings = readJson(settingsPath);
    if (settings) {
        const perms = settings.permissions;
        const allow = perms?.allow?.length || 0;
        const deny = perms?.deny?.length || 0;
        const plugins = Object.keys(settings.enabledPlugins || {}).length;
        console.log(`  ${(0, ui_1.style)('Settings', ui_1.C.bold)} ${(0, ui_1.style)(settingsPath, ui_1.C.gray)}`);
        console.log(`    Permissions: ${(0, ui_1.style)(`${allow} allow`, ui_1.C.green)}, ${(0, ui_1.style)(`${deny} deny`, ui_1.C.red)}`);
        console.log(`    Plugins:     ${(0, ui_1.style)(`${plugins} enabled`, ui_1.C.cyan)}`);
        console.log(`    Status line: ${settings.statusLine ? (0, ui_1.style)('configured', ui_1.C.green) : (0, ui_1.style)('not set', ui_1.C.gray)}`);
    }
    else {
        console.log(`  ${(0, ui_1.style)('Settings', ui_1.C.bold)} ${(0, ui_1.style)('not found', ui_1.C.red)}`);
    }
    const skillsDir = path.join(exports.CLAUDE_DIR, 'skills');
    let skillNames = [];
    try {
        skillNames = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    }
    catch { }
    console.log(`\n  ${(0, ui_1.style)('User Skills', ui_1.C.bold)} ${(0, ui_1.style)(`(${skillNames.length})`, ui_1.C.gray)}`);
    for (const name of skillNames.sort())
        console.log(`    ${(0, ui_1.style)('•', ui_1.C.cyan)} ${name}`);
    if (skillNames.length === 0)
        console.log(`    ${(0, ui_1.style)('(none)', ui_1.C.gray)}`);
    if (settings?.enabledPlugins) {
        const pluginNames = Object.keys(settings.enabledPlugins);
        console.log(`\n  ${(0, ui_1.style)('Plugins', ui_1.C.bold)} ${(0, ui_1.style)(`(${pluginNames.length})`, ui_1.C.gray)}`);
        for (const name of pluginNames.sort())
            console.log(`    ${(0, ui_1.style)('•', ui_1.C.cyan)} ${name.replace(/@.*$/, '')}`);
    }
    const statuslinePath = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
    console.log(`\n  ${(0, ui_1.style)('Status Line', ui_1.C.bold)}`);
    console.log(fs.existsSync(statuslinePath) ? `    ${(0, ui_1.style)('✓', ui_1.C.green)} ${statuslinePath}` : `    ${(0, ui_1.style)('✗', ui_1.C.gray)} not installed`);
    console.log('');
}
// --- Doctor ---
function runDoctor(opts = {}) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Checking configuration...', ui_1.C.bold)}\n`);
    const v = opts.verbose ?? false;
    let issues = 0;
    let warnings = 0;
    const ok = (msg) => { console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${msg}`); };
    const warn = (msg) => { console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} ${msg}`); warnings++; };
    const fail = (msg) => { console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${msg}`); issues++; };
    const detail = (lines) => { if (v)
        for (const l of lines)
            console.log(`    ${(0, ui_1.style)(l, ui_1.C.gray)}`); };
    if (!fs.existsSync(exports.CLAUDE_DIR)) {
        fail('~/.claude/ not found — run "cup init"');
        return;
    }
    ok('~/.claude/ directory exists');
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const settings = readJson(settingsPath);
    if (settings)
        ok('settings.json is valid JSON');
    else if (fs.existsSync(settingsPath))
        fail('settings.json is invalid JSON');
    else
        fail('settings.json not found');
    const perms = settings?.permissions || {};
    if (perms.allow?.length) {
        ok(`permissions.allow: ${perms.allow.length} rules`);
        detail(perms.allow);
    }
    else
        warn('No allow permissions');
    if (perms.deny?.length) {
        ok(`permissions.deny: ${perms.deny.length} rules`);
        detail(perms.deny);
    }
    else
        warn('No deny permissions — destructive commands not blocked');
    const ep = settings?.enabledPlugins;
    const pluginNames = ep ? Object.keys(ep) : [];
    if (pluginNames.length > 0) {
        ok(`${pluginNames.length} plugins enabled`);
        detail(pluginNames);
    }
    else
        warn('No plugins enabled');
    if (settings?.extraKnownMarketplaces)
        ok('Marketplace configured');
    else
        warn('No marketplace configured');
    const skillsDir = path.join(exports.CLAUDE_DIR, 'skills');
    if (fs.existsSync(skillsDir)) {
        const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory());
        if (skills.length > 0) {
            ok(`${skills.length} user skills installed`);
            detail(skills.map(s => s.name));
            let broken = 0;
            for (const s of skills) {
                if (!fs.existsSync(path.join(skillsDir, s.name, 'SKILL.md'))) {
                    fail(`"${s.name}" missing SKILL.md`);
                    broken++;
                }
            }
            if (broken === 0)
                ok('All skills have valid SKILL.md');
        }
        else
            warn('Skills directory is empty');
    }
    else
        warn('No skills directory');
    const slPath = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
    if (fs.existsSync(slPath)) {
        if (fs.statSync(slPath).mode & 0o111)
            ok('statusline-command.sh is executable');
        else
            warn('statusline-command.sh not executable');
        if (settings?.statusLine)
            ok('statusLine configured');
        else
            warn('statusLine not configured in settings.json');
    }
    try {
        const backups = fs.readdirSync(exports.CLAUDE_DIR).filter(f => f.includes('.bak.'));
        if (backups.length > 5) {
            const totalKB = backups.reduce((sum, f) => {
                try {
                    return sum + fs.statSync(path.join(exports.CLAUDE_DIR, f)).size;
                }
                catch {
                    return sum;
                }
            }, 0);
            warn(`${backups.length} cup backup files (${Math.round(totalKB / 1024)}KB) — created by "cup init/update" before overwriting settings. Run "rm ~/.claude/*.bak.*" to clean up`);
            detail(backups);
        }
    }
    catch { }
    console.log('');
    if (issues === 0 && warnings === 0)
        console.log(`  ${(0, ui_1.style)('All checks passed!', ui_1.C.green, ui_1.C.bold)}\n`);
    else {
        if (issues > 0)
            console.log(`  ${(0, ui_1.style)(`${issues} issue(s)`, ui_1.C.red, ui_1.C.bold)}`);
        if (warnings > 0)
            console.log(`  ${(0, ui_1.style)(`${warnings} warning(s)`, ui_1.C.yellow, ui_1.C.bold)}`);
        console.log('');
    }
}
// --- Update ---
async function runUpdate(opts = {}) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Checking for updates...', ui_1.C.bold)}\n`);
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const settings = readJson(settingsPath) || {};
    const preset = loadPreset('user.json');
    // Permissions
    const pAllow = JSON.stringify((preset.permissions.allow || []));
    const lAllow = JSON.stringify(settings.permissions?.allow || []);
    const pDeny = JSON.stringify((preset.permissions.deny || []));
    const lDeny = JSON.stringify(settings.permissions?.deny || []);
    if (opts.force || pAllow !== lAllow || pDeny !== lDeny) {
        console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Permissions changed`);
        if (opts.yes || await (0, ui_1.ask)('Update permissions?', true)) {
            settings.permissions = preset.permissions;
            writeJson(settingsPath, settings);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Permissions updated\n`);
        }
        else
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
    }
    else
        console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Permissions (up to date)`);
    // Plugins
    const pPlugins = JSON.stringify(Object.keys(preset.enabledPlugins || {}).sort());
    const lPlugins = JSON.stringify(Object.keys(settings.enabledPlugins || {}).sort());
    if (opts.force || pPlugins !== lPlugins) {
        console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Plugins changed`);
        if (opts.yes || await (0, ui_1.ask)('Update plugins?', true)) {
            settings.enabledPlugins = preset.enabledPlugins;
            writeJson(settingsPath, settings);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Plugins updated\n`);
        }
        else
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
    }
    else
        console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Plugins (up to date)`);
    // Statusline
    const slSrc = path.join(exports.PACKAGE_ROOT, 'statusline-command.sh');
    const slDest = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
    if (fs.existsSync(slSrc) && fs.existsSync(slDest)) {
        if (!fs.readFileSync(slSrc).equals(fs.readFileSync(slDest))) {
            console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Status line changed`);
            if (opts.yes || await (0, ui_1.ask)('Update status line?', true)) {
                fs.copyFileSync(slSrc, slDest);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Updated\n`);
            }
            else
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
        }
        else
            console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Status line (up to date)`);
    }
    // Skills
    let lang = 'en';
    const skillsDest = path.join(exports.CLAUDE_DIR, 'skills');
    try {
        const first = fs.readdirSync(skillsDest, { withFileTypes: true }).find(e => e.isDirectory());
        if (first) {
            const c = fs.readFileSync(path.join(skillsDest, first.name, 'SKILL.md'), 'utf-8');
            if (/[\uAC00-\uD7AF]/.test(c.split('---')[2] || ''))
                lang = 'ko';
        }
    }
    catch { }
    console.log(`\n  ${(0, ui_1.style)(`Skills (${lang}):`, ui_1.C.bold)}`);
    const skillsSrc = path.join(exports.PACKAGE_ROOT, 'user-skills');
    const repoSkills = new Set();
    try {
        for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
            if (e.isDirectory())
                repoSkills.add(e.name);
        }
    }
    catch {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} user-skills/ not found\n`);
        return;
    }
    const localSkills = new Set();
    try {
        for (const e of fs.readdirSync(skillsDest, { withFileTypes: true })) {
            if (e.isDirectory())
                localSkills.add(e.name);
        }
    }
    catch { }
    const newSkills = [], changedSkills = [], upToDate = [], removedSkills = [];
    for (const name of repoSkills) {
        if (!localSkills.has(name))
            newSkills.push(name);
        else if (opts.force || isDirChanged(path.join(skillsSrc, name), path.join(skillsDest, name)))
            changedSkills.push(name);
        else
            upToDate.push(name);
    }
    for (const name of localSkills) {
        if (!repoSkills.has(name))
            removedSkills.push(name);
    }
    for (const n of upToDate)
        console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} ${(0, ui_1.style)(n, ui_1.C.gray)} (up to date)`);
    for (const n of changedSkills)
        console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} ${n} (changed)`);
    for (const n of newSkills)
        console.log(`  ${(0, ui_1.style)('+', ui_1.C.green)} ${n} (new)`);
    for (const n of removedSkills)
        console.log(`  ${(0, ui_1.style)('?', ui_1.C.yellow)} ${n} (local only)`);
    if (changedSkills.length > 0 && (opts.yes || await (0, ui_1.ask)(`Update ${changedSkills.length} changed skill(s)?`, true))) {
        for (const n of changedSkills) {
            copySkillWithLang(path.join(skillsSrc, n), path.join(skillsDest, n), lang);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${n} updated`);
        }
    }
    if (newSkills.length > 0 && (opts.yes || await (0, ui_1.ask)(`Install ${newSkills.length} new skill(s)?`, true))) {
        for (const n of newSkills) {
            copySkillWithLang(path.join(skillsSrc, n), path.join(skillsDest, n), lang);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${n} added`);
        }
    }
    if (removedSkills.length > 0 && (opts.yes || await (0, ui_1.ask)(`Remove ${removedSkills.length} local-only skill(s)?`, false))) {
        for (const n of removedSkills) {
            fs.rmSync(path.join(skillsDest, n), { recursive: true });
            console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${n} removed`);
        }
    }
    console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Update check complete', ui_1.C.bold)}\n`);
}
// --- Sessions ---
function getSessionList(opts = {}) {
    const projectsDir = path.join(exports.CLAUDE_DIR, 'projects');
    if (!fs.existsSync(projectsDir))
        return [];
    const projects = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory());
    let cwd;
    try {
        cwd = (0, child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
    }
    catch {
        cwd = process.cwd();
    }
    const cwdEncoded = cwd.replace(/\//g, '-');
    const sessions = [];
    for (const proj of projects) {
        const projPath = path.join(projectsDir, proj.name);
        const projName = proj.name.replace(/^-home-[^-]+-(Workspace-|Garage-)?/, '').replace(/^-/, '') || proj.name;
        if (opts.project) {
            if (!projName.toLowerCase().includes(opts.project.toLowerCase()))
                continue;
        }
        else if (!opts.all) {
            if (!proj.name.includes(cwdEncoded.slice(1)))
                continue;
        }
        let files;
        try {
            files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
        }
        catch {
            continue;
        }
        for (const file of files) {
            const filePath = path.join(projPath, file);
            try {
                const stat = fs.statSync(filePath);
                const fd = fs.openSync(filePath, 'r');
                const buf = Buffer.alloc(4000);
                fs.readSync(fd, buf, 0, 4000, 0);
                fs.closeSync(fd);
                let firstMessage = '';
                for (const line of buf.toString('utf-8').split('\n')) {
                    try {
                        const obj = JSON.parse(line);
                        if (obj.type === 'user' && obj.message?.content) {
                            const content = typeof obj.message.content === 'string' ? obj.message.content : JSON.stringify(obj.message.content);
                            if (content.startsWith('<local-command-caveat>') || content.startsWith('<command-'))
                                continue;
                            firstMessage = content.replace(/<[^>]+>/g, '').trim().slice(0, 80);
                            break;
                        }
                    }
                    catch { }
                }
                sessions.push({ id: file.replace('.jsonl', ''), project: projName, date: stat.mtime, size: stat.size, firstMessage: firstMessage || '(empty)' });
            }
            catch { }
        }
    }
    sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return sessions.slice(0, opts.limit || 10);
}
function runSessions(opts = {}) {
    (0, ui_1.renderBanner)();
    const sessions = getSessionList(opts);
    if (sessions.length === 0) {
        console.log(`  ${(0, ui_1.style)('No sessions found.', ui_1.C.gray)}\n`);
        return;
    }
    const scope = opts.all ? 'all projects' : opts.project || 'current project';
    console.log(`  ${(0, ui_1.style)(`Recent sessions (${scope}):`, ui_1.C.bold)}\n`);
    for (const s of sessions) {
        const date = s.date.toISOString().slice(0, 16).replace('T', ' ');
        const sizeStr = s.size > 1048576 ? `${(s.size / 1048576).toFixed(1)}MB` : `${(s.size / 1024).toFixed(0)}KB`;
        const msg = s.firstMessage.length > 60 ? s.firstMessage.slice(0, 60) + '...' : s.firstMessage;
        console.log(`  ${(0, ui_1.style)(date, ui_1.C.gray)}  ${(0, ui_1.style)(s.id.slice(0, 8), ui_1.C.gray)}  ${(0, ui_1.style)(s.project, ui_1.C.cyan)}`);
        console.log(`    ${(0, ui_1.style)(msg, ui_1.C.dim)}  ${(0, ui_1.style)(sizeStr, ui_1.C.gray)}`);
    }
    console.log(`\n  ${(0, ui_1.style)('Resume:', ui_1.C.gray)} ${(0, ui_1.style)('cup resume <id>', ui_1.C.cyan)}\n`);
}
// --- Resume ---
async function runResume(sessionId, opts = {}) {
    if (!sessionId) {
        const sessions = getSessionList({ ...opts, all: true, limit: 20 });
        if (sessions.length === 0) {
            console.error(`  ${(0, ui_1.style)('No sessions found.', ui_1.C.red)}\n`);
            return;
        }
        const items = sessions.map(s => ({
            name: s.id,
            desc: `${s.date.toISOString().slice(0, 10)} ${s.project} — ${s.firstMessage.slice(0, 40)}`,
        }));
        (0, ui_1.renderBanner)();
        console.log(`  ${(0, ui_1.style)('Select a session to resume:', ui_1.C.bold)}\n`);
        const selected = await (0, ui_1.checkbox)(items);
        if (!selected || selected.length === 0)
            return;
        sessionId = selected[0];
    }
    if (sessionId.length < 36) {
        const sessions = getSessionList({ all: true, limit: 100 });
        const match = sessions.find(s => s.id.startsWith(sessionId));
        if (match)
            sessionId = match.id;
        else {
            console.error(`  ${(0, ui_1.style)('Session not found:', ui_1.C.red)} ${sessionId}\n`);
            return;
        }
    }
    console.log(`\n  ${(0, ui_1.style)('Resuming:', ui_1.C.bold)} ${(0, ui_1.style)(sessionId.slice(0, 8) + '...', ui_1.C.cyan)}`);
    if (opts.fork)
        console.log(`  ${(0, ui_1.style)('(forked)', ui_1.C.gray)}`);
    console.log('');
    const claudeArgs = ['--resume', sessionId];
    if (opts.fork)
        claudeArgs.push('--fork-session');
    try {
        (0, child_process_1.execFileSync)('claude', claudeArgs, { stdio: 'inherit' });
    }
    catch (err) {
        if (err.status)
            process.exit(err.status);
    }
}
// --- CLAUDE.md management ---
const CUP_START = '<!-- <cup> — managed by claude-up, do not edit manually -->';
const CUP_END = '<!-- </cup> -->';
function getCupContent() {
    const templatePath = path.join(exports.PACKAGE_ROOT, 'presets', 'claude-md.md');
    return fs.readFileSync(templatePath, 'utf-8').trim();
}
function hasCupBlock(content) {
    return content.includes(CUP_START) && content.includes(CUP_END);
}
function extractCupBlock(content) {
    const startIdx = content.indexOf(CUP_START);
    const endIdx = content.indexOf(CUP_END);
    if (startIdx === -1 || endIdx === -1)
        return '';
    return content.slice(startIdx, endIdx + CUP_END.length);
}
function removeCupBlock(content) {
    const startIdx = content.indexOf(CUP_START);
    const endIdx = content.indexOf(CUP_END);
    if (startIdx === -1 || endIdx === -1)
        return content;
    return (content.slice(0, startIdx) + content.slice(endIdx + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
}
async function installClaudeMd(useDefaults) {
    const claudeMdPath = path.join(exports.CLAUDE_DIR, 'CLAUDE.md');
    const cupContent = getCupContent();
    const existing = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf-8') : '';
    if (hasCupBlock(existing)) {
        const currentBlock = extractCupBlock(existing);
        if (currentBlock.trim() === cupContent.trim()) {
            return { ok: true, label: 'CLAUDE.md', detail: 'up to date' };
        }
        // Block exists but content changed — check if user modified it
        let install = useDefaults;
        if (!useDefaults) {
            install = await (0, ui_1.ask)('CLAUDE.md cup section has updates. Apply?', true);
        }
        if (install) {
            const updated = existing.replace(currentBlock, cupContent);
            fs.writeFileSync(claudeMdPath, updated);
            return { ok: true, label: 'CLAUDE.md', detail: 'updated' };
        }
        return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
    }
    // No cup block yet — append
    let install = useDefaults;
    if (!useDefaults) {
        install = await (0, ui_1.ask)('Add claude-up section to CLAUDE.md?', true);
    }
    if (install) {
        const newContent = existing ? existing.trimEnd() + '\n\n' + cupContent + '\n' : cupContent + '\n';
        fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
        fs.writeFileSync(claudeMdPath, newContent);
        return { ok: true, label: 'CLAUDE.md', detail: 'installed' };
    }
    return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
}
// --- Uninstall ---
async function runUninstall(opts = {}) {
    (0, ui_1.renderBanner)();
    console.log(`  ${(0, ui_1.style)('Uninstalling claude-up...', ui_1.C.bold)}\n`);
    const settingsPath = path.join(exports.CLAUDE_DIR, 'settings.json');
    const skillsDest = path.join(exports.CLAUDE_DIR, 'skills');
    const statuslineDest = path.join(exports.CLAUDE_DIR, 'statusline-command.sh');
    const claudeMdPath = path.join(exports.CLAUDE_DIR, 'CLAUDE.md');
    // 1. Remove cup block from CLAUDE.md
    if (fs.existsSync(claudeMdPath)) {
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        if (hasCupBlock(content)) {
            const cleaned = removeCupBlock(content);
            if (cleaned !== content) {
                if (opts.yes || await (0, ui_1.ask)('Remove claude-up section from CLAUDE.md?', true)) {
                    fs.writeFileSync(claudeMdPath, cleaned + '\n');
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} CLAUDE.md — cup section removed`);
                }
                else {
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  CLAUDE.md skipped`);
                }
            }
        }
    }
    // 2. Remove skills
    if (fs.existsSync(skillsDest)) {
        const skillsSrc = path.join(exports.PACKAGE_ROOT, 'user-skills');
        const repoSkills = new Set();
        try {
            for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
                if (e.isDirectory())
                    repoSkills.add(e.name);
            }
        }
        catch { }
        const localSkills = fs.readdirSync(skillsDest, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name);
        const cupSkills = localSkills.filter(s => repoSkills.has(s));
        const userSkills = localSkills.filter(s => !repoSkills.has(s));
        if (cupSkills.length > 0) {
            if (opts.yes || await (0, ui_1.ask)(`Remove ${cupSkills.length} claude-up skills?`, true)) {
                for (const name of cupSkills) {
                    fs.rmSync(path.join(skillsDest, name), { recursive: true });
                }
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${cupSkills.length} skills removed`);
            }
            else {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skills skipped`);
            }
        }
        if (userSkills.length > 0) {
            console.log(`  ${(0, ui_1.style)('ℹ', ui_1.C.cyan)} ${userSkills.length} user-created skill(s) kept: ${userSkills.join(', ')}`);
        }
    }
    // 3. Remove statusline
    if (fs.existsSync(statuslineDest)) {
        if (opts.yes || await (0, ui_1.ask)('Remove status line?', true)) {
            fs.unlinkSync(statuslineDest);
            // Remove statusLine from settings
            const settings = readJson(settingsPath);
            if (settings && settings.statusLine) {
                delete settings.statusLine;
                writeJson(settingsPath, settings);
            }
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Status line removed`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Status line skipped`);
        }
    }
    // 4. Clean settings (permissions, plugins) — ask because user may have customized
    const settings = readJson(settingsPath);
    if (settings) {
        const modified = { ...settings };
        let changed = false;
        if (modified.permissions) {
            if (opts.yes || await (0, ui_1.ask)('Reset permissions to empty?', false)) {
                delete modified.permissions;
                changed = true;
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Permissions removed`);
            }
            else {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Permissions kept (user may have customized)`);
            }
        }
        if (modified.enabledPlugins) {
            if (opts.yes || await (0, ui_1.ask)('Remove plugin list? (plugins stay installed)', false)) {
                delete modified.enabledPlugins;
                delete modified.extraKnownMarketplaces;
                changed = true;
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Plugin list removed`);
            }
            else {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Plugins kept`);
            }
        }
        if (changed)
            writeJson(settingsPath, modified);
    }
    console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Uninstall complete', ui_1.C.bold)}`);
    console.log(`  ${(0, ui_1.style)('Note:', ui_1.C.gray)} settings.json and ~/.claude/ directory are preserved.\n`);
}
