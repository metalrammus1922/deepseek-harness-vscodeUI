/**
 * File-extension → CodeMirror language extension mapping for the center
 * file viewer. Unknown extensions fall back to plain text (no highlighting).
 */
import type { Extension } from '@codemirror/state'
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { csharp as csharpParser } from '@codemirror/legacy-modes/mode/clike'
import { xml } from '@codemirror/legacy-modes/mode/xml'
import { css } from '@codemirror/lang-css'
import { cpp } from '@codemirror/lang-cpp'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'

/**
 * Resolve one file path to its CodeMirror language extension.
 * @param path - absolute host path of the open file.
 * @returns the language extension, or an empty extension for unknown types.
 */
/**
 * C# via CodeMirror's legacy clike parser, wrapped so declarations match the
 * official VS theme scopes:
 *
 * - An identifier that is immediately followed by `(` (constructor, method
 *   declaration, or method call) paints `entity.name.function` beige
 *   #DCDCAA. The clike `def` heuristic only fires at top scope and
 *   misfires on `class`/`namespace` names and `var` variables, so this
 *   wrapper reclassifies those instead.
 * - A name following `class`/`interface`/`record`/`struct` is a type
 *   (#4EC9B0), after `namespace` a namespace, after `var` a variable.
 * - A name after `new`/`typeof`/`sizeof`/`default`/`nameof` is a type.
 */
/** C# control-flow keywords — `keyword.control` in the VS grammar, painted purple. */
const CS_CONTROL_KEYWORDS = new Set([
  'await', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'return', 'goto', 'throw', 'try', 'catch', 'finally', 'yield', 'lock', 'when',
])

const csharpLanguage = StreamLanguage.define({
  ...csharpParser,
  token(stream, state) {
    const st = state as { lastText?: string }
    const style = csharpParser.token(stream, state)
    let out: string | null = style
    if (style === 'keyword' && CS_CONTROL_KEYWORDS.has(stream.current())) {
      // VS grammar: keyword.control → purple; clike emits plain 'keyword'.
      out = 'keyword-control'
    }
    const prev = st.lastText
    if (style === 'def') {
      // clike's def: either a top-scope declaration (keep as function) or
      // the token after a definition keyword (reclassify by that keyword).
      if (prev === 'var') out = 'variable'
      else if (prev === 'namespace') out = 'namespace'
      else if (prev === 'class' || prev === 'interface' || prev === 'record' || prev === 'struct') out = 'typeName'
      else out = 'def-func'
    } else if (style === 'variable' || style === 'type') {
      if (prev === 'new' || prev === 'typeof' || prev === 'sizeof' || prev === 'default' || prev === 'nameof') {
        out = 'typeName'
      } else if (stream.match(/^\s*\(/, false)) {
        // Constructor/method declaration or call — the VS theme's function beige.
        out = 'def-func'
      }
    }
    if (style !== null) st.lastText = stream.current()
    return out
  },
  tokenTable: {
    'def-func': t.function(t.variableName),
    'keyword-control': t.controlKeyword,
  },
} as StreamParser<unknown>)

export function languageForPath(path: string): Extension {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'cs': case 'csx':
      // The dominant language of this fork's .NET workspaces; see csharpLanguage.
      return csharpLanguage
    case 'ts': case 'mts': case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'js': case 'mjs': case 'cjs':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'py': case 'pyw':
      return python()
    case 'json': case 'jsonc': case 'json5':
      return json()
    case 'html': case 'htm': case 'vue': case 'svelte':
      return html()
    case 'xml': case 'xaml': case 'csproj': case 'config': case 'props': case 'targets':
      // .NET project/solution XML surface: csproj/config/props/targets and XAML.
      return StreamLanguage.define(xml)
    case 'css': case 'scss': case 'less':
      return css()
    case 'md': case 'markdown': case 'mdx':
      return markdown()
    case 'vb':
      // CodeMirror ships no VB mode; VB renders as plain text rather than a
      // misleading C#-ish keyword pass.
      return []
    case 'yaml': case 'yml':
      return yaml()
    case 'c': case 'h':
      return cpp()
    case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hh':
      return cpp()
    case 'java':
      return java()
    case 'rs':
      return rust()
    case 'php':
      return php()
    case 'sql':
      return sql()
    case 'go':
      return go()
    default:
      return []
  }
}
