import { describe, expect, it } from 'vitest';
import {
  resolveResource,
  CONTENT_SECURITY_POLICY,
} from '../../src/main/resource-policy';

describe('bundled resource boundary', () => {
  it.each([
    ['paperclip://app/index.html', 'index.html', 'text/html'],
    ['paperclip://app/chat.html', 'index.html', 'text/html'],
    [
      'paperclip://app/assets/index-Ab_19.js',
      'assets/index-Ab_19.js',
      'text/javascript',
    ],
    [
      'paperclip://app/assets/index-Ab_19.css',
      'assets/index-Ab_19.css',
      'text/css',
    ],
  ])('serves only known file shapes: %s', (url, path, mime) => {
    expect(resolveResource(url, 'GET')).toEqual({ path, mime });
  });

  it.each([
    'not a URL',
    'https://app/index.html',
    'file:///etc/passwd',
    'paperclip://evil/index.html',
    'paperclip://app.evil/index.html',
    'paperclip://user:password@app/index.html',
    'paperclip://app:123/index.html',
    'paperclip://app/index.html?token=secret',
    'paperclip://app/index.html#fragment',
    'paperclip://app/chat.html?external=true',
    'paperclip://app/chat.html#fragment',
    'paperclip://app/../../package.json',
    'paperclip://app/assets/../../package.json',
    'paperclip://app/assets/%2e%2e/%2e%2e/package.json',
    'paperclip://app/assets/%2fetc%2fpasswd.js',
    'paperclip://app/assets/..%5csecret.js',
    'paperclip://app/assets/nested/secret.js',
    'paperclip://app/assets/index.js.map',
    'paperclip://app/package.json',
    'paperclip://app/',
    'paperclip://app/assets/secret.html',
  ])('rejects untrusted or non-bundle targets: %s', (url) => {
    expect(resolveResource(url, 'GET')).toBeNull();
  });

  it.each(['POST', 'PUT', 'DELETE', 'HEAD'])('rejects method %s', (method) => {
    expect(resolveResource('paperclip://app/index.html', method)).toBeNull();
  });

  it('does not permit remote connections, inline script, frames, or form submission', () => {
    for (const rule of [
      "default-src 'none'",
      "connect-src 'none'",
      "script-src 'self'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
    ]) {
      expect(CONTENT_SECURITY_POLICY).toContain(rule);
    }
    expect(CONTENT_SECURITY_POLICY).not.toMatch(
      /unsafe-inline|unsafe-eval|https?:/,
    );
  });
});
