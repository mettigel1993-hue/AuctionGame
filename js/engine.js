const $ = id => document.getElementById(id);

// --- Globale Variablen ---
let Config = {}; let itemDatabase = {}; let shreddedDatabase = []; let usedDatabase = [];
let managers = []; let activeCategories = []; let countManagers = 4; var startingBudget = 1000000;
let currentView = 'matrix'; let adminCategory = ''; let selectedAuctionItem = null;
let activeMatrixAuctionItem = null; let activeMatrixAuctionCategory = ''; let isShredderMode = false;
let itemsToShred = []; let boolForceShowCatalog = false; let manualCatalogHide = false;
let draftedIds = []; let triggeredEventIds = []; let blockedPlayerId = null;
let blockInitiatorId = null; let gambleInitiatorId = null; let blindInitiatorId = null;
let highRollerTriggered = false; let isHighRollerSession = false;
let completedCategoryNames = []; let pendingSpecialEvent = false; let specialEventsRemaining = ['dutch', 'blind'];
let blindDrawsLeft = 0; let lastPurchase = { managerId: null, cost: 0, item: null, category: null, cashbackGiven: 0, isUndoable: false };
let isGameEnded = false; let globalIdCounter = 1; let gambleSelectedOldCard = null; let gambleTemporaryCards = [];
let dutchInterval = null; let dutchPrice = 0; let dutchItem = null; let selectedPerksPending = {};
let currentConfirmCallback = null; let customModalCallback = null;

// --- Globale Variablen für Erweiterungen ---
let activeCategoryDeck = [];
let playerJokerOrder = [];
let jokerPhaseState = { blockUsed: false, autoBuyUsed: false };
let wheelSpinResults = [];

// Joker controls use one icon set instead of the config emoji, so they look the same on every OS.
// Tailwind's orange is retinted to the theme primary, so an "orange" joker renders yellow to keep its own colour.
const JOKER_ICONS = { block: 'fa-ban', autoBuy: 'fa-handshake-angle', bonus: 'fa-shield-halved', gamble: 'fa-shuffle', skip: 'fa-trash-can' };
const jokerIcon = key => `<i class="fa-solid ${JOKER_ICONS[key] || 'fa-star'}" aria-hidden="true"></i>`;
const jokerColor = c => c === 'orange' ? 'yellow' : c;

// Holo frame (board) and holo trail (card flight) for the top cards. Used to be the "unicorn" flag in the
// decks, which showed as a 🦄 in the name; the score decides now, so no marker is needed in the text.
const HOLO_MIN_SCORE = 95;
const isHolo = card => (card?.score || 0) >= HOLO_MIN_SCORE;

// =====================================================================
// BOOTLOADER
// =====================================================================
window.onload = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const theme = urlParams.get('theme') || 'wehleiden';
    try {
        const configResponse = await fetch(`config/config_${theme}.json`);
        Config = await configResponse.json();
        if (window.applyTheme && Config.themeId) window.applyTheme(Config.themeId);
        activeCategories = Object.keys(Config.categories);
        adminCategory = activeCategories[0];
        activeMatrixAuctionCategory = activeCategories[0];
        applyConfigToUI();
        renderCategoryButtons();
        const dbLoaded = await buildDatabase();
        initGame(getConf('economy','defaultPlayerCount'), getConf('economy','startingBudget'));
        if (!dbLoaded) {
            switchView('admin');
            showModal("System leer!", `Das Inventar ist leer.<br><br>Bitte lade die <strong>${Config.databaseFile}</strong> hoch.`);
            addLog("Warte auf Datenbank-Import...", "alert");
        } else {
            addLog("Datenbank erfolgreich geladen.", "info");
        }
    } catch (e) {
        console.error("Boot-Error:", e);
        alert("Fehler beim Laden von Config oder Datenbank!");
    }
};

function applyConfigToUI() {
    document.title = Config.windowTitle || 'Spiel';
    if ($('ui-game-title')) {
        $('ui-game-title').innerText = Config.gameTitle;
        $('ui-game-title').className = `font-black text-2xl theme-gradient-title tracking-wide uppercase theme-font-display`;
    }
    if ($('ui-theme-icon')) $('ui-theme-icon').innerText = Config.themeIcon;
    if ($('ui-player-term')) $('ui-player-term').innerText = Config.terminology.playerPlural + ":";
    if ($('btn-draw')) $('btn-draw').innerHTML = `<span class="relative z-10"><i class="fa-solid fa-box-open"></i> ${Config.terminology.drawButtonText}</span>`;
    if ($('btn-punish')) $('btn-punish').innerHTML = `<i class="fa-solid fa-skull text-xs"></i>`;
    if ($('btn-punish')) $('btn-punish').title = Config.terminology.punishButtonText;
    if ($('tab-matrix')) $('tab-matrix').innerText = Config.terminology.adminTab1;
    if ($('tab-admin')) $('tab-admin').innerText = Config.terminology.adminTab2;
    if ($('tab-used')) $('tab-used').innerText = Config.terminology.adminTab3;
    if ($('tab-shredded')) $('tab-shredded').innerHTML = `<i class="fa-solid fa-toilet mr-1"></i> ${Config.terminology.adminTab4}`;
    if ($('input-start-budget')) $('input-start-budget').value = getConf('economy','startingBudget');

    const jLegend = $('joker-legend');
    if (jLegend && Config.terminology.jokers) {
        const colorMap = { block: 'red', bonus: 'green', autoBuy: 'purple', gamble: 'orange', skip: 'cyan' };
        // Numbers come from the settings; applySettings() re-runs this function so the legend follows them
        const descMap = {
            block: `Mitspieler für eine Runde sperren.`,
            bonus: `${Math.round(getConf('mechanics','bonusCashbackFraction') * 100)} % Cashback beim nächsten Kauf.`,
            autoBuy: `Blind-Kauf (erzwingen) für ${getConf('mechanics','autoBuyMultiplier').toLocaleString('de-DE')}x Preis.`,
            gamble: `Alte Karte gegen neue umtauschen.`,
            skip: `Gezogene Karte sofort vernichten.`
        };
let html = '<div class="flex flex-col gap-1.5 w-full">';
        for (let key in Config.terminology.jokers) {
            const j = Config.terminology.jokers[key];
            const c = jokerColor(j.color || colorMap[key] || 'stone');
            html += `
            <button type="button" onclick="playShowcase('joker:${key}')" title="Vorschau: So wirkt der Joker" class="group flex items-center gap-3 w-full text-left bg-black/20 p-2 rounded-lg border border-stone-800 hover:border-stone-600 transition-colors">
                <div class="flex items-center justify-center w-7 h-7 rounded bg-${c}-950/40 text-${c}-400 border border-${c}-900/50 shrink-0 text-sm">
                    ${jokerIcon(key)}
                </div>
                <div class="flex flex-col flex-grow">
                    <span class="text-${c}-400 font-black text-xs uppercase tracking-wider leading-none mb-1">${j.label}</span>
                    <span class="text-stone-400 text-xs leading-none">${descMap[key] || ''}</span>
                </div>
                <i class="fa-solid fa-play text-stone-600 group-hover:text-white text-xs shrink-0 transition-colors" aria-hidden="true"></i>
            </button>`;
        }
        html += '</div>';
        jLegend.innerHTML = html;    }
}

// =====================================================================
// INITIALISIERUNG & NEUSTART
// =====================================================================
function initGame(count, budget) {
    countManagers = count; startingBudget = budget; draftedIds = [];
    selectedAuctionItem = activeMatrixAuctionItem = null;
    activeMatrixAuctionCategory = activeCategories[0]; isGameEnded = boolForceShowCatalog = manualCatalogHide = false;
    triggeredEventIds = []; gambleInitiatorId = blindInitiatorId = blockInitiatorId = blockedPlayerId = null;
    isShredderMode = false; itemsToShred = []; blindDrawsLeft = 0;
    lastPurchase = { managerId: null, cost: 0, item: null, category: null, cashbackGiven: 0, isUndoable: false };
    completedCategoryNames = []; pendingSpecialEvent = false; specialEventsRemaining = ['dutch', 'blind'];
    highRollerTriggered = false; isHighRollerSession = false;
    jokerPhaseState = { blockUsed: false, autoBuyUsed: false };

    if ($('active-bid-target')) { $('active-bid-target').innerText = "Nichts ausgewählt"; $('active-bid-start-price').innerText = "Mindestpreis: -"; $('active-bid-desc').innerHTML = ""; }
    if ($('game-info-subtitle')) $('game-info-subtitle').innerHTML = `${Config.currency.name}: ${startingBudget.toLocaleString()} ${Config.currency.symbol}`;
    if ($('btn-undo-purchase')) $('btn-undo-purchase').classList.add('hidden');

    managers = [];
    for (let i = 1; i <= count; i++) {
        let tm = {}; activeCategories.forEach(c => tm[c.toLowerCase()] = null);
        managers.push({
            id: i, name: `${Config.terminology.playerSingular} ${i}`, budget: startingBudget,
            perk: 'NONE', protegeCats: [],
            jokers: { block: getConf('jokers','block'), bonus: getConf('jokers','bonus'), autoBuy: getConf('jokers','autoBuy'), gamble: getConf('jokers','gamble'), skip: getConf('jokers','skip') },
            cashbackActive: false, team: tm
        });
    }

    playerJokerOrder = Array.from({length: count}, (_, i) => i + 1);

    renderManagerCountButtons();
    updateBuyerDropdown();
    setTimeout(() => {
        let firstBtn = document.querySelector('.matrix-cat-btn');
        if (firstBtn) selectMatrixAuctionCategory(activeCategories[0], firstBtn);
        initCategoryDeck(activeCategories[0]);
        showPerksModal();
    }, 50);
}

function initCategoryDeck(cat) {
    let list = itemDatabase[cat] || [];
    let shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Only as many cards as players are playable per category; skipped cards cycle back.
    // A card nobody bids on comes around again, so waiting means ending up with the leftovers.
    activeCategoryDeck = shuffled.slice(0, countManagers);
}

function promptRestart(count) {
    let b = parseInt($('input-start-budget') ? $('input-start-budget').value : startingBudget);
    if (isNaN(b) || b < 0) b = startingBudget;
    showConfirmModal(`Neu starten mit <strong>${count} ${Config.terminology.playerPlural}</strong> und <strong>${b.toLocaleString()} ${Config.currency.symbol}</strong>?`, () => {
        initGame(count, b); addLog("Spiel neu gestartet.", "alert");
    });
}

// Changes the number of players (1-8). Rebuilds the roster through initGame, which
// reopens the setup modal, and keeps names/perks already entered for existing slots.
// Asks first if cards have been bought, since that resets the running round.
function setPlayerCount(n) {
    n = Math.max(1, Math.min(8, parseInt(n, 10) || countManagers));
    const sync = v => {
        GameSettings.economy.defaultPlayerCount.value = v; saveSettings();
        const slider = document.querySelector(`input[oninput*="'defaultPlayerCount'"]`); if (slider) slider.value = v;
        const shown = $('sval-economy-defaultPlayerCount'); if (shown) shown.textContent = v;
        const pick = $('perk-player-count'); if (pick) pick.value = v;
    };
    if (n === countManagers) return sync(n);

    const apply = () => {
        managers.forEach(m => {
            const name = $(`perk-name-${m.id}`)?.value.trim(); if (name) m.name = name;
            const perk = $(`perk-select-${m.id}`)?.value; if (perk) selectedPerksPending[m.id] = perk;
        });
        const names = managers.map(m => m.name);
        initGame(n, startingBudget);
        managers.forEach((m, i) => { if (names[i]) m.name = names[i]; });
        updateBuyerDropdown(); sync(n);
    };

    const roundStarted = managers.some(m => Object.values(m.team).some(Boolean));
    if (!roundStarted) return apply();
    sync(countManagers); // show the real count until the user confirms
    showConfirmModal(`Auf <strong>${n} ${Config.terminology.playerPlural}</strong> wechseln? Die laufende Runde wird neu gestartet.`, apply);
}

function renderManagerCountButtons() {
    const container = $('mgr-count-buttons'); 
    if (!container) return;
    
    // Dropdown-Menü im exakt gleichen Styling wie das Budget-Feld daneben
    let selectHtml = `<select onchange="promptRestart(parseInt(this.value))" class="bg-stone-900 border border-stone-600 text-white text-xs rounded p-1 w-14 outline-none text-center font-bold focus:border-orange-500 cursor-pointer transition-colors">`;
    
    // Schleife für 1 bis 8 Spieler
    for (let i = 1; i <= 8; i++) {
        const isSelected = (i === countManagers) ? 'selected' : '';
        selectHtml += `<option value="${i}" ${isSelected}>${i}</option>`;
    }
    
    selectHtml += `</select>`;
    container.innerHTML = selectHtml;
    
    // Entfernt das 'gap-1' vom Parent-Container, da wir jetzt nur noch ein Element haben
    container.classList.remove('gap-1');
}

// =====================================================================
// LOGS & MODALS
// =====================================================================
function addLog(msg, type = "info") {
    const list = $('sap-log-list'); if (!list) return;
    if (list.innerHTML.includes("Wachen schlafen") || list.innerHTML.includes("Ruhe...") || list.innerHTML.includes("Die Wachen schlafen")) list.innerHTML = "";
    const d = new Date(); const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    let colorCls = type === "buy" ? "text-green-400" : type === "alert" ? "text-red-400" : type === "event" ? "text-yellow-400" : "text-stone-400";
    let iconHtml = type === "buy" ? '<i class="fa-solid fa-handshake"></i>' : type === "alert" ? '<i class="fa-solid fa-triangle-exclamation"></i>' : type === "event" ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-circle-info"></i>';
    const li = document.createElement('li'); li.className = `${colorCls} border-b border-stone-700/50 pb-1 mb-1`;
    li.innerHTML = `<span class="text-stone-600 text-xs mr-1">[${time}]</span> ${iconHtml} ${msg}`;
    list.prepend(li);
}

// Full-screen scenes (hammer, flights, joker FX...) play first; a popup requested meanwhile waits
// until the last scene is gone. Every scene element carries one of these classes.
const sceneActive = () => !!document.querySelector('.auction-overlay, .shame-overlay, .fx-scene');
let deferredModal = null;
function sceneEnded() {
    if (sceneActive()) return;
    if (deferredModal) { const args = deferredModal; deferredModal = null; return showModal(...args); }
    runNextQueuedStep();
}
function showModal(title, text, callback = null, buttonLabel = 'OK') {
    if (sceneActive()) { deferredModal = [title, text, callback, buttonLabel]; return; }
    if ($('modal-title')) $('modal-title').innerHTML = title;
    if ($('modal-text')) $('modal-text').innerHTML = text;
    if ($('modal-ok-btn')) $('modal-ok-btn').innerText = buttonLabel;
    customModalCallback = callback;
    if ($('custom-modal')) $('custom-modal').classList.remove('hidden');
    else alert(`${title}

${text.replace(/<[^>]*>?/gm, '')}`);
}
function closeModal() {
    if ($('custom-modal')) $('custom-modal').classList.add('hidden');
    if (customModalCallback) { let cb = customModalCallback; customModalCallback = null; cb(); }
    // Every slot-filling action ends in this popup, so follow-up steps wait for the host to close it
    setTimeout(runNextQueuedStep, 250);
}

// One follow-up at a time, each behind its own popup:
// deal popup -> (last card) -> "Kategorie abgeschlossen" -> wheel
function runNextQueuedStep() {
    if ($('custom-modal') && !$('custom-modal').classList.contains('hidden')) return; // a newer popup is up; its close calls us again
    if (sceneActive() || deferredModal) return;                                      // animation still running
    if (pendingLastCardCat) return resolveLastCard();
    if (pendingCategoryFinish) return announceCategoryFinished();
}
function showConfirmModal(text, callback) {
    if ($('confirm-text')) $('confirm-text').innerHTML = text;
    currentConfirmCallback = callback;
    if ($('confirm-modal')) $('confirm-modal').classList.remove('hidden');
    else if (confirm(text.replace(/<[^>]*>?/gm, ''))) callback();
}
function closeConfirmModal() { if ($('confirm-modal')) $('confirm-modal').classList.add('hidden'); currentConfirmCallback = null; }

document.addEventListener('DOMContentLoaded', function() {
    if ($('confirm-yes-btn')) $('confirm-yes-btn').addEventListener('click', function () {
        if (currentConfirmCallback) currentConfirmCallback(); closeConfirmModal();
    });
});

function getDynamicDescHtml(item, useAdminDesc = false) {
    let text = (useAdminDesc && item.adminDesc) ? item.adminDesc : item.desc;
    if (!text) text = ''; // Sicherheits-Check: Verhindert Absturz, wenn Text fehlt
    let len = text.length;
    let sizeClass = "text-[16px] leading-snug"; // Standard für kurzen Text
    
    // Prüfen, wie lang der Text ist und CSS-Klasse anpassen
    if (len > 150) sizeClass = "text-xs leading-tight";      // Extrem lang
    else if (len > 100) sizeClass = "text-xs leading-tight"; // Sehr lang
    else if (len > 60) sizeClass = "text-sm leading-snug";       // Mittellang
    
    return `<div class="${sizeClass} transition-all">${text}</div>`;
}
// =====================================================================
// VIEW & TAB SWITCHING
// =====================================================================
function switchView(view) {
    currentView = view;
    ['tab-matrix', 'tab-admin', 'tab-used', 'tab-shredded'].forEach(id => { if ($(id)) $(id).className = "px-4 py-1.5 rounded-md text-xs font-bold text-stone-400 hover:text-white transition-all-custom"; });
    ['view-matrix', 'view-admin', 'view-used', 'view-shredded'].forEach(id => { if ($(id)) $(id).classList.add('hidden'); });
    if ($(`tab-${view}`)) $(`tab-${view}`).className = view === 'shredded' ? "px-4 py-1.5 rounded-md text-xs font-bold bg-red-600 text-white shadow-md transition-all-custom" : "px-4 py-1.5 rounded-md text-xs font-bold bg-orange-600 text-white shadow-md transition-all-custom";
    if ($(`view-${view}`)) $(`view-${view}`).classList.remove('hidden');
    if (view === 'matrix') renderMatrix();
    if (view === 'admin') renderAdminPool();
    if (view === 'used') renderUsedPool();
    if (view === 'shredded') renderShreddedPool();
}

function switchAdminTab(tab) {
    let catCls = "px-4 py-2 rounded-lg text-xs font-bold bg-stone-700 text-white shadow-md transition-all-custom";
    let evCls = "px-4 py-2 rounded-lg text-xs font-bold bg-stone-900 text-stone-400 hover:text-white border border-stone-700 transition-all-custom";
    if ($('admin-subtab-catalog')) $('admin-subtab-catalog').className = tab === 'catalog' ? catCls : evCls;
    if ($('admin-subtab-events')) $('admin-subtab-events').className = tab === 'events' ? catCls : evCls;
    if ($('admin-catalog-view')) $('admin-catalog-view').classList.toggle('hidden', tab !== 'catalog');
    if ($('admin-events-view')) $('admin-events-view').classList.toggle('hidden', tab !== 'events');
}

// =====================================================================
// SHREDDER MODE
// =====================================================================
function toggleShredderMode() {
    isShredderMode = !isShredderMode; itemsToShred = [];
    if (isShredderMode) {
        if ($('normal-admin-controls')) $('normal-admin-controls').classList.add('hidden');
        if ($('shredder-admin-controls')) $('shredder-admin-controls').classList.remove('hidden');
        if ($('auction-details-container')) $('auction-details-container').classList.add('hidden');
        if ($('shredder-details-container')) $('shredder-details-container').classList.remove('hidden');
        updateShredderButton();
    } else {
        if ($('normal-admin-controls')) $('normal-admin-controls').classList.remove('hidden');
        if ($('shredder-admin-controls')) $('shredder-admin-controls').classList.add('hidden');
        if ($('auction-details-container')) $('auction-details-container').classList.remove('hidden');
        if ($('shredder-details-container')) $('shredder-details-container').classList.add('hidden');
    }
    renderAdminPool();
}

function toggleShredderSelection(id) {
    if (itemsToShred.includes(id)) itemsToShred = itemsToShred.filter(x => x !== id); else itemsToShred.push(id);
    updateShredderButton(); renderAdminPool();
}
function updateShredderButton() { const btn = $('btn-execute-shred'); if (btn) btn.innerText = `${itemsToShred.length} Vernichten`; }
function selectAllBadItems() {
    itemsToShred = []; const list = itemDatabase[adminCategory];
    if (list) list.forEach(item => { if (item.tier === 'schlecht') itemsToShred.push(item.id); });
    updateShredderButton(); renderAdminPool();
}
function executeShredding() {
    if (itemsToShred.length === 0) return showModal("Fehler", "Keine Ware markiert.");
    showConfirmModal(`Wirklich ${itemsToShred.length} Items ins Klo werfen?`, () => {
        let count = 0;
        itemsToShred.forEach(id => {
            const idx = itemDatabase[adminCategory].findIndex(x => x.id === id);
            if (idx !== -1) { shreddedDatabase.push(itemDatabase[adminCategory].splice(idx, 1)[0]); count++; }
        });
        saveDatabases(); addLog(`${count} Items vernichtet.`, "alert");
        toggleShredderMode(); showModal("🚽 WEGGESPÜLT", `${count} Items vernichtet.`);
    });
}

// =====================================================================
// DATENBANK MANAGEMENT
// =====================================================================
async function buildDatabase() {
    const dbKey = `${Config.themeId}_db`; const shreddedKey = `${Config.themeId}_shredded`; const usedKey = `${Config.themeId}_used`;
    const savedShredded = localStorage.getItem(shreddedKey); if (savedShredded) shreddedDatabase = JSON.parse(savedShredded);
    const savedUsed = localStorage.getItem(usedKey); if (savedUsed) usedDatabase = JSON.parse(savedUsed);
    const savedDB = localStorage.getItem(dbKey);
    if (savedDB) { itemDatabase = unpackDatabase({ itemDatabase: JSON.parse(savedDB), used: usedDatabase, shredded: shreddedDatabase }).itemDatabase; updateGlobalIdCounter(); return true; }

    try {
    const response = await fetch(Config.databaseFile);
    if (response.ok) {
            let data = await response.json();
            data = unpackDatabase(data);
            itemDatabase = data.db || data.itemDatabase || data;
            if (data.shredded) shreddedDatabase = data.shredded;
            if (data.used) usedDatabase = data.used;
            activeCategories.forEach(c => { if (!itemDatabase[c] || !Array.isArray(itemDatabase[c])) itemDatabase[c] = []; });
            saveDatabases(); updateGlobalIdCounter(); return true;
        }
    } catch (e) { console.log("DB Fetch Fehler."); }
    return false;
}

function saveDatabases() {
    localStorage.setItem(`${Config.themeId}_db`, JSON.stringify(itemDatabase));
    localStorage.setItem(`${Config.themeId}_shredded`, JSON.stringify(shreddedDatabase));
    localStorage.setItem(`${Config.themeId}_used`, JSON.stringify(usedDatabase));
}

function updateGlobalIdCounter() {
    let maxId = 0;
    for (let cat in itemDatabase) { itemDatabase[cat].forEach(item => { if (item && item.id) { let idNum = parseInt(String(item.id).split('_')[1]); if (!isNaN(idNum)) maxId = Math.max(maxId, idNum); } }); }
    globalIdCounter = maxId + 1;
}

function importDB(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            let data = JSON.parse(event.target.result);
	    data = unpackDatabase(data);
            itemDatabase = data.db || data.itemDatabase || data;
            if (data.shredded) shreddedDatabase = data.shredded;
            if (data.used) usedDatabase = data.used;
            activeCategories.forEach(c => { if (!itemDatabase[c] || !Array.isArray(itemDatabase[c])) itemDatabase[c] = []; });
            saveDatabases(); updateGlobalIdCounter();
            renderAdminPool(); if (currentView === 'used') renderUsedPool(); if (currentView === 'shredded') renderShreddedPool();
            addLog("Datenbank manuell importiert.", "info"); showModal("Import erfolgreich", "Die Datenbank wurde geladen.");
            if (document.querySelectorAll('#pool-gut > div').length > 0) switchView('matrix');
        } catch (err) { showModal("Formatfehler", "Formatfehler in der JSON."); }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function exportDB() {
    const data = { db: itemDatabase, shredded: shreddedDatabase, used: usedDatabase };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${Config.themeId}_db_export.json`; a.click(); URL.revokeObjectURL(url);
    addLog("Datenbank exportiert.", "info");
}

function resetDatabase() {
    showConfirmModal("System komplett zurücksetzen?", async () => {
        localStorage.removeItem(`${Config.themeId}_db`); localStorage.removeItem(`${Config.themeId}_shredded`); localStorage.removeItem(`${Config.themeId}_used`);
        globalIdCounter = 1; itemDatabase = {}; activeCategories.forEach(c => itemDatabase[c] = []); shreddedDatabase = []; usedDatabase = [];
        selectedAuctionItem = null; isShredderMode = false; itemsToShred = [];
        if ($('active-bid-target')) { $('active-bid-target').innerText = "Nichts ausgewählt"; $('active-bid-start-price').innerText = "Mindestpreis: -"; $('active-bid-desc').innerHTML = ""; if ($('auction-price')) $('auction-price').value = ''; if ($('auction-buyer')) $('auction-buyer').value = ''; }
        if ($('normal-admin-controls')) $('normal-admin-controls').classList.remove('hidden');
        if ($('shredder-admin-controls')) $('shredder-admin-controls').classList.add('hidden');
        if ($('auction-details-container')) $('auction-details-container').classList.remove('hidden');
        if ($('shredder-details-container')) $('shredder-details-container').classList.add('hidden');
        addLog("System zurückgesetzt.", "alert");
        const loaded = await buildDatabase();
        if (loaded) showModal("♻️ Reset", "Datenbank neu geladen."); else { switchView('admin'); showModal("♻️ Geleert", "Bitte JSON erneut hochladen."); }
        renderAdminPool(); renderMatrix();
    });
}

function emptyTrash() {
    if (shreddedDatabase.length === 0) return showModal("Klo ist leer", "Es gibt hier nichts zu löschen.");
    showConfirmModal("Achtung! Unwiderruflich vernichten?", () => {
        shreddedDatabase = []; saveDatabases(); renderShreddedPool();
        showModal("🚽 Weg!", "Der Ballast ist weggespült."); addLog("Items endgültig vernichtet.", "alert");
    });
}

function restoreFromShredder(id) {
    const idx = shreddedDatabase.findIndex(x => x.id === id);
    if (idx !== -1) {
        const item = shreddedDatabase.splice(idx, 1)[0]; const cat = item.dbCategory || adminCategory;
        if (itemDatabase[cat]) itemDatabase[cat].push(item);
        saveDatabases(); renderShreddedPool(); if (currentView === 'admin') renderAdminPool();
        addLog(`Zurückgeholt.`, "info");
    }
}
function unpackDatabase(data) {
    // dbCategory is derived from the object key (compact decks like airline omit it)
    if (data.db) for (let cat in data.db) data.db[cat].forEach(item => { item.dbCategory = cat; });
    // Unicorns are marked by their holo frame, not by text: drop the old "🦄 " name prefix from saved or imported decks
    const decks = Object.values(data.db || data.itemDatabase || data).filter(Array.isArray);
    [...decks.flat(), ...(data.used || []), ...(data.shredded || [])].forEach(item => { if (typeof item?.name === 'string') item.name = item.name.replace(/^🦄\s*/u, ''); });
    return data;
}
// =====================================================================
// UI RENDERING
// =====================================================================
function renderCategoryButtons() {
    const adminFilters = $('admin-category-filters');
    let adminHtml = '';
    for (let catKey in Config.categories) {
        let catData = Config.categories[catKey];
        adminHtml += `<button title="${catData.desc}" onclick="filterAdminCategory('${catKey}', this)" class="admin-cat-btn px-3 py-1.5 rounded text-xs text-stone-400 hover:text-white transition">${catData.icon} ${catData.name}</button>`;
    }
    if (adminFilters) adminFilters.innerHTML = adminHtml;
    const firstAdminBtn = document.querySelector('.admin-cat-btn');
    if (firstAdminBtn) firstAdminBtn.className = "admin-cat-btn px-3 py-1.5 rounded text-xs font-bold bg-orange-600 text-white transition";
}
function filterAdminCategory(cat, btn) {
    adminCategory = cat;
    document.querySelectorAll('.admin-cat-btn').forEach(b => b.className = "admin-cat-btn px-3 py-1.5 rounded text-xs text-stone-400 hover:text-white transition");
    if (btn) btn.className = "admin-cat-btn px-3 py-1.5 rounded text-xs font-bold bg-orange-600 text-white transition";
    renderAdminPool();
}

// Points a card is worth for this player, perks included
function cardPoints(m, card, cat) {
    let s = card?.score || 0;
    if (m.perk === 'perk1' && m.protegeCats?.includes(cat)) s = Math.floor(s * getConf('perks','perk1_protegeMultiplier'));
    if (m.perk === 'perk3' && card?.tier === 'schlecht') s = Math.floor(s * getConf('perks','perk3_badTierMultiplier'));
    if (m.perk === 'perk8') s += getConf('perks','perk8_flatScoreBonus');
    return s;
}
const managerPoints = m => Object.keys(m.team).reduce((sum, cat) => sum + (m.team[cat] ? cardPoints(m, m.team[cat], cat) : 0), 0);

// Only the running category is a column of the matrix - it takes the whole leftover width and
// carries its question and progress. Everything played and everything still to come lives in the
// track beside the board. Runs on every category switch too, so no re-render is needed.
function markCategoryColumns() {
    const rows = document.querySelectorAll('#matrix-body tr');
    activeCategories.forEach((key, i) => {
        const active = key === activeMatrixAuctionCategory;
        const th = document.querySelector(`#matrix-header-row th:nth-child(${i + 2})`);
        if (!th) return;
        th.classList.toggle('is-active-col', active);
        th.classList.toggle('col-next', !active);
        th.style.width = active ? '' : '0';  // '' = the active column takes the rest
        rows.forEach(tr => {
            const td = tr.children[i + 1];
            if (!td) return;
            td.classList.toggle('col-active', active);
            td.classList.toggle('col-next', !active);
        });
    });
    renderCategoryQueue();
    // zweimal: der erste Lauf misst noch das alte Layout, der zweite raeumt den Rest weg
    requestAnimationFrame(() => { fitBoardRows(); requestAnimationFrame(fitBoardRows); });
}

// Share the height the board actually has between the player rows, so zooming in or resizing
// shrinks the cards instead of producing a scrollbar. Below the floor the board scrolls -
// the player cell itself (name, jokers, budget) cannot get smaller than that.
function fitBoardRows() {
    const wrap = document.querySelector('.matrix-table-wrap > div'), head = $('matrix-header-row');
    if (!wrap || !head || !managers.length) return;
    const perRow = (wrap.clientHeight - head.offsetHeight) / managers.length;
    const slot = Math.max(58, Math.min(118, Math.round(perRow) - 18)); // 18px = padding of the slot cell
    const st = document.documentElement.style;
    st.setProperty('--slot-min', slot + 'px');
    st.setProperty('--row-pad', Math.max(3, Math.min(14, Math.round((perRow - 90) / 2))) + 'px');
    // enge Zeilen verlieren die Textabzeichen und das Wort "Punkte" - dafuer bleibt alles lesbar
    document.getElementById('matrix-body').classList.toggle('is-dense', perRow < 136);
}
window.addEventListener('resize', fitBoardRows); // fires on browser zoom too

// Die Spur neben dem Brett: ein Platz je Kategorie der Runde, in Spielreihenfolge von oben nach
// unten. Ein kommender Platz ist leer, der laufende bekommt den roten Ring, ein gespielter fuellt
// sich mit dem Symbol der Kategorie - und zeigt beim Hover, wer dort was fuer wie viel gekauft hat.
function renderCategoryQueue() {
    const track = $('category-queue'); if (!track) return;
    const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
    track.innerHTML = activeCategories.map(key => {
        const c = Config.categories[key] || {}, lower = key.toLowerCase(), name = esc(c.name || key);
        const active = key === activeMatrixAuctionCategory;
        const done = !active && completedCategoryNames.includes(lower);
        const rows = done ? managers.map(m => {
            const card = m.team[lower];
            if (!card) return `<div class="ct-row"><span class="ct-p">${esc(m.name)}</span><span class="ct-c">nicht gekauft</span></div>`;
            const pts = cardPoints(m, card, lower);
            return `<div class="ct-row"><span class="ct-p">${esc(m.name)}</span><span class="ct-c">${esc(card.name)}</span>
                <span class="ct-m">${(card.paid ?? card.cost ?? 0).toLocaleString()} ${Config.currency.symbol} · ${pts >= 0 ? '+' : ''}${pts}</span></div>`;
        }).join('') : '';
        return `<div class="ct-tile ${active ? 'is-active' : done ? 'is-done' : 'is-open'}"${done ? '' : ` title="${name}"`}>
            <span class="ct-icon">${c.icon || ''}</span>
            ${done ? `<div class="ct-tip"><b>${name}</b>${rows}</div>` : ''}
        </div>`;
    }).join('');
}

// The waiting category slides in from the track: its freshly revealed column wipes in from the
// right, while the place of the category just finished fills up with its symbol.
function slideCategoryIn(key, doneKey) {
    if (reducedMotion()) return;
    const tile = document.querySelectorAll('#category-queue .ct-tile')[activeCategories.indexOf(doneKey)];
    if (tile) restartClass(tile, 'ct-fill');
    const i = activeCategories.indexOf(key); if (i < 0) return;
    const th = document.querySelector(`#matrix-header-row th:nth-child(${i + 2})`);
    const cells = [th, ...document.querySelectorAll(`#matrix-body tr > :nth-child(${i + 2})`)].filter(Boolean);
    cells.forEach(el => restartClass(el, 'col-enter'));
}

// Kurzform fuer die Geldkachel: 1M / 0,9M - bei kleinem Startbudget in Tausend, sonst stuende dort nur 0.
function shortMoney(v) {
    if (!v) return '0';
    const [div, suffix] = startingBudget >= 1e6 ? [1e6, 'M'] : startingBudget >= 1e4 ? [1e3, 'k'] : [1, ''];
    const n = v / div;
    return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('de-DE') + suffix;
}
const jokerTileIcon = () => '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';

// Die Jokerkachel zeigt nur die Anzahl - der Klick klappt die einzelnen Joker ueber dem Brett auf.
function toggleJokerTray(id, ev) {
    if (ev) ev.stopPropagation();
    const tile = $(`joker-tile-${id}`), wasOpen = tile?.classList.contains('is-open');
    document.querySelectorAll('.p-jokers.is-open').forEach(t => t.classList.remove('is-open'));
    if (tile && !wasOpen) tile.classList.add('is-open');
}
document.addEventListener('click', () => document.querySelectorAll('.p-jokers.is-open').forEach(t => t.classList.remove('is-open')));

function renderMatrix() {
    const thead = $('matrix-header-row'); const tbody = $('matrix-body');
    if (!thead || !tbody) return;

    let hHtml = `<th class="py-3 px-4 bg-stone-800 shadow-sm" style="width:220px">${Config.terminology.playerSingular}</th>`;
    const colorSet = ['text-red-400', 'text-orange-400', 'text-purple-400', 'text-rose-400', 'text-yellow-400', 'text-green-400', 'text-cyan-400'];
activeCategories.forEach((cat, idx) => {
        let cData = Config.categories[cat];
        let isActive = (cat === activeMatrixAuctionCategory);

        let btnClass = isActive
            ? "matrix-cat-btn w-full h-full bg-stone-900 text-orange-400 text-xs font-black py-2 border-b-2 border-orange-500 transition-colors"
            : "matrix-cat-btn w-full h-full bg-transparent hover:bg-stone-800 text-stone-400 text-xs font-bold py-2 border-b-2 border-transparent transition-colors";

        // Question, chapter count and one dot per player slot used to live in a bar above the board.
        // They are rendered for every column but only shown for the active one (CSS), so a category
        // switch needs no re-render.
        const lower = cat.toLowerCase(), taken = managers.filter(m => m.team[lower]).length, open = managers.length - taken;
        const dots = managers.map(m => `<i class="${m.team[lower] ? 'is-filled' : ''}"></i>`).join('');
        const meta = `<span class="cat-head-q">${cData.desc || ''}</span>
                      <span class="cat-head-meta"><b>${idx + 1} / ${activeCategories.length}</b><span class="cat-head-dots">${dots}</span><small>${open ? `noch ${open} von ${managers.length} offen` : 'komplett vergeben'}</small></span>`;

        // Hinweis: p-0 im <th> sorgt dafür, dass der Button 100% der Zelle ausfüllt
        hHtml += `<th title="${cData.name} – ${cData.desc}" class="p-0 text-center border-l border-stone-700/50 bg-stone-800 shadow-sm align-middle h-full">
                    <button onclick="selectMatrixAuctionCategory('${cat}', this)" class="${btnClass}"><span class="cat-head-icon block text-base leading-none">${cData.icon}</span><span class="cat-head-name block text-xs leading-tight mt-1">${cData.name}</span>${meta}</button>
                  </th>`;
    });

    thead.innerHTML = hHtml;
    tbody.innerHTML = '';

    managers.forEach(m => {
        const isBlk = m.id === blockedPlayerId;
// Die Joker liegen hinter der Jokerkachel: ein Klick klappt sie ueber dem Brett auf.
let jokerTray = '', jokerTotal = 0;
const fnMap = { block: 'useBlockJoker', bonus: 'useBonusJoker', autoBuy: 'useAutoBuyJoker', gamble: 'useGambleJoker', skip: 'useSkipJoker' };
for (let jKey in Config.terminology.jokers) {
    if (m.jokers[jKey] > 0) {
        jokerTotal += m.jokers[jKey];
        let jData = Config.terminology.jokers[jKey];
        let countLabel = m.jokers[jKey] > 1 ? `<span class="jtray-cnt">${m.jokers[jKey]}</span>` : '';
        let c = jokerColor(jData.color || 'stone');
        const roundLocked = (jKey === 'block' && jokerPhaseState.blockUsed) || (jKey === 'autoBuy' && jokerPhaseState.autoBuyUsed);
        let cls = `jtray-btn text-${c}-400 hover:border-${c}-400${roundLocked ? ' is-locked' : ''}`;
        jokerTray += `<button onclick="${fnMap[jKey]}(${m.id})" title="${jData.label}${roundLocked ? ' – diese Runde schon gespielt' : ''}" class="${cls}" aria-label="${jData.label}">${jokerIcon(jKey)}${countLabel}</button>`;
    }
}

        let slots = activeCategories.map(k => renderSlotCell(m.id, k.toLowerCase(), m.team[k.toLowerCase()])).join('');
        let blkOverlay = isBlk ? `<span class="blocked-badge pbadge is-lock">🔒 Gesperrt</span>` : '';
        let cbBadge = m.cashbackActive ? `<span class="shield-badge pbadge is-shield" title="Schützt bis zum nächsten Kauf">🛡️ Bonus aktiv</span>` : '';
        let perkBadge = m.perk !== 'NONE' ? `<span class="pbadge is-perk" title="${Config.perks[m.perk]?.desc || ''}">${Config.perks[m.perk]?.name || m.perk}</span>` : '';
        // bei engen Zeilen tritt an die Stelle der Abzeichen ein farbiger Punkt neben dem Namen
        let stateDot = isBlk ? '<span class="pstate is-lock" title="Gesperrt"></span>'
            : m.cashbackActive ? '<span class="pstate is-shield" title="Bonus aktiv"></span>'
            : m.perk !== 'NONE' ? `<span class="pstate is-perk" title="${Config.perks[m.perk]?.name || ''}"></span>` : '';

        let bp = managerPoints(m);
        let isLow = m.budget < (startingBudget * 0.15);
        const pos = playerJokerOrder.indexOf(m.id) + 1;

tbody.innerHTML += `
            <tr class="${isBlk ? 'row-blocked bg-red-950/40 border-l-4 border-red-500 grayscale transition opacity-80' : 'hover:bg-stone-900/30 transition'}${m.cashbackActive ? ' row-shielded' : ''}">
                <td class="player-col align-top">
    <div class="pcell">
        <div class="ptile p-name">
            <div class="p-name-top">
                ${pos ? `<span class="joker-order${pos === 1 ? ' is-next' : ''}" title="Joker-Reihenfolge: Platz ${pos}">${pos}</span>` : ''}
                <input type="text" value="${m.name}" onchange="renameManager(${m.id}, this.value)" class="p-name-input" aria-label="Name">
                ${stateDot}
            </div>
            <div class="pbadges">${blkOverlay}${perkBadge}${cbBadge}</div>
        </div>
        <div class="ptile-row">
            <div class="ptile p-jokers${jokerTotal ? '' : ' is-empty'}" id="joker-tile-${m.id}">
                <button class="ptile-btn" onclick="toggleJokerTray(${m.id}, event)" aria-label="Joker öffnen" title="Joker öffnen">
                    <span class="pt-corner">${jokerTotal}</span>
                    <span class="pt-glyph">${jokerTileIcon()}</span>
                </button>
                <div class="jtray">${jokerTray || '<span class="jtray-none">keine Joker</span>'}</div>
            </div>
            <div class="ptile p-money${isLow ? ' is-low' : ''}">
                <span class="pt-corner" id="budget-short-${m.id}">${shortMoney(m.budget)}</span>
                <span class="pt-glyph pt-cur">${Config.currency.symbol}</span>
                <span class="pt-tip" id="budget-display-${m.id}">${m.budget.toLocaleString()} ${Config.currency.symbol}</span>
            </div>
            <div class="ptile p-points">
                <span class="pt-corner">Punkte</span>
                <span class="pt-val${bp < 0 ? ' is-neg' : ''}" id="points-num-${m.id}">${bp}</span>
            </div>
        </div>
    </div>
</td>

                ${slots}
            </tr>`;
});
    markCategoryColumns();
}
function renderSlotCell(mId, k, pObj) {
    let m = managers.find(x => x.id === mId);
    let isProtege = (m && m.protegeCats && m.protegeCats.includes(k));
   let specialBorderClass = isProtege
    ? 'shadow-[inset_0_0_0_2px_rgba(234,179,8,0.55),inset_0_0_14px_rgba(234,179,8,0.25)]' // no bg class: a translucent fill would let the metal frame show through
    : '--';
  if (!pObj) {
    const emptyHighlight = isProtege ? 'bg-yellow-950/20 shadow-[inset_0_0_0_2px_rgba(234,179,8,0.3)] rounded-lg' : '';
    return `<td class="py-2 px-1 text-center border-l border-stone-700/40"><div class="slot-empty h-[80px] ${emptyHighlight}"></div></td>`;
}
    // Metal frame per tier (bronze / silver / gold / holo); pips repeat the tier for colour-blind players
    const tierCls = isHolo(pObj) ? 'tier-unicorn' : `tier-${pObj.tier}`;
    const pips = '<i></i>'.repeat(isHolo(pObj) ? 1 : pObj.tier === 'gut' ? 3 : pObj.tier === 'mittel' ? 2 : 1);
    let displayScore = pObj.score || 0; let isBoosted = false;
    if (m) {
        if (m.perk === 'perk1' && isProtege) { displayScore = Math.floor(displayScore * getConf('perks','perk1_protegeMultiplier')); isBoosted = true; }
        if (m.perk === 'perk3' && pObj.tier === 'schlecht') { displayScore = Math.floor(displayScore * getConf('perks','perk3_badTierMultiplier')); isBoosted = true; }
        if (m.perk === 'perk8') { displayScore += getConf('perks','perk8_flatScoreBonus'); isBoosted = true; }
    }

    let scoreHtml = isBoosted ? `<i class="fa-solid fa-arrow-trend-up text-xs text-yellow-400"></i> <span class="text-yellow-400 font-black animate-pulse">${displayScore}</span>` : `<i class="fa-solid fa-star text-xs text-lime-400"></i> ${displayScore}`;

    return `<td class="py-2 px-0.5 text-center border-l border-stone-700/40 relative group/cell"><div onclick="removePlayerFromMatrix(${mId}, '${k}')" class="group/card slot-frame ${tierCls} relative cursor-pointer h-[115px]"><div class="slot-score">${scoreHtml}</div><div class="slot-face ${specialBorderClass} group-hover/card:bg-red-950"><span class="slot-icon text-2xl mb-1 group-hover/card:hidden">${pObj.icon}</span><span class="slot-icon text-2xl mb-1 hidden group-hover/card:inline text-red-500"><i class="fa-solid fa-toilet"></i></span><span class="slot-name text-xs font-bold text-white leading-tight w-full px-0.5 line-clamp-2 group-hover/card:text-red-400">${pObj.name}</span></div><div class="slot-pips" aria-hidden="true">${pips}</div></div><div class="absolute top-[90px] left-1/2 transform -translate-x-1/2 w-56 bg-stone-800 border-2 border-stone-600 text-stone-200 p-3 rounded-xl shadow-2xl hidden group-hover/cell:flex z-[100] pointer-events-none flex-col items-start text-left"><div class="font-black text-white text-sm mb-1 leading-tight">${pObj.name}</div><div class="text-xs italic leading-snug text-stone-400 mb-2">${pObj.desc}</div><div class="mt-auto text-amber-400 font-bold text-xs w-full text-right">${pObj.cost.toLocaleString()} ${Config.currency.symbol}</div></div></td>`;
}

function renderAdminPool() {
    const cont = $('catalog-container'), hide = $('catalog-hidden-placeholder');
    const shouldHide = (selectedAuctionItem !== null || manualCatalogHide) && !boolForceShowCatalog && !isShredderMode;
    if (cont && hide) {
        if (shouldHide) {
            cont.classList.add('hidden'); hide.classList.remove('hidden');
            const m = $('manual-catalog-toggle'); if (m) { m.innerText = "Einblenden"; m.className = "flex-1 w-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold py-1 px-1.5 rounded transition shadow-md border border-orange-500"; }
        } else {
            cont.classList.remove('hidden'); hide.classList.add('hidden');
            const m = $('manual-catalog-toggle'); if (m) { m.innerText = "Verbergen"; m.className = "flex-1 w-full bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold py-1 px-1.5 rounded transition border border-stone-600"; }
        }
    }
    const q = $('admin-search-input') ? $('admin-search-input').value.toLowerCase() : '';
    const list = itemDatabase[adminCategory] ? itemDatabase[adminCategory].filter(item => {
        if (!q) return true;
        return item.name.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || (item.adminDesc && item.adminDesc.toLowerCase().includes(q));
    }) : [];
    ['pool-gut', 'pool-mittel', 'pool-schlecht'].forEach(id => { if ($(id)) $(id).innerHTML = ''; });
    list.forEach(item => {
        let isSel = itemsToShred.includes(item.id);
        let cls = isShredderMode ? (isSel ? 'border-2 border-red-500 bg-red-950/40 scale-[0.98]' : 'border border-stone-700 bg-stone-800 opacity-70') : (selectedAuctionItem?.id === item.id ? 'border-2 border-orange-400 bg-orange-950/20' : 'border border-stone-700 bg-stone-800 hover:border-stone-500');
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        let ca = isShredderMode ? `toggleShredderSelection('${item.id}')` : `selectAuctionItem('${item.id}')`;
        let overlay = (isShredderMode && isSel) ? `<div class="absolute inset-0 bg-red-900/20 flex items-center justify-center rounded-lg pointer-events-none"><i class="fa-solid fa-toilet text-3xl text-red-500 opacity-60 animate-pulse"></i></div>` : '';
        let div = item.tier === 'gut' ? 'pool-gut' : item.tier === 'mittel' ? 'pool-mittel' : 'pool-schlecht';
        if ($(div)) $(div).innerHTML += `<div onclick="${ca}" class="p-2 rounded-lg cursor-pointer transition-all-custom flex flex-col justify-between min-h-[50px] ${cls} border-b-[3px] ${bb} overflow-hidden relative">${overlay}<div class="relative z-10"><div class="flex justify-between items-center gap-1.5 mb-1"><div class="flex items-center gap-1.5 min-w-0"><span class="text-sm flex-shrink-0">${item.icon}</span><h4 class="font-bold text-white text-xs truncate leading-none" title="${item.name}">${item.name}</h4></div><div class="flex items-center gap-1 flex-shrink-0"><span class="text-xs bg-stone-900 text-stone-300 px-1 py-0.5 rounded font-bold">${item.cost >= 1000 ? item.cost / 1000 + 'k' : item.cost}</span><div class="text-xs text-lime-400 font-bold px-1 py-0.5 rounded bg-green-950/20 border border-green-900/30"><i class="fa-solid fa-star text-xs"></i> ${item.score}</div><button onclick="openEditModal(event, '${item.id}', '${adminCategory}')" class="text-stone-400 hover:text-white transition bg-stone-800 rounded px-1.5 py-0.5 border border-stone-600 shadow z-[50]" title="Bearbeiten"><i class="fa-solid fa-pen text-xs"></i></button></div></div><p class="text-xs text-stone-400 italic leading-tight line-clamp-1">${item.adminDesc || item.desc}</p></div></div>`;
    });
}

function renderEventsPool() {
    const container = $('events-container'); if (!container) return; container.innerHTML = '';
    if (Config.events) Config.events.forEach(ev => {
        container.innerHTML += `<div class="bg-stone-800 border border-stone-700 rounded-lg p-4 shadow flex flex-col gap-2 relative overflow-hidden group"><div class="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition"></div><h4 class="text-sm font-black text-yellow-400 leading-tight">${eventPreviewText(ev.title)}</h4><p class="text-xs text-stone-300 italic">${eventPreviewText(ev.desc)}</p></div>`;
    });
}

function renderUsedPool() {
    const c = $('used-container'); if (!c) return; c.innerHTML = '';
    if (usedDatabase.length === 0) { c.innerHTML = '<div class="col-span-full text-stone-500 text-sm italic py-6 text-center">Noch keine Ware gesichert.</div>'; return; }
    usedDatabase.forEach(item => {
        let owner = item.owner || "Unbekannt";
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        c.innerHTML += `<div class="p-3 rounded-lg border border-stone-700 bg-stone-800 flex flex-col justify-between min-h-[60px] border-b-[4px] ${bb}"><div><div class="flex justify-between items-start mb-2"><span class="text-xl">${item.icon}</span><div class="text-xs text-amber-400 font-bold bg-amber-950/40 px-1 py-0.5 rounded border border-green-900/50"><i class="fa-solid fa-star text-xs text-green-500"></i> ${item.score} Pkt.</div></div><h4 class="font-bold text-white text-xs truncate" title="${item.name}">${item.name}</h4><div class="text-xs text-stone-400 mt-1">Gesichert von: <strong class="text-orange-400">${owner}</strong></div></div><button onclick="returnToPool('${item.id}')" class="mt-3 w-full bg-stone-900 hover:bg-red-900/40 text-stone-400 hover:text-white text-xs font-bold py-1.5 rounded transition border border-stone-600 hover:border-red-900"><i class="fa-solid fa-rotate-left mr-1"></i> Entfernen</button></div>`;
    });
}

function renderShreddedPool() {
    const c = $('shredded-container'); if (!c) return; c.innerHTML = '';
    if (shreddedDatabase.length === 0) { c.innerHTML = '<div class="col-span-full text-stone-500 text-sm italic py-6 text-center">Klo ist leer.</div>'; return; }
    shreddedDatabase.forEach(item => {
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        c.innerHTML += `<div class="p-3 rounded-lg border border-red-900/30 bg-stone-800 flex flex-col justify-between min-h-[60px] border-b-[4px] ${bb} opacity-70 hover:opacity-100 transition"><div><span class="text-xl grayscale">${item.icon}</span><h4 class="font-bold text-stone-300 text-xs truncate line-through mt-1" title="${item.name}">${item.name}</h4></div><button onclick="restoreFromShredder('${item.id}')" class="mt-3 w-full bg-stone-800 text-stone-300 hover:text-white text-xs font-bold py-1.5 rounded transition border border-stone-600">Zurückholen</button></div>`;
    });
}

// =====================================================================
// POOL MANAGEMENT
// =====================================================================
function returnToPool(id) {
    let itemIndex = usedDatabase.findIndex(x => x.id === id);
    if (itemIndex === -1) return;
    let item = usedDatabase[itemIndex];
    showConfirmModal(`Möchtest du "<strong>${item.name}</strong>" zurück geben?`, () => {
        let returnedItem = usedDatabase.splice(itemIndex, 1)[0];
        delete returnedItem.owner;
        let catKey = returnedItem.dbCategory || activeCategories[0];
        if (!itemDatabase[catKey]) itemDatabase[catKey] = [];
        itemDatabase[catKey].push(returnedItem);
        managers.forEach(m => { for (let pos in m.team) { if (m.team[pos] && m.team[pos].id === id) m.team[pos] = null; } });
        saveDatabases(); updateEventChanceDisplays(); renderMatrix();
        if (currentView === 'used') renderUsedPool(); if (currentView === 'admin') renderAdminPool();
        addLog(`Manuell zurückgegeben: '${item.name}'.`, "alert");
    });
}

function returnAllToPool() {
    if (usedDatabase.length === 0) return showModal("Leer", "Es gibt keine gesicherten Items.");
    showConfirmModal("Wirklich ALLE gesicherten Items zurückgeben? (Aktive Slots werden geleert)", () => {
        usedDatabase.forEach(item => {
            delete item.owner;
            let catKey = item.dbCategory || activeCategories[0];
            if (!itemDatabase[catKey]) itemDatabase[catKey] = [];
            itemDatabase[catKey].push(item);
        });
        usedDatabase = [];
        managers.forEach(m => { for (let pos in m.team) m.team[pos] = null; });
        saveDatabases(); updateEventChanceDisplays(); renderMatrix();
        if (currentView === 'used') renderUsedPool(); if (currentView === 'admin') renderAdminPool();
        addLog("Alle Items aus den Slots entfernt.", "info");
        showModal("Erfolgreich", "Alle Items wurden entfernt und sind wieder verfügbar.");
    });
}

// =====================================================================
// SETUP & PERKS
// =====================================================================
function showPerksModal() {
    if (!$('perks-modal')) return;
    let phtml = '';
    managers.forEach(m => {
        let assigned = selectedPerksPending[m.id] || 'NONE';
        let opts = Object.keys(Config.perks).map(key => `<option value="${key}" ${assigned === key ? 'selected' : ''}>${Config.perks[key].name}</option>`).join('');
        phtml += `<div class="mb-4 bg-stone-800 p-3 rounded-lg border border-stone-600">
            <input type="text" id="perk-name-${m.id}" value="${m.name}" placeholder="Name eingeben..." class="w-full bg-transparent text-sm font-black text-orange-400 mb-1.5 border-b border-stone-600 focus:border-orange-500 outline-none pb-1 transition-colors">
            <select id="perk-select-${m.id}" onchange="updatePerkDesc(${m.id})" class="w-full bg-stone-900 border border-stone-500 text-white rounded p-2 text-xs outline-none font-bold shadow-inner">${opts}</select>
            <p class="text-xs text-stone-300 mt-2 italic leading-snug" id="perk-desc-${m.id}">${Config.perks[assigned].desc}</p>
        </div>`;
    });
    $('perk-setup-list').innerHTML = phtml;
    if ($('perk-player-count')) $('perk-player-count').value = countManagers;
    if ($('perk-player-label')) $('perk-player-label').innerText = Config.terminology.playerPlural;
    $('perks-modal').classList.remove('hidden');
}

function updatePerkDesc(mId) { const pKey = $(`perk-select-${mId}`)?.value; if (Config.perks[pKey]) $(`perk-desc-${mId}`).innerText = Config.perks[pKey].desc; }

function applyPerksAndStart() {
    managers.forEach(m => {
        const pKey = $(`perk-select-${m.id}`) ? $(`perk-select-${m.id}`).value : 'NONE';
        const nameInput = $(`perk-name-${m.id}`);
        if (nameInput && nameInput.value.trim() !== '') m.name = nameInput.value.trim();
        
        selectedPerksPending[m.id] = pKey; m.perk = pKey; m.protegeCats = [];
        m.jokers = { block: 1, bonus: 1, autoBuy: 1, gamble: 1, skip: 1 };
        if (pKey === 'perk1') {
            let cats = [...activeCategories];
            for (let i = 0; i < 2; i++) { if (cats.length > 0) m.protegeCats.push(cats.splice(Math.floor(Math.random() * cats.length), 1)[0].toLowerCase()); }
        }
        if (pKey === 'perk4') m.budget = Math.floor(m.budget * getConf('perks','perk4_budgetMultiplier'));
        if (pKey === 'perk7') m.jokers.block = getConf('perks','perk7_startingBlocks');
        if (pKey === 'perk8') m.jokers = { block: 0, bonus: 0, autoBuy: 0, gamble: 0, skip: 0 };
    });
    if ($('perks-modal')) $('perks-modal').classList.add('hidden');
    renderMatrix(); updateBuyerDropdown(); renderAdminPool(); renderEventsPool(); updateEventChanceDisplays();
    addLog(`Rollen wurden an ${Config.terminology.playerPlural} zugeteilt.`, "alert");
}

function startGameWithoutPerks() {
    managers.forEach(m => { 
        const nameInput = $(`perk-name-${m.id}`);
        if (nameInput && nameInput.value.trim() !== '') m.name = nameInput.value.trim();
        
        m.perk = 'NONE'; m.protegeCats = []; m.jokers = { block: 1, bonus: 1, autoBuy: 1, gamble: 1, skip: 1 }; 
    });
    if ($('perks-modal')) $('perks-modal').classList.add('hidden');
    renderMatrix(); updateBuyerDropdown(); renderAdminPool(); renderEventsPool(); updateEventChanceDisplays();
    addLog("Ohne Perks gestartet.", "info");
}

function openPerkCatalog() {
    const container = $('perk-catalog-container'); if (!container) return;
    container.innerHTML = '';
    Object.keys(Config.perks).forEach(key => {
        if (key === 'NONE') return;
        let p = Config.perks[key];
        container.innerHTML += `<div class="bg-stone-800 border border-orange-500/30 p-4 rounded-xl shadow-inner flex flex-col"><div class="text-lg font-black text-orange-400 mb-2">${p.name}</div><div class="text-xs text-stone-300 leading-relaxed flex-grow">${p.desc}</div><button onclick="playShowcase('${key}')" class="mt-3 self-start bg-stone-900 hover:bg-orange-600 text-stone-300 hover:text-white text-xs font-bold py-1.5 px-3 rounded-lg border border-stone-600 hover:border-orange-500 transition"><i class="fa-solid fa-play mr-1" aria-hidden="true"></i> So wirkt's</button></div>`;
    });
    if ($('perk-catalog-modal')) $('perk-catalog-modal').classList.remove('hidden');
}

function closePerkCatalog() { if ($('perk-catalog-modal')) $('perk-catalog-modal').classList.add('hidden'); }

// SHOWCASE ("So wirkt's"): a few beats on sample cards showing what a perk or joker does.
// key = 'perk1'..'perk8' (perk catalog) or 'joker:block' etc. (joker overview in the dock).
// Numbers come from the settings, cards from the loaded deck. Click / Space / Enter / Esc closes it.
function playShowcase(key) {
    const jl = k => Config.terminology?.jokers?.[k]?.label || k;
    const jokerKey = key.startsWith('joker:') ? key.slice(6) : null;
    const p = jokerKey ? { name: `<span class="text-${jokerColor(Config.terminology?.jokers?.[jokerKey]?.color || 'stone')}-400">${jokerIcon(jokerKey)}</span> ${jl(jokerKey)}` } : Config.perks?.[key];
    if (!p) return;
    const sym = Config.currency.symbol, fmt = n => `${Math.round(n).toLocaleString()} ${sym}`;
    const pct = f => `${Math.round(Math.abs(f - 1) * 100)} %`;
    const [pA, pB] = [0, 1].map(i => managers[i]?.name || `${Config.terminology.playerSingular} ${i + 1}`);
    const perk = k => getConf('perks', k);
    const deck = Object.values(itemDatabase).flat();
    const sample = (tier, skip = 0) => deck.filter(c => c.tier === tier && !isHolo(c))[skip]
        || { icon: '🂠', name: 'Beispielkarte', tier, score: { gut: 90, mittel: 60, schlecht: 20 }[tier] };
    const card = (c, id, cls = '') => `<div class="pk-card slot-frame tier-${c.tier} ${cls}" id="pk-${id}"><div class="slot-score">★ <b>${c.score}</b></div><div class="slot-face"><span class="pk-icon">${c.icon}</span><span class="pk-name">${c.name}</span></div></div>`;
    const eventValue = (action, fallback) => Number(Config.events?.find(e => e.action === action)?.value) || fallback;
    const start = startingBudget;

    let stage = '', beats = [];
    const q = id => s.el.querySelector('#pk-' + id);
    const score = id => q(id)?.querySelector('.slot-score b');
    const bump = el => restartClass(el, 'pk-bump');
    // counts the number inside el; `from`/`to` are numbers, the text keeps prefix/suffix
    const count = (el, from, to, { prefix = '', suffix = '' } = {}) => {
        if (!el) return; const t0 = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - t0) / 700);
            el.textContent = `${prefix}${Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))).toLocaleString()}${suffix}`;
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };
    const stamp = (el, text, red = false) => { el?.classList.toggle('is-countered', !red); el?.insertAdjacentHTML('beforeend', `<div class="fx-stamp">${text}</div>`); sfx.hit(); };
    const unstamp = el => el?.querySelector('.fx-stamp')?.remove();
    const float = (id, text, cls) => { const el = q(id); if (el) { el.textContent = text; el.className = `pk-float show ${cls}`; } };

    switch (key) {
        case 'perk1': { // Kern-Kategorien: more points, immune to the category strike
            const a = sample('gut'), b = sample('mittel'), m = perk('perk1_protegeMultiplier');
            stage = `<div class="pk-row">${card(a, 'a')}${card(b, 'b')}</div>`;
            beats = [
                [300, 'Zwei Kern-Kategorien werden zufällig zugeteilt', () => { q('b').classList.add('pk-core'); sfx.chime(); }],
                [1900, `In Kern-Kategorien: +${pct(m)} Punkte`, () => { count(score('b'), b.score, Math.floor(b.score * m)); bump(q('b')); sfx.points(); }],
                [3700, 'Kategorie gestrichen? In Kern-Kategorien bleiben die Punkte', () => { count(score('a'), a.score, 0); q('a').classList.add('pk-dead'); stamp(q('b'), '🛡️ IMMUN'); }]
            ];
            break;
        }
        case 'perk2': { // leftover budget -> points at the end
            const div = perk('perk2_interestDivisor'), mult = perk('perk2_interestMultiplier'), rest = div * 12, pts = 12 * mult;
            stage = `<div class="pk-row"><div class="pk-chip" id="pk-budget">${fmt(rest)}</div><span class="pk-arrow">➜</span><div class="pk-chip is-points" id="pk-pts">0 ⭐</div></div>`;
            beats = [
                [300, 'Spielende: Es ist noch Budget übrig', () => bump(q('budget'))],
                [1700, `Je ${fmt(div)} Restbudget = ${mult} Punkte`, () => { count(q('budget'), rest, 0, { suffix: ` ${sym}` }); count(q('pts'), 0, pts, { suffix: ' ⭐' }); sfx.coins(); }],
                [3000, `+${pts} Punkte in der Endwertung`, () => { bump(q('pts')); sfx.points(); }]
            ];
            break;
        }
        case 'perk3': { // bad-tier cards score more
            const g = sample('gut'), c = sample('schlecht'), m = perk('perk3_badTierMultiplier');
            stage = `<div class="pk-row">${card(g, 'g')}${card(c, 'c')}</div>`;
            beats = [
                [300, 'Gute Karten zählen ganz normal', () => bump(q('g'))],
                [1800, `Karten der schlechtesten Stufe: +${pct(m)} Punkte`, () => { count(score('c'), c.score, Math.floor(c.score * m)); bump(q('c')); q('c').classList.add('pk-core'); sfx.points(); }]
            ];
            break;
        }
        case 'perk4': { // less starting budget, more income
            const low = Math.floor(start * perk('perk4_budgetMultiplier')), m = perk('perk4_incomeMultiplier');
            const gain = eventValue('bonus_all', 50000), boosted = Math.floor(gain * m);
            stage = `<div class="pk-col"><div class="pk-chip" id="pk-budget">${fmt(start)}</div><div class="pk-float" id="pk-gain"></div></div>`;
            beats = [
                [300, `Startet mit ${pct(perk('perk4_budgetMultiplier'))} weniger Budget`, () => { count(q('budget'), start, low, { suffix: ` ${sym}` }); q('budget').classList.add('is-minus'); sfx.wahwah(); }],
                [2200, 'Event: Bonus für alle …', () => { q('gain').textContent = `+${fmt(gain)}`; q('gain').classList.add('is-plus', 'show'); sfx.whoosh(); }],
                [3300, `… und er kassiert +${pct(m)} mehr (Events, Glücksrad, Cashback)`, () => {
                    count(q('gain'), gain, boosted, { prefix: '+', suffix: ` ${sym}` }); count(q('budget'), low, low + boosted, { suffix: ` ${sym}` });
                    q('budget').classList.replace('is-minus', 'is-plus'); bump(q('gain')); sfx.coins();
                }]
            ];
            break;
        }
        case 'perk5': { // swap joker: choose from several cards
            const n = perk('perk5_gambleChoices'), tiers = ['schlecht', 'mittel', 'gut', 'mittel', 'schlecht'];
            const list = Array.from({ length: n }, (_, i) => sample(tiers[i], i));
            const best = list.reduce((b, c, i) => c.score > list[b].score ? i : b, 0);
            stage = `<div class="pk-row">${list.map((c, i) => card(c, 'o' + i, i ? 'pk-hidden' : '')).join('')}</div>`;
            beats = [
                [300, `Normaler ${jl('gamble')}: eine zufällige Karte`, () => { bump(q('o0')); sfx.flip(); }],
                [1900, `Mit Perk: ${n} Karten zur Auswahl`, () => { list.forEach((c, i) => i && s.at(i * 180, () => { q('o' + i).classList.remove('pk-hidden'); sfx.flip(); })); }],
                [3600, 'Die beste wird genommen', () => { list.forEach((c, i) => q('o' + i).classList.add(i === best ? 'pk-core' : 'pk-dead')); bump(q('o' + best)); sfx.chaching(); }]
            ];
            break;
        }
        case 'perk6': { // immune to money penalties, bonus on the wheel
            const tax = eventValue('tax_all', 50000), wheel = 40000, m = perk('perk6_wheelBonusMultiplier'), boosted = Math.floor(wheel * m);
            stage = `<div class="pk-col" id="pk-stage"><div class="pk-chip" id="pk-budget">${fmt(start)}</div><div class="pk-float" id="pk-hit"></div></div>`;
            beats = [
                [300, 'Event: Strafzahlung für alle …', () => { q('hit').textContent = `−${fmt(tax)}`; q('hit').classList.add('is-minus', 'show'); sfx.whoosh(); }],
                [1500, '… prallt an ihm ab', () => { q('hit').classList.add('pk-dead'); stamp(q('stage'), '🛡️ ABGEWEHRT'); }],
                [3300, `Glücksrad: +${pct(m)} obendrauf`, () => {
                    q('stage').querySelector('.fx-stamp')?.remove();
                    q('hit').className = 'pk-float is-plus show'; count(q('hit'), wheel, boosted, { prefix: '+', suffix: ` ${sym}` });
                    count(q('budget'), start, start + boosted, { suffix: ` ${sym}` }); q('budget').classList.add('is-plus'); sfx.coins();
                }]
            ];
            break;
        }
        case 'perk7': { // more block jokers, immune to blocks
            const n = perk('perk7_startingBlocks');
            stage = `<div class="pk-col" id="pk-stage"><div class="pk-chip text-red-400" id="pk-jokers">${jokerIcon('block')} ${jl('block')} ×<b id="pk-n">1</b></div><div class="pk-player" id="pk-player">${p.name}</div></div>`;
            beats = [
                [300, `Startet mit ${n}× ${jl('block')}`, () => { count(q('n'), 1, n); bump(q('jokers')); sfx.chime(); }],
                [1900, `Ein Mitspieler spielt ${jl('block')} gegen ihn …`, () => { q('player').classList.add('pk-target'); sfx.chains(); }],
                [3000, '… wirkungslos. Der Joker des Angreifers ist trotzdem weg', () => stamp(q('stage'), '🛡️ ABGEWEHRT')]
            ];
            break;
        }
        case 'perk8': { // no jokers, flat points per card
            const bonus = perk('perk8_flatScoreBonus'), list = [sample('gut'), sample('mittel'), sample('schlecht')];
            stage = `<div class="pk-col"><div class="pk-chip" id="pk-jk">${Object.keys(JOKER_ICONS).map(jokerIcon).join(' ')}</div><div class="pk-row">${list.map((c, i) => card(c, 'c' + i)).join('')}</div></div>`;
            beats = [
                [300, 'Verzichtet komplett auf Joker', () => { q('jk').classList.add('pk-dead'); sfx.wahwah(); }],
                [1900, `Dafür +${bonus} Punkte auf jede Karte`, () => list.forEach((c, i) => s.at(i * 350, () => { count(score('c' + i), c.score, c.score + bonus); bump(q('c' + i)); sfx.points(); }))]
            ];
            break;
        }
        case 'joker:block': { // target can't buy or play jokers until the next purchase
            const label = jl('block');
            stage = `<div class="pk-row"><div class="pk-player" id="pk-a">${pA}</div><span class="pk-arrow">${jokerIcon('block')}</span><div class="pk-slot" id="pk-bwrap"><div class="pk-player" id="pk-b">${pB}</div></div></div>`;
            beats = [
                [300, `${pA} spielt ${label} gegen ${pB}`, () => { bump(q('a')); sfx.whoosh(); }],
                [1300, `${pB} ist gesperrt …`, () => { q('b').classList.add('pk-target'); stamp(q('bwrap'), '🔒 GESPERRT', true); sfx.chains(); }],
                [2900, '… darf diese Runde nichts kaufen und keine Joker spielen', () => q('b').classList.add('pk-dead')],
                [4500, 'Nach dem nächsten Kauf ist die Sperre weg. Nur einmal pro Runde spielbar', () => { unstamp(q('bwrap')); q('b').classList.remove('pk-dead', 'pk-target'); sfx.chime(); }]
            ];
            break;
        }
        case 'joker:bonus': { // cashback on the next purchase
            const c = sample('mittel'), frac = getConf('mechanics', 'bonusCashbackFraction'), back = Math.floor(c.cost * frac), after = start - c.cost;
            stage = `<div class="pk-row"><div class="pk-col"><div class="pk-player" id="pk-a">${pA}</div><div class="pk-chip" id="pk-budget">${fmt(start)}</div><div class="pk-float" id="pk-gain"></div></div>${card(c, 'c', 'pk-hidden')}</div>`;
            beats = [
                [300, `${pA} aktiviert ${jl('bonus')}`, () => { q('a').classList.add('pk-core'); sfx.chaching(); }],
                [1600, `Nächster Kauf: ${fmt(c.cost)}`, () => { q('c').classList.remove('pk-hidden'); count(q('budget'), start, after, { suffix: ` ${sym}` }); q('budget').classList.add('is-minus'); sfx.gavel(0.6); }],
                [3000, `${Math.round(frac * 100)} % davon kommen zurück`, () => { float('gain', `+${fmt(back)}`, 'is-plus'); count(q('budget'), after, after + back, { suffix: ` ${sym}` }); q('budget').classList.replace('is-minus', 'is-plus'); sfx.coins(); }],
                [4500, 'Kauft ein anderer zuerst, verfällt der Schutz', () => q('a').classList.remove('pk-core')]
            ];
            break;
        }
        case 'joker:autoBuy': { // random card from the category at a markup, penalty card if unaffordable
            const c = sample('gut', 1), factor = getConf('mechanics', 'autoBuyMultiplier'), price = Math.floor(c.cost * factor), tpl = Config.punishCardTemplate || {};
            stage = `<div class="pk-col">${card(c, 'c', 'pk-back')}<div class="pk-chip" id="pk-price">${fmt(c.cost)}</div><div class="pk-float" id="pk-note"></div></div>`;
            beats = [
                [300, `${pA} greift blind eine Karte aus der Kategorie`, () => { bump(q('c')); sfx.whoosh(); }],
                [1600, 'Aufgedeckt, egal wie gut sie ist', () => { q('c').classList.remove('pk-back'); sfx.flip(); }],
                [2800, `Kaufpreis × ${factor.toLocaleString('de-DE')}`, () => { count(q('price'), c.cost, price, { suffix: ` ${sym}` }); q('price').classList.add('is-minus'); sfx.coins(); }],
                [4300, 'Reicht das Budget nicht, gibt es stattdessen die Strafkarte', () => { float('note', `${tpl.icon || '💩'} ${tpl.name || 'Strafkarte'}`, 'is-minus'); sfx.wahwah(); }]
            ];
            break;
        }
        case 'joker:gamble': { // own card back to the catalogue, random card of the same category in
            const old = sample('schlecht', 1), neu = sample('gut', 2);
            stage = `<div class="pk-row">${card(old, 'old')}<span class="pk-arrow">⇄</span>${card(neu, 'new', 'pk-hidden')}</div>`;
            beats = [
                [300, `${pA} gibt eine gekaufte Karte ab`, () => { bump(q('old')); sfx.whoosh(); }],
                [1600, 'Sie geht zurück in den Katalog …', () => { q('old').classList.add('pk-dead'); sfx.flip(); }],
                [2700, '… und kostenlos kommt eine zufällige Karte derselben Kategorie', () => { q('new').classList.remove('pk-hidden'); bump(q('new')); sfx.chaching(); }],
                [4200, 'Glückssache: Die neue kann auch schlechter sein', () => {}]
            ];
            break;
        }
        case 'joker:skip': { // flush the card on the table, a replacement is revealed
            const c = sample('schlecht', 2), r = sample('mittel', 2);
            stage = `<div class="pk-slot" id="pk-cwrap">${card(c, 'c')}${card(r, 'r', 'pk-hidden pk-stack')}</div>`;
            beats = [
                [300, 'Diese Karte liegt gerade zur Versteigerung auf dem Tisch', () => bump(q('c'))],
                [1500, `${pA} spielt ${jl('skip')}: weg damit`, () => { q('c').classList.add('pk-flushed'); stamp(q('cwrap'), '🗑️ WEG', true); sfx.whoosh(); }],
                [3000, 'Sofort wird eine Ersatzkarte aufgedeckt', () => { unstamp(q('cwrap')); q('r').classList.remove('pk-hidden'); bump(q('r')); sfx.flip(); }],
                [4300, 'Die gespülte Karte ist für dieses Spiel raus. Gesperrte Spieler können nicht spülen', () => {}]
            ];
            break;
        }
        default: return;
    }

    $('joker-hover-popup')?.classList.add('hidden');
    const s = mountScene('perk-showcase', `
        <div class="pk-box">
            <div class="pk-kicker">${jokerKey ? 'So wirkt der Joker' : "So wirkt's"} im Spiel</div>
            <div class="pk-title">${p.name}</div>
            <div class="pk-stage">${stage}</div>
            <div class="pk-caption" aria-live="polite"></div>
        </div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Schließen</div>`);
    s.el.setAttribute('role', 'dialog');
    s.el.setAttribute('aria-label', `Vorschau: ${s.el.querySelector('.pk-title').textContent.trim()}`);
    const caption = s.el.querySelector('.pk-caption');
    beats.forEach(([ms, text, fn]) => s.at(ms, () => { caption.textContent = text; restartClass(caption, 'is-new'); fn(); }));
}

// =====================================================================
// KATEGORIEN MODAL
// =====================================================================
function openCategoryModal() {
    const c = $('category-checkboxes'); if (!c) return;
    c.innerHTML = '';
    for (let cat in Config.categories) {
        let catData = Config.categories[cat];
        let checked = activeCategories.includes(cat) ? 'checked' : '';
        c.innerHTML += `<label title="${catData.desc}" class="flex items-center gap-3 text-sm text-stone-300 cursor-pointer p-2 hover:bg-stone-700 rounded transition border border-transparent hover:border-stone-600"><input type="checkbox" value="${cat}" class="cat-checkbox w-5 h-5 accent-orange-500" ${checked}> <span class="text-lg">${catData.icon}</span> ${catData.name}</label>`;
    }
    if ($('category-modal')) $('category-modal').classList.remove('hidden');
}

// =====================================================================
// MATRIX & AUKTIONSLOGIK
// =====================================================================
function selectMatrixAuctionCategory(cat, btn) {
    if (activeMatrixAuctionCategory !== cat) {
        initCategoryDeck(cat);
    }
    activeMatrixAuctionCategory = cat;
    
    // Alle Buttons auf "Inaktiv" setzen
    document.querySelectorAll('.matrix-cat-btn').forEach(b => b.className = "matrix-cat-btn w-full h-full bg-transparent hover:bg-stone-800 text-stone-400 text-xs font-bold py-2 border-b-2 border-transparent transition-colors");
    
    if (!btn) document.querySelectorAll('.matrix-cat-btn').forEach(b => { if (b.getAttribute('onclick')?.includes(`'${cat}'`)) btn = b; });
    
    // Den geklickten Button auf "Aktiv" setzen
    if (btn) btn.className = "matrix-cat-btn w-full h-full bg-stone-900 text-orange-400 text-xs font-black py-2 border-b-2 border-orange-500 transition-colors";
    markCategoryColumns();
    
    if (blindDrawsLeft === 0 && $('matrix-active-bid-target')) {
        activeMatrixAuctionItem = null;
        $('matrix-active-bid-target').innerHTML = `<span class="text-stone-600 italic text-xs font-medium">Lieferung noch ausstehend...</span>`;
        if ($('matrix-active-bid-start-price')) $('matrix-active-bid-start-price').innerText = '';
        if ($('matrix-active-bid-desc')) $('matrix-active-bid-desc').innerHTML = '';
        if ($('matrix-auction-price')) $('matrix-auction-price').value = '';
    }
}

function saveCategories() {
    const boxes = document.querySelectorAll('.cat-checkbox');
    let selected = [];
    boxes.forEach(b => { if (b.checked) selected.push(b.value); });
    if (selected.length === 0) return showModal("Fehler", "Mindestens eine Kategorie muss aktiv sein!");
    activeCategories = selected;
    if (!activeCategories.includes(activeMatrixAuctionCategory)) activeMatrixAuctionCategory = activeCategories[0];
    if (!activeCategories.includes(adminCategory)) adminCategory = activeCategories[0];
    if ($('category-modal')) $('category-modal').classList.add('hidden');
    renderCategoryButtons(); renderMatrix();
    addLog("Aktive Kategorien aktualisiert.", "info");
}

function addBid(amount) {
    let input = $('matrix-auction-price');
    if (input) input.value = Math.max(0, (parseInt(input.value) || 0) + amount);
}

function drawMatrixRandomPlayer() {
    // New card = new round: the once-per-round joker limits reset
    const wasLocked = jokerPhaseState.blockUsed || jokerPhaseState.autoBuyUsed;
    jokerPhaseState = { blockUsed: false, autoBuyUsed: false };
    if (wasLocked) { renderMatrix(); renderJokerPhaseModal(); }

    if (activeMatrixAuctionItem !== null) {
        activeCategoryDeck.push(activeMatrixAuctionItem);
        addLog(`Übersprungen: ${activeMatrixAuctionItem.name} wandert ans Ende des Decks.`, "info");

        let needsRender = false;
        if (blockedPlayerId !== null) { addLog("Runde übersprungen: Blockierung aufgehoben.", "info"); blockedPlayerId = null; needsRender = true; }
        let lostCashback = false;
        managers.forEach(m => { if (m.cashbackActive) { m.cashbackActive = false; lostCashback = true; } });
        if (lostCashback) { addLog("Runde übersprungen: Bonus-Joker verfallen.", "alert"); needsRender = true; }
        if (needsRender) renderMatrix();
    }
    let cat = activeMatrixAuctionCategory.toLowerCase();
    if (managers.every(m => m.team[cat] === null) && pendingSpecialEvent && specialEventsRemaining.length > 0) {
        pendingSpecialEvent = false;
        let ev = specialEventsRemaining.splice(Math.floor(Math.random() * specialEventsRemaining.length), 1)[0];
        if (ev === 'dutch') return startDutchAuction();
        else if (ev === 'blind') return triggerBlindAuctionEvent();
    }
    if (Math.random() < getBaseEventChance()) return triggerEvent();
    
    // Drop cards that were sold or shredded meanwhile by any route (auction, joker, blind, sale)
    const stillAvailable = itemDatabase[activeMatrixAuctionCategory] || [];
    activeCategoryDeck = activeCategoryDeck.filter(c => stillAvailable.some(x => x.id === c.id));
    if (activeCategoryDeck.length === 0) return showModal("Katalog leer!", "Das Deck dieser Kategorie ist leer. Alle Karten wurden vergeben.");

    const item = activeCategoryDeck.shift();
    activeMatrixAuctionItem = { ...item, type: activeMatrixAuctionCategory };
 if (blindDrawsLeft > 0) {
        $('matrix-active-bid-target').innerHTML = `<span class="text-xl">❓</span> VERDECKT`;
        $('matrix-active-bid-start-price').innerText = `Kosten: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
        $('matrix-active-bid-desc').innerHTML = `<div class="text-[16px] text-red-400 font-bold">Unleserlich. Blindflug!</div>`;
    } else {
        $('matrix-active-bid-target').innerHTML = `${item.name}`;
        $('matrix-active-bid-start-price').innerText = `Kosten: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
        $('matrix-active-bid-desc').innerHTML = getDynamicDescHtml(item);
    }
    if ($('matrix-auction-price')) $('matrix-auction-price').value = item.cost;
    playDrawAnimation(item);
}

function updateBuyerDropdown() {
    const s1 = $('auction-buyer'), s2 = $('matrix-auction-buyer');
    let html = `<option value="">-- ${Config.terminology.playerSingular} wählen --</option>`;
    managers.forEach(m => html += `<option value="${m.id}">${m.name} (${m.budget.toLocaleString()} ${Config.currency.symbol})</option>`);
    if (s1) s1.innerHTML = html; if (s2) s2.innerHTML = html;
}

function resetMatrixActiveBid() {
    // A card on the table that was NOT sold (joker, sale, blind deal, penalty...) goes back
    // into the hand. Sold/shredded cards are no longer in the catalog, so they stay out.
    const onTable = activeMatrixAuctionItem;
    if (onTable && (itemDatabase[activeMatrixAuctionCategory] || []).some(x => x.id === onTable.id)
        && !activeCategoryDeck.some(c => c.id === onTable.id)) activeCategoryDeck.push(onTable);
    activeMatrixAuctionItem = null;
    if ($('matrix-active-bid-target')) $('matrix-active-bid-target').innerHTML = `<span class="text-stone-600 italic text-xs font-medium">Leer...</span>`;
    if ($('matrix-active-bid-start-price')) $('matrix-active-bid-start-price').innerText = '';
    if ($('matrix-active-bid-desc')) $('matrix-active-bid-desc').innerHTML = '';
    if ($('matrix-auction-price')) $('matrix-auction-price').value = '';
    if ($('matrix-auction-buyer')) $('matrix-auction-buyer').value = '';
    updateBuyerDropdown(); renderMatrix();
    if (currentView === 'used') renderUsedPool();
    if (currentView === 'admin') renderAdminPool();
}

function executeMatrixAuction() {
    if (!activeMatrixAuctionItem) return showModal("Nichts da!", "Erst Ware ziehen.");
    const buyerId = parseInt($('matrix-auction-buyer').value), price = parseInt($('matrix-auction-price').value);
    if (!buyerId) return showModal("Auswahl fehlt!", "Empfänger auswählen."); if (isNaN(price) || price < 0) return showModal("Preis!", "Gültigen Betrag eingeben.");
    const m = managers.find(x => x.id === buyerId); if (!m) return;
    const cat = activeMatrixAuctionItem.type.toLowerCase();
    if (price < activeMatrixAuctionItem.cost) return showModal("Zu niedrig!", `Mindest-Preis: ${activeMatrixAuctionItem.cost.toLocaleString()} ${Config.currency.symbol}.`);
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Darf nichts annehmen!");
    if (m.budget < price) return showModal("Kein Budget!", "Budget reicht nicht.");
    if (m.team[cat]) return showModal("Voll!", "Kategorie bereits voll.");
    
    let cbText = processPurchase(m, price, activeMatrixAuctionItem, activeMatrixAuctionItem.type);
    let sapMsg = ""; if (blindDrawsLeft > 0) { blindDrawsLeft--; sapMsg = "<br><br>Die verdeckte Ware wurde enthüllt!"; }
    // No deal popup: the hammer scene already shows card, price and buyer. Follow-ups start when it ends.
    playAuctionAnimation(price, activeMatrixAuctionItem, m, { note: sapMsg + cbText });
    resetMatrixActiveBid();
}

// =====================================================================
// ADMIN AUKTION
// =====================================================================
function selectAuctionItem(id) {
    if (isShredderMode) return;
    const item = itemDatabase[adminCategory]?.find(x => x.id === id);
    if (item) {
        selectedAuctionItem = { ...item, type: adminCategory };
        boolForceShowCatalog = false;
        if ($('active-bid-target')) $('active-bid-target').innerHTML = `<span class="text-lg">${item.icon}</span> ${item.name}`;
        if ($('active-bid-start-price')) $('active-bid-start-price').innerText = `Mindestpreis: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
        if ($('active-bid-desc')) $('active-bid-desc').innerHTML = getDynamicDescHtml(item, true);
        if ($('auction-price')) $('auction-price').value = item.cost;
        renderAdminPool();
    }
}

function executeAuction() {
    if (!selectedAuctionItem) return showModal("Nichts da!", "Wähle zuerst ein Item.");
    const buyerId = parseInt($('auction-buyer')?.value), price = parseInt($('auction-price')?.value);
    if (!buyerId) return showModal("Auswahl fehlt!", "Käufer wählen.");
    if (isNaN(price) || price < 0) return showModal("Preis!", "Gültigen Betrag eingeben.");
    if (price < selectedAuctionItem.cost) return showModal("Zu niedrig!", `Mindestpreis: ${selectedAuctionItem.cost.toLocaleString()} ${Config.currency.symbol}.`);
    const m = managers.find(x => x.id === buyerId); if (!m) return;
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Darf nichts annehmen!");
    if (m.budget < price) return showModal("Kein Budget!", "Budget reicht nicht.");
    const cat = selectedAuctionItem.type.toLowerCase();
    if (m.team[cat]) return showModal("Voll!", "Kategorie-Slot ist bereits besetzt.");
    let cbText = processPurchase(m, price, selectedAuctionItem, selectedAuctionItem.type);
    playAuctionAnimation(price, selectedAuctionItem, m, { note: cbText });
    selectedAuctionItem = null; manualCatalogHide = true; boolForceShowCatalog = false;
    if ($('active-bid-target')) $('active-bid-target').innerText = "Nichts ausgewählt";
    if ($('active-bid-start-price')) $('active-bid-start-price').innerText = "Mindestpreis: -";
    if ($('active-bid-desc')) $('active-bid-desc').innerHTML = "";
    if ($('auction-price')) $('auction-price').value = '';
    if ($('auction-buyer')) $('auction-buyer').value = '';
    updateBuyerDropdown(); renderAdminPool(); switchView('matrix');
}

// =====================================================================
// PURCHASE PROCESSING
// =====================================================================
function processPurchase(manager, price, item, cat) {
    const buyerHadCashback = manager.cashbackActive;
    managers.forEach(mgr => mgr.cashbackActive = false);
    let catKey = item.dbCategory || cat.toUpperCase();
    if (itemDatabase[catKey]) {
        let dbIdx = itemDatabase[catKey].findIndex(x => x.id === item.id);
        if (dbIdx !== -1) { let purchasedItem = itemDatabase[catKey].splice(dbIdx, 1)[0]; purchasedItem.owner = manager.name; usedDatabase.push(purchasedItem); }
    }
    manager.team[cat.toLowerCase()] = { ...item, type: cat, paid: price }; // paid = Zuschlagspreis fuer die Kategorien-Spur
    manager.budget -= price; draftedIds.push(item.id); animateBudgetChange(manager.id, price, false);
    let cashbackVal = 0, cbText = "";
    if (buyerHadCashback) {
        cashbackVal = Math.floor(price * getConf('mechanics','bonusCashbackFraction'));
        if (manager.perk === 'perk4') cashbackVal = Math.floor(cashbackVal * getConf('perks','perk4_incomeMultiplier'));
        manager.budget += cashbackVal; animateBudgetChange(manager.id, cashbackVal, true);
        cbText = `<br><br><span class="text-lime-400">💰 <strong>Bonus:</strong> +${cashbackVal.toLocaleString()} ${Config.currency.symbol} zurückerhalten!</span>`;
    }
    lastPurchase = { managerId: manager.id, cost: price, item: item, category: cat, cashbackGiven: cashbackVal, isUndoable: true };
    if ($('btn-undo-purchase')) $('btn-undo-purchase').classList.remove('hidden');
    // Joker order rotates after every sale: the last in line moves to the front
    if (playerJokerOrder.length > 1) playerJokerOrder.unshift(playerJokerOrder.pop());
    updateEventChanceDisplays(); saveDatabases(); checkCategoryCompletion(cat.toLowerCase()); resetGlobalBlock(); checkEndgame();
    queueLastCardCheck(cat);
    addLog(`Deal: '${item.name}' für ${price.toLocaleString()} ${Config.currency.symbol} an ${manager.name}.`, "buy");
    return cbText;
}

function undoLastPurchase() {
    if (!lastPurchase.managerId || !lastPurchase.isUndoable) return showModal("Fehler", "Kein Deal zum Stornieren gefunden.");
    let m = managers.find(x => x.id === lastPurchase.managerId); if (!m) return;
    showConfirmModal("Möchtest du den letzten Deal wirklich stornieren?", () => {
        m.budget += lastPurchase.cost; animateBudgetChange(m.id, lastPurchase.cost, true);
        if (lastPurchase.cashbackGiven > 0) { m.budget -= lastPurchase.cashbackGiven; animateBudgetChange(m.id, lastPurchase.cashbackGiven, false); m.cashbackActive = true; }
        let cat = lastPurchase.category.toLowerCase(); m.team[cat] = null;
        let uIdx = usedDatabase.findIndex(x => x.id === lastPurchase.item.id);
        if (uIdx !== -1) {
            let returnedItem = usedDatabase.splice(uIdx, 1)[0]; delete returnedItem.owner;
            let dbCat = returnedItem.dbCategory || lastPurchase.category.toUpperCase();
            if (!itemDatabase[dbCat]) itemDatabase[dbCat] = [];
            itemDatabase[dbCat].push(returnedItem);
        }
        // back into the playable hand, otherwise the category could run out of cards
        if (lastPurchase.category.toUpperCase() === activeMatrixAuctionCategory.toUpperCase()) activeCategoryDeck.push(lastPurchase.item);
        draftedIds = draftedIds.filter(id => id !== lastPurchase.item.id); saveDatabases();
        lastPurchase.isUndoable = false; if ($('btn-undo-purchase')) $('btn-undo-purchase').classList.add('hidden'); isGameEnded = false;
        renderMatrix(); updateBuyerDropdown(); addLog(`Storno: Deal von ${m.name} storniert.`, "alert"); showModal("Rückgängig", "Erfolgreich storniert!");
    });
}

function punishLoser() {
    const buyerId = parseInt($('matrix-auction-buyer')?.value);
    if (!buyerId) return showModal("Auswahl fehlt!", `Wähle einen ${Config.terminology.playerSingular} aus.`);
    const m = managers.find(x => x.id === buyerId); if (!m) return;
    const cat = activeMatrixAuctionCategory.toLowerCase();
    if (m.team[cat]) return showModal("Voll!", "Dieser Slot ist bereits belegt.");
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Kann die Strafe nicht empfangen!");
    showModal("💨 STRAFE!", `<strong>${m.name}</strong> bekommt die Loser-Karte für <strong>${Config.categories[activeMatrixAuctionCategory.toUpperCase()]?.name || activeMatrixAuctionCategory}</strong> aufgezwungen! (${Config.punishCardTemplate.score} Punkte)`);
    givePenaltyCard(m, activeMatrixAuctionCategory);
}

// Puts the theme's penalty card into a player's slot and runs the usual follow-ups.
function givePenaltyCard(m, catKey, dropAnimation = false) {
    const key = String(catKey).toUpperCase(), cat = key.toLowerCase();
    const tpl = Config.punishCardTemplate;
    m.team[cat] = { id: 'loser_' + Date.now(), name: tpl.name, desc: tpl.desc, cost: tpl.cost, score: tpl.score, tier: tpl.tier, icon: tpl.icon, type: key, dbCategory: tpl.dbCategory };
    addLog(`Strafe: ${m.name} bekommt "${tpl.name}".`, "alert");
    resetMatrixActiveBid(); // also returns the unsold card on the table to the hand
    if (dropAnimation) {
        const row = managers.indexOf(m) + 1, col = activeCategories.indexOf(key) + 2;
        document.querySelector(`#matrix-body tr:nth-child(${row}) td:nth-child(${col}) > div`)?.classList.add('penalty-drop');
    }
    checkCategoryCompletion(cat); // a penalty card can be the one that fills the category
    checkEndgame();
    queueLastCardCheck(key);
}

// =====================================================================
// LETZTE KARTE: one open slot left, the next hand card goes to that player.
// With a flush joker (and not blocked) the player may flush it first, as often as jokers last.
// Can't afford it -> "Spotlight of Shame", then the penalty card.
// =====================================================================
let pendingLastCardCat = null;

function queueLastCardCheck(catKey) {
    const key = String(catKey).toUpperCase();
    if (key !== String(activeMatrixAuctionCategory).toUpperCase() || managers.length < 2) return;
    if (managers.filter(m => !m.team[key.toLowerCase()]).length === 1) pendingLastCardCat = key;
}

function resolveLastCard() {
    const key = pendingLastCardCat; pendingLastCardCat = null;
    if (!key || key !== String(activeMatrixAuctionCategory).toUpperCase()) return;
    const open = managers.filter(m => !m.team[key.toLowerCase()]);
    if (open.length !== 1) return;
    const m = open[0];

    const available = itemDatabase[key] || [];
    activeCategoryDeck = activeCategoryDeck.filter(c => available.some(x => x.id === c.id));
    const item = activeCategoryDeck[0];

    if (!item) { // nothing left to give - not the player's fault, so no drama
        showModal("💨 KEINE KARTE MEHR", `Für <strong>${m.name}</strong> ist keine Karte mehr übrig – es gibt die Strafkarte.`);
        return givePenaltyCard(m, key);
    }
    const canPay = m.budget >= item.cost;
    const canFlush = m.jokers.skip > 0 && m.id !== blockedPlayerId; // blocked players can't play jokers
    if (!canFlush && !canPay) return lastCardBroke(m, item, key);

    playLastCardScene(m, item, { canFlush, canPay }, choice => {
        if (choice === 'flush') return flushLastCard(m, item, key);
        if (!canPay) return lastCardBroke(m, item, key);
        activeCategoryDeck.shift();
        const cbText = processPurchase(m, item.cost, item, key);
        resetMatrixActiveBid();
        flyCardToSlot(item, m, item.cost);
        if (cbText) showModal("💰 BONUS", cbText.replace(/^(<br>)+/, '')); // waits until the card has landed
    });
}

function lastCardBroke(m, item, key) {
    addLog(`Pleite: ${m.name} kann ${item.name} (${item.cost.toLocaleString()}) nicht bezahlen.`, "alert");
    playSpotlightOfShame(m, item, () => {
        givePenaltyCard(m, key, true);
        setTimeout(runNextQueuedStep, 900); // no popup on this path, so continue once the card has dropped in
    });
}

// Flushes the last card and deals a random replacement from the category catalogue (the hand only
// holds one card per player, so it is empty by now); once the flush scene ends it gets the same decision.
function flushLastCard(m, item, key) {
    m.jokers.skip--;
    activeCategoryDeck = activeCategoryDeck.filter(c => c.id !== item.id);
    const cat = item.dbCategory || key, idx = itemDatabase[cat]?.findIndex(x => x.id === item.id);
    if (idx !== undefined && idx !== -1) { shreddedDatabase.push(itemDatabase[cat].splice(idx, 1)[0]); saveDatabases(); }
    const pool = (itemDatabase[key] || []).filter(x => !activeCategoryDeck.some(c => c.id === x.id));
    if (pool.length) activeCategoryDeck.unshift(pool[Math.floor(Math.random() * pool.length)]);
    addLog(`Gespült: ${m.name} spült die letzte Karte "${item.name}".`, "alert");
    renderMatrix();
    pendingLastCardCat = key;
    playFlushScene(item);
}

// Pips for every player (the one open slot pulses), then the card is dealt face-up.
// With a flush joker: "flush" / "take" buttons. Without: one "Karte zuteilen" button.
// Either way the scene stays until the host chooses, so the card text can be read.
function playLastCardScene(m, item, { canFlush, canPay }, onChoice) {
    const sym = Config.currency.symbol, cat = Config.categories[activeMatrixAuctionCategory];
    const skipLabel = Config.terminology?.jokers?.skip?.label || 'Wegspülen';
    const blockedNote = m.id === blockedPlayerId && m.jokers.skip > 0 ? ' · <i class="fa-solid fa-lock"></i> gesperrt, kein Joker' : '';
    const pips = managers.map((x, i) => `<i class="${x === m ? 'is-open' : ''}" style="--i:${i}"></i>`).join('');
    const takeLabel = !canFlush ? `Karte zuteilen · ${item.cost.toLocaleString()} ${sym}`
        : canPay ? `Annehmen · ${item.cost.toLocaleString()} ${sym}` : 'Annehmen · Budget reicht nicht';
    const actions = (canFlush ? `<button class="last-btn is-flush" data-choice="flush">${jokerIcon('skip')} ${skipLabel} <small>noch ${m.jokers.skip}</small></button>` : '')
        + `<button class="last-btn is-take" data-choice="take">${takeLabel}</button>`;

    const el = document.createElement('div');
    el.className = 'fx-scene last-scene';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Letzte Karte');
    el.innerHTML = `
        <div class="last-stage">
            <div class="last-kicker">Letzte Karte</div>
            <div class="last-pips" aria-hidden="true">${pips}</div>
            <div class="last-who">${cat?.icon || ''} ${cat?.name || ''}: nur noch <strong>${m.name}</strong> ist offen${blockedNote}</div>
            <div class="draw-card"><div class="draw-flipper">
                <div class="draw-face draw-back"><span>${cat?.icon || '🂠'}</span></div>
                <div class="draw-face draw-front">
                    <div class="draw-icon">${item.icon || cat?.icon || ''}</div>
                    <div class="draw-name">${item.name}</div>
                    <div class="draw-desc">${item.desc || ''}</div>
                    <div class="draw-price${canPay ? '' : ' is-short'}">${item.cost.toLocaleString()} ${sym}</div>
                </div>
            </div></div>
            <div class="last-actions">${actions}</div>
        </div>`;
    document.body.appendChild(el);

    const buttons = [...el.querySelectorAll('[data-choice]')];
    const timers = [];
    let revealed = false, ready = false, done = false;
    const at = (ms, fn) => timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 400) : ms));
    const finish = choice => {
        if (done) return; done = true;
        timers.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey, true);
        onChoice(choice); // mounts the follow-up scene first, so no popup slips in between
        el.classList.add('is-leaving');
        setTimeout(() => { el.remove(); sceneEnded(); }, 250);
    };
    // Card face-up now; the buttons only appear 1.5 s later (not shortened for reduced motion),
    // so a double Enter can't hand the card over before its text was read.
    const reveal = () => {
        if (revealed) return; revealed = true;
        timers.forEach(clearTimeout);
        el.classList.add('is-dealt', 'is-flipped');
        timers.push(setTimeout(() => { ready = true; el.classList.add('is-ready'); buttons[buttons.length - 1].focus(); }, 1500));
    };
    // Keys never reach the board. Space/Enter/Esc skip the intro; once the buttons are up,
    // Space/Enter press the focused button (Tab / arrows switch between the two).
    const onKey = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const go = e.key === ' ' || e.key === 'Enter' || e.key === 'Escape';
        if (!ready) return go && reveal();
        if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            buttons[(buttons.indexOf(document.activeElement) + 1) % buttons.length].focus();
        } else if ((e.key === ' ' || e.key === 'Enter') && buttons.includes(document.activeElement)) {
            finish(document.activeElement.dataset.choice);
        }
    };
    document.addEventListener('keydown', onKey, true);
    buttons.forEach(b => b.addEventListener('click', () => ready && finish(b.dataset.choice)));
    el.addEventListener('click', e => { if (!e.target.closest('[data-choice]')) reveal(); });

    requestAnimationFrame(() => el.classList.add('show'));
    sfx.whoosh();
    at(900, () => el.classList.add('is-dealt'));
    at(1400, () => { sfx.flip(); reveal(); });
}

function playSpotlightOfShame(m, item, done) {
    let finished = false;
    const finish = () => {
        if (finished) return; finished = true;
        timers.forEach(clearTimeout); cancelAnimationFrame(raf); releaseKeys();
        overlay.classList.remove('show');
        setTimeout(() => { overlay.remove(); done(); }, 350);
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const sym = Config.currency.symbol;
    const line = Config.terminology?.bankruptLine || 'Pleite. Einfach nur pleite.';

    // aim the spotlight at the player's name on the board
    const row = managers.indexOf(m) + 1;
    const nameEl = document.querySelector(`#matrix-body tr:nth-child(${row}) td:first-child input`);
    nameEl?.scrollIntoView({ block: 'center' });
    const r = nameEl?.getBoundingClientRect();
    const target = r ? { x: r.left + Math.min(r.width, 160) / 2, y: r.top + r.height / 2 } : { x: innerWidth * 0.15, y: innerHeight * 0.4 };

    const overlay = document.createElement('div');
    overlay.className = 'shame-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML = `
        <div class="shame-tag" style="left:${target.x}px; top:${target.y + 34}px">🎯 ${m.name}</div>
        <div class="shame-stage">
            <div class="shame-card">${item.icon || ''} ${item.name}</div>
            <div class="shame-price">${item.cost.toLocaleString()} ${sym}</div>
            <div class="shame-budget">Du hast nur ${m.budget.toLocaleString()} ${sym}</div>
            <div class="shame-wallet">👛<span class="shame-moth">🦋</span></div>
            <div class="shame-line">${line}</div>
        </div>
        <div class="shame-skip">Klicken zum Überspringen</div>`;
    overlay.addEventListener('click', finish);
    const releaseKeys = trapKeysDuringScene(finish);
    document.body.appendChild(overlay);

    // spotlight sweep: a few waypoints across the screen, then lock onto the name
    const pts = reduced ? [target] : [
        { x: innerWidth * 0.12, y: innerHeight * 0.18 }, { x: innerWidth * 0.85, y: innerHeight * 0.3 },
        { x: innerWidth * 0.35, y: innerHeight * 0.75 }, { x: innerWidth * 0.7, y: innerHeight * 0.55 }, target ];
    const pace = 1.5; // whole scene runs 50% slower than authored below (keep in sync with the .shame-* CSS)
    const sweepMs = reduced ? 0 : 1400 * pace, t0 = performance.now();
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const place = p => { overlay.style.setProperty('--sx', p.x + 'px'); overlay.style.setProperty('--sy', p.y + 'px'); };
    let raf = 0;
    const step = now => {
        const t = sweepMs ? Math.min(1, (now - t0) / sweepMs) : 1;
        const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
        const local = pts.length > 1 ? ease(t * (pts.length - 1) - seg) : 1;
        const a = pts[Math.max(0, seg)], b = pts[Math.min(pts.length - 1, seg + 1)];
        place({ x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local });
        if (t < 1) raf = requestAnimationFrame(step);
    };
    place(pts[0]); raf = requestAnimationFrame(step);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, reduced ? Math.min(ms, 600) : ms * pace));
    sfx.drumroll(sweepMs || 1);
    at(1400, () => { overlay.classList.add('step-lock'); sfx.hit(); });
    at(1900, () => overlay.classList.add('step-stage'));
    at(2700, () => { overlay.classList.add('step-wallet'); sfx.trombone(); });
    at(3700, () => overlay.classList.add('step-line'));
    at(5400, finish);
}

// ---------------------------------------------------------------------
// Sound effects, synthesised with Web Audio (no audio files). Mute via the dock button.
// ---------------------------------------------------------------------
let _audioCtx = null;
function isSoundMuted() { try { return localStorage.getItem('gamesa_sound_muted') === '1'; } catch (e) { return false; } }
function syncSoundButton() {
    const btn = $('btn-sound-toggle'); if (!btn) return;
    const muted = isSoundMuted();
    btn.innerHTML = `<i class="fa-solid ${muted ? 'fa-volume-xmark' : 'fa-volume-high'} text-xs" aria-hidden="true"></i>`;
    btn.title = muted ? 'Ton an' : 'Ton aus';
    btn.setAttribute('aria-label', btn.title);
}
function toggleSound() {
    try { localStorage.setItem('gamesa_sound_muted', isSoundMuted() ? '0' : '1'); } catch (e) {}
    syncSoundButton();
}
document.addEventListener('DOMContentLoaded', syncSoundButton);
// One enveloped oscillator: quick attack, exponential decay; freqEnd glides the pitch. `at` = delay in seconds.
function tone(ctx, { type = 'sine', freq, freqEnd, at = 0, dur = 0.3, vol = 0.3, attack = 0.005 }) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
// A decaying noise burst through one filter: cracks, thumps, hiss
function burst(ctx, { at = 0, dur = 0.1, type = 'bandpass', freq = 1000, q = 1, vol = 0.5, decay = 3 }) {
    const t = ctx.currentTime + at, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; fl.type = type; fl.frequency.value = freq; fl.Q.value = q; g.gain.value = vol;
    src.connect(fl).connect(g).connect(ctx.destination); src.start(t);
}
function audioCtx() {
    if (isSoundMuted()) return null;
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    } catch (e) { return null; }
}
const sfx = {
    drumroll(ms) {
        const ctx = audioCtx(); if (!ctx) return;
        const noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const hits = Math.max(1, Math.floor(ms / 32));
        for (let i = 0; i < hits; i++) {
            const t = ctx.currentTime + i * 0.032, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
            src.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
            const vol = 0.12 + 0.45 * (i / hits); // crescendo
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
            src.connect(bp).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.05);
        }
    },
    hit() {
        const ctx = audioCtx(); if (!ctx) return;
        const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
        g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.42);
    },
    trombone() { // "wah wah wah waaah"
        const ctx = audioCtx(); if (!ctx) return;
        const notes = [[293.66, 0.34], [277.18, 0.34], [261.63, 0.34], [246.94, 1.3]];
        let t = ctx.currentTime;
        notes.forEach(([freq, dur], i) => {
            const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
            lp.type = 'lowpass'; lp.Q.value = 6;
            lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.09); lp.frequency.linearRampToValueAtTime(600, t + dur);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
            g.gain.setValueAtTime(0.28, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            if (i === notes.length - 1) { // droopy vibrato on the last note
                const lfo = ctx.createOscillator(), depth = ctx.createGain();
                lfo.frequency.value = 5.5; depth.gain.value = 7;
                lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
                o.frequency.linearRampToValueAtTime(freq * 0.94, t + dur);
            }
            o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
            t += dur;
        });
    },
    gavel(power = 1) { // wooden crack + thump of the sound block; the final strike gets a short room echo
        const ctx = audioCtx(); if (!ctx) return;
        const t = ctx.currentTime;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
        const crack = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), cg = ctx.createGain();
        crack.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 1.3; cg.gain.value = 0.95 * power;
        crack.connect(bp).connect(cg).connect(ctx.destination); crack.start(t);
        const body = ctx.createOscillator(), bg = ctx.createGain();
        body.type = 'triangle'; body.frequency.setValueAtTime(260, t); body.frequency.exponentialRampToValueAtTime(85, t + 0.13);
        bg.gain.setValueAtTime(0.75 * power, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        body.connect(bg).connect(ctx.destination); body.start(t); body.stop(t + 0.22);
        if (power >= 1) {
            const delay = ctx.createDelay(), fb = ctx.createGain(), out = ctx.createGain();
            delay.delayTime.value = 0.12; fb.gain.value = 0.3; out.gain.setValueAtTime(0.5, t); out.gain.linearRampToValueAtTime(0, t + 0.9);
            cg.connect(delay); bg.connect(delay); delay.connect(fb).connect(delay); delay.connect(out).connect(ctx.destination);
        }
    },
    tick() { // pointer flapper hitting a peg
        const ctx = audioCtx(); if (!ctx) return;
        const t = ctx.currentTime, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.014), ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 1800; g.gain.value = 0.45;
        src.connect(hp).connect(g).connect(ctx.destination); src.start(t);
    },
    coins() { // a handful of coin pings
        const ctx = audioCtx(); if (!ctx) return;
        for (let k = 0; k < 6; k++) {
            const t = ctx.currentTime + k * 0.06 + Math.random() * 0.02, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = 1900 + Math.random() * 900;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.28);
        }
    },
    wahwah() { // short "wah-wah" for a loss
        const ctx = audioCtx(); if (!ctx) return;
        [[220, 0, 0.32], [196, 0.34, 0.55]].forEach(([freq, start, dur]) => {
            const t = ctx.currentTime + start, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o.frequency.linearRampToValueAtTime(freq * 0.93, t + dur);
            lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.08); lp.frequency.linearRampToValueAtTime(500, t + dur);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
        });
    },
    fanfare() { // jackpot: rising arpeggio into a held chord
        const ctx = audioCtx(); if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, k) => {
            const t = ctx.currentTime + k * 0.11, held = k === notes.length - 1, dur = held ? 0.9 : 0.14;
            [freq, held ? freq * 1.26 : null, held ? freq * 1.5 : null].filter(Boolean).forEach(f => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'square'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.setValueAtTime(0.09, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
            });
        });
    },
    siren(ms = 1600) { // escalation alarm
        const ctx = audioCtx(); if (!ctx) return;
        const t = ctx.currentTime, dur = ms / 1000, o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 780; lfo.frequency.value = 2.4; depth.gain.value = 260;
        lfo.connect(depth).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08); g.gain.setValueAtTime(0.12, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
    },
    chaching() { // bright two-note register ping for the sale
        const ctx = audioCtx(); if (!ctx) return;
        [[1318.5, 0.08], [1975.5, 0.2]].forEach(([freq, start]) => {
            const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.5);
        });
    },
    noise(dur, type, f0, f1, vol) { // filtered noise sweep: whooshes, paper, water
        const ctx = audioCtx(); if (!ctx) return;
        const t = ctx.currentTime, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; f.type = type; f.Q.value = 1.2;
        f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(ctx.destination); src.start(t);
    },
    whoosh() { sfx.noise(0.35, 'bandpass', 500, 2600, 0.35); },
    flip() { sfx.noise(0.09, 'highpass', 2500, 6000, 0.35); },
    chains() { sfx.noise(0.3, 'bandpass', 4200, 1800, 0.3); setTimeout(() => sfx.noise(0.2, 'bandpass', 3600, 2000, 0.22), 120); },
    heartbeat() { // lub-dub
        const ctx = audioCtx(); if (!ctx) return;
        [[0, 1], [0.16, 0.7]].forEach(([start, vol]) => {
            const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.16);
        });
    },
    chime() { // announcement gong "ding-dang-dong"
        const ctx = audioCtx(); if (!ctx) return;
        [[659.25, 0], [523.25, 0.35], [392, 0.7]].forEach(([freq, start]) => {
            const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
            o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.15);
        });
    },

    // --- Theme sounds for gained points: the config names one via "pointsSound" (falls back to the gong) ---
    points() { (sfx[Config.pointsSound] || sfx.chime)(); },
    cabinChime() { // airline: "ding-dong" of the seatbelt sign, bell partials
        const ctx = audioCtx(); if (!ctx) return;
        [[1174.7, 0], [880, 0.45]].forEach(([freq, at]) => {
            tone(ctx, { freq, at, dur: 1.2, vol: 0.28 });
            tone(ctx, { freq: freq * 2.76, at, dur: 0.5, vol: 0.05 });
        });
    },
    stamp() { // office stamp on paper: "klack-KLACK"
        const ctx = audioCtx(); if (!ctx) return;
        [[0, 0.5], [0.22, 1]].forEach(([at, p]) => {
            burst(ctx, { at, dur: 0.08, type: 'lowpass', freq: 900, vol: 0.8 * p });
            tone(ctx, { type: 'sine', freq: 130, freqEnd: 55, at, dur: 0.16, vol: 0.8 * p });
        });
    },
    brassFanfare() { // regime: "tä-tä-tätää" on detuned saw brass
        const ctx = audioCtx(); if (!ctx) return;
        [[392, 0, 0.12], [392, 0.16, 0.12], [523.25, 0.32, 0.12], [659.25, 0.48, 0.75]].forEach(([freq, at, dur]) => {
            const t = ctx.currentTime + at, lp = ctx.createBiquadFilter(), g = ctx.createGain();
            lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.05);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            [0, 7].forEach(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents; o.connect(lp); o.start(t); o.stop(t + dur + 0.02); });
            lp.connect(g).connect(ctx.destination);
        });
    },
    hammer() { // building site: three hits on a nail, the last one hardest
        const ctx = audioCtx(); if (!ctx) return;
        [[0, 0.6], [0.28, 0.75], [0.56, 1]].forEach(([at, p]) => {
            burst(ctx, { at, dur: 0.05, type: 'highpass', freq: 2500, vol: 0.6 * p, decay: 4 });
            tone(ctx, { type: 'triangle', freq: 1850, freqEnd: 1500, at, dur: 0.1 + 0.25 * p, vol: 0.18 * p }); // nail ring
            tone(ctx, { type: 'sine', freq: 190, freqEnd: 70, at, dur: 0.12, vol: 0.55 * p });                   // wood thud
        });
    },
    impactWrench() { // assembly line: pneumatic "brrrt" and the air hiss after it
        const ctx = audioCtx(); if (!ctx) return;
        for (let k = 0; k < 14; k++) burst(ctx, { at: k * 0.025, dur: 0.02, freq: 1500, q: 2, vol: 0.4, decay: 2 });
        tone(ctx, { type: 'square', freq: 95, at: 0, dur: 0.36, vol: 0.06, attack: 0.02 });
        burst(ctx, { at: 0.38, dur: 0.32, type: 'highpass', freq: 3200, vol: 0.28, decay: 1 });
    },
    coin8bit() { // childhood: 8-bit coin "pling-plinnng"
        const ctx = audioCtx(); if (!ctx) return;
        tone(ctx, { type: 'square', freq: 987.8, dur: 0.08, vol: 0.12 });
        tone(ctx, { type: 'square', freq: 1318.5, at: 0.08, dur: 0.4, vol: 0.12 });
    },
    levelUp() { // noob lobby: hitmarker tick, then a chiptune arpeggio
        const ctx = audioCtx(); if (!ctx) return;
        burst(ctx, { dur: 0.03, type: 'highpass', freq: 4000, vol: 0.5 });
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, k) => tone(ctx, { type: 'square', freq, at: 0.08 + k * 0.07, dur: k === 3 ? 0.3 : 0.07, vol: 0.1 }));
    },
    mail() { // office: new-message "plink-plink"
        const ctx = audioCtx(); if (!ctx) return;
        tone(ctx, { freq: 1568, dur: 0.25, vol: 0.25 });
        tone(ctx, { freq: 2093, at: 0.09, dur: 0.35, vol: 0.22 });
        tone(ctx, { type: 'triangle', freq: 4186, at: 0.09, dur: 0.12, vol: 0.04 });
    },
    shots() { // warzone: three-round burst, then two casings on the ground
        const ctx = audioCtx(); if (!ctx) return;
        [0, 0.12, 0.24].forEach(at => {
            burst(ctx, { at, dur: 0.14, type: 'lowpass', freq: 1800, vol: 1, decay: 5 });
            tone(ctx, { type: 'sine', freq: 120, freqEnd: 40, at, dur: 0.12, vol: 0.7 });
        });
        [0.45, 0.53].forEach(at => tone(ctx, { type: 'triangle', freq: 5200 + Math.random() * 600, at, dur: 0.05, vol: 0.08 }));
    },
    glasses() { // wedding: two glasses clinking
        const ctx = audioCtx(); if (!ctx) return;
        [0, 0.18].forEach(at => [[2637, 0.14], [3951, 0.07], [5274, 0.04]].forEach(([freq, vol]) => tone(ctx, { freq: freq * (1 + at * 0.05), at, dur: 0.7, vol })));
    },
    keysAndGate() { // prison: rattling keys, then the cell door clangs shut with an echo
        const ctx = audioCtx(); if (!ctx) return;
        for (let k = 0; k < 6; k++) tone(ctx, { type: 'triangle', freq: 3000 + Math.random() * 2000, at: k * 0.05 + Math.random() * 0.02, dur: 0.06, vol: 0.08 });
        [[0.4, 1], [0.7, 0.35]].forEach(([at, p]) => {
            burst(ctx, { at, dur: 0.15, type: 'lowpass', freq: 600, vol: 0.7 * p });
            tone(ctx, { type: 'triangle', freq: 420, freqEnd: 400, at, dur: 0.9, vol: 0.22 * p });
            tone(ctx, { type: 'square', freq: 110, freqEnd: 98, at, dur: 0.6, vol: 0.08 * p });
        });
    }
};

// The funny card text, for result popups
function cardQuoteHtml(item) { return item?.desc ? `<div class="deal-quote">„${item.desc}“</div>` : ''; }

// While a full-screen scene plays, swallow keys so Enter can't close the popup underneath.
// Space / Enter / Esc skip the scene. Returns the cleanup function.
function trapKeysDuringScene(onSkip) {
    const handler = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
}

const GAVEL_SVG = `<svg viewBox="0 0 120 120" width="100%" height="100%">
    <defs><linearGradient id="gavelWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c08a52"/><stop offset="1" stop-color="#6b4222"/></linearGradient></defs>
    <g transform="rotate(-45 60 60)">
        <rect x="54" y="50" width="12" height="64" rx="5" fill="url(#gavelWood)"/>
        <rect x="24" y="20" width="72" height="36" rx="10" fill="url(#gavelWood)"/>
        <rect x="37" y="20" width="7" height="36" style="fill: var(--clr-accent)"/>
        <rect x="76" y="20" width="7" height="36" style="fill: var(--clr-accent)"/>
    </g></svg>`;

// =====================================================================
// AUKTIONS-SZENE: "Zum Ersten ... Zum Zweiten ... Zum Dritten - VERKAUFT!"
// Plays above the deal popup; skipping just reveals the popup underneath.
// Length follows Einstellungen > UI > Hammer-Animation.
// =====================================================================
function playAuctionAnimation(price, item, buyer, opts = {}) {
    if (!item || !buyer) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const k = Math.max(1500, getConf('ui', 'auctionHammerDuration')) / 5000; // timeline below is authored for 5 s
    const sym = Config.currency.symbol;
    const stamp = Config.auctionAnimation?.dealConfirmTitle || '🔨 VERKAUFT!';
    const sparks = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20 + Math.round(Math.random() * 10)}deg; --d:${90 + Math.round(Math.random() * 70)}px"></i>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'auction-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML = `
        <div class="auction-lot">
            <div class="auction-gavel" aria-hidden="true">${GAVEL_SVG}</div>
            <div class="auction-shock" aria-hidden="true"></div>
            <div class="auction-sparks" aria-hidden="true">${sparks}</div>
            <div class="auction-icon">${item.icon || ''}</div>
            <div class="auction-name">${item.name}</div>
            <div class="auction-desc">${item.desc || ''}</div>
            <div class="auction-call"></div>
            <div class="auction-result">
                <div class="auction-price"><span class="auction-count">0</span> ${sym}</div>
                <div class="auction-buyer">an <strong>${buyer.name}</strong></div>
                ${opts.note ? `<div class="auction-note">${opts.note.replace(/^(<br>)+/, '')}</div>` : ''}
            </div>
            <div class="auction-stamp">${stamp}</div>
        </div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Überspringen</div>`;
    document.body.appendChild(overlay);

    const lot = overlay.querySelector('.auction-lot'), gavel = overlay.querySelector('.auction-gavel');
    const call = overlay.querySelector('.auction-call'), count = overlay.querySelector('.auction-count');
    const timers = [];
    let raf = 0, finished = false;
    const restart = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const strike = (text, power) => {
        restart(gavel, 'is-striking');
        if (!reduced) restart(lot, power >= 1 ? 'is-sold-hit' : 'is-hit');
        if (call) { call.textContent = text; restart(call, 'is-new'); }
        sfx.gavel(power);
    };
    const countUp = ms => {
        const t0 = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - t0) / ms), eased = 1 - Math.pow(1 - t, 3);
            if (count) count.textContent = Math.round(price * eased).toLocaleString();
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    };
    const finish = () => {
        if (finished) return; finished = true;
        timers.forEach(clearTimeout); cancelAnimationFrame(raf); releaseKeys();
        overlay.classList.remove('show');
        flyCardToSlot(item, buyer, price);
        setTimeout(() => { overlay.remove(); sceneEnded(); }, 300);
    };
    const releaseKeys = trapKeysDuringScene(finish);
    overlay.addEventListener('click', finish);

    const at = (ms, fn) => timers.push(setTimeout(fn, ms * k));
    requestAnimationFrame(() => overlay.classList.add('show'));
    at(900,  () => strike('Zum Ersten …', 0.55));
    at(1700, () => strike('Zum Zweiten …', 0.75));
    at(2500, () => {
        strike('Zum Dritten!', 1);
        overlay.classList.add('is-sold');
        sfx.chaching();
        countUp(700 * k);
    });
    at(4600, finish);
}

// =====================================================================
// KARTEN- & JOKER-FX. Every scene carries .fx-scene, so popups wait for it (see sceneActive).
// =====================================================================
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const TIER_COLOR = { gut: '#facc15', mittel: '#f97316', schlecht: '#f43f5e' }; // same as the board's tier stripes

// Mounts a skippable scene (click / Space / Enter / Esc). Schedule s.finish yourself as the LAST step.
// onEnd runs before the scene leaves, so a follow-up scene can take over without a popup slipping in.
function mountScene(className, html, onEnd) {
    const el = document.createElement('div');
    el.className = 'fx-scene ' + className;
    el.innerHTML = html;
    document.body.appendChild(el);
    const timers = []; let done = false;
    const finish = () => {
        if (done) return; done = true;
        timers.forEach(clearTimeout); releaseKeys();
        if (onEnd) onEnd();
        el.classList.add('is-leaving');
        setTimeout(() => { el.remove(); sceneEnded(); }, 250);
    };
    const releaseKeys = trapKeysDuringScene(finish);
    el.addEventListener('click', finish);
    requestAnimationFrame(() => el.classList.add('show'));
    return { el, finish, at: (ms, fn) => timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 400) : ms)) };
}

// Draw: card flies out of the deck button and flips. Deliberately NO tier colour - nobody may see how good it is.
function playDrawAnimation(item, onDone, hidden = blindDrawsLeft > 0) {
    const catIcon = Config.categories[activeMatrixAuctionCategory]?.icon || '🂠';
    const front = hidden
        ? `<div class="draw-icon">❓</div><div class="draw-name">VERDECKT</div><div class="draw-desc">Unleserlich. Blindflug!</div>`
        : `<div class="draw-icon">${item.icon || catIcon}</div><div class="draw-name">${item.name}</div><div class="draw-desc">${item.desc || ''}</div>`;
    const s = mountScene('draw-scene', `
        <div class="draw-card"><div class="draw-flipper">
            <div class="draw-face draw-back"><span>${catIcon}</span></div>
            <div class="draw-face draw-front">${front}<div class="draw-price">${item.cost.toLocaleString()} ${Config.currency.symbol}</div></div>
        </div></div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Schließen</div>`, onDone);
    const card = s.el.querySelector('.draw-card'), from = $('btn-draw')?.getBoundingClientRect?.();
    if (card?.animate && from && !reducedMotion()) {
        const dx = from.left + from.width / 2 - innerWidth / 2, dy = from.top + from.height / 2 - innerHeight / 2;
        card.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(-25deg)`, opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { transform: 'none', opacity: 1 }
        ], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
        sfx.whoosh();
    }
    s.at(600, () => { s.el.classList.add('is-flipped'); sfx.flip(); }); // no auto-close: stays until the host dismisses it
}

// Sale: the card flies from the stage into the buyer's slot, backed by its tier colour; the budget counts down meanwhile.
function flyCardToSlot(item, m, price = 0, { pointsBefore } = {}) {
    if (typeof closeCardExpand === 'function') closeCardExpand();
    if (!item || !m || reducedMotion()) return;
    const el = document.createElement('div');
    el.className = 'fx-scene fly-card' + (isHolo(item) ? ' is-unicorn' : '');
    el.style.setProperty('--tier', TIER_COLOR[item.tier] || TIER_COLOR.mittel);
    el.innerHTML = `<span class="fly-icon">${item.icon || ''}</span><span class="fly-name">${item.name}</span>`;
    document.body.appendChild(el); // mounted now so popups wait; positioned next frame, once the board has re-rendered
    const releaseKeys = trapKeysDuringScene(() => {}); // too short to skip, but keys must not act on the board meanwhile
    const end = () => { releaseKeys(); el.remove(); sceneEnded(); };
    requestAnimationFrame(() => {
        const key = Object.keys(m.team).find(k => m.team[k]?.id === item.id);
        const slot = key && document.querySelector(`#matrix-body tr:nth-child(${managers.indexOf(m) + 1}) td:nth-child(${activeCategories.indexOf(key.toUpperCase()) + 2}) > div`);
        if (!slot || !el.animate) return end();
        const r = slot.getBoundingClientRect();
        const from = pointsBefore ?? managerPoints(m) - cardPoints(m, m.team[key], key);
        const num = $(`points-num-${m.id}`); if (num) num.textContent = from; // gain is added when the card lands
        Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', visibility: 'visible' });
        const s = Math.min(3, 230 / Math.max(1, r.width)), dx = innerWidth / 2 - (r.left + r.width / 2), dy = innerHeight / 2 - (r.top + r.height / 2);
        slot.style.visibility = 'hidden';
        sfx.whoosh(); countBudget(m, price);
        el.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
            { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(${s * 0.75}) rotate(-8deg)`, offset: 0.5 },
            { transform: 'none' }
        ], { duration: 850, easing: 'cubic-bezier(.45,0,.25,1)' }).onfinish = () => {
            slot.style.visibility = '';
            slot.style.setProperty('--tier', el.style.getPropertyValue('--tier'));
            slot.classList.add('slot-land'); sfx.gavel(0.4);
            flyPoints(m, slot, from, end);
        };
    });
}

// "+N ⭐" rises from the landed card, arcs to the player's points chip and the chip counts up
function flyPoints(m, slot, from, done) {
    const num = $(`points-num-${m.id}`), to = managerPoints(m), gain = to - from;
    if (!num || !gain) { if (num) num.textContent = to; return done(); }
    const a = slot.getBoundingClientRect(), b = num.getBoundingClientRect();
    const x0 = a.left + a.width / 2, y0 = a.top + 14, dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    const el = document.createElement('div');
    el.className = 'points-fly';
    el.textContent = `${gain > 0 ? '+' : ''}${gain} ⭐`;
    Object.assign(el.style, { left: x0 + 'px', top: y0 + 'px' });
    document.body.appendChild(el);
    sfx.points();
    el.animate([
        { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.35)', opacity: 1, offset: .25 },
        { transform: `translate(calc(-50% + ${dx * .55}px), calc(-50% + ${dy * .55 - 50}px)) scale(1.1)`, offset: .6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: .9 }
    ], { duration: 950, easing: 'cubic-bezier(.45,0,.25,1)' }).onfinish = () => {
        el.remove();
        const chip = num.parentElement;
        chip.classList.remove('points-bump'); void chip.offsetWidth; chip.classList.add('points-bump');
        const t0 = performance.now();
        const tick = now => {
            const k = Math.min(1, Math.max(0, (now - t0) / 650));
            num.textContent = Math.round(from + gain * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick); sfx.coins();
    };
}

function countBudget(m, price) { // odometer from the old to the new budget
    const el = $(`budget-display-${m.id}`); if (!el || !price) return;
    const to = m.budget, from = to + price, t0 = performance.now(), sym = Config.currency.symbol;
    const tick = now => {
        const t = Math.min(1, (now - t0) / 900);
        const now$ = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        el.textContent = `${now$.toLocaleString()} ${sym}`;
        const short = $(`budget-short-${m.id}`); if (short) short.textContent = shortMoney(now$);
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// Effect laid over one player row (Kontrolle stamp, Entschädigung shield). Returns the scene, or null.
function playRowFx(m, cls, html, ms) {
    const r = document.querySelector(`#matrix-body tr:nth-child(${managers.indexOf(m) + 1})`)?.getBoundingClientRect();
    if (!r || reducedMotion()) return null;
    const s = mountScene('row-fx ' + cls, `<div class="row-fx-box" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px">${html}</div>`);
    s.at(ms, s.finish);
    return s;
}

// Stornierung: the card is pulled into a shredder, strips rain out underneath, STORNIERT is stamped on top
function playFlushScene(item, onDone) {
    const strips = Array.from({ length: 10 }, (_, i) => `<i style="--i:${i}; --r:${Math.round(Math.random() * 40 - 20)}deg; --x:${Math.round(Math.random() * 30 - 15)}px"></i>`).join('');
    const s = mountScene('shred-scene', `
        <div class="shred-machine">
            <div class="shred-feed"><div class="shred-card"><span>${item.icon || '🂠'}</span><b>${item.name}</b></div></div>
            <div class="shred-body"><div class="shred-slot"></div><div class="shred-led"></div><div class="shred-brand">Aktenvernichter</div></div>
            <div class="shred-out">${strips}</div>
            <div class="shred-stamp">🗑️ STORNIERT</div>
        </div>`, onDone);
    for (let t = 350; t < 1650; t += 75) s.at(t, sfx.tick); // motor rattle
    s.at(1750, sfx.hit);
    s.at(2700, s.finish);
}

function playSwapScene(m, oldCard, newCard) { // Umbuchung: old card out, new card in, then into the slot
    const face = (c, cls) => `<div class="swap-card ${cls}" style="--tier:${TIER_COLOR[c.tier] || TIER_COLOR.mittel}"><span>${c.icon || '🂠'}</span>${c.name}</div>`;
    const label = Config.terminology?.jokers?.gamble?.label || 'Umtausch';
    const s = mountScene('swap-scene', `
        <div class="swap-title">${m.name}: ${label}</div>
        <div class="swap-stage">${face(oldCard, 'is-old')}<div class="swap-arrow">🔄</div>${face(newCard, 'is-new')}</div>`,
        () => {
            const cat = Object.keys(m.team).find(k => m.team[k]?.id === newCard.id);
            flyCardToSlot(newCard, m, 0, { pointsBefore: managerPoints(m) - cardPoints(m, newCard, cat) + cardPoints(m, oldCard, cat) });
        });
    sfx.whoosh(); s.at(900, sfx.flip);
    s.at(2400, s.finish);
}

// Blind-Deal as a mystery box: the box shakes harder and bursts open, the card flips out, the real value
// counts up and the discount drops onto it. Then the bids: distance bars, players who can't pay are struck
// through, a tie on the winning place runs a light between those rows until it stops on the winner.
// No auto-close: without a result popup this scene is where the outcome gets read.
function playBlindReveal(drawn, guesses, { winner, broke, tied, price }, onDone) {
    const sym = Config.currency.symbol, cat = Config.categories[activeMatrixAuctionCategory];
    const off = Math.round((1 - getConf('mechanics','blindWinCostFraction')) * 100);
    const maxDiff = Math.max(1, ...guesses.map(g => Math.abs(g.guess - drawn.cost)));
    const rows = guesses.map(g => {
        const diff = Math.abs(g.guess - drawn.cost);
        return `<div class="blind-row${g.mgr === winner ? ' is-winner' : ''}"><span class="blind-who">${g.mgr.name}</span><span class="blind-guess">${g.guess.toLocaleString()} ${sym}</span><span class="blind-track"><i style="--w:${Math.max(3, diff / maxDiff * 100)}%"></i></span><span class="blind-diff">± ${diff.toLocaleString()}</span><span class="blind-note">💸 zu wenig Budget</span></div>`;
    }).join('');
    const s = mountScene('blind-scene', `
        <div class="blind-panel">
            <div class="blind-stage">
                <div class="mbox" aria-hidden="true"><div class="mbox-burst"></div><div class="mbox-lid"></div><div class="mbox-body"><span>?</span></div></div>
                <div class="draw-card"><div class="draw-flipper">
                    <div class="draw-face draw-back"><span>${cat?.icon || '🂠'}</span></div>
                    <div class="draw-face draw-front">
                        <div class="draw-icon">${drawn.icon || cat?.icon || ''}</div>
                        <div class="draw-name">${drawn.name}</div>
                        <div class="draw-desc">${drawn.desc || ''}</div>
                    </div>
                </div></div>
            </div>
            <div class="blind-info">
                <div class="blind-head">🙈 Blindflug</div>
                <div class="blind-value">Wahrer Wert <strong><span class="blind-count">0</span> ${sym}</strong></div>
                <div class="blind-deal"><span class="blind-off">−${off} %</span> Zuschlag für <strong>${price.toLocaleString()} ${sym}</strong></div>
                <div class="blind-rows">${rows}</div>
                <div class="blind-none">Niemand kann zahlen</div>
            </div>
        </div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Überspringen</div>`, onDone);
    const rowEls = [...s.el.querySelectorAll('.blind-row')];
    const rowOf = mgr => rowEls[guesses.findIndex(g => g.mgr === mgr)];
    const stage = cls => s.el.classList.add(cls);

    // the box: shaking, shaking harder, bursting open; the card rises out of it and flips
    stage('is-shaking'); sfx.drumroll(2000);
    s.at(1100, () => stage('is-shaking-hard'));
    s.at(2100, () => { stage('is-open'); sfx.hit(); });
    s.at(2700, () => { stage('is-flipped'); sfx.flip(); });
    s.at(3300, () => { // real value counts up
        stage('is-valued');
        const el = s.el.querySelector('.blind-count'), t0 = performance.now();
        const tick = now => {
            const k = Math.min(1, Math.max(0, (now - t0) / 800));
            if (el) el.textContent = Math.round(drawn.cost * (1 - Math.pow(1 - k, 3))).toLocaleString();
            if (k < 1 && s.el.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    s.at(4300, () => { stage('is-discounted'); sfx.chaching(); });
    rowEls.forEach((row, i) => s.at(4900 + i * 250, () => { row.classList.add('is-in'); sfx.tick(); }));
    const tRows = 4900 + rowEls.length * 250;
    s.at(tRows + 300, () => stage('is-measured'));

    let t = tRows + 1400;
    guesses.forEach(g => {
        if (!broke.has(g.mgr)) return;
        s.at(t, () => { rowOf(g.mgr).classList.add('is-broke'); sfx.tick(); });
        t += 450;
    });
    if (tied.length > 1) { // ~3 laps, slowing down, last hop lands on the winner
        const lot = tied.map(rowOf), hops = lot.length * 3 + tied.indexOf(winner);
        for (let h = 0; h <= hops; h++) {
            const row = lot[h % lot.length];
            s.at(t, () => { lot.forEach(r => r.classList.remove('is-lot')); row.classList.add('is-lot'); sfx.tick(); });
            t += 90 + h * h * 4;
        }
        t += 300;
    }
    s.at(t, () => {
        rowEls.forEach(r => r.classList.remove('is-lot'));
        s.el.classList.add('is-decided');
        winner ? sfx.fanfare() : sfx.wahwah();
        const hint = s.el.querySelector('.auction-skip'); if (hint) hint.textContent = 'Klick, Leertaste oder Enter zum Schließen';
    });
}

function resetGlobalBlock() { if (blockedPlayerId !== null) { blockedPlayerId = null; renderMatrix(); } }

function applyBudgetChange(m, amount, source = "event") {
    let finalAmount = amount;
    if (finalAmount < 0 && source === "event" && m.perk === 'perk6') { addLog(`${m.name} blockt Strafe ab!`, "event"); return 0; }
    if (finalAmount > 0) {
        if (m.perk === 'perk4') finalAmount = Math.floor(finalAmount * getConf('perks','perk4_incomeMultiplier'));
        if (source === "wheel" && m.perk === 'perk6') finalAmount = Math.floor(finalAmount * getConf('perks','perk6_wheelBonusMultiplier'));
    }
    m.budget += finalAmount; animateBudgetChange(m.id, Math.abs(finalAmount), finalAmount >= 0);
    return finalAmount;
}

function animateBudgetChange(id, amt, pos) {
    let cell = $(`budget-display-${id}`);
    if (cell) { let el = document.createElement('div'); el.className = `absolute right-3 top-4 font-black text-lg pointer-events-none z-50 ${pos ? 'animate-float-out-green text-green-400' : 'animate-float-out-red text-red-500'}`; el.innerText = `${pos ? '+' : '-'} ${amt.toLocaleString()} ${Config.currency.symbol}`; cell.parentElement.appendChild(el); setTimeout(() => el.remove(), getConf('ui','budgetFloatDuration')); }
}

// =====================================================================
// JOKER LOGIK
// =====================================================================
// Kontrolle (block) and Reservierung (autoBuy) may each be played once per round,
// no matter whether they're triggered from the player row or the joker modal.
function jokerRoundLimitHit(type) {
    const used = type === 'block' ? jokerPhaseState.blockUsed : jokerPhaseState.autoBuyUsed;
    if (!used) return false;
    const label = Config.terminology?.jokers?.[type]?.label || type;
    showModal("Diese Runde schon gespielt", `<strong>${label}</strong> darf nur einmal pro Runde eingesetzt werden. Beim nächsten Ziehen ist er wieder frei.`);
    return true;
}

function useBlockJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.block <= 0) return showModal("Verbraucht!", "Keine Joker mehr verfügbar.");
    if (jokerRoundLimitHit('block')) return;
    const s = $('block-select'); if (s) { s.innerHTML = ''; managers.forEach(mgr => { if (mgr.id !== id) s.innerHTML += `<option value="${mgr.id}">${mgr.name}</option>`; }); }
    blockInitiatorId = id; if ($('block-modal')) $('block-modal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', function() {
    if ($('block-confirm-btn')) $('block-confirm-btn').addEventListener('click', function () {
        const m = managers.find(x => x.id === blockInitiatorId), tm = managers.find(x => x.id === parseInt($('block-select').value));
        if (!m || !tm) return;
        jokerPhaseState.blockUsed = true; renderJokerPhaseModal(); // spent either way, even if countered
        if (tm.perk === 'perk7') {
            if ($('block-modal')) $('block-modal').classList.add('hidden');
            m.jokers.block--;
            addLog(`Isolation fehlgeschlagen: ${tm.name} blockt ab.`, "alert");
            renderMatrix();
            playRowFx(tm, 'fx-block is-countered', `<div class="fx-stamp">🛡️ ABGEWEHRT</div>`, 1500)?.at(350, sfx.hit);
            return showModal("🛑 Abgelehnt!", `<strong>${tm.name}</strong> blockt ab! Dein Joker ist trotzdem verbraucht.`);
        }
        m.jokers.block--; blockedPlayerId = tm.id;
        if ($('block-modal')) $('block-modal').classList.add('hidden');
        addLog(`Isolation: ${m.name} sperrt ${tm.name} weg.`, "alert");
        renderMatrix();
        const fx = playRowFx(tm, 'fx-block', `<div class="fx-chain"></div><div class="fx-chain is-second"></div><div class="fx-stamp">🔒 GESPERRT</div>`, 1700);
        fx?.at(150, sfx.chains); fx?.at(500, () => sfx.gavel(1));
        showModal("🛑 BLOCKIERT!", `<strong>${m.name}</strong> sperrt <strong>${tm.name}</strong>!`);
    });

    if ($('gamble-confirm-btn')) $('gamble-confirm-btn').addEventListener('click', function () {
        const m = managers.find(x => x.id === gambleInitiatorId);
        const cat = $('gamble-select')?.value;
        if (!m || !cat || !m.team[cat]) return;
        const oldCard = m.team[cat];
        const dbCat = (oldCard.type || cat).toUpperCase();
        const list = itemDatabase[dbCat];
        if (!list || list.length === 0) {
            if ($('gamble-modal')) $('gamble-modal').classList.add('hidden');
            return showModal("Kein Ersatz!", "Keine Objekte mehr auf dem Markt.");
        }
        if (m.perk === 'perk5' && list.length >= 2) {
            gambleSelectedOldCard = oldCard;
            if ($('gamble-modal')) $('gamble-modal').classList.add('hidden');
            let shuffled = [...list];
            for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
            gambleTemporaryCards = shuffled.slice(0, getConf('perks','perk5_gambleChoices'));
            let html = '';
            gambleTemporaryCards.forEach(c => {
                html += `<div onclick="selectGambleChoiceCard('${c.id}')" class="bg-black/50 p-4 rounded-xl border border-yellow-500 hover:bg-yellow-950/40 cursor-pointer transition shadow-inner flex flex-col justify-between"><div><div class="flex items-center gap-3 mb-2"><span class="text-3xl">${c.icon}</span><div class="font-black text-white text-sm line-clamp-2">${c.name}</div></div><div class="text-xs text-stone-300 italic mb-3 line-clamp-3">${c.desc}</div></div><div class="flex justify-between items-center mt-2 border-t border-stone-700/50 pt-2"><span class="text-lime-400 font-bold text-xs"><i class="fa-solid fa-star"></i> ${c.score} Pkt.</span><span class="text-stone-400 font-black text-xs">${c.cost.toLocaleString()} ${Config.currency.symbol}</span></div></div>`;
            });
            if ($('gamble-choice-options')) $('gamble-choice-options').innerHTML = html;
            if ($('gamble-choice-modal')) $('gamble-choice-modal').classList.remove('hidden');
            return;
        }
        const uIdx = usedDatabase.findIndex(x => x.id === oldCard.id);
        if (uIdx !== -1) {
            let returned = usedDatabase.splice(uIdx, 1)[0]; delete returned.owner;
            if (!itemDatabase[returned.dbCategory || dbCat]) itemDatabase[returned.dbCategory || dbCat] = [];
            itemDatabase[returned.dbCategory || dbCat].push(returned);
        }
        const newCard = list[Math.floor(Math.random() * list.length)];
        const nIdx = itemDatabase[dbCat].findIndex(x => x.id === newCard.id);
        if (nIdx !== -1) { let pNew = itemDatabase[dbCat].splice(nIdx, 1)[0]; pNew.owner = m.name; usedDatabase.push(pNew); }
        m.team[cat] = { ...newCard, type: dbCat };
        m.jokers.gamble--;
        saveDatabases(); updateEventChanceDisplays(); checkCategoryCompletion(cat);
        if ($('gamble-modal')) $('gamble-modal').classList.add('hidden');
        addLog(`Getauscht: ${m.name} gibt ${oldCard.name} ab, erhält ${newCard.name}.`, "event");
        playSwapScene(m, oldCard, newCard);
        showModal("🎓 SCHMUGGEL ERFOLGREICH!", `<strong>${m.name}</strong> gibt <strong>${oldCard.name}</strong> ab und erhält:<br><div class='bg-black/50 p-4 rounded-xl mt-4 border border-yellow-500'><div class='flex items-center gap-3 mb-2'><span class='text-3xl'>${newCard.icon}</span><div class='font-black text-white text-lg'>${newCard.name}</div></div><div class='text-xs text-stone-300 italic mb-3'>${newCard.desc}</div><div class='text-lime-400 font-black text-sm text-right'>${newCard.cost.toLocaleString()} ${Config.currency.symbol}</div></div>`);
        resetMatrixActiveBid();
    });

    if ($('blind-confirm-btn')) $('blind-confirm-btn').addEventListener('click', function () {
        const cat = activeMatrixAuctionCategory, el = managers.filter(mgr => !mgr.team[cat.toLowerCase()] && mgr.id !== blockedPlayerId);
        let guesses = [];
        for (let mgr of el) {
            const input = $(`blind-guess-${mgr.id}`), val = parseInt(input?.value);
            if (isNaN(val) || val < 0) { // mark the row that still needs a bid
                const row = input?.closest('.blind-form-row');
                if (row) { row.classList.remove('is-missing'); void row.offsetWidth; row.classList.add('is-missing'); }
                return input?.focus();
            }
            guesses.push({ mgr: mgr, guess: val });
        }
        const list = itemDatabase[cat]; if (!list || list.length === 0) { if ($('blind-modal')) $('blind-modal').classList.add('hidden'); return showModal("Katalog leer!", "Nichts mehr da."); }
        const drawn = list[Math.floor(Math.random() * list.length)], hp = Math.floor(drawn.cost * getConf('mechanics','blindWinCostFraction'));
        // Players who can't pay drop out; the closest remaining guess wins. A tie on that place is
        // settled by lot (the scene plays it as a running light). No one left -> no deal, card stays.
        const dist = g => Math.abs(g.guess - drawn.cost);
        const broke = new Set(guesses.filter(g => g.mgr.budget < hp).map(g => g.mgr));
        const payers = guesses.filter(g => !broke.has(g.mgr));
        const best = Math.min(...payers.map(dist));
        const tied = payers.filter(g => dist(g) === best).map(g => g.mgr);
        const winner = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
        const result = { winner, broke, tied, price: hp };
        if ($('blind-modal')) $('blind-modal').classList.add('hidden');
        if (!winner) {
            addLog(`Blinder Deal geplatzt: niemand kann ${hp.toLocaleString()} ${Config.currency.symbol} zahlen.`, "alert");
            return playBlindReveal(drawn, guesses, result);
        }
        const cbText = processPurchase(winner, hp, drawn, cat);
        addLog(`Blinder Deal: ${winner.name} gewinnt${tied.length > 1 ? ' per Los' : ''}.`, "buy");
        playBlindReveal(drawn, guesses, result, () => flyCardToSlot(drawn, winner, hp));
        if (cbText) showModal("💰 BONUS", cbText.replace(/^(<br>)+/, '')); // waits until the scene is closed
        resetMatrixActiveBid();
    });
});

function useBonusJoker(id) {
    const m = managers.find(x => x.id === id);
    if (m) {
        if (m.jokers.bonus <= 0) return showModal("Verbraucht", "Joker bereits benutzt.");
        m.jokers.bonus--; m.cashbackActive = true;
        addLog(`Bonus: ${m.name} sichert sich Rückzahlung.`, "event");
        renderMatrix();
        playRowFx(m, 'fx-shield', `<div class="fx-shield-icon">🛡️</div>`, 1400)?.at(500, sfx.chaching);
        showModal("💰 Bonus aktiviert!", `${m.name} erhält beim nächsten Objekt Geld zurück!`);
    }
}

function useAutoBuyJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.autoBuy <= 0) return showModal("Verbraucht", "Joker bereits benutzt.");
    if (jokerRoundLimitHit('autoBuy')) return;
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Du bist in Isolation!");
    const cat = activeMatrixAuctionCategory.toLowerCase(); if (m.team[cat]) return showModal("Voll!", "Platz bereits besetzt.");
    const list = itemDatabase[activeMatrixAuctionCategory]; if (!list || list.length === 0) return showModal("Katalog leer!", "Nichts mehr übrig.");
    const catKey = activeMatrixAuctionCategory, factor = getConf('mechanics','autoBuyMultiplier');
    const item = list[Math.floor(Math.random() * list.length)], price = Math.floor(item.cost * factor);
    playClawScene(m, item, price, factor, {
        // The joker is spent once the claw drops; otherwise a broke player could re-roll until a cheap card comes up
        onGrab: () => {
            m.jokers.autoBuy--; jokerPhaseState.autoBuyUsed = true;
            renderMatrix(); renderJokerPhaseModal();
        },
        onDone: () => {
            if (m.budget < price) {
                addLog(`Blindkauf geplatzt: ${m.name} kann ${item.name} (${price.toLocaleString()}) nicht bezahlen.`, "alert");
                shreddedDatabase.push(list.splice(list.indexOf(item), 1)[0]); saveDatabases(); // flushed, not back into the catalogue
                return givePenaltyCard(m, catKey, true);
            }
            const cbText = processPurchase(m, price, item, catKey);
            addLog(`Bestechung: ${m.name} holt Item für ${price.toLocaleString()}!`, "event");
            resetMatrixActiveBid();
            flyCardToSlot(item, m, price);
            if (cbText) showModal("💰 BONUS", cbText.replace(/^(<br>)+/, '')); // waits until the card has landed
        }
    });
}

// GREIFAUTOMAT (Blindkauf joker). Start panel with the rules -> the claw slides over a heap of face-down
// cards, grabs one, carries it wobbling to the chute and drops it -> the card flips, the price is worked
// out and checked against the budget. Too expensive: the loser card slides out on top of it.
// Nothing happens to the game until "Greifen" (onGrab) and the final button (onDone).
function playClawScene(m, item, price, factor, { onGrab, onDone }) {
    const sym = Config.currency.symbol, cat = Config.categories[activeMatrixAuctionCategory];
    const label = Config.terminology?.jokers?.autoBuy?.label || 'Blindkauf';
    const broke = m.budget < price, tpl = Config.punishCardTemplate || {};
    const heap = Array.from({ length: 9 }, (_, i) => `<i style="--hx:${4 + (i % 5) * 14 + (i > 4 ? 7 : 0)}%; --hy:${i > 4 ? 30 : 4}px; --hr:${Math.round(Math.random() * 50 - 25)}deg">${cat?.icon || '🂠'}</i>`).join('');
    const target = 1 + Math.floor(Math.random() * 3); // one of the front cards

    const el = document.createElement('div');
    el.className = 'fx-scene claw-scene';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label);
    el.innerHTML = `
        <div class="claw-panel">
            <div class="claw-stage">
                <div class="claw-machine" aria-hidden="true">
                    <div class="claw-top">Greifautomat</div>
                    <div class="claw-glass"></div>
                    <div class="claw-heap">${heap}</div>
                    <div class="claw-chute"><span>▼</span></div>
                    <div class="claw"><div class="claw-cable"></div><div class="claw-head"><b class="claw-prong is-l"></b><b class="claw-prong is-r"></b></div><div class="claw-grab">${cat?.icon || '🂠'}</div></div>
                </div>
                <div class="draw-card"><div class="draw-flipper">
                    <div class="draw-face draw-back"><span>${cat?.icon || '🂠'}</span></div>
                    <div class="draw-face draw-front">
                        <div class="draw-icon">${item.icon || cat?.icon || ''}</div>
                        <div class="draw-name">${item.name}</div>
                        <div class="draw-desc">${item.desc || ''}</div>
                    </div>
                </div></div>
                <div class="claw-loser draw-face">
                    <div class="draw-icon">${tpl.icon || '💩'}</div>
                    <div class="draw-name">${tpl.name || 'Loser-Karte'}</div>
                    <div class="draw-desc">${tpl.desc || ''}</div>
                </div>
            </div>
            <div class="claw-info">
                <div class="claw-head-title">${jokerIcon('autoBuy')} ${label}</div>
                <div class="claw-sub"><strong>${m.name}</strong> · ${cat?.icon || ''} ${cat?.name || ''}</div>
                <div class="claw-rules">
                    <span>🎲 Zufällige Karte</span><span>× ${factor.toLocaleString()} Preis</span><span>Budget ${m.budget.toLocaleString()} ${sym}</span>
                </div>
                <div class="claw-warn">Reicht das Budget nicht: Karte weg, Joker weg, Loser-Karte.</div>
                <div class="claw-bill">
                    <div><span>Kartenwert</span><b>${item.cost.toLocaleString()} ${sym}</b></div>
                    <div><span>Blindkauf-Aufschlag</span><b>× ${factor.toLocaleString()}</b></div>
                    <div class="is-total"><span>Preis</span><b>${price.toLocaleString()} ${sym}</b></div>
                </div>
                <div class="claw-verdict ${broke ? 'is-bad' : 'is-good'}">${broke
                    ? `💸 ZU TEUER · es fehlen ${(price - m.budget).toLocaleString()} ${sym}`
                    : `✅ GESICHERT · Budget danach ${(m.budget - price).toLocaleString()} ${sym}`}</div>
                <div class="claw-actions">
                    <button class="last-btn is-flush" data-act="cancel">Abbrechen</button>
                    <button class="last-btn is-take" data-act="grab">🕹️ Greifen</button>
                </div>
                <div class="claw-actions is-final">
                    <button class="last-btn is-take" data-act="done">${broke ? 'Loser-Karte annehmen' : 'Karte einsortieren'}</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(el);

    const machine = el.querySelector('.claw-machine'), heapCards = el.querySelectorAll('.claw-heap i');
    const timers = [];
    let phase = 'start', done = false; // start -> grabbing -> revealed -> ready
    const at = (ms, fn) => timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 400) : ms));
    const stage = cls => el.classList.add(cls);
    const finish = act => {
        if (done) return; done = true;
        timers.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey, true);
        if (act === 'done') onDone(); // mounts the card flight / drops the loser card before this scene leaves
        el.classList.add('is-leaving');
        setTimeout(() => { el.remove(); sceneEnded(); }, 250);
    };
    const focusLast = sel => { const b = el.querySelectorAll(sel + ' button'); b[b.length - 1]?.focus(); };
    // Card flipped, bill and verdict shown; the final button follows 1.5 s later so the text gets read.
    const reveal = () => {
        if (phase === 'revealed' || phase === 'ready') return;
        phase = 'revealed';
        timers.forEach(clearTimeout);
        stage('is-dropped'); stage('is-revealed'); stage('is-flipped'); stage('is-billed');
        timers.push(setTimeout(() => { stage('is-verdict'); broke ? sfx.wahwah() : sfx.chaching(); }, reducedMotion() ? 0 : 500));
        if (broke) timers.push(setTimeout(() => stage('is-loser'), reducedMotion() ? 0 : 1100));
        timers.push(setTimeout(() => { phase = 'ready'; stage('is-ready'); focusLast('.claw-actions.is-final'); }, 1500 + (broke ? 1100 : 500)));
    };
    const grab = () => {
        if (phase !== 'start') return;
        phase = 'grabbing';
        onGrab();
        stage('is-running');
        const box = machine.getBoundingClientRect(), card = heapCards[target].getBoundingClientRect();
        const tx = card.left + card.width / 2 - box.left, ty = card.top - box.top - 52; // claw hangs 14px down, head + prongs ~38px
        const set = (k, v) => machine.style.setProperty(k, v);
        sfx.whoosh(); set('--cx', tx + 'px');
        at(750, () => { set('--drop', Math.max(20, ty) + 'px'); sfx.tick(); });
        at(1500, () => { stage('is-gripping'); heapCards[target].classList.add('is-taken'); stage('is-holding'); sfx.hit(); });
        at(1800, () => set('--drop', '20px'));
        at(2650, () => { set('--cx', '44px'); sfx.whoosh(); });
        at(3450, () => { el.classList.remove('is-gripping'); stage('is-dropped'); sfx.flip(); });
        at(4000, () => { stage('is-revealed'); });
        at(4500, () => { stage('is-flipped'); sfx.flip(); });
        at(5100, reveal);
    };
    // Keys never reach the board. Start: Enter grabs, Esc cancels. While running: Space/Enter/Esc skip to the result.
    // Ready: Space/Enter press the button.
    const onKey = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const go = e.key === ' ' || e.key === 'Enter';
        if (phase === 'start') { if (e.key === 'Escape') finish('cancel'); else if (go) grab(); return; }
        if (phase === 'grabbing') { if (go || e.key === 'Escape') reveal(); return; }
        if (phase === 'ready' && go) finish('done');
    };
    document.addEventListener('keydown', onKey, true);
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'cancel' && phase === 'start') finish('cancel');
        if (act === 'grab') grab();
        if (act === 'done' && phase === 'ready') finish('done');
    }));
    el.addEventListener('click', () => { if (phase === 'grabbing') reveal(); });

    requestAnimationFrame(() => { el.classList.add('show'); focusLast('.claw-actions:not(.is-final)'); });
}

function useGambleJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.gamble <= 0) return showModal("Verbraucht", "Joker bereits benutzt.");
    const select = $('gamble-select'); if (!select) return; select.innerHTML = ''; let hasCards = false;
    for (let c in m.team) {
        if (m.team[c]) {
            hasCards = true;
            select.innerHTML += `<option value="${c}">${Config.categories[c.toUpperCase()]?.name || c}: ${m.team[c].name}</option>`;
        }
    }
    if (!hasCards) return showModal("Leer!", "Du hast nichts zum Umtauschen.");
    gambleInitiatorId = id; if ($('gamble-modal')) $('gamble-modal').classList.remove('hidden');
}

function selectGambleChoiceCard(newId) {
    const m = managers.find(x => x.id === gambleInitiatorId);
    const oldCard = gambleSelectedOldCard;
    const dbCat = (oldCard.type || '').toUpperCase();
    const cat = dbCat.toLowerCase();
    const newCard = gambleTemporaryCards.find(c => c.id === newId);
    if (!m || !oldCard || !newCard) return;
    if ($('gamble-choice-modal')) $('gamble-choice-modal').classList.add('hidden');
    const uIdx = usedDatabase.findIndex(x => x.id === oldCard.id);
    if (uIdx !== -1) {
        let returned = usedDatabase.splice(uIdx, 1)[0]; delete returned.owner;
        if (!itemDatabase[returned.dbCategory || dbCat]) itemDatabase[returned.dbCategory || dbCat] = [];
        itemDatabase[returned.dbCategory || dbCat].push(returned);
    }
    const nIdx = itemDatabase[dbCat].findIndex(x => x.id === newCard.id);
    if (nIdx !== -1) { let pNew = itemDatabase[dbCat].splice(nIdx, 1)[0]; pNew.owner = m.name; usedDatabase.push(pNew); }
    m.team[cat] = { ...newCard, type: dbCat };
    m.jokers.gamble--;
    saveDatabases(); updateEventChanceDisplays(); checkCategoryCompletion(cat);
    addLog(`Schmuggel (Wahl): ${m.name} wählt ${newCard.name}.`, "event");
    playSwapScene(m, oldCard, newCard);
    showModal("🎓 SCHMUGGEL ERFOLGREICH!", `<strong>${m.name}</strong> tauscht <strong>${oldCard.name}</strong> ein und wählt:<br><div class='bg-black/50 p-4 rounded-xl mt-4 border border-yellow-500'><div class='flex items-center gap-3 mb-2'><span class='text-3xl'>${newCard.icon}</span><div class='font-black text-white text-lg'>${newCard.name}</div></div><div class='text-xs text-stone-300 italic mb-3'>${newCard.desc}</div><div class='text-lime-400 font-black text-sm text-right'>${newCard.cost.toLocaleString()} ${Config.currency.symbol}</div></div>`);
    resetMatrixActiveBid();
}

function cancelGambleChoice() {
    if ($('gamble-choice-modal')) $('gamble-choice-modal').classList.add('hidden');
    showModal("Auswahl abgebrochen", "Du warst mit den Alternativen nicht zufrieden.");
}

function useSkipJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.skip <= 0) return showModal("Verbraucht!", "Bereits genutzt.");
    if (!activeMatrixAuctionItem) return showModal("Nichts da!", "Erst eine Ware ziehen.");
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Du bist in Isolation!");
    showConfirmModal(`Item <strong>${activeMatrixAuctionItem.name}</strong> ins Klo werfen?`, () => {
        m.jokers.skip--;
        const flushed = activeMatrixAuctionItem;
        const c = activeMatrixAuctionItem.dbCategory || activeMatrixAuctionItem.type?.toUpperCase();
        const itemId = activeMatrixAuctionItem.id;
        const idx = itemDatabase[c]?.findIndex(x => x.id === itemId);
        if (idx !== undefined && idx !== -1) { shreddedDatabase.push(itemDatabase[c].splice(idx, 1)[0]); saveDatabases(); }
        addLog(`Gespült: ${m.name} vernichtet Objekt.`, "alert");

        const list = itemDatabase[activeMatrixAuctionCategory];
        if (list && list.length > 0) {
            const newItem = list[Math.floor(Math.random() * list.length)];
            activeMatrixAuctionItem = { ...newItem, type: activeMatrixAuctionCategory };
            
            if ($('matrix-active-bid-target')) $('matrix-active-bid-target').innerHTML = `${newItem.name}`;
            if ($('matrix-active-bid-start-price')) $('matrix-active-bid-start-price').innerText = `Kosten: ${newItem.cost.toLocaleString()} ${Config.currency.symbol}`;
	    if ($('matrix-active-bid-desc')) $('matrix-active-bid-desc').innerHTML = getDynamicDescHtml(newItem);
            if ($('matrix-auction-price')) $('matrix-auction-price').value = newItem.cost;

            playFlushScene(flushed, () => playDrawAnimation(newItem, null, false));
            showModal("🚽 WEGGESPÜLT", `Das Objekt wurde vernichtet! Als Ersatzkarte wurde <strong>${newItem.name}</strong> aufgedeckt.`);
        } else {
            resetMatrixActiveBid();
            playFlushScene(flushed);
            showModal("🚽 WEGGESPÜLT", "Das Objekt wurde vernichtet! Keine Karten mehr im globalen Katalog als Ersatz verfügbar.");
        }
    });
}

// =====================================================================
// JOKER-PHASE (MOD 4 ERWEITERUNGEN)
// =====================================================================
// Opened on demand from the dock. The order itself rotates in processPurchase.
function openJokerPhase() {
    renderJokerPhaseModal(); // round limits reset on draw, not on opening the modal
    if ($('joker-phase-modal')) $('joker-phase-modal').classList.remove('hidden');
}

function renderJokerPhaseModal() {
    let container = $('joker-phase-list');
    if (!container) return;
    container.innerHTML = '';

    // Lade die Begriffe und Icons dynamisch aus der Config (mit Fallback, falls etwas fehlt)
    const t = Config.terminology?.jokers || {};
    const icnBlock = jokerIcon('block');
    const lblBlock = t.block?.label || 'Block';
    
    const icnAutoBuy = jokerIcon('autoBuy');
    const lblAutoBuy = t.autoBuy?.label || 'Bestechen';
    
    const icnBonus = jokerIcon('bonus');
    const lblBonus = t.bonus?.label || 'Schutz';
    
    const icnGamble = jokerIcon('gamble');
    const lblGamble = t.gamble?.label || 'Tausch';

    playerJokerOrder.forEach(mgrId => {
        let m = managers.find(x => x.id === mgrId);
        if (!m) return;

        // Blockierter Zustand
        if (m.id === blockedPlayerId) {
            container.innerHTML += `
                <div class="flex items-center justify-between p-3 mb-2 rounded border border-stone-800 bg-stone-900/50 opacity-60">
                    <span class="text-sm font-semibold text-stone-500">${m.name}</span>
                    <div class="text-xs font-medium text-stone-500 flex items-center gap-2">
                        <i class="fa-solid fa-lock"></i> Gesperrt
                    </div>
                </div>`;
            return;
        }

        let btnHtml = '';
        const baseBtn = "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all duration-200 border";
        
        if (m.jokers.block > 0) {
            if (jokerPhaseState.blockUsed) {
                btnHtml += `<button class="${baseBtn} border-stone-800 text-stone-600 bg-transparent cursor-not-allowed">${icnBlock} ${lblBlock} (${m.jokers.block})</button>`;
            } else {
                btnHtml += `<button onclick="triggerPhaseJoker(${m.id}, 'block')" class="${baseBtn} border-stone-700 text-stone-300 hover:border-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700">${icnBlock} ${lblBlock} (${m.jokers.block})</button>`;
            }
        }

        if (m.jokers.autoBuy > 0) {
            let abDis = jokerPhaseState.autoBuyUsed ? 'border-stone-800 text-stone-600 bg-transparent cursor-not-allowed' : 'border-stone-700 text-stone-300 hover:border-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700';
            let abClick = jokerPhaseState.autoBuyUsed ? '' : `onclick="triggerPhaseJoker(${m.id}, 'autoBuy')"`;
            btnHtml += `<button ${abClick} class="${baseBtn} ${abDis}">${icnAutoBuy} ${lblAutoBuy} (${m.jokers.autoBuy})</button>`;
        }

        if (m.jokers.bonus > 0) {
            btnHtml += `<button onclick="triggerPhaseJoker(${m.id}, 'bonus')" class="${baseBtn} border-stone-700 text-stone-300 hover:border-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700">${icnBonus} ${lblBonus} (${m.jokers.bonus})</button>`;
        }

        if (m.jokers.gamble > 0) {
            btnHtml += `<button onclick="triggerPhaseJoker(${m.id}, 'gamble')" class="${baseBtn} border-stone-700 text-stone-300 hover:border-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700">${icnGamble} ${lblGamble} (${m.jokers.gamble})</button>`;
        }

        if (btnHtml === '') {
            btnHtml = `<span class="text-xs text-stone-600 font-medium">Keine Optionen</span>`;
        }

        // Spieler-Zeile
        container.innerHTML += `
            <div class="flex flex-col md:flex-row md:items-center justify-between p-3 mb-2 rounded border border-stone-700/50 bg-stone-900 hover:bg-stone-800/80 hover:border-stone-600 transition-colors">
                <span class="text-sm font-semibold text-stone-200 mb-2 md:mb-0">${m.name}</span>
                <div class="flex flex-wrap gap-2">
                    ${btnHtml}
                </div>
            </div>`;
    });
}

function triggerPhaseJoker(mgrId, type) {
    // limits are checked and marked inside the joker functions, on actual use
    if (type === 'block') useBlockJoker(mgrId);
    if (type === 'autoBuy') useAutoBuyJoker(mgrId);
    if (type === 'bonus') useBonusJoker(mgrId);
    if (type === 'gamble') useGambleJoker(mgrId);
    
    renderJokerPhaseModal();
}

function closeJokerPhase() {
    if ($('joker-phase-modal')) $('joker-phase-modal').classList.add('hidden');
}

// =====================================================================
// EVENTS ACTION EXECUTION
// =====================================================================
function getBaseEventChance() { return getConf('mechanics','baseEventChance'); }
function updateEventChanceDisplays() {
    let val = Math.round(getBaseEventChance() * 100) + '%';
    if ($('event-chance-display')) $('event-chance-display').innerText = val;
    if ($('event-chance-display-admin')) $('event-chance-display-admin').innerText = val;
}

function triggerEvent() {
    const av = Config.events.filter(e => !triggeredEventIds.includes(e.id));
    if (av.length === 0) return showModal("Das war's", "Alle Ereignisse wurden bereits ausgelöst!");
    const ev = av[Math.floor(Math.random() * av.length)]; triggeredEventIds.push(ev.id);
    const before = managers.map(m => m.budget), jokersBefore = managers.map(m => ({ ...m.jokers }));
    destroyedCategory = null;
    const result = executeEventLogic(ev);
    const rows = eventImpactRows(ev, before, jokersBefore);
    // The newspaper names the players: {platzhalter} in title and text are filled for this event
    const ctx = eventTextContext(ev, before, jokersBefore);
    const story = { ...ev, title: fillEventText(ev.title, ctx), desc: fillEventText(ev.desc, ctx) };
    addLog(`Event: ${story.title.replace(/<[^>]+>/g, '')}`, "event");
    renderMatrix(); updateBuyerDropdown(); resetMatrixActiveBid();
    playEventScene(story, result, rows, before);
}

let destroyedCategory = null; // set by destroy_random_category so the event text can name it

// Values for the placeholders in event titles and texts (config "events"):
// {gewinner} {verlierer} {alle}  -> player names ("A, B und C", "niemand" if empty)
// {betrag} amount of the (single) winner/loser, or the flat/per-joker value
// {anteil} value as percent · {anzahl} value as number · {joker} joker name · {kategorie} category · {karte} last purchase
function eventTextContext(ev, before, jokersBefore) {
    const sym = Config.currency.symbol, money = n => `${Math.abs(Math.round(n)).toLocaleString()} ${sym}`;
    const names = list => {
        const n = list.map(m => `<strong>${m.name}</strong>`);
        return !n.length ? 'niemand' : n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
    };
    const delta = m => m.budget - before[managers.indexOf(m)];
    const minM = managers[before.indexOf(Math.min(...before))], maxM = managers[before.indexOf(Math.max(...before))]; // same picks as executeEventLogic
    const jokersAt = (jokers) => Object.values(jokers).reduce((a, b) => a + b, 0);
    let gewinner = [], verlierer = [], betrag = 0, karte = 'nichts', kategorie = 'keine';
    switch (ev.action) {
        case "bonus_lowest": gewinner = [minM]; betrag = delta(minM); break;
        case "tax_highest": verlierer = [maxM]; betrag = delta(maxM); break;
        case "robin_hood_tax": gewinner = [minM]; verlierer = managers.filter(m => m !== minM); betrag = delta(minM); break;
        case "tax_all": case "bonus_all": betrag = ev.value; break;
        case "bonus_for_unused_jokers":
            gewinner = managers.filter((m, i) => jokersAt(jokersBefore[i]) > 0);
            verlierer = managers.filter((m, i) => !jokersAt(jokersBefore[i])); betrag = ev.value; break;
        case "disable_joker": verlierer = managers.filter((m, i) => jokersBefore[i][ev.value] > 0); break;
        case "refund_last_purchase": {
            const m = managers.find(x => x.id === lastPurchase.managerId);
            if (m) { gewinner = [m]; betrag = delta(m); karte = lastPurchase.item?.name || karte; }
            break;
        }
        case "restore_jokers": gewinner = managers.filter((m, i) => jokersAt(m.jokers) > jokersAt(jokersBefore[i])); break;
        case "destroy_random_category":
            if (destroyedCategory) {
                verlierer = managers.filter(m => m.team[destroyedCategory] && !(m.perk === 'perk1' && m.protegeCats.includes(destroyedCategory)));
                kategorie = Config.categories[destroyedCategory.toUpperCase()]?.name || destroyedCategory;
            }
            break;
    }
    return {
        gewinner: names(gewinner), verlierer: names(verlierer), alle: names(managers), betrag: money(betrag), karte, kategorie,
        anteil: `${Math.round((Number(ev.value) || 0) * 100)} %`, anzahl: ev.value,
        joker: Config.terminology?.jokers?.[ev.value]?.label || ev.value
    };
}
// Catalogue view: placeholders shown as highlighted role names
const eventPreviewText = text => String(text || '').replace(/\{(\w+)\}/g, (all, key) => `<b class="not-italic text-yellow-300">[${key}]</b>`);
const fillEventText = (text, ctx) => String(text || '').replace(/\{(\w+)\}/g, (all, key) => ctx[key] ?? all);

// What the event did to each player: the calculation (from the event's formula and the budgets BEFORE it),
// the actual change (budget diff, so perks that block or boost show as a note), budget and rank before/after,
// and joker changes. Players the event didn't touch are left out.
function eventImpactRows(ev, before, jokersBefore) {
    const sym = Config.currency.symbol, money = n => `${Math.round(n).toLocaleString()} ${sym}`;
    const pct = `${Math.round((ev.value || 0) * 100)} %`;
    const minI = before.indexOf(Math.min(...before)), maxI = before.indexOf(Math.max(...before)); // same picks as executeEventLogic
    const jokerSum = j => Object.values(j).reduce((a, b) => a + b, 0);
    const formula = {};
    switch (ev.action) {
        case "bonus_lowest": formula[minI] = `Kleinstes Budget: ${money(before[minI])} × ${pct}`; break;
        case "tax_highest": formula[maxI] = `Größtes Budget: ${money(before[maxI])} × ${pct}`; break;
        case "robin_hood_tax": managers.forEach((m, i) => formula[i] = i === minI ? 'Kleinstes Budget: bekommt alle Abgaben' : `Abgabe: ${money(before[i])} × ${pct}`); break;
        case "tax_all": managers.forEach((m, i) => formula[i] = `Pauschal −${money(ev.value)}`); break;
        case "bonus_all": managers.forEach((m, i) => formula[i] = `Pauschal +${money(ev.value)}`); break;
        case "bonus_for_unused_jokers": managers.forEach((m, i) => { const n = jokerSum(jokersBefore[i]); if (n) formula[i] = `${n} ungenutzte Joker × ${money(ev.value)}`; }); break;
        case "refund_last_purchase": { const i = managers.findIndex(m => m.id === lastPurchase.managerId); if (i >= 0) formula[i] = `Letzter Kauf: ${money(lastPurchase.cost)} × ${pct}`; break; }
    }
    const rank = budgets => { const sorted = [...budgets].sort((a, b) => b - a); return budgets.map(b => sorted.indexOf(b) + 1); };
    const rankBefore = rank(before), rankAfter = rank(managers.map(m => m.budget));
    return managers.map((m, i) => {
        const delta = m.budget - before[i];
        const jokers = Object.keys(m.jokers).filter(k => m.jokers[k] !== jokersBefore[i][k])
            .map(k => `${Config.terminology?.jokers?.[k]?.label || k} ${jokersBefore[i][k]} → <b>${m.jokers[k]}</b>`);
        let note = '';
        if (formula[i] && !delta && ev.action !== 'bonus_for_unused_jokers') note = `🛡️ immun (${Config.perks?.[m.perk]?.name || 'Perk'})`;
        else if (delta > 0 && m.perk === 'perk4') note = `inkl. ${Config.perks?.perk4?.name || 'Perk'} × ${getConf('perks','perk4_incomeMultiplier').toLocaleString('de-DE')}`;
        return { m, formula: formula[i], note, delta, before: before[i], after: m.budget, rankBefore: rankBefore[i], rankAfter: rankAfter[i], jokers };
    }).filter(r => r.formula || r.delta || r.jokers.length);
}

// EVENT as three acts: a letter flutters in and opens -> the newspaper unfolds with the story ->
// the "Gemeinschaftskarte" turns in beside it with the rule, the calculation per player and what it means.
// A click / Space / Enter during the acts jumps to the end; once everything is shown the next one closes it.
function playEventScene(ev, result, rows, before) {
    const sym = Config.currency.symbol, money = n => `${Math.abs(Math.round(n)).toLocaleString()} ${sym}`;
    const outlet = Config.terminology?.eventTitle || 'Eilmeldung';
    const rowHtml = rows.map((r, i) => {
        const rankMove = r.delta && r.rankBefore !== r.rankAfter
            ? `<span class="${r.rankAfter < r.rankBefore ? 'is-up' : 'is-down'}">Platz ${r.rankBefore} → ${r.rankAfter} ${r.rankAfter < r.rankBefore ? '▲' : '▼'}</span>` : '';
        return `
        <div class="ev-row" style="--i:${i}">
            <div class="ev-row-top"><b>${r.m.name}</b>${r.delta ? `<span class="ev-delta ${r.delta > 0 ? 'is-plus' : 'is-minus'}">${r.delta > 0 ? '+' : '−'} ${money(r.delta)}</span>` : ''}</div>
            ${r.formula || r.note ? `<div class="ev-row-calc">${[r.formula, r.note].filter(Boolean).join(' · ')}</div>` : ''}
            <div class="ev-row-mean">
                ${r.delta || r.formula ? `<span>Budget ${money(r.before)} → <b>${money(r.after)}</b></span>` : ''}
                ${rankMove}
                ${r.jokers.map(j => `<span>${j}</span>`).join('')}
            </div>
        </div>`;
    }).join('');

    const el = document.createElement('div');
    el.className = 'fx-scene event-scene';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${outlet}: ${ev.title}`);
    el.innerHTML = `
        <div class="ev-stage">
            <div class="ev-letter" aria-hidden="true">
                <div class="ev-env">
                    <div class="ev-flap"></div>
                    <div class="ev-seal">${Config.themeIcon || '✉️'}</div>
                    <div class="ev-stamp">${outlet}</div>
                </div>
            </div>
            <article class="ev-paper">
                <div class="ev-mast">${outlet}</div>
                <div class="ev-dateline"><span>Sonderausgabe</span><span>${Config.gameTitle || ''}</span></div>
                <h2 class="ev-headline">${ev.title}</h2>
                <p class="ev-body${ev.desc.startsWith('<strong>') ? ' no-dropcap' : ''}">${ev.desc}</p>
            </article>
            <section class="ev-card">
                <div class="ev-card-head">🎴 Gemeinschaftskarte</div>
                <div class="ev-card-rule">${result}</div>
                ${rowHtml ? `<div class="ev-rows">${rowHtml}</div>` : '<div class="ev-none">Keine Auswirkungen auf Budgets oder Joker.</div>'}
            </section>
        </div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Überspringen</div>`;
    document.body.appendChild(el);

    const timers = [];
    let done = false, complete = false;
    const at = (ms, fn) => timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 400) : ms));
    const stage = cls => el.classList.add(cls);
    const showAll = () => {
        if (complete) return; complete = true;
        timers.forEach(clearTimeout);
        stage('is-post'); stage('is-opened'); stage('is-paper'); stage('is-card'); stage('is-complete');
        const hint = el.querySelector('.auction-skip'); if (hint) hint.textContent = 'Klick, Leertaste oder Enter zum Schließen';
    };
    const finish = () => {
        if (done) return; done = true;
        timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey, true);
        rows.forEach(r => { if (r.delta) countBudget(r.m, -r.delta); }); // board budgets roll to the new values
        el.classList.add('is-leaving');
        setTimeout(() => { el.remove(); sceneEnded(); }, 250);
    };
    const next = () => complete ? finish() : showAll();
    const onKey = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') next();
    };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', next);

    requestAnimationFrame(() => { stage('show'); stage('is-post'); sfx.whoosh(); });
    at(1400, () => { stage('is-opened'); sfx.flip(); });
    at(1900, () => { stage('is-paper'); sfx.whoosh(); });
    at(3600, () => { stage('is-card'); sfx.chime(); });
    at(4300 + rows.length * 250 + 600, showAll);
}

function executeEventLogic(evObj) {
    let actual = 0, msgs = [];
    let lowest = managers.reduce((min, m) => m.budget < min.budget ? m : min, managers[0]);
    let highest = managers.reduce((max, m) => m.budget > max.budget ? m : max, managers[0]);
    switch (evObj.action) {
        case "bonus_lowest": actual = applyBudgetChange(lowest, Math.floor(lowest.budget * evObj.value), "event"); return `🏆 ${lowest.name} erhält +${actual.toLocaleString()} ${Config.currency.symbol}!`;
        case "tax_highest": actual = applyBudgetChange(highest, -Math.floor(highest.budget * evObj.value), "event"); if (actual === 0) return `🛡️ Der Angriff prallt an ${highest.name} ab!`; return `💥 ${highest.name} verliert ${Math.abs(actual).toLocaleString()} ${Config.currency.symbol}!`;
        case "robin_hood_tax": let collected = 0; managers.forEach(m => { if (m.id !== lowest.id) { let tax = Math.floor(m.budget * evObj.value); collected += Math.abs(applyBudgetChange(m, -tax, "event")); } }); actual = applyBudgetChange(lowest, collected, "event"); return `🎟️ ${lowest.name} profitiert und erhält +${actual.toLocaleString()} ${Config.currency.symbol}!`;
        case "tax_all": managers.forEach(m => { let act = applyBudgetChange(m, -evObj.value, "event"); if (act === 0) msgs.push(`${m.name} immun`); }); return `💸 Strafzahlung! Vorräte belastet${msgs.length > 0 ? ' (außer ' + msgs.join(', ') + ')' : ''}.`;
        case "bonus_all": managers.forEach(m => { applyBudgetChange(m, evObj.value, "event"); }); return `💰 Jeder freut sich über einen Bonus!`;
        case "bonus_for_unused_jokers": managers.forEach(m => { let count = m.jokers.block + m.jokers.bonus + m.jokers.autoBuy + m.jokers.gamble + m.jokers.skip; if (count > 0) { let bonus = count * evObj.value; actual = applyBudgetChange(m, bonus, "event"); msgs.push(`${m.name}`); } }); if (msgs.length === 0) return "Niemand hat mehr Joker übrig."; return `🎁 Geldregen für Sparer!`;
        case "disable_joker": managers.forEach(m => m.jokers[evObj.value] = 0); return `🚫 Alle '${Config.terminology.jokers[evObj.value]?.label || evObj.value}'-Joker verfallen sofort!`;
        case "blind_draws": blindDrawsLeft += evObj.value; return `❓ Die nächsten ${evObj.value} gezogenen Objekte sind VERDECKT.`;
        case "refund_last_purchase": if (lastPurchase.managerId !== null) { let m = managers.find(x => x.id === lastPurchase.managerId); if (m) { let refund = Math.floor(lastPurchase.cost * evObj.value); actual = applyBudgetChange(m, refund, "event"); return `🛒 ${m.name} erhält Erstattung (+${actual.toLocaleString()})!`; } } return "Aktion verfällt.";
        case "restore_jokers": managers.forEach(m => { if (m.perk === 'perk8') return; m.jokers.block = (m.perk === 'perk7') ? getConf('perks','perk7_startingBlocks') : getConf('jokers','block'); ['bonus', 'autoBuy', 'gamble', 'skip'].forEach(k => m.jokers[k] = getConf('jokers', k)); }); return `🕊️ WUNDER! Die Jokerkarten wurden wiederhergestellt!`;
        case "destroy_random_category": let validCats = []; for (let c of activeCategories) { let catLow = c.toLowerCase(); if (managers.every(m => m.team[catLow] !== null && m.team[catLow] !== undefined)) validCats.push(catLow); } if (validCats.length === 0) return "Glück gehabt. Noch nichts zu konfiszieren."; let chosenCat = validCats[Math.floor(Math.random() * validCats.length)]; destroyedCategory = chosenCat; managers.forEach(m => { if (m.perk === 'perk1' && m.protegeCats.includes(chosenCat)) return; if (m.team[chosenCat]) { m.team[chosenCat].score = 0; } }); return `💥 Razzia! Die Kategorie <strong>${Config.categories[chosenCat.toUpperCase()]?.name || chosenCat}</strong> wurde konfisziert. Items geben nun 0 Punkte!`;
        case "nothing": default: return `🙈 Friedlicher Moment. Keinerlei Auswirkungen.`;
    }
}

// =====================================================================
// SPECIAL AUKTIONEN (Blind / Dutch)
// =====================================================================
function triggerBlindAuctionEvent() {
    const cat = activeMatrixAuctionCategory, el = managers.filter(mgr => !mgr.team[cat.toLowerCase()] && mgr.id !== blockedPlayerId);
    if (el.length === 0) return showModal("Alle beschäftigt!", "Keine freien Slots mehr.");
    const c = $('blind-inputs'); if (!c) return;
    const sym = Config.currency.symbol;
    c.innerHTML = el.map(mgr => `
        <label class="blind-form-row" for="blind-guess-${mgr.id}">
            <span class="blind-form-name">${mgr.name}<small>Budget ${mgr.budget.toLocaleString()} ${sym}</small></span>
            <span class="blind-form-field"><input type="number" min="0" step="1000" id="blind-guess-${mgr.id}" placeholder="Blindgebot"><em>${sym}</em></span>
        </label>`).join('');
    if ($('blind-cat-name')) $('blind-cat-name').innerText = `${Config.categories[cat]?.icon || ''} ${Config.categories[cat]?.name || cat}`;
    if ($('blind-rule-off')) $('blind-rule-off').innerText = `🏷️ Gewinner zahlt ${Math.round(getConf('mechanics','blindWinCostFraction') * 100)} % des Werts`;
    blindInitiatorId = -1; if ($('blind-modal')) $('blind-modal').classList.remove('hidden');
    c.querySelector('input')?.focus();
}

function startDutchAuction() {
    const cat = activeMatrixAuctionCategory;
    let list = itemDatabase[cat]?.filter(item => item.tier === 'gut') || [];
    if (list.length === 0) list = itemDatabase[cat]?.filter(item => item.tier === 'mittel') || [];
    if (list.length === 0) list = itemDatabase[cat] || [];
    if (list.length === 0) return showModal("Abgebrochen", "Nichts mehr verfügbar.");
    addLog(`🚨 ALARM! Preis sinkt rasant...`, "alert");
    const bidders = managers.filter(m => m.id !== blockedPlayerId && !m.team[cat.toLowerCase()]);
    // Starts at the richest bidder's whole budget: at the first tick nobody can pay, then it gets closer to everyone
    dutchItem = list[Math.floor(Math.random() * list.length)];
    dutchStart = dutchPrice = Math.max(0, ...bidders.map(m => m.budget)) || startingBudget;
    if ($('dutch-item-title')) $('dutch-item-title').innerHTML = `<span class="text-lg">${dutchItem.icon}</span> ${dutchItem.name} <span class="text-xs bg-yellow-600 text-black font-bold px-1 rounded ml-1">${dutchItem.tier === 'gut' ? 'Premium' : 'Standard'}</span>`;
    if ($('dutch-item-desc')) $('dutch-item-desc').innerText = dutchItem.desc;
    if ($('dutch-alert')) $('dutch-alert').textContent = '';
    const c = $('dutch-buttons-container');
    if (c) c.innerHTML = bidders.map(m => `<button id="dutch-btn-${m.id}" onclick="resolveDutchAuction(${m.id})" disabled class="bg-orange-600 hover:bg-orange-500 text-white font-black py-2 px-3 rounded-lg text-xs shadow-md transition uppercase tracking-wide">💥 ${m.name} greift zu!</button>`).join('');
    const modal = $('dutch-modal');
    if (modal) { modal.classList.remove('hidden', 'is-sold'); modal.classList.add('is-intro'); }
    showDutchPrice(false);
    clearInterval(dutchInterval); clearTimeout(dutchBeatTimer); clearTimeout(dutchIntroTimer);
    sfx.siren(1500);

    // Alarm intro first (buttons locked), then the price starts to fall
    dutchIntroTimer = setTimeout(() => {
        if (!modal || modal.classList.contains('hidden')) return; // cancelled during the intro
        modal.classList.remove('is-intro');
        c?.querySelectorAll('button').forEach(b => b.disabled = false);
        sfx.hit();
        const drop = Math.max(1, Math.floor(dutchStart * getConf('dutchAuction', 'priceDropFraction')));
        dutchInterval = setInterval(() => {
            if (modal.classList.contains('hidden')) return clearInterval(dutchInterval);
            dutchPrice = Math.max(0, dutchPrice - drop);
            showDutchPrice();
            if (dutchPrice === 0) clearInterval(dutchInterval);
        }, getConf('dutchAuction', 'tickIntervalMs'));
        dutchHeartbeat();
    }, reducedMotion() ? 400 : 1800);
}

// Rolls the new price in like a departure board. --heat (0 at the start price, 1 at zero) drives colour,
// bar, red vignette and the jolt on every tick; the border pulses with the heartbeat.
function showDutchPrice(tick = true) {
    const el = $('dutch-price'), modal = $('dutch-modal'); if (!el) return;
    const heat = dutchStart ? 1 - dutchPrice / dutchStart : 0;
    el.textContent = `${dutchPrice.toLocaleString()} ${Config.currency.symbol}`;
    restartClass(el, 'is-rolling');
    modal?.style.setProperty('--beat', `${dutchBeatMs() / 1000}s`);
    modal?.style.setProperty('--heat', heat.toFixed(3));
    const alert = $('dutch-alert');
    if (alert) alert.textContent = dutchPrice === 0 ? '💸 GRATIS – wer greift zu?' : heat >= 0.8 ? '⚠️ LETZTE CHANCE' : '';
    modal?.classList.toggle('is-critical', heat >= 0.8);
    if (tick) { restartClass(document.querySelector('.dutch-pricebox'), 'is-jolt'); sfx.tick(); }
}
let dutchStart = 0, dutchIntroTimer = null;
const dutchBeatMs = () => Math.round(350 + 850 * dutchPrice / (dutchStart || startingBudget)); // faster as the price falls
let dutchBeatTimer = null;
function dutchHeartbeat() { // stops by itself once the popup is gone
    if (!$('dutch-modal') || $('dutch-modal').classList.contains('hidden')) return;
    sfx.heartbeat();
    dutchBeatTimer = setTimeout(dutchHeartbeat, dutchBeatMs());
}

function resolveDutchAuction(mgrId) {
    const m = managers.find(x => x.id === mgrId), btn = $(`dutch-btn-${mgrId}`); if (!m) return;
    if (m.budget < dutchPrice) {
        if (btn) { btn.classList.remove('is-denied'); void btn.offsetWidth; btn.classList.add('is-denied'); }
        return showModal("Nicht genug!", `<strong>${m.name}</strong> hat nicht genug Budget! Es geht weiter.`);
    }
    clearInterval(dutchInterval); clearTimeout(dutchBeatTimer);
    const price = dutchPrice, item = dutchItem;
    document.querySelectorAll('#dutch-buttons-container button').forEach(b => b.disabled = true);
    if (btn) btn.classList.add('is-grabbed');
    $('dutch-modal')?.classList.add('is-sold');
    if ($('dutch-alert')) $('dutch-alert').textContent = `🔨 ${m.name} schlägt zu!`;
    sfx.gavel(1);
    let cbText = processPurchase(m, price, item, activeMatrixAuctionCategory);
    addLog(`Zuschlag: ${m.name} sichert sich Ware für ${price.toLocaleString()}!`, "buy");
    setTimeout(() => { // let the grab flash be seen
        if ($('dutch-modal')) $('dutch-modal').classList.add('hidden');
        playAuctionAnimation(price, item, m);
        showModal((Config.auctionAnimation?.dealRescuedTitle) || "🔨 DEAL GERETTET!", `<strong>${m.name}</strong> sichert sich <strong>${item.name}</strong> für <strong>${price.toLocaleString()}</strong>!${cardQuoteHtml(item)}${cbText}`);
        resetMatrixActiveBid();
    }, reducedMotion() ? 0 : 700);
}

// =====================================================================
// GLÜCKSRAD - Game-Show-Rad
// One click starts the round; every player spins in turn automatically.
// Space / click: skip the current spin or pause.  Esc: play out all remaining spins
// instantly - results still count, nobody loses their turn.
// Odds are unchanged: every segment is equally likely. Only the visual stop
// position inside a segment is staged (near misses next to the jackpot).
// =====================================================================
const WHEEL = { running: false, done: false, values: [], jackpot: 0, order: [], idx: 0, rotation: 0,
                raf: 0, timers: [], inFlight: null, skipSpin: null, skipHold: null, releaseKeys: null };

function spinBonusWheelAll() {
    if (WHEEL.running) return;
    isHighRollerSession = !highRollerTriggered && Math.random() < getConf('roulette', 'highRollerChance');
    if (isHighRollerSession) { highRollerTriggered = true; addLog("Glücksrad: Eskalation – nur fette Beute!", "event"); }
    else addLog("Glücksrad gestartet.", "info");
    openWheelModal();
}

const wheelReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wheelLater = (ms, fn) => { const id = setTimeout(fn, ms); WHEEL.timers.push(id); return id; };
const restartClass = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

function openWheelModal() {
    const modal = $('wheel-modal'); if (!modal || !managers.length) return;
    let vals = isHighRollerSession
        ? [60000, 20000, 100000, 250000, 40000, 250000, 80000]
        : [10000, 40000, 90000, 20000, 70000, 50000, -50000, 30000, 80000, 60000, 100000];
    for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
    WHEEL.timers.forEach(clearTimeout);
    Object.assign(WHEEL, { running: true, done: false, values: vals, jackpot: Math.max(...vals), order: managers.slice(), idx: 0,
                           timers: [], inFlight: null, skipSpin: null, skipHold: null });
    wheelSpinResults = [];

    if ($('gs-title')) $('gs-title').textContent = isHighRollerSession ? '🚨 ESKALATION: FETTE BEUTE!' : '🎡 Glücksrad';
    if ($('gs-subtitle')) $('gs-subtitle').textContent = isHighRollerSession ? 'Alle Nieten raus – heute gibt es nur Gewinne!' : 'Jeder dreht einmal. Viel Glück!';
    if ($('gs-hub')) $('gs-hub').textContent = Config.themeIcon || '🎡';
    if ($('gs-now')) $('gs-now').innerHTML = '';
    if ($('gs-result')) $('gs-result').className = 'gs-result';
    if ($('wheel-close-btn')) $('wheel-close-btn').classList.add('hidden');
    if ($('gs-board')) $('gs-board').innerHTML = WHEEL.order.map((m, i) =>
        `<li id="gs-row-${i}" class="gs-row"><span class="gs-row-name">${m.name}</span><span id="gs-val-${i}" class="gs-row-val">wartet</span></li>`).join('');
    if ($('gs-bulbs')) $('gs-bulbs').innerHTML = Array.from({ length: 28 }, (_, i) => `<i class="gs-bulb" style="--i:${i}; --n:28"></i>`).join('');

    modal.classList.remove('is-spinning', 'is-loss-hit', 'is-jackpot-flash');
    modal.classList.toggle('is-alarm', isHighRollerSession);
    modal.classList.remove('hidden');
    drawGameShowWheel();
    setWheelRotation(WHEEL.rotation);
    WHEEL.releaseKeys?.();
    WHEEL.releaseKeys = trapWheelKeys();

    if (isHighRollerSession) sfx.siren(1700);
    wheelLater(isHighRollerSession ? 2000 : 900, spinNextPlayer);
}

function drawGameShowWheel() {
    const canvas = $('gs-wheel'), ctx = canvas?.getContext?.('2d'); if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const primary = css.getPropertyValue('--clr-primary').trim() || '#f97316';
    const accent = css.getPropertyValue('--clr-accent').trim() || '#facc15';
    const font = css.getPropertyValue('--font-display').trim() || 'sans-serif';
    const vals = WHEEL.values, n = vals.length, size = canvas.width, r = size / 2, seg = (Math.PI * 2) / n;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * seg, v = vals[i], isJackpot = v === WHEEL.jackpot;
        ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r - 16, a0, a0 + seg); ctx.closePath();
        if (isJackpot) {
            const g = ctx.createRadialGradient(r, r, r * 0.15, r, r, r);
            g.addColorStop(0, '#fff3b0'); g.addColorStop(0.55, '#fbbf24'); g.addColorStop(1, '#b45309');
            ctx.fillStyle = g;
        } else ctx.fillStyle = v < 0 ? '#b91c1c' : (i % 2 ? primary : '#1b1b21');
        ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.stroke();

        ctx.save(); ctx.translate(r, r); ctx.rotate(a0 + seg / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const label = (v > 0 ? '+' : '') + Math.round(v / 1000) + 'k';
        ctx.font = `900 ${isJackpot ? 52 : 42}px ${font}`;
        ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeText(label, r - 44, 0);
        ctx.fillStyle = '#fff'; ctx.fillText(label, r - 44, 0);
        ctx.restore();
    }
    ctx.beginPath(); ctx.arc(r, r, r - 8, 0, Math.PI * 2);
    ctx.lineWidth = 16; ctx.strokeStyle = accent; ctx.stroke();
}

function setWheelRotation(deg) { const c = $('gs-wheel'); if (c) c.style.transform = `rotate(${deg}deg)`; }

// which segment sits under the pointer (top) for a given clockwise rotation
function wheelSegmentAt(rot) {
    const n = WHEEL.values.length, a = (((-rot) % 360) + 360) % 360;
    return Math.floor(a / (360 / n)) % n;
}

function spinNextPlayer() {
    WHEEL.skipHold = null;
    if (!WHEEL.running) return;
    if (WHEEL.idx >= WHEEL.order.length) return finishWheelRound();

    const i = WHEEL.idx, m = WHEEL.order[i], vals = WHEEL.values, n = vals.length, segDeg = 360 / n;
    const modal = $('wheel-modal'), reduced = wheelReducedMotion();
    document.querySelectorAll('.gs-row').forEach(row => row.classList.remove('is-active'));
    $(`gs-row-${i}`)?.classList.add('is-active');
    if ($(`gs-val-${i}`)) $(`gs-val-${i}`).textContent = 'dreht …';
    if ($('gs-now')) $('gs-now').innerHTML = `<strong>${m.name}</strong> dreht …`;
    if ($('gs-result')) $('gs-result').className = 'gs-result';

    const target = Math.floor(Math.random() * n), value = vals[target];
    // where inside the segment it stops (only visual). Travel direction: pointer moves from f=1 to f=0.
    const jp = vals.indexOf(WHEEL.jackpot);
    let f = 0.25 + Math.random() * 0.5;
    if (value !== WHEEL.jackpot && target === (jp + 1) % n && Math.random() < 0.6) f = 0.03 + Math.random() * 0.03;     // stops just short
    else if (value !== WHEEL.jackpot && target === (jp - 1 + n) % n && Math.random() < 0.6) f = 0.94 + Math.random() * 0.03; // slid just past
    else if (value === WHEEL.jackpot && Math.random() < 0.5) f = 0.93 + Math.random() * 0.03;                             // barely creeps in

    const duration = reduced ? 900 : Math.max(1000, getConf('roulette', 'spinDurationMs'));
    const turns = reduced ? 1 : 4 + Math.floor(Math.random() * 2);
    const start = WHEEL.rotation, base = start + turns * 360, targetAngle = (target + f) * segDeg;
    const end = base + ((((-targetAngle - base) % 360) + 360) % 360);
    const ease = t => 1 - Math.pow(1 - t, 4);

    WHEEL.inFlight = { i, m, value };
    modal?.classList.add('is-spinning');
    let lastSeg = wheelSegmentAt(start), skipped = false;
    const t0 = performance.now();
    const frame = now => {
        const t = skipped ? 1 : Math.min(1, (now - t0) / duration);
        const rot = start + (end - start) * ease(t);
        setWheelRotation(rot);
        const s = wheelSegmentAt(rot);
        if (s !== lastSeg) { lastSeg = s; if (!skipped) { sfx.tick(); restartClass($('gs-pointer'), 'flap'); } }
        if (t < 1) { WHEEL.raf = requestAnimationFrame(frame); return; }
        WHEEL.rotation = end % 360; setWheelRotation(WHEEL.rotation);
        WHEEL.skipSpin = null;
        modal?.classList.remove('is-spinning');
        landWheelResult();
    };
    WHEEL.skipSpin = () => { skipped = true; };
    WHEEL.raf = requestAnimationFrame(frame);
}

// money + scoreboard only (also used when fast-forwarding)
function settleWheelSpin(i, m, value) {
    const actual = applyBudgetChange(m, value, "wheel"); // perks still apply (perk4 / perk6)
    wheelSpinResults.push({ managerId: m.id, amount: actual });
    addLog(`Glücksrad: ${m.name} ${actual >= 0 ? '+' : ''}${actual.toLocaleString()} ${Config.currency.symbol}`, actual >= 0 ? "buy" : "alert");
    const kind = actual < 0 ? 'is-loss' : value === WHEEL.jackpot ? 'is-jackpot' : 'is-win';
    const row = $(`gs-row-${i}`), cell = $(`gs-val-${i}`);
    if (row) { row.classList.remove('is-active'); row.classList.add(kind); }
    if (cell) cell.textContent = `${actual >= 0 ? '+' : ''}${actual.toLocaleString()} ${Config.currency.symbol}`;
    return { actual, kind };
}

function landWheelResult() {
    const { i, m, value } = WHEEL.inFlight; WHEEL.inFlight = null;
    const { actual, kind } = settleWheelSpin(i, m, value);
    WHEEL.idx = i + 1;

    const res = $('gs-result'), modal = $('wheel-modal');
    if (res) {
        const amount = `${actual >= 0 ? '+' : ''}${actual.toLocaleString()} ${Config.currency.symbol}`;
        res.innerHTML = kind === 'is-jackpot' ? `<small>JACKPOT!</small>${amount}` : amount;
        res.className = `gs-result ${kind}`;
        void res.offsetWidth; res.classList.add('show');
    }
    if ($('gs-now')) $('gs-now').innerHTML = kind === 'is-loss' ? `Autsch, <strong>${m.name}</strong>!` : kind === 'is-jackpot' ? `🎉 <strong>${m.name}</strong> knackt den Jackpot!` : `<strong>${m.name}</strong> kassiert!`;

    if (kind === 'is-loss') { sfx.wahwah(); restartClass(modal, 'is-loss-hit'); }
    else if (kind === 'is-jackpot') {
        sfx.fanfare(); wheelBurst('confetti', 70);
        restartClass(modal, 'is-jackpot-flash'); wheelLater(1800, () => modal?.classList.remove('is-jackpot-flash'));
    } else { sfx.coins(); wheelBurst('coins', Math.min(26, 6 + Math.round(actual / 5000))); }

    const next = () => { clearTimeout(hold); spinNextPlayer(); };
    const hold = wheelLater(kind === 'is-jackpot' ? 2600 : 1800, next);
    WHEEL.skipHold = next;
}

function wheelBurst(kind, count) {
    const fx = $('gs-fx'); if (!fx || wheelReducedMotion()) return;
    const colors = ['var(--clr-primary)', 'var(--clr-accent)', '#ffffff', '#fde047'];
    for (let k = 0; k < count; k++) {
        const s = document.createElement('span');
        s.className = kind === 'coins' ? 'gs-coin' : 'gs-confetti';
        if (kind === 'coins') s.textContent = '🪙'; else s.style.background = colors[k % colors.length];
        s.style.left = Math.random() * 100 + 'vw';
        s.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
        s.style.animationDuration = (1.4 + Math.random() * 1.2).toFixed(2) + 's';
        s.style.setProperty('--drift', Math.round(Math.random() * 160 - 80) + 'px');
        s.style.setProperty('--spin', Math.round(Math.random() * 720 - 360) + 'deg');
        fx.appendChild(s);
        setTimeout(() => s.remove(), 3200);
    }
}

function finishWheelRound() {
    WHEEL.done = true;
    document.querySelectorAll('.gs-row').forEach(row => row.classList.remove('is-active'));
    const best = wheelSpinResults.reduce((a, b) => (b.amount > a.amount ? b : a), wheelSpinResults[0]);
    const bestName = best && managers.find(m => m.id === best.managerId)?.name;
    if ($('gs-now')) $('gs-now').innerHTML = bestName ? `🏆 Größter Gewinn: <strong>${bestName}</strong>` : 'Alle haben gedreht!';
    const btn = $('wheel-close-btn');
    if (btn) { btn.classList.remove('hidden'); btn.focus?.(); }
}

function wheelSkip() {
    if (!WHEEL.running) return;
    if (WHEEL.done) return closeWheelModal();
    if (WHEEL.skipSpin) return WHEEL.skipSpin();
    if (WHEEL.skipHold) return WHEEL.skipHold();
}

// Keys belong to the wheel while it is open (Space must not draw a card behind it)
function trapWheelKeys() {
    const handler = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === 'Escape') closeWheelModal();
        else if (e.key === ' ' || e.key === 'Enter') wheelSkip();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
}

function closeWheelModal() {
    const modal = $('wheel-modal');
    if (WHEEL.running) {
        cancelAnimationFrame(WHEEL.raf); WHEEL.timers.forEach(clearTimeout); WHEEL.timers = [];
        if (WHEEL.inFlight) { const { i, m, value } = WHEEL.inFlight; WHEEL.inFlight = null; settleWheelSpin(i, m, value); WHEEL.idx = i + 1; }
        while (WHEEL.idx < WHEEL.order.length) {
            const v = WHEEL.values[Math.floor(Math.random() * WHEEL.values.length)];
            settleWheelSpin(WHEEL.idx, WHEEL.order[WHEEL.idx], v); WHEEL.idx++;
        }
        Object.assign(WHEEL, { running: false, done: true, skipSpin: null, skipHold: null });
        WHEEL.releaseKeys?.(); WHEEL.releaseKeys = null;
    }
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('is-spinning', 'is-alarm', 'is-loss-hit', 'is-jackpot-flash'); }
    if ($('gs-fx')) $('gs-fx').innerHTML = '';
    renderMatrix();
    updateBuyerDropdown();
    wheelSpinResults.forEach(res => animateBudgetLeftToRight(res.managerId, res.amount));
    wheelSpinResults = [];
    if (afterWheelClosed) { const next = afterWheelClosed; afterWheelClosed = null; setTimeout(next, 500); }
}


function animateBudgetLeftToRight(id, amt) {
    let cell = $(`budget-display-${id}`);
    if (cell) {
        let el = document.createElement('div');
        const pos = amt >= 0;
        el.className = `absolute left-0 right-0 top-2 text-center font-black text-xl pointer-events-none z-[120] whitespace-nowrap animate-fly-left-right ${pos ? 'text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`;
        el.innerText = `${pos ? '+' : ''}${amt.toLocaleString()} ${Config.currency.symbol}`;
        cell.parentElement.appendChild(el);
        setTimeout(() => el.remove(), getConf('roulette','spinDurationMs'));
    }
}

// =====================================================================
// SUCHFUNKTION
// =====================================================================
document.addEventListener('click', function (e) {
    const sIn = $('matrix-manual-search'), sRes = $('matrix-search-results');
    if (sIn && sRes && !sIn.contains(e.target) && !sRes.contains(e.target)) sRes.classList.add('hidden');
});

function handleMatrixSearch(q) {
    const resC = $('matrix-search-results'); if (!resC) return;
    if (!q || q.trim().length < 2) { resC.classList.add('hidden'); return; }
    const lq = q.toLowerCase(); let matches = [];
    for (let cat in itemDatabase) itemDatabase[cat].forEach(item => { if (item.name.toLowerCase().includes(lq) || item.desc.toLowerCase().includes(lq)) matches.push({ ...item, type: cat }); });
    if (matches.length === 0) { resC.innerHTML = '<li class="p-2 text-xs text-stone-500 italic text-center">Nichts gefunden</li>'; resC.classList.remove('hidden'); return; }
    resC.innerHTML = ''; matches.slice(0, 8).forEach(m => { resC.innerHTML += `<li onclick="selectManualMatrixCard('${m.id}', '${m.type}')" class="p-2 border-b border-stone-700/50 hover:bg-stone-700 cursor-pointer transition flex items-center gap-2"><span class="text-base">${m.icon}</span><div class="flex flex-col overflow-hidden"><span class="text-xs font-bold text-white truncate w-full">${m.name}</span><span class="text-xs text-yellow-400 font-bold">ab ${m.cost.toLocaleString()} ${Config.currency.symbol}</span></div></li>`; });
    resC.classList.remove('hidden');
}

function selectManualMatrixCard(id, cat) {
    if (blindDrawsLeft > 0) return;
    selectMatrixAuctionCategory(cat);
    const item = itemDatabase[cat]?.find(x => x.id === id); if (!item) return;
    activeMatrixAuctionItem = { ...item, type: cat };
    if ($('matrix-active-bid-target')) $('matrix-active-bid-target').innerHTML = `${item.name}`;
    if ($('matrix-active-bid-start-price')) $('matrix-active-bid-start-price').innerText = `Kosten: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
    if ($('matrix-active-bid-desc')) $('matrix-active-bid-desc').innerHTML = getDynamicDescHtml(item);
    if ($('matrix-auction-price')) $('matrix-auction-price').value = item.cost;
    if ($('matrix-manual-search')) $('matrix-manual-search').value = '';
    if ($('matrix-search-results')) $('matrix-search-results').classList.add('hidden');
}

// =====================================================================
// ADMIN EDIT MODAL
// =====================================================================
function openEditModal(e, id, cat) {
    e.stopPropagation();
    const item = itemDatabase[cat]?.find(x => x.id === id); if (!item) return;
    if ($('edit-item-id')) $('edit-item-id').value = id;
    if ($('edit-item-cat')) $('edit-item-cat').value = cat;
    if ($('edit-item-dbcat')) {
        let optionsHtml = '';
        for (let cKey in Config.categories) { optionsHtml += `<option value="${cKey}" ${cKey === cat ? 'selected' : ''}>${Config.categories[cKey].icon} ${Config.categories[cKey].name}</option>`; }
        $('edit-item-dbcat').innerHTML = optionsHtml;
    }
    if ($('edit-item-tier')) $('edit-item-tier').value = item.tier;
    if ($('edit-item-price')) $('edit-item-price').value = item.cost;
    if ($('edit-item-score')) $('edit-item-score').value = item.score;
    if ($('edit-modal')) $('edit-modal').classList.remove('hidden');
}

function saveEditItem() {
    const id = $('edit-item-id')?.value, oldCat = $('edit-item-cat')?.value;
    const np = parseInt($('edit-item-price')?.value), ns = parseInt($('edit-item-score')?.value);
    const newCat = $('edit-item-dbcat')?.value, newTier = $('edit-item-tier')?.value;
    if (isNaN(np) || isNaN(ns)) return;
    const idx = itemDatabase[oldCat]?.findIndex(x => x.id === id);
    if (idx !== undefined && idx !== -1) {
        let item = itemDatabase[oldCat][idx]; item.cost = np; item.score = ns;
        if (oldCat !== newCat || item.tier !== newTier) {
            item.tier = newTier; item.dbCategory = newCat; item.type = newCat;
            item.icon = Config.categories[newCat]?.icon || item.icon;
            if (oldCat !== newCat) {
                itemDatabase[oldCat].splice(idx, 1); itemDatabase[newCat].push(item);
                managers.forEach(m => { if (m.team[oldCat.toLowerCase()]?.id === id) { m.team[oldCat.toLowerCase()] = null; if (!m.team[newCat.toLowerCase()]) m.team[newCat.toLowerCase()] = item; } });
            }
        }
        saveDatabases(); renderAdminPool(); if (currentView === 'matrix') renderMatrix(); if (currentView === 'used') renderUsedPool();
    }
    if ($('edit-modal')) $('edit-modal').classList.add('hidden');
}

// =====================================================================
// HILFSFUNKTIONEN & SYSTEMREGELN
// =====================================================================
function renameManager(id, nName) { if (nName.trim() === '') return; const m = managers.find(m => m.id === id); if (m) { m.name = nName; updateBuyerDropdown(); } }
function removePlayerFromMatrix(mgrId, pos) { const m = managers.find(x => x.id === mgrId); if (m && m.team[pos]) returnToPool(m.team[pos].id); }

function checkCategoryCompletion(cat) { 
    if (completedCategoryNames.includes(cat)) return; 
    if (managers.every(m => m.team[cat] !== null)) { 
        completedCategoryNames.push(cat); 
        if (specialEventsRemaining.length > 0) pendingSpecialEvent = true; 
        
        pendingCategoryFinish = cat; // announced once the host has closed the deal popup
    }
}

let pendingCategoryFinish = null;

// Category complete: 3 s look at the board -> wheel -> the highlight jumps to the next category
// (wheel only on every n-th finished category, see settings "roulette.everyNCategories").
// Not after the final category - the game is over and money no longer counts.
let afterWheelClosed = null;
function announceCategoryFinished() {
    const cat = pendingCategoryFinish; pendingCategoryFinish = null;
    if (!cat || isGameEnded) return;
    const key = activeCategories.find(c => c.toLowerCase() === cat.toLowerCase()) || cat.toUpperCase();
    const idx = activeCategories.indexOf(key);
    const open = c => !completedCategoryNames.includes(c.toLowerCase());
    const nextCat = activeCategories.slice(idx + 1).find(open) || activeCategories.find(open);
    const name = Config.categories[key]?.name || key;
    const nextName = nextCat ? (Config.categories[nextCat]?.name || nextCat) : '';
    addLog(`${name} ist komplett vergeben.`, "info");
    // The wheel only comes after every n-th finished category (settings); otherwise jump straight to the next one
    if (completedCategoryNames.length % getConf('roulette', 'everyNCategories') !== 0) {
        if (nextCat) { playCategorySwitch(key, nextCat); addLog(`Wechsel zu ${nextName}.`, "info"); }
        return;
    }
    playBoardPause(key, () => {
        if (nextCat) afterWheelClosed = () => { playCategorySwitch(key, nextCat); addLog(`Wechsel zu ${nextName}.`, "info"); };
        spinBonusWheelAll();
    });
}

// 3 s on the board before the wheel: the finished column lights up card by card, a pill counts down.
// Click / Space / Enter starts the wheel right away. Not shortened for reduced motion (it's a reading pause).
function playBoardPause(key, done) {
    const col = activeCategories.indexOf(key) + 2;
    const s = mountScene('board-pause', `<div class="pause-pill">🎡 Glücksrad in <b>3</b></div>`, done);
    document.querySelectorAll(`#matrix-body td:nth-child(${col}) > div`).forEach((cell, i) => s.at(200 + i * 220, () => {
        cell.classList.remove('col-sweep'); void cell.offsetWidth; cell.classList.add('col-sweep');
    }));
    [2, 1].forEach((n, i) => s.at(1000 * (i + 1), () => { const b = s.el.querySelector('.pause-pill b'); if (b) b.textContent = n; sfx.tick(); }));
    setTimeout(s.finish, 3000);
}

// Chapter card: the board dims for 1.8 s and the next category announces itself. Click / Space / Enter skips.
function playCategorySwitch(fromKey, toKey) {
    const cat = Config.categories[toKey], pos = activeCategories.indexOf(toKey) + 1;
    selectMatrixAuctionCategory(toKey); // board behind the card is already on the new category
    const s = mountScene('chapter-scene', `
        <div class="chapter-card">
            <div class="chapter-kicker">Kapitel ${pos} / ${activeCategories.length}</div>
            <div class="chapter-icon">${cat?.icon || ''}</div>
            <div class="chapter-name">${cat?.name || toKey}</div>
            <div class="chapter-desc">${cat?.desc || ''}</div>
        </div>`);
    sfx.whoosh();
    s.at(450, sfx.chime);
    s.at(1700, () => slideCategoryIn(toKey, fromKey)); // runs into the card's fade-out, so the column is seen arriving
    s.at(1800, s.finish);
}

function forceShowCatalog() { boolForceShowCatalog = true; manualCatalogHide = false; renderAdminPool(); }
function toggleCatalogManually() { if (selectedAuctionItem !== null || manualCatalogHide) { boolForceShowCatalog = true; manualCatalogHide = false; } else { manualCatalogHide = true; boolForceShowCatalog = false; } renderAdminPool(); }

// =====================================================================
// ENDGAME
// =====================================================================
function checkEndgame() {
    let allFull = true;
    for (let m of managers) {
        for (let cat of activeCategories) { if (!m.team[cat.toLowerCase()]) { allFull = false; break; } }
        if (!allFull) break;
    }
    if (allFull && !isGameEnded) { isGameEnded = true; setTimeout(() => triggerEndgame(), 1500); }
}

function triggerEndgame() {
    managers.forEach(m => {
        let basePoints = 0; m.loserBonusText = "";
        for (let cat in m.team) {
            let p = m.team[cat];
            if (p) {
                let pScore = p.score || 0;
                if (m.perk === 'perk1' && m.protegeCats && m.protegeCats.includes(cat)) pScore = Math.floor(pScore * getConf('perks','perk1_protegeMultiplier'));
                if (m.perk === 'perk3' && p.tier === 'schlecht') pScore = Math.floor(pScore * getConf('perks','perk3_badTierMultiplier'));
                if (m.perk === 'perk8') pScore += getConf('perks','perk8_flatScoreBonus');
                basePoints += pScore;
            }
        }
        m.totalPoints = basePoints;
        if (m.perk === 'perk2') { let rendite = Math.floor(m.budget / getConf('perks','perk2_interestDivisor')) * getConf('perks','perk2_interestMultiplier'); m.totalPoints += rendite; if (rendite > 0) m.loserBonusText += `+${rendite} (Spar-Bonus)`; }
    });
    managers.sort((a, b) => b.totalPoints - a.totalPoints);
    const podium = $('endgame-podium'); if (!podium) return; podium.innerHTML = '';
    managers.forEach((m, i) => {
        let c = ['text-yellow-400', 'text-stone-300', 'text-orange-400', 'text-stone-500', 'text-stone-600', 'text-stone-700'];
        let t = i === 0 ? "🏆 1. Platz" : i === 1 ? "🥈 2. Platz" : i === 2 ? "🥉 3. Platz" : `${i + 1}. Platz`;
        let loserHtml = m.loserBonusText ? `<div class="text-xs text-pink-400 font-bold uppercase mt-1 animate-pulse">🎁 ${m.loserBonusText}</div>` : '';
        podium.innerHTML += `<div class="bg-black/50 border border-stone-700 p-4 rounded-xl flex justify-between items-center mb-2 ${i === 0 ? 'bg-yellow-900/20 border-yellow-500/50' : ''}"><div><div class="${c[i]} font-black text-sm uppercase tracking-wider">${t}</div><div class="text-white font-bold text-lg">${m.name}</div><div class="text-xs text-stone-500">Vorrat: ${m.budget.toLocaleString()} ${Config.currency.symbol}</div>${loserHtml}</div><div class="text-3xl font-black ${c[i]}">${m.totalPoints} <span class="text-xs text-stone-400">Pkt.</span></div></div>`;
    });
    if ($('endgame-modal')) $('endgame-modal').classList.remove('hidden');
    fireConfetti();
}

function fireConfetti() {
    const cont = $('confetti-container'); if (!cont) return;
    const cols = ['#eab308', '#22c55e', '#ef4444', '#f97316'];
    for (let i = 0; i < getConf('ui','confettiCount'); i++) { let c = document.createElement('div'); c.className = 'confetti-piece'; c.style.left = Math.random() * 100 + 'vw'; c.style.backgroundColor = cols[Math.floor(Math.random() * cols.length)]; c.style.animationDuration = (Math.random() * 3 + 2) + 's'; c.style.animationDelay = (Math.random() * 2) + 's'; cont.appendChild(c); }
}

// =====================================================================
// KEYBOARD SHORTCUTS
// =====================================================================
document.addEventListener('keydown', function (e) {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
    if (e.key === 'Escape') {
        const modals = ['shortcuts-modal', 'custom-modal', 'confirm-modal', 'edit-modal', 'category-modal', 'block-modal', 'gamble-modal', 'blind-modal', 'dutch-modal', 'wheel-modal', 'perks-modal', 'gamble-choice-modal', 'perk-catalog-modal', 'joker-phase-modal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) {
                if (id === 'confirm-modal') closeConfirmModal();
                else if (id === 'custom-modal') closeModal();
                else if (id === 'gamble-choice-modal') cancelGambleChoice();
                else if (id === 'dutch-modal') { clearInterval(dutchInterval); el.classList.add('hidden'); }
                else if (id === 'wheel-modal') { closeWheelModal(); }
                else el.classList.add('hidden');
            }
        });
        if (isInput) e.target.blur(); return;
    }
    if (e.key === 'Enter') {
        if ($('perks-modal') && !$('perks-modal').classList.contains('hidden')) { applyPerksAndStart(); return; }
        if ($('confirm-modal') && !$('confirm-modal').classList.contains('hidden')) { if ($('confirm-yes-btn')) $('confirm-yes-btn').click(); return; }
        if ($('custom-modal') && !$('custom-modal').classList.contains('hidden')) { closeModal(); return; }
        if ($('block-modal') && !$('block-modal').classList.contains('hidden')) { if ($('block-confirm-btn')) $('block-confirm-btn').click(); return; }
        if ($('gamble-modal') && !$('gamble-modal').classList.contains('hidden')) { if ($('gamble-confirm-btn')) $('gamble-confirm-btn').click(); return; }
        if ($('blind-modal') && !$('blind-modal').classList.contains('hidden')) { if ($('blind-confirm-btn')) $('blind-confirm-btn').click(); return; }
        if ($('category-modal') && !$('category-modal').classList.contains('hidden')) { saveCategories(); return; }
        if ($('joker-phase-modal') && !$('joker-phase-modal').classList.contains('hidden')) { closeJokerPhase(); return; }
        if (!isInput) {
            if (currentView === 'matrix' && activeMatrixAuctionItem) executeMatrixAuction();
            else if (currentView === 'admin' && selectedAuctionItem) executeAuction();
        }
        return;
    }
    if (isInput) return;
    const keyLower = e.key.toLowerCase();
    if (keyLower === 'm') { switchView('matrix'); return; }
    if (keyLower === 'a') { switchView('admin'); return; }
    if (keyLower === 'u') { switchView('used'); return; }
    if (keyLower === 's') { switchView('shredded'); return; }
    if (keyLower === 'g') { spinBonusWheelAll(); return; }
    if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const selectId = currentView === 'matrix' ? 'matrix-auction-buyer' : 'auction-buyer';
        const selectEl = $(selectId);
        if (selectEl && managers.find(x => x.id == e.key)) selectEl.value = e.key;
        return;
    }
    if (currentView === 'matrix') {
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); drawMatrixRandomPlayer(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); let inp = $('matrix-auction-price'); if (inp) inp.value = (parseInt(inp.value) || 0) + (Config.currency?.step || 5000); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); let inp = $('matrix-auction-price'); if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) - (Config.currency?.step || 5000)); }
        else if (keyLower === 'z') { if ($('btn-undo-purchase') && !$('btn-undo-purchase').classList.contains('hidden')) undoLastPurchase(); }
        else if (keyLower === 'f') { e.preventDefault(); if ($('matrix-manual-search')) $('matrix-manual-search').focus(); }
    } else if (currentView === 'admin') {
        if (e.key === 'ArrowUp') { e.preventDefault(); let inp = $('auction-price'); if (inp) inp.value = (parseInt(inp.value) || 0) + (Config.currency?.step || 5000); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); let inp = $('auction-price'); if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) - (Config.currency?.step || 5000)); }
    }
});

// =====================================================================
// PANEL TOGGLE
// =====================================================================
let rightPanelCollapsed = false;

function toggleRightPanel() {
    rightPanelCollapsed = !rightPanelCollapsed;
    const panel = $('right-panel');
    const icon  = $('panel-toggle-icon');
    if (!panel || !icon) return;
    panel.classList.toggle('panel-collapsed', rightPanelCollapsed);
    icon.classList.toggle('fa-chevron-right', !rightPanelCollapsed);
    icon.classList.toggle('fa-chevron-left',   rightPanelCollapsed);
}
