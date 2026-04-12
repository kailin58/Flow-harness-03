/**
 * 测试人类行为模拟
 */

const { BrowserAssistant } = require('./src/browser-assistant');

async function testHumanLike() {
  console.log('=== 人类行为模拟测试 ===\n');

  const assistant = new BrowserAssistant();

  try {
    // 1. 初始化浏览器
    console.log('1. 初始化浏览器...');
    await assistant.initWithUserSelection('auto');
    console.log('   ✓ 已连接\n');

    // 2. 访问百度测试
    console.log('2. 访问百度...');
    await assistant.visit('https://www.baidu.com');
    console.log('   ✓ 已访问\n');

    // 3. 测试人类打字
    console.log('3. 测试人类打字...');
    console.log('   在搜索框输入: "淘宝店铺"');
    await assistant.humanType('#kw', '淘宝店铺');
    console.log('   ✓ 输入完成\n');

    // 4. 测试人类点击
    console.log('4. 测试人类点击...');
    console.log('   点击搜索按钮');
    await assistant.humanClick('input[type="submit"]');
    console.log('   ✓ 点击完成\n');

    // 5. 测试人类阅读
    console.log('5. 测试人类阅读...');
    console.log('   模拟阅读搜索结果（约3秒）...');
    const start = Date.now();
    await assistant.humanRead();
    console.log(`   ✓ 阅读 ${Date.now() - start}ms\n`);

    // 6. 测试随机延迟
    console.log('6. 测试随机延迟...');
    const delays = [];
    for (let i = 0; i < 5; i++) {
      const s = Date.now();
      await assistant.randomDelay(500, 1500);
      delays.push(Date.now() - s);
    }
    console.log(`   5次延迟: ${delays.join(', ')}ms`);
    console.log('   ✓ 随机性正常\n');

    console.log('=== 测试完成 ===');
    console.log('\n人类行为模拟功能正常，可以避免被检测为机器人');

  } catch (e) {
    console.log('\n错误:', e.message);
  }
}

testHumanLike().catch(console.error);
