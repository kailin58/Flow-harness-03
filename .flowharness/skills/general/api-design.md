---
name: "api-design"
owner_agent: "general"
version: "1.0"
when_to_activate:
  - "需要设计或实现 API/接口"
  - "任务描述包含'API'、'接口'、'endpoint'"
platforms:
  - cursor
  - claude-code
  - codex
---

# API 设计技能

## 激活条件

当任务涉及模块公开接口、方法签名或契约设计时激活。

## 工作流步骤

1. **定义接口契约**: 入参类型、返回值类型、错误码
2. **遵循 JSDoc**: 所有 public 方法添加 JSDoc 注释
3. **错误处理**: 统一使用 throw Error 或 { success, error } 模式
4. **向后兼容**: 新增参数使用 options 对象，带默认值

## 输出格式

按项目风格，每个模块导出一个 class：

```javascript
class NewModule {
  constructor(options = {}) { }
  async publicMethod(input) { }
}
module.exports = NewModule;
// 或 module.exports = { NewModule };
```

## 禁止行为

- 不破坏现有 API 契约（AGENTS.md 禁止项）
- 不引入新的 npm 依赖（除非 Plan Agent 已批准）
