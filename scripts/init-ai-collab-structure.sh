#!/usr/bin/env bash

# ============================================
# AI 协作开发结构初始化脚本（可直接执行）
# --------------------------------------------
# 适用场景：
# - 已经在开发中的项目
# - 需要补齐 AI 协作开发层
# - 使用 Cursor / Claude Code / Codex
# - 不希望把三者职责写死
# - 不希望覆盖已有文件
#
# 使用方式：
#   1) 先把本文件放到项目的 scripts/ 目录下
#   2) 在项目根目录执行：
#      bash scripts/init-ai-collab-structure.sh
#
# 或者直接指定项目路径：
#      bash scripts/init-ai-collab-structure.sh /path/to/project
# ============================================

set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"

if [ ! -d "$ROOT_DIR" ]; then
  echo "[ERR] 目标目录不存在：$ROOT_DIR"
  exit 1
fi

cd "$ROOT_DIR"

# ---------- 日志输出 ----------
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[34m"
RESET="\033[0m"

log_info() { echo -e "${BLUE}[INFO]${RESET} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${RESET} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${RESET} $1"; }
log_err()  { echo -e "${RED}[ERR]${RESET} $1"; }

# ---------- 工具函数 ----------
ensure_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    log_ok "已创建目录：$dir"
  else
    log_warn "目录已存在，跳过：$dir"
  fi
}

write_if_missing() {
  local file="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  if [ ! -f "$file" ]; then
    mkdir -p "$(dirname "$file")"
    mv "$tmp" "$file"
    log_ok "已写入文件：$file"
  else
    rm -f "$tmp"
    log_warn "文件已存在，未覆盖：$file"
  fi
}

append_line_if_missing() {
  local file="$1"
  local line="$2"

  mkdir -p "$(dirname "$file")"
  touch "$file"

  if ! grep -Fqx "$line" "$file"; then
    echo "$line" >> "$file"
    log_ok "已追加到 $file：$line"
  else
    log_warn "已存在于 $file，跳过：$line"
  fi
}

make_executable_if_exists() {
  local file="$1"
  if [ -f "$file" ]; then
    chmod +x "$file"
    log_ok "已添加执行权限：$file"
  fi
}

ensure_gitkeep_if_empty() {
  local dir="$1"
  if [ -d "$dir" ] && [ -z "$(find "$dir" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
    touch "$dir/.gitkeep"
    log_ok "已创建空目录占位：$dir/.gitkeep"
  fi
}

# ---------- 基础检测 ----------
HAS_PACKAGE_JSON="false"
HAS_PACKAGES_DIR="false"

[ -f "package.json" ] && HAS_PACKAGE_JSON="true"
[ -d "packages" ] && HAS_PACKAGES_DIR="true"

log_info "开始初始化 AI 协作开发结构"
log_info "项目根目录：$ROOT_DIR"
log_info "package.json: $HAS_PACKAGE_JSON"
log_info "packages/: $HAS_PACKAGES_DIR"

# ---------- 创建目录 ----------
log_info "创建目录结构..."

ensure_dir "scripts"

# 工具适配层（只放适配，不放业务真源）
ensure_dir ".cursor/rules"
ensure_dir ".claude/commands"
ensure_dir ".claude/context"
ensure_dir ".claude/output-templates"
ensure_dir ".codex/tasks"
ensure_dir ".codex/plans"
ensure_dir ".codex/outputs"

# 文档真源
ensure_dir "docs/architecture"
ensure_dir "docs/decisions"
ensure_dir "docs/contracts/api"
ensure_dir "docs/contracts/prompts"
ensure_dir "docs/runbooks"
ensure_dir "docs/standards"

# 记忆层
ensure_dir "memory/ingest/chats/cursor"
ensure_dir "memory/ingest/chats/claude-code"
ensure_dir "memory/ingest/chats/codex"
ensure_dir "memory/ingest/docs"
ensure_dir "memory/ingest/prompts"
ensure_dir "memory/ingest/manual"
ensure_dir "memory/normalized/decisions"
ensure_dir "memory/normalized/bugs"
ensure_dir "memory/normalized/prompts"
ensure_dir "memory/writebacks/tasks"
ensure_dir "memory/writebacks/bugfixes"
ensure_dir "memory/writebacks/decisions"
ensure_dir "memory/writebacks/prompt-iterations"
ensure_dir "memory/exports/context-packs"
ensure_dir "memory/indexes/local"

# 提示词与评测
ensure_dir "prompts/system"
ensure_dir "prompts/tasks"
ensure_dir "prompts/roles"
ensure_dir "evals/datasets"
ensure_dir "evals/reports/daily"
ensure_dir "evals/scorers"

# 可选包目录：只在已有 packages/ 时补 memory-adapter
if [ "$HAS_PACKAGES_DIR" = "true" ]; then
  ensure_dir "packages/memory-adapter/src/interfaces"
fi

# 空目录占位
ensure_gitkeep_if_empty ".cursor/rules"
ensure_gitkeep_if_empty ".claude/commands"
ensure_gitkeep_if_empty ".claude/context"
ensure_gitkeep_if_empty ".claude/output-templates"
ensure_gitkeep_if_empty ".codex/tasks"
ensure_gitkeep_if_empty ".codex/plans"
ensure_gitkeep_if_empty ".codex/outputs"
ensure_gitkeep_if_empty "memory/indexes/local"
ensure_gitkeep_if_empty "evals/datasets"
ensure_gitkeep_if_empty "evals/reports/daily"
ensure_gitkeep_if_empty "evals/scorers"

# ---------- 根级文件 ----------
log_info "写入核心模板文件..."

write_if_missing "AGENTS.md" <<'EOF'
# AGENTS.md

## 项目真源
- docs/ 是长期真源
- docs/contracts/ 是接口与约束真源
- docs/decisions/ 是架构决策真源
- docs/standards/ 是开发与协作规范真源

## AI 协作原则
- 不预设 Cursor / Claude Code / Codex 的固定职责
- 优先使用当前上下文最完整的工具
- 优先使用当前任务表现最稳定的工具
- 同一任务允许中途切换工具
- 所有结论都必须回写 docs/ 或 memory/

## 必须遵守
- 修改前先阅读相关 docs/
- 涉及历史逻辑时先检索 memory/
- 实现前先给出计划
- 改动后必须执行必要的 lint / test / build
- 输出：变更说明、风险点、回滚点、后续建议

## 禁止项
- 未经明确授权，不允许修改数据库 schema
- 未经明确授权，不允许修改支付回调核心链路
- 未经明确授权，不允许修改鉴权核心链路
EOF

write_if_missing "CLAUDE.md" <<'EOF'
# CLAUDE.md

请先遵守 AGENTS.md。

## 工作方式
- 涉及已有逻辑时，优先阅读 docs/ 和 memory/
- 大范围改动前先输出计划
- 改动完成后输出影响范围、风险、回滚建议与后续建议

## 协作原则
- 不假设当前工具拥有固定职责
- 当前任务中，如果上下文不足或效果不佳，可以切换到更合适的工具
- 切换原因应记录到 memory/writebacks/

## 写回原则
- 修复 bug 后，将根因、修复方式、影响范围、风险写入 memory/writebacks/bugfixes/
- 新的架构或流程决策写入 docs/decisions/
- Prompt 迭代结论写入 memory/writebacks/prompt-iterations/
EOF

write_if_missing "README.md" <<'EOF'
# 项目说明

## 目录说明
- docs/：长期真源文档
- memory/：开发记忆层
- prompts/：提示词资产
- evals/：评测用例与报告
- scripts/：自动化脚本

## AI 协作说明
本项目支持 Cursor / Claude Code / Codex 协作开发。
但不预设固定分工，工具选择由任务上下文、当前状态和实际效果决定。
EOF

# ---------- docs ----------
write_if_missing "docs/standards/tooling-policy.md" <<'EOF'
# 工具选择策略

## 原则
- 不预设固定工具职责
- 优先使用当前上下文最完整的工具
- 优先使用当前任务表现最稳定的工具
- 同一任务中允许多次切换工具
- 任何重要结论必须统一回写 docs/ 或 memory/

## 每次任务都要记录的最少信息
- 当前任务目标
- 本次实际使用的工具
- 是否发生切换
- 切换原因
- 最终输出文件
- 风险点
- 后续建议
EOF

write_if_missing "docs/architecture/overview.md" <<'EOF'
# 架构总览

## 系统目标
请补充系统目标。

## AI 协作层说明
AI 协作层不等于某一个工具的配置集合。
它由以下几部分组成：
- docs/：长期真源
- memory/：开发记忆层
- prompts/：提示词资产
- evals/：评测数据与报告
- .cursor / .claude / .codex：工具适配层
EOF

write_if_missing "docs/architecture/memory-layer.md" <<'EOF'
# 记忆层设计

## 目标
统一沉淀开发过程中的长期知识，而不是把知识散落在聊天记录中。

## 数据来源
- docs/
- Prompt 模板
- Bug 修复记录
- AI 对话导出
- 评测结果

## 读取流程
任务开始前：
1. 先明确任务目标
2. 再检索相关 docs/
3. 再检索 memory/ 中的历史经验
4. 最后组合为当前上下文

## 写入流程
任务结束后：
1. 将新结论写入 docs/ 或 memory/writebacks/
2. 将可复用信息整理到 prompts/ 或 memory/normalized/
EOF

write_if_missing "docs/architecture/collaboration-workflow.md" <<'EOF'
# AI 协作工作流

## 核心原则
- 不写死工具分工
- 以任务状态和上下文完整度决定当前使用哪个工具
- 同一任务可以跨工具流转
- 重要结果统一落到 docs/ 和 memory/

## 推荐流程
1. 明确任务
2. 搜索 docs/ 与 memory/
3. 生成计划
4. 实现与验证
5. 输出风险与回滚建议
6. 回写 memory/
7. 必要时更新 docs/
EOF

write_if_missing "docs/decisions/ADR-001-ai-collaboration-structure.md" <<'EOF'
# ADR-001 AI 协作层结构

## 状态
Accepted

## 背景
项目已进入开发阶段，需要引入 Cursor、Claude Code、Codex 的协作开发机制。
同时需要避免把不同工具的职责写死，导致流程僵化。

## 决策
采用以下结构：
- docs/ 作为长期真源
- memory/ 作为开发记忆层
- prompts/ 作为提示词资产
- evals/ 作为评测层
- .cursor / .claude / .codex 仅作为工具适配层
EOF

write_if_missing "docs/contracts/prompts/system-contract.md" <<'EOF'
# Prompt 系统契约

## 基本要求
- 输入应包含任务目标、上下文、限制条件、输出格式
- 输出应尽量结构化
- 涉及代码时，需给出影响范围和风险说明
- 涉及决策时，需说明依据与后续建议
EOF

write_if_missing "docs/runbooks/ai-collaboration.md" <<'EOF'
# AI 协作运行手册

## 开工前
- 明确任务目标
- 先阅读相关 docs/
- 检索 memory/ 中的历史经验
- 决定当前最适合使用的工具

## 进行中
- 先计划，再实现
- 必要时切换工具
- 切换时记录原因
- 改动后执行验证

## 完成后
- 输出变更说明
- 输出风险点与回滚点
- 生成 writeback
- 必要时更新 docs/
EOF

# ---------- memory / prompts ----------
write_if_missing "memory/README.md" <<'EOF'
# Memory 目录说明

## 作用
用于沉淀项目开发过程中的长期记忆，而不是替代正式业务数据库。

## 原则
- 长期业务规则应进入 docs/
- 临时过程信息可先进入 memory/
- 最终可复用经验应从 memory/ 提炼回 docs/ 或 prompts/
EOF

write_if_missing "prompts/system/global.md" <<'EOF'
# 全局系统提示词

你正在参与一个已经在开发中的项目。
请优先遵守以下原则：
1. docs/ 是长期真源
2. memory/ 是开发记忆层
3. 不预设 Cursor / Claude Code / Codex 固定分工
4. 当前任务应优先使用上下文最完整、效果最好的工具
5. 重要结论必须落到 docs/ 或 memory/
EOF

write_if_missing "prompts/tasks/implement-feature.md" <<'EOF'
# 功能实现任务模板

请按以下顺序执行：
1. 先理解任务目标
2. 再检索相关 docs/ 与 memory/
3. 给出计划
4. 实现改动
5. 说明影响范围
6. 输出风险与后续建议
EOF

write_if_missing "prompts/tasks/fix-bug.md" <<'EOF'
# Bug 修复任务模板

请按以下顺序执行：
1. 描述问题与复现条件
2. 给出根因假设
3. 检索历史修复记录
4. 输出修复方案
5. 修改后说明影响范围
6. 生成 writeback 所需信息
EOF

write_if_missing "prompts/roles/reviewer.md" <<'EOF'
# Reviewer 角色提示词

你的目标是检查：
- 是否符合 docs/contracts/
- 是否符合 docs/standards/
- 是否有重复实现
- 是否缺失测试
- 是否缺失文档更新
EOF

# ---------- 工具适配层 ----------
write_if_missing ".cursor/rules/00-global.mdc" <<'EOF'
# 全局规则
- 先遵守 AGENTS.md
- 开始任务前先看 docs/ 和 memory/
- 不预设工具固定职责
- 重要结论必须回写到 docs/ 或 memory/
EOF

write_if_missing ".claude/commands/start-task.md" <<'EOF'
# 开始任务模板

## 步骤
1. 明确任务目标
2. 搜索相关 docs/
3. 搜索相关 memory/
4. 输出计划
5. 开始实现
6. 输出风险与后续建议
EOF

write_if_missing ".claude/output-templates/change-summary.md" <<'EOF'
# 变更摘要模板

## 本次目标
## 实际完成
## 涉及文件
## 风险点
## 回滚建议
## 后续建议
EOF

write_if_missing ".codex/tasks/task-template.md" <<'EOF'
# 通用任务模板

## 任务目标
## 背景
## 约束
## 当前已知上下文
## 输出要求
## 验收标准
EOF

# ---------- 可执行脚本 ----------
write_if_missing "scripts/bootstrap.sh" <<'EOF'
#!/usr/bin/env bash

# 项目基础启动脚本（示例）
# 说明：
# - 只做最基础环境检查和依赖安装提示
# - 不强行覆盖你现有项目启动方式

set -euo pipefail

echo "[INFO] 开始执行 bootstrap"

if [ -f "package.json" ]; then
  echo "[INFO] 检测到 package.json"
  if command -v pnpm >/dev/null 2>&1; then
    echo "[INFO] 可执行：pnpm install"
  elif command -v npm >/dev/null 2>&1; then
    echo "[INFO] 可执行：npm install"
  else
    echo "[WARN] 未检测到 pnpm 或 npm，请手动安装依赖"
  fi
else
  echo "[WARN] 未检测到 package.json，请按项目实际情况调整 bootstrap.sh"
fi
EOF

write_if_missing "scripts/ingest-memory.sh" <<'EOF'
#!/usr/bin/env bash

# 开发记忆采集脚本（可直接用）
# 作用：
# 1. 将 docs/ 复制到 memory/ingest/docs/
# 2. 将 prompts/ 复制到 memory/ingest/prompts/
# 3. 将工具配置目录复制到 memory/ingest/manual/
# 4. 支持附加手动传入路径进行归档
#
# 用法：
#   bash scripts/ingest-memory.sh
#   bash scripts/ingest-memory.sh path1 path2 ...

set -euo pipefail

DATE_STR="$(date +%F_%H-%M-%S)"
DOCS_TARGET="memory/ingest/docs/$DATE_STR"
PROMPTS_TARGET="memory/ingest/prompts/$DATE_STR"
MANUAL_TARGET="memory/ingest/manual/$DATE_STR"

mkdir -p "$DOCS_TARGET" "$PROMPTS_TARGET" "$MANUAL_TARGET"

echo "[INFO] 开始采集项目资料到 memory/ingest/"

if [ -d "docs" ]; then
  cp -R "docs" "$DOCS_TARGET/docs"
  echo "[OK] 已采集 docs/ -> $DOCS_TARGET/docs"
else
  echo "[WARN] 未找到 docs/，跳过"
fi

if [ -d "prompts" ]; then
  cp -R "prompts" "$PROMPTS_TARGET/prompts"
  echo "[OK] 已采集 prompts/ -> $PROMPTS_TARGET/prompts"
else
  echo "[WARN] 未找到 prompts/，跳过"
fi

for dir in ".cursor" ".claude" ".codex"; do
  if [ -d "$dir" ]; then
    cp -R "$dir" "$MANUAL_TARGET/"
    echo "[OK] 已采集 $dir -> $MANUAL_TARGET/"
  fi
done

if [ "$#" -gt 0 ]; then
  echo "[INFO] 开始采集手动指定路径"
  for p in "$@"; do
    if [ -e "$p" ]; then
      base_name="$(basename "$p")"
      cp -R "$p" "$MANUAL_TARGET/$base_name"
      echo "[OK] 已采集 $p -> $MANUAL_TARGET/$base_name"
    else
      echo "[WARN] 路径不存在，跳过：$p"
    fi
  done
fi

echo "[OK] 采集完成"
EOF

write_if_missing "scripts/writeback-memory.sh" <<'EOF'
#!/usr/bin/env bash

# 开发任务回写脚本（可直接用）
# 用法示例：
# bash scripts/writeback-memory.sh \
#   --type bugfix \
#   --title "修复登录超时问题" \
#   --tool "Claude Code" \
#   --switched "yes" \
#   --switch-reason "需要更完整的项目上下文"

set -euo pipefail

TYPE="task"
TITLE="未命名任务"
TOOL="未记录"
SWITCHED="no"
SWITCH_REASON=""
RISKS=""
NEXT_STEPS=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --type)
      TYPE="${2:-task}"; shift 2 ;;
    --title)
      TITLE="${2:-未命名任务}"; shift 2 ;;
    --tool)
      TOOL="${2:-未记录}"; shift 2 ;;
    --switched)
      SWITCHED="${2:-no}"; shift 2 ;;
    --switch-reason)
      SWITCH_REASON="${2:-}"; shift 2 ;;
    --risks)
      RISKS="${2:-}"; shift 2 ;;
    --next-steps)
      NEXT_STEPS="${2:-}"; shift 2 ;;
    *)
      echo "[WARN] 未识别参数，跳过：$1"; shift ;;
  esac
done

case "$TYPE" in
  bugfix) OUTPUT_DIR="memory/writebacks/bugfixes" ;;
  decision) OUTPUT_DIR="memory/writebacks/decisions" ;;
  prompt) OUTPUT_DIR="memory/writebacks/prompt-iterations" ;;
  *) OUTPUT_DIR="memory/writebacks/tasks" ;;
esac

mkdir -p "$OUTPUT_DIR"
DATE_STR="$(date +%F_%H-%M-%S)"
SLUG="$(echo "$TITLE" | tr '[:space:]/' '--' | tr -cd '[:alnum:]-_一-龥')"
[ -z "$SLUG" ] && SLUG="untitled"
OUTPUT_FILE="$OUTPUT_DIR/${DATE_STR}-${SLUG}.md"

cat > "$OUTPUT_FILE" <<EOF2
# 开发任务回写记录

## 基本信息
- 类型：$TYPE
- 标题：$TITLE
- 时间：$(date '+%F %T')
- 本次使用工具：$TOOL
- 是否切换工具：$SWITCHED
- 切换原因：$SWITCH_REASON

## 背景
请补充本次任务背景。

## 根因 / 核心问题
请补充分析。

## 处理方式
请补充本次实际处理方式。

## 涉及文件
- 请补充

## 风险点
$RISKS

## 回滚建议
请补充回滚建议。

## 后续建议
$NEXT_STEPS
EOF2

echo "[OK] 已生成回写文件：$OUTPUT_FILE"
EOF

write_if_missing "scripts/pack-context.mjs" <<'EOF'
/**
 * 任务上下文打包脚本（可直接用）
 * 用法：
 *   node scripts/pack-context.mjs "修复登录超时问题"
 *
 * 说明：
 * - 不依赖第三方包
 * - 基于关键词对 docs/、memory/、prompts/ 做轻量搜索
 * - 生成上下文包到 memory/exports/context-packs/
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.log('用法：node scripts/pack-context.mjs "你的任务描述"');
  process.exit(0);
}

const searchRoots = [
  "docs",
  "memory/normalized",
  "memory/writebacks",
  "prompts/system",
  "prompts/tasks",
  "prompts/roles",
];

const allowedExts = new Set([".md", ".txt", ".json", ".yml", ".yaml", ".js", ".ts", ".mjs"]);

function splitKeywords(text) {
  return text
    .split(/[\s,，。；;:：/\\|()\[\]{}"'`]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length >= 2);
}

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.name === ".git" || item.name === "node_modules") continue;
    if (item.isDirectory()) {
      walk(fullPath, results);
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (allowedExts.has(ext)) results.push(fullPath);
    }
  }
  return results;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function scoreFile(filePath, content, keywords) {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();
  let score = 0;
  const hitLines = [];

  for (const keyword of keywords) {
    if (lowerPath.includes(keyword)) score += 10;
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = (lowerContent.match(new RegExp(safeKeyword, "g")) || []).length;
    score += Math.min(occurrences, 20);
    if (occurrences > 0) {
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword)) {
          hitLines.push(line.trim());
          if (hitLines.length >= 3) break;
        }
      }
    }
  }

  return { score, hitLines: Array.from(new Set(hitLines)).slice(0, 3) };
}

const keywords = Array.from(new Set(splitKeywords(task)));
let allFiles = [];
for (const dir of searchRoots) {
  const absDir = path.join(root, dir);
  if (fs.existsSync(absDir)) allFiles.push(...walk(absDir));
}

if (allFiles.length === 0) {
  console.log("[WARN] 未找到可搜索文件，请先补充 docs/、memory/、prompts/");
  process.exit(0);
}

const ranked = allFiles
  .map(filePath => {
    const content = safeRead(filePath);
    const { score, hitLines } = scoreFile(filePath, content, keywords);
    return { filePath, score, hitLines };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12);

const outDir = path.join(root, "memory/exports/context-packs");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);

const lines = [];
lines.push("# 任务上下文包");
lines.push("");
lines.push("## 当前任务");
lines.push(task);
lines.push("");
lines.push("## 关键词");
lines.push(keywords.length ? keywords.map(k => `- ${k}`).join("\n") : "- 无");
lines.push("");

if (ranked.length === 0) {
  lines.push("## 检索结果");
  lines.push("未命中相关内容。");
  lines.push("");
  lines.push("## 建议");
  lines.push("- 先补充 docs/");
  lines.push("- 或先将历史经验写入 memory/");
} else {
  lines.push("## 检索结果");
  lines.push("");
  ranked.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${path.relative(root, item.filePath)}`);
    lines.push(`- 相关度分数：${item.score}`);
    if (item.hitLines.length > 0) {
      lines.push("- 关键片段：");
      item.hitLines.forEach(line => lines.push(`  - ${line}`));
    }
    lines.push("");
  });
}

lines.push("## 使用建议");
lines.push("- 先阅读前 3 个高相关文件");
lines.push("- 再决定当前最适合使用哪个工具");
lines.push("- 不预设固定工具职责");
lines.push("- 完成后记得执行 writeback");

fs.writeFileSync(outFile, lines.join("\n"), "utf-8");
console.log(`[OK] 已生成上下文包：${outFile}`);
EOF

write_if_missing "scripts/run-evals.mjs" <<'EOF'
/**
 * AI 协作层基础评测脚本（可直接用）
 * 用法：
 *   node scripts/run-evals.mjs
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

function countFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) count += countFilesRecursively(fullPath);
    else if (item.isFile()) count += 1;
  }
  return count;
}

const stats = {
  docs: countFilesRecursively(path.join(root, "docs")),
  memory: countFilesRecursively(path.join(root, "memory")),
  prompts: countFilesRecursively(path.join(root, "prompts")),
  evalDatasets: countFilesRecursively(path.join(root, "evals/datasets")),
};

const reportDir = path.join(root, "evals/reports/daily");
fs.mkdirSync(reportDir, { recursive: true });
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);

const lines = [
  "# AI 协作层基础评测日报",
  "",
  `生成时间：${new Date().toLocaleString()}`,
  "",
  "## 当前规模统计",
  `- docs 文件数：${stats.docs}`,
  `- memory 文件数：${stats.memory}`,
  `- prompts 文件数：${stats.prompts}`,
  `- eval 数据集文件数：${stats.evalDatasets}`,
  "",
  "## 观察建议",
  "- 若 docs 文件长期很少，说明长期真源沉淀不足",
  "- 若 memory/writebacks 文件很少，说明任务回写流程未落地",
  "- 若 prompts 资产很少，说明提示词复用体系还不完整",
  "- 若 eval 数据集很少，说明评测体系还比较初期",
];

fs.writeFileSync(reportFile, lines.join("\n"), "utf-8");
console.log(`[OK] 已生成评测报告：${reportFile}`);
EOF

# 可选：memory-adapter 接口模板
if [ -d "packages/memory-adapter/src/interfaces" ]; then
  write_if_missing "packages/memory-adapter/src/interfaces/MemoryService.ts" <<'EOF'
/**
 * 统一的 MemoryService 接口
 * 说明：
 * - 上层业务不要直接绑死某一个记忆实现
 * - 可以先接 MemPalace
 * - 后续也可以切到 local-json / pgvector / 其他实现
 */

export interface MemorySearchResult {
  id: string;
  title: string;
  source: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryTaskInput {
  task: string;
  scope?: string[];
  limit?: number;
}

export interface MemoryService {
  ingest(items: Array<Record<string, unknown>>): Promise<void>;
  search(input: MemoryTaskInput): Promise<MemorySearchResult[]>;
  writeDecision(item: Record<string, unknown>): Promise<void>;
  writeBugFix(item: Record<string, unknown>): Promise<void>;
  buildContext(input: MemoryTaskInput): Promise<string>;
}
EOF
fi

# ---------- 权限 ----------
make_executable_if_exists "scripts/bootstrap.sh"
make_executable_if_exists "scripts/ingest-memory.sh"
make_executable_if_exists "scripts/writeback-memory.sh"
make_executable_if_exists "scripts/init-ai-collab-structure.sh"

# ---------- .gitignore ----------
log_info "更新 .gitignore ..."
append_line_if_missing ".gitignore" "node_modules/"
append_line_if_missing ".gitignore" "dist/"
append_line_if_missing ".gitignore" "build/"
append_line_if_missing ".gitignore" "coverage/"
append_line_if_missing ".gitignore" ".next/"
append_line_if_missing ".gitignore" ".turbo/"
append_line_if_missing ".gitignore" ".env"
append_line_if_missing ".gitignore" ".env.local"
append_line_if_missing ".gitignore" "tmp/"
append_line_if_missing ".gitignore" "memory/indexes/"
append_line_if_missing ".gitignore" "memory/snapshots/"
append_line_if_missing ".gitignore" "memory/exports/search-results/"
append_line_if_missing ".gitignore" "*.log"

# ---------- 完成提示 ----------
log_ok "AI 协作开发结构初始化完成"
echo
if [ "$HAS_PACKAGE_JSON" = "true" ]; then
  echo "建议把下面这些 scripts 手动加到 package.json："
  echo
  echo '  "scripts": {'
  echo '    "ai:init": "bash scripts/init-ai-collab-structure.sh",'
  echo '    "ai:bootstrap": "bash scripts/bootstrap.sh",'
  echo '    "ai:ingest": "bash scripts/ingest-memory.sh",'
  echo '    "ai:writeback": "bash scripts/writeback-memory.sh",'
  echo '    "ai:context": "node scripts/pack-context.mjs",'
  echo '    "ai:evals": "node scripts/run-evals.mjs"'
  echo '  }'
  echo
fi

echo "你现在可以直接执行："
echo "1) bash scripts/init-ai-collab-structure.sh"
echo "2) node scripts/pack-context.mjs \"修复登录超时问题\""
echo "3) bash scripts/writeback-memory.sh --type bugfix --title \"修复登录超时问题\" --tool \"Claude Code\""
