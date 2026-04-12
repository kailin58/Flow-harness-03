/**
 * 用户选择浏览器的交互测试
 */

const { BrowserAssistant } = require('./src/browser-assistant');

async function testUserSelection() {
  console.log('=== 用户选择浏览器的交互测试 ===\n');

  const assistant = new BrowserAssistant();

  // 准备选择问题
  const { question, browsers, report } = await assistant.prepareBrowserSelection();

  // 显示检测报告
  console.log(report);

  // 显示选择问题
  console.log('\n请选择浏览器:');
  console.log('='.repeat(50));

  // 过滤出可选的选项
  const selectableOptions = question.options.filter(o => !o.disabled);

  selectableOptions.forEach((opt, index) => {
    if (opt.id === 'auto') {
      console.log(`[0] ${opt.label} - ${opt.description}`);
    } else {
      const num = index;
      console.log(`[${num}] ${opt.label} - ${opt.description}`);
    }
  });

  // 模拟用户选择（这里用命令行参数，实际使用时通过 AskUserQuestion）
  const args = process.argv.slice(2);
  const selection = args[0] || 'auto';

  console.log(`\n用户选择: ${selection}`);
  console.log('='.repeat(50));

  // 初始化选中的浏览器
  try {
    await assistant.initWithUserSelection(selection);
    console.log('\n✓ 浏览器初始化成功！');
    console.log('当前浏览器:', assistant.currentBrowser?.nameCN);

    // 访问测试
    console.log('\n访问百度测试...');
    const result = await assistant.visit('https://www.baidu.com');
    console.log('访问结果:', result.success ? '成功' : '失败');
    console.log('标题:', result.title || result.message);

  } catch (e) {
    console.error('错误:', e.message);
  }
}

testUserSelection().catch(console.error);
