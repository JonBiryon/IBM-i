# Line-based comment toggle checkpoint — 2026-11-03

## Requirement and implementation

User explicitly requested commenting as a selected-line text operation, not
parsing or syntax protection. `out/comments.js` no longer imports/calls the
source classifier. All unique selected in-range physical lines participate.
If all have a `//` prefix after leading spaces, remove those prefixes; otherwise
add prefixes only to uncommented lines. Preserve the existing use of up to
three indentation spaces, prefix-to-spaces uncommenting, trailing text and
selection endpoint behavior. Tabs are retained as text, not expanded.

`out/extension.js` no longer delegates fixed-looking selections to another
comment command. Existing edit/version checks, selection remapping and undo
transactions remain unchanged. The planner retains its result shape for
compatibility (`delegate: false`, empty `notices`).

No quote, continuation, directive, data, blank, source-layout or width refusal
applies to commenting. This deliberately does not validate whether resulting
source compiles or implement fixed-format comment conversion. The formatter
and its classifier/layout engines were not modified.

## Validation

- Complete regression suite: **149 tests passed, exit 0** (145 previously).
- Runtime syntax-check script: **exit 0** for all output JavaScript modules.
- Test runner syntax check: **exit 0**.
- Editor diagnostics: no errors in changed commenter, extension or tests.
- Coverage includes exact reported literal lines together and individually,
  partial spans, surrounding unterminated quotes, mixed existing comments,
  blanks regardless of context, directives, data, fixed-looking text, long
  lines, deduplicated/out-of-range selections and unchanged trailing text.
- Mocked actual Ctrl+/ command tests verify exact round-trip, selected-line
  endpoints, cursor remapping and one undo transaction per invocation, with
  both document EOL settings. No real editor/IBM i acceptance test is claimed.

Commands used C:/Programs/VSCode/Code.exe with ELECTRON_RUN_AS_NODE=1,
piped through Out-Host to wait; the previous environment value was restored.

## Changed files and release state

- out/comments.js
- out/extension.js
- scripts/test.cjs
- README.md
- CHANGELOG.md
- docs/line-comment-toggle-checkpoint.md
- Workspace agent memo: user requirement and this checkpoint recorded.

Manifest remains 0.4.2; changes are explicitly unreleased. No package generated,
installation changed, settings edited, archived source changed, or remote member
edited. Installed 0.4.2 still has the old behavior until a new release is installed.

Next stage: version and package the validated correction, then independently
verify the artifact. Installation remains a separate explicitly authorised stage.