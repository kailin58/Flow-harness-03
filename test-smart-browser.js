/**
 * 测试智能浏览器操作
 * 验证混合方案绕过反爬检测
 */

const { BrowserAssistant } = require('./src/browser-assistant');
const { SmartBrowser } = require('./src/smart-browser');

async function testSmartBrowser() {
  console.log('=== 智能浏览器测试（混合方案）===\n');

  // 1. 初始化浏览器
  console.log('1. 初始化浏览器...');
  const assistant = new BrowserAssistant();
  await assistant.initWithUserSelection('auto');

  const page = assistant.page;
  const smart = new SmartBrowser(page);

  console.log('   浏览器已初始化\n');

  // 2. 测试智能导航
  console.log('2. 测试智能导航...');
  const navResult = await smart.smartNavigate('https://www.baidu.com');
  console.log('   导航成功:', navResult.success);
  console.log('   是否被拦截:', navResult.blocked || false);
  console.log('   隐蔽状态:', smart.isStealthy() ? '安全' : '可能被检测');

  // 3. 测试智能点击
  console.log('\n3. 测试智能点击...');

  // 先尝试直接点击
  try {
    const clickResult = await smart.smartClick('#su', {
      expected: '#su ~ input'
    });
    console.log('   点击方法:', clickResult.method);
    console.log('   验证结果:', clickResult.verified);
  } catch (e) {
    console.log('   点击失败:', e.message);
  }

  // 4. 测试智能输入
  console.log('\n4. 测试智能输入...');
  try {
    const typeResult = await smart.smartType('#kw', '测试文字');
    console.log('   输入成功:', typeResult.success);
  } catch (e) {
    console.log('   输入失败:', e.message);
  }

  // 5. 测试智能等待和提取
  console.log('\n5. 测试智能提取...');
  const allLinks = await smart.smartExtractAll('a', async (el) => {
    return await el.getAttribute('href');
  });
  console.log('   提取到链接数:', allLinks.length);

  // 6. 显示最终状态
  console.log('\n6. 最终状态...');
  const status = smart.getStealthStatus();
  console.log('   操作次数:', status.actionCount);
  console.log('   错误次数:', status.errorCount);
  console.log('   是否隐蔽:', smart.isStealthy() ? '✓ 安全' : '⚠ 可能被检测');

  console.log('\n=== 测试完成 ===');
}

testSmartBrowser().catch(console.error);
