export interface Feedback {
    type: 'bug' | 'suggestion';
    message: string;
    email: string;
    website: string;
    id: string;
    openedAt: number;
}
export async function sendFeedback(feedback: Feedback) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const page = new URL(location.href);
        page.search = '';
        // Auth callbacks can temporarily carry session tokens in the fragment.
        if (
            !/^#(?:overview|tournaments|meta|decks|players|admin|manage|statistics|posts|builder)$/.test(
                page.hash
            )
        )
            page.hash = '';
        const response = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/functions/v1/send-feedback`,
            {
                method: 'POST',
                signal: controller.signal,
                headers: { ...window.createSupabaseHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: feedback.id,
                    feedback_type: feedback.type,
                    message: feedback.message.trim(),
                    contact_email: feedback.email.trim() || null,
                    page_url: page.href,
                    app_version: window.APP_VERSION || null,
                    user_agent: navigator.userAgent,
                    website: feedback.website,
                    opened_at: feedback.openedAt
                })
            }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(payload.error || 'Não foi possível enviar. Tente novamente.');
        if (payload.ok !== true) throw Error('O servidor não confirmou o envio. Tente novamente.');
    } catch (error) {
        if (controller.signal.aborted) throw Error('O envio demorou demais. Tente novamente.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
