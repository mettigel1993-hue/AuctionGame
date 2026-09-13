const $ = id => document.getElementById(id);

// --- Globale Variablen ---
let Config = {}; let itemDatabase = {}; let shreddedDatabase = []; let usedDatabase = [];
let managers = []; let activeCategories = []; let countManagers = 4; var startingBudget = 1000000;
let currentView = 'matrix'; let adminCategory = ''; let selectedAuctionItem = null;
let activeMatrixAuctionItem = null; let activeMatrixAuctionCategory = ''; let isShredderMode = false;
let itemsToShred = []; let boolForceShowCatalog = false; let manualCatalogHide = false;
let draftedIds = []; let triggeredEventIds = []; let blockedPlayerId = null;
let blockInitiatorId = null; let gambleInitiatorId = null; let blindInitiatorId = null;
let finishedSpins = 0; let highRollerTriggered = false; let isHighRollerSession = false;
let completedCategoryNames = []; let pendingSpecialEvent = false; let specialEventsRemaining = ['dutch', 'blind'];
let blindDrawsLeft = 0; let lastPurchase = { managerId: null, cost: 0, item: null, category: null, cashbackGiven: 0, isUndoable: false };
let isGameEnded = false; let globalIdCounter = 1; let gambleSelectedOldCard = null; let gambleTemporaryCards = [];
let dutchInterval = null; let dutchPrice = 0; let dutchItem = null; let selectedPerksPending = {};
let currentConfirmCallback = null; let customModalCallback = null;

// --- Globale Variablen für Erweiterungen ---
let activeCategoryDeck = [];
let playerJokerOrder = [];
let jokerPhaseState = { blockUsed: false, autoBuyUsed: false };
let isJokerPhaseActive = false;
let wheelSpinResults = [];

// =====================================================================
// BOOTLOADER
// =====================================================================
window.onload = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const theme = urlParams.get('theme') || 'wehleiden';
    try {
        const configResponse = await fetch(`config_${theme}.json`);
        Config = await configResponse.json();
        if (window.applyTheme && Config.themeId) window.applyTheme(Config.themeId);
        activeCategories = Object.keys(Config.categories);
        adminCategory = activeCategories[0];
        activeMatrixAuctionCategory = activeCategories[0];
        applyConfigToUI();
        renderCategoryButtons();
        const dbLoaded = await buildDatabase();
        initGame(4, Config.currency.startAmount);
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
    if ($('btn-punish')) $('btn-punish').innerHTML = `<i class="fa-solid fa-thumbs-down"></i> ${Config.terminology.punishButtonText}`;
    if ($('tab-matrix')) $('tab-matrix').innerText = Config.terminology.adminTab1;
    if ($('tab-admin')) $('tab-admin').innerText = Config.terminology.adminTab2;
    if ($('tab-used')) $('tab-used').innerText = Config.terminology.adminTab3;
    if ($('tab-shredded')) $('tab-shredded').innerHTML = `<i class="fa-solid fa-toilet mr-1"></i> ${Config.terminology.adminTab4}`;
    if ($('input-start-budget')) $('input-start-budget').value = Config.currency.startAmount;

    const jLegend = $('joker-legend');
    if (jLegend && Config.terminology.jokers) {
        const colorMap = { block: 'red', bonus: 'green', autoBuy: 'purple', gamble: 'orange', skip: 'cyan' };
        const descMap = {
            block: `Mitinsassen für eine Runde einsperren.`,
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
    let shuffled = [...list].sort(() => 0.5 - Math.random());
    activeCategoryDeck = shuffled.slice(0, countManagers);
}

function promptRestart(count) {
    let b = parseInt($('input-start-budget') ? $('input-start-budget').value : startingBudget);
    if (isNaN(b) || b < 0) b = startingBudget;
    showConfirmModal(`Neu starten mit <strong>${count} ${Config.terminology.playerPlural}</strong> und <strong>${b.toLocaleString()} ${Config.currency.symbol}</strong>?`, () => {
        initGame(count, b); addLog("Spiel neu gestartet.", "alert");
    });
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

function showModal(title, text, callback = null) {
    if ($('modal-title')) $('modal-title').innerHTML = title;
    if ($('modal-text')) $('modal-text').innerHTML = text;
    customModalCallback = callback;
    if ($('custom-modal')) $('custom-modal').classList.remove('hidden');
    else alert(`${title}

${text.replace(/<[^>]*>?/gm, '')}`);
}
function closeModal() {
    if ($('custom-modal')) $('custom-modal').classList.add('hidden');
    if (customModalCallback) { let cb = customModalCallback; customModalCallback = null; cb(); }
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

function getTagsHtml(item) {
    let tHtml = '<div class="flex flex-wrap gap-0.5 mt-1 max-h-[30px] overflow-y-auto tags-scrollbar">';
    if (item.tags) item.tags.forEach(t => tHtml += `<span class="bg-orange-950/40 text-orange-300 border border-orange-500/30 px-1 py-0.5 rounded text-[7px] font-bold">#${t}</span>`);
    return tHtml + '</div>';
}

function getDynamicDescHtml(item, useAdminDesc = false) {
    let text = (useAdminDesc && item.adminDesc) ? item.adminDesc : item.desc;
    if (!text) text = ''; // Sicherheits-Check: Verhindert Absturz, wenn Text fehlt
    let len = text.length;
    let sizeClass = "text-[16px] leading-snug"; // Standard für kurzen Text
    
    // Prüfen, wie lang der Text ist und CSS-Klasse anpassen
    if (len > 150) sizeClass = "text-[10px] leading-tight";      // Extrem lang
    else if (len > 100) sizeClass = "text-[11px] leading-tight"; // Sehr lang
    else if (len > 60) sizeClass = "text-sm leading-snug";       // Mittellang
    
    return `<div class="${sizeClass} transition-all">${text}</div>` + getTagsHtml(item);
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
    if (data.tags_ref && data.db) {
        for (let cat in data.db) {
            data.db[cat].forEach(item => {
                // 1. Tags aus dem Index-Array wiederherstellen
                if (item.tg) {
                    item.tags = item.tg.map(idx => data.tags_ref[idx]);
                    delete item.tg; // tg aus dem RAM entfernen, da tags nun existiert
                }
                // 2. dbCategory automatisch aus dem Objekt-Key ableiten
                item.dbCategory = cat;
            });
        }
    }
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
                    <button onclick="selectMatrixAuctionCategory('${cat}', this)" class="${btnClass}">${cData.icon} ${cData.name}</button>
                  </th>`;
    });

    thead.innerHTML = hHtml;
    tbody.innerHTML = '';

    managers.forEach(m => {
        const isBlk = m.id === blockedPlayerId;
let jokersHtml = `<div class="flex flex-wrap gap-1 mt-1.5 justify-start">`;
        const fnMap = { block: 'useBlockJoker', bonus: 'useBonusJoker', autoBuy: 'useAutoBuyJoker', gamble: 'useGambleJoker', skip: 'useSkipJoker' };
        for (let jKey in Config.terminology.jokers) {
            if (m.jokers[jKey] > 0) { 
                let jData = Config.terminology.jokers[jKey];
                let countLabel = m.jokers[jKey] > 1 ? `<span class="absolute -top-1.5 -right-1.5 bg-black text-white text-[7px] px-1 rounded-full border border-stone-600">${m.jokers[jKey]}</span>` : '';
                let c = jData.color || 'stone';
                let cls = `relative w-6 h-6 flex justify-center items-center rounded bg-transparent text-stone-500 border border-stone-700 hover:border-${c}-500 hover:text-${c}-400 hover:bg-[#292524] transition-all`;
                jokersHtml += `<button onclick="${fnMap[jKey]}(${m.id})" title="${jData.label}" class="${cls}">${jData.icon}${countLabel}</button>`;
            }
        }
        jokersHtml += `</div>`;
  

        let slots = activeCategories.map(k => renderSlotCell(m.id, k.toLowerCase(), m.team[k.toLowerCase()])).join('');
        let blkOverlay = isBlk ? `<div class="text-[10px] font-black text-white bg-red-600 inline-block px-1.5 py-0.5 rounded animate-pulse mb-1 shadow-md">🚫 BLOCKIERT</div>` : '';
        let cbBadge = m.cashbackActive ? `<div class="text-[9px] text-green-400 font-bold bg-green-950/50 px-1.5 py-0.5 rounded border border-green-800 mt-1 inline-block"><i class="fa-solid fa-coins"></i> Bonus aktiv</div>` : '';
        let perkBadge = m.perk !== 'NONE' ? `<div class="text-[9px] font-bold text-indigo-400 bg-indigo-950/30 px-1 py-0.5 border border-indigo-900/50 rounded mt-1 truncate" title="${Config.perks[m.perk]?.desc || ''}">${Config.perks[m.perk]?.name || m.perk}</div>` : '';

        let bp = 0, tc = {};
        for (let cat in m.team) {
            if (m.team[cat]) {
                let s = m.team[cat].score || 0;
                if (m.perk === 'perk1' && m.protegeCats && m.protegeCats.includes(cat)) s = Math.floor(s * 1.5);
                if (m.perk === 'perk3' && m.team[cat].tier === 'schlecht') s = Math.floor(s * 1.5);
                if (m.perk === 'perk8') s += 10;
                bp += s;
                if (m.team[cat].tags && Array.isArray(m.team[cat].tags)) m.team[cat].tags.forEach(t => tc[t.trim()] = (tc[t.trim()] || 0) + 1);
            }
        }
        let syn = 0; for (let t in tc) if (tc[t] > 1) syn += (tc[t] - 1) * 2;
        let isLow = m.budget < (startingBudget * 0.15);
        let textColor = isLow ? 'text-red-500' : 'text-orange-400';
        let barColor = isLow ? 'bg-red-500' : 'bg-orange-500';
        let p = Math.max(0, Math.min(100, (m.budget / startingBudget) * 100));

tbody.innerHTML += `
            <tr class="${isBlk ? 'bg-red-950/40 border-l-4 border-red-500 grayscale transition opacity-80' : 'hover:bg-[#1c1917]/30 transition'}">
                <td class="py-4 px-3 border-r border-stone-700/80 align-top">
                    <div class="flex flex-col gap-1">
                        ${blkOverlay}
                        <div class="flex items-center justify-between gap-2 border-b border-transparent hover:border-stone-600 focus-within:border-orange-400 pb-0.5">
                            <input type="text" value="${m.name}" onchange="renameManager(${m.id}, this.value)" class="bg-transparent text-sm font-black text-white focus:outline-none w-full">
                            <span class="text-xs font-black text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/30 whitespace-nowrap cursor-help shadow-sm" title="Basis: ${bp} Pkt. | Synergie: +${syn} Pkt.">
                                <i class="fa-solid fa-star text-[9px] mr-0.5"></i>${bp + syn}
                            </span>
                        </div>
                        ${perkBadge}${cbBadge}${jokersHtml}
                        <div class="relative mt-2 w-full bg-black/20 p-1.5 rounded border border-stone-700/30">
                            <span id="budget-display-${m.id}" class="text-[10px] font-black ${textColor} transition-colors block mb-1">${m.budget.toLocaleString()} ${Config.currency.symbol}</span>
                            <div class="w-full bg-stone-800 rounded-full h-1 overflow-hidden border border-stone-700">
                                <div class="${barColor} h-1 rounded-full transition-all duration-500" style="width: ${p}%"></div>
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
    let specialBorderClass = isProtege ? 'border-2 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'border-t border-l border-r border-stone-700';
   if (!pObj) return `<td class="py-2 px-1 text-center border-l border-stone-700/40"><div class="h-[80px]"></div></td>`;
    let bb = pObj.tier === 'gut' ? 'border-b-yellow-400' : pObj.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
    let displayScore = pObj.score || 0; let isBoosted = false;
    if (m) {
        if (m.perk === 'perk1' && isProtege) { displayScore = Math.floor(displayScore * 1.5); isBoosted = true; }
        if (m.perk === 'perk3' && pObj.tier === 'schlecht') { displayScore = Math.floor(displayScore * 1.5); isBoosted = true; }
        if (m.perk === 'perk8') { displayScore += 10; isBoosted = true; }
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
        return item.name.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || (item.adminDesc && item.adminDesc.toLowerCase().includes(q)) || (item.tags && item.tags.some(t => t.toLowerCase().includes(q) || ('#' + t.toLowerCase()).includes(q)));
    }) : [];
    ['pool-gut', 'pool-mittel', 'pool-schlecht'].forEach(id => { if ($(id)) $(id).innerHTML = ''; });
    list.forEach(item => {
        let isSel = itemsToShred.includes(item.id);
        let cls = isShredderMode ? (isSel ? 'border-2 border-red-500 bg-red-950/40 scale-[0.98]' : 'border border-stone-700 bg-[#292524] opacity-70') : (selectedAuctionItem?.id === item.id ? 'border-2 border-orange-400 bg-orange-950/20' : 'border border-stone-700 bg-[#292524] hover:border-stone-500');
        let bb = item.tier === 'gut' ? 'border-b-yellow-400' : item.tier === 'schlecht' ? 'border-b-rose-500' : 'border-b-orange-500';
        let ca = isShredderMode ? `toggleShredderSelection('${item.id}')` : `selectAuctionItem('${item.id}')`;
        let overlay = (isShredderMode && isSel) ? `<div class="absolute inset-0 bg-red-900/20 flex items-center justify-center rounded-lg pointer-events-none"><i class="fa-solid fa-toilet text-3xl text-red-500 opacity-60 animate-pulse"></i></div>` : '';
        let div = item.tier === 'gut' ? 'pool-gut' : item.tier === 'mittel' ? 'pool-mittel' : 'pool-schlecht';
        if ($(div)) $(div).innerHTML += `<div onclick="${ca}" class="p-2 rounded-lg cursor-pointer transition-all-custom flex flex-col justify-between min-h-[50px] ${cls} border-b-[3px] ${bb} overflow-hidden relative">${overlay}<div class="relative z-10"><div class="flex justify-between items-center gap-1.5 mb-1"><div class="flex items-center gap-1.5 min-w-0"><span class="text-sm flex-shrink-0">${item.icon}</span><h4 class="font-bold text-white text-[11px] truncate leading-none" title="${item.name}">${item.name}</h4></div><div class="flex items-center gap-1 flex-shrink-0"><span class="text-[8px] bg-stone-900 text-stone-300 px-1 py-0.5 rounded font-bold">${item.cost >= 1000 ? item.cost / 1000 + 'k' : item.cost}</span><div class="text-[8px] text-lime-400 font-bold px-1 py-0.5 rounded bg-green-950/20 border border-green-900/30"><i class="fa-solid fa-star text-[6px]"></i> ${item.score}</div><button onclick="openEditModal(event, '${item.id}', '${adminCategory}')" class="text-stone-400 hover:text-white transition bg-stone-800 rounded px-1.5 py-0.5 border border-stone-600 shadow z-[50]" title="Bearbeiten"><i class="fa-solid fa-pen text-[7px]"></i></button></div></div><p class="text-[9px] text-stone-400 italic leading-tight line-clamp-1">${item.adminDesc || item.desc}</p>${getTagsHtml(item)}</div></div>`;
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
        if (pKey === 'perk4') m.budget = Math.floor(m.budget * 0.75);
        if (pKey === 'perk7') m.jokers.block = 2;
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
    if (isJokerPhaseActive) return showModal("Sperre", "Bitte beende erst die laufende Joker-Phase.");

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
    
    if (activeCategoryDeck.length === 0) return showModal("Katalog leer!", "Das Deck dieser Kategorie ist leer. Alle Karten wurden vergeben.");
    
    const item = activeCategoryDeck.shift();
    activeMatrixAuctionItem = { ...item, type: activeMatrixAuctionCategory };
 if (blindDrawsLeft > 0) {
        $('matrix-active-bid-target').innerHTML = `<span class="text-xl">❓</span> VERDECKT`;
        $('matrix-active-bid-start-price').innerText = `Kosten: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
        $('matrix-active-bid-desc').innerHTML = `<div class="text-[16px] text-red-400 font-bold">Unleserlich. Blindflug!</div>`;
    } else {
        $('matrix-active-bid-target').innerHTML = `<span class="text-xl">${item.icon}</span> ${item.name}`;
        $('matrix-active-bid-start-price').innerText = `Kosten: ${item.cost.toLocaleString()} ${Config.currency.symbol}`;
        $('matrix-active-bid-desc').innerHTML = getDynamicDescHtml(item);
    }
    if ($('matrix-auction-price')) $('matrix-auction-price').value = item.cost;
openJokerPhase();
}

function updateBuyerDropdown() {
    const s1 = $('auction-buyer'), s2 = $('matrix-auction-buyer');
    let html = `<option value="">-- ${Config.terminology.playerSingular} wählen --</option>`;
    managers.forEach(m => html += `<option value="${m.id}">${m.name} (${m.budget.toLocaleString()} ${Config.currency.symbol})</option>`);
    if (s1) s1.innerHTML = html; if (s2) s2.innerHTML = html;
}

function resetMatrixActiveBid() {
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
    playAuctionAnimation(price);
    
showModal("🚨 DEAL PERFEKT!", `<strong>${activeMatrixAuctionItem.name}</strong> geht für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong> an <strong>${m.name}</strong>!${sapMsg}${cbText}`);
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
    playAuctionAnimation(price);
    showModal("🚨 DEAL PERFEKT!", `<strong>${selectedAuctionItem.name}</strong> geht für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong> an <strong>${m.name}</strong>!${cbText}`);
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
        cashbackVal = Math.floor(startingBudget * 0.1);
        if (manager.perk === 'perk4') cashbackVal = Math.floor(cashbackVal * getConf('perks','perk4_incomeMultiplier'));
        manager.budget += cashbackVal; animateBudgetChange(manager.id, cashbackVal, true);
        cbText = `<br><br><span class="text-lime-400">💰 <strong>Bonus:</strong> +${cashbackVal.toLocaleString()} ${Config.currency.symbol} zurückerhalten!</span>`;
    }
    lastPurchase = { managerId: manager.id, cost: price, item: item, category: cat, cashbackGiven: cashbackVal, isUndoable: true };
    if ($('btn-undo-purchase')) $('btn-undo-purchase').classList.remove('hidden');
    updateEventChanceDisplays(); saveDatabases(); checkCategoryCompletion(cat.toLowerCase()); resetGlobalBlock(); checkEndgame();
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
    const tpl = Config.punishCardTemplate;
    const loserCard = { id: 'loser_' + Date.now(), name: tpl.name, desc: tpl.desc, cost: tpl.cost, score: tpl.score, tier: tpl.tier, icon: tpl.icon, type: activeMatrixAuctionCategory.toUpperCase(), dbCategory: tpl.dbCategory, tags: tpl.tags || ['Ausschuss'] };
    m.team[cat] = loserCard; addLog(`Strafe: ${m.name} bekommt "${tpl.name}".`, "alert");
    showModal("💨 STRAFE!", `<strong>${m.name}</strong> bekommt die Loser-Karte für <strong>${Config.categories[activeMatrixAuctionCategory.toUpperCase()]?.name || activeMatrixAuctionCategory}</strong> aufgezwungen! (${tpl.score} Punkte)`);
    resetMatrixActiveBid(); checkEndgame();
}

function playAuctionAnimation(price) {
    const h = $('hammer-container'), p = $('price-popup-container'); if (!h || !p) return;
    const hi = h.querySelector('i');
    p.innerText = `-${price.toLocaleString()} ${Config.currency.symbol}`;
    h.classList.remove('hidden'); p.classList.remove('hidden');
    if (hi) { hi.classList.remove('animate-hammer'); p.classList.remove('animate-price-pop'); void hi.offsetWidth; void p.offsetWidth; hi.classList.add('animate-hammer'); }
    p.classList.add('animate-price-pop');
    setTimeout(() => { h.classList.add('hidden'); p.classList.add('hidden'); }, 1500);
}

function resetGlobalBlock() { if (blockedPlayerId !== null) { blockedPlayerId = null; renderMatrix(); } }

function applyBudgetChange(m, amount, source = "event") {
    let finalAmount = amount;
    if (finalAmount < 0 && source === "event" && m.perk === 'perk6') { addLog(`${m.name} blockt Strafe ab!`, "event"); return 0; }
    if (finalAmount > 0) {
        if (m.perk === 'perk4') finalAmount = Math.floor(finalAmount * 1.25);
        if (source === "wheel" && m.perk === 'perk6') finalAmount = Math.floor(finalAmount * 1.10);
    }
    m.budget += finalAmount; animateBudgetChange(m.id, Math.abs(finalAmount), finalAmount >= 0);
    return finalAmount;
}

function animateBudgetChange(id, amt, pos) {
    let cell = $(`budget-display-${id}`);
    if (cell) { let el = document.createElement('div'); el.className = `absolute right-3 top-4 font-black text-lg pointer-events-none z-50 ${pos ? 'animate-float-out-green text-green-400' : 'animate-float-out-red text-red-500'}`; el.innerText = `${pos ? '+' : '-'} ${amt.toLocaleString()} ${Config.currency.symbol}`; cell.parentElement.appendChild(el); setTimeout(() => el.remove(), 1500); }
}

// =====================================================================
// JOKER LOGIK
// =====================================================================
function useBlockJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.block <= 0) return showModal("Verbraucht!", "Keine Joker mehr verfügbar.");
    const s = $('block-select'); if (s) { s.innerHTML = ''; managers.forEach(mgr => { if (mgr.id !== id) s.innerHTML += `<option value="${mgr.id}">${mgr.name}</option>`; }); }
    blockInitiatorId = id; if ($('block-modal')) $('block-modal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', function() {
    if ($('block-confirm-btn')) $('block-confirm-btn').addEventListener('click', function () {
        const m = managers.find(x => x.id === blockInitiatorId), tm = managers.find(x => x.id === parseInt($('block-select').value));
        if (!m || !tm) return;
        if (tm.perk === 'perk7') {
            if ($('block-modal')) $('block-modal').classList.add('hidden');
            m.jokers.block--;
            addLog(`Isolation fehlgeschlagen: ${tm.name} blockt ab.`, "alert");
            showModal("🛑 Abgelehnt!", `<strong>${tm.name}</strong> blockt ab! Dein Joker ist trotzdem verbraucht.`);
            renderMatrix(); return;
        }
        m.jokers.block--; blockedPlayerId = tm.id;
        if ($('block-modal')) $('block-modal').classList.add('hidden');
        addLog(`Isolation: ${m.name} sperrt ${tm.name} weg.`, "alert");
        showModal("🛑 BLOCKIERT!", `<strong>${m.name}</strong> sperrt <strong>${tm.name}</strong>!`);
        renderMatrix();
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
            let shuffled = [...list].sort(() => 0.5 - Math.random());
            gambleTemporaryCards = shuffled.slice(0, 3);
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
        showModal("🎓 SCHMUGGEL ERFOLGREICH!", `<strong>${m.name}</strong> gibt <strong>${oldCard.name}</strong> ab und erhält:<br><div class='bg-black/50 p-4 rounded-xl mt-4 border border-yellow-500'><div class='flex items-center gap-3 mb-2'><span class='text-3xl'>${newCard.icon}</span><div class='font-black text-white text-lg'>${newCard.name}</div></div><div class='text-xs text-stone-300 italic mb-3'>${newCard.desc}</div><div class='text-lime-400 font-black text-sm text-right'>${newCard.cost.toLocaleString()} ${Config.currency.symbol}</div></div>`);
        resetMatrixActiveBid();
    });

    if ($('blind-confirm-btn')) $('blind-confirm-btn').addEventListener('click', function () {
        const cat = activeMatrixAuctionCategory, el = managers.filter(mgr => !mgr.team[cat.toLowerCase()] && mgr.id !== blockedPlayerId);
        let guesses = [];
        for (let mgr of el) { const val = parseInt($(`blind-guess-${mgr.id}`)?.value); if (isNaN(val) || val < 0) return alert(`Wert für ${mgr.name} fehlt.`); guesses.push({ mgr: mgr, guess: val }); }
        const list = itemDatabase[cat]; if (!list || list.length === 0) { if ($('blind-modal')) $('blind-modal').classList.add('hidden'); return showModal("Katalog leer!", "Nichts mehr da."); }
        const drawn = list[Math.floor(Math.random() * list.length)], hp = Math.floor(drawn.cost / 2);
        let winner = null, minDiff = Infinity;
        guesses.forEach(g => { const diff = Math.abs(g.guess - drawn.cost); if (diff < minDiff) { minDiff = diff; winner = g.mgr; } });
        if (winner.budget < hp) { if ($('blind-modal')) $('blind-modal').classList.add('hidden'); return showModal("Deal gescheitert", `${winner.name} hat nicht genug Budget (${hp.toLocaleString()} ${Config.currency.symbol})!`); }
        let cbText = processPurchase(winner, hp, drawn, cat);
        if ($('blind-modal')) $('blind-modal').classList.add('hidden');
        addLog(`Blinder Deal: ${winner.name} gewinnt.`, "buy");
        showModal("🙈 DEAL GEWONNEN!", `Es ging um <strong>${drawn.name}</strong> (Wert: <strong>${drawn.cost.toLocaleString()}</strong>).<br><br>🎉 <strong>${winner.name}</strong> war am dichtesten dran und sichert sich die Ware für die Hälfte: <strong>${hp.toLocaleString()}</strong>!${cbText}`);
        resetMatrixActiveBid();
    });
});

function useBonusJoker(id) {
    const m = managers.find(x => x.id === id);
    if (m) {
        if (m.jokers.bonus <= 0) return showModal("Verbraucht", "Joker bereits benutzt.");
        m.jokers.bonus--; m.cashbackActive = true;
        addLog(`Bonus: ${m.name} sichert sich Rückzahlung.`, "event");
        renderMatrix(); showModal("💰 Bonus aktiviert!", `${m.name} erhält beim nächsten Objekt Geld zurück!`);
    }
}

function useAutoBuyJoker(id) {
    const m = managers.find(x => x.id === id); if (!m || m.jokers.autoBuy <= 0) return showModal("Verbraucht", "Joker bereits benutzt.");
    if (m.id === blockedPlayerId) return showModal("🚫 Blockiert!", "Du bist in Isolation!");
    const cat = activeMatrixAuctionCategory.toLowerCase(); if (m.team[cat]) return showModal("Voll!", "Platz bereits besetzt.");
    const list = itemDatabase[activeMatrixAuctionCategory]; if (!list || list.length === 0) return showModal("Katalog leer!", "Nichts mehr übrig.");
    showConfirmModal(`Item erzwingen für 1,5x Preis (${Config.categories[activeMatrixAuctionCategory]?.name})?`, () => {
        const item = list[Math.floor(Math.random() * list.length)]; const price = Math.floor(item.cost * getConf('mechanics','autoBuyMultiplier'));
        if (m.budget < price) return showModal("Zu teuer!", `Kostet ${price.toLocaleString()} ${Config.currency.symbol}. Budget reicht nicht.`);
        m.jokers.autoBuy--; let cbText = processPurchase(m, price, item, activeMatrixAuctionCategory);
        addLog(`Bestechung: ${m.name} holt Item für ${price.toLocaleString()}!`, "event");
        showModal("🎯 ERZWUNGEN!", `<strong>${m.name}</strong> schnappt sich blind <strong>${item.name}</strong> für <strong>${price.toLocaleString()} ${Config.currency.symbol}</strong>!${cbText}`);
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
        const c = activeMatrixAuctionItem.dbCategory || activeMatrixAuctionItem.type?.toUpperCase();
        const itemId = activeMatrixAuctionItem.id;
        const idx = itemDatabase[c]?.findIndex(x => x.id === itemId);
        if (idx !== undefined && idx !== -1) { shreddedDatabase.push(itemDatabase[c].splice(idx, 1)[0]); saveDatabases(); }
        addLog(`Gespült: ${m.name} vernichtet Objekt.`, "alert");

        const list = itemDatabase[activeMatrixAuctionCategory];
        if (list && list.length > 0) {
            const newItem = list[Math.floor(Math.random() * list.length)];
            activeMatrixAuctionItem = { ...newItem, type: activeMatrixAuctionCategory };
            
            if ($('matrix-active-bid-target')) $('matrix-active-bid-target').innerHTML = `<span class="text-xl">${newItem.icon}</span> ${newItem.name}`;
            if ($('matrix-active-bid-start-price')) $('matrix-active-bid-start-price').innerText = `Kosten: ${newItem.cost.toLocaleString()} ${Config.currency.symbol}`;
	    if ($('matrix-active-bid-desc')) $('matrix-active-bid-desc').innerHTML = getDynamicDescHtml(newItem);
            if ($('matrix-auction-price')) $('matrix-auction-price').value = newItem.cost;

            showModal("🚽 WEGGESPÜLT", `Das Objekt wurde vernichtet! Als Ersatzkarte wurde <strong>${newItem.name}</strong> aufgedeckt.`);
        } else {
            resetMatrixActiveBid();
            showModal("🚽 WEGGESPÜLT", "Das Objekt wurde vernichtet! Keine Karten mehr im globalen Katalog als Ersatz verfügbar.");
        }
    });
}

// =====================================================================
// JOKER-PHASE (MOD 4 ERWEITERUNGEN)
// =====================================================================
function openJokerPhase() {
    isJokerPhaseActive = true;
    jokerPhaseState = { blockUsed: false, autoBuyUsed: false };

    if (playerJokerOrder.length > 0) {
        let last = playerJokerOrder.pop();
        playerJokerOrder.unshift(last);
    }

    renderJokerPhaseModal();
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
    if (type === 'block' && !jokerPhaseState.blockUsed) {
        jokerPhaseState.blockUsed = true;
        useBlockJoker(mgrId);
    }
    if (type === 'autoBuy' && !jokerPhaseState.autoBuyUsed) {
        jokerPhaseState.autoBuyUsed = true;
        useAutoBuyJoker(mgrId);
    }
    if (type === 'bonus') useBonusJoker(mgrId);
    if (type === 'gamble') useGambleJoker(mgrId);
    
    renderJokerPhaseModal();
}

function closeJokerPhase() {
    isJokerPhaseActive = false;
    if ($('joker-phase-modal')) $('joker-phase-modal').classList.add('hidden');
}

// =====================================================================
// EVENTS ACTION EXECUTION
// =====================================================================
function getBaseEventChance() { const el = $('input-event-chance'); return el ? parseFloat(el.value) : 0.10; }
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
    if ($('event-modal-title')) $('event-modal-title').innerText = `📰 ${Config.terminology.eventTitle}`;
    if ($('event-modal-desc')) $('event-modal-desc').innerHTML = `<strong>${ev.title}</strong><br><br>${ev.desc}`;
    if ($('event-modal-result')) $('event-modal-result').innerHTML = executeEventLogic(ev);
    if ($('event-modal')) $('event-modal').classList.remove('hidden');
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
        case "destroy_random_category": let validCats = []; for (let c of activeCategories) { let catLow = c.toLowerCase(); if (managers.every(m => m.team[catLow] !== null && m.team[catLow] !== undefined)) validCats.push(catLow); } if (validCats.length === 0) return "Glück gehabt. Noch nichts zu konfiszieren."; let chosenCat = validCats[Math.floor(Math.random() * validCats.length)]; managers.forEach(m => { if (m.perk === 'perk1' && m.protegeCats.includes(chosenCat)) return; if (m.team[chosenCat]) { m.team[chosenCat].score = 0; m.team[chosenCat].tags = []; } }); return `💥 Razzia! Die Kategorie <strong>${Config.categories[chosenCat.toUpperCase()]?.name || chosenCat}</strong> wurde konfisziert. Items geben nun 0 Punkte!`;
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
    if ($('dutch-price')) $('dutch-price').innerText = dutchPrice.toLocaleString() + ` ${Config.currency.symbol}`;
    const c = $('dutch-buttons-container'); if (c) c.innerHTML = '';
    managers.forEach(m => { if (m.id !== blockedPlayerId && !m.team[cat.toLowerCase()] && c) c.innerHTML += `<button onclick="resolveDutchAuction(${m.id})" class="bg-orange-600 hover:bg-orange-500 text-white font-black py-2 px-3 rounded-lg text-xs shadow-md transition uppercase tracking-wide">💥 ${m.name} greift zu!</button>`; });
    if ($('dutch-modal')) $('dutch-modal').classList.remove('hidden');
    const drop = Math.floor(startingBudget * 0.05);
    if (dutchInterval) clearInterval(dutchInterval);
    dutchInterval = setInterval(() => { dutchPrice -= drop; if (dutchPrice < 0) dutchPrice = 0; if ($('dutch-price')) $('dutch-price').innerText = dutchPrice.toLocaleString() + ` ${Config.currency.symbol}`; }, 1500);
}

function resolveDutchAuction(mgrId) {
    clearInterval(dutchInterval); const m = managers.find(x => x.id === mgrId); if (!m) return;
    if (m.budget < dutchPrice) {
        showModal("Nicht genug!", `<strong>${m.name}</strong> hat nicht genug Budget! Es geht weiter.`);
        const drop = Math.floor(startingBudget * 0.05);
        dutchInterval = setInterval(() => { dutchPrice -= drop; if (dutchPrice < 0) dutchPrice = 0; if ($('dutch-price')) $('dutch-price').innerText = dutchPrice.toLocaleString() + ` ${Config.currency.symbol}`; }, 1500);
        return;
    }
    let cbText = processPurchase(m, dutchPrice, dutchItem, activeMatrixAuctionCategory);
    if ($('dutch-modal')) $('dutch-modal').classList.add('hidden');
    playAuctionAnimation(dutchPrice);
    addLog(`Zuschlag: ${m.name} sichert sich Ware für ${dutchPrice.toLocaleString()}!`, "buy");
    showModal("🔨 DEAL GERETTET!", `<strong>${m.name}</strong> sichert sich <strong>${dutchItem.name}</strong> für <strong>${dutchPrice.toLocaleString()}</strong>!${cbText}`);
    resetMatrixActiveBid();
}

// =====================================================================
// GLÜCKSRAD SYSTEM (ECHTES ROTIERENDES RAD MIT ZENTRALEM DRUCK)
// =====================================================================
function spinBonusWheelAll() {
    isHighRollerSession = false;
    if (!highRollerTriggered && Math.random() < 0.20) {
        highRollerTriggered = true; isHighRollerSession = true; addLog("Rad: Eskalation!", "event");
        showModal("🎰 FETTE BEUTE!", "Alle Nieten wurden entfernt und fette Boni hinzugefügt!", openWheelModal);
    } else { addLog("Roulette gestartet.", "info"); openWheelModal(); }
}

window.currentWheelPlayerIdx = 0;
window.wheelValuesPerPlayer = {};

function spinBonusWheelAll() {
    isHighRollerSession = false;
    if (!highRollerTriggered && Math.random() < 0.20) {
        highRollerTriggered = true; isHighRollerSession = true; addLog("Rad: Eskalation!", "event");
        showModal("🎰 FETTE BEUTE!", "Alle Nieten wurden entfernt und fette Boni hinzugefügt!", openWheelModal);
    } else { addLog("Roulette gestartet.", "info"); openWheelModal(); }
}

function openWheelModal() {
    wheelSpinResults = [];
    window.currentWheelPlayerIdx = 0;
    window.wheelValuesPerPlayer = {};
    
    if ($('wheel-close-btn')) $('wheel-close-btn').classList.add('hidden');
    
    const container = $('wheels-grid'); if (!container) return;
    
    container.className = 'relative w-full max-w-lg h-[400px] overflow-hidden flex items-center justify-center mb-6 mx-auto';
    container.innerHTML = '';

    managers.forEach(m => {
        let vals = [10000, 40000, 90000, 20000, 70000, 50000, -50000, 30000, 80000, 60000, 100000];
        if (isHighRollerSession) vals = [60000, 20000, 100000, 250000, 40000, 250000, 80000];
        vals.sort(() => Math.random() - 0.5); 
        window.wheelValuesPerPlayer[m.id] = vals;
    });

    managers.forEach((m, idx) => {
        let initialTransform = idx === 0 ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none';
        
        container.innerHTML += `
            <div id="wheel-card-${idx}" class="absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-in-out transform ${initialTransform}">
                <div class="glass-deal p-6 rounded-[2rem] flex flex-col items-center w-80 shadow-2xl relative bg-black/40 border-stone-500/30">
                    <div class="text-sm font-black text-orange-400 mb-5 tracking-widest uppercase w-full text-center drop-shadow-lg">${m.name}</div>
                    
                    <div class="absolute top-[52px] left-1/2 transform -translate-x-1/2 z-20 text-orange-500 text-2xl drop-shadow-[0_0_12px_rgba(249,115,22,1)]">
                        <i class="fa-solid fa-caret-down"></i>
                    </div>
                    
                    <div class="relative w-56 h-56 flex items-center justify-center bg-black/60 border-[3px] border-white/20 rounded-full shadow-[inset_0_4px_20px_rgba(0,0,0,0.8),0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-lg">
                        <canvas id="wheel-canvas-${m.id}" width="500" height="500" class="rounded-full w-full h-full" style="transform: rotate(0deg);"></canvas>
                        
                        <!-- Das große Pop-Up OVERlay über dem Rad (z-index hoch, absolute Mitte) -->
                        <div id="wheel-pop-result-${m.id}" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] opacity-0 scale-50 transition-all duration-300 pointer-events-none text-center whitespace-nowrap"></div>
                    </div>
                </div>
            </div>`;
    });

    setTimeout(() => {
        managers.forEach(m => {
            const canvas = $(`wheel-canvas-${m.id}`);
            if (canvas) drawRouletteWheel(canvas, window.wheelValuesPerPlayer[m.id]);
        });
    }, 50);

    updateCentralWheelButton();
    if ($('wheel-modal')) $('wheel-modal').classList.remove('hidden');
}

function drawRouletteWheel(canvas, values) {
    const ctx = canvas.getContext('2d');
    const numSegments = values.length;
    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < numSegments; i++) {
        const angle = (2 * Math.PI) / numSegments;
        const startAngle = i * angle - Math.PI / 2;
        const endAngle = startAngle + angle;
        
        ctx.beginPath();
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius, startAngle, endAngle);
        ctx.closePath();
        
        if (values[i] < 0) ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; 
        else if (values[i] === 250000) ctx.fillStyle = 'rgba(245, 158, 11, 0.5)'; 
        else ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)'; 
        
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.save();
        ctx.translate(radius, radius);
        ctx.rotate(startAngle + angle / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        ctx.font = 'bold 30px sans-serif'; 
        
        let val = values[i];
        let txt = '';
        
        if (val >= 1000) {
            txt = '+' + (val / 1000) + 'k';
            ctx.fillStyle = 'rgba(74, 222, 128, 1)'; 
            ctx.shadowColor = 'rgba(74, 222, 128, 0.8)';
        } else if (val <= -1000) {
            txt = (val / 1000) + 'k';
            ctx.fillStyle = 'rgba(248, 113, 113, 1)'; 
            ctx.shadowColor = 'rgba(248, 113, 113, 0.8)';
        } else {
            txt = val > 0 ? '+' + val : val.toString();
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        }
        
        if (val === 250000) {
            ctx.fillStyle = 'rgba(250, 204, 21, 1)';
            ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
        }

        ctx.shadowBlur = 12;
        ctx.fillText(txt, radius - 25, 0); 
        ctx.restore();
    }
}

function updateCentralWheelButton() {
    const btn = $('wheel-spin-all-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
    let m = managers[window.currentWheelPlayerIdx];
    if (m) {
        btn.innerHTML = `<i class="fa-solid fa-play mr-1"></i> Drehen für ${m.name}`;
        btn.onclick = () => spinCurrentPlayerWheel(m.id);
    }
}

function spinCurrentPlayerWheel(mgrId) {
    const btn = $('wheel-spin-all-btn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.innerText = "Das Rad dreht...";

    const m = managers.find(x => x.id === mgrId);
    if (!m) return;

    const vals = window.wheelValuesPerPlayer[m.id];
    const winValue = vals[Math.floor(Math.random() * vals.length)];
    const wIdx = vals.indexOf(winValue);
    
    const numSegments = vals.length;
    const segmentAngleRad = (2 * Math.PI) / numSegments;
    
    const totalRotationRad = (12 * Math.PI) - (wIdx * segmentAngleRad + segmentAngleRad / 2);
    const totalRotationDeg = (totalRotationRad * 180) / Math.PI;
    
    const canvas = $(`wheel-canvas-${m.id}`);
    if (canvas) {
        canvas.style.transition = 'transform 2s cubic-bezier(0.15, 0.85, 0.3, 1)';
        canvas.style.transform = `rotate(${totalRotationDeg}deg)`;
    }
    
    const popContainer = $(`wheel-pop-result-${m.id}`);
    
    setTimeout(() => {
        let actualWin = applyBudgetChange(m, winValue, "wheel");
        wheelSpinResults.push({ managerId: m.id, amount: actualWin });
        addLog(`Rad: ${m.name} bekommt ${actualWin >= 0 ? '+' : ''}${actualWin.toLocaleString()} ${Config.currency.symbol}`, actualWin >= 0 ? "buy" : "alert");
        
        if (popContainer) {
            let txt = '';
            if (winValue >= 1000) txt = '+' + (winValue / 1000) + 'k';
            else if (winValue <= -1000) txt = (winValue / 1000) + 'k';
            else txt = winValue > 0 ? '+' + winValue : winValue.toString();
            
            popContainer.innerText = txt + ' ' + (Config.currency?.symbol || '🚬');
            
            // Color and styling depending on result
            let colorClass = winValue >= 0 ? 'text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.8)] border-green-500/50' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] border-red-500/50';
            if (winValue === 250000) colorClass = 'text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,1)] border-yellow-500/50';
            
            // Base classes for the pop-up panel
            const baseClasses = 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-black/80 rounded-xl px-5 py-3 border-2 backdrop-blur-md pointer-events-none flex items-center justify-center whitespace-nowrap font-black text-5xl';
            
            popContainer.className = `${baseClasses} ${colorClass} opacity-100 scale-125 transition-all duration-300`;
            
            setTimeout(() => {
                popContainer.classList.remove('scale-125');
                popContainer.classList.add('scale-110');
                
                setTimeout(() => prepareNextWheelAction(), 400);
            }, 400);
        } else {
            setTimeout(() => prepareNextWheelAction(), 400);
        }
    }, 2100);
}

function prepareNextWheelAction() {
    const btn = $('wheel-spin-all-btn');
    if (!btn) return;
    
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    
    if (window.currentWheelPlayerIdx < managers.length - 1) {
        let nextPlayer = managers[window.currentWheelPlayerIdx + 1];
        btn.innerHTML = `Weiter zu ${nextPlayer.name} <i class="fa-solid fa-arrow-right ml-1"></i>`;
        btn.onclick = () => slideToNextPlayerWheel();
    } else {
        btn.classList.add('hidden');
        if ($('wheel-close-btn')) $('wheel-close-btn').classList.remove('hidden');
    }
}

function slideToNextPlayerWheel() {
    const currentCard = $(`wheel-card-${window.currentWheelPlayerIdx}`);
    window.currentWheelPlayerIdx++;
    const nextCard = $(`wheel-card-${window.currentWheelPlayerIdx}`);
    
    if (currentCard && nextCard) {
        currentCard.classList.remove('translate-x-0', 'opacity-100');
        currentCard.classList.add('-translate-x-full', 'opacity-0', 'pointer-events-none');
        
        nextCard.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
        nextCard.classList.add('translate-x-0', 'opacity-100');
    }
    
    setTimeout(() => { updateCentralWheelButton(); }, 300);
}

function closeWheelModal() {
    if ($('wheel-modal')) $('wheel-modal').classList.add('hidden');
    renderMatrix();
    updateBuyerDropdown();
    
    wheelSpinResults.forEach(res => {
        animateBudgetLeftToRight(res.managerId, res.amount);
    });
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
        setTimeout(() => el.remove(), 2100);
    }
}


function animateBudgetLeftToRight(id, amt) {
    let cell = $(`budget-display-${id}`);
    if (cell) {
        let el = document.createElement('div');
        const pos = amt >= 0;
        el.className = `absolute left-0 right-0 top-2 text-center font-black text-xl pointer-events-none z-[120] whitespace-nowrap animate-fly-left-right ${pos ? 'text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`;
        el.innerText = `${pos ? '+' : ''}${amt.toLocaleString()} ${Config.currency.symbol}`;
        cell.parentElement.appendChild(el);
        setTimeout(() => el.remove(), 2100);
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
    for (let cat in itemDatabase) itemDatabase[cat].forEach(item => { if (item.name.toLowerCase().includes(lq) || item.desc.toLowerCase().includes(lq) || (item.tags && item.tags.some(t => t.toLowerCase().includes(lq) || ('#' + t.toLowerCase()).includes(lq)))) matches.push({ ...item, type: cat }); });
    if (matches.length === 0) { resC.innerHTML = '<li class="p-2 text-[10px] text-stone-500 italic text-center">Nichts gefunden</li>'; resC.classList.remove('hidden'); return; }
    resC.innerHTML = ''; matches.slice(0, 8).forEach(m => { resC.innerHTML += `<li onclick="selectManualMatrixCard('${m.id}', '${m.type}')" class="p-2 border-b border-stone-700/50 hover:bg-stone-700 cursor-pointer transition flex items-center gap-2"><span class="text-base">${m.icon}</span><div class="flex flex-col overflow-hidden"><span class="text-[10px] font-bold text-white truncate w-full">${m.name}</span><span class="text-[8px] text-yellow-400 font-bold">ab ${m.cost.toLocaleString()} ${Config.currency.symbol}</span></div></li>`; });
    resC.classList.remove('hidden');
}

function selectManualMatrixCard(id, cat) {
    if (blindDrawsLeft > 0) return;
    selectMatrixAuctionCategory(cat);
    const item = itemDatabase[cat]?.find(x => x.id === id); if (!item) return;
    activeMatrixAuctionItem = { ...item, type: cat };
    if ($('matrix-active-bid-target')) $('matrix-active-bid-target').innerHTML = `<span class="text-xl">${item.icon}</span> ${item.name}`;
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
        
        let cIdx = activeCategories.findIndex(c => c.toLowerCase() === cat.toLowerCase());
        if (cIdx !== -1 && cIdx < activeCategories.length - 1) {
            let nextCat = activeCategories[cIdx + 1];
            setTimeout(() => {
                selectMatrixAuctionCategory(nextCat);
                addLog(`Kategorie voll! Automatischer Wechsel zu ${Config.categories[nextCat]?.name || nextCat}.`, "info");
            }, 1500);
        }
    } 
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
        let basePoints = 0, tagCounts = {}; m.loserBonusText = "";
        for (let cat in m.team) {
            let p = m.team[cat];
            if (p) {
                let pScore = p.score || 0;
                if (m.perk === 'perk1' && m.protegeCats && m.protegeCats.includes(cat)) pScore = Math.floor(pScore * 1.5);
                if (m.perk === 'perk3' && p.tier === 'schlecht') pScore = Math.floor(pScore * 1.5);
                if (m.perk === 'perk8') pScore += 10;
                basePoints += pScore;
                if (p.tags && Array.isArray(p.tags)) p.tags.forEach(t => { tagCounts[t.trim()] = (tagCounts[t.trim()] || 0) + 1; });
            }
        }
        let syn = 0; for (let t in tagCounts) if (tagCounts[t] > 1) syn += (tagCounts[t] - 1) * 2;
        m.totalPoints = basePoints + syn;
        if (m.perk === 'perk2') { let rendite = Math.floor(m.budget / 20000) * 5; m.totalPoints += rendite; if (rendite > 0) m.loserBonusText += `+${rendite} (Spar-Bonus)`; }
    });
    let loser = managers.reduce((min, m) => m.totalPoints < min.totalPoints ? m : min, managers[0]);
    if (loser.totalPoints > 0) { let bonus = Math.floor(loser.totalPoints * 0.15); loser.totalPoints += bonus; loser.loserBonusText = loser.loserBonusText ? loser.loserBonusText + `, +${bonus} (Mitleid)` : `+${bonus} (Mitleid)`; }
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
    for (let i = 0; i < 150; i++) { let c = document.createElement('div'); c.className = 'confetti-piece'; c.style.left = Math.random() * 100 + 'vw'; c.style.backgroundColor = cols[Math.floor(Math.random() * cols.length)]; c.style.animationDuration = (Math.random() * 3 + 2) + 's'; c.style.animationDelay = (Math.random() * 2) + 's'; cont.appendChild(c); }
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
