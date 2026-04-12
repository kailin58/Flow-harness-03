/**
 * 本地电脑人类行为模拟器
 * 模拟真实用户操作本地电脑的行为
 *
 * 功能：
 * - 鼠标移动轨迹模拟
 * - 软件使用能力
 * - 快捷键操作
 * - 脚本执行模拟
 * - 软件学习能力
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const robot = require('robotjs');
const { JSDOM } = require('jsdom');

const execAsync = promisify(exec);

/**
 * 本地电脑人类行为模拟类
 */
class LocalHumanLike {
  constructor(options = {}) {
    this.config = {
      // 鼠标速度
      mouseSpeed: {
        min: 100,
        max: 500,
        ...options.mouseSpeed
      },
      // 打字速度
      typingSpeed: {
        min: 30,
        max: 120,
        ...options.typingSpeed
      },
      // 软件学习能力
      learning: {
        enabled: true,
        memoryFile: '.flowharness/knowledge/software-skills.json',
        ...options.learning
      },
      ...options
    };

    // 软件技能库
    this.softwareSkills = new Map();

    // 用户画像
    this.persona = {
    experience: 'intermediate', // beginner, intermediate, expert
    preferredApps: [],
    shortcuts: [],
    ...options.persona
    };
  }

  // ============ 鼠标操作 ============

  /**
   * 模拟人类移动鼠标到目标位置
   * @param {number} targetX - 目标X坐标
   * @param {number} targetY - 目标Y坐标
   * @param {Object} options - 选项
   */
  async moveMouse(targetX, targetY, options = {}) {
    const currentPos = robot.getMousePos();
    const startX = options.startX || currentPos.x;
    const startY = options.startY || currentPos.y;

    // 计算距离
    const distance = Math.sqrt(
      Math.pow(targetX - startX, 2) +
      Math.pow(targetY - startY, 2)
    );

    // 根据距离计算移动时间（人类移动速度）
    const moveTime = Math.min(
      this.config.mouseSpeed.max,
      Math.max(this.config.mouseSpeed.min, distance / 2)
    );

    // 生成贝塞尔曲线轨迹点
    const steps = Math.max(10, Math.floor(distance / 20));
    const points = this.generateHumanPath(startX, startY, targetX, targetY, steps);

    // 沿轨迹移动
    const stepDelay = moveTime / steps;
    for (const point of points) {
      robot.moveMouse(point.x, point.y);
      await this.randomDelay(stepDelay * 0.8, stepDelay * 1.2);
    }
  }

  /**
   * 生成人类鼠标移动轨迹（贝塞尔曲线 + 微抖动）
   */
  generateHumanPath(x1, y1, x2, y2, steps) {
    const points = [];

    // 随机控制点偏移（模拟人类手抖）
    const jitter = () => (Math.random() - 0.5) * 20;

    // 贝塞尔曲线控制点
    const cx1 = x1 + (x2 - x1) * 0.25 + jitter();
    const cy1 = y1 + (y2 - y1) * 0.25 + jitter() + 30;
    const cx2 = x1 + (x2 - x1) * 0.75 + jitter();
    const cy2 = y1 + (y2 - y1) * 0.75 + jitter() + 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 三次贝塞尔曲线
      const x = Math.pow(1 - t, 3) * x1 +
            3 * Math.pow(1 - t, 2) * t * cx1 +
            3 * (1 - t) * Math.pow(t, 2) * cx2 +
            Math.pow(t, 3) * x2;

      const y = Math.pow(1 - t, 3) * y1 +
            3 * Math.pow(1 - t, 2) * t * cy1 +
            3 * (1 - t) * Math.pow(t, 2) * cy2 +
            Math.pow(t, 3) * y2;

      // 微小随机抖动（模拟手部微颤）
      points.push({
        x: Math.round(x + jitter() * 0.5),
        y: Math.round(y + jitter() * 0.5)
      });
    }

    return points;
  }

  /**
   * 模拟人类点击
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {string} button - 按钮类型 ('left', 'right', 'middle')
   */
  async click(x, y, button = 'left') {
    // 先移动到目标位置
    await this.moveMouse(x, y);

    // 点击前的微小停顿（人类反应时间）
    await this.randomDelay(50, 150);

    // 按下
    robot.mouseToggle('down', button);
    await this.randomDelay(30, 100);

    // 松开
    robot.mouseToggle('up', button);

    // 点击后的停顿
    await this.randomDelay(100, 300);
  }

  /**
   * 模拟双击
   */
  async doubleClick(x, y) {
    await this.click(x, y);
    await this.randomDelay(100, 200);
    await this.click(x, y);
  }

  /**
   * 模拟右键点击
   */
  async rightClick(x, y) {
    await this.click(x, y, 'right');
  }

  /**
   * 模拟鼠标滚轮
   * @param {number} amount - 滚动量（正数向下，负数向上）
   */
  async scroll(amount) {
    // 分多次滚动（人类不会一次滚很多）
    const steps = Math.ceil(Math.abs(amount) / 100);
    const perStep = amount / steps;

    for (let i = 0; i < steps; i++) {
      robot.scrollMouse(0, perStep);
      await this.randomDelay(50, 150);
    }
  }

  // ============ 键盘操作 ============

  /**
   * 模拟人类打字
   * @param {string} text - 要输入的文字
   */
  async type(text) {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 随机打字速度
      const delay = this.randomRange(
        this.config.typingSpeed.min,
        this.config.typingSpeed.max
      );

      // 有时会打错
      if (Math.random() < 0.02) {
        // 打一个错误的字符
        const wrongChar = this.getNearbyChar(char);
        robot.typeString(wrongChar);
        await this.randomDelay(100, 300);

        // 删除重打
        robot.keyTap('backspace');
        await this.randomDelay(50, 150);
      }

      robot.typeString(char);
      await this.randomDelay(delay * 0.8, delay * 1.2);

      // 有时会停顿思考
      if (Math.random() < 0.05) {
        await this.randomDelay(300, 800);
      }
    }
  }

  /**
   * 获取附近字符（模拟打错字）
   */
  getNearbyChar(char) {
    const keyboard = [
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
      '1234567890'
    ];

    for (const row of keyboard) {
      const index = row.indexOf(char.toLowerCase());
      if (index > 0) {
        return row[index - 1];
      }
      if (index < row.length - 1) {
        return row[index + 1];
      }
    }
    return char;
  }

  /**
   * 模拟快捷键
   * @param {string} key - 主键
   * @param {Array} modifiers - 修饰键 ['ctrl', 'alt', 'shift']
   */
  async hotkey(key, modifiers = []) {
    // 按下修饰键
    for (const mod of modifiers) {
      robot.keyToggle(mod, 'down');
      await this.randomDelay(30, 80);
    }

    // 按下主键
    robot.keyTap(key);

    // 松开修饰键
    for (const mod of modifiers.reverse()) {
      await this.randomDelay(30, 80);
      robot.keyToggle(mod, 'up');
    }
  }

  // ============ 软件操作 ============

  /**
   * 打开应用程序
   * @param {string} appName - 应用名称或路径
   */
  async openApp(appName) {
    // 检查是否有已学习的打开方式
    const skill = this.softwareSkills.get(appName.toLowerCase());

    if (skill?.openMethod) {
      await this.executeLearnedMethod(skill.openMethod);
    } else {
      // 使用系统默认方式打开
      if (process.platform === 'win32') {
        await execAsync(`start "" "${appName}"`);
      } else {
        await execAsync(`open "${appName}"`);
      }
    }

    // 等待应用启动
    await this.waitForApp(appName);
  }

  /**
   * 等待应用程序启动
   * @param {string} appName - 应用名称
   */
  async waitForApp(appName) {
    // 模拟人类等待应用启动
    await this.randomDelay(1000, 3000);

    // 检查应用是否已启动（通过进程名）
    const maxWait = 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const { stdout } = await execAsync(
          process.platform === 'win32'
            ? `tasklist /fi "${appName}"`
            : `ps aux | grep "${appName}"`
        );
        if (stdout.toLowerCase().includes(appName.toLowerCase())) {
          return true;
        }
      } catch (e) {
        // 忽略错误
      }
      await this.randomDelay(500, 1000);
    }

    return false;
  }

  /**
   * 在应用程序中执行操作
   * @param {string} appName - 应用名称
   * @param {string} action - 操作名称
   * @param {Object} params - 操作参数
   */
  async appAction(appName, action, params = {}) {
    // 检查是否有该操作的技能
    const skillKey = `${appName.toLowerCase()}:${action}`;
    const skill = this.softwareSkills.get(skillKey);

    if (skill) {
      await this.executeLearnedMethod(skill, params);
    } else {
      // 尝试学习这个操作
      await this.learnAppAction(appName, action, params);
    }
  }

  // ============ 软件学习能力 ============

  /**
   * 学习应用程序操作
   * @param {string} appName - 应用名称
   * @param {string} action - 操作名称
   * @param {Object} params - 参数
   */
  async learnAppAction(appName, action, params) {
    console.log(`学习 ${appName} 的 ${action} 操作...`);

    // 尝试常见方法
    const methods = await this.findAppMethods(appName, action);

    for (const method of methods) {
      try {
        await this.executeLearnedMethod(method, params);
        // 成功！保存学习方法
        const skillKey = `${appName.toLowerCase()}:${action}`;
        this.softwareSkills.set(skillKey, method);
        await this.saveSkills();

        console.log(`✓ 已学习 ${appName} 的 ${action} 操作`);
        return true;
      } catch (e) {
        console.log(`  方法失败: ${method.type}`);
      }
    }

    console.log(`✗ 无法学习 ${appName} 的 ${action} 操作`);
    return false;
  }

  /**
   * 查找应用程序的可能操作方法
   */
  async findAppMethods(appName, action) {
    const methods = [];

    // 查找快捷键
    const shortcuts = await this.findShortcuts(appName, action);
    for (const shortcut of shortcuts) {
      methods.push({
        type: 'hotkey',
        keys: shortcut.keys,
        confidence: shortcut.confidence
      });
    }

    // 查找菜单操作
    const menus = await this.findMenuItems(appName, action);
    for (const menu of menus) {
      methods.push({
        type: 'menu',
        path: menu.path,
        confidence: menu.confidence
      });
    }

    // 查找按钮点击
    const buttons = await this.findButtons(appName, action);
    for (const button of buttons) {
      methods.push({
        type: 'click',
        position: button.position,
        confidence: button.confidence
      });
    }

    // 按置信度排序
    return methods.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 查找快捷键
   */
  async findShortcuts(appName, action) {
    // 从知识库中查找已知的快捷键
    const knownShortcuts = {
      'vscode': {
        'save': [{ keys: ['ctrl', 's'], confidence: 0.95 }],
        'open': [{ keys: ['ctrl', 'o'], confidence: 0.9 }],
        'find': [{ keys: ['ctrl', 'f'], confidence: 0.95 }],
        'close': [{ keys: ['ctrl', 'w'], confidence: 0.9 }]
      },
      'chrome': {
        'new-tab': [{ keys: ['ctrl', 't'], confidence: 0.95 }],
        'close-tab': [{ keys: ['ctrl', 'w'], confidence: 0.95 }],
        'refresh': [{ keys: ['f5'], confidence: 0.95 }]
      },
      'notepad': {
        'save': [{ keys: ['ctrl', 's'], confidence: 0.9 }],
        'open': [{ keys: ['ctrl', 'o'], confidence: 0.9 }]
      }
    };

    return knownShortcuts[appName.toLowerCase()]?.[action] || [];
  }

  /**
   * 查找菜单项
   */
  async findMenuItems(appName, action) {
    // Alt 键打开菜单，然后按键选择
    const actionMap = {
      'save': { path: ['alt', 'f', 's'], confidence: 0.7 },
      'open': { path: ['alt', 'f', 'o'], confidence: 0.7 },
      'exit': { path: ['alt', 'f', 'x'], confidence: 0.7 }
    };

    const menu = actionMap[action];
    if (menu) {
      return [{ path: menu.path, confidence: menu.confidence }];
    }
    return [];
  }

  /**
   * 查找按钮位置
   */
  async findButtons(appName, action) {
    // 这需要屏幕识别能力，暂时返回空
    // 后续可以集成OCR或屏幕识别
    return [];
  }

  /**
   * 执行学习方法
   */
  async executeLearnedMethod(method, params = {}) {
    switch (method.type) {
      case 'hotkey':
        await this.hotkey(method.keys[0], method.keys.slice(1));
        break;

      case 'menu':
        for (const key of method.path) {
          await this.randomDelay(100, 200);
          robot.keyTap(key);
        }
        break;

      case 'click':
        await this.click(method.position.x, method.position.y);
        break;

      case 'script':
        await execAsync(method.command);
        break;

      default:
        throw new Error(`未知方法类型: ${method.type}`);
    }
  }

  // ============ 技能持久化 ============

  /**
   * 保存学习到的技能
   */
  async saveSkills() {
    const skillsPath = this.config.learning.memoryFile;
    await fs.mkdir(path.dirname(skillsPath), { recursive: true });

    const data = {};
    for (const [key, value] of this.softwareSkills) {
      data[key] = value;
    }

    await fs.writeFile(skillsPath, JSON.stringify(data, null, 2));
  }

  /**
   * 加载已学习的技能
   */
  async loadSkills() {
    try {
      const content = await fs.readFile(this.config.learning.memoryFile, 'utf-8');
      const data = JSON.parse(content);

      for (const [key, value] of Object.entries(data)) {
        this.softwareSkills.set(key, value);
      }

      console.log(`已加载 ${this.softwareSkills.size} 个软件技能`);
    } catch (e) {
      // 无已保存的技能
    }
  }

  // ============ 辅助方法 ============

  /**
   * 随机延迟
   */
  async randomDelay(min, max) {
    const delay = this.randomRange(min, max);
    await new Promise(r => setTimeout(r, delay));
  }

  /**
   * 随机范围
   */
  randomRange(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }

  /**
   * 获取屏幕尺寸
   */
  getScreenSize() {
    return robot.getScreenSize();
  }

  /**
   * 截屏
   */
  async screenshot() {
    const img = robot.screen.capture();
    return img;
  }
}

module.exports = { LocalHumanLike };
