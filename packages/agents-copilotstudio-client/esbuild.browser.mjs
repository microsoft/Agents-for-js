/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import esbuild from 'esbuild'

console.log(`Building for browser with esbuild v${esbuild.version}...`)
Promise.all([
  build({
    platform: 'browser',
    target: ['es6'],
    format: 'iife',
    globalName: 'CopilotStudioClient',
    sourcemap: true,
  }),
  build({
    platform: 'browser',
    target: ['esnext'],
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    sourcemap: true,
  }),
]).catch((err) => {
  console.error(err)
  process.exit(1)
})

async function build (options) {
  const outfile = `./dist/src/browser${
    options.outExtension ? options.outExtension['.js'] : '.js'
  }`
  console.log(
    `  - format: '${options.format || 'iife'}', target: '${
      options.target
    }', outfile: '${outfile}'`
  )

  const baseOptions = {
    entryPoints: ['src/index.ts'],
    outfile,
    bundle: true,
    ...options,
  }

  if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context({
      logLevel: 'info',
      sourcemap: true,
      ...baseOptions,
      minify: false,
    })
    await ctx.watch()
  } else {
    return esbuild.build({ ...baseOptions, minify: true })
  }
}
