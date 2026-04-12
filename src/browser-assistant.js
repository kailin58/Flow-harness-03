/**
 * Browser Assistant - 浏览器辅助模块（人工辅助模式）
 *
 * 核心原则：人操作，AI 辅助
 * - 遇到登录/验证码时暂停，通知用户
 * - 用户人工处理后继续
 * - 完全合规，不破解、不绕过
 *
 * 合规声明：
 * 1. 所有登录操作由人工完成
 * 2. 不自动绕过任何验证码
 * 3. 遵守网站服务条款
 *
 * 连接模式：
 * - 自动检测本机安装的浏览器
 * - 支持用户设置优先级
 * - 优先连接已启用调试的浏览器
 * - 使用用户已有的登录状态、密码、cookies
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { exec } = require('child_process');
const { promisify } = require('util');
const { BrowserDetector, BROWSER_CONFIG } = require('./browser-detector');
const { HumanLike } = require('./human-like');
const { VisionRecognition } = require('./vision-recognition');

const execAsync = promisify(exec);

/**
 * 浏览器状态
 */
const BROWSER_STATE = {
  IDLE: 'idle',               // 空闲
  NAVIGATING: 'navigating',   // 导航中
  WAITING_LOGIN: 'waiting_login',     // 等待人工登录
  WAITING_CAPTCHA: 'waiting_captcha', // 等待人工处理验证码
  READY: 'ready',             // 已登录就绪
  ERROR: 'error'              // 错误
};

/**
 * 浏览器辅助类（人工辅助模式）
 */
class BrowserAssistant extends EventEmitter {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super();

    this.userDataDir = options.userDataDir || path.join(process.cwd(), '.flowharness', 'browser-session');
    this.headless = false; // 人工辅助模式必须显示浏览器
    this.timeout = options.timeout || 300000; // 5分钟超时
    this.preferredBrowser = options.preferredBrowser || null; // 用户指定的浏览器

    this.browser = null;
    this.context = null;
    this.page = null;
    this.state = BROWSER_STATE.IDLE;
    this.connectedToLocalBrowser = false; // 是否连接到本机浏览器
    this.currentBrowser = null; // 当前使用的浏览器信息

    // 浏览器检测器
    this.detector = new BrowserDetector();

    // 人类行为模拟器
    this.human = new HumanLike(options.humanConfig || {});

    // 视觉识别器
    this.vision = new VisionRecognition(this, options.visionConfig || {});

    // 当前等待的人工操作
    this.pendingAction = null;
  }

  // ============ 人类行为模拟方法 ============

  /**
   * 模拟人类打字
   */
  async humanType(selector, text) {
    return await this.human.type(this.page, selector, text);
  }

  /**
   * 模拟人类点击
   */
  async humanClick(selector) {
    return await this.human.click(this.page, selector);
  }

  /**
   * 模拟人类滚动
   */
  async humanScroll(distance) {
    return await this.human.scroll(this.page, distance);
  }

  /**
   * 模拟人类阅读
   */
  async humanRead() {
    return await this.human.readPage(this.page);
  }

  /**
   * 模拟人类浏览
   */
  async humanBrowse(duration) {
    return await this.human.browse(this.page, duration);
  }

  /**
   * 随机延迟
   */
  async randomDelay(min, max) {
    return await this.human.randomDelay(min, max);
  }

  // ============ 视觉识别方法 ============

  /**
   * 通过图像模板点击
   */
  async clickByImage(templateBuffer, options = {}) {
    return await this.vision.clickByImage(templateBuffer, options);
  }

  /**
   * 通过文字点击
   */
  async clickByText(text, options = {}) {
    return await this.vision.clickByText(text, options);
  }

  /**
   * 查找图像模板
   */
  async findTemplate(templateBuffer, options = {}) {
    return await this.vision.findTemplate(templateBuffer, options);
  }

  /**
   * 获取像素颜色
   */
  async getPixelColor(x, y) {
    return await this.vision.getPixelColor(x, y);
  }

  /**
   * 检测区域颜色
   */
  async hasColor(region, targetColor) {
    return await this.vision.hasColor(region, targetColor);
  }

  /**
   * 检查指定端口是否启用调试
   */
  async checkDebugPort(port) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        const data = await response.json();
        return { enabled: true, info: data };
      }
    } catch (e) {
      // 调试未启用
    }
    return { enabled: false, info: null };
  }

  /**
   * 启动带远程调试的浏览器
   */
  async startBrowserWithDebug(browserInfo) {
    const config = BROWSER_CONFIG[browserInfo.id];
    if (!config) {
      throw new Error(`不支持的浏览器: ${browserInfo.id}`);
    }

    console.log(`启动 ${config.name}（远程调试模式）...`);
    console.log('路径:', browserInfo.path);

    // 启动浏览器（后台运行）
    const command = `"${browserInfo.path}" --remote-debugging-port=${config.debugPort} --user-data-dir="${browserInfo.userDataPath}" --no-first-run --no-default-browser-check about:blank`;

    execAsync(command, {
      detached: true,
      windowsHide: true
    }).catch(() => {}); // 忽略错误，浏览器会在后台运行

    // 等待浏览器启动
    console.log('等待浏览器启动...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const { enabled, info } = await this.checkDebugPort(config.debugPort);
      if (enabled) {
        console.log(`${config.name} 已启动`);
        return { enabled: true, info };
      }
    }

    throw new Error(`${config.name} 启动超时`);
  }

  /**
   * 初始化浏览器
   */
  async init() {
    if (this.browser) return;

    await fs.mkdir(this.userDataDir, { recursive: true });

    console.log('初始化浏览器...');

    // 检测本机浏览器
    await this.detector.detectBrowsers();
    const config = await this.detector.loadConfig();

    // 选择最佳浏览器
    const selectedBrowser = await this.detector.selectBestBrowser();

    if (!selectedBrowser) {
      throw new Error('未检测到支持的浏览器');
    }

    this.currentBrowser = selectedBrowser;
    console.log(`选择浏览器: ${selectedBrowser.name} (${selectedBrowser.reason})`);

    // 如果浏览器已启用调试，直接连接
    if (selectedBrowser.debugEnabled) {
      try {
        const { info } = await this.checkDebugPort(selectedBrowser.debugPort);
        this.browser = await chromium.connectOverCDP(`http://localhost:${selectedBrowser.debugPort}`);
        this.connectedToLocalBrowser = true;
        console.log(`已连接到 ${selectedBrowser.name}（使用已有登录状态）`);

        // 获取现有上下文和页面
        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          if (pages.length > 0) {
            this.page = pages[0];
          } else {
            this.page = await this.context.newPage();
          }
        } else {
          this.context = await this.browser.newContext();
          this.page = await this.context.newPage();
        }

        this.page.setDefaultTimeout(this.timeout);
        this.emit('initialized');
        return;
      } catch (e) {
        console.log(`连接 ${selectedBrowser.name} 失败:`, e.message);
      }
    }

    // 浏览器已安装但未启用调试，尝试启动
    if (selectedBrowser.installed && config.autoStart) {
      try {
        await this.startBrowserWithDebug(selectedBrowser);

        // 连接到刚启动的浏览器
        this.browser = await chromium.connectOverCDP(`http://localhost:${selectedBrowser.debugPort}`);
        this.connectedToLocalBrowser = true;
        console.log(`已连接到 ${selectedBrowser.name}（使用已有登录状态）`);

        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        } else {
          this.context = await this.browser.newContext();
          this.page = await this.context.newPage();
        }

        this.page.setDefaultTimeout(this.timeout);
        this.emit('initialized');
        return;
      } catch (e) {
        console.log(`启动 ${selectedBrowser.name} 失败:`, e.message);
      }
    }

    // 无法连接本地浏览器，启动独立实例
    console.log('启动独立浏览器实例...');

    // 加载保存的会话状态
    const statePath = path.join(this.userDataDir, 'browser-state.json');
    let savedState = null;
    try {
      savedState = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      console.log('已加载保存的会话状态');
    } catch (e) {
      // 无保存的状态
    }

    // 使用 Playwright 启动
    const browserId = selectedBrowser.id === 'edge' ? 'msedge' : selectedBrowser.id;
    this.browser = await chromium.launch({
      headless: false,
      channel: browserId,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ]
    });

    const contextOptions = {
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (savedState?.storageState) {
      contextOptions.storageState = savedState.storageState;
    }

    this.context = await this.browser.newContext(contextOptions);

    if (savedState?.cookies && savedState.cookies.length > 0) {
      try {
        await this.context.addCookies(savedState.cookies);
        console.log(`已恢复 ${savedState.cookies.length} 个 cookies`);
      } catch (e) {
        console.log('恢复 cookies 失败:', e.message);
      }
    }

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);

    this.emit('initialized');
    console.log('浏览器初始化完成');
  }

  /**
   * 让用户选择浏览器
   * @returns {Object} 包含问题和检测到的浏览器列表
   */
  async prepareBrowserSelection() {
    await this.detector.detectBrowsers();
    await this.detector.loadConfig();

    const question = this.detector.generateSelectionQuestion();

    return {
      question,
      browsers: this.detector.detectedBrowsers,
      report: this.detector.getStatusReport()
    };
  }

  /**
   * 使用用户选择的浏览器初始化
   * @param {string} browserId - 用户选择的浏览器ID ('auto' 或具体浏览器ID)
   */
  async initWithUserSelection(browserId) {
    if (this.browser) return;

    await fs.mkdir(this.userDataDir, { recursive: true });

    console.log('初始化浏览器...');

    // 检测本机浏览器
    await this.detector.detectBrowsers();
    const config = await this.detector.loadConfig();

    // 选择浏览器
    let selectedBrowser;
    if (browserId === 'auto') {
      selectedBrowser = await this.detector.selectBestBrowser();
    } else {
      selectedBrowser = this.detector.getBrowserBySelection(browserId);
    }

    if (!selectedBrowser || !selectedBrowser.installed) {
      throw new Error(`浏览器不可用: ${browserId}`);
    }

    this.currentBrowser = selectedBrowser;
    console.log(`选择浏览器: ${selectedBrowser.nameCN} (${selectedBrowser.name})`);

    // 如果浏览器已启用调试，直接连接
    if (selectedBrowser.debugEnabled) {
      try {
        const { info } = await this.checkDebugPort(selectedBrowser.debugPort);
        this.browser = await chromium.connectOverCDP(`http://localhost:${selectedBrowser.debugPort}`);
        this.connectedToLocalBrowser = true;
        console.log(`已连接到 ${selectedBrowser.nameCN}（使用已有登录状态）`);

        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        } else {
          this.context = await this.browser.newContext();
          this.page = await this.context.newPage();
        }

        this.page.setDefaultTimeout(this.timeout);
        this.emit('initialized');
        return;
      } catch (e) {
        console.log(`连接 ${selectedBrowser.nameCN} 失败:`, e.message);
      }
    }

    // 浏览器已安装但未启用调试，尝试启动
    if (config.autoStart) {
      try {
        await this.startBrowserWithDebug(selectedBrowser);

        this.browser = await chromium.connectOverCDP(`http://localhost:${selectedBrowser.debugPort}`);
        this.connectedToLocalBrowser = true;
        console.log(`已连接到 ${selectedBrowser.nameCN}（使用已有登录状态）`);

        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        } else {
          this.context = await this.browser.newContext();
          this.page = await this.context.newPage();
        }

        this.page.setDefaultTimeout(this.timeout);
        this.emit('initialized');
        return;
      } catch (e) {
        console.log(`启动 ${selectedBrowser.nameCN} 失败:`, e.message);
      }
    }

    // 无法连接，启动独立实例
    console.log('启动独立浏览器实例...');

    const launchChannel = selectedBrowser.id === 'edge' ? 'msedge' : selectedBrowser.id;
    this.browser = await chromium.launch({
      headless: false,
      channel: launchChannel,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });

    this.context = await this.browser.newContext({
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);

    this.emit('initialized');
    console.log('浏览器初始化完成');
  }

  /**
   * 检查浏览器是否连接
   */
  isConnected() {
    return this.browser && this.browser.isConnected();
  }

  /**
   * 确保浏览器可用（自动重连）
   */
  async ensureConnected() {
    if (!this.browser) {
      await this.init();
    } else if (!this.isConnected()) {
      console.log('浏览器已断开，正在重新连接...');
      await this.saveSession();
      this.browser = null;
      this.context = null;
      this.page = null;
      await this.init();
      console.log('浏览器已重新连接');
    }
    return true;
  }

  /**
   * 访问需要登录的页面
   * @param {string} url - 目标 URL
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 结果
   */
  async visit(url, options = {}) {
    // 确保浏览器可用（自动重连）
    await this.ensureConnected();

    this.state = BROWSER_STATE.NAVIGATING;
    this.emit('navigating', { url });

    try {
      // 人类行为：随机延迟后再导航
      await this.human.randomDelay(300, 800);

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 人类行为：等待页面加载（模拟人类感知）
      await this.human.waitForPageLoad(this.page);

      // 人类行为：模拟阅读页面
      if (options.humanRead !== false) {
        await this.human.readPage(this.page);
      }

      // 检测是否需要登录
      const needsLogin = await this.detectLoginRequired();

      if (needsLogin) {
        this.state = BROWSER_STATE.WAITING_LOGIN;
        this.pendingAction = {
          type: 'login',
          url: this.page.url(),
          message: '请在新打开的浏览器窗口中完成登录，登录后点击"我已完成登录"按钮'
        };

        this.emit('waiting_login', this.pendingAction);

        return {
          success: false,
          needLogin: true,
          message: '需要人工登录',
          pendingAction: this.pendingAction
        };
      }

      // 检测是否有验证码
      const hasCaptcha = await this.detectCaptcha();

      if (hasCaptcha) {
        this.state = BROWSER_STATE.WAITING_CAPTCHA;
        this.pendingAction = {
          type: 'captcha',
          url: this.page.url(),
          message: '请在新打开的浏览器窗口中完成验证码，完成后点击"我已完成验证码"按钮'
        };

        this.emit('waiting_captcha', this.pendingAction);

        return {
          success: false,
          needCaptcha: true,
          message: '需要人工处理验证码',
          pendingAction: this.pendingAction
        };
      }

      this.state = BROWSER_STATE.READY;
      return await this.extractContent(options);

    } catch (error) {
      this.state = BROWSER_STATE.ERROR;
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 确认人工操作完成
   * 用户完成登录/验证码后调用此方法
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 结果
   */
  async confirmHumanAction(options = {}) {
    if (!this.pendingAction) {
      return {
        success: false,
        message: '没有待处理的人工操作'
      };
    }

    // 保存会话状态
    await this.saveSession();

    this.pendingAction = null;
    this.state = BROWSER_STATE.READY;

    // 提取内容
    return await this.extractContent(options);
  }

  /**
   * 取消当前等待
   */
  async cancelPending() {
    this.pendingAction = null;
    this.state = BROWSER_STATE.IDLE;

    return {
      success: true,
      message: '已取消等待'
    };
  }

  /**
   * 检测是否需要登录
   */
  async detectLoginRequired() {
    const loginIndicators = [
      'input[type="password"]',
      'input[name*="login"]',
      'input[name*="username"]',
      'input[name*="email"]',
      '.login-form',
      '#login-form',
      'button[type="submit"]'
    ];

    const currentUrl = this.page.url().toLowerCase();
    const urlIndicators = ['login', 'signin', 'auth', 'oauth'];

    // URL 包含登录关键词
    if (urlIndicators.some(ind => currentUrl.includes(ind))) {
      return true;
    }

    // 检查登录表单元素
    for (const selector of loginIndicators) {
      const element = await this.page.$(selector);
      if (element) {
        // 检查是否在登录相关区域
        const isVisible = await element.isVisible();
        if (isVisible) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检测是否有验证码
   */
  async detectCaptcha() {
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.g-recaptcha',
      '.h-captcha',
      'img[src*="captcha"]',
      '.captcha',
      '#captcha'
    ];

    for (const selector of captchaSelectors) {
      const element = await this.page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 提取页面内容
   */
  async extractContent(options = {}) {
    const url = this.page.url();
    const title = await this.page.title();

    let content;
    if (options.extractText) {
      content = await this.page.evaluate(() => {
        // 移除不需要的元素
        const removeSelectors = ['nav', 'header', 'footer', 'aside', '.sidebar', '.advertisement'];
        removeSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });
        return document.body.innerText;
      });
    } else {
      content = await this.page.content();
    }

    // 截图
    let screenshot = null;
    if (options.screenshot) {
      screenshot = await this.page.screenshot({ encoding: 'base64', fullPage: options.fullPage || false });
    }

    return {
      success: true,
      url,
      title,
      content,
      contentLength: content?.length || 0,
      screenshot
    };
  }

  /**
   * 保存会话状态
   */
  async saveSession() {
    if (!this.context) return;

    const statePath = path.join(this.userDataDir, 'browser-state.json');
    const storageState = await this.context.storageState();
    const cookies = await this.context.cookies();

    await fs.writeFile(statePath, JSON.stringify({
      storageState,
      cookies,
      savedAt: new Date().toISOString()
    }, null, 2));
  }

  /**
   * 清除会话状态（退出登录）
   */
  async clearSession() {
    const statePath = path.join(this.userDataDir, 'browser-state.json');
    try {
      await fs.unlink(statePath);
    } catch (e) {
      // 文件不存在
    }

    if (this.context) {
      await this.context.clearCookies();
    }

    return {
      success: true,
      message: '会话已清除'
    };
  }

  /**
   * 执行页面操作（人工辅助）
   */
  async performAction(action) {
    await this.init();

    switch (action.type) {
      case 'goto':
        // 人类行为：随机延迟后导航
        await this.human.randomDelay(300, 800);
        await this.page.goto(action.url, { waitUntil: 'domcontentloaded' });
        await this.human.readPage(this.page);
        return { success: true, message: `已导航到 ${action.url}` };

      case 'click':
        // 人类行为：模拟真实点击
        await this.human.click(this.page, action.selector);
        return { success: true, message: '已点击' };

      case 'fill':
        // 人类行为：模拟打字
        await this.human.type(this.page, action.selector, action.value);
        return { success: true, message: '已填写' };

      case 'screenshot':
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return { success: true, screenshot };

      case 'wait':
        await this.page.waitForSelector(action.selector, { timeout: action.timeout || 10000 });
        // 人类行为：元素出现后随机延迟
        await this.human.randomDelay(100, 300);
        return { success: true, message: '元素已出现' };

      default:
        return { success: false, message: '未知操作类型' };
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      state: this.state,
      pendingAction: this.pendingAction,
      currentUrl: this.page?.url() || null
    };
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      // 如果连接到本地浏览器，只断开连接，不关闭浏览器
      if (this.connectedToLocalBrowser) {
        const browserName = this.currentBrowser?.name || '浏览器';
        console.log(`断开与本地 ${browserName} 的连接（浏览器保持打开）`);
        this.browser = null;
        this.context = null;
        this.page = null;
        this.state = BROWSER_STATE.IDLE;
        this.connectedToLocalBrowser = false;
        this.currentBrowser = null;
      } else {
        // 自己启动的浏览器，保存会话后关闭
        await this.saveSession();
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.state = BROWSER_STATE.IDLE;
        this.currentBrowser = null;
      }
    }
  }

  // ============ 新增功能：网页扫码 ============

  /**
   * 扫描页面上的二维码
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 扫描结果
   */
  async scanQRCode(options = {}) {
    await this.ensureConnected();

    console.log('扫描页面上的二维码...');

    try {
      // 查找页面上的二维码图片
      const qrSelectors = [
        'img[src*="qr"]',
        'img[alt*="qr"]',
        'img[class*="qr"]',
        'canvas[class*="qr"]'
      ];

      for (const selector of qrSelectors) {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          console.log(`找到 ${elements.length} 个可能的二维码`);

          // 返回二维码图片信息
          for (const element of elements) {
            const imageData = await element.screenshot({ encoding: 'base64' });
            return {
              success: true,
              found: true,
              imageData,
              selector,
              message: '找到二维码图片'
            };
          }
        }
      }

      return {
        success: true,
        found: false,
        message: '未找到二维码'
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // ============ 新增功能：下载图片 ============

  /**
   * 下载单张图片
   * @param {string} selector - 图片选择器
   * @param {string} savePath - 保存路径
   * @returns {Promise<Object>} 下载结果
   */
  async downloadImage(selector, savePath) {
    await this.ensureConnected();

    console.log(`下载图片: ${selector}`);

    try {
      const element = await this.page.$(selector);
      if (!element) {
        return {
          success: false,
          error: '未找到图片元素'
        };
      }

      // 人类行为：随机延迟
      await this.human.randomDelay(100, 300);

      // 获取图片src
      const src = await element.getAttribute('src');
      if (!src) {
        return {
          success: false,
          error: '图片没有src属性'
        };
      }

      // 下载图片
      const response = await fetch(src);
      const buffer = await response.buffer();

      // 保存到文件
      await fs.mkdir(path.dirname(savePath), { recursive: true });
      await fs.writeFile(savePath, buffer);

      console.log(`图片已保存: ${savePath}`);

      return {
        success: true,
        path: savePath,
        size: buffer.length,
        url: src
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * 批量下载页面上的所有图片
   * @param {string} dir - 保存目录
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 下载结果
   */
  async downloadAllImages(dir, options = {}) {
    await this.ensureConnected();

    console.log('批量下载页面图片...');

    try {
      const imgSelector = options.selector || 'img';
      const images = await this.page.$$(imgSelector);
      const limit = options.limit || 20;

      console.log(`找到 ${images.length} 张图片`);

      const results = [];
      const downloaded = [];

      for (let i = 0; i < Math.min(images.length, limit); i++) {
        const img = images[i];
        try {
          const src = await img.getAttribute('src');
          if (!src || downloaded.includes(src)) continue;

          downloaded.push(src);

          const fileName = `image_${i + 1}_${Date.now()}.jpg`;
          const savePath = path.join(dir, fileName);

          const result = await this.downloadImage(imgSelector, savePath);
          results.push({
            index: i,
            src,
            ...result
          });

          // 人类行为：下载间隙随机延迟
          await this.human.randomDelay(100, 300);
        } catch (e) {
          results.push({
            index: i,
            error: e.message
          });
        }
      }

      return {
        success: true,
        total: results.length,
        results,
        dir
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // ============ 新增功能：截图 ============

  /**
   * 截取页面截图
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 截图结果
   */
  async takeScreenshot(options = {}) {
    await this.ensureConnected();

    console.log('截取页面截图...');

    try {
      const screenshot = await this.page.screenshot({
        encoding: 'base64',
        fullPage: options.fullPage || false
      });

      return {
        success: true,
        screenshot,
        url: this.page.url(),
        title: await this.page.title()
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * 截取元素截图
   * @param {string} selector - 元素选择器
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 截图结果
   */
  async takeElementScreenshot(selector, options = {}) {
    await this.ensureConnected();

    console.log(`截取元素截图: ${selector}`);

    try {
      const element = await this.page.$(selector);
      if (!element) {
        return {
          success: false,
          error: '未找到元素'
        };
      }

      const screenshot = await element.screenshot({
        encoding: 'base64'
      });

      return {
        success: true,
        screenshot,
        selector
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * 保存截图到文件
   * @param {string} savePath - 保存路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 保存结果
   */
  async saveScreenshot(savePath, options = {}) {
    await this.ensureConnected();

    console.log(`保存截图: ${savePath}`);

    try {
      await this.page.screenshot({
        path: savePath,
        fullPage: options.fullPage || false
      });

      return {
        success: true,
        path: savePath,
        url: this.page.url()
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // ============ 新增功能：视觉识别增强 ============

  /**
   * 智能定位按钮
   * @param {string} text - 按钮文字提示
   * @returns {Promise<Object|null>} 找到的按钮
   */
  async findButtonByText(text) {
    await this.ensureConnected();
    return await this.vision.findMostLikelyButton(text);
  }

  /**
   * 智能定位输入框
   * @param {string} placeholder - 占位符提示
   * @returns {Promise<Object|null>} 找到的输入框
   */
  async findInputByPlaceholder(placeholder) {
    await this.ensureConnected();
    return await this.vision.findInputField(placeholder);
  }

  /**
   * 智能定位链接
   * @param {string} text - 链接文字
   * @returns {Promise<Object|null>} 找到的链接
   */
  async findLinkByText(text) {
    await this.ensureConnected();
    return await this.vision.findLink(text);
  }

  /**
   * 检测页面边缘元素
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 边缘元素列表
   */
  async detectInteractiveElements(options = {}) {
    await this.ensureConnected();
    return await this.vision.detectEdgeElements(options);
  }

  /**
   * 分析页面区域
   * @returns {Promise<Object>} 区域分析结果
   */
  async analyzePageLayout() {
    await this.ensureConnected();
    return await this.vision.analyzePageRegions();
  }

  /**
   * 等待页面视觉稳定
   * @param {Object} options - 选项
   * @returns {Promise<boolean>} 是否稳定
   */
  async waitForPageStable(options = {}) {
    await this.ensureConnected();
    return await this.vision.waitForVisualStable(options);
  }

  /**
   * 比较两个截图的差异
   * @param {Buffer} before - 之前的截图
   * @param {Buffer} after - 之后的截图
   * @returns {Promise<Object>} 差异检测结果
   */
  async compareScreenshots(before, after) {
    return await this.vision.detectVisualDiff(before, after);
  }

  /**
   * 提取页面结构化数据
   * @param {Object} schema - 提取规则
   * @returns {Promise<Object>} 提取结果
   */
  async extractStructuredData(schema) {
    await this.ensureConnected();
    return await this.vision.extractPageData(schema);
  }

  /**
   * 智能点击（视觉+选择器混合）
   * @param {string} description - 元素描述
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 点击结果
   */
  async smartClickElement(description, options = {}) {
    await this.ensureConnected();

    // 先尝试选择器
    if (options.selector) {
      try {
        await this.human.click(this.page, options.selector);
        return { success: true, method: 'selector' };
      } catch (e) {
        // 继续尝试视觉定位
      }
    }

    // 视觉定位
    const button = await this.vision.findMostLikelyButton(description);
    if (!button) {
      return { success: false, error: `未找到: ${description}` };
    }

    // 计算点击位置
    const x = button.x + button.width / 2 + (Math.random() - 0.5) * button.width * 0.3;
    const y = button.y + button.height / 2 + (Math.random() - 0.5) * button.height * 0.3;

    // 人类行为移动并点击
    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    return {
      success: true,
      method: 'visual',
      position: { x, y },
      matchType: button.matchType
    };
  }

  /**
   * 智能输入（视觉+选择器混合）
   * @param {string} placeholder - 输入框描述
   * @param {string} text - 要输入的文字
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 输入结果
   */
  async smartInputText(placeholder, text, options = {}) {
    await this.ensureConnected();

    // 先尝试选择器
    if (options.selector) {
      try {
        await this.human.type(this.page, options.selector, text);
        return { success: true, method: 'selector' };
      } catch (e) {
        // 继续尝试视觉定位
      }
    }

    // 视觉定位
    const input = await this.vision.findInputField(placeholder);
    if (!input) {
      return { success: false, error: `未找到输入框: ${placeholder}` };
    }

    // 点击聚焦
    const x = input.x + input.width / 2;
    const y = input.y + input.height / 2;

    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(50, 150);
    await this.page.mouse.click(x, y);

    // 清空并输入
    await this.human.randomDelay(100, 200);
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('a');
    await this.page.keyboard.up('Control');

    await this.human.randomDelay(100, 300);

    // 模拟打字
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await this.page.keyboard.type(char);
      await this.human.randomDelay(30, 100);
    }

    return { success: true, method: 'visual' };
  }
}

module.exports = {
  BrowserAssistant,
  BROWSER_STATE
};
