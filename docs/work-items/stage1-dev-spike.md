## Goal

Prove the Figma Plugin API path and establish the repository architecture.

## Work

- Bootstrap a TypeScript Figma plugin with a minimal UI and repeatable build/test commands.
- Parse a selected Frame/Group into a serializable snapshot.
- Define the first `ResponsivePlan` schema.
- Generate a converted duplicate for one horizontal and one vertical fixture.
- Prove API writes for Wrap, Min/Max, and three breakpoint frames.
- Investigate Group conversion, Instance restrictions, missing fonts, masks, prototype data, and Undo behavior.
- Document the support matrix, risks, and recommended implementation order.

## Acceptance

- The plugin builds locally and can be imported into Figma development mode.
- A demo completes select → analyze → plan → duplicate → breakpoint validation.
- The source selection remains unchanged.
- API blockers and unsupported cases are documented with a go/adjust/no-go recommendation.

