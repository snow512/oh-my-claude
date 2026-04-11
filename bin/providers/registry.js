"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProviders = detectProviders;
exports.resolveProviders = resolveProviders;
exports.getProvider = getProvider;
const claude_1 = require("./claude");
const gemini_1 = require("./gemini");
const codex_1 = require("./codex");
const ALL_PROVIDERS = {
    claude: () => new claude_1.ClaudeProvider(),
    gemini: () => new gemini_1.GeminiProvider(),
    codex: () => new codex_1.CodexProvider(),
};
/** Detect all installed providers */
function detectProviders() {
    return Object.values(ALL_PROVIDERS)
        .map(factory => factory())
        .filter(p => p.isInstalled());
}
/** Resolve providers from --provider flag. Auto-detect if omitted. */
function resolveProviders(providerFlag) {
    if (!providerFlag)
        return detectProviders();
    const names = providerFlag.split(',').map(s => s.trim());
    return names.map(name => {
        const factory = ALL_PROVIDERS[name];
        if (!factory) {
            const valid = Object.keys(ALL_PROVIDERS).join(', ');
            throw new Error(`Unknown provider: ${name}. Available: ${valid}`);
        }
        return factory();
    });
}
/** Get a specific provider by name */
function getProvider(name) {
    return ALL_PROVIDERS[name]();
}
