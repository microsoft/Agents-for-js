import esbuild from 'esbuild'

buildAll()

async function buildAll() {
	return Promise.all([
		build('browser', {
			entryPoints: ['src/index.ts'],
			platform: 'browser',
			target: ['es6'],
            bundle: true,
            minify: false,
            sourcemap: true,
		}),
		// build('esm', {
		// 	entryPoints: ['src/index.ts'],
		// 	platform: 'neutral'
		// }),
		// build('cjs', {
		// 	entryPoints: ['src/index.ts'],
		// 	target: ['node18'],
		// 	platform: 'node',
		// }),
	])
}

async function build(name, options) {
	const path = `${name}.js`
	console.log(`Building ${name}`)

	if (process.argv.includes('--watch')) {
		let ctx = await esbuild.context({
			outfile: `./dist/${path}`,
			bundle: true,
			logLevel: 'info',
			sourcemap: true,
			...options,
            minify: false
		})
		await ctx.watch()
	}
	else {
		return esbuild.build({
			outfile: `./dist/${path}`,
			bundle: true,
			...options,
		})
	}
}