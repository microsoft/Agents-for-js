import express from 'express'
import { loadAuthConfigFromEnv, authorizeJWT } from '@microsoft/agents-hosting'

console.log('[DEBUG] process.env.ALLOWED_CALLERS =', process.env.ALLOWED_CALLERS)

const auth = loadAuthConfigFromEnv()
// @ts-ignore
console.log('[DEBUG] allowedCallers =', auth.allowedCallers) // ← undefined

// const adapter = new CloudAdapter(auth)

const app = express()
app.use(authorizeJWT(auth))
app.use(express.json())

app.post('/api/messages', (req: express.Request, res: express.Response) => {
  console.log('in /api/messages')
  res.end('ok ' + JSON.stringify(req.body))
})

app.listen(3000, () => console.log('listening'))
