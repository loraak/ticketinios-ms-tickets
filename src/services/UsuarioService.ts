const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:8081';
const SERVICE_KEY = process.env.SERVICE_KEY ?? '';

    export async function getNombreUsuario(usuarioId: string): Promise<string> {
    try {
        const res = await fetch(`${AUTH_SERVICE_URL}/api/usuarios/${usuarioId}`, {
        headers: { 'X-Service-Key': SERVICE_KEY }
        });
        console.log(`[usuarioService] ${usuarioId} → status: ${res.status}`);
        if (!res.ok) return usuarioId;
        const json = await res.json();
        console.log(`[usuarioService] respuesta:`, json);
        return json.data[0]?.nombreCompleto ?? usuarioId;
    } catch (e) {
        console.error(`[usuarioService] error para ${usuarioId}:`, e);
        return usuarioId;
    }
    }

    export async function resolverNombres(ids: string[]): Promise<Record<string, string>> {
    const idsUnicos = [...new Set(ids.filter(Boolean))];
    const entradas = await Promise.all(
        idsUnicos.map(async id => [id, await getNombreUsuario(id)] as [string, string])
    );
    return Object.fromEntries(entradas);
}