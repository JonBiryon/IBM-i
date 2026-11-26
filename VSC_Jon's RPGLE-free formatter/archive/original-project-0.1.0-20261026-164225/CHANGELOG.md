# Changelog

## 0.1.0

- Scaffold Jon's RPGLE-free formatter with fully-free indentation-only provider integration.
- Retain the existing free-form commenter and fixed-format delegation; rename the command to `rpgleFreeFormatter.toggle`.
- Add output-only formatting notices, cancellation handling and mocked provider tests.
- Provide offline process-based build/test/package tasks and manual debug configuration.
- Formatter implementation and formatter-specific tests are a separate-agent handoff;
  build/test/package and manual Extension Development Host validation remain pending.