// Centralized client-side Supabase configuration.
(function initSupabaseConfig() {
    const config = {
        SUPABASE_URL: 'https://vllqakohumoinpdwnsqa.supabase.co',
        SUPABASE_ANON_KEY:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsbHFha29odW1vaW5wZHduc3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjIwMTAsImV4cCI6MjA4NjE5ODAxMH0.uXSjwwM_RqeNWJwRQM8We9WEsWsz3C2JfdhlZXNoTKM'
    };

    window.APP_CONFIG = Object.freeze(config);

    window.createSupabaseHeaders = function createSupabaseHeaders(extraHeaders) {
        return {
            apikey: config.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.digistatsAuth?.getAccessToken() || config.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            ...(extraHeaders || {})
        };
    };
})();
