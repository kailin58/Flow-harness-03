/**
 * team-collaboration.js - 团队协作支持
 *
 * 文档要求(P2): 团队协作
 *   - 团队成员管理与角色映射
 *   - 任务分配与认领机制
 *   - 共享知识库与标注
 *   - 变更通知生成
 *   - 协作统计与洞察
 *   - 活动日志
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const MEMBER_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
  REVIEWER: 'reviewer',
  VIEWER: 'viewer'
};

const TASK_STATUS = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  DONE: 'done',
  BLOCKED: 'blocked'
};

const ACTIVITY_TYPE = {
  MEMBER_ADDED: 'member_added',
  MEMBER_REMOVED: 'member_removed',
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STATUS_CHANGED: 'task_status_changed',
  NOTE_ADDED: 'note_added',
  ANNOTATION_ADDED: 'annotation_added',
  CONFIG_CHANGED: 'config_changed'
};

// 角色权限矩阵
const ROLE_PERMISSIONS = {
  [MEMBER_ROLE.OWNER]:     ['manage_team', 'manage_tasks', 'assign', 'review', 'annotate', 'view', 'configure'],
  [MEMBER_ROLE.ADMIN]:     ['manage_team', 'manage_tasks', 'assign', 'review', 'annotate', 'view', 'configure'],
  [MEMBER_ROLE.DEVELOPER]: ['manage_tasks', 'assign', 'review', 'annotate', 'view'],
  [MEMBER_ROLE.REVIEWER]:  ['review', 'annotate', 'view'],
  [MEMBER_ROLE.VIEWER]:    ['view']
};

// ============================================================
// TeamCollaboration
// ============================================================

class TeamCollaboration {
  /**
   * @param {Object} options
   * @param {string} options.storageDir   - 数据存储目录
   * @param {string} options.teamName     - 团队名称
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), '.flowharness', 'team');
    this.teamName = options.teamName || 'default';
    this.logger = options.logger || createLogger({ name: 'team-collaboration' });

    // 数据存储
    this.members = new Map();
    this.tasks = new Map();
    this.annotations = [];
    this.activityLog = [];
    this.sharedNotes = [];

    // 任务 ID 计数器
    this._taskIdCounter = 1;
  }

  // ----------------------------------------------------------
  // 成员管理
  // ----------------------------------------------------------

  /**
   * 添加团队成员
   * @param {string} userId    - 用户ID
   * @param {string} name      - 显示名称
   * @param {string} role      - 角色
   * @param {Object} metadata  - 额外信息
   * @returns {Object} 成员信息
   */
  addMember(userId, name, role = MEMBER_ROLE.DEVELOPER, metadata = {}) {
    if (this.members.has(userId)) {
      return { success: false, error: 'Member already exists' };
    }

    const member = {
      userId,
      name,
      role,
      joinedAt: new Date().toISOString(),
      metadata,
      permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[MEMBER_ROLE.VIEWER]
    };

    this.members.set(userId, member);
    this._logActivity(ACTIVITY_TYPE.MEMBER_ADDED, { userId, name, role });

    return { success: true, member };
  }

  /**
   * 移除成员
   */
  removeMember(userId) {
    if (!this.members.has(userId)) return false;

    this.members.delete(userId);
    this._logActivity(ACTIVITY_TYPE.MEMBER_REMOVED, { userId });

    // 解除分配的任务
    for (const [, task] of this.tasks) {
      if (task.assignee === userId) {
        task.assignee = null;
        task.status = TASK_STATUS.OPEN;
      }
    }

    return true;
  }

  /**
   * 获取成员
   */
  getMember(userId) {
    return this.members.get(userId) || null;
  }

  /**
   * 列出所有成员
   */
  listMembers() {
    const list = [];
    for (const [, member] of this.members) {
      list.push({ ...member });
    }
    return list;
  }

  /**
   * 检查成员权限
   */
  hasPermission(userId, permission) {
    const member = this.members.get(userId);
    if (!member) return false;
    return member.permissions.includes(permission);
  }

  /**
   * 更新成员角色
   */
  updateRole(userId, newRole) {
    const member = this.members.get(userId);
    if (!member) return { success: false, error: 'Member not found' };

    member.role = newRole;
    member.permissions = ROLE_PERMISSIONS[newRole] || ROLE_PERMISSIONS[MEMBER_ROLE.VIEWER];

    this._logActivity(ACTIVITY_TYPE.CONFIG_CHANGED, {
      userId,
      change: 'role_update',
      newRole
    });

    return { success: true, member };
  }

  // ----------------------------------------------------------
  // 任务管理
  // ----------------------------------------------------------

  /**
   * 创建任务
   * @param {Object} taskData
   * @param {string} taskData.title      - 标题
   * @param {string} taskData.description - 描述
   * @param {string} taskData.priority    - 优先级 (high/medium/low)
   * @param {string} taskData.createdBy   - 创建者
   * @param {string[]} taskData.tags      - 标签
   * @returns {Object} 创建的任务
   */
  createTask(taskData) {
    const taskId = `T-${this._taskIdCounter++}`;
    const task = {
      id: taskId,
      title: taskData.title,
      description: taskData.description || '',
      priority: taskData.priority || 'medium',
      status: TASK_STATUS.OPEN,
      assignee: null,
      createdBy: taskData.createdBy || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: taskData.tags || [],
      comments: [],
      history: []
    };

    this.tasks.set(taskId, task);
    this._logActivity(ACTIVITY_TYPE.TASK_CREATED, { taskId, title: task.title });

    return task;
  }

  /**
   * 分配任务
   */
  assignTask(taskId, userId) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const member = this.members.get(userId);
    if (!member) return { success: false, error: 'Member not found' };

    task.history.push({
      field: 'assignee',
      from: task.assignee,
      to: userId,
      at: new Date().toISOString()
    });

    task.assignee = userId;
    task.status = TASK_STATUS.ASSIGNED;
    task.updatedAt = new Date().toISOString();

    this._logActivity(ACTIVITY_TYPE.TASK_ASSIGNED, {
      taskId,
      assignee: userId,
      title: task.title
    });

    return { success: true, task };
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(taskId, newStatus) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const validStatuses = Object.values(TASK_STATUS);
    if (!validStatuses.includes(newStatus)) {
      return { success: false, error: `Invalid status: ${newStatus}` };
    }

    task.history.push({
      field: 'status',
      from: task.status,
      to: newStatus,
      at: new Date().toISOString()
    });

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    this._logActivity(ACTIVITY_TYPE.TASK_STATUS_CHANGED, {
      taskId,
      from: task.history[task.history.length - 1].from,
      to: newStatus
    });

    return { success: true, task };
  }

  /**
   * 获取任务
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 列出任务
   * @param {Object} filters
   */
  listTasks(filters = {}) {
    let tasks = [...this.tasks.values()];

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.assignee) {
      tasks = tasks.filter(t => t.assignee === filters.assignee);
    }
    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }
    if (filters.tag) {
      tasks = tasks.filter(t => t.tags.includes(filters.tag));
    }

    return tasks;
  }

  /**
   * 添加任务评论
   */
  addComment(taskId, userId, content) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const comment = {
      id: `C-${Date.now()}`,
      userId,
      content,
      createdAt: new Date().toISOString()
    };

    task.comments.push(comment);
    task.updatedAt = new Date().toISOString();

    return { success: true, comment };
  }

  // ----------------------------------------------------------
  // 知识共享
  // ----------------------------------------------------------

  /**
   * 添加共享笔记
   * @param {string} userId  - 作者
   * @param {string} title   - 标题
   * @param {string} content - 内容
   * @param {string[]} tags  - 标签
   * @returns {Object} 笔记
   */
  addNote(userId, title, content, tags = []) {
    const note = {
      id: `N-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userId,
      title,
      content,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.sharedNotes.push(note);
    this._logActivity(ACTIVITY_TYPE.NOTE_ADDED, { noteId: note.id, title });

    return note;
  }

  /**
   * 搜索笔记
   */
  searchNotes(query) {
    const lower = query.toLowerCase();
    return this.sharedNotes.filter(n =>
      n.title.toLowerCase().includes(lower) ||
      n.content.toLowerCase().includes(lower) ||
      n.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  /**
   * 添加代码标注
   * @param {Object} annotation
   * @param {string} annotation.file     - 文件路径
   * @param {number} annotation.line     - 行号
   * @param {string} annotation.content  - 标注内容
   * @param {string} annotation.userId   - 作者
   * @param {string} annotation.type     - 类型 (info/warning/todo/question)
   */
  addAnnotation(annotation) {
    const anno = {
      id: `A-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      file: annotation.file,
      line: annotation.line || null,
      content: annotation.content,
      userId: annotation.userId,
      type: annotation.type || 'info',
      createdAt: new Date().toISOString(),
      resolved: false
    };

    this.annotations.push(anno);
    this._logActivity(ACTIVITY_TYPE.ANNOTATION_ADDED, {
      annotationId: anno.id,
      file: anno.file
    });

    return anno;
  }

  /**
   * 获取文件标注
   */
  getAnnotations(file) {
    if (file) {
      return this.annotations.filter(a => a.file === file);
    }
    return [...this.annotations];
  }

  /**
   * 解决标注
   */
  resolveAnnotation(annotationId) {
    const anno = this.annotations.find(a => a.id === annotationId);
    if (!anno) return false;
    anno.resolved = true;
    anno.resolvedAt = new Date().toISOString();
    return true;
  }

  // ----------------------------------------------------------
  // 变更通知
  // ----------------------------------------------------------

  /**
   * 生成变更通知摘要
   * @param {number} sinceMs - 最近多长时间 (毫秒)
   * @returns {Object} 通知摘要
   */
  generateChangeSummary(sinceMs = 24 * 60 * 60 * 1000) {
    const cutoff = new Date(Date.now() - sinceMs);
    const recent = this.activityLog.filter(a => new Date(a.timestamp) >= cutoff);

    const summary = {
      period: { from: cutoff.toISOString(), to: new Date().toISOString() },
      totalActivities: recent.length,
      byType: {},
      highlights: []
    };

    for (const activity of recent) {
      if (!summary.byType[activity.type]) {
        summary.byType[activity.type] = 0;
      }
      summary.byType[activity.type]++;
    }

    // 高亮
    const taskChanges = recent.filter(a =>
      a.type === ACTIVITY_TYPE.TASK_CREATED ||
      a.type === ACTIVITY_TYPE.TASK_STATUS_CHANGED
    );
    if (taskChanges.length > 0) {
      summary.highlights.push(`${taskChanges.length} task changes`);
    }

    const memberChanges = recent.filter(a =>
      a.type === ACTIVITY_TYPE.MEMBER_ADDED ||
      a.type === ACTIVITY_TYPE.MEMBER_REMOVED
    );
    if (memberChanges.length > 0) {
      summary.highlights.push(`${memberChanges.length} team changes`);
    }

    return summary;
  }

  // ----------------------------------------------------------
  // 活动日志
  // ----------------------------------------------------------

  _logActivity(type, data) {
    this.activityLog.push({
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      data,
      timestamp: new Date().toISOString()
    });

    // 保留最近 1000 条
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-500);
    }
  }

  /**
   * 获取活动日志
   */
  getActivityLog(limit = 50) {
    return this.activityLog.slice(-limit);
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  /**
   * 获取协作统计
   */
  getStats() {
    const tasks = [...this.tasks.values()];
    const tasksByStatus = {};
    for (const status of Object.values(TASK_STATUS)) {
      tasksByStatus[status] = tasks.filter(t => t.status === status).length;
    }

    // 成员工作量
    const workload = {};
    for (const [userId, member] of this.members) {
      const assigned = tasks.filter(t => t.assignee === userId);
      workload[userId] = {
        name: member.name,
        role: member.role,
        totalAssigned: assigned.length,
        inProgress: assigned.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length,
        done: assigned.filter(t => t.status === TASK_STATUS.DONE).length
      };
    }

    return {
      teamName: this.teamName,
      memberCount: this.members.size,
      taskCount: this.tasks.size,
      tasksByStatus,
      annotationCount: this.annotations.length,
      unresolvedAnnotations: this.annotations.filter(a => !a.resolved).length,
      noteCount: this.sharedNotes.length,
      activityCount: this.activityLog.length,
      workload
    };
  }

  // ----------------------------------------------------------
  // 持久化
  // ----------------------------------------------------------

  /**
   * 导出数据
   */
  exportData() {
    return {
      teamName: this.teamName,
      members: Object.fromEntries(this.members),
      tasks: Object.fromEntries(this.tasks),
      annotations: this.annotations,
      sharedNotes: this.sharedNotes,
      activityLog: this.activityLog.slice(-200),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 导入数据
   */
  importData(data) {
    if (data.members) {
      for (const [id, member] of Object.entries(data.members)) {
        this.members.set(id, member);
      }
    }
    if (data.tasks) {
      for (const [id, task] of Object.entries(data.tasks)) {
        this.tasks.set(id, task);
      }
    }
    if (data.annotations) {
      this.annotations = [...this.annotations, ...data.annotations];
    }
    if (data.sharedNotes) {
      this.sharedNotes = [...this.sharedNotes, ...data.sharedNotes];
    }
    if (data.teamName) {
      this.teamName = data.teamName;
    }
    return true;
  }

  /**
   * 保存到文件
   */
  save() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    const filePath = path.join(this.storageDir, 'team-data.json');
    fs.writeFileSync(filePath, JSON.stringify(this.exportData(), null, 2), 'utf8');
    return filePath;
  }

  /**
   * 从文件加载
   */
  load() {
    const filePath = path.join(this.storageDir, 'team-data.json');
    if (!fs.existsSync(filePath)) return false;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.importData(data);
      return true;
    } catch (e) {
      this.logger.warn({ error: e.message }, 'Failed to load team data');
      return false;
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  TeamCollaboration,
  MEMBER_ROLE,
  TASK_STATUS,
  ACTIVITY_TYPE,
  ROLE_PERMISSIONS
};
