import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { checkDocumentationLinks, parseDocumentation } from '../repo-doctor/documentation-links.mjs'
import { readLinkExceptions } from '../repo-doctor/link-configuration.mjs'

function repository (context, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-links-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  return root
}

describe('documentation reference parsing', () => {
  it('resolves direct, full, collapsed, and shortcut references at their use sites', () => {
    const text = [
      '[inline](folder/a(b).md "Title")',
      '![image](image.png)',
      '[full][target]',
      '[target][]',
      '[target]',
      '![image ref][target]',
      '[ordinary prose]',
      '',
      '[target]: <space%20name.md> "A title"',
    ].join('\n')
    const parsed = parseDocumentation('docs/start.md', text)
    assert.deepEqual(parsed.references.map(reference => reference.target), [
      'folder/a(b).md',
      'image.png',
      'space%20name.md',
      'space%20name.md',
      'space%20name.md',
      'space%20name.md',
    ])
    assert.deepEqual(parsed.references.map(reference => reference.line), [1, 2, 3, 4, 5, 6])
    assert.equal(parsed.references[2].column, 1)
  })

  it('extracts GFM autolinks and supported HTML attributes without parsing examples', () => {
    const text = [
      '<https://public.example.org/path>',
      'https://public.example.org/bare',
      '<a href="local.md?x=1&amp;y=2" id="Explicit">text</a>',
      '<img src="image.png" />',
      '<a name="Legacy"></a>',
      '`[inline example](missing.md)`',
      '',
      '    [indented example](missing.md)',
      '',
      '```md',
      '[fenced example](missing.md)',
      '```',
      '<!-- <a href="missing.md">comment</a> -->',
    ].join('\n')
    const parsed = parseDocumentation('README.md', text)
    assert.deepEqual(parsed.references.map(reference => reference.target), [
      'https://public.example.org/path',
      'https://public.example.org/bare',
      'local.md?x=1&y=2',
      'image.png',
    ])
    assert.equal(parsed.references[2].line, 3)
    assert.equal(parsed.references[2].column, 4)
    assert.ok(parsed.anchors.has('Explicit'))
    assert.ok(parsed.anchors.has('Legacy'))
  })

  it('generates heading identifiers from rendered text including duplicates and Unicode', () => {
    const parsed = parseDocumentation('README.md', [
      '# Hello, *World*!',
      '## Hello, World!',
      '## Use `code` and [links](https://public.example.org)',
      '## Привет 你好',
      '## Fish &amp; chips',
    ].join('\n'))
    assert.deepEqual([...parsed.anchors], [
      'hello-world',
      'hello-world-1',
      'use-code-and-links',
      'привет-你好',
      'fish--chips',
    ])
  })
})

describe('local link validation', () => {
  it('accepts encoded paths, repository paths, directory README fragments, and same-document anchors', context => {
    const root = repository(context, {
      'docs/start.md': [
        '# Start',
        '[self](#start)',
        '[encoded](space%20name.md?view=1#%E4%BD%A0%E5%A5%BD)',
        '[root](/README.md#root)',
        '[directory](../folder#section)',
        '[literal](a\\(b\\).md)',
      ].join('\n'),
      'docs/space name.md': '# 你好',
      'docs/a(b).md': '# Parentheses',
      'README.md': '# Root',
      'folder/README.md': '# Section',
    })
    const report = checkDocumentationLinks(root, ['docs/start.md'])
    assert.deepEqual(report.findings, [])
    assert.equal(report.summary.local, 5)
  })

  it('reports missing paths, casing, anchors, invalid encoding, and escapes independently', context => {
    const root = repository(context, {
      'README.md': [
        '# Root',
        '[missing](absent.md)',
        '[case](target.md)',
        '[anchor](Target.md#absent)',
        '[encoding](bad%ZZ.md)',
        '[escape](../outside.md)',
        '[directory](folder#absent)',
        '[explicit](Target.md#exact)',
      ].join('\n'),
      'Target.md': '<a id="Exact"></a>',
      'folder/file.txt': 'No README',
    })
    const report = checkDocumentationLinks(root, ['README.md'])
    assert.deepEqual(report.findings.map(finding => finding.ruleId), [
      'docs/relative-link-missing',
      'docs/link-case-mismatch',
      'docs/link-anchor-missing',
      'docs/link-invalid',
      'docs/relative-link-missing',
      'docs/link-anchor-missing',
      'docs/link-anchor-missing',
    ])
    assert.match(report.findings[1].fix, /Target\.md/)
    assert.equal(report.findings[0].line, 2)
    assert.equal(report.findings[0].column, 1)
  })

  it('rejects escaping directory junctions without recursively traversing them', context => {
    const root = repository(context, { 'README.md': '[link](escape/file.md)' })
    const outside = repository(context, { 'file.md': '# Heading' })
    fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    const report = checkDocumentationLinks(root, ['README.md'])
    assert.equal(report.findings.length, 1)
    assert.match(report.findings[0].message, /symlink/)
  })

  it('rejects escaping symlinks, including a directory README symlink', context => {
    const root = repository(context, { 'README.md': '[link](escape/file.md)\n[readme](folder#heading)', 'folder/keep.txt': '' })
    const outside = repository(context, { 'file.md': '# Heading' })
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'), 'junction')
      fs.symlinkSync(path.join(outside, 'file.md'), path.join(root, 'folder/README.md'), 'file')
    } catch (error) {
      if (error.code === 'EPERM') {
        context.skip('Creating file symlinks requires Windows developer mode or elevated privileges.')
        return
      }
      throw error
    }
    const report = checkDocumentationLinks(root, ['README.md'])
    assert.equal(report.findings.length, 2)
    assert.ok(report.findings.every(finding => finding.ruleId === 'docs/relative-link-missing'))
  })

  it('reports unreadable documents and unsupported fragments without claiming anchor success', context => {
    const root = repository(context, { 'README.md': '[pdf](manual.pdf#page=2)', 'manual.pdf': '' })
    const report = checkDocumentationLinks(root, ['README.md', 'missing.md'])
    assert.equal(report.summary.unsupportedFragments, 1)
    assert.equal(report.findings.length, 1)
    assert.match(report.findings[0].message, /cannot be read/)
  })

  it('trims HTML URL whitespace while retaining the authored destination', context => {
    const root = repository(context, {
      'README.md': '<a href="  Target.md#heading  ">guide</a>',
      'Target.md': '# Heading',
    })
    const parsed = parseDocumentation('README.md', fs.readFileSync(path.join(root, 'README.md'), 'utf8'))
    assert.equal(parsed.references[0].target, '  Target.md#heading  ')
    assert.deepEqual(checkDocumentationLinks(root, ['README.md']).findings, [])
  })

  it('classifies web links before root paths and counts unsupported schemes', context => {
    const root = repository(context, {
      'README.md': [
        '[protocol-relative](//public.example.org/path#heading)',
        '[query](https://public.example.org/path?q=1#heading)',
        '[mail](mailto:person@example.org)',
        '[editor](vscode:open)',
        '[bad](https://)',
        '[credentials](https://user:password@public.example.org)',
      ].join('\n'),
    })
    const report = checkDocumentationLinks(root, ['README.md'])
    assert.deepEqual(report.externalReferences.map(reference => reference.url), [
      'https://public.example.org/path',
      'https://public.example.org/path?q=1',
    ])
    assert.equal(report.skipped.length, 2)
    assert.equal(report.findings.length, 2)
  })
})

describe('link exceptions', () => {
  class ConfigurationError extends Error {
    constructor (file, message) {
      super(`${file}: ${message}`)
    }
  }

  function configuration (context, exceptions) {
    return repository(context, { 'repo-doctor.links.json': JSON.stringify({ exceptions }) })
  }

  it('allows missing configuration and exact permanent or dated exceptions', context => {
    const empty = repository(context, {})
    assert.equal(readLinkExceptions(empty, ConfigurationError).size, 0)
    const root = configuration(context, [
      { url: 'https://public.example.org/', reason: 'Authentication required', permanent: true },
      { url: 'https://public.example.org/temporary', reason: 'Maintenance', expires: '2026-10-26' },
      { url: 'https://public.example.org/expired', reason: 'Old maintenance', expires: '2026-10-25' },
    ])
    const exceptions = readLinkExceptions(root, ConfigurationError, new Date('2026-10-26T23:59:59Z'))
    assert.equal(exceptions.get('https://public.example.org/temporary').expired, false)
    assert.equal(exceptions.get('https://public.example.org/expired').expired, true)
  })

  it('rejects broad, ambiguous, malformed, and unexplained exceptions', context => {
    const invalidEntries = [
      { url: 'https://public.example.org/', permanent: true },
      { url: 'https://public.example.org/', reason: ' ', permanent: true },
      { url: 'https://public.example.org', reason: 'Not normalized', permanent: true },
      { url: 'https://public.example.org/#fragment', reason: 'Fragment', permanent: true },
      { url: 'https://public.example.org/', reason: 'No expiry' },
      { url: 'https://public.example.org/', reason: 'Invalid date', expires: '2026-02-30' },
      { url: 'https://public.example.org/', reason: 'Both', permanent: true, expires: '2026-10-26' },
      { host: 'public.example.org', reason: 'Broad', permanent: true },
    ]
    for (const entry of invalidEntries) {
      const root = configuration(context, [entry])
      assert.throws(() => readLinkExceptions(root, ConfigurationError), /repo-doctor\.links\.json/)
    }
    const root = configuration(context, [
      { url: 'https://public.example.org/', reason: 'One', permanent: true },
      { url: 'https://public.example.org/', reason: 'Two', permanent: true },
    ])
    assert.throws(() => readLinkExceptions(root, ConfigurationError), /Duplicate/)
  })
})
