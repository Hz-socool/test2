# Stage 1 technical spike

## Recommendation

**GO with adjustments.** The official Plugin API exposes the required writes
for horizontal Wrap, counter-axis spacing, Min/Max constraints, cloning, and
breakpoint Frame generation. The safe implementation path is viable when Frame
conversion is the default supported case, Group conversion remains narrower,
and Instance/mask/rotation boundaries are enforced before any write.

The checked-in plugin implements the full development flow:

```text
selection → async serializable snapshot → pure ResponsivePlan
          → explicit approval → duplicate-only bottom-up applier
          → source-width + every-breakpoint validator → report
```

Analysis and configuration validation are pure. Figma nodes enter only through
`src/figma/snapshot.ts`; mutation enters only through `src/figma/apply.ts`. The
UI never sends a plan back as authority: the controller retains the analyzed
snapshot and plan, re-snapshots the source before conversion, and rejects stale
input.

## API proof

| Capability | Implemented proof | Result |
| --- | --- | --- |
| Frame duplicate | `clone()`, immediately reparent duplicate into a page-level output set | Go |
| Group conversion | Clone Group; bottom-up replace only the cloned Group with a Frame; preserve cloned children and their local geometry | Adjust |
| Wrap | Set `layoutMode = "HORIZONTAL"` before `layoutWrap = "WRAP"`; write `counterAxisSpacing` only while wrapped | Go |
| Min/Max | Write nullable positive `minWidth`, `maxWidth`, `minHeight`, and `maxHeight` only after the clone is Auto Layout | Go |
| Breakpoints | Build Base plus one Frame per configured preset; current UI supplies Desktop 1440, Tablet 768, Mobile 375 | Go |
| Validation | Compare source-width key-node geometry at 2 px tolerance; check width, overflow, overlap, visual order, and Min/Max writes at every breakpoint | Go |
| Source safety | Fingerprint the full source snapshot before and after writes; success requires exact equality | Go |
| Error cleanup | Remove the generated output set when an API exception interrupts the operation | Go |
| Offline operation | Manifest allows no domains; inference is deterministic and local | Go |

`ResponsivePlan` v1 records base layout, Wrap, Min/Max sizing, breakpoint
overrides, future inserted-wrapper slots, Absolute children, confidence,
reasons, warnings, and skipped node IDs. It contains no live Figma objects and
round-trips through JSON.

## Support matrix

| Input or behavior | Spike policy | Recommendation |
| --- | --- | --- |
| Ordinary editable Frame | Clone and apply recursively bottom-up | Go |
| Regular Group | Convert only inside the duplicate; Group background styles are blocked | Adjust; expand only with Golden coverage |
| Instance as descendant | Clone as one atomic child; never detach or traverse/reparent internals | Go within atomic scope |
| Selection within an Instance | Block because converting an internal descendant independently cannot preserve its component relationship | No-go |
| Component / Component Set descendant | Block because container cloning changes nested main Components into Instances | No-go |
| Missing font | Read `hasMissingFont`, warn, clone content, never edit characters or text styles | Go for clone-only preservation; host-check geometry |
| Masked composition | Block the plan | No-go for MVP |
| Rotation | Block the plan above 0.1 degrees | No-go for MVP |
| Locked root | Analyze and report; block conversion | No-go until explicitly unlocked |
| Hidden or locked child | Preserve outside flow and require confirmation | Adjust |
| Prototype reactions on Frame | Clone retains the node; report that host verification is required | Adjust |
| Prototype reactions on any converted Group | Block because Group-to-Frame replacement cannot prove reaction preservation | No-go |
| Undo | One plugin invocation creates one page-level output set; default source is untouched and thrown errors clean up output | Adjust; verify one-step Undo in host before beta |

## Group, font, prototype, and Undo findings

Group nodes do not expose Auto Layout writes. The only deterministic route is to
clone first, create a Frame in the duplicate tree, move only duplicate children,
restore their local positions, then delete the cloned Group shell. This preserves
child text, styles, content, and Instance references, but it does not establish
equivalence for Group background styles or prototype reactions. Those cases stay out
of the supported scope.

The current clone contract also converts nested main Components into Instances
that reference the originals. That is useful native behavior, but it is not a
zero-loss copy of the selected tree, so Component and Component Set descendants
are explicit blockers in the supported spike scope.

Missing fonts do not prevent read-only snapshotting or cloning. They do make
text edits unsafe. The applier therefore never changes `characters`, font
properties, or text styles. It emits `MISSING_FONT_PRESERVED` for review.

With dynamic page loading, reactions are read asynchronously through
`getReactionsAsync()`. A Frame clone is the viable preservation route; a Group
whose shell owns reactions is blocked.

The Plugin API does not provide nested user-visible transaction checkpoints.
The safety strategy is duplicate-only output, preflight blockers, stale-source
detection, exception cleanup, and normal Figma Undo for the completed plugin
action. In-place replacement is not implemented in this spike.

## Golden demo fixtures

The machine-readable cases live in `tests/fixtures/` and are asserted
independently by `tests/inference.test.ts`.

### Horizontal Frame

- Root: 440 × 80.
- Children: `(16,16,96,48)`, `(124,16,132,48)`,
  `(268,16,156,48)`.
- Expected: Horizontal, 12 px gap, 16 px padding, Wrap, fixed base size, and
  explicit 240–1440 width / 48–1024 height constraints.

### Vertical Group

- Root: 320 × 260.
- Children: `(20,20,280,56)`, `(20,88,280,68)`,
  `(20,168,280,76)`.
- Expected: Vertical, 12 px gap, padding 20/20/16/20, no Wrap.

For a host smoke test, reproduce either geometry in a blank Figma page, import
`manifest.json`, select the root, and run Analyze → Create responsive duplicate.
The output must contain Base/Desktop/Tablet/Mobile Frames, leave the source
unchanged, and show PASS for source width and all three breakpoints. The Group
case also verifies that only cloned children are reparented.

## Automated evidence

`npm run verify` is the repeatable gate. The suite covers:

- horizontal and vertical inference;
- snapshot immutability and JSON serialization;
- Instance atomicity and component-reference data;
- mask, rotation, locked-root, and Instance-ancestor blockers;
- explicit confirmation for preserved Absolute children;
- invalid Min/Max and breakpoint configuration;
- 2 px source fidelity;
- wrapped reading order, overflow, overlap, and constraint-write failures.

The TypeScript gate compiles production code against
`@figma/plugin-typings@1.137.0`. Plugin and test globals use separate compiler
programs so Node/DOM declarations cannot hide Plugin API errors.

## Risks and smallest next steps

1. Run the two manual fixtures in the target Figma desktop channel and record
   screenshots plus one-step Undo evidence.
2. Keep Frame as the first production-supported container. Admit Group patterns
   one Golden Fixture at a time, beginning with plain groups without effects,
   masks, rotation, or reactions.
3. Expand the independent QA fixture baseline before raising inference coverage.
4. Add nested flow inference and inserted-wrapper decisions only after source-
   width validation is stable for the simple Frame set.
5. Add breakpoint direction/order/visibility editors; the schema and applier
   already carry these overrides, while the Stage 1 UI intentionally exposes
   only widths, Wrap, Min/Max, and tolerance.
6. Test Min/Max behavior below and above boundaries inside Figma. The current
   validator proves property writes and configured breakpoint behavior, not an
   exhaustive interactive-resize matrix.

The analyzer blocks a plan before writes when either the source size or any
configured breakpoint falls outside the supplied Min/Max range; such a plan
could not satisfy the mandatory validation gate.
