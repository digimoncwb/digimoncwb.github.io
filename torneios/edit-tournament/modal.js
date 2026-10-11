const modalSupabaseUrl =
    window.APP_CONFIG?.SUPABASE_URL || 'https://vllqakohumoinpdwnsqa.supabase.co';
const modalSupabaseAnonKey = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
const modalHeaders = window.createSupabaseHeaders
    ? window.createSupabaseHeaders()
    : {
          apikey: modalSupabaseAnonKey,
          Authorization: `Bearer ${modalSupabaseAnonKey}`,
          'Content-Type': 'application/json'
      };

let editingTournamentId = null;
let editPlayers = [];
let editDecks = [];
let editStores = [];
let editResults = [];
let editOcrSelectedFiles = [];
let editOcrProcessedFiles = [];
let editOcrImportInProgress = false;
let editTournamentSaveInProgress = false;
const editOcrApiBaseUrl = 'https://digimon-ocr-api.vercel.app';

function normalizeEditPlayerNameInput(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getPendingPlayerRegistrationsForEdit() {
    const missingRows = [];
    const pendingNames = [];
    const seen = new Set();

    editResults.forEach((row, index) => {
        if (row.player_id) return;
        const playerName = normalizeEditPlayerNameInput(row.player_name);
        if (!playerName) {
            missingRows.push(index + 1);
            return;
        }

        const normalizedName = normalizeLookupNameModal(playerName);
        const existing = editPlayers.find((player) => {
            const byName = normalizeLookupNameModal(player.name) === normalizedName;
            const byNick = normalizeLookupNameModal(player.bandai_nick) === normalizedName;
            return byName || byNick;
        });

        if (existing?.id) {
            row.player_id = existing.id;
            row.player_name = existing.name || playerName;
            row.ocr_player_unmatched = false;
            return;
        }

        if (!seen.has(normalizedName)) {
            seen.add(normalizedName);
            pendingNames.push(playerName);
        }
    });

    return { missingRows, pendingNames };
}

async function ensurePlayersRegisteredForEdit() {
    const { missingRows, pendingNames } = getPendingPlayerRegistrationsForEdit();
    if (missingRows.length) {
        throw new Error('Informe o player nas colocacoes: ' + missingRows.join(', '));
    }

    if (!pendingNames.length) return true;

    const openModal =
        typeof window.openRegisterPlayersModal === 'function'
            ? window.openRegisterPlayersModal
            : openRegisterPlayersModalFallback;
    const confirmed = await openModal(pendingNames);
    if (!confirmed) {
        return false;
    }

    for (const playerName of pendingNames) {
        const normalizedName = normalizeLookupNameModal(playerName);
        const existing = editPlayers.find(
            (player) =>
                normalizeLookupNameModal(player.name) === normalizedName ||
                normalizeLookupNameModal(player.bandai_nick) === normalizedName
        );
        if (existing?.id) continue;

        const insertRes = await fetch(`${modalSupabaseUrl}/rest/v1/players`, {
            method: 'POST',
            headers: {
                ...modalHeaders,
                Prefer: 'return=representation'
            },
            body: JSON.stringify({ name: playerName })
        });
        if (!insertRes.ok) {
            const errorText = await insertRes.text();
            throw new Error(
                `Erro ao cadastrar player "${playerName}" (${insertRes.status}): ${errorText}`
            );
        }

        const insertedPlayer = (await insertRes.json())[0];
        if (!insertedPlayer?.id) {
            throw new Error(`Jogador "${playerName}" cadastrado sem retornar ID.`);
        }
        editPlayers.push({
            ...insertedPlayer,
            bandai_id: insertedPlayer.bandai_id || '',
            bandai_nick: insertedPlayer.bandai_nick || ''
        });
    }

    editResults.forEach((row) => {
        if (row.player_id) return;
        const normalizedName = normalizeLookupNameModal(
            normalizeEditPlayerNameInput(row.player_name)
        );
        const player = editPlayers.find(
            (candidate) =>
                normalizeLookupNameModal(candidate.name) === normalizedName ||
                normalizeLookupNameModal(candidate.bandai_nick) === normalizedName
        );
        if (player?.id) {
            row.player_id = player.id;
            row.player_name = player.name || row.player_name;
            row.ocr_player_unmatched = false;
        }
    });
    return true;
}

function openRegisterPlayersModalFallback(playerNames) {
    let modal = document.getElementById('registerPlayersModal');
    if (!modal) {
        const host = document.createElement('div');
        host.innerHTML = `
            <div id="registerPlayersModal" class="modal-overlay">
                <div class="modal-content register-players-modal-content">
                    <h2>Os seguintes jogadores serao registrados</h2>
                    <p class="field-hint register-players-hint">
                        Confirme para cadastrar os jogadores abaixo antes de salvar o torneio.
                    </p>
                    <div class="register-players-box">
                        <ul id="registerPlayersList" class="register-players-list"></ul>
                    </div>
                    <div class="modal-actions">
                        <button type="button" id="btnRegisterPlayersConfirm" class="btn-save">Cadastrar</button>
                        <button type="button" id="btnRegisterPlayersCancel" class="btn-cancel">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(host.firstElementChild);
        modal = document.getElementById('registerPlayersModal');
    }

    const list = document.getElementById('registerPlayersList');
    const btnConfirm = document.getElementById('btnRegisterPlayersConfirm');
    const btnCancel = document.getElementById('btnRegisterPlayersCancel');
    if (!modal || !list || !btnConfirm || !btnCancel) {
        return Promise.reject(new Error('Não foi possível abrir a confirmação de jogadores.'));
    }

    list.innerHTML = playerNames
        .map((name) =>
            String(name || '').replace(/[&<>"']/g, (char) => {
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                return map[char] || char;
            })
        )
        .map((safeName) => `<li>${safeName}</li>`)
        .join('');
    modal.onclick = (event) => {
        if (event.target === modal) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    modal.classList.add('active');

    return new Promise((resolve) => {
        const cleanup = () => {
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            modal.classList.remove('active');
        };
        const onConfirm = () => {
            cleanup();
            resolve(true);
        };
        const onCancel = () => {
            cleanup();
            resolve(false);
        };
        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

function editTournament(id) {
    if (!id) {
        alert('Erro: ID do torneio nao encontrado');
        return;
    }

    editingTournamentId = id;
    openEditModal();
    loadEditFormData(id);
}

async function loadEditFormData(id) {
    try {
        resetEditOcrImportUi();
        const url = `${modalSupabaseUrl}/rest/v1/tournament?id=eq.${encodeURIComponent(id)}&select=*`;
        const res = await fetch(url, { headers: modalHeaders });

        if (!res.ok) {
            throw new Error(`Erro ao carregar dados do torneio (${res.status})`);
        }

        const data = (await res.json())[0];
        if (!data) {
            alert('Torneio nao encontrado');
            closeEditModal();
            return;
        }

        document.getElementById('editTournamentDate').value = data.tournament_date || '';
        document.getElementById('editTournamentName').value = data.tournament_name || '';
        document.getElementById('editTotalPlayers').value = '0';
        document.getElementById('editInstagramLink').value = data.instagram_link || '';
        const instagramDetails = document.getElementById('editTournamentInstagramSection');
        if (instagramDetails) instagramDetails.open = Boolean(data.instagram_link);

        // Reset cache so format default reflects current DB state
        if (typeof tournamentFormatsLoaded !== 'undefined') tournamentFormatsLoaded = false;
        const formatLoaderPromise =
            typeof loadTournamentFormats === 'function'
                ? loadTournamentFormats()
                : Promise.resolve();
        await Promise.all([
            loadStoresToEdit(data.store_id),
            loadPlayersToEdit(),
            loadDecksToEdit(),
            formatLoaderPromise
        ]);

        if (typeof populateTournamentFormatSelect === 'function') {
            populateTournamentFormatSelect('editTournamentFormat', {
                selectedId: data.format_id
            });
        } else {
            const editFormatInput = document.getElementById('editTournamentFormat');
            if (editFormatInput) editFormatInput.value = String(data.format_id || '');
        }

        await loadResultsToEdit(id, data);
        await loadEditOcrFiles(id);
        renderEditResultsRows();
        if (typeof setTournamentFormDirty === 'function') setTournamentFormDirty('edit', false);
    } catch (err) {
        console.error('Erro completo:', err);
        alert('Falha ao carregar dados do torneio: ' + err.message);
        closeEditModal();
    }
}

async function loadStoresToEdit(selectedStoreId) {
    let res = await fetch(
        `${modalSupabaseUrl}/rest/v1/stores?select=id,name,bandai_nick&order=name.asc`,
        {
            headers: modalHeaders
        }
    );
    if (!res.ok) {
        res = await fetch(`${modalSupabaseUrl}/rest/v1/stores?select=id,name&order=name.asc`, {
            headers: modalHeaders
        });
    }
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erro ao carregar lojas (${res.status}): ${errorText}`);
    }

    const stores = await res.json();
    editStores = stores || [];
    const select = document.getElementById('editStoreSelect');
    select.innerHTML = '<option value="">Selecione a loja...</option>';

    stores.forEach((s) => {
        const isSelected = String(s.id) === String(selectedStoreId);
        select.innerHTML += `<option value="${s.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
    });
}

async function loadPlayersToEdit() {
    const res = await fetch(
        `${modalSupabaseUrl}/rest/v1/players?select=id,name,bandai_id,bandai_nick&order=name.asc`,
        {
            headers: modalHeaders
        }
    );
    if (!res.ok) throw new Error('Erro ao carregar jogadores');
    editPlayers = (await res.json()).map((player) => ({
        ...player,
        bandai_id: player.bandai_id || '',
        bandai_nick: player.bandai_nick || ''
    }));
}

async function loadDecksToEdit() {
    const res = await fetch(`${modalSupabaseUrl}/rest/v1/decks?select=id,name&order=name.asc`, {
        headers: modalHeaders
    });
    if (!res.ok) throw new Error('Erro ao carregar decks');
    editDecks = await res.json();
}

async function loadResultsToEdit(tournamentId, tournamentData) {
    let res = await fetch(
        `${modalSupabaseUrl}/rest/v1/tournament_results?tournament_id=eq.${encodeURIComponent(tournamentId)}&select=id,placement,player_id,deck_id,match_points,team_member&order=placement.asc,team_member.asc`,
        { headers: modalHeaders }
    );

    if (!res.ok) throw new Error('Erro ao carregar resultados do torneio');

    let rows = await res.json();

    if (
        (!rows || rows.length === 0) &&
        tournamentData?.store_id &&
        tournamentData?.tournament_date
    ) {
        // compatibilidade para resultados antigos sem tournament_id
        res = await fetch(
            `${modalSupabaseUrl}/rest/v1/tournament_results?store_id=eq.${encodeURIComponent(tournamentData.store_id)}&tournament_date=eq.${tournamentData.tournament_date}&select=id,placement,player_id,deck_id,match_points,team_member&order=placement.asc,team_member.asc`,
            { headers: modalHeaders }
        );
        if (!res.ok) throw new Error('Erro ao carregar resultados antigos do torneio');
        rows = await res.json();
    }

    editResults = (rows || []).slice(0, 36).map((r) => ({
        id: r.id,
        player_id: r.player_id || '',
        deck_id: r.deck_id || '',
        player_name: '',
        deck_name: '',
        match_points: r.match_points ?? null,
        ocr_player_unmatched: false
    }));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[char] || char;
    });
}

function getItemNameById(items, id) {
    const match = items.find((item) => String(item.id) === String(id));
    return match?.name || '';
}

function bindEditResultsAutocomplete() {
    const wrappers = document.querySelectorAll('#editResultsRows .autocomplete-wrapper');
    wrappers.forEach((wrapper) => {
        const input = wrapper.querySelector('input[data-autocomplete-type]');
        const dropdown = wrapper.querySelector('.autocomplete-dropdown');
        if (!input || !dropdown) return;

        const rowIndex = Number(wrapper.dataset.rowIndex);
        const type = input.dataset.autocompleteType;
        const field = type === 'player' ? 'player_id' : 'deck_id';
        const source = type === 'player' ? editPlayers : editDecks;

        const renderOptions = (query) => {
            const value = (query || '').trim().toLowerCase();
            const filtered = source
                .filter((item) => item.name.toLowerCase().includes(value))
                .slice(0, 8);

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item no-match">Nao encontrado</div>';
                dropdown.style.display = 'block';
                return;
            }

            dropdown.innerHTML = filtered
                .map(
                    (item) =>
                        `<div class="autocomplete-item" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>`
                )
                .join('');
            dropdown.style.display = 'block';
        };

        input.addEventListener('input', () => {
            updateEditResultField(rowIndex, field, '');
            if (type === 'player') {
                updateEditResultField(rowIndex, 'player_name', input.value.trim());
                updateEditResultField(
                    rowIndex,
                    'ocr_player_unmatched',
                    Boolean(input.value.trim())
                );
            } else {
                updateEditResultField(rowIndex, 'deck_name', input.value.trim());
            }
            renderOptions(input.value);
        });

        input.addEventListener('focus', () => {
            renderOptions(input.value);
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 120);
        });

        dropdown.addEventListener('mousedown', (event) => {
            const option = event.target.closest('.autocomplete-item');
            if (!option || option.classList.contains('no-match')) return;
            event.preventDefault();
            updateEditResultField(rowIndex, field, option.dataset.id || '');
            if (type === 'player') {
                updateEditResultField(rowIndex, 'player_name', option.dataset.name || '');
                updateEditResultField(rowIndex, 'ocr_player_unmatched', false);
            } else {
                updateEditResultField(rowIndex, 'deck_name', option.dataset.name || '');
            }
            input.value = option.dataset.name || '';
            dropdown.style.display = 'none';
        });
    });
}

function renderEditResultsRows() {
    const container = document.getElementById('editResultsRows');
    if (!container) return;
    const team = window.tournamentUtils?.isTeamTournament(
        document.getElementById('editTournamentName')?.value
    );
    const addButton = document.getElementById('btnAddEditResultRow');
    if (addButton) addButton.textContent = team ? '+ Dupla' : '+ Jogador';
    if (team && editResults.length % 2) {
        editResults.push({
            id: null,
            player_id: '',
            deck_id: '',
            player_name: '',
            deck_name: '',
            match_points: null
        });
    }
    if (team) {
        for (let index = 0; index < editResults.length; index += 2) {
            const points =
                editResults[index].match_points ?? editResults[index + 1].match_points ?? null;
            editResults[index].match_points = editResults[index + 1].match_points = points;
        }
    }
    const form = document.getElementById('editTournamentForm');
    if (form) form.dataset.team = String(Boolean(team));
    const importSection = document.getElementById('editTournamentOcrSection');
    if (importSection) importSection.hidden = false;
    const digilabImport = form?.querySelector('.create-digilab-import');
    if (digilabImport) digilabImport.hidden = Boolean(team);
    const position = (index) =>
        window.tournamentUtils.resultPlacement(
            index,
            document.getElementById('editTournamentName')?.value
        );

    if (editResults.length === 0) {
        container.innerHTML = '';
        document.getElementById('editTotalPlayers').value = '';
        window.updateTournamentPlayerCount?.('edit', 0);
        return;
    }

    container.innerHTML = editResults
        .map(
            (row, index) => `
        ${team && index % 2 === 0 ? '<div class="team-result-group">' : ''}
        <div class="result-row">
            <div class="form-group result-placement-group">
                <label>Posicao</label>
                <span class="result-placement-badge ${getResultPlacementClass(position(index))}" aria-label="${formatOrdinal(position(index))} lugar">${formatOrdinal(position(index))}</span>
            </div>
            <div class="form-group">
                <label>${team ? `Jogador ${(index % 2) + 1}` : 'Jogador'}<span class="required">*</span></label>
                <div class="autocomplete-wrapper" data-row-index="${index}">
                    <input
                        type="text"
                        class="player-input${row.ocr_player_unmatched ? ' ocr-player-unmatched' : ''}"
                        data-autocomplete-type="player"
                        placeholder="Nome do jogador..."
                        value="${escapeHtml(getItemNameById(editPlayers, row.player_id) || row.player_name || '')}"
                        ${row.ocr_player_unmatched ? 'style="border-color:#f59e0b;background:#fff7ed;" title="Jogador não encontrado no cadastro"' : ''}
                        autocomplete="off"
                        required
                    >
                    <div class="autocomplete-dropdown"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Deck${team ? '<span class="required">*</span>' : ''}</label>
                <div class="autocomplete-wrapper" data-row-index="${index}">
                    <input
                        type="text"
                        class="deck-input"
                        ${team ? 'required' : ''}
                        data-autocomplete-type="deck"
                        placeholder="Digite o deck..."
                        value="${escapeHtml(getItemNameById(editDecks, row.deck_id) || row.deck_name || '')}"
                        autocomplete="off"
                    >
                    <div class="autocomplete-dropdown"></div>
                </div>
            </div>
            <div class="form-group result-points-group">
                <label>Pontos</label>
                <input
                    type="number"
                    class="match-points-input"
                    data-edit-match-points-index="${index}"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    placeholder="—"
                    value="${row.match_points === null || row.match_points === undefined ? '' : escapeHtml(row.match_points)}"
                >
            </div>
            <button type="button" class="btn-remove-result" ${team && index % 2 === 1 ? 'hidden' : ''} data-edit-remove-index="${index}" aria-label="${team ? 'Remover dupla' : 'Remover jogador'}" title="${team ? 'Remover dupla' : 'Remover jogador'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4h8v2"></path>
                    <path d="M7 6l1 14h8l1-14"></path>
                    <path d="M10 10v7"></path>
                    <path d="M14 10v7"></path>
                </svg>
            </button>
        </div>
        ${team && index % 2 === 1 ? '</div>' : ''}
    `
        )
        .join('');

    container.querySelectorAll('[data-edit-remove-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const index = Number(button.getAttribute('data-edit-remove-index'));
            removeEditResultRow(index);
        });
    });
    container.querySelectorAll('[data-edit-match-points-index]').forEach((input) => {
        input.addEventListener('input', () => {
            const index = Number(input.getAttribute('data-edit-match-points-index'));
            const points =
                typeof normalizeOcrMatchPoints === 'function'
                    ? normalizeOcrMatchPoints(input.value)
                    : input.value === ''
                      ? null
                      : Number(input.value);
            updateEditResultField(index, 'match_points', points);
        });
    });
    bindEditResultsAutocomplete();

    document.getElementById('editTotalPlayers').value = String(editResults.length);
    window.updateTournamentPlayerCount?.('edit', editResults.length);
}

function syncEditResultsByTotal() {
    const totalInput = document.getElementById('editTotalPlayers');
    const qty = parseInt(totalInput.value, 10);

    if (!Number.isInteger(qty) || qty < 1) {
        editResults = [];
        renderEditResultsRows();
        return;
    }

    const next = [];
    for (let i = 0; i < Math.min(qty, 36); i++) {
        next.push(
            editResults[i] || {
                id: null,
                player_id: '',
                deck_id: '',
                player_name: '',
                deck_name: '',
                match_points: null,
                ocr_player_unmatched: false
            }
        );
    }
    editResults = next;
    renderEditResultsRows();
}

function addEditResultRow() {
    const size = window.tournamentUtils?.isTeamTournament(
        document.getElementById('editTournamentName')?.value
    )
        ? 2
        : 1;
    if (editResults.length + size > 36) {
        alert('O limite é 36 jogadores (18 duplas).');
        return;
    }
    for (let member = 0; member < size; member++) {
        editResults.push({
            id: null,
            player_id: '',
            deck_id: '',
            player_name: '',
            deck_name: '',
            match_points: null,
            ocr_member_id: '',
            ocr_player_unmatched: false
        });
    }
    window.setTournamentFormDirty?.('edit', true);
    renderEditResultsRows();
}

function removeEditResultRow(index) {
    const size = window.tournamentUtils?.isTeamTournament(
        document.getElementById('editTournamentName')?.value
    )
        ? 2
        : 1;
    editResults.splice(size === 2 ? Math.floor(index / 2) * 2 : index, size);
    window.setTournamentFormDirty?.('edit', true);
    renderEditResultsRows();
}

function updateEditResultField(index, field, value) {
    if (!editResults[index]) return;
    editResults[index][field] = value;
    if (
        field === 'match_points' &&
        window.tournamentUtils?.isTeamTournament(
            document.getElementById('editTournamentName')?.value
        )
    ) {
        const partner = index % 2 ? index - 1 : index + 1;
        if (editResults[partner]) editResults[partner].match_points = value;
        const input = document.querySelector('[data-edit-match-points-index="' + partner + '"]');
        if (input) input.value = value ?? '';
    }
}

function openEditModal() {
    bindEditModalActions();
    document.getElementById('editModal').classList.add('active');
}

function bindEditModalActions() {
    const typeSelect = document.getElementById('editTournamentName');
    if (typeSelect && !typeSelect.dataset.teamBound) {
        typeSelect.addEventListener('change', renderEditResultsRows);
        typeSelect.dataset.teamBound = 'true';
    }
    const btnAddEditResultRow = document.getElementById('btnAddEditResultRow');
    const editTotalPlayers = document.getElementById('editTotalPlayers');
    const btnEditModalCancel = document.getElementById('btnEditModalCancel');
    const btnDeleteTournament = document.getElementById('btnDeleteTournament');
    const btnSelectEditOcrPrints = document.getElementById('btnSelectEditOcrPrints');
    const editOcrFilesInput = document.getElementById('editOcrFilesInput');

    if (btnAddEditResultRow && !btnAddEditResultRow.dataset.bound) {
        btnAddEditResultRow.addEventListener('click', addEditResultRow);
        btnAddEditResultRow.dataset.bound = 'true';
    }

    if (editTotalPlayers && !editTotalPlayers.dataset.bound) {
        editTotalPlayers.addEventListener('input', syncEditResultsByTotal);
        editTotalPlayers.dataset.bound = 'true';
    }

    if (btnEditModalCancel && !btnEditModalCancel.dataset.bound) {
        btnEditModalCancel.addEventListener('click', closeEditModal);
        btnEditModalCancel.dataset.bound = 'true';
    }

    if (btnDeleteTournament && !btnDeleteTournament.dataset.bound) {
        btnDeleteTournament.addEventListener('click', deleteEditingTournament);
        btnDeleteTournament.dataset.bound = 'true';
    }

    if (btnSelectEditOcrPrints && editOcrFilesInput && !btnSelectEditOcrPrints.dataset.bound) {
        btnSelectEditOcrPrints.addEventListener('click', () => {
            if (editOcrImportInProgress) return;
            editOcrFilesInput.click();
        });
        editOcrFilesInput.addEventListener('change', onEditOcrFilesSelected);
        btnSelectEditOcrPrints.dataset.bound = 'true';
    }
}

function closeEditModal() {
    if (editOcrImportInProgress || editTournamentSaveInProgress) return;
    document.getElementById('editModal').classList.remove('active');
    editResults = [];
    resetEditOcrImportUi();
    renderEditResultsRows();
}

function setEditOcrStatus(message, tone = 'info') {
    const el = document.getElementById('editOcrStatus');
    if (!el) return;
    const prefix = tone === 'error' ? 'Erro: ' : tone === 'success' ? 'OK: ' : '';
    el.textContent = `${prefix}${message}`.trim();
}

function setEditOcrSelectedInfo(message) {
    const el = document.getElementById('editOcrSelectedInfo');
    if (!el) return;
    el.textContent = message || '';
}

function resetEditOcrImportUi() {
    editOcrImportInProgress = false;
    editOcrSelectedFiles = [];
    editOcrProcessedFiles = [];
    const input = document.getElementById('editOcrFilesInput');
    const button = document.getElementById('btnSelectEditOcrPrints');
    if (input) input.value = '';
    if (button) button.disabled = false;
    setEditOcrSelectedInfo('');
    setEditOcrStatus('');
    if (typeof renderOcrFilePreview === 'function') renderOcrFilePreview('editOcrPreview', []);
}

async function loadEditOcrFiles(tournamentId) {
    const section = document.getElementById('editOcrExistingSection');
    const container = document.getElementById('editOcrExistingFiles');
    if (!section || !container || !window.tournamentOcrFiles) return;
    const files = await window.tournamentOcrFiles
        .loadFiles({
            supabaseUrl: modalSupabaseUrl,
            headers: modalHeaders,
            tournamentId
        })
        .catch((error) => {
            console.warn(error);
            return [];
        });
    section.classList.toggle('is-hidden', files.length === 0);
    container.innerHTML = files
        .map(
            (file) => `
                <a class="tournament-ocr-thumb" href="${escapeHtml(file.public_url)}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(file.public_url)}" alt="${escapeHtml(file.original_name || 'Print da Bandai')}" loading="lazy">
                    <span>${escapeHtml(file.original_name || 'Print da Bandai')}</span>
                    <time>${escapeHtml(new Date(file.created_at).toLocaleString('pt-BR'))}</time>
                </a>
            `
        )
        .join('');
}

function normalizeLookupNameModal(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeMemberIdModal(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '');
}

function isGuestMemberIdModal(value) {
    return /^GUEST/i.test(normalizeMemberIdModal(value));
}

function parseOcrRankModal(value, index) {
    const rank = Number(value);
    if (Number.isFinite(rank) && rank > 0) return rank;
    return index + 1;
}

function extractOcrPlayersModal(payload) {
    const players = Array.isArray(payload?.players) ? payload.players : [];
    return players
        .map((item, index) => ({
            rank: parseOcrRankModal(item?.rank, index),
            name: String(item?.name || '').trim(),
            member_id: normalizeMemberIdModal(item?.member_id),
            points:
                typeof normalizeOcrMatchPoints === 'function'
                    ? normalizeOcrMatchPoints(item?.points)
                    : item?.points === null ||
                        item?.points === undefined ||
                        String(item.points).trim() === ''
                      ? null
                      : Number(item.points),
            omw: String(item?.omw || '').trim()
        }))
        .filter((item) => item.name || item.member_id)
        .slice(0, 100);
}

function mergeOcrPlayersByMemberIdModal(allPlayers) {
    const merged = new Map();
    allPlayers.forEach((item, index) => {
        const key = item.member_id || `NO_ID_${index}`;
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...item });
            return;
        }
        if (item.rank < existing.rank) existing.rank = item.rank;
        if (!existing.name && item.name) existing.name = item.name;
        if (existing.points === null && item.points !== null) existing.points = item.points;
        else if (
            existing.points !== null &&
            item.points !== null &&
            existing.points !== item.points
        ) {
            existing.points_conflict = true;
        }
        if (!existing.omw && item.omw) existing.omw = item.omw;
    });
    return Array.from(merged.values())
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 36);
}

function findPlayerMatchFromOcrModal(ocrPlayer) {
    const ocrMemberId = normalizeMemberIdModal(ocrPlayer.member_id);
    const ocrName = normalizeLookupNameModal(ocrPlayer.name);

    if (ocrMemberId && !isGuestMemberIdModal(ocrMemberId)) {
        const byBandaiId = editPlayers.find(
            (player) => normalizeMemberIdModal(player.bandai_id) === ocrMemberId
        );
        if (byBandaiId?.id) return byBandaiId;
    }

    if (ocrName) {
        const byBandaiNick = editPlayers.find(
            (player) => normalizeLookupNameModal(player.bandai_nick) === ocrName
        );
        if (byBandaiNick?.id) return byBandaiNick;

        const byName = editPlayers.find(
            (player) => normalizeLookupNameModal(player.name) === ocrName
        );
        if (byName?.id) return byName;
    }

    return null;
}

function normalizeOcrTournamentDateModal(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const normalized = raw
        .replace(/~/g, '')
        .replace(/^\w{3}\.\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const monthMap = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
    };

    const enMonthMatch = normalized.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (enMonthMatch) {
        const month = monthMap[String(enMonthMatch[1]).toLowerCase()];
        const day = Number(enMonthMatch[2]);
        const year = Number(enMonthMatch[3]);
        if (month && day >= 1 && day <= 31 && year >= 2000) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    const brMatch = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (brMatch) {
        const day = Number(brMatch[1]);
        const month = Number(brMatch[2]);
        const year = Number(brMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    return '';
}

function extractOcrStoreAndDateModal(payload) {
    return {
        storeName: String(
            payload?.store_name || payload?.store || payload?.shop || payload?.venue || ''
        ).trim(),
        tournamentDate: normalizeOcrTournamentDateModal(
            payload?.tournament_date ||
                payload?.event_date ||
                payload?.tournament_datetime ||
                payload?.date ||
                ''
        )
    };
}

function resolveStoreFromOcrNameModal(storeName) {
    const target = normalizeLookupNameModal(storeName);
    if (!target || !editStores.length) return null;

    const getAliases = (store) =>
        [store?.name, store?.bandai_nick, store?.store_nick, store?.nick, store?.alias]
            .map((value) => normalizeLookupNameModal(value))
            .filter(Boolean);

    const exact = editStores.find((store) => getAliases(store).some((alias) => alias === target));
    if (exact) return exact;

    return (
        editStores.find((store) =>
            getAliases(store).some((alias) => alias.includes(target) || target.includes(alias))
        ) || null
    );
}

async function requestOcrFromImageModal(file) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const res = await fetch(`${editOcrApiBaseUrl}/process`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        throw new Error(`O serviço de leitura do print respondeu ${res.status}`);
    }
    const payload = await res.json();
    if (payload?.error) {
        console.error('Erro retornado pelo serviço OCR:', payload.error);
        const getMessage = window.getOcrServiceErrorMessage;
        throw new Error(
            typeof getMessage === 'function'
                ? getMessage(payload.error)
                : 'O serviço de leitura não conseguiu processar o print neste momento.'
        );
    }
    return payload;
}

function onEditOcrFilesSelected(event) {
    const files = Array.from(event.target?.files || []);
    editOcrSelectedFiles = files;
    if (!files.length) {
        editOcrProcessedFiles = [];
        if (typeof renderOcrFilePreview === 'function') renderOcrFilePreview('editOcrPreview', []);
        setEditOcrSelectedInfo('');
        setEditOcrStatus('');
        return;
    }
    setEditOcrSelectedInfo(`${files.length} print(s) selecionado(s).`);
    if (typeof renderOcrFilePreview === 'function') renderOcrFilePreview('editOcrPreview', files);
    setEditOcrStatus('Processando...');
    processEditOcrFiles();
}

async function processEditOcrFiles() {
    if (!editOcrSelectedFiles.length) {
        setEditOcrStatus('Selecione ao menos um print antes de processar.', 'error');
        return;
    }
    if (editOcrImportInProgress) return;
    editOcrImportInProgress = true;

    const btnSelect = document.getElementById('btnSelectEditOcrPrints');
    if (btnSelect) btnSelect.disabled = true;

    try {
        if (!editPlayers.length) await loadPlayersToEdit();
        if (!editStores.length)
            await loadStoresToEdit(document.getElementById('editStoreSelect').value);

        const allPlayers = [];
        const detectedStores = [];
        const detectedDates = [];
        for (const file of editOcrSelectedFiles) {
            const payload = await requestOcrFromImageModal(file);
            allPlayers.push(...extractOcrPlayersModal(payload));
            const meta = extractOcrStoreAndDateModal(payload);
            if (meta.storeName) detectedStores.push(meta.storeName);
            if (meta.tournamentDate) detectedDates.push(meta.tournamentDate);
        }

        const mergedPlayers = mergeOcrPlayersByMemberIdModal(allPlayers);
        if (!mergedPlayers.length) {
            throw new Error('Nenhum resultado reconhecido na imagem');
        }

        const hadExistingResults = editResults.length > 0;
        const tournamentType = document.getElementById('editTournamentName')?.value;
        const team = window.tournamentUtils.isTeamTournament(tournamentType);
        let updatedPoints = 0;
        let unmatchedOcrRows = 0;

        if (hadExistingResults) {
            const usedResultIndexes = new Set();
            mergedPlayers.forEach((ocrPlayer, ocrIndex) => {
                const matchedPlayer = findPlayerMatchFromOcrModal(ocrPlayer);
                let resultIndex = matchedPlayer?.id
                    ? editResults.findIndex(
                          (row, index) =>
                              !usedResultIndexes.has(index) &&
                              String(row.player_id) === String(matchedPlayer.id)
                      )
                    : -1;

                if (resultIndex < 0) {
                    const placementIndex = team ? ocrIndex * 2 : Number(ocrPlayer.rank) - 1;
                    if (
                        placementIndex >= 0 &&
                        placementIndex < editResults.length &&
                        !usedResultIndexes.has(placementIndex)
                    ) {
                        resultIndex = placementIndex;
                    }
                }

                if (resultIndex < 0) {
                    unmatchedOcrRows += 1;
                    return;
                }

                usedResultIndexes.add(resultIndex);
                const partnerIndex = resultIndex % 2 === 0 ? resultIndex + 1 : resultIndex - 1;
                if (team) usedResultIndexes.add(partnerIndex);
                if (ocrPlayer.points !== null) {
                    editResults[resultIndex].match_points = ocrPlayer.points;
                    if (team && editResults[partnerIndex])
                        editResults[partnerIndex].match_points = ocrPlayer.points;
                    updatedPoints += 1;
                }
            });
        } else {
            const importedResults = mergedPlayers.map((ocrPlayer) => {
                const matchedPlayer = findPlayerMatchFromOcrModal(ocrPlayer);
                if (ocrPlayer.points !== null) updatedPoints += 1;
                return {
                    id: null,
                    player_id: matchedPlayer?.id || '',
                    deck_id: '',
                    deck_name: '',
                    player_name: ocrPlayer.name || '',
                    match_points: ocrPlayer.points,
                    ocr_player_unmatched: !matchedPlayer?.id
                };
            });
            editResults = window.tournamentUtils.expandTeamOcrResults(
                importedResults,
                tournamentType
            );
        }

        renderEditResultsRows();
        document.getElementById('editTotalPlayers').value = String(editResults.length);

        const selectedStoreName = detectedStores[0] || '';
        const selectedDate = detectedDates[0] || '';
        if (!hadExistingResults && selectedStoreName) {
            const matchedStore = resolveStoreFromOcrNameModal(selectedStoreName);
            if (matchedStore?.id) {
                document.getElementById('editStoreSelect').value = String(matchedStore.id);
            }
        }
        if (!hadExistingResults && selectedDate) {
            document.getElementById('editTournamentDate').value = selectedDate;
        }

        const unresolvedPlayers = editResults.filter(
            (row, index) => (!team || index % 2 === 0) && !row.player_id
        ).length;
        const pointConflicts = mergedPlayers.filter((row) => row.points_conflict).length;
        const unresolvedStore = selectedStoreName
            ? !resolveStoreFromOcrNameModal(selectedStoreName)
            : false;
        if (hadExistingResults) {
            const details = [
                `${updatedPoints} ${team ? 'dupla(s)' : 'jogador(es)'} com pontos atualizados`,
                unmatchedOcrRows ? `${unmatchedOcrRows} linha(s) sem correspondência` : '',
                pointConflicts ? `${pointConflicts} conflito(s) entre prints para revisar` : ''
            ].filter(Boolean);
            setEditOcrStatus(
                `Print processado e pronto para ser armazenado. ${details.join('. ')}. Jogadores e decks foram preservados.`,
                updatedPoints > 0 && !unmatchedOcrRows && !pointConflicts ? 'success' : 'info'
            );
        } else if (team) {
            setEditOcrStatus(
                `Print importado: ${mergedPlayers.length} duplas.${unresolvedPlayers ? ` ${unresolvedPlayers} jogador(es) do print sem correspondência.` : ''} Preencha o segundo jogador e os dois decks de cada dupla.${pointConflicts ? ` Revise ${pointConflicts} conflito(s) de pontos.` : ''}${unresolvedStore ? ' Loja não identificada.' : ''}`,
                'info'
            );
        } else if (unresolvedPlayers) {
            setEditOcrStatus(
                `Print importado: ${editResults.length} jogadores, ${unresolvedPlayers} sem correspondência${unresolvedStore ? ', loja não identificada' : ''}. Decks preservados.${pointConflicts ? ` Revise ${pointConflicts} conflito(s) de pontos.` : ''}`,
                'info'
            );
        } else {
            setEditOcrStatus(
                `Print importado (${editResults.length} jogadores). Decks preservados.${pointConflicts ? ` Revise ${pointConflicts} conflito(s) de pontos.` : ''}`,
                pointConflicts ? 'info' : 'success'
            );
        }
        editOcrProcessedFiles = [...editOcrSelectedFiles];
        if (typeof setTournamentFormDirty === 'function') setTournamentFormDirty('edit', true);
    } catch (err) {
        editOcrSelectedFiles = [...editOcrProcessedFiles];
        if (typeof renderOcrFilePreview === 'function') {
            renderOcrFilePreview('editOcrPreview', editOcrProcessedFiles);
        }
        setEditOcrSelectedInfo(
            editOcrProcessedFiles.length
                ? `${editOcrProcessedFiles.length} print(s) da última importação válida serão arquivados.`
                : ''
        );
        console.error('Erro no OCR (edit):', err);
        setEditOcrStatus(err.message || 'Falha ao processar o print da Bandai.', 'error');
    } finally {
        editOcrImportInProgress = false;
        if (btnSelect) btnSelect.disabled = false;
    }
}

async function deleteEditingTournament() {
    if (!editingTournamentId || editOcrImportInProgress || editTournamentSaveInProgress) return;

    const tournamentName = document.getElementById('editTournamentName')?.value || 'Torneio';
    const tournamentDate = document.getElementById('editTournamentDate')?.value || '';
    const confirmation = window.confirm(
        `Excluir definitivamente "${tournamentName}"${tournamentDate ? ` de ${tournamentDate}` : ''}?\n\n` +
            'Os resultados e os comprovantes OCR também serão excluídos. Esta ação não pode ser desfeita.'
    );
    if (!confirmation) return;

    const typedConfirmation = window.prompt(
        'Para confirmar a exclusão definitiva, digite "excluir" abaixo:'
    );
    if (
        String(typedConfirmation || '')
            .trim()
            .toLowerCase() !== 'excluir'
    ) {
        if (typedConfirmation !== null) {
            alert('Confirmação incorreta. O torneio não foi excluído.');
        }
        return;
    }

    const tournamentId = editingTournamentId;
    const form = document.getElementById('editTournamentForm');
    const deleteButton = document.getElementById('btnDeleteTournament');
    const deleteLabel = deleteButton?.querySelector('span');
    const originalDeleteLabel = deleteLabel?.textContent || 'Excluir';
    const buttons = [
        deleteButton,
        form?.querySelector("button[type='submit']"),
        document.getElementById('btnEditCancel'),
        document.getElementById('btnEditModalCloseX'),
        document.getElementById('btnSelectEditOcrPrints')
    ].filter(Boolean);

    editTournamentSaveInProgress = true;
    form?.setAttribute('aria-busy', 'true');
    buttons.forEach((button) => {
        button.disabled = true;
    });
    if (deleteLabel) deleteLabel.textContent = 'Excluindo...';

    let tournamentDeleted = false;
    try {
        const response = await fetch(
            `${modalSupabaseUrl}/rest/v1/rpc/delete_tournament_transaction`,
            {
                method: 'POST',
                headers: modalHeaders,
                body: JSON.stringify({ p_tournament_id: tournamentId })
            }
        );
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Não foi possível excluir o torneio (${response.status}): ${detail}`);
        }

        const result = await response.json();
        const storagePaths = Array.isArray(result?.storage_paths) ? result.storage_paths : [];
        tournamentDeleted = true;

        let failedStoragePaths = [];
        if (storagePaths.length) {
            if (window.tournamentOcrFiles?.deleteStoragePaths) {
                failedStoragePaths = await window.tournamentOcrFiles.deleteStoragePaths({
                    supabaseUrl: modalSupabaseUrl,
                    headers: modalHeaders,
                    storagePaths
                });
            } else {
                failedStoragePaths = storagePaths;
            }
        }

        editTournamentSaveInProgress = false;
        closeEditModal();
        if (typeof reloadTournamentsAfterDelete === 'function') {
            await reloadTournamentsAfterDelete(tournamentId);
        } else if (typeof loadTournaments === 'function') {
            await loadTournaments();
            if (typeof applyFilters === 'function') applyFilters();
        }

        if (failedStoragePaths.length && typeof window.showFriendlyErrorModal === 'function') {
            window.showFriendlyErrorModal(
                'Torneio excluído',
                `O torneio foi removido, mas ${failedStoragePaths.length} arquivo(s) OCR não puderam ser apagados do Storage.`
            );
        }
    } catch (error) {
        console.error('Erro ao excluir torneio:', error);
        if (typeof window.showFriendlyErrorModal === 'function') {
            window.showFriendlyErrorModal(
                tournamentDeleted ? 'Torneio excluído' : 'Falha ao excluir torneio',
                tournamentDeleted
                    ? 'O torneio foi excluído, mas a lista não pôde ser atualizada. Recarregue a página.'
                    : error?.message || 'Não foi possível excluir o torneio.'
            );
        } else {
            alert(error?.message || 'Não foi possível excluir o torneio.');
        }
    } finally {
        editTournamentSaveInProgress = false;
        form?.removeAttribute('aria-busy');
        buttons.forEach((button) => {
            button.disabled = false;
        });
        if (deleteLabel) deleteLabel.textContent = originalDeleteLabel;
    }
}

async function editTournamentFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.querySelector("#editTournamentForm button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';
    editTournamentSaveInProgress = true;
    document.getElementById('editTournamentForm')?.setAttribute('aria-busy', 'true');
    ['btnEditCancel', 'btnEditModalCloseX', 'btnSelectEditOcrPrints'].forEach((id) => {
        const button = document.getElementById(id);
        if (button) button.disabled = true;
    });
    let ocrBatchForRollback = null;
    let saveCompleted = false;

    try {
        const totalPlayers = editResults.length;
        const updatedBase = {
            store_id: document.getElementById('editStoreSelect').value,
            tournament_date: document.getElementById('editTournamentDate').value,
            tournament_name: document.getElementById('editTournamentName').value,
            total_players: totalPlayers,
            instagram_link: document.getElementById('editInstagramLink').value.trim()
        };
        const formatSelection =
            typeof readTournamentFormatValue === 'function'
                ? readTournamentFormatValue('editTournamentFormat')
                : { formatId: null, formatCode: '' };
        const updated =
            typeof assignTournamentFormat === 'function'
                ? assignTournamentFormat(updatedBase, formatSelection)
                : updatedBase;

        try {
            const shouldProceed = await ensurePlayersRegisteredForEdit();
            if (!shouldProceed) return;
        } catch (registrationError) {
            if (typeof window.showFriendlyErrorModal === 'function') {
                window.showFriendlyErrorModal(
                    'Nao foi possivel continuar',
                    registrationError.message || 'Falha ao validar cadastro de players.'
                );
            } else {
                alert(registrationError.message || 'Falha ao validar cadastro de players.');
            }
            return;
        }

        try {
            const shouldProceed = await window.ensureTournamentDecksRegistered({
                results: editResults,
                getDecks: () => editDecks,
                reloadDecks: loadDecksToEdit,
                supabaseUrl: modalSupabaseUrl,
                requestHeaders: modalHeaders
            });
            if (!shouldProceed) return;
        } catch (registrationError) {
            if (typeof window.showFriendlyErrorModal === 'function') {
                window.showFriendlyErrorModal(
                    'Nao foi possivel continuar',
                    registrationError.message || 'Falha ao validar cadastro de decks.'
                );
            } else {
                alert(registrationError.message || 'Falha ao validar cadastro de decks.');
            }
            return;
        }

        const hasInvalidResult = editResults.some((r) => !r.player_id);
        const teamError = window.tournamentUtils.validateTeamResults(
            editResults,
            updated.tournament_name
        );
        if (teamError) {
            alert(teamError);
            return;
        }
        const validInstagram = window.validation
            ? window.validation.isValidOptionalUrl(updated.instagram_link)
            : true;
        if (
            !updated.store_id ||
            !updated.tournament_date ||
            !updated.tournament_name ||
            updated.total_players < 1 ||
            !validInstagram ||
            hasInvalidResult
        ) {
            alert('Please fill all required fields correctly.');
            return;
        }

        if (editOcrProcessedFiles.length) {
            if (!window.tournamentOcrFiles?.uploadFiles) {
                throw new Error(
                    'O módulo de prints da Bandai não foi carregado. Atualize a página e tente novamente.'
                );
            }
            setEditOcrStatus('Arquivando novos prints da Bandai...');
            ocrBatchForRollback = await window.tournamentOcrFiles.uploadFiles({
                supabaseUrl: modalSupabaseUrl,
                headers: modalHeaders,
                tournamentId: editingTournamentId,
                files: editOcrProcessedFiles
            });
        }

        const resultsPayload = editResults.map((row) => ({
            id: row.id || null,
            deck_id: row.deck_id || null,
            player_id: row.player_id,
            match_points: row.match_points ?? null
        }));
        const saveRes = await fetch(`${modalSupabaseUrl}/rest/v1/rpc/save_tournament_transaction`, {
            method: 'POST',
            headers: modalHeaders,
            body: JSON.stringify({
                p_tournament_id: editingTournamentId,
                p_tournament: updated,
                p_results: resultsPayload,
                p_ocr_files: ocrBatchForRollback?.metadata || []
            })
        });
        if (!saveRes.ok) {
            const detail = await saveRes.text();
            const friendlyMessage =
                typeof window.getFriendlyResultsSaveErrorMessage === 'function'
                    ? window.getFriendlyResultsSaveErrorMessage(saveRes.status, detail)
                    : `Erro ao salvar torneio (${saveRes.status})`;
            throw new Error(friendlyMessage);
        }

        saveCompleted = true;
        editTournamentSaveInProgress = false;
        closeEditModal();
        // Recarrega a tabela de torneios
        if (typeof reloadTournamentsAfterEdit === 'function') {
            await reloadTournamentsAfterEdit(editingTournamentId);
        } else if (typeof loadTournaments === 'function') {
            await loadTournaments();
            if (typeof applyFilters === 'function') {
                applyFilters();
            } else {
                renderTable();
                renderPagination();
            }
        }
    } catch (err) {
        if (!saveCompleted && ocrBatchForRollback) {
            await window.tournamentOcrFiles.cleanupBatch({
                supabaseUrl: modalSupabaseUrl,
                headers: modalHeaders,
                batchId: ocrBatchForRollback.batchId,
                storagePaths: ocrBatchForRollback.storagePaths
            });
        }
        console.error('Erro completo:', err);
        if (typeof window.showFriendlyErrorModal === 'function') {
            window.showFriendlyErrorModal(
                saveCompleted ? 'Torneio salvo' : 'Falha ao salvar torneio',
                saveCompleted
                    ? 'As alteracoes foram salvas, mas a lista nao foi atualizada. Recarregue a pagina.'
                    : err?.message || 'Nao foi possivel salvar as alteracoes do torneio.'
            );
        } else {
            alert('Falha ao salvar torneio: ' + err.message);
        }
    } finally {
        editTournamentSaveInProgress = false;
        document.getElementById('editTournamentForm')?.removeAttribute('aria-busy');
        ['btnEditCancel', 'btnEditModalCloseX', 'btnSelectEditOcrPrints'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) button.disabled = false;
        });
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
