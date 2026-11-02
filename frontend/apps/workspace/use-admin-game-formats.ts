import { useCallback, useEffect, useRef, useState } from 'react';
import type { Format } from '../../contracts';
import { loadAdminGameFormats } from './format-status-service';

export function useAdminGameFormats(active: boolean, identity: string) {
    const [formats, setFormats] = useState<Format[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const request = useRef(0);
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            if (!active) return;
            const version = ++request.current;
            setLoading(true);
            setError('');
            try {
                const rows = await loadAdminGameFormats(signal);
                if (!signal?.aborted && version === request.current) setFormats(rows);
            } catch (error) {
                if (!signal?.aborted && version === request.current)
                    setError((error as Error).message);
            } finally {
                if (!signal?.aborted && version === request.current) setLoading(false);
            }
        },
        [active, identity]
    );
    useEffect(() => {
        setFormats(null);
        setError('');
        setLoading(false);
        const controller = new AbortController();
        void refresh(controller.signal);
        return () => {
            ++request.current;
            controller.abort();
        };
    }, [refresh]);
    return {
        formats: active ? formats : null,
        loading: active && loading,
        error: active ? error : '',
        refresh
    };
}
