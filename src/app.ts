import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ticketRoutes } from './tickets/tickets.routes.js'

export async function buildApp() {
    const app = Fastify({ logger: true })

    await app.register(cors, { origin: '*' })

    await app.register(ticketRoutes, { prefix: '/api/tickets' })

    app.get('/health', async () => ({ status: 'ok', service: 'tickets' }))

    return app;
}