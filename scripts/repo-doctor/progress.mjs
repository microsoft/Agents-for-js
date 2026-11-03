export function supportsProgress () {
  return Boolean(process.stdout.isTTY) && !process.env.CI && process.env.TERM !== 'dumb'
}

export function startProgress ({ color, checkLinks }) {
  if (!supportsProgress()) {
    return async () => {}
  }

  const frames = ['|', '/', '-', '\\']
  const label = checkLinks ? 'Checking repository and external links...' : 'Checking repository...'
  let frame = 0
  const render = () => {
    const spinner = frames[frame++ % frames.length]
    const columns = process.stdout.columns || 80
    const text = `${spinner} ${label}`.slice(0, Math.max(1, columns - 1))
    const styled = color ? `\u001B[2m${text}\u001B[0m` : text
    // Use the report's output stream so Windows shares encoding and cursor state.
    process.stdout.write(`\r\u001B[2K${styled}`)
  }
  render()
  const timer = setInterval(render, 100)
  timer.unref()
  let stopped = false

  return async () => {
    if (stopped) {
      return
    }
    stopped = true
    clearInterval(timer)
    process.stdout.write('\r\u001B[2K')
  }
}
