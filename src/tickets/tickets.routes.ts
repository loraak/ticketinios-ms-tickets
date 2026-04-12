import { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { resolverNombres } from '../services/UsuarioService.js';
import { tienePermisoEnGrupo } from '../services/GrupoPermisoService.js';

export async function ticketRoutes(app: FastifyInstance) {
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

    app.get('/', {
        schema: {
            querystring: {
                type: 'object',
                required: ['grupoId'],
                properties: {
                    grupoId: { type: 'string', format: 'uuid', description: 'ID del grupo' }
                }
            }
        }
    }, async (request, reply) => {
        const { grupoId } = request.query as { grupoId?: string };

        if (!grupoId) {
            return reply.code(400).send({
                statusCode: 400,
                intOpCode: 'MS-TICKETS-BAD-REQUEST',  // ← formato consistente
                data: [{ message: 'grupoId requerido' }]
            });
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
            tickets.flatMap((t: any) => [t.autorId, t.asignadoId]).filter((id: string | null): id is string => !!id)
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

    app.get('/:id/comentarios', async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) return reply.code(404).send({
            statusCode: 404,
            intOpCode: 'MS-TICKETS-NOT-FOUND',
            data: [{ message: 'Ticket no encontrado.' }]
        });

        if (!await tienePermisoEnGrupo(ticket.grupoId!, userId, 'grupos:ver_especifico')) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'No tienes acceso a este grupo.' }]
            });
        }
        const comentarios = await prisma.comentarios.findMany({
            where: { ticket_id: id },
            orderBy: { creado_en: 'asc' }
        });

        const mapaUsuarios = await resolverNombres(
            comentarios.map((c: any) => c.autor_id).filter(Boolean) as string[]
        );

        const data = comentarios.map(c => ({
            id:       c.id,
            texto:    c.texto,
            autor:    mapaUsuarios[c.autor_id] ?? c.autor_id,
            autorId:  c.autor_id,
            fecha:    c.creado_en
        }));

        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-COMENTARIOS-OK', data });
    });

    app.get('/:id/historial', async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) return reply.code(404).send({
            statusCode: 404,
            intOpCode: 'MS-TICKETS-NOT-FOUND',
            data: [{ message: 'Ticket no encontrado.' }]
        });

        if (!await tienePermisoEnGrupo(ticket.grupoId!, userId, 'grupos:ver_especifico')) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'No tienes acceso a este grupo.' }]
            });
        }

        const historial = await prisma.historial_tickets.findMany({
            where: { ticket_id: id },
            orderBy: { creado_en: 'desc' }
        });

        const mapaUsuarios = await resolverNombres(
            historial.map(h => h.usuario_id).filter(Boolean)
        );

        const data = historial.map(h => ({
            id:      h.id,
            accion:  h.accion,
            usuario: mapaUsuarios[h.usuario_id] ?? h.usuario_id,
            fecha:   h.creado_en
        }));

        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-HISTORIAL-OK', data });
    });

    app.post('/', {
        schema: {
            body: {
                type: 'object',
                required: ['grupoId', 'titulo', 'estadoId', 'prioridadId', 'asignadoId'],
                properties: {
                    grupoId:     { type: 'string', format: 'uuid' },
                    titulo:      { type: 'string' },
                    descripcion: { type: 'string' },
                    asignadoId:  { type: 'string', format: 'uuid' },
                    estadoId:    { type: 'string', format: 'uuid' },
                    prioridadId: { type: 'string', format: 'uuid' },
                    fechaFinal:  { type: 'string', format: 'date' }
                }
            }
        }
    }, async (request, reply) => {
        const userId = (request as any).headers['x-user-id'];
        const { grupoId, titulo, descripcion, asignadoId, estadoId, prioridadId, fechaFinal } 
            = request.body as any;
        if (!await tienePermisoEnGrupo(grupoId, userId, 'tickets:crear')) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'No tienes permiso para crear tickets en este grupo.' }]
        });
    }

        if (!grupoId || !titulo) {
            return reply.code(400).send({
                statusCode: 400,
                intOpCode: 'MS-TICKETS-BAD-REQUEST',
                data: [{ message: 'grupoId y titulo son requeridos' }]
            });
        }

        try {
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
                descripcion: ticket.descripcion,
                estado:      ticket.estado?.nombre,
                prioridad:   ticket.prioridad?.nombre,
                autorId:     ticket.autorId,
                asignadoId:  ticket.asignadoId,
                fechaFinal:  ticket.fechaFinal,
                creadoEn:    ticket.creadoEn,
            }]
            });
        } catch (err: any) {
            if (err.code === 'P2003') {
                return reply.code(400).send({
                    statusCode: 400,
                    intOpCode: 'MS-TICKETS-FK-ERROR',
                    data: [{ message: 'Uno o más IDs referenciados no existen (grupo, estado, prioridad o usuario).' }]
                });
            }
            return reply.code(500).send({
                statusCode: 500,
                intOpCode: 'MS-TICKETS-ERROR',
                data: [{ message: 'Error inesperado.' }]
            });
        }
        });

    app.patch('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ticket' }
                }
            },
            body: {
                type: 'object',
                required: ['estado'],
                properties: {
                    estado: { type: 'string', description: 'Nombre del estado (ej: Pendiente, En Progreso)' }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];
        const { estado } = request.body as { estado: string };

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) return reply.code(404).send({
            statusCode: 404,
            intOpCode: 'MS-TICKETS-NOT-FOUND',
            data: [{ message: 'Ticket no encontrado.' }]
        });

        if (ticket.autorId !== userId && ticket.asignadoId !== userId) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'Solo el creador o la persona asignada pueden cambiar el estado.' }]
            });
        }

        const estadoObj = await prisma.estado.findFirst({ where: { nombre: estado } });
        if (!estadoObj) return reply.code(400).send({
            statusCode: 400,
            intOpCode: 'MS-TICKETS-BAD-REQUEST',
            data: [{ message: 'Estado inválido.' }]
        });

        const ticketActualizado = await prisma.ticket.update({
            where: { id },
            data: { estadoId: estadoObj.id },
            include: { estado: true }
        });

        await prisma.historial_tickets.create({
            data: { ticket_id: id, usuario_id: userId, accion: `Cambió estado a "${estado}"` }
        }).catch(err => console.error('error historial:', err));

        return reply.send({
            statusCode: 200,
            intOpCode: 'MS-TICKETS-UPDATE-OK',
            data: [{ id: ticketActualizado.id, estado: ticketActualizado.estado?.nombre }]
        });
    });

    app.put('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ticket' }
                }
            },
            body: {
                type: 'object',
                required: ['titulo', 'estadoId', 'prioridadId', 'asignadoId'],
                properties: {
                    titulo:      { type: 'string' },
                    descripcion: { type: 'string' },
                    asignadoId:  { type: 'string', format: 'uuid' },
                    estadoId:    { type: 'string', format: 'uuid' },
                    prioridadId: { type: 'string', format: 'uuid' },
                    fechaFinal:  { type: 'string', format: 'date' }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];
        const { titulo, descripcion, asignadoId, estadoId, prioridadId, fechaFinal } = request.body as any;

        try {
            const ticket = await prisma.ticket.findUnique({ where: { id } });

            if (!ticket) return reply.code(404).send({
                statusCode: 404,
                intOpCode: 'MS-TICKETS-NOT-FOUND',
                data: [{ message: 'Ticket no encontrado' }]
            });

            if (!await tienePermisoEnGrupo(ticket.grupoId!, userId, 'tickets:editar')) {
                return reply.code(403).send({
                    statusCode: 403,
                    intOpCode: 'MS-TICKETS-FORBIDDEN',
                    data: [{ message: 'No tienes permiso para editar tickets en este grupo.' }]
                });
            }

            if (ticket.autorId !== userId) return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'Solo el creador puede editar este ticket.' }]
            });

            const actualizado = await prisma.ticket.update({
                where: { id },
                data: {
                    titulo,
                    descripcion,
                    asignadoId,
                    estadoId,
                    prioridadId,
                    fechaFinal: fechaFinal ? new Date(fechaFinal) : null
                },
                include: { estado: true, prioridad: true }
            });

            try {
                await prisma.historial_tickets.create({
                    data: { ticket_id: id, usuario_id: userId, accion: 'Editó el ticket' }
                });
            } catch (err) {
                console.error('error al crear historial:', err);
            }

            return reply.send({
                statusCode: 200,
                intOpCode: 'MS-TICKETS-UPDATE-OK',
                data: [{
                    id:          actualizado.id,
                    titulo:      actualizado.titulo,
                    descripcion: actualizado.descripcion,
                    estado:      actualizado.estado?.nombre,
                    prioridad:   actualizado.prioridad?.nombre,
                    autorId:     actualizado.autorId,
                    asignadoId:  actualizado.asignadoId,
                    fechaFinal:  actualizado.fechaFinal,
                    creadoEn:    actualizado.creadoEn,
                }]
            });

        } catch (err: any) {
            if (err.code === 'P2003') {
                return reply.code(400).send({
                    statusCode: 400,
                    intOpCode: 'MS-TICKETS-FK-ERROR',
                    data: [{ message: 'Uno o más IDs referenciados no existen (estado, prioridad o usuario).' }]
                });
            }
            return reply.code(500).send({
                statusCode: 500,
                intOpCode: 'MS-TICKETS-ERROR',
                data: [{ message: 'Error inesperado.' }]
            });
        }
    });

    // DELETE /api/tickets/:id
    app.delete('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) return reply.code(404).send({
            statusCode: 404,
            intOpCode: 'MS-TICKETS-NOT-FOUND',
            data: [{ message: 'Ticket no encontrado' }]
        });

        if (ticket.autorId !== userId) return reply.code(403).send({
            statusCode: 403,
            intOpCode: 'MS-TICKETS-FORBIDDEN',
            data: [{ message: 'Solo el creador puede eliminar este ticket.' }]
        });

        if (!await tienePermisoEnGrupo(ticket.grupoId!, userId, 'tickets:eliminar')) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'No tienes permiso para eliminar tickets en este grupo.' }]
            });
        }

        await prisma.ticket.delete({ where: { id } });

        return reply.send({ statusCode: 200, intOpCode: 'MS-TICKETS-DELETE-OK', data: [] });
    });

    app.post('/:id/comentarios', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ticket' }
                }
            },
            body: {
                type: 'object',
                required: ['texto'],
                properties: {
                    texto: { type: 'string', description: 'Contenido del comentario' }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).headers['x-user-id'];
        const { texto } = request.body as { texto: string };

        if (!texto?.trim()) return reply.code(400).send({
            statusCode: 400,
            intOpCode: 'MS-TICKETS-BAD-REQUEST',
            data: [{ message: 'El texto es requerido.' }]
        });

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) return reply.code(404).send({
            statusCode: 404,
            intOpCode: 'MS-TICKETS-NOT-FOUND',
            data: [{ message: 'Ticket no encontrado.' }]
        });

        if (!await tienePermisoEnGrupo(ticket.grupoId!, userId, 'tickets:comentario')) {
            return reply.code(403).send({
                statusCode: 403,
                intOpCode: 'MS-TICKETS-FORBIDDEN',
                data: [{ message: 'No tienes permiso para comentar en tickets de este grupo.' }]
            });
        }

        const comentario = await prisma.comentarios.create({
            data: { ticket_id: id, autor_id: userId, texto }
        });

        await prisma.historial_tickets.create({
            data: { ticket_id: id, usuario_id: userId, accion: 'Agregó un comentario' }
        });

        return reply.code(201).send({
            statusCode: 201,
            intOpCode: 'MS-TICKETS-COMENTARIO-OK',
            data: [{ id: comentario.id, texto: comentario.texto, autorId: comentario.autor_id, fecha: comentario.creado_en }]
        });
    });
}