// ===========================================
// THE SHADOW - LocalGhost Snake Game
// A data-consumption metaphor wrapped in retro gameplay
// ===========================================

(function() {
    'use strict';

    // ===========================================
    // CONSTANTS & CONFIG
    // ===========================================
    
    const CONFIG = {
        gridSize: 20,
        gameSpeed: 100,
        highScoreThreshold: 4,
        maxFireScore: 60,
        borderWarningDistance: 3,  // Tiles from edge to start warning
        storageKeys: {
            scores: 'localghost_shadow_scores',
            playerName: 'localghost_player_name'
        }
    };

    const FILE_TYPES = [
        { color: '#FF6B6B', name: 'journal.txt', category: 'thoughts' },
        { color: '#4ECDC4', name: 'photo.jpg', category: 'memories' },
        { color: '#FFE66D', name: 'bank.csv', category: 'finances' },
        { color: '#FF8B94', name: 'health.json', category: 'health' },
        { color: '#A8E6CF', name: 'location.log', category: 'movement' },
        { color: '#DDA0DD', name: 'searches.txt', category: 'interests' },
        { color: '#87CEEB', name: 'messages.db', category: 'relationships' },
        { color: '#F4A460', name: 'calendar.ics', category: 'schedule' },
        { color: '#DA70D6', name: 'playlist.m3u', category: 'taste' },
        { color: '#98D8C8', name: 'notes.md', category: 'ideas' },
    ];

    const KNOWLEDGE_LEVELS = [
        { threshold: 0, level: 'STRANGER', color: '#808080' },
        { threshold: 3, level: 'ACQUAINTANCE', color: '#A0A0A0' },
        { threshold: 6, level: 'FAMILIAR', color: '#33FF00' },
        { threshold: 10, level: 'CONFIDANT', color: '#33FF00' },
        { threshold: 15, level: 'TRUSTED', color: '#4ECDC4' },
        { threshold: 20, level: 'FULLY SYNCED', color: '#FFE66D' },
    ];

    const FEEDBACK_MESSAGES = {
        thoughts: [
            "Stored locally. Ready when you need to revisit.",
            "Your reflections, encrypted and yours alone.",
            "No cloud ever sees this. Only you.",
        ],
        memories: [
            "Safe on your hardware. Searchable by you.",
            "These stay yours. Forever findable.",
            "Backed up locally. Never scraped. Never sold.",
        ],
        finances: [
            "Patterns only you can see. No bank can sell this.",
            "Your spending, your insights, your device.",
            "Track your goals without feeding an algorithm.",
        ],
        health: [
            "Trends stay private. No insurer will ever see this.",
            "Your body, your data, your business.",
            "Health insights without the surveillance.",
        ],
        movement: [
            "Your places. Not a timeline for advertisers.",
            "Location history that stays in your house.",
            "Remember where you've been. Share with no one.",
        ],
        interests: [
            "Curiosity without a profile being built on you.",
            "Discover more. Feed no recommendation engine.",
            "Your interests, not their targeting data.",
        ],
        relationships: [
            "The people who matter. Visible only to you.",
            "Your connections, off the social graph.",
            "Memories with loved ones. Zero data brokers.",
        ],
        schedule: [
            "Your time. Not optimised for someone else's profit.",
            "A calendar that doesn't report back.",
            "Plan your life without feeding the machine.",
        ],
        taste: [
            "What moves you stays between us.",
            "No playlist sold to advertisers.",
            "Your vibe. Your secret.",
        ],
        ideas: [
            "Captured locally. Built on when you're ready.",
            "Your ideas don't train someone else's model.",
            "Safe here. Waiting for you. No one else.",
        ],
    };

    // ===========================================
    // DOM ELEMENT CACHE
    // ===========================================
    
    let elements = {};

    function cacheElements() {
        elements = {
            gameModal: document.getElementById('gameModal'),
            gameCanvas: document.getElementById('gameCanvas'),
            snakeScore: document.getElementById('snakeScore'),
            knowledgeLevel: document.getElementById('knowledgeLevel'),
            gameFileConsumed: document.getElementById('gameFileConsumed'),
            gameFeedback: document.getElementById('gameFeedback'),
            gameOverText: document.getElementById('gameOverText'),
            playerNameInput: document.getElementById('playerNameInput'),
            highScoresList: document.getElementById('highScoresList'),
            highScoreNotice: document.getElementById('highScoreNotice'),
            gameLeaderboard: document.getElementById('gameLeaderboard'),
            gameModalContent: document.querySelector('#gameModal .modal'),
            terminalInput: document.getElementById('terminalInput'),
            inputMirror: document.getElementById('inputMirror'),
            // Mobile elements
            joystickBase: document.getElementById('joystickBase'),
            joystickNub: document.getElementById('joystickNub'),
            mobilePauseBtn: document.getElementById('mobilePauseBtn'),
            mobileRestartBtn: document.getElementById('mobileRestartBtn'),
            leaderboardCloseBtn: document.getElementById('leaderboardCloseBtn')
        };
    }

    // ===========================================
    // GAME STATE
    // ===========================================
    
    const state = {
        ctx: null,
        snake: [],
        food: { x: 0, y: 0, type: null },
        // Current movement direction (what the snake is actually doing)
        dx: 0,
        dy: 0,
        // Queued direction (what the player wants to do next)
        nextDx: 0,
        nextDy: 0,
        // Has a direction change been queued this tick?
        directionQueued: false,
        score: 0,
        filesEaten: [],
        loop: null,
        running: false,
        paused: false,
        pausedByLeaderboard: false,
        tileCount: 0,
        playerName: 'GHOST',
        highScores: [],
        leaderboardVisible: false,
        fireIntensity: 0,
        // Mobile/joystick state
        isMobile: false,
        joystick: {
            active: false,
            centerX: 0,
            centerY: 0,
            currentX: 0,
            currentY: 0,
            lastX: 0,
            lastY: 0
        }
    };

    // Fire animation state
    let fireAnimationId = null;
    let fireParticles = [];

    // ===========================================
    // MOBILE DETECTION
    // ===========================================
    
    function detectMobile() {
        state.isMobile = (
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (window.matchMedia('(hover: none) and (pointer: coarse)').matches)
        );
        return state.isMobile;
    }

    // ===========================================
    // UTILITY FUNCTIONS
    // ===========================================
    
    function getKnowledgeLevel() {
        for (let i = KNOWLEDGE_LEVELS.length - 1; i >= 0; i--) {
            if (state.score >= KNOWLEDGE_LEVELS[i].threshold) {
                return KNOWLEDGE_LEVELS[i];
            }
        }
        return KNOWLEDGE_LEVELS[0];
    }

    function getRandomFeedback(category) {
        const messages = FEEDBACK_MESSAGES[category];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    // ===========================================
    // HIGH SCORES
    // ===========================================
    
    function loadHighScores() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.scores);
            state.highScores = saved ? JSON.parse(saved) : [];
        } catch (e) {
            state.highScores = [];
        }
    }

    function saveHighScore() {
        const entry = {
            name: (state.playerName || 'GHOST').substring(0, 6).toUpperCase(),
            score: state.score,
            date: new Date().toISOString().split('T')[0]
        };
        state.highScores.push(entry);
        state.highScores.sort((a, b) => b.score - a.score);
        state.highScores = state.highScores.slice(0, 5);
        localStorage.setItem(CONFIG.storageKeys.scores, JSON.stringify(state.highScores));
        renderHighScores();
    }

    function renderHighScores() {
        if (!elements.highScoresList) return;
        
        if (state.highScores.length === 0) {
            elements.highScoresList.innerHTML = '<div class="no-scores">NO RECORDS YET</div>';
            return;
        }
        
        elements.highScoresList.innerHTML = state.highScores
            .slice(0, 5)
            .map((s, i) => {
                const name = s.name.padEnd(12, '.');
                const score = String(s.score).padStart(3);
                return `<div class="score-row"><span class="score-rank">${String(i + 1).padStart(2, '0')}.</span> <span class="score-name">${name}</span> <span class="score-pts">${score}</span> <span class="score-date">${s.date}</span></div>`;
            })
            .join('');
    }

    function getHighScores() {
        return state.highScores;
    }

    // ===========================================
    // FIRE EFFECT SYSTEM
    // ===========================================
    
    class FireParticle {
        constructor(x, y, side, intensity) {
            this.x = x;
            this.y = y;
            this.side = side;
            this.size = 2 + Math.random() * 5 * intensity;
            this.life = 0.2 + Math.random() * 0.3 + intensity * 0.2;
            this.maxLife = this.life;
            this.speed = 0.8 + Math.random() * 1.5 * intensity;
            this.drift = (Math.random() - 0.5) * 0.8;
            this.intensity = intensity;
            this.flicker = Math.random();
        }

        update() {
            this.life -= 0.02;
            this.flicker = Math.random();
            
            switch(this.side) {
                case 'top':
                    this.y -= this.speed;
                    this.x += this.drift;
                    break;
                case 'bottom':
                    this.y -= this.speed * 0.4;
                    this.x += this.drift;
                    break;
                case 'left':
                    this.y -= this.speed * 0.6;
                    this.x -= this.speed * 0.4;
                    break;
                case 'right':
                    this.y -= this.speed * 0.6;
                    this.x += this.speed * 0.4;
                    break;
            }
            
            this.size *= 0.95;
            return this.life > 0 && this.size > 0.3;
        }
    }

    function updateFireEffect() {
        if (!elements.gameModalContent) return;
        
        const score = state.score;
        const maxScore = CONFIG.maxFireScore;
        
        let intensity;
        if (score < 10) {
            intensity = (score / 10) * 0.2;
        } else {
            intensity = 0.2 + ((Math.min(score, maxScore) - 10) / (maxScore - 10)) * 0.8;
        }
        
        const glowSize = Math.floor(2 + intensity * 12);
        const glowOpacity = (0.05 + intensity * 0.3).toFixed(2);
        
        elements.gameModalContent.style.boxShadow = `0 0 ${glowSize}px rgba(51, 255, 0, ${glowOpacity})`;
        
        if (score > 0 && !fireAnimationId) {
            startFireAnimation();
        } else if (score === 0 && fireAnimationId) {
            stopFireAnimation();
        }
        
        state.fireIntensity = intensity;
    }

    function startFireAnimation() {
        const modal = elements.gameModalContent;
        if (!modal) return;
        
        let fireCanvas = document.getElementById('fireCanvas');
        if (!fireCanvas) {
            fireCanvas = document.createElement('canvas');
            fireCanvas.id = 'fireCanvas';
            fireCanvas.style.cssText = 'position:absolute;top:-30px;left:-10px;width:calc(100% + 20px);height:calc(100% + 40px);pointer-events:none;';
            modal.style.position = 'relative';
            modal.style.overflow = 'visible';
            modal.insertBefore(fireCanvas, modal.firstChild);
        }
        
        const ctx = fireCanvas.getContext('2d');
        fireParticles = [];
        
        function animateFire() {
            const w = modal.offsetWidth + 20;
            const h = modal.offsetHeight + 40;
            fireCanvas.width = w;
            fireCanvas.height = h;
            
            const offsetX = 10;
            const offsetY = 30;
            
            ctx.clearRect(0, 0, w, h);
            
            const intensity = state.fireIntensity || 0;
            const spawnRate = Math.floor(1 + intensity * 10);
            const modalW = modal.offsetWidth;
            const modalH = modal.offsetHeight;
            
            for (let i = 0; i < spawnRate; i++) {
                const rand = Math.random();
                let side;
                if (rand < 0.5) {
                    side = 'top';
                } else if (rand < 0.7) {
                    side = 'left';
                } else if (rand < 0.9) {
                    side = 'right';
                } else {
                    side = 'bottom';
                }
                
                let x, y;
                
                switch(side) {
                    case 'top':
                        x = offsetX + Math.random() * modalW;
                        y = offsetY + 2;
                        break;
                    case 'bottom':
                        x = offsetX + Math.random() * modalW;
                        y = offsetY + modalH - 2;
                        break;
                    case 'left':
                        x = offsetX + 2;
                        y = offsetY + Math.random() * modalH;
                        break;
                    case 'right':
                        x = offsetX + modalW - 2;
                        y = offsetY + Math.random() * modalH;
                        break;
                }
                
                if (Math.random() < 0.1 + intensity * 0.6) {
                    fireParticles.push(new FireParticle(x, y, side, intensity));
                }
            }
            
            fireParticles = fireParticles.filter(p => {
                const alive = p.update();
                if (alive) {
                    const lifeRatio = p.life / p.maxLife;
                    const alpha = lifeRatio * p.intensity * (0.5 + p.flicker * 0.5);
                    
                    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.5);
                    gradient.addColorStop(0, `rgba(220, 255, 180, ${alpha})`);
                    gradient.addColorStop(0.3, `rgba(100, 255, 50, ${alpha * 0.8})`);
                    gradient.addColorStop(0.7, `rgba(30, 200, 30, ${alpha * 0.4})`);
                    gradient.addColorStop(1, `rgba(0, 80, 0, 0)`);
                    
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                }
                return alive;
            });
            
            fireAnimationId = requestAnimationFrame(animateFire);
        }
        
        fireAnimationId = requestAnimationFrame(animateFire);
    }

    function stopFireAnimation() {
        if (fireAnimationId) {
            cancelAnimationFrame(fireAnimationId);
            fireAnimationId = null;
        }
        fireParticles = [];
        const fireCanvas = document.getElementById('fireCanvas');
        if (fireCanvas) {
            fireCanvas.remove();
        }
    }

    function resetFireEffect() {
        if (!elements.gameModalContent) return;
        elements.gameModalContent.style.boxShadow = '';
        elements.gameModalContent.classList.remove('fire-medium', 'fire-intense');
        stopFireAnimation();
        state.fireIntensity = 0;
    }

    // ===========================================
    // LEADERBOARD
    // ===========================================
    
    function showLeaderboard() {
        if (!elements.gameLeaderboard) return;
        state.leaderboardVisible = true;
        elements.gameLeaderboard.classList.add('visible');
    }

    function hideLeaderboard() {
        if (!elements.gameLeaderboard) return;
        state.leaderboardVisible = false;
        elements.gameLeaderboard.classList.remove('visible');
    }
    
    function toggleLeaderboard() {
        if (!elements.gameLeaderboard) return;
        
        state.leaderboardVisible = !state.leaderboardVisible;
        
        if (state.leaderboardVisible) {
            elements.gameLeaderboard.classList.add('visible');
            if (state.running && !state.paused) {
                state.paused = true;
                state.pausedByLeaderboard = true;
            }
        } else {
            elements.gameLeaderboard.classList.remove('visible');
            if (state.pausedByLeaderboard && state.running) {
                state.paused = false;
                state.pausedByLeaderboard = false;
                elements.gameFeedback.textContent = 'Syncing your data...';
            }
        }
    }

    // ===========================================
    // JOYSTICK CONTROLS
    // ===========================================
    
    function handleJoystickStart(e) {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const rect = elements.joystickBase.getBoundingClientRect();
        
        state.joystick.active = true;
        state.joystick.centerX = rect.left + rect.width / 2;
        state.joystick.centerY = rect.top + rect.height / 2;
        state.joystick.currentX = touch.clientX;
        state.joystick.currentY = touch.clientY;
        state.joystick.lastX = touch.clientX;
        state.joystick.lastY = touch.clientY;
        
        elements.joystickNub.classList.add('active');
        updateNubVisual(touch.clientX, touch.clientY);
        
        // Start game if paused
        if (state.paused && state.running && !state.leaderboardVisible) {
            state.paused = false;
            elements.gameFeedback.textContent = 'Syncing your data...';
        }
    }

    function handleJoystickMove(e) {
        if (!state.joystick.active) return;
        e.preventDefault();
        
        const touch = e.touches ? e.touches[0] : e;
        
        // Store previous position
        state.joystick.lastX = state.joystick.currentX;
        state.joystick.lastY = state.joystick.currentY;
        
        // Update current position
        state.joystick.currentX = touch.clientX;
        state.joystick.currentY = touch.clientY;
        
        // Update visual
        updateNubVisual(touch.clientX, touch.clientY);
        
        // Detect direction from finger movement
        updateDirectionFromMovement();
    }

    function handleJoystickEnd(e) {
        if (!state.joystick.active) return;
        e.preventDefault();
        
        state.joystick.active = false;
        elements.joystickNub.classList.remove('active');
        
        // Reset nub to center
        elements.joystickNub.style.transform = 'translate(-50%, -50%)';
    }

    /**
     * Update nub visual to follow finger (constrained to base)
     */
    function updateNubVisual(clientX, clientY) {
        const dx = clientX - state.joystick.centerX;
        const dy = clientY - state.joystick.centerY;
        
        const baseSize = elements.joystickBase.offsetWidth;
        const maxDist = baseSize * 0.35;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        let limitedX = dx;
        let limitedY = dy;
        
        // Constrain to circle
        if (dist > maxDist) {
            const angle = Math.atan2(dy, dx);
            limitedX = Math.cos(angle) * maxDist;
            limitedY = Math.sin(angle) * maxDist;
        }
        
        elements.joystickNub.style.transform = `translate(calc(-50% + ${limitedX}px), calc(-50% + ${limitedY}px))`;
    }

    /**
     * Detect direction from finger MOVEMENT (not position)
     * This feels like "pushing" the snake in a direction
     */
    function updateDirectionFromMovement() {
        const dx = state.joystick.currentX - state.joystick.lastX;
        const dy = state.joystick.currentY - state.joystick.lastY;
        
        // Need minimum movement to register (prevents jitter)
        const minMove = 4;
        if (Math.abs(dx) < minMove && Math.abs(dy) < minMove) return;
        
        // Determine primary axis of movement
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal movement dominates
            if (dx > 0) {
                queueDirection(1, 0);  // Moving finger right → go right
            } else {
                queueDirection(-1, 0); // Moving finger left → go left
            }
        } else {
            // Vertical movement dominates
            if (dy > 0) {
                queueDirection(0, 1);  // Moving finger down → go down
            } else {
                queueDirection(0, -1); // Moving finger up → go up
            }
        }
    }

    function setupJoystick() {
        if (!elements.joystickBase) return;
        
        // Touch events
        elements.joystickBase.addEventListener('touchstart', handleJoystickStart, { passive: false });
        document.addEventListener('touchmove', handleJoystickMove, { passive: false });
        document.addEventListener('touchend', handleJoystickEnd, { passive: false });
        document.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
        
        // Mouse events for testing on desktop
        elements.joystickBase.addEventListener('mousedown', handleJoystickStart);
        document.addEventListener('mousemove', handleJoystickMove);
        document.addEventListener('mouseup', handleJoystickEnd);
    }

    function setupMobileButtons() {
        if (elements.mobilePauseBtn) {
            elements.mobilePauseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (state.running && !state.leaderboardVisible) {
                    state.paused = !state.paused;
                    elements.gameFeedback.textContent = state.paused ? 'Paused...' : 'Syncing your data...';
                    // Update button icon
                    const icon = elements.mobilePauseBtn.querySelector('.btn-icon');
                    if (icon) icon.textContent = state.paused ? '▶' : '▮▮';
                }
            });
        }
        
        if (elements.mobileRestartBtn) {
            elements.mobileRestartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                initGame();
            });
        }
        
        if (elements.leaderboardCloseBtn) {
            elements.leaderboardCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                hideLeaderboard();
                initGame();
            });
        }
    }

    // ===========================================
    // CORE GAME LOGIC
    // ===========================================
    
    function initGame() {
        loadHighScores();
        renderHighScores();
        
        const savedName = localStorage.getItem(CONFIG.storageKeys.playerName);
        if (savedName) {
            state.playerName = savedName.substring(0, 6).toUpperCase();
            if (elements.playerNameInput) elements.playerNameInput.value = state.playerName;
        } else {
            state.playerName = 'GHOST';
            if (elements.playerNameInput) elements.playerNameInput.value = 'GHOST';
        }
        
        if (elements.highScoreNotice) {
            elements.highScoreNotice.classList.remove('visible');
            elements.highScoreNotice.textContent = '';
        }

        resetFireEffect();
        hideLeaderboard();
        state.pausedByLeaderboard = false;

        state.ctx = elements.gameCanvas.getContext('2d');
        state.tileCount = elements.gameCanvas.width / CONFIG.gridSize;
        
        state.snake = [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 }
        ];
        
        // Reset direction state
        state.dx = 1;
        state.dy = 0;
        state.nextDx = 1;
        state.nextDy = 0;
        state.directionQueued = false;
        
        state.score = 0;
        state.filesEaten = [];
        
        elements.snakeScore.textContent = '0';
        elements.knowledgeLevel.textContent = 'STRANGER';
        elements.knowledgeLevel.style.color = '#808080';
        elements.gameFileConsumed.textContent = '';
        elements.gameOverText.classList.remove('visible');
        
        // Reset mobile UI
        if (elements.mobilePauseBtn) {
            const icon = elements.mobilePauseBtn.querySelector('.btn-icon');
            if (icon) icon.textContent = '▮▮';
        }
        
        // Show appropriate start message
        if (state.isMobile) {
            elements.gameFeedback.textContent = 'Touch joystick to begin...';
        } else {
            elements.gameFeedback.textContent = 'Press SPACE or any arrow key to begin...';
        }
        
        placeFood();
        state.running = true;
        state.paused = true;

        if (state.loop) clearInterval(state.loop);
        state.loop = setInterval(updateGame, CONFIG.gameSpeed);
        drawGame();
    }

    function placeFood() {
        state.food.x = Math.floor(Math.random() * state.tileCount);
        state.food.y = Math.floor(Math.random() * state.tileCount);
        state.food.type = FILE_TYPES[Math.floor(Math.random() * FILE_TYPES.length)];

        for (let segment of state.snake) {
            if (segment.x === state.food.x && segment.y === state.food.y) {
                placeFood();
                return;
            }
        }
    }

    /**
     * Queue a direction change - validates against current ACTUAL direction
     * to prevent 180-degree reversals, even with rapid key presses
     */
    function queueDirection(newDx, newDy) {
        // Can only queue one direction per tick
        if (state.directionQueued) return false;
        
        // Check against current actual direction to prevent reversal
        // This is the key fix: we check against dx/dy (what we're doing)
        // not nextDx/nextDy (what we queued)
        const isReversal = (newDx === -state.dx && newDy === -state.dy);
        const isStationary = (state.dx === 0 && state.dy === 0);
        
        if (isReversal && !isStationary) {
            return false;
        }
        
        state.nextDx = newDx;
        state.nextDy = newDy;
        state.directionQueued = true;
        return true;
    }

    function updateGame() {
        if (!state.running || state.paused) return;

        // Apply queued direction at the start of each tick
        state.dx = state.nextDx;
        state.dy = state.nextDy;
        state.directionQueued = false;  // Allow new input for next tick

        const head = { x: state.snake[0].x + state.dx, y: state.snake[0].y + state.dy };

        // Wall collision
        if (head.x < 0 || head.x >= state.tileCount || head.y < 0 || head.y >= state.tileCount) {
            gameOver();
            return;
        }

        // Self collision - skip the tail segment if we're not growing
        // because it will move out of the way
        const checkLength = state.snake.length;
        for (let i = 0; i < checkLength; i++) {
            const segment = state.snake[i];
            if (head.x === segment.x && head.y === segment.y) {
                gameOver();
                return;
            }
        }

        state.snake.unshift(head);

        // Food collision
        if (head.x === state.food.x && head.y === state.food.y) {
            state.score += 1;
            elements.snakeScore.textContent = state.score;
            state.filesEaten.push(state.food.type);

            const knowledge = getKnowledgeLevel();
            elements.knowledgeLevel.textContent = knowledge.level;
            elements.knowledgeLevel.style.color = knowledge.color;

            elements.gameFileConsumed.innerHTML = `<span style="color: ${state.food.type.color}">[${state.food.type.name}]</span>`;
            elements.gameFeedback.textContent = getRandomFeedback(state.food.type.category);

            updateFireEffect();
            placeFood();
        } else {
            state.snake.pop();
        }

        drawGame();
    }

    function drawGame() {
        const ctx = state.ctx;
        const canvas = elements.gameCanvas;
        const gridSize = CONFIG.gridSize;
        const tileCount = state.tileCount;

        // Background
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid lines
        ctx.strokeStyle = '#1a1a1a';
        for (let i = 0; i < tileCount; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridSize, 0);
            ctx.lineTo(i * gridSize, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * gridSize);
            ctx.lineTo(canvas.width, i * gridSize);
            ctx.stroke();
        }

        // Border warning effect based on snake head proximity
        const head = state.snake[0];
        if (head) {
            drawBorderWarning(ctx, canvas, head, tileCount, gridSize);
        }

        // Snake
        state.snake.forEach((segment, index) => {
            if (index === 0) {
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#33FF00';
            } else {
                ctx.shadowBlur = 0;
                const alpha = 1 - (index / state.snake.length) * 0.6;
                ctx.fillStyle = `rgba(51, 255, 0, ${alpha})`;
            }
            ctx.fillRect(
                segment.x * gridSize + 1,
                segment.y * gridSize + 1,
                gridSize - 2,
                gridSize - 2
            );
        });
        ctx.shadowBlur = 0;

        // Food
        ctx.shadowColor = state.food.type.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = state.food.type.color;
        ctx.fillRect(
            state.food.x * gridSize + 2,
            state.food.y * gridSize + 2,
            gridSize - 4,
            gridSize - 4
        );
        ctx.shadowBlur = 0;
    }

    /**
     * Draw warning border when snake head approaches edge
     * Simple 1px line that fades in
     */
    function drawBorderWarning(ctx, canvas, head, tileCount, gridSize) {
        const warnDist = CONFIG.borderWarningDistance;
        
        // Calculate distance to each edge (in tiles)
        const distances = {
            top: head.y,
            bottom: tileCount - 1 - head.y,
            left: head.x,
            right: tileCount - 1 - head.x
        };

        ctx.save();

        Object.entries(distances).forEach(([edge, dist]) => {
            if (dist >= warnDist) return;
            
            // Cubic curve: invisible at distance, visible at edge
            const linearProximity = 1 - (dist / warnDist);
            const alpha = Math.pow(linearProximity, 3) * 0.8;  // Max 0.8 opacity
            
            ctx.fillStyle = `rgba(255, 70, 70, ${alpha})`;
            
            switch (edge) {
                case 'top':
                    ctx.fillRect(0, 0, canvas.width, 1);
                    break;
                case 'bottom':
                    ctx.fillRect(0, canvas.height - 1, canvas.width, 1);
                    break;
                case 'left':
                    ctx.fillRect(0, 0, 1, canvas.height);
                    break;
                case 'right':
                    ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
                    break;
            }
        });

        ctx.restore();
    }

    function gameOver() {
        state.running = false;
        clearInterval(state.loop);
        elements.gameOverText.classList.add('visible');
        elements.gameFileConsumed.textContent = '';

        const knowledge = getKnowledgeLevel();
        const fileCount = state.score;
        
        if (knowledge.level === 'FULLY SYNCED') {
            elements.gameFeedback.textContent = `${fileCount} files synced. I understand you completely now.`;
        } else if (fileCount >= 10) {
            elements.gameFeedback.textContent = `${fileCount} files synced. We're getting to know each other.`;
        } else if (fileCount >= 5) {
            elements.gameFeedback.textContent = `${fileCount} files synced. A good start.`;
        } else {
            elements.gameFeedback.textContent = `${fileCount} files synced. There's so much more to learn.`;
        }

        if (state.score > CONFIG.highScoreThreshold) {
            saveHighScore();
            if (elements.highScoreNotice) {
                elements.highScoreNotice.textContent = `RECORDED: ${state.playerName} - ${state.score} files`;
                elements.highScoreNotice.classList.add('visible');
            }
        }

        // Reset pause button icon
        if (elements.mobilePauseBtn) {
            const icon = elements.mobilePauseBtn.querySelector('.btn-icon');
            if (icon) icon.textContent = '▮▮';
        }

        // Show leaderboard on game over
        setTimeout(() => {
            showLeaderboard();
        }, 500);
    }

    // ===========================================
    // INPUT HANDLING
    // ===========================================
    
    function handleInput(e) {
        if (!elements.gameModal || !elements.gameModal.classList.contains('active')) return;
        
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                activeEl.blur();
                elements.gameModal.focus();
            } else {
                return;
            }
        }

        const unpause = () => {
            if (state.paused && state.running) {
                state.paused = false;
                elements.gameFeedback.textContent = 'Syncing your data...';
            }
        };

        switch (e.key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                if (queueDirection(0, -1)) unpause();
                e.preventDefault();
                break;
            case 'arrowdown':
            case 's':
                if (queueDirection(0, 1)) unpause();
                e.preventDefault();
                break;
            case 'arrowleft':
            case 'a':
                if (queueDirection(-1, 0)) unpause();
                e.preventDefault();
                break;
            case 'arrowright':
            case 'd':
                if (queueDirection(1, 0)) unpause();
                e.preventDefault();
                break;
            case ' ':
                if (state.running) {
                    state.paused = !state.paused;
                    elements.gameFeedback.textContent = state.paused ? 'Paused...' : 'Syncing your data...';
                }
                e.preventDefault();
                break;
            case 'r':
                initGame();
                elements.gameModal.focus();
                e.preventDefault();
                break;
            case 'h':
            case 'l':
                toggleLeaderboard();
                e.preventDefault();
                break;
        }
    }

    // ===========================================
    // MODAL CONTROL
    // ===========================================
    
    function open() {
        cacheElements();
        detectMobile();  // Re-detect in case orientation/device changed
        elements.gameModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Clear terminal input to prevent key conflicts
        if (elements.terminalInput) {
            elements.terminalInput.value = '';
            if (elements.inputMirror) elements.inputMirror.textContent = '';
            elements.terminalInput.blur();
        }
        
        initGame();
        elements.gameModal.focus();
    }

    function close() {
        if (!elements.gameModal) return;
        
        elements.gameModal.classList.remove('active');
        document.body.style.overflow = '';
        state.running = false;
        if (state.loop) clearInterval(state.loop);
        resetFireEffect();
        
        // Return focus to terminal
        if (elements.terminalInput) {
            elements.terminalInput.focus();
        }
    }

    // ===========================================
    // INITIALISATION
    // ===========================================
    
    function init() {
        cacheElements();
        detectMobile();
        
        // Global keydown for game input
        document.addEventListener('keydown', handleInput);
        
        // Setup mobile controls
        setupJoystick();
        setupMobileButtons();
        
        // Player name input handling
        if (elements.playerNameInput) {
            elements.playerNameInput.addEventListener('input', (e) => {
                state.playerName = e.target.value.toUpperCase().substring(0, 6);
                e.target.value = state.playerName;
                if (state.playerName) {
                    localStorage.setItem(CONFIG.storageKeys.playerName, state.playerName);
                }
            });
            
            // Default to GHOST only on blur if empty
            elements.playerNameInput.addEventListener('blur', (e) => {
                if (!state.playerName) {
                    state.playerName = 'GHOST';
                    e.target.value = 'GHOST';
                    localStorage.setItem(CONFIG.storageKeys.playerName, state.playerName);
                }
            });
            
            elements.playerNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    elements.playerNameInput.blur();
                    elements.gameModal.focus();
                }
            });
        }
        
        // Modal overlay click to close
        if (elements.gameModal) {
            elements.gameModal.addEventListener('click', (e) => {
                if (e.target === elements.gameModal) {
                    close();
                } else if (e.target !== elements.playerNameInput) {
                    elements.gameModal.focus();
                }
            });
        }
        
        // Load scores on init
        loadHighScores();
    }

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ===========================================
    // PUBLIC API
    // ===========================================
    
    window.TheShadow = {
        open,
        close,
        getHighScores,
        loadHighScores,
        renderHighScores
    };

})();