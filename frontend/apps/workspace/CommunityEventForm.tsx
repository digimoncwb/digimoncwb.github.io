import { useEffect, useState } from 'react';
import type { Format, Store } from '../../contracts';
import type { CommunityEvent } from '../../shared/community-service';
import { Dialog } from '../../shared/ListPage';
import { communityFormDateTime, communityFormFormat } from './community-form';
import { CommunityPlayerPicker, type PickedCommunityPlayer } from './CommunityPlayerPicker';

export function CommunityEventForm({
    event,
    formats,
    stores,
    busy,
    error,
    onClose,
    onSave
}: {
    event?: CommunityEvent;
    formats: Format[];
    stores: Store[];
    busy: boolean;
    error: string;
    onClose(): void;
    onSave(payload: Record<string, unknown>): Promise<void>;
}) {
    const [format, setFormat] = useState(
        event ? String(event.format_id) : communityFormFormat(formats)
    );
    const [players, setPlayers] = useState<PickedCommunityPlayer[]>([]);
    const [initialStart] = useState(() =>
        communityFormDateTime(event?.starts_at || new Date(Date.now() + 30 * 60 * 1000))
    );
    useEffect(() => {
        if (!format) setFormat(communityFormFormat(formats));
    }, [formats, format]);
    return (
        <Dialog
            title={event ? 'Editar configuração' : 'Criar torneio da comunidade'}
            onClose={onClose}
            busy={busy}
            closeOnBackdrop={false}
        >
            {error && (
                <p className="community-error" role="alert">
                    {error}
                </p>
            )}
            <form
                className="community-form community-event-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    const startsAt = String(fields.get('starts_at_local'));
                    fields.delete('starts_at_local');
                    void onSave({
                        ...Object.fromEntries(fields),
                        starts_at: startsAt + ':00-03:00',
                        capacity: event?.capacity ?? 32,
                        player_ids: players.map((player) => player.id)
                    });
                }}
            >
                <div className="community-event-fields">
                    <label className="community-event-name">
                        Nome
                        <input
                            name="name"
                            required
                            minLength={3}
                            maxLength={120}
                            defaultValue={event?.name}
                        />
                    </label>
                    <label>
                        Previsão de início (Brasília)
                        <input
                            type="datetime-local"
                            name="starts_at_local"
                            step={60}
                            required
                            defaultValue={initialStart}
                        />
                    </label>
                    <label>
                        Modalidade
                        <select name="modality" defaultValue={event?.modality || 'presencial'}>
                            <option value="presencial">Presencial</option>
                            <option value="online">Online</option>
                        </select>
                    </label>
                    <label>
                        Loja (opcional)
                        <select name="store_id" defaultValue={event?.store_id || ''}>
                            <option value="">Sem loja</option>
                            {stores.map((store) => (
                                <option key={store.id} value={store.id}>
                                    {store.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Local ou sala online
                        <input
                            name="location"
                            maxLength={500}
                            defaultValue={event?.location ?? 'Curitiba, Brazil'}
                        />
                    </label>
                    <label>
                        Tipo
                        <select name="event_type" defaultValue={event?.event_type || 'For Fun'}>
                            {['For Fun', 'Semanal', 'Locals', 'Online', 'Mensal', 'Win-A-Box'].map(
                                (type) => (
                                    <option key={type} value={type}>
                                        {type === 'For Fun' ? 'Casual' : type}
                                    </option>
                                )
                            )}
                        </select>
                    </label>
                    <label>
                        Formato
                        <select
                            name="format_id"
                            required
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                        >
                            <option value="" disabled>
                                Selecione
                            </option>
                            {formats
                                .filter((f) => f.is_active !== false || String(f.id) === format)
                                .map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.code} · {f.name}
                                    </option>
                                ))}
                        </select>
                    </label>
                </div>
                <fieldset className="community-duration-fields">
                    <legend>Duração das rodadas</legend>
                    <div className="community-event-fields">
                        <label>
                            Tempo normal (minutos)
                            <input
                                type="number"
                                name="round_minutes"
                                min={1}
                                max={1440}
                                step={1}
                                required
                                defaultValue={event?.round_minutes ?? 45}
                            />
                        </label>
                        <label>
                            Overtime (minutos)
                            <input
                                type="number"
                                name="overtime_minutes"
                                min={0}
                                max={1440}
                                step={1}
                                required
                                defaultValue={event?.overtime_minutes ?? 5}
                            />
                        </label>
                    </div>
                    <p className="community-note">
                        Use 0 para jogar sem overtime.
                        {event?.status === 'running'
                            ? ' As alterações valem para as próximas rodadas ou ao refazer a rodada atual.'
                            : ''}
                    </p>
                </fieldset>
                {!event && (
                    <CommunityPlayerPicker
                        selected={players}
                        onChange={setPlayers}
                        busy={busy}
                        limit={32}
                    />
                )}
                <p className="community-note">
                    Suíço BO3.
                    {!event ? ' As inscrições abrem automaticamente na Visão Geral.' : ''}
                </p>
                <button className="button primary" disabled={busy || !format}>
                    {event ? 'Salvar configuração' : 'Criar torneio'}
                </button>
            </form>
        </Dialog>
    );
}
