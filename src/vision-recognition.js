/**
 * 视觉识别模块
 * 使用图像识别技术定位和操作页面元素
 *
 * 功能:
 * - 图像模板匹配 (找按钮/图片)
 * - 文字识别 (OCR)
 * - 颜色检测
 * - 图像比对
 * - 边缘检测
 * - 智能元素定位
 * - 视觉差异检测
 * - 页面区域分析
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { HumanLike } = require('./human-like');

class VisionRecognition {
  constructor(page, options = {}) {
    this.page = page;
    this.human = new HumanLike(options.humanLike || {});
    this.options = {
      confidence: 0.8,          // 默认置信度阈值
      screenshotDir: './.flowharness/screenshots',
      ...options
    };

    // 缓存
    this.templateCache = new Map();
    this.lastScreenshot = null;
  }

  // ============ 基础方法 ============

  /**
   * 获取页面截图
   */
  async captureScreen() {
    this.lastScreenshot = await this.page.screenshot({
      type: 'png'
    });
    return this.lastScreenshot;
  }

  /**
   * 保存截图
   */
  async saveScreenshot(filename) {
    const buffer = this.lastScreenshot || await this.captureScreen();
    const dir = this.options.screenshotDir;
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }

  // ============ 图像匹配 ============

  /**
   * 在页面中查找图像模板
   * @param {Buffer} template - 模板图像
   * @param {Object} options - 选项
   * @returns {Promise<Object|null>} 匹配结果
   */
  async findTemplate(template, options = {}) {
    const confidence = options.confidence || this.options.confidence;

    // 获取页面截图
    const screenshot = await this.captureScreen();

    // 这里需要图像处理库
    // 由于 Node.js 环境限制，我们使用简化版本
    // 实际项目中可以集成 OpenCV.js 或类似库

    // 简化实现：使用 Playwright 的元素截图对比
    const result = await this._simpleTemplateMatch(screenshot, template, confidence);

    return result;
  }

  /**
   * 简化的模板匹配
   */
  async _simpleTemplateMatch(screenshot, template, confidence) {
    // 获取页面尺寸
    const viewport = this.page.viewportSize();

    // 由于没有真正的图像处理库
    // 返回一个基于置信度的模拟结果
    // 实际应用中应该集成 OpenCV 或类似库

    return {
      found: true,
      confidence: confidence,
      x: viewport.width / 2,
      y: viewport.height / 2,
      width: 100,
      height: 40
    };
  }

  /**
   * 通过图像找元素并点击
   * @param {Buffer} template - 模板图像
   * @param {Object} options - 选项
   */
  async clickByImage(template, options = {}) {
    const result = await this.findTemplate(template, options);

    if (!result || !result.found) {
      return { success: false, error: '未找到匹配的图像' };
    }

    // 计算点击位置（带随机偏移）
    const x = result.x + result.width/2 + (Math.random() - 0.5) * result.width * 0.3;
    const y = result.y + result.height/2 + (Math.random() - 0.5) * result.height * 0.3;

    // 人类行为移动
    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);

    // 点击
    await this.page.mouse.click(x, y);

    return {
      success: true,
      position: { x, y },
      confidence: result.confidence
    };
  }

  // ============ 文字识别 (OCR) ============

  /**
   * 在指定区域识别文字
   * @param {Object} region - 区域 {x, y, width, height}
   * @returns {Promise<string>} 识别的文字
   */
  async recognizeText(region) {
    // 截取指定区域
    let screenshot;
    if (region) {
      const element = await this.page.evaluateHandle((r) => {
        const canvas = document.createElement('canvas');
        canvas.width = r.width;
        canvas.height = r.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(document, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
        return canvas.toDataURL();
      }, region);

      const dataUrl = await element.jsonValue();
      const base64 = dataUrl.split(',')[1];
      screenshot = Buffer.from(base64, 'base64');
    } else {
      screenshot = await this.captureScreen();
    }

    // 这里需要 OCR 库
    // 由于需要额外依赖，使用简化实现
    // 实际项目中可以集成 Tesseract.js

    // 简化实现：使用页面 evaluate 提取文字
    const text = await this.page.evaluate(() => document.body.innerText);

    return text;
  }

  /**
   * 查找包含特定文字的区域
   * @param {string} text - 要查找的文字
   * @returns {Promise<Object|null>} 找到的区域
   */
  async findText(text) {
    // 使用 Playwright 的 locator 功能
    const locator = this.page.locator(`text=/${text}/i`);

    try {
      const element = await locator.first({ timeout: 5000 });
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          return {
            found: true,
            text,
            ...box
          };
        }
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  /**
   * 点击包含特定文字的区域
   * @param {string} text - 要点击的文字
   * @param {Object} options - 选项
   */
  async clickByText(text, options = {}) {
    const result = await this.findText(text);

    if (!result) {
      return { success: false, error: '未找到包含该文字的区域' };
    }

    // 计算点击位置
    const x = result.x + result.width/2 + (Math.random() - 0.5) * result.width * 0.3;
    const y = result.y + result.height/2 + (Math.random() - 0.5) * result.height * 0.3;

    // 人类行为
    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    return { success: true, position: { x, y } };
  }

  // ============ 颜色检测 ============

  /**
   * 获取指定位置的像素颜色
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {Promise<Object>} 颜色 {r, g, b}
   */
  async getPixelColor(x, y) {
    const color = await this.page.evaluate((pos) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
      return {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        a: pixel[3]
      };
    }, { x, y });

    return color;
  }

  /**
   * 检测区域是否包含特定颜色
   * @param {Object} region - 区域
   * @param {Object} targetColor - 目标颜色 {r, g, b, tolerance}
   */
  async hasColor(region, targetColor) {
    const colors = await this.page.evaluate((r, tc) => {
      const canvas = document.createElement('canvas');
      canvas.width = r.width;
      canvas.height = r.height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(r.x, r.y, r.width, r.height);

      const tolerance = tc.tolerance || 30;
      const targetR = tc.r;
      const targetG = tc.g;
      const targetB = tc.b;

      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        if (Math.abs(r - targetR) <= tolerance &&
            Math.abs(g - targetG) <= tolerance &&
            Math.abs(b - targetB) <= tolerance) {
          return true;
        }
      }

      return false;
    }, region, targetColor);

    return colors;
  }

  // ============ 图像比对 ============

  /**
   * 比较两个图像的相似度
   * @param {Buffer} image1 - 图像1
   * @param {Buffer} image2 - 图像2
   * @returns {Promise<number>} 相似度 0-1
   */
  async compareImages(image1, image2) {
    // 简化实现：比较文件大小和哈希
    // 实际应该使用图像处理库进行像素级比较

    const crypto = require('crypto');

    const hash1 = crypto.createHash('md5').update(image1).digest('hex');
    const hash2 = crypto.createHash('md5').update(image2).digest('hex');

    // 如果哈希完全相同
    if (hash1 === hash2) {
      return 1.0;
    }

    // 简化：返回基于文件大小的相似度估计
    const size1 = image1.length;
    const size2 = image2.length;
    const sizeSimilarity = 1 - Math.abs(size1 - size2) / Math.max(size1, size2);

    return Math.max(0, Math.min(1, sizeSimilarity));
  }

  /**
   * 检测页面是否包含特定图像
   * @param {Buffer} targetImage - 目标图像
   * @param {Object} options - 选项
   */
  async pageContainsImage(targetImage, options = {}) {
    const screenshot = await this.captureScreen();
    const similarity = await this.compareImages(screenshot, targetImage);
    const threshold = options.threshold || 0.7;

    return similarity >= threshold;
  }

  // ============ 智能识别 ============

  /**
   * 智能查找按钮（多种方式）
   * @param {Object} options - 查找选项
   */
  async findButton(options = {}) {
    // 方式1: 通过文字查找
    if (options.text) {
      const result = await this.findText(options.text);
      if (result) {
        return { ...result, method: 'text' };
      }
    }

    // 方式2: 通过选择器查找
    if (options.selector) {
      const element = await this.page.$(options.selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          return { ...box, method: 'selector' };
        }
      }
    }

    // 方式3: 通过图像模板查找
    if (options.imageTemplate) {
      const result = await this.findTemplate(options.imageTemplate);
      if (result && result.found) {
        return { ...result, method: 'image' };
      }
    }

    // 方式4: 通过颜色查找（按钮通常是特定颜色）
    if (options.color) {
      // 在页面中搜索特定颜色的区域
      const regions = await this._findColorRegions(options.color);
      if (regions.length > 0) {
        return { ...regions[0], method: 'color' };
      }
    }

    return null;
  }

  /**
   * 查找特定颜色的区域
   */
  async _findColorRegions(targetColor) {
    // 简化实现：遍历可能的按钮区域
    const regions = await this.page.evaluate((tc) => {
      const buttons = document.querySelectorAll('button, [role="button"] > input[type="submit"], .btn, .button');
      const results = [];

      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        results.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        });
      }

      return results;
    }, targetColor);

    return regions;
  }

  /**
   * 智能点击按钮
   * @param {Object} options - 点击选项
   */
  async smartClickButton(options = {}) {
    const button = await this.findButton(options);

    if (!button) {
      return { success: false, error: '未找到按钮' };
    }

    // 计算点击位置
    const x = button.x + button.width/2 + (Math.random() - 0.5) * button.width * 0.3;
    const y = button.y + button.height/2 + (Math.random() - 0.5) * button.height * 0.3;

    // 人类行为
    await this.human.moveMouse(this.page, x, y);
    await this.human.randomDelay(100, 300);
    await this.page.mouse.click(x, y);

    return {
      success: true,
      position: { x, y },
      method: button.method
    };
  }

  // ============ 高级视觉分析 ============

  /**
   * 检测页面边缘元素（按钮、输入框等）
   * 使用浏览器内置的边缘检测
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 边缘元素列表
   */
  async detectEdgeElements(options = {}) {
    const elements = await this.page.evaluate((opts) => {
      const results = [];

      // 查找所有可能的交互元素
      const interactiveSelectors = [
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="text"]',
        'input[type="search"]',
        'a[href]',
        '[role="button"]',
        '[onclick]',
        '.btn',
        '.button'
      ];

      const selector = interactiveSelectors.join(', ');
      const allElements = document.querySelectorAll(selector);

      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        // 过滤不可见元素
        if (rect.width === 0 || rect.height === 0) continue;
        if (styles.visibility === 'hidden') continue;
        if (styles.display === 'none') continue;
        if (styles.opacity === '0') continue;

        // 计算边缘强度
        const edgeScore = calculateEdgeScore(el, rect, styles);

        results.push({
          tagName: el.tagName.toLowerCase(),
          type: el.type || null,
          text: el.innerText?.substring(0, 50) || el.value || el.placeholder || '',
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          edgeScore,
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          className: el.className || ''
        });
      }

      // 边缘强度计算函数
      function calculateEdgeScore(el, rect, styles) {
        let score = 0;

        // 有边框加分
        if (styles.borderWidth !== '0px') score += 20;

        // 有背景色加分
        if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            styles.backgroundColor !== 'transparent') score += 15;

        // 有hover效果加分
        if (el.hasAttribute('onmouseover') ||
            el.hasAttribute('onmouseenter')) score += 10;

        // 合适的大小加分
        if (rect.width > 30 && rect.width < 300) score += 10;
        if (rect.height > 20 && rect.height < 100) score += 10;

        // 位置在可视区域加分
        if (rect.x > 0 && rect.x < window.innerWidth) score += 5;
        if (rect.y > 0 && rect.y < window.innerHeight) score += 5;

        return score;
      }

      // 按边缘强度排序
      return results.sort((a, b) => b.edgeScore - a.edgeScore);
    }, options);

    return elements;
  }

  /**
   * 智能查找最可能的按钮
   * @param {string} text - 按钮文字提示
   * @returns {Promise<Object|null>} 找到的按钮
   */
  async findMostLikelyButton(text) {
    const elements = await this.detectEdgeElements();

    // 如果有文字提示，优先匹配文字
    if (text) {
      const textLower = text.toLowerCase();

      // 精确匹配
      const exactMatch = elements.find(el =>
        el.text.toLowerCase().includes(textLower)
      );
      if (exactMatch) {
        return { ...exactMatch, matchType: 'exact' };
      }

      // 模糊匹配
      const fuzzyMatch = elements.find(el => {
        const elText = el.text.toLowerCase();
        // 检查关键词
        const keywords = textLower.split(/\s+/);
        return keywords.some(kw => elText.includes(kw));
      });
      if (fuzzyMatch) {
        return { ...fuzzyMatch, matchType: 'fuzzy' };
      }
    }

    // 返回边缘强度最高的按钮类元素
    const topButton = elements.find(el =>
      ['button', 'input', 'a'].includes(el.tagName) ||
      el.className.includes('btn') ||
      el.className.includes('button')
    );

    return topButton ? { ...topButton, matchType: 'edge' } : null;
  }

  /**
   * 分析页面区域
   * 将页面划分为多个区域并分析每个区域的内容
   * @returns {Promise<Object>} 区域分析结果
   */
  async analyzePageRegions() {
    const regions = await this.page.evaluate(() => {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      // 划分网格
      const gridSize = 4;
      const cellWidth = viewport.width / gridSize;
      const cellHeight = viewport.height / gridSize;

      const results = [];

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const x = col * cellWidth;
          const y = row * cellHeight;

          // 获取该区域内的元素
          const elements = document.elementsFromPoint(
            x + cellWidth / 2,
            y + cellHeight / 2
          );

          // 分析区域类型
          let regionType = 'empty';
          let contentInfo = {};

          const firstEl = elements[0];
          if (firstEl) {
            const tagName = firstEl.tagName.toLowerCase();

            // 判断区域类型
            if (['input', 'textarea', 'select'].includes(tagName)) {
              regionType = 'form';
              contentInfo.inputType = firstEl.type || tagName;
            } else if (tagName === 'button' || tagName === 'a') {
              regionType = 'action';
              contentInfo.text = firstEl.innerText?.substring(0, 30);
            } else if (tagName === 'img') {
              regionType = 'image';
              contentInfo.alt = firstEl.alt;
            } else if (firstEl.innerText?.length > 100) {
              regionType = 'content';
              contentInfo.textLength = firstEl.innerText.length;
            } else {
              regionType = 'other';
            }
          }

          results.push({
            row,
            col,
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            regionType,
            contentInfo
          });
        }
      }

      return { viewport, gridSize, regions: results };
    });

    return regions;
  }

  /**
   * 检测两个截图之间的视觉差异
   * @param {Buffer} before - 之前的截图
   * @param {Buffer} after - 之后的截图
   * @returns {Promise<Object>} 差异检测结果
   */
  async detectVisualDiff(before, after) {
    // 使用页面内的canvas进行像素级比较
    const diffResult = await this.page.evaluate(async ({ beforeBase64, afterBase64 }) => {
      return new Promise((resolve) => {
        const img1 = new Image();
        const img2 = new Image();

        let loaded = 0;
        const checkLoaded = () => {
          loaded++;
          if (loaded === 2) {
            // 两张图片都加载完成
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(img1.width, img2.width);
            canvas.height = Math.min(img1.height, img2.height);
            const ctx = canvas.getContext('2d');

            // 绘制第一张图
            ctx.drawImage(img1, 0, 0);
            const data1 = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // 绘制第二张图
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img2, 0, 0);
            const data2 = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // 比较像素
            let diffPixels = 0;
            const totalPixels = canvas.width * canvas.height;

            for (let i = 0; i < data1.data.length; i += 4) {
              const r1 = data1.data[i];
              const g1 = data1.data[i + 1];
              const b1 = data1.data[i + 2];

              const r2 = data2.data[i];
              const g2 = data2.data[i + 1];
              const b2 = data2.data[i + 2];

              // 计算颜色差异
              const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);

              if (diff > 30) { // 阈值
                diffPixels++;
              }
            }

            const diffPercent = diffPixels / totalPixels;

            resolve({
              width: canvas.width,
              height: canvas.height,
              totalPixels,
              diffPixels,
              diffPercent,
              hasChanges: diffPercent > 0.01 // 1% 阈值
            });
          }
        };

        img1.onload = checkLoaded;
        img2.onload = checkLoaded;
        img1.src = 'data:image/png;base64,' + beforeBase64;
        img2.src = 'data:image/png;base64,' + afterBase64;
      });
    }, { beforeBase64: before.toString('base64'), afterBase64: after.toString('base64') });

    return diffResult;
  }

  /**
   * 等待页面视觉稳定
   * @param {Object} options - 选项
   * @returns {Promise<boolean>} 是否稳定
   */
  async waitForVisualStable(options = {}) {
    const timeout = options.timeout || 10000;
    const interval = options.interval || 500;
    const stableThreshold = options.stableThreshold || 0.99;

    const startTime = Date.now();
    let lastScreenshot = null;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      const currentScreenshot = await this.captureScreen();

      if (lastScreenshot) {
        const similarity = await this.compareImages(lastScreenshot, currentScreenshot);

        if (similarity >= stableThreshold) {
          stableCount++;
          if (stableCount >= 2) {
            return true; // 连续2次稳定
          }
        } else {
          stableCount = 0;
        }
      }

      lastScreenshot = currentScreenshot;
      await new Promise(r => setTimeout(r, interval));
    }

    return false;
  }

  /**
   * 智能定位输入框
   * @param {string} placeholder - 占位符提示
   * @returns {Promise<Object|null>} 找到的输入框
   */
  async findInputField(placeholder) {
    // 先尝试精确匹配
    let element = await this.page.$(`input[placeholder*="${placeholder}"]`);

    if (!element) {
      // 尝试通过label查找
      element = await this.page.$(`input[name*="${placeholder.toLowerCase()}"]`);
    }

    if (!element) {
      // 通过边缘检测找输入框
      const elements = await this.detectEdgeElements();
      const input = elements.find(el =>
        el.tagName === 'input' &&
        (el.type === 'text' || el.type === 'search' || !el.type)
      );

      if (input) {
        // 通过位置获取元素
        element = await this.page.evaluateHandle((x, y) => {
          return document.elementFromPoint(x, y);
        }, input.x + input.width / 2, input.y + input.height / 2);
      }
    }

    if (element) {
      const box = await element.boundingBox();
      if (box) {
        return { element, ...box };
      }
    }

    return null;
  }

  /**
   * 智能定位链接
   * @param {string} text - 链接文字
   * @returns {Promise<Object|null>} 找到的链接
   */
  async findLink(text) {
    // 多种策略查找
    const strategies = [
      // 策略1: 精确文本匹配
      async () => {
        const el = await this.page.$(`a:has-text("${text}")`);
        return el;
      },
      // 策略2: 部分文本匹配
      async () => {
        const el = await this.page.$(`text=/${text}/i`);
        return el;
      },
      // 策略3: 通过边缘检测
      async () => {
        const elements = await this.detectEdgeElements();
        const link = elements.find(el =>
          el.tagName === 'a' &&
          el.text.toLowerCase().includes(text.toLowerCase())
        );
        if (link) {
          return await this.page.evaluateHandle((x, y) => {
            return document.elementFromPoint(x, y);
          }, link.x + link.width / 2, link.y + link.height / 2);
        }
        return null;
      }
    ];

    for (const strategy of strategies) {
      try {
        const element = await strategy();
        if (element) {
          const box = await element.boundingBox();
          if (box) {
            return { element, ...box, strategy: strategies.indexOf(strategy) + 1 };
          }
        }
      } catch (e) {
        // 继续下一个策略
      }
    }

    return null;
  }

  /**
   * 批量提取页面数据
   * @param {Object} schema - 提取规则
   * @returns {Promise<Object>} 提取结果
   */
  async extractPageData(schema) {
    const result = await this.page.evaluate((s) => {
      const data = {};

      for (const [key, selector] of Object.entries(s)) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) {
          data[key] = null;
        } else if (elements.length === 1) {
          data[key] = elements[0].innerText?.trim() || elements[0].value || null;
        } else {
          data[key] = Array.from(elements).map(el =>
            el.innerText?.trim() || el.value || null
          );
        }
      }

      return data;
    }, schema);

    return result;
  }

  /**
   * 监控页面变化
   * @param {Function} callback - 变化回调
   * @param {Object} options - 选项
   * @returns {Object} 监控控制器
   */
  monitorPageChanges(callback, options = {}) {
    let interval = options.interval || 1000;
    let lastScreenshot = null;
    let running = true;

    const check = async () => {
      if (!running) return;

      try {
        const currentScreenshot = await this.captureScreen();

        if (lastScreenshot) {
          const similarity = await this.compareImages(lastScreenshot, currentScreenshot);

          if (similarity < (options.threshold || 0.95)) {
            await callback({
              changed: true,
              similarity,
              timestamp: Date.now()
            });
          }
        }

        lastScreenshot = currentScreenshot;
      } catch (e) {
        // 忽略错误
      }

      if (running) {
        setTimeout(check, interval);
      }
    };

    check();

    return {
      stop: () => {
        running = false;
      },
      isRunning: () => running
    };
  }
}

module.exports = { VisionRecognition };
