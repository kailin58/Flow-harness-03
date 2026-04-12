#!/usr/bin/env bash

# 开发任务回写脚本
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
