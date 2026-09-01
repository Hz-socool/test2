## Goal

Create the independent quality baseline before feature implementation.

## Work

- Define Golden Fixture JSON/spec cases for button, navigation, card, form, list, toolbar, nested layout, Wrap, Min/Max, and breakpoint structural change.
- For each fixture, specify expected hierarchy, flow, spacing, sizing, Absolute nodes, breakpoint overrides, and allowed geometry tolerance.
- Define edge cases for Instance, missing font, locked node, mask, overlap, hidden node, rotation, and unsupported input.
- Add the initial automated test harness or machine-readable fixture format without implementing production inference logic.

## Acceptance

- Fixtures are reviewable, deterministic, and cover all P0 features.
- Expected results are independent of the developer implementation.
- A concise test strategy and severity rubric are committed.

