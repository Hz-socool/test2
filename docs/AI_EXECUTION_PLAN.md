## AI team

- **Figma Plugin Developer**: squad leader, architecture owner, implementation, integration, stage promotion, and release handoff.
- **Figma Plugin QA**: independent fixture design, test implementation, regression testing, and release acceptance.

The squad routes parent work to the developer leader. The leader must inspect completed-stage evidence before promoting later backlog issues. The QA agent does not edit production code unless a test-only change is explicitly in scope.

## Stages

1. Feasibility: developer technical spike and QA Golden Fixture/test strategy run in parallel.
2. Core engine: parser, `ResponsivePlan`, deterministic inference, safe duplicate applier, and initial preview.
3. Responsive features: Wrap, Min/Max, breakpoint variants, and multi-width validator.
4. Independent QA: complete acceptance and defect report.
5. Hardening: developer fixes verified defects and prepares a release candidate.
6. Final acceptance: QA reruns the full regression suite and issues a go/no-go report.

Only Stage 1 starts immediately. Later stages remain parked until the leader verifies dependencies and promotes them.

## Human checkpoints

- End of Stage 1: feasibility and scope decision.
- End of Stage 4: beta quality review.
- End of Stage 6: release decision.

