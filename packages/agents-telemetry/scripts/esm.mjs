/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { build } from 'esbuild'

await writeFile(resolve(process.cwd(), 'dist/esm/package.json'), '{\n  "type": "module"\n}\n', { encoding: 'utf-8' })

// Inline the ESM-only hashing dependency so CommonJS also works without require(esm).
const hashesLicense = await readFile(new URL('LICENSE', import.meta.resolve('@noble/hashes/hmac.js')), 'utf8')
await build({
  entryPoints: [resolve(process.cwd(), 'src/utils/redact.ts')],
  outfile: resolve(process.cwd(), 'dist/cjs/src/utils/redact.js'),
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  target: 'es2019',
  sourcemap: true,
  banner: { js: `/*! @noble/hashes\n${hashesLicense}\n*/` },
})
