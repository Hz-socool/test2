## Goal

Implement the deterministic core engine and safe conversion path.

## Work

- Complete Scene Parser and normalized geometry model.
- Generate multiple horizontal/vertical/nested candidate plans.
- Score confidence, visual fidelity, structural simplicity, and risks.
- Implement padding, gap, alignment, visual order, Hug, Fill, Fixed, and safe Absolute handling.
- Implement non-mutating plan preview and bottom-up duplicate applier.
- Add unit tests and pass applicable core Golden Fixtures.

## Acceptance

- Source analysis produces a stable `ResponsivePlan` without mutation.
- Medium/low-confidence behavior follows the PRD safety policy.
- Core supported fixtures pass at source width without critical content or reference loss.

