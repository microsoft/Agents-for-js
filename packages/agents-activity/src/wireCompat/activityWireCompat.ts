// the property 'agent' is used in the activity wire protocol to refer to the bot

function rep (k: string, v: any) {
  if (typeof v === 'object' && v !== null && v['agent']) {
    const ov = v['agent']
    delete v['agent']
    v['bot'] = ov
  }
  return v
}

function rev (k: string, v: any) {
  if (typeof v === 'object' && v !== null && v['bot']) {
    const ov = v['bot']
    delete v['bot']
    v['agent'] = ov
  }
  return v
}

export function normalizeIncomingPayload (payload: any): object {
  return JSON.parse(JSON.stringify(payload, rep), rev)
}

export function normalizeOutgoingPayload (payload: object): string {
  return JSON.stringify(payload, rep)
}
