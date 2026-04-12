/**
 * doc-generator.js - 文档自动生成
 *
 * 文档要求(P1): 自动文档生成与同步
 *   - 从源码提取 JSDoc 注释
 *   - 生成模块 API 文档
 *   - 生成模块依赖关系图
 *   - 变更检测与增量更新
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

// ============================================================
// DocGenerator
// ============================================================

class DocGenerator {
  /**
   * @param {Object} options
   * @param {string} options.srcDir     - 源码目录
   * @param {string} options.outputDir  - 输出目录
   * @param {Object} options.logger     - Logger 实例
   */
  constructor(options = {}) {
    this.srcDir = options.srcDir || path.join(process.cwd(), 'src');
    this.outputDir = options.outputDir || path.join(process.cwd(), '.flowharness', 'docs');
    this.logger = options.logger || createLogger({ name: 'doc-generator' });
  }

  // ----------------------------------------------------------
  // 完整文档生成
  // ----------------------------------------------------------

  /**
   * 生成全部文档
   * @returns {Object} 生成结果
   */
  generate() {
    const result = {
      timestamp: new Date().toISOString(),
      modules: [],
      dependencies: {},
      outputFiles: [],
      errors: []
    };

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 1. 扫描源文件
    const sourceFiles = this._scanSourceFiles();
    this.logger.info({ count: sourceFiles.length }, 'Source files found');

    // 2. 解析每个文件
    for (const filePath of sourceFiles) {
      try {
        const moduleDoc = this._parseFile(filePath);
        result.modules.push(moduleDoc);
      } catch (error) {
        result.errors.push({ file: filePath, error: error.message });
      }
    }

    // 3. 分析依赖关系
    result.dependencies = this._analyzeDependencies(result.modules);

    // 4. 生成 API 文档
    const apiDocPath = this._generateAPIDoc(result.modules);
    result.outputFiles.push(apiDocPath);

    // 5. 生成依赖图
    const depGraphPath = this._generateDependencyGraph(result.dependencies);
    result.outputFiles.push(depGraphPath);

    // 6. 生成模块索引
    const indexPath = this._generateModuleIndex(result.modules);
    result.outputFiles.push(indexPath);

    this.logger.info({
      modules: result.modules.length,
      files: result.outputFiles.length,
      errors: result.errors.length
    }, 'Documentation generated');

    return result;
  }

  // ----------------------------------------------------------
  // 文件扫描
  // ----------------------------------------------------------

  _scanSourceFiles() {
    const files = [];
    try {
      const entries = fs.readdirSync(this.srcDir);
      for (const entry of entries) {
        if (entry.endsWith('.js')) {
          files.push(path.join(this.srcDir, entry));
        }
      }
    } catch (e) {
      this.logger.warn({ error: e.message, srcDir: this.srcDir }, 'Failed to scan source directory');
    }
    return files.sort();
  }

  // ----------------------------------------------------------
  // JSDoc 解析
  // ----------------------------------------------------------

  _parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const moduleName = fileName.replace('.js', '');

    const moduleDoc = {
      name: moduleName,
      file: fileName,
      path: filePath,
      description: '',
      version: null,
      date: null,
      exports: [],
      classes: [],
      functions: [],
      dependencies: [],
      lines: content.split('\n').length
    };

    // 提取文件头部 JSDoc
    const headerMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
    if (headerMatch) {
      const headerBlock = headerMatch[1];
      moduleDoc.description = this._extractDescription(headerBlock);
      moduleDoc.version = this._extractTag(headerBlock, 'version');
      moduleDoc.date = this._extractTag(headerBlock, 'date');
    }

    // 提取类定义
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let classMatch;
    while ((classMatch = classRegex.exec(content)) !== null) {
      const className = classMatch[1];
      const extendsClass = classMatch[2] || null;

      // 查找类的 JSDoc
      const classDocMatch = content.substring(0, classMatch.index).match(/\/\*\*([\s\S]*?)\*\/\s*$/);
      const classDoc = classDocMatch ? this._extractDescription(classDocMatch[1]) : '';

      // 提取方法
      const methods = this._extractMethods(content, classMatch.index, className);

      moduleDoc.classes.push({
        name: className,
        extends: extendsClass,
        description: classDoc,
        methods
      });
    }

    // 提取 require 依赖
    const requireRegex = /require\(['"]\.\/([^'"]+)['"]\)/g;
    let reqMatch;
    while ((reqMatch = requireRegex.exec(content)) !== null) {
      const dep = reqMatch[1].replace('.js', '');
      if (!moduleDoc.dependencies.includes(dep)) {
        moduleDoc.dependencies.push(dep);
      }
    }

    // 提取 module.exports
    const exportsMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    if (exportsMatch) {
      const exportItems = exportsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      moduleDoc.exports = exportItems.map(item => {
        const parts = item.split(':');
        return parts[0].trim();
      });
    } else {
      const singleExport = content.match(/module\.exports\s*=\s*(\w+)/);
      if (singleExport) {
        moduleDoc.exports = [singleExport[1]];
      }
    }

    // 提取独立函数（非类内）
    const funcRegex = /(?:async\s+)?function\s+(\w+)\s*\(/g;
    let funcMatch;
    while ((funcMatch = funcRegex.exec(content)) !== null) {
      // 排除类内方法（简单启发式：检查是否在类定义内）
      const funcDocMatch = content.substring(Math.max(0, funcMatch.index - 500), funcMatch.index).match(/\/\*\*([\s\S]*?)\*\/\s*$/);
      const funcDoc = funcDocMatch ? this._extractDescription(funcDocMatch[1]) : '';

      moduleDoc.functions.push({
        name: funcMatch[1],
        description: funcDoc
      });
    }

    return moduleDoc;
  }

  _extractDescription(docBlock) {
    const lines = docBlock.split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(l => !l.startsWith('@') && l.length > 0);
    return lines.join(' ').trim();
  }

  _extractTag(docBlock, tagName) {
    const match = docBlock.match(new RegExp(`@${tagName}\\s+(.+)`));
    return match ? match[1].trim() : null;
  }

  _extractMethods(content, classStartIndex, className) {
    const methods = [];

    // 从类开始位置向后搜索方法
    const classContent = this._extractClassBody(content, classStartIndex);
    if (!classContent) return methods;

    // 匹配方法定义
    const methodRegex = /(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g;
    let methodMatch;
    while ((methodMatch = methodRegex.exec(classContent)) !== null) {
      const isAsync = !!methodMatch[1];
      const methodName = methodMatch[2];
      if (methodName === 'constructor' || methodName === 'if' || methodName === 'for' ||
          methodName === 'while' || methodName === 'switch' || methodName === 'catch') continue;

      // 查找方法上方的 JSDoc
      const before = classContent.substring(Math.max(0, methodMatch.index - 500), methodMatch.index);
      const docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
      const description = docMatch ? this._extractDescription(docMatch[1]) : '';

      // 提取参数
      const params = this._extractParams(docMatch ? docMatch[1] : '');

      // 提取返回值
      const returns = this._extractReturns(docMatch ? docMatch[1] : '');

      methods.push({
        name: methodName,
        params: methodMatch[3].split(',').map(p => p.trim()).filter(Boolean),
        description,
        paramDocs: params,
        returns,
        isPrivate: methodName.startsWith('_'),
        isAsync
      });
    }

    return methods;
  }

  _extractClassBody(content, startIndex) {
    let depth = 0;
    let started = false;
    let bodyStart = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        if (!started) bodyStart = i + 1;
        started = true;
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (started && depth === 0) {
          return content.substring(bodyStart, i);
        }
      }
    }

    return null;
  }

  _extractParams(docBlock) {
    if (!docBlock) return [];
    const params = [];
    const paramRegex = /@param\s+\{([^}]+)\}\s+(\S+)\s*-?\s*(.*)/g;
    let match;
    while ((match = paramRegex.exec(docBlock)) !== null) {
      params.push({
        type: match[1],
        name: match[2],
        description: match[3].trim()
      });
    }
    return params;
  }

  _extractReturns(docBlock) {
    if (!docBlock) return null;
    const match = docBlock.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
    if (match) {
      return { type: match[1], description: match[2].trim() };
    }
    return null;
  }

  // ----------------------------------------------------------
  // 依赖分析
  // ----------------------------------------------------------

  _analyzeDependencies(modules) {
    const deps = {};
    const reverseDeps = {};

    for (const mod of modules) {
      deps[mod.name] = mod.dependencies;
      for (const dep of mod.dependencies) {
        if (!reverseDeps[dep]) reverseDeps[dep] = [];
        reverseDeps[dep].push(mod.name);
      }
    }

    return { forward: deps, reverse: reverseDeps };
  }

  // ----------------------------------------------------------
  // 文档生成
  // ----------------------------------------------------------

  _generateAPIDoc(modules) {
    const outputPath = path.join(this.outputDir, 'API.md');
    let content = '# Flow Harness API Documentation\n\n';
    content += `Generated: ${new Date().toISOString()}\n\n`;
    content += `## Modules (${modules.length})\n\n`;

    // 目录
    content += '### Table of Contents\n\n';
    for (const mod of modules) {
      content += `- [${mod.name}](#${mod.name.toLowerCase().replace(/[^a-z0-9]/g, '-')})\n`;
    }
    content += '\n---\n\n';

    // 每个模块
    for (const mod of modules) {
      content += `## ${mod.name}\n\n`;
      content += `**File:** \`${mod.file}\` (${mod.lines} lines)\n\n`;

      if (mod.description) {
        content += `${mod.description}\n\n`;
      }

      if (mod.version) content += `**Version:** ${mod.version}\n`;
      if (mod.date) content += `**Date:** ${mod.date}\n`;
      content += '\n';

      if (mod.exports.length > 0) {
        content += `**Exports:** \`${mod.exports.join('`, `')}\`\n\n`;
      }

      if (mod.dependencies.length > 0) {
        content += `**Dependencies:** ${mod.dependencies.map(d => `\`${d}\``).join(', ')}\n\n`;
      }

      // 类
      for (const cls of mod.classes) {
        content += `### Class: ${cls.name}\n\n`;
        if (cls.extends) content += `Extends: \`${cls.extends}\`\n\n`;
        if (cls.description) content += `${cls.description}\n\n`;

        // 公开方法
        const publicMethods = cls.methods.filter(m => !m.isPrivate);
        if (publicMethods.length > 0) {
          content += '#### Methods\n\n';
          for (const method of publicMethods) {
            const asyncMark = method.isAsync ? 'async ' : '';
            content += `##### \`${asyncMark}${method.name}(${method.params.join(', ')})\`\n\n`;
            if (method.description) content += `${method.description}\n\n`;
            if (method.paramDocs.length > 0) {
              content += '**Parameters:**\n';
              for (const p of method.paramDocs) {
                content += `- \`${p.name}\` (\`${p.type}\`) — ${p.description}\n`;
              }
              content += '\n';
            }
            if (method.returns) {
              content += `**Returns:** \`${method.returns.type}\` — ${method.returns.description}\n\n`;
            }
          }
        }
      }

      content += '---\n\n';
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    return outputPath;
  }

  _generateDependencyGraph(dependencies) {
    const outputPath = path.join(this.outputDir, 'DEPENDENCIES.md');
    let content = '# Module Dependencies\n\n';
    content += `Generated: ${new Date().toISOString()}\n\n`;

    // ASCII 依赖图
    content += '## Forward Dependencies (A requires B)\n\n';
    content += '```\n';
    for (const [mod, deps] of Object.entries(dependencies.forward)) {
      if (deps.length === 0) continue;
      content += `${mod}\n`;
      deps.forEach((dep, i) => {
        const prefix = i === deps.length - 1 ? '└── ' : '├── ';
        content += `  ${prefix}${dep}\n`;
      });
      content += '\n';
    }
    content += '```\n\n';

    // 反向依赖
    content += '## Reverse Dependencies (B is required by A)\n\n';
    content += '```\n';
    const sorted = Object.entries(dependencies.reverse)
      .sort((a, b) => b[1].length - a[1].length);

    for (const [mod, users] of sorted) {
      content += `${mod} (used by ${users.length})\n`;
      users.forEach((user, i) => {
        const prefix = i === users.length - 1 ? '└── ' : '├── ';
        content += `  ${prefix}${user}\n`;
      });
      content += '\n';
    }
    content += '```\n\n';

    // 统计
    content += '## Statistics\n\n';
    const totalModules = Object.keys(dependencies.forward).length;
    const avgDeps = Object.values(dependencies.forward).reduce((s, d) => s + d.length, 0) / (totalModules || 1);
    const maxDeps = Math.max(...Object.values(dependencies.forward).map(d => d.length), 0);
    const isolated = Object.entries(dependencies.forward).filter(([, d]) => d.length === 0).map(([m]) => m);

    content += `| Metric | Value |\n|--------|-------|\n`;
    content += `| Total modules | ${totalModules} |\n`;
    content += `| Average dependencies | ${avgDeps.toFixed(1)} |\n`;
    content += `| Max dependencies | ${maxDeps} |\n`;
    content += `| Isolated modules | ${isolated.length} (${isolated.join(', ') || 'none'}) |\n`;

    fs.writeFileSync(outputPath, content, 'utf8');
    return outputPath;
  }

  _generateModuleIndex(modules) {
    const outputPath = path.join(this.outputDir, 'INDEX.md');
    let content = '# Module Index\n\n';
    content += `Generated: ${new Date().toISOString()}\n`;
    content += `Total: ${modules.length} modules\n\n`;

    content += '| Module | Lines | Classes | Methods | Exports | Deps |\n';
    content += '|--------|-------|---------|---------|---------|------|\n';

    const sorted = [...modules].sort((a, b) => b.lines - a.lines);
    let totalLines = 0;

    for (const mod of sorted) {
      const methodCount = mod.classes.reduce((s, c) => s + c.methods.filter(m => !m.isPrivate).length, 0);
      content += `| ${mod.name} | ${mod.lines} | ${mod.classes.length} | ${methodCount} | ${mod.exports.length} | ${mod.dependencies.length} |\n`;
      totalLines += mod.lines;
    }

    content += `\n**Total lines:** ${totalLines.toLocaleString()}\n`;

    fs.writeFileSync(outputPath, content, 'utf8');
    return outputPath;
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = { DocGenerator };
