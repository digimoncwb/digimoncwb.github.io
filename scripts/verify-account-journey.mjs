// Explicitly authorized, isolated live Auth verification. No email-sending endpoint is
// called. Tokens, generated links, passwords and service keys stay in memory.
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const runId = randomUUID().replaceAll('-', '');
const steps = [];
let currentStep = 'preflight';
const ensure = (condition, label) => {
    if (!condition) {
        const error = Error(label);
        error.safeLabel = label;
        throw error;
    }
};
async function step(name, execute) {
    currentStep = name;
    try {
        await execute();
        steps.push({ name, passed: true });
    } catch (error) {
        steps.push({ name, passed: false });
        throw error;
    }
}
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function runLiveAccountJourney() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    ensure(process.env.ACCOUNT_JOURNEY_AUTHORIZED === 'true', 'Explicit authorization required');
    ensure(token && /^[a-z0-9]{20}$/.test(project || ''), 'Invalid project configuration');
    const { chromium } = await import('playwright');
    const base = `https://${project}.supabase.co`;
    const site = 'https://digimoncwb.github.io/';
    const returnUrl = site + 'index.html#overview';
    const email = `qa-journey-${runId}@example.invalid`;
    const newEmail = `qa-journey-new-${runId}@example.invalid`;
    const displayName = `QA Jornada ${runId.slice(0, 8)}`;
    const username = `qa_${runId}`;
    const password = `Qa!${randomBytes(24).toString('base64url')}`;
    const replacementPassword = `NewQa!${randomBytes(24).toString('base64url')}`;
    let admin, ordinary, browser, page, signup, userId, emailLinks;
    let cleanupVerified = false;
    let failure = null;
    let fixtureFailure = null;
    let callbackShape = null;
    const userEndpointStatuses = [];
    async function management(path, body) {
        const response = await fetch(`https://api.supabase.com/v1/projects/${project}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000)
        });
        ensure(response.ok, 'Management request refused');
        return response.json();
    }
    async function generatedLink(input) {
        const result = await admin.auth.admin.generateLink({
            ...input,
            options: { ...input.options, redirectTo: returnUrl }
        });
        ensure(
            !result.error && result.data?.user?.id && result.data?.properties?.action_link,
            'Generate-link failed'
        );
        ensure(
            result.data.user.email === input.email,
            'Generated link belongs to an unexpected identity'
        );
        return result.data;
    }
    try {
        await step('preflight_no_email_sending', async () => {
            const config = await management('/config/auth');
            ensure(
                config.mailer_autoconfirm === false &&
                    config.mailer_secure_email_change_enabled === true,
                'Expected verification settings absent'
            );
            ensure(
                config.hook_send_email_enabled !== true,
                'Custom email hook prevents isolated test'
            );
            ensure(
                !Object.entries(config).some(
                    ([key, value]) =>
                        /^mailer_notifications_.*_enabled$/.test(key) && value === true
                ),
                'Security email notifications must not be triggered by tests'
            );
            const keys = await management('/api-keys?reveal=true');
            const anonKey = keys.find((key) => key.name === 'anon')?.api_key;
            const serviceKey = keys.find((key) => key.name === 'service_role')?.api_key;
            ensure(anonKey && serviceKey, 'Required project keys unavailable');
            const options = {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
            };
            admin = createClient(base, serviceKey, options);
            ordinary = createClient(base, anonKey, options);
            const status = await ordinary.rpc('site_account_status');
            ensure(
                !status.error && status.data?.legal_ready,
                'Published legal documents unavailable'
            );
            browser = await chromium.launch({
                headless: true,
                ...(process.env.QA_CHROME_EXECUTABLE
                    ? { executablePath: process.env.QA_CHROME_EXECUTABLE }
                    : {})
            });
            page = await browser.newPage({
                viewport: { width: 1280, height: 900 },
                serviceWorkers: 'block'
            });
            page.setDefaultTimeout(30000);
            page.on('response', (response) => {
                const source = new URL(response.url());
                if (source.origin === base && source.pathname === '/auth/v1/user')
                    userEndpointStatuses.push(response.status());
                if (source.origin !== base || source.pathname !== '/auth/v1/verify') return;
                const destination = response.headers().location;
                if (!destination) return;
                const target = new URL(destination);
                const params = new URLSearchParams(target.hash.slice(1));
                const kind = params.get('type');
                callbackShape = {
                    correct_origin: target.origin === new URL(site).origin,
                    access_token_present: params.has('access_token'),
                    refresh_token_present: params.has('refresh_token'),
                    code_present: target.searchParams.has('code'),
                    type: ['signup', 'recovery', 'invite', 'email_change', 'magiclink'].includes(
                        kind
                    )
                        ? kind
                        : 'other_or_missing',
                    route_prefix_in_hash: target.hash.startsWith('#overview'),
                    error_present: params.has('error') || target.searchParams.has('error')
                };
            });
            // Route only the email-sending parts through generateLink. Auth
            // validation, confirmation, sessions, RPCs and password writes use
            // the real hosted service and published frontend.
            await page.route(`${base}/auth/v1/signup**`, async (route) => {
                try {
                    const input = route.request().postDataJSON();
                    ensure(
                        input.email === email && input.password === password,
                        'Unexpected signup identity'
                    );
                    signup = await generatedLink({
                        type: 'signup',
                        email,
                        password,
                        options: { data: input.data }
                    });
                    userId = signup.user.id;
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(signup.user)
                    });
                } catch (error) {
                    fixtureFailure = error.safeLabel || 'Signup fixture failed';
                    await route
                        .fulfill({
                            status: 500,
                            contentType: 'application/json',
                            body: '{"code":"qa_fixture_error"}'
                        })
                        .catch(() => {});
                }
            });
            await page.route(`${base}/auth/v1/user**`, async (route) => {
                if (route.request().method() !== 'PUT') return route.continue();
                const input = route.request().postDataJSON();
                if (!Object.hasOwn(input, 'email')) return route.continue();
                try {
                    ensure(input.email === newEmail, 'Unexpected email-change destination');
                    const jwt = route
                        .request()
                        .headers()
                        .authorization?.replace(/^Bearer /i, '');
                    const authenticated = await ordinary.auth.getUser(jwt);
                    ensure(
                        !authenticated.error && authenticated.data.user.id === userId,
                        'Email change must use the ordinary user JWT'
                    );
                    const current = await generatedLink({
                        type: 'email_change_current',
                        email,
                        newEmail
                    });
                    const replacement = await generatedLink({
                        type: 'email_change_new',
                        email,
                        newEmail
                    });
                    emailLinks = { current, replacement };
                    const result = await admin.auth.admin.getUserById(userId);
                    ensure(!result.error, 'Cannot inspect test email change');
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(result.data.user)
                    });
                } catch (error) {
                    fixtureFailure = error.safeLabel || 'Email-change fixture failed';
                    await route
                        .fulfill({
                            status: 500,
                            contentType: 'application/json',
                            body: '{"code":"qa_fixture_error"}'
                        })
                        .catch(() => {});
                }
            });
        });
        await step('signup_ui_separate_declarations', async () => {
            await page.goto(site, { waitUntil: 'domcontentloaded' });
            await page.locator('.site-account-signup').click();
            const dialog = page.getByRole('dialog');
            await dialog
                .getByRole('textbox', { name: 'Nome de exibição', exact: true })
                .fill(displayName);
            await dialog.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
            await dialog.locator('#site-account-password').fill(password);
            await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();
            ensure(!userId, 'Signup should require all declarations');
            for (const box of await dialog.getByRole('checkbox').all()) await box.check();
            await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();
            await dialog
                .getByText('Confira seu e-mail para confirmar o cadastro.', { exact: true })
                .waitFor();
            ensure(userId && !signup.user.email_confirmed_at, 'Test account must be unconfirmed');
        });
        await step('unconfirmed_login_rejected', async () => {
            const result = await ordinary.auth.signInWithPassword({ email, password });
            ensure(
                result.error?.code === 'email_not_confirmed',
                'Unconfirmed identity was not rejected'
            );
        });
        await step('real_confirmation_link_and_authenticated_acceptance', async () => {
            await page.goto(signup.properties.action_link, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(
                () =>
                    window.digistatsAuth?.getSnapshot().user?.confirmed &&
                    window.digistatsAuth?.getSnapshot().legalCurrent
            );
            const snapshot = await page.evaluate(() => {
                const state = window.digistatsAuth.getSnapshot();
                return {
                    userId: state.user?.id,
                    member: state.isMember,
                    admin: state.isAdmin,
                    legal: state.legalCurrent
                };
            });
            ensure(
                snapshot.userId === userId && snapshot.member && !snapshot.admin && snapshot.legal,
                'Incorrect confirmed account state'
            );
            const replay = await ordinary.auth.verifyOtp({
                token_hash: signup.properties.hashed_token,
                type: 'signup'
            });
            ensure(!!replay.error, 'Confirmation token replay accepted');
        });
        await step('ordinary_account_admin_denied_and_profile_persists', async () => {
            const login = await ordinary.auth.signInWithPassword({ email, password });
            ensure(
                !login.error && login.data.user.id === userId,
                'Confirmed password login failed'
            );
            const denied = await ordinary.rpc('admin_list_site_accounts');
            ensure(!!denied.error, 'Ordinary user reached administrative RPC');
            await ordinary.auth.signOut({ scope: 'local' });
            await page.locator('.site-account-trigger').first().click();
            const dialog = page.getByRole('dialog');
            await dialog.locator('input[name="profile_username"]').fill(username);
            await dialog.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
            await dialog.getByText('Perfil salvo.', { exact: true }).waitFor();
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(
                (expected) => window.digistatsAuth?.getSnapshot().profile?.username === expected,
                username
            );
            await page.goto(site + '?section=accounts#admin', { waitUntil: 'domcontentloaded' });
            await page
                .getByText('Esta área exige uma conta administrativa ativa.', { exact: true })
                .waitFor();
        });
        await step('real_recovery_link_changes_only_test_password', async () => {
            const recovery = await generatedLink({ type: 'recovery', email });
            await page.goto(recovery.properties.action_link, { waitUntil: 'domcontentloaded' });
            const dialog = page.getByRole('dialog');
            await dialog
                .getByRole('heading', { name: 'Definir nova senha', exact: true })
                .waitFor();
            await dialog.getByLabel('Nova senha', { exact: true }).fill(replacementPassword);
            await dialog
                .getByLabel('Confirme a nova senha', { exact: true })
                .fill(replacementPassword);
            await dialog.getByRole('button', { name: 'Salvar senha', exact: true }).click();
            await dialog.getByText('Senha atualizada.', { exact: true }).waitFor();
            const oldLogin = await ordinary.auth.signInWithPassword({ email, password });
            ensure(!!oldLogin.error, 'Old password remained valid');
            const updatedLogin = await ordinary.auth.signInWithPassword({
                email,
                password: replacementPassword
            });
            ensure(
                !updatedLogin.error && updatedLogin.data.user.id === userId,
                'New password did not authenticate the same identity'
            );
            await ordinary.auth.signOut({ scope: 'local' });
        });
        await step('secure_email_change_requires_both_links_and_preserves_identity', async () => {
            const dialog = page.getByRole('dialog');
            await dialog.getByText('Segurança e acesso', { exact: true }).click();
            await dialog.getByRole('textbox', { name: 'Novo e-mail', exact: true }).fill(newEmail);
            await dialog.getByRole('button', { name: 'Alterar e-mail', exact: true }).click();
            await dialog.getByText('Confira os e-mails de confirmação.', { exact: true }).waitFor();
            ensure(emailLinks, 'Email change links were not generated');
            await page.goto(emailLinks.current.properties.action_link, {
                waitUntil: 'domcontentloaded'
            });
            const intermediate = await admin.auth.admin.getUserById(userId);
            ensure(
                !intermediate.error && intermediate.data.user.email === email,
                'One link changed an address despite secure confirmation'
            );
            await page.goto(emailLinks.replacement.properties.action_link, {
                waitUntil: 'domcontentloaded'
            });
            const changed = await admin.auth.admin.getUserById(userId);
            ensure(
                !changed.error &&
                    changed.data.user.email === newEmail &&
                    changed.data.user.id === userId,
                'Email change failed or replaced the identity'
            );
            const login = await ordinary.auth.signInWithPassword({
                email: newEmail,
                password: replacementPassword
            });
            ensure(
                !login.error && login.data.user.id === userId,
                'New address cannot sign into the original identity'
            );
            await ordinary.auth.signOut({ scope: 'local' });
            await page.waitForFunction(
                (expected) => window.digistatsAuth?.getSnapshot().user?.email === expected,
                newEmail
            );
        });
        await step('logout_clears_private_identity', async () => {
            const dialog = page.getByRole('dialog');
            if (await dialog.isVisible())
                await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
            const jwt = await page.evaluate(() => window.digistatsAuth.getAccessToken());
            ensure(jwt, 'Expected a session before logout');
            await page
                .locator('.site-account-menu')
                .getByRole('button', { name: 'Sair da conta', exact: true })
                .click();
            await page.waitForFunction(
                () =>
                    !window.digistatsAuth?.getSnapshot().user &&
                    !window.digistatsAuth?.getSnapshot().profile
            );
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.digistatsAuth?.getSnapshot().initialized);
            ensure(
                !(await page.evaluate(() => window.digistatsAuth.getSnapshot().user)),
                'Logout did not survive reload'
            );
        });
    } catch (error) {
        failure = {
            step: currentStep,
            error_type: error.name || 'Error',
            ...(error.safeLabel ? { reason: error.safeLabel } : {})
        };
        failure.callback_shape = callbackShape;
        failure.fixture_failure = fixtureFailure;
        failure.user_endpoint_statuses = userEndpointStatuses;
        if (page && !page.isClosed()) {
            try {
                failure.browser = await page.evaluate((id) => {
                    const state = window.digistatsAuth?.getSnapshot();
                    const pending = localStorage.getItem(
                        `digistats.pending-signup-declarations.${id}`
                    );
                    const error = state?.error || '';
                    return {
                        hostname: location.hostname,
                        pathname: location.pathname,
                        initialized: !!state?.initialized,
                        available: !!state?.available,
                        loading: !!state?.loading,
                        has_user: !!state?.user,
                        confirmed: !!state?.user?.confirmed,
                        has_profile: !!state?.profile,
                        legal_current: !!state?.legalCurrent,
                        pending_declarations_present: !!pending,
                        error_present: !!error,
                        pkce_error: /pkce/i.test(error),
                        legal_error: /termos|privacidade|aceit|perfil/i.test(error),
                        callback_error: /invalid|expired|expir|token|callback/i.test(error)
                    };
                }, userId || '');
            } catch {
                /* The browser can be on an unavailable external page. */
            }
        }
        if (userId && admin) {
            const inspected = await admin.auth.admin.getUserById(userId);
            failure.server_identity_confirmed = !!inspected.data?.user?.email_confirmed_at;
        }
    } finally {
        currentStep = 'cleanup';
        try {
            if (browser) await browser.close();
            // Recover the exact disposable ID even after an interrupted signup
            // response. Never target accounts outside this run's two addresses.
            const rows = await management('/database/query', {
                query: `select u.id from auth.users u join public.user_profiles p on p.user_id=u.id where u.email in (${literal(email)},${literal(newEmail)}) and p.display_name=${literal(displayName)}`
            });
            const ids = [...new Set([...rows.map((row) => row.id), ...(userId ? [userId] : [])])];
            for (const id of ids) {
                ensure(/^[0-9a-f-]{36}$/i.test(id), 'Invalid disposable identity');
                const result = await admin.auth.admin.deleteUser(id);
                ensure(!result.error, 'Disposable Auth account cleanup failed');
            }
            if (ids.length) {
                const list = ids.map(literal).join(',');
                await management('/database/query', {
                    query: `begin;
                    update public.user_profiles set legal_acceptance_id=null where user_id in (${list}) and auth_user_id is null and display_name=${literal(displayName)};
                    delete from public.site_legal_acceptances where user_id in (${list});
                    delete from public.user_profiles where user_id in (${list}) and auth_user_id is null and display_name=${literal(displayName)};
                    commit;`
                });
                const remaining = await management('/database/query', {
                    query: `select (select count(*) from auth.users where id in (${list}))+(select count(*) from public.user_profiles where user_id in (${list})) as remaining`
                });
                ensure(Number(remaining[0].remaining) === 0, 'Disposable identity still present');
            }
            cleanupVerified = true;
        } catch (error) {
            failure ||= { step: 'cleanup', error_type: error.name || 'Error' };
        }
        console.log(
            JSON.stringify({
                event: 'live_account_journey',
                run_id: runId,
                steps,
                failure,
                disposable_account_removed: cleanupVerified,
                emails_sent: 0,
                public_signup_smtp_call_replaced_by_generate_link: true,
                real_google_identity_login: 'requires_user',
                existing_accounts_changed: false
            })
        );
    }
    if (failure || !cleanupVerified)
        throw Error('Live account journey requires review; see sanitized step results.');
}
if (
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())
)
    runLiveAccountJourney().catch(() => {
        process.exitCode = 1;
    });
