// Load the bundled font for Text nodes in Node (vitest and scripts).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setFontData } from '../src/core/text';

const require = createRequire(import.meta.url);
const buf = readFileSync(require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff'));
setFontData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
