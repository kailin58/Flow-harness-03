/**
 * 测试网站策略管理功能
 * - 白名单管理
 * - 元素位置记忆
 * - 对比识别验证
 * - 不同网站不同策略
 */

const { BrowserAssistant } = require('./src/browser-assistant');
const { SmartBrowser } = require('./src/smart-browser');
const { SiteStrategy } = require('./src/site-strategy');

const GLOBAL_TIMEOUT = 120000;

async function testSiteStrategy() {
  const timeoutId = setTimeout(() => {
    console.log('\n全局超时，退出...');
    process.exit(0);
  }, GLOBAL_TIMEOUT);

  console.log('=== 网站策略管理测试 ===\n');

  // 1. 测试策略管理器
  console.log('1. 测试策略管理器...');
  const strategy = new SiteStrategy();
  await strategy.init();

  // 测试获取策略
  const baiduStrategy = strategy.getStrategy('https://www.baidu.com');
  console.log('   百度策略:', baiduStrategy.name);
  console.log('   点击方法顺序:', baiduStrategy.strategies.click);
  console.log('   反检测延迟:', baiduStrategy.antiDetection.humanDelay);

  const taobaoStrategy = strategy.getStrategy('https://www.taobao.com');
  console.log('   淘宝策略:', taobaoStrategy.name);
  console.log('   点击方法顺序:', taobaoStrategy.strategies.click);
  console.log('   反检测延迟:', taobaoStrategy.antiDetection.humanDelay);

  // 2. 初始化浏览器
  console.log('\n2. 初始化浏览器...');
  const assistant = new BrowserAssistant();
  await assistant.initWithUserSelection('auto');

  const page = assistant.page;
  const smart = new SmartBrowser(page);

  // 3. 测试智能导航（带策略）
  console.log('\n3. 测试智能导航（带策略）...');
  const navResult = await smart.smartNavigate('https://www.baidu.com');
  console.log('   导航结果:', navResult.success ? '成功' : '失败');
  console.log('   使用策略:', navResult.strategy);

  // 4. 测试记忆元素位置
  console.log('\n4. 测试记忆元素位置...');

  // 查找搜索框
  const searchInput = await page.$('#kw');
  if (searchInput) {
    try {
      const box = await searchInput.boundingBox();
      if (box) {
        // 记忆位置
        await smart.rememberElement('searchInput', box, {
          selectors: ['#kw', 'input.s_ipt']
        });
        console.log('   已记忆搜索框位置:', Math.round(box.x), 'x', Math.round(box.y));
      }
    } catch (e) {
      console.log('   搜索框不可见');
    }
  }

  // 5. 测试查找记忆的元素
  console.log('\n5. 测试查找记忆的元素...');
  const remembered = smart.findRememberedElement('searchInput');
  if (remembered) {
    console.log('   找到记忆:', remembered.position);
    console.log('   准确度:', (remembered.accuracy * 100).toFixed(0) + '%');
  } else {
    console.log('   未找到记忆');
  }

  // 6. 测试策略感知输入
  console.log('\n6. 测试策略感知输入...');
  try {
    const inputResult = await smart.smartInput('搜索', '测试文字', {
      selectors: ['#kw', 'input.s_ipt']
    });
    console.log('   输入方法:', inputResult.method);
  } catch (e) {
    console.log('   输入失败:', e.message);
  }

  await smart.human.randomDelay(500, 1000);

  // 7. 测试策略感知点击按钮
  console.log('\n7. 测试策略感知点击按钮...');
  try {
    const clickResult = await smart.visualClick('百度一下', {
      elementKey: 'searchButton',
      selectors: ['#su', 'input[type="submit"]']
    });
    console.log('   点击方法:', clickResult.method);
    console.log('   点击位置:', Math.round(clickResult.position.x), 'x', Math.round(clickResult.position.y));
  } catch (e) {
    console.log('   点击失败:', e.message);
  }

  await smart.human.randomDelay(1000, 2000);

  // 8. 测试白名单
  console.log('\n8. 测试白名单...');
  await smart.addToWhitelist('https://www.baidu.com');
  console.log('   百度是否在白名单:', smart.isWhitelisted());

  // 9. 测试准确度报告
  console.log('\n9. 准确度报告...');
  const report = smart.getAccuracyReport();
  console.log('   总体统计:');
  console.log('     总操作:', report.overall.total);
  console.log('     成功:', report.overall.success);
  console.log('     准确度:', (report.overall.accuracy * 100).toFixed(1) + '%');

  if (Object.keys(report.byDomain).length > 0) {
    console.log('   按网站:');
    for (const [domain, stats] of Object.entries(report.byDomain)) {
      console.log(`     ${domain}: ${(stats.accuracy * 100).toFixed(0)}% (${stats.success}/${stats.total})`);
    }
  }

  if (Object.keys(report.byMethod).length > 0) {
    console.log('   按方法:');
    for (const [method, stats] of Object.entries(report.byMethod)) {
      console.log(`     ${method}: ${(stats.accuracy * 100).toFixed(0)}% (${stats.success}/${stats.total})`);
    }
  }

  // 10. 导航到淘宝测试不同策略
  console.log('\n10. 测试不同网站策略（淘宝）...');
  try {
    const tbNavResult = await smart.smartNavigate('https://www.taobao.com');
    console.log('   导航结果:', tbNavResult.success ? '成功' : '失败');
    console.log('   使用策略:', tbNavResult.strategy);

    // 等待页面加载
    await smart.human.randomDelay(2000, 3000);

    // 显示当前策略
    const currentStrategy = smart.currentStrategy;
    if (currentStrategy) {
      console.log('   淘宝点击策略:', currentStrategy.strategies.click);
      console.log('   淘宝反检测设置:', currentStrategy.antiDetection);
    }
  } catch (e) {
    console.log('   淘宝导航失败:', e.message);
  }

  // 11. 最终状态
  console.log('\n11. 最终状态...');
  const status = smart.getStealthStatus();
  console.log('   操作次数:', status.actionCount);
  console.log('   错误次数:', status.errorCount);
  console.log('   当前策略:', status.strategy);
  console.log('   是否隐蔽:', smart.isStealthy() ? '✓ 安全' : '⚠ 可能被检测');

  console.log('\n=== 测试完成 ===');

  clearTimeout(timeoutId);
  await assistant.close();
}

testSiteStrategy().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
