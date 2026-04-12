/**
 * 任务上下文打包脚本
 * 用法：
 *   node scripts/pack-context.mjs "修复登录超时问题"
 *
 * 说明：
 * - 不依赖第三方包
 * - 基于关键词对 docs/、memory/、prompts/ 做轻量搜索
 * - 生成上下文包到 memory/exports/context-packs/
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.log('用法：node scripts/pack-context.mjs "你的任务描述"');
  process.exit(0);
}

const searchRoots = [
  "docs",
  "memory/normalized",
  "memory/writebacks",
  "prompts/system",
  "prompts/tasks",
  "prompts/roles",
];

const allowedExts = new Set([".md", ".txt", ".json", ".yml", ".yaml", ".js", ".ts", ".mjs"]);

function splitKeywords(text) {
  return text
    .split(/[\s,，。；;:：/\\|()\[\]{}"'`]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length >= 2);
}

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.name === ".git" || item.name === "node_modules") continue;
    if (item.isDirectory()) {
      walk(fullPath, results);
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (allowedExts.has(ext)) results.push(fullPath);
    }
  }
  return results;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function scoreFile(filePath, content, keywords) {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();
  let score = 0;
  const hitLines = [];

  for (const keyword of keywords) {
    if (lowerPath.includes(keyword)) score += 10;
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = (lowerContent.match(new RegExp(safeKeyword, "g")) || []).length;
    score += Math.min(occurrences, 20);
    if (occurrences > 0) {
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword)) {
          hitLines.push(line.trim());
          if (hitLines.length >= 3) break;
        }
      }
    }
  }

  return { score, hitLines: Array.from(new Set(hitLines)).slice(0, 3) };
}

const keywords = Array.from(new Set(splitKeywords(task)));
let allFiles = [];
for (const dir of searchRoots) {
  const absDir = path.join(root, dir);
  if (fs.existsSync(absDir)) allFiles.push(...walk(absDir));
}

if (allFiles.length === 0) {
  console.log("[WARN] 未找到可搜索文件，请先补充 docs/、memory/、prompts/");
  process.exit(0);
}

const ranked = allFiles
  .map(filePath => {
    const content = safeRead(filePath);
    const { score, hitLines } = scoreFile(filePath, content, keywords);
    return { filePath, score, hitLines };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12);

const outDir = path.join(root, "memory/exports/context-packs");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);

const lines = [];
lines.push("# 任务上下文包");
lines.push("");
lines.push("## 当前任务");
lines.push(task);
lines.push("");
lines.push("## 关键词");
lines.push(keywords.length ? keywords.map(k => `- ${k}`).join("\n") : "- 无");
lines.push("");

if (ranked.length === 0) {
  lines.push("## 检索结果");
  lines.push("未命中相关内容。");
  lines.push("");
  lines.push("## 建议");
  lines.push("- 先补充 docs/");
  lines.push("- 或先将历史经验写入 memory/");
} else {
  lines.push("## 检索结果");
  lines.push("");
  ranked.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${path.relative(root, item.filePath)}`);
    lines.push(`- 相关度分数：${item.score}`);
    if (item.hitLines.length > 0) {
      lines.push("- 关键片段：");
      item.hitLines.forEach(line => lines.push(`  - ${line}`));
    }
    lines.push("");
  });
}

lines.push("## 使用建议");
lines.push("- 先阅读前 3 个高相关文件");
lines.push("- 再决定当前最适合使用哪个工具");
lines.push("- 不预设固定工具职责");
lines.push("- 完成后记得执行 writeback");

fs.writeFileSync(outFile, lines.join("\n"), "utf-8");
console.log(`[OK] 已生成上下文包：${outFile}`);
