import { utf16Text } from '@curly/core';
import { File } from 'expo-file-system';

/** A picked file's text: UTF-16 (Excel's "Unicode text") is decoded here, anything else is read as UTF-8. */
export async function readTextFile(uri: string): Promise<string> {
  const file = new File(uri);
  return utf16Text(await file.bytes()) ?? (await file.text());
}
