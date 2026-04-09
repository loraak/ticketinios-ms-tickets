import { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'

export async function ticketRoutes(app: FastifyInstance) {

    // GET /api/tickets?grupoId=xxx
    app.get('/', async (request, reply) => {
        const { grupoId } = request.query as { grupoId?: string };
        const userId = (request as any).headers['x-user-id'];

        if (!grupoId) {
            return reply.code(400).send({ statusCode: 400, message: 'grupoId requerido' });
        }

        const tickets = await prisma.ticket.findMany({
            where: { grupoId },
            include: {
                estado:    true,
                prioridad: true,
            },
            orderBy: { creadoEn: 'desc' }
        });

        const data = tickets.map(t => ({
            id:          t.id,
            titulo:      t.titulo,
            descripcion: t.descripcion,
            estado:      t.estado?.nombre,
            prioridad:   t.prioridad?.nombre,
            autorId:     t.autorId,
            asignadoId:  t.asignadoId,
            fechaFinal:  t.fechaFinal,
            creadoEn:    t.creadoEn,
        }));

        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-LIST-OK', data });
    });

    // POST /api/tickets
    app.post('/', async (request, reply) => {
        const userId = (request as any).headers['x-user-id'];
        const { grupoId, titulo, descripcion, asignadoId, estadoId, prioridadId, fechaFinal } 
            = request.body as any;

        if (!grupoId || !titulo) {
            return reply.code(400).send({ statusCode: 400, message: 'grupoId y titulo son requeridos' });
        }

        const ticket = await prisma.ticket.create({
            data: {
                grupoId,
                titulo,
                descripcion,
                autorId:     userId,  // ← viene del gateway
                asignadoId,
                estadoId,
                prioridadId,
                fechaFinal:  fechaFinal ? new Date(fechaFinal) : null,
            },
            include: { estado: true, prioridad: true }
        });

        return reply.code(201).send({
            statusCode: 201,
            intOpCode: 'MS-TICKETS-CREATE-OK',
            data: [{
                id:          ticket.id,
                titulo:      ticket.titulo,
                estado:      ticket.estado?.nombre,
                prioridad:   ticket.prioridad?.nombre,
                autorId:     ticket.autorId,
                asignadoId:  ticket.asignadoId,
                fechaFinal:  ticket.fechaFinal,
                creadoEn:    ticket.creadoEn,
            }]
        });
    });
}