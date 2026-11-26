# Jon's RPGLE-free formatter

Version 0.3.0 combines **fully-free RPGLE formatting** with the existing
indentation-aware **Ctrl+/** line commenter (**Cmd+/** on macOS).
Extension ID: `local-rpgle-tools.jons-rpgle-free-formatter`.
Language modes: `rpgle` and `sqlrpgle`; existing RPGLE language support is required.

## Selection formatting in 0.3.0

Use **Jon's RPGLE-free formatter: Format Selection or Document** from the Command
Palette. Nonempty selections restrict all edits to their exact characters;
without a selection, the command formats the document. Multiple selections are
supported. No formatting shortcut is overridden. Standard **Format Document**
still means the whole document; **Format Selection** uses the range provider.

Surrounding source supplies context only. Partial statements, unsafe syntax and
statements whose required edits extend outside the selection are skipped as a
whole, while other safe statements can format. Skipped selected text receives a
temporary yellow wavy underline with a hover explanation and a brief status-bar
summary. Markers follow formatting insertions and clear on the next user edit,
formatting attempt, document close, or after 12 seconds.

SQL formatting is not implemented yet. SQL is skipped rather than rewritten;
uncertain compound SQL protects the following source too. All 60 local regression
tests passed on 2026-10-26, including mocked selection and decoration integration.
Real Extension Development Host and IBM i integration remain untested.
Packaging does not install the extension or change editor settings.

## Recovered JavaScript baseline

The authoritative project is now the original O: project directory. Its
original 0.1.0 TypeScript project is preserved under [archive](archive) while
the active 0.3.0 implementation uses the JavaScript build/test scripts described
below. TypeScript reconciliation remains pending; do not build the archived
baseline over current releases. The H: recovery project is no longer maintained.

This project was recovered from the installed 0.1.0 extension. The JavaScript in
[out/comments.js](out/comments.js), [out/sourceFormat.js](out/sourceFormat.js),
and [out/extension.js](out/extension.js) is the recovered baseline, not a newly
reconstructed TypeScript project. The formatter provider now converts inserted
line breaks to the document's LF or CRLF convention; the commenter is unchanged.
Original source-map references remain in recovered files. The original TypeScript
project was subsequently located and is archived here; it does not yet include
the 0.2.0/0.3.0 implementation changes.

The 0.2.0 formatter changes and new regression tests are maintained in
[out/formatter.js](out/formatter.js) and [scripts/test.cjs](scripts/test.cjs).
The formatter, regression runner and dependency-free packaging script are now
included. The historical 0.2.0 syntax checks and 37 regression tests passed, including the exact
wrapped DATA-INTO layout discussed with the user. Real Extension Development
Host and IBM i integration have not been tested.

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

This makes the command take priority over extension defaults and earlier user
bindings when editing writable RPGLE or SQLRPGLE source. Leave unrelated shortcuts
unchanged.

## Version 0.2.0 formatting scope

- Format Document supports fully-free source whose first line is column-one
  `**FREE` (case-insensitive, blank remainder; BOM accepted).
- Mixed, fixed-format and column-limited source, including legacy `/FREE` blocks,
  are **unsupported by the formatter**. They are not converted to fully-free source.
  The commenter still supports column-limited free-form lines and fixed delegation.
- General structural multiline statements move their final semicolon onto a
  separate line aligned with the statement start. This is not limited to a
  particular declaration or operation. Existing statement wrapping is retained;
  the formatter is not a general line-length rewrapper.
- Wrapping within continued literals is preserved. Literal-content whitespace
  is protected, including significant leading and trailing spaces; only safe
  indentation outside literal content may change. Unsafe or ambiguous continued
  literals remain protected rather than being rewritten speculatively.
- Nested closing parentheses align with their matching opening expression, not
  indiscriminately with the outer statement start.
- Keyword case, expression tokens, comments and string content are not rewritten.
  Moving a final semicolon can insert a line break; the provider uses the open
  document's EOL convention, including remote documents using CRLF or LF.
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

The recovered formatter's conservative scope excludes compiler directives that
could affect structure (including `/COPY` and conditional directives), embedded
SQL, tab indentation, multiple statements on one line, unmatched parentheses or
blocks, and unfinished statements. It does not fetch copy members or evaluate
conditional branches. Column-one `**` data markers and `/EOF` protect the remaining
document. These safeguards are not syntax validation.

In particular, a line after an incomplete statement can look like either another
statement or a continuation. The **+1 versus +3 continuation indentation heuristic**
is a style/classification choice, not proof of RPG semantics. The policy uses
**+1** for continued `if`, `elseif`, `for`, `dow`, `dou`, `when` and `snd-msg`
statements. Other statements, including declarations, calls and assignment
readability wraps, use **+3**. These offsets refer to the statement's first line,
not its previous continuation; nested parenthesis alignment uses the opening
expression. The formatter cannot always infer intent or reproduce a human's
preferred layout.

Top-level active code uses three spaces; nested blocks add three spaces.
Ordinary full-line comments preceding statements start one column left of that
statement. Triple-slash banners/separators, comments inside wrapped statements,
and recognisable semicolon-terminated commented-out code retain their existing
indentation. Banner insertion, section reordering, keyword casing and range
formatting are outside this release's scope.

## Retained commenting behavior

Command: `rpgleFreeFormatter.toggle` (**Jon's RPGLE-free formatter: Toggle Line
Comment**).
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
  [dist/jons-rpgle-free-formatter-0.3.0.vsix](dist/jons-rpgle-free-formatter-0.3.0.vsix).
   Installation and enabling are not part of recovery or syntax checking.
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
Disable the old commenter in the relevant profile and Extension Development Host
as well as the normal editor.

The publisher is a local identifier, not a claim of Marketplace registration.
The private project is `UNLICENSED`; no redistribution license is granted.

## Syntax checking, tests and packaging

This recovered baseline uses JavaScript directly. There is no TypeScript
compilation step or dependency on TypeScript, VS Code API declaration packages,
or `yazl`. No missing original build tasks or debug configuration are required.
The scripts in [package.json](package.json) are:

- `npm run compile`: runs [scripts/check.cjs](scripts/check.cjs), invoking
  `node --check` on every JavaScript file directly in the output directory.
  This checks syntax only; it does not build files or resolve runtime imports.
- `npm test`: runs [scripts/test.cjs](scripts/test.cjs), the new regression-test
  runner supplied by the separate implementation handoff.
- `npm run package`: checks JavaScript syntax and builds the private VSIX using
  the dependency-free ZIP writer in [scripts/check.cjs](scripts/check.cjs).

The 60 passing regression tests exercise selection boundaries, atomic skips,
skip-marker remapping and clearing, as well as general multiline semicolon placement,
continued-literal wrapping and significant whitespace, nested closing-parenthesis
alignment, repeat-format stability, retained commenting, and mocked provider
LF/CRLF mapping and cancellation. The release archive is separately checked for
matching contents, valid XML and package identity. Installation is a separate manual step. Local
checks cannot establish real Extension Development Host or IBM i member
integration compatibility.

## Manual acceptance checks

Use only synthetic source, never copied credentials or real sample payloads. Verify:

- Format Document for both language modes on fully-free scratch source; multiline
  statements place final semicolons on aligned separate lines, nested closing
  parentheses align correctly, and repeated formatting is stable.
- Continued literals retain their wrapping and significant whitespace; unsafe
  literal layouts remain protected.
- LF and CRLF documents retain their EOL convention when formatting inserts lines.
- Unsupported mixed-source formatting and ambiguous statements produce Output notices,
  not format-on-save dialogs; Ctrl+/ still handles mixed-source free lines.
- Undo/redo, multiple/reversed selections, read-only editors, fixed-only delegation,
  and refusal of combined fixed/free/protected selections.
- Explicit formatter selection, old commenter disabled, and Ctrl+/ conflict resolution.
- A user-launched IBM i scratch member before production use. Mocked tests do not
  establish real Extension Development Host or remote-provider compatibility.