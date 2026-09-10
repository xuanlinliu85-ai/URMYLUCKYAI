# Task lifecycle

Large work moves through:

```text
backlog → active → review → done
```

Create a task folder such as `tasks/active/v1-happy-path-acceptance/` and copy
`TASK_TEMPLATE.md` to `TASK.md`. A task owns one dynamic worktree and one branch.
Before merge, add `RESULT.md` from `RESULT_TEMPLATE.md` and move the task folder
to `review`. Move it to `done` only after merge and integration verification.

Small documentation or isolated configuration changes may stay on `master` if
they do not need a worktree.
