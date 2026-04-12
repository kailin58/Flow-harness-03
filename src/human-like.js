/**
 * 人类行为模拟器
 * 模拟真实用户的操作行为，避免被网站检测为机器人
 *
 * 特点：
 * - 随机延迟
 * - 鼠标轨迹模拟
 * - 打字速度模拟
 * - 滚动行为模拟
 * - 阅读行为模拟
 */

class HumanLike {
  constructor(options = {}) {
    // 配置参数
    this.config = {
      // 打字速度（毫秒/字符）
      typingSpeed: {
        min: 50,
        max: 150,
        ...options.typingSpeed
      },
      // 鼠标移动速度
      mouseSpeed: {
        min: 100,
        max: 500,
        ...options.mouseSpeed
      },
      // 页面阅读时间
      readingSpeed: {
        min: 2000,
        max: 8000,
        ...options.readingSpeed
      },
      // 滚动行为
      scroll: {
        minDistance: 100,
        maxDistance: 500,
        minPause: 500,
        maxPause: 2000,
        ...options.scroll
      },
      // 点击后等待
      clickWait: {
        min: 300,
        max: 1000,
        ...options.clickWait
      }
    };

    // 用户画像（模拟不同用户行为）
    this.persona = {
      patience: Math.random(),      // 耐心程度 0-1
      speed: Math.random(),         // 操作速度 0-1
      thoroughness: Math.random(),  // 仔细程度 0-1
      ...options.persona
    };
  }

  /**
   * 随机延迟
   * @param {number} min - 最小毫秒
   * @param {number} max - 最大毫秒
   */
  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min) + min);
    await new Promise(r => setTimeout(r, delay));
    return delay;
  }

  /**
   * 自然延迟（基于用户画像）
   */
  async naturalDelay(baseMs = 1000) {
    // 根据用户耐心程度调整延迟
    const multiplier = 0.5 + this.persona.patience;
    const delay = baseMs * multiplier * (0.8 + Math.random() * 0.4);
    await new Promise(r => setTimeout(r, delay));
  }

  /**
   * 模拟打字
   * @param {Page} page - Playwright页面对象
   * @param {string} selector - 输入框选择器
   * @param {string} text - 要输入的文字
   */
  async type(page, selector, text) {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`元素未找到: ${selector}`);
    }

    // 先点击输入框
    await this.click(page, selector);

    // 清空现有内容
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');

    await this.randomDelay(100, 300);

    // 逐字输入
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 随机打字速度
      const speed = this.config.typingSpeed;
      const delay = Math.random() * (speed.max - speed.min) + speed.min;

      // 有时会打错字然后删除重打
      if (Math.random() < 0.02) { // 2% 概率打错
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
        await page.keyboard.type(wrongChar);
        await this.randomDelay(200, 500);
        await page.keyboard.press('Backspace');
        await this.randomDelay(100, 300);
      }

      await page.keyboard.type(char);
      await new Promise(r => setTimeout(r, delay));

      // 有时会停顿思考
      if (Math.random() < 0.05) { // 5% 概率停顿
        await this.randomDelay(500, 1500);
      }
    }
  }

  /**
   * 模拟点击
   * @param {Page} page - Playwright页面对象
   * @param {string} selector - 点击元素选择器
   */
  async click(page, selector) {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`元素未找到: ${selector}`);
    }

    // 获取元素位置
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`元素不可见: ${selector}`);
    }

    // 计算点击位置（随机偏移）
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);

    // 移动鼠标到目标位置
    await this.moveMouse(page, x, y);

    // 点击前的短暂停顿
    await this.randomDelay(50, 200);

    // 点击
    await page.mouse.click(x, y);

    // 点击后的等待
    const wait = this.config.clickWait;
    await this.randomDelay(wait.min, wait.max);
  }

  /**
   * 模拟鼠标移动（带轨迹）
   * @param {Page} page - Playwright页面对象
   * @param {number} targetX - 目标X坐标
   * @param {number} targetY - 目标Y坐标
   * @param {Object} options - 选项
   */
  async moveMouse(page, targetX, targetY, options = {}) {
    // 获取当前鼠标位置（默认从页面中心开始）
    const currentX = options.startX || 400;
    const currentY = options.startY || 300;

    // 计算距离
    const distance = Math.sqrt(
      Math.pow(targetX - currentX, 2) +
      Math.pow(targetY - currentY, 2)
    );

    // 根据距离计算移动步数
    const steps = Math.max(5, Math.floor(distance / 50));

    // 生成贝塞尔曲线控制点（模拟人类曲线轨迹）
    const points = this.generateBezierPoints(
      currentX, currentY,
      targetX, targetY,
      steps
    );

    // 沿轨迹移动
    for (const point of points) {
      await page.mouse.move(point.x, point.y);
      // 随机微小延迟
      await new Promise(r => setTimeout(r, Math.random() * 10 + 5));
    }
  }

  /**
   * 生成贝塞尔曲线点（模拟人类鼠标轨迹）
   */
  generateBezierPoints(x1, y1, x2, y2, steps) {
    const points = [];

    // 随机控制点偏移
    const cx1 = x1 + (x2 - x1) * 0.25 + (Math.random() - 0.5) * 100;
    const cy1 = y1 + (y2 - y1) * 0.25 + (Math.random() - 0.5) * 100;
    const cx2 = x1 + (x2 - x1) * 0.75 + (Math.random() - 0.5) * 100;
    const cy2 = y1 + (y2 - y1) * 0.75 + (Math.random() - 0.5) * 100;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 三次贝塞尔曲线
      const x =
        Math.pow(1 - t, 3) * x1 +
        3 * Math.pow(1 - t, 2) * t * cx1 +
        3 * (1 - t) * Math.pow(t, 2) * cx2 +
        Math.pow(t, 3) * x2;

      const y =
        Math.pow(1 - t, 3) * y1 +
        3 * Math.pow(1 - t, 2) * t * cy1 +
        3 * (1 - t) * Math.pow(t, 2) * cy2 +
        Math.pow(t, 3) * y2;

      // 添加微小随机抖动
      points.push({
        x: x + (Math.random() - 0.5) * 2,
        y: y + (Math.random() - 0.5) * 2
      });
    }

    return points;
  }

  /**
   * 模拟滚动
   * @param {Page} page - Playwright页面对象
   * @param {number} distance - 滚动距离（像素）
   */
  async scroll(page, distance) {
    const config = this.config.scroll;
    const direction = distance > 0 ? 1 : -1;
    const absDistance = Math.abs(distance);

    // 分多次滚动
    let remaining = absDistance;
    while (remaining > 0) {
      const scrollAmount = Math.min(
        remaining,
        config.minDistance + Math.random() * (config.maxDistance - config.minDistance)
      );

      await page.mouse.wheel(0, scrollAmount * direction);
      remaining -= scrollAmount;

      // 滚动后停顿
      await this.randomDelay(config.minPause, config.maxPause);
    }
  }

  /**
   * 模拟阅读行为
   * @param {Page} page - Playwright页面对象
   */
  async readPage(page) {
    const config = this.config.readingSpeed;

    // 随机阅读时间
    const readTime = config.min + Math.random() * (config.max - config.min);

    // 模拟阅读时的微小滚动
    const scrollTimes = Math.floor(readTime / 2000);
    for (let i = 0; i < scrollTimes; i++) {
      if (Math.random() < 0.3) { // 30% 概率滚动
        await this.scroll(page, 50 + Math.random() * 200);
      }
      await this.randomDelay(1500, 2500);
    }

    await new Promise(r => setTimeout(r, readTime % 2000));
  }

  /**
   * 模拟浏览行为（随机移动、滚动）
   * @param {Page} page - Playwright页面对象
   * @param {number} duration - 持续时间（毫秒）
   */
  async browse(page, duration = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      const action = Math.random();

      if (action < 0.4) {
        // 随机移动鼠标
        await this.moveMouse(
          page,
          Math.random() * 800 + 100,
          Math.random() * 600 + 100
        );
      } else if (action < 0.7) {
        // 随机滚动
        await this.scroll(page, (Math.random() - 0.3) * 300);
      } else {
        // 停顿（模拟阅读）
        await this.randomDelay(500, 1500);
      }

      await this.randomDelay(200, 800);
    }
  }

  /**
   * 智能等待（模拟人类判断页面加载完成）
   * @param {Page} page - Playwright页面对象
   * @param {number} maxWait - 最大等待时间
   */
  async waitForPageLoad(page, maxWait = 30000) {
    const startTime = Date.now();

    // 等待网络空闲
    await page.waitForLoadState('domcontentloaded');

    // 额外随机等待（人类反应时间）
    await this.randomDelay(500, 1500);

    // 检查页面是否有内容
    while (Date.now() - startTime < maxWait) {
      const content = await page.evaluate(() => {
        return {
          hasContent: document.body.innerText.length > 100,
          hasImages: document.images.length > 0
        };
      });

      if (content.hasContent) {
        // 页面有内容了，随机等待一会儿（模拟人类扫视页面）
        await this.randomDelay(300, 800);
        break;
      }

      await this.randomDelay(200, 500);
    }
  }
}

module.exports = { HumanLike };
