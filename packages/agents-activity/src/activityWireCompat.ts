// the property 'agent' is used in the activity wire protocol to refer to the bot

export function normalizeIncomingPayload (payload: any): object {
  if (payload['relatesTo'] && payload['relatesTo']['bot']) {
    const relatesTo = payload['relatesTo']
    const ov = relatesTo['bot']
    delete relatesTo['bot']
    relatesTo['agent'] = ov
  }
  return payload
}

export function normalizeOutgoingPayload (payload: any): object {
  if (payload['relatesTo'] && payload['relatesTo']['agent']) {
    const relatesTo = payload['relatesTo']
    const ov = relatesTo['agent']
    delete relatesTo['agent']
    relatesTo['bot'] = ov
  }
  return payload
}
