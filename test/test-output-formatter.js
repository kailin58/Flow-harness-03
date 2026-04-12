const { OutputFormatter, OUTPUT_FORMAT, REPORT_TYPE } = require('../src/output-formatter');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testOutputFormatter() {
  console.log('🧪 测试 OutputFormatter...\n');

  let passed = 0;
  let failed = 0;
  const silentLogger = {
    trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){},
    child() { return silentLogger; }
  };

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  const tmpDir = path.join(os.tmpdir(), `fh-output-${Date.now()}`);

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof OUTPUT_FORMAT === 'object', 'OUTPUT_FORMAT 已导出');
    assert(OUTPUT_FORMAT.JSON === 'json', 'JSON 格式');
    assert(OUTPUT_FORMAT.MARKDOWN === 'markdown', 'MARKDOWN 格式');
    assert(OUTPUT_FORMAT.HTML === 'html', 'HTML 格式');
    assert(OUTPUT_FORMAT.TEXT === 'text', 'TEXT 格式');
    assert(OUTPUT_FORMAT.CSV === 'csv', 'CSV 格式');
    assert(typeof REPORT_TYPE === 'object', 'REPORT_TYPE 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const fmt = new OutputFormatter({ outputDir: tmpDir, logger: silentLogger });
    assert(fmt !== null, 'OutputFormatter 创建成功');
    assert(fmt.defaultFormat === OUTPUT_FORMAT.MARKDOWN, '默认格式 MARKDOWN');

    // ---- Test 3: 模板管理 ----
    console.log('\nTest 3: 模板管理');
    assert(fmt.listTemplates().length >= 3, '至少 3 个内置模板');
    assert(fmt.getTemplate('task_report') !== null, 'task_report 模板存在');
    fmt.registerTemplate('custom', { title: 'Custom', sections: ['data'] });
    assert(fmt.getTemplate('custom') !== null, '自定义模板已注册');

    // ---- Test 4: JSON 格式化 ----
    console.log('\nTest 4: JSON 格式化');
    const data = { name: 'test', value: 42, items: [1, 2, 3] };
    const jsonOut = fmt.format(data, OUTPUT_FORMAT.JSON);
    assert(typeof jsonOut === 'string', 'JSON 输出是字符串');
    const parsed = JSON.parse(jsonOut);
    assert(parsed.name === 'test', 'JSON 数据正确');
    assert(parsed.value === 42, 'JSON 值正确');

    // ---- Test 5: Markdown 格式化 ----
    console.log('\nTest 5: Markdown 格式化');
    const mdData = {
      title: 'Test Report',
      summary: { status: 'success', duration: '5s' },
      items: [
        { name: 'task1', result: 'pass' },
        { name: 'task2', result: 'fail' }
      ],
      tags: ['important', 'review']
    };
    const mdOut = fmt.format(mdData, OUTPUT_FORMAT.MARKDOWN);
    assert(mdOut.includes('# Test Report'), '包含标题');
    assert(mdOut.includes('**Status:**'), '包含字段');
    assert(mdOut.includes('| Name | Result |'), '包含表格头');
    assert(mdOut.includes('task1'), '包含数据');
    assert(mdOut.includes('- important'), '包含列表');

    // ---- Test 6: HTML 格式化 ----
    console.log('\nTest 6: HTML 格式化');
    const htmlOut = fmt.format(mdData, OUTPUT_FORMAT.HTML);
    assert(htmlOut.includes('<!DOCTYPE html>'), '包含 DOCTYPE');
    assert(htmlOut.includes('<h1>Test Report</h1>'), '包含 H1');
    assert(htmlOut.includes('<table>'), '包含表格');
    assert(htmlOut.includes('<th>'), '包含表头');
    assert(htmlOut.includes('task1'), '包含数据');
    assert(htmlOut.includes('<li>important</li>'), '包含列表');

    // ---- Test 7: Text 格式化 ----
    console.log('\nTest 7: Text 格式化');
    const textOut = fmt.format(mdData, OUTPUT_FORMAT.TEXT);
    assert(textOut.includes('TEST REPORT'), '包含大写标题');
    assert(textOut.includes('===='), '包含分隔线');
    assert(textOut.includes('Status: success'), '包含字段');

    // ---- Test 8: CSV 格式化 — 数组 ----
    console.log('\nTest 8: CSV 格式化 — 数组');
    const csvData = [
      { name: 'Alice', age: 30, role: 'dev' },
      { name: 'Bob', age: 25, role: 'qa' }
    ];
    const csvOut = fmt.format(csvData, OUTPUT_FORMAT.CSV);
    assert(csvOut.includes('name,age,role'), '包含 CSV 头');
    assert(csvOut.includes('Alice,30,dev'), '包含数据行');
    assert(csvOut.includes('Bob,25,qa'), '包含第二行');

    // ---- Test 9: CSV 格式化 — 对象 ----
    console.log('\nTest 9: CSV 格式化 — 对象');
    const csvObj = { project: 'flow', version: '1.0', nested: { key: 'val' } };
    const csvObjOut = fmt.format(csvObj, OUTPUT_FORMAT.CSV);
    assert(csvObjOut.includes('key,value'), '包含 key,value 头');
    assert(csvObjOut.includes('project,flow'), '包含数据');
    assert(csvObjOut.includes('nested.key,val'), '嵌套展平');

    // ---- Test 10: CSV 转义 ----
    console.log('\nTest 10: CSV 转义');
    const csvEscape = [{ name: 'test, value', desc: 'has "quotes"' }];
    const csvEscOut = fmt.format(csvEscape, OUTPUT_FORMAT.CSV);
    assert(csvEscOut.includes('"test, value"'), '逗号被引号包裹');
    assert(csvEscOut.includes('""quotes""'), '引号被转义');

    // ---- Test 11: 任务报告生成 ----
    console.log('\nTest 11: 任务报告生成');
    const taskReport = fmt.generateTaskReport({
      id: 'T-1',
      name: 'Code Review',
      status: 'completed',
      duration: '3m',
      results: { quality: 'high', issues: 0 },
      errors: []
    });
    assert(taskReport.type === REPORT_TYPE.TASK_REPORT, 'type 正确');
    assert(taskReport.format === OUTPUT_FORMAT.MARKDOWN, '格式为 MARKDOWN');
    assert(taskReport.content.includes('Code Review'), '包含任务名');
    assert(taskReport.content.includes('completed'), '包含状态');

    // ---- Test 12: 任务报告 JSON 格式 ----
    console.log('\nTest 12: 任务报告 JSON 格式');
    const taskJson = fmt.generateTaskReport(
      { id: 'T-2', name: 'Build', status: 'failed' },
      OUTPUT_FORMAT.JSON
    );
    assert(taskJson.format === OUTPUT_FORMAT.JSON, '格式为 JSON');
    const taskParsed = JSON.parse(taskJson.content);
    assert(taskParsed.summary.status === 'failed', 'JSON 状态正确');

    // ---- Test 13: 执行摘要生成 ----
    console.log('\nTest 13: 执行摘要生成');
    const execSummary = fmt.generateExecutionSummary({
      totalTasks: 10,
      successful: 8,
      failed: 2,
      skipped: 0,
      totalDuration: '5m',
      tasks: [
        { name: 'task1', status: 'pass', duration: '1m' },
        { name: 'task2', status: 'fail', duration: '2m' }
      ],
      errors: [{ task: 'task2', error: 'timeout' }]
    });
    assert(execSummary.type === REPORT_TYPE.EXECUTION_SUMMARY, 'type 正确');
    assert(execSummary.content.includes('Execution Summary'), '包含标题');
    assert(execSummary.content.includes('10'), '包含总任务数');

    // ---- Test 14: 文件导出 ----
    console.log('\nTest 14: 文件导出');
    const mdContent = fmt.format(mdData, OUTPUT_FORMAT.MARKDOWN);
    const exportPath = fmt.exportToFile(mdContent, 'test-report', OUTPUT_FORMAT.MARKDOWN);
    assert(exportPath.endsWith('.md'), '路径以 .md 结尾');
    assert(fs.existsSync(exportPath), '文件已创建');
    const fileContent = fs.readFileSync(exportPath, 'utf8');
    assert(fileContent.includes('Test Report'), '文件内容正确');

    // ---- Test 15: 多格式导出 ----
    console.log('\nTest 15: 多格式导出');
    const multiResults = fmt.exportMultiFormat(
      mdData, 'multi-report',
      [OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.MARKDOWN, OUTPUT_FORMAT.HTML, OUTPUT_FORMAT.TEXT]
    );
    assert(multiResults.length === 4, '4 种格式导出');
    assert(multiResults.every(r => fs.existsSync(r.path)), '所有文件都存在');
    const exts = multiResults.map(r => path.extname(r.path));
    assert(exts.includes('.json'), '包含 .json');
    assert(exts.includes('.md'), '包含 .md');
    assert(exts.includes('.html'), '包含 .html');
    assert(exts.includes('.txt'), '包含 .txt');

    // ---- Test 16: 空数据处理 ----
    console.log('\nTest 16: 空数据处理');
    const emptyMd = fmt.format({}, OUTPUT_FORMAT.MARKDOWN);
    assert(typeof emptyMd === 'string', '空数据 MD 输出正常');
    const emptyHtml = fmt.format({}, OUTPUT_FORMAT.HTML);
    assert(emptyHtml.includes('<!DOCTYPE html>'), '空数据 HTML 正常');
    const emptyText = fmt.format({}, OUTPUT_FORMAT.TEXT);
    assert(emptyText.includes('===='), '空数据 Text 正常');

    // ---- Test 17: null 值处理 ----
    console.log('\nTest 17: null 值处理');
    const nullData = { field: null, empty: [], nested: { x: null } };
    const nullMd = fmt.format(nullData, OUTPUT_FORMAT.MARKDOWN);
    assert(nullMd.includes('—'), 'null 显示为 —');
    assert(nullMd.includes('No items'), '空数组显示 No items');

    // ---- Test 18: getStats ----
    console.log('\nTest 18: getStats');
    const stats = fmt.getStats();
    assert(stats.defaultFormat === OUTPUT_FORMAT.MARKDOWN, '默认格式正确');
    assert(stats.templateCount >= 3, '模板数 >= 3');
    assert(stats.supportedFormats.length === 5, '5 种支持格式');
    assert(stats.templates.includes('task_report'), 'task_report 在列表中');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  // 清理
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 OutputFormatter 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testOutputFormatter();
