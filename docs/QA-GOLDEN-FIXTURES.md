## QA baseline

The independent baseline lives in `tests/golden/p0-fixtures.json` and
`tests/golden/edge-cases.json`. The input format intentionally describes
geometry and layer relationships without importing `ResponsivePlan` or any
production inference code. This keeps expected results reviewable and prevents
the implementation from defining its own oracle.

Each P0 fixture records:

- a deterministic root and descendant layer tree with relative geometry;
- the expected root flow, visual child order, item/counter-axis spacing,
  padding, sizing, and Absolute children;
- the expected strategy for every relevant hierarchy node;
- Desktop, Tablet, and Mobile breakpoint widths plus direction, order,
  visibility, spacing, and sizing overrides;
- a 2 px key-node geometry tolerance and the text, visual-style, and component
  references that must survive conversion.

The fixture set covers button, navigation, card, form, list, toolbar, nested
layout, Wrap, Min/Max, and a breakpoint structural change. The edge-case set
covers Instance boundaries, missing fonts, locked nodes and roots, masks,
overlap, hidden nodes, rotation, and unsupported selections.

## Test strategy

1. Validate the fixture contract before using a fixture: unique IDs, valid
   parent relationships, complete hierarchy coverage, flow/Absolute subsets,
   unique positive breakpoint widths, and non-negative tolerance.
2. Run pure inference tests against each fixture through an adapter owned by
   the implementation test suite. Compare only the fields in `expected`; do
   not accept extra conversion coverage as a pass when a safety expectation is
   violated.
3. For each accepted plan, run source-width geometry validation at the source
   width and then every configured breakpoint. Verify no overlap, clipping,
   overflow, or reading-order failure. Wrap must move complete child nodes and
   preserve primary and counter-axis spacing.
4. Verify output is a duplicate, source snapshots are byte-equivalent after
   analysis, and text, styles, prototype data, and component references are
   unchanged within the supported case.
5. Run edge cases as safety tests. The expected action is to preserve, skip, or
   request confirmation; a crash, partial write, detach, or silent reparent is
   a failure.

Required clean-state command before release evidence:

```bash
npm ci
npm run verify
```

Manual Figma checks are required for clone fidelity and instance behavior until
the plugin API is available in a test harness. Record the Figma version, OS,
fixture ID, source dimensions, configured breakpoints, result, and evidence.

## Severity rubric

| Severity | Release meaning | Examples |
| --- | --- | --- |
| Critical | Immediate no-go; block release | Lost text/style/component or prototype data; source mutation; Instance detachment or child reparenting; crash or partial destructive write; missing mandatory breakpoint validation |
| High | No-go for the affected pattern; fix before acceptance | Wrong direction/order; unintended overlap, clipping, overflow, or reading order; Wrap splits an item; Min/Max boundary not enforced; breakpoint output missing or inconsistent |
| Medium | Confirmation or targeted fix required | Low-confidence input auto-included; hidden/locked/overlap/rotation risk not reported; geometry over 2 px but content is intact; report omits skipped nodes or reasons |
| Low | Track separately | Cosmetic report wording, naming polish, or non-essential evidence metadata with no safety or fidelity impact |

Go requires zero Critical findings, no unacknowledged High findings in the
P0 set, source-width fidelity within 2 px, and passing validation at every
configured breakpoint. The 80% first-pass acceptance target does not override
the zero-loss and mandatory-validation gates.
