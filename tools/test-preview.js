#!/usr/bin/env node
/**
 * v2 预览页冒烟测试（jsdom）
 *   node tools/test-preview.js
 *
 * 只验「页面能不能正常渲染 + 关键交互是否接上」，不做像素级断言。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'preview', '金融考研择校通-v2预览.html');
const html = fs.readFileSync(file, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;
const doc = window.document;

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
};

setTimeout(() => {
  console.log('v2 预览冒烟测试');
  ok('脚本执行完成', window.__v2ready === true);
  ok('数据加载（>200 所）', window.__DATA__.schools.length >= 200);
  ok('院校卡已渲染', doc.querySelectorAll('#results .card').length > 0);
  ok('按省份分组出现', doc.querySelectorAll('#results .prov-head').length > 10);
  ok('左侧导航 6 项', doc.querySelectorAll('.nav-item').length === 6);
  ok('筛选 chips 已渲染', doc.querySelectorAll('#filterbar .fchip').length === 5);
  ok('国家线图表已绘制', doc.querySelectorAll('#lineChart svg path').length >= 2);

  // 分数匹配
  const score = doc.querySelector('#score');
  score.value = '370';
  score.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('填分数后出现分差条', doc.querySelectorAll('#results .matchrow').length > 0);
  ok('分差文案含“分”', /分/.test((doc.querySelector('#results .difftext') || {}).textContent || ''));

  // 收藏
  const star = doc.querySelector('#results [data-fav]');
  star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('收藏后导航出现角标', doc.querySelector('.nav-item[data-view="fav"] .badge') !== null);

  // 详情弹窗
  doc.querySelector('#results [data-detail]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('详情弹窗打开', doc.querySelector('#mask').classList.contains('on'));
  ok('详情含来源或备注', /复试线|待核实/.test(doc.querySelector('#modal').textContent));

  // 视图切换
  doc.querySelector('.nav-item[data-view="compare"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('对比页空态提示', /还没有选择院校/.test(doc.querySelector('#cmpBody').textContent));
  doc.querySelector('.nav-item[data-view="timeline"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('时间线 8 个节点', doc.querySelectorAll('#timeline .tl-item').length === 8);
  doc.querySelector('.nav-item[data-view="data"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('数据质量面板有 10 个字段', doc.querySelectorAll('#quality > div > div').length === 10);
  doc.querySelector('.nav-item[data-view="national"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('国家线明细 5 年', doc.querySelectorAll('#nationalTable tbody tr').length === 5);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}, 400);
