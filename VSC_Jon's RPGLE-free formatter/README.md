# Jon's RPGLE-free formatter

Version 0.4.3 combines **fully-free and mixed/column-limited RPGLE and strict embedded SQL formatting** with the
indentation-aware **Ctrl+/** line commenter (**Cmd+/** on macOS).
Extension ID: `local-rpgle-tools.jons-rpgle-free-formatter`.
Language modes: `rpgle` and `sqlrpgle`; existing RPGLE language support is required.

## Mixed/column-limited formatting in 0.4.2

Recognized free lines with blank columns 6–7 use **exactly the fully-free layout
rules**, projected onto columns 8–80: top-level code starts in column 11 rather
than column 4. `/FREE` delimiters are optional. Both `formatSource` and
`planFormatting` support this projection, including the planner's embedded SQL
engine. Fixed records stay byte-for-byte unchanged; no source-format conversion
or `**FREE` insertion occurs. Columns 1–7 on existing edited records and text
beyond column 80 are preserved; generated records have seven blank prefix columns.

Whole-document and selected-line formatting share the same engine and atomic
statement safeguards. Fixed records and `/FREE`/`/END-FREE` delimiters separate
statements without erasing visible free block context. Fixed control flow is
opaque, not parsed or inferred. An interrupted ordinary statement stays unchanged;
interrupted control syntax or incomplete SQL protects uncertain following context.
SQL's lexer protects delimiter-looking text inside literals and block comments.

Any required layout exceeding column 80 skips the entire statement, including
its attached comment edits. Safe excess RPG field padding can be consumed outside
literals/comments, while overflow bytes remain anchored at column 81. SQL reflow
that changes record count is skipped if an original record has a nonblank source
prefix or overflow bytes, rather than relocating/discarding that metadata. SQL
with stable record count preserves each original prefix and overflow suffix.
Malformed layouts, tabs, directives and program data retain conservative protection.
These are character-column checks, not IBM i byte/DBCS validation.

## Selection formatting in 0.4.1

Use **Jon's RPGLE-free formatter: Format Selection or Document** from the Command
Palette. Each nonempty selection formats **all selected lines**, not just the
highlighted characters: scope starts at character zero of its first line and
ends after the full text of its last line, including indentation and trailing
comments. An endpoint at character zero of a later line excludes that later
line. Reversed selections follow the same rule. Overlapping, duplicate and
adjacent selected-line ranges combine; disjoint ranges never bridge unselected
lines. Without a nonempty selection, the custom command formats the document.
No formatting shortcut is overridden. Standard **Format Document** still means
the whole document; **Format Selection** uses the same planner via the range
provider. Explicit empty provider ranges do not request document formatting.

Unselected lines supply context only. Statements spanning selected and unselected
lines, unsafe syntax and statements whose required edits extend outside selected
lines are skipped atomically; scope never expands to finish a statement. Other
safe statements can format. Skipped portions within selected lines receive a
temporary yellow wavy underline with a hover explanation and a brief status-bar
summary. Markers follow formatting insertions and clear on the next user edit,
formatting attempt, document close, or after 12 seconds.

Embedded SQL formatting is integrated into the public `planFormatting` path and
the extension's multiline edit ranges. Each SQL statement is one indivisible
replacement: all affected lines must be selected or the statement is skipped.
A mid-line selection covering all SQL statement lines includes their indentation
and trailing comments, even when those characters were not highlighted. The
same selected-line rule applies to RPG indentation and semicolon layout.

### Included in 0.4.0

- `/COPY` and `/INCLUDE` pass through unchanged in both `formatSource` and
  `planFormatting`. Code after them can format, including inside visible nested
  blocks and selections that read their surrounding context without editing it.
  Directive spelling, indentation, arguments, comments and trailing whitespace
  are preserved. Include targets are opaque: no remote lookup, expansion or
  inference of structure hidden in included source is performed.
- An unfinished ordinary statement interrupted by either directive is left
  unchanged, rather than merged with the following code. Visible control syntax
  interrupted this way makes subsequent context uncertain: the planner protects
  that suffix, while the whole-source layout engine refuses the document.
  Conditional and unknown directives still protect the suffix in the planner
  and cause whole-source refusal; `/EOF` and program data remain barriers.
- Ctrl+/ now includes empty and whitespace-only fully-free lines in its shared
  comment/uncomment decision, including mixed blank/code selections. Uncomment
  replaces the prefix with spaces, not the original short indentation; Undo is
  required for exact restoration. The 0.4.3 line-based correction below
  supersedes the original blank-line and literal commenting safeguards.

### Strict embedded SQL scope

The bounded lexical SQL engine supports `select`, `insert`, `update`, `delete`,
`values`, `set`, `prepare`, `declare cursor`, `open`, `fetch` and `close`, plus
supported statements inside `begin` compound blocks and `case` expressions.
It lays out clauses, lists, joins, conditions and nested queries; it is not a
complete Db2 grammar validator and does not promise every variant of these forms.
Recognized SQL keywords become lowercase and unquoted identifiers uppercase.
Host-variable spelling, quoted identifiers, literal contents and comment text
are preserved; comment placement and surrounding whitespace may change safely.
Dynamic SQL inside string literals is not inspected or reformatted.

Unsupported operations such as `create`, `merge` and `call`, non-cursor
declarations, and procedural `if`, `loop`, `while` and `repeat` structures are
skipped, not partially rewritten. Other unsupported or unsafe layouts also skip
with the yellow underline and explanation described above. A complete unsupported
SQL statement can leave later safe RPG statements eligible; unfinished SQL or
uncertain compound boundaries protect the remaining suffix. Token/comment
preservation checks reject layouts that would change protected content.

**Validation:** see the [0.4.3 checkpoint](docs/line-comment-toggle-0.4.3-checkpoint.md)
for current test, syntax-check and package results. Formatting is unchanged from
the [0.4.2 checkpoint](docs/mixed-format-0.4.2-checkpoint.md). The historical 0.4.1 release
passed 122 tests; its eight additional regressions cover selected-line behavior.
See also the [selection checkpoint](docs/selection-lines-0.4.1-checkpoint.md).
No installation is claimed. Mocked tests do not establish real Extension
Development Host or IBM i integration.

## Recovered JavaScript baseline

The authoritative project is now the original O: project directory. Its
original 0.1.0 TypeScript project is preserved under [archive](archive) while
the active 0.4.3 implementation uses the JavaScript build/test scripts described
below. TypeScript reconciliation remains pending; do not build the archived
baseline over current releases. The H: recovery project is no longer maintained.

This project was recovered from the installed 0.1.0 extension. The JavaScript in
[out/comments.js](out/comments.js), [out/sourceFormat.js](out/sourceFormat.js),
and [out/extension.js](out/extension.js) originated in the recovered baseline and
has since been updated; this is not a newly reconstructed TypeScript project.
The formatter provider now converts inserted
line breaks to the document's LF or CRLF convention. The current commenter also
includes fully-free blank lines as described above.
Original source-map references remain in recovered files. The original TypeScript
project was subsequently located and is archived here; it does not yet include
the current 0.2.0 through 0.4.3 implementation changes. Archived TypeScript is
stale reference material, not the active build source.

Current formatting and regression tests are maintained in
[out/formatter.js](out/formatter.js), [out/sqlFormatter.js](out/sqlFormatter.js)
and [scripts/test.cjs](scripts/test.cjs).
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

## Current RPGLE formatting scope

- Format Document supports fully-free source whose first line is column-one
  `**FREE` (case-insensitive, blank remainder; BOM accepted), plus recognized
  free lines in mixed/column-limited source, including legacy `/FREE` blocks.
- Mixed-source formatting shifts the same rules by seven columns as described
  above; fixed records are preserved, not converted. Fixed-only source is unchanged.
  Comment toggling is a separate text operation, as described below.
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
- RPGLE keyword case, expression tokens, comments and string content are not rewritten.
  Embedded SQL has the separate casing and layout rules described above.
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

The RPGLE formatter's conservative scope excludes conditional/unknown compiler
directives, tab indentation, multiple RPG statements on one line,
unmatched parentheses or blocks, and unfinished statements. Embedded SQL uses
the separate bounded engine through `planFormatting`; the older fully-free
`formatSource` layout engine still refuses embedded SQL. For column-limited
input both public functions use the shared planner, including SQL. `/COPY` and
`/INCLUDE` are preserved pass-through boundaries, not interpreted structure.
It does not fetch copy members or evaluate conditional branches. Column-one `**`
data markers and `/EOF` protect the remaining document. The planner can still
format safe portions; the older whole-source layout engine otherwise refuses
unsupported documents atomically. These safeguards are not syntax validation.

In particular, a line after an incomplete statement can look like either another
statement or a continuation. The **+1 versus +3 continuation indentation heuristic**
is a style/classification choice, not proof of RPG semantics. The policy uses
**+1** for continued `if`, `elseif`, `for`, `dow`, `dou`, `when` and `snd-msg`
statements. Other statements, including declarations, calls and assignment
readability wraps, use **+3**. These offsets refer to the statement's first line,
not its previous continuation; nested parenthesis alignment uses the opening
expression. The formatter cannot always infer intent or reproduce a human's
preferred layout.

Top-level active code uses three spaces within the free field; nested blocks add three spaces.
Ordinary full-line comments preceding statements start one column left of that
statement. Triple-slash banners/separators, comments inside wrapped statements,
and recognisable semicolon-terminated commented-out code retain their existing
indentation. Banner insertion, section reordering and RPGLE keyword casing are
outside the current scope. Safe selection/range formatting is supported as
described above; SQL layout follows its separate rules.

## Commenting behavior in 0.4.3

Command: `rpgleFreeFormatter.toggle` (**Jon's RPGLE-free formatter: Toggle Line
Comment**).
Other language modes and Ctrl+K chords are unchanged.

| Usable indentation | Shift when adding `// ` |
| --- | --- |
| 0 spaces | 3 columns |
| 1 space | 2 columns |
| 2 spaces | 1 column |
| 3 or more spaces | None |

- The selection alone determines which physical lines participate, including
  empty and whitespace-only lines. With no selection, the cursor line participates.
  If every selected line starts with `//` after its leading spaces, uncomment
  them; otherwise comment only the uncommented lines, leaving existing comments alone.
- Commenting does not use source classification or inspect syntax. Quotes,
  continuations, partial or malformed statements, directives (including `**FREE`),
  data and fixed-looking records are treated as text. No lines are skipped for
  source layout or line length, and no fixed-format command is delegated to.
  This is a `//` prefix operation, not a fixed-format comment conversion.
- Prefix placement consumes up to three leading spaces, as in the table above.
  Tabs and all other original text are retained verbatim; tabs are not expanded
  or counted as spaces. No trailing text is trimmed or truncated.
- Uncomment replaces `//` and at most one following space with spaces, retaining
  the code's current column. It cannot reconstruct original short indentation;
  Undo restores the exact previous buffer.
- Multiple/reversed/overlapping selections are preserved. A selection ending at
  column one excludes that final line; one command creates one undo unit.
- Formatting's lexical safeguards remain unchanged and do not apply to commenting.

Both features operate only on the open editor buffer, including `member:` URIs.
There is no URI scheme restriction, automatic save, IBM i command execution,
remote member fetching or direct source-file writing. The document provider and
VS Code remain responsible for saving. Use synthetic scratch source first.

## Manual installation and formatter selection

1. **Disable the old RPGLE-free commenter before enabling this extension** to
   prevent competing Ctrl+/ bindings. Its ID is `local-rpgle-tools.rpgle-free-commenter`.
2. Manually choose **Extensions: Install from VSIX** and select
    [dist/jons-rpgle-free-formatter-0.4.3.vsix](dist/jons-rpgle-free-formatter-0.4.3.vsix).
   Existing 0.4.2 packages do not contain the line-based commenting correction;
   packages before 0.4.2 also lack mixed-source formatting.
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
- `npm test`: runs the local regression suite in [scripts/test.cjs](scripts/test.cjs).
- `npm run package`: checks JavaScript syntax and builds the private VSIX using
  the dependency-free ZIP writer in [scripts/check.cjs](scripts/check.cjs).

The regression suite exercises selected-line boundaries, atomic skips,
skip-marker remapping and clearing, as well as general multiline semicolon placement,
continued-literal wrapping and significant whitespace, nested closing-parenthesis
alignment, repeat-format stability, retained commenting, and mocked provider
LF/CRLF mapping and cancellation. New coverage includes empty/whitespace Ctrl+/
command toggles, mixed blank/code selections, syntax-independent commenting,
COPY/INCLUDE bytes, nested and selected context, interrupted ordinary
and control statements, and unchanged conditional/unknown-directive barriers.
SQL coverage includes supported layouts, protected spelling/content, unsupported
operations and procedural structures, safe selections and mocked multiline
provider edits. Eight 0.4.1 cases add exclusive column-zero/reversed endpoints,
adjacent/disjoint selected lines, explicit empty ranges, outside comment
protection, mid-line multiline SQL, shared command scope for LF/CRLF, and
bounded yellow SQL markers. Existing tests now expect full selected lines,
while partial multiline RPG/SQL statements still skip atomically. The suite
passed all 122 tests for 0.4.1. Version 0.4.2 adds 23 regressions for shared-rule
column projection, preserved fixed records/prefixes/overflow, legacy boundaries,
whole and selected RPG/SQL, width/atomic safeguards, idempotence, delimiter-looking
SQL content and physical LF/CRLF provider offsets. Version 0.4.3 replaces obsolete
comment-refusal assertions and adds four regressions for the reported continued
literal, syntax-independent toggling, selected-line edge cases and mocked Ctrl+/
round-trips. Current validation is recorded in the
[release checkpoint](docs/line-comment-toggle-0.4.3-checkpoint.md).
Installation is a separate
manual step and has not been performed here. Local mocked checks cannot establish
real Extension Development Host or IBM i member integration compatibility.

## Manual acceptance checks

Use only synthetic source, never copied credentials or real sample payloads. Verify:

- Format Document for both language modes on fully-free scratch source; multiline
  statements place final semicolons on aligned separate lines, nested closing
  parentheses align correctly, and repeated formatting is stable.
- Continued literals retain their wrapping and significant whitespace; unsafe
  literal layouts remain protected.
- Supported embedded SQL formats with lowercase keywords and uppercase unquoted
  identifiers while host spelling, quotes, literal contents and comments survive.
  Dynamic SQL literal contents remain unchanged. Unsupported SQL is skipped with
  yellow feedback; SQL spanning selected/unselected lines skips without editing
  any part of the statement. Mid-line selections include full selected lines;
  a later column-zero endpoint excludes that line in either selection direction.
- `/COPY` and `/INCLUDE` remain byte-preserved and later visible code formats;
  hidden include context is not expanded. Conditional/unknown directives and
  interrupted control syntax retain their conservative suffix safeguards.
- LF and CRLF documents retain their EOL convention when formatting inserts lines.
- Mixed free lines follow the same rules shifted seven columns; fixed records,
  source prefixes and overflow bytes stay unchanged. Oversized or ambiguous
  statements produce Output notices, not format-on-save dialogs. Test whole and
  selected legacy blocks, SQL, repeated formatting and overflow guards.
- Undo/redo, multiple/reversed selections and read-only editors. Ctrl+/ treats
  continued literals, incomplete syntax, directives, blanks, data, long lines
  and fixed-looking records as text, without refusals or fixed-format delegation.
- Explicit formatter selection, old commenter disabled, and Ctrl+/ conflict resolution.
- A user-launched IBM i scratch member before production use. Mocked tests do not
  establish real Extension Development Host or remote-provider compatibility.