#!/usr/bin/env bash

# 开发记忆采集脚本
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
