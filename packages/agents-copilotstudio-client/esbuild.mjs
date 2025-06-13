/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import esbuild from 'esbuild'

buildAll().catch(err => {
  console.error(err)
  process.exit(1)
})

async function buildAll () {
  return Promise.all([
    build('browser', {
      entryPoints: ['src/index.ts'],
      platform: 'browser',
      target: ['es6'],
      bundle: true,
      minify: true,
      sourcemap: true,
    }),
  ])
}

async function build (name, options) {
  const path = `${name}.js`
  console.log(`Building '${name}'`)

  if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context({
      outfile: `./dist/src/${path}`,
      bundle: true,
      logLevel: 'info',
      sourcemap: true,
      ...options,
      minify: false,
    })
    await ctx.watch()
  } else {
    return esbuild.build({
      outfile: `./dist/src/${path}`,
      bundle: true,
      ...options,
    })
  }
}
