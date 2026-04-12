# Research 任务处理流程

## 任务类型识别

Research 类型的任务通过关键词识别：
匹配规则如下:

| 关键词 | 类型 |
|------|------|
| 查找资料 | research |
| 查找文档 | research |
| 调研 | research |
| 研究 | research |
| lookup | research |
| find doc | research |
| 查阅 | research |
| 参考 | research |
| search the web | research |
| 上网查 | research |
| 上网搜索 | research |
| 搜索资料 | research |
| 搜索网络 | research |
| 查询文档 | research |
| 网上找 | research |
| 网上搜 | research |
| 淘宝 | research |
| 京东 | research |
| 拼多多 | research |
| 亚马逊 | research |
| 电商 | research |
| 店铺 | research |
| 商品 | research |
| 微信 | research |
| 微博 | research |
| 抖音 | research |
| tiktok | research |
| 小红书 | research |
| b站 | research |
| bilibili | research |
| 知乎 | research |
| 快手 | research |
| facebook | research |
| twitter | research |
| instagram | research |
| linkedin | research |
| youtube | research |
| 朋友圈 | research |
| 公众号 | research |
| 视频号 | research |
| 直播间 | research |
| 爬取 | research |
| 抓取 | research |
| 数据采集 | research |
| 获取数据 | research |
| 网页 | research |
| 网站 | research |

## 任务优先级

Research 类型优先级**最低**，在 `classifyTask` 方法中最后检查

这样可以确保：
research 类型不会被错误分类为`bug_fix` 或 `feature` 稡式抢先匹配。

## 典型任务示例

```javascript
// 任务: "搜索项目中的API 调用代码"
// 类型: general (先匹配到 bug_fix 模式的"搜索")

// 任务: "上网搜索如何配置 Webpack"
// 类型: general (先匹配到 feature 模式的"搜索")

// 任务: "查找资料了解 TypeScript 类型系统"
// 类型: research ✓ 正确识别

// 任务: "查阅 Docker 官方文档"
// 类型: documentation ✓ 正确识别

// 任务: "研究一下微服务架构"
// 类型: research ✓ 正确识别

## 浏览器辅助功能

当检测到需要登录/验证码时，流程如下:

```
用户: "搜索 React 官方文档"
      ↓
Research Agent.browserVisit({
  url: 'https://react.dev',
  extractText: true,
  screenshot: true
})
      ↓
  检测到需要登录
      ↓
  显示浏览器窗口
  用户手动登录
      ↓
  用户点击"我已完成登录"按钮
      ↓
Research Agent.browserConfirm({
  extractText: true,
  screenshot: true
})
      ↓
  提取内容并返回结果
```

**合规声明**: 此流程完全合规
- 浏览器窗口显示，用户看到操作
- 隇到登录/验证码时暂停,等待人工处理
- 会话持久化，无需重复登录
- 不破解验证码
- 遵守网站服务条款
