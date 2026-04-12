const AgentExecutor = require('./src/agent-executor');
const AgentRegistry = require('./src/agent-registry');

async function test() {
  console.log('=== Research Agent 真实测试 ===\n');

  // 初始化 AgentRegistry
  const registry = new AgentRegistry();

  // 初始化 AgentExecutor
  const executor = new AgentExecutor(registry, process.cwd());

  const task = {
    action: 'browser_visit',
    url: 'https://www.taobao.com',
    extractText: true,
    screenshot: false
  };

  console.log('正在打开淘宝...\n');

  try {
    const result = await executor.executeResearchAgent(task);
    console.log('执行结果:');
    console.log(JSON.stringify(result, null, 2));
  } catch(e) {
    console.log('错误:', e.message);
    console.log(e.stack);
  }
}

test();
