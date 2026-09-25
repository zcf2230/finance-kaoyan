/**
 * 登录鉴权中间件（Cloudflare Pages Functions）
 *
 * 作用：所有请求先过这里。带有效会话 Cookie 才放行，否则跳登录页。
 *
 * 为什么不用前端 JS 校验密码：那是假安全——任何人按 F12 就能在源码里看到密码。
 * 这里密码存在 Cloudflare 的服务端环境变量里（USER / PASS / SESSION_SECRET），
 * 浏览器拿不到，只有服务端能比对。
 *
 * 会话令牌 = HMAC-SHA256(SESSION_SECRET, 固定串)，前端无法伪造（不知道密钥）。
 * 缺点：令牌是固定的，30 天内一直有效；改 SESSION_SECRET 可让所有会话立即失效。
 */

const COOKIE = 'kb_session';
const MSG = 'kaoyan-session-v1';

/** 生成会话令牌（与 api/login.js 保持一致） */
export async function sessionToken(secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(MSG));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readCookie(req, name) {
  const raw = req.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

// 这些路径不需要登录
// ⚠️ 必须同时放行 /login 和 /login.html：
// Cloudflare Pages 有 clean URLs 特性，会把 /login.html 308 重定向到 /login。
// 如果只放行 /login.html，就会形成死循环：
//   / → 302 /login.html → 308 /login → 中间件不放行 /login → 302 /login.html → …
// 浏览器报 ERR_TOO_MANY_REDIRECTS。（curl 默认不跟随跳转，所以测不出来，必须用 -L 测）
const PUBLIC = new Set(['/login', '/login.html', '/api/login', '/robots.txt', '/favicon.ico']);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC.has(path)) return next();

  const secret = env.SESSION_SECRET;
  if (!secret) {
    return new Response('服务端未配置 SESSION_SECRET，无法鉴权', {
      status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  if (readCookie(request, COOKIE) === await sessionToken(secret)) return next();

  // 未登录：接口返回 401，页面跳登录
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: '未登录或会话已失效' }), {
      status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  // 跳到 /login（不带 .html）——用 Pages 的 canonical 地址，避免多一次 308 跳转
  return Response.redirect(url.origin + '/login', 302);
}
