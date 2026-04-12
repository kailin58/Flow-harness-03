/**
 * 浏览器检测器
 * 自动检测本机安装的浏览器，支持优先级配置
 * 支持国际浏览器和国产浏览器
 * 支持自动切换和下载建议
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { BrowserUsageTracker } = require('./browser-usage-tracker');

const execAsync = promisify(exec);

/**
 * 支持的浏览器配置
 * 包含国际浏览器和国产浏览器
 */
const BROWSER_CONFIG = {
  // ============ 国际浏览器 ============
  chrome: {
    name: 'Google Chrome',
    nameCN: '谷歌浏览器',
    executable: 'chrome.exe',
    windowsPaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'),
    debugPort: 9222,
    category: 'international',
    downloadUrl: 'https://www.google.com/chrome/',
    downloadUrlCN: 'https://www.google.cn/chrome/'
  },
  edge: {
    name: 'Microsoft Edge',
    nameCN: '微软Edge浏览器',
    executable: 'msedge.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data'),
    debugPort: 9223,
    category: 'international',
    downloadUrl: 'https://www.microsoft.com/edge',
    downloadUrlCN: 'https://www.microsoft.com/zh-cn/edge'
  },
  brave: {
    name: 'Brave',
    nameCN: 'Brave浏览器',
    executable: 'brave.exe',
    windowsPaths: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    debugPort: 9224,
    category: 'international'
  },
  firefox: {
    name: 'Mozilla Firefox',
    nameCN: '火狐浏览器',
    executable: 'firefox.exe',
    windowsPaths: [
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
    ],
    userDataPath: () => path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles'),
    debugPort: 6000,
    supportsCDP: false,
    category: 'international'
  },
  opera: {
    name: 'Opera',
    nameCN: 'Opera浏览器',
    executable: 'opera.exe',
    windowsPaths: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe'),
      'C:\\Program Files\\Opera\\opera.exe'
    ],
    userDataPath: () => path.join(process.env.APPDATA || '', 'Opera Software', 'Opera Stable'),
    debugPort: 9225,
    category: 'international'
  },

  // ============ 国产浏览器 ============
  qq: {
    name: 'QQ Browser',
    nameCN: 'QQ浏览器',
    executable: 'QQBrowser.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\Tencent\\QQBrowser\\QQBrowser.exe',
      'C:\\Program Files\\Tencent\\QQBrowser\\QQBrowser.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'Tencent', 'QQBrowser', 'User Data'),
    debugPort: 9230,
    category: 'chinese',
    downloadUrl: 'https://browser.qq.com/'
  },
  _360se: {
    name: '360 Secure Browser',
    nameCN: '360安全浏览器',
    executable: '360se.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\360\\360se6\\Application\\360se.exe',
      'C:\\Program Files\\360\\360se6\\Application\\360se.exe'
    ],
    userDataPath: () => path.join(process.env.APPDATA || '', '360se6'),
    debugPort: 9231,
    category: 'chinese',
    downloadUrl: 'https://browser.360.cn/se/'
  },
  _360chrome: {
    name: '360 Extreme Browser',
    nameCN: '360极速浏览器',
    executable: '360chrome.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\360\\360chrome\\Chrome\\Application\\360chrome.exe',
      'C:\\Program Files\\360\\360chrome\\Chrome\\Application\\360chrome.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', '360Chrome', 'Chrome', 'User Data'),
    debugPort: 9232,
    category: 'chinese',
    downloadUrl: 'https://browser.360.cn/ee/'
  },
  sogou: {
    name: 'Sogou Browser',
    nameCN: '搜狗浏览器',
    executable: 'SogouExplorer.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\SogouExplorer\\SogouExplorer.exe',
      'C:\\Program Files\\SogouExplorer\\SogouExplorer.exe'
    ],
    userDataPath: () => path.join(process.env.APPDATA || '', 'SogouExplorer'),
    debugPort: 9233,
    category: 'chinese',
    downloadUrl: 'https://ie.sogou.com/'
  },
  uc: {
    name: 'UC Browser',
    nameCN: 'UC浏览器',
    executable: 'UCBrowser.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\UCBrowser\\Application\\UCBrowser.exe',
      'C:\\Program Files\\UCBrowser\\Application\\UCBrowser.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'UCBrowser', 'User Data'),
    debugPort: 9234,
    category: 'chinese'
  },
  liebao: {
    name: 'Cheetah Browser',
    nameCN: '猎豹浏览器',
    executable: 'liebao.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\liebao\\liebao.exe',
      'C:\\Program Files\\liebao\\liebao.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'liebao'),
    debugPort: 9235,
    category: 'chinese'
  },
  cent: {
    name: 'Cent Browser',
    nameCN: '百分浏览器',
    executable: 'centbrowser.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\CentBrowser\\Application\\centbrowser.exe',
      'C:\\Program Files\\CentBrowser\\Application\\centbrowser.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'CentBrowser', 'User Data'),
    debugPort: 9236,
    category: 'chinese'
  },
  twinkle: {
    name: 'Twinkstar Browser',
    nameCN: '星愿浏览器',
    executable: 'Twinkstar.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\Twinkstar Browser\\Twinkstar.exe',
      'C:\\Program Files\\Twinkstar Browser\\Twinkstar.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'Twinkstar Browser', 'User Data'),
    debugPort: 9237,
    category: 'chinese'
  },
  maxthon: {
    name: 'Maxthon',
    nameCN: '傲游浏览器',
    executable: 'Maxthon.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\Maxthon\\Maxthon.exe',
      'C:\\Program Files\\Maxthon\\Maxthon.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', 'Maxthon3'),
    debugPort: 9238,
    category: 'chinese'
  },
  _2345: {
    name: '2345 Browser',
    nameCN: '2345浏览器',
    executable: '2345Explorer.exe',
    windowsPaths: [
      'C:\\Program Files (x86)\\2345Soft\\2345Explorer\\2345Explorer.exe',
      'C:\\Program Files\\2345Soft\\2345Explorer\\2345Explorer.exe'
    ],
    userDataPath: () => path.join(process.env.LOCALAPPDATA || '', '2345Explorer'),
    debugPort: 9239,
    category: 'chinese'
  }
};

/**
 * 浏览器检测器类
 */
class BrowserDetector {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), '.flowharness', 'browser-config.json');
    this.detectedBrowsers = [];
    this.config = null;
  }

  /**
   * 检测本机安装的浏览器
   */
  async detectBrowsers() {
    const detected = [];

    for (const [id, browser] of Object.entries(BROWSER_CONFIG)) {
      const result = {
        id,
        name: browser.name,
        nameCN: browser.nameCN || browser.name,
        category: browser.category || 'international',
        installed: false,
        path: null,
        userDataPath: null,
        debugPort: browser.debugPort,
        supportsCDP: browser.supportsCDP !== false,
        isRunning: false,
        debugEnabled: false
      };

      // 检查浏览器是否安装
      for (const browserPath of browser.windowsPaths) {
        try {
          await fs.access(browserPath);
          result.installed = true;
          result.path = browserPath;
          result.userDataPath = browser.userDataPath();
          break;
        } catch (e) {
          // 路径不存在
        }
      }

      if (result.installed) {
        // 检查是否正在运行且启用了远程调试
        if (result.supportsCDP) {
          result.debugEnabled = await this.checkDebugPort(result.debugPort);
          result.isRunning = result.debugEnabled;
        }

        detected.push(result);
      }
    }

    this.detectedBrowsers = detected;
    return detected;
  }

  /**
   * 检查调试端口是否可用
   */
  async checkDebugPort(port) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * 加载用户配置
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config;
    } catch (e) {
      // 配置文件不存在，使用默认配置
      // 默认优先级：国际浏览器优先，然后是国产浏览器
      this.config = {
        priority: [
          // 国际浏览器
          'chrome', 'edge', 'brave', 'opera', 'firefox',
          // 国产浏览器
          'qq', '_360se', '_360chrome', 'sogou', 'uc', 'liebao', 'cent', 'twinkle', 'maxthon', '_2345'
        ],
        autoStart: true,
        defaultDebugPort: 9222
      };
      return this.config;
    }
  }

  /**
   * 保存用户配置
   */
  async saveConfig(config) {
    this.config = { ...this.config, ...config };
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }

  /**
   * 根据优先级选择最佳浏览器
   */
  async selectBestBrowser() {
    await this.detectBrowsers();
    await this.loadConfig();

    // 优先选择已启用调试的浏览器
    const runningWithDebug = this.detectedBrowsers.filter(b => b.debugEnabled);
    if (runningWithDebug.length > 0) {
      // 按优先级排序
      runningWithDebug.sort((a, b) => {
        const priorityA = this.config.priority.indexOf(a.id);
        const priorityB = this.config.priority.indexOf(b.id);
        return (priorityA === -1 ? 999 : priorityA) - (priorityB === -1 ? 999 : priorityB);
      });
      return { ...runningWithDebug[0], reason: '已启用远程调试' };
    }

    // 选择已安装的浏览器（按优先级）
    const installed = this.detectedBrowsers.filter(b => b.installed && b.supportsCDP);
    if (installed.length > 0) {
      installed.sort((a, b) => {
        const priorityA = this.config.priority.indexOf(a.id);
        const priorityB = this.config.priority.indexOf(b.id);
        return (priorityA === -1 ? 999 : priorityA) - (priorityB === -1 ? 999 : priorityB);
      });
      return { ...installed[0], reason: '按优先级选择' };
    }

    return null;
  }

  /**
   * 获取浏览器状态报告
   */
  getStatusReport() {
    const lines = ['=== 本机浏览器检测报告 ===\n'];

    if (this.detectedBrowsers.length === 0) {
      lines.push('未检测到支持的浏览器');
      return lines.join('\n');
    }

    // 按优先级排序
    const sorted = [...this.detectedBrowsers].sort((a, b) => {
      const priorityA = this.config?.priority?.indexOf(a.id) ?? 999;
      const priorityB = this.config?.priority?.indexOf(b.id) ?? 999;
      return priorityA - priorityB;
    });

    // 分类显示
    const international = sorted.filter(b => b.category === 'international');
    const chinese = sorted.filter(b => b.category === 'chinese');

    if (international.length > 0) {
      lines.push('【国际浏览器】');
      for (const browser of international) {
        this._addBrowserInfo(lines, browser);
      }
    }

    if (chinese.length > 0) {
      lines.push('【国产浏览器】');
      for (const browser of chinese) {
        this._addBrowserInfo(lines, browser);
      }
    }

    return lines.join('\n');
  }

  /**
   * 添加浏览器信息
   */
  _addBrowserInfo(lines, browser) {
    const priority = this.config?.priority?.indexOf(browser.id) ?? -1;
    const priorityStr = priority >= 0 ? `优先级: ${priority + 1}` : '未配置';
    const statusStr = browser.debugEnabled ? '✓ 调试已启用' :
                      browser.installed ? '○ 已安装' : '✗ 未安装';

    lines.push(`  ${browser.nameCN} (${browser.name})`);
    lines.push(`    状态: ${statusStr} | ${priorityStr}`);
    if (browser.installed) {
      lines.push(`    路径: ${browser.path}`);
      lines.push(`    调试端口: ${browser.debugPort}`);
    }
  }

  /**
   * 生成用户选择的问题格式
   * @returns {Object} AskUserQuestion 格式的问题
   */
  generateSelectionQuestion() {
    if (this.detectedBrowsers.length === 0) {
      return null;
    }

    // 按优先级排序
    const sorted = [...this.detectedBrowsers].sort((a, b) => {
      const priorityA = this.config?.priority?.indexOf(a.id) ?? 999;
      const priorityB = this.config?.priority?.indexOf(b.id) ?? 999;
      return priorityA - priorityB;
    });

    // 按分类分组
    const international = sorted.filter(b => b.category === 'international');
    const chinese = sorted.filter(b => b.category === 'chinese');

    const options = [];

    // 添加国际浏览器选项
    if (international.length > 0) {
      options.push({
        label: '── 国际浏览器 ──',
        description: '',
        disabled: true
      });
      for (const browser of international) {
        const statusIcon = browser.debugEnabled ? '✓' : '○';
        options.push({
          id: browser.id,
          label: `${statusIcon} ${browser.nameCN}`,
          description: browser.debugEnabled
            ? `调试已启用 (端口 ${browser.debugPort})`
            : browser.installed
              ? '已安装'
              : '未安装',
          disabled: !browser.installed
        });
      }
    }

    // 添加国产浏览器选项
    if (chinese.length > 0) {
      options.push({
        label: '── 国产浏览器 ──',
        description: '',
        disabled: true
      });
      for (const browser of chinese) {
        const statusIcon = browser.debugEnabled ? '✓' : '○';
        options.push({
          id: browser.id,
          label: `${statusIcon} ${browser.nameCN}`,
          description: browser.debugEnabled
            ? `调试已启用 (端口 ${browser.debugPort})`
            : browser.installed
              ? '已安装'
              : '未安装',
          disabled: !browser.installed
        });
      }
    }

    // 添加自动选择选项
    const bestBrowser = sorted.find(b => b.installed);
    options.unshift({
      id: 'auto',
      label: '🔄 自动选择',
      description: bestBrowser
        ? `推荐: ${bestBrowser.nameCN}`
        : '按优先级自动选择'
    });

    return {
      question: '请选择要使用的浏览器：',
      header: '浏览器选择',
      options: options.filter(o => !o.disabled || o.label?.startsWith('──')),
      multiSelect: false
    };
  }

  /**
   * 根据用户选择获取浏览器
   * @param {string} selectionId - 用户选择的浏览器ID
   * @returns {Object|null} 浏览器信息
   */
  getBrowserBySelection(selectionId) {
    if (selectionId === 'auto') {
      return this.detectedBrowsers.find(b => b.installed) || null;
    }
    return this.detectedBrowsers.find(b => b.id === selectionId) || null;
  }

  /**
   * 当浏览器不可用时，自动切换到下一个可用浏览器
   * @param {string} failedBrowserId - 失败的浏览器ID
   * @returns {Object} 切换结果
   */
  async switchToNextAvailable(failedBrowserId) {
    await this.detectBrowsers();
    await this.loadConfig();

    // 获取已安装的浏览器列表（按优先级排序）
    const installed = this.detectedBrowsers
      .filter(b => b.installed && b.id !== failedBrowserId)
      .sort((a, b) => {
        const priorityA = this.config.priority.indexOf(a.id);
        const priorityB = this.config.priority.indexOf(b.id);
        return (priorityA === -1 ? 999 : priorityA) - (priorityB === -1 ? 999 : priorityB);
      });

    if (installed.length === 0) {
      return {
        success: false,
        message: '没有其他可用浏览器',
        suggestion: this.getDownloadSuggestion()
      };
    }

    const nextBrowser = installed[0];
    return {
      success: true,
      browser: nextBrowser,
      message: `已自动切换到 ${nextBrowser.nameCN}`,
      previousBrowser: failedBrowserId
    };
  }

  /**
   * 获取下载建议（当本地没有可用浏览器时）
   * @returns {Object} 下载建议
   */
  getDownloadSuggestion() {
    // 按优先级获取推荐的浏览器下载链接
    const recommendations = [];

    for (const browserId of this.config.priority) {
      const config = BROWSER_CONFIG[browserId];
      if (config && config.downloadUrl) {
        recommendations.push({
          id: browserId,
          name: config.nameCN,
          category: config.category,
          downloadUrl: config.downloadUrlCN || config.downloadUrl,
          reason: config.category === 'chinese' ? '国产浏览器，本地化支持好' : '国际主流浏览器'
        });
      }
    }

    // 返回前3个推荐
    const top3 = recommendations.slice(0, 3);

    return {
      message: '建议下载安装以下浏览器：',
      browsers: top3,
      askToDownload: true
    };
  }

  /**
   * 生成下载确认问题
   * @param {Object} browserInfo - 浏览器信息
   * @returns {Object} AskUserQuestion 格式
   */
  generateDownloadQuestion(browserInfo) {
    return {
      question: `是否立即下载并安装「${browserInfo.name}」？`,
      header: '下载浏览器',
      options: [
        {
          id: 'download',
          label: `📥 立即下载 ${browserInfo.name}`,
          description: `将自动打开下载页面`
        },
        {
          id: 'skip',
          label: '跳过',
          description: '选择其他浏览器'
        }
      ],
      multiSelect: false
    };
  }

  /**
   * 获取使用习惯推荐
   * @returns {Object} 基于使用习惯的推荐结果
   */
  async getUsageBasedRecommendation() {
    const tracker = new BrowserUsageTracker();
    await this.detectBrowsers();

    const recommendation = tracker.getRecommendation(this.detectedBrowsers);

    return {
      ...recommendation,
      installedBrowsers: this.detectedBrowsers.filter(b => b.installed),
      usageReport: tracker.getUsageReport()
    };
  }
}

module.exports = {
  BrowserDetector,
  BROWSER_CONFIG
};
