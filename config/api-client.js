// Shared API helpers for Supabase REST calls.
(function initApiClient() {
    function getSupabaseBaseUrl() {
        return window.APP_CONFIG?.SUPABASE_URL || '';
    }

    function getDefaultHeaders(extraHeaders) {
        if (window.createSupabaseHeaders) {
            return window.createSupabaseHeaders(extraHeaders);
        }
        return {
            'Content-Type': 'application/json',
            ...(extraHeaders || {})
        };
    }

    async function supabaseRequest(path, options) {
        const baseUrl = getSupabaseBaseUrl();
        if (!baseUrl) {
            throw new Error('Supabase base URL is not configured.');
        }

        const requestOptions = options || {};
        if (window.digistatsAuth?.getSnapshot().enabled) {
            if (!['GET', 'HEAD'].includes((requestOptions.method || 'GET').toUpperCase())) {
                await window.digistatsAuth.requireMember();
            }
            return window.digistatsAuth.request(path, requestOptions);
        }
        const headers = getDefaultHeaders(requestOptions.headers);
        const response = await fetch(`${baseUrl}${path}`, {
            ...requestOptions,
            headers
        });
        return response;
    }

    window.supabaseApi = Object.freeze({
        request: supabaseRequest,
        get: (path, headers) => supabaseRequest(path, { method: 'GET', headers }),
        post: (path, body, headers) =>
            supabaseRequest(path, { method: 'POST', body: JSON.stringify(body), headers }),
        patch: (path, body, headers) =>
            supabaseRequest(path, { method: 'PATCH', body: JSON.stringify(body), headers }),
        del: (path, headers) => supabaseRequest(path, { method: 'DELETE', headers })
    });
})();
