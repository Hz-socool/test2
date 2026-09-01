# Project Agent Instructions

## Objective

Deliver an installable Figma Design plugin that safely refactors ordinary layer trees into responsive Auto Layout structures. The MVP must include Wrap, Min/Max sizing, and breakpoint variants.

## Non-negotiable product rules

- Safety and accuracy take priority over conversion coverage.
- Analysis must not mutate the source selection.
- Default output is a converted duplicate placed beside the source.
- Never silently detach an Instance or reparent children inside an Instance.
- Low-confidence or unsupported nodes must be skipped or require explicit confirmation.
- A conversion is successful only when source-width fidelity and every configured breakpoint pass validation.
- Preserve text, visual styles, node content, and component references within the supported scope.

## Engineering rules

- Use TypeScript and current official Figma Plugin API typings.
- Keep inference independent from Figma writes through a serializable `ResponsivePlan` intermediate model.
- Apply layout changes bottom-up on a duplicate.
- Add unit tests for pure inference and validation logic.
- Maintain Golden Fixtures for supported patterns and regressions.
- Do not add an AI/backend dependency to the MVP without an explicit product decision.
- Keep network access disabled unless a later requirement justifies it.

## Delivery rules

- Read `docs/PRD.md` before implementation.
- Each issue must satisfy its own acceptance criteria before being marked complete.
- Code-changing work must be committed with tests and a concise handoff.
- Do not broaden scope to design-to-code, visual redesign, or arbitrary free-form artwork.

