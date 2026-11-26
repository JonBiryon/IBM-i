# Jon's RPGLE-free formatter

Version 0.1.0 combines **indentation-only formatting for fully-free RPGLE** with
the existing indentation-aware **Ctrl+/** line commenter (**Cmd+/** on macOS).
Extension ID: `local-rpgle-tools.jons-rpgle-free-formatter`.
Language modes: `rpgle` and `sqlrpgle`; existing RPGLE language support is required.

## Make Ctrl+/ use this commenter

With this extension installed and enabled:

1. Press **Ctrl+Shift+P** and choose **Preferences: Open Keyboard Shortcuts (JSON)**.
2. Append the entry below as the **last (or only) Ctrl+/ entry**, inside the
   square brackets, before the final `]`. Separate it from the preceding entry
   with a comma, if there is one. If this exact entry already exists, move it
   there instead of adding a duplicate.
3. Save with **Ctrl+S**.

```json
{
  "key": "ctrl+/",
  "command": "rpgleFreeFormatter.toggle",
  "when": "editorTextFocus && !editorReadonly && (editorLangId == rpgle || editorLangId == sqlrpgle)"
}
```

On macOS, use **Cmd+Shift+P**, **Cmd+S**, and `"key": "cmd+/"` instead.

This makes our command take priority over extension defaults and earlier user
bindings when editing writable RPGLE or SQLRPGLE source. Leave unrelated shortcuts
unchanged.

## Version 1 formatting scope

- Format Document changes leading indentation only in fully-free source whose
  first line is column-one `**FREE` (case-insensitive, blank remainder; BOM accepted).
- Mixed, fixed-format and column-limited source, including legacy `/FREE` blocks,
  are **unsupported by the formatter**. They are not converted to fully-free source.
  The commenter still supports column-limited free-form lines and fixed delegation.
- The formatting contract preserves **all nonwhitespace**. It does not change
  keyword case, expressions, token spacing, comments, strings, SQL text or line
  breaks, and does not wrap statements or trim trailing text. Only planned
  leading-prefix replacements are returned to VS Code; there is no document rewrite.
- Formatting notices and failures are written to the **Jon's RPGLE-free formatter**
  Output channel, without popup dialogs during Format Document or format-on-save.
  Cancellation discards pending formatting edits and notices.

### Classification and ambiguity

This is a local lexical/statement classifier, **not a full RPG parser, compiler or
preprocessor**. Statement starts, block boundaries and incomplete statements are
classified lexically. A stack recognises nested `dcl-ds`, `dcl-pr`, `dcl-pi`,
`dcl-proc`, `begsr`, `if`, `for`, `dow`, `dou`, `select` and `monitor` blocks,
their closing statements and associated branch statements. Keywords are matched
case-insensitively without changing spelling in the source. Operation-like names
used as assignment targets are not treated as block openers.
`LIKEDS`/`LIKEREC` data structures and empty definitions with an inline
`END-DS`, `END-PR` or `END-PI` are treated as single-statement declarations.

Version 1 refuses the whole formatting operation for compiler directives that
could affect structure (including `/COPY` and conditional directives), embedded
SQL, tab indentation, multiple statements on one line, unmatched parentheses or
blocks, and unfinished statements. It does not fetch copy members or evaluate
conditional branches. Column-one `**` data markers and `/EOF` protect the remaining
document. Statements containing continued literals retain their complete original
indentation and produce an Output notice. These safeguards are not syntax validation.

In particular, a line after an incomplete statement can look like either another
statement or a continuation. The **+1 versus +3 continuation indentation heuristic**
is a style/classification choice, not proof of RPG semantics: a shallow continuation
and a deeper continuation can both be plausible from local text. The formatter
cannot always infer intent or reproduce a human's preferred layout. The implemented
policy uses **+1** for continued `if`, `elseif`, `for`, `dow`, `dou`, `when` and
`snd-msg` statements. Other statements, including declarations, calls and assignment
readability wraps, use **+3**. A closing parenthesis on its own line aligns with
the statement start. These offsets always refer to the statement's first line,
not its previous continuation. Version 1 is
limited to whitespace indentation; it must never resolve such ambiguity by rewriting
nonwhitespace. Engine behavior and its focused tests are maintained separately from
the VS Code adapter. Top-level active code uses three spaces; nested blocks add
three spaces. Ordinary full-line comments preceding statements start one column
left of that statement. Triple-slash banners/separators, comments inside wrapped
statements, and recognisable semicolon-terminated commented-out code retain their
existing indentation. Banner insertion, section reordering, blank-line changes,
keyword casing and range formatting are outside this release's scope.

## Retained commenting behavior

Command: `rpgleFreeFormatter.toggle` (**Jon's RPGLE-free formatter: Toggle Line Comment**).
Other language modes and Ctrl+K chords are unchanged.

| Usable indentation | Shift when adding `// ` |
| --- | --- |
| 0 spaces | 3 columns |
| 1 space | 2 columns |
| 2 spaces | 1 column |
| 3 or more spaces | None |

- Fully-free mode uses the `**FREE` rule above. Otherwise, blank columns 6-7
  identify column-limited free-form candidates, preserving columns 1-7 exactly.
  Mixed source does not require `/FREE` delimiters for commenting.
- A rightward shift past column 80 is refused with a warning. Zero-shift prefix
  edits retain existing text beyond column 80 without truncation.
- Blank lines are skipped. When every eligible nonblank selected line is already
  commented, the command uncomments; otherwise only uncommented lines are commented.
- Uncomment replaces `//` and at most one following space with spaces, retaining
  the code's current column. It cannot reconstruct original short indentation;
  Undo restores the exact previous buffer.
- Multiple/reversed/overlapping selections are preserved. A selection ending at
  column one excludes that final line; one command creates one undo unit.
- Fixed-only selections delegate to `editor.action.commentLine`. Existing language
  support supplies fixed-format behavior. Selections combining fixed lines with
  free lines or protected directives/data are refused atomically; select separately.
- The commenter protects directives, the initial `**FREE`, continued/unterminated
  literals, ambiguous tab indentation, and program data after column-one `**` or
  `/EOF`. Conditional branches are not evaluated. These are lexical safeguards,
  not complete syntax validation. Character offsets are not IBM i byte positions;
  unusual Unicode/DBCS and tab layouts are not validated.

Both features operate only on the open editor buffer, including `member:` URIs.
There is no URI scheme restriction, automatic save, IBM i command execution,
remote member fetching or direct source-file writing. The document provider and
VS Code remain responsible for saving. Use synthetic scratch source first.

## Manual installation and formatter selection

1. **Disable the old RPGLE-free commenter before enabling this extension** to
   prevent competing Ctrl+/ bindings. Its ID is `local-rpgle-tools.rpgle-free-commenter`.
2. After packaging, manually choose **Extensions: Install from VSIX** and select
   [dist/jons-rpgle-free-formatter-0.1.0.vsix](dist/jons-rpgle-free-formatter-0.1.0.vsix).
   Installation and enabling are never performed by setup/build tasks.
3. Open source in `rpgle` or `sqlrpgle` language mode. Use **Format Document With...**
   and choose **Jon's RPGLE-free formatter**. To make it the default, choose
   **Configure Default Formatter...** for each desired language.
4. For manual JSON configuration, set `editor.defaultFormatter` to
   `local-rpgle-tools.jons-rpgle-free-formatter` inside the `[rpgle]` and/or
   `[sqlrpgle]` language-specific settings. Format-on-save is optional: enable
   `editor.formatOnSave` yourself only after reviewing scratch-document results.
   **This project does not modify user/workspace settings or choose a default formatter.**

If another formatter wins, explicitly select this one with **Format Document With...**.
For Ctrl+/ priority, follow **Make Ctrl+/ use this commenter** above.
Disable the old commenter in the relevant profile
and Extension Development Host as well as the normal editor.

The publisher is a local identifier, not a claim of Marketplace registration.
The private project is `UNLICENSED`; no redistribution license is granted.

## Offline build, tests and packaging

No Node download, npm install or extension install is needed for this workstation.
The existing desktop VS Code installation at
`C:\Programs\VSCode_1.108.2\Code.exe` can run as Node with
`ELECTRON_RUN_AS_NODE=1`. The process-based tasks in [.vscode/tasks.json](.vscode/tasks.json)
use `${execPath}`, separate argument arrays and the workspace working directory,
so spaces and apostrophes in paths are not shell-quoted.

- **Build Jon's RPGLE-free formatter** runs [scripts/build.cjs](scripts/build.cjs)
  with `--vscode-executable` and `${execPath}`, using bundled TypeScript and API declarations.
- **Test Jon's RPGLE-free formatter** depends on Build and runs
  [scripts/test.cjs](scripts/test.cjs), loading all test suites.
- **Package Jon's RPGLE-free formatter** depends on Build and runs
  [scripts/package.cjs](scripts/package.cjs) with the same executable flag, resolving
  the local VS Code bundled `yazl`. The VSIX metadata comes from [package.json](package.json).
  Only the manifest, compiled JavaScript, README and changelog are included.

The offline fallback depends on internal desktop VS Code paths and checks against
the installed API declarations, rather than the pinned minimum API version.
Standard npm scripts and development dependencies are retained from the commenter:
`npm run compile`, `npm test`, and `npm run package`. They are alternatives for an
environment with those dependencies already available, not setup steps performed here.

Automated validation covers pure formatter rules, preservation/idempotence,
the retained commenter and mocked VS Code provider behaviour. Adapter tests mock
the formatter contract; dedicated engine tests validate indentation separately.
All source examples are synthetic. Compilation and local packaging do not establish
real Extension Development Host or IBM i member integration compatibility.

## Manual debugging and acceptance checks

After implementation and automated validation, manually press F5 and select
**Debug Jon's RPGLE-free formatter** in [.vscode/launch.json](.vscode/launch.json).
This builds before opening a separate Extension Development Host; nothing is
launched automatically. IBM i member testing requires the relevant language and
IBM i extensions and a user-managed connection in that host.

Use only synthetic source, never copied credentials or real sample payloads. Verify:

- Format Document for both language modes on fully-free scratch source; nonwhitespace,
  trailing text and line breaks remain unchanged, and repeated formatting is stable.
- Unsupported mixed-source formatting and ambiguous statements produce Output notices,
  not format-on-save dialogs; Ctrl+/ still handles mixed-source free lines.
- Undo/redo, multiple/reversed selections, read-only editors, fixed-only delegation,
  and refusal of combined fixed/free/protected selections.
- Explicit formatter selection, old commenter disabled, and Ctrl+/ conflict resolution.
- A user-launched IBM i scratch member before production use. Mocked tests do not
  establish real Extension Development Host or remote-provider compatibility.

## Declaration reference

Single-statement declaration handling was checked against IBM i 7.4
[Free-Form Definition Statement](https://www.ibm.com/docs/en/ssw_ibm_i_74/rzasd/freedatadef.htm)
and [Free-Form Data Structure Definition](https://www.ibm.com/docs/en/ssw_ibm_i_74/rzasd/freedatastructure.htm).
These document inline end declarations and the absence of `END-DS` for
`LIKEDS`/`LIKEREC` definitions; they do not establish full parser coverage.