import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { ticketRoutes } from './tickets/tickets.routes.js'

export async function buildApp() {
    const app = Fastify({ logger: true })

    await app.register(cors, { origin: '*' })

    await app.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'Tickets Service',
                version: '1.0.0',
                description: 'Microservicio de tickets'
            },
            servers: [
                { url: 'https://ticketinios-apigateway-production.up.railway.app', description: 'API Gateway (producción)' },
                { url: 'http://localhost:3000', description: 'API Gateway (local)' }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            },
            security: [{ bearerAuth: [] }]
        }
    })

    await app.register(fastifySwaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
            url: '/docs/json'
        }
    })

    app.addHook('onRequest', async (request, reply) => {
        const gatewayKey = request.headers['x-gateway-key']
        if (gatewayKey !== process.env.GATEWAY_KEY) {
            return reply.code(403).send({ message: 'Acceso denegado' })
        }
    })

    await app.register(ticketRoutes, { prefix: '/api/tickets' }) 

    app.get('/health', async () => ({ status: 'ok', service: 'tickets' }))

    return app;
}