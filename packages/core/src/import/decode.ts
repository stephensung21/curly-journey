/**
 * The text of a UTF-16 file (as Excel's "Unicode text" and some exports save CSVs), or null when the bytes are not
 * UTF-16, so the caller reads them as ordinary UTF-8. Spotted by a byte-order mark, or by the zero bytes every
 * ASCII character gets in UTF-16.
 */
export function utf16Text(bytes: Uint8Array): string | null {
  let little: boolean;
  let start = 0;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    little = true;
    start = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    little = false;
    start = 2;
  } else if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0 && bytes[0] !== 0) {
    little = true;
  } else if (bytes.length >= 4 && bytes[0] === 0 && bytes[2] === 0 && bytes[1] !== 0) {
    little = false;
  } else {
    return null;
  }
  let out = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(little ? bytes[i]! | (bytes[i + 1]! << 8) : (bytes[i]! << 8) | bytes[i + 1]!);
  }
  return out;
}
