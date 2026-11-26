# Mixed/column-limited formatting checkpoint — 2026-11-02

## Implementation

Authoritative JavaScript only; archived TypeScript was inspected as neither build
input nor edit target. Version and manifest assertion advanced to 0.4.2.

- Project recognized executable fields (columns 8–80) onto the existing fully-free
  statement planner and RPG/SQL layout engines. Map atomic statement units back
  into original coordinates; no duplicated indentation or SQL rules.
- Both `formatSource` and `planFormatting` accept mixed/column-limited input.
  Existing fully-free `formatSource` retains its historical RPG-only refusal
  policy; fully-free and column-limited `planFormatting` support embedded SQL.
- Preserve fixed records and existing columns 1–7 exactly. Inserted records use
  seven blank prefix columns. Exclude column-81 overflow from lexical input and
  preserve it at the same offset on its original record.
- Bound generated fields to 73 characters. Reject oversized statements and
  attached comment edits together; only safe excess RPG padding outside quoted
  content/comments can be consumed. No general line-length rewrapping.
- Fixed records and optional `/FREE`/`/END-FREE` delimiters are opaque statement
  boundaries, retaining visible free block context without inferring fixed
  control structure. Interrupted control or unfinished SQL quarantines uncertain
  suffixes. The SQL lexer distinguishes real delimiters from literal/comment text.
- Keep full selected-line semantics, outside context, atomic partial-statement
  protection, translated skips and idempotence. Existing extension edit/EOL,
  command, undo and marker handling works unchanged.
- The commenter retains its original literal safeguards; formatting explicitly
  delegates literal scanning to its statement engines instead.

## Validation

Bundled runtime: C:/Programs/VSCode_1.108.2/Code.exe with
ELECTRON_RUN_AS_NODE=1; each invocation piped through Out-Host to wait. The prior
environment value was restored in finally blocks.

- Complete regression suite: **145 passed, exit 0** (122 existing + 23 new).
- Existing runtime syntax-check script: **exit 0**, checking all five output modules.
- Both build/test scripts checked separately with --check: **exit 0** each.
- Editor diagnostics for modified runtime/test/manifest files: no errors reported.
- New regressions cover shifted-rule parity, fixed bytes and source prefixes,
  legacy/mixed blocks, literals, comments, whole/selected source, reversed and
  prefix-only selections, disjoint/partial statement skips, SQL layouts and
  metadata safeguards, exact column-80 limits, column-81 preservation, unsafe
  terminators, repeat-format stability, and mocked LF/CRLF byte offsets, command
  undo transactions and remapped skipped ranges.

Initial test runs exposed oversized input fixtures, then padded-field/no-op
mapping issues; these were corrected before the successful full validation above.

## Package verification

Existing packaging script with --package: **exit 0**. Independent .NET ZIP reading
verified all 10 expected entries, every packaged payload byte against current
authoritative files, both XML documents, publisher/name/version 0.4.2, SQL module
inclusion and selection/document command registration. No archive or unrelated
distribution artifacts were rebuilt.

Artifact: [dist/jons-rpgle-free-formatter-0.4.2.vsix](../dist/jons-rpgle-free-formatter-0.4.2.vsix).

SHA256: 82307DC9149E77357177BB2C659C35BAEF0B7F6B70DDE396120DB8E28FE4E3F4

Changed files: active formatter, source classifier and SQL scanner; regression
suite; manifest; README; CHANGELOG; this checkpoint; new 0.4.2 VSIX. The extension
provider/command and commenter modules required no changes. Existing historical
checkpoints and archived TypeScript remain unchanged.

## Deliberate limits and untouched resources

Fixed control flow and include-member contents remain opaque. SQL record-count
changes with nonblank source prefixes or overflow bytes skip atomically; stable
record counts preserve each prefix and suffix. Unknown directives, data, tabs,
malformed structures and unfinished statements retain conservative safeguards.
Columns are JavaScript character offsets, not IBM i byte/DBCS validation.

No archived source, remote member, user/workspace settings, installed extension,
or unrelated project was modified. No automatic save, member conversion or
installation was performed. Real Extension Development Host and IBM i integration
remain untested; acceptance testing must use user-controlled scratch source.
