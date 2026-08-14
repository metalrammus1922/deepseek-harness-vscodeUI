# Agent Note: Editable Center File Viewer with fs.write and VS2019 Dark Styling

Status: implemented

English | [中文](2026-08-14-file-viewer-edit-save-vs2019-dark.zh.md)

## Problem

The vscodeUI fork's center file viewer was read-only: clicking a file in the explorer opened its text in a read-only textarea, so a user could inspect and select code for the AI chat but never fix a typo or adjust a line from the GUI. The host fs domain exposed only `fs.list` and `fs.read`. The user asked for two things: the opened file must be editable, and the file editing page must carry Visual Studio 2019 Dark's colors and Consolas font.

## Decision

### fs.write over the wire

The apiproxy fs domain gains `fs.write` with a `{ path, content }` request payload and the written path as its response value. The implementation reuses the read side's path rules (a fully-qualified path is required) and refuses non-regular-file targets, and the complete-result bound applies to the whole write: content over the 1 MiB write bound is rejected, never cut, so a save can never silently truncate a file the viewer read whole. Failures surface as the new `file-unwritable` error code carrying the path. The RPC flows through every standard layer: `FsApi`, the request/value zod schemas, the `rpc-map` row, the handler route, the fetch-client method and value schema, the `api-proxy` implementation, and a `writeFsFile` lister helper.

The client runtime projects the new verb through `IFs.write`, implemented by `FsRuntime` on the wire client; the offline fixture and both fake-apis mirror it so tests and the keyless runtime keep the full surface.

### Editable viewer with CodeMirror 6

The viewer is a CodeMirror 6 editor instance (not a native textarea): line numbers, active-line tint, selection, bracket matching, history, and the default keymap ride the editor, and per-extension syntax highlighting applies on top. Each open tab keeps its own draft and its own on-disk base text, so switching tabs preserves unsaved edits (the editor state is rebuilt when the active path or the read-only guard changes, and the doc is synced otherwise); a filled dot marks a dirty tab. An editor bar appears while the active tab is dirty, saving, failed, or truncated, showing the state and a VS-blue Save button that is disabled until the tab is dirty, with Ctrl/Cmd+S as the shortcut (intercepted so the browser's save-as dialog never opens while a file is open). A truncated read stays read-only with a warning — saving it would overwrite the file with the cut content — and the per-tab editor state is dropped when its tab closes.

### Syntax highlighting

A CodeMirror theme (`vs2019-theme.ts`) reproduces the VS2019 Dark editor chrome and token palette, aligned to the official theme files VS Code ships in `theme-defaults` (`dark_plus.json` + `dark_vs.json`): comments #6A9955, strings #CE9178, keywords #569CD6, control-flow keywords #C586C0, numbers #B5CEA8, constants/enums #4FC1FF, functions #DCDCAA, types #4EC9B0 (including C# `storage.type.cs`), variables #9CDCFE, operators #D4D4D4, `this`/`self` #569CD6, labels #C8C8C8, invalid #F44747, and markdown headings #569CD6, with selection #264F78 and gutter numbers #858585 on the #1E1E1E canvas. C# uses the legacy clike parser wrapped so declarations match the official scopes: an identifier immediately followed by `(` (constructor, method declaration, or call) paints function-beige; a name after `class`/`interface`/`record`/`struct` is a type, after `namespace` a namespace, after `var` a variable; and a name after `new`/`typeof`/`sizeof`/`default`/`nameof` is a type. Control-flow keywords keep the VS2019 blue (the clike grammar emits plain `keyword`, not `keyword.control`). The language is resolved from the file extension (`language.ts`): TypeScript/JSX, JavaScript, Python, JSON, HTML, CSS, Markdown, YAML, C/C++, Java, Rust, PHP, SQL, and Go, plus C# and the .NET XML surface (.csproj/.config/.props/.targets/XAML) through CodeMirror's legacy clike/xml modes — C# is the dominant language of this fork's .NET workspaces; unknown extensions render as plain text. The CodeMirror packages are plain dependencies inlined into the ui-explorer client bundle (no workers, no external assets).

### VS2019 Dark styling

The fork's theme default becomes `dark` (`ui-theme` `DEFAULT_PREFERENCE`), so the whole workbench boots into the built-in dark palette, and that palette's alias tokens are retuned to the VS2019 Dark colors: window/editor #1E1E1E, panels and the sidebar #252526, elevated surfaces #2D2D2D/#3C3C3C, text #DCDCDC with #C8C8C8/#858585 secondary tiers, accent #007ACC, primary buttons #0E639C, and diagnostics #F48771 (error), #4EC9B0 (success), #CCA700/#D7BA7D (warning). The Appearance row still offers light and system.

The viewer's CSS module scopes the same VS2019 Dark palette for the editor itself and puts Consolas first in the editor font stack, falling back through Cascadia Code and the system mono stack: editor background #1E1E1E, text #DCDCDC, selection #264F78, gutter numbers #858585, inactive tabs #2D2D2D over a #252526 tab well with a #007ACC accent on the active tab, buttons #0E639C. The line-number gutter sits on the editor background with a subtle right border, matching the VS editor chrome.

## Alternatives considered

**Ask the agent to change files through the chat.** Editing would stay round-tripped through a model turn, which is slower and less direct than fixing a line in place; the user asked to edit the opened file itself.

**Reuse an existing write path.** The settings seam and the agent-facing fs tools serve different owners (configuration, the model loop) and are not browser RPC; the fs domain is the natural owner of file text I/O for the workbench.

**One draft per active tab instead of per open tab.** Switching tabs would discard unsaved edits; per-tab drafts preserve them at the cost of a little local state.

**Allow saving truncated content.** Writing back cut content destroys data silently; the read-only guard on truncated tabs is the conservative default.

**Use Monaco Editor instead of CodeMirror.** Monaco is the VS Code editor kernel and its `vs-dark` theme is the same palette, but it is a much larger dependency and its worker/AMD loading does not fit the closure-factory plugin bundles; CodeMirror 6 is plain ESM, needs no worker, and renders the same VS2019 token colors with a fraction of the size. The user asked for the VS2019 Dark look, not the VS Code feature surface, so CodeMirror wins.

**Keep a read-only highlight layer over a textarea.** A syntax-highlighted overlay with an invisible editable textarea underneath (the classic lightweight trick) breaks selection, scrolling, and accessibility; the real editor kernel removes those hacks.

## Consequences

- The GUI can modify project files directly, bypassing the agent loop; the write path is bounded and validated like the read path, and the browser's save-as dialog no longer hijacks Ctrl+S while a file is open.
- The whole workbench now carries the VS2019 Dark identity: the fork defaults to the dark palette with VS-tuned tokens, so the editor, sidebar, and chat read as one consistent theme instead of a dark editor floating on a light shell.
- Unsaved edits survive tab switches within a session and are discarded on tab close, matching the plain tab-close action.

## Testing

A FileViewer component spec drives the CodeMirror instance through `EditorView.findFromDOM` and covers load → edit → dirty marker → save through the button, Ctrl+S saving, per-tab draft retention across tab switches, and the truncated read-only guard. The host apiproxy fakes in the fetch-carrier and client-handler suites gained the `fs.write` row, and the offline fixture mirrors the write verb. The ui-theme suites were updated for the fork's new dark default and cover the VS-tuned token ladder; browser-level checks confirm the booted workbench renders in the VS2019 Dark palette and that a TypeScript file paints the expected token colors (#569CD6 keywords, #CE9178 strings, #6A9955 comments, #4EC9B0 types).