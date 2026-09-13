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
        initGame(getConf('economy','defaultPlayerCount'), Config.currency.startAmount);
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
    if ($('input-start-budget')) $('input-start-budget').value = Config.currency.startAmount;

    const jLegend = $('joker-legend');
    if (jLegend && Config.terminology.jokers) {
        const colorMap = { block: 'red', bonus: 'green', autoBuy: 'purple', gamble: 'orange', skip: 'cyan' };
        const descMap = {
            block: `Mitspieler für eine Runde sperren.`,
            bonus: `${Config.currency.symbol}-Cashback beim nächsten Kauf.`,
            autoBuy: `Blind-Kauf (erzwingen) für 1,5x Preis.`,
            gamble: `Alte Karte gegen neue umtauschen.`,
            skip: `Gezogene Karte sofort vernichten.`
        };
let html = '<div class="flex flex-col gap-1.5 w-full">';
        for (let key in Config.terminology.jokers) {
            const j = Config.terminology.jokers[key];
            const c = j.color || colorMap[key] || 'stone';
            html += `
            <div class="flex items-center gap-3 w-full bg-black/20 p-2 rounded-lg border border-stone-800 hover:border-stone-600 transition-colors">
                <div class="flex items-center justify-center w-7 h-7 rounded bg-${c}-950/40 text-${c}-400 border border-${c}-900/50 shrink-0 text-sm">
                    ${j.icon}
                </div>
                <div class="flex flex-col">
                    <span class="text-${c}-400 font-black text-[10px] uppercase tracking-wider leading-none mb-1">${j.label}</span>
                    <span class="text-stone-400 text-[10px] leading-none">${descMap[key] || ''}</span>
                </div>
            </div>`;
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
            jokers: { block: 1, bonus: 1, autoBuy: 1, gamble: 1, skip: 1 },
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
        GameSettings.economy.defaultPlayerCount.value = v;
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
    let selectHtml = `<select onchange="promptRestart(parseInt(this.value))" class="bg-[#1c1917] border border-stone-600 text-white text-[11px] rounded p-1 w-14 outline-none text-center font-bold focus:border-orange-500 cursor-pointer transition-colors">`;
    
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
    li.innerHTML = `<span class="text-stone-600 text-[8px] mr-1">[${time}]</span> ${iconHtml} ${msg}`;
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
    if (len > 150) sizeClass = "text-[10px] leading-tight";      // Extrem lang
    else if (len > 100) sizeClass = "text-[11px] leading-tight"; // Sehr lang
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
    let evCls = "px-4 py-2 rounded-lg text-xs font-bold bg-[#1c1917] text-stone-400 hover:text-white border border-stone-700 transition-all-custom";
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
    if (savedDB) { itemDatabase = JSON.parse(savedDB); updateGlobalIdCounter(); return true; }

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

function renderMatrix() {
    const thead = $('matrix-header-row'); const tbody = $('matrix-body');
    if (!thead || !tbody) return;

    let hHtml = `<th class="py-3 px-4 w-[15%] bg-[#292524] shadow-sm">${Config.terminology.playerSingular}</th>`;
    const colorSet = ['text-red-400', 'text-orange-400', 'text-purple-400', 'text-rose-400', 'text-yellow-400', 'text-green-400', 'text-cyan-400'];
activeCategories.forEach((cat, idx) => {
        let cData = Config.categories[cat];
        let isActive = (cat === activeMatrixAuctionCategory);
        
        let btnClass = isActive 
            ? "matrix-cat-btn w-full h-full bg-[#1c1917] text-orange-400 text-[10px] font-black py-2 border-b-2 border-orange-500 transition-colors" 
            : "matrix-cat-btn w-full h-full bg-transparent hover:bg-[#292524] text-stone-400 text-[10px] font-bold py-2 border-b-2 border-transparent transition-colors";
        
        // Hinweis: p-0 im <th> sorgt dafür, dass der Button 100% der Zelle ausfüllt
        hHtml += `<th title="${cData.desc}" class="p-0 text-center border-l border-stone-700/50 w-[10%] bg-[#292524] shadow-sm align-middle h-full">
                    <button onclick="selectMatrixAuctionCategory('${cat}', this)" class="${btnClass}"><span class="block text-base leading-none">${cData.icon}</span><span class="block text-[8px] leading-tight mt-1">${cData.name}</span></button>
                  </th>`;
    });

    thead.innerHTML = hHtml;
    tbody.innerHTML = '';

    managers.forEach(m => {
        const isBlk = m.id === blockedPlayerId;
let jokersHtml = `<div class="flex w-full justify-between items-center mt-1.5">`;
const fnMap = { block: 'useBlockJoker', bonus: 'useBonusJoker', autoBuy: 'useAutoBuyJoker', gamble: 'useGambleJoker', skip: 'useSkipJoker' };
for (let jKey in Config.terminology.jokers) {
    if (m.jokers[jKey] > 0) { 
        let jData = Config.terminology.jokers[jKey];
        let countLabel = m.jokers[jKey] > 1 ? `<span class="absolute -top-1.5 -right-1.5 bg-black text-white text-[7px] px-1 rounded-full border border-stone-600">${m.jokers[jKey]}</span>` : '';
        let c = jData.color || 'stone';
        // RAND ENTFERNT: 'border border-stone-700 hover:border-${c}-500' wurde hier gelöscht
        const roundLocked = (jKey === 'block' && jokerPhaseState.blockUsed) || (jKey === 'autoBuy' && jokerPhaseState.autoBuyUsed);
        let cls = `relative w-6 h-6 flex justify-center items-center rounded bg-transparent text-stone-500 hover:text-${c}-400 hover:bg-[#292524] transition-all${roundLocked ? ' opacity-30 cursor-not-allowed' : ''}`;
        jokersHtml += `<button onclick="${fnMap[jKey]}(${m.id})" title="${jData.label}${roundLocked ? ' – diese Runde schon gespielt' : ''}" class="${cls}">${jData.icon}${countLabel}</button>`;
    }
}
jokersHtml += `</div>`;  

        let slots = activeCategories.map(k => renderSlotCell(m.id, k.toLowerCase(), m.team[k.toLowerCase()])).join('');
        let blkOverlay = isBlk ? `<div class="blocked-badge text-[10px] font-black text-white bg-red-600 inline-block px-1.5 py-0.5 rounded mb-1 shadow-md">🔒 GESPERRT</div>` : '';
        let cbBadge = m.cashbackActive ? `<div class="shield-badge text-[9px] text-yellow-400 font-bold bg-yellow-950/40 px-1.5 py-0.5 rounded border border-yellow-600 mt-1 inline-block" title="Schützt bis zum nächsten Kauf">🛡️ Bonus aktiv</div>` : '';
        let perkBadge = m.perk !== 'NONE' ? `<div class="text-[9px] font-bold text-indigo-400 bg-indigo-950/30 px-1 py-0.5 
" title="${Config.perks[m.perk]?.desc || ''}">${Config.perks[m.perk]?.name || m.perk}</div>` : '';

        let bp = 0;
        for (let cat in m.team) {
            if (m.team[cat]) {
                let s = m.team[cat].score || 0;
                if (m.perk === 'perk1' && m.protegeCats && m.protegeCats.includes(cat)) s = Math.floor(s * getConf('perks','perk1_protegeMultiplier'));
                if (m.perk === 'perk3' && m.team[cat].tier === 'schlecht') s = Math.floor(s * getConf('perks','perk3_badTierMultiplier'));
                if (m.perk === 'perk8') s += getConf('perks','perk8_flatScoreBonus');
                bp += s;
            }
        }
        let isLow = m.budget < (startingBudget * 0.15);
        let textColor = isLow ? 'text-red-500' : 'text-orange-400';
        let barColor = isLow ? 'bg-red-500' : 'bg-orange-500';
        let p = Math.max(0, Math.min(100, (m.budget / startingBudget) * 100));

tbody.innerHTML += `
            <tr class="${isBlk ? 'row-blocked bg-red-950/40 border-l-4 border-red-500 grayscale transition opacity-80' : 'hover:bg-[#1c1917]/30 transition'}${m.cashbackActive ? ' row-shielded' : ''}">
                <td class="py-4 px-3 border-r border-stone-700/80 align-top">
    <div class="flex flex-col gap-1 w-full">
        ${blkOverlay}
        <div class="flex items-center justify-between gap-2 pb-0.5">
            ${(() => { const pos = playerJokerOrder.indexOf(m.id) + 1; return pos ? `<span class="joker-order${pos === 1 ? ' is-next' : ''}" title="Joker-Reihenfolge: Platz ${pos}">${pos}</span>` : ''; })()}
            <input type="text" value="${m.name}" onchange="renameManager(${m.id}, this.value)" class="bg-transparent text-sm font-black text-white focus:outline-none w-full">
            
            <span class="text-xs font-black text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded whitespace-nowrap cursor-help shadow-sm" title="Punkte">
                <i class="fa-solid fa-star text-[9px] mr-0.5"></i>${bp}
            </span>
        </div>
        ${perkBadge}${cbBadge}${jokersHtml}
        
        <div class="relative mt-1.5 w-full bg-black/20 px-1.5 py-1 rounded border border-stone-700/30 flex items-center gap-2">
            <span id="budget-display-${m.id}" class="text-[10px] font-black ${textColor}${isLow ? ' budget-low' : ''} transition-colors whitespace-nowrap">
                ${m.budget.toLocaleString()} ${Config.currency.symbol}
            </span>
            <div class="flex-1 bg-amber-800 rounded-full h-1.5 overflow-hidden border border-stone-700">
                <div class="${barColor} h-1.5 rounded-full transition-all duration-500" style="width: ${p}%"></div>
            </div>
        </div>
    </div>
</td>

                ${slots}
            </tr>`;
});
}
function renderSlotCell(mId, k, pObj) {
    let m = managers.find(x => x.id === mId);
    let isProtege = (m && m.protegeCats && m.protegeCats.includes(k));
   let specialBorderClass = isProtege
    ? 'bg-yellow-950/20 shadow-[inset_0_0_0_2px_rgba(234,179,8,0.55),_0_0_14px_rgba(234,179,8,0.2)]'
    : '--';
  if (!pObj) {
    const emptyHighlight = isProtege ? 'bg-yellow-950/20 shadow-[inset_0_0_0_2px_rgba(234,179,8,0.3)] rounded-lg' : '';
    return `<td class="py-2 px-1 text-center border-l border-stone-700/40"><div class="h-[80px] ${emptyHighlight}"></div></td>`;
}
    let bb = pObj.tier === 'gut' ? 'border-b-yellow-400' : pObj.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
    let displayScore = pObj.score || 0; let isBoosted = false;
    if (m) {
        if (m.perk === 'perk1' && isProtege) { displayScore = Math.floor(displayScore * getConf('perks','perk1_protegeMultiplier')); isBoosted = true; }
        if (m.perk === 'perk3' && pObj.tier === 'schlecht') { displayScore = Math.floor(displayScore * getConf('perks','perk3_badTierMultiplier')); isBoosted = true; }
        if (m.perk === 'perk8') { displayScore += getConf('perks','perk8_flatScoreBonus'); isBoosted = true; }
    }

    let scoreHtml = isBoosted ? `<i class="fa-solid fa-arrow-trend-up text-[6px] text-yellow-400"></i> <span class="text-yellow-400 font-black animate-pulse">${displayScore}</span>` : `<i class="fa-solid fa-star text-[6px] text-lime-400"></i> ${displayScore}`;

    return `<td class="py-2 px-0.5 text-center border-l border-stone-700/40 relative group/cell"><div onclick="removePlayerFromMatrix(${mId}, '${k}')" class="group/card relative cursor-pointer bg-black/60 hover:bg-red-950/30 hover:border-red-900 rounded-lg p-1 transition flex flex-col items-center justify-center h-[115px] border-b-[4px] ${bb} ${specialBorderClass}"><div class="absolute top-0 right-0 bg-orange-900/80 text-white text-[8px] font-bold px-1 py-0.5 rounded-bl shadow z-10">${scoreHtml}</div><span class="text-2xl mb-1 group-hover/card:hidden">${pObj.icon}</span><span class="text-2xl mb-1 hidden group-hover/card:inline text-red-500"><i class="fa-solid fa-toilet"></i></span><span class="text-[9px] font-bold text-white leading-tight w-full px-0.5 line-clamp-2 group-hover/card:text-red-400">${pObj.name}</span></div><div class="absolute top-[90px] left-1/2 transform -translate-x-1/2 w-56 bg-stone-800 border-2 border-stone-600 text-stone-200 p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover/cell:opacity-100 group-hover/cell:visible transition-all duration-200 z-[100] pointer-events-none flex flex-col items-start text-left"><div class="font-black text-white text-sm mb-1 leading-tight">${pObj.name}</div><div class="text-[11px] italic leading-snug text-stone-400 mb-2">${pObj.desc}</div><div class="mt-auto text-amber-400 font-bold text-xs w-full text-right">${pObj.cost.toLocaleString()} ${Config.currency.symbol}</div></div></td>`;
}

function renderAdminPool() {
    const cont = $('catalog-container'), hide = $('catalog-hidden-placeholder');
    const shouldHide = (selectedAuctionItem !== null || manualCatalogHide) && !boolForceShowCatalog && !isShredderMode;
    if (cont && hide) {
        if (shouldHide) {
            cont.classList.add('hidden'); hide.classList.remove('hidden');
            const m = $('manual-catalog-toggle'); if (m) { m.innerText = "Einblenden"; m.className = "flex-1 w-full bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold py-1 px-1.5 rounded transition shadow-md border border-orange-500"; }
        } else {
            cont.classList.remove('hidden'); hide.classList.add('hidden');
            const m = $('manual-catalog-toggle'); if (m) { m.innerText = "Verbergen"; m.className = "flex-1 w-full bg-[#292524] hover:bg-stone-700 text-stone-300 text-[10px] font-bold py-1 px-1.5 rounded transition border border-stone-600"; }
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
        let cls = isShredderMode ? (isSel ? 'border-2 border-red-500 bg-red-950/40 scale-[0.98]' : 'border border-stone-700 bg-[#292524] opacity-70') : (selectedAuctionItem?.id === item.id ? 'border-2 border-orange-400 bg-orange-950/20' : 'border border-stone-700 bg-[#292524] hover:border-stone-500');
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        let ca = isShredderMode ? `toggleShredderSelection('${item.id}')` : `selectAuctionItem('${item.id}')`;
        let overlay = (isShredderMode && isSel) ? `<div class="absolute inset-0 bg-red-900/20 flex items-center justify-center rounded-lg pointer-events-none"><i class="fa-solid fa-toilet text-3xl text-red-500 opacity-60 animate-pulse"></i></div>` : '';
        let div = item.tier === 'gut' ? 'pool-gut' : item.tier === 'mittel' ? 'pool-mittel' : 'pool-schlecht';
        if ($(div)) $(div).innerHTML += `<div onclick="${ca}" class="p-2 rounded-lg cursor-pointer transition-all-custom flex flex-col justify-between min-h-[50px] ${cls} border-b-[3px] ${bb} overflow-hidden relative">${overlay}<div class="relative z-10"><div class="flex justify-between items-center gap-1.5 mb-1"><div class="flex items-center gap-1.5 min-w-0"><span class="text-sm flex-shrink-0">${item.icon}</span><h4 class="font-bold text-white text-[11px] truncate leading-none" title="${item.name}">${item.name}</h4></div><div class="flex items-center gap-1 flex-shrink-0"><span class="text-[8px] bg-stone-900 text-stone-300 px-1 py-0.5 rounded font-bold">${item.cost >= 1000 ? item.cost / 1000 + 'k' : item.cost}</span><div class="text-[8px] text-lime-400 font-bold px-1 py-0.5 rounded bg-green-950/20 border border-green-900/30"><i class="fa-solid fa-star text-[6px]"></i> ${item.score}</div><button onclick="openEditModal(event, '${item.id}', '${adminCategory}')" class="text-stone-400 hover:text-white transition bg-stone-800 rounded px-1.5 py-0.5 border border-stone-600 shadow z-[50]" title="Bearbeiten"><i class="fa-solid fa-pen text-[7px]"></i></button></div></div><p class="text-[9px] text-stone-400 italic leading-tight line-clamp-1">${item.adminDesc || item.desc}</p></div></div>`;
    });
}

function renderEventsPool() {
    const container = $('events-container'); if (!container) return; container.innerHTML = '';
    if (Config.events) Config.events.forEach(ev => {
        container.innerHTML += `<div class="bg-stone-800 border border-stone-700 rounded-lg p-4 shadow flex flex-col gap-2 relative overflow-hidden group"><div class="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition"></div><h4 class="text-sm font-black text-yellow-400 leading-tight">${ev.title}</h4><p class="text-xs text-stone-300 italic">${ev.desc}</p></div>`;
    });
}

function renderUsedPool() {
    const c = $('used-container'); if (!c) return; c.innerHTML = '';
    if (usedDatabase.length === 0) { c.innerHTML = '<div class="col-span-full text-stone-500 text-sm italic py-6 text-center">Noch keine Ware gesichert.</div>'; return; }
    usedDatabase.forEach(item => {
        let owner = item.owner || "Unbekannt";
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        c.innerHTML += `<div class="p-3 rounded-lg border border-stone-700 bg-[#292524] flex flex-col justify-between min-h-[60px] border-b-[4px] ${bb}"><div><div class="flex justify-between items-start mb-2"><span class="text-xl">${item.icon}</span><div class="text-[8px] text-amber-400 font-bold bg-amber-950/40 px-1 py-0.5 rounded border border-green-900/50"><i class="fa-solid fa-star text-[7px] text-green-500"></i> ${item.score} Pkt.</div></div><h4 class="font-bold text-white text-xs truncate" title="${item.name}">${item.name}</h4><div class="text-[10px] text-stone-400 mt-1">Gesichert von: <strong class="text-orange-400">${owner}</strong></div></div><button onclick="returnToPool('${item.id}')" class="mt-3 w-full bg-[#1c1917] hover:bg-red-900/40 text-stone-400 hover:text-white text-[10px] font-bold py-1.5 rounded transition border border-stone-600 hover:border-red-900"><i class="fa-solid fa-rotate-left mr-1"></i> Entfernen</button></div>`;
    });
}

function renderShreddedPool() {
    const c = $('shredded-container'); if (!c) return; c.innerHTML = '';
    if (shreddedDatabase.length === 0) { c.innerHTML = '<div class="col-span-full text-stone-500 text-sm italic py-6 text-center">Klo ist leer.</div>'; return; }
    shreddedDatabase.forEach(item => {
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        c.innerHTML += `<div class="p-3 rounded-lg border border-red-900/30 bg-[#292524] flex flex-col justify-between min-h-[60px] border-b-[4px] ${bb} opacity-70 hover:opacity-100 transition"><div><span class="text-xl grayscale">${item.icon}</span><h4 class="font-bold text-stone-300 text-xs truncate line-through mt-1" title="${item.name}">${item.name}</h4></div><button onclick="restoreFromShredder('${item.id}')" class="mt-3 w-full bg-stone-800 text-stone-300 hover:text-white text-[10px] font-bold py-1.5 rounded transition border border-stone-600">Zurückholen</button></div>`;
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
            <select id="perk-select-${m.id}" onchange="updatePerkDesc(${m.id})" class="w-full bg-[#1c1917] border border-stone-500 text-white rounded p-2 text-xs outline-none font-bold shadow-inner">${opts}</select>
            <p class="text-[10px] text-stone-300 mt-2 italic leading-snug" id="perk-desc-${m.id}">${Config.perks[assigned].desc}</p>
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
        container.innerHTML += `<div class="bg-stone-800 border border-orange-500/30 p-4 rounded-xl shadow-inner"><div class="text-lg font-black text-orange-400 mb-2">${p.name}</div><div class="text-xs text-stone-300 leading-relaxed">${p.desc}</div></div>`;
    });
    if ($('perk-catalog-modal')) $('perk-catalog-modal').classList.remove('hidden');
}

function closePerkCatalog() { if ($('perk-catalog-modal')) $('perk-catalog-modal').classList.add('hidden'); }

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
    document.querySelectorAll('.matrix-cat-btn').forEach(b => b.className = "matrix-cat-btn w-full h-full bg-transparent hover:bg-[#292524] text-stone-400 text-[10px] font-bold py-2 border-b-2 border-transparent transition-colors");
    
    if (!btn) document.querySelectorAll('.matrix-cat-btn').forEach(b => { if (b.getAttribute('onclick')?.includes(`'${cat}'`)) btn = b; });
    
    // Den geklickten Button auf "Aktiv" setzen
    if (btn) btn.className = "matrix-cat-btn w-full h-full bg-[#1c1917] text-orange-400 text-[10px] font-black py-2 border-b-2 border-orange-500 transition-colors";
    
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
    if (input) input.value = (parseInt(input.value) || 0) + amount;
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
    playDrawAnimation(item, () => { if (typeof openCardExpand === 'function') openCardExpand(); });
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
    playAuctionAnimation(price, activeMatrixAuctionItem, m);
    showModal((Config.auctionAnimation?.dealConfirmTitle) || "🚨 DEAL PERFEKT!", `<strong>${activeMatrixAuctionItem.name}</strong> geht für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong> an <strong>${m.name}</strong>!${cardQuoteHtml(activeMatrixAuctionItem)}${sapMsg}${cbText}`);
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
    playAuctionAnimation(price, selectedAuctionItem, m);
    showModal((Config.auctionAnimation?.dealConfirmTitle) || "🚨 DEAL PERFEKT!", `<strong>${selectedAuctionItem.name}</strong> geht für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong> an <strong>${m.name}</strong>!${cardQuoteHtml(selectedAuctionItem)}${cbText}`);
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
    manager.team[cat.toLowerCase()] = { ...item, type: cat };
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
// LETZTE KARTE: last open slot gets the next hand card automatically.
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
    if (m.budget >= item.cost) {
        activeCategoryDeck.shift();
        const cbText = processPurchase(m, item.cost, item, key);
        playAuctionAnimation(item.cost, item, m, { lastCard: true });
        showModal("🎯 LETZTE KARTE", `Niemand bietet mehr mit: <strong>${m.name}</strong> bekommt automatisch <strong>${item.name}</strong> zum Mindestpreis von <strong>${item.cost.toLocaleString()} ${Config.currency.symbol}</strong>.${cardQuoteHtml(item)}${cbText}`);
        return resetMatrixActiveBid();
    }
    addLog(`Pleite: ${m.name} kann ${item.name} (${item.cost.toLocaleString()}) nicht bezahlen.`, "alert");
    playSpotlightOfShame(m, item, () => {
        givePenaltyCard(m, key, true);
        setTimeout(runNextQueuedStep, 900); // no popup on this path, so continue once the card has dropped in
    });
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
    flush() { // roaring water dropping in pitch, then gurgles
        sfx.noise(1.5, 'lowpass', 2400, 180, 0.6);
        const ctx = audioCtx(); if (!ctx) return;
        for (let k = 0; k < 7; k++) {
            const t = ctx.currentTime + 0.7 + k * 0.13 + Math.random() * 0.05, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(180 + Math.random() * 160, t); o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 300, t + 0.07);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.1);
        }
    },
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
    const stamp = opts.lastCard ? '🎯 LETZTE KARTE' : (Config.auctionAnimation?.dealConfirmTitle || '🔨 VERKAUFT!');
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
    at(900,  () => strike(opts.lastCard ? 'Niemand bietet mit …' : 'Zum Ersten …', 0.55));
    at(1700, () => strike(opts.lastCard ? 'Letzte Chance …' : 'Zum Zweiten …', 0.75));
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
        <div class="auction-skip">Klick, Leertaste oder Enter zum Überspringen</div>`, onDone);
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
    s.at(600, () => { s.el.classList.add('is-flipped'); sfx.flip(); });
    s.at(2300, s.finish);
}

// Sale: the card flies from the stage into the buyer's slot, backed by its tier colour; the budget counts down meanwhile.
function flyCardToSlot(item, m, price = 0) {
    if (typeof closeCardExpand === 'function') closeCardExpand();
    if (!item || !m || reducedMotion()) return;
    const el = document.createElement('div');
    el.className = 'fx-scene fly-card' + (item.unicorn ? ' is-unicorn' : '');
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
            end();
        };
    });
}

function countBudget(m, price) { // odometer from the old to the new budget
    const el = $(`budget-display-${m.id}`); if (!el || !price) return;
    const to = m.budget, from = to + price, t0 = performance.now(), sym = Config.currency.symbol;
    const tick = now => {
        const t = Math.min(1, (now - t0) / 900);
        el.textContent = `${Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))).toLocaleString()} ${sym}`;
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

function playFlushScene(item, onDone) { // Stornierung
    const s = mountScene('flush-scene', `
        <div class="flush-bowl"><div class="flush-vortex"></div><div class="flush-card"><span>${item.icon || '🂠'}</span>${item.name}</div></div>
        <div class="flush-label">🚽 WEGGESPÜLT</div>`, onDone);
    sfx.flush();
    s.at(1900, s.finish);
}

function playSwapScene(m, oldCard, newCard) { // Umbuchung: old card out, new card in, then into the slot
    const face = (c, cls) => `<div class="swap-card ${cls}" style="--tier:${TIER_COLOR[c.tier] || TIER_COLOR.mittel}"><span>${c.icon || '🂠'}</span>${c.name}</div>`;
    const label = Config.terminology?.jokers?.gamble?.label || 'Umtausch';
    const s = mountScene('swap-scene', `
        <div class="swap-title">${m.name}: ${label}</div>
        <div class="swap-stage">${face(oldCard, 'is-old')}<div class="swap-arrow">🔄</div>${face(newCard, 'is-new')}</div>`,
        () => flyCardToSlot(newCard, m));
    sfx.whoosh(); s.at(900, sfx.flip);
    s.at(2400, s.finish);
}

// Blind-Deal: guesses one by one, the real value, distance bars, spotlight on the closest guess.
function playBlindReveal(drawn, guesses, winner, onDone) {
    const sym = Config.currency.symbol;
    const maxDiff = Math.max(1, ...guesses.map(g => Math.abs(g.guess - drawn.cost)));
    const rows = guesses.map(g => {
        const diff = Math.abs(g.guess - drawn.cost);
        return `<div class="blind-row${g.mgr === winner ? ' is-winner' : ''}"><span class="blind-who">${g.mgr.name}</span><span class="blind-guess">${g.guess.toLocaleString()} ${sym}</span><span class="blind-track"><i style="--w:${Math.max(3, diff / maxDiff * 100)}%"></i></span><span class="blind-diff">± ${diff.toLocaleString()}</span></div>`;
    }).join('');
    const s = mountScene('blind-scene', `
        <div class="blind-panel">
            <div class="blind-head">🙈 Aufgedeckt</div>
            <div class="blind-card"><span>${drawn.icon || '🂠'}</span><b>${drawn.name}</b><div class="blind-value">Wahrer Wert: <strong>??? ${sym}</strong></div></div>
            <div class="blind-rows">${rows}</div>
        </div>
        <div class="auction-skip">Klick, Leertaste oder Enter zum Überspringen</div>`, onDone);
    s.el.querySelectorAll('.blind-row').forEach((row, i) => s.at(500 + i * 600, () => { row.classList.add('is-in'); sfx.tick(); }));
    const tReal = 700 + guesses.length * 600;
    s.at(tReal, () => sfx.drumroll(900));
    s.at(tReal + 950, () => {
        const v = s.el.querySelector('.blind-value strong'); if (v) v.textContent = `${drawn.cost.toLocaleString()} ${sym}`;
        s.el.classList.add('is-measured'); sfx.hit();
    });
    s.at(tReal + 2100, () => { s.el.classList.add('is-decided'); sfx.fanfare(); });
    s.at(tReal + 4300, s.finish);
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
        for (let mgr of el) { const val = parseInt($(`blind-guess-${mgr.id}`)?.value); if (isNaN(val) || val < 0) return alert(`Wert für ${mgr.name} fehlt.`); guesses.push({ mgr: mgr, guess: val }); }
        const list = itemDatabase[cat]; if (!list || list.length === 0) { if ($('blind-modal')) $('blind-modal').classList.add('hidden'); return showModal("Katalog leer!", "Nichts mehr da."); }
        const drawn = list[Math.floor(Math.random() * list.length)], hp = Math.floor(drawn.cost * getConf('mechanics','blindWinCostFraction'));
        let winner = null, minDiff = Infinity;
        guesses.forEach(g => { const diff = Math.abs(g.guess - drawn.cost); if (diff < minDiff) { minDiff = diff; winner = g.mgr; } });
        if ($('blind-modal')) $('blind-modal').classList.add('hidden');
        if (winner.budget < hp) { playBlindReveal(drawn, guesses, winner); return showModal("Deal gescheitert", `${winner.name} hat nicht genug Budget (${hp.toLocaleString()} ${Config.currency.symbol})!`); }
        let cbText = processPurchase(winner, hp, drawn, cat);
        addLog(`Blinder Deal: ${winner.name} gewinnt.`, "buy");
        playBlindReveal(drawn, guesses, winner, () => flyCardToSlot(drawn, winner, hp));
        showModal((Config.auctionAnimation?.dealBlindTitle) || "🙈 DEAL GEWONNEN!", `Es ging um <strong>${drawn.name}</strong> (Wert: <strong>${drawn.cost.toLocaleString()}</strong>).<br><br>🎉 <strong>${winner.name}</strong> war am dichtesten dran und sichert sich die Ware für die Hälfte: <strong>${hp.toLocaleString()}</strong>!${cardQuoteHtml(drawn)}${cbText}`);
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
    showConfirmModal(`Item erzwingen für 1,5x Preis (${Config.categories[activeMatrixAuctionCategory]?.name})?`, () => {
        const item = list[Math.floor(Math.random() * list.length)]; const price = Math.floor(item.cost * getConf('mechanics','autoBuyMultiplier'));
        if (m.budget < price) return showModal("Zu teuer!", `Kostet ${price.toLocaleString()} ${Config.currency.symbol}. Budget reicht nicht.`);
        m.jokers.autoBuy--; jokerPhaseState.autoBuyUsed = true;
        let cbText = processPurchase(m, price, item, activeMatrixAuctionCategory);
        addLog(`Bestechung: ${m.name} holt Item für ${price.toLocaleString()}!`, "event");
        flyCardToSlot(item, m, price);
        showModal("🎯 ERZWUNGEN!", `<strong>${m.name}</strong> schnappt sich blind <strong>${item.name}</strong> für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong>!${cardQuoteHtml(item)}${cbText}`);
        resetMatrixActiveBid();
    });
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

            playFlushScene(flushed, () => playDrawAnimation(newItem, () => { if (typeof openCardExpand === 'function') openCardExpand(); }, false));
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
    const icnBlock = t.block?.icon || '<i class="fa-solid fa-ban"></i>';
    const lblBlock = t.block?.label || 'Block';
    
    const icnAutoBuy = t.autoBuy?.icon || '<i class="fa-solid fa-handshake-angle"></i>';
    const lblAutoBuy = t.autoBuy?.label || 'Bestechen';
    
    const icnBonus = t.bonus?.icon || '<i class="fa-solid fa-shield-halved"></i>';
    const lblBonus = t.bonus?.label || 'Schutz';
    
    const icnGamble = t.gamble?.icon || '<i class="fa-solid fa-shuffle"></i>';
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
        const baseBtn = "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded transition-all duration-200 border";
        
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
            btnHtml = `<span class="text-[11px] text-stone-600 font-medium">Keine Optionen</span>`;
        }

        // Spieler-Zeile
        container.innerHTML += `
            <div class="flex flex-col md:flex-row md:items-center justify-between p-3 mb-2 rounded border border-stone-700/50 bg-[#1c1917] hover:bg-stone-800/80 hover:border-stone-600 transition-colors">
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
function getBaseEventChance() { const el = $('input-event-chance'); return el ? parseFloat(el.value) : getConf('mechanics','baseEventChance'); }
function updateEventChanceDisplays() {
    let val = Math.round(getBaseEventChance() * 100) + '%';
    if ($('event-chance-display')) $('event-chance-display').innerText = val;
    if ($('event-chance-display-admin')) $('event-chance-display-admin').innerText = val;
}

function triggerEvent() {
    const av = Config.events.filter(e => !triggeredEventIds.includes(e.id));
    if (av.length === 0) return showModal("Das war's", "Alle Ereignisse wurden bereits ausgelöst!");
    const ev = av[Math.floor(Math.random() * av.length)]; triggeredEventIds.push(ev.id);
    addLog(`Event: ${ev.title}`, "event");
    const ticker = `<span>+++ ${Config.terminology.eventTitle} +++</span>`.repeat(4);
    if ($('event-ticker')) $('event-ticker').innerHTML = ticker + ticker; // two copies -> seamless loop
    if ($('event-modal-title')) $('event-modal-title').innerText = ev.title;
    if ($('event-modal-desc')) $('event-modal-desc').innerHTML = ev.desc;
    const before = managers.map(m => m.budget);
    if ($('event-modal-result')) $('event-modal-result').innerHTML = executeEventLogic(ev);
    // Who got / lost how much: diff of all budgets, so every event action is covered automatically
    const sym = Config.currency.symbol;
    if ($('event-modal-money')) $('event-modal-money').innerHTML = managers
        .map((m, i) => ({ m, d: m.budget - before[i] })).filter(x => x.d !== 0)
        .map((x, i) => `<div class="news-row" style="--i:${i}"><span class="text-white">${x.m.name}</span><span class="${x.d > 0 ? 'text-green-400' : 'text-red-500'}">${x.d > 0 ? '+' : '−'} ${Math.abs(x.d).toLocaleString()} ${sym}</span></div>`).join('');
    if ($('event-modal')) $('event-modal').classList.remove('hidden');
    sfx.chime();
    renderMatrix(); updateBuyerDropdown(); resetMatrixActiveBid();
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
        case "restore_jokers": managers.forEach(m => { if (m.perk === 'perk8') return; m.jokers.block = (m.perk === 'perk7') ? 2 : 1; m.jokers.bonus = 1; m.jokers.autoBuy = 1; m.jokers.gamble = 1; m.jokers.skip = 1; }); return `🕊️ WUNDER! Die Jokerkarten wurden wiederhergestellt!`;
        case "destroy_random_category": let validCats = []; for (let c of activeCategories) { let catLow = c.toLowerCase(); if (managers.every(m => m.team[catLow] !== null && m.team[catLow] !== undefined)) validCats.push(catLow); } if (validCats.length === 0) return "Glück gehabt. Noch nichts zu konfiszieren."; let chosenCat = validCats[Math.floor(Math.random() * validCats.length)]; managers.forEach(m => { if (m.perk === 'perk1' && m.protegeCats.includes(chosenCat)) return; if (m.team[chosenCat]) { m.team[chosenCat].score = 0; } }); return `💥 Razzia! Die Kategorie <strong>${Config.categories[chosenCat.toUpperCase()]?.name || chosenCat}</strong> wurde konfisziert. Items geben nun 0 Punkte!`;
        case "nothing": default: return `🙈 Friedlicher Moment. Keinerlei Auswirkungen.`;
    }
}

// =====================================================================
// SPECIAL AUKTIONEN (Blind / Dutch)
// =====================================================================
function triggerBlindAuctionEvent() {
    const cat = activeMatrixAuctionCategory, el = managers.filter(mgr => !mgr.team[cat.toLowerCase()] && mgr.id !== blockedPlayerId);
    if (el.length === 0) return showModal("Alle beschäftigt!", "Keine freien Slots mehr.");
    const c = $('blind-inputs'); if (!c) return; c.innerHTML = '';
    el.forEach(mgr => { c.innerHTML += `<div class="flex items-center justify-between gap-3 bg-[#1c1917] p-2 rounded border border-stone-600"><span class="text-xs font-bold text-stone-300 w-1/2 text-left truncate">${mgr.name}</span><input type="number" id="blind-guess-${mgr.id}" placeholder="Tipp (${Config.currency.symbol})" class="w-1/2 bg-[#292524] border border-stone-500 text-white font-bold rounded p-1.5 text-xs outline-none focus:border-orange-500 text-center"></div>`; });
    if ($('blind-cat-name')) $('blind-cat-name').innerText = Config.categories[cat]?.name || cat;
    blindInitiatorId = -1; if ($('blind-modal')) $('blind-modal').classList.remove('hidden');
}

function startDutchAuction() {
    const cat = activeMatrixAuctionCategory;
    let list = itemDatabase[cat]?.filter(item => item.tier === 'gut') || [];
    if (list.length === 0) list = itemDatabase[cat]?.filter(item => item.tier === 'mittel') || [];
    if (list.length === 0) list = itemDatabase[cat] || [];
    if (list.length === 0) return showModal("Abgebrochen", "Nichts mehr verfügbar.");
    addLog(`🚨 ALARM! Preis sinkt rasant...`, "alert");
    dutchItem = list[Math.floor(Math.random() * list.length)]; dutchPrice = startingBudget;
    if ($('dutch-item-title')) $('dutch-item-title').innerHTML = `<span class="text-lg">${dutchItem.icon}</span> ${dutchItem.name} <span class="text-xs bg-yellow-600 text-black font-bold px-1 rounded ml-1">${dutchItem.tier === 'gut' ? 'Premium' : 'Standard'}</span>`;
    if ($('dutch-item-desc')) $('dutch-item-desc').innerText = dutchItem.desc;
    const c = $('dutch-buttons-container'); if (c) c.innerHTML = '';
    managers.forEach(m => { if (m.id !== blockedPlayerId && !m.team[cat.toLowerCase()] && c) c.innerHTML += `<button id="dutch-btn-${m.id}" onclick="resolveDutchAuction(${m.id})" class="bg-orange-600 hover:bg-orange-500 text-white font-black py-2 px-3 rounded-lg text-xs shadow-md transition uppercase tracking-wide">💥 ${m.name} greift zu!</button>`; });
    if ($('dutch-modal')) $('dutch-modal').classList.remove('hidden');
    showDutchPrice();
    clearInterval(dutchInterval);
    const drop = Math.floor(startingBudget * getConf('dutchAuction', 'priceDropFraction'));
    dutchInterval = setInterval(() => { dutchPrice = Math.max(0, dutchPrice - drop); showDutchPrice(); }, getConf('dutchAuction', 'tickIntervalMs'));
    clearTimeout(dutchBeatTimer); dutchHeartbeat();
}

function showDutchPrice() { // rolls the new price in like a departure board; the red border pulses with the heartbeat
    const el = $('dutch-price'); if (!el) return;
    el.textContent = `${dutchPrice.toLocaleString()} ${Config.currency.symbol}`;
    el.classList.remove('is-rolling'); void el.offsetWidth; el.classList.add('is-rolling');
    $('dutch-modal')?.style.setProperty('--beat', `${dutchBeatMs() / 1000}s`);
}
const dutchBeatMs = () => Math.round(350 + 850 * dutchPrice / startingBudget); // faster as the price falls
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
    sfx.hit();
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
    if (matches.length === 0) { resC.innerHTML = '<li class="p-2 text-[10px] text-stone-500 italic text-center">Nichts gefunden</li>'; resC.classList.remove('hidden'); return; }
    resC.innerHTML = ''; matches.slice(0, 8).forEach(m => { resC.innerHTML += `<li onclick="selectManualMatrixCard('${m.id}', '${m.type}')" class="p-2 border-b border-stone-700/50 hover:bg-stone-700 cursor-pointer transition flex items-center gap-2"><span class="text-base">${m.icon}</span><div class="flex flex-col overflow-hidden"><span class="text-[10px] font-bold text-white truncate w-full">${m.name}</span><span class="text-[8px] text-yellow-400 font-bold">ab ${m.cost.toLocaleString()} ${Config.currency.symbol}</span></div></li>`; });
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

// Manual stop between categories: the host confirms, then the next category and the wheel start.
// Not after the final category - the game is over and money no longer counts.
function announceCategoryFinished() {
    const cat = pendingCategoryFinish; pendingCategoryFinish = null;
    if (!cat || isGameEnded) return;
    const key = activeCategories.find(c => c.toLowerCase() === cat.toLowerCase()) || cat.toUpperCase();
    const idx = activeCategories.indexOf(key);
    const open = c => !completedCategoryNames.includes(c.toLowerCase());
    const nextCat = activeCategories.slice(idx + 1).find(open) || activeCategories.find(open);
    const name = Config.categories[key]?.name || key;
    const nextName = nextCat ? (Config.categories[nextCat]?.name || nextCat) : '';
    showModal("🏁 Kategorie abgeschlossen",
        `<strong>${name}</strong> ist komplett vergeben.${nextCat ? `<br>Als Nächstes: <strong>${nextName}</strong>.` : ''}<br><br>🎡 Jetzt dreht jeder einmal am Glücksrad.`,
        () => {
            if (nextCat) { selectMatrixAuctionCategory(nextCat); addLog(`Wechsel zu ${nextName}.`, "info"); }
            spinBonusWheelAll();
        },
        '🎡 Glücksrad starten');
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
        let loserHtml = m.loserBonusText ? `<div class="text-[10px] text-pink-400 font-bold uppercase mt-1 animate-pulse">🎁 ${m.loserBonusText}</div>` : '';
        podium.innerHTML += `<div class="bg-black/50 border border-stone-700 p-4 rounded-xl flex justify-between items-center mb-2 ${i === 0 ? 'bg-yellow-900/20 border-yellow-500/50' : ''}"><div><div class="${c[i]} font-black text-sm uppercase tracking-wider">${t}</div><div class="text-white font-bold text-lg">${m.name}</div><div class="text-[10px] text-stone-500">Vorrat: ${m.budget.toLocaleString()} ${Config.currency.symbol}</div>${loserHtml}</div><div class="text-3xl font-black ${c[i]}">${m.totalPoints} <span class="text-xs text-stone-400">Pkt.</span></div></div>`;
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
        const modals = ['shortcuts-modal', 'custom-modal', 'confirm-modal', 'edit-modal', 'category-modal', 'event-modal', 'block-modal', 'gamble-modal', 'blind-modal', 'dutch-modal', 'wheel-modal', 'perks-modal', 'gamble-choice-modal', 'perk-catalog-modal', 'joker-phase-modal'];
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
        if ($('event-modal') && !$('event-modal').classList.contains('hidden')) { $('event-modal').classList.add('hidden'); return; }
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
