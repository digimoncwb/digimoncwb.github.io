import type { SiteAuth } from '../contracts';

export async function prepareAuditExport(
    auth: SiteAuth,
    filters: Record<string, unknown>,
    signal: AbortSignal,
    progress: (rows: number, total: number) => void
) {
    const job = await auth.rpc<{ id: string; total: number; until: string }>(
        'admin_begin_audit_export',
        filters
    );
    const events: unknown[] = [];
    let cursor: number | null = null;
    let bytes = 0;
    try {
        for (;;) {
            signal.throwIfAborted();
            const response = await auth.request('/rest/v1/rpc/admin_audit_export_page', {
                method: 'POST',
                body: JSON.stringify({ p_export_id: job.id, p_cursor: cursor }),
                signal
            });
            if (!response.ok)
                throw Error(
                    'Não foi possível ler a exportação. Nenhum arquivo parcial foi preparado.'
                );
            const page = (await response.json()) as {
                events: unknown[];
                next_cursor: number | null;
                done: boolean;
            };
            bytes += new TextEncoder().encode(JSON.stringify(page.events)).byteLength;
            if (bytes > 50 * 1024 * 1024)
                throw Error('O arquivo excede 50 MB. Reduza o período ou refine os filtros.');
            events.push(...page.events);
            progress(events.length, job.total);
            if (events.length > job.total)
                throw Error('A exportação mudou durante a leitura. Gere um novo arquivo.');
            if (page.done) break;
            if (!page.next_cursor || page.next_cursor === cursor)
                throw Error('Cursor de exportação inválido.');
            cursor = page.next_cursor;
        }
        signal.throwIfAborted();
        if (events.length !== job.total)
            throw Error('A retenção alterou o intervalo durante a leitura. Gere um novo arquivo.');
        await auth.rpc('admin_finish_audit_export', {
            p_export_id: job.id,
            p_rows: events.length,
            p_aborted: false
        });
        return {
            schema_version: 1,
            export_id: job.id,
            prepared_at: new Date().toISOString(),
            filters: { ...filters, p_to: job.until },
            total: events.length,
            events
        };
    } catch (error) {
        await auth
            .rpc('admin_finish_audit_export', {
                p_export_id: job.id,
                p_rows: events.length,
                p_aborted: true
            })
            .catch(() => {});
        throw error;
    }
}
