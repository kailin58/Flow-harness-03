# Impeccable 项目深度技术分析报告

> 分析日期: 2026/04/12
> 项目来源: meeting/12
> 作者: Paul Bakaus

---

## 一、项目概览

### 1.1 项目定位

**Impeccable** 是一个前端设计词汇库和技能系统，旨在帮助 AI 编程助手生成更具设计感、避免"AI slop"特征的前端界面。

**核心理念**: 每个 LLM 都学习了相同的通用模板，没有指导就会产生可预测的错误——Inter 字体、紫色渐变、卡片嵌套卡片、灰色文字在彩色背景上。Impeccable 通过以下方式对抗这种偏见：

- 扩展的设计技能（7个领域专用参考文件）
- 18个引导命令（审计、审查、打磨、精炼等）
- 精选的反模式（明确告诉 AI 不要做什么）

### 1.2 核心组件

| 组件 | 数量 | 说明 |
|------|------|------|
| **主技能** | 1 | impeccable - 综合设计技能 |
| **命令** | 18 | 引导式设计操作命令 |
| **反模式** | 24 | 可检测的设计问题 |
| **参考文档** | 7 | 领域专用的深度指南 |
| **支持平台** | 10+ | Claude Code, Cursor, Gemini CLI 等 |

### 1.3 技术栈

```
运行时:     Bun (替代 Node.js)
前端:       Vanilla JavaScript + CSS (无框架)
构建:       Bun bundler
测试:       Bun test + Node test (jsdom)
部署:       Cloudflare Pages + Vercel Functions
检测器:     JSDOM (Node) / 原生 DOM (Browser)
```

---

## 二、技能系统架构

### 2.1 主技能: impeccable

主技能包含一个全面的设计指导系统，分为以下几个部分：

#### 上下文收集协议

设计技能没有项目上下文会产生通用输出。必须确认以下设计上下文：

- **目标受众**: 谁使用这个产品？在什么情境下？
- **用例**: 他们试图完成什么工作？
- **品牌个性/基调**: 界面应该给人什么感觉？

#### 设计方向框架

选择一个**大胆**的美学方向：

| 维度 | 考量点 |
|------|--------|
| **Purpose** | 这个界面解决什么问题？谁使用它？ |
| **Tone** | 选择一个极端：极简主义、极繁主义、复古未来主义、有机自然、奢华精致等 |
| **Constraints** | 技术要求（框架、性能、可访问性） |
| **Differentiation** | 什么让它令人难忘？ |

### 2.2 七大设计参考文档

每个参考文档深入探讨一个特定领域：

| 参考文档 | 核心内容 |
|----------|----------|
| **Typography** | 排版系统、字体配对、模块化比例、OpenType 特性 |
| **Color & Contrast** | OKLCH 色彩空间、色调中性色、深色模式、可访问性 |
| **Spatial Design** | 间距系统、网格、视觉层次、容器查询 |
| **Motion Design** | 缓动曲线、交错动画、减少动画偏好 |
| **Interaction Design** | 表单、焦点状态、加载模式、模态框 |
| **Responsive Design** | 移动优先、流体设计、安全区域 |
| **UX Writing** | 按钮标签、错误消息、空状态 |

---

## 三、命令系统详解

### 3.1 命令分类

#### 审计类命令

| 命令 | 功能 |
|------|------|
| `/audit` | 运行技术质量检查（可访问性、性能、响应式、反模式） |
| `/critique` | UX 设计审查：层次结构、清晰度、情感共鸣 |

#### 质量提升类命令

| 命令 | 功能 |
|------|------|
| `/polish` | 最终优化、设计系统对齐、发布就绪 |
| `/distill` | 剥离至本质，简化 |
| `/clarify` | 改进不清晰的 UX 文案 |
| `/optimize` | 性能改进 |
| `/harden` | 错误处理、引导、国际化、边缘情况 |

#### 视觉调整类命令

| 命令 | 功能 |
|------|------|
| `/animate` | 添加有目的的动效 |
| `/colorize` | 引入战略性颜色 |
| `/bolder` | 放大胆小的设计 |
| `/quieter` | 降低过于大胆的设计 |
| `/typeset` | 修复字体选择、层次、大小 |
| `/layout` | 修复布局、间距、视觉节奏 |
| `/delight` | 添加愉悦时刻 |

#### 高级命令

| 命令 | 功能 |
|------|------|
| `/adapt` | 适配不同设备 |
| `/overdrive` | 添加技术上非凡的效果 |
| `/shape` | 在编写代码前规划 UX/UI |

### 3.2 命令工作流示例

```
/audit → 发现问题
/normalize → 修复不一致
/polish → 最终清理
/distill → 移除复杂性
```

组合使用：
```
/audit /normalize /polish blog    # 完整工作流
/critique /harden checkout        # UX 审查 + 添加错误处理
```

---

## 四、反模式检测系统

### 4.1 反模式分类

#### AI Slop (AI生成特征)

| ID | 名称 | 描述 |
|----|------|------|
| `side-tab` | 侧边条纹边框 | 卡片一侧的粗色边框——最易识别的 AI UI 特征 |
| `border-accent-on-rounded` | 圆角元素边框强调 | 圆角卡片上的粗边框强调 |
| `overused-font` | 过度使用的字体 | Inter、Roboto、Open Sans 等在数百万网站上使用 |
| `single-font` | 单一字体 | 整个页面只使用一个字体家族 |
| `flat-type-hierarchy` | 扁平类型层次 | 字体大小太接近，没有清晰的视觉层次 |
| `gradient-text` | 渐变文字 | 装饰性而非有意义的渐变文字 |
| `ai-color-palette` | AI 色彩调色板 | 紫色/紫色渐变和深色背景上的青色 |
| `nested-cards` | 嵌套卡片 | 卡片中的卡片创建视觉噪音 |
| `monotonous-spacing` | 单调间距 | 到处使用相同的间距值 |
| `everything-centered` | 一切居中 | 每个文本元素都是居中对齐 |
| `bounce-easing` | 弹跳缓动 | 弹跳和弹性缓动感觉过时俗气 |
| `dark-glow` | 深色模式发光强调 | 深色背景配彩色阴影发光 |
| `icon-tile-stack` | 图标瓦片堆叠 | 标题上方的小圆角方形图标容器 |

#### Quality (设计质量问题)

| ID | 名称 | 描述 |
|----|------|------|
| `pure-black-white` | 纯黑背景 | #000000 背景看起来刺眼不自然 |
| `gray-on-color` | 彩色背景上的灰色文字 | 在彩色背景上看起来褪色 |
| `low-contrast` | 低对比度文字 | 不满足 WCAG AA 对比度要求 |
| `layout-transition` | 布局属性动画 | 动画 width/height/padding/margin 导致布局抖动 |
| `line-length` | 行长度过长 | 超过 ~80 字符的文本行难以阅读 |
| `cramped-padding` | 拥挤的内边距 | 文本离容器边缘太近 |
| `tight-leading` | 紧凑行高 | 行高低于 1.3x 字体大小 |
| `skipped-heading` | 跳过的标题级别 | 标题级别不应跳过 |
| `justified-text` | 两端对齐文本 | 无连字符的两端对齐创建不均匀的单词间距 |
| `tiny-text` | 微小文本 | 低于 12px 的正文难以阅读 |
| `all-caps-body` | 全大写正文 | 长段落全大写难以阅读 |
| `wide-tracking` | 宽字母间距 | 正文上超过 0.05em 的字母间距 |

### 4.2 检测器架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Anti-Pattern Detector                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Node.js   │    │   Browser   │    │   Chrome    │      │
│  │   (jsdom)   │    │   (DOM)     │    │  Extension  │      │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │
│         │                  │                  │              │
│         └─────────────┬────┴──────────────────┘              │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │  ANTIPATTERNS   │                             │
│              │    (24 rules)   │                             │
│              └────────┬────────┘                             │
│                       ▼                                      │
│         ┌─────────────────────────────┐                      │
│         │    checkColors()            │                      │
│         │    checkBorders()           │                      │
│         │    checkMotion()            │                      │
│         │    checkGlow()              │                      │
│         │    checkIconTile()          │                      │
│         │    checkPageTypography()    │                      │
│         │    ...                      │                      │
│         └─────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 五个同步点

当添加规则时，所有这些都会更新或重新生成：

| 位置 | 内容 | 同步方式 |
|------|------|----------|
| `src/detect-antipatterns.mjs` | 规则元数据和检测逻辑 | 手动编辑（真相源） |
| `src/detect-antipatterns-browser.js` | 浏览器打包引擎 | `bun run build:browser` 生成 |
| `extension/detector/detect.js` | Chrome 扩展引擎 | `bun run build:extension` 生成 |
| `extension/detector/antipatterns.json` | 扩展规则列表 | `bun run build:extension` 生成 |
| `public/js/generated/counts.js` | 首页显示数量 | `bun run build` 生成 |
| `source/skills/impeccable/SKILL.md` | 技能 DON'T 行 | 手动编辑 |

---

## 五、构建系统

### 5.1 目录结构

```
impeccable/
├── source/                    # 编辑这些！单一真相源
│   ├── commands/              # 带前置元数据的命令定义
│   └── skills/                # 带前置元数据的技能定义
│       └── impeccable/
├── dist/                      # 生成的输出（为用户提交）
│   ├── cursor/                # .cursor/
│   ├── claude-code/           # .claude/
│   ├── gemini/                # .gemini/
│   └── codex/                 # .codex/
├── public/                    # 网站 impeccable.style
├── server/                    # Bun 开发服务器
├── scripts/                   # 构建系统
│   ├── build.js               # 主编排器
│   └── lib/transformers/      # 特定于提供者的转换器
├── src/                       # 检测器源代码
└── extension/                 # Chrome 扩展
```

### 5.2 提供者转换

| 提供者 | 命令格式 | 技能格式 |
|--------|----------|----------|
| **Cursor** | 仅正文 (无前置元数据) | Agent Skills 标准 |
| **Claude Code** | 完整 YAML 前置元数据 | 完整 YAML 前置元数据 |
| **Gemini CLI** | TOML 格式 | 模块化导入 (@file.md) |
| **Codex CLI** | 自定义提示格式 | Agent Skills 标准 |

### 5.3 构建命令

```bash
bun run dev          # 开发服务器
bun run build        # 构建所有提供者
bun run build:browser  # 构建浏览器检测器
bun run build:extension # 构建 Chrome 扩展
bun run test         # 运行所有测试
bun run deploy       # 部署到 Cloudflare Pages
```

---

## 六、关键设计原则

### 6.1 绝对禁令

以下 CSS 模式**永不**可接受：

#### BAN 1: 侧条纹边框

```css
/* FORBIDDEN */
border-left: 3px solid red;
border-left: 4px solid var(--color-warning);
```

**原因**: 这是管理面板、仪表板和医疗 UI 中最过度使用的"设计点缀"。

**替代**: 使用完全不同的元素结构——全边框、背景色调、前导数字/图标，或根本没有视觉指示器。

#### BAN 2: 渐变文字

```css
/* FORBIDDEN */
background-clip: text;
-webkit-background-clip: text;
background: linear-gradient(...);
```

**原因**: 渐变文字是装饰性而非有意义的，是前三大 AI 设计特征之一。

**替代**: 使用单一纯色。如果需要强调，使用粗细或大小。

### 6.2 色彩原则

1. **使用 OKLCH，不是 HSL** - OKLCH 是感知均匀的
2. **色调中性色** - 所有中性色都应带有品牌色调
3. **60-30-10 规则** - 关于视觉重量，不是像素数量
4. **永不使用纯黑或纯白** - 总是添加色调

### 6.3 排版原则

1. **字体选择程序**:
   - 写下品牌的 3 个具体词汇
   - 列出你通常选择的 3 种字体 → **拒绝它们**
   - 浏览字体目录，寻找物理对象匹配
   - 交叉检查结果

2. **禁止的字体列表**:
   - Inter, Roboto, Open Sans, Lato, Montserrat, Arial
   - Fraunces, Newsreader, Lora, Cormorant
   - Syne, IBM Plex, Space Mono/Grotesk
   - DM Sans/Serif, Outfit, Plus Jakarta Sans, Instrument

### 6.4 动效原则

1. **100/300/500 规则**:
   - 100-150ms: 即时反馈
   - 200-300ms: 状态变化
   - 300-500ms: 布局变化
   - 500-800ms: 入场动画

2. **只动画两个属性**: `transform` 和 `opacity`

3. **永不使用弹跳或弹性缓动** - 它们感觉过时俗气

---

## 七、CLI 使用

### 7.1 命令

```bash
# 扫描目录/文件/URL
npx impeccable detect src/
npx impeccable detect index.html
npx impeccable detect https://example.com

# 仅正则，JSON 输出
npx impeccable detect --fast --json .

# 启动浏览器覆盖服务器
npx impeccable live
```

### 7.2 退出码

- `0` = 干净
- `2` = 发现问题

---

## 八、平台支持矩阵

### 8.1 Frontmatter 支持

| 字段 | Claude Code | Cursor | Gemini | Codex |
|------|:-----------:|:------:|:------:|:-----:|
| `name` | Yes | Yes | Yes | Yes |
| `description` | Yes | Yes | Yes | Yes |
| `user-invocable` | Yes | No | No | No |
| `argument-hint` | Yes | No | No | No |
| `model` | Yes | No | No | No |
| `effort` | Yes | No | No | No |
| `hooks` | Yes | No | No | No |

### 8.2 技能目录结构

| 平台 | 原生目录 | 也读取 |
|------|----------|--------|
| Claude Code | `.claude/skills/` | - |
| Cursor | `.cursor/skills/` | `.agents/skills/`, `.claude/skills/` |
| Gemini CLI | `.gemini/skills/` | `.agents/skills/` |
| Codex CLI | `.agents/skills/` | - |
| GitHub Copilot | `.github/skills/` | `.agents/skills/`, `.claude/skills/` |

---

## 九、网站架构

### 9.1 技术栈

- **前端**: Vanilla JavaScript (无框架)
- **CSS**: 现代 CSS with Bun bundler
- **本地开发**: Bun 服务器 (`server/index.js`)
- **生产**: Vercel Functions with Bun runtime

### 9.2 API 端点

| 端点 | 功能 |
|------|------|
| `/` | 首页 (静态 HTML) |
| `/api/skills` | JSON 技能列表 |
| `/api/commands` | JSON 命令列表 |
| `/api/download/[type]/[provider]/[id]` | 单文件下载 |
| `/api/download/bundle/[provider]` | ZIP 包下载 |

---

## 十、关键见解

### 10.1 设计哲学

> **AI Slop Test**: 如果你把这个界面给某人看并说"AI 做了这个"，他们会立即相信你吗？如果是，那就是问题所在。

一个独特的界面应该让人问"这是怎么做的？"而不是"哪个 AI 做的这个？"

### 10.2 实现原则

匹配实现复杂性与美学愿景：
- 极繁主义设计需要精心制作的代码
- 极简主义设计需要克制、精确、对细节的关注

### 10.3 核心差异点

1. **明确的反模式** - 不只是告诉做什么，还告诉不做什么
2. **确定性检测器** - CLI 工具可检测 24 种特定模式
3. **多平台支持** - 自动转换到 10+ 平台
4. **深度参考文档** - 7 个领域的专业知识

---

## 十一、总结

Impeccable 是一个成熟的前端设计技能系统，通过以下方式帮助 AI 编程助手生成更好的设计：

1. **上下文收集协议** - 确保有项目特定的设计方向
2. **18 个引导命令** - 覆盖审计、优化、调整全流程
3. **24 种反模式检测** - 可编程识别"AI slop"特征
4. **7 个深度参考** - 专业级设计知识库
5. **多平台构建系统** - 一源多端输出

**核心价值**: 不让 AI 默认到通用的"安全"设计选择，而是引导其做出大胆、独特、有意图的设计决策。
