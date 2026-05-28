/**
 * GameState - Core state and simulation engine for ROVERHAUL
 */
export class GameState {
    constructor() {
        // Base state variables
        this.rawMetal = 0;
        this.rawBiomatter = 0;
        this.alloys = 0;
        this.biofuel = 0;
        
        // Upgrade levels (1-indexed)
        this.upgrades = {
            treads: 1,  // Locomotion
            laser: 1,   // Drill/Utility Mount
            cargo: 1,   // Chassis Capacity
            battery: 1   // Power Core Capacity
        };
        // Automated refiners
        this.automation = {
            autoMetal: false,
            autoBiomatter: false
        };
        // Expedition stats
        this.expedition = {
            active: false,
            status: 'STANDBY', // STANDBY, DRIVING, HARVESTING, RECALLING
            distance: 0,       // in meters
            power: 0,          // current EP
            cargoMetal: 0,
            cargoBiomatter: 0,
            obstacle: null,
            nextObstacleDist: 0,
            recallTimeLeft: 0, // for background recall timing
            activeDrills: []   // for animations
        };
        this.uptime = 0;
        this.totalDistance = 0;
        // Callbacks for UI updates and logging
        this.onLogCallback = null;
        this.onStateChangeCallback = null;
        // Auto-refine timer accumulators
        this.autoMetalAccumulator = 0;
        this.autoBiomatterAccumulator = 0;
    }
    // Load state from local storage or set defaults
    init(onLog, onStateChange) {
        this.onLogCallback = onLog;
        this.onStateChangeCallback = onStateChange;
        const saved = localStorage.getItem('roverhaul_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.rawMetal = data.rawMetal ?? 0;
                this.rawBiomatter = data.rawBiomatter ?? 0;
                this.alloys = data.alloys ?? 0;
                this.biofuel = data.biofuel ?? 0;
                this.uptime = data.uptime ?? 0;
                this.totalDistance = data.totalDistance ?? 0;
                
                if (data.upgrades) {
                    this.upgrades.treads = data.upgrades.treads ?? 1;
                    this.upgrades.laser = data.upgrades.laser ?? 1;
                    this.upgrades.cargo = data.upgrades.cargo ?? 1;
                    this.upgrades.battery = data.upgrades.battery ?? 1;
                }
                if (data.automation) {
                    this.automation.autoMetal = data.automation.autoMetal ?? false;
                    this.automation.autoBiomatter = data.automation.autoBiomatter ?? false;
                }
                // If saved while in an active expedition, safely reset them to base
                // but refund resources in their cargo if any, to avoid frustration.
                if (data.expedition && data.expedition.active) {
                    this.rawMetal += data.expedition.cargoMetal ?? 0;
                    this.rawBiomatter += data.expedition.cargoBiomatter ?? 0;
                    this.log(`Emergency cargo recovery loaded: +${data.expedition.cargoMetal ?? 0} Scrap, +${data.expedition.cargoBiomatter ?? 0} Biomatter.`, 'system');
                }
            } catch (e) {
                console.error("Failed to load save state:", e);
                this.log("WARNING: Corrupted database file detected. Restoring defaults.", "danger");
            }
        }
        this.save();
        this.triggerStateChange();
    }
    save() {
        const data = {
            rawMetal: this.rawMetal,
            rawBiomatter: this.rawBiomatter,
            alloys: this.alloys,
            biofuel: this.biofuel,
            upgrades: this.upgrades,
            automation: this.automation,
            uptime: this.uptime,
            totalDistance: this.totalDistance,
            expedition: {
                active: this.expedition.active,
                cargoMetal: this.expedition.cargoMetal,
                cargoBiomatter: this.expedition.cargoBiomatter
            }
        };
        localStorage.setItem('roverhaul_save', JSON.stringify(data));
    }
    log(message, type = 'system') {
        if (this.onLogCallback) {
            this.onLogCallback(message, type);
        }
    }
    triggerStateChange() {
        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(this);
        }
    }
    // Getters for computed upgrade properties
    get speed() {
        // base 3.0 m/s, +0.8 m/s per level
        return 3.0 + (this.upgrades.treads - 1) * 0.8;
    }
    get maxCargo() {
        // level 1 = 20, levels scale up
        const scale = [0, 20, 32, 50, 80, 120, 180, 270, 400, 600];
        if (this.upgrades.cargo < scale.length) {
            return scale[this.upgrades.cargo];
        }
        return 20 + (this.upgrades.cargo - 1) * 20;
    }
    get maxPower() {
        // level 1 = 100 EP, scales up
        const scale = [0, 100, 140, 200, 280, 380, 500, 650, 820, 1000];
        if (this.upgrades.battery < scale.length) {
            return scale[this.upgrades.battery];
        }
        return 100 + (this.upgrades.battery - 1) * 50;
    }
    get drillRateMultiplier() {
        // base 1.0, increases with laser upgrades
        return 1.0 + (this.upgrades.laser - 1) * 0.35;
    }
    get currentCargoCount() {
        return this.expedition.cargoMetal + this.expedition.cargoBiomatter;
    }
    // Upgrade Cost Formulas (returns cost in Alloys)
    getUpgradeCost(type) {
        const lvl = this.upgrades[type];
        const baseCosts = {
            treads: 15,
            laser: 25,
            cargo: 20,
            battery: 30
        };
        const multipliers = {
            treads: 1.5,
            laser: 1.6,
            cargo: 1.5,
            battery: 1.55
        };
        return Math.floor(baseCosts[type] * Math.pow(multipliers[type], lvl - 1));
    }
    buyUpgrade(type) {
        if (!this.upgrades.hasOwnProperty(type)) return false;
        
        const cost = this.getUpgradeCost(type);
        if (this.alloys >= cost) {
            this.alloys -= cost;
            this.upgrades[type]++;
            this.log(`UPGRADE: Purchased ${type} modification (Lvl ${this.upgrades[type]}).`, 'success');
            this.save();
            this.triggerStateChange();
            return true;
        }
        return false;
    }
    // Auto Refining Upgrades
    getAutoRefineryCost() {
        return 5; // Fixed cost of 5 Bio-Fuel for demo simplicity
    }
    buyAutoRefinery(type) {
        if (!this.automation.hasOwnProperty(type)) return false;
        if (this.automation[type]) return false; // Already bought
        const cost = this.getAutoRefineryCost();
        if (this.biofuel >= cost) {
            this.biofuel -= cost;
            this.automation[type] = true;
            this.log(`AUTOMATION: Activated automated refinery subroutine for ${type === 'autoMetal' ? 'Metal' : 'Biomass'}.`, 'success');
            this.save();
            this.triggerStateChange();
            return true;
        }
        return false;
    }
    // Refinery Operations
    refineMetal() {
        if (this.rawMetal >= 10) {
            this.rawMetal -= 10;
            this.alloys += 1;
            this.log("REFINERY: 10 Scrap Metal smelted into 1 Refined Alloy.", "success");
            this.save();
            this.triggerStateChange();
            return true;
        }
        return false;
    }
    refineBiomatter() {
        if (this.rawBiomatter >= 10) {
            this.rawBiomatter -= 10;
            this.biofuel += 1;
            this.log("RECLAIMER: 10 Raw Biomatter processed into 1 Bio-Fuel cell.", "success");
            this.save();
            this.triggerStateChange();
            return true;
        }
        return false;
    }
    // Deploy Rover
    deployRover() {
        if (this.expedition.active) return;
        this.expedition.active = true;
        this.expedition.status = 'DRIVING';
        this.expedition.distance = 0;
        this.expedition.power = this.maxPower;
        this.expedition.cargoMetal = 0;
        this.expedition.cargoBiomatter = 0;
        this.expedition.obstacle = null;
        // First obstacle spawned after 20m - 30m
        this.expedition.nextObstacleDist = 20 + Math.random() * 10;
        
        this.log("DEPLOY: Remote Reconnaissance Rover deployed to Wasteland.", "exped");
        this.triggerStateChange();
    }
    // Manual Recall
    recallRover() {
        if (!this.expedition.active || this.expedition.status === 'RECALLING') return;
        this.expedition.status = 'RECALLING';
        // Base recall takes 4 seconds
        this.expedition.recallTimeLeft = 4.0;
        this.log("RECALL: Core retrieval cable connected. Pulling rover back to base...", "danger");
        this.triggerStateChange();
    }
    // Active click on obstacle to boost drilling speed
    activeClickHarvest() {
        if (this.expedition.status !== 'HARVESTING' || !this.expedition.obstacle) return false;
        const reduction = 0.5 * (1 + 0.1 * this.upgrades.laser);
        this.expedition.obstacle.timeLeft -= reduction;
        
        // Spawn spark effect indicator at obstacle position (X: ~550px, Y: canvas center)
        this.expedition.activeDrills.push({
            x: 550,
            y: 220 + (Math.random() - 0.5) * 60,
            life: 0.3,
            size: 3 + Math.random() * 5
        });
        if (this.expedition.obstacle.timeLeft <= 0) {
            this.clearObstacle();
        } else {
            this.triggerStateChange();
        }
        return true;
    }
    // Internal helper to clear obstacle and grant resources
    clearObstacle() {
        const obs = this.expedition.obstacle;
        if (!obs) return;
        let gatheredScrap = 0;
        let gatheredBiomatter = 0;
        if (obs.type === 'scrap_heap') {
            gatheredScrap = Math.floor(4 + Math.random() * 5); // 4-8
        } else if (obs.type === 'biocyst') {
            gatheredBiomatter = Math.floor(3 + Math.random() * 4); // 3-6
        } else if (obs.type === 'anomaly') {
            gatheredScrap = Math.floor(2 + Math.random() * 3); // 2-4
            gatheredBiomatter = Math.floor(2 + Math.random() * 3); // 2-4
        }
        const currentCargo = this.currentCargoCount;
        const maxCargo = this.maxCargo;
        const totalGathered = gatheredScrap + gatheredBiomatter;
        
        let acceptedScrap = gatheredScrap;
        let acceptedBiomatter = gatheredBiomatter;
        let overflow = false;
        if (currentCargo + totalGathered > maxCargo) {
            overflow = true;
            const remainingSpace = maxCargo - currentCargo;
            if (remainingSpace <= 0) {
                acceptedScrap = 0;
                acceptedBiomatter = 0;
            } else {
                // Distribute remaining space proportionately or metal first
                if (gatheredScrap <= remainingSpace) {
                    acceptedScrap = gatheredScrap;
                    acceptedBiomatter = remainingSpace - gatheredScrap;
                } else {
                    acceptedScrap = remainingSpace;
                    acceptedBiomatter = 0;
                }
            }
        }
        this.expedition.cargoMetal += acceptedScrap;
        this.expedition.cargoBiomatter += acceptedBiomatter;
        
        const typeLabel = obs.type === 'scrap_heap' ? 'Scrap Pile' : obs.type === 'biocyst' ? 'Biocyst' : 'Anomaly';
        
        this.log(`HARVEST: Cleared ${typeLabel}. Gathered: +${acceptedScrap} Scrap, +${acceptedBiomatter} Biomatter.`, 'harvest');
        if (overflow) {
            this.log("WARNING: Cargo hold full. Excess materials left behind.", "danger");
        }
        this.expedition.obstacle = null;
        this.expedition.status = 'DRIVING';
        
        // Spawn next obstacle 25m - 40m away
        this.expedition.nextObstacleDist = this.expedition.distance + (25 + Math.random() * 15);
        this.triggerStateChange();
    }
    // Core simulation tick (independent of frames, updates at standard dt)
    tick(dt) {
        this.uptime += dt;
        // 1. Process automated refiners
        if (this.automation.autoMetal) {
            this.autoMetalAccumulator += dt;
            if (this.autoMetalAccumulator >= 5.0) {
                this.autoMetalAccumulator -= 5.0;
                if (this.rawMetal >= 10) {
                    this.rawMetal -= 10;
                    this.alloys += 1;
                    this.log("AUTO-REFINERY: Smelted 10 Scrap Metal into 1 Refined Alloy.", "success");
                    this.save();
                    this.triggerStateChange();
                }
            }
        }
        if (this.automation.autoBiomatter) {
            this.autoBiomatterAccumulator += dt;
            if (this.autoBiomatterAccumulator >= 5.0) {
                this.autoBiomatterAccumulator -= 5.0;
                if (this.rawBiomatter >= 10) {
                    this.rawBiomatter -= 10;
                    this.biofuel += 1;
                    this.log("AUTO-RECLAIMER: Smelted 10 Biomatter into 1 Bio-Fuel Cell.", "success");
                    this.save();
                    this.triggerStateChange();
                }
            }
        }
        // 2. Process Expedition State
        if (this.expedition.active) {
            if (this.expedition.status === 'DRIVING') {
                // Drive forward
                const distTraveled = this.speed * dt;
                this.expedition.distance += distTraveled;
                this.totalDistance += distTraveled;
                // Drain battery: 1.0 EP per second of driving
                this.expedition.power -= 1.0 * dt;
                
                // If cargo is full, we automatically recall (safety subroutine)
                if (this.currentCargoCount >= this.maxCargo) {
                    this.log("CARGO: Cargo bay at maximum capacity. Auto-recalling...", "danger");
                    this.recallRover();
                }
                // If battery depleted, trigger emergency recall
                if (this.expedition.power <= 0) {
                    this.expedition.power = 0;
                    this.log("ALARM: Power core fully depleted. Engaging emergency recall.", "danger");
                    this.recallRover();
                }
                // Check for obstacle encounter
                if (this.expedition.distance >= this.expedition.nextObstacleDist) {
                    const rand = Math.random();
                    let type = 'scrap_heap';
                    let baseTime = 3.0; // seconds
                    // Determine type based on distance (later biomes spawn harder nodes)
                    if (this.expedition.distance > 300 && rand > 0.6) {
                        type = 'anomaly';
                        baseTime = 4.5;
                    } else if (rand > 0.5) {
                        type = 'biocyst';
                        baseTime = 3.5;
                    }
                    // Create the obstacle
                    this.expedition.obstacle = {
                        type: type,
                        baseTime: baseTime,
                        maxTime: baseTime / this.drillRateMultiplier,
                        timeLeft: baseTime / this.drillRateMultiplier,
                        // Visual positioning: starts off-screen right
                        // canvas width is roughly 800px, rover is at 150px
                        // We will set relative position offset
                        x: 800
                    };
                    this.expedition.status = 'HARVESTING';
                    const obsLabel = type === 'scrap_heap' ? 'Scrap Pile' : type === 'biocyst' ? 'Biocyst' : 'Anomaly';
                    this.log(`SCAN: Obstacle detected (${obsLabel}). Deploying mining drill.`, "harvest");
                    this.triggerStateChange();
                }
            } 
            else if (this.expedition.status === 'HARVESTING') {
                // Drill obstacle
                if (this.expedition.obstacle) {
                    // Small standby battery drain while drilling: 0.15 EP/s
                    this.expedition.power -= 0.15 * dt;
                    if (this.expedition.power <= 0) {
                        this.expedition.power = 0;
                        this.log("ALARM: Power core depleted during drilling. Recalling...", "danger");
                        this.recallRover();
                    }
                    this.expedition.obstacle.timeLeft -= dt;
                    if (this.expedition.obstacle.timeLeft <= 0) {
                        this.clearObstacle();
                    }
                }
            } 
            else if (this.expedition.status === 'RECALLING') {
                // Background recall simulation
                this.expedition.recallTimeLeft -= dt;
                
                if (this.expedition.recallTimeLeft <= 0) {
                    // Recall finished! Deposit materials
                    const metalReturned = this.expedition.cargoMetal;
                    const biomatterReturned = this.expedition.cargoBiomatter;
                    
                    this.rawMetal += metalReturned;
                    this.rawBiomatter += biomatterReturned;
                    
                    this.expedition.active = false;
                    this.expedition.status = 'STANDBY';
                    this.expedition.distance = 0;
                    this.expedition.cargoMetal = 0;
                    this.expedition.cargoBiomatter = 0;
                    this.expedition.obstacle = null;
                    
                    this.log(`DOCK: Rover returned to hangar. Scrap metal +${metalReturned}, Biomatter +${biomatterReturned} processed.`, "success");
                    this.save();
                    this.triggerStateChange();
                }
            }
        }
    }
}