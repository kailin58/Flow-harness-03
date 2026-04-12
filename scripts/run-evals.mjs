/**
 * AI 协作层基础评测脚本
 * 用法：
 *   node scripts/run-evals.mjs
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

function countFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) count += countFilesRecursively(fullPath);
    else if (item.isFile()) count += 1;
  }
  return count;
}

const stats = {
  docs: countFilesRecursively(path.join(root, "docs")),
  memory: countFilesRecursively(path.join(root, "memory")),
  prompts: countFilesRecursively(path.join(root, "prompts")),
  evalDatasets: countFilesRecursively(path.join(root, "evals/datasets")),
};

const reportDir = path.join(root, "evals/reports/daily");
fs.mkdirSync(reportDir, { recursive: true });
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);

const lines = [
  "# AI 协作层基础评测日报",
  "",
  `生成时间：${new Date().toLocaleString()}`,
  "",
  "## 当前规模统计",
  `- docs 文件数：${stats.docs}`,
  `- memory 文件数：${stats.memory}`,
  `- prompts 文件数：${stats.prompts}`,
  `- eval 数据集文件数：${stats.evalDatasets}`,
  "",
  "## 观察建议",
  "- 若 docs 文件长期很少，说明长期真源沉淀不足",
  "- 若 memory/writebacks 文件很少，说明任务回写流程未落地",
  "- 若 prompts 资产很少，说明提示词复用体系还不完整",
  "- 若 eval 数据集很少，说明评测体系还比较初期",
];

fs.writeFileSync(reportFile, lines.join("\n"), "utf-8");
console.log(`[OK] 已生成评测报告：${reportFile}`);
