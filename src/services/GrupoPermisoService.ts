const GRUPOS_SERVICE_URL = process.env.GRUPOS_SERVICE_URL ?? 'http://127.0.0.1:8082';
const SERVICE_KEY = process.env.SERVICE_KEY ?? '';

export async function tienePermisoEnGrupo(
    grupoId: string,
    usuarioId: string,
    permiso: string
): Promise<boolean> {
    try {
        const res = await fetch(
            `${GRUPOS_SERVICE_URL}/api/grupos/${grupoId}/permisos`,
            {
                headers: {
                    'X-User-Id':      usuarioId,
                    'X-Service-Key':  SERVICE_KEY
                }
            }
        );
        if (!res.ok) return false;
        const data = await res.json();
        return (data.data ?? []).includes(permiso);
    } catch {
        return false;
    }
}