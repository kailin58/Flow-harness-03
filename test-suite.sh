#!/bin/bash
# Flow Harness 测试套件
# 测试各种场景，验证系统功能

echo "🧪 Flow Harness 测试套件"
echo "========================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TOTAL=0
PASSED=0
FAILED=0

# 测试函数
run_test() {
    local test_name=$1
    local command=$2
    local expected_exit_code=${3:-0}

    TOTAL=$((TOTAL + 1))
    echo "测试 $TOTAL: $test_name"

    # 执行命令
    eval "$command" > /dev/null 2>&1
    local exit_code=$?

    # 检查结果
    if [ $exit_code -eq $expected_exit_code ]; then
        echo -e "${GREEN}✓ 通过${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ 失败${NC} (期望退出码: $expected_exit_code, 实际: $exit_code)"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# 开始测试
echo "📋 基础功能测试"
echo "----------------"

run_test "帮助命令" \
    "node src/cli.js --help"

run_test "版本命令" \
    "node src/cli.js --version"

run_test "列出工作流" \
    "node src/cli.js list"

run_test "查看统计" \
    "node src/cli.js stats"

run_test "查看优化建议" \
    "node src/cli.js optimize"

echo ""
echo "📋 Supervisor 功能测试"
echo "----------------------"

run_test "Bug修复任务" \
    "node src/cli.js supervisor '修复登录Bug'"

run_test "功能开发任务" \
    "node src/cli.js supervisor '实现用户注册功能'"

run_test "重构任务" \
    "node src/cli.js supervisor '重构数据库连接模块'"

run_test "文档编写任务" \
    "node src/cli.js supervisor '编写API文档'"

run_test "测试编写任务" \
    "node src/cli.js supervisor '编写单元测试'"

echo ""
echo "📋 Dry-run 模式测试"
echo "-------------------"

run_test "Dry-run: 功能开发" \
    "node src/cli.js supervisor '实现支付功能' --dry-run"

run_test "Dry-run: Bug修复" \
    "node src/cli.js supervisor '修复内存泄漏' --dry-run"

echo ""
echo "📋 安全检测测试"
echo "---------------"

run_test "安全功能检测（应失败）" \
    "node src/cli.js supervisor '实现用户认证功能，包含密码加密'" \
    1

run_test "破坏性变更检测（应失败）" \
    "node src/cli.js supervisor '修改数据库schema删除用户表'" \
    1

echo ""
echo "📋 复杂场景测试"
echo "---------------"

run_test "多步骤任务" \
    "node src/cli.js supervisor '实现用户登录功能并编写测试'"

run_test "高风险任务" \
    "node src/cli.js supervisor '修改支付API的数据库schema'" \
    1

run_test "性能优化任务" \
    "node src/cli.js supervisor '优化数据库查询性能'"

echo ""
echo "📋 策略检查测试"
echo "---------------"

run_test "文件访问检查: 允许" \
    "node src/cli.js check-file src/index.js"

run_test "文件访问检查: 拒绝" \
    "node src/cli.js check-file .env" \
    1

run_test "命令检查: 允许" \
    "node src/cli.js check-cmd 'npm test'"

run_test "命令检查: 拒绝" \
    "node src/cli.js check-cmd 'rm -rf /'" \
    1

echo ""
echo "========================"
echo "📊 测试结果汇总"
echo "========================"
echo -e "总测试数: $TOTAL"
echo -e "${GREEN}通过: $PASSED${NC}"
echo -e "${RED}失败: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo -e "\n${RED}❌ 有 $FAILED 个测试失败${NC}"
    exit 1
fi
