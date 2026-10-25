'use strict';

// Same credential derivation, session key and admin_users verification as Admin.
const adminSession = {
    session: null,
    profile: null,
    async restore() {
        try {
            if (window.digistatsAuth?.getSnapshot().enabled) {
                await window.digistatsAuth.refresh();
                await this.verify();
                return true;
            }
            this.session = JSON.parse(sessionStorage.getItem('digistats.admin.session') || 'null');
            if (!this.session) return false;
            await this.refresh();
            await this.verify();
            return true;
        } catch {
            this.clear();
            return false;
        }
    },
    clear() {
        this.session = null;
        this.profile = null;
        sessionStorage.removeItem('digistats.admin.session');
    },
    persist() {
        sessionStorage.setItem('digistats.admin.session', JSON.stringify(this.session));
    },
    async request(path, options = {}) {
        if (window.digistatsAuth?.getSnapshot().enabled)
            return window.digistatsAuth.request(path, options);
        return fetch(`${window.APP_CONFIG.SUPABASE_URL}${path}`, {
            ...options,
            headers: window.createSupabaseHeaders({
                ...options.headers,
                Authorization: `Bearer ${this.session?.access_token || window.APP_CONFIG.SUPABASE_ANON_KEY}`
            })
        });
    },
    async verify() {
        if (window.digistatsAuth?.getSnapshot().enabled) {
            const account = window.digistatsAuth.getSnapshot();
            if (!account.isAdmin) throw new Error('Acesso administrativo não autorizado.');
            this.profile = account.profile;
            return;
        }
        if (!this.session?.user?.id || !this.session.access_token)
            throw new Error('Sessão inválida.');
        const query = new URLSearchParams({
            select: 'user_id,username,display_name',
            user_id: `eq.${this.session.user.id}`
        });
        const response = await this.request(`/rest/v1/admin_users?${query}`);
        const rows = await response.json();
        if (
            !response.ok ||
            !Array.isArray(rows) ||
            rows.length !== 1 ||
            rows[0].user_id !== this.session.user.id
        ) {
            this.clear();
            throw new Error('Acesso administrativo não autorizado.');
        }
        this.profile = rows[0];
    },
    async refresh() {
        if (window.digistatsAuth?.getSnapshot().enabled) {
            await window.digistatsAuth.refresh();
            await this.verify();
            return;
        }
        if (!this.session?.refresh_token) throw new Error('Entre para continuar.');
        if (Number(this.session.expires_at) * 1000 - Date.now() > 60000) return;
        const response = await this.request('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: this.session.refresh_token })
        });
        const payload = await response.json();
        if (!response.ok || !payload.access_token) {
            this.clear();
            throw new Error('Sessão expirada. Entre novamente.');
        }
        this.session = payload;
        this.persist();
    },
    async login(password) {
        if (window.digistatsAuth?.getSnapshot().enabled) {
            window.digistatsAuth.open('login');
            throw new Error('Entre com o e-mail e a senha da sua conta no site.');
        }
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        const hash = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
        const candidates = [`p-${hash.slice(0, 40)}@admin.digistats.local`];
        if (/^[a-z0-9_-]{3,40}$/.test(password.trim().toLowerCase()))
            candidates.push(`${password.trim().toLowerCase()}@admin.digistats.local`);
        this.session = null;
        for (const email of candidates) {
            const response = await this.request('/auth/v1/token?grant_type=password', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            const payload = await response.json();
            if (response.ok && payload.access_token) {
                this.session = payload;
                break;
            }
        }
        if (!this.session) throw new Error('Senha de acesso inválida.');
        try {
            await this.verify();
            this.persist();
        } catch (error) {
            this.clear();
            throw error;
        }
    },
    async logout() {
        if (window.digistatsAuth?.getSnapshot().enabled) {
            await window.digistatsAuth.logout();
            this.clear();
            return;
        }
        try {
            if (this.session) await this.request('/auth/v1/logout', { method: 'POST' });
        } catch {
            /* End the local session even if the network is unavailable. */
        } finally {
            this.clear();
        }
    },
    async saveStore(id, name) {
        if (!name.trim()) throw new Error('Informe o nome da loja.');
        await this.refresh();
        await this.verify();
        const response = await this.request(`/rest/v1/stores?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ name: name.trim() })
        });
        const rows = await response.json();
        if (!response.ok || !Array.isArray(rows) || rows.length !== 1)
            throw new Error(
                'Não foi possível salvar a loja. Confira sua permissão administrativa.'
            );
        return rows[0];
    }
};
if (typeof window !== 'undefined') window.digistatsAdminSession = adminSession;
