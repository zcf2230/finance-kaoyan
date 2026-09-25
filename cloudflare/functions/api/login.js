/**
 * 登录接口 POST /api/login
 *
 * 比对服务端环境变量里的账号密码（USER / PASS），通过则下发签名会话 Cookie。
 * 账号密码不写在代码里，也不下发到前端。
 */

const COOKIE = 'kb_session';
const MSG = 'kaoyan-session-v1';
const MAX_AGE = 60 * 60 * 24 * 30;   // 30 天

async function sessionToken(secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(MSG));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 定长比较，避免用 === 时的时序侧信道 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
});

export async function onRequestPost({ request, env }) {
  const { USER, PASS, SESSION_SECRET } = env;
  if (!USER || !PASS || !SESSION_SECRET) {
    return json({ error: '服务端尚未配置账号密码（USER / PASS / SESSION_SECRET）' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const u = String(body && body.username || '');
  const p = String(body && body.password || '');

  if (!safeEqual(u, USER) || !safeEqual(p, PASS)) {
    return json({ error: '账户名或密码不正确' }, 401);
  }

  const token = await sessionToken(SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
    }
  });
}

// 非 POST 一律 405
export async function onRequest({ request }) {
  return json({ error: '请用 POST 提交登录' }, 405);
}
