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
exports.runLogin = runLogin;
exports.runPush = runPush;
exports.runPull = runPull;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const readline = __importStar(require("readline"));
const stream_1 = require("stream");
const utils_1 = require("./utils");
const ui_1 = require("./ui");
const registry_1 = require("./providers/registry");
const CLAUDE_DIR = path.join(utils_1.HOME_DIR, '.claude');
// --- Constants ---
const AUTH_PATH = path.join(CLAUDE_DIR, '.cup-auth');
const GIST_PREFIX = 'cup-skill--';
const MANIFEST_FILE = 'cup-manifest.json';
const SETTINGS_FILE = 'cup-settings.json';
const CLAUDE_MD_FILE = 'cup-claude-md.md';
const SYNC_SETTINGS_KEYS = ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'];
function isValidSkillName(name) {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) && !name.includes('..');
}
function readValidSkillNames(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
            .filter(isValidSkillName);
    }
    catch {
        return [];
    }
}
function collectSkillContent(skillDir, name, dest) {
    try {
        dest[`${GIST_PREFIX}${name}.md`] = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    }
    catch { }
}
// --- Auth helpers ---
function loadAuth() {
    try {
        const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function saveAuth(data) {
    fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
    fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2) + '\n');
    fs.chmodSync(AUTH_PATH, 0o600);
}
// --- GitHub API client ---
function githubApi(method, endpoint, token, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'claude-up',
                'X-GitHub-Api-Version': '2022-11-28',
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => { chunks.push(chunk); });
            res.on('end', () => {
                const data = Buffer.concat(chunks).toString();
                const statusCode = res.statusCode ?? 0;
                if (statusCode >= 200 && statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                }
                else {
                    reject(new Error(`GitHub API error ${statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
// --- Language detection ---
function detectLang() {
    try {
        const skillsDir = path.join(CLAUDE_DIR, 'skills');
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        const firstDir = entries.find(e => e.isDirectory());
        if (!firstDir)
            return 'en';
        const skillMd = path.join(skillsDir, firstDir.name, 'SKILL.md');
        const content = fs.readFileSync(skillMd, 'utf-8');
        if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(content))
            return 'ko';
        return 'en';
    }
    catch {
        return 'en';
    }
}
// --- Manifest building ---
function buildManifest() {
    const repoSkillsDir = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
    const localSkillsDir = path.join(CLAUDE_DIR, 'skills');
    const repoSkills = readValidSkillNames(repoSkillsDir);
    const localSkills = readValidSkillNames(localSkillsDir);
    const repoSet = new Set(repoSkills);
    const localSet = new Set(localSkills);
    const installed = [];
    const removed = [];
    const modified = [];
    const custom = [];
    const modifiedFiles = {};
    for (const name of repoSkills) {
        if (!localSet.has(name)) {
            removed.push(name);
        }
        else if ((0, utils_1.isDirChanged)(path.join(repoSkillsDir, name), path.join(localSkillsDir, name))) {
            modified.push(name);
            collectSkillContent(path.join(localSkillsDir, name), name, modifiedFiles);
        }
        else {
            installed.push(name);
        }
    }
    for (const name of localSkills) {
        if (!repoSet.has(name)) {
            custom.push(name);
            collectSkillContent(path.join(localSkillsDir, name), name, modifiedFiles);
        }
    }
    return {
        manifest: {
            version: '1',
            timestamp: new Date().toISOString(),
            skills: { installed, removed, modified, custom },
            lang: detectLang(),
        },
        modifiedFiles,
    };
}
// --- Login command ---
async function runLogin(opts) {
    (0, ui_1.renderBanner)();
    const existing = loadAuth();
    if (existing && !opts.force) {
        const masked = existing.token.length > 8
            ? existing.token.slice(0, 4) + '****' + existing.token.slice(-4)
            : existing.token.slice(0, 2) + '****';
        console.log(`  ${(0, ui_1.style)('Current token:', ui_1.C.bold)} ${(0, ui_1.style)(masked, ui_1.C.gray)}`);
        const replace = await (0, ui_1.ask)('Replace existing token?', false);
        if (!replace) {
            console.log(`  ${(0, ui_1.style)('Login unchanged.', ui_1.C.gray)}\n`);
            return;
        }
    }
    // Hidden token input
    const mutableStdout = new stream_1.Writable({
        write: (_chunk, _encoding, callback) => { callback(); }
    });
    process.stdout.write(`  ${(0, ui_1.style)('Token:', ui_1.C.cyan)} `);
    const rl = readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
    const token = await new Promise((resolve) => {
        rl.question('', (answer) => { rl.close(); resolve(answer.trim()); });
    });
    console.log(''); // newline after hidden input
    if (!token) {
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} No token provided.\n`);
        process.exit(1);
    }
    try {
        await (0, ui_1.progressLine)('Validating token', async () => {
            const user = await githubApi('GET', '/user', token);
            console.log(''); // newline after spinner clears
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Authenticated as ${(0, ui_1.style)(user.login, ui_1.C.cyan)}`);
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} Token validation failed: ${msg}\n`);
        process.exit(1);
    }
    const auth = { token };
    const currentAuth = loadAuth();
    if (currentAuth?.gistId)
        auth.gistId = currentAuth.gistId;
    saveAuth(auth);
    console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Token saved.\n`);
}
// --- Push command ---
async function runPush(args, opts) {
    (0, ui_1.renderBanner)();
    const auth = loadAuth();
    if (!auth) {
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} Not logged in. Run: ${(0, ui_1.style)('cup login', ui_1.C.cyan)}\n`);
        process.exit(1);
    }
    const { manifest, modifiedFiles } = await (0, ui_1.progressLine)('Analyzing skills', () => buildManifest());
    // Filter by specific skill names if provided
    const filter = (args && args.length > 0) ? new Set(args) : null;
    const skillsToInclude = filter
        ? [...manifest.skills.modified, ...manifest.skills.custom].filter(n => filter.has(n))
        : [...manifest.skills.modified, ...manifest.skills.custom];
    const removedToInclude = filter
        ? manifest.skills.removed.filter(n => filter.has(n))
        : manifest.skills.removed;
    const totalChanges = skillsToInclude.length + removedToInclude.length;
    // Show summary
    console.log('');
    console.log(`  ${(0, ui_1.style)('Skills summary:', ui_1.C.bold)}`);
    console.log(`    ${(0, ui_1.style)('Unchanged:', ui_1.C.gray)}  ${manifest.skills.installed.length}`);
    console.log(`    ${(0, ui_1.style)('Modified:', ui_1.C.yellow)}  ${manifest.skills.modified.length}`);
    console.log(`    ${(0, ui_1.style)('Removed:', ui_1.C.red)}   ${manifest.skills.removed.length}`);
    console.log(`    ${(0, ui_1.style)('Custom:', ui_1.C.cyan)}    ${manifest.skills.custom.length}`);
    console.log('');
    if (totalChanges === 0 && !opts.force) {
        console.log(`  ${(0, ui_1.style)('Nothing to push.', ui_1.C.gray)}\n`);
        return;
    }
    // Build gist files — multi-provider
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    manifest.providers = providers.map(p => p.name);
    const gistFiles = {
        [MANIFEST_FILE]: { content: JSON.stringify(manifest, null, 2) },
    };
    // Per-provider settings + instruction files
    for (const provider of providers) {
        const syncKeys = provider.getSyncKeys();
        // Settings
        const rawSettings = provider.readSettings() || {};
        const syncSettings = {};
        for (const key of syncKeys.settingsKeys) {
            if (rawSettings[key] !== undefined)
                syncSettings[key] = rawSettings[key];
        }
        const settingsGistKey = `cup-settings--${provider.name}.json`;
        gistFiles[settingsGistKey] = { content: JSON.stringify(syncSettings, null, 2) };
        // Instruction file cup block
        const cupBlock = provider.readCupBlock();
        if (cupBlock) {
            gistFiles[syncKeys.instructionFileKey] = { content: cupBlock };
        }
    }
    // Backward compat: also write old SETTINGS_FILE key for Claude
    if (providers.some(p => p.name === 'claude')) {
        const claudeSettings = gistFiles['cup-settings--claude.json'];
        if (claudeSettings) {
            gistFiles[SETTINGS_FILE] = claudeSettings;
        }
        const claudeBlock = gistFiles['cup-claude-md.md'];
        if (claudeBlock) {
            gistFiles[CLAUDE_MD_FILE] = claudeBlock;
        }
    }
    // Include modified/custom skill files
    for (const skillName of skillsToInclude) {
        const key = `${GIST_PREFIX}${skillName}.md`;
        if (modifiedFiles[key]) {
            gistFiles[key] = { content: modifiedFiles[key] };
        }
    }
    // Mark removed skills as null in existing gist (delete from gist)
    for (const skillName of removedToInclude) {
        gistFiles[`${GIST_PREFIX}${skillName}.md`] = null;
    }
    const payload = {
        description: 'claude-up settings sync',
        public: false,
        files: gistFiles,
    };
    try {
        let gistUrl;
        if (auth.gistId) {
            const result = await (0, ui_1.progressLine)('Updating Gist', () => githubApi('PATCH', `/gists/${auth.gistId}`, auth.token, payload));
            gistUrl = result.html_url;
        }
        else {
            const result = await (0, ui_1.progressLine)('Creating Gist', () => githubApi('POST', '/gists', auth.token, payload));
            gistUrl = result.html_url;
            auth.gistId = result.id;
            saveAuth(auth);
        }
        console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Pushed to Gist: ${(0, ui_1.style)(gistUrl, ui_1.C.cyan)}\n`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} Push failed: ${msg}\n`);
        process.exit(1);
    }
}
// --- Pull command ---
async function runPull(opts) {
    (0, ui_1.renderBanner)();
    const auth = loadAuth();
    if (!auth) {
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} Not logged in. Run: ${(0, ui_1.style)('cup login', ui_1.C.cyan)}\n`);
        process.exit(1);
    }
    if (!auth.gistId) {
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} No Gist ID found. Run: ${(0, ui_1.style)('cup push', ui_1.C.cyan)} first.\n`);
        process.exit(1);
    }
    let gistData;
    try {
        gistData = await (0, ui_1.progressLine)('Fetching Gist', () => githubApi('GET', `/gists/${auth.gistId}`, auth.token));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} Pull failed: ${msg}\n`);
        process.exit(1);
        return;
    }
    // Parse manifest
    const manifestFile = gistData.files[MANIFEST_FILE];
    if (!manifestFile) {
        console.log(`  ${(0, ui_1.style)('✗', ui_1.C.red)} No manifest found in Gist.\n`);
        process.exit(1);
        return;
    }
    const manifest = JSON.parse(manifestFile.content);
    // Validate and filter skill names from manifest
    const filterSkillNames = (names, label) => names.filter(name => {
        if (!isValidSkillName(name)) {
            console.warn(`  ${(0, ui_1.style)('⚠', ui_1.C.yellow)} Skipping invalid skill name in ${label}: ${name}`);
            return false;
        }
        return true;
    });
    manifest.skills.removed = filterSkillNames(manifest.skills.removed, 'removed');
    manifest.skills.modified = filterSkillNames(manifest.skills.modified, 'modified');
    manifest.skills.custom = filterSkillNames(manifest.skills.custom, 'custom');
    console.log('');
    console.log(`  ${(0, ui_1.style)('Remote manifest:', ui_1.C.bold)} ${(0, ui_1.style)(manifest.timestamp, ui_1.C.gray)}`);
    console.log(`    ${(0, ui_1.style)('Modified:', ui_1.C.yellow)}  ${manifest.skills.modified.length}`);
    console.log(`    ${(0, ui_1.style)('Removed:', ui_1.C.red)}   ${manifest.skills.removed.length}`);
    console.log(`    ${(0, ui_1.style)('Custom:', ui_1.C.cyan)}    ${manifest.skills.custom.length}`);
    console.log('');
    // Apply per-provider settings + instruction files
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    for (const provider of providers) {
        const syncKeys = provider.getSyncKeys();
        // Settings: try provider-specific key first, then legacy key
        const providerSettingsKey = `cup-settings--${provider.name}.json`;
        const settingsFile = gistData.files[providerSettingsKey]
            || (provider.name === 'claude' ? gistData.files[SETTINGS_FILE] : null);
        if (settingsFile) {
            const doIt = opts.yes || await (0, ui_1.ask)(`Apply ${provider.displayName} settings?`, true);
            if (doIt) {
                provider.backupSettings();
                const localSettings = provider.readSettings() || {};
                const remoteSettings = JSON.parse(settingsFile.content);
                const merged = { ...localSettings, ...remoteSettings };
                provider.writeSettings(merged);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${provider.displayName} settings applied.`);
            }
        }
        // Instruction file cup block
        const instrFile = gistData.files[syncKeys.instructionFileKey]
            || (provider.name === 'claude' ? gistData.files[CLAUDE_MD_FILE] : null);
        if (instrFile) {
            const doIt = opts.yes || await (0, ui_1.ask)(`Apply ${provider.instructionFileName} cup block?`, true);
            if (doIt) {
                const instrPath = provider.getInstructionFilePath('global');
                if (fs.existsSync(instrPath))
                    (0, utils_1.backup)(instrPath);
                provider.writeCupBlock(instrFile.content);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${provider.instructionFileName} cup block applied.`);
            }
        }
        // Skills: apply removed, modified, custom
        for (const name of manifest.skills.removed) {
            const localDir = path.join(provider.skillsDir, name);
            if (!fs.existsSync(localDir))
                continue;
            const doIt = opts.yes || await (0, ui_1.ask)(`Delete removed skill: ${(0, ui_1.style)(name, ui_1.C.yellow)} (${provider.displayName})?`, true);
            if (doIt) {
                fs.rmSync(localDir, { recursive: true, force: true });
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Removed skill: ${(0, ui_1.style)(name, ui_1.C.gray)}`);
            }
        }
        const toWrite = [...manifest.skills.modified, ...manifest.skills.custom];
        for (const name of toWrite) {
            const key = `${GIST_PREFIX}${name}.md`;
            const remoteFile = gistData.files[key];
            if (!remoteFile)
                continue;
            const skillDir = path.join(provider.skillsDir, name);
            const skillMdPath = path.join(skillDir, 'SKILL.md');
            const doIt = opts.yes || await (0, ui_1.ask)(`Apply skill: ${(0, ui_1.style)(name, ui_1.C.cyan)} (${provider.displayName})?`, true);
            if (doIt) {
                fs.mkdirSync(skillDir, { recursive: true });
                fs.writeFileSync(skillMdPath, remoteFile.content);
                console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} Applied skill: ${(0, ui_1.style)(name, ui_1.C.gray)}`);
            }
        }
    }
    console.log(`\n  ${(0, ui_1.style)('Pull complete.', ui_1.C.green)}\n`);
}
