// @ts-check

import fs from 'node:fs'
import path from 'node:path'

export const configurationFile = 'repo-doctor.links.json'

/** Read exact URL exceptions. Configuration is checked even on offline runs.
 * @param {string} root
 * @param {new (file: string, message: string) => Error} ConfigurationError
 * @param {Date} [today]
 */
export function readLinkExceptions (root, ConfigurationError, today = new Date()) {
  const filename = path.join(root, configurationFile)
  if (!fs.existsSync(filename)) {
    return new Map()
  }
  const invalid = message => {
    throw new ConfigurationError(configurationFile, message)
  }
  let configuration
  try {
    configuration = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch (error) {
    invalid(`Unable to read link exceptions: ${error.message}`)
  }
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration) ||
      Object.keys(configuration).some(key => key !== 'exceptions') || !Array.isArray(configuration.exceptions)) {
    invalid('Expected an object containing only an exceptions array.')
  }
  const exceptions = new Map()
  for (const [index, entry] of configuration.exceptions.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => !['url', 'reason', 'expires', 'permanent'].includes(key)) ||
        typeof entry.url !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      invalid(`Exception ${index + 1} requires an exact URL and a nonempty reason.`)
    }
    let url
    try {
      url = new URL(entry.url)
    } catch {
      invalid(`Exception ${index + 1} has an invalid URL.`)
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
        url.href !== entry.url || /%(?![\da-f]{2})/i.test(entry.url)) {
      invalid(`Exception ${index + 1} must use an exact normalized HTTP/HTTPS URL without a fragment or credentials.`)
    }
    if (exceptions.has(url.href)) {
      invalid(`Duplicate exception for ${url.href}.`)
    }
    const hasExpiry = typeof entry.expires === 'string'
    if (entry.permanent !== undefined && entry.permanent !== true) {
      invalid(`Exception ${index + 1}: permanent must be true when specified.`)
    }
    if ((entry.permanent === true) === hasExpiry || (entry.expires !== undefined && !hasExpiry)) {
      invalid(`Exception ${index + 1} requires either an expiry date or permanent: true, never both.`)
    }
    if (hasExpiry) {
      const date = new Date(`${entry.expires}T00:00:00.000Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.expires) {
        invalid(`Exception ${index + 1} requires a real UTC date in YYYY-MM-DD form.`)
      }
    }
    exceptions.set(url.href, {
      ...entry,
      expired: hasExpiry && entry.expires < today.toISOString().slice(0, 10),
      index,
    })
  }
  return exceptions
}
