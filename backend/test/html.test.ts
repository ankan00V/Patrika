import { describe, expect, it } from 'vitest';
import { normalizeBody } from '../src/lib/html.js';

describe('normalizeBody', () => {
  it('keeps editor formatting and strips anything executable', () => {
    const { html, text } = normalizeBody(
      '<p style="text-align:center" onclick="x()">Hi <b>Ana</b></p><img src=x onerror=alert(1)><ul><li>One</li></ul>',
    );
    expect(html).toBe('<p style="text-align:center">Hi <b>Ana</b></p><ul><li>One</li></ul>');
    expect(text).toBe('Hi Ana\n\n• One');
  });

  it('turns plain text into HTML line breaks', () => {
    expect(normalizeBody('Hello,\n<world> & you')).toEqual({
      html: 'Hello,<br />&lt;world&gt; &amp; you',
      text: 'Hello,\n<world> & you',
    });
  });
});
