/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from 'fs/promises'
import { resolve } from 'path'

await writeFile(resolve(process.cwd(), 'dist/esm/package.json'), '{\n  "type": "module"\n}\n', { encoding: 'utf-8' })
