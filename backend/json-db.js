// ============================================================
// JSON 数据引擎 — 替代 SQLite
// 数据按实体拆分存储于项目根目录 data/ 下的多个 JSON 文件：
//   config.json   — 设置（settings）+ 自增序列（_sequences）
//   student.json  — 学生（students）
//   group.json    — 小组（groups）
//   rule.json     — 规则（rules，含 add / minus）
//   shouItems.json— 售卖物品（shopItems）
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 各实体对应的存储文件
const FILES = {
  settings: path.join(DATA_DIR, 'config.json'),
  students: path.join(DATA_DIR, 'student.json'),
  groups: path.join(DATA_DIR, 'group.json'),
  rules: path.join(DATA_DIR, 'rule.json'),
  shopItems: path.join(DATA_DIR, 'shouItems.json')
};
// 旧版单一数据文件（用于一次性迁移）
const LEGACY_FILE = path.join(DATA_DIR, 'class-data.json');

// ==================== 内存数据 ====================
let data = null;

function getDefaultData() {
  return {
    students: [],
    groups: [],
    rules: { add: [], minus: [] },
    shopItems: [],
    settings: {},
    _sequences: { students: 0, groups: 0, rules: 0, shopItems: 0, history: 0 }
  };
}

/** 从单个文件读取 JSON；文件不存在或损坏时返回 fallback */
function readFile(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error(`读取数据文件失败: ${file}`, err);
  }
  return fallback;
}

/** 原子写入单个 JSON 文件 */
function writeFile(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/** 从 5 个拆分文件加载数据 */
function load() {
  data = getDefaultData();
  // config.json 同时存放 settings 与 _sequences，加载时拆分
  const cfg = readFile(FILES.settings, {}) || {};
  data.settings = { ...cfg };
  delete data.settings._sequences;
  data.students = readFile(FILES.students, []) || [];
  data.groups = readFile(FILES.groups, []) || [];
  data.rules = readFile(FILES.rules, { add: [], minus: [] }) || { add: [], minus: [] };
  data.shopItems = readFile(FILES.shopItems, []) || [];
  data._sequences = cfg._sequences || { students: 0, groups: 0, rules: 0, shopItems: 0, history: 0 };
}

/** 将数据保存到 5 个拆分文件 */
function save() {
  // _sequences.history 语义为「历史记录总条数」（用于统计展示），每次保存时自动校准
  data._sequences.history = data.students.reduce((sum, s) =>
    sum + (Array.isArray(s.history) ? s.history.length : 0), 0);
  // 序列随设置一起写入 config.json
  const cfg = { ...data.settings, _sequences: data._sequences };
  writeFile(FILES.settings, cfg);
  writeFile(FILES.students, data.students);
  writeFile(FILES.groups, data.groups);
  writeFile(FILES.rules, data.rules);
  writeFile(FILES.shopItems, data.shopItems);
}

/** 一次性迁移：将旧版 class-data.json 拆分到 5 个文件 */
function migrateLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8'));
    console.log('📋 检测到旧版 class-data.json，正在迁移到拆分文件...');
    data = getDefaultData();
    data.students = Array.isArray(legacy.students) ? legacy.students : [];
    data.groups = Array.isArray(legacy.groups) ? legacy.groups : [];
    // 规则兼容两种旧格式：扁平数组 与 { add, minus }
    const legacyRules = legacy.rules;
    if (Array.isArray(legacyRules)) {
      data.rules = { add: [], minus: [] };
      for (const r of legacyRules) {
        data.rules[r.points >= 0 ? 'add' : 'minus'].push(r);
      }
    } else if (legacyRules && typeof legacyRules === 'object') {
      data.rules = { add: legacyRules.add || [], minus: legacyRules.minus || [] };
    } else {
      data.rules = { add: [], minus: [] };
    }
    data.shopItems = Array.isArray(legacy.shopItems) ? legacy.shopItems : [];
    data.settings = legacy.settings && typeof legacy.settings === 'object' ? legacy.settings : {};
    data._sequences = legacy._sequences || { students: 0, groups: 0, rules: 0, shopItems: 0, history: 0 };
    save();
    // 迁移成功后重命名旧文件（保留备份，避免误删）
    fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.bak');
    console.log('✅ 旧版数据已迁移到拆分文件，原文件已备份为 class-data.json.bak');
  } catch (err) {
    console.error('迁移旧版数据失败:', err);
  }
}

function nowISO() {
  return new Date().toISOString();
}

/** 自动递增 ID */
function nextSeq(entity) {
  data._sequences[entity] = (data._sequences[entity] || 0) + 1;
  return data._sequences[entity];
}

// 初始化时加载
// 若存在旧版 class-data.json，先迁移到拆分文件
migrateLegacy();
load();

// === 迁移：确保所有学生有 history 字段 ===
let migrated = false;
for (const s of data.students) {
  if (!Array.isArray(s.history)) {
    s.history = [];
    migrated = true;
  }
}
if (migrated) {
  save();
  console.log('✅ 已为学生补充 history 字段');
}

// === 迁移：将顶层 history 记录迁移到各自学生的 history 数组中 ===
if (data.history && Array.isArray(data.history) && data.history.length > 0) {
  console.log(`📋 正在迁移 ${data.history.length} 条历史记录到学生内部...`);
  for (const h of data.history) {
    const student = data.students.find(s => s.id === h.student_id);
    if (student) {
      if (!Array.isArray(student.history)) student.history = [];
      student.history.push(h);
    }
  }
  delete data.history;
  save();
  console.log('✅ 历史记录迁移完成');
}
// 删除空的顶层 history 字段（如果存在且为空）
if (data.history) {
  delete data.history;
  save();
}

// === 迁移：将旧版扁平 rules 数组转换为 { add, minus } 结构 ===
// 旧格式: data.rules = [ {id,name,points,sort_order,...}, ... ]
// 新格式: data.rules = { add: [...], minus: [...] }
if (Array.isArray(data.rules)) {
  const oldRules = data.rules;
  data.rules = { add: [], minus: [] };
  for (const r of oldRules) {
    const target = r.points >= 0 ? 'add' : 'minus';
    data.rules[target].push(r);
  }
  save();
  console.log('✅ 已迁移规则存储格式为 { add, minus }');
}

// 首次运行时插入默认规则
if (!data.rules || (!data.rules.add && !data.rules.minus)) {
  data.rules = { add: [], minus: [] };
}
if (data.rules.add.length === 0 && data.rules.minus.length === 0) {
  const defaultRules = [
    ['回答问题正确', 1, 1],
    ['认真完成作业', 2, 2],
    ['帮助同学', 3, 3],
    ['课堂表现优秀', 5, 4],
    ['比赛获奖', 10, 5],
    ['早读优秀', 1, 6],
    ['扰乱课堂', -2, 7],
    ['作业不完整', -1, 8],
    ['迟到', -1, 9],
    ['不尊重他人', -3, 10],
  ];
  for (const [name, points, order] of defaultRules) {
    const id = nextSeq('rules');
    const target = points >= 0 ? 'add' : 'minus';
    data.rules[target].push({ id, name, points, sort_order: order, created_at: nowISO() });
  }
  save();
  console.log('✅ 已插入默认规则');
}

/** 将每个学生的历史记录 ID 重编号为独立从 1 开始（按数组顺序） */
function renumberHistoryIds() {
  let changed = false;
  for (const s of data.students) {
    if (Array.isArray(s.history) && s.history.length) {
      s.history.forEach((h, i) => {
        const newId = i + 1;
        if (h.id !== newId) {
          h.id = newId;
          changed = true;
        }
      });
    }
  }
  if (changed) {
    save();
    console.log('✅ 历史记录 ID 已迁移为学生独立编号（每个学生从 1 开始）');
  }
}

// 启动时执行历史记录 ID 迁移
renumberHistoryIds();

// === 迁移：校准自增序列 ===
// 防止学生/小组/规则/商品等 id 与已有数据冲突
(function syncSequences() {
  const maxId = (arr, key) => arr.reduce((max, item) => Math.max(max, item[key] || 0), 0);
  let changed = false;
  const allRules = [
    ...(Array.isArray(data.rules) ? data.rules : []),
    ...(data.rules && Array.isArray(data.rules.add) ? data.rules.add : []),
    ...(data.rules && Array.isArray(data.rules.minus) ? data.rules.minus : [])
  ];
  const targets = {
    students: maxId(data.students, 'id'),
    groups: maxId(data.groups, 'id'),
    rules: maxId(allRules, 'id'),
    shopItems: maxId(data.shopItems, 'id')
  };
  for (const key of Object.keys(targets)) {
    if ((data._sequences[key] || 0) < targets[key]) {
      data._sequences[key] = targets[key];
      changed = true;
    }
  }
  if (changed) {
    save();
    console.log('✅ 已校准自增序列:', JSON.stringify(data._sequences));
  }
})();

/** 手动触发保存（用于外部直接操作数据对象后） */
function flush() {
  save();
}

// ============================================================
// 公开 API
// ============================================================
const DB = {

  // ******************** 学生 ********************

  /** 查询学生列表，支持按姓名搜索 */
  getStudents(search) {
    let list = data.students;
    if (search) {
      const kw = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(kw));
    }
    return [...list].sort((a, b) => a.id - b.id);
  },

  getStudent(id) {
    return data.students.find(s => s.id === id) || null;
  },

  addStudent(name, gender) {
    const id = nextSeq('students');
    const student = {
      id,
      name,
      gender: gender || 'male',
      avatar: null,
      total_points: 0,
      used_points: 0,
      reading_points: 0,
      group_id: null,
      history: [],
      created_at: nowISO()
    };
    data.students.push(student);
    save();
    return id;
  },

  /** 批量添加学生，返回 id 数组 */
  addStudents(namesList, gender) {
    const ids = [];
    const g = gender === 'female' ? 'female' : 'male';
    for (const name of namesList) {
      const trimmed = name.trim();
      if (trimmed) {
        ids.push(this.addStudent(trimmed, g));
      }
    }
    return ids;
  },

  updateStudent(id, fields) {
    const idx = data.students.findIndex(s => s.id === id);
    if (idx === -1) return null;
    Object.assign(data.students[idx], fields);
    save();
    return data.students[idx];
  },

  deleteStudent(id) {
    const idx = data.students.findIndex(s => s.id === id);
    if (idx === -1) return false;
    data.students.splice(idx, 1);
    save();
    return true;
  },

  deleteAllStudents() {
    data.students = [];
    save();
  },

  /** 学生加减分（同步更新 total_points 并写入历史） */
  addPoints(studentId, points, reason) {
    const student = this.getStudent(studentId);
    if (!student) return null;
    student.total_points += points;
    const hid = this.addHistory(studentId, points, reason);
    save();
    return { student, historyId: hid };
  },

  /** 批量加减分（带历史记录） */
  batchAddPoints(studentIds, points, reason) {
    let count = 0;
    for (const id of studentIds) {
      const s = this.getStudent(id);
      if (s) {
        s.total_points += points;
        this.addHistory(id, points, `[批量操作] ${reason || '自定义'}`);
        count++;
      }
    }
    save();
    return count;
  },

  /** 增加已用积分（兑换商品时） */
  addUsedPoints(studentId, points) {
    const s = this.getStudent(studentId);
    if (!s) return false;
    s.used_points += points;
    save();
    return true;
  },

  /** 批量更新学生的 reading_points（用于早读加分保存） */
  batchUpdateReadingPoints(scoresMap) {
    let count = 0;
    for (const [idStr, points] of Object.entries(scoresMap)) {
      const id = parseInt(idStr, 10);
      const s = data.students.find(stu => stu.id === id);
      if (s) {
        s.reading_points = typeof points === 'number' ? points : 0;
        count++;
      }
    }
    save();
    return count;
  },

  /** 按小组获取学生 */
  getStudentsByGroup(groupId) {
    return data.students
      .filter(s => s.group_id === groupId)
      .sort((a, b) => a.id - b.id);
  },

  // ******************** 小组 ********************

  getGroups() {
    return [...data.groups].sort((a, b) => a.id - b.id);
  },

  getGroup(id) {
    return data.groups.find(g => g.id === id) || null;
  },

  addGroup(name) {
    const id = nextSeq('groups');
    const group = { id, name, created_at: nowISO() };
    data.groups.push(group);
    save();
    return id;
  },

  updateGroup(id, name) {
    const g = this.getGroup(id);
    if (!g) return null;
    g.name = name;
    save();
    return g;
  },

  deleteGroup(id) {
    const idx = data.groups.findIndex(g => g.id === id);
    if (idx === -1) return false;
    data.groups.splice(idx, 1);
    // 组内学生变为未分组
    for (const s of data.students) {
      if (s.group_id === id) s.group_id = null;
    }
    save();
    return true;
  },

  /** 设置学生的小组（添加/移除） */
  setStudentGroup(studentId, groupId) {
    const s = this.getStudent(studentId);
    if (!s) return false;
    s.group_id = groupId;
    save();
    return true;
  },

  // ******************** 规则 ********************

  // 内部：返回扁平合并后的规则数组（保持向后兼容）
  _allRules() {
    const add = Array.isArray(data.rules.add) ? data.rules.add : [];
    const minus = Array.isArray(data.rules.minus) ? data.rules.minus : [];
    return [...add, ...minus];
  },

  // 内部：根据 points 符号返回所属数组（add / minus）
  _ruleBucket(points) {
    return points >= 0 ? 'add' : 'minus';
  },

  getRules() {
    return this._allRules().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
  },

  getRule(id) {
    return this._allRules().find(r => r.id === id) || null;
  },

  addRule(name, points) {
    const id = nextSeq('rules');
    const bucket = this._ruleBucket(points);
    const maxOrder = data.rules[bucket].reduce((max, r) => Math.max(max, r.sort_order || 0), 0);
    const rule = {
      id, name, points,
      sort_order: maxOrder + 1,
      created_at: nowISO()
    };
    data.rules[bucket].push(rule);
    save();
    return id;
  },

  updateRule(id, fields) {
    const r = this.getRule(id);
    if (!r) return null;
    // 若分值符号改变，需要移动到对应数组
    if (fields.points !== undefined && fields.points !== r.points) {
      const oldBucket = this._ruleBucket(r.points);
      const newBucket = this._ruleBucket(fields.points);
      if (oldBucket !== newBucket) {
        data.rules[oldBucket] = data.rules[oldBucket].filter(x => x.id !== id);
        Object.assign(r, fields);
        data.rules[newBucket].push(r);
        save();
        return r;
      }
    }
    Object.assign(r, fields);
    save();
    return r;
  },

  deleteRule(id) {
    const r = this.getRule(id);
    if (!r) return false;
    const bucket = this._ruleBucket(r.points);
    data.rules[bucket] = data.rules[bucket].filter(x => x.id !== id);
    save();
    return true;
  },

  reorderRules(orderArray) {
    // orderArray: [{ id, sort_order }, ...]
    for (const item of orderArray) {
      const r = this.getRule(item.id);
      if (r) r.sort_order = item.sort_order;
    }
    save();
  },

  // ******************** 商店 ********************

  getShopItems() {
    return [...data.shopItems].sort((a, b) => a.id - b.id);
  },

  getShopItem(id) {
    return data.shopItems.find(i => i.id === id) || null;
  },

  addShopItem(name, cost, stock) {
    const id = nextSeq('shopItems');
    const item = { id, name, cost, stock, created_at: nowISO() };
    data.shopItems.push(item);
    save();
    return id;
  },

  updateShopItem(id, fields) {
    const idx = data.shopItems.findIndex(i => i.id === id);
    if (idx === -1) return null;
    Object.assign(data.shopItems[idx], fields);
    save();
    return data.shopItems[idx];
  },

  deleteShopItem(id) {
    const idx = data.shopItems.findIndex(i => i.id === id);
    if (idx === -1) return false;
    data.shopItems.splice(idx, 1);
    save();
    return true;
  },

  /** 更新商品库存（正数增加，负数减少） */
  adjustStock(itemId, delta) {
    const item = this.getShopItem(itemId);
    if (!item) return false;
    item.stock += delta;
    save();
    return true;
  },

  /** 按名称查找商品（用于撤回兑换） */
  findShopItemByName(name) {
    return data.shopItems.find(i => i.name === name) || null;
  },

  // ******************** 历史记录（存储在学生的 history 数组内） ********************

  /** 获取某个学生的历史记录 */
  getHistory(studentId, order = 'ASC') {
    const student = this.getStudent(studentId);
    if (!student || !Array.isArray(student.history)) return [];
    return [...student.history].sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at);
      return order === 'DESC' ? -cmp : cmp;
    });
  },

  /** 按学生 ID + 历史记录 ID 查找历史记录（每个学生的 history id 独立从 1 开始） */
  getHistoryRecord(studentId, id) {
    const student = this.getStudent(studentId);
    if (!student || !Array.isArray(student.history)) return null;
    return student.history.find(h => h.id === id) || null;
  },

  /** 添加历史记录到学生的 history 数组（每个学生内部 id 独立从 1 开始递增） */
  addHistory(studentId, points, reason) {
    const student = this.getStudent(studentId);
    if (!student) return null;
    if (!Array.isArray(student.history)) student.history = [];
    // 每个学生的历史记录 id 独立：取该学生已有最大 id + 1
    let id = student.history.reduce((max, h) => Math.max(max, h.id || 0), 0) + 1;
    // 防御：确保 id 在该学生内唯一（如有重复则继续递增）
    let guard = 0;
    while (student.history.some(h => h.id === id) && guard < 1000) {
      id++;
      guard++;
    }
    const record = {
      id,
      student_id: studentId,
      points,
      reason: reason || null,
      created_at: nowISO()
    };
    student.history.push(record);
    // 同步历史总条数统计（_sequences.history 用于统计展示）
    data._sequences.history = (data._sequences.history || 0) + 1;
    return id;
  },

  /** 通过学生 ID + 历史记录 ID 删除历史记录 */
  deleteHistory(studentId, id) {
    const student = this.getStudent(studentId);
    if (!student || !Array.isArray(student.history)) return false;
    const idx = student.history.findIndex(h => h.id === id);
    if (idx === -1) return false;
    student.history.splice(idx, 1);
    // 同步历史总条数统计
    data._sequences.history = Math.max(0, (data._sequences.history || 0) - 1);
    save();
    return true;
  },

  /** 清空某学生的所有历史记录 */
  deleteHistoryByStudent(studentId) {
    const student = this.getStudent(studentId);
    if (student) {
      student.history = [];
    }
  },

  /** 重置所有学生的积分为 0 并清空历史 */
  resetAllPoints() {
    for (const s of data.students) {
      s.total_points = 0;
      s.used_points = 0;
      s.history = [];
    }
    save();
    return data.students.length;
  },

  /** 清空所有学生的历史记录 */
  deleteAllHistory() {
    for (const s of data.students) {
      s.history = [];
    }
    save();
  },

  /** 获取学生在时间范围内的历史记录（用于报表，排除兑换记录） */
  getHistoryInRange(studentId, startISO, endISO) {
    const student = this.getStudent(studentId);
    if (!student || !Array.isArray(student.history)) return [];
    return student.history.filter(h =>
      h.created_at >= startISO &&
      h.created_at <= endISO &&
      (!h.reason || !h.reason.startsWith('兑换商品:'))
    ).sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  // ******************** 设置 ********************

  getSetting(key) {
    return data.settings[key] || null;
  },

  getAllSettings() {
    return { ...data.settings };
  },

  setSetting(key, value) {
    data.settings[key] = value;
    save();
  },

  deleteSetting(key) {
    delete data.settings[key];
    save();
  },

  // ******************** 数据导入导出 ********************

  exportAll() {
    return {
      exportDate: nowISO(),
      students: JSON.parse(JSON.stringify(data.students)),
      groups: JSON.parse(JSON.stringify(data.groups)),
      rules: JSON.parse(JSON.stringify(data.rules)),
      shopItems: JSON.parse(JSON.stringify(data.shopItems)),
      settings: JSON.parse(JSON.stringify(data.settings)),
      _sequences: JSON.parse(JSON.stringify(data._sequences))
    };
  },

  importAll(importData) {
    if (!importData) throw new Error('无效的导入数据');

    // 清空数据（settings 暂不清空，稍后按是否提供决定恢复或保留）
    data.students = [];
    data.groups = [];
    data.rules = { add: [], minus: [] };
    data.shopItems = [];
    const preservedSettings = { ...data.settings };
    data.settings = {};

    // 导入小组
    if (importData.groups && Array.isArray(importData.groups)) {
      for (const g of importData.groups) {
        data.groups.push({
          id: g.id, name: g.name,
          created_at: g.created_at || nowISO()
        });
      }
    }

    // 导入学生（含历史记录）
    if (importData.students && Array.isArray(importData.students)) {
      for (const s of importData.students) {
        data.students.push({
          id: s.id,
          name: s.name,
          gender: s.gender || 'male',
          avatar: s.avatar || null,
          total_points: s.total_points || 0,
          used_points: s.used_points || 0,
          reading_points: s.reading_points || 0,
          group_id: s.group_id || null,
          history: s.history || [],
          created_at: s.created_at || nowISO()
        });
      }
    }

    // 导入规则（兼容旧扁平数组格式与新 { add, minus } 格式）
    const importRules = Array.isArray(importData.rules)
      ? importData.rules
      : [
          ...(importData.rules && Array.isArray(importData.rules.add) ? importData.rules.add : []),
          ...(importData.rules && Array.isArray(importData.rules.minus) ? importData.rules.minus : [])
        ];
    for (const r of importRules) {
      const bucket = r.points >= 0 ? 'add' : 'minus';
      data.rules[bucket].push({
        id: r.id, name: r.name, points: r.points,
        sort_order: r.sort_order || 0,
        created_at: r.created_at || nowISO()
      });
    }

    // 导入商店商品
    if (importData.shopItems && Array.isArray(importData.shopItems)) {
      for (const item of importData.shopItems) {
        data.shopItems.push({
          id: item.id, name: item.name, cost: item.cost,
          stock: item.stock, created_at: item.created_at || nowISO()
        });
      }
    }

    // 兼容旧格式：如果导入数据中有顶层 history 数组，迁移到对应学生
    if (importData.history && Array.isArray(importData.history)) {
      for (const h of importData.history) {
        const student = data.students.find(s => s.id === h.student_id);
        if (student) {
          if (!Array.isArray(student.history)) student.history = [];
          student.history.push(h);
        }
      }
    }

    // 导入设置：若导入数据未提供 settings，则保留原有设置（避免清空密码等）
    if (importData.settings && typeof importData.settings === 'object') {
      data.settings = JSON.parse(JSON.stringify(importData.settings));
    } else {
      data.settings = preservedSettings;
    }

    // 导入序列
    if (importData._sequences) {
      data._sequences = importData._sequences;
    } else {
      // 自动恢复序列
      const maxId = (arr, key) => arr.reduce((max, item) => Math.max(max, item[key] || 0), 0);
      const allHistory = [];
      for (const s of data.students) {
        if (Array.isArray(s.history)) allHistory.push(...s.history);
      }
      const allRules = [
        ...(Array.isArray(data.rules.add) ? data.rules.add : []),
        ...(Array.isArray(data.rules.minus) ? data.rules.minus : [])
      ];
      data._sequences = {
        students: maxId(data.students, 'id'),
        groups: maxId(data.groups, 'id'),
        rules: maxId(allRules, 'id'),
        shopItems: maxId(data.shopItems, 'id'),
        // history 语义为「历史记录总条数」（统计用）
        history: allHistory.length
      };
    }

    // 导入后重新编号：每个学生的历史记录 ID 独立从 1 开始
    renumberHistoryIds();

    save();
  }
};

DB.flush = flush;
module.exports = DB;
