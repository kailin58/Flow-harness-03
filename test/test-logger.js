const { Logger, createLogger, createComponentLoggers, LOG_LEVELS, LEVEL_NAMES } = require('../src/logger');

async function testLogger() {
  console.log('🧪 测试 Logger...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  // 捕获输出用的自定义 WritableStream
  class CaptureStream {
    constructor() { this.chunks = []; }
    write(chunk) { this.chunks.push(chunk); return true; }
    getOutput() { return this.chunks.join(''); }
    clear() { this.chunks = []; }
  }

  try {
    // ---- Test 1: 常量 ----
    console.log('\nTest 1: LOG_LEVELS 常量');
    assert(LOG_LEVELS.trace === 10, 'trace = 10');
    assert(LOG_LEVELS.debug === 20, 'debug = 20');
    assert(LOG_LEVELS.info === 30, 'info = 30');
    assert(LOG_LEVELS.warn === 40, 'warn = 40');
    assert(LOG_LEVELS.error === 50, 'error = 50');
    assert(LOG_LEVELS.fatal === 60, 'fatal = 60');

    assert(LEVEL_NAMES[30] === 'info', 'LEVEL_NAMES 反向映射');

    // ---- Test 2: createLogger ----
    console.log('\nTest 2: createLogger 基本创建');
    const logger = createLogger({ name: 'test', level: 'debug' });
    assert(logger !== null, 'createLogger 成功');
    assert(logger.name === 'test', 'name 正确');
    assert(logger.levelName === 'debug', 'level 正确');

    // ---- Test 3: 日志级别过滤 ----
    console.log('\nTest 3: 日志级别过滤');
    const capture = new CaptureStream();
    const filteredLogger = createLogger({
      name: 'filtered', level: 'warn', pretty: true, destination: capture
    });
    filteredLogger.debug('should not appear');
    filteredLogger.info('should not appear');
    filteredLogger.warn('should appear');
    const output = capture.getOutput();
    assert(!output.includes('should not appear'), 'debug/info 被过滤');
    assert(output.includes('should appear'), 'warn 通过过滤');

    // ---- Test 4: JSON 输出（生产模式）----
    console.log('\nTest 4: JSON 输出（生产模式）');
    const jsonCapture = new CaptureStream();
    const jsonLogger = createLogger({
      name: 'json-test', level: 'info', pretty: false,
      destination: jsonCapture, bufferSize: 1  // 最小缓冲，每次立即刷新
    });
    jsonLogger.info('test message');
    jsonLogger.close(); // 确保刷新缓冲
    const jsonOutput = jsonCapture.getOutput();
    assert(jsonOutput.length > 0, 'JSON 模式有输出');
    try {
      const parsed = JSON.parse(jsonOutput.trim());
      assert(parsed.msg === 'test message', 'JSON msg 正确');
      assert(parsed.name === 'json-test', 'JSON name 正确');
      assert(parsed.level === 30, 'JSON level = 30 (info)');
      assert(parsed.time > 0, 'JSON time 存在');
    } catch(e) {
      assert(false, `JSON 解析失败: ${e.message}`);
    }

    // ---- Test 5: child logger ----
    console.log('\nTest 5: child logger');
    const childCapture = new CaptureStream();
    const parent = createLogger({
      name: 'parent', level: 'info', pretty: true, destination: childCapture
    });
    const child = parent.child({ component: 'supervisor' });
    assert(child !== null, 'child 创建成功');
    child.info('child message');
    const childOutput = childCapture.getOutput();
    assert(childOutput.includes('supervisor'), 'child 输出包含 component');
    assert(childOutput.includes('child message'), 'child 输出包含消息');

    // ---- Test 6: setLevel 动态调整 ----
    console.log('\nTest 6: setLevel 动态调整');
    const dynLogger = createLogger({ name: 'dyn', level: 'error' });
    assert(dynLogger.isLevelEnabled('error') === true, 'error 级别已启用');
    assert(dynLogger.isLevelEnabled('debug') === false, 'debug 级别未启用');
    dynLogger.setLevel('debug');
    assert(dynLogger.isLevelEnabled('debug') === true, 'setLevel 后 debug 已启用');

    // ---- Test 7: Trace/Span ----
    console.log('\nTest 7: Trace/Span');
    const traceCapture = new CaptureStream();
    const traceLogger = createLogger({
      name: 'trace-test', level: 'info', pretty: true, destination: traceCapture
    });
    traceLogger.setTrace('trace-123', 'span-456');
    assert(traceLogger.traceId === 'trace-123', 'traceId 设置成功');
    assert(traceLogger.spanId === 'span-456', 'spanId 设置成功');

    const span = traceLogger.startSpan('test-operation');
    assert(span !== null, 'startSpan 返回非空');
    assert(span.id.startsWith('span_'), 'span id 前缀正确');
    assert(typeof span.end === 'function', 'span 有 end 方法');

    // ---- Test 8: 对象日志参数 ----
    console.log('\nTest 8: 对象日志参数');
    const objCapture = new CaptureStream();
    const objLogger = createLogger({
      name: 'obj-test', level: 'info', pretty: false,
      destination: objCapture, bufferSize: 1
    });
    objLogger.info({ userId: 123, action: 'login' }, 'User logged in');
    objLogger.close();
    const objOutput = objCapture.getOutput();
    try {
      const parsed = JSON.parse(objOutput.trim());
      assert(parsed.userId === 123, '对象参数: userId 正确');
      assert(parsed.action === 'login', '对象参数: action 正确');
      assert(parsed.msg === 'User logged in', '对象参数: msg 正确');
    } catch(e) {
      assert(false, `对象参数 JSON 解析失败: ${e.message}`);
    }

    // ---- Test 9: createComponentLoggers ----
    console.log('\nTest 9: createComponentLoggers');
    const compLoggers = createComponentLoggers();
    assert(compLoggers.root !== undefined, 'root logger 存在');
    assert(compLoggers.supervisor !== undefined, 'supervisor logger 存在');
    assert(compLoggers.inspector !== undefined, 'inspector logger 存在');
    assert(compLoggers.memoryStore !== undefined, 'memoryStore logger 存在');
    assert(compLoggers.policyChecker !== undefined, 'policyChecker logger 存在');
    assert(compLoggers.agentsParser !== undefined, 'agentsParser logger 存在');
    assert(compLoggers.rolePermission !== undefined, 'rolePermission logger 存在');

    // ---- Test 10: close ----
    console.log('\nTest 10: close 清理');
    const closeLogger = createLogger({ name: 'close-test', pretty: false });
    closeLogger.close();
    assert(closeLogger._flushInterval === null, 'close 后 interval 已清除');

    // ---- Test 11: 格式化字符串 ----
    console.log('\nTest 11: 格式化字符串 %s %d %j');
    const fmtCapture = new CaptureStream();
    const fmtLogger = createLogger({
      name: 'fmt', level: 'info', pretty: false,
      destination: fmtCapture, bufferSize: 1
    });
    fmtLogger.info('Hello %s, count=%d', 'world', 42);
    fmtLogger.close();
    const fmtOutput = fmtCapture.getOutput();
    try {
      const parsed = JSON.parse(fmtOutput.trim());
      assert(parsed.msg.includes('world'), '格式化 %s 正确');
      assert(parsed.msg.includes('42'), '格式化 %d 正确');
    } catch(e) {
      assert(false, `格式化 JSON 解析失败: ${e.message}`);
    }

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 Logger 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testLogger();
