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
exports.PACKAGE_ROOT = exports.backup = exports.isDirChanged = exports.writeJson = exports.readJson = exports.CLAUDE_DIR = void 0;
exports.runInit = runInit;
exports.runInstall = runInstall;
exports.runProjectInit = runProjectInit;
exports.runClone = runClone;
exports.createCupBackup = createCupBackup;
exports.runBackup = runBackup;
exports.runRestore = runRestore;
exports.runStatus = runStatus;
exports.runDoctor = runDoctor;
exports.runUpdate = runUpdate;
exports.runSessions = runSessions;
exports.runResume = runResume;
exports.runUninstall = runUninstall;
exports.runClean = runClean;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const child_process_1 = require("child_process");
const ui_1 = require("./ui");
const utils_1 = require("./utils");
Object.defineProperty(exports, "readJson", { enumerable: true, get: function () { return utils_1.readJson; } });
Object.defineProperty(exports, "writeJson", { enumerable: true, get: function () { return utils_1.writeJson; } });
Object.defineProperty(exports, "isDirChanged", { enumerable: true, get: function () { return utils_1.isDirChanged; } });
Object.defineProperty(exports, "backup", { enumerable: true, get: function () { return utils_1.backup; } });
Object.defineProperty(exports, "PACKAGE_ROOT", { enumerable: true, get: function () { return utils_1.PACKAGE_ROOT; } });
const registry_1 = require("./providers/registry");
// --- Backward compat exports (used by sync.ts) ---
exports.CLAUDE_DIR = path.join(utils_1.HOME_DIR, '.claude');
// --- Main: init ---
async function runInit(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (providers.length === 0) {
        console.log(`  ${(0, ui_1.style)('No LLM CLI tools detected.', ui_1.C.red)} Install Claude Code, Gemini CLI, or Codex CLI first.\n`);
        process.exit(1);
    }
    if (providers.length > 1) {
        console.log(`  ${(0, ui_1.style)('Detected:', ui_1.C.bold)} ${providers.map(p => p.displayName).join(', ')}\n`);
    }
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
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`\n  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        try {
            const zipPath = await createCupBackup(provider);
            if (zipPath)
                console.log(`\n  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Cup backup: ' + zipPath, ui_1.C.gray)}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`\n  ${(0, ui_1.style)('⚠', ui_1.C.yellow)} ${(0, ui_1.style)('Cup backup skipped: ' + msg, ui_1.C.gray)}`);
        }
        const steps = provider.getInitSteps();
        const totalSteps = steps.length + 1; // +1 for security step
        const results = [];
        for (let i = 0; i < steps.length; i++) {
            (0, ui_1.renderStep)(i + 1, totalSteps, steps[i].label);
            const result = await steps[i].execute(useDefaults, lang);
            results.push({ ok: result.ok, label: result.label, detail: result.detail });
        }
        // Final step: security (auto-applied at level=normal unless --level overrides)
        (0, ui_1.renderStep)(totalSteps, totalSteps, 'Security');
        const securityResult = applySecurityToProvider(provider, opts.level || 'normal');
        results.push({ ok: securityResult.ok, label: securityResult.label, detail: securityResult.detail });
        (0, ui_1.renderSummary)(results);
    }
    (0, ui_1.renderDone)(providers.map(p => p.name));
}
function applySecurityToProvider(provider, level) {
    const validLevels = ['loose', 'normal', 'strict'];
    const lvl = validLevels.includes(level) ? level : 'normal';
    const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'security', `${lvl}.json`);
    const config = (0, utils_1.readJson)(presetPath);
    if (!config) {
        return { ok: false, label: 'Security', detail: `preset missing: ${lvl}` };
    }
    provider.applySecurityLevel(config);
    if (lvl !== 'loose') {
        const blockFile = lvl === 'strict' ? 'strict-md.md' : 'normal-md.md';
        const blockPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'security', blockFile);
        try {
            const block = fs.readFileSync(blockPath, 'utf-8').trim();
            provider.writeSecurityBlock(block);
        }
        catch { }
    }
    else {
        provider.removeSecurityBlock();
    }
    return { ok: true, label: 'Security', detail: `level: ${lvl}` };
}
// --- Install ---
async function runInstall(target, opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    const sysLocale = (process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en').toLowerCase();
    const lang = opts.lang || (sysLocale.startsWith('ko') ? 'ko' : 'en');
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`\n  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        switch (target) {
            case 'skills': {
                console.log(`  ${(0, ui_1.style)('Installing skills...', ui_1.C.bold)}\n`);
                const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
                const available = provider.getAvailableSkillsFromRepo();
                const names = available.map(s => s.name);
                for (const name of names) {
                    provider.installSkill(path.join(skillsSrc, name), name, lang);
                }
                console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(`${names.length} skills installed (${lang})`, ui_1.C.bold)}\n`);
                break;
            }
            case 'plugins': {
                console.log(`  ${(0, ui_1.style)('Applying plugins...', ui_1.C.bold)}\n`);
                if (!opts.force) {
                    const b = provider.backupSettings();
                    if (b)
                        console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
                }
                const available = provider.getAvailablePlugins();
                provider.enablePlugins(available.map(p => p.id));
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${available.length} plugins enabled`);
                console.log(`\n  ${(0, ui_1.style)('⚠️  Plugins will be auto-installed on next session.', ui_1.C.yellow)}\n`);
                break;
            }
            case 'permissions': {
                console.log(`  ${(0, ui_1.style)('Applying permissions...', ui_1.C.bold)}\n`);
                if (!opts.force) {
                    const b = provider.backupSettings();
                    if (b)
                        console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
                }
                provider.mergePermissions({ allow: [], deny: [] }); // uses preset internally
                const perms = provider.getCurrentPermissions();
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${perms.allow.length} allow, ${perms.deny.length} deny\n`);
                break;
            }
            case 'statusline': {
                if (!provider.installStatusLine) {
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Status line not available for ${provider.displayName}\n`);
                    break;
                }
                console.log(`  ${(0, ui_1.style)('Installing status line...', ui_1.C.bold)}\n`);
                provider.installStatusLine();
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Status line installed\n`);
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
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        const settingsPath = provider.getProjectSettingsPath(projectRoot);
        if (!opts.force) {
            const b = (0, utils_1.backup)(settingsPath);
            if (b)
                console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}`);
        }
        // Load project preset for this provider
        const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'project', `${provider.name}.json`);
        const preset = (0, utils_1.readJson)(presetPath);
        if (!preset) {
            console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  No project preset for ${provider.displayName}`);
            continue;
        }
        const existing = (0, utils_1.readJson)(settingsPath) || {};
        (0, utils_1.writeJson)(settingsPath, { ...existing, permissions: preset.permissions });
        console.log(`\n  ${(0, ui_1.style)('Project:', ui_1.C.bold)} ${(0, ui_1.style)(projectRoot, ui_1.C.cyan)}`);
        const perms = preset.permissions;
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} allow: ${(perms.allow || []).join(', ')}`);
        // Copy project skills
        const copiedSkills = [];
        const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'project-skills');
        const claudeDir = path.join(projectRoot, provider.projectDir);
        const skillsDest = path.join(claudeDir, 'skills');
        try {
            for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
                if (!entry.isDirectory())
                    continue;
                (0, utils_1.copyDirRecursive)(path.join(skillsSrc, entry.name), path.join(skillsDest, entry.name));
                copiedSkills.push(entry.name);
            }
        }
        catch { }
        if (copiedSkills.length > 0)
            console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${copiedSkills.length} project skills installed`);
    }
    console.log('\n  Done!\n');
}
// --- Clone ---
async function runClone(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        const label = providers.length > 1 ? ` (${provider.displayName})` : '';
        console.log(`  ${(0, ui_1.style)(`Exporting${label} current environment...`, ui_1.C.bold)}\n`);
        const outDir = opts.output || path.join(process.cwd(), `${provider.name}-env-${(0, utils_1.timestamp)()}`);
        fs.mkdirSync(outDir, { recursive: true });
        const items = [
            { src: path.join(provider.homeDir, provider.settingsFileName), dest: provider.settingsFileName, label: 'Settings' },
            { src: path.join(provider.homeDir, 'skills'), dest: 'skills', label: 'User skills', dir: true },
        ];
        // Claude-specific items
        if (provider.name === 'claude') {
            items.splice(1, 0, { src: path.join(provider.homeDir, 'statusline-command.sh'), dest: 'statusline-command.sh', label: 'Status line' });
            items.push({ src: path.join(provider.homeDir, 'commands'), dest: 'commands', label: 'User commands', dir: true });
        }
        let count = 0;
        for (const item of items) {
            if (!fs.existsSync(item.src)) {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${item.label} — not found`);
                continue;
            }
            const destPath = path.join(outDir, item.dest);
            if (item.dir)
                (0, utils_1.copyDirRecursive)(item.src, destPath);
            else
                fs.copyFileSync(item.src, destPath);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${item.label}`);
            count++;
        }
        // Claude: installed plugins list
        if (provider.name === 'claude') {
            const pluginsFile = path.join(provider.homeDir, 'plugins', 'installed_plugins.json');
            if (fs.existsSync(pluginsFile)) {
                fs.mkdirSync(path.join(outDir, 'plugins'), { recursive: true });
                fs.copyFileSync(pluginsFile, path.join(outDir, 'plugins', 'installed_plugins.json'));
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Installed plugins list`);
                count++;
            }
        }
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)(`${count} items exported to:`, ui_1.C.bold)}`);
        console.log(`  ${(0, ui_1.style)(outDir, ui_1.C.cyan)}\n`);
    }
}
// --- Backup ---
function getRepoSkillNames() {
    const names = new Set();
    try {
        for (const e of fs.readdirSync(path.join(utils_1.PACKAGE_ROOT, 'user-skills'), { withFileTypes: true })) {
            if (e.isDirectory())
                names.add(e.name);
        }
    }
    catch { }
    return names;
}
/** Returns HOME_DIR-relative paths for files/dirs that `cup init` creates or modifies. */
function getCupManagedRelPaths(provider) {
    const rel = (abs) => path.relative(utils_1.HOME_DIR, abs);
    const result = [];
    const settingsPath = path.join(provider.homeDir, provider.settingsFileName);
    if (fs.existsSync(settingsPath))
        result.push(rel(settingsPath));
    if (provider.hasStatusLine) {
        const slPath = path.join(provider.homeDir, 'statusline-command.sh');
        if (fs.existsSync(slPath))
            result.push(rel(slPath));
    }
    try {
        const instrPath = provider.getInstructionFilePath('global');
        if (fs.existsSync(instrPath))
            result.push(rel(instrPath));
    }
    catch { }
    const repoSkills = getRepoSkillNames();
    for (const name of provider.getInstalledSkills()) {
        if (repoSkills.has(name)) {
            const skillPath = path.join(provider.skillsDir, name);
            if (fs.existsSync(skillPath))
                result.push(rel(skillPath));
        }
    }
    return result.filter(p => !p.startsWith('..'));
}
/** Creates a cup-scope zip backup at ~/.claude/cup/backups/<timestamp>.zip. Returns the zip path, or null if nothing to back up. */
async function createCupBackup(provider, outputOverride) {
    const relPaths = getCupManagedRelPaths(provider);
    if (relPaths.length === 0)
        return null;
    const backupsDir = path.join(provider.homeDir, 'cup', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const zipPath = outputOverride || path.join(backupsDir, `${(0, utils_1.humanTimestamp)()}.zip`);
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    await (0, ui_1.progressLine)(`Zipping cup files → ${path.basename(zipPath)}`, () => {
        (0, child_process_1.execFileSync)('zip', ['-rq', zipPath, ...relPaths], { cwd: utils_1.HOME_DIR, stdio: 'pipe' });
    });
    return zipPath;
}
async function runBackup(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    const type = opts.type || 'all';
    if (type !== 'all' && type !== 'cup') {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} --type must be "all" or "cup"\n`);
        process.exit(1);
    }
    for (const provider of providers) {
        if (type === 'cup') {
            console.log(`  ${(0, ui_1.style)(`Creating ${provider.displayName} cup backup...`, ui_1.C.bold)}\n`);
            const zipPath = await createCupBackup(provider, opts.output);
            if (!zipPath) {
                console.log(`  ${(0, ui_1.style)('ℹ', ui_1.C.cyan)} Nothing to back up — no cup-managed files found.\n`);
                continue;
            }
            const size = fs.statSync(zipPath).size;
            const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
            console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Cup backup created:', ui_1.C.bold)} ${(0, ui_1.style)(zipPath, ui_1.C.cyan)}`);
            console.log(`  ${(0, ui_1.style)('Size:', ui_1.C.gray)} ${sizeStr}\n`);
            continue;
        }
        const tarPath = opts.output || path.join(process.cwd(), `${provider.name}-backup-${(0, utils_1.timestamp)()}.tar.gz`);
        console.log(`  ${(0, ui_1.style)(`Creating ${provider.displayName} backup...`, ui_1.C.bold)}\n`);
        const excludes = provider.getBackupExcludes();
        const excludeArgs = excludes.flatMap(e => ['--exclude', e]);
        await (0, ui_1.progressLine)(`Compressing ~/${path.basename(provider.homeDir)}/`, () => {
            (0, child_process_1.execFileSync)('tar', [...excludeArgs, '-czf', tarPath, '-C', path.dirname(provider.homeDir), path.basename(provider.homeDir)], { stdio: 'pipe' });
        });
        const size = fs.statSync(tarPath).size;
        const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Backup created:', ui_1.C.bold)} ${(0, ui_1.style)(path.basename(tarPath), ui_1.C.cyan)}`);
        console.log(`  ${(0, ui_1.style)('Size:', ui_1.C.gray)} ${sizeStr}\n`);
    }
}
// --- Restore ---
async function runRestore(source, opts = {}) {
    (0, ui_1.renderBanner)();
    const type = opts.type || 'all';
    if (type !== 'all' && type !== 'cup') {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} --type must be "all" or "cup"\n`);
        process.exit(1);
    }
    const provider = opts.provider ? (0, registry_1.resolveProviders)(opts.provider)[0] : (0, registry_1.getProvider)('claude');
    if (type === 'cup') {
        if (!source) {
            const backupsDir = path.join(provider.homeDir, 'cup', 'backups');
            if (!fs.existsSync(backupsDir)) {
                console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} No cup backups directory: ${backupsDir}\n`);
                process.exit(1);
            }
            const zips = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip')).sort();
            if (zips.length === 0) {
                console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} No .zip backups found in ${backupsDir}\n`);
                process.exit(1);
            }
            source = path.join(backupsDir, zips[zips.length - 1]);
            console.log(`  ${(0, ui_1.style)('Using latest:', ui_1.C.gray)} ${(0, ui_1.style)(source, ui_1.C.cyan)}\n`);
        }
        if (!fs.existsSync(source)) {
            console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} Not found: ${source}\n`);
            process.exit(1);
        }
        if (!opts.force) {
            const b = provider.backupSettings();
            if (b)
                console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Safety backup: ' + b, ui_1.C.gray)}\n`);
        }
        console.log(`  ${(0, ui_1.style)('Restoring cup backup...', ui_1.C.bold)}\n`);
        await (0, ui_1.progressLine)('Extracting zip', () => {
            (0, child_process_1.execFileSync)('unzip', ['-oq', path.resolve(source), '-d', utils_1.HOME_DIR], { stdio: 'pipe' });
        });
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Cup restore complete', ui_1.C.bold)}\n`);
        return;
    }
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
        const b = provider.backupSettings();
        if (b)
            console.log(`  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + b, ui_1.C.gray)}\n`);
    }
    if (stat.isDirectory()) {
        console.log(`  ${(0, ui_1.style)('Restoring from clone folder...', ui_1.C.bold)}\n`);
        const items = [
            { src: provider.settingsFileName, dest: path.join(provider.homeDir, provider.settingsFileName), label: 'Settings' },
            { src: 'statusline-command.sh', dest: path.join(provider.homeDir, 'statusline-command.sh'), label: 'Status line' },
            { src: 'skills', dest: path.join(provider.homeDir, 'skills'), label: 'User skills', dir: true },
            { src: 'commands', dest: path.join(provider.homeDir, 'commands'), label: 'User commands', dir: true },
        ];
        let count = 0;
        for (const item of items) {
            const srcPath = path.join(source, item.src);
            if (!fs.existsSync(srcPath)) {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${item.label} — not in backup`);
                continue;
            }
            if (item.dir)
                (0, utils_1.copyDirRecursive)(srcPath, item.dest);
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
            (0, child_process_1.execFileSync)('tar', ['xzf', path.resolve(source), '-C', path.dirname(provider.homeDir)], { stdio: 'pipe' });
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
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('Environment Status', ui_1.C.bold)}\n`);
        }
        const settings = provider.readSettings();
        if (settings) {
            const perms = provider.getCurrentPermissions();
            const plugins = provider.getEnabledPlugins();
            console.log(`  ${(0, ui_1.style)('Settings', ui_1.C.bold)} ${(0, ui_1.style)(provider.getSettingsPath(), ui_1.C.gray)}`);
            console.log(`    Permissions: ${(0, ui_1.style)(`${perms.allow.length} allow`, ui_1.C.green)}, ${(0, ui_1.style)(`${perms.deny.length} deny`, ui_1.C.red)}`);
            console.log(`    Plugins:     ${(0, ui_1.style)(`${plugins.length} enabled`, ui_1.C.cyan)}`);
            if (provider.hasStatusLine) {
                console.log(`    Status line: ${provider.hasStatusLine() ? (0, ui_1.style)('configured', ui_1.C.green) : (0, ui_1.style)('not set', ui_1.C.gray)}`);
            }
        }
        else {
            console.log(`  ${(0, ui_1.style)('Settings', ui_1.C.bold)} ${(0, ui_1.style)('not found', ui_1.C.red)}`);
        }
        const skills = provider.getInstalledSkills();
        console.log(`\n  ${(0, ui_1.style)('User Skills', ui_1.C.bold)} ${(0, ui_1.style)(`(${skills.length})`, ui_1.C.gray)}`);
        for (const name of skills.sort())
            console.log(`    ${(0, ui_1.style)('•', ui_1.C.cyan)} ${name}`);
        if (skills.length === 0)
            console.log(`    ${(0, ui_1.style)('(none)', ui_1.C.gray)}`);
        const plugins = provider.getEnabledPlugins();
        if (plugins.length > 0) {
            console.log(`\n  ${(0, ui_1.style)('Plugins', ui_1.C.bold)} ${(0, ui_1.style)(`(${plugins.length})`, ui_1.C.gray)}`);
            for (const name of plugins.sort())
                console.log(`    ${(0, ui_1.style)('•', ui_1.C.cyan)} ${name.replace(/@.*$/, '')}`);
        }
        if (provider.hasStatusLine) {
            const statuslinePath = path.join(provider.homeDir, 'statusline-command.sh');
            console.log(`\n  ${(0, ui_1.style)('Status Line', ui_1.C.bold)}`);
            console.log(fs.existsSync(statuslinePath) ? `    ${(0, ui_1.style)('✓', ui_1.C.green)} ${statuslinePath}` : `    ${(0, ui_1.style)('✗', ui_1.C.gray)} not installed`);
        }
        console.log('');
    }
}
// --- Doctor ---
function runDoctor(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('Checking configuration...', ui_1.C.bold)}\n`);
        }
        const v = opts.verbose ?? false;
        let issues = 0;
        let warnings = 0;
        const ok = (msg) => { console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${msg}`); };
        const warn = (msg) => { console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} ${msg}`); warnings++; };
        const fail = (msg) => { console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${msg}`); issues++; };
        const detail = (lines) => { if (v)
            for (const l of lines)
                console.log(`    ${(0, ui_1.style)(l, ui_1.C.gray)}`); };
        if (!fs.existsSync(provider.homeDir)) {
            fail(`~/${path.basename(provider.homeDir)}/ not found — run "cup init"`);
            continue;
        }
        ok(`~/${path.basename(provider.homeDir)}/ directory exists`);
        const settings = provider.readSettings();
        if (settings)
            ok(`${provider.settingsFileName} is valid`);
        else if (fs.existsSync(provider.getSettingsPath()))
            fail(`${provider.settingsFileName} is invalid`);
        else
            fail(`${provider.settingsFileName} not found`);
        const perms = provider.getCurrentPermissions();
        if (perms.allow.length) {
            ok(`permissions allow: ${perms.allow.length} rules`);
            detail(perms.allow);
        }
        else
            warn('No allow permissions');
        if (perms.deny.length) {
            ok(`permissions deny: ${perms.deny.length} rules`);
            detail(perms.deny);
        }
        else
            warn('No deny permissions — destructive commands not blocked');
        const plugins = provider.getEnabledPlugins();
        if (plugins.length > 0) {
            ok(`${plugins.length} plugins enabled`);
            detail(plugins);
        }
        else
            warn('No plugins enabled');
        // Claude-specific: marketplace check
        if (provider.name === 'claude' && settings) {
            if (settings.extraKnownMarketplaces)
                ok('Marketplace configured');
            else
                warn('No marketplace configured');
        }
        const skills = provider.getInstalledSkills();
        if (skills.length > 0) {
            ok(`${skills.length} user skills installed`);
            detail(skills);
            let broken = 0;
            for (const s of skills) {
                if (!fs.existsSync(path.join(provider.skillsDir, s, 'SKILL.md'))) {
                    fail(`"${s}" missing SKILL.md`);
                    broken++;
                }
            }
            if (broken === 0)
                ok('All skills have valid SKILL.md');
        }
        else
            warn('Skills directory is empty or missing');
        // Claude-specific: statusline check
        if (provider.hasStatusLine) {
            const slPath = path.join(provider.homeDir, 'statusline-command.sh');
            if (fs.existsSync(slPath)) {
                if (fs.statSync(slPath).mode & 0o111)
                    ok('statusline-command.sh is executable');
                else
                    warn('statusline-command.sh not executable');
                if (settings?.statusLine)
                    ok('statusLine configured');
                else
                    warn('statusLine not configured in settings');
            }
        }
        // Backup file warning
        try {
            const backups = fs.readdirSync(provider.homeDir).filter(f => f.includes('.bak.'));
            if (backups.length > 5) {
                const totalKB = backups.reduce((sum, f) => {
                    try {
                        return sum + fs.statSync(path.join(provider.homeDir, f)).size;
                    }
                    catch {
                        return sum;
                    }
                }, 0);
                warn(`${backups.length} cup backup files (${Math.round(totalKB / 1024)}KB) — created by "cup init/update" before overwriting settings. Run "rm ~/${path.basename(provider.homeDir)}/*.bak.*" to clean up`);
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
}
// --- Update ---
async function runUpdate(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('Checking for updates...', ui_1.C.bold)}\n`);
        }
        // Permissions update
        const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', `${provider.name}.json`);
        const preset = (0, utils_1.readJson)(presetPath);
        if (preset?.permissions) {
            const pPerms = JSON.stringify(preset.permissions);
            const settings = provider.readSettings() || {};
            const lPerms = JSON.stringify(settings.permissions || {});
            if (opts.force || pPerms !== lPerms) {
                console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Permissions changed`);
                if (opts.yes || await (0, ui_1.ask)('Update permissions?', true)) {
                    provider.mergePermissions({ allow: [], deny: [] });
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Permissions updated\n`);
                }
                else
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
            }
            else
                console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Permissions (up to date)`);
            // Plugins
            if (preset.enabledPlugins) {
                const pPlugins = JSON.stringify(Object.keys(preset.enabledPlugins).sort());
                const lPlugins = JSON.stringify(provider.getEnabledPlugins().sort());
                if (opts.force || pPlugins !== lPlugins) {
                    console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Plugins changed`);
                    if (opts.yes || await (0, ui_1.ask)('Update plugins?', true)) {
                        provider.enablePlugins(Object.keys(preset.enabledPlugins));
                        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Plugins updated\n`);
                    }
                    else
                        console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
                }
                else
                    console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Plugins (up to date)`);
            }
        }
        // Statusline
        if (provider.installStatusLine) {
            const slSrc = path.join(utils_1.PACKAGE_ROOT, 'statusline-command.sh');
            const slDest = path.join(provider.homeDir, 'statusline-command.sh');
            if (fs.existsSync(slSrc) && fs.existsSync(slDest)) {
                if (!fs.readFileSync(slSrc).equals(fs.readFileSync(slDest))) {
                    console.log(`  ${(0, ui_1.style)('!', ui_1.C.yellow)} Status line changed`);
                    if (opts.yes || await (0, ui_1.ask)('Update status line?', true)) {
                        provider.installStatusLine();
                        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Updated\n`);
                    }
                    else
                        console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Skipped\n`);
                }
                else
                    console.log(`  ${(0, ui_1.style)('–', ui_1.C.gray)} Status line (up to date)`);
            }
        }
        // Skills
        let lang = 'en';
        try {
            const installed = provider.getInstalledSkills();
            if (installed.length > 0) {
                const c = fs.readFileSync(path.join(provider.skillsDir, installed[0], 'SKILL.md'), 'utf-8');
                if (/[\uAC00-\uD7AF]/.test(c.split('---')[2] || ''))
                    lang = 'ko';
            }
        }
        catch { }
        console.log(`\n  ${(0, ui_1.style)(`Skills (${lang}):`, ui_1.C.bold)}`);
        const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
        const repoSkills = new Set();
        try {
            for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
                if (e.isDirectory())
                    repoSkills.add(e.name);
            }
        }
        catch {
            console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} user-skills/ not found\n`);
            continue;
        }
        const localSkills = new Set(provider.getInstalledSkills());
        const newSkills = [], changedSkills = [], upToDate = [], removedSkills = [];
        for (const name of repoSkills) {
            if (!localSkills.has(name))
                newSkills.push(name);
            else if (opts.force || (0, utils_1.isDirChanged)(path.join(skillsSrc, name), path.join(provider.skillsDir, name)))
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
                provider.installSkill(path.join(skillsSrc, n), n, lang);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${n} updated`);
            }
        }
        if (newSkills.length > 0 && (opts.yes || await (0, ui_1.ask)(`Install ${newSkills.length} new skill(s)?`, true))) {
            for (const n of newSkills) {
                provider.installSkill(path.join(skillsSrc, n), n, lang);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${n} added`);
            }
        }
        if (removedSkills.length > 0 && (opts.yes || await (0, ui_1.ask)(`Remove ${removedSkills.length} local-only skill(s)?`, false))) {
            for (const n of removedSkills) {
                fs.rmSync(path.join(provider.skillsDir, n), { recursive: true });
                console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} ${n} removed`);
            }
        }
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Update check complete', ui_1.C.bold)}\n`);
    }
}
// --- Sessions ---
function runSessions(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    const allSessions = [];
    for (const provider of providers) {
        const sessions = provider.listSessions({
            all: opts.all,
            project: opts.project,
            limit: opts.limit,
        });
        for (const s of sessions) {
            allSessions.push({ provider: provider.name, ...s });
        }
    }
    allSessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    const limited = allSessions.slice(0, opts.limit || 10);
    if (limited.length === 0) {
        console.log(`  ${(0, ui_1.style)('No sessions found.', ui_1.C.gray)}\n`);
        return;
    }
    const scope = opts.all ? 'all projects' : opts.project || 'current project';
    console.log(`  ${(0, ui_1.style)(`Recent sessions (${scope}):`, ui_1.C.bold)}\n`);
    for (const s of limited) {
        const date = s.date.toISOString().slice(0, 16).replace('T', ' ');
        const sizeStr = s.size > 1048576 ? `${(s.size / 1048576).toFixed(1)}MB` : `${(s.size / 1024).toFixed(0)}KB`;
        const msg = s.firstMessage.length > 60 ? s.firstMessage.slice(0, 60) + '...' : s.firstMessage;
        const providerTag = providers.length > 1 ? (0, ui_1.style)(` [${s.provider}]`, ui_1.C.gray) : '';
        console.log(`  ${(0, ui_1.style)(date, ui_1.C.gray)}  ${(0, ui_1.style)(s.id.slice(0, 8), ui_1.C.gray)}  ${(0, ui_1.style)(s.project, ui_1.C.cyan)}${providerTag}`);
        console.log(`    ${(0, ui_1.style)(msg, ui_1.C.dim)}  ${(0, ui_1.style)(sizeStr, ui_1.C.gray)}`);
    }
    console.log(`\n  ${(0, ui_1.style)('Resume:', ui_1.C.gray)} ${(0, ui_1.style)('cup resume <id>', ui_1.C.cyan)}\n`);
}
// --- Resume ---
async function runResume(sessionId, opts = {}) {
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (!sessionId) {
        const allSessions = [];
        for (const provider of providers) {
            for (const s of provider.listSessions({ ...opts, all: true, limit: 20 })) {
                allSessions.push({ provider, ...s });
            }
        }
        allSessions.sort((a, b) => b.date.getTime() - a.date.getTime());
        if (allSessions.length === 0) {
            console.error(`  ${(0, ui_1.style)('No sessions found.', ui_1.C.red)}\n`);
            return;
        }
        const items = allSessions.slice(0, 20).map(s => ({
            name: s.id,
            desc: `${s.date.toISOString().slice(0, 10)} ${s.project} — ${s.firstMessage.slice(0, 40)}`,
        }));
        (0, ui_1.renderBanner)();
        console.log(`  ${(0, ui_1.style)('Select a session to resume:', ui_1.C.bold)}\n`);
        const selected = await (0, ui_1.checkbox)(items);
        if (!selected || selected.length === 0)
            return;
        sessionId = selected[0];
        // Find the provider for this session
        const match = allSessions.find(s => s.id === sessionId);
        if (match) {
            match.provider.resumeSession(sessionId, opts.fork);
            return;
        }
    }
    // Resolve session ID (partial match)
    for (const provider of providers) {
        const sessions = provider.listSessions({ all: true, limit: 100 });
        const match = sessions.find(s => s.id.startsWith(sessionId));
        if (match) {
            console.log(`\n  ${(0, ui_1.style)('Resuming:', ui_1.C.bold)} ${(0, ui_1.style)(match.id.slice(0, 8) + '...', ui_1.C.cyan)}`);
            if (opts.fork)
                console.log(`  ${(0, ui_1.style)('(forked)', ui_1.C.gray)}`);
            console.log('');
            provider.resumeSession(match.id, opts.fork);
            return;
        }
    }
    console.error(`  ${(0, ui_1.style)('Session not found:', ui_1.C.red)} ${sessionId}\n`);
}
// --- Uninstall ---
async function runUninstall(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('Uninstalling claude-up...', ui_1.C.bold)}\n`);
        }
        // 1. Remove cup block from instruction file
        const cupBlock = provider.readCupBlock();
        if (cupBlock) {
            if (opts.yes || await (0, ui_1.ask)(`Remove claude-up section from ${provider.instructionFileName}?`, true)) {
                const filePath = provider.getInstructionFilePath('global');
                const content = fs.readFileSync(filePath, 'utf-8');
                const CUP_START = '<!-- <cup>';
                const CUP_END = '<!-- </cup> -->';
                const startIdx = content.indexOf(CUP_START);
                const endIdx = content.indexOf(CUP_END);
                if (startIdx !== -1 && endIdx !== -1) {
                    const cleaned = (content.slice(0, startIdx) + content.slice(endIdx + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
                    fs.writeFileSync(filePath, cleaned + '\n');
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${provider.instructionFileName} — cup section removed`);
                }
            }
            else {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${provider.instructionFileName} skipped`);
            }
        }
        // 2. Remove skills
        const installed = provider.getInstalledSkills();
        if (installed.length > 0) {
            const repoSkills = new Set();
            try {
                for (const e of fs.readdirSync(path.join(utils_1.PACKAGE_ROOT, 'user-skills'), { withFileTypes: true })) {
                    if (e.isDirectory())
                        repoSkills.add(e.name);
                }
            }
            catch { }
            const cupSkills = installed.filter(s => repoSkills.has(s));
            const userSkills = installed.filter(s => !repoSkills.has(s));
            if (cupSkills.length > 0) {
                if (opts.yes || await (0, ui_1.ask)(`Remove ${cupSkills.length} claude-up skills?`, true)) {
                    for (const name of cupSkills)
                        fs.rmSync(path.join(provider.skillsDir, name), { recursive: true });
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
        if (provider.hasStatusLine) {
            const statuslineDest = path.join(provider.homeDir, 'statusline-command.sh');
            if (fs.existsSync(statuslineDest)) {
                if (opts.yes || await (0, ui_1.ask)('Remove status line?', true)) {
                    fs.unlinkSync(statuslineDest);
                    const settings = provider.readSettings();
                    if (settings?.statusLine) {
                        delete settings.statusLine;
                        provider.writeSettings(settings);
                    }
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Status line removed`);
                }
                else {
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Status line skipped`);
                }
            }
        }
        // 4. Clean settings
        const settings = provider.readSettings();
        if (settings) {
            let changed = false;
            if (settings.permissions) {
                if (opts.yes || await (0, ui_1.ask)('Reset permissions to empty?', false)) {
                    delete settings.permissions;
                    changed = true;
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Permissions removed`);
                }
                else {
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Permissions kept`);
                }
            }
            if (settings.enabledPlugins) {
                if (opts.yes || await (0, ui_1.ask)('Remove plugin list?', false)) {
                    delete settings.enabledPlugins;
                    delete settings.extraKnownMarketplaces;
                    changed = true;
                    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Plugin list removed`);
                }
                else {
                    console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  Plugins kept`);
                }
            }
            if (changed)
                provider.writeSettings(settings);
        }
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Uninstall complete', ui_1.C.bold)}`);
        console.log(`  ${(0, ui_1.style)('Note:', ui_1.C.gray)} ${provider.settingsFileName} and ~/${path.basename(provider.homeDir)}/ directory are preserved.\n`);
    }
}
// --- Clean ---
async function runClean(opts = {}) {
    (0, ui_1.renderBanner)();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}\n`);
        }
        else {
            console.log(`  ${(0, ui_1.style)('Cleaning cup-managed files...', ui_1.C.bold)}\n`);
        }
        const relPaths = getCupManagedRelPaths(provider);
        if (relPaths.length === 0) {
            console.log(`  ${(0, ui_1.style)('ℹ', ui_1.C.cyan)} Nothing to clean.\n`);
            continue;
        }
        const repoSkills = getRepoSkillNames();
        const cupSkills = provider.getInstalledSkills().filter(s => repoSkills.has(s));
        const instrPath = provider.getInstructionFilePath('global');
        const slPath = path.join(provider.homeDir, 'statusline-command.sh');
        const settingsPath = path.join(provider.homeDir, provider.settingsFileName);
        console.log(`  Will back up then remove:`);
        console.log(`    • ${cupSkills.length} cup skills`);
        if (fs.existsSync(settingsPath))
            console.log(`    • ${provider.settingsFileName} — cup keys only`);
        if (provider.hasStatusLine && fs.existsSync(slPath))
            console.log(`    • statusline-command.sh`);
        if (fs.existsSync(instrPath))
            console.log(`    • ${provider.instructionFileName} — cup block only`);
        console.log('');
        if (!opts.yes && !(await (0, ui_1.ask)('Proceed?', true))) {
            console.log(`  ${(0, ui_1.style)('Cancelled.', ui_1.C.gray)}\n`);
            continue;
        }
        let zipPath = null;
        try {
            zipPath = await createCupBackup(provider);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`\n  ${(0, ui_1.style)('Backup failed:', ui_1.C.red)} ${msg}`);
            console.error(`  ${(0, ui_1.style)('Aborted — nothing removed.', ui_1.C.gray)}\n`);
            continue;
        }
        if (zipPath)
            console.log(`\n  ${(0, ui_1.style)('💾', ui_1.C.gray)} ${(0, ui_1.style)('Backup: ' + zipPath, ui_1.C.gray)}\n`);
        for (const name of cupSkills) {
            fs.rmSync(path.join(provider.skillsDir, name), { recursive: true, force: true });
        }
        if (cupSkills.length > 0)
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${cupSkills.length} cup skills removed`);
        const block = provider.readCupBlock();
        if (block && fs.existsSync(instrPath)) {
            const content = fs.readFileSync(instrPath, 'utf-8');
            const CUP_START = '<!-- <cup>';
            const CUP_END = '<!-- </cup> -->';
            const s = content.indexOf(CUP_START);
            const e = content.indexOf(CUP_END);
            if (s !== -1 && e !== -1) {
                const cleaned = (content.slice(0, s) + content.slice(e + CUP_END.length)).replace(/\n{3,}/g, '\n\n').trim();
                fs.writeFileSync(instrPath, cleaned + '\n');
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${provider.instructionFileName} — cup section removed`);
            }
        }
        if (provider.hasStatusLine && fs.existsSync(slPath)) {
            fs.unlinkSync(slPath);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Status line removed`);
        }
        const settings = provider.readSettings();
        if (settings) {
            let changed = false;
            for (const key of ['permissions', 'enabledPlugins', 'extraKnownMarketplaces', 'statusLine']) {
                if (settings[key] !== undefined) {
                    delete settings[key];
                    changed = true;
                }
            }
            if (changed) {
                provider.writeSettings(settings);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Cup keys cleared from ${provider.settingsFileName}`);
            }
        }
        console.log(`\n  ${(0, ui_1.style)('✓', ui_1.C.green)} ${(0, ui_1.style)('Clean complete', ui_1.C.bold)}`);
        if (zipPath) {
            console.log(`  ${(0, ui_1.style)('Restore with:', ui_1.C.gray)} ${(0, ui_1.style)(`cup restore --type=cup`, ui_1.C.cyan)}\n`);
        }
    }
}
