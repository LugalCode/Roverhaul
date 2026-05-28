/**
 * UIManager - Manages DOM events, HUD overlays, database logs, and dashboard updates
 */
export class UIManager {
    constructor(state, canvasEngine) {
        this.state = state;
        this.canvasEngine = canvasEngine;
        // Cache DOM elements
        this.cacheElements();
        // UI Event Listeners
        this.bindEvents();
        // Track already logged unlock milestones to prevent duplicate console alerts
        this.unlockedMilestones = {
            m100: false,
            m300: false,
            m600: false
        };
    }
    cacheElements() {
        // Navigation Views
        this.btnWasteland = document.getElementById('btn-view-wasteland');
        this.btnBase = document.getElementById('btn-view-base');
        this.screenWasteland = document.getElementById('screen-wasteland');
        this.screenBase = document.getElementById('screen-base');
        // Base Tabs
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        // Hangar Upgrades
        this.upgradeBtns = {
            treads: document.getElementById('btn-up-treads'),
            laser: document.getElementById('btn-up-laser'),
            cargo: document.getElementById('btn-up-cargo'),
            battery: document.getElementById('btn-up-battery')
        };
        this.levelLabels = {
            treads: document.getElementById('lvl-treads'),
            laser: document.getElementById('lvl-laser'),
            cargo: document.getElementById('lvl-cargo'),
            battery: document.getElementById('lvl-battery')
        };
        this.statLabels = {
            treadsCurr: document.getElementById('stat-treads-curr'),
            treadsNext: document.getElementById('stat-treads-next'),
            laserCurr: document.getElementById('stat-laser-curr'),
            laserNext: document.getElementById('stat-laser-next'),
            cargoCurr: document.getElementById('stat-cargo-curr'),
            cargoNext: document.getElementById('stat-cargo-next'),
            batteryCurr: document.getElementById('stat-battery-curr'),
            batteryNext: document.getElementById('stat-battery-next')
        };
        this.costLabels = {
            treads: document.getElementById('cost-treads'),
            laser: document.getElementById('cost-laser'),
            cargo: document.getElementById('cost-cargo'),
            battery: document.getElementById('cost-battery')
        };
        // Refinery Panels
        this.btnRefineMetal = document.getElementById('btn-refine-metal');
        this.btnRefineBiomatter = document.getElementById('btn-refine-biomatter');
        this.refRawMetal = document.getElementById('ref-raw-metal');
        this.refRawBiomatter = document.getElementById('ref-raw-biomatter');
        this.refAlloys = document.getElementById('ref-alloys');
        this.refBiofuel = document.getElementById('ref-biofuel');
        
        // Automation Purchases
        this.btnAutoMetal = document.getElementById('btn-auto-metal');
        this.btnAutoBiomatter = document.getElementById('btn-auto-biomatter');
        this.lblAutoMetal = document.getElementById('lbl-auto-metal');
        this.lblAutoBiomatter = document.getElementById('lbl-auto-biomatter');
        this.costAutoMetal = document.getElementById('cost-auto-metal');
        this.costAutoBiomatter = document.getElementById('cost-auto-biomatter');
        // Global Resources HUD
        this.hudRawMetal = document.getElementById('hud-raw-metal');
        this.hudRawBiomatter = document.getElementById('hud-raw-biomatter');
        this.hudAlloys = document.getElementById('hud-alloys');
        this.hudBiofuel = document.getElementById('hud-biofuel');
        // Expedition Screen HUD Overlay
        this.hudTxtDistance = document.getElementById('hud-txt-distance');
        this.hudTxtSpeed = document.getElementById('hud-txt-speed');
        this.hudTxtCargo = document.getElementById('hud-txt-cargo');
        this.hudTxtPower = document.getElementById('hud-txt-power');
        this.hudPowerFill = document.getElementById('hud-power-fill');
        this.hudTxtStatus = document.getElementById('hud-txt-status');
        this.activeClickPrompt = document.getElementById('active-click-prompt');
        // Expedition Controls
        this.btnDeploy = document.getElementById('btn-control-deploy');
        this.btnRecall = document.getElementById('btn-control-recall');
        // General System
        this.txtUptime = document.getElementById('txt-uptime');
        this.consoleLog = document.getElementById('console-log');
        this.btnClearConsole = document.getElementById('btn-clear-console');
        // Archive / Reliquary
        this.archiveItems = document.querySelectorAll('.archive-item');
        this.archiveViewer = document.getElementById('archive-viewer');
    }
    bindEvents() {
        // 1. Navigation View Screen Switching
        this.btnWasteland.addEventListener('click', () => {
            this.btnWasteland.classList.add('active');
            this.btnBase.classList.remove('active');
            this.screenWasteland.classList.add('active');
            this.screenBase.classList.remove('active');
            // Force canvas resize on display
            if (this.canvasEngine) {
                this.canvasEngine.resize();
            }
        });
        this.btnBase.addEventListener('click', () => {
            this.btnBase.classList.add('active');
            this.btnWasteland.classList.remove('active');
            this.screenBase.classList.add('active');
            this.screenWasteland.classList.remove('active');
        });
        // 2. Base Facility Dashboard Sub-tabs
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.tabBtns.forEach(b => b.classList.remove('active'));
                this.tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                const targetTabId = btn.getAttribute('data-tab');
                document.getElementById(targetTabId).classList.add('active');
            });
        });
        // 3. Buy Hangar Upgrades
        Object.keys(this.upgradeBtns).forEach(type => {
            this.upgradeBtns[type].addEventListener('click', () => {
                this.state.buyUpgrade(type);
            });
        });
        // 4. Refine commands
        this.btnRefineMetal.addEventListener('click', () => {
            this.state.refineMetal();
        });
        this.btnRefineBiomatter.addEventListener('click', () => {
            this.state.refineBiomatter();
        });
        // 5. Buy Automation
        this.btnAutoMetal.addEventListener('click', () => {
            this.state.buyAutoRefinery('autoMetal');
        });
        this.btnAutoBiomatter.addEventListener('click', () => {
            this.state.buyAutoRefinery('autoBiomatter');
        });
        // 6. Deploy & Recall buttons
        this.btnDeploy.addEventListener('click', () => {
            this.state.deployRover();
        });
        this.btnRecall.addEventListener('click', () => {
            this.state.recallRover();
        });
        // 7. Clear terminal logs
        this.btnClearConsole.addEventListener('click', () => {
            this.consoleLog.innerHTML = `<div class="log-line system-line">[${this.formatTime(this.state.uptime)}] TERMINAL LOG CLEARED.</div>`;
        });
        // 8. Active click on Canvas viewport to harvest faster
        const canvas = document.getElementById('game-canvas');
        canvas.addEventListener('click', () => {
            if (this.state.expedition.status === 'HARVESTING') {
                this.state.activeClickHarvest();
            }
        });
        // 9. Reliquary database entry clicks
        this.archiveItems.forEach(item => {
            item.addEventListener('click', () => {
                if (item.classList.contains('locked')) return;
                // Active tab styling
                this.archiveItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                // Switch document entries
                const entryId = item.getAttribute('data-log');
                const entries = this.archiveViewer.querySelectorAll('.archive-entry');
                entries.forEach(e => e.classList.add('hidden'));
                document.getElementById(entryId).classList.remove('hidden');
            });
        });
    }
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    // Appends notifications to the sliding bottom log container
    addLogLine(message, type) {
        const timeStr = this.formatTime(this.state.uptime);
        const line = document.createElement('div');
        line.className = `log-line ${type}-line`;
        line.innerText = `[${timeStr}] ${message}`;
        this.consoleLog.appendChild(line);
        // Scroll bottom
        this.consoleLog.scrollTop = this.consoleLog.scrollHeight;
        // Limit log lines in DOM
        if (this.consoleLog.children.length > 100) {
            this.consoleLog.removeChild(this.consoleLog.firstChild);
        }
    }
    updateUI() {
        // 1. Uptime clock
        this.txtUptime.innerText = this.formatTime(this.state.uptime);
        // 2. Global resources HUD
        this.hudRawMetal.innerText = Math.floor(this.state.rawMetal);
        this.hudRawBiomatter.innerText = Math.floor(this.state.rawBiomatter);
        this.hudAlloys.innerText = Math.floor(this.state.alloys);
        this.hudBiofuel.innerText = Math.floor(this.state.biofuel);
        // 3. Refinery Sub-panel inventories
        this.refRawMetal.innerText = Math.floor(this.state.rawMetal);
        this.refRawBiomatter.innerText = Math.floor(this.state.rawBiomatter);
        this.refAlloys.innerText = Math.floor(this.state.alloys);
        this.refBiofuel.innerText = Math.floor(this.state.biofuel);
        // Enabled/disable refine manual buttons
        this.btnRefineMetal.disabled = this.state.rawMetal < 10;
        this.btnRefineBiomatter.disabled = this.state.rawBiomatter < 10;
        // 4. Hangar upgrades dashboard values
        const alloyCount = this.state.alloys;
        
        Object.keys(this.upgradeBtns).forEach(type => {
            const cost = this.state.getUpgradeCost(type);
            const lvl = this.state.upgrades[type];
            
            this.levelLabels[type].innerText = `Lvl ${lvl}`;
            this.costLabels[type].innerText = cost;
            this.upgradeBtns[type].disabled = alloyCount < cost;
        });
        // Locomotion System Labels
        this.statLabels.treadsCurr.innerText = `${this.state.speed.toFixed(1)} m/s`;
        this.statLabels.treadsNext.innerText = `${(this.state.speed + 0.8).toFixed(1)} m/s`;
        // Laser Drilling Labels
        // base drill time = 3.0s, divided by multiplier
        const currDrill = (3.0 / this.state.drillRateMultiplier).toFixed(2);
        const nextDrill = (3.0 / (1.0 + (this.state.upgrades.laser) * 0.35)).toFixed(2);
        this.statLabels.laserCurr.innerText = `${currDrill}s`;
        this.statLabels.laserNext.innerText = `${nextDrill}s`;
        // Cargo capacity labels
        this.statLabels.cargoCurr.innerText = `${this.state.maxCargo} units`;
        
        // Find next cargo capacity
        const scaleCargo = [0, 20, 32, 50, 80, 120, 180, 270, 400, 600];
        let nextCargo = 20 + this.state.upgrades.cargo * 20;
        if (this.state.upgrades.cargo + 1 < scaleCargo.length) {
            nextCargo = scaleCargo[this.state.upgrades.cargo + 1];
        }
        this.statLabels.cargoNext.innerText = `${nextCargo} units`;
        // Battery capacity labels
        this.statLabels.batteryCurr.innerText = `${this.state.maxPower} EP`;
        const scaleBatt = [0, 100, 140, 200, 280, 380, 500, 650, 820, 1000];
        let nextBatt = 100 + this.state.upgrades.battery * 50;
        if (this.state.upgrades.battery + 1 < scaleBatt.length) {
            nextBatt = scaleBatt[this.state.upgrades.battery + 1];
        }
        this.statLabels.batteryNext.innerText = `${nextBatt} EP`;
        // 5. Auto Refinery options
        const biofuelCount = this.state.biofuel;
        const autoCost = this.state.getAutoRefineryCost();
        // Auto Metal Purchase
        if (this.state.automation.autoMetal) {
            this.btnAutoMetal.disabled = true;
            this.btnAutoMetal.innerText = "ACTIVE";
            this.lblAutoMetal.innerHTML = "<span class='green-text'>ONLINE</span>";
        } else {
            this.btnAutoMetal.disabled = biofuelCount < autoCost;
            this.costAutoMetal.innerText = autoCost;
            this.lblAutoMetal.innerHTML = "<span class='color-text-dim'>OFFLINE</span>";
        }
        // Auto Biomass Purchase
        if (this.state.automation.autoBiomatter) {
            this.btnAutoBiomatter.disabled = true;
            this.btnAutoBiomatter.innerText = "ACTIVE";
            this.lblAutoBiomatter.innerHTML = "<span class='green-text'>ONLINE</span>";
        } else {
            this.btnAutoBiomatter.disabled = biofuelCount < autoCost;
            this.costAutoBiomatter.innerText = autoCost;
            this.lblAutoBiomatter.innerHTML = "<span class='color-text-dim'>OFFLINE</span>";
        }
        // 6. Expedition Control Button toggling
        const exp = this.state.expedition;
        if (exp.active) {
            this.btnDeploy.disabled = true;
            this.btnDeploy.classList.add('locked');
            this.btnDeploy.innerText = "EXPLORING WASTE...";
            if (exp.status === 'RECALLING') {
                this.btnRecall.disabled = true;
                this.btnRecall.innerText = "RECALL ACTIVE";
            } else {
                this.btnRecall.disabled = false;
                this.btnRecall.classList.remove('locked');
                this.btnRecall.innerText = "RECALL TO SHIP";
            }
        } else {
            this.btnDeploy.disabled = false;
            this.btnDeploy.classList.remove('locked');
            this.btnDeploy.innerText = "DEPLOY ROVER";
            this.btnRecall.disabled = true;
            this.btnRecall.classList.add('locked');
            this.btnRecall.innerText = "RECALL TO SHIP";
        }
        // 7. Wasteland View overlay text readouts
        if (exp.active) {
            this.hudTxtDistance.innerText = `${exp.distance.toFixed(1)}m`;
            
            // Speed indicator
            if (exp.status === 'DRIVING') {
                this.hudTxtSpeed.innerText = `${this.state.speed.toFixed(1)} m/s`;
                this.hudTxtStatus.innerText = "DRIVING";
            } else if (exp.status === 'HARVESTING') {
                this.hudTxtSpeed.innerText = "0.0 m/s";
                this.hudTxtStatus.innerText = "DRILLING TARGET";
            } else if (exp.status === 'RECALLING') {
                this.hudTxtSpeed.innerText = `-${(this.state.speed * 4).toFixed(1)} m/s`;
                this.hudTxtStatus.innerText = "RETRIEVAL ACTIVE";
            }
            
            this.hudTxtCargo.innerText = `${this.state.currentCargoCount} / ${this.state.maxCargo}`;
            
            // Power core percentage
            const powerPct = (exp.power / this.state.maxPower) * 100;
            this.hudTxtPower.innerText = `${Math.ceil(powerPct)}%`;
            this.hudPowerFill.style.width = `${powerPct}%`;
            if (powerPct < 25) {
                this.hudPowerFill.classList.add('critical');
            } else {
                this.hudPowerFill.classList.remove('critical');
            }
            // Click prompt during drilling
            if (exp.status === 'HARVESTING') {
                this.activeClickPrompt.classList.remove('hidden');
            } else {
                this.activeClickPrompt.classList.add('hidden');
            }
        } else {
            this.hudTxtDistance.innerText = "0.0m";
            this.hudTxtSpeed.innerText = "STANDBY";
            this.hudTxtCargo.innerText = `0 / ${this.state.maxCargo}`;
            this.hudTxtPower.innerText = "0%";
            this.hudPowerFill.style.width = "0%";
            this.hudTxtStatus.innerText = "STANDBY";
            this.activeClickPrompt.classList.add('hidden');
        }
        // 8. Handle Archive/Reliquary unlocks based on total distance explored
        const dist = this.state.totalDistance;
        if (dist >= 100 && !this.unlockedMilestones.m100) {
            this.unlockedMilestones.m100 = true;
            document.getElementById('log-item-1').classList.remove('locked');
            this.addLogLine("DATABASE UNLOCKED: Archive log fragment decrypter recovered at 100m milestone.", "success");
        }
        if (dist >= 300 && !this.unlockedMilestones.m300) {
            this.unlockedMilestones.m300 = true;
            document.getElementById('log-item-2').classList.remove('locked');
            this.addLogLine("DATABASE UNLOCKED: Neural spore scans decrypted at 300m milestone.", "success");
        }
        if (dist >= 600 && !this.unlockedMilestones.m600) {
            this.unlockedMilestones.m600 = true;
            document.getElementById('log-item-3').classList.remove('locked');
            this.addLogLine("DATABASE UNLOCKED: Biomechanical monolith archives decyphered at 600m milestone.", "success");
        }
    }
}
