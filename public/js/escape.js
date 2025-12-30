// ===========================================
// ESCAPE.EXE - RUN FROM THE MACHINE
// A Temple Run / Chrome Dino hybrid for LocalGhost.ai
// Flee from trackers through bureaucratic obstacles
// ===========================================
//
// ===========================================
// GAME BALANCE SPECIFICATION
// ===========================================
//
// WIN CONDITION: Survive exactly 3 minutes (180 seconds / 10800 frames @ 60fps)
// LOSE CONDITION: Tracker catches you (distance <= 0)
//
// PERFECT PLAY REQUIREMENTS:
// - Jump over all ground obstacles (red, type: 'jump')
// - Duck under all overhead obstacles (red, type: 'duck')  
// - Pass through all freehold apps (green, type: 'boost')
// - Never collide with red obstacles
//
// BALANCE TUNING:
// - Player starts at speed 5, accelerates to max 13
// - Tracker starts at speed 4.5, base acceleration 0.0003/frame
// - DYNAMIC DIFFICULTY:
//   - Each RED hit: +0.0003 to tracker acceleration (DEVASTATING)
//   - Each RED hit: -40m distance, -0.8 speed
//   - Each GREEN boost: -0.00008 to tracker acceleration
//   - Each GREEN boost: +15m distance, +0.5 speed
// - Perfect play (0 hits) = tracker ends at ~7.7 speed, you win
// - ANY hit = nearly fatal, need multiple boosts to recover
// - Boost spawn rate: ~8% of obstacles
// - Starting gap: 200m (max 200m), must stay > 0 for 3 minutes
// - Jump obstacles scale with speed: 1.0x at speed 5, 1.6x at speed 13
//
// COLLISION BOXES:
// - Player: 30x50 standing, 30x25 ducking, with 5px padding
// - All obstacles: 5px padding on all sides, visual matches hitbox exactly
// - Duck gap: 35px from ground (player ducking is 25px, so 10px clearance)
//
// DEBUG MODE: Set DEBUG_COLLISIONS = true to visualize hitboxes
//
// ===========================================

(function() {
    'use strict';

    // ===========================================
    // DEBUG FLAG
    // ===========================================
    const DEBUG_COLLISIONS = false;  // Set to true to visualize hitboxes

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
        
        // Tracker - base acceleration allows perfect play to win
        // Hitting reds increases eye acceleration, boosts decrease it
        trackerStartSpeed: 4.5,
        trackerAcceleration: 0.0003,  // Base rate - perfect play barely wins
        trackerStartDistance: 200,    // Start at 200m
        trackerMaxDistance: 200,      // Can't get further than 200m
        trackerCatchDistance: 0,
        
        // 3 minute hard deadline (in frames at 60fps)
        maxGameTime: 180 * 60,  // 10800 frames = 3 minutes
        
        // Obstacles
        obstacleGap: 350,
        minObstacleGap: 280,
        dataFragmentChance: 0.25,
        
        // Duck clearance - gap between ground and bottom of duck obstacle
        duckGap: 35  // Player ducking is 25px, so 10px clearance
    };

    // ===========================================
    // OBSTACLE TYPES
    // RED = TRACKING/SURVEILLANCE (scale with speed)
    // GREEN = FREEHOLD APPS (run through for boost)
    // ===========================================
    
    const OBSTACLES = {
        // === JUMP OBSTACLES - Touch the ground, jump over them ===
        // Base sizes scale up with speed (at max speed, 1.6x these values)
        COOKIE_BANNER: {
            name: 'COOKIES',
            width: 65,
            height: 45,
            type: 'jump',
            color: '#FF4444',
            ascii: []
        },
        TOS_WALL: {
            name: 'TERMS',
            width: 75,
            height: 55,
            type: 'jump',
            color: '#CC3333',
            ascii: []
        },
        CONSENT_FORM: {
            name: 'CONSENT',
            width: 55,
            height: 40,
            type: 'jump',
            color: '#FF5555',
            ascii: []
        },
        CAPTCHA: {
            name: 'CAPTCHA',
            width: 70,
            height: 50,
            type: 'jump',
            color: '#EE3333',
            ascii: []
        },
        DATA_WALL: {
            name: 'DATA HARVEST',
            width: 80,
            height: 60,
            type: 'jump',
            color: '#FF2222',
            ascii: []
        },
        PAYWALL: {
            name: 'PAYWALL',
            width: 70,
            height: 50,
            type: 'jump',
            color: '#BB2222',
            ascii: []
        },
        
        // === DUCK OBSTACLES - Hang from top, must duck under ===
        PRIVACY_BANNER: {
            name: 'PRIVACY BANNER',
            width: 100,
            height: 120,
            type: 'duck',
            color: '#DD4444',
            ascii: []
        },
        NOTIFICATION: {
            name: 'NOTIFICATION',
            width: 90,
            height: 110,
            type: 'duck',
            color: '#FF6666',
            ascii: []
        },
        AD_OVERLAY: {
            name: 'AD OVERLAY',
            width: 85,
            height: 100,
            type: 'duck',
            color: '#EE5555',
            ascii: []
        },
        
        // ===========================================
        // FREEHOLD APPS - Green portals (more frequent)
        // ===========================================
        
        FREEHOLD_APP: {
            name: 'FREEHOLD',
            width: 60,
            height: 50,
            type: 'boost',
            color: '#33FF00',
            ascii: [
                '╔══════════╗',
                '║✔ FREEHOLD║',
                '║LOCAL-FIRST║',
                '║ [ PASS ] ║',
                '╚══════════╝'
            ]
        },
        SOVEREIGN_NODE: {
            name: 'SOVEREIGN',
            width: 60,
            height: 50,
            type: 'boost',
            color: '#00FF44',
            ascii: [
                '╔══════════╗',
                '║✔SOVEREIGN║',
                '║ YOUR DATA║',
                '║ [ SAFE ] ║',
                '╚══════════╝'
            ]
        },
        EXIT_RAMP: {
            name: 'EXIT RAMP',
            width: 60,
            height: 50,
            type: 'boost',
            color: '#44FF44',
            ascii: [
                '╔══════════╗',
                '║★EXIT RAMP║',
                '║SELF-HOST ║',
                '║ [ FREE ] ║',
                '╚══════════╝'
            ]
        },
        OPEN_SOURCE: {
            name: 'OPEN SOURCE',
            width: 60,
            height: 50,
            type: 'boost',
            color: '#22FF22',
            ascii: [
                '╔══════════╗',
                '║✔OPEN SRC ║',
                '║AUDITABLE ║',
                '║ [ TRUST ]║',
                '╚══════════╝'
            ]
        }
    };
    
    // Separate arrays for spawning
    const HAZARD_OBSTACLES = ['COOKIE_BANNER', 'TOS_WALL', 'CONSENT_FORM', 'PRIVACY_BANNER', 'CAPTCHA', 'DATA_WALL', 'NOTIFICATION', 'PAYWALL', 'AD_OVERLAY'];
    const BOOST_OBSTACLES = ['FREEHOLD_APP', 'SOVEREIGN_NODE', 'EXIT_RAMP', 'OPEN_SOURCE'];
    const BOOST_CHANCE = 0.08; // ~8% - required for survival

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
    const targetFrameTime = 1000 / 60;  // 60 FPS

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
        
        // Tracker (the eye chasing you)
        tracker: {
            distance: CONFIG.trackerStartDistance,
            speed: CONFIG.trackerStartSpeed,
            quoteTimer: 0,
            currentQuote: ''
        },
        
        // Win condition
        escaped: false,
        gameTime: 0,
        endScreenTimer: 0,  // Delay before restart allowed
        showExitConfirm: false,  // Exit confirmation dialog
        
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
        
        // Stats for debugging
        boostHits: 0,
        hazardHits: 0,
        
        // Input - reset jump key state
        jumpKeyHeld: false,
        
        // Input
        keys: {},
        jumpKeyHeld: false,  // Prevents multiple jumps on long press
        duckQueued: false,   // Queue duck if pressed during jump
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
            this.y = y - 35;
            this.baseY = this.y;
            this.size = 25;
            this.collected = false;
            this.bobOffset = Math.random() * Math.PI * 2;
            this.type = ['🔐', '🔒', '💾', '📊'][Math.floor(Math.random() * 4)];
        }
        
        update(speed) {
            this.x -= speed;
            this.y = this.baseY + Math.sin(Date.now() * 0.004 + this.bobOffset) * 8;
            return this.x > -this.size;
        }
        
        draw(ctx) {
            if (this.collected) return;
            
            ctx.save();
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 15;
            ctx.font = `${this.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.type, this.x, this.y);
            ctx.restore();
        }
    }

    class Obstacle {
        constructor(x, type, currentSpeed) {
            this.type = type;
            this.x = x;
            
            // Scale jump obstacles with speed (more inertia = bigger obstacles)
            // At speed 5: scale = 1.0, at speed 13: scale = 1.6
            const speedScale = type.type === 'jump' 
                ? 1.0 + ((currentSpeed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed)) * 0.6
                : 1.0;
            
            this.width = Math.floor(type.width * speedScale);
            this.height = Math.floor(type.height * speedScale);
            this.scale = speedScale;  // Store for drawing
            
            if (type.type === 'duck') {
                // Duck obstacles: bottom edge at (groundY - duckGap)
                // Player ducking is 25px, gap is 35px, so 10px clearance
                this.y = CONFIG.groundY - CONFIG.duckGap - this.height;
            } else {
                // Jump obstacles sit on the ground
                this.y = CONFIG.groundY - this.height;
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
            const isDuck = this.type.type === 'duck';
            const bounds = this.getBounds();
            
            if (isBoost && !this.hit) {
                // === BOOST: Green glow with ASCII ===
                const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 20 + pulse * 10;
                ctx.fillStyle = `rgba(51, 255, 0, ${0.08 + pulse * 0.05})`;
                ctx.fillRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
                
                // Draw ASCII art for boost
                ctx.font = '10px monospace';
                ctx.fillStyle = this.type.color;
                ctx.textBaseline = 'top';
                const lineHeight = 10;
                this.type.ascii.forEach((line, i) => {
                    ctx.fillText(line, this.x, this.y + i * lineHeight);
                });
                
                ctx.shadowBlur = 0;
                ctx.font = '9px monospace';
                ctx.fillStyle = '#33FF0099';
                ctx.textAlign = 'center';
                ctx.fillText('[ PASS THROUGH ]', this.x + this.width / 2, this.y - 12);
                
            } else if (isBoost && this.hit) {
                // === BOOST COLLECTED: Stay green, just less glowy ===
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 5;
                
                // Draw ASCII art - stays green
                ctx.font = '10px monospace';
                ctx.fillStyle = '#33FF0088';  // Slightly faded green
                ctx.textBaseline = 'top';
                const lineHeight = 10;
                this.type.ascii.forEach((line, i) => {
                    ctx.fillText(line, this.x, this.y + i * lineHeight);
                });
                
            } else if (isDuck) {
                // === DUCK OBSTACLES: Draw box exactly matching hitbox ===
                ctx.shadowColor = this.hit ? '#FF0000' : this.type.color;
                ctx.shadowBlur = this.hit ? 20 : 8;
                
                // Fill the box
                ctx.fillStyle = this.hit ? 'rgba(255, 68, 68, 0.3)' : 'rgba(255, 68, 68, 0.15)';
                ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                // Border
                ctx.strokeStyle = this.hit ? '#FF4444' : this.type.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                // Draw warning stripes inside
                ctx.shadowBlur = 0;
                ctx.strokeStyle = this.hit ? '#FF666666' : '#FF444444';
                ctx.lineWidth = 1;
                const stripeGap = 15;
                for (let i = 0; i < bounds.width + bounds.height; i += stripeGap) {
                    ctx.beginPath();
                    ctx.moveTo(bounds.x + i, bounds.y);
                    ctx.lineTo(bounds.x, bounds.y + i);
                    ctx.stroke();
                }
                
                // Label at top
                ctx.font = 'bold 10px monospace';
                ctx.fillStyle = this.type.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(this.type.name, bounds.x + bounds.width / 2, bounds.y + 5);
                
                // DUCK indicator at bottom
                ctx.font = '9px monospace';
                ctx.fillStyle = '#FF6666';
                ctx.fillText('▼▼ DUCK ▼▼', bounds.x + bounds.width / 2, bounds.y + bounds.height - 15);
                
            } else {
                // === JUMP OBSTACLES: Draw box matching hitbox, scaled with speed ===
                ctx.shadowColor = this.hit ? '#FF0000' : this.type.color;
                ctx.shadowBlur = this.hit ? 20 : 8;
                
                // Fill the box
                ctx.fillStyle = this.hit ? 'rgba(255, 68, 68, 0.3)' : 'rgba(255, 68, 68, 0.12)';
                ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                // Border
                ctx.strokeStyle = this.hit ? '#FF4444' : this.type.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                // Warning pattern inside
                ctx.shadowBlur = 0;
                ctx.strokeStyle = this.hit ? '#FF666644' : '#FF444433';
                ctx.lineWidth = 1;
                const stripeGap = 12;
                for (let i = 0; i < bounds.width + bounds.height; i += stripeGap) {
                    ctx.beginPath();
                    ctx.moveTo(bounds.x + i, bounds.y + bounds.height);
                    ctx.lineTo(bounds.x, bounds.y + bounds.height - i);
                    ctx.stroke();
                }
                
                // Label
                ctx.font = 'bold 9px monospace';
                ctx.fillStyle = this.hit ? '#FF666688' : this.type.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.type.name, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 5);
                
                // Jump indicator
                ctx.font = '8px monospace';
                ctx.fillStyle = this.hit ? '#FF444466' : '#FF666699';
                ctx.fillText('▲ JUMP ▲', bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 8);
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
        
        try {
            state.highScore = parseInt(localStorage.getItem('localghost_escape_highscore') || '0');
        } catch (e) {
            state.highScore = 0;
        }
        
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
        state.showExitConfirm = false;
        state.score = 0;
        state.distance = 0;
        state.speed = CONFIG.baseSpeed;
        state.gameTime = 0;
        state.endScreenTimer = 0;
        state.boostHits = 0;
        state.hazardHits = 0;
        state.duckQueued = false;
        
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
        
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    }
    
    function handleKeyDown(e) {
        const modal = document.getElementById('escapeModal');
        if (!modal || !modal.classList.contains('active')) return;
        
        // Handle exit confirmation dialog
        if (state.showExitConfirm) {
            if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                e.preventDefault();
                state.showExitConfirm = false;
                close();
            } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                e.preventDefault();
                state.showExitConfirm = false;
            }
            return;
        }
        
        const isJumpKey = e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
        const isDuckKey = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
        
        // Handle jump keys - only trigger on fresh press, not held
        if (isJumpKey) {
            e.preventDefault();
            
            // On end screens, jump key does nothing - must use R to restart
            if (state.gameOver || state.escaped) {
                return;
            }
            
            if (!state.running) {
                // Start screen - space starts the game
                resetGame();
                state.jumpKeyHeld = true;
            } else if (!state.jumpKeyHeld) {
                // Only jump if this is a fresh key press
                jump();
                state.jumpKeyHeld = true;
            }
            return;
        }
        
        // Handle duck keys - duck while held
        if (isDuckKey) {
            e.preventDefault();
            duck(true);
            return;
        }
        
        // Other keys
        switch (e.key) {
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
                if (state.endScreenTimer <= 0) {
                    resetGame();
                }
                break;
            case 'Escape':
                e.preventDefault();
                state.showExitConfirm = true;
                if (state.running && !state.gameOver && !state.escaped) {
                    state.paused = true;
                }
                break;
        }
    }
    
    function handleKeyUp(e) {
        const isJumpKey = e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
        const isDuckKey = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
        
        // Release jump key hold - allows next press to trigger jump
        if (isJumpKey) {
            state.jumpKeyHeld = false;
        }
        
        // Release duck on key up
        if (isDuckKey) {
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
            jump();
        } else if (deltaY > 30) {
            duck(true);
            setTimeout(() => duck(false), 300);
        } else {
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
        
        if (state.player.isJumping) {
            // Queue duck to apply when landing
            state.duckQueued = isDucking;
        } else {
            state.player.isDucking = isDucking;
            state.duckQueued = false;
        }
    }

    // ===========================================
    // SPAWNING
    // ===========================================
    
    function spawnObstacle(x) {
        let typeKey;
        
        if (Math.random() < BOOST_CHANCE) {
            typeKey = BOOST_OBSTACLES[Math.floor(Math.random() * BOOST_OBSTACLES.length)];
        } else {
            typeKey = HAZARD_OBSTACLES[Math.floor(Math.random() * HAZARD_OBSTACLES.length)];
        }
        
        const type = OBSTACLES[typeKey];
        state.obstacles.push(new Obstacle(x, type, state.speed));
        
        if (type.type !== 'boost' && Math.random() < CONFIG.dataFragmentChance) {
            state.dataFragments.push(new DataFragment(x + 40, CONFIG.groundY));
        }
    }

    // ===========================================
    // UPDATE LOOP
    // ===========================================
    
    function update() {
        if (!state.running || state.paused || state.gameOver) return;
        
        state.speed = Math.min(CONFIG.maxSpeed, state.speed + CONFIG.speedIncrement);
        state.distance += state.speed;
        state.score = Math.floor(state.distance / 10);
        
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
        
        if (player.isJumping) {
            player.vy += CONFIG.gravity;
            player.y += player.vy;
            
            // Land
            if (player.y >= CONFIG.groundY) {
                player.y = CONFIG.groundY;
                player.vy = 0;
                player.isJumping = false;
                
                // Apply queued duck from during jump
                if (state.duckQueued) {
                    player.isDucking = true;
                    state.duckQueued = false;
                }
            }
        }
        
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
        
        state.gameTime++;
        
        // Base tracker acceleration - tuned so perfect play (0 hits) wins
        // Each RED hit MASSIVELY increases tracker acceleration (nearly fatal)
        // Each BOOST helps recover
        const hitPenalty = state.hazardHits * 0.0003;   // Each hit = devastating
        const boostBonus = state.boostHits * 0.00008;   // Boosts help recover
        const effectiveAccel = Math.max(0.0001, CONFIG.trackerAcceleration + hitPenalty - boostBonus);
        tracker.speed += effectiveAccel;
        
        const speedDiff = state.speed - tracker.speed;
        tracker.distance += speedDiff * 0.15;
        
        // Clamp distance - can't exceed max
        tracker.distance = Math.max(tracker.distance, 0);
        tracker.distance = Math.min(tracker.distance, CONFIG.trackerMaxDistance);
        
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
        
        if (tracker.distance <= CONFIG.trackerCatchDistance) {
            gameOver();
            return;
        }
        
        if (state.gameTime >= CONFIG.maxGameTime && !state.escaped) {
            state.escaped = true;
            state.running = false;
            state.endScreenTimer = 90;
        }
    }
    
    function updateObstacles() {
        state.obstacles = state.obstacles.filter(obs => obs.update(state.speed));
        
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
        
        for (const obs of state.obstacles) {
            if (obs.hit) continue;
            
            const obsBounds = obs.getBounds();
            
            if (rectsIntersect(playerBounds, obsBounds)) {
                obs.hit = true;
                
                if (obs.type.type === 'boost') {
                    onBoostHit(obs);
                } else {
                    onObstacleHit(obs);
                }
            }
        }
        
        for (const frag of state.dataFragments) {
            if (frag.collected) continue;
            
            const grabRadius = frag.size * 1.5;
            const fragBounds = {
                x: frag.x - grabRadius,
                y: frag.y - grabRadius,
                width: grabRadius * 2,
                height: grabRadius * 2
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
        // Boost helps recover - but can't fully undo a hit
        state.speed = Math.min(CONFIG.maxSpeed, state.speed + 0.5);
        state.tracker.distance = Math.min(CONFIG.trackerMaxDistance, state.tracker.distance + 15);
        state.score += 50;
        state.boostFlash = 0.5;
        state.boostHits++;
        
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
        // DEVASTATING penalty - each hit should nearly cost you the game
        state.speed = Math.max(CONFIG.baseSpeed * 0.7, state.speed - 0.8);
        state.tracker.distance = Math.max(0, state.tracker.distance - 40);  // Lose 40m!
        state.screenShake = 4;
        state.flashIntensity = 0.25;
        state.hazardHits++;
        
        for (let i = 0; i < 6; i++) {
            state.particles.push(new Particle(
                obstacle.x + obstacle.width / 2,
                obstacle.y + obstacle.height / 2,
                '#FF4444'
            ));
        }
        
        updateFeedback(obstacle.type.name, '#FF3333');
    }
    
    function onDataCollected(fragment) {
        state.score += 25;
        
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
        state.endScreenTimer = 90;  // 1.5 sec delay before restart allowed
        
        if (state.score > state.highScore) {
            state.highScore = state.score;
            try {
                localStorage.setItem('localghost_escape_highscore', state.highScore.toString());
            } catch (e) {}
        }
        
        for (let i = 0; i < 10; i++) {
            state.particles.push(new Particle(
                state.player.x + state.player.width / 2,
                state.player.y - state.player.height / 2,
                i % 2 === 0 ? '#FF4444' : '#882222'
            ));
        }
        
        state.screenShake = 8;
        state.flashIntensity = 0.5;
        
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
        
        // Decrement end screen timer
        if (state.endScreenTimer > 0) {
            state.endScreenTimer--;
        }
        
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
        
        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let y = 0; y < CONFIG.canvasHeight; y += 4) {
            ctx.fillRect(0, y, CONFIG.canvasWidth, 2);
        }
        
        drawGround();
        drawTracker();
        
        for (const obs of state.obstacles) {
            obs.draw(ctx);
        }
        
        for (const frag of state.dataFragments) {
            frag.draw(ctx);
        }
        
        for (const p of state.particles) {
            p.draw(ctx);
        }
        
        drawPlayer();
        
        // DEBUG: Draw collision boxes
        if (DEBUG_COLLISIONS && state.running && !state.paused) {
            drawDebugCollisions();
        }
        
        drawHUD();
        
        if (state.flashIntensity > 0.05) {
            ctx.fillStyle = `rgba(255, 50, 50, ${state.flashIntensity * 0.2})`;
            ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        }
        
        if (state.boostFlash > 0.05) {
            ctx.fillStyle = `rgba(51, 255, 0, ${state.boostFlash * 0.15})`;
            ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        }
        
        if (state.escaped) {
            drawEscaped();
        } else if (state.gameOver) {
            drawGameOver();
        } else if (state.paused) {
            drawPaused();
        } else if (!state.running) {
            drawStartScreen();
        }
        
        // Exit confirmation overlay (draws on top of everything)
        if (state.showExitConfirm) {
            drawExitConfirm();
        }
        
        ctx.restore();
    }
    
    function drawDebugCollisions() {
        ctx.save();
        ctx.lineWidth = 2;
        
        // Player collision box
        const player = state.player;
        const playerHeight = player.isDucking ? player.duckHeight : player.height;
        const playerBounds = {
            x: player.x + 5,
            y: player.y - playerHeight + 5,
            width: player.width - 10,
            height: playerHeight - 10
        };
        
        ctx.strokeStyle = '#00FFFF';
        ctx.strokeRect(playerBounds.x, playerBounds.y, playerBounds.width, playerBounds.height);
        
        // Duck clearance line (where bottom of duck obstacles are)
        ctx.strokeStyle = '#FFFF00';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, CONFIG.groundY - CONFIG.duckGap);
        ctx.lineTo(CONFIG.canvasWidth, CONFIG.groundY - CONFIG.duckGap);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Obstacle collision boxes
        for (const obs of state.obstacles) {
            if (obs.hit) continue;
            
            const bounds = obs.getBounds();
            
            if (obs.type.type === 'boost') {
                ctx.strokeStyle = '#00FF00';
            } else if (obs.type.type === 'duck') {
                ctx.strokeStyle = '#FF00FF';
            } else {
                ctx.strokeStyle = '#FF0000';
            }
            
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            
            // Label
            ctx.font = '8px monospace';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillText(obs.type.type.toUpperCase(), bounds.x, bounds.y - 3);
        }
        
        // Debug info panel
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(CONFIG.canvasWidth - 150, 50, 145, 100);
        ctx.strokeStyle = '#33FF00';
        ctx.strokeRect(CONFIG.canvasWidth - 150, 50, 145, 100);
        
        ctx.font = '9px monospace';
        ctx.fillStyle = '#33FF00';
        ctx.textAlign = 'left';
        
        const debugLines = [
            `Player Y: ${player.y.toFixed(0)}`,
            `Height: ${playerHeight}`,
            `Ducking: ${player.isDucking}`,
            `Duck gap: ${CONFIG.duckGap}`,
            `Boosts: ${state.boostHits}`,
            `Hits: ${state.hazardHits}`,
            `Speed: ${state.speed.toFixed(2)}`,
            `Tracker: ${state.tracker.speed.toFixed(2)}`
        ];
        
        debugLines.forEach((line, i) => {
            ctx.fillText(line, CONFIG.canvasWidth - 145, 63 + i * 12);
        });
        
        ctx.restore();
    }
    
    function drawGround() {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, CONFIG.groundY, CONFIG.canvasWidth, CONFIG.canvasHeight - CONFIG.groundY);
        
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(0, CONFIG.groundY);
        ctx.lineTo(CONFIG.canvasWidth, CONFIG.groundY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        ctx.font = '12px monospace';
        ctx.fillStyle = '#1a3a1a';
        state.groundTiles.forEach(tile => {
            ctx.fillText(tile.char, tile.x, CONFIG.groundY + 15);
        });
    }
    
    function drawTracker() {
        const tracker = state.tracker;
        
        const playerX = 100;
        const minX = 15;
        const distanceRatio = Math.min(1, tracker.distance / CONFIG.trackerMaxDistance);
        const x = playerX - 10 - (distanceRatio * (playerX - 10 - minX));
        
        const proximity = 1 - distanceRatio;
        const size = 35 + proximity * 30;
        
        const y = CONFIG.groundY - size / 2 - 15;
        
        ctx.save();
        ctx.translate(x, y);
        
        const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 15 + proximity * 15 * pulse;
        
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
        grad.addColorStop(0, '#FFFFEE');
        grad.addColorStop(0.7, '#FFEECC');
        grad.addColorStop(1, '#FFDDBB');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        
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
        
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(irisOffsetX, irisOffsetY, size * 0.04, size * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(irisOffsetX - size * 0.04, irisOffsetY - size * 0.04, size * 0.025, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
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
        
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = 15;
        
        ctx.fillStyle = '#33FF00';
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 2;
        
        if (player.isDucking) {
            ctx.beginPath();
            ctx.ellipse(player.width / 2, height * 0.4, player.width * 0.6, height * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#111';
            ctx.fillRect(player.width * 0.25, height * 0.3, 6, 2);
            ctx.fillRect(player.width * 0.55, height * 0.3, 6, 2);
        } else {
            ctx.beginPath();
            ctx.arc(player.width / 2, height * 0.35, player.width * 0.45, Math.PI, 0);
            ctx.lineTo(player.width * 0.95, height * 0.7);
            
            const wave = Math.sin(Date.now() * 0.02) * 2;
            ctx.lineTo(player.width * 0.8, height + wave);
            ctx.lineTo(player.width * 0.6, height * 0.85 + wave);
            ctx.lineTo(player.width * 0.4, height + wave);
            ctx.lineTo(player.width * 0.2, height * 0.85 + wave);
            ctx.lineTo(player.width * 0.05, height + wave);
            ctx.lineTo(player.width * 0.05, height * 0.7);
            ctx.closePath();
            ctx.fill();
            
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
        
        ctx.font = '14px monospace';
        ctx.fillStyle = '#33FF00';
        ctx.textAlign = 'left';
        ctx.fillText(`${state.score}m`, 20, 25);
        
        if (state.highScore > 0) {
            ctx.fillStyle = '#444';
            ctx.font = '10px monospace';
            ctx.fillText(`best: ${state.highScore}m`, 20, 40);
        }
        
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
    
    function formatTime(frames) {
        const totalSeconds = Math.floor(frames / 60);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        ctx.fillText(`${state.score}m`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 20);
        
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText(`Time: ${formatTime(state.gameTime)}`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 45);
        
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText(`Boosts: ${state.boostHits} | Hits: ${state.hazardHits}`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 65);
        
        if (state.score === state.highScore && state.score > 0) {
            ctx.fillStyle = '#FFE66D';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('★ LONGEST RUN ★', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 90);
        }
        
        ctx.fillStyle = '#444';
        ctx.font = '11px monospace';
        if (state.endScreenTimer > 0) {
            ctx.fillStyle = '#333';
            ctx.fillText('...', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 120);
        } else {
            ctx.fillText('R = Run again  |  ESC = Exit', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 120);
        }
    }
    
    function drawEscaped() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        
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
        ctx.fillText(`${state.score}m`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 20);
        
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText(`Time: ${formatTime(state.gameTime)}`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 45);
        
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText(`Boosts: ${state.boostHits} | Hits: ${state.hazardHits}`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 65);
        
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('"The cage is unlocked."', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 90);
        
        ctx.fillStyle = '#444';
        ctx.font = '11px monospace';
        if (state.endScreenTimer > 0) {
            ctx.fillStyle = '#333';
            ctx.fillText('...', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 120);
        } else {
            ctx.fillText('R = Run again  |  ESC = Exit', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 120);
        }
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
    
    function drawExitConfirm() {
        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        // Dialog box
        const boxW = 320;
        const boxH = 140;
        const boxX = (CONFIG.canvasWidth - boxW) / 2;
        const boxY = (CONFIG.canvasHeight - boxH) / 2;
        
        // Box background
        ctx.fillStyle = '#111';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        
        // Box border
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        
        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF6666';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('EXIT GAME?', CONFIG.canvasWidth / 2, boxY + 35);
        
        // Message
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('Your progress will be lost.', CONFIG.canvasWidth / 2, boxY + 60);
        
        // Buttons
        const btnY = boxY + 95;
        const btnW = 100;
        const btnH = 30;
        const gap = 30;
        
        // Yes button
        const yesX = CONFIG.canvasWidth / 2 - btnW - gap / 2;
        ctx.fillStyle = '#331111';
        ctx.fillRect(yesX, btnY, btnW, btnH);
        ctx.strokeStyle = '#FF4444';
        ctx.strokeRect(yesX, btnY, btnW, btnH);
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('[Y] YES', yesX + btnW / 2, btnY + 20);
        
        // No button
        const noX = CONFIG.canvasWidth / 2 + gap / 2;
        ctx.fillStyle = '#113311';
        ctx.fillRect(noX, btnY, btnW, btnH);
        ctx.strokeStyle = '#33FF00';
        ctx.strokeRect(noX, btnY, btnW, btnH);
        ctx.fillStyle = '#33FF00';
        ctx.fillText('[N] NO', noX + btnW / 2, btnY + 20);
    }
    
    function drawStartScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
        
        ctx.textAlign = 'center';
        
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 32px monospace';
        ctx.fillText('ESCAPE.EXE', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 120);
        
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText('"The cage is unlocked."', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 92);
        
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('Survive 3 minutes to escape.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 60);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('The tracker accelerates. Perfect play required.', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 42);
        
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
        
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.fillText('SPACE/UP = Jump   |   DOWN = Duck', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 50);
        
        const pulse = Math.sin(Date.now() * 0.003) > 0;
        ctx.fillStyle = pulse ? '#33FF00' : '#227700';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('[ PRESS SPACE ]', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 95);
        
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
        
        if (elapsed >= targetFrameTime) {
            lastFrameTime = timestamp - (elapsed % targetFrameTime);
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
        state.running = false;
        
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
        state.showExitConfirm = false;
        
        const ti = document.getElementById('terminalInput');
        if (ti) ti.focus();
    }

    window.EscapeGame = { open, close };

    if (typeof window.LocalGhost === 'undefined') {
        window.LocalGhost = {};
    }
    window.LocalGhost.openEscapeGame = open;
    window.LocalGhost.closeEscapeModal = close;

})();