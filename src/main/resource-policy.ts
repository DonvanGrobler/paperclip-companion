/** The shell serves bundled HTML/JS/CSS only. Never map arbitrary URLs to disk. */
export function resolveResource(
  value: string,
  method: string,
): { path: string; mime: string } | null {
  if (method !== 'GET') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'paperclip:' ||
    url.host !== 'app' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return null;
  if (url.pathname === '/index.html' || url.pathname === '/chat.html')
    return { path: 'index.html', mime: 'text/html' };
  if (!/^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(url.pathname)) return null;
  return {
    path: url.pathname.slice(1),
    mime: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
  };
}

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
