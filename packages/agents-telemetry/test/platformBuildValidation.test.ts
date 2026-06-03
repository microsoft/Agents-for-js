import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { resolve } from 'node:path'
import { before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import * as esbuild from 'esbuild'

const execFileAsync = promisify(execFile)

const testDir = __dirname
const packageDir = resolve(testDir, '..')
const repoDir = resolve(packageDir, '..', '..')
const packageName = '@microsoft/agents-telemetry'
const tscPath = resolve(repoDir, 'node_modules', 'typescript', 'bin', 'tsc')
const esmBuildScriptPath = resolve(packageDir, 'scripts', 'esm.mjs')

async function assertFileExists (filePath: string): Promise<void> {
  await access(filePath, fsConstants.F_OK)
}

async function runNode (args: string[]) {
  return await execFileAsync(process.execPath, args, {
    cwd: repoDir,
    env: process.env,
  })
}

async function runCommand (command: string, args: string[], cwd = repoDir) {
  return await execFileAsync(command, args, {
    cwd,
    env: process.env,
  })
}

describe('agents-telemetry platform build validation', () => {
  before(async () => {
    await runCommand(process.execPath, [tscPath, '--project', 'packages/agents-telemetry/tsconfig.json'])
    await runCommand(process.execPath, [tscPath, '--project', 'packages/agents-telemetry/tsconfig.esm.json'])
    await runCommand(process.execPath, [esmBuildScriptPath], packageDir)
  })

  it('should expose package entry points that map to built artifacts', async () => {
    const packageJsonPath = resolve(packageDir, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      main: string
      module: string
      browser: string
      types: string
      exports: {
        '.': {
          import: { types: string, browser: string, default: string }
          require: { types: string, default: string }
          default: string
        }
      }
    }

    const expectedArtifacts = [
      packageJson.main,
      packageJson.module,
      packageJson.browser,
      packageJson.types,
      packageJson.exports['.'].import.types,
      packageJson.exports['.'].import.browser,
      packageJson.exports['.'].import.default,
      packageJson.exports['.'].require.types,
      packageJson.exports['.'].require.default,
      'dist/esm/package.json',
    ]

    for (const artifactPath of expectedArtifacts) {
      await assertFileExists(resolve(packageDir, artifactPath))
    }

    const esmPackageJson = JSON.parse(
      await readFile(resolve(packageDir, 'dist/esm/package.json'), 'utf8')
    ) as { type?: string }

    assert.strictEqual(esmPackageJson.type, 'module')
  })

  it('should resolve with Node CommonJS require', async () => {
    const { stdout } = await runNode(['-p', `typeof require('${packageName}').trace`])

    assert.strictEqual(stdout.trim(), 'function')
  })

  it('should resolve with Node ESM import', async () => {
    const { stdout } = await runNode([
      '--input-type=module',
      '-e',
      `const mod = await import('${packageName}'); console.log(typeof mod.trace)`
    ])

    assert.strictEqual(stdout.trim(), 'function')
  })

  it('should resolve the browser condition with Node import', async () => {
    const { stdout } = await runNode([
      '--conditions=browser',
      '--input-type=module',
      '-e',
      `const mod = await import('${packageName}'); console.log(typeof mod.trace)`
    ])

    assert.strictEqual(stdout.trim(), 'function')
  })

  it('should bundle for the browser with esbuild', async () => {
    const result = await esbuild.build({
      stdin: {
        contents: `import * as telemetry from '${packageName}';\nexport default typeof telemetry.trace`,
        resolveDir: repoDir,
        sourcefile: 'agents-telemetry-browser-entry.js',
        loader: 'js',
      },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
    })

    assert.ok(result.outputFiles.length > 0)
  })
})
