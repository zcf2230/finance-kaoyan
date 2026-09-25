/**
 * 退出登录 POST /api/logout
 * 清掉会话 Cookie 并跳回登录页。
 */
export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': url.origin + '/login.html',
      'Set-Cookie': 'kb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    }
  });
}

// 用 GET 直接访问也能退出（方便做个链接）
export async function onRequestGet({ request }) {
  return onRequestPost({ request });
}
