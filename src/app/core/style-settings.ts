import { Service, computed, signal } from '@angular/core';

import type { StyleSelection } from '../../shared/lint';
import { STYLE_RULES } from '../../shared/style-rules';
import { DEFAULT_STYLE_IDS, STYLE_PACKAGES } from '../../shared/styles';

/**
 * A package is active exactly when it has enabled rules, so one model
 * drives one control. Keyed by package id, holding the enabled rule ids.
 */
interface StylePrefs {
  enabled: Record<string, string[]>;
}

const STORAGE_KEY = 'nitpicker.styles.v2';

const allRules = (id: string): string[] => (STYLE_RULES[id] ?? []).map((r) => r.id);

const defaults = (): StylePrefs => ({
  enabled: Object.fromEntries(
    STYLE_PACKAGES.map((pkg) => [
      pkg.id,
      DEFAULT_STYLE_IDS.includes(pkg.id) ? allRules(pkg.id) : [],
    ]),
  ),
});

function load(): StylePrefs {
  // localStorage is absent during SSR. The client re-creates the service.
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const stored = JSON.parse(raw) as Partial<StylePrefs>;
    const prefs = defaults();
    for (const [id, rules] of Object.entries(stored.enabled ?? {})) {
      if (!(id in prefs.enabled) || !Array.isArray(rules)) continue;
      const known = new Set(allRules(id));
      prefs.enabled[id] = rules.filter((r): r is string => typeof r === 'string' && known.has(r));
    }
    return prefs;
  } catch {
    return defaults();
  }
}

@Service()
export class StyleSettings {
  private readonly prefs = signal<StylePrefs>(load());

  /** Lint request payload: active packages, narrowed to their enabled rules. */
  readonly selections = computed<StyleSelection[]>(() => {
    const { enabled } = this.prefs();
    const result: StyleSelection[] = [];
    for (const pkg of STYLE_PACKAGES) {
      const rules = enabled[pkg.id] ?? [];
      if (!rules.length) continue;
      result.push(
        rules.length === allRules(pkg.id).length ? { id: pkg.id } : { id: pkg.id, rules },
      );
    }
    return result;
  });

  ruleEnabled(id: string, rule: string): boolean {
    return (this.prefs().enabled[id] ?? []).includes(rule);
  }

  enabledRuleCount(id: string): number {
    return (this.prefs().enabled[id] ?? []).length;
  }

  setAllRules(id: string, enabled: boolean): void {
    this.update((prefs) => {
      prefs.enabled[id] = enabled ? allRules(id) : [];
    });
  }

  setRule(id: string, rule: string, enabled: boolean): void {
    this.update((prefs) => {
      const set = new Set(prefs.enabled[id] ?? []);
      if (enabled) set.add(rule);
      else set.delete(rule);
      // Preserve catalog order so full selections compare cleanly.
      prefs.enabled[id] = allRules(id).filter((r) => set.has(r));
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
