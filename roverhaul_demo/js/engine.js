/**
 * CanvasEngine - Handles visual animations, particle systems, and parallax drawing
 */
export class CanvasEngine {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = state;
        this.width = canvas.width;
        this.height = canvas.height;
        this.particles = [];
        this.spores = []; // Atmospheric floating alien spores
        
        // Procedural background coordinates
        this.bgOffset1 = 0;
        this.bgOffset2 = 0;
        this.bgOffset3 = 0;
        // Visual states
        this.animTime = 0;
        this.wheelRotation = 0;
        this.shakeTimer = 0;
        this.initSpores();
        this.resize();
        
        // Handle window resizing
        window.addEventListener('resize', () => this.resize());
    }
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }
    initSpores() {
        // Create 40 floating atmospheric spores
        this.spores = [];
        for (let i = 0; i < 40; i++) {
            this.spores.push({
                x: Math.random() * 1200,
                y: Math.random() * 600,
                speedY: -(0.2 + Math.random() * 0.5),
                speedX: -(0.1 + Math.random() * 0.4),
                size: 1 + Math.random() * 3,
                opacity: 0.1 + Math.random() * 0.5,
                pulseSpeed: 1 + Math.random() * 2
            });
        }
    }
    spawnSparks(x, y, color = '#00f0ff') {
        const count = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1, // tilt slightly upward
                life: 0.4 + Math.random() * 0.4,
                maxLife: 0.8,
                size: 1 + Math.random() * 3,
                color: color
            });
        }
    }
    update(dt) {
        this.animTime += dt;
        // 1. Update parallax offsets based on speed
        let scrollSpeed = 0;
        if (this.state.expedition.active) {
            if (this.state.expedition.status === 'DRIVING') {
                scrollSpeed = this.state.speed;
            } else if (this.state.expedition.status === 'RECALLING') {
                // Scrolls backwards very fast
                scrollSpeed = -this.state.speed * 4;
            }
        }
        // Parallax scaling
        this.bgOffset1 = (this.bgOffset1 + scrollSpeed * 10 * dt) % 1200;
        this.bgOffset2 = (this.bgOffset2 + scrollSpeed * 30 * dt) % 1200;
        this.bgOffset3 = (this.bgOffset3 + scrollSpeed * 80 * dt) % 1200;
        // Wheel rotation based on driving
        if (this.state.expedition.status === 'DRIVING') {
            this.wheelRotation += (this.state.speed * dt * 2);
        } else if (this.state.expedition.status === 'RECALLING') {
            this.wheelRotation -= (this.state.speed * dt * 8);
        }
        // 2. Update sparks particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        // 3. Update active drills clicks (which trigger visual bubbles/sparks)
        if (this.state.expedition.activeDrills.length > 0) {
            for (let i = this.state.expedition.activeDrills.length - 1; i >= 0; i--) {
                const drill = this.state.expedition.activeDrills[i];
                drill.life -= dt;
                if (drill.life <= 0) {
                    this.state.expedition.activeDrills.splice(i, 1);
                } else {
                    // Spawn sparks periodically
                    this.spawnSparks(drill.x, drill.y, '#ffaa00');
                }
            }
        }
        // 4. Update atmospheric spores
        this.spores.forEach(spore => {
            spore.y += spore.speedY;
            spore.x += spore.speedX - (scrollSpeed * 0.1); // float relative to scrolling
            
            // Wrap coordinates
            if (spore.y < 0) {
                spore.y = this.height;
                spore.x = Math.random() * this.width;
            }
            if (spore.x < 0) {
                spore.x = this.width;
                spore.y = Math.random() * this.height;
            } else if (spore.x > this.width) {
                spore.x = 0;
                spore.y = Math.random() * this.height;
            }
        });
        // 5. Drill sparking
        if (this.state.expedition.status === 'HARVESTING' && this.state.expedition.obstacle) {
            // Sparks at point of contact (rover front is roughly at X: 210, obstacle is at X: 220)
            const type = this.state.expedition.obstacle.type;
            const sparkColor = type === 'scrap_heap' ? '#00f0ff' : type === 'biocyst' ? '#39e65b' : '#ffaa00';
            
            if (Math.random() < 0.3) {
                this.spawnSparks(220, this.height - 110, sparkColor);
            }
        }
    }
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        // Ground line Y position
        const groundY = this.height - 100;
        // Draw Parallax Layers
        this.drawLayerSky();
        this.drawLayerDistantRuins();
        this.drawLayerMidground();
        this.drawSpores();
        this.drawLayerForeground(groundY);
        // Draw Objects & Obstacles
        if (this.state.expedition.active) {
            this.drawObstacles(groundY);
            this.drawRover(groundY);
            this.drawLaserBeam(groundY);
            this.drawRecallCable(groundY);
        } else {
            this.drawRoverStandby(groundY);
        }
        // Draw Particles
        this.drawParticles();
    }
    drawLayerSky() {
        // Dark metallic gradient
        const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
        skyGrad.addColorStop(0, '#040508');
        skyGrad.addColorStop(0.6, '#0c0f17');
        skyGrad.addColorStop(1, '#1b130e'); // Rust horizon tint
        this.ctx.fillStyle = skyGrad;
        this.ctx.fillRect(0, 0, this.width, this.height);
        // Distant pulsing binary stars / nebulae
        const pulse = 0.5 + 0.3 * Math.sin(this.animTime * 0.5);
        this.ctx.fillStyle = `rgba(0, 240, 255, ${0.05 * pulse})`;
        this.ctx.beginPath();
        this.ctx.arc(this.width * 0.7, 100, 80, 0, Math.PI * 2);
        this.ctx.fill();
    }
    drawLayerDistantRuins() {
        this.ctx.fillStyle = 'rgba(10, 12, 18, 0.4)';
        this.ctx.save();
        this.ctx.translate(-this.bgOffset1, 0);
        // Draw a repeating structural arch silhouette
        for (let i = 0; i < 3; i++) {
            const startX = i * 600;
            // Draw giant spines
            this.ctx.beginPath();
            this.ctx.moveTo(startX + 100, this.height - 80);
            this.ctx.quadraticCurveTo(startX + 150, this.height - 350, startX + 300, this.height - 80);
            this.ctx.lineTo(startX + 280, this.height - 80);
            this.ctx.quadraticCurveTo(startX + 150, this.height - 310, startX + 120, this.height - 80);
            this.ctx.fill();
            // Tower blocks
            this.ctx.fillRect(startX + 400, this.height - 300, 60, 220);
            this.ctx.fillRect(startX + 450, this.height - 240, 40, 160);
        }
        this.ctx.restore();
    }
    drawLayerMidground() {
        this.ctx.fillStyle = 'rgba(18, 22, 32, 0.7)';
        this.ctx.strokeStyle = 'rgba(18, 22, 32, 0.7)';
        this.ctx.lineWidth = 4;
        this.ctx.save();
        this.ctx.translate(-this.bgOffset2, 0);
        for (let i = 0; i < 3; i++) {
            const startX = i * 600;
            // Cable lines hanging
            this.ctx.beginPath();
            this.ctx.moveTo(startX, 100);
            this.ctx.bezierCurveTo(startX + 150, 180, startX + 450, 180, startX + 600, 100);
            this.ctx.stroke();
            // Rusted infrastructure towers
            this.ctx.fillRect(startX + 50, this.height - 220, 30, 140);
            this.ctx.fillRect(startX + 200, this.height - 180, 50, 100);
            
            // Fleshy biological growths on midground
            this.ctx.beginPath();
            this.ctx.arc(startX + 225, this.height - 180, 20, 0, Math.PI, true);
            this.ctx.fill();
        }
        this.ctx.restore();
    }
    drawSpores() {
        this.spores.forEach(spore => {
            const alpha = spore.opacity * (0.6 + 0.4 * Math.sin(this.animTime * spore.pulseSpeed));
            this.ctx.fillStyle = `rgba(57, 230, 91, ${alpha})`;
            this.ctx.shadowBlur = spore.size * 2;
            this.ctx.shadowColor = 'rgba(57, 230, 91, 0.8)';
            this.ctx.beginPath();
            this.ctx.arc(spore.x, spore.y, spore.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        // Clear shadow settings
        this.ctx.shadowBlur = 0;
    }
    drawLayerForeground(groundY) {
        this.ctx.fillStyle = '#0a0d13';
        this.ctx.save();
        this.ctx.translate(-this.bgOffset3, 0);
        // We draw repeating ground path with steel plates and rivets
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundY);
        this.ctx.lineTo(1800, groundY);
        this.ctx.lineTo(1800, this.height);
        this.ctx.lineTo(0, this.height);
        this.ctx.closePath();
        this.ctx.fill();
        // Draw structural elements on the ground
        this.ctx.strokeStyle = '#1b2230';
        this.ctx.lineWidth = 2;
        
        for (let i = 0; i < 20; i++) {
            const lineX = i * 100;
            // Floor seams
            this.ctx.beginPath();
            this.ctx.moveTo(lineX, groundY);
            this.ctx.lineTo(lineX, this.height);
            this.ctx.stroke();
            // Rusted rivets details
            this.ctx.fillStyle = '#111722';
            this.ctx.beginPath();
            this.ctx.arc(lineX + 30, groundY + 15, 3, 0, Math.PI * 2);
            this.ctx.arc(lineX + 70, groundY + 15, 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Random metallic debris silhouettes
            if (i % 4 === 0) {
                this.ctx.fillStyle = '#06080c';
                this.ctx.fillRect(lineX + 15, groundY - 12, 10, 12);
            }
        }
        
        this.ctx.restore();
    }
    drawRover(groundY) {
        const roverX = 150;
        let roverY = groundY - 45;
        // Bobbing suspension physics
        if (this.state.expedition.status === 'DRIVING') {
            roverY += Math.sin(this.animTime * 14) * 1.5;
        } else if (this.state.expedition.status === 'RECALLING') {
            roverY += (Math.random() - 0.5) * 2; // shaking
        }
        this.ctx.save();
        this.ctx.translate(roverX, roverY);
        // Recalling tilt
        if (this.state.expedition.status === 'RECALLING') {
            this.ctx.rotate(-0.04);
        }
        // 1. Draw suspension frame (connecting wheels)
        this.ctx.strokeStyle = '#3a4454';
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(-35, 30);
        this.ctx.lineTo(35, 30);
        this.ctx.stroke();
        // 2. Draw rotating wheels (or treads)
        this.drawWheel(-35, 30, 15);
        this.drawWheel(0, 30, 15);
        this.drawWheel(35, 30, 15);
        // 3. Draw Rover Cargo Pod (Upgrade scale)
        // Cargo pod scales larger depending on chassis/cargo upgrades
        const cargoLvl = this.state.upgrades.cargo;
        const cargoWidth = 35 + cargoLvl * 3;
        const cargoHeight = 22 + cargoLvl * 2;
        this.ctx.fillStyle = '#222936';
        this.ctx.strokeStyle = '#475569';
        this.ctx.lineWidth = 2;
        // Pod rectangle
        this.ctx.beginPath();
        this.ctx.roundRect(-45, 10 - cargoHeight, cargoWidth, cargoHeight, 3);
        this.ctx.fill();
        this.ctx.stroke();
        // Draw cargopiles inside pod (based on full percentage)
        const fillPercent = this.state.currentCargoCount / this.state.maxCargo;
        if (fillPercent > 0.05) {
            this.ctx.fillStyle = this.state.expedition.cargoBiomatter > this.state.expedition.cargoMetal ? '#39e65b' : '#00f0ff';
            this.ctx.fillRect(-40, 13 - cargoHeight, (cargoWidth - 10) * fillPercent, cargoHeight - 6);
        }
        // 4. Main Cockpit Capsule (Chassis)
        this.ctx.fillStyle = '#121620';
        this.ctx.strokeStyle = '#00f0ff';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.roundRect(-10, -22, 50, 42, [5, 15, 10, 5]);
        this.ctx.fill();
        this.ctx.stroke();
        // Cockpit window scanner sweep
        this.ctx.fillStyle = '#1e293b';
        this.ctx.beginPath();
        this.ctx.roundRect(15, -16, 20, 20, [2, 10, 5, 2]);
        this.ctx.fill();
        
        // Scan line sweep visual
        const scannerSweep = 0.5 + 0.5 * Math.sin(this.animTime * 6);
        this.ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 + scannerSweep * 0.6})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(15 + scannerSweep * 18, -14);
        this.ctx.lineTo(15 + scannerSweep * 18, 2);
        this.ctx.stroke();
        // 5. Power Core glow in center
        const powerPulse = 0.6 + 0.4 * Math.sin(this.animTime * 8);
        const powerLevelPercent = this.state.expedition.power / this.state.maxPower;
        let coreColor = 'rgb(0, 240, 255)'; // cyan when good
        
        if (powerLevelPercent < 0.25) {
            coreColor = `rgb(255, 59, 48)`; // red warning
        } else if (powerLevelPercent < 0.6) {
            coreColor = `rgb(255, 170, 0)`; // amber
        }
        this.ctx.fillStyle = coreColor;
        this.ctx.shadowBlur = 8 * powerPulse;
        this.ctx.shadowColor = coreColor;
        this.ctx.beginPath();
        this.ctx.arc(5, 5, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0; // Reset shadow
        // 6. Laser Emitter Arm (Front Mount)
        this.ctx.strokeStyle = '#475569';
        this.ctx.fillStyle = '#2f3b4c';
        this.ctx.lineWidth = 3;
        
        this.ctx.beginPath();
        this.ctx.moveTo(40, 5);
        this.ctx.lineTo(55, 12);
        this.ctx.stroke();
        
        // Emitter nozzle
        this.ctx.fillRect(52, 7, 8, 10);
        this.ctx.restore();
    }
    drawWheel(offsetX, offsetY, radius) {
        this.ctx.save();
        this.ctx.translate(offsetX, offsetY);
        this.ctx.rotate(this.wheelRotation);
        // Tire base
        this.ctx.fillStyle = '#0d0f14';
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        // Steel spoke lines inside wheel to visualize rotation
        this.ctx.strokeStyle = '#4a5568';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        // Cross spokes
        this.ctx.moveTo(-radius, 0);
        this.ctx.lineTo(radius, 0);
        this.ctx.moveTo(0, -radius);
        this.ctx.lineTo(0, radius);
        this.ctx.stroke();
        // Hub cap
        this.ctx.fillStyle = '#718096';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }
    drawRoverStandby(groundY) {
        // Draw the rover in hangar resting state
        const roverX = this.width / 2;
        const roverY = groundY - 45;
        this.ctx.save();
        this.ctx.translate(roverX, roverY);
        // Suspension frame
        this.ctx.strokeStyle = '#3a4454';
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(-35, 30);
        this.ctx.lineTo(35, 30);
        this.ctx.stroke();
        // Wheels
        this.drawWheel(-35, 30, 15);
        this.drawWheel(0, 30, 15);
        this.drawWheel(35, 30, 15);
        // Cargo pod
        this.ctx.fillStyle = '#222936';
        this.ctx.strokeStyle = '#475569';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.roundRect(-45, -12, 38, 24, 3);
        this.ctx.fill();
        this.ctx.stroke();
        // Main Cockpit
        this.ctx.fillStyle = '#121620';
        this.ctx.strokeStyle = '#00f0ff';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.roundRect(-10, -22, 50, 42, [5, 15, 10, 5]);
        this.ctx.fill();
        this.ctx.stroke();
        // Cockpit window (dark standby)
        this.ctx.fillStyle = '#0b0c10';
        this.ctx.beginPath();
        this.ctx.roundRect(15, -16, 20, 20, [2, 10, 5, 2]);
        this.ctx.fill();
        this.ctx.restore();
    }
    drawObstacles(groundY) {
        if (!this.state.expedition.obstacle) return;
        const obs = this.state.expedition.obstacle;
        
        // Calculate screen X coordinate based on actual state distances
        // Rover is at X = 150px.
        // Scale 1m = 18px.
        const scale = 18;
        const distanceDiff = this.state.expedition.nextObstacleDist - this.state.expedition.distance;
        
        // When diff = 0, obstacle is exactly at collision point (rover nose at X = 205px)
        obs.x = 205 + distanceDiff * scale;
        this.ctx.save();
        this.ctx.translate(obs.x, groundY - 15);
        // Draw obstacle base shapes
        this.ctx.shadowBlur = 10;
        if (obs.type === 'scrap_heap') {
            this.ctx.fillStyle = '#2f3e46';
            this.ctx.strokeStyle = '#00f0ff';
            this.ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
            this.ctx.lineWidth = 2;
            // Rusted angular metal plate shapes
            this.ctx.beginPath();
            this.ctx.moveTo(0, 15);
            this.ctx.lineTo(15, -25);
            this.ctx.lineTo(45, -20);
            this.ctx.lineTo(55, 15);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            // Details
            this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            this.ctx.beginPath();
            this.ctx.moveTo(10, 5);
            this.ctx.lineTo(40, -10);
            this.ctx.stroke();
        } 
        else if (obs.type === 'biocyst') {
            this.ctx.fillStyle = '#31572c';
            this.ctx.strokeStyle = '#39e65b';
            this.ctx.shadowColor = 'rgba(57, 230, 91, 0.4)';
            this.ctx.lineWidth = 2;
            // Biological organic cyst bubble
            this.ctx.beginPath();
            this.ctx.arc(25, 0, 20, 0, Math.PI, true);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            // Bioluminescent pulses inside cyst
            const bioPulse = 0.5 + 0.5 * Math.sin(this.animTime * 4);
            this.ctx.fillStyle = `rgba(57, 230, 91, ${0.3 * bioPulse})`;
            this.ctx.beginPath();
            this.ctx.arc(25, -5, 10 * bioPulse, 0, Math.PI * 2);
            this.ctx.fill();
        } 
        else if (obs.type === 'anomaly') {
            this.ctx.fillStyle = '#6f2dbd';
            this.ctx.strokeStyle = '#ffaa00';
            this.ctx.shadowColor = 'rgba(255, 170, 0, 0.4)';
            this.ctx.lineWidth = 2;
            // Angular alien shards
            this.ctx.beginPath();
            this.ctx.moveTo(10, 15);
            this.ctx.lineTo(25, -35);
            this.ctx.lineTo(40, 15);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
        // Reset shadow
        this.ctx.shadowBlur = 0;
        // Draw Interactive Drill Progress Bar above
        if (this.state.expedition.status === 'HARVESTING') {
            const barW = 60;
            const barH = 5;
            const barX = (obs.type === 'biocyst' ? 25 : 25) - barW / 2;
            const barY = -45;
            // Bar Border
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(barX, barY, barW, barH);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            this.ctx.strokeRect(barX, barY, barW, barH);
            // Bar Progress Fill
            const progress = obs.timeLeft / obs.maxTime;
            const fillPercent = Math.max(0, Math.min(1, 1 - progress));
            
            const fillCol = obs.type === 'scrap_heap' ? '#00f0ff' : obs.type === 'biocyst' ? '#39e65b' : '#ffaa00';
            this.ctx.fillStyle = fillCol;
            this.ctx.fillRect(barX + 1, barY + 1, (barW - 2) * fillPercent, barH - 2);
            // Active Drilling text banner
            this.ctx.font = '8px "Share Tech Mono"';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("DRILLING // CLICK BOOST", 25, -55);
        }
        this.ctx.restore();
    }
    drawLaserBeam(groundY) {
        if (this.state.expedition.status !== 'HARVESTING' || !this.state.expedition.obstacle) return;
        // Rover laser nozzle is roughly at X: 207px, Y: groundY - 33px
        const nozzleX = 207;
        const nozzleY = groundY - 33;
        // Obstacle coordinate is at obstacle.x (offset to left boundary)
        const targetX = this.state.expedition.obstacle.x;
        const targetY = groundY - 15;
        this.ctx.save();
        // Laser beam lines (outer soft, inner bright core)
        const jitterY = (Math.random() - 0.5) * 3;
        
        // Determine color based on obstacle type
        const obsType = this.state.expedition.obstacle.type;
        const beamColor = obsType === 'scrap_heap' ? '#00f0ff' : obsType === 'biocyst' ? '#39e65b' : '#ffaa00';
        // Outer glow beam
        this.ctx.strokeStyle = beamColor;
        this.ctx.lineWidth = 5 + Math.random() * 4;
        this.ctx.beginPath();
        this.ctx.moveTo(nozzleX, nozzleY);
        this.ctx.lineTo(targetX, targetY + jitterY);
        this.ctx.stroke();
        // Inner core beam
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(nozzleX, nozzleY);
        this.ctx.lineTo(targetX, targetY + jitterY);
        this.ctx.stroke();
        this.ctx.restore();
    }
    drawRecallCable(groundY) {
        if (this.state.expedition.status !== 'RECALLING') return;
        // Top-left retrieval port of rover is at X: 115px, Y: groundY - 45px
        const roverCableX = 105;
        const roverCableY = groundY - 45;
        this.ctx.save();
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 2.5;
        // Cable cable links (drawn with a sag chain curve)
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundY - 60);
        // Draw slightly sagging line to rover
        this.ctx.quadraticCurveTo(roverCableX / 2, groundY - 30, roverCableX, roverCableY);
        this.ctx.stroke();
        // Sparks along cable
        if (Math.random() < 0.2) {
            this.spawnSparks(roverCableX, roverCableY, '#ffaa00');
        }
        this.ctx.restore();
    }
    drawParticles() {
        this.particles.forEach(p => {
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}
