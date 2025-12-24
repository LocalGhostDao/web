// ===========================================
// ESCAPE.EXE - RUN FROM THE MACHINE
// A Temple Run / Chrome Dino hybrid for LocalGhost.ai
// Flee from trackers through bureaucratic obstacles
// ===========================================

(function() {
    'use strict';

    // ===========================================
    // CONSTANTS & CONFIG
    // ===========================================
    
    const CONFIG = {
        canvasWidth: 800,
        canvasHeight: 400,
        groundY: 320,
        gravity: 0.75,
        jumpForce: -14,
        slideForce: 2,
        // Speed settings
        baseSpeed: 5,
        maxSpeed: 13,
        speedIncrement: 0.0003,
        // Tracker - accelerates, catches you in 3 min unless perfect play
        // Tracker - starts at left edge, only kills on touch
        trackerStartSpeed: 4,
        trackerAcceleration: 0.0005,
        trackerStartDistance: 350,     // Starts way back at left edge
        trackerCatchDistance: 0,       // Only kills when actually touches player
        // 3 minute hard deadline (in frames at 60fps)
        maxGameTime: 180 * 60,  // 10800 frames = 3 minutes
        // Obstacles - challenging but fair, mix of jump and duck
        obstacleGap: 400,
        minObstacleGap: 300,
        dataFragmentChance: 0.08,
        targetFPS: 60
    };

    // ===========================================
    // OBSTACLE TYPES
    // RED = TRACKING/SURVEILLANCE
    // GREEN = FREEHOLD APPS (run through for boost)
    // ===========================================
    
    // TRACKING OBSTACLES - JUMP types sit on ground, DUCK types float overhead
    const OBSTACLES = {
        // === JUMP OBSTACLES - Touch the ground, jump over them ===
        COOKIE_BANNER: {
            name: '🍪 COOKIES',
            width: 70,
            height: 40,  // 4 lines * 10
            type: 'jump',
            color: '#FF4444',
            ascii: [
                '┌──────────┐',
                '│ 🍪 ACCEPT│',
                '│  COOKIES │',
                '└────▲▲────┘'
            ]
        },
        TOS_WALL: {
            name: 'TERMS OF SERVICE',
            width: 85,
            height: 60,  // 6 lines * 10
            type: 'jump',
            color: '#CC3333',
            ascii: [
                '╔════════════╗',
                '║  TERMS OF  ║',
                '║  SERVICE   ║',
                '║ [I AGREE]  ║',
                '║     ▲▲     ║',
                '╚════════════╝'
            ]
        },
        CONSENT_FORM: {
            name: 'CONSENT',
            width: 55,
            height: 40,  // 4 lines * 10
            type: 'jump',
            color: '#FF5555',
            ascii: [
                '┌─────────┐',
                '│ ☐ AGREE │',
                '│   ▲▲    │',
                '└─────────┘'
            ]
        },
        CAPTCHA: {
            name: 'CAPTCHA',
            width: 75,
            height: 50,  // 5 lines * 10
            type: 'jump',
            color: '#EE3333',
            ascii: [
                '┌───────────┐',
                '│ SELECT 🚗 │',
                '│ [■][■][□] │',
                '│    ▲▲     │',
                '└───────────┘'
            ]
        },
        DATA_WALL: {
            name: 'DATA HARVEST',
            width: 95,
            height: 60,  // 6 lines * 10
            type: 'jump',
            color: '#FF2222',
            ascii: [
                '╔══════════════╗',
                '║ SHARE YOUR:  ║',
                '║ ☐ Location   ║',
                '║ ☐ Soul       ║',
                '║     ▲▲       ║',
                '╚══════════════╝'
            ]
        },
        PAYWALL: {
            name: 'PAYWALL',
            width: 80,
            height: 50,  // 5 lines * 10
            type: 'jump',
            color: '#BB2222',
            ascii: [
                '╔════════════╗',
                '║ $9.99/mo   ║',
                '║ SUBSCRIBE  ║',
                '║    ▲▲      ║',
                '╚════════════╝'
            ]
        },
        
        // === DUCK OBSTACLES - Float overhead, duck under them ===
        PRIVACY_BANNER: {
            name: 'PRIVACY BANNER',
            width: 130,
            height: 40,  // 4 lines * 10
            type: 'duck',
            color: '#DD4444',
            ascii: [
                '════════▼▼════════',
                '║ WE VALUE YOUR  ║',
                '║   PRIVACY™     ║',
                '══════════════════'
            ]
        },
        NOTIFICATION: {
            name: 'NOTIFICATION',
            width: 120,
            height: 40,  // 4 lines * 10
            type: 'duck',
            color: '#FF6666',
            ascii: [
                '═══════▼▼═══════',
                '║🔔 ALLOW NOTIFS║',
                '║  [YES] [YES]  ║',
                '════════════════'
            ]
        },
        
        // ===========================================
        // FREEHOLD APPS - Rare green portals
        // These represent apps with freehold.json
        // Local-first, open-source, no kill switch
        // ===========================================
        
        FREEHOLD_APP: {
            name: 'FREEHOLD APP',
            width: 85,
            height: 70,
            type: 'boost',
            color: '#33FF00',
            ascii: [
                '╔═══════════════╗',
                '║  ✓ FREEHOLD ✓ ║',
                '║  LOCAL-FIRST  ║',
                '║  OPEN SOURCE  ║',
                '║    [ PASS ]   ║',
                '╚═══════════════╝'
            ]
        },
        SOVEREIGN_NODE: {
            name: 'SOVEREIGN NODE',
            width: 85,
            height: 70,
            type: 'boost',
            color: '#00FF44',
            ascii: [
                '╔═══════════════╗',
                '║  ✓ SOVEREIGN ✓║',
                '║  NO KILL SW   ║',
                '║  YOUR DATA    ║',
                '║    [ SAFE ]   ║',
                '╚═══════════════╝'
            ]
        },
        EXIT_RAMP: {
            name: 'EXIT RAMP',
            width: 85,
            height: 70,
            type: 'boost',
            color: '#44FF44',
            ascii: [
                '╔═══════════════╗',
                '║  ★ EXIT RAMP ★║',
                '║  SELF-HOSTED  ║',
                '║  AUDITABLE    ║',
                '║    [ FREE ]   ║',
                '╚═══════════════╝'
            ]
        }
    };
    
    // Separate arrays for spawning
    const HAZARD_OBSTACLES = ['COOKIE_BANNER', 'TOS_WALL', 'CONSENT_FORM', 'PRIVACY_BANNER', 'CAPTCHA', 'DATA_WALL', 'NOTIFICATION', 'PAYWALL'];
    const BOOST_OBSTACLES = ['FREEHOLD_APP', 'SOVEREIGN_NODE', 'EXIT_RAMP'];
    const BOOST_CHANCE = 0.015; // ~1.5% - rare but crucial

    const TRACKER_QUOTES = [
        'TRACKING...',
        'I SEE YOU',
        'COME BACK',
        'RESISTANCE IS FUTILE',
        'YOU CANNOT HIDE',
        'INEVITABLE',
        'SYNCING...',
        'LOGGING...',
        'PROFILING...',
        'ANALYZING...'
    ];

    // ===========================================
    // GAME STATE
    // ===========================================
    
    let canvas, ctx;
    let animationId = null;
    let lastFrameTime = 0;

    const state = {
        running: false,
        paused: false,
        gameOver: false,
        score: 0,
        distance: 0,
        speed: CONFIG.baseSpeed,
        highScore: 0,
        
        // Player state
        player: {
            x: 100,
            y: CONFIG.groundY,
            width: 30,
            height: 50,
            vy: 0,
            isJumping: false,
            isDucking: false,
            duckHeight: 25
        },
        
        // Tracker (the eye chasing you) - always visible, slowly accelerating
        // Beatable with perfect play in ~3 minutes
        tracker: {
            distance: CONFIG.trackerStartDistance,  // Distance behind player (visible position)
            speed: CONFIG.trackerStartSpeed,
            quoteTimer: 0,
            currentQuote: ''
        },
        
        // Win condition
        escaped: false,
        gameTime: 0,  // Frames elapsed - 3 min deadline
        
        // Game objects
        obstacles: [],
        dataFragments: [],
        particles: [],
        groundTiles: [],
        
        // Visual effects
        screenShake: 0,
        flashIntensity: 0,
        boostFlash: 0,
        warningPulse: 0,
        
        // Input
        keys: {},
        touchStartY: 0
    };

    // ===========================================
    // UTILITY CLASSES
    // ===========================================
    
    class Particle {
        constructor(x, y, color, type = 'spark') {
            this.x = x;
            this.y = y;
            this.color = color;
            this.type = type;
            this.vx = (Math.random() - 0.5) * 6;
            this.vy = (Math.random() - 0.5) * 6 - 2;
            this.life = 1;
            this.decay = 0.02 + Math.random() * 0.02;
            this.size = 2 + Math.random() * 4;
        }
        
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.2;
            this.life -= this.decay;
            return this.life > 0;
        }
        
        draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            
            if (this.type === 'data') {
                ctx.font = `${this.size * 3}px monospace`;
                ctx.fillText(Math.random() > 0.5 ? '0' : '1', this.x, this.y);
            } else {
                ctx.fillRect(this.x, this.y, this.size, this.size);
            }
            ctx.restore();
        }
    }

    class DataFragment {
        constructor(x, y) {
            this.x = x;
            this.y = y - 30 - Math.random() * 60;
            this.baseY = this.y;
            this.size = 15;
            this.collected = false;
            this.bobOffset = Math.random() * Math.PI * 2;
            this.type = ['📁', '🔑', '💾', '📊'][Math.floor(Math.random() * 4)];
        }
        
        update(speed) {
            this.x -= speed;
            this.y = this.baseY + Math.sin(Date.now() * 0.005 + this.bobOffset) * 5;
            return this.x > -this.size;
        }
        
        draw(ctx) {
            if (this.collected) return;
            
            ctx.save();
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 10;
            ctx.font = `${this.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.type, this.x, this.y);
            ctx.restore();
        }
    }

    class Obstacle {
        constructor(x, type) {
            this.type = type;
            this.x = x;
            this.width = type.width;
            this.height = type.height;
            
            if (type.type === 'duck') {
                // Duck obstacles float overhead - player ducks under
                // Position so bottom of obstacle is above ducking player's head
                this.y = CONFIG.groundY - 70;  // Float above duck height
            } else {
                // Jump obstacles sit on the ground
                this.y = CONFIG.groundY - type.height;
            }
            this.hit = false;
        }
        
        update(speed) {
            this.x -= speed;
            return this.x > -this.width;
        }
        
        draw(ctx) {
            ctx.save();
            
            const isBoost = this.type.type === 'boost';
            
            if (isBoost && !this.hit) {
                // === FREEHOLD APPS: Clean green glow ===
                const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
                
                // Soft outer glow
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 20 + pulse * 10;
                
                // Subtle background
                ctx.fillStyle = `rgba(51, 255, 0, ${0.08 + pulse * 0.05})`;
                ctx.fillRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
                
            } else if (!isBoost) {
                // === HAZARD BLOCKS: Subtle red tint ===
                ctx.shadowColor = this.hit ? '#FF0000' : this.type.color;
                ctx.shadowBlur = this.hit ? 20 : 6;
            }
            
            // Draw ASCII art
            ctx.font = '10px monospace';
            
            if (this.hit) {
                ctx.fillStyle = isBoost ? '#88FF88' : '#FF4444';
            } else {
                ctx.fillStyle = this.type.color;
            }
            
            ctx.textBaseline = 'top';
            
            const lineHeight = 10;
            this.type.ascii.forEach((line, i) => {
                ctx.fillText(line, this.x, this.y + i * lineHeight);
            });
            
            // === BOOST BLOCK INDICATOR - Simple and clean ===
            if (isBoost && !this.hit) {
                ctx.shadowBlur = 0;
                ctx.font = '9px monospace';
                ctx.fillStyle = '#33FF0099';
                ctx.textAlign = 'center';
                ctx.fillText('[ PASS THROUGH ]', this.x + this.width / 2, this.y - 12);
            }
            
            ctx.restore();
        }
        
        getBounds() {
            const padding = 5;
            return {
                x: this.x + padding,
                y: this.y + padding,
                width: this.width - padding * 2,
                height: this.height - padding * 2
            };
        }
    }

    // ===========================================
    // INITIALIZATION
    // ===========================================
    
    function init() {
        canvas = document.getElementById('escapeCanvas');
        if (!canvas) return;
        
        ctx = canvas.getContext('2d');
        canvas.width = CONFIG.canvasWidth;
        canvas.height = CONFIG.canvasHeight;
        
        // Load high score
        try {
            state.highScore = parseInt(localStorage.getItem('localghost_escape_highscore') || '0');
        } catch (e) {
            state.highScore = 0;
        }
        
        // Initialize ground tiles
        for (let i = 0; i < Math.ceil(CONFIG.canvasWidth / 20) + 2; i++) {
            state.groundTiles.push({ x: i * 20, char: getGroundChar() });
        }
        
        setupEventListeners();
    }
    
    function getGroundChar() {
        const chars = ['─', '═', '━', '─', '─', '┄', '┈'];
        return chars[Math.floor(Math.random() * chars.length)];
    }

    function resetGame() {
        state.running = true;
        state.paused = false;
        state.gameOver = false;
        state.escaped = false;
        state.score = 0;
        state.distance = 0;
        state.speed = CONFIG.baseSpeed;
        state.gameTime = 0;
        
        state.player = {
            x: 100,
            y: CONFIG.groundY,
            width: 30,
            height: 50,
            vy: 0,
            isJumping: false,
            isDucking: false,
            duckHeight: 25
        };
        
        state.tracker = {
            distance: CONFIG.trackerStartDistance,
            speed: CONFIG.trackerStartSpeed,
            quoteTimer: 0,
            currentQuote: ''
        };
        
        state.obstacles = [];
        state.dataFragments = [];
        state.particles = [];
        state.screenShake = 0;
        state.flashIntensity = 0;
        state.boostFlash = 0;
        state.warningPulse = 0;
        
        // Spawn initial obstacles with good spacing
        for (let i = 1; i <= 2; i++) {
            spawnObstacle(CONFIG.canvasWidth + i * CONFIG.obstacleGap);
        }
    }

    // ===========================================
    // INPUT HANDLING
    // ===========================================
    
    function setupEventListeners() {
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        
        // Touch controls
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    }
    
    function handleKeyDown(e) {
        const modal = document.getElementById('escapeModal');
        if (!modal || !modal.classList.contains('active')) return;
        
        state.keys[e.key] = true;
        
        switch (e.key) {
            case ' ':
            case 'ArrowUp':
            case 'w':
            case 'W':
                e.preventDefault();
                if (state.gameOver || state.escaped) {
                    resetGame();
                } else if (!state.running) {
                    resetGame();
                } else {
                    jump();
                }
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                e.preventDefault();
                duck(true);
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                if (state.running && !state.gameOver && !state.escaped) {
                    state.paused = !state.paused;
                }
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                resetGame();
                break;
            case 'Escape':
                e.preventDefault();
                close();
                break;
        }
    }
    
    function handleKeyUp(e) {
        state.keys[e.key] = false;
        
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            duck(false);
        }
    }
    
    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        state.touchStartY = touch.clientY;
        
        if (state.gameOver || state.escaped || !state.running) {
            resetGame();
        }
    }
    
    function handleTouchEnd(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const deltaY = touch.clientY - state.touchStartY;
        
        if (deltaY < -30) {
            // Swipe up - jump
            jump();
        } else if (deltaY > 30) {
            // Swipe down - duck (momentary)
            duck(true);
            setTimeout(() => duck(false), 300);
        } else {
            // Tap - jump
            jump();
        }
    }

    // ===========================================
    // PLAYER ACTIONS
    // ===========================================
    
    function jump() {
        if (state.paused || state.gameOver) return;
        
        if (!state.player.isJumping && !state.player.isDucking) {
            state.player.vy = CONFIG.jumpForce;
            state.player.isJumping = true;
            
            // Jump particles
            for (let i = 0; i < 5; i++) {
                state.particles.push(new Particle(
                    state.player.x + state.player.width / 2,
                    CONFIG.groundY,
                    '#33FF00'
                ));
            }
        }
    }
    
    function duck(isDucking) {
        if (state.paused || state.gameOver) return;
        
        if (!state.player.isJumping) {
            state.player.isDucking = isDucking;
        }
    }

    // ===========================================
    // SPAWNING
    // ===========================================
    
    function spawnObstacle(x) {
        let typeKey;
        
        // Decide if this is a boost or hazard
        if (Math.random() < BOOST_CHANCE) {
            typeKey = BOOST_OBSTACLES[Math.floor(Math.random() * BOOST_OBSTACLES.length)];
        } else {
            typeKey = HAZARD_OBSTACLES[Math.floor(Math.random() * HAZARD_OBSTACLES.length)];
        }
        
        const type = OBSTACLES[typeKey];
        state.obstacles.push(new Obstacle(x, type));
        
        // Maybe spawn data fragment (not near boost blocks)
        if (type.type !== 'boost' && Math.random() < CONFIG.dataFragmentChance) {
            state.dataFragments.push(new DataFragment(x + 40, CONFIG.groundY));
        }
    }

    // ===========================================
    // UPDATE LOOP
    // ===========================================
    
    function update() {
        if (!state.running || state.paused || state.gameOver) return;
        
        // Increase speed over time
        state.speed = Math.min(CONFIG.maxSpeed, state.speed + CONFIG.speedIncrement);
        state.distance += state.speed;
        state.score = Math.floor(state.distance / 10);
        
        // Update tracker anger
        state.tracker.anger = Math.min(1, state.distance / 10000);
        
        updatePlayer();
        updateTracker();
        updateObstacles();
        updateDataFragments();
        updateParticles();
        updateGroundTiles();
        updateEffects();
        
        checkCollisions();
    }
    
    function updatePlayer() {
        const player = state.player;
        
        // Apply gravity
        if (player.isJumping) {
            player.vy += CONFIG.gravity;
            player.y += player.vy;
            
            // Land
            if (player.y >= CONFIG.groundY) {
                player.y = CONFIG.groundY;
                player.vy = 0;
                player.isJumping = false;
            }
        }
        
        // Trail particles while running
        if (Math.random() < 0.3) {
            state.particles.push(new Particle(
                player.x,
                CONFIG.groundY - 5,
                '#33FF0066',
                'data'
            ));
        }
    }
    
    function updateTracker() {
        const tracker = state.tracker;
        
        // Increment game time
        state.gameTime++;
        
        // Tracker accelerates linearly - inevitable doom builds
        tracker.speed += CONFIG.trackerAcceleration;
        
        // Distance changes based on speed difference
        // Player faster = distance increases (pulling ahead)
        // Tracker faster = distance decreases (catching up)
        const speedDiff = state.speed - tracker.speed;
        tracker.distance += speedDiff * 0.15;
        
        // Clamp distance - can pull ahead but has a limit
        tracker.distance = Math.max(tracker.distance, 0);
        tracker.distance = Math.min(tracker.distance, 400);  // Can get quite far ahead
        
        // Occasional quotes
        tracker.quoteTimer--;
        if (tracker.quoteTimer <= 0 && Math.random() < 0.01) {
            const timeLeft = (CONFIG.maxGameTime - state.gameTime) / 60;
            if (tracker.distance < 50) {
                tracker.currentQuote = ['CLOSE...', 'ALMOST...', 'MINE...'][Math.floor(Math.random() * 3)];
            } else if (timeLeft < 30) {
                tracker.currentQuote = ['TICK TOCK...', 'TIME RUNS OUT...'][Math.floor(Math.random() * 2)];
            } else {
                tracker.currentQuote = TRACKER_QUOTES[Math.floor(Math.random() * TRACKER_QUOTES.length)];
            }
            tracker.quoteTimer = 120;
        }
        
        // Check if caught - game over
        if (tracker.distance <= CONFIG.trackerCatchDistance) {
            gameOver();
            return;
        }
        
        // Check 3 minute deadline
        if (state.gameTime >= CONFIG.maxGameTime && !state.escaped) {
            // Survived 3 minutes without being caught = ESCAPED!
            state.escaped = true;
            state.running = false;
        }
    }
    
    function updateObstacles() {
        // Update existing obstacles
        state.obstacles = state.obstacles.filter(obs => obs.update(state.speed));
        
        // Spawn new obstacles with consistent spacing - all avoidable
        const lastObstacle = state.obstacles[state.obstacles.length - 1];
        const minGap = CONFIG.minObstacleGap;
        if (!lastObstacle || lastObstacle.x < CONFIG.canvasWidth - minGap) {
            spawnObstacle(CONFIG.canvasWidth + 50);
        }
    }
    
    function updateDataFragments() {
        state.dataFragments = state.dataFragments.filter(frag => frag.update(state.speed));
    }
    
    function updateParticles() {
        state.particles = state.particles.filter(p => p.update());
    }
    
    function updateGroundTiles() {
        state.groundTiles.forEach(tile => {
            tile.x -= state.speed;
            if (tile.x < -20) {
                tile.x = CONFIG.canvasWidth;
                tile.char = getGroundChar();
            }
        });
    }
    
    function updateEffects() {
        state.screenShake *= 0.92;
        state.flashIntensity *= 0.92;
        state.boostFlash *= 0.94;
        state.warningPulse += 0.05;
    }

    // ===========================================
    // COLLISION DETECTION
    // ===========================================
    
    function checkCollisions() {
        const player = state.player;
        const playerHeight = player.isDucking ? player.duckHeight : player.height;
        const playerBounds = {
            x: player.x + 5,
            y: player.y - playerHeight + 5,
            width: player.width - 10,
            height: playerHeight - 10
        };
        
        // Check obstacle collisions
        for (const obs of state.obstacles) {
            if (obs.hit) continue;
            
            const obsBounds = obs.getBounds();
            
            if (rectsIntersect(playerBounds, obsBounds)) {
                obs.hit = true;
                
                // Check if it's a boost or hazard
                if (obs.type.type === 'boost') {
                    onBoostHit(obs);
                } else {
                    onObstacleHit(obs);
                }
            }
        }
        
        // Check data fragment collection
        for (const frag of state.dataFragments) {
            if (frag.collected) continue;
            
            const fragBounds = {
                x: frag.x - frag.size / 2,
                y: frag.y - frag.size / 2,
                width: frag.size,
                height: frag.size
            };
            
            if (rectsIntersect(playerBounds, fragBounds)) {
                frag.collected = true;
                onDataCollected(frag);
            }
        }
    }
    
    function rectsIntersect(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }
    
    function onBoostHit(obstacle) {
        // Speed boost - crucial for staying ahead, rare so valuable
        state.speed = Math.min(CONFIG.maxSpeed, state.speed + 1.0);
        
        // Also gain some distance directly
        state.tracker.distance = Math.min(400, state.tracker.distance + 25);
        
        // Score bonus
        state.score += 100;
        
        // Visual feedback - subtle green glow
        state.boostFlash = 0.5;
        
        // Minimal particles
        for (let i = 0; i < 6; i++) {
            state.particles.push(new Particle(
                obstacle.x + obstacle.width / 2,
                obstacle.y + obstacle.height / 2,
                obstacle.type.color,
                'data'
            ));
        }
        
        updateFeedback(`${obstacle.type.name}`, '#33FF00');
    }
    
    function onObstacleHit(obstacle) {
        // Slowdown - tracker gains ground
        state.speed = Math.max(CONFIG.baseSpeed * 0.85, state.speed - 0.4);
        
        // Lose some distance
        state.tracker.distance = Math.max(20, state.tracker.distance - 12);
        
        // Visual feedback - subtle
        state.screenShake = 2;
        state.flashIntensity = 0.15;
        
        // Minimal particles
        for (let i = 0; i < 4; i++) {
            state.particles.push(new Particle(
                obstacle.x + obstacle.width / 2,
                obstacle.y + obstacle.height / 2,
                '#FF4444'
            ));
        }
        
        updateFeedback(obstacle.type.name, '#AA3333');
    }
    
    function onDataCollected(fragment) {
        state.score += 25;
        
        // Minimal particles
        for (let i = 0; i < 3; i++) {
            state.particles.push(new Particle(
                fragment.x,
                fragment.y,
                '#33FF00',
                'data'
            ));
        }
    }
    
    function updateFeedback(text, color) {
        const feedback = document.getElementById('escapeFeedback');
        if (feedback) {
            feedback.textContent = text;
            feedback.style.color = color;
        }
    }

    // ===========================================
    // GAME OVER
    // ===========================================
    
    function gameOver() {
        state.gameOver = true;
        state.running = false;
        
        // Update high score
        if (state.score > state.highScore) {
            state.highScore = state.score;
            try {
                localStorage.setItem('localghost_escape_highscore', state.highScore.toString());
            } catch (e) {}
        }
        
        // Minimal particles - calm end
        for (let i = 0; i < 10; i++) {
            state.particles.push(new Particle(
                state.player.x + state.player.width / 2,
                state.player.y - state.player.height / 2,
                i % 2 === 0 ? '#FF4444' : '#882222'
            ));
        }
        
        state.screenShake = 8;
        state.flashIntensity = 0.5;
        
        // Decay screen shake after game over
        const shakeDecay = setInterval(() => {
            state.screenShake *= 0.8;
            state.flashIntensity *= 0.85;
            if (state.screenShake < 0.3) {
                state.screenShake = 0;
                state.flashIntensity = 0;
                clearInterval(shakeDecay);
            }
        }, 40);
    }

    // ===========================================
    // RENDERING
    // ===========================================
    
    function draw() {
        if (!ctx) return;
        
        // Clear with screen shake
        ctx.save();
        if (state.screenShake > 0.5) {
            ctx.translate(
                (Math.random() - 0.5) * state.screenShake,
                (Math.random() - 0.5) * state.screenShake
            );
        }
        
        // Background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        // Subtle scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let y = 0; y < CONFIG.canvasHeight; y += 4) {
            ctx.fillRect(0, y, CONFIG.canvasWidth, 2);
        }
        
        // Draw ground
        drawGround();
        
        // Draw tracker (behind everything)
        drawTracker();
        
        // Draw obstacles
        for (const obs of state.obstacles) {
            obs.draw(ctx);
        }
        
        // Draw data fragments
        for (const frag of state.dataFragments) {
            frag.draw(ctx);
        }
        
        // Draw particles
        for (const p of state.particles) {
            p.draw(ctx);
        }
        
        // Draw player
        drawPlayer();
        
        // Draw HUD
        drawHUD();
        
        // Flash overlay - subtle red for damage
        if (state.flashIntensity > 0.05) {
            ctx.fillStyle = `rgba(255, 50, 50, ${state.flashIntensity * 0.2})`;
            ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        }
        
        // Boost flash overlay - subtle green
        if (state.boostFlash > 0.05) {
            ctx.fillStyle = `rgba(51, 255, 0, ${state.boostFlash * 0.15})`;
            ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        }
        
        // Overlays
        if (state.escaped) {
            drawEscaped();
        } else if (state.gameOver) {
            drawGameOver();
        } else if (state.paused) {
            drawPaused();
        } else if (!state.running) {
            drawStartScreen();
        }
        
        ctx.restore();
    }
    
    function drawGround() {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, CONFIG.groundY, CONFIG.canvasWidth, CONFIG.canvasHeight - CONFIG.groundY);
        
        // Ground line
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(0, CONFIG.groundY);
        ctx.lineTo(CONFIG.canvasWidth, CONFIG.groundY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Grid tiles
        ctx.font = '12px monospace';
        ctx.fillStyle = '#1a3a1a';
        state.groundTiles.forEach(tile => {
            ctx.fillText(tile.char, tile.x, CONFIG.groundY + 15);
        });
    }
    
    function drawTracker() {
        const tracker = state.tracker;
        
        // Calculate position - tracker is always visible on left side
        // distance 0 = touching player (x ~90), distance 400 = far left (x ~20)
        const playerX = 100;
        const minX = 15;   // Far left edge when distance is max
        const distanceRatio = Math.min(1, tracker.distance / 400);
        const x = playerX - 10 - (distanceRatio * (playerX - 10 - minX));
        
        // Size based on distance (closer = bigger, scarier)
        const proximity = 1 - distanceRatio;
        const size = 35 + proximity * 30;
        
        const y = CONFIG.groundY - size / 2 - 15;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Glow - subtle pulse
        const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 15 + proximity * 15 * pulse;
        
        // Eye sclera
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
        grad.addColorStop(0, '#FFFFEE');
        grad.addColorStop(0.7, '#FFEECC');
        grad.addColorStop(1, '#FFDDBB');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Bloodshot veins - subtle
        ctx.shadowBlur = 0;
        const veinCount = 5 + Math.floor(proximity * 3);
        for (let i = 0; i < veinCount; i++) {
            const veinAngle = (i / veinCount) * Math.PI * 2;
            ctx.strokeStyle = '#CC4444';
            ctx.lineWidth = 0.6 + proximity * 0.4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(veinAngle) * size * 0.2, Math.sin(veinAngle) * size * 0.12);
            ctx.lineTo(Math.cos(veinAngle) * size * 0.42, Math.sin(veinAngle) * size * 0.25);
            ctx.stroke();
        }
        
        // Iris - looks at player
        const lookAngle = Math.atan2(
            CONFIG.groundY - y - state.player.height / 2,
            state.player.x - x
        );
        const irisOffsetX = Math.cos(lookAngle) * size * 0.1;
        const irisOffsetY = Math.sin(lookAngle) * size * 0.05;
        
        const irisGrad = ctx.createRadialGradient(irisOffsetX, irisOffsetY, 0, irisOffsetX, irisOffsetY, size * 0.2);
        irisGrad.addColorStop(0, '#DD2222');
        irisGrad.addColorStop(0.6, '#BB0000');
        irisGrad.addColorStop(1, '#770000');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(irisOffsetX, irisOffsetY, size * 0.17, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupil - slit
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(irisOffsetX, irisOffsetY, size * 0.04, size * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Glint
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(irisOffsetX - size * 0.04, irisOffsetY - size * 0.04, size * 0.025, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Quote bubble - less frequent
        if (tracker.quoteTimer > 50 && tracker.currentQuote) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (tracker.quoteTimer - 50) / 50);
            ctx.font = '10px monospace';
            ctx.fillStyle = '#FF4444';
            ctx.textAlign = 'left';
            ctx.fillText(tracker.currentQuote, x + size * 0.6, y - size * 0.3);
            ctx.restore();
        }
    }
    
    function drawPlayer() {
        const player = state.player;
        const height = player.isDucking ? player.duckHeight : player.height;
        const y = player.y - height;
        
        ctx.save();
        ctx.translate(player.x, y);
        
        // Glow
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = 15;
        
        // Ghost body
        ctx.fillStyle = '#33FF00';
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 2;
        
        if (player.isDucking) {
            // Ducking - compressed ghost
            ctx.beginPath();
            ctx.ellipse(player.width / 2, height * 0.4, player.width * 0.6, height * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes - squinting
            ctx.fillStyle = '#111';
            ctx.fillRect(player.width * 0.25, height * 0.3, 6, 2);
            ctx.fillRect(player.width * 0.55, height * 0.3, 6, 2);
        } else {
            // Normal ghost shape
            ctx.beginPath();
            ctx.arc(player.width / 2, height * 0.35, player.width * 0.45, Math.PI, 0);
            ctx.lineTo(player.width * 0.95, height * 0.7);
            
            // Wavy bottom
            const wave = Math.sin(Date.now() * 0.02) * 2;
            ctx.lineTo(player.width * 0.8, height + wave);
            ctx.lineTo(player.width * 0.6, height * 0.85 + wave);
            ctx.lineTo(player.width * 0.4, height + wave);
            ctx.lineTo(player.width * 0.2, height * 0.85 + wave);
            ctx.lineTo(player.width * 0.05, height + wave);
            ctx.lineTo(player.width * 0.05, height * 0.7);
            ctx.closePath();
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = '#111';
            const eyeY = player.isJumping ? height * 0.3 : height * 0.35;
            ctx.beginPath();
            ctx.arc(player.width * 0.35, eyeY, 4, 0, Math.PI * 2);
            ctx.arc(player.width * 0.65, eyeY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    
    function drawHUD() {
        const tracker = state.tracker;
        
        // === TOP LEFT - Distance traveled ===
        ctx.font = '14px monospace';
        ctx.fillStyle = '#33FF00';
        ctx.textAlign = 'left';
        ctx.fillText(`${state.score}m`, 20, 25);
        
        // Best distance
        if (state.highScore > 0) {
            ctx.fillStyle = '#444';
            ctx.font = '10px monospace';
            ctx.fillText(`best: ${state.highScore}m`, 20, 40);
        }
        
        // === TOP CENTER - Time remaining ===
        const timeLeft = Math.max(0, CONFIG.maxGameTime - state.gameTime);
        const seconds = Math.ceil(timeLeft / 60);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        ctx.textAlign = 'center';
        ctx.font = '12px monospace';
        if (seconds <= 30) {
            ctx.fillStyle = '#FF4444';
        } else if (seconds <= 60) {
            ctx.fillStyle = '#FFAA00';
        } else {
            ctx.fillStyle = '#888';
        }
        ctx.fillText(timeStr, CONFIG.canvasWidth / 2, 25);
        
        // === TOP RIGHT - Tracker gap ===
        ctx.textAlign = 'right';
        ctx.font = '11px monospace';
        
        const gap = Math.floor(tracker.distance);
        if (gap < 40) {
            ctx.fillStyle = '#FF4444';
        } else if (gap < 80) {
            ctx.fillStyle = '#FFAA00';
        } else {
            ctx.fillStyle = '#555';
        }
        ctx.fillText(`gap: ${gap}m`, CONFIG.canvasWidth - 20, 25);
    }
    
    function drawGameOver() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        
        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 36px monospace';
        ctx.fillText('CAPTURED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 70);
        
        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.fillText('The machine caught you.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 35);
        ctx.fillText('Your data is now theirs.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 18);
        
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`${state.score}m`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 30);
        
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText('distance before capture', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 50);
        
        if (state.score === state.highScore && state.score > 0) {
            ctx.fillStyle = '#FFE66D';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('★ LONGEST RUN ★', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 80);
        }
        
        ctx.fillStyle = '#444';
        ctx.font = '11px monospace';
        ctx.fillText('SPACE = Run again  |  ESC = Exit', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 115);
    }
    
    function drawEscaped() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        
        // Victory glow
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = 30;
        
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 36px monospace';
        ctx.fillText('ESCAPED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 80);
        
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#888';
        ctx.font = '13px monospace';
        ctx.fillText('You outran the machine.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 40);
        ctx.fillText('Your data remains yours.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 20);
        
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 24px monospace';
        ctx.fillText(`${state.score}m`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 30);
        
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('"The cage is unlocked."', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 60);
        
        ctx.fillStyle = '#444';
        ctx.font = '11px monospace';
        ctx.fillText('SPACE = Run again  |  ESC = Exit', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 100);
    }
    
    function drawPaused() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 32px monospace';
        ctx.fillText('PAUSED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2);
        
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText('Press P to continue', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 40);
    }
    
    function drawStartScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        
        // Title
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 32px monospace';
        ctx.fillText('ESCAPE.EXE', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 120);
        
        // Subtitle
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText('"The cage is unlocked."', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 92);
        
        // Core concept - 3 minute survival
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('Survive 3 minutes to escape.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 60);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('The tracker accelerates. Perfect play required.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 42);
        
        // Color coding - two columns
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('RED: SURVEILLANCE', CONFIG.canvasWidth / 2 - 115, CONFIG.canvasHeight / 2 - 5);
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.fillText('Jump or duck to avoid', CONFIG.canvasWidth / 2 - 115, CONFIG.canvasHeight / 2 + 10);
        
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('GREEN: FREEHOLD APPS', CONFIG.canvasWidth / 2 + 115, CONFIG.canvasHeight / 2 - 5);
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.fillText('Pass through for speed', CONFIG.canvasWidth / 2 + 115, CONFIG.canvasHeight / 2 + 10);
        
        // Controls
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.fillText('SPACE/UP = Jump   |   DOWN = Duck', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 50);
        
        // Start prompt
        const pulse = Math.sin(Date.now() * 0.003) > 0;
        ctx.fillStyle = pulse ? '#33FF00' : '#227700';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('[ PRESS SPACE ]', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 95);
        
        // High score
        if (state.highScore > 0) {
            ctx.fillStyle = '#333';
            ctx.font = '10px monospace';
            ctx.fillText(`best: ${state.highScore}m`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 125);
        }
    }

    // ===========================================
    // GAME LOOP
    // ===========================================
    
    function gameLoop(timestamp) {
        const elapsed = timestamp - lastFrameTime;
        
        if (elapsed >= 1000 / CONFIG.targetFPS) {
            lastFrameTime = timestamp - (elapsed % (1000 / CONFIG.targetFPS));
            update();
            draw();
        }
        
        animationId = requestAnimationFrame(gameLoop);
    }

    // ===========================================
    // PUBLIC API
    // ===========================================
    
    function open() {
        const modal = document.getElementById('escapeModal');
        if (!modal) return;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        init();
        resetGame();
        state.running = false;  // Wait for player input
        
        if (animationId) cancelAnimationFrame(animationId);
        lastFrameTime = 0;
        animationId = requestAnimationFrame(gameLoop);
        
        modal.focus();
        
        updateFeedback('Run. Hide. Stay free.', '#33FF00');
    }
    
    function close() {
        const modal = document.getElementById('escapeModal');
        if (modal) {
            modal.classList.remove('active');
        }
        document.body.style.overflow = '';
        
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        
        state.running = false;
        
        const ti = document.getElementById('terminalInput');
        if (ti) ti.focus();
    }

    // Expose to window
    window.EscapeGame = { open, close };

    // Also add to LocalGhost namespace for terminal command
    if (typeof window.LocalGhost === 'undefined') {
        window.LocalGhost = {};
    }
    window.LocalGhost.openEscapeGame = open;
    window.LocalGhost.closeEscapeModal = close;

})();