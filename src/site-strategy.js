/**
 * 网站策略管理器
 * 不同网站使用不同的识别策略，记忆按钮位置，验证准确度
 *
 * 功能：
 * 1. 网站白名单管理
 * 2. 元素位置记忆
 * 3. 对比识别验证
 * 4. 策略自动选择
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 预定义网站策略
 * 分类：电商类、搜索引擎类、社交类、社交电商类、内容平台类、工具类
 */
const SITE_STRATEGIES = {
  // ============ 搜索引擎类 ============
  'baidu.com': {
    name: '百度',
    category: 'search',
    type: 'search',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#kw', '#su ~ input', 'input.s_ipt'],
        visualHints: { position: 'top-center', placeholder: /搜索|请输入/ }
      },
      searchButton: {
        selectors: ['#su', 'input[type="submit"]', '.bg.s_btn'],
        visualHints: { text: '百度一下', color: '#3385ff' }
      },
      results: {
        selectors: ['#content_left', '.result.c-container'],
        visualHints: { position: 'left' }
      }
    },
    strategies: {
      click: ['selector', 'visual', 'coordinate'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    },
    antiDetection: {
      humanDelay: { min: 300, max: 800 },
      mouseTrack: true,
      typingNoise: true
    }
  },

  'google.com': {
    name: 'Google',
    category: 'search',
    type: 'search',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['input[name="q"]', 'textarea[name="q"]', '#APjFqb'],
        visualHints: { position: 'center', ariaLabel: '搜索' }
      },
      searchButton: {
        selectors: ['input[type="submit"]', 'button[aria-label*="搜索"]'],
        visualHints: { position: 'center' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector', 'visual']
    },
    antiDetection: {
      humanDelay: { min: 200, max: 600 },
      mouseTrack: true,
      typingNoise: true
    }
  },

  'bing.com': {
    name: 'Bing',
    category: 'search',
    type: 'search',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#sb_form_q', 'input[name="q"]'],
        visualHints: { position: 'center' }
      },
      searchButton: {
        selectors: ['#sb_form_go', 'label[for="sb_form_go"]'],
        visualHints: { position: 'right' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector', 'visual']
    }
  },

  'sogou.com': {
    name: '搜狗',
    category: 'search',
    type: 'search',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#query', '#upquery'],
        visualHints: { position: 'top-center' }
      },
      searchButton: {
        selectors: ['#stb', '.s_btn'],
        visualHints: { text: '搜索' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'so.com': {
    name: '360搜索',
    category: 'search',
    type: 'search',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#keyword', 'input[name="q"]'],
        visualHints: { position: 'top-center' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  // ============ 电商类 ============
  'taobao.com': {
    name: '淘宝',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#q', '#J_TSearchForm input[type="text"]'],
        visualHints: { position: 'top-center', placeholder: /搜索/ }
      },
      searchButton: {
        selectors: ['.btn-search', '#J_TSearchForm button'],
        visualHints: { text: '搜索' }
      },
      productCards: {
        selectors: ['.Card--doubleCardWrapper', '.items .item', '.J_ItemCard'],
        visualHints: { multiple: true }
      },
      price: {
        selectors: ['.price', '.g_price-highlight'],
        visualHints: { color: '#ff5000' }
      },
      addToCart: {
        selectors: ['.J_LinkBuy', '.btn-add-cart'],
        visualHints: { text: /加入购物车|立即购买/ }
      }
    },
    strategies: {
      click: ['visual', 'selector', 'coordinate'],
      input: ['selector', 'visual'],
      extract: ['visual', 'selector']
    },
    antiDetection: {
      humanDelay: { min: 500, max: 1500 },
      mouseTrack: true,
      typingNoise: true,
      scrollBehavior: 'natural',
      requestInterval: { min: 2000, max: 5000 }
    }
  },

  'tmall.com': {
    name: '天猫',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#mq', '#searchComDiv input'],
        visualHints: { position: 'top-center' }
      },
      searchButton: {
        selectors: ['#searchComDiv button', '.btn-search'],
        visualHints: { text: '搜索' }
      }
    },
    strategies: {
      click: ['visual', 'selector', 'coordinate'],
      input: ['selector', 'visual'],
      extract: ['visual', 'selector']
    },
    antiDetection: {
      humanDelay: { min: 500, max: 1500 },
      mouseTrack: true,
      typingNoise: true
    }
  },

  'jd.com': {
    name: '京东',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#key', '#search input'],
        visualHints: { position: 'top-center' }
      },
      searchButton: {
        selectors: ['#search button', '.search-btn', '.button'],
        visualHints: { text: '搜索' }
      },
      productCards: {
        selectors: ['.gl-item', '.J-goods-list .gl-item'],
        visualHints: { multiple: true }
      },
      price: {
        selectors: ['.p-price', '.J-p-price'],
        visualHints: { color: '#e4393c' }
      }
    },
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    },
    antiDetection: {
      humanDelay: { min: 400, max: 1000 },
      mouseTrack: true,
      typingNoise: true
    }
  },

  'pinduoduo.com': {
    name: '拼多多',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'high',
    strategies: {
      click: ['visual', 'coordinate'],
      input: ['visual'],
      extract: ['visual']
    },
    antiDetection: {
      humanDelay: { min: 800, max: 2000 },
      mouseTrack: true,
      scrollBehavior: 'smooth'
    }
  },

  'suning.com': {
    name: '苏宁',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#searchKeywordsInput', '.search-input input'],
        visualHints: { position: 'top-center' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector']
    }
  },

  'gome.com.cn': {
    name: '国美',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'vip.com': {
    name: '唯品会',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'medium',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['visual']
    },
    antiDetection: {
      humanDelay: { min: 500, max: 1200 }
    }
  },

  'mi.com': {
    name: '小米商城',
    category: 'ecommerce',
    type: 'ecommerce',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  // ============ 社交类 ============
  'weibo.com': {
    name: '微博',
    category: 'social',
    type: 'social',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#pl_search_top input', '.W_input', 'input[name="keyword"]'],
        visualHints: { position: 'top' }
      },
      publishButton: {
        selectors: ['.W_btn_a', 'button[action-type="post"]'],
        visualHints: { text: '发布' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    },
    antiDetection: {
      humanDelay: { min: 400, max: 1000 }
    }
  },

  'zhihu.com': {
    name: '知乎',
    category: 'social',
    type: 'social',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['.SearchBar-input input', 'input[placeholder*="搜索"]'],
        visualHints: { position: 'top' }
      },
      answer: {
        selectors: ['.List-item', '.AnswerItem'],
        visualHints: { multiple: true }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    }
  },

  'tieba.baidu.com': {
    name: '百度贴吧',
    category: 'social',
    type: 'social',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'douban.com': {
    name: '豆瓣',
    category: 'social',
    type: 'social',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#inp-query', 'input[name="q"]'],
        visualHints: { position: 'top' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector', 'visual']
    }
  },

  'twitter.com': {
    name: 'Twitter',
    category: 'social',
    type: 'social',
    priority: 'high',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['selector']
    },
    antiDetection: {
      humanDelay: { min: 300, max: 800 }
    }
  },

  // ============ 社交电商类（直播带货/内容电商）============
  'douyin.com': {
    name: '抖音',
    category: 'social-ecommerce',
    type: 'social-ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['.search-input input', 'input[placeholder*="搜索"]'],
        visualHints: { position: 'top-right' }
      },
      productLink: {
        selectors: ['.product-card', '.ecom-product'],
        visualHints: { multiple: true }
      }
    },
    strategies: {
      click: ['visual', 'coordinate'],
      input: ['visual'],
      extract: ['visual']
    },
    antiDetection: {
      humanDelay: { min: 800, max: 2000 },
      mouseTrack: true,
      scrollBehavior: 'smooth',
      requestInterval: { min: 2000, max: 4000 }
    }
  },

  'kuaishou.com': {
    name: '快手',
    category: 'social-ecommerce',
    type: 'social-ecommerce',
    priority: 'high',
    strategies: {
      click: ['visual', 'coordinate'],
      input: ['visual'],
      extract: ['visual']
    },
    antiDetection: {
      humanDelay: { min: 800, max: 2000 },
      mouseTrack: true
    }
  },

  'xiaohongshu.com': {
    name: '小红书',
    category: 'social-ecommerce',
    type: 'social-ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['#search-input', '.search-input input'],
        visualHints: { position: 'top' }
      },
      noteCards: {
        selectors: ['.note-item', '.feeds-page .note-item'],
        visualHints: { multiple: true }
      },
      likeButton: {
        selectors: ['.like-btn', '.interact-btn'],
        visualHints: { icon: 'heart' }
      }
    },
    strategies: {
      click: ['visual', 'selector'],
      input: ['visual', 'selector'],
      extract: ['visual', 'selector']
    },
    antiDetection: {
      humanDelay: { min: 600, max: 1500 },
      mouseTrack: true,
      scrollBehavior: 'natural'
    }
  },

  'bilibili.com': {
    name: 'B站',
    category: 'social-ecommerce',
    type: 'social-ecommerce',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['.nav-search-input', '#search-keyword'],
        visualHints: { position: 'top-center' }
      },
      videoCards: {
        selectors: ['.video-card', '.bili-video-card'],
        visualHints: { multiple: true }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    },
    antiDetection: {
      humanDelay: { min: 400, max: 1000 }
    }
  },

  'weixin.qq.com': {
    name: '微信网页版',
    category: 'social-ecommerce',
    type: 'social-ecommerce',
    priority: 'medium',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  // ============ 内容平台类 ============
  'jianshu.com': {
    name: '简书',
    category: 'content',
    type: 'content',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector', 'visual']
    }
  },

  'juejin.cn': {
    name: '掘金',
    category: 'content',
    type: 'content',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['.search-input input', 'input[placeholder*="搜索"]'],
        visualHints: { position: 'top' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'csdn.net': {
    name: 'CSDN',
    category: 'content',
    type: 'content',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#toolbar-search-input', '.search-input'],
        visualHints: { position: 'top' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'segmentfault.com': {
    name: 'SegmentFault',
    category: 'content',
    type: 'content',
    priority: 'low',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'toutiao.com': {
    name: '今日头条',
    category: 'content',
    type: 'content',
    priority: 'high',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['visual', 'selector']
    }
  },

  'zhihu.com': {
    name: '知乎',
    category: 'content',
    type: 'content',
    priority: 'high',
    elements: {
      searchInput: {
        selectors: ['.SearchBar-input input', 'input[type="text"]'],
        visualHints: { position: 'top' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    }
  },

  // ============ 工具类 ============
  'github.com': {
    name: 'GitHub',
    category: 'tool',
    type: 'tool',
    priority: 'medium',
    elements: {
      searchInput: {
        selectors: ['#query-builder-test', 'input[name="q"]'],
        visualHints: { position: 'top' }
      }
    },
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'stackoverflow.com': {
    name: 'StackOverflow',
    category: 'tool',
    type: 'tool',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'fanyi.baidu.com': {
    name: '百度翻译',
    category: 'tool',
    type: 'tool',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'fanyi.youdao.com': {
    name: '有道翻译',
    category: 'tool',
    type: 'tool',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  // ============ 其他 ============
  'amap.com': {
    name: '高德地图',
    category: 'tool',
    type: 'tool',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  'dianping.com': {
    name: '大众点评',
    category: 'service',
    type: 'service',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector', 'visual'],
      extract: ['selector', 'visual']
    }
  },

  'meituan.com': {
    name: '美团',
    category: 'service',
    type: 'service',
    priority: 'high',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['visual', 'selector']
    },
    antiDetection: {
      humanDelay: { min: 500, max: 1200 }
    }
  },

  'ele.me': {
    name: '饿了么',
    category: 'service',
    type: 'service',
    priority: 'high',
    strategies: {
      click: ['visual', 'selector'],
      input: ['selector', 'visual'],
      extract: ['visual', 'selector']
    }
  },

  'ctrip.com': {
    name: '携程',
    category: 'service',
    type: 'service',
    priority: 'high',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector', 'visual']
    }
  },

  'qunar.com': {
    name: '去哪儿',
    category: 'service',
    type: 'service',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  },

  '58.com': {
    name: '58同城',
    category: 'service',
    type: 'service',
    priority: 'medium',
    strategies: {
      click: ['selector', 'visual'],
      input: ['selector'],
      extract: ['selector']
    }
  }
};

/**
 * 网站策略管理类
 */
class SiteStrategy {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(process.cwd(), '.flowharness', 'knowledge', 'site-strategies.json');
    this.memoryPath = options.memoryPath || path.join(process.cwd(), '.flowharness', 'knowledge', 'element-memory.json');
    this.statsPath = options.statsPath || path.join(process.cwd(), '.flowharness', 'knowledge', 'accuracy-stats.json');

    // 策略配置
    this.strategies = { ...SITE_STRATEGIES };

    // 元素位置记忆
    this.elementMemory = new Map();

    // 准确度统计
    this.accuracyStats = new Map();

    // 白名单
    this.whitelist = new Set();

    // 初始化
    this.initialized = false;
  }

  /**
   * 初始化 - 加载保存的配置
   */
  async init() {
    if (this.initialized) return;

    try {
      // 加载策略配置
      await this.loadStrategies();

      // 加载元素记忆
      await this.loadElementMemory();

      // 加载准确度统计
      await this.loadAccuracyStats();

      this.initialized = true;
      console.log('网站策略管理器初始化完成');
    } catch (e) {
      console.log('策略管理器初始化:', e.message);
      this.initialized = true;
    }
  }

  /**
   * 从URL提取域名
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取分类列表
   */
  getCategories() {
    return {
      search: { name: '搜索引擎', description: '百度、Google、Bing等搜索引擎' },
      ecommerce: { name: '电商类', description: '淘宝、京东、拼多多等电商平台' },
      social: { name: '社交类', description: '微博、知乎、豆瓣等社交平台' },
      'social-ecommerce': { name: '社交电商', description: '抖音、小红书、B站等直播/内容电商' },
      content: { name: '内容平台', description: '今日头条、掘金、CSDN等内容平台' },
      tool: { name: '工具类', description: 'GitHub、翻译、地图等工具网站' },
      service: { name: '生活服务', description: '美团、携程、大众点评等生活服务' }
    };
  }

  /**
   * 获取某个分类下的所有网站
   */
  getSitesByCategory(category) {
    const sites = [];
    for (const [domain, strategy] of Object.entries(this.strategies)) {
      if (strategy.category === category || strategy.type === category) {
        sites.push({
          domain,
          name: strategy.name,
          priority: strategy.priority,
          type: strategy.type
        });
      }
    }
    return sites.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 获取所有预定义网站
   */
  getAllSites() {
    const result = {};
    const categories = this.getCategories();

    for (const [category, info] of Object.entries(categories)) {
      result[category] = {
        ...info,
        sites: this.getSitesByCategory(category)
      };
    }

    return result;
  }

  /**
   * 获取网站分类
   */
  getSiteCategory(url) {
    const strategy = this.getStrategy(url);
    return {
      category: strategy.category || strategy.type || 'unknown',
      categoryName: this.getCategories()[strategy.category]?.name || strategy.name || '未知'
    };
  }

  /**
   * 获取网站策略
   */
  getStrategy(url) {
    const domain = this.extractDomain(url);
    if (!domain) return this.getDefaultStrategy();

    // 精确匹配
    if (this.strategies[domain]) {
      return this.strategies[domain];
    }

    // 部分匹配（如 www.baidu.com 匹配 baidu.com）
    for (const [key, value] of Object.entries(this.strategies)) {
      if (domain.includes(key) || key.includes(domain)) {
        return value;
      }
    }

    // 返回默认策略
    return this.getDefaultStrategy(domain);
  }

  /**
   * 获取默认策略
   */
  getDefaultStrategy(domain = 'default') {
    return {
      name: domain,
      type: 'unknown',
      priority: 'low',
      strategies: {
        click: ['selector', 'visual', 'coordinate'],
        input: ['selector', 'visual'],
        extract: ['selector', 'visual']
      },
      antiDetection: {
        humanDelay: { min: 300, max: 800 },
        mouseTrack: true,
        typingNoise: true
      }
    };
  }

  /**
   * 记忆元素位置
   */
  async rememberElement(url, elementKey, position, metadata = {}) {
    await this.init();

    const domain = this.extractDomain(url);
    if (!domain) return;

    const memoryKey = `${domain}:${elementKey}`;

    const record = {
      domain,
      elementKey,
      position: {
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height
      },
      selectors: metadata.selectors || [],
      visualHash: metadata.visualHash,
      lastSeen: Date.now(),
      successCount: 1,
      failCount: 0,
      accuracy: 1.0
    };

    // 如果已存在，更新记录
    if (this.elementMemory.has(memoryKey)) {
      const existing = this.elementMemory.get(memoryKey);
      record.successCount = existing.successCount + 1;
      record.failCount = existing.failCount;
      record.accuracy = record.successCount / (record.successCount + record.failCount);
      record.selectors = [...new Set([...existing.selectors, ...record.selectors])];
    }

    this.elementMemory.set(memoryKey, record);
    await this.saveElementMemory();

    return record;
  }

  /**
   * 查找记忆的元素位置
   */
  findRememberedElement(url, elementKey) {
    const domain = this.extractDomain(url);
    if (!domain) return null;

    const memoryKey = `${domain}:${elementKey}`;
    return this.elementMemory.get(memoryKey) || null;
  }

  /**
   * 记录操作成功/失败
   */
  async recordOperation(url, operation, success, method) {
    await this.init();

    const domain = this.extractDomain(url);
    if (!domain) return;

    const statsKey = `${domain}:${operation}`;

    if (!this.accuracyStats.has(statsKey)) {
      this.accuracyStats.set(statsKey, {
        domain,
        operation,
        totalAttempts: 0,
        successCount: 0,
        methodStats: {}
      });
    }

    const stats = this.accuracyStats.get(statsKey);
    stats.totalAttempts++;
    if (success) stats.successCount++;

    // 方法统计
    if (!stats.methodStats[method]) {
      stats.methodStats[method] = { attempts: 0, successes: 0 };
    }
    stats.methodStats[method].attempts++;
    if (success) stats.methodStats[method].successes++;

    await this.saveAccuracyStats();

    return stats;
  }

  /**
   * 获取准确度报告
   */
  getAccuracyReport(url = null) {
    const report = {
      overall: { total: 0, success: 0, accuracy: 0 },
      byDomain: {},
      byOperation: {},
      byMethod: {}
    };

    for (const [key, stats] of this.accuracyStats) {
      if (url && !key.includes(this.extractDomain(url))) continue;

      const accuracy = stats.totalAttempts > 0
        ? stats.successCount / stats.totalAttempts
        : 0;

      // 总体统计
      report.overall.total += stats.totalAttempts;
      report.overall.success += stats.successCount;

      // 按域名统计
      if (!report.byDomain[stats.domain]) {
        report.byDomain[stats.domain] = { total: 0, success: 0 };
      }
      report.byDomain[stats.domain].total += stats.totalAttempts;
      report.byDomain[stats.domain].success += stats.successCount;

      // 按操作统计
      if (!report.byOperation[stats.operation]) {
        report.byOperation[stats.operation] = { total: 0, success: 0 };
      }
      report.byOperation[stats.operation].total += stats.totalAttempts;
      report.byOperation[stats.operation].success += stats.successCount;

      // 按方法统计
      for (const [method, methodStats] of Object.entries(stats.methodStats)) {
        if (!report.byMethod[method]) {
          report.byMethod[method] = { total: 0, success: 0 };
        }
        report.byMethod[method].total += methodStats.attempts;
        report.byMethod[method].success += methodStats.successes;
      }
    }

    // 计算总体准确度
    report.overall.accuracy = report.overall.total > 0
      ? report.overall.success / report.overall.total
      : 0;

    // 计算各维度准确度
    for (const domain of Object.keys(report.byDomain)) {
      const d = report.byDomain[domain];
      d.accuracy = d.total > 0 ? d.success / d.total : 0;
    }
    for (const op of Object.keys(report.byOperation)) {
      const o = report.byOperation[op];
      o.accuracy = o.total > 0 ? o.success / o.total : 0;
    }
    for (const method of Object.keys(report.byMethod)) {
      const m = report.byMethod[method];
      m.accuracy = m.total > 0 ? m.success / m.total : 0;
    }

    return report;
  }

  /**
   * 对比识别验证
   * 比较预期位置和实际位置的差异
   */
  async verifyElementPosition(page, elementKey, expectedPosition, options = {}) {
    const tolerance = options.tolerance || 0.3; // 30% 容差

    try {
      // 获取当前元素位置
      const currentElement = await this.findCurrentElement(page, elementKey);

      if (!currentElement) {
        return {
          verified: false,
          reason: 'element_not_found',
          expected: expectedPosition
        };
      }

      // 计算位置差异
      const xDiff = Math.abs(currentElement.x - expectedPosition.x) / (expectedPosition.width || 100);
      const yDiff = Math.abs(currentElement.y - expectedPosition.y) / (expectedPosition.height || 50);
      const widthDiff = Math.abs(currentElement.width - expectedPosition.width) / expectedPosition.width;
      const heightDiff = Math.abs(currentElement.height - expectedPosition.height) / expectedPosition.height;

      const avgDiff = (xDiff + yDiff + widthDiff + heightDiff) / 4;

      const verified = avgDiff <= tolerance;

      return {
        verified,
        deviation: avgDiff,
        expected: expectedPosition,
        actual: currentElement,
        deviationDetails: { xDiff, yDiff, widthDiff, heightDiff }
      };
    } catch (e) {
      return {
        verified: false,
        reason: 'error',
        error: e.message
      };
    }
  }

  /**
   * 查找当前元素位置
   */
  async findCurrentElement(page, elementKey) {
    const keyLower = elementKey.toLowerCase();

    // 尝试常见的选择器
    const commonSelectors = {
      'searchInput': ['input[type="text"]', 'input[type="search"]', '#kw', '#q', '#key'],
      'searchButton': ['button[type="submit"]', 'input[type="submit"]', '#su', '.btn-search'],
      'loginButton': ['button:has-text("登录")', 'a:has-text("登录")', '.login-btn'],
      'submit': ['button[type="submit"]', 'input[type="submit"]', '.submit-btn']
    };

    const selectors = commonSelectors[keyLower] || [];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const box = await element.boundingBox();
          if (box) {
            return { ...box, selector, method: 'selector' };
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  /**
   * 添加到白名单
   */
  async addToWhitelist(url) {
    await this.init();

    const domain = this.extractDomain(url);
    if (domain) {
      this.whitelist.add(domain);

      // 保存
      const config = await this.loadConfig();
      config.whitelist = Array.from(this.whitelist);
      await this.saveConfig(config);
    }
  }

  /**
   * 检查是否在白名单中
   */
  isWhitelisted(url) {
    const domain = this.extractDomain(url);
    return domain ? this.whitelist.has(domain) : false;
  }

  /**
   * 获取最佳操作方法
   * 基于历史准确度选择
   */
  getBestMethod(url, operation) {
    const domain = this.extractDomain(url);
    if (!domain) return 'selector';

    const statsKey = `${domain}:${operation}`;
    const stats = this.accuracyStats.get(statsKey);

    if (!stats || Object.keys(stats.methodStats).length === 0) {
      // 没有历史数据，使用策略默认值
      const strategy = this.getStrategy(url);
      return strategy.strategies[operation]?.[0] || 'selector';
    }

    // 找出准确度最高的方法
    let bestMethod = 'selector';
    let bestAccuracy = 0;

    for (const [method, methodStats] of Object.entries(stats.methodStats)) {
      const accuracy = methodStats.successes / methodStats.attempts;
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestMethod = method;
      }
    }

    return bestMethod;
  }

  /**
   * 自定义策略
   */
  async setCustomStrategy(domain, strategy) {
    await this.init();

    this.strategies[domain] = {
      ...this.getDefaultStrategy(domain),
      ...strategy,
      custom: true,
      createdAt: Date.now()
    };

    await this.saveStrategies();

    return this.strategies[domain];
  }

  // ============ 持久化方法 ============

  async loadStrategies() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const data = JSON.parse(content);
      this.strategies = { ...SITE_STRATEGIES, ...data.customStrategies };
      this.whitelist = new Set(data.whitelist || []);
    } catch (e) {
      // 使用默认策略
    }
  }

  async saveStrategies() {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    const customStrategies = {};
    for (const [key, value] of Object.entries(this.strategies)) {
      if (value.custom) {
        customStrategies[key] = value;
      }
    }

    const data = {
      defaultStrategies: SITE_STRATEGIES,
      customStrategies,
      whitelist: Array.from(this.whitelist),
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2));
  }

  async loadElementMemory() {
    try {
      const content = await fs.readFile(this.memoryPath, 'utf-8');
      const data = JSON.parse(content);
      for (const [key, value] of Object.entries(data)) {
        this.elementMemory.set(key, value);
      }
      console.log(`已加载 ${this.elementMemory.size} 个元素记忆`);
    } catch (e) {
      // 无记忆
    }
  }

  async saveElementMemory() {
    const dir = path.dirname(this.memoryPath);
    await fs.mkdir(dir, { recursive: true });

    const data = {};
    for (const [key, value] of this.elementMemory) {
      data[key] = value;
    }

    await fs.writeFile(this.memoryPath, JSON.stringify(data, null, 2));
  }

  async loadAccuracyStats() {
    try {
      const content = await fs.readFile(this.statsPath, 'utf-8');
      const data = JSON.parse(content);
      for (const [key, value] of Object.entries(data)) {
        this.accuracyStats.set(key, value);
      }
    } catch (e) {
      // 无统计
    }
  }

  async saveAccuracyStats() {
    const dir = path.dirname(this.statsPath);
    await fs.mkdir(dir, { recursive: true });

    const data = {};
    for (const [key, value] of this.accuracyStats) {
      data[key] = value;
    }

    await fs.writeFile(this.statsPath, JSON.stringify(data, null, 2));
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return { whitelist: [] };
    }
  }

  async saveConfig(config) {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }
}

module.exports = { SiteStrategy, SITE_STRATEGIES };
