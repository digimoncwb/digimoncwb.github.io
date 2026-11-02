(function initFeedbackFeature() {
    'use strict';

    const TYPE_CONFIG = {
        bug: {
            title: 'Reportar um bug',
            description: 'Conte o que aconteceu e, se possível, como reproduzir o problema.',
            placeholder: 'O que aconteceu? O que você esperava que acontecesse?'
        },
        suggestion: {
            title: 'Enviar uma sugestão',
            description: 'Compartilhe uma ideia para melhorar o DIGIMON CWB.',
            placeholder: 'Descreva sua sugestão...'
        }
    };

    let requestId = '';
    let openedAt = 0;
    let sending = false;

    function start() {
        const modal = document.getElementById('feedbackModal');
        const form = document.getElementById('feedbackForm');
        if (!modal || !form) return;

        document.querySelectorAll('[data-feedback-type]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                openFeedbackModal(link.dataset.feedbackType);
            });
        });
        const syncAccount = () => {
            const user = window.digistatsAuth?.getSnapshot().user;
            document.querySelectorAll('[data-feedback-type]').forEach((link) => {
                link.hidden = !user;
            });
            if (!user) modal.classList.remove('active');
        };
        window.digistatsAuth?.subscribe(syncAccount);
        syncAccount();
        document.getElementById('feedbackCloseX')?.addEventListener('click', closeFeedbackModal);
        document.getElementById('feedbackCancel')?.addEventListener('click', closeFeedbackModal);
        form.addEventListener('submit', submitFeedback);
    }

    function openFeedbackModal(type) {
        const user = window.digistatsAuth?.getSnapshot().user;
        const config = TYPE_CONFIG[type];
        const modal = document.getElementById('feedbackModal');
        if (!config || !modal || sending || !user) return;
        const email = document.getElementById('feedbackContactEmail');
        email.value = user.email || '';
        email.readOnly = true;
        requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        openedAt = Date.now();
        document.getElementById('feedbackType').value = type;
        document.getElementById('feedbackModalTitle').textContent = config.title;
        document.getElementById('feedbackModalDescription').textContent = config.description;
        document.getElementById('feedbackMessage').placeholder = config.placeholder;
        document.getElementById('feedbackStatus').textContent = '';
        modal.classList.add('active');
        document.getElementById('feedbackMessage').focus();
    }

    function closeFeedbackModal() {
        if (sending) return;
        document.getElementById('feedbackModal')?.classList.remove('active');
    }

    async function submitFeedback(event) {
        event.preventDefault();
        if (sending) return;
        const user = window.digistatsAuth?.getSnapshot().user;
        const token = window.digistatsAuth?.getAccessToken();
        if (!user || !token) return;
        const form = event.currentTarget;
        const type = document.getElementById('feedbackType').value;
        const message = document.getElementById('feedbackMessage').value.trim();
        const contactEmail = user.email || '';
        const website = document.getElementById('feedbackWebsite').value;
        const status = document.getElementById('feedbackStatus');
        const submit = document.getElementById('feedbackSubmit');

        if (!TYPE_CONFIG[type] || message.length < 10) {
            status.textContent = 'Escreva uma mensagem com pelo menos 10 caracteres.';
            status.className = 'feedback-status is-error';
            return;
        }

        sending = true;
        submit.disabled = true;
        submit.textContent = 'Enviando...';
        status.textContent = '';
        status.className = 'feedback-status';

        try {
            const config = window.APP_CONFIG || {};
            const response = await fetch(`${config.SUPABASE_URL}/functions/v1/send-feedback`, {
                method: 'POST',
                headers: {
                    ...window.createSupabaseHeaders(),
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    request_id: requestId,
                    feedback_type: type,
                    message,
                    contact_email: contactEmail || null,
                    page_url: window.location.href,
                    app_version: window.APP_VERSION || null,
                    user_agent: navigator.userAgent,
                    website,
                    opened_at: openedAt
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(payload.error || `Falha no envio (${response.status})`);

            status.textContent = 'Obrigado! Sua mensagem foi enviada.';
            status.className = 'feedback-status is-success';
            form.reset();
            setTimeout(() => {
                sending = false;
                submit.disabled = false;
                submit.textContent = 'Enviar';
                closeFeedbackModal();
            }, 1200);
        } catch (error) {
            status.textContent = error.message || 'Não foi possível enviar. Tente novamente.';
            status.className = 'feedback-status is-error';
            sending = false;
            submit.disabled = false;
            submit.textContent = 'Enviar';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
