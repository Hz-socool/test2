# Responsive Layout Refactor for Figma

一个以“安全、高准确率”为默认策略的 Figma 插件：将普通 Frame、Group 和固定定位图层重构为可维护的 Auto Layout，并生成 Wrap、Min/Max 和断点变体。

## MVP 目标

- 推断横向、纵向与常见嵌套布局。
- 推断 padding、gap、alignment、Hug、Fill、Fixed 和 Absolute。
- 支持 Wrap、Min/Max Width/Height。
- 生成 Desktop、Tablet、Mobile 等可配置断点变体。
- 默认创建转换副本，不破坏原稿。
- 通过置信度、风险提示和多宽度验证保证安全性。

产品范围、验收标准和 AI 研发流程见 `docs/PRD.md` 与 `docs/AI_EXECUTION_PLAN.md`。

## Stage 1 development plugin

The repository now contains an importable TypeScript development plugin with a
pure snapshot → `ResponsivePlan` inference boundary and a Figma-only duplicate
applier. The plugin:

- reads one selected Frame or Group without writing during analysis;
- shows confidence, reasons, warnings, skipped/Absolute nodes, and the complete
  serializable plan;
- creates a base-width duplicate plus Desktop, Tablet, and Mobile frames;
- writes horizontal Wrap and explicit Min/Max constraints through the current
  Plugin API;
- validates source preservation, source-width geometry, breakpoint overflow,
  overlap, reading order, and constraint writes before reporting success;
- keeps Instances atomic and blocks unsupported mask, rotation, locked-root,
  and Instance-ancestor cases.

## Develop and verify

Node.js 22 or newer is required.

```bash
npm ci
npm run verify
```

`npm run verify` performs two strict TypeScript checks (Figma runtime and
Node/Vitest), runs the pure inference/validation suite, creates `dist/code.js`
plus `dist/ui.html`, and verifies that the manifest resolves to both artifacts
with dynamic-page loading and network access disabled.

## Import in Figma

1. Run `npm run build`.
2. In the Figma desktop app, choose **Plugins → Development → Import plugin
   from manifest…**.
3. Select this repository's `manifest.json`.
4. Select one editable Frame or Group, run **Responsive Layout Refactor
   (Development)**, then Analyze and approve the plan.

The manifest intentionally declares `documentAccess: "dynamic-page"` and
`allowedDomains: ["none"]`. Its all-zero development ID must be replaced with a
Figma-assigned ID before publishing; local development does not add any backend
or network dependency.

The detailed API findings, support matrix, manual demo geometry, and next-stage
order are in `docs/TECHNICAL_SPIKE.md`.
