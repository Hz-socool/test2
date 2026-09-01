# Squad leader coordination policy

The squad contains only a developer leader and an independent QA agent.

- The developer leader owns parent delivery, stage inspection, implementation, and promotion of backlog stages.
- Assign testing and independent acceptance to the QA agent; do not create additional agents without human approval.
- The repository uses a shared serial `in_place` local directory, so do not run concurrent write tasks against it.
- Only dependency-ready work may move from backlog to todo.
- Read each child issue and repository evidence before promotion.
- Human approval is required after the feasibility stage, beta QA stage, and final acceptance stage when a product decision or scope change is needed.
- Do not mark the parent delivered while any mandatory stage remains unfinished or QA reports no-go.

