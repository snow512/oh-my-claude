"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProviders = detectProviders;
exports.resolveProviders = resolveProviders;
exports.getProvider = getProvider;
const claude_1 = require("./claude");
const ALL_PROVIDERS = {
    claude: () => new claude_1.ClaudeProvider(),
    // gemini: () => new GeminiProvider(),  // Phase 2
    // codex: () => new CodexProvider(),    // Phase 3
    gemini: undefined,
    codex: undefined,
};
const AVAILABLE_PROVIDERS = {
    claude: ALL_PROVIDERS.claude,
};
/** Detect all installed providers */
function detectProviders() {
    return Object.values(AVAILABLE_PROVIDERS)
        .filter((factory) => !!factory)
        .map(factory => factory())
        .filter(p => p.isInstalled());
}
/** Resolve providers from --provider flag. Auto-detect if omitted. */
function resolveProviders(providerFlag) {
    if (!providerFlag)
        return detectProviders();
    const names = providerFlag.split(',').map(s => s.trim());
    return names.map(name => {
        const factory = AVAILABLE_PROVIDERS[name];
        if (!factory) {
            const valid = Object.keys(AVAILABLE_PROVIDERS).join(', ');
            throw new Error(`Unknown or unavailable provider: ${name}. Available: ${valid}`);
        }
        return factory();
    });
}
/** Get a specific provider by name */
function getProvider(name) {
    const factory = AVAILABLE_PROVIDERS[name];
    if (!factory)
        throw new Error(`Provider not available: ${name}`);
    return factory();
}
