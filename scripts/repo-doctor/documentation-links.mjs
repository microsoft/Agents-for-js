// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import GithubSlugger from 'github-slugger'
import { parseFragment } from 'parse5'

/** @typedef {{ path: string, line: number, column: number, target: string, kind: string, url?: string }} Reference */
/** @typedef {{ ruleId: string, path: string, line: number, column: number, subject: string, message: string, fix: string, severity: 'error' | 'warning' }} LinkFinding */

/** Parse authored references and rendered heading anchors without interpreting code examples.
 * @param {string} sourceDocument
 * @param {string} text
 */
export function parseDocumentation (sourceDocument, text) {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const definitions = new Map()
  const anchors = new Set()
  const references = []
  const slugger = new GithubSlugger()

  visit(tree, node => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url)
    }
  })
  visit(tree, node => {
    if (node.type === 'heading') {
      anchors.add(slugger.slug(headingText(node)))
    }
    if (node.type === 'html') {
      const fragment = parseFragment(node.value, { sourceCodeLocationInfo: true })
      visitHtml(fragment, element => {
        for (const attribute of element.attrs ?? []) {
          if (attribute.name === 'id' || (element.tagName === 'a' && attribute.name === 'name')) {
            anchors.add(attribute.value)
          }
          const isLink = element.tagName === 'a' && attribute.name === 'href'
          const isImage = element.tagName === 'img' && attribute.name === 'src'
          if (isLink || isImage) {
            const location = element.sourceCodeLocation?.attrs?.[attribute.name]
            const offset = (node.position?.start.offset ?? 0) + (location?.startOffset ?? 0)
            references.push({
              path: sourceDocument,
              ...locationAt(text, offset),
              target: attribute.value,
              kind: isImage ? 'image' : 'link',
            })
          }
        }
      })
      return
    }
    const isDirect = node.type === 'link' || node.type === 'image'
    const isReference = node.type === 'linkReference' || node.type === 'imageReference'
    if (!isDirect && !isReference) {
      return
    }
    const target = isDirect ? node.url : definitions.get(node.identifier)
    if (target !== undefined) {
      references.push({
        path: sourceDocument,
        line: node.position.start.line,
        column: node.position.start.column,
        target,
        kind: node.type.startsWith('image') ? 'image' : 'link',
      })
    }
  })
  return { references, anchors }
}

/** Collect once so the synchronous and optional network phases share the same inventory.
 * @param {string} root
 * @param {string[]} documents
 */
export function checkDocumentationLinks (root, documents) {
  const parsedDocuments = new Map()
  const findings = []
  const externalReferences = []
  const skipped = []
  const summary = { references: 0, local: 0, unsupportedFragments: 0 }
  const loadDocument = file => {
    if (!parsedDocuments.has(file)) {
      parsedDocuments.set(file, parseDocumentation(file, fs.readFileSync(path.join(root, file), 'utf8')))
    }
    return parsedDocuments.get(file)
  }

  for (const document of documents) {
    let parsed
    try {
      parsed = loadDocument(document)
    } catch (error) {
      findings.push(linkFinding({ path: document, line: 0, column: 0, target: document },
        'docs/relative-link-missing', `Documentation cannot be read: ${error.code ?? error.message}.`, 'Restore read access to the document.'))
      continue
    }
    for (const reference of parsed.references) {
      summary.references += 1
      const target = reference.target.trim()
      if (/^(?:https?:|\/\/)/i.test(target)) {
        try {
          if (/%(?![\da-f]{2})/i.test(target)) {
            throw new TypeError('Invalid percent encoding')
          }
          decodeURI(target)
          const url = new URL(target.startsWith('//') ? `https:${target}` : target)
          if (!url.hostname || url.username || url.password) {
            throw new TypeError('A public URL must have a host and no credentials')
          }
          url.hash = ''
          externalReferences.push({ ...reference, url: url.href })
        } catch {
          findings.push(linkFinding(reference, 'docs/link-invalid', 'Malformed HTTP/HTTPS destination.', 'Use a complete HTTP/HTTPS URL without credentials or invalid encoding.'))
        }
        continue
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
        skipped.push({ ...reference, reason: 'Unsupported non-web scheme.' })
        continue
      }
      summary.local += 1
      try {
        checkLocalReference(root, reference, loadDocument, summary, findings)
      } catch (error) {
        if (!(error instanceof URIError) && !error.code) {
          throw error
        }
        const ruleId = error instanceof URIError ? 'docs/link-invalid' : 'docs/relative-link-missing'
        findings.push(linkFinding(reference, ruleId, `Local destination cannot be resolved: ${error.code ?? error.message}.`, 'Correct the path encoding or restore access to the referenced target.'))
      }
    }
  }
  return { findings, externalReferences, skipped, summary }
}

function checkLocalReference (root, reference, loadDocument, summary, findings) {
  const [pathAndQuery, encodedFragment = ''] = reference.target.trim().split(/#(.*)/s)
  const encodedPath = pathAndQuery.split('?')[0]
  const targetPath = decodeURIComponent(encodedPath)
  const fragment = decodeURIComponent(encodedFragment)
  const sourceFile = path.join(root, reference.path)
  const resolvedTarget = targetPath.startsWith('/')
    ? path.resolve(root, `.${targetPath}`)
    : path.resolve(path.dirname(sourceFile), targetPath || path.basename(sourceFile))

  if (!isInside(root, resolvedTarget)) {
    findings.push(linkFinding(reference, 'docs/relative-link-missing', 'Repository-relative link escapes the repository.', 'Choose an existing target inside the repository.'))
    return
  }
  const exactPath = resolveCasing(root, resolvedTarget)
  if (!exactPath) {
    findings.push(linkFinding(reference, 'docs/relative-link-missing', 'Repository-relative link does not resolve.', `Change the target to an existing path relative to ${path.posix.dirname(reference.path)}.`))
    return
  }
  if (!isInside(fs.realpathSync(root), fs.realpathSync(exactPath))) {
    findings.push(linkFinding(reference, 'docs/relative-link-missing', 'Repository-relative link resolves outside the repository through a symlink.', 'Choose a target whose real path stays inside the repository.'))
    return
  }
  if (exactPath !== resolvedTarget) {
    findings.push(linkFinding(reference, 'docs/link-case-mismatch', 'Link spelling differs from the actual filename.', `Use the exact filename casing: ${path.relative(root, exactPath).replaceAll('\\', '/')}.`))
    return
  }
  fs.accessSync(exactPath, fs.constants.R_OK)
  if (!fragment) {
    return
  }
  let anchorTarget = exactPath
  if (fs.statSync(anchorTarget).isDirectory()) {
    const readme = path.join(anchorTarget, 'README.md')
    anchorTarget = resolveCasing(root, readme)
    if (!anchorTarget || anchorTarget !== readme) {
      findings.push(linkFinding(reference, 'docs/link-anchor-missing', 'Directory fragment requires an existing README.md with exact casing.', 'Link directly to a Markdown document and an existing heading.'))
      return
    }
    if (!isInside(fs.realpathSync(root), fs.realpathSync(anchorTarget))) {
      findings.push(linkFinding(reference, 'docs/relative-link-missing', 'Directory README resolves outside the repository.', 'Choose a README whose real path stays inside the repository.'))
      return
    }
  }
  if (path.extname(anchorTarget).toLowerCase() !== '.md') {
    summary.unsupportedFragments += 1
    return
  }
  const document = path.relative(root, anchorTarget).replaceAll('\\', '/')
  if (!loadDocument(document).anchors.has(fragment)) {
    findings.push(linkFinding(reference, 'docs/link-anchor-missing', `Heading or explicit anchor "${fragment}" does not exist in ${document}.`, 'Use an existing heading fragment or add the intended explicit anchor.'))
  }
}

function resolveCasing (root, target) {
  let current = root
  for (const component of path.relative(root, target).split(path.sep).filter(Boolean)) {
    const entries = fs.readdirSync(current)
    const actual = entries.includes(component) ? component : entries.find(entry => entry.toLowerCase() === component.toLowerCase())
    if (!actual) {
      return undefined
    }
    current = path.join(current, actual)
  }
  return current
}

function isInside (root, target) {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Create diagnostics independently of CLI presentation.
 * @param {Pick<Reference, 'path' | 'line' | 'column' | 'target'>} reference
 * @param {string} ruleId
 * @param {string} message
 * @param {string} fix
 * @param {'error' | 'warning'} [severity]
 * @returns {LinkFinding}
 */
export function linkFinding (reference, ruleId, message, fix, severity = 'error') {
  return {
    ruleId,
    path: reference.path,
    line: reference.line,
    column: reference.column,
    subject: reference.target,
    message,
    fix,
    severity,
  }
}

function visit (node, callback) {
  callback(node)
  for (const child of node.children ?? []) {
    visit(child, callback)
  }
}

function visitHtml (node, callback) {
  callback(node)
  // Script/style content and comments cannot introduce authored link attributes.
  if (['script', 'style', 'code', 'pre'].includes(node.tagName)) {
    return
  }
  for (const child of node.childNodes ?? []) {
    visitHtml(child, callback)
  }
}

function headingText (node) {
  if (node.type === 'html') {
    return ''
  }
  if (node.type === 'image' || node.type === 'imageReference') {
    return node.alt ?? ''
  }
  if (typeof node.value === 'string') {
    return node.value
  }
  return (node.children ?? []).map(headingText).join('')
}

function locationAt (text, offset) {
  return {
    line: text.slice(0, offset).split('\n').length,
    column: offset - text.lastIndexOf('\n', offset - 1),
  }
}
