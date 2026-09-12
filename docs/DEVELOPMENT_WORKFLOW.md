# Development workflow

GitHub is the canonical source for public-safe source code, Skills, schemas, prompts, tests, interfaces and governance documents.

## Start

```bash
git status --short
git fetch origin
git pull --ff-only
git switch -c codex/<task-name>
```

Preserve an existing dirty worktree. Identify ownership, keep the changes on their current branch or commit them deliberately, then synchronize through safe merges.

## Finish

```bash
npm run build
npm test
npm run lint
npm run governance:validate
git diff --check
git add <task-files>
git commit -m "Govern Research OS contracts and workflows"
git push -u origin codex/<task-name>
```

Open a pull request, review CI and merge through GitHub. Small updates still use traceable commits. Dynamic data and local outputs stay outside routine source commits.

## Snapshot transition

A child project becomes `git_managed` after its actual workspace, uncommitted changes, remote, branch, repository diff and tests are confirmed. Until then, use controlled one-way sync with an allowlist for source, app, scripts, docs, Skills, tests and configuration and a denylist for dependencies, `.env`, builds, caches, outputs, logs, temporary files and private data.

Preview an allowlisted transition sync with `scripts/sync-project-snapshot.ps1 -Source <path> -ProjectId <id>`. Review the listed files, then add `-Apply` and inspect `git diff` before committing.
