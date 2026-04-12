/**
 * 测试网站策略分类
 */

const { SiteStrategy } = require('./src/site-strategy');

async function testCategories() {
  console.log('=== 网站策略分类 ===\n');

  const strategy = new SiteStrategy();
  await strategy.init();

  // 获取所有分类
  const categories = strategy.getCategories();
  console.log('支持分类:');
  for (const [key, info] of Object.entries(categories)) {
    console.log(`  ${info.name} (${key}): ${info.description}`);
  }

  // 获取所有网站
  console.log('\n=== 各分类网站列表 ===\n');

  const allSites = strategy.getAllSites();

  for (const [category, data] of Object.entries(allSites)) {
    if (data.sites.length > 0) {
      console.log(`\n【${data.name}】(${data.sites.length}个网站)`);
      console.log(`   ${data.description}`);
      console.log('   ' + '-'.repeat(40));

      for (const site of data.sites) {
        const priorityIcon = site.priority === 'high' ? '★' : (site.priority === 'medium' ? '☆' : '○');
        console.log(`   ${priorityIcon} ${site.name.padEnd(8)} - ${site.domain}`);
      }
    }
  }

  // 统计
  console.log('\n=== 统计信息 ===\n');

  let totalSites = 0;
  let highPriority = 0;
  let mediumPriority = 0;

  for (const [category, data] of Object.entries(allSites)) {
    totalSites += data.sites.length;
    highPriority += data.sites.filter(s => s.priority === 'high').length;
    mediumPriority += data.sites.filter(s => s.priority === 'medium').length;
  }

  console.log(`总网站数: ${totalSites}`);
  console.log(`高优先级: ${highPriority} (★)`);
  console.log(`中优先级: ${mediumPriority} (☆)`);
  console.log(`低优先级: ${totalSites - highPriority - mediumPriority} (○)`);

  // 测试分类检测
  console.log('\n=== 分类检测测试 ===\n');

  const testUrls = [
    'https://www.taobao.com',
    'https://www.baidu.com',
    'https://www.douyin.com',
    'https://weibo.com',
    'https://github.com'
  ];

  for (const url of testUrls) {
    const result = strategy.getSiteCategory(url);
    const siteStrategy = strategy.getStrategy(url);
    console.log(`${url}`);
    console.log(`  分类: ${result.categoryName}`);
    console.log(`  策略: 点击=${siteStrategy.strategies.click.join('→')}`);
    console.log(`  延迟: ${siteStrategy.antiDetection?.humanDelay?.min || 300}-${siteStrategy.antiDetection?.humanDelay?.max || 800}ms`);
  }

  console.log('\n=== 完成 ===');
}

testCategories().catch(console.error);
