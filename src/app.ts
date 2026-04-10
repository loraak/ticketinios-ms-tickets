import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ticketRoutes } from './tickets/tickets.routes.js'

export async function buildApp() {
    const app = Fastify({ logger: true })

    await app.register(cors, { origin: '*' })

    app.addHook('onRequest', async (request, reply) => {
        const ip = request.ip;
        if (ip !== '127.0.0.1' && ip !== '::1') {
            return reply.code(403).send({ message: 'Acceso denegado' });
        }
    });

    await app.register(ticketRoutes, { prefix: '/api/tickets' })

    app.get('/health', async () => ({ status: 'ok', service: 'tickets' }))

    return app;
}