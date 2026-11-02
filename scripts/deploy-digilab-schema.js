/* global __dirname */
// Apply the reviewed DigiLab migrations before deploying their Edge Functions.
// Management API reference: https://supabase.com/docs/reference/api/v1-run-a-query
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    if (!token || !/^[a-z0-9]{20}$/.test(project || '')) {
        throw new Error('Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID.');
    }
    const migrations = [
        '20260924010000_reliable_digilab_sync.sql',
        '20261005010000_automate_digilab_catalog.sql',
        '20261005020000_schedule_digilab_catalog.sql',
        '20261005030000_digilab_tournaments_every_six_hours.sql',
        '20261005040000_require_digilab_tournament_format.sql',
        '20261005050000_store_digilab_catalog_images.sql',
        '20261006010000_digilab_tournaments_hourly.sql',
        '20261006020000_card_portrait_settings.sql',
        '20261010000000_local_2v2_tournaments.sql',
        '20261101010000_community_tournaments.sql',
        '20261101020000_community_history.sql',
        '20261101030000_community_digilab_reconciliation.sql',
        '20261101040000_community_event_defaults_and_players.sql',
        '20261101050000_community_delete_event.sql',
        '20261101060000_community_bye_game_percentage.sql',
        '20261101070000_community_start_datetime.sql',
        '20261101080000_draft_game_format_visibility.sql',
        '20261101090000_community_play_flow.sql',
        '20261101100000_community_open_enrollment.sql',
        '20261101110000_community_readable_audit.sql',
        '20261101120000_community_automatic_first_round.sql',
        '20261101130000_community_active_notices.sql',
        '20261101140000_community_history_corrections.sql',
        '20261101150000_community_clock_no_reason.sql',
        '20261101160000_community_admin_configuration.sql',
        '20261101170000_community_two_player_events.sql',
        '20261101180000_community_restart_round.sql',
        '20261101190000_community_round_durations.sql',
        '20261101200000_community_resume_round.sql',
        '20261102210000_community_organizer_round_controls.sql',
        '20261102220000_community_player_score_perspective.sql',
        '20261102230000_community_minimum_four_players.sql',
        '20261102233000_admin_account_links.sql',
        '20261102234000_admin_account_role_consistency.sql',
        '20261102235000_community_legal_contact.sql',
        '20261102235500_plain_language_privacy.sql'
    ];
    const query = migrations
        .map((migration) =>
            readFileSync(resolve(__dirname, '../database/migrations', migration), 'utf8')
        )
        .join('\n');
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: globalThis.AbortSignal.timeout(120000)
    });
    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
            `Migration DigiLab: HTTP ${response.status}. ${String(result.message || 'Consulte os logs do Supabase.').replaceAll(token, '[redacted]')}`
        );
    }
    console.log('Migration DigiLab aplicada; as funções podem ser publicadas.');
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
module.exports = { main };
