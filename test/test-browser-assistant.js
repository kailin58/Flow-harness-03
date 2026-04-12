const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { BrowserAssistant, BROWSER_STATE } = require('../src/browser-assistant');
const { Event } = require('events');

describe('基础功能', () => {
  let assistant;

  beforeEach(async () => {
    assistant = new BrowserAssistant();
    await assistant.init();
  });

  afterEach(async () => {
    await assistant.close();
  });

  test('初始化浏览器', async () => {
    assert.ok(assistant.browser);
    assert.ok(assistant.context);
    assert.ok(assistant.page);
  });

  test('访问页面', async () => {
    const result = await assistant.visit('https://example.com');
    assert.strictEqual(result.success, true);
  });

  test('检测登录需求', async () => {
    const result = await assistant.visit('https://login-required.example.com');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.needLogin, true);
    assert.strictEqual(result.pendingAction.type, 'login');
    assert.strictEqual(result.pendingAction.message, '请在浏览器中登录');
    assert.strictEqual(result.pendingAction.url, 'https://login-required.example.com');
  });

  test('用户确认', async () => {
    // 模拟用户确认
    assistant.pendingAction = { type: 'login', message: '请在浏览器中登录' };
    assistant.once('confirmed', () => {});
    const confirmResult = await assistant.confirmHumanAction({
      extractText: true,
      screenshot: true
    });
    assert.strictEqual(confirmResult.success, true);
    assert.strictEqual(confirmResult.content, 'Test content');
    assert.strictEqual(confirmResult.title, 'Test Page');
    assert.strictEqual(confirmResult.screenshot, 'base64');
  });

  test('截图', async () => {
    const screenshot = await assistant.page.screenshot({ encoding: 'base64' });
    assert.ok(screenshot);
  });

  test('获取状态', async () => {
    const status = assistant.getStatus();
    assert.strictEqual(status.state, BROWSER_STATE.IDLE);
    assert.strictEqual(status.pendingAction, null);
    assert.strictEqual(status.currentUrl, 'https://example.com');
  });
});
