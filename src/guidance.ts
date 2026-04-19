import * as fs from 'fs';
import * as path from 'path';
import { renderBanner, checkbox, C, style } from './ui';
import { readJson, PACKAGE_ROOT } from './utils';
import { resolveProviders } from './providers/registry';
import type { Provider } from './providers/types';
import type { Opts } from './installer';

// --- Types ---

interface GuidanceCategory {
  id: string;
  title: string;
  description: string;
}

interface GuidanceIndex {
  categories: GuidanceCategory[];
}

// --- Helpers ---

function loadIndex(): GuidanceCategory[] {
  const indexPath = path.join(PACKAGE_ROOT, 'presets', 'guidance', 'index.json');
  const data = readJson(indexPath) as unknown as GuidanceIndex | null;
  if (!data) {
    console.error(`  ${style('ERROR:', C.red)} guidance index not found: ${indexPath}\n`);
    process.exit(1);
  }
  return data.categories;
}

function loadCategoryBody(id: string): string {
  const bodyPath = path.join(PACKAGE_ROOT, 'presets', 'guidance', `${id}.md`);
  try { return fs.readFileSync(bodyPath, 'utf-8').trim(); }
  catch {
    console.error(`  ${style('ERROR:', C.red)} guidance preset not found: ${bodyPath}\n`);
    process.exit(1);
  }
}

function wrapBlock(id: string, body: string): string {
  return `<!-- <cup-guidance-${id}> — managed by claude-up, do not edit manually -->

${body}

<!-- </cup-guidance-${id}> -->`;
}

export class InvalidCategoriesError extends Error {
  constructor(public readonly invalid: string[], public readonly valid: string[]) {
    super(`unknown categories: ${invalid.join(', ')}`);
  }
}

export function parseCategories(value: string | undefined, all: GuidanceCategory[]): string[] {
  if (!value) return all.map(c => c.id);
  const ids = value.split(',').map(s => s.trim()).filter(Boolean);
  const validIds = new Set(all.map(c => c.id));
  const invalid = ids.filter(id => !validIds.has(id));
  if (invalid.length > 0) {
    throw new InvalidCategoriesError(invalid, Array.from(validIds));
  }
  return ids;
}

// --- Help ---

function showGuidanceHelp(): void {
  renderBanner();
  const c = C.cyan;
  const b = C.bold;
  const g = C.gray;

  console.log(`  ${style('Usage:', b)} cup guidance <subcommand> [options]\n`);

  console.log(`  ${style('Subcommands', b)}`);
  console.log(`    ${style('init', c)}              Install selected guidance categories into instruction file`);
  console.log(`      ${style('--categories=<list>', g)} comma-separated category ids (default: interactive checkbox)`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)`);
  console.log(`      ${style('--yes, -y', g)}       Skip checkbox, apply all categories`);
  console.log(`    ${style('list', c)}              Show available categories + installed status`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)`);
  console.log(`    ${style('remove', c)}            Remove selected guidance categories`);
  console.log(`      ${style('--categories=<list>', g)} comma-separated category ids (default: interactive checkbox)`);
  console.log(`      ${style('--provider=<...>', g)} Target provider(s)`);
  console.log(`      ${style('--yes, -y', g)}       Skip checkbox, remove all categories\n`);

  const categories = loadIndex();
  console.log(`  ${style('Available categories', b)}`);
  for (const cat of categories) {
    console.log(`    ${style(cat.id.padEnd(12), c)} ${cat.description}`);
  }
  console.log('');
}

// --- Init ---

export async function runGuidanceInit(opts: Opts): Promise<void> {
  renderBanner();
  const all = loadIndex();

  let categoryIds: string[];
  if (opts.categories) {
    categoryIds = parseCategories(opts.categories, all);
  } else if (opts.yes) {
    categoryIds = all.map(c => c.id);
  } else {
    console.log(`  ${style('Select guidance categories to install:', C.bold)}\n`);
    const items = all.map(c => ({ name: c.id, desc: c.description }));
    categoryIds = await checkbox(items);
  }

  if (categoryIds.length === 0) {
    console.log(`  ${style('No categories selected.', C.gray)}\n`);
    return;
  }

  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log(`  ${style('No LLM CLI tools detected.', C.red)}\n`);
    process.exit(1);
  }

  console.log(`\n  ${style('Installing guidance:', C.bold)} ${style(categoryIds.join(', '), C.cyan)}\n`);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }
    for (const id of categoryIds) {
      const body = loadCategoryBody(id);
      provider.writeGuidanceBlock(id, wrapBlock(id, body));
      console.log(`  ${style('✓', C.green)} ${id} installed in ${provider.instructionFileName}`);
    }
  }
  console.log('');
}

// --- List ---

export function runGuidanceList(opts: Opts): void {
  renderBanner();
  const all = loadIndex();
  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log(`  ${style('No LLM CLI tools detected.', C.red)}\n`);
    process.exit(1);
  }

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    } else {
      console.log(`  ${style(`Provider: ${provider.displayName}`, C.bold)}`);
    }
    const installed = new Set(provider.listInstalledGuidance());
    console.log('');
    for (const cat of all) {
      const isOn = installed.has(cat.id);
      const mark = isOn ? style('✓', C.green) : style('·', C.gray);
      const title = style(cat.id.padEnd(20), isOn ? C.bold : C.dim);
      console.log(`    ${mark} ${title} ${style(cat.description, C.gray)}`);
    }
    // also report any unknown installed categories (user custom or obsolete)
    const unknown = Array.from(installed).filter(id => !all.some(c => c.id === id));
    for (const id of unknown) {
      console.log(`    ${style('?', C.yellow)} ${style(id, C.yellow)}  ${style('(unknown category — not in current preset)', C.gray)}`);
    }
    console.log('');
  }
}

// --- Remove ---

export async function runGuidanceRemove(opts: Opts): Promise<void> {
  renderBanner();
  const all = loadIndex();
  const providers = resolveProviders(opts.provider);
  if (providers.length === 0) {
    console.log(`  ${style('No LLM CLI tools detected.', C.red)}\n`);
    process.exit(1);
  }

  // union of installed across all providers, so --yes removes everything cup-managed
  const installedUnion = new Set<string>();
  for (const p of providers) for (const id of p.listInstalledGuidance()) installedUnion.add(id);

  let categoryIds: string[];
  if (opts.categories) {
    categoryIds = parseCategories(opts.categories, all);
  } else if (opts.yes) {
    categoryIds = Array.from(installedUnion);
  } else {
    if (installedUnion.size === 0) {
      console.log(`  ${style('Nothing to remove.', C.gray)}\n`);
      return;
    }
    const items = Array.from(installedUnion).map(id => {
      const cat = all.find(c => c.id === id);
      return { name: id, desc: cat?.description || '(unknown)' };
    });
    console.log(`  ${style('Select guidance categories to remove:', C.bold)}\n`);
    categoryIds = await checkbox(items);
  }

  if (categoryIds.length === 0) {
    console.log(`  ${style('No categories selected.', C.gray)}\n`);
    return;
  }

  console.log(`\n  ${style('Removing guidance:', C.bold)} ${style(categoryIds.join(', '), C.cyan)}\n`);

  for (const provider of providers) {
    if (providers.length > 1) {
      console.log(`  ${style(`── ${provider.displayName} ──`, C.bold, C.cyan)}`);
    }
    const installed = new Set(provider.listInstalledGuidance());
    for (const id of categoryIds) {
      if (!installed.has(id)) {
        console.log(`  ${style('⏭', C.gray)}  ${id} not installed`);
        continue;
      }
      provider.removeGuidanceBlock(id);
      console.log(`  ${style('✓', C.green)} ${id} removed from ${provider.instructionFileName}`);
    }
  }
  console.log('');
}

// --- Programmatic API (used by cup init) ---

export function applyGuidanceCategories(provider: Provider, categoryIds: string[]): void {
  for (const id of categoryIds) {
    const body = loadCategoryBody(id);
    provider.writeGuidanceBlock(id, wrapBlock(id, body));
  }
}

export function getGuidanceCategories(): GuidanceCategory[] {
  return loadIndex();
}

// --- Router ---

export async function runGuidance(subcommand: string | undefined, opts: Opts): Promise<void> {
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
        console.error(`  ${style('Unknown subcommand:', C.red)} ${subcommand}`);
        console.error(`  Run ${style('cup guidance', C.cyan)} for usage\n`);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof InvalidCategoriesError) {
      console.error(`  ${style('ERROR:', C.red)} ${err.message}`);
      console.error(`  Valid: ${err.valid.join(', ')}\n`);
      process.exit(1);
    }
    throw err;
  }
}
