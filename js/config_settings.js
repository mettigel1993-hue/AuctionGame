// =====================================================================
// ZENTRALE SPIEL-EINSTELLUNGEN (Slider-Ready)
// =====================================================================
const GameSettings = {
    // 1. Ökonomie & Basiswerte
    economy: {
        startingBudget: { value: 1000000, min: 100000, max: 5000000, step: 50000, label: "Startkapital" },
        biddingStep: { value: 5000, min: 1000, max: 50000, step: 1000, label: "Biet-Schrittweite" },
        defaultPlayerCount: { value: 4, min: 1, max: 8, step: 1, label: "Spieleranzahl" }
    },

    // 2. Spielmechaniken & Wahrscheinlichkeiten
    mechanics: {
        baseEventChance: { value: 0.10, min: 0.0, max: 1.0, step: 0.05, label: "Basis-Event-Chance" },
        autoBuyMultiplier: { value: 1.5, min: 1.0, max: 3.0, step: 0.1, label: "Preis-Faktor (Bestechen-Joker)" },
        bonusCashbackFraction: { value: 0.10, min: 0.05, max: 0.50, step: 0.01, label: "Cashback-Quote (Schutz-Joker)" },
        blindWinCostFraction: { value: 0.5, min: 0.1, max: 1.0, step: 0.1, label: "Kostenanteil bei Blindflug-Sieg" }
    },

    // 3. Glücksrad (Roulette)
    roulette: {
        highRollerChance: { value: 0.20, min: 0.0, max: 1.0, step: 0.05, label: "Eskalations-Wahrscheinlichkeit" },
        spinDurationMs: { value: 4000, min: 1000, max: 9000, step: 250, label: "Drehdauer pro Spieler (ms)" }
    },

    // 4. Notverkauf (Dutch Auction)
    dutchAuction: {
        priceDropFraction: { value: 0.05, min: 0.01, max: 0.20, step: 0.01, label: "Preisverfall pro Tick" },
        tickIntervalMs: { value: 1500, min: 500, max: 3000, step: 100, label: "Tick-Intervall (ms)" }
    },

    // 6. Perk-Balancing (Spezialfähigkeiten)
    perks: {
        perk1_protegeMultiplier: { value: 1.5, min: 1.0, max: 3.0, step: 0.1, label: "Punkte-Multiplikator (Protegé)" },
        perk2_interestDivisor: { value: 20000, min: 5000, max: 100000, step: 5000, label: "Rendite: Budget-Teiler" },
        perk2_interestMultiplier: { value: 5, min: 1, max: 20, step: 1, label: "Rendite: Punkte-Faktor" },
        perk3_badTierMultiplier: { value: 1.5, min: 1.0, max: 3.0, step: 0.1, label: "Punkte-Multi (Clown/Schrott)" },
        perk4_budgetMultiplier: { value: 0.75, min: 0.1, max: 1.0, step: 0.05, label: "Startbudget-Faktor (Sparer)" },
        perk4_incomeMultiplier: { value: 1.25, min: 1.0, max: 3.0, step: 0.05, label: "Zusatzeinnahmen-Faktor" },
        perk5_gambleChoices: { value: 3, min: 2, max: 5, step: 1, label: "Auswahlkarten beim Schmuggel" },
        perk6_wheelBonusMultiplier: { value: 1.10, min: 1.0, max: 2.0, step: 0.05, label: "Glücksrad-Bonus-Faktor" },
        perk7_startingBlocks: { value: 2, min: 1, max: 5, step: 1, label: "Start-Anzahl Block-Joker" },
        perk8_flatScoreBonus: { value: 10, min: 0, max: 50, step: 1, label: "Flat Punkte-Bonus (pro Karte)" }
    },

    // 7. Benutzeroberfläche & Animationen
    ui: {
        baseFontSize: { value: 16, min: 12, max: 24, step: 1, label: "Basis-Schriftgröße (px)" },
        confettiCount: { value: 150, min: 0, max: 500, step: 10, label: "Konfetti-Anzahl" },
        auctionHammerDuration: { value: 5000, min: 1500, max: 9000, step: 250, label: "Auktions-Animation (ms)" },
        budgetFloatDuration: { value: 1500, min: 500, max: 3000, step: 100, label: "Zahlen-Flug Animation (ms)" }
    }
};

// =====================================================================
// GLOBALE HELPER-FUNKTION FÜR DEN ZUGRIFF
// =====================================================================
// Damit du im Code nicht immer "GameSettings.economy.startingBudget.value" schreiben musst,
// nutzen wir diese kleine Abkürzung:
const getConf = (category, key) => GameSettings[category][key].value;