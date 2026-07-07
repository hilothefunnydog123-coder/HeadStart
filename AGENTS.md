# Agent Instructions

- After completing a user-requested build or implementation change, automatically commit and push the completed changes to the configured GitHub remote.
- Before pushing, run the relevant checks for the change when practical, and report any failures.
- Do not silently stage unrelated worktree changes. If unrelated changes are present, stage only the files that belong to the completed task or ask for clarification.
- If the push is rejected because the remote branch advanced, fetch and rebase the completed work onto the remote branch, resolve conflicts carefully, rerun relevant checks, and push again.
