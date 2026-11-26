# Changelog

## 0.4.3

- Make Ctrl+/ a line-based text toggle, independent of source classification.
  Uncomment when all selected lines are commented; otherwise add prefixes only
  to uncommented lines. Keep indentation-aware prefix placement and selection,
  cursor, trailing-text and undo behavior.
- Remove comment-only literal/directive/data/layout/width refusals and fixed-format
  delegation. Formatting safeguards and layout engines are unchanged.
- Replace obsolete refusal assertions and add exact continued-literal, partial
  selection, blank, malformed/directive/data/fixed-looking, width and editor-command
  regression coverage (149 tests total). Formatting behavior is unchanged.
- Release validation and artifact verification are recorded in the
  [0.4.3 checkpoint](docs/line-comment-toggle-0.4.3-checkpoint.md).
  Installation remains a separate manual step; no real editor/IBM i acceptance
  test is claimed.

## 0.4.2

- Format recognized mixed/column-limited free lines with the exact fully-free
  RPG and embedded SQL layout engines, shifted seven columns. Both public
  formatting functions, document/range providers and the custom command use
  field projection rather than a duplicated ruleset. No source conversion.
- Preserve fixed records, columns 1–7 and column-81 overflow bytes. Bound every
  generated free field to columns 8–80; skip an oversized statement atomically,
  including attached comment edits. Consume only safe excess RPG field padding
  outside literals/comments. New records have seven blank prefix columns.
- Keep visible free block context across fixed records and optional legacy
  `/FREE`/`/END-FREE` boundaries without interpreting fixed control flow. Protect
  interrupted statements and uncertain control/SQL suffixes. SQL's lexer ignores
  delimiter-looking text inside literals/comments, but stops at real boundaries.
- Preserve selection scope, original-coordinate edits and skip feedback. SQL
  record-count changes with nonblank prefixes or overflow skip rather than lose
  metadata; stable-count SQL retains each record's prefix and suffix.
- Add 23 regressions (145 total) for shifted-rule parity, mixed records, selections,
  SQL, width/overflow, atomic protection, idempotence and mocked LF/CRLF editing.
  Release validation and artifact verification are recorded in the
  [0.4.2 checkpoint](docs/mixed-format-0.4.2-checkpoint.md).
- Bump manifest and manifest assertion to 0.4.2. Active JavaScript only; archived
  TypeScript, remote members, user settings and extension installation unchanged.
  Real Extension Development Host and IBM i integration remain untested.

## 0.4.1

- Normalize nonempty selections in `planFormatting` to all selected lines,
  from character zero through the last selected line's full text. A later
  column-zero endpoint excludes that line, including reversed selections.
  Merge overlapping/duplicate/adjacent selected lines without bridging gaps.
- Standard range providers and the custom command share this normalization;
  no extension wiring change was needed. No-selection custom commands still
  format the whole document; explicit empty provider ranges remain empty.
- Include indentation and trailing comments even when omitted from the original
  character highlight. Mid-line complete SQL and RPG statements can format.
  Statements spanning selected/unselected lines remain atomic skips; never
  extend scope to finish them. Yellow markers stay within selected lines and
  continue to remap after formatting insertions.
- Update character-exact tests and add eight regressions: all 122 tests passed,
  exit 0, using the bundled VS Code runtime. Runtime JavaScript syntax checks
  passed, exit 0. Successful formatting need not publish empty skip decorations;
  three assertions now accept no decoration call while rejecting nonempty markers.
  See the [checkpoint](docs/selection-lines-0.4.1-checkpoint.md).
- Bump the manifest and manifest assertion to 0.4.1. No installation, settings,
  H: project copy, archive source or remote member changes. Real editor/IBM i
  integration remains untested.

## 0.4.0 (historical; original documentation checkpoint)

- Preserve `/COPY` and `/INCLUDE` verbatim in both formatting paths without
  stopping subsequent local formatting. Keep visible block and selection context;
  do not fetch or expand included source or infer its hidden structure.
- Leave ordinary unfinished statements interrupted by these directives unchanged
  without swallowing later code. Interrupted control syntax remains conservative:
  the planner protects uncertain suffixes and the whole-source engine refuses.
  Conditional/unknown directives, `/EOF` and program-data barriers are unchanged.
- Include fully-free empty/whitespace lines in Ctrl+/ toggling and mixed
  blank/code selections. Keep column-limited and continued-literal blank safeguards;
  uncomment still replaces prefixes with spaces rather than restoring short indentation.
- Add strict embedded SQL layout through public `planFormatting` and extension
  multiline edit ranges: `select`, `insert`, `update`, `delete`, `values`, `set`,
  `prepare`, `declare cursor`, `open`, `fetch`, `close`, supported `begin` compound
  blocks and `case` expressions. This is a bounded lexical engine, not a full
  Db2 parser or a guarantee of every statement variant.
- Lowercase recognized SQL keywords and uppercase unquoted identifiers; preserve
  host-variable spelling, quoted identifiers, literal contents and comment text.
  Dynamic SQL inside literals is not inspected or reformatted.
- Skip unsupported `create`, `merge`, `call`, non-cursor declarations and
  procedural `if`, `loop`, `while`, `repeat` structures, plus other unsafe layouts.
  Complete unsupported SQL can leave subsequent safe RPG eligible; incomplete SQL
  or uncertain compound boundaries protect the remaining suffix.
- Keep SQL replacements atomic and within selections, including required full
  lines, indentation and trailing comments. Unsupported/partial selected portions
  receive yellow skipped-range feedback; token/comment checks guard preservation.
- The parent independently ran the full [scripts/test.cjs](scripts/test.cjs) suite
  on 2026-10-26: all 114 local tests passed, exit 0. Coverage includes mocked
  editor/provider integration, not real Extension Development Host or IBM i tests.
- Active package version is 0.4.0. Runtime syntax checks, packaging and archive
  verification remain pending with the parent at this documentation checkpoint;
  no installation or real integration validation is claimed. Archived TypeScript
  is stale reference material, not active build source.

## 0.3.0 (historical)

- Add Format Selection or Document and single/multiple selection providers.
  The custom command uses selections when present, otherwise the whole document;
  the standard Format Document action remains explicitly whole-document.
- Read outside text for context without editing it. Skip incomplete or unsafe
  statements and commit each safe statement's formatting as one bounded unit.
- Underline skipped selected text in yellow with hover explanations and a brief
  status summary. Remap markers after formatting inserts lines; clear on the
  next user edit, formatting attempt, document close, or after 12 seconds.
- Keep commenting unchanged. SQL formatting is still pending: SQL is skipped;
  uncertain compound-SQL boundaries protect the following source as well.
- Add regression cases for atomic skips, reversed ranges and marker remapping
  with LF/CRLF. All 60 local regression tests passed on 2026-10-26; real editor
  and IBM i integration remain untested.

## 0.2.0 (historical)

- Recover the installed 0.1.0 JavaScript baseline as a maintainable JavaScript
  project; original TypeScript sources and source maps were not recovered.
- Move the final semicolon of general structural multiline statements to a
  separate line aligned with the statement start.
- Preserve wrapping within continued literals and protect significant literal
  whitespace; leave unsafe or ambiguous literal layouts protected.
- Align nested closing parentheses with their matching opening expression.
- Preserve the document's LF/CRLF convention when the formatting provider inserts
  new lines. Leave the commenting implementation unchanged.
- Replace references to unavailable TypeScript/build infrastructure with a
  dependency-free JavaScript syntax checker and explicit test/JavaScript
  packaging entry points; remove installed-extension metadata and dependencies.
- Add 37 regression tests for multiline semicolons, continued literals,
  nested parentheses, idempotence, commenting, provider EOL behavior and cancellation.
  Include the user's wrapped DATA-INTO example: code following the continued
  literal does not trigger a structural split.
- Add a dependency-free VSIX packager; separately verify archive contents,
  XML and package identity before release.
  Real Extension Development Host and IBM i integration remain untested.

## 0.1.0 (historical installed baseline)

- Introduce Jon's RPGLE-free formatter with fully-free indentation-only provider
  integration.
- Retain the existing free-form commenter and fixed-format delegation; rename the
  command to `rpgleFreeFormatter.toggle`.
- Add output-only formatting notices and cancellation handling.
- The original release notes referred to build/test/package tasks, debug
  configuration and mocked tests. Those development assets were not present in
  the recovered installed package; the historical notes are not verification of
  this recovered project.