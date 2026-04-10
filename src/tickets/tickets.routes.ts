import { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { resolverNombres } from '../services/UsuarioService.js';

export async function ticketRoutes(app: FastifyInstance) {

    app.get('/', async (request, reply) => {
        const { grupoId } = request.query as { grupoId?: string };

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

        const mapaUsuarios = await resolverNombres(
            tickets.flatMap(t => [t.autorId, t.asignadoId]).filter((id): id is string => !!id)
        );

        const data = tickets.map(t => ({
            id:          t.id,
            titulo:      t.titulo,
            descripcion: t.descripcion,
            estado:      t.estado?.nombre,
            prioridad:   t.prioridad?.nombre,
            autor:       mapaUsuarios[t.autorId ?? '']    ?? t.autorId,
            asignado:    mapaUsuarios[t.asignadoId ?? ''] ?? t.asignadoId,
            autorId:     t.autorId,
            asignadoId:  t.asignadoId,
            fechaFinal:  t.fechaFinal,
            creadoEn:    t.creadoEn,
        }));

        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-LIST-OK', data });
    });

    app.get('/estados', async (request, reply) => {
        const estados = await prisma.estado.findMany({
            orderBy: { nombre: 'asc' }
        });
        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-ESTADOS-OK', data: estados });
    });

    
    app.get('/prioridades', async (request, reply) => {
        const prioridades = await prisma.prioridad.findMany({
            orderBy: { nombre: 'asc' }
        });
        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-PRIORIDADES-OK', data: prioridades });
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
                autorId:     userId,  
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

    app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estado } = request.body as { estado: string };

    const estadoObj = await prisma.estado.findFirst({  // Estado con mayúscula
        where: { nombre: estado }
    });

    if (!estadoObj) {
        return reply.code(400).send({ statusCode: 400, message: 'Estado inválido' });
    }

    const ticket = await prisma.ticket.update({
        where: { id },
        data: { estadoId: estadoObj.id },
        include: { estado: true, prioridad: true }
    });

    return reply.send({
        statusCode: 200,
        intOpCode: 'MS-TICKETS-UPDATE-OK',
        data: [{ id: ticket.id, estado: ticket.estado?.nombre }]
    });
    });

    app.get('/estadisticas', async (request, reply) => {
        const userId = (request as any).headers['x-user-id'];

        const tickets = await prisma.ticket.findMany({
            where: { asignadoId: userId },
            include: { estado: true, prioridad: true }
        });

        const porEstado: Record<string, number> = {};
        const porPrioridad: Record<string, number> = {};

        for (const t of tickets) {
            const estado = t.estado?.nombre ?? 'Sin estado';
            const prioridad = t.prioridad?.nombre ?? 'Sin prioridad';
            porEstado[estado] = (porEstado[estado] ?? 0) + 1;
            porPrioridad[prioridad] = (porPrioridad[prioridad] ?? 0) + 1;
        }

        return reply.send({
            statusCode: 200,
            intOpCode: 'MS-TICKETS-STATS-OK',
            data: [{
                total: tickets.length,
                porEstado,
                porPrioridad
            }]
        });
    });
}