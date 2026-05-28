import { GameState } from './state.js';
import { CanvasEngine } from './engine.js';
import { UIManager } from './ui.js';
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize core systems
    const state = new GameState();
    const canvas = document.getElementById('game-canvas');
    
    const engine = new CanvasEngine(canvas, state);
    const ui = new UIManager(state, engine);
    // Provide engine access to UI to resize canvas on screen swaps
    ui.canvasEngine = engine;
    // 2. Start state engine with UI callbacks
    state.init(
        (msg, type) => ui.addLogLine(msg, type),
        () => ui.updateUI()
    );
    // Initial draw to render background/standby rover state
    engine.resize();
    engine.render();
    // 3. Main Loop using delta time ticker
    let lastTime = performance.now();
    function gameLoop(now) {
        let dt = (now - lastTime) / 1000;
        
        // Prevent huge lag spikes if browser tab is suspended/refreshed
        if (dt > 1.5) dt = 1.5;
        // Tick simulation (updates battery, driving, harvesting, and auto-refinery)
        state.tick(dt);
        // Render Canvas graphics ONLY if Wasteland screen is active to optimize performance.
        // Background tick calculations are unaffected.
        const isWastelandActive = document.getElementById('screen-wasteland').classList.contains('active');
        if (isWastelandActive) {
            engine.update(dt);
            engine.render();
        }
        lastTime = now;
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);
});