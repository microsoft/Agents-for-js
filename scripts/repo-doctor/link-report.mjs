// @ts-check

import fs from 'node:fs'
import path from 'node:path'

/** Replace the previous run's diagnostics in the retained log directory.
 * @param {ReturnType<import('../repo-doctor.mjs').checkRepository> & {links: {external: {results?: import('./external-links.mjs').ExternalResult[]}}}} report
 * @param {import('./external-links.mjs').ExternalReference[]} references
 * @param {string} directory Retained local or quality artifact directory.
 */
export function writeLinkLog (report, references, directory) {
  const baseDirectory = path.resolve(directory)
  fs.mkdirSync(baseDirectory, { recursive: true })
  const logPath = path.join(baseDirectory, 'links.log')
  const lines = [
    'Repository doctor — documentation link diagnostics',
    `Generated: ${new Date().toISOString()}`,
    `Local references checked: ${report.links.local}`,
    `Unsupported local fragments: ${report.links.unsupportedFragments}`,
    `External checks: ${report.links.external.requested ? 'enabled' : 'disabled'}`,
    `HTTP request attempts: ${report.links.external.requests}`,
  ]
  const sources = new Map()
  for (const reference of references) {
    const locations = sources.get(reference.url) ?? []
    locations.push(`${reference.path}:${reference.line}:${reference.column} ${reference.target}`)
    sources.set(reference.url, locations)
  }

  for (const result of report.links.external.results ?? []) {
    lines.push(
      '',
      `${result.outcome.toUpperCase()}: ${result.url}`,
      `  Reason: ${result.message}`,
      `  HTTP status: ${result.status ?? 'No HTTP status recorded'}`,
      `  Final destination: ${result.finalUrl}`,
      `  Request attempts: ${result.attempts}`,
      ...(sources.get(result.url) ?? []).map(source => `  Source: ${source}`)
    )
  }
  if (!report.links.external.requested) {
    for (const [url, locations] of sources) {
      lines.push('', `NOT CHECKED: ${url}`, ...locations.map(source => `  Source: ${source}`))
    }
  }
  for (const skipped of report.links.skipped) {
    lines.push(
      '',
      `SKIPPED: ${skipped.target}`,
      `  Reason: ${skipped.reason}`,
      `  Source: ${skipped.path}:${skipped.line}:${skipped.column}`
    )
  }
  for (const finding of report.findings.filter(finding => finding.ruleId.startsWith('docs/'))) {
    lines.push('', `${finding.ruleId}: ${finding.path}:${finding.line}:${finding.column}`, `  ${finding.message}`, `  Fix: ${finding.fix}`)
  }
  fs.writeFileSync(logPath, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
  return logPath
}
