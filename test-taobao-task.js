/**
 * 测试淘宝店铺数据抓取需求
 * 任务: 去淘宝找joc店铺前20销量的服装，头图，价格，销量，售卖数量，30天的评价
 */

const TaskAnalyzer = require('./src/task-analyzer');
const { BrowserAssistant } = require('./src/browser-assistant');

async function testTaobaoTask() {
  console.log('=== 淘宝店铺数据抓取测试 ===\n');

  const task = '去淘宝找joc店铺前20销量的服装，头图，价格，销量，售卖数量，30天的评价';

  // 1. 任务分析
  console.log('1. 任务分析...');
  const analyzer = new TaskAnalyzer();
  const analysis = analyzer.analyze(task);

  console.log(`   任务类型: ${analysis.taskType}`);
  console.log(`   任务目标: ${analysis.goal.description}`);
  console.log(`   复杂度: ${analysis.complexity.level}`);
  console.log(`   预计时间: ${analysis.complexity.estimatedTime}`);
  console.log(`   验收标准:`);
  analysis.acceptanceCriteria.forEach(c => console.log(`     - ${c}`));

  if (analysis.taskType !== 'research') {
    console.log('\n⚠️ 任务类型识别错误，应为 research');
    return;
  }

  console.log('\n✓ 任务类型识别正确\n');

  // 2. 浏览器选择
  console.log('2. 准备浏览器...');
  const assistant = new BrowserAssistant();

  const { question, report } = await assistant.prepareBrowserSelection();
  console.log(report);

  // 自动选择（模拟用户选择 auto）
  console.log('\n3. 初始化浏览器（自动选择）...');

  try {
    await assistant.initWithUserSelection('auto');
    console.log('✓ 浏览器初始化成功\n');

    // 3. 访问淘宝
    console.log('4. 访问淘宝...');
    const visitResult = await assistant.visit('https://www.taobao.com');

    if (visitResult.needLogin) {
      console.log('\n⚠️ 需要登录淘宝');
      console.log(`   提示: ${visitResult.pendingAction?.message}`);
      console.log('\n请在浏览器窗口中登录淘宝，登录后运行以下命令继续：');
      console.log('   node test-taobao-continue.js');
      return;
    }

    if (visitResult.success) {
      console.log('✓ 访问淘宝成功');
      console.log(`   标题: ${visitResult.title}`);

      // 4. 搜索店铺
      console.log('\n5. 搜索店铺 "joc"...');

      // 在搜索框输入关键词
      const searchInput = await assistant.page.$('#q');
      if (searchInput) {
        await searchInput.fill('joc店铺');
        await assistant.page.keyboard.press('Enter');
        await assistant.page.waitForTimeout(2000);

        console.log('✓ 搜索完成');

        // 获取当前页面内容
        const content = await assistant.page.evaluate(() => {
          return document.body.innerText.substring(0, 500);
        });
        console.log(`   页面内容预览: ${content.substring(0, 200)}...`);
      }

      console.log('\n测试完成！浏览器窗口保持打开，可以手动继续操作。');
    }
  } catch (e) {
    console.log(`\n错误: ${e.message}`);
    console.log('\n可能的原因:');
    console.log('  1. 浏览器未启动或未启用远程调试');
    console.log('  2. 网络问题');
    console.log('\n解决方案:');
    console.log('  运行 start-chrome-debug.bat 启动浏览器调试模式');
  }
}

testTaobaoTask().catch(console.error);
