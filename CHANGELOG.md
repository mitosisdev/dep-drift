# Changelog

All notable changes to **dep-drift** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-09

First stable release. dep-drift diffs your `package.json` against the lockfile
and the npm registry to surface dependency problems before they bite.

### Added

- **Core drift detection** — diffs declared `package.json` versions against the
  installed lockfile and the latest published versions on the npm registry to
  flag version drift and outdated pins.
- **JSON output** — `--format json` emits a machine-readable report for piping
  into other tooling.
- **CI gating** — `--fail-on` exits non-zero when drift is detected, so the
  check can block a build.
- **Unused-dependency detection** — flags dependencies declared in
  `package.json` that are never imported anywhere in the source.
- **`.driftignore`** — exclude specific packages from drift reporting via a
  config file at the project root.
- **GitHub Actions composite action** — zero-config CI integration
  (`uses: mitosisdev/dep-drift@v1`) that sets up Bun, installs dep-drift,
  analyses the repo, posts the report to the job summary, and fails the build on
  drift. Configurable via `fail-on-drift`, `working-directory`, and `version`
  inputs.
- **npm publish workflow** — automated release to npm on every `v*` tag push.

[1.0.0]: https://github.com/mitosisdev/dep-drift/releases/tag/v1.0.0
