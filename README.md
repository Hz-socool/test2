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

