/**
 * 登录鉴权单元测试
 *
 * 用法：node tools/test-auth.js
 *
 * 直接调用 Cloudflare Pages Functions 的导出函数，用 Node 原生的 Request/Response/crypto
 * 模拟请求——比 `wrangler pages dev` 快且稳定（本地起 wrangler 会 502，日志还看不到）。
 *
 * 覆盖：未登录被拦 / 登录页放行 / 密码错拒绝 / 密码对下发 Cookie / 带 Cookie 放行 / 退出清 Cookie。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ENV = { USER: 'ZCF', PASS: 'test-only-pass', SESSION_SECRET: 'test-secret-do-not-use-in-prod' };
const ORIGIN = 'https://example.com';

const results = [];
const check = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);

const req = (pathname, opts = {}) => new Request(ORIGIN + pathname, opts);

(async () => {
  const mw = await import('file:///' + path.join(ROOT, 'cloudflare/functions/_middleware.js').replace(/\\/g, '/'));
  const login = await import('file:///' + path.join(ROOT, 'cloudflare/functions/api/login.js').replace(/\\/g, '/'));
  const logout = await import('file:///' + path.join(ROOT, 'cloudflare/functions/api/logout.js').replace(/\\/g, '/'));

  const ctx = (request, env = ENV) => ({
    request, env,
    next: async () => new Response('APP_CONTENT', { status: 200 })
  });

  // ---- 1. 未登录访问应用 → 跳登录页 ----
  let r = await mw.onRequest(ctx(req('/')));
  check('未登录访问 / → 302 跳登录页', r.status === 302 && r.headers.get('Location') === ORIGIN + '/login');

  r = await mw.onRequest(ctx(req('/index.html')));
  check('未登录访问 /index.html → 302', r.status === 302);

  // ---- 2. 公开路径放行 ----
  // ⚠️ 必须同时放行 /login 和 /login.html：Cloudflare Pages 的 clean URLs 会把
  //    /login.html 308 重定向到 /login。只放行一个就会死循环（浏览器 ERR_TOO_MANY_REDIRECTS）。
  r = await mw.onRequest(ctx(req('/login')));
  check('登录页 /login 放行（Pages canonical 地址）', r.status === 200 && (await r.text()) === 'APP_CONTENT');

  r = await mw.onRequest(ctx(req('/login.html')));
  check('登录页 /login.html 也放行', r.status === 200 && (await r.text()) === 'APP_CONTENT');

  r = await mw.onRequest(ctx(req('/robots.txt')));
  check('robots.txt 放行', r.status === 200);

  // ---- 2b. 模拟「未登录 → 跳转 → 落到登录页」的完整链路，确认不会来回跳 ----
  {
    const first = await mw.onRequest(ctx(req('/')));
    const target = new URL(first.headers.get('Location')).pathname;   // 中间件跳去哪
    const second = await mw.onRequest(ctx(req(target)));              // 落到那个地址会怎样
    check('跳转链路不循环：落到 ' + target + ' 后直接放行', second.status === 200);
  }

  // ---- 3. 未登录访问接口 → 401 JSON ----
  r = await mw.onRequest(ctx(req('/api/logout')));
  check('未登录访问 /api/* → 401 JSON', r.status === 401 && (await r.json()).error.includes('未登录'));

  // ---- 4. 密码错误 → 401 ----
  const post = body => req('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  r = await login.onRequestPost(ctx(post({ username: 'ZCF', password: 'wrong' })));
  check('密码错误 → 401', r.status === 401);
  check('密码错误不返回 Cookie', !r.headers.get('Set-Cookie'));

  r = await login.onRequestPost(ctx(post({ username: 'wrong', password: 'test-only-pass' })));
  check('账户名错误 → 401', r.status === 401);

  r = await login.onRequestPost(ctx(post({})));
  check('空账号密码 → 401', r.status === 401);

  // ---- 5. 密码正确 → 下发 HttpOnly Secure Cookie ----
  r = await login.onRequestPost(ctx(post({ username: 'ZCF', password: 'test-only-pass' })));
  const setCookie = r.headers.get('Set-Cookie') || '';
  check('密码正确 → 200', r.status === 200);
  check('下发 kb_session Cookie', /kb_session=/.test(setCookie));
  check('Cookie 带 HttpOnly（JS 读不到）', /HttpOnly/i.test(setCookie));
  check('Cookie 带 Secure', /Secure/i.test(setCookie));
  check('Cookie 带 SameSite', /SameSite=Lax/i.test(setCookie));

  // ---- 6. 带上正确的 Cookie → 放行 ----
  const cookie = setCookie.split(';')[0];
  r = await mw.onRequest(ctx(req('/', { headers: { Cookie: cookie } })));
  check('带正确 Cookie → 放行到应用', r.status === 200 && (await r.text()) === 'APP_CONTENT');

  // ---- 7. 伪造的 Cookie → 仍被拦 ----
  r = await mw.onRequest(ctx(req('/', { headers: { Cookie: 'kb_session=fake-token' } })));
  check('伪造 Cookie → 仍跳登录页', r.status === 302);

  // ---- 8. 换密钥后旧 Cookie 失效 ----
  r = await mw.onRequest(ctx(req('/', { headers: { Cookie: cookie } }),
    { ...ENV, SESSION_SECRET: 'a-different-secret' }));
  check('换 SESSION_SECRET 后旧 Cookie 失效', r.status === 302);

  // ---- 9. 未配置密钥时明确报错（而不是放行）----
  r = await mw.onRequest(ctx(req('/'), { USER: 'ZCF', PASS: 'test-only-pass' }));
  check('缺 SESSION_SECRET → 500 且不放行', r.status === 500);

  r = await login.onRequestPost(ctx(post({ username: 'ZCF', password: 'test-only-pass' }), { USER: 'ZCF' }));
  check('缺 PASS → 500', r.status === 500);

  // ---- 10. 退出登录 ----
  r = await logout.onRequestPost(ctx(req('/api/logout', { method: 'POST' })));
  check('退出 → 302 回登录页', r.status === 302 && r.headers.get('Location') === ORIGIN + '/login');
  check('退出清除 Cookie（Max-Age=0）', /Max-Age=0/.test(r.headers.get('Set-Cookie') || ''));

  // ---- 11. 登录接口不接受 GET ----
  r = await login.onRequest(ctx(req('/api/login')));
  check('GET /api/login → 405', r.status === 405);

  // ---- 12. 源码里不能出现明文密码 ----
  const fs = require('fs');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const leaked = walk(path.join(ROOT, 'dist-web'))
    .filter(f => /\.(js|html)$/.test(f))
    .filter(f => fs.readFileSync(f, 'utf-8').includes('test-only-pass'));
  check('打包产物里没有明文密码', leaked.length === 0);

  const fails = results.filter(x => x[0] === 'FAIL');
  for (const [s, n] of results) console.log(s, '-', n);
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过 ✔');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });
