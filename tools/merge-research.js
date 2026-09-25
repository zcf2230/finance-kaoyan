/**
 * 把 .research/region-*.json 里的调研结果合并进 data/batch*.json。
 *
 * 用法：node tools/merge-research.js [--dry]
 *
 * 合并规则（安全优先，绝不覆盖用户已有信息）：
 *  - 已有院校：逐字段合并，调研结果里"非空"的值才覆盖；旧值不为空时保留。
 *    · 文本类（nt/note/emp/bk…）若新旧不同，用「｜」拼接，两边信息都不丢。
 *    · 拿到精确复试线 l 后，自动删掉约数 la。
 *  - 新院校：按省份归入对应的 batch 文件。
 *  - tags 取并集；id/name/prov/city 以原有为准。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH = path.join(ROOT, '.research');
const BATCHES = ['batch1', 'batch2', 'batch3', 'batch4'];
const DRY = process.argv.includes('--dry');

// 省份 → batch 文件（与 PROVS 分组一致）
const PROV_BATCH = {
  北京: 1, 天津: 1, 河北: 1, 山西: 1, 内蒙古: 1, 辽宁: 1, 吉林: 1, 黑龙江: 1,
  上海: 2, 江苏: 2, 浙江: 2, 安徽: 2, 福建: 2, 江西: 2, 山东: 2,
  河南: 3, 湖北: 3, 湖南: 3, 广东: 3, 广西: 3, 海南: 3,
  重庆: 4, 四川: 4, 贵州: 4, 云南: 4, 西藏: 4, 陕西: 4, 甘肃: 4, 青海: 4, 宁夏: 4, 新疆: 4
};
const ALL_TAGS = ['985', '211', '双一流', '财经类', '自划线'];
// 纯文本字段：新旧都保留，用「｜」拼接
const TEXT_FIELDS = ['nt', 'emp', 'bk'];

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf-8'));
const joinText = (a, b) => {
  if (!a) return b || '';
  if (!b) return a;
  if (a === b || a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}｜${b}`;
};

function mergeProgram(oldP = {}, newP = {}) {
  const out = { ...oldP };
  for (const [k, v] of Object.entries(newP)) {
    if (v === '' || v === null || v === undefined) continue;
    if (k === 'l') {
      const l = { ...(out.l || {}) };
      for (const [y, val] of Object.entries(v)) if (Number(val) > 0) l[y] = Number(val);
      if (Object.keys(l).length) out.l = l;
      continue;
    }
    if (k === 'la') {
      // 已有精确线就不需要约数了，见下方统一清理
      if (!out.l || !Object.keys(out.l).length) out.la = v;
      continue;
    }
    if (TEXT_FIELDS.includes(k)) { out[k] = joinText(out[k], v); continue; }
    if (k === 'e' || k === 'a') { out[k] = joinText(out[k], v); continue; }
    if (!out[k]) out[k] = v;               // m / j / f / d：保留原有，仅补空缺
  }
  if (out.l && Object.keys(out.l).length) delete out.la;
  return out;
}

function mergeSchool(oldS, newS) {
  const out = { ...oldS };
  out.tags = ALL_TAGS.filter(t => (oldS.tags || []).includes(t) || (newS.tags || []).includes(t));
  if (newS.y) out.y = newS.y;
  if (newS.note) out.note = joinText(oldS.note, newS.note);
  for (const k of ['z', 'x']) {
    const merged = mergeProgram(oldS[k], newS[k]);
    if (Object.keys(merged).length) out[k] = merged;
  }
  if (Array.isArray(newS.sources) && newS.sources.length) {
    out.sources = [...new Set([...(oldS.sources || []), ...newS.sources])];
  }
  return out;
}

function main() {
  const batchData = BATCHES.map(b => readJson(path.join(ROOT, 'data', `${b}.json`)));
  const index = new Map();
  batchData.forEach((arr, bi) => arr.forEach((s, si) => index.set(s.id, { bi, si })));

  // 整校记录：region-*.json（分区域调研）+ sparse-fix.json（补稀疏院校）
  const files = fs.readdirSync(RESEARCH).filter(f => /^(region-.*|sparse-fix)\.json$/.test(f)).sort();
  if (!files.length) { console.error('没有找到 .research/region-*.json 或 sparse-fix.json'); process.exit(1); }

  let updated = 0, added = 0;
  for (const f of files) {
    for (const rec of readJson(path.join(RESEARCH, f))) {
      // 不做全局去重：后面的文件（如 sparse-fix.json）本来就是用来**更新**前面已收录的院校的。
      // 重复 id 会走 index 命中 → 合并分支，不会重复添加。
      const hit = index.get(rec.id);
      if (hit) {
        const bi = hit.bi, si = hit.si;
        const s = mergeSchool(batchData[bi][si], rec);
        // 确认不招金融硕士：用调研结论直接替换旧的备注（旧备注此时是错的）
        if (rec.noFinance) { s.note = rec.note; s.noFinance = true; }
        batchData[bi][si] = s;
        updated++;
      } else {
        const b = PROV_BATCH[rec.prov];
        if (!b) { console.warn('未知省份，跳过:', rec.id, rec.prov); continue; }
        const s = {
          id: rec.id, name: rec.name, prov: rec.prov, city: rec.city,
          tags: ALL_TAGS.filter(t => (rec.tags || []).includes(t)),
          y: rec.y || '2026'
        };
        for (const k of ['z', 'x']) if (rec[k] && Object.keys(rec[k]).length) s[k] = mergeProgram({}, rec[k]);
        if (rec.note) s.note = rec.note;
        if (Array.isArray(rec.sources) && rec.sources.length) s.sources = rec.sources;
        batchData[b - 1].push(s);
        index.set(s.id, { bi: b - 1, si: batchData[b - 1].length - 1 });
        added++;
      }
    }
  }

  console.log(`调研文件 ${files.length} 个：更新 ${updated} 所，新增 ${added} 所，合计 ${batchData.reduce((n, a) => n + a.length, 0)} 所`);

  // 字段补丁（只含 id + 部分字段，例如参考书目 / 就业口碑）
  for (const name of ['bk-emp.json', 'bk-emp-2.json']) {
    const patchFile = path.join(RESEARCH, name);
    if (!fs.existsSync(patchFile)) continue;
    let patched = 0;
    for (const rec of readJson(patchFile)) {
      const hit = index.get(rec.id);
      if (!hit) { console.warn(name + ' 补丁找不到院校:', rec.id); continue; }
      const s = batchData[hit.bi][hit.si];
      for (const k of ['z', 'x']) {
        if (!rec[k]) continue;
        s[k] = mergeProgram(s[k], rec[k]);
      }
      if (Array.isArray(rec.sources) && rec.sources.length) {
        s.sources = [...new Set([...(s.sources || []), ...rec.sources])];
      }
      patched++;
    }
    console.log(`${name} 补丁：${patched} 所`);
  }

  // 人工校正（tools/data-corrections.json）
  // 合并的 tags 是取并集、只加不减，所以"调研标错了标签"这类错误无法靠重新合并消除，
  // 必须在这里显式声明，保证每次重跑结果都一致。
  const corrFile = path.join(__dirname, 'data-corrections.json');
  if (fs.existsSync(corrFile)) {
    const corr = readJson(corrFile);
    let removed = 0, retagged = 0;

    if (Array.isArray(corr.deleteSchools) && corr.deleteSchools.length) {
      for (let bi = 0; bi < batchData.length; bi++) {
        const before = batchData[bi].length;
        batchData[bi] = batchData[bi].filter(s => !corr.deleteSchools.includes(s.id));
        removed += before - batchData[bi].length;
      }
      index.clear();
      batchData.forEach((arr, bi) => arr.forEach((s, si) => index.set(s.id, { bi, si })));
    }

    for (const [id, tags] of Object.entries(corr.removeTags || {})) {
      const hit = index.get(id);
      if (!hit) { console.warn('校正表找不到院校:', id); continue; }
      const s = batchData[hit.bi][hit.si];
      s.tags = (s.tags || []).filter(t => !tags.includes(t));
      retagged++;
    }

    for (const [id, text] of Object.entries(corr.appendNote || {})) {
      const hit = index.get(id);
      if (!hit) continue;
      const s = batchData[hit.bi][hit.si];
      if (!(s.note || '').includes(text)) s.note = [s.note, text].filter(Boolean).join('；');
    }

    console.log(`人工校正：删除 ${removed} 条重复记录、修正 ${retagged} 所标签`);
  }

  if (DRY) { console.log('--dry 模式，未写入'); return; }
  batchData.forEach((arr, i) => {
    const p = path.join(ROOT, 'data', `${BATCHES[i]}.json`);
    fs.writeFileSync(p, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
    console.log(`写入 ${BATCHES[i]}.json：${arr.length} 所`);
  });
}

main();
