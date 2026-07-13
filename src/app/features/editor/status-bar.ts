import { Component, input, signal } from '@angular/core';

import { MatDividerModule } from '@angular/material/divider';

import { MetricStat } from './metric-stat';
import type { ReadabilityGrade, ReadabilityReport } from './readability';

/** One shaded region of the hovercard's continuum, in percent of the track. */
interface ScaleZone {
  status: 'ok' | 'high' | 'severe';
  from: number;
  to: number;
}

/** View model for the metric hovercard, anchored above the hovered stat. */
interface MetricCard {
  label: string;
  value: string;
  hint: string;
  aim: string;
  note: string;
  status: 'ok' | 'high' | 'severe';
  /** Marker and target-tick positions in percent of the track. */
  marker: number;
  limit: number;
  /** The target value, shown as a label under the tick. */
  limitLabel: string;
  zones: ScaleZone[];
  endLeft: string;
  endRight: string;
  /** Fixed-position coordinates so the card escapes the bar's overflow clip. */
  left: number;
  bottom: number;
}

const CARD_WIDTH = 272;
const CARD_MARGIN = 8;

/**
 * Bottom status bar: the live word count plus, once there is enough text,
 * the readability scores. Optional stats collapse on narrow viewports.
 * Hovering or focusing a score opens a hovercard with a description and a
 * continuum showing where the value sits relative to the Vale target.
 */
@Component({
  selector: 'nit-status-bar',
  imports: [MatDividerModule, MetricStat],
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.scss',
})
export class StatusBar {
  readonly words = input.required<number>();
  readonly readability = input<ReadabilityReport | null>(null);

  protected readonly card = signal<MetricCard | null>(null);

  /** Grade-level metrics: lower is easier; the track spans 0..4x the target. */
  protected showGrade(anchor: HTMLElement, g: ReadabilityGrade): void {
    const max = g.limit * 4;
    const pct = (n: number) => Math.min(100, Math.round((n / max) * 1000) / 10);
    this.card.set(
      this.placeCard(anchor, {
        label: g.label,
        value: String(g.value),
        hint: `${g.hint}.`,
        aim: capitalize(g.range),
        note: g.status === 'ok' ? 'on target' : g.status === 'high' ? 'above target' : 'well above target',
        status: g.status,
        marker: pct(g.value),
        limit: pct(g.limit),
        limitLabel: String(g.limit),
        zones: [
          { status: 'ok', from: 0, to: pct(g.limit) },
          { status: 'high', from: pct(g.limit), to: pct(g.limit * 3) },
          { status: 'severe', from: pct(g.limit * 3), to: 100 },
        ],
        endLeft: 'easier',
        endRight: 'harder',
      }),
    );
  }

  /** Flesch reading ease is inverted: higher is easier, on a fixed 0-100 scale. */
  protected showEase(anchor: HTMLElement, r: ReadabilityReport): void {
    const ease = r.ease;
    const low = Math.round((ease.limit / 3) * 10) / 10;
    this.card.set(
      this.placeCard(anchor, {
        label: 'Flesch reading ease',
        value: String(ease.value),
        hint: `${ease.verdict} — higher scores read easier.`,
        aim: capitalize(ease.range),
        note: ease.status === 'ok' ? 'on target' : ease.status === 'high' ? 'below target' : 'well below target',
        status: ease.status,
        marker: ease.value,
        limit: ease.limit,
        limitLabel: String(ease.limit),
        zones: [
          { status: 'severe', from: 0, to: low },
          { status: 'high', from: low, to: ease.limit },
          { status: 'ok', from: ease.limit, to: 100 },
        ],
        endLeft: 'harder',
        endRight: 'easier',
      }),
    );
  }

  protected hideCard(): void {
    this.card.set(null);
  }

  /** Anchors the card above the hovered stat, clamped to the viewport. */
  private placeCard(anchor: HTMLElement, card: Omit<MetricCard, 'left' | 'bottom'>): MetricCard {
    const rect = anchor.getBoundingClientRect();
    const centered = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    const left = Math.min(Math.max(centered, CARD_MARGIN), window.innerWidth - CARD_WIDTH - CARD_MARGIN);
    return { ...card, left, bottom: window.innerHeight - rect.top + CARD_MARGIN };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
