// --- Provider types for multi-LLM CLI support ---

export type ProviderName = 'claude' | 'gemini' | 'codex';

export interface StepResult {
  ok: boolean;
  label: string;
  detail: string;
}

export interface InitStep {
  label: string;
  execute(useDefaults: boolean, lang: string): Promise<StepResult>;
}

export interface PermissionIntents {
  allow: string[];
  deny: string[];
}

export interface PluginInfo {
  id: string;
  name: string;
  description?: string;
}

export interface SessionInfo {
  id: string;
  project: string;
  date: Date;
  size: number;
  firstMessage: string;
}

export interface SessionOpts {
  all?: boolean;
  project?: string;
  limit?: number;
}

export interface SyncKeys {
  settingsKeys: string[];
  instructionFileKey: string;
}

export interface Provider {
  // --- Identity ---
  readonly name: ProviderName;
  readonly displayName: string;
  readonly cliCommand: string;

  // --- Paths ---
  readonly homeDir: string;
  readonly projectDir: string;
  readonly settingsFileName: string;
  readonly instructionFileName: string;
  readonly skillsDir: string;

  // --- Detection ---
  isInstalled(): boolean;

  // --- Settings ---
  readSettings(): Record<string, unknown> | null;
  writeSettings(data: Record<string, unknown>): void;
  getSettingsPath(): string;
  getProjectSettingsPath(projectRoot: string): string;

  // --- Permissions ---
  mergePermissions(intents: PermissionIntents): void;
  getCurrentPermissions(): { allow: string[]; deny: string[] };

  // --- Plugins / Extensions ---
  enablePlugins(plugins: string[]): void;
  getEnabledPlugins(): string[];
  getAvailablePlugins(): PluginInfo[];

  // --- Skills ---
  installSkill(skillDir: string, skillName: string, lang: string): void;
  getInstalledSkills(): string[];
  buildSkillContent(body: string, meta: Record<string, unknown>): string;
  getSkillMeta(skillName: string): Record<string, unknown> | null;

  // --- Instruction File ---
  getInstructionFilePath(scope: 'global' | 'project'): string;
  getInstructionTemplate(): string;
  readCupBlock(): string | null;
  writeCupBlock(content: string): void;

  // --- Sessions ---
  listSessions(opts: SessionOpts): SessionInfo[];
  resumeSession(id: string, fork?: boolean): void;

  // --- Status Line (optional) ---
  installStatusLine?(): void;
  hasStatusLine?(): boolean;

  // --- Backup ---
  backupSettings(): string | null;
  getBackupExcludes(): string[];

  // --- Init Steps ---
  getInitSteps(): InitStep[];

  // --- Sync ---
  getSyncKeys(): SyncKeys;
}
