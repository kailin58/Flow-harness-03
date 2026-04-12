/**
 * 电商网站实战测试
 * 测试淘宝、京东、拼多多的实际抓取效果
 */

const { BrowserAssistant } = require('./src/browser-assistant');
const { SmartBrowser } = require('./src/smart-browser');

const GLOBAL_TIMEOUT = 180000; // 3分钟总超时

// 测试配置
const TEST_SITES = [
  {
    name: '淘宝',
    url: 'https://www.taobao.com',
    category: 'ecommerce',
    tests: [
      { type: 'search', keyword: '手机' },
      { type: 'extract', target: 'products' }
    ]
  },
  {
    name: '京东',
    url: 'https://www.jd.com',
    category: 'ecommerce',
    tests: [
      { type: 'search', keyword: '笔记本' },
      { type: 'extract', target: 'products' }
    ]
  }
];

async function runLiveTest() {
  const timeoutId = setTimeout(() => {
    console.log('\n⏰ 全局超时，强制退出...');
    process.exit(0);
  }, GLOBAL_TIMEOUT);

  console.log('╔════════════════════════════════════════════╗');
  console.log('║        电商网站实战测试                      ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // 初始化
  console.log('📦 初始化浏览器...');
  const assistant = new BrowserAssistant();
  await assistant.initWithUserSelection('auto');

  const page = assistant.page;
  const smart = new SmartBrowser(page);

  const results = [];

  // 测试每个网站
  for (const site of TEST_SITES) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🌐 测试网站: ${site.name}`);
    console.log(`   分类: ${site.category}`);
    console.log(`   URL: ${site.url}`);
    console.log(`${'═'.repeat(50)}\n`);

    const siteResult = {
      name: site.name,
      url: site.url,
      category: site.category,
      success: false,
      tests: []
    };

    try {
      // 1. 导航
      console.log('📍 步骤1: 智能导航...');
      const navStart = Date.now();
      const navResult = await smart.smartNavigate(site.url);
      const navTime = Date.now() - navStart;

      console.log(`   ✓ 导航完成 (${navTime}ms)`);
      console.log(`   策略: ${navResult.strategy}`);
      console.log(`   状态: ${navResult.success ? '成功' : '失败'}`);

      if (!navResult.success) {
        siteResult.tests.push({ step: 'navigate', success: false, time: navTime });
        results.push(siteResult);
        continue;
      }

      siteResult.tests.push({ step: 'navigate', success: true, time: navTime });

      // 2. 查找搜索框
      console.log('\n📍 步骤2: 查找搜索框...');

      const searchInput = await findSearchInput(page, site.name);
      if (searchInput) {
        console.log(`   ✓ 找到搜索框: ${searchInput.method}`);

        // 3. 输入搜索词
        console.log('\n📍 步骤3: 输入搜索词...');
        const keyword = site.tests.find(t => t.type === 'search')?.keyword || '测试';

        const inputStart = Date.now();
        const inputResult = await smart.smartInput('搜索', keyword, {
          selectors: searchInput.selectors
        });
        const inputTime = Date.now() - inputStart;

        console.log(`   ✓ 输入完成 (${inputTime}ms)`);
        console.log(`   方法: ${inputResult.method}`);
        siteResult.tests.push({ step: 'input', success: true, time: inputTime, method: inputResult.method });

        // 4. 点击搜索按钮
        console.log('\n📍 步骤4: 点击搜索按钮...');

        const searchBtn = await findSearchButton(page, site.name);
        if (searchBtn) {
          const clickStart = Date.now();
          const clickResult = await smart.visualClick('搜索', {
            elementKey: 'searchButton',
            selectors: searchBtn.selectors
          });
          const clickTime = Date.now() - clickStart;

          console.log(`   ✓ 点击完成 (${clickTime}ms)`);
          console.log(`   方法: ${clickResult.method}`);
          console.log(`   位置: (${Math.round(clickResult.position.x)}, ${Math.round(clickResult.position.y)})`);
          siteResult.tests.push({ step: 'click', success: true, time: clickTime, method: clickResult.method });

          // 等待搜索结果
          await smart.human.randomDelay(2000, 3000);

          // 5. 提取商品数据
          console.log('\n📍 步骤5: 提取商品数据...');

          const extractStart = Date.now();
          const products = await extractProducts(page, site.name);
          const extractTime = Date.now() - extractStart;

          console.log(`   ✓ 提取完成 (${extractTime}ms)`);
          console.log(`   商品数量: ${products.length}`);

          if (products.length > 0) {
            console.log('\n   前3个商品:');
            products.slice(0, 3).forEach((p, i) => {
              console.log(`   ${i + 1}. ${p.title?.substring(0, 30)}...`);
              if (p.price) console.log(`      价格: ${p.price}`);
            });
          }

          siteResult.tests.push({
            step: 'extract',
            success: products.length > 0,
            time: extractTime,
            count: products.length
          });
          siteResult.products = products.length;
          siteResult.success = true;
        } else {
          console.log('   ✗ 未找到搜索按钮');
          siteResult.tests.push({ step: 'click', success: false });
        }
      } else {
        console.log('   ✗ 未找到搜索框');
        siteResult.tests.push({ step: 'input', success: false });
      }

    } catch (e) {
      console.log(`\n❌ 测试失败: ${e.message}`);
      siteResult.error = e.message;
    }

    results.push(siteResult);

    // 等待一下再测试下一个
    await smart.human.randomDelay(2000, 4000);
  }

  // 显示准确度报告
  console.log('\n' + '═'.repeat(50));
  console.log('📊 准确度报告');
  console.log('═'.repeat(50));

  const report = smart.getAccuracyReport();
  console.log(`\n总体准确度: ${(report.overall.accuracy * 100).toFixed(1)}%`);
  console.log(`总操作: ${report.overall.total}`);
  console.log(`成功: ${report.overall.success}`);

  if (Object.keys(report.byMethod).length > 0) {
    console.log('\n按方法统计:');
    for (const [method, stats] of Object.entries(report.byMethod)) {
      console.log(`  ${method}: ${(stats.accuracy * 100).toFixed(0)}% (${stats.success}/${stats.total})`);
    }
  }

  // 最终结果
  console.log('\n' + '═'.repeat(50));
  console.log('📋 测试结果汇总');
  console.log('═'.repeat(50) + '\n');

  for (const result of results) {
    const status = result.success ? '✅ 成功' : '❌ 失败';
    console.log(`${result.name}: ${status}`);

    for (const test of result.tests) {
      const testStatus = test.success ? '✓' : '✗';
      const time = test.time ? `${test.time}ms` : '';
      const extra = test.method ? `(${test.method})` : (test.count ? `(${test.count}个)` : '');
      console.log(`   ${testStatus} ${test.step}: ${time} ${extra}`);
    }

    if (result.products) {
      console.log(`   📦 提取商品: ${result.products}个`);
    }
  }

  // 检查隐蔽状态
  console.log('\n🔒 隐蔽状态:', smart.isStealthy() ? '✅ 安全' : '⚠️ 可能被检测');

  clearTimeout(timeoutId);
  await assistant.close();

  console.log('\n✅ 测试完成');
}

// 辅助函数：查找搜索框
async function findSearchInput(page, siteName) {
  const selectors = {
    '淘宝': ['#q', 'input.s_ipt', '#J_TSearchForm input'],
    '京东': ['#key', '#search input', 'input.text'],
    '拼多多': ['input[placeholder*="搜索"]', '.search-input input']
  };

  const siteSelectors = selectors[siteName] || [];

  for (const selector of siteSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          return { selector, method: 'selector', selectors: siteSelectors };
        }
      }
    } catch (e) {
      continue;
    }
  }

  // 视觉查找
  const elements = await page.$$('input[type="text"], input[type="search"]');
  for (const el of elements) {
    try {
      const isVisible = await el.isVisible();
      if (isVisible) {
        const box = await el.boundingBox();
        if (box && box.width > 100) { // 搜索框通常较宽
          return { method: 'visual', selectors: [] };
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

// 辅助函数：查找搜索按钮
async function findSearchButton(page, siteName) {
  const selectors = {
    '淘宝': ['.btn-search', '#J_TSearchForm button', 'button.btn-search'],
    '京东': ['#search button', '.search-btn', 'button.button'],
    '拼多多': ['button[type="submit"]', '.search-btn']
  };

  const siteSelectors = selectors[siteName] || [];

  for (const selector of siteSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          return { selector, method: 'selector', selectors: siteSelectors };
        }
      }
    } catch (e) {
      continue;
    }
  }

  // 查找包含"搜索"文字的按钮
  const buttons = await page.$$('button, input[type="submit"]');
  for (const btn of buttons) {
    try {
      const isVisible = await btn.isVisible();
      if (isVisible) {
        const text = await btn.innerText();
        if (text && text.includes('搜索')) {
          return { method: 'text', selectors: ['button:has-text("搜索")'] };
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

// 辅助函数：提取商品数据
async function extractProducts(page, siteName) {
  const selectors = {
    '淘宝': {
      container: ['.Card--doubleCardWrapper', '.items .item', '.J_ItemCard'],
      title: ['.title', '.Item--title', 'a[title]'],
      price: ['.price', '.g_price-highlight', '.Item--price']
    },
    '京东': {
      container: ['.gl-item', '.J-goods-list .gl-item'],
      title: ['.p-name a', '.p-name', '.gl-i-wrap .p-name'],
      price: ['.p-price', '.J-p-price']
    },
    '拼多多': {
      container: ['.goods-item', '.item'],
      title: ['.title', '.goods-title'],
      price: ['.price', '.goods-price']
    }
  };

  const siteSelectors = selectors[siteName] || selectors['淘宝'];
  const products = [];

  try {
    // 等待商品列表加载
    await page.waitForSelector(siteSelectors.container.join(','), { timeout: 10000 });

    // 提取商品
    const containers = await page.$$(siteSelectors.container.join(','));

    for (const container of containers.slice(0, 20)) { // 最多提取20个
      try {
        let title = '';
        let price = '';

        // 提取标题
        for (const titleSel of siteSelectors.title) {
          const titleEl = await container.$(titleSel);
          if (titleEl) {
            title = await titleEl.innerText();
            if (title) break;
          }
        }

        // 提取价格
        for (const priceSel of siteSelectors.price) {
          const priceEl = await container.$(priceSel);
          if (priceEl) {
            price = await priceEl.innerText();
            if (price) break;
          }
        }

        if (title) {
          products.push({
            title: title.trim(),
            price: price.trim()
          });
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.log(`   提取失败: ${e.message}`);
  }

  return products;
}

// 运行测试
runLiveTest().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
