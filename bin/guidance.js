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
exports.InvalidCategoriesError = void 0;
exports.parseCategories = parseCategories;
exports.runGuidanceInit = runGuidanceInit;
exports.runGuidanceList = runGuidanceList;
exports.runGuidanceRemove = runGuidanceRemove;
exports.applyGuidanceCategories = applyGuidanceCategories;
exports.getGuidanceCategories = getGuidanceCategories;
exports.runGuidance = runGuidance;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ui_1 = require("./ui");
const utils_1 = require("./utils");
const registry_1 = require("./providers/registry");
// --- Helpers ---
function loadIndex() {
    const indexPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'guidance', 'index.json');
    const data = (0, utils_1.readJson)(indexPath);
    if (!data) {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} guidance index not found: ${indexPath}\n`);
        process.exit(1);
    }
    return data.categories;
}
function loadCategoryBody(id) {
    const bodyPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'guidance', `${id}.md`);
    try {
        return fs.readFileSync(bodyPath, 'utf-8').trim();
    }
    catch {
        console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} guidance preset not found: ${bodyPath}\n`);
        process.exit(1);
    }
}
function wrapBlock(id, body) {
    return `<!-- <cup-guidance-${id}> — managed by claude-up, do not edit manually -->

${body}

<!-- </cup-guidance-${id}> -->`;
}
class InvalidCategoriesError extends Error {
    constructor(invalid, valid) {
        super(`unknown categories: ${invalid.join(', ')}`);
        this.invalid = invalid;
        this.valid = valid;
    }
}
exports.InvalidCategoriesError = InvalidCategoriesError;
function parseCategories(value, all) {
    if (!value)
        return all.map(c => c.id);
    const ids = value.split(',').map(s => s.trim()).filter(Boolean);
    const validIds = new Set(all.map(c => c.id));
    const invalid = ids.filter(id => !validIds.has(id));
    if (invalid.length > 0) {
        throw new InvalidCategoriesError(invalid, Array.from(validIds));
    }
    return ids;
}
// --- Help ---
function showGuidanceHelp() {
    (0, ui_1.renderBanner)();
    const c = ui_1.C.cyan;
    const b = ui_1.C.bold;
    const g = ui_1.C.gray;
    console.log(`  ${(0, ui_1.style)('Usage:', b)} cup guidance <subcommand> [options]\n`);
    console.log(`  ${(0, ui_1.style)('Subcommands', b)}`);
    console.log(`    ${(0, ui_1.style)('init', c)}              Install selected guidance categories into instruction file`);
    console.log(`      ${(0, ui_1.style)('--categories=<list>', g)} comma-separated category ids (default: interactive checkbox)`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Skip checkbox, apply all categories`);
    console.log(`    ${(0, ui_1.style)('list', c)}              Show available categories + installed status`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)`);
    console.log(`    ${(0, ui_1.style)('remove', c)}            Remove selected guidance categories`);
    console.log(`      ${(0, ui_1.style)('--categories=<list>', g)} comma-separated category ids (default: interactive checkbox)`);
    console.log(`      ${(0, ui_1.style)('--provider=<...>', g)} Target provider(s)`);
    console.log(`      ${(0, ui_1.style)('--yes, -y', g)}       Skip checkbox, remove all categories\n`);
    const categories = loadIndex();
    console.log(`  ${(0, ui_1.style)('Available categories', b)}`);
    for (const cat of categories) {
        console.log(`    ${(0, ui_1.style)(cat.id.padEnd(12), c)} ${cat.description}`);
    }
    console.log('');
}
// --- Init ---
async function runGuidanceInit(opts) {
    (0, ui_1.renderBanner)();
    const all = loadIndex();
    let categoryIds;
    if (opts.categories) {
        categoryIds = parseCategories(opts.categories, all);
    }
    else if (opts.yes) {
        categoryIds = all.map(c => c.id);
    }
    else {
        console.log(`  ${(0, ui_1.style)('Select guidance categories to install:', ui_1.C.bold)}\n`);
        const items = all.map(c => ({ name: c.id, desc: c.description }));
        categoryIds = await (0, ui_1.checkbox)(items);
    }
    if (categoryIds.length === 0) {
        console.log(`  ${(0, ui_1.style)('No categories selected.', ui_1.C.gray)}\n`);
        return;
    }
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (providers.length === 0) {
        console.log(`  ${(0, ui_1.style)('No LLM CLI tools detected.', ui_1.C.red)}\n`);
        process.exit(1);
    }
    console.log(`\n  ${(0, ui_1.style)('Installing guidance:', ui_1.C.bold)} ${(0, ui_1.style)(categoryIds.join(', '), ui_1.C.cyan)}\n`);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        for (const id of categoryIds) {
            const body = loadCategoryBody(id);
            provider.writeGuidanceBlock(id, wrapBlock(id, body));
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${id} installed in ${provider.instructionFileName}`);
        }
    }
    console.log('');
}
// --- List ---
function runGuidanceList(opts) {
    (0, ui_1.renderBanner)();
    const all = loadIndex();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (providers.length === 0) {
        console.log(`  ${(0, ui_1.style)('No LLM CLI tools detected.', ui_1.C.red)}\n`);
        process.exit(1);
    }
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        else {
            console.log(`  ${(0, ui_1.style)(`Provider: ${provider.displayName}`, ui_1.C.bold)}`);
        }
        const installed = new Set(provider.listInstalledGuidance());
        console.log('');
        for (const cat of all) {
            const isOn = installed.has(cat.id);
            const mark = isOn ? (0, ui_1.style)('✓', ui_1.C.green) : (0, ui_1.style)('·', ui_1.C.gray);
            const title = (0, ui_1.style)(cat.id.padEnd(20), isOn ? ui_1.C.bold : ui_1.C.dim);
            console.log(`    ${mark} ${title} ${(0, ui_1.style)(cat.description, ui_1.C.gray)}`);
        }
        // also report any unknown installed categories (user custom or obsolete)
        const unknown = Array.from(installed).filter(id => !all.some(c => c.id === id));
        for (const id of unknown) {
            console.log(`    ${(0, ui_1.style)('?', ui_1.C.yellow)} ${(0, ui_1.style)(id, ui_1.C.yellow)}  ${(0, ui_1.style)('(unknown category — not in current preset)', ui_1.C.gray)}`);
        }
        console.log('');
    }
}
// --- Remove ---
async function runGuidanceRemove(opts) {
    (0, ui_1.renderBanner)();
    const all = loadIndex();
    const providers = (0, registry_1.resolveProviders)(opts.provider);
    if (providers.length === 0) {
        console.log(`  ${(0, ui_1.style)('No LLM CLI tools detected.', ui_1.C.red)}\n`);
        process.exit(1);
    }
    // union of installed across all providers, so --yes removes everything cup-managed
    const installedUnion = new Set();
    for (const p of providers)
        for (const id of p.listInstalledGuidance())
            installedUnion.add(id);
    let categoryIds;
    if (opts.categories) {
        categoryIds = parseCategories(opts.categories, all);
    }
    else if (opts.yes) {
        categoryIds = Array.from(installedUnion);
    }
    else {
        if (installedUnion.size === 0) {
            console.log(`  ${(0, ui_1.style)('Nothing to remove.', ui_1.C.gray)}\n`);
            return;
        }
        const items = Array.from(installedUnion).map(id => {
            const cat = all.find(c => c.id === id);
            return { name: id, desc: cat?.description || '(unknown)' };
        });
        console.log(`  ${(0, ui_1.style)('Select guidance categories to remove:', ui_1.C.bold)}\n`);
        categoryIds = await (0, ui_1.checkbox)(items);
    }
    if (categoryIds.length === 0) {
        console.log(`  ${(0, ui_1.style)('No categories selected.', ui_1.C.gray)}\n`);
        return;
    }
    console.log(`\n  ${(0, ui_1.style)('Removing guidance:', ui_1.C.bold)} ${(0, ui_1.style)(categoryIds.join(', '), ui_1.C.cyan)}\n`);
    for (const provider of providers) {
        if (providers.length > 1) {
            console.log(`  ${(0, ui_1.style)(`── ${provider.displayName} ──`, ui_1.C.bold, ui_1.C.cyan)}`);
        }
        const installed = new Set(provider.listInstalledGuidance());
        for (const id of categoryIds) {
            if (!installed.has(id)) {
                console.log(`  ${(0, ui_1.style)('⏭', ui_1.C.gray)}  ${id} not installed`);
                continue;
            }
            provider.removeGuidanceBlock(id);
            console.log(`  ${(0, ui_1.style)('✓', ui_1.C.green)} ${id} removed from ${provider.instructionFileName}`);
        }
    }
    console.log('');
}
// --- Programmatic API (used by cup init) ---
function applyGuidanceCategories(provider, categoryIds) {
    for (const id of categoryIds) {
        const body = loadCategoryBody(id);
        provider.writeGuidanceBlock(id, wrapBlock(id, body));
    }
}
function getGuidanceCategories() {
    return loadIndex();
}
// --- Router ---
async function runGuidance(subcommand, opts) {
    try {
        switch (subcommand) {
            case 'init':
                await runGuidanceInit(opts);
                break;
            case 'list':
                runGuidanceList(opts);
                break;
            case 'remove':
                await runGuidanceRemove(opts);
                break;
            case undefined:
            case 'help':
                showGuidanceHelp();
                break;
            default:
                console.error(`  ${(0, ui_1.style)('Unknown subcommand:', ui_1.C.red)} ${subcommand}`);
                console.error(`  Run ${(0, ui_1.style)('cup guidance', ui_1.C.cyan)} for usage\n`);
                process.exit(1);
        }
    }
    catch (err) {
        if (err instanceof InvalidCategoriesError) {
            console.error(`  ${(0, ui_1.style)('ERROR:', ui_1.C.red)} ${err.message}`);
            console.error(`  Valid: ${err.valid.join(', ')}\n`);
            process.exit(1);
        }
        throw err;
    }
}
