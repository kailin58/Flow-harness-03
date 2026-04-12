/**
 * 智能浏览器操作类
 * 混合多种技术绕过反爬检测
 *
 * 策略：
 * 1. 多层检测 - 先用选择器，失败时升级到视觉识别
 * 2. 验证机制 - 每次操作后验证结果
 * 3. 随机化 - 所有操作都有随机性
 * 4. 异常检测 - 检测是否被反爬系统识别
 * 5. 视觉定位 - 使用图像识别定位元素
 * 6. 网站策略 - 不同网站使用不同策略
 * 7. 位置记忆 - 记忆常用元素位置
 */

const { chromium } = require('playwright');
const { HumanLike } = require('./human-like');
const { VisionRecognition } = require('./vision-recognition');
const { SiteStrategy } = require('./site-strategy');

class SmartBrowser {
  constructor(page, options = {}) {
    this.page = page;
    this.human = new HumanLike(options.humanLike || {});
    this.vision = new VisionRecognition(page, options.visionConfig || {});
    this.siteStrategy = new SiteStrategy(options.strategyConfig || {});
    this.options = {
      maxRetries: 3,
      fallbackToVisual: true,
      verifyActions: true,
      stealthMode: true,
      useMemory: true,
      verifyAccuracy: true,
      ...options
    };

    // 操作计数器（用于检测频率异常）
    this.actionCount = 0;
    this.lastActionTime = Date.now();
    this.errorCount = 0;

    // 页面状态缓存
    this.pageState = {
      lastUrl: null,
      lastTitle: null,
      lastScreenshot: null
    };

    // 当前网站策略
    this.currentStrategy = null;
  }

  // ============ 智能点击 ============

  /**
   * 智能点击 - 多层策略
   * @param {string} selector - CSS选择器
   * @param {Object} options - 选项
   */
  async smartClick(selector, options = {}) {
    const maxRetries = options.maxRetries || this.options.maxRetries;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 策略1: 直接点击（最快）
        if (attempt === 0) {
          const result = await this._directClick(selector, options);
          if (result.success) return result;
        }

        // 策略2: 滚动到元素后点击
        if (attempt === 1) {
          const result = await this._scrollAndClick(selector, options);
          if (result.success) return result;
        }

        // 策略3: 视觉识别点击（最安全）
        if (attempt === 2 && this.options.fallbackToVisual) {
          const result = await this._visualClick(selector, options);
          if (result.success) return result;
        }

      } catch (e) {
        this.errorCount++;
        console.log(`点击尝试 ${attempt + 1} 失败: ${e.message}`);
      }
    }

    // 所有策略都失败，抛出错误
    throw new Error(`智能点击失败: ${selector}`);
  }

  /**
   * 直接点击
   */
  async _directClick(selector, options) {
    // 检查元素是否存在
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error('元素不存在');
    }

    // 检查是否可见
    const isVisible = await element.isVisible();
    if (!isVisible) {
      throw new Error('元素不可见');
    }

    // 人类行为点击
    await this.human.click(this.page, selector);

    // 验证点击效果
    if (this.options.verifyActions) {
    await this._verifyClick(selector, options);
    }

    return { success: true, method: 'direct' };
  }

  /**
   * 滚动并点击
   */
  async _scrollAndClick(selector, options) {
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error('元素不存在');
    }

    // 滚动到元素
    await element.scrollIntoViewIfNeeded();

    // 随机延迟
    await this.human.randomDelay(300, 800);

    // 再次检查可见性
    const isVisible = await element.isVisible();
    if (!isVisible) {
      throw new Error('元素仍然不可见');
    }

    // 点击
    await this.human.click(this.page, selector);

    return { success: true, method: 'scroll' };
  }

  /**
   * 视觉识别点击（最安全）
   */
  async _visualClick(selector, options) {
    // 先截图
    const screenshot = await this.page.screenshot({ encoding: 'base64' });

    // 这里可以使用图像识别服务找到元素位置
    // 目前使用简化版本：基于元素位置计算
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error('元素不存在');
    }

    const box = await element.boundingBox();
    if (!box) {
      throw new Error('无法获取元素位置');
    }

    // 计算点击位置（元素中心，带随机偏移）
    const x = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.3;
    const y = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.3;

    // 模拟人类移动鼠标
    await this.human.moveMouse(this.page, x, y);

    // 随机延迟
    await this.human.randomDelay(100, 300);

    // 点击
    await this.page.mouse.click(x, y);

    return { success: true, method: 'visual' };
  }

  /**
   * 验证点击效果
   */
  async _verifyClick(selector, options) {
    await this.human.randomDelay(200, 500);

    // 检查页面是否有变化
    // 可以根据options.expected来验证
    if (options.expected) {
      const expected = await this.page.$(options.expected);
      if (expected) {
        const isVisible = await expected.isVisible();
        return { verified: isVisible };
      }
    }

    return { verified: true };
  }

  // ============ 智能输入 ============

  /**
   * 智能输入 - 模拟人类打字
   * @param {string} selector - CSS选择器
   * @param {string} text - 要输入的文字
   * @param {Object} options - 选项
   */
  async smartType(selector, text, options = {}) {
    // 先聚焦
    await this.smartClick(selector, options);

    // 清空现有内容
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('a');
    await this.page.keyboard.up('Control');

    await this.human.randomDelay(100, 300);

    // 模拟打字
    await this.human.type(this.page, selector, text);

    return { success: true };
  }

  // ============ 智能导航 ============

  /**
   * 智能导航
   * @param {string} url - 目标URL
   * @param {Object} options - 选项
   */
  async smartNavigate(url, options = {}) {
    // 检查频率限制
    await this._checkRateLimit();

    // 加载网站策略
    await this.siteStrategy.init();
    this.currentStrategy = this.siteStrategy.getStrategy(url);

    console.log(`网站策略: ${this.currentStrategy.name} (${this.currentStrategy.type})`);

    // 应用策略的反检测设置
    const antiDetection = this.currentStrategy.antiDetection || {};
    const delay = antiDetection.humanDelay || { min: 500, max: 1500 };

    // 随机延迟
    await this.human.randomDelay(delay.min, delay.max);

    // 导航
    await this.page.goto(url, {
      waitUntil: options.waitUntil || 'domcontentloaded',
      timeout: options.timeout || 30000
    });

    // 等待页面加载
    await this.human.waitForPageLoad(this.page);

    // 检测是否被拦截
    const blocked = await this._detectBlocking();
    if (blocked) {
      console.log('检测到可能的反爬拦截');
      await this.siteStrategy.recordOperation(url, 'navigate', false, 'blocked');
      return { success: false, blocked: true };
    }

    // 模拟阅读页面
    if (options.humanRead !== false) {
      await this.human.readPage(this.page);
    }

    this.actionCount++;
    this.lastActionTime = Date.now();
    this.pageState.lastUrl = url;

    // 记录成功
    await this.siteStrategy.recordOperation(url, 'navigate', true, 'success');

    return { success: true, strategy: this.currentStrategy.name };
  }

  /**
   * 检查操作频率（防止过快）
   */
  async _checkRateLimit() {
    const now = Date.now();
    const timeSinceLastAction = now - this.lastActionTime;

    // 如果操作太快（小于500ms），强制延迟
    if (timeSinceLastAction < 500) {
      await this.human.randomDelay(500, 1000);
    }

    // 如果操作过于频繁（每分钟超过30次），也强制延迟
    if (this.actionCount > 30) {
      console.log('操作过于频繁，增加延迟');
      await this.human.randomDelay(2000, 5000);
      this.actionCount = 0; // 重置计数
    }
  }

  /**
   * 检测是否被反爬系统拦截
   */
  async _detectBlocking() {
    const url = this.page.url().toLowerCase();

    // 检测常见的拦截页面
    const blockingIndicators = [
      'captcha',
      'blocked',
      'access-denied',
      'forbidden',
      'robot-check',
      'verify',
      'security'
    ];

    // 检查URL
    if (blockingIndicators.some(ind => url.includes(ind))) {
      return true;
    }

    // 检查页面内容
    const content = await this.page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const indicators = ['captcha', 'blocked', 'access denied', 'robot', 'automated', 'verify'];
      return indicators.some(ind => text.includes(ind));
    });

    return content;
  }

  // ============ 智能等待 ============

  /**
   * 智能等待元素出现
   * @param {string} selector - CSS选择器
   * @param {Object} options - 选项
   */
  async smartWait(selector, options = {}) {
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            // 元素出现后随机延迟
            await this.human.randomDelay(100, 500);
            return { found: true, element };
          }
        }
      } catch (e) {
        // 忽略错误继续等待
      }

      // 随机等待间隔
      await this.human.randomDelay(200, 500);
    }

    throw new Error(`等待元素超时: ${selector}`);
  }

  // ============ 智能提取 ============

  /**
   * 智能提取文本
   * @param {string} selector - CSS选择器
   * @param {Object} options - 选项
   */
  async smartExtract(selector, options = {}) {
    await this.smartWait(selector, options);

    const element = await this.page.$(selector);
    if (!element) {
      throw new Error('元素不存在');
    }

    // 提取文本
    const text = await element.evaluate((el) => {
      // 尝试多种方式提取文本
      const methods = [
        () => el.innerText,
        () => el.textContent,
        () => el.getAttribute('value'),
        () => el.getAttribute('alt'),
        () => el.getAttribute('title')
      ];

      for (const method of methods) {
        const result = method();
        if (result && result.trim()) {
          return result.trim();
        }
      }

      return '';
    });

    return text;
  }

  /**
   * 智能提取链接
   * @param {string} selector - CSS选择器
   */
  async smartExtractLink(selector) {
    await this.smartWait(selector);

    const element = await this.page.$(selector);
    if (!element) {
      return null;
    }

    // 提取链接
    const href = await element.getAttribute('href');
    return href || null;
  }

  /**
   * 批量提取
   * @param {string} selector - CSS选择器
   * @param {Function} extractor - 提取函数
   */
  async smartExtractAll(selector, extractor) {
    const elements = await this.page.$$(selector);
    const results = [];

    for (const element of elements) {
      try {
        const result = await extractor(element);
        if (result) {
          results.push(result);
        }
        // 随机小延迟
        await this.human.randomDelay(50, 150);
      } catch (e) {
        continue;
      }
    }

    return results;
  }

  // ============ 反爬规避状态 ============

  /**
   * 获取当前反爬规避状态
   */
  getStealthStatus() {
    return {
      actionCount: this.actionCount,
      errorCount: this.errorCount,
      lastActionTime: this.lastActionTime,
      timeSinceLastAction: Date.now() - this.lastActionTime
    };
  }

  /**
   * 检查是否安全
   */
  isStealthy() {
    const status = this.getStealthStatus();
    // 检查各种指标
    return (
      status.errorCount < 5 &&  // 错误率不高
      status.actionCount < 50 &&  // 操作不过于频繁
      status.timeSinceLastAction > 100 &&  // 有间隔
      this.errorCount < status.actionCount * 0.1  // 错误率低于10%
    );
  }

  // ============ 视觉增强方法 ============

  /**
   * 视觉智能点击 - 使用视觉识别定位元素
   * @param {string} description - 元素描述（文字、提示等）
   * @param {Object} options - 选项
   */
  async visualClick(description, options = {}) {
    await this._checkRateLimit();

    const url = this.page.url();
    const elementKey = options.elementKey || description;

    // 1. 检查是否有记忆的位置
    let remembered = null;
    if (this.options.useMemory) {
      remembered = this.siteStrategy.findRememberedElement(url, elementKey);
      if (remembered && remembered.accuracy > 0.7) {
        console.log(`使用记忆位置 (${(remembered.accuracy * 100).toFixed(0)}% 准确度)`);

        // 验证记忆位置
        if (this.options.verifyAccuracy) {
          const verify = await this.siteStrategy.verifyElementPosition(
            this.page, elementKey, remembered.position
          );

          if (verify.verified) {
            // 记忆位置有效，直接使用
            const x = remembered.position.x + remembered.position.width / 2;
            const y = remembered.position.y + remembered.position.height / 2;

            await this.human.moveMouse(this.page, x, y);
            await this.human.randomDelay(100, 300);
            await this.page.mouse.click(x, y);

            await this.siteStrategy.recordOperation(url, 'click', true, 'memory');
            return {
              success: true,
              position: { x, y },
              method: 'memory',
              verified: true
            };
          }
        }
      }
    }

    // 2. 获取当前网站策略的点击方法顺序
    const methods = this.currentStrategy?.strategies?.click || ['selector', 'visual', 'coordinate'];
    let lastError = null;

    for (const method of methods) {
      try {
        const result = await this._clickByMethod(description, method, options);

        if (result.success) {
          // 记忆成功的位置
          if (this.options.useMemory && result.position) {
            await this.siteStrategy.rememberElement(url, elementKey, {
              x: result.position.x - (result.width || 50) / 2,
              y: result.position.y - (result.height || 25) / 2,
              width: result.width || 100,
              height: result.height || 50
            }, {
              selectors: options.selectors || [],
              method
            });
          }

          await this.siteStrategy.recordOperation(url, 'click', true, method);

          this.actionCount++;
          this.lastActionTime = Date.now();

          return result;
        }
      } catch (e) {
        lastError = e;
        console.log(`方法 ${method} 失败: ${e.message}`);
      }
    }

    // 所有方法都失败
    await this.siteStrategy.recordOperation(url, 'click', false, 'all_failed');
    throw lastError || new Error(`点击失败: ${description}`);
  }

  /**
   * 按指定方法点击
   */
  async _clickByMethod(description, method, options = {}) {
    switch (method) {
      case 'selector':
        return await this._clickBySelector(description, options);

      case 'visual':
        return await this._clickByVisual(description, options);

      case 'coordinate':
        return await this._clickByCoordinate(description, options);

      case 'memory':
        // 记忆方法在 visualClick 中已处理
        throw new Error('Memory method should be handled separately');

      default:
        throw new Error(`未知点击方法: ${method}`);
    }
  }

  /**
   * 通过选择器点击
   */
  async _clickBySelector(description, options) {
    const selectors = options.selectors || [];

    // 如果有预定义的选择器，尝试使用
    if (selectors.length > 0) {
      for (const selector of selectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              await this.human.click(this.page, selector);
              const box = await element.boundingBox();
              return {
                success: true,
                method: 'selector',
                position: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null,
                width: box?.width,
                height: box?.height
              };
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    // 尝试通过文字查找
    const textSelector = `text=/${description}/i`;
    try {
      const element = await this.page.$(textSelector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          await this.human.click(this.page, textSelector);
          const box = await element.boundingBox();
          return {
            success: true,
            method: 'selector',
            position: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null,
            width: box?.width,
            height: box?.height
          };
        }
      }
    } catch (e) {
      // 继续
    }

    throw new Error('选择器点击失败');
  }

  /**
   * 通过视觉识别点击
   */
  async _clickByVisual(description, options) {
    const button = await this.vision.findMostLikelyButton(description);

    if (!button) {
      throw new Error('视觉定位失败');
    }

    const x = button.x + button.width / 2 + (Math.random() - 0.5) * button.width * 0.3;
    const y = button.y + button.height / 2 + (Math.random() - 0.5) * button.height * 0.3;

    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    return {
      success: true,
      method: 'visual',
      position: { x, y },
      width: button.width,
      height: button.height,
      matchType: button.matchType
    };
  }

  /**
   * 通过坐标点击
   */
  async _clickByCoordinate(description, options) {
    if (!options.coordinates) {
      throw new Error('未提供坐标');
    }

    const { x, y } = options.coordinates;

    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    return {
      success: true,
      method: 'coordinate',
      position: { x, y }
    };
  }

  /**
   * 视觉智能输入 - 使用视觉识别定位输入框
   * @param {string} placeholder - 输入框占位符
   * @param {string} text - 要输入的文字
   */
  async visualType(placeholder, text) {
    this._checkRateLimit();

    // 1. 视觉定位输入框
    const input = await this.vision.findInputField(placeholder);

    if (!input) {
      throw new Error(`视觉定位失败: 未找到输入框 "${placeholder}"`);
    }

    // 2. 点击聚焦
    const x = input.x + input.width / 2;
    const y = input.y + input.height / 2;

    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(50, 150);
    await this.page.mouse.click(x, y);

    // 3. 清空并输入
    await this.human.randomDelay(100, 200);
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('a');
    await this.page.keyboard.up('Control');

    await this.human.randomDelay(100, 300);
    await this.human.type(this.page, 'input', text);

    this.actionCount++;
    this.lastActionTime = Date.now();

    return { success: true, placeholder };
  }

  /**
   * 等待页面视觉稳定
   * @param {Object} options - 选项
   */
  async waitForStable(options = {}) {
    return await this.vision.waitForVisualStable(options);
  }

  /**
   * 分析页面区域
   */
  async analyzeRegions() {
    return await this.vision.analyzePageRegions();
  }

  /**
   * 检测页面变化
   * @param {Buffer} before - 之前的截图
   * @returns {Promise<Object>} 变化检测结果
   */
  async detectChanges(before) {
    const after = await this.vision.captureScreen();
    return await this.vision.detectVisualDiff(before, after);
  }

  /**
   * 智能提取数据
   * @param {Object} schema - 提取规则 { 字段名: 选择器 }
   */
  async extractData(schema) {
    return await this.vision.extractPageData(schema);
  }

  /**
   * 截图并保存
   * @param {string} filename - 文件名
   */
  async captureAndSave(filename) {
    await this.vision.captureScreen();
    return await this.vision.saveScreenshot(filename);
  }

  /**
   * 智能查找链接并点击
   * @param {string} linkText - 链接文字
   */
  async clickLink(linkText) {
    const link = await this.vision.findLink(linkText);

    if (!link) {
      throw new Error(`未找到链接: ${linkText}`);
    }

    const x = link.x + link.width / 2 + (Math.random() - 0.5) * link.width * 0.2;
    const y = link.y + link.height / 2 + (Math.random() - 0.5) * link.height * 0.2;

    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    this.actionCount++;
    this.lastActionTime = Date.now();

    return { success: true, link };
  }

  /**
   * 监控页面变化
   * @param {Function} onChange - 变化回调
   * @param {Object} options - 选项
   */
  startMonitoring(onChange, options = {}) {
    return this.vision.monitorPageChanges(onChange, options);
  }

  /**
   * 获取完整状态
   */
  getFullStatus() {
    return {
      stealth: this.getStealthStatus(),
      page: {
        url: this.page.url(),
        title: null // 异步获取
      },
      actionCount: this.actionCount,
      errorCount: this.errorCount,
      strategy: this.currentStrategy?.name || 'default'
    };
  }

  // ============ 网站策略方法 ============

  /**
   * 获取准确度报告
   */
  getAccuracyReport(url = null) {
    return this.siteStrategy.getAccuracyReport(url);
  }

  /**
   * 添加网站到白名单
   */
  async addToWhitelist(url) {
    await this.siteStrategy.addToWhitelist(url);
  }

  /**
   * 检查是否在白名单
   */
  isWhitelisted(url) {
    return this.siteStrategy.isWhitelisted(url);
  }

  /**
   * 设置自定义策略
   */
  async setCustomStrategy(domain, strategy) {
    return await this.siteStrategy.setCustomStrategy(domain, strategy);
  }

  /**
   * 获取当前网站策略
   */
  getCurrentStrategy() {
    return this.currentStrategy;
  }

  /**
   * 获取最佳操作方法
   */
  getBestMethod(operation) {
    return this.siteStrategy.getBestMethod(this.page.url(), operation);
  }

  /**
   * 记忆元素位置
   */
  async rememberElement(elementKey, position, metadata = {}) {
    return await this.siteStrategy.rememberElement(
      this.page.url(), elementKey, position, metadata
    );
  }

  /**
   * 查找记忆的元素
   */
  findRememberedElement(elementKey) {
    return this.siteStrategy.findRememberedElement(this.page.url(), elementKey);
  }

  /**
   * 验证元素位置
   */
  async verifyElementPosition(elementKey, expectedPosition) {
    return await this.siteStrategy.verifyElementPosition(
      this.page, elementKey, expectedPosition
    );
  }

  /**
   * 智能输入（带策略）
   */
  async smartInput(placeholder, text, options = {}) {
    await this._checkRateLimit();

    const url = this.page.url();
    const elementKey = options.elementKey || `input:${placeholder}`;

    // 获取策略
    const methods = this.currentStrategy?.strategies?.input || ['selector', 'visual'];

    // 检查记忆
    if (this.options.useMemory) {
      const remembered = this.siteStrategy.findRememberedElement(url, elementKey);
      if (remembered && remembered.accuracy > 0.7) {
        // 使用记忆的位置
        const x = remembered.position.x + remembered.position.width / 2;
        const y = remembered.position.y + remembered.position.height / 2;

        await this.human.moveMouse(this.page, x, y);
        await this.human.randomDelay(50, 150);
        await this.page.mouse.click(x, y);
        await this.human.type(this.page, 'input', text);

        await this.siteStrategy.recordOperation(url, 'input', true, 'memory');
        return { success: true, method: 'memory' };
      }
    }

    // 按策略尝试
    for (const method of methods) {
      try {
        if (method === 'selector') {
          // 尝试选择器
          const selectors = options.selectors || [
            `input[placeholder*="${placeholder}"]`,
            `input[name*="${placeholder.toLowerCase()}"]`,
            `#${placeholder.toLowerCase()}`
          ];

          for (const selector of selectors) {
            try {
              const element = await this.page.$(selector);
              if (element) {
                const isVisible = await element.isVisible();
                if (isVisible) {
                  await this.human.click(this.page, selector);
                  await this.human.randomDelay(100, 200);
                  await this.human.type(this.page, selector, text);

                  // 记忆
                  const box = await element.boundingBox();
                  if (box) {
                    await this.siteStrategy.rememberElement(url, elementKey, box, { selectors });
                  }

                  await this.siteStrategy.recordOperation(url, 'input', true, 'selector');
                  return { success: true, method: 'selector' };
                }
              }
            } catch (e) {
              continue;
            }
          }
        } else if (method === 'visual') {
          // 视觉定位
          const input = await this.vision.findInputField(placeholder);
          if (input) {
            const x = input.x + input.width / 2;
            const y = input.y + input.height / 2;

            await this.human.moveMouse(this.page, x, y);
            await this.human.randomDelay(50, 150);
            await this.page.mouse.click(x, y);
            await this.human.type(this.page, 'input', text);

            await this.siteStrategy.rememberElement(url, elementKey, {
              x: input.x, y: input.y, width: input.width, height: input.height
            });

            await this.siteStrategy.recordOperation(url, 'input', true, 'visual');
            return { success: true, method: 'visual' };
          }
        }
      } catch (e) {
        console.log(`输入方法 ${method} 失败: ${e.message}`);
      }
    }

    await this.siteStrategy.recordOperation(url, 'input', false, 'all_failed');
    throw new Error(`输入失败: ${placeholder}`);
  }

  /**
   * 智能提取（带策略）
   */
  async smartExtractData(schema, options = {}) {
    const url = this.page.url();
    const methods = this.currentStrategy?.strategies?.extract || ['selector', 'visual'];

    for (const method of methods) {
      try {
        if (method === 'selector') {
          const data = await this.vision.extractPageData(schema);
          if (Object.values(data).some(v => v !== null && v !== undefined)) {
            await this.siteStrategy.recordOperation(url, 'extract', true, 'selector');
            return { data, method: 'selector' };
          }
        } else if (method === 'visual') {
          // 视觉提取（通过边缘检测等）
          const elements = await this.vision.detectEdgeElements();
          const data = {};

          for (const [key, hint] of Object.entries(schema)) {
            const found = elements.find(el =>
              el.text?.toLowerCase().includes(hint.toLowerCase()) ||
              el.className?.toLowerCase().includes(hint.toLowerCase())
            );
            if (found) {
              data[key] = found.text;
            }
          }

          if (Object.keys(data).length > 0) {
            await this.siteStrategy.recordOperation(url, 'extract', true, 'visual');
            return { data, method: 'visual' };
          }
        }
      } catch (e) {
        console.log(`提取方法 ${method} 失败: ${e.message}`);
      }
    }

    await this.siteStrategy.recordOperation(url, 'extract', false, 'all_failed');
    return { data: {}, method: 'failed' };
  }
}

module.exports = { SmartBrowser };
