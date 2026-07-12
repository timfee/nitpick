import { Service, computed, signal } from '@angular/core';

import type { StyleSelection } from '../../shared/lint';
import { STYLE_RULES } from '../../shared/style-rules';
import { DEFAULT_STYLE_IDS, STYLE_PACKAGES } from '../../shared/styles';

/** Per-package preference: whether it runs, and which rules are switched off. */
interface StylePrefs {
  packages: Record<string, { enabled: boolean; disabledRules: string[] }>;
}

const STORAGE_KEY = 'nitpicker.styles';

const defaults = (): StylePrefs => ({
  packages: Object.fromEntries(
    STYLE_PACKAGES.map((pkg) => [
      pkg.id,
      { enabled: DEFAULT_STYLE_IDS.includes(pkg.id), disabledRules: [] },
    ]),
  ),
});

function load(): StylePrefs {
  // localStorage is absent during SSR; the client re-creates the service.
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const stored = JSON.parse(raw) as Partial<StylePrefs>;
    const prefs = defaults();
    for (const [id, pkg] of Object.entries(stored.packages ?? {})) {
      if (!(id in prefs.packages)) continue;
      const known = new Set((STYLE_RULES[id] ?? []).map((r) => r.id));
      prefs.packages[id] = {
        enabled: !!pkg.enabled,
        disabledRules: (pkg.disabledRules ?? []).filter((r) => known.has(r)),
      };
    }
    return prefs;
  } catch {
    return defaults();
  }
}

@Service()
export class StyleSettings {
  private readonly prefs = signal<StylePrefs>(load());

  /** Lint request payload: enabled packages, narrowed to their enabled rules. */
  readonly selections = computed<StyleSelection[]>(() => {
    const { packages } = this.prefs();
    const result: StyleSelection[] = [];
    for (const pkg of STYLE_PACKAGES) {
      const pref = packages[pkg.id];
      if (!pref?.enabled) continue;
      const catalog = STYLE_RULES[pkg.id] ?? [];
      const disabled = new Set(pref.disabledRules);
      const rules = catalog.filter((r) => !disabled.has(r.id)).map((r) => r.id);
      if (!rules.length) continue;
      result.push(rules.length === catalog.length ? { id: pkg.id } : { id: pkg.id, rules });
    }
    return result;
  });

  packageEnabled(id: string): boolean {
    return !!this.prefs().packages[id]?.enabled;
  }

  ruleEnabled(id: string, rule: string): boolean {
    return !this.prefs().packages[id]?.disabledRules.includes(rule);
  }

  /** Count of active rules in a package, for the "n of m" settings caption. */
  enabledRuleCount(id: string): number {
    const total = (STYLE_RULES[id] ?? []).length;
    return total - (this.prefs().packages[id]?.disabledRules.length ?? 0);
  }

  setPackage(id: string, enabled: boolean): void {
    this.update((prefs) => {
      const pref = prefs.packages[id];
      if (pref) pref.enabled = enabled;
    });
  }

  setAllRules(id: string, enabled: boolean): void {
    this.update((prefs) => {
      const pref = prefs.packages[id];
      if (!pref) return;
      pref.disabledRules = enabled ? [] : (STYLE_RULES[id] ?? []).map((r) => r.id);
    });
  }

  setRule(id: string, rule: string, enabled: boolean): void {
    this.update((prefs) => {
      const pref = prefs.packages[id];
      if (!pref) return;
      const disabled = new Set(pref.disabledRules);
      if (enabled) disabled.delete(rule);
      else disabled.add(rule);
      pref.disabledRules = [...disabled];
    });
  }

  private update(mutate: (prefs: StylePrefs) => void): void {
    this.prefs.update((prev) => {
      const next: StylePrefs = structuredClone(prev);
      mutate(next);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }
}
