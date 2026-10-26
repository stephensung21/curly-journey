import { describe, expect, it } from 'vitest';
import { utf16Text } from '../src/import/decode';

const le = (s: string, bom = true) => {
  const out = bom ? [0xff, 0xfe] : [];
  for (const ch of s) out.push(ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8);
  return new Uint8Array(out);
};

describe('utf16Text', () => {
  it('decodes UTF-16 little-endian with a byte-order mark (Excel "Unicode text")', () => {
    expect(utf16Text(le('Date,Details\r\n'))).toBe('Date,Details\r\n');
  });

  it('decodes UTF-16 little-endian without a mark, spotted by its zero bytes', () => {
    expect(utf16Text(le('Date,Reference', false))).toBe('Date,Reference');
  });

  it('decodes UTF-16 big-endian with a mark', () => {
    expect(utf16Text(new Uint8Array([0xfe, 0xff, 0x00, 0x44, 0x00, 0x61]))).toBe('Da');
  });

  it('returns null for UTF-8 or plain ASCII, so the caller reads it as text', () => {
    expect(utf16Text(new TextEncoder().encode('Date,Details\n'))).toBeNull();
    expect(utf16Text(new Uint8Array([0xef, 0xbb, 0xbf, 0x44]))).toBeNull();
    expect(utf16Text(new Uint8Array([]))).toBeNull();
  });
});
