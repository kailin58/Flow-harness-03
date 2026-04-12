const { chromium } = require('playwright');

async function test() {
  console.log('=== 简单浏览器测试 ===\n');

  let browser = null;
  try {
    console.log('启动浏览器...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized']
    });

    console.log('创建页面...');
    const context = await browser.newContext({
      viewport: null
    });
    const page = await context.newPage();

    console.log('访问淘宝...');
    await page.goto('https://www.taobao.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const title = await page.title();
    const url = page.url();

    console.log('\n结果:');
    console.log('  标题:', title);
    console.log('  URL:', url);
    console.log('\n浏览器窗口已打开，请查看！');
    console.log('等待 10 秒后关闭...');

    await new Promise(r => setTimeout(r, 10000));

    console.log('测试完成！');

  } catch(e) {
    console.log('错误:', e.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

test();
