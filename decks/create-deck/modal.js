(function () {
    const IMAGE_BASE_URL = 'https://images.digimoncard.io/images/cards/';
    const LEGACY_IMAGE_BASE_URL = 'https://deckbuilder.egmanevents.com/card_images/digimon/';
    const FANDOM_BASE_URL = 'https://digimoncardgame.fandom.com/wiki/Special:FilePath/';
    const DIGILAB_CARD_IMAGE_BASE_URL = 'https://digilab.cards/api/card/';
    const COLOR_OPTIONS = [
        { code: 'r', label: 'Red', className: 'is-red' },
        { code: 'u', label: 'Blue', className: 'is-blue' },
        { code: 'b', label: 'Black', className: 'is-black' },
        { code: 'w', label: 'White', className: 'is-white' },
        { code: 'g', label: 'Green', className: 'is-green' },
        { code: 'y', label: 'Yellow', className: 'is-yellow' },
        { code: 'p', label: 'Purple', className: 'is-purple' }
    ];
    const COLOR_ORDER = COLOR_OPTIONS.map((item) => item.code);
    const MODAL_TEMPLATE = `
<div id="createDeckModal" class="modal-overlay" aria-hidden="true" inert>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="createDeckTitle">
        <div class="modal-header">
            <h2 id="createDeckTitle">Criar Deck</h2>
            <button type="button" id="btnCloseCreateDeckModalX" class="player-modal-close cancel-close" aria-label="Cancelar">Cancelar</button>
        </div>
        <form id="createDeckForm">
            <div class="form-group">
                <label class="form-label" for="createDeckName">Nome do Deck*</label>
                <input id="createDeckName" class="form-input" type="text" required>
            </div>
            <div class="form-group">
                <label class="form-label" for="createDeckCode">Código da carta*</label>
                <input id="createDeckCode" class="form-input" type="text" placeholder="BT16-064" required>
                <div class="code-examples">
                    <div class="code-example" data-code="BT24-030">BT24-030</div>
                    <div class="code-example" data-code="ST22-05">ST22-05</div>
                    <div class="code-example" data-code="EX5-001">EX5-001</div>
                    <div class="code-example" data-code="P-183">P-183</div>
                </div>
                <div id="createDeckPreview" class="modal-preview" style="display: none;">
                    <div class="deck-thumb-wrapper modal-preview-thumb">
                        <img id="createDeckPreviewImage" class="deck-thumb-image" alt="Prévia do Deck">
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Cores do Deck</label>
                <div id="createDeckColors" class="deck-colors-picker" role="group" aria-label="Cores do Deck"></div>
            </div>
            <div class="modal-actions">
                <button type="button" id="btnCloseCreateDeckModal" class="btn-modal-cancel">Cancelar</button>
                <button type="submit" class="btn-modal-save">Criar deck</button>
            </div>
            <div class="modal-tips">
                <h4>Como encontrar o código da carta</h4>
                <ul>
                    <li>Use o formato <strong>COLEÇÃO-NÚMERO</strong>.</li>
                    <li><strong>Coleção:</strong> BT16, ST22, EX5, P (promo)...</li>
                    <li><strong>Número:</strong> 001–120, com 1 a 3 dígitos.</li>
                    <li><strong>Exemplos:</strong> BT24-030, ST22-05, EX5-001, P-183</li>
                </ul>
            </div>
        </form>
    </div>
</div>`;

    function loadTemplate() {
        const host = document.getElementById('createDeckModalHost');
        if (!host) return null;
        host.innerHTML = MODAL_TEMPLATE;
        return host.querySelector('#createDeckModal');
    }

    function isValidDeckCode(code) {
        const pattern = /^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/;
        return pattern.test(code);
    }

    function buildColorsCsv(selectedColors) {
        return COLOR_ORDER.filter((token) => selectedColors.has(token)).join(',');
    }

    async function checkDuplicateDeckName(supabaseUrl, headers, deckName) {
        const res = await fetch(
            `${supabaseUrl}/rest/v1/decks?name=eq.${encodeURIComponent(deckName)}&select=id`,
            { headers }
        );
        if (!res.ok) return false;
        const rows = await res.json();
        return rows.length > 0;
    }

    async function fetchCardImageBlob(src) {
        let blob;
        try {
            const res = await fetch(src);
            if (!res.ok) return null;
            blob = await res.blob();
        } catch { return null; }
        return new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const check = document.createElement('canvas');
                    check.width = 8; check.height = 8;
                    check.getContext('2d').drawImage(img, 0, 0, 8, 8);
                    const { data } = check.getContext('2d').getImageData(0, 0, 8, 8);
                    let r = 0, g = 0, b = 0;
                    const px = data.length / 4;
                    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
                    if ((r / px) > 245 && (g / px) > 245 && (b / px) > 245) { resolve(null); return; }
                    const cv = document.createElement('canvas');
                    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
                    cv.getContext('2d').drawImage(img, 0, 0);
                    cv.toBlob((webpBlob) => resolve(webpBlob || blob), 'image/webp', 0.92);
                } catch { resolve(blob); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    async function uploadDeckImageViaEdgeFunction(supabaseUrl, headers, deckCode) {
        try {
            const res = await fetch(`${supabaseUrl}/functions/v1/upload-card-image`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: deckCode }),
            });
            if (!res.ok) return null;
            const { url } = await res.json();
            return url || null;
        } catch { return null; }
    }

    async function uploadDeckImageToStorage(supabaseUrl, headers, deckCode) {
        // Edge Function: server-side, sem CORS, funciona para todos os sets
        const edgeUrl = await uploadDeckImageViaEdgeFunction(supabaseUrl, headers, deckCode);
        if (edgeUrl) return edgeUrl;

        // Fallback browser-side quando a Edge Function estiver indisponível
        const candidates = [
            `${DIGILAB_CARD_IMAGE_BASE_URL}${deckCode}.jpg`,
            `https://digimoncardgame.fandom.com/wiki/Special:FilePath/${deckCode}-Sample.png`,
            `${IMAGE_BASE_URL}${deckCode}.webp`,
            `${IMAGE_BASE_URL}${deckCode}.jpg`,
            `${LEGACY_IMAGE_BASE_URL}${deckCode}.webp`,
        ];
        let blob = null;
        for (const src of candidates) {
            blob = await fetchCardImageBlob(src);
            if (blob) break;
        }
        if (!blob) return null;
        const uploadRes = await fetch(
            `${supabaseUrl}/storage/v1/object/deck-images/${encodeURIComponent(deckCode)}.webp`,
            {
                method: 'POST',
                headers: {
                    apikey: headers.apikey,
                    Authorization: headers.Authorization,
                    'Content-Type': blob.type || 'image/webp',
                    'x-upsert': 'true',
                },
                body: blob,
            }
        );
        if (!uploadRes.ok) return null;
        return `${supabaseUrl}/storage/v1/object/public/deck-images/${encodeURIComponent(deckCode)}.webp`;
    }

    async function createDeck(supabaseUrl, headers, deckName, deckCode, deckColorsCsv) {
        const storedUrl = await uploadDeckImageToStorage(supabaseUrl, headers, deckCode);
        const imageUrl = storedUrl || (IMAGE_BASE_URL + deckCode + '.webp');

        const deckRes = await fetch(`${supabaseUrl}/rest/v1/decks`, {
            method: 'POST',
            headers: {
                ...headers,
                Prefer: 'return=representation'
            },
            body: JSON.stringify([{ name: deckName, colors: deckColorsCsv }])
        });

        if (!deckRes.ok) {
            throw new Error('Error creating deck');
        }

        const createdDeck = (await deckRes.json())[0];
        const imageRes = await fetch(`${supabaseUrl}/rest/v1/deck_images`, {
            method: 'POST',
            headers,
            body: JSON.stringify([{ deck_id: createdDeck.id, image_url: imageUrl }])
        });

        if (!imageRes.ok) {
            await fetch(`${supabaseUrl}/rest/v1/decks?id=eq.${createdDeck.id}`, {
                method: 'DELETE',
                headers
            });
            throw new Error('Error saving deck image');
        }
    }

    // Reuse the established image upload and persistence flow from the React catalog.
    window.digistatsDeckMutations = { ...window.digistatsDeckMutations, create: createDeck };

    window.initCreateDeckModal = async function initCreateDeckModal(config) {
        const { supabaseUrl, headers, onCreated } = config || {};
        if (!supabaseUrl || !headers) return;

        const modal = loadTemplate();
        if (!modal) return;

        const openBtn = document.getElementById('btnOpenCreateDeckModal');
        const closeBtn = document.getElementById('btnCloseCreateDeckModal');
        const form = document.getElementById('createDeckForm');
        const codeInput = document.getElementById('createDeckCode');
        const nameInput = document.getElementById('createDeckName');
        const codeExamples = document.querySelectorAll('.code-example');
        const preview = document.getElementById('createDeckPreview');
        const previewImage = document.getElementById('createDeckPreviewImage');
        const colorsContainer = document.getElementById('createDeckColors');

        let lastFocused = null;
        const selectedColors = new Set();

        const renderColorButtons = () => {
            if (!colorsContainer) return;
            colorsContainer.innerHTML = COLOR_OPTIONS.map(
                (option) => `
                    <button
                        type="button"
                        class="deck-color-dot ${option.className}${selectedColors.has(option.code) ? ' is-selected' : ''}"
                        data-color-code="${option.code}"
                        aria-label="${option.label}"
                        aria-pressed="${selectedColors.has(option.code) ? 'true' : 'false'}"
                        title="${option.label}"
                    ></button>
                `
            ).join('');
        };

        const updatePreview = () => {
            if (!codeInput || !preview || !previewImage) return;
            const code = codeInput.value.trim().toUpperCase();

            if (!isValidDeckCode(code)) {
                preview.style.display = 'none';
                previewImage.removeAttribute('src');
                return;
            }

            const imageUrl = DIGILAB_CARD_IMAGE_BASE_URL + code + '.jpg';
            previewImage.src = imageUrl;
            preview.style.display = 'flex';
        };

        const closeModal = () => {
            const active = document.activeElement;
            if (active && modal.contains(active) && typeof active.blur === 'function') {
                active.blur();
            }
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            modal.setAttribute('inert', '');
            if (lastFocused && typeof lastFocused.focus === 'function') {
                lastFocused.focus();
            }
        };

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                lastFocused = document.activeElement;
                if (nameInput) nameInput.value = '';
                if (codeInput) codeInput.value = '';
                selectedColors.clear();
                renderColorButtons();
                if (preview) preview.style.display = 'none';
                if (previewImage) previewImage.removeAttribute('src');
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
                modal.removeAttribute('inert');
                if (nameInput) nameInput.focus();
            });
        }

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        const closeBtnX = document.getElementById('btnCloseCreateDeckModalX');
        if (closeBtnX) closeBtnX.addEventListener('click', closeModal);

        if (codeInput) {
            codeInput.addEventListener('input', () => {
                codeInput.value = codeInput.value.toUpperCase();
                updatePreview();
            });
        }

        if (previewImage && preview) {
            previewImage.addEventListener('error', () => {
                const src = previewImage.getAttribute('src') || '';
                if (src.startsWith(DIGILAB_CARD_IMAGE_BASE_URL)) {
                    const code = src
                        .slice(DIGILAB_CARD_IMAGE_BASE_URL.length)
                        .replace(/\.jpg$/, '');
                    previewImage.src = FANDOM_BASE_URL + code + '-Sample.png';
                } else if (src.startsWith(FANDOM_BASE_URL)) {
                    const code = src.slice(FANDOM_BASE_URL.length).replace(/-Sample\.png$/, '');
                    previewImage.src = IMAGE_BASE_URL + code + '.webp';
                } else if (src.startsWith(IMAGE_BASE_URL)) {
                    const code = src.slice(IMAGE_BASE_URL.length).replace(/\.webp$/, '');
                    previewImage.src = LEGACY_IMAGE_BASE_URL + code + '.webp';
                } else {
                    preview.style.display = 'none';
                }
            });
            previewImage.addEventListener('load', () => {
                if (previewImage.getAttribute('src')) {
                    preview.style.display = 'flex';
                }
            });
        }

        if (codeExamples.length && codeInput) {
            codeExamples.forEach((example) => {
                example.addEventListener('click', () => {
                    const code = example.getAttribute('data-code') || '';
                    codeInput.value = code;
                    codeInput.dispatchEvent(new Event('input'));
                    codeInput.focus();
                    example.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        example.style.transform = 'translateY(-2px)';
                    }, 100);
                });
            });
        }

        if (colorsContainer) {
            colorsContainer.addEventListener('click', (event) => {
                const button = event.target.closest('[data-color-code]');
                if (!button) return;
                const code = String(button.getAttribute('data-color-code') || '').toLowerCase();
                if (!COLOR_ORDER.includes(code)) return;
                if (selectedColors.has(code)) selectedColors.delete(code);
                else selectedColors.add(code);
                renderColorButtons();
            });
            renderColorButtons();
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const deckName = (nameInput?.value || '').trim();
                const deckCode = (codeInput?.value || '').trim().toUpperCase();
                const deckColorsCsv = buildColorsCsv(selectedColors);

                if (!deckName || !deckCode) {
                    alert('Please fill in all required fields.');
                    return;
                }

                if (!isValidDeckCode(deckCode)) {
                    alert('Invalid deck code. Use format like BT16-064.');
                    return;
                }

                const isDuplicate = await checkDuplicateDeckName(supabaseUrl, headers, deckName);
                if (isDuplicate) {
                    alert(`A deck named "${deckName}" already exists.`);
                    return;
                }

                try {
                    await createDeck(supabaseUrl, headers, deckName, deckCode, deckColorsCsv);
                    closeModal();
                    if (typeof onCreated === 'function') await onCreated();
                } catch (err) {
                    console.error(err);
                    alert('Error creating deck. Please try again.');
                }
            });
        }
    };
})();
