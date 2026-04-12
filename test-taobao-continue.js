/**
 * 淘宝登录后继续抓取数据
 * 需要在登录后运行此脚本
 */

const { BrowserAssistant } = require('./src/browser-assistant');

async function continueAfterLogin() {
  console.log('=== 淘宝数据抓取（登录后继续） ===\n');

  const assistant = new BrowserAssistant();

  try {
    // 连接到已打开的浏览器
    await assistant.initWithUserSelection('auto');

    console.log('当前页面:', await assistant.page.url());

    // 确认已登录
    const currentUrl = assistant.page.url();
    if (currentUrl.includes('login')) {
      console.log('⚠️ 当前仍在登录页面，请先完成登录');
      return;
    }

    console.log('✓ 已登录淘宝\n');

    // 1. 搜索店铺
    console.log('1. 搜索 "joc" 店铺...');

    // 尝试在搜索框输入
    const searchInput = await assistant.page.$('#q');
    if (searchInput) {
      await searchInput.fill('joc官方旗舰店');
      await assistant.page.keyboard.press('Enter');
      await assistant.page.waitForTimeout(3000);
      console.log('   已搜索');
    } else {
      // 首页可能没有搜索框，需要导航
      console.log('   导航到搜索页面...');
      await assistant.page.goto('https://s.taobao.com/search?q=joc官方旗舰店');
      await assistant.page.waitForTimeout(3000);
    }

    // 2. 点击店铺
    console.log('\n2. 查找店铺入口...');

    // 尝试找到店铺链接
    const shopLink = await assistant.page.$('a[href*="shop"]');
    if (shopLink) {
      await shopLink.click();
      await assistant.page.waitForTimeout(3000);
      console.log('   已进入店铺');
    } else {
      console.log('   未找到店铺链接，尝试直接访问...');
      // 尝试其他方式
    }

    // 3. 获取商品列表
    console.log('\n3. 获取商品数据...');

    const products = await assistant.page.evaluate(() => {
      const items = [];

      // 尝试多种选择器
      const selectors = [
        '.item',
        '.product',
        '.goods-item',
        '[class*="item"]',
        '[class*="product"]'
      ];

      let productElements = [];
      for (const sel of selectors) {
        productElements = Array.from(document.querySelectorAll(sel));
        if (productElements.length > 0) break;
      }

      // 只取前20个
      productElements.slice(0, 20).forEach((el, index) => {
        try {
          const title = el.querySelector('[class*="title"], h3, h2, a')?.innerText || '';
          const price = el.querySelector('[class*="price"], .price')?.innerText || '';
          const sales = el.querySelector('[class*="sales"], [class*="sold"]')?.innerText || '';
          const img = el.querySelector('img')?.src || '';

          items.push({
            index: index + 1,
            title: title.trim(),
            price: price.trim(),
            sales: sales.trim(),
            image: img
          });
        } catch (e) {
          // 忽略解析错误
        }
      });

      return items;
    });

    console.log(`   找到 ${products.length} 个商品\n`);

    // 4. 输出数据
    console.log('=== 商品数据（前20销量）===');
    console.log('');

    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title}`);
      console.log(`   价格: ${p.price}`);
      console.log(`   销量: ${p.sales}`);
      console.log(`   头图: ${p.image ? '有' : '无'}`);
      console.log('');
    });

    // 5. 保存数据
    const fs = require('fs').promises;
    const dataPath = './.flowharness/data/joc-products.json';
    await fs.mkdir(require('path').dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(products, null, 2));
    console.log(`\n✓ 数据已保存到 ${dataPath}`);

  } catch (e) {
    console.log(`\n错误: ${e.message}`);
    console.log('\n提示: 如果遇到问题，可以手动在浏览器中操作');
  }
}

continueAfterLogin().catch(console.error);
