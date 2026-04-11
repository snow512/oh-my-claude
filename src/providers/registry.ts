import { Provider, ProviderName } from './types';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { CodexProvider } from './codex';

const ALL_PROVIDERS: Record<ProviderName, () => Provider> = {
  claude: () => new ClaudeProvider(),
  gemini: () => new GeminiProvider(),
  codex:  () => new CodexProvider(),
};

/** Detect all installed providers */
export function detectProviders(): Provider[] {
  return Object.values(ALL_PROVIDERS)
    .map(factory => factory())
    .filter(p => p.isInstalled());
}

/** Resolve providers from --provider flag. Auto-detect if omitted. */
export function resolveProviders(providerFlag?: string): Provider[] {
  if (!providerFlag) return detectProviders();

  const names = providerFlag.split(',').map(s => s.trim()) as ProviderName[];
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
export function getProvider(name: ProviderName): Provider {
  return ALL_PROVIDERS[name]();
}
