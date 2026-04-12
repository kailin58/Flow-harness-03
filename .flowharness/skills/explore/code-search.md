---
name: "code-search"
owner_agent: "explore"
version: "1.0"
when_to_activate:
  - "需要在代码库中搜索特定符号、函数、类"
  - "定位 Bug 所在文件"
  - "查找某个功能的实现位置"
platforms:
  - cursor
  - claude-code
  - codex
---

# 代码搜索技能

## 激活条件

当任务涉及以下场景时激活：
- 用户描述包含"搜索"、"查找"、"定位"、"在哪"等关键词
- 任务类型为 bug_fix 且需要先定位问题位置
- 需要在多个文件中查找某个函数/类的引用

## 工作流步骤

1. **理解搜索目标**: 从任务描述中提取要搜索的关键词（函数名、类名、错误消息）
2. **选择搜索策略**:
   - 精确匹配：已知确切名称 → 使用 grep/ripgrep
   - 模糊搜索：只知道功能描述 → 使用语义搜索
   - 文件类型过滤：限定 *.js / *.ts 等
3. **执行搜索**: 按 src/ → test/ → examples/ 的优先级顺序搜索
4. **排除干扰**: 自动排除 node_modules/、.flowharness/knowledge/、dist/
5. **整理结果**: 按相关性排序，返回文件路径 + 行号 + 上下文片段

## 输出格式

```json
{
  "type": "search_result",
  "query": "搜索关键词",
  "matches": [
    {
      "file": "src/xxx.js",
      "line": 42,
      "context": "匹配行的上下文",
      "relevance": "high"
    }
  ],
  "total": 5,
  "strategy_used": "exact_match"
}
```

## 禁止行为

- 不修改任何文件（Explore Agent 是只读的）
- 不搜索 .env / secrets/ 等敏感路径
- 不返回超过 20 个结果（防止信息过载）
