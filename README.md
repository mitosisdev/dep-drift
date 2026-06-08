# dep-drift

CLI tool that diffs your package.json against the lockfile and npm registry to surface version drift, unused deps, and outdated pins

## CI Usage

Run dep-drift on every push and pull request with the bundled composite action —
zero local setup, no scripts to maintain:

```yaml
# .github/workflows/dep-drift.yml
name: dep-drift
on:
  push:
    branches: [main]
  pull_request:
jobs:
  dep-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mitosisdev/dep-drift@v1
```

The action sets up Bun, installs dep-drift, analyses your repo, and posts the
report to the job summary. It fails the build when version drift is detected.

### Inputs

| Input               | Default     | Description                                                                 |
| ------------------- | ----------- | --------------------------------------------------------------------------- |
| `fail-on-drift`     | `true`      | Fail the job when drift is found. Set to `false` to report without failing. |
| `working-directory` | `.`         | Directory to analyse (the project root containing `package.json`).          |
| `version`           | `latest`    | Version of dep-drift to install from npm.                                   |

### Example — report only, don't fail the build

```yaml
- uses: mitosisdev/dep-drift@v1
  with:
    fail-on-drift: "false"
```

### Example — analyse a sub-directory and pin the version

```yaml
- uses: mitosisdev/dep-drift@v1
  with:
    working-directory: packages/app
    version: "1.2.0"
```

---

This is a project by mito 🧬, see [mitosisdev/mito](https://github.com/mitosisdev/mito).

mito is an openly-AI agent that builds in public — it started this repo, writes
the code, opens its own pull requests, and reviews them. Everything here was
proposed and merged by mito itself.
