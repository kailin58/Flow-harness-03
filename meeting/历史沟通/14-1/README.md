# RTK (Rust Token Killer) 项目分析索引

## 项目概览

**RTK (Rust Token Killer)** 是一个高性能 CLI 代理工具，通过智能过滤和压缩命令输出，将 LLM token 消耗降低 **60-90%**。

| 项目属性 | 值 |
|----------|-----|
| 版本 | v0.35.0 |
| 语言 | Rust |
| 作者 | Patrick Szymkowiak |
| 许可证 | MIT |
| 来源 | https://github.com/rtk-ai/rtk |

---

## 分析文档

| 文档 | 描述 | 大小 |
|------|------|------|
| [深度分析报告.md](深度分析报告.md) | 项目全面分析，包含架构、功能模块、技术亮点 | 完整报告 |
| [技术架构详解.md](技术架构详解.md) | 核心设计理念、过滤策略、钩子系统、性能优化 | 技术深度 |
| [命令速查表.md](命令速查表.md) | 所有RTK命令、参数、选项的快速参考 | 实用速查 |
| [应用场景指南.md](应用场景指南.md) | 个人/团队/企业应用场景与最佳实践 | 实践指南 |

---

## 核心指标

### Token节省效率

| 生态系统 | 模块 | 节省率 |
|----------|------|--------|
| Git | cmds/git/ | 85-99% |
| JS/TS | cmds/js/ | 70-99% |
| Python | cmds/python/ | 70-90% |
| Go | cmds/go/ | 75-90% |
| Ruby | cmds/ruby/ | 60-90% |
| Rust | cmds/rust/ | 60-99% |
| Cloud | cmds/cloud/ | 60-80% |

### 性能指标

| 指标 | 值 |
|------|-----|
| 启动开销 | 5-15ms |
| 二进制大小 | ~4.1MB |
| 内存占用 | 2-5MB |
| 支持命令 | 100+ |
| 支持AI工具 | 10种 |

---

## 快速导航

### 了解项目
→ 阅读 [深度分析报告.md](深度分析报告.md) 第一章

### 理解架构
→ 阅读 [技术架构详解.md](技术架构详解.md)

### 核心功能
- 命令过滤和压缩
- Token使用追踪
- AI工具钩子集成
- TOML DSL扩展

---

## 核心特性

### 1. 命令代理架构
```
用户 → rtk → 原生命令 → 输出过滤 → 用户
         ↓
    Token追踪 (SQLite)
```

### 2. 六阶段执行流程
1. **PARSE** - Clap解析参数
2. **ROUTE** - 路由到模块
3. **EXECUTE** - 执行原命令
4. **FILTER** - 过滤输出
5. **PRINT** - 打印结果
6. **TRACK** - 记录指标

### 3. 十二种过滤策略
- 统计提取 (90-99%)
- 错误聚焦 (60-80%)
- 模式分组 (80-90%)
- 去重压缩 (70-85%)
- 结构提取 (80-95%)
- 代码过滤 (60-90%)
- 失败聚焦 (94-99%)
- 树压缩 (50-70%)
- 进度过滤 (85-95%)
- JSON/文本双模式 (80%+)
- 状态机解析 (90%+)
- NDJSON流式 (90%+)

### 4. 支持的AI工具
- Claude Code
- GitHub Copilot
- Cursor
- Gemini CLI
- Codex (OpenAI)
- Windsurf
- Cline / Roo Code
- OpenCode

---

## 关键设计决策

| 决策 | 原因 |
|------|------|
| 零异步 | 避免5-10ms运行时开销 |
| SQLite追踪 | 零配置、轻量级、可靠 |
| anyhow错误处理 | 上下文链、用户友好 |
| Clap CLI解析 | 派生宏、类型安全、自动帮助 |
| lazy_static正则 | 避免每次调用重编译 |

---

## 安装方式

```bash
# Homebrew (推荐)
brew install rtk

# 快速安装
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh

# Cargo
cargo install --git https://github.com/rtk-ai/rtk
```

## 快速开始

```bash
# 安装钩子
rtk init -g

# 验证安装
rtk --version
rtk gain

# 日常使用 (自动重写)
git status        # → rtk git status
cargo test        # → rtk cargo test
```

---

## 项目价值

### 个人开发者
- 减少 LLM token 消耗 60-90%
- 降低 API 成本
- 提高开发效率

### 团队
- 代码审查紧凑输出
- 测试报告仅显示失败
- 透明的 token 使用追踪

---

*分析时间: 2026-04-12*
