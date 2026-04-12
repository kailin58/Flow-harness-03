# Agent 角色与职责划分

> **版本**: 1.0  
> **最后更新**: 2026-04-12  
> **状态**: 已锁定 (写死)

## 架构概览

```
1 CEO + 5 总监 + N 子Agent
```

## 核心 Agent 职责

### 1. Supervisor Agent (CEO)
- **角色**: 领导、调度器、决策者
- **能力**: `analyze`, `dispatch`, `inspect`, `review`, `optimize`
- **职责**: 判断、指挥、检查、复盘、优化

### 2. Explore Agent (总监1) - 站内搜索
- **角色**: 探索总监、信息收集者
- **能力**: `file_search`, `code_search`, `dependency_analysis`, `structure_analysis`
- **职责**: 代码库探索、文件搜索、依赖分析、上下文收集
- **搜索范围**: **本地代码库 (站内)**

### 3. Plan Agent (总监2)
- **角色**: 规划总监、架构师
- **能力**: `architecture_design`, `tech_selection`, `risk_assessment`, `task_decomposition`
- **职责**: 架构设计、方案规划、风险评估、任务拆解

### 4. General-Purpose Agent (总监3)
- **角色**: 执行总监、实施者
- **能力**: `code_writing`, `file_editing`, `command_execution`, `multi_step_tasks`
- **职责**: 代码编写、文件操作、命令执行、多步骤任务

### 5. Inspector Agent (总监4)
- **角色**: 质检总监、检查者
- **能力**: `code_review`, `testing`, `security_scan`, `quality_check`
- **职责**: 代码审查、测试执行、安全扫描、质量检查

### 6. Research Agent (总监5) - 站外搜索
- **角色**: 研究总监、资料搜集者
- **能力**: `web_search`, `fetch_url`, `doc_lookup`, `api_reference`, `knowledge_retrieval`, `browser_visit`, `browser_confirm`, `browser_action`, `browser_status`
- **职责**: 网络搜索、文档查询、API参考检索、知识获取
 浏览器辅助（人工模式）
- **搜索范围**: **互联网/外部资源 (站外)**
- **认证方式**: **人工辅助模式 - 遇到登录/验证码时暂停，等待人工处理**

### 认证处理流程

```
用户请求访问需要认证的资源
        ↓
Research Agent 打开浏览器
        ↓
检测到需要登录/验证码
        ↓
暂停，通知用户
        ↓
用户在浏览器中手动操作
        ↓
用户确认完成
        ↓
继续执行，返回内容
```

**合规声明**: 人工辅助模式完全合规
1. ✅ 浏览器窗口显示，用户看到操作
2. ✅ 遇到登录/验证码时暂停，等待用户处理
3. ✅ 会话持久化，下次无需重新登录
4. ✅ 不破解任何验证码
5. ✅ 遵守网站服务条款

---

## 关键职责划分：站内 vs 站外搜索

```
┌─────────────────────────────────────────────────────────┐
│                      用户请求                           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   TaskAnalyzer 判断    │
              └────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
┌──────────────────┐              ┌──────────────────┐
│  Explore Agent   │              │  Research Agent  │
│   (站内搜索)      │              │   (站外搜索)      │
├──────────────────┤              ├──────────────────┤
│ • 搜本地文件      │              │ • 搜网络资料      │
│ • 搜代码片段      │              │ • 查官方文档      │
│ • 分析依赖关系    │              │ • 查 API 参考     │
│ • 分析项目结构    │              │ • 抓取网页内容    │
└──────────────────┘              └──────────────────┘
     本地代码库                        互联网
```

### 判断规则

| 任务关键词 | 分配 Agent | 搜索范围 |
|-----------|-----------|---------|
| 搜索项目、查找代码、分析依赖、项目结构 | Explore Agent | 站内 |
| 搜索网络、查阅文档、查 API、上网查、调研 | Research Agent | 站外 |

### 示例

- "搜索项目中的 API 调用代码" → **Explore Agent** (站内)
- "搜索 React 官方文档" → **Research Agent** (站外)
- "分析项目的依赖关系" → **Explore Agent** (站内)
- "查阅 Docker 官方文档" → **Research Agent** (站外)

---

## Research Agent 支持的操作

### 1. web_search - 网络搜索
```javascript
{
  action: 'web_search',
  query: 'React hooks best practices',
  engine: 'duckduckgo'  // 默认使用 DuckDuckGo (免费)
}
```

### 2. fetch_url - 抓取 URL 内容
```javascript
{
  action: 'fetch_url',
  url: 'https://example.com/doc',
  extractText: true,     // 提取纯文本
  maxLength: 50000      // 最大长度
}
```

### 3. doc_lookup - 文档查询
```javascript
{
  action: 'doc_lookup',
  technology: 'react',   // 支持: react, vue, node, typescript, python, rust, go, docker, kubernetes
  topic: 'useState',
  version: '18'          // 可选
}
```

### 4. api_reference - API 参考
```javascript
{
  action: 'api_reference',
  api: 'openai',         // 支持: openai, anthropic, github, stripe
  endpoint: 'chat',      // 可选
  method: 'POST'         // 可选
}
```

---

## 锁定声明

> 此文档描述的 Agent 职责划分已锁定，不得随意修改。
> 如需变更，需经过架构评审。
