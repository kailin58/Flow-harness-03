const TaskAnalyzer = require('./src/task-analyzer');

const analyzer = new TaskAnalyzer();

const testCases = [
  '搜索项目中的API 调用代码',
  '帮我查一下 Node.js 文档',
  '查找资料了解 TypeScript 类型系统',
  '上网搜索如何配置 Webpack',
  '查阅 Docker 官方文档',
  '研究一下微服务架构',
  '查一下数据库性能优化方案'
];

console.log('=== 测试结果 ===');
testCases.forEach(task => {
  const result = analyzer.analyze(task);
  console.log('任务:', task);
  console.log('  类型:', result.taskType);
  console.log('');
});
