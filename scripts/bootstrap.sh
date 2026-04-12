#!/usr/bin/env bash

# 项目基础启动脚本
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
