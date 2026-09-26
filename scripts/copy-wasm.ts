// postinstall: jeep-sqlite loads sql.js wasm from ./assets at runtime (no network)
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public/assets', { recursive: true });
await copyFile('node_modules/sql.js/dist/sql-wasm.wasm', 'public/assets/sql-wasm.wasm');
