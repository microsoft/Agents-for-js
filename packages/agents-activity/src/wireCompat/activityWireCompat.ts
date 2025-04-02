// the property 'agent' is used in the activity wire protocol to refer to the bot

// function rep (k: string, v: any) {
//   if (typeof v === 'object' && v !== null && v['agent']) {
//     const ov = v['agent']
//     delete v['agent']
//     v['bot'] = ov
//   }
//   return v
// }

// function rev (k: string, v: any) {
//   if (typeof v === 'object' && v !== null && v['bot']) {
//     const ov = v['bot']
//     delete v['bot']
//     v['agent'] = ov
//   }
//   return v
// }

export function normalizeIncomingPayload (payload: any): object {
  // return JSON.parse(JSON.stringify(payload, rep), rev)
  if (payload['relatesTo'] && payload['relatesTo']['bot']) {
    const relatesTo = payload['relatesTo']
    const ov = relatesTo['bot']
    delete relatesTo['bot']
    relatesTo['agent'] = ov
  }
  return payload
}

export function normalizeOutgoingPayload (payload: any): object {
  // return JSON.stringify(payload, rep)
  if (payload['relatesTo'] && payload['relatesTo']['agent']) {
    const relatesTo = payload['relatesTo']
    const ov = relatesTo['agent']
    delete relatesTo['agent']
    relatesTo['bot'] = ov
  }
  return payload
}
