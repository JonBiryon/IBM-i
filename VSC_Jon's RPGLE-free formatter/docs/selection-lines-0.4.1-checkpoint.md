# Selected-line formatting checkpoint — 2026-10-28

## Current checkpoint (supersedes historical blocker below)

The parent recovered direct bundled-runtime invocation with captured output.
All 122 regression tests passed, exit 0. Runtime JavaScript syntax checks via
scripts/check.cjs passed, exit 0. ELECTRON_RUN_AS_NODE was restored afterward.
Three obsolete test assertions were corrected: safe formatting without skips
need not make a decoration call; nonempty warning decorations are still rejected.
README and changelog now report observed results rather than the old blocker.

Packaging and verification completed: scripts/check.cjs --package exited 0;
both scripts/*.cjs syntax checks passed as well as all runtime JavaScript checks.
Independent .NET ZIP reading confirmed 10 entries, all packaged payload bytes
matching authoritative O: files, both XML documents parsing, correct 0.4.1
publisher/name/version, SQL engine inclusion and selection command registration.

Artifact: [dist/jons-rpgle-free-formatter-0.4.1.vsix](../dist/jons-rpgle-free-formatter-0.4.1.vsix).
SHA256: E1690C966F33100E0DECB0529E283C7D7482192BCA8FEF953842E5EA90FE0AB1

H: recovery-project Test-Path returned False; no formatter-named directory was
found directly under H:/Projects. Project remains under the authoritative O:
root. No installation, settings changes or remote-member modification occurred.
Real Extension Development Host and IBM i integration remain untested.

All authorized implementation, verification and packaging stages are complete.
Next optional stage: user-authorized installation and synthetic editor acceptance
testing; do not install automatically or use production remote members for tests.

## Historical implementation checkpoint

## Scope and implementation

Current user authorization supersedes historical exact-character selection scope.
Only the authoritative O: project was edited. No H: project copy, terminal code
writes, remote-member edits, packaging, installation or settings changes.

- Read the H: operational memo and relevant language rules; inspected active
  formatter, extension provider/command, test harness, manifest and release docs
  using read-only PowerShell Get-Content.
- Updated out/formatter.js: order endpoints, discard empty selections, expand
  each nonempty selection to full selected lines, exclude a later column-zero
  endpoint line, and merge overlapping or adjacent scopes without bridging gaps.
- Existing extension provider/command already delegate to planFormatting;
  out/extension.js is unchanged. No-selection command behavior remains document
  formatting. Partial RPG and SQL statements still skip atomically.
- Updated scripts/test.cjs expectations and line-set containment assertions for
  edits/markers. Eight added regressions bring the defined suite from 114 to 122.
  Fixtures are synthetic, not copied from the active IBM i member.
- Bumped package.json and its assertion to 0.4.1; updated README and CHANGELOG.
  Archived TypeScript and existing distribution artifacts were not touched.

## Validation blocker

Attempted the complete suite followed by syntax checks for every active out/*.js
and scripts/*.cjs file, using C:\Programs\VSCode\Code.exe with
ELECTRON_RUN_AS_NODE=1 and piped JavaScript stdin, not -e. The wrapper was intended
to capture child stdout/stderr and exit statuses. The terminal returned no
captured test/check output and VALIDATION_EXIT was blank. Environment restoration
reported ELECTRON_ENV_RESTORED=True. This is not a successful runtime result.
No retry was attempted after the tooling failure, per the current stop rule.

The previously reported baseline is 114 passing tests for 0.4.0; it was not rerun
before modification. For 0.4.1, 122 tests are defined, but no executed/pass count
or syntax-check success is established. Real Extension Development Host and
IBM i integration remain untested. Do not package this implementation yet.

## Changed files

- out/formatter.js
- scripts/test.cjs
- package.json
- README.md
- CHANGELOG.md
- docs/selection-lines-0.4.1-checkpoint.md (this file)

## Exactly one next stage

Recover a usable bundled Code.exe invocation and complete full-suite/syntax
validation, resolving actual failures without weakening unrelated coverage.
Parent packaging follows only after that stage succeeds; no installation or
remote-member work is authorized.