const {
  UnifiedProtocol, AgentManifest, ProtocolAdapter,
  MESSAGE_TYPE, PROTOCOL_VERSION, ADAPTER_STATUS,
  createMessage, validateMessage
} = require('../src/unified-protocol');

async function testUnifiedProtocol() {
  console.log('🧪 测试 UnifiedProtocol...\n');

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

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof MESSAGE_TYPE === 'object', 'MESSAGE_TYPE 已导出');
    assert(MESSAGE_TYPE.REQUEST === 'request', 'REQUEST 类型');
    assert(MESSAGE_TYPE.RESPONSE === 'response', 'RESPONSE 类型');
    assert(MESSAGE_TYPE.EVENT === 'event', 'EVENT 类型');
    assert(typeof PROTOCOL_VERSION === 'string', 'PROTOCOL_VERSION 已导出');
    assert(typeof ADAPTER_STATUS === 'object', 'ADAPTER_STATUS 已导出');

    // ---- Test 2: createMessage ----
    console.log('\nTest 2: createMessage');
    const msg = createMessage(MESSAGE_TYPE.REQUEST, { action: 'test' }, { source: 'agent-1', target: 'agent-2' });
    assert(msg.id.startsWith('msg_'), 'ID 前缀正确');
    assert(msg.type === MESSAGE_TYPE.REQUEST, 'type 正确');
    assert(msg.source === 'agent-1', 'source 正确');
    assert(msg.target === 'agent-2', 'target 正确');
    assert(msg.payload.action === 'test', 'payload 正确');
    assert(msg.version === PROTOCOL_VERSION, 'version 正确');

    // ---- Test 3: validateMessage ----
    console.log('\nTest 3: validateMessage');
    const valid = validateMessage(msg);
    assert(valid.valid === true, '有效消息验证通过');

    const invalid1 = validateMessage({});
    assert(invalid1.valid === false, '空消息验证失败');
    assert(invalid1.errors.length > 0, '有错误信息');

    const invalid2 = validateMessage(null);
    assert(invalid2.valid === false, 'null 验证失败');

    const invalid3 = validateMessage({ id: '1', type: 'invalid_type', source: 's', payload: {} });
    assert(invalid3.valid === false, '无效 type 验证失败');

    // ---- Test 4: AgentManifest ----
    console.log('\nTest 4: AgentManifest');
    const manifest = new AgentManifest({
      id: 'code-agent',
      name: 'Code Agent',
      version: '2.0.0',
      description: 'Handles code tasks',
      capabilities: ['code', 'review', 'test']
    });
    assert(manifest.id === 'code-agent', 'ID 正确');
    assert(manifest.name === 'Code Agent', 'name 正确');
    assert(manifest.hasCapability('code') === true, '有 code 能力');
    assert(manifest.hasCapability('deploy') === false, '无 deploy 能力');
    assert(manifest.protocol.version === PROTOCOL_VERSION, '协议版本正确');

    // 序列化/反序列化
    const json = manifest.toJSON();
    assert(json.id === 'code-agent', 'toJSON 正确');
    const restored = AgentManifest.fromJSON(json);
    assert(restored.id === 'code-agent', 'fromJSON 正确');
    assert(restored.hasCapability('review') === true, '反序列化后能力保留');

    // ---- Test 5: ProtocolAdapter ----
    console.log('\nTest 5: ProtocolAdapter');
    const adapter = new ProtocolAdapter('xml-adapter', {
      serialize: (msg) => `<msg>${JSON.stringify(msg)}</msg>`,
      deserialize: (raw) => JSON.parse(raw.replace(/<\/?msg>/g, '')),
      transform: (msg) => ({ ...msg, adapted: true })
    });
    assert(adapter.id === 'xml-adapter', 'Adapter ID 正确');
    assert(adapter.status === ADAPTER_STATUS.REGISTERED, '状态为 REGISTERED');

    // 入站
    const inResult = adapter.inbound('{"type":"request","data":"hello"}');
    assert(inResult.success === true, '入站成功');
    assert(inResult.message.adapted === true, '入站转换生效');
    assert(adapter.stats.messagesIn === 1, 'messagesIn = 1');

    // 出站
    const outResult = adapter.outbound(msg);
    assert(outResult.success === true, '出站成功');
    assert(outResult.raw.includes('<msg>'), '出站序列化正确');
    assert(adapter.stats.messagesOut === 1, 'messagesOut = 1');

    // ---- Test 6: UnifiedProtocol 实例化 ----
    console.log('\nTest 6: UnifiedProtocol 实例化');
    const proto = new UnifiedProtocol({ logger: silentLogger });
    assert(proto !== null, 'UnifiedProtocol 创建成功');

    // ---- Test 7: Manifest 注册 ----
    console.log('\nTest 7: Manifest 注册');
    proto.registerManifest(manifest);
    proto.registerManifest({ id: 'review-agent', name: 'Review Agent', capabilities: ['review'] });
    proto.registerManifest({ id: 'deploy-agent', name: 'Deploy Agent', capabilities: ['deploy', 'monitor'] });

    assert(proto.listManifests().length === 3, '3 个 Manifest');
    assert(proto.getManifest('code-agent') !== null, 'code-agent 存在');
    assert(proto.getManifest('nonexistent') === null, '不存在返回 null');

    // ---- Test 8: 按能力查找 ----
    console.log('\nTest 8: 按能力查找');
    const reviewAgents = proto.findByCapability('review');
    assert(reviewAgents.length === 2, '2 个有 review 能力');
    const deployAgents = proto.findByCapability('deploy');
    assert(deployAgents.length === 1, '1 个有 deploy 能力');
    const noAgents = proto.findByCapability('nonexistent');
    assert(noAgents.length === 0, '无匹配返回空');

    // ---- Test 9: 注销 Manifest ----
    console.log('\nTest 9: 注销 Manifest');
    assert(proto.unregisterManifest('deploy-agent') === true, '注销成功');
    assert(proto.listManifests().length === 2, '剩 2 个');
    assert(proto.unregisterManifest('nonexistent') === false, '不存在返回 false');

    // ---- Test 10: Adapter 注册 ----
    console.log('\nTest 10: Adapter 注册');
    proto.registerAdapter('json-adapter');
    proto.registerAdapter('custom-adapter', { transform: (m) => ({ ...m, custom: true }) });
    assert(proto.listAdapters().length === 2, '2 个 Adapter');
    assert(proto.getAdapter('json-adapter') !== null, 'json-adapter 存在');

    // ---- Test 11: 消息路由 — 精确匹配 ----
    console.log('\nTest 11: 消息路由 — 精确匹配');
    let handlerCalled = false;
    proto.registerHandler('code-agent', (msg) => {
      handlerCalled = true;
      return { received: msg.payload };
    });

    const sendResult = proto.send(createMessage(MESSAGE_TYPE.REQUEST, { task: 'review' }, {
      source: 'user', target: 'code-agent'
    }));
    assert(sendResult.success === true, '发送成功');
    assert(sendResult.routed === true, '已路由');
    assert(handlerCalled === true, '处理器被调用');

    // ---- Test 12: 消息路由 — 广播 ----
    console.log('\nTest 12: 消息路由 — 广播');
    proto.registerHandler('review-agent', (msg) => ({ ack: true }));

    const broadcastResult = proto.send(createMessage(MESSAGE_TYPE.EVENT, { event: 'deploy' }, {
      source: 'system', target: '*'
    }));
    assert(broadcastResult.success === true, '广播成功');
    assert(broadcastResult.broadcast === true, '标记为广播');
    assert(broadcastResult.results.length === 2, '2 个处理器收到');

    // ---- Test 13: 消息路由 — 队列 ----
    console.log('\nTest 13: 消息路由 — 队列');
    const queueResult = proto.send(createMessage(MESSAGE_TYPE.REQUEST, { data: 'test' }, {
      source: 'user', target: 'unknown-agent'
    }));
    assert(queueResult.success === true, '入队成功');
    assert(queueResult.queued === true, '标记为队列');
    assert(proto.getQueueSize() === 1, '队列大小 = 1');

    // 消费队列
    const drained = proto.drainQueue((msg) => ({ processed: msg.id }));
    assert(drained.length === 1, '消费 1 条');
    assert(proto.getQueueSize() === 0, '队列清空');

    // ---- Test 14: 中间件 ----
    console.log('\nTest 14: 中间件');
    let mwCalled = false;
    proto.use((msg) => {
      mwCalled = true;
      return { ...msg, metadata: { ...msg.metadata, traced: true } };
    });

    proto.send(createMessage(MESSAGE_TYPE.REQUEST, { x: 1 }, {
      source: 'test', target: 'code-agent'
    }));
    assert(mwCalled === true, '中间件被调用');

    // 中间件拒绝
    proto.use((msg) => {
      if (msg.payload && msg.payload.blocked) return null;
      return msg;
    });
    const blockedResult = proto.send(createMessage(MESSAGE_TYPE.REQUEST, { blocked: true }, {
      source: 'test', target: 'code-agent'
    }));
    assert(blockedResult.success === false, '中间件拒绝消息');

    // ---- Test 15: request 便捷方法 ----
    console.log('\nTest 15: request 便捷方法');
    const reqResult = proto.request('code-agent', { action: 'analyze' }, { source: 'cli' });
    assert(reqResult.success === true, 'request 成功');

    // ---- Test 16: emit 便捷方法 ----
    console.log('\nTest 16: emit 便捷方法');
    const emitResult = proto.emit('task_completed', { taskId: 'T-1' });
    assert(emitResult.success === true, 'emit 成功');
    assert(emitResult.broadcast === true, 'emit 广播');

    // ---- Test 17: 无效消息发送 ----
    console.log('\nTest 17: 无效消息发送');
    const badSend = proto.send({ type: 'invalid' });
    assert(badSend.success === false, '无效消息发送失败');

    // ---- Test 18: 协议协商 ----
    console.log('\nTest 18: 协议协商');
    const compat = proto.negotiateVersion('1.0.0');
    assert(compat.compatible === true, '相同版本兼容');

    const incompat = proto.negotiateVersion('2.0.0');
    assert(incompat.compatible === false, '不同主版本不兼容');

    // ---- Test 19: 握手 ----
    console.log('\nTest 19: 握手');
    const shake = proto.handshake('code-agent');
    assert(shake.success === true, '握手成功');
    assert(shake.agentId === 'code-agent', 'agentId 正确');
    assert(shake.sessionId.startsWith('session_'), 'sessionId 正确');

    const badShake = proto.handshake('nonexistent');
    assert(badShake.success === false, '未注册 Agent 握手失败');

    // ---- Test 20: getStats ----
    console.log('\nTest 20: getStats');
    const stats = proto.getStats();
    assert(stats.registeredManifests === 2, '2 个 Manifest');
    assert(stats.registeredAdapters === 2, '2 个 Adapter');
    assert(stats.registeredHandlers === 2, '2 个 Handler');
    assert(stats.middlewareCount === 2, '2 个中间件');
    assert(stats.protocolVersion === PROTOCOL_VERSION, '协议版本正确');
    assert(stats.messageHistorySize > 0, '消息历史 > 0');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 UnifiedProtocol 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testUnifiedProtocol();
