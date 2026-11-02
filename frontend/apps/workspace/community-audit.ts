import type { CommunitySnapshot } from '../../shared/community-service';

export function communityAuditDescription(
    record: CommunitySnapshot['audit'][number]
): string | null {
    const details = record.details;
    const actor =
        typeof details.actor_name === 'string'
            ? details.actor_name
            : record.actor
              ? 'Organização'
              : 'Sistema';
    const targets = Array.isArray(details.target_names)
        ? details.target_names.filter((name): name is string => typeof name === 'string')
        : [];
    const names =
        targets.length > 1
            ? `${targets.slice(0, -1).join(', ')} e ${targets[targets.length - 1]}`
            : targets[0];
    switch (record.action) {
        case 'match_before_resolution':
        case 'invalidated_round_snapshot':
        case 'paused_round_snapshot':
            return null;
        case 'create':
            return `${actor} criou o evento.`;
        case 'add_player':
        case 'add_players':
            return `${actor} adicionou ${names || 'jogadores'} ao torneio.`;
        case 'register':
            return `${actor} se inscreveu no torneio.`;
        case 'drop':
            if (details.entry_removed)
                return `${actor} removeu ${names || 'um jogador'} do torneio.`;
            if (names === actor || (!names && !details.entry_id))
                return `${actor} desistiu do torneio.`;
            return `${actor} marcou a desistência de ${names || 'um jogador'}.`;
        case 'configure':
            return `${actor} atualizou as informações do torneio.`;
        case 'publish':
            return `${actor} publicou o torneio.`;
        case 'registration':
            return `${actor} ${details.open ? 'abriu' : 'fechou'} as inscrições.`;
        case 'open_registration_on_create':
            return 'Sistema abriu as inscrições do torneio.';
        case 'start':
            return `${actor} iniciou o torneio.`;
        case 'pair':
            return `${actor} publicou os pareamentos de uma rodada.`;
        case 'start_round':
            return `${actor} iniciou uma rodada.`;
        case 'close_round':
            return `${actor} encerrou uma rodada.`;
        case 'pause_round':
            return `${actor} pausou a rodada ${details.round}. O tempo, as mesas e os placares foram salvos.`;
        case 'resume_round':
            return `${actor} continuou a rodada ${details.round} de onde parou, preservando mesas, placares e tempo restante.`;
        case 'restart_round':
            return `${actor} refez os pareamentos da rodada ${details.round} e reiniciou o relógio.`;
        case 'reopen_round':
            return `${actor} reabriu a última rodada para corrigir resultados.`;
        case 'undo_round':
            return `${actor} invalidou a última rodada.`;
        case 'adjust_clock':
            return `${actor} ajustou o relógio em ${Number(details.seconds || 0) / 60} minutos.`;
        case 'propose':
            return `${actor} enviou um placar para confirmação do adversário.`;
        case 'contest':
            return `${actor} refutou o placar e enviou uma nova proposta.`;
        case 'confirm':
            return `${actor} confirmou o placar do adversário.`;
        case 'resolve':
            return `${actor} registrou ou corrigiu um resultado.`;
        case 'correct_result':
            return `${actor} corrigiu ${details.player_one || 'Player 1'} vs ${details.player_two || 'Player 2'} na rodada ${details.round} para ${details.wins}–${details.losses}–${details.draws}.${details.final_review_required ? ' A classificação final precisa ser confirmada novamente.' : ''}`;
        case 'deck':
            return `${actor} atualizou o deck de ${names || 'sua inscrição'}.`;
        case 'finish':
            return `${actor} confirmou a classificação final e encerrou o torneio.`;
        case 'cancel':
            return `${actor} cancelou o torneio.`;
        case 'export':
            return `${actor} gerou os resultados para copiar ao DigiLab.`;
        case 'link_digilab':
            return `${actor} vinculou o resultado oficial do DigiLab.`;
        case 'checkin':
            return `${actor} confirmou a presença de ${names || 'um jogador'}.`;
        case 'checkin_window':
            return `${actor} ${details.open ? 'abriu' : 'fechou'} o antigo check-in.`;
        default:
            return `${actor} atualizou o torneio.`;
    }
}
