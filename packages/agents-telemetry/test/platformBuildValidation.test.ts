import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import * as esbuild from 'esbuild'

const execFileAsync = promisify(execFile)

const testDir = __dirname
const packageDir = resolve(testDir, '..')
const repoDir = resolve(packageDir, '..', '..')
const packageName = '@microsoft/agents-telemetry'
const require = createRequire(import.meta.url)
const nativePackageJsonPath = require.resolve('@typescript/native/package.json')
const nativePackageJson = require(nativePackageJsonPath) as { bin: { tsc: string } }
const tscPath = resolve(dirname(nativePackageJsonPath), nativePackageJson.bin.tsc)
const esmBuildScriptPath = resolve(packageDir, 'scripts', 'esm.mjs')

interface AgentsTelemetryPackageJson {
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

async function assertFileExists (filePath: string): Promise<void> {
  await access(filePath, fsConstants.F_OK)
}

async function readPackageJson (): Promise<AgentsTelemetryPackageJson> {
  const packageJsonPath = resolve(packageDir, 'package.json')

  return JSON.parse(await readFile(packageJsonPath, 'utf8')) as AgentsTelemetryPackageJson
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

function normalizeDeclarationSignature (contents: string): string {
  return contents.replace(/\r\n/g, '\n').trimEnd()
}

describe('agents-telemetry platform build validation', () => {
  before(async () => {
    await runCommand(process.execPath, [tscPath, '--project', 'packages/agents-telemetry/tsconfig.json'])
    await runCommand(process.execPath, [tscPath, '--project', 'packages/agents-telemetry/tsconfig.esm.json'])
    await runCommand(process.execPath, [esmBuildScriptPath], packageDir)
  })

  it('should expose package entry points that map to built artifacts', async () => {
    const packageJson = await readPackageJson()

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

  it('should expose the same runtime exports from CommonJS and ESM entry points', async () => {
    const expectedExports = [
      'MetricNames',
      'SpanNames',
      'debug',
      'metric',
      'pseudonymizeConversationId',
      'redactDiagnosticObject',
      'redactScopes',
      'redactString',
      'redactUrl',
      'trace',
    ]
    const cjsExports = await runNode([
      '-p',
      `JSON.stringify(Object.keys(require('${packageName}')).sort())`
    ])
    const esmExports = await runNode([
      '--input-type=module',
      '-e',
      `const mod = await import('${packageName}'); console.log(JSON.stringify(Object.keys(mod).sort()))`
    ])

    assert.deepStrictEqual(JSON.parse(cjsExports.stdout), JSON.parse(esmExports.stdout))
    assert.deepStrictEqual(JSON.parse(cjsExports.stdout), expectedExports)
  })

  it('should expose the same declaration signature from CommonJS and ESM entry points', async () => {
    const packageJson = await readPackageJson()
    const cjsDeclaration = normalizeDeclarationSignature(
      await readFile(resolve(packageDir, packageJson.exports['.'].require.types), 'utf8')
    )
    const esmDeclaration = normalizeDeclarationSignature(
      await readFile(resolve(packageDir, packageJson.exports['.'].import.types), 'utf8')
    )

    assert.strictEqual(cjsDeclaration, esmDeclaration)
  })

  it('should retain the bundled hashing dependency license', async () => {
    const license = await readFile(resolve(dirname(require.resolve('@noble/hashes/hmac.js')), 'LICENSE'), 'utf8')
    const bundledRedaction = await readFile(resolve(packageDir, 'dist/cjs/src/utils/redact.js'), 'utf8')

    assert.ok(bundledRedaction.includes(license))
  })

  it('should resolve with Node CommonJS require', async () => {
    const { stdout } = await runNode(['-p', `typeof require('${packageName}').trace`])

    assert.strictEqual(stdout.trim(), 'function')
  })

  it('should pseudonymize from CommonJS without require(esm)', async () => {
    const { stdout } = await runNode([
      '--no-experimental-require-module',
      '-e',
      `const assert = require('node:assert/strict');
       const { createHmac } = require('node:crypto');
       const { pseudonymizeConversationId } = require('${packageName}');
       const expected = 'cid_' + createHmac('sha256', 'diagnostics-key').update('conversation-id').digest('hex').slice(0, 32);
       assert.equal(pseudonymizeConversationId('conversation-id', 'diagnostics-key'), expected);
       console.log('ok')`
    ])

    assert.strictEqual(stdout.trim(), 'ok')
  })

  it('should resolve with Node ESM import', async () => {
    const { stdout } = await runNode([
      '--input-type=module',
      '-e',
      `const mod = await import('${packageName}'); console.log(typeof mod.trace)`
    ])

    assert.strictEqual(stdout.trim(), 'function')
  })

  it('should produce identical pseudonyms from CommonJS and ESM entry points', async () => {
    const { stdout } = await runNode([
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
       import { createRequire } from 'node:module';
       const require = createRequire(import.meta.url);
       const cjs = require('${packageName}');
       const esm = await import('${packageName}');
       assert.equal(
         cjs.pseudonymizeConversationId('conversation-id', 'diagnostics-key'),
         esm.pseudonymizeConversationId('conversation-id', 'diagnostics-key')
       );
       console.log('ok')`
    ])

    assert.strictEqual(stdout.trim(), 'ok')
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

  it('should bundle and pseudonymize for the browser with esbuild', async () => {
    const result = await esbuild.build({
      stdin: {
        contents: `import * as telemetry from '${packageName}';
                   export const traceType = typeof telemetry.trace;
                   export const pseudonym = telemetry.pseudonymizeConversationId('conversation-id', 'diagnostics-key')`,
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

    const browserModule = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
    const { createHmac } = await import('node:crypto')
    const expected = `cid_${createHmac('sha256', 'diagnostics-key').update('conversation-id').digest('hex').slice(0, 32)}`

    assert.strictEqual(browserModule.traceType, 'function')
    assert.strictEqual(browserModule.pseudonym, expected)
  })
})
