# Verification environment notes

The first npm.cmd orchestration attempt failed synchronously with Windows spawn EINVAL before a result record; its empty raw file is retained and not counted as RED. RED2 and RED3 used the direct installed Vitest entry point and observed missing behavior. RED3 has6 failing new cases and1 compatibility pass.

The initial full contracts run suffered ENOENT for sandbox-owned temporary transform-cache paths in8 suites;44 tests ran and passed, but this is not suite success. Rerun the unchanged complete suite with ordinary worker access. No predecessor tests, assertions, dependency versions or test configuration were edited.
