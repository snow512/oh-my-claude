import { Provider, ProviderName } from './types';
import { ClaudeProvider } from './claude';

const ALL_PROVIDERS: Record<ProviderName, () => Provider> = {
  claude: () => new ClaudeProvider(),
  // gemini: () => new GeminiProvider(),  // Phase 2
  // codex: () => new CodexProvider(),    // Phase 3
  gemini: undefined as unknown as () => Provider,
  codex: undefined as unknown as () => Provider,
};

const AVAILABLE_PROVIDERS: Partial<Record<ProviderName, () => Provider>> = {
  claude: ALL_PROVIDERS.claude,
};

/** Detect all installed providers */
export function detectProviders(): Provider[] {
  return Object.values(AVAILABLE_PROVIDERS)
    .filter((factory): factory is () => Provider => !!factory)
    .map(factory => factory())
    .filter(p => p.isInstalled());
}

/** Resolve providers from --provider flag. Auto-detect if omitted. */
export function resolveProviders(providerFlag?: string): Provider[] {
  if (!providerFlag) return detectProviders();

  const names = providerFlag.split(',').map(s => s.trim()) as ProviderName[];
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
export function getProvider(name: ProviderName): Provider {
  const factory = AVAILABLE_PROVIDERS[name];
  if (!factory) throw new Error(`Provider not available: ${name}`);
  return factory();
}
