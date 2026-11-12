import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = 'schema/agents-configuration.schema.json'
const commitPattern = /^[a-f0-9]{40}$/i
const maximumBytes = 1024 * 1024
const executeFile = promisify(execFile)
const documents = [
  { id: 'empty-agent', file: path.join('test-agents', 'empty-agent', 'config.json.TEMPLATE') },
  {
    id: 'fastify-empty-agent',
    file: path.join('test-agents', 'fastify-empty-agent', 'config.json.TEMPLATE')
  }
]

class ContractFailure extends Error {
  constructor (code) {
    super(code)
    this.code = code
  }
}

function fail (code) {
  throw new ContractFailure(code)
}

function digest (text) {
  return createHash('sha256').update(text).digest('hex')
}

function parseJson (text, code) {
  try {
    return JSON.parse(text)
  } catch {
    fail(code)
  }
}

async function resolveMain (execFileImpl) {
  try {
    const { stdout } = await execFileImpl('git', [
      'ls-remote', '--exit-code', 'https://github.com/microsoft/Agents.git', 'refs/heads/main'
    ], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: maximumBytes,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }
    })
    const match = /^([a-f0-9]{40})\trefs\/heads\/main\r?\n?$/i.exec(stdout)
    if (!match) {
      fail('contract-revision-invalid')
    }

    return match[1].toLowerCase()
  } catch (error) {
    if (error instanceof ContractFailure) {
      throw error
    }
    fail('contract-revision-resolution-failed')
  }
}

async function retrieve (url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'agents-for-js-configuration-contract' }
    })

    if (!response.ok || !response.body) {
      await response.body?.cancel()
      fail('contract-retrieval-failed')
    }

    const chunks = []
    let bytes = 0

    for await (const chunk of response.body) {
      bytes += chunk.length
      if (bytes > maximumBytes) {
        fail('contract-response-too-large')
      }
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks).toString('utf8')
  } catch (error) {
    if (error instanceof ContractFailure) {
      throw error
    }
    fail('contract-retrieval-failed')
  }
}

async function readOptionalCache (file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined
    }
    fail('contract-cache-read-failed')
  }
}

function compileSchema (text) {
  const schema = parseJson(text, 'contract-schema-json-invalid')
  if (schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    fail('contract-schema-draft-invalid')
  }

  const properties = new Set()
  const nodes = [schema]
  while (nodes.length > 0) {
    const node = nodes.pop()
    if (node === null || typeof node !== 'object') {
      continue
    }
    for (const reference of ['$ref', '$dynamicRef']) {
      if (reference in node &&
        (typeof node[reference] !== 'string' || !node[reference].startsWith('#'))) {
        fail('contract-schema-external-reference')
      }
    }
    if (node.properties && typeof node.properties === 'object') {
      for (const property of Object.keys(node.properties)) {
        properties.add(property)
      }
    }
    nodes.push(...Object.values(node))
  }

  try {
    const ajv = new Ajv2020({
      strict: true,
      allErrors: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      logger: false
    })
    if (!ajv.validateSchema(schema)) {
      fail('contract-schema-invalid')
    }

    return { validate: ajv.compile(schema), properties }
  } catch (error) {
    if (error instanceof ContractFailure) {
      throw error
    }
    fail('contract-schema-compilation-failed')
  }
}

function safeDiagnostics (errors, properties) {
  return (errors ?? []).map(({ instancePath, keyword }) => ({
    code: 'configuration-schema-violation',
    instancePath: instancePath.split('/').map((part, index, parts) => {
      const property = part.replaceAll('~1', '/').replaceAll('~0', '~')
      // Dynamic names can themselves contain secrets; retain only schema vocabulary and indexes.
      if (parts[index - 1] === 'connections' || parts[index - 1] === 'handlers') {
        return '*'
      }

      return index === 0 || properties.has(property) || /^(0|[1-9]\d*)$/.test(part)
        ? part
        : '*'
    }).join('/'),
    keyword
  }))
}

export async function runConfigurationContract ({
  repositoryRoot = root,
  contractRef = 'main',
  inputs = documents,
  fetchImpl = globalThis.fetch,
  execFileImpl = executeFile
} = {}) {
  const report = {
    schemaVersion: 1,
    status: 'failed',
    repository: 'microsoft/Agents',
    requestedRef: contractRef === 'main' || commitPattern.test(contractRef) ? contractRef : 'invalid',
    resolvedSha: null,
    schemaPath,
    schemaSha256: null,
    documents: [],
    diagnostics: []
  }

  try {
    if (contractRef !== 'main' && !commitPattern.test(contractRef)) {
      fail('contract-ref-invalid')
    }
    if (inputs.length === 0) {
      fail('configuration-inputs-empty')
    }

    let sha = contractRef.toLowerCase()
    if (contractRef === 'main') {
      sha = await resolveMain(execFileImpl)
    }
    report.resolvedSha = sha

    const cacheDirectory = path.join(
      repositoryRoot, 'node_modules', '.cache', 'agents-configuration-contract'
    )
    const cacheFile = path.join(cacheDirectory, `${sha}.json`)
    const cached = await readOptionalCache(cacheFile)
    let text

    if (cached !== undefined) {
      const artifact = parseJson(cached, 'contract-cache-invalid')
      if (artifact?.resolvedSha !== sha || typeof artifact.schema !== 'string' ||
        artifact.schemaSha256 !== digest(artifact.schema)) {
        fail('contract-cache-invalid')
      }
      text = artifact.schema
    } else {
      text = await retrieve(
        `https://raw.githubusercontent.com/microsoft/Agents/${sha}/${schemaPath}`,
        fetchImpl
      )
    }

    report.schemaSha256 = digest(text)
    const { validate, properties } = compileSchema(text)

    if (cached === undefined) {
      const temporaryFile = `${cacheFile}.${randomUUID()}.tmp`
      try {
        await mkdir(cacheDirectory, { recursive: true })
        await writeFile(temporaryFile, JSON.stringify({
          resolvedSha: sha,
          schemaSha256: report.schemaSha256,
          schema: text
        }))
        await rename(temporaryFile, cacheFile)
      } catch {
        fail('contract-cache-write-failed')
      } finally {
        await rm(temporaryFile, { force: true })
      }
    }

    for (const input of inputs) {
      const result = { id: input.id, status: 'failed', diagnostics: [] }
      report.documents.push(result)
      let document

      try {
        document = parseJson(
          await readFile(path.resolve(repositoryRoot, input.file), 'utf8'),
          'configuration-json-invalid'
        )
      } catch (error) {
        result.diagnostics.push({
          code: error instanceof ContractFailure ? error.code : 'configuration-read-failed'
        })
        continue
      }

      if (validate(document)) {
        result.status = 'passed'
      } else {
        result.diagnostics = safeDiagnostics(validate.errors, properties)
      }
    }

    if (report.documents.every(document => document.status === 'passed')) {
      report.status = 'passed'
    }
  } catch (error) {
    report.diagnostics.push({
      code: error instanceof ContractFailure ? error.code : 'configuration-contract-failed'
    })
  }

  return report
}

async function main () {
  const args = process.argv.slice(2)
  let contractRef = process.env.AGENTS_CONFIGURATION_CONTRACT_REF || 'main'
  const inputs = []
  let refSeen = false
  let invalidArguments = false

  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      invalidArguments = true
      break
    }
    if (option === '--contract-ref' && !refSeen) {
      contractRef = value
      refSeen = true
    } else if (option === '--document') {
      inputs.push({ id: `input-${inputs.length + 1}`, file: value })
    } else {
      invalidArguments = true
      break
    }
  }

  const report = invalidArguments
    ? {
        schemaVersion: 1,
        status: 'failed',
        diagnostics: [{ code: 'arguments-invalid' }]
      }
    : await runConfigurationContract({
      contractRef,
      ...(inputs.length > 0 ? { inputs } : {})
    })
  const reportFile = path.resolve(
    root,
    process.env.QUALITY_LOG_DIR || 'scripts/logs/quality',
    'configuration-contract.report.json'
  )

  try {
    await mkdir(path.dirname(reportFile), { recursive: true })
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`)
  } catch {
    console.error('configuration-contract: report-write-failed')
    process.exitCode = 1

    return
  }

  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.status === 'passed' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
