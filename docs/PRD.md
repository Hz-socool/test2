## Product definition

The product is a responsive Auto Layout migration and validation tool for Figma Design. It converts legacy, imported, outsourced, or AI-generated layer structures into explainable and maintainable responsive layouts.

## Primary users and scenarios

- UI/product designers cleaning up existing fixed-position designs.
- Design-system maintainers governing inconsistent files.
- Designers preparing files for responsive implementation and handoff.

Initial supported patterns: buttons, navigation, cards, forms, lists, toolbars, and regular mobile/web sections.

## P0 scope

1. Analyze one selected editable Frame or Group and its descendants.
2. Infer horizontal, vertical, and common nested Auto Layout structures.
3. Infer padding, gap, alignment, visual order, Hug, Fill, Fixed, and intentional Absolute children.
4. Support Wrap, item spacing, and counter-axis spacing.
5. Support Min/Max Width and Height. If a value cannot be inferred from evidence or a preset, require confirmation rather than inventing it.
6. Generate configurable breakpoint variants. Starter presets may use Desktop 1440, Tablet 768, and Mobile 375, but values must be editable.
7. Allow per-breakpoint direction, order, visibility, Wrap, and sizing overrides.
8. Show a non-mutating plan preview with confidence, reasons, warnings, new wrappers, and skipped nodes.
9. Create a converted duplicate by default; in-place replacement is optional and must remain undoable.
10. Validate source-width fidelity and every configured breakpoint for overlap, clipping, overflow, and reading-order errors.
11. Produce a conversion report.

## Out of scope for MVP

- Visual redesign or aesthetic optimization.
- Frontend code generation.
- Automatic detaching or rebuilding of component instances.
- Posters, illustrations, arbitrary free-form layouts, and complex rotated/masked compositions.
- Model-hosted or server-side AI inference.

## Safety mode

- High confidence: include automatically in the proposed plan.
- Medium confidence: require user confirmation.
- Low confidence: skip by default and explain why.
- Unsupported: preserve as-is, treat as an atomic/Absolute node when safe, or stop the affected subtree.

## Core intermediate model

`ResponsivePlan` must capture the base layout, Wrap rules, Min/Max rules, breakpoint overrides, inserted wrappers, Absolute children, confidence, reasons, and warnings without direct Figma node mutation.

## Acceptance criteria

- Supported Golden Fixtures infer the expected flow, hierarchy, spacing, and sizing strategy.
- At source width, supported key-node geometry differs by no more than the agreed tolerance; the provisional tolerance is 2 px excluding effects and anti-aliasing.
- At every configured breakpoint there is no unintended overlap, clipping, overflow, or reading-order failure.
- Wrap moves whole children to the next track and preserves configured primary/counter-axis spacing.
- Min/Max constraints hold when a generated layout is resized below and above its boundaries.
- Breakpoint outputs are complete, editable, consistently named, and preserve their relationship to the source plan.
- Analysis/cancel does not alter the source.
- Instances are not silently detached or internally reparented.
- Critical loss of text, styles, component references, or prototype data is zero within supported cases.
- Unsupported inputs produce a useful report instead of a crash or partial destructive write.

## Quality gates

- At least 80% first-pass acceptance on the agreed P0 Golden Fixture set.
- Zero critical content/style/component-reference loss.
- Median time to an accepted result at least 30% lower than the best native/manual baseline during pilot.
- Wrong-structure rollback rate no greater than 10% during pilot.

