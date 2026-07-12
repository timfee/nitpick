import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { LintSeverity } from '../../../shared/lint';

export interface LintRange {
  id: string;
  from: number;
  to: number;
  severity: LintSeverity;
}

interface LintHighlightOptions {
  onSelect: (id: string | null) => void;
}

const key = new PluginKey<DecorationSet>('lintHighlight');

const toDecoration = ({ id, from, to, severity }: LintRange, selected: boolean) =>
  Decoration.inline(
    from,
    to,
    {
      class: `lint lint--${severity}${selected ? ' lint--selected' : ''}`,
      'data-lint-id': id,
    },
    { id, severity },
  );

const rangeOf = (d: Decoration): LintRange => ({
  id: d.spec['id'],
  severity: d.spec['severity'],
  from: d.from,
  to: d.to,
});

/** Current (transaction-mapped) document range of a finding's highlight. */
export const lintRangeById = (state: EditorState, id: string): LintRange | undefined => {
  const hit = key.getState(state)?.find(undefined, undefined, (spec) => spec['id'] === id)[0];
  return hit && rangeOf(hit);
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lintHighlight: {
      setLintRanges: (ranges: LintRange[]) => ReturnType;
      removeLintRange: (id: string) => ReturnType;
      selectLintRange: (id: string | null) => ReturnType;
    };
  }
}

/**
 * Inline decorations for lint findings. Decorations live in plugin state and
 * are remapped through every transaction, so highlights stay glued to their
 * text while the user keeps typing.
 */
export const LintHighlight = Extension.create<LintHighlightOptions>({
  name: 'lintHighlight',

  addOptions() {
    return { onSelect: () => undefined };
  },

  addCommands() {
    const withMeta =
      (meta: object) =>
      ({ tr, dispatch }: { tr: Transaction; dispatch?: unknown }) => {
        if (dispatch) tr.setMeta(key, meta);
        return true;
      };
    return {
      setLintRanges: (ranges) => withMeta({ set: ranges }),
      removeLintRange: (id) => withMeta({ remove: id }),
      selectLintRange: (id) => withMeta({ select: id }),
    };
  },

  addProseMirrorPlugins() {
    const { onSelect } = this.options;
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            decorations = decorations.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(key);
            if (!meta) return decorations;
            if (meta.set) {
              return DecorationSet.create(
                tr.doc,
                meta.set.map((r: LintRange) => toDecoration(r, false)),
              );
            }
            if (meta.remove) {
              return decorations.remove(
                decorations.find(undefined, undefined, (spec) => spec['id'] === meta.remove),
              );
            }
            return DecorationSet.create(
              tr.doc,
              decorations.find().map((d) => toDecoration(rangeOf(d), d.spec['id'] === meta.select)),
            );
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
          handleClick(view, pos) {
            const hit = key.getState(view.state)?.find(pos, pos)[0];
            onSelect(hit?.spec['id'] ?? null);
            return false;
          },
        },
      }),
    ];
  },
});
