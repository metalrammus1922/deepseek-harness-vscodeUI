/**
 * CodeMirror 6 theme and highlight style mirroring Visual Studio 2019 Dark.
 * Editor chrome: background #1E1E1E, text #DCDCDC, selection #264F78,
 * gutter numbers #858585 (current line #C6C6C6), caret #AEAFAD, and a
 * subtle white active-line tint. Token colors follow the VS2019 Dark
 * syntax palette: keywords #569CD6, strings #CE9178, comments #6A9955,
 * numbers #B5CEA8, functions #DCDCAA, types #4EC9B0, variables
 * #9CDCFE, operators/punctuation #D4D4D4.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const editorFont = "'Consolas', 'Cascadia Code', 'Courier New', ui-monospace, monospace"

/** VS2019 Dark editor chrome (chrome only — highlighting rides vs2019Highlight). */
export const vs2019EditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1e1e1e',
    color: '#dcdcdc',
    fontSize: 'var(--dsh-font-editor, 13px)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: editorFont,
    lineHeight: '1.5',
  },
  '.cm-content': {
    caretColor: '#aeafad',
    padding: '10px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#aeafad',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#264f78',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#c6c6c6',
  },
  '.cm-gutters': {
    backgroundColor: '#1e1e1e',
    color: '#858585',
    borderRight: '1px solid rgba(69, 69, 69, 0.6)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '42px',
    padding: '0 10px 0 12px',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(0, 122, 204, 0.3)',
    outline: '1px solid #569cd6',
  },
  '.cm-searching': {
    backgroundColor: 'rgba(215, 186, 125, 0.4)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#2d2d2d',
    border: '1px solid #454545',
    color: '#dcdcdc',
  },
  '.cm-tooltip': {
    backgroundColor: '#252526',
    border: '1px solid #454545',
    color: '#dcdcdc',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#094771',
    color: '#ffffff',
  },
  '.cm-panels': {
    backgroundColor: '#252526',
    color: '#dcdcdc',
  },
})

/**
 * Visual Studio 2019 Dark token colors (the VS2019 Text Editor font & colors
 * defaults, cross-platform identical to the VS-family themes VS Code ships):
 * comments #57A64A, strings #D69D85, keywords #569CD6, control-flow
 * keywords #C586C0, numbers #B5CEA8, constants/enums #4FC1FF, functions
 * #DCDCAA, types #4EC9B0 (including C# `storage.type.cs`), variables
 * #9CDCFE, operators #D4D4D4, `this`/`self` #569CD6, labels #C8C8C8,
 * invalid #F44747, and markdown headings #569CD6.
 */
const vs2019Highlight = HighlightStyle.define([
  { tag: t.comment, color: '#57a64a' },
  // keyword.control (if/for/while/return/using/…) — the dark_plus override.
  { tag: t.controlKeyword, color: '#c586c0' },
  // keyword, storage, modifiers, `using`/`import` directives.
  { tag: [t.keyword, t.moduleKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword], color: '#569cd6' },
  { tag: [t.string, t.special(t.string)], color: '#d69d85' },
  { tag: [t.number, t.integer, t.float], color: '#b5cea8' },
  // constant.language (true/false/null) is blue; declared constants/enums are bright blue.
  { tag: [t.bool, t.null, t.atom], color: '#569cd6' },
  { tag: [t.constant(t.name), t.standard(t.name)], color: '#4fc1ff' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#dcdcaa' },
  { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
  { tag: [t.variableName], color: '#9cdcfe' },
  { tag: [t.propertyName, t.attributeName], color: '#9cdcfe' },
  { tag: [t.operator, t.punctuation, t.separator], color: '#d4d4d4' },
  { tag: [t.tagName], color: '#569cd6' },
  { tag: [t.meta, t.processingInstruction], color: '#569cd6' },
  // variable.language (this/self) and statement labels.
  { tag: [t.self], color: '#569cd6' },
  { tag: [t.labelName], color: '#c8c8c8' },
  { tag: [t.heading], color: '#569cd6', fontWeight: 'bold' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.link, t.url], color: '#569cd6', textDecoration: 'underline' },
  { tag: [t.invalid], color: '#f44747' },
])

/** Complete VS2019 Dark editor extensions: chrome + syntax highlighting. */
export const vs2019EditorExtensions = [
  vs2019EditorTheme,
  syntaxHighlighting(vs2019Highlight),
]
