import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

const codes = {
  accent: '36',
  dim: '2',
  italic: '2;3',
  warning: '33',
  error: '31',
  outdated: '36',
  success: '32',
  link: '4;34',
}

function cleanText (value) {
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}

function paint (text, kind, enabled) {
  const value = cleanText(text)
  return enabled ? `\u001B[${codes[kind]}m${value}\u001B[0m` : value
}

const packageName = name => cleanText(name.replace('@microsoft/', ''))
const duration = milliseconds => `${((milliseconds ?? 0) / 1000).toFixed(1)}s`
const needsReview = result => result.findings.some(finding => finding.kind !== 'compatible')

export function summarize (results) {
  return {
    total: results.length,
    analyzed: results.filter(result => !result.error && !result.skipped).length,
    toReview: results.filter(result => !result.error && !result.skipped && needsReview(result)).length,
    possibleBreaks: results.filter(result => !result.error && !result.skipped)
      .reduce((count, result) => count + (result.breaks?.length ?? result.findings.filter(finding => finding.kind !== 'compatible').length), 0),
    errors: results.filter(result => result.error).length,
    skipped: results.filter(result => result.skipped).length,
    baselines: results.filter(result => result.baselineChanged).length,
  }
}

function status (result, updateCompleted = false) {
  if (result.error) return ['Analysis error', 'error']
  if (result.skipped) return ['Skipped', 'dim']
  if (updateCompleted) {
    return [
      result.baselineChanged ? 'Baseline updated' : 'Already current',
      result.baselineChanged ? 'success' : 'dim',
      needsReview(result) ? 'Possible breaks' : '',
    ]
  }
  if (result.findings.some(finding => finding.kind !== 'compatible')) return ['Possible breaks', 'warning']
  if (result.baselineChanged) return ['Baseline outdated', 'outdated']
  if (result.reference?.findings.some(finding => finding.kind !== 'compatible')) return ['Baseline current', 'dim']
  return ['No breaks detected', 'dim']
}

function row (name, label, time, nameWidth, style, kind = 'dim', { detail = '', labelWidth = 20 } = {}) {
  const clipped = name.length > nameWidth ? `${name.slice(0, Math.max(0, nameWidth - 1))}…` : name
  const suffix = detail ? `${style(' · ', 'dim')}${style(detail, 'warning')}` : ''
  const padding = ' '.repeat(Math.max(0, labelWidth - label.length - (detail ? detail.length + 3 : 0)))
  return `${clipped.padEnd(nameWidth)}  ${style(label, kind)}${suffix}${padding}  ${style(time.padStart(6), 'dim')}`
}

export function formatReport (results, { color = false, hyperlinks = false, terminal = process.env.TERM_PROGRAM, root = process.cwd(), durationMs = 0, updated = 0, updateCompleted = updated > 0, updateError } = {}) {
  const style = (text, kind) => paint(text, kind, color)
  const link = (label, source) => {
    const suffix = source.line ? `:${source.line}` : ''
    if (!hyperlinks) return style(`${label}: ${source.file}${suffix}`, 'link')
    const url = pathToFileURL(path.resolve(root, source.file))
    if (source.line) url.hash = `L${source.line}`
    // VS Code's file opener may discard file-URI fragments; its editor URI carries the selection.
    const target = terminal === 'vscode'
      ? `vscode://file${url.pathname}${source.line ? `:${source.line}:1` : ''}`
      : url.href
    return `\u001B]8;;${target}\u001B\\${style(`${label}${suffix}`, 'link')}\u001B]8;;\u001B\\`
  }
  const nameWidth = Math.max(...results.map(result => packageName(result.name).length), 1)
  const statuses = results.map(result => status(result, updateCompleted))
  const labelWidth = Math.max(20, ...statuses.map(([label, , detail]) => label.length + (detail ? detail.length + 3 : 0)))
  const lines = []
  for (const [index, result] of results.entries()) {
    const [label, kind, detail] = statuses[index]
    lines.push(row(packageName(result.name), label, duration(result.durationMs), nameWidth, style, kind, { detail, labelWidth }))
    if (result.error || result.skipped) {
      lines.push(`    ${link('details', { file: 'compat/generated/report.json' })}`)
    } else {
      const comparisons = (result.breaks ?? []).map(group => {
        const { baseline, generated } = group.sources
        if (!baseline && !generated) return { details: link('details', { file: 'compat/generated/report.json' }) }
        return {
          before: baseline ? link('baseline', baseline) : style('added', 'dim'),
          after: generated ? link('generated', generated) : style('removed', 'dim'),
        }
      })
      const beforeWidth = Math.max(0, ...comparisons.map(comparison => stripVTControlCharacters(comparison.before ?? '').length))
      for (const comparison of comparisons) {
        if (comparison.details) {
          lines.push(`    ${comparison.details}`)
          continue
        }
        const padding = ' '.repeat(beforeWidth - stripVTControlCharacters(comparison.before).length)
        lines.push(`    ${comparison.before}${padding}  ${style('→', 'dim')}  ${comparison.after}`)
      }
    }
  }
  const summary = summarize(results)
  const skipped = summary.skipped ? ` · ${summary.skipped} skipped` : ''
  const breaks = `${summary.possibleBreaks} possible ${summary.possibleBreaks === 1 ? 'break' : 'breaks'}`
  if (updateCompleted) {
    const current = results.filter(result => !result.error && !result.skipped && !result.baselineChanged).length
    const review = summary.toReview ? ` · ${summary.toReview} to review · ${breaks}` : ''
    lines.push('', style(`${summary.analyzed} analyzed · ${updated} ${updated === 1 ? 'baseline' : 'baselines'} updated · ${current} already current${review} · ${summary.errors} errors${skipped} · ${duration(durationMs)}`, 'dim'))
  } else {
    lines.push('', style(`${summary.analyzed} analyzed · ${summary.toReview} to review · ${breaks} · ${summary.errors} errors${skipped} · ${duration(durationMs)}`, 'dim'))
    if (summary.baselines) lines.push(style(`${summary.baselines} baselines need updating`, 'dim'))
  }
  if (updateError) lines.push(style(`Baseline update failed: ${updateError}`, 'error'))
  if (updateCompleted && summary.toReview) {
    lines.push('', `${style('Warning:', 'warning')} ${style('Baselines were updated, but possible breaking changes still need your review.', 'italic')}`)
  }
  let tip
  if (summary.errors || summary.skipped || updateError) tip = 'Analysis is incomplete; see compat/generated/report.json before updating baselines.'
  else if (updateCompleted) tip = 'Review the updated baseline files with git diff.'
  else if (summary.toReview) tip = 'Review linked declarations; details: compat/generated/report.json.'
  else if (summary.baselines) tip = 'Refresh outdated baselines: npm run compat -- --update.'
  if (tip) lines.push('', `${style('Tip:', 'accent')} ${style(tip, 'italic')}`)
  if (summary.toReview && summary.baselines && !updateCompleted && !summary.errors && !summary.skipped && !updateError) {
    lines.push(`     ${style('After review: npm run compat -- --update', 'italic')}`)
  }
  return `${lines.join('\n')}\n`
}

export function createReporter (tasks, settings, stream = process.stdout) {
  const color = settings.color && !!stream.isTTY && process.env.TERM !== 'dumb'
  const style = (text, kind) => paint(text, kind, color)
  const states = tasks.map(task => ({ name: packageName(task.name), state: 'queued' }))
  const live = !!stream.isTTY && process.env.TERM !== 'dumb' && (stream.rows ?? 24) >= 8
  let drawn = 0
  let timer
  let closed = false
  const clear = () => {
    if (!drawn) return
    stream.write(`\u001B[${Math.min(drawn, (stream.rows ?? 24) - 1)}A\r\u001B[J`)
    drawn = 0
  }
  const redraw = () => {
    if (!live || closed) return
    clear()
    const width = Math.max(1, (stream.columns ?? 100) - 1)
    const capacity = Math.max(1, (stream.rows ?? 24) - 6)
    const active = states.findIndex(entry => entry.state !== 'done')
    const start = Math.max(0, Math.min(active < 0 ? states.length : active, states.length - capacity))
    const nameWidth = Math.max(1, Math.min(Math.max(...states.map(entry => entry.name.length)), width - 30))
    const now = performance.now()
    const spinner = ['◐', '◓', '◑', '◒'][Math.floor(now / 125) % 4]
    const lines = states.slice(start, start + capacity).map(entry => {
      const [label, kind] = entry.state === 'queued'
        ? ['Queued', 'dim']
        : entry.state === 'running' ? [`${spinner} Analyzing…`, 'dim'] : status(entry.result)
      const time = entry.state === 'queued' ? '' : duration(entry.state === 'running' ? now - entry.started : entry.result.durationMs)
      if (width >= 31) return row(entry.name, label, time, nameWidth, style, kind)
      const plain = row(entry.name, label, time, nameWidth, text => text)
      return style(plain.slice(0, width), kind)
    })
    stream.write(`${lines.join('\n')}\n`)
    drawn = lines.length
  }
  stream.write(`\n${style('API compatibility', 'accent')}${settings.update ? style(' · Updating baselines…', 'dim') : ''}\n\n`)
  if (live) {
    stream.write('\u001B[?25l')
    redraw()
    timer = setInterval(redraw, 125)
    timer.unref()
  } else stream.write('Analyzing packages…\n\n')
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    clear()
    if (live) stream.write('\u001B[?25h')
  }
  return {
    started: index => {
      states[index].state = 'running'
      states[index].started = performance.now()
      redraw()
    },
    finished: (index, result) => {
      states[index] = { name: packageName(result.name), state: 'done', result }
      redraw()
    },
    finish: (results, options) => {
      close()
      stream.write(formatReport(results, { ...options, color, root: settings.root, hyperlinks: !!stream.isTTY && process.env.TERM !== 'dumb' }))
    },
    close,
  }
}
