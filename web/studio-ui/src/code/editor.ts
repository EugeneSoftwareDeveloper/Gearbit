import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * Редактор кода для вкладок Python и C# (CodeMirror 6). Цвета — только CSS-переменные из tokens.css,
 * поэтому светлая и тёмная темы и акценты подхватываются без пересоздания редактора.
 */

export interface CodeEditorOptions {
  /** Подсветка и отступы языка (python(), StreamLanguage C# и т. п.). */
  language: Extension;
  /** Подсказки при наборе: команды робота и т. п. */
  completions: CompletionSource;
  /** Один уровень отступа, например четыре пробела. */
  indent: string;
  onChange(): void;
  /** Ctrl+Enter. */
  onRun(): void;
  /** Esc, если редактор сам его не использовал (закрыть подсказку, поиск). */
  onEscape(): void;
}

export interface CodeEditor {
  readonly view: EditorView;
  text(): string;
  /** Заменить весь текст (новая программа, пример, файл): история правок начинается заново. */
  setText(text: string): void;
  /** Показать ошибку: строка подсвечивается, курсор встаёт на неё. line и column — с 1. */
  showError(line: number, column: number | null, message: string): void;
  clearError(): void;
  /** Вставить команду: в пустую строку под курсором или новой строкой ниже, с тем же отступом. */
  insertLine(snippet: string): void;
  focus(): void;
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier], color: "var(--code-keyword)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.character, t.regexp], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: "var(--code-function)" },
  { tag: [t.standard(t.variableName), t.self, t.meta], color: "var(--code-builtin)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--code-type)" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "var(--code-operator)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "0.95rem", backgroundColor: "var(--surface)", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  // Без лигатур: ребёнок должен видеть «<=», который набирает, а не «≤».
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", fontVariantLigatures: "none" },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--code-selection)",
  },
  ".cm-activeLine": { backgroundColor: "var(--code-active-line)" },
  ".cm-errorLine": { backgroundColor: "var(--code-error-line)" },
  ".cm-gutters": { backgroundColor: "var(--surface-2)", color: "var(--text-muted)", border: "none", borderRight: "1px solid var(--border)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-3)", color: "var(--text)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px", minWidth: "36px" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent)" },
  ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--code-error-line)" },
  ".cm-selectionMatch": { backgroundColor: "var(--accent-soft)" },
  ".cm-searchMatch": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--code-selection)" },
  ".cm-placeholder": { color: "var(--text-muted)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", maxHeight: "15em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-contrast)" },
  ".cm-completionDetail": { fontStyle: "normal", opacity: "0.75", marginLeft: "8px" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700" },
  ".cm-completionIcon": { display: "none" },
  ".cm-tooltip.cm-completionInfo": { padding: "8px 12px", maxWidth: "320px", fontFamily: "var(--font)", lineHeight: "1.45" },
  ".cm-tooltip-lint": { padding: "0" },
  ".cm-diagnostic": { padding: "8px 12px", fontFamily: "var(--font)", maxWidth: "420px" },
  ".cm-diagnostic-error": { borderLeft: "4px solid var(--danger)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)", textDecorationSkipInk: "none", textUnderlineOffset: "4px" },
  ".cm-lint-marker": { width: "0.7em", height: "0.7em" },
  ".cm-lint-marker-error": { content: "none", backgroundImage: "none", backgroundColor: "var(--danger)", borderRadius: "50%" },
  ".cm-gutter-lint": { width: "1.1em" },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0 2px" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-panel.cm-search": { padding: "8px 12px", fontFamily: "var(--font)" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": { fontFamily: "var(--font)", fontSize: "0.85rem" },
  ".cm-textfield": { backgroundColor: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "6px", padding: "3px 6px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "6px" },
  ".cm-panel.cm-search [name=close]": { color: "var(--text-muted)" },
});

/* Подсветка строки с ошибкой. Пропадает, как только код поменяли. */
const setErrorLine = StateEffect.define<number | null>();
const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        value = e.value === null ? Decoration.none : Decoration.set([Decoration.line({ class: "cm-errorLine" }).range(e.value)]);
      }
    }
    return tr.docChanged ? Decoration.none : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const effectList = (effects: StateEffect<unknown> | readonly StateEffect<unknown>[] | undefined): StateEffect<unknown>[] =>
  effects === undefined ? [] : Array.isArray(effects) ? [...effects] : [effects as StateEffect<unknown>];

export function createCodeEditor(parent: HTMLElement, options: CodeEditorOptions): CodeEditor {
  let hasError = false;

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(options.indent.length),
    indentUnit.of(options.indent),
    indentOnInput(),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ icons: false }),
    EditorState.languageData.of(() => [{ autocomplete: options.completions }]),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lintGutter(),
    errorLine,
    placeholder("Напишите программу здесь…"),
    options.language,
    theme,
    EditorView.contentAttributes.of({ "aria-label": "Текст программы", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    // Tab принимает подсказку, а без подсказки делает отступ.
    Prec.high(keymap.of([{ key: "Mod-Enter", run: () => (options.onRun(), true) }, { key: "Tab", run: acceptCompletion }])),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
    // Esc, который не понадобился редактору, — СТОП, как и везде в Gearbit. false: Esc+Tab по-прежнему уводит фокус.
    Prec.lowest(keymap.of([{ key: "Escape", run: () => (options.onEscape(), false) }])),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (hasError) {
        hasError = false;
        // Внутри обработчика обновления новое изменение отправлять нельзя.
        queueMicrotask(() => view.dispatch(setDiagnostics(view.state, [])));
      }
      options.onChange();
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: "", extensions }) });

  return {
    view,
    text: () => view.state.doc.toString(),
    setText(text) {
      hasError = false;
      view.setState(EditorState.create({ doc: text, extensions }));
    },
    showError(line, column, message) {
      const doc = view.state.doc;
      const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
      const indent = /^\s*/.exec(target.text)?.[0].length ?? 0;
      const from = column !== null && column > 0 ? Math.min(target.from + column - 1, target.to) : target.from + indent;
      const to = column !== null && column > 0 ? Math.min(from + 1, target.to) : target.to;
      const diagnostics = setDiagnostics(view.state, [{ from, to: Math.max(from, to), severity: "error", message }]);
      view.dispatch({
        effects: [...effectList(diagnostics.effects), setErrorLine.of(target.from), EditorView.scrollIntoView(from, { y: "center" })],
        selection: { anchor: from },
      });
      hasError = true;
      view.focus();
    },
    clearError() {
      if (!hasError) return;
      hasError = false;
      view.dispatch({ effects: [...effectList(setDiagnostics(view.state, []).effects), setErrorLine.of(null)] });
    },
    insertLine(snippet) {
      const { state } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      const indent = /^\s*/.exec(line.text)?.[0] ?? "";
      const opens = /[:{]\s*$/.test(line.text);
      const empty = line.text.trim() === "";
      const prefix = empty ? indent : indent + (opens ? options.indent : "");
      const text = snippet
        .split("\n")
        .map((l) => prefix + l)
        .join("\n");
      const from = empty ? line.from : line.to;
      const insert = empty ? text : `\n${text}`;
      view.dispatch({
        changes: { from, to: line.to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
        userEvent: "input",
      });
      view.focus();
    },
    focus: () => view.focus(),
  };
}
