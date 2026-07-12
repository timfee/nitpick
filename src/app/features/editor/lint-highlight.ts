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

/** What we store in each decoration's spec (ProseMirror types it as any). */
interface LintSpec {
  id: string;
  severity: LintSeverity;
}

type LintMeta = { set: LintRange[] } | { remove: string } | { select: string | null };

const key = new PluginKey<DecorationSet>('lintHighlight');

const specOf = (decoration: Decoration): LintSpec => decoration.spec as LintSpec;

const toDecoration = ({ id, from, to, severity }: LintRange, selected: boolean) =>
  Decoration.inline(
    from,
    to,
    {
      class: `lint severity-${severity}${selected ? ' lint--selected' : ''}`,
      'data-lint-id': id,
    },
    { id, severity } satisfies LintSpec,
  );

const rangeOf = (decoration: Decoration): LintRange => ({
  ...specOf(decoration),
  from: decoration.from,
  to: decoration.to,
});

const findById = (decorations: DecorationSet, id: string) =>
  decorations.find(undefined, undefined, (spec) => (spec as LintSpec).id === id);

/** Current (transaction-mapped) document range of a finding's highlight. */
export const lintRangeById = (state: EditorState, id: string): LintRange | undefined => {
  const decorations = key.getState(state);
  const hit = decorations && findById(decorations, id)[0];
  return hit ? rangeOf(hit) : undefined;
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
      (meta: LintMeta) =>
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
            const meta = tr.getMeta(key) as LintMeta | undefined;
            if (!meta) return decorations;
            if ('set' in meta) {
              return DecorationSet.create(
                tr.doc,
                meta.set.map((range) => toDecoration(range, false)),
              );
            }
            if ('remove' in meta) {
              return decorations.remove(findById(decorations, meta.remove));
            }
            return DecorationSet.create(
              tr.doc,
              decorations.find().map((d) => toDecoration(rangeOf(d), specOf(d).id === meta.select)),
            );
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
          handleClick(view, pos) {
            const hit = key.getState(view.state)?.find(pos, pos)[0];
            onSelect(hit ? specOf(hit).id : null);
            return false;
          },
        },
      }),
    ];
  },
});
