export function rep (k: string, v: any) {
  if (typeof v === 'object' && v !== null && v['agent']) {
    const ov = v['agent']
    delete v['agent']
    v['bot'] = ov
  }
  return v
}

export function rev (k: string, v: any) {
  if (typeof v === 'object' && v !== null && v['bot']) {
    const ov = v['bot']
    delete v['bot']
    v['agent'] = ov
  }
  return v
}
