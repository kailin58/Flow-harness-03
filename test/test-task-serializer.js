const TaskSerializer = require('../src/task-serializer');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testTaskSerializer() {
  console.log('🧪 测试 TaskSerializer...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ ${testName}`);
      passed++;
    } else {
      console.log(`  ❌ ${testName}`);
      failed++;
    }
  }

  const testDir = path.join(os.tmpdir(), `flowharness-ts-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // Test 1: 基本初始化
    console.log('Test 1: 基本初始化');
    const serializer = new TaskSerializer();
    assert(serializer.config.version === '1.0', '默认版本 1.0');
    assert(serializer.config.indent === 2, '默认缩进 2');
    console.log('');

    // Test 2: generateTaskId
    console.log('Test 2: generateTaskId');
    const id1 = serializer.generateTaskId();
    const id2 = serializer.generateTaskId();
    assert(id1.startsWith('task-'), 'ID 以 task- 开头');
    assert(id1 !== id2, '两次生成不同ID');
    assert(id1.length > 10, 'ID 有足够长度');
    console.log('');

    // Test 3: serialize 基本功能
    console.log('Test 3: serialize 基本功能');
    const task = { action: 'file_search', pattern: '*.js' };
    const result = serializer.serialize(task, {
      source: { platform: 'claude-code', agentId: 'explore' },
      target: { platform: 'cursor', agentId: null }
    });
    assert(typeof result.json === 'string', 'json 为字符串');
    assert(typeof result.checksum === 'string', 'checksum 为字符串');
    assert(result.checksum.length === 64, 'SHA256 长度 64');
    assert(result.envelope.version === '1.0', '版本正确');
    assert(result.envelope.task.action === 'file_search', '任务数据保留');
    assert(result.envelope.source.platform === 'claude-code', '来源平台正确');
    assert(result.envelope.target.platform === 'cursor', '目标平台正确');
    assert(result.envelope.state === 'pending', '默认状态 pending');
    console.log('');

    // Test 4: deserialize 往返一致
    console.log('Test 4: deserialize 往返一致');
    const deserialized = serializer.deserialize(result.json);
    assert(deserialized.valid === true, '反序列化有效');
    assert(deserialized.checksumValid === true, '校验和验证通过');
    assert(deserialized.task.action === 'file_search', '任务数据还原');
    assert(deserialized.task.pattern === '*.js', '任务参数还原');
    assert(deserialized.metadata.source.platform === 'claude-code', '元数据还原');
    assert(deserialized.metadata.state === 'pending', '状态还原');
    assert(deserialized.validationErrors.length === 0, '无验证错误');
    console.log('');

    // Test 5: 校验和篡改检测
    console.log('Test 5: 校验和篡改检测');
    const tampered = result.json.replace('file_search', 'code_search');
    const tamperedResult = serializer.deserialize(tampered);
    assert(tamperedResult.checksumValid === false, '篡改后校验和失败');
    assert(tamperedResult.valid === false, '篡改后整体无效');
    console.log('');

    // Test 6: 无效 JSON 处理
    console.log('Test 6: 无效 JSON 处理');
    const badResult = serializer.deserialize('not json');
    assert(badResult.valid === false, '无效JSON返回无效');
    assert(badResult.task === null, '任务为 null');
    assert(badResult.validationErrors.length > 0, '有错误信息');
    console.log('');

    // Test 7: validate 缺少字段
    console.log('Test 7: validate 缺少字段');
    const v1 = serializer.validate({});
    assert(v1.valid === false, '空对象无效');
    assert(v1.errors.length >= 3, `至少3个错误 (${v1.errors.length})`);
    const v2 = serializer.validate({ version: '1.0', taskId: 'x', timestamp: 'x', task: {} });
    assert(v2.valid === true, '最小有效信封');
    console.log('');

    // Test 8: validate 版本不兼容
    console.log('Test 8: validate 版本不兼容');
    const v3 = serializer.validate({ version: '2.0', taskId: 'x', timestamp: 'x', task: {} });
    assert(v3.valid === false, '版本 2.0 不兼容');
    assert(v3.errors.some(e => e.includes('版本不兼容')), '有版本错误信息');
    console.log('');

    // Test 9: validate 无效状态
    console.log('Test 9: validate 无效状态');
    const v4 = serializer.validate({ version: '1.0', taskId: 'x', timestamp: 'x', task: {}, state: 'bad' });
    assert(v4.valid === false, '无效状态被拒绝');
    assert(v4.errors.some(e => e.includes('无效状态')), '有状态错误信息');
    console.log('');

    // Test 10: serializeToFile / deserializeFromFile
    console.log('Test 10: serializeToFile / deserializeFromFile');
    const filePath = path.join(testDir, 'test-task.json');
    const fileResult = serializer.serializeToFile(
      { action: 'read_file', filePath: '/test.txt' },
      filePath,
      { taskId: 'task-file-test', source: { platform: 'claude-code' } }
    );
    assert(fileResult.path === filePath, '文件路径正确');
    assert(fileResult.taskId === 'task-file-test', '任务ID正确');
    assert(fs.existsSync(filePath), '文件已创建');

    const fileDeserialized = serializer.deserializeFromFile(filePath);
    assert(fileDeserialized.valid === true, '文件反序列化有效');
    assert(fileDeserialized.task.action === 'read_file', '文件任务数据正确');
    assert(fileDeserialized.metadata.taskId === 'task-file-test', '文件任务ID正确');
    console.log('');

    // Test 11: deserializeFromFile 不存在文件
    console.log('Test 11: deserializeFromFile 不存在文件');
    const noFile = serializer.deserializeFromFile('/nonexistent/file.json');
    assert(noFile.valid === false, '不存在文件返回无效');
    assert(noFile.validationErrors.length > 0, '有错误信息');
    console.log('');

    // Test 12: serializeToFile 自动创建目录
    console.log('Test 12: serializeToFile 自动创建目录');
    const nestedPath = path.join(testDir, 'sub', 'dir', 'task.json');
    serializer.serializeToFile({ action: 'test' }, nestedPath);
    assert(fs.existsSync(nestedPath), '嵌套目录自动创建');
    console.log('');

    // Test 13: 复杂任务序列化
    console.log('Test 13: 复杂任务序列化');
    const complexTask = {
      action: 'edit_file',
      filePath: '/src/index.js',
      changes: [
        { line: 10, content: 'const x = 1;' },
        { line: 20, content: 'const y = 2;' }
      ],
      metadata: { author: 'test', tags: ['refactor', 'cleanup'] }
    };
    const complexResult = serializer.serialize(complexTask, {
      context: { workingDir: '/project', env: { NODE_ENV: 'test' } },
      state: 'in_progress'
    });
    const complexBack = serializer.deserialize(complexResult.json);
    assert(complexBack.valid === true, '复杂任务往返有效');
    assert(complexBack.task.changes.length === 2, '数组数据保留');
    assert(complexBack.task.metadata.tags[0] === 'refactor', '嵌套数据保留');
    assert(complexBack.metadata.state === 'in_progress', '状态保留');
    assert(complexBack.metadata.context.env.NODE_ENV === 'test', '上下文保留');
    console.log('');

    // Test 14: getStats
    console.log('Test 14: getStats');
    const stats = serializer.getStats();
    assert(stats.serialized >= 4, `序列化次数 >= 4 (${stats.serialized})`);
    assert(stats.deserialized >= 4, `反序列化次数 >= 4 (${stats.deserialized})`);
    assert(stats.fileWrites >= 2, `文件写入 >= 2 (${stats.fileWrites})`);
    assert(stats.fileReads >= 1, `文件读取 >= 1 (${stats.fileReads})`);
    assert(stats.errors >= 2, `错误次数 >= 2 (${stats.errors})`);
    console.log('');

    // Test 15: 自定义 taskId 保留
    console.log('Test 15: 自定义 taskId 保留');
    const customId = serializer.serialize({ action: 'test' }, { taskId: 'my-custom-id' });
    assert(customId.envelope.taskId === 'my-custom-id', '自定义 taskId 保留');
    console.log('');

    // 总结
    console.log('='.repeat(50));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分测试失败！\n');
      return false;
    }

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

testTaskSerializer()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
