/**
 * 浏览器使用习惯追踪器
 * 记录用户使用浏览器的历史数据，用于智能推荐
 */

const fs = require('fs').promises;
const path = require('path');

class BrowserUsageTracker {
  constructor(dataPath = null) {
    this.dataPath = dataPath || path.join(process.cwd(), '.flowharness', 'browser-usage.json');
    this.usageData = null;
  }

  /**
   * 加载使用记录
   */
  async load() {
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8');
      this.usageData = JSON.parse(content);
    } catch (e) {
      // 初始化默认数据
      this.usageData = {
        browsers: {},        // 各浏览器使用统计
        totalSessions: 0,    // 总会话数
        lastUsed: null,      // 最后使用的浏览器
        favorites: [],       // 用户收藏的浏览器
        history: [],         // 最近使用历史
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    return this.usageData;
  }

  /**
   * 保存使用记录
   */
  async save() {
    this.usageData.updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    await fs.writeFile(this.dataPath, JSON.stringify(this.usageData, null, 2));
  }

  /**
   * 记录浏览器使用
   * @param {Object} browserInfo - 浏览器信息
   * @param {Object} sessionData - 会话数据
   */
  async recordUsage(browserInfo, sessionData = {}) {
    await this.load();

    const browserId = browserInfo.id;

    // 初始化浏览器记录
    if (!this.usageData.browsers[browserId]) {
      this.usageData.browsers[browserId] = {
        id: browserId,
        name: browserInfo.name,
        nameCN: browserInfo.nameCN,
        category: browserInfo.category,
        sessions: 0,
        totalDuration: 0,
        pagesVisited: 0,
        logins: 0,
        lastUsed: null,
        firstUsed: new Date().toISOString(),
        sites: {},        // 访问过的网站统计
        preferences: {}   // 用户偏好设置
      };
    }

    const browser = this.usageData.browsers[browserId];

    // 更新统计
    browser.sessions++;
    browser.lastUsed = new Date().toISOString();
    browser.totalDuration += sessionData.duration || 0;
    browser.pagesVisited += sessionData.pagesVisited || 0;
    if (sessionData.hadLogin) browser.logins++;

    // 记录访问的网站
    if (sessionData.sites) {
      for (const site of sessionData.sites) {
        if (!browser.sites[site]) {
          browser.sites[site] = { visits: 0, lastVisit: null };
        }
        browser.sites[site].visits++;
        browser.sites[site].lastVisit = new Date().toISOString();
      }
    }

    // 更新全局统计
    this.usageData.totalSessions++;
    this.usageData.lastUsed = browserId;

    // 更新历史记录（保留最近20条）
    this.usageData.history.unshift({
      browserId,
      browserName: browserInfo.nameCN,
      timestamp: new Date().toISOString(),
      sites: sessionData.sites || []
    });
    if (this.usageData.history.length > 20) {
      this.usageData.history.pop();
    }

    await this.save();

    return this.getBrowserStats(browserId);
  }

  /**
   * 获取浏览器使用统计
   */
  getBrowserStats(browserId) {
    if (!this.usageData || !this.usageData.browsers[browserId]) {
      return null;
    }
    return this.usageData.browsers[browserId];
  }

  /**
   * 获取所有浏览器使用统计
   */
  getAllStats() {
    return this.usageData?.browsers || {};
  }

  /**
   * 获取推荐浏览器（基于使用习惯）
   * @param {Array} installedBrowsers - 已安装的浏览器列表
   * @returns {Object} 推荐结果
   */
  getRecommendation(installedBrowsers) {
    if (!this.usageData) {
      return { browserId: null, reason: '无历史数据', scores: {} };
    }

    const scores = {};
    const now = Date.now();

    for (const browser of installedBrowsers) {
      const stats = this.usageData.browsers[browser.id];
      let score = 0;
      let reasons = [];

      if (stats) {
        // 使用频率得分（最高40分）
        const frequencyScore = Math.min(stats.sessions * 4, 40);
        score += frequencyScore;
        if (stats.sessions > 0) {
          reasons.push(`使用${stats.sessions}次`);
        }

        // 最近使用得分（最高30分）
        if (stats.lastUsed) {
          const daysSinceLastUse = (now - new Date(stats.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
          const recencyScore = Math.max(0, 30 - daysSinceLastUse * 2);
          score += recencyScore;
          if (daysSinceLastUse < 1) {
            reasons.push('今天使用过');
          } else if (daysSinceLastUse < 7) {
            reasons.push(`${Math.floor(daysSinceLastUse)}天前使用过`);
          }
        }

        // 登录次数得分（最高20分）
        if (stats.logins > 0) {
          const loginScore = Math.min(stats.logins * 5, 20);
          score += loginScore;
          reasons.push(`登录过${stats.logins}个网站`);
        }

        // 收藏加分
        if (this.usageData.favorites.includes(browser.id)) {
          score += 10;
          reasons.push('已收藏');
        }
      } else {
        // 新浏览器，给予基础分
        score = 5;
        reasons.push('新浏览器');
      }

      scores[browser.id] = { score, reasons, stats };
    }

    // 找出得分最高的浏览器
    let bestBrowser = null;
    let bestScore = -1;

    for (const [id, data] of Object.entries(scores)) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestBrowser = id;
      }
    }

    return {
      browserId: bestBrowser,
      score: bestScore,
      reason: bestBrowser ? scores[bestBrowser].reasons.join('、') : '无推荐',
      scores
    };
  }

  /**
   * 切换浏览器时保存当前浏览器数据
   * @param {Object} currentBrowser - 当前浏览器信息
   * @param {Object} sessionData - 会话数据
   * @returns {Object} 保存提示
   */
  async prepareSwitch(currentBrowser, sessionData = {}) {
    await this.load();

    const stats = this.usageData.browsers[currentBrowser.id];
    const hadActivity = sessionData.pagesVisited > 0 || sessionData.sites?.length > 0;

    if (hadActivity && stats) {
      return {
        shouldPrompt: true,
        message: `是否保存「${currentBrowser.nameCN}」的使用数据？`,
        details: {
          sessions: stats.sessions,
          pagesVisited: sessionData.pagesVisited || 0,
          sitesVisited: sessionData.sites?.length || 0
        }
      };
    }

    return { shouldPrompt: false };
  }

  /**
   * 添加收藏浏览器
   */
  async addFavorite(browserId) {
    await this.load();
    if (!this.usageData.favorites.includes(browserId)) {
      this.usageData.favorites.push(browserId);
      await this.save();
    }
  }

  /**
   * 移除收藏浏览器
   */
  async removeFavorite(browserId) {
    await this.load();
    const index = this.usageData.favorites.indexOf(browserId);
    if (index > -1) {
      this.usageData.favorites.splice(index, 1);
      await this.save();
    }
  }

  /**
   * 获取使用报告
   */
  getUsageReport() {
    if (!this.usageData) {
      return '暂无使用记录';
    }

    const lines = ['=== 浏览器使用习惯报告 ===\n'];

    // 总体统计
    lines.push(`📊 总会话数: ${this.usageData.totalSessions}`);
    lines.push(`⭐ 收藏浏览器: ${this.usageData.favorites.length}个`);
    lines.push('');

    // 浏览器排名
    const sorted = Object.values(this.usageData.browsers)
      .sort((a, b) => b.sessions - a.sessions);

    if (sorted.length > 0) {
      lines.push('📈 使用频率排名:');
      sorted.forEach((browser, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const favorite = this.usageData.favorites.includes(browser.id) ? '⭐' : '';
        lines.push(`  ${medal} ${browser.nameCN} ${favorite}`);
        lines.push(`      使用${browser.sessions}次 | 访问${browser.pagesVisited}页 | 登录${browser.logins}次`);
      });
    }

    // 最近使用
    if (this.usageData.history.length > 0) {
      lines.push('\n🕐 最近使用:');
      this.usageData.history.slice(0, 5).forEach(h => {
        const time = new Date(h.timestamp).toLocaleString('zh-CN');
        lines.push(`  • ${h.browserName} - ${time}`);
      });
    }

    return lines.join('\n');
  }
}

module.exports = { BrowserUsageTracker };
