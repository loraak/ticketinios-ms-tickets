import { buildApp } from './app.js'
import 'dotenv/config'

const app = await buildApp()
await app.listen({ port: Number(process.env.PORT) || 3003 })