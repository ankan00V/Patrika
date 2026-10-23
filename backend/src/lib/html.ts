import sanitizeHtml from 'sanitize-html';

/** What the compose editor can produce; everything else (scripts, iframes, handlers) is dropped. */
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3', 'font', 'pre', 'code', 'hr',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'], font: ['size'], '*': ['style'] },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      'font-weight': [/^(bold|normal|\d{3})$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^[a-z\s-]+$/],
      margin: [/^[\d\s.pxem-]+$/],
      'margin-left': [/^\d+(px|em)$/],
      padding: [/^[\d\s.pxem-]+$/],
      border: [/^none$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|blockquote|h[1-3]|pre)\b[^>]*>/gi, (tag) => (tag.startsWith('<li') ? '\n' + tag : '\n'))
    .replace(/<li\b[^>]*>/gi, '• ');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Accepts editor HTML or plain text (e.g. from Postman) and returns a safe HTML body plus its
 * plain-text version for the text/plain part, previews and search.
 */
export function normalizeBody(input: string): { html: string; text: string } {
  const looksLikeHtml = /<\/?(p|br|div|span|b|strong|i|em|u|s|ul|ol|li|blockquote|a|h[1-3]|font|pre|code|hr)\b[^>]*>/i.test(input);
  const html = sanitizeHtml(looksLikeHtml ? input : escapeHtml(input).replace(/\r?\n/g, '<br>'), options);
  return { html, text: htmlToText(html) };
}
