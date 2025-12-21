// ===========================================
// RECLAIM.EXE - TAKE BACK YOUR IDENTITY
// A Volfied/Qix-style game for LocalGhost.ai
// ===========================================

(function() {
    'use strict';

    const CONFIG = {
        gridSize: 4,
        canvasWidth: 400,
        canvasHeight: 360,
        hudHeight: 40,
        totalHeight: 400,
        playerSpeed: 3,
        cutSpeed: 2.5,
        winPercentage: 80,
        targetFPS: 40
    };

    const DATA_REGIONS = [
        { name: 'PHOTOS', color: '#4ECDC4', darkColor: '#1a3d3a' },
        { name: 'MESSAGES', color: '#FFE66D', darkColor: '#3d3720' },
        { name: 'LOCATION', color: '#FF6B6B', darkColor: '#3d1f1f' },
        { name: 'CONTACTS', color: '#96E6A1', darkColor: '#2a3d2c' },
        { name: 'BROWSING', color: '#DDA0DD', darkColor: '#362a36' },
        { name: 'PURCHASES', color: '#F4A460', darkColor: '#3d2a1a' }
    ];

    // Corporate villains - abstract shapes in shades of red
    const GREED_TYPES = [
        { 
            name: 'THE CLOUD', 
            color: '#DC143C',  // Crimson
            size: 12, 
            speed: 0.8, 
            behavior: 'patrol',
            quotes: ['SYNC REQUIRED', 'SERVER DEPENDENCY', 'ALWAYS ONLINE']
        },
        { 
            name: 'THE TRACKER', 
            color: '#FF2222',  // Bright red
            size: 9, 
            speed: 1.5, 
            behavior: 'chase',
            quotes: ['TRACKING...', 'WE SEE YOU', 'PERSONALIZED']
        },
        { 
            name: 'THE ENSHITTIFIER', 
            color: '#8B4513',  // Brown
            size: 14, 
            speed: 0.7, 
            behavior: 'erratic',
            quotes: ['NEW TOS!', 'FEATURE REMOVED', 'SUBSCRIBE NOW', 'PREMIUM ONLY']
        },
        { 
            name: 'THE RENT SEEKER', 
            color: '#B22222',  // Firebrick
            size: 10, 
            speed: 1.2, 
            behavior: 'chase',
            quotes: ['FEE DUE', 'PAY NOW', 'SUBSCRIPTION']
        },
        { 
            name: 'THE LOCK-IN', 
            color: '#CD5C5C',  // Indian red
            size: 11, 
            speed: 0.9, 
            behavior: 'edges',
            quotes: ['NO EXPORT', 'PROPRIETARY', 'LOCKED']
        },
        { 
            name: 'THE KILL SWITCH', 
            color: '#8B0000',  // Dark red
            size: 13, 
            speed: 0.6, 
            behavior: 'predict',
            quotes: ['BRICKING...', 'REVOKED', 'DISABLED']
        }
    ];

    let canvas, ctx;
    let offscreenCanvas, offscreenCtx;
    let gridWidth, gridHeight;
    let grid = [];
    let dataMap = [];
    let regionClaimPercent = [];
    let gridDirty = true;
    
    let lastFrameTime = 0;
    let frameInterval = 1000 / CONFIG.targetFPS;
    
    let gameState = {
        running: false,
        paused: false,
        cutting: false,
        cutStartPos: null,
        player: { x: 0, y: 0, gx: 0, gy: 0 },
        enemies: [],
        trail: [],
        claimedPercent: 0,
        level: 1,
        lives: 3,
        score: 0,
        animationId: null,
        keys: {},
        spaceHeld: false,
        message: '',
        messageTimer: 0
    };

    class Enemy {
        constructor(type, regionIndex, x, y) {
            this.type = type;
            this.regionIndex = regionIndex;
            this.x = x;
            this.y = y;
            this.vx = (Math.random() > 0.5 ? 1 : -1) * type.speed;
            this.vy = (Math.random() > 0.5 ? 1 : -1) * type.speed;
            this.size = type.size;
            this.angle = Math.random() * Math.PI * 2;
            this.quoteTimer = 0;
            this.currentQuote = '';
            this.patrolAngle = Math.random() * Math.PI * 2;
            this.erraticTimer = 0;
            this.dead = false;
            this.deathAnimation = 0;
        }

        update(playerX, playerY) {
            if (this.dead) {
                this.deathAnimation += 0.08;
                return this.deathAnimation < 1;
            }

            this.angle += 0.03;
            this.quoteTimer--;

            if (this.quoteTimer <= 0 && Math.random() < 0.003) {
                this.currentQuote = this.type.quotes[Math.floor(Math.random() * this.type.quotes.length)];
                this.quoteTimer = 90;
            }

            // Behavior-based velocity adjustments
            switch (this.type.behavior) {
                case 'chase':
                    const dx = playerX - this.x;
                    const dy = playerY - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0) {
                        this.vx += (dx / dist) * 0.03;
                        this.vy += (dy / dist) * 0.03;
                    }
                    break;
                case 'erratic':
                    this.erraticTimer--;
                    if (this.erraticTimer <= 0) {
                        this.vx = (Math.random() - 0.5) * this.type.speed * 2;
                        this.vy = (Math.random() - 0.5) * this.type.speed * 2;
                        this.erraticTimer = 30 + Math.random() * 40;
                    }
                    break;
                case 'patrol':
                    this.patrolAngle += 0.02;
                    this.vx += Math.cos(this.patrolAngle) * 0.02;
                    this.vy += Math.sin(this.patrolAngle) * 0.02;
                    break;
                case 'edges':
                    const cx = CONFIG.canvasWidth / 2;
                    const cy = CONFIG.canvasHeight / 2;
                    this.vx += (cy - this.y) * 0.0006;
                    this.vy -= (cx - this.x) * 0.0006;
                    break;
                case 'predict':
                    const px = playerX;
                    const py = playerY;
                    const pdx = px - this.x;
                    const pdy = py - this.y;
                    const pd = Math.hypot(pdx, pdy);
                    if (pd > 0) {
                        this.vx += (pdx / pd) * 0.025;
                        this.vy += (pdy / pd) * 0.025;
                    }
                    break;
            }

            // Speed limit
            const speed = Math.hypot(this.vx, this.vy);
            const maxSpeed = this.type.speed * 1.3;
            if (speed > maxSpeed) {
                this.vx = (this.vx / speed) * maxSpeed;
                this.vy = (this.vy / speed) * maxSpeed;
            }
            // Minimum speed to prevent getting stuck
            if (speed < 0.3) {
                this.vx += (Math.random() - 0.5) * 0.5;
                this.vy += (Math.random() - 0.5) * 0.5;
            }

            let nextX = this.x + this.vx;
            let nextY = this.y + this.vy;

            // Check collision with walls
            const margin = this.size + 5;
            if (nextX < margin) {
                nextX = margin;
                this.vx = Math.abs(this.vx) * 0.8;
            }
            if (nextX > CONFIG.canvasWidth - margin) {
                nextX = CONFIG.canvasWidth - margin;
                this.vx = -Math.abs(this.vx) * 0.8;
            }
            if (nextY < margin) {
                nextY = margin;
                this.vy = Math.abs(this.vy) * 0.8;
            }
            if (nextY > CONFIG.canvasHeight - margin) {
                nextY = CONFIG.canvasHeight - margin;
                this.vy = -Math.abs(this.vy) * 0.8;
            }

            // Check collision with claimed territory
            const gx = Math.floor(nextX / CONFIG.gridSize);
            const gy = Math.floor(nextY / CONFIG.gridSize);
            if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx] === 1) {
                // Bounce off claimed areas
                this.vx *= -0.9;
                this.vy *= -0.9;
                // Add some randomness to prevent getting stuck
                this.vx += (Math.random() - 0.5) * 0.8;
                this.vy += (Math.random() - 0.5) * 0.8;
                // Don't update position
            } else {
                this.x = nextX;
                this.y = nextY;
            }

            return true;
        }

        draw(ctx) {
            if (this.dead) {
                const scale = 1 - this.deathAnimation;
                if (scale <= 0) return;
                ctx.save();
                ctx.globalAlpha = scale;
                ctx.translate(this.x, this.y);
                ctx.fillStyle = '#33FF00';
                ctx.beginPath();
                ctx.arc(0, 0, this.size * 2 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('FREE', 0, 0);
                ctx.restore();
                return;
            }

            ctx.save();
            ctx.translate(this.x, this.y);
            
            const s = this.size;

            switch (this.type.name) {
                case 'THE TRACKER':
                    this.drawEyeOfSauron(ctx, s);
                    break;
                case 'THE CLOUD':
                    this.drawDataVortex(ctx, s);
                    break;
                case 'THE ENSHITTIFIER':
                    this.drawEnshittifier(ctx, s);
                    break;
                case 'THE RENT SEEKER':
                    this.drawRentSeeker(ctx, s);
                    break;
                case 'THE LOCK-IN':
                    this.drawLockIn(ctx, s);
                    break;
                case 'THE KILL SWITCH':
                    this.drawKillSwitch(ctx, s);
                    break;
                default:
                    this.drawDefault(ctx, s);
            }

            ctx.restore();

            // Quote bubble
            if (this.quoteTimer > 0 && this.currentQuote) {
                const alpha = Math.min(1, this.quoteTimer / 25) * 0.9;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = this.type.color;
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(this.currentQuote, this.x, this.y - this.size - 12);
                ctx.globalAlpha = 1;
            }
        }

        // Eye of Sauron - always watching, follows player
        drawEyeOfSauron(ctx, s) {
            // Calculate angle to player
            const px = gameState.player.x * CONFIG.gridSize;
            const py = gameState.player.y * CONFIG.gridSize;
            const lookAngle = Math.atan2(py - this.y, px - this.x);
            
            // Outer flaming eye shape
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 15;
            
            // Fiery glow layers
            for (let i = 3; i >= 0; i--) {
                const alpha = 0.3 - i * 0.07;
                ctx.fillStyle = `rgba(255, ${50 + i * 30}, 0, ${alpha})`;
                ctx.beginPath();
                ctx.ellipse(0, 0, s * (1.3 + i * 0.15), s * (0.7 + i * 0.1), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Main eye - cat-like slit
            ctx.fillStyle = '#FF2200';
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner dark with fire
            ctx.fillStyle = '#220000';
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 0.9, s * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // The slit pupil - follows player
            ctx.shadowBlur = 0;
            const pupilX = Math.cos(lookAngle) * s * 0.2;
            const pupilY = Math.sin(lookAngle) * s * 0.1;
            
            // Fiery pupil
            ctx.fillStyle = '#FF4400';
            ctx.beginPath();
            ctx.ellipse(pupilX, pupilY, s * 0.15, s * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Bright center slit
            ctx.fillStyle = '#FFAA00';
            ctx.beginPath();
            ctx.ellipse(pupilX, pupilY, s * 0.06, s * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Flame wisps at top and bottom
            ctx.strokeStyle = '#FF4400';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const flicker = Math.sin(this.angle * 3 + i) * 0.3;
                const side = i < 2 ? -1 : 1;
                const xOff = (i % 2) * 0.3 - 0.15;
                ctx.beginPath();
                ctx.moveTo(xOff * s, side * s * 0.5);
                ctx.quadraticCurveTo(
                    xOff * s + flicker * s * 0.3, 
                    side * s * (0.8 + Math.abs(flicker) * 0.3),
                    xOff * s + flicker * s * 0.5,
                    side * s * 1.1
                );
                ctx.stroke();
            }
        }

        // Data Vortex - swirling cloud sucking in data
        drawDataVortex(ctx, s) {
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 12;
            
            // Swirling vortex arms
            const arms = 4;
            const rotSpeed = this.angle * 1.5;
            
            for (let a = 0; a < arms; a++) {
                const baseAngle = (a / arms) * Math.PI * 2 + rotSpeed;
                
                // Each arm is a spiral
                ctx.strokeStyle = this.type.color;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                
                for (let t = 0; t < 1; t += 0.05) {
                    const spiralAngle = baseAngle + t * Math.PI * 1.5;
                    const r = t * s * 1.2;
                    const x = Math.cos(spiralAngle) * r;
                    const y = Math.sin(spiralAngle) * r;
                    if (t === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            
            // Dark center - the void
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
            ctx.fill();
            
            // Data bits being sucked in
            ctx.fillStyle = '#33FF0066';
            ctx.font = '6px monospace';
            ctx.textAlign = 'center';
            const bits = ['01', '10', '00', '11', 'FF', 'DB'];
            for (let i = 0; i < 6; i++) {
                const bitAngle = rotSpeed * 2 + (i / 6) * Math.PI * 2;
                const bitR = s * (0.6 + Math.sin(this.angle + i) * 0.2);
                const bx = Math.cos(bitAngle) * bitR;
                const by = Math.sin(bitAngle) * bitR;
                ctx.fillText(bits[i], bx, by);
            }
            
            // Menacing inner glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.4);
            gradient.addColorStop(0, 'rgba(220, 20, 60, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Enshittifier - decaying spiral with poop
        drawEnshittifier(ctx, s) {
            ctx.rotate(this.angle * 0.5);
            
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 8;
            
            // Decaying spiral - gets messier as it goes out
            ctx.strokeStyle = this.type.color;
            ctx.lineCap = 'round';
            
            for (let arm = 0; arm < 3; arm++) {
                ctx.lineWidth = 3 - arm * 0.5;
                ctx.beginPath();
                const startAngle = (arm / 3) * Math.PI * 2;
                
                for (let t = 0; t < 1; t += 0.03) {
                    const decay = Math.sin(t * 10 + this.angle) * t * 0.2;
                    const spiralAngle = startAngle + t * Math.PI * 2;
                    const r = t * s * 1.1 + decay * s;
                    const x = Math.cos(spiralAngle) * r;
                    const y = Math.sin(spiralAngle) * r;
                    if (t === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            
            // Poop emoji in center
            ctx.shadowBlur = 0;
            ctx.rotate(-this.angle * 0.5);
            ctx.font = `${s * 1.1}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💩', 0, 0);
        }

        // Rent Seeker - dollar signs orbiting a hungry mouth
        drawRentSeeker(ctx, s) {
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 10;
            
            // Hungry grabbing shape
            ctx.fillStyle = this.type.color;
            ctx.beginPath();
            // Open mouth shape
            ctx.arc(0, 0, s, 0.3, Math.PI * 2 - 0.3);
            ctx.lineTo(s * 0.3, 0);
            ctx.closePath();
            ctx.fill();
            
            // Teeth
            ctx.fillStyle = '#FFF';
            ctx.shadowBlur = 0;
            for (let i = 0; i < 4; i++) {
                const toothAngle = 0.5 + (i / 4) * (Math.PI * 2 - 1);
                const tx = Math.cos(toothAngle) * s * 0.7;
                const ty = Math.sin(toothAngle) * s * 0.7;
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx + Math.cos(toothAngle) * s * 0.25, ty + Math.sin(toothAngle) * s * 0.25);
                ctx.lineTo(tx + Math.cos(toothAngle + 0.15) * s * 0.15, ty + Math.sin(toothAngle + 0.15) * s * 0.15);
                ctx.fill();
            }
            
            // Orbiting dollar signs
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${s * 0.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
                const orbitAngle = this.angle * 2 + (i / 3) * Math.PI * 2;
                const ox = Math.cos(orbitAngle) * s * 1.4;
                const oy = Math.sin(orbitAngle) * s * 1.4;
                ctx.fillText('$', ox, oy);
            }
        }

        // Lock-In - cage/prison bars
        drawLockIn(ctx, s) {
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 8;
            
            // Cage outline
            ctx.strokeStyle = this.type.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.stroke();
            
            // Prison bars
            ctx.lineWidth = 3;
            const bars = 5;
            for (let i = 0; i < bars; i++) {
                const x = -s * 0.8 + (i / (bars - 1)) * s * 1.6;
                ctx.beginPath();
                ctx.moveTo(x, -s);
                ctx.lineTo(x, s);
                ctx.stroke();
            }
            
            // Cross bars
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-s, -s * 0.4);
            ctx.lineTo(s, -s * 0.4);
            ctx.moveTo(-s, s * 0.4);
            ctx.lineTo(s, s * 0.4);
            ctx.stroke();
            
            // Padlock at bottom
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#333';
            ctx.fillRect(-s * 0.25, s * 0.5, s * 0.5, s * 0.4);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, s * 0.5, s * 0.2, Math.PI, 0);
            ctx.stroke();
        }

        // Kill Switch - power button with skull
        drawKillSwitch(ctx, s) {
            ctx.rotate(this.angle * 0.2);
            
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 12;
            
            // Outer ring
            ctx.strokeStyle = this.type.color;
            ctx.lineWidth = s * 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.85, 0.4, Math.PI * 2 - 0.4);
            ctx.stroke();
            
            // Power line
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.9);
            ctx.lineTo(0, -s * 0.2);
            ctx.stroke();
            
            // Skull in center
            ctx.shadowBlur = 0;
            ctx.rotate(-this.angle * 0.2);
            ctx.fillStyle = this.type.color;
            ctx.font = `${s * 0.8}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☠', 0, s * 0.15);
        }

        drawDefault(ctx, s) {
            ctx.rotate(this.angle);
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = this.type.color;
            
            const pulse = 1 + Math.sin(this.angle * 2) * 0.15;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const r = s * pulse;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
        }

        checkTrailCollision(trail) {
            if (this.dead) return false;
            for (const p of trail) {
                const px = p.x * CONFIG.gridSize + CONFIG.gridSize / 2;
                const py = p.y * CONFIG.gridSize + CONFIG.gridSize / 2;
                if (Math.hypot(this.x - px, this.y - py) < this.size + CONFIG.gridSize) {
                    return true;
                }
            }
            return false;
        }
    }

    function initGrid() {
        gridWidth = Math.floor(CONFIG.canvasWidth / CONFIG.gridSize);
        gridHeight = Math.floor(CONFIG.canvasHeight / CONFIG.gridSize);
        
        grid = [];
        dataMap = [];
        regionClaimPercent = DATA_REGIONS.map(() => 0);

        for (let y = 0; y < gridHeight; y++) {
            grid[y] = [];
            dataMap[y] = [];
            for (let x = 0; x < gridWidth; x++) {
                const isBorder = x < 2 || x >= gridWidth - 2 || y < 2 || y >= gridHeight - 2;
                grid[y][x] = isBorder ? 1 : 0;
                
                const regionX = Math.floor(x / (gridWidth / 3));
                const regionY = Math.floor(y / (gridHeight / 2));
                dataMap[y][x] = Math.min((regionY * 3 + regionX), DATA_REGIONS.length - 1);
            }
        }

        gridDirty = true;
        calculateClaimedPercent();
        initOffscreenCanvas();
    }

    function initOffscreenCanvas() {
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = CONFIG.canvasWidth;
        offscreenCanvas.height = CONFIG.canvasHeight;
        offscreenCtx = offscreenCanvas.getContext('2d');
        renderGridToOffscreen();
    }

    function renderGridToOffscreen() {
        const c = offscreenCtx;
        c.fillStyle = '#050505';
        c.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

        // Draw cells - unclaimed is dark, claimed is clearly visible
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const cell = grid[y][x];
                const dt = DATA_REGIONS[dataMap[y][x]];
                const px = x * CONFIG.gridSize;
                const py = y * CONFIG.gridSize;

                if (cell === 1) {
                    // Claimed - bright and visible
                    c.fillStyle = dt.color + '40';
                    c.fillRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                } else {
                    // Unclaimed - dark
                    c.fillStyle = dt.darkColor + '30';
                    c.fillRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                }
            }
        }

        // Single 1px green border - the playable edge
        c.strokeStyle = '#33FF00';
        c.lineWidth = 1;
        
        // Draw border where claimed meets unclaimed
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === 1 && isOnBorder(x, y)) {
                    const px = x * CONFIG.gridSize;
                    const py = y * CONFIG.gridSize;
                    // Draw edge segments where we touch unclaimed
                    if (x > 0 && grid[y][x-1] === 0) {
                        c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + CONFIG.gridSize); c.stroke();
                    }
                    if (x < gridWidth-1 && grid[y][x+1] === 0) {
                        c.beginPath(); c.moveTo(px + CONFIG.gridSize, py); c.lineTo(px + CONFIG.gridSize, py + CONFIG.gridSize); c.stroke();
                    }
                    if (y > 0 && grid[y-1][x] === 0) {
                        c.beginPath(); c.moveTo(px, py); c.lineTo(px + CONFIG.gridSize, py); c.stroke();
                    }
                    if (y < gridHeight-1 && grid[y+1][x] === 0) {
                        c.beginPath(); c.moveTo(px, py + CONFIG.gridSize); c.lineTo(px + CONFIG.gridSize, py + CONFIG.gridSize); c.stroke();
                    }
                }
            }
        }

        // Region labels - dim, only in unclaimed
        c.font = '9px monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let ry = 0; ry < 2; ry++) {
            for (let rx = 0; rx < 3; rx++) {
                const idx = ry * 3 + rx;
                if (idx >= DATA_REGIONS.length) continue;
                const region = DATA_REGIONS[idx];
                const cx = (rx + 0.5) * (CONFIG.canvasWidth / 3);
                const cy = (ry + 0.5) * (CONFIG.canvasHeight / 2);
                const gx = Math.floor(cx / CONFIG.gridSize);
                const gy = Math.floor(cy / CONFIG.gridSize);
                if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx] === 0) {
                    c.fillStyle = region.color + '25';
                    c.fillText(region.name, cx, cy);
                }
            }
        }

        gridDirty = false;
    }

    function isOnBorder(x, y) {
        if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return false;
        if (grid[y][x] !== 1) return false;
        
        // Check if any neighbor is unclaimed (0)
        const neighbors = [
            [x-1, y], [x+1, y], [x, y-1], [x, y+1]
        ];
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                if (grid[ny][nx] === 0) return true;
            }
        }
        
        // Also count as border if on the outer edge
        if (x <= 1 || x >= gridWidth - 2 || y <= 1 || y >= gridHeight - 2) {
            return true;
        }
        
        return false;
    }

    function calculateClaimedPercent() {
        let claimed = 0, total = 0;
        const regionClaimed = DATA_REGIONS.map(() => 0);
        const regionTotal = DATA_REGIONS.map(() => 0);

        for (let y = 2; y < gridHeight - 2; y++) {
            for (let x = 2; x < gridWidth - 2; x++) {
                total++;
                const ri = dataMap[y][x];
                regionTotal[ri]++;
                if (grid[y][x] === 1) {
                    claimed++;
                    regionClaimed[ri]++;
                }
            }
        }

        gameState.claimedPercent = total > 0 ? (claimed / total) * 100 : 0;
        
        for (let i = 0; i < DATA_REGIONS.length; i++) {
            regionClaimPercent[i] = regionTotal[i] > 0 ? (regionClaimed[i] / regionTotal[i]) * 100 : 0;
        }
    }

    function checkEnemyDeaths() {
        for (const enemy of gameState.enemies) {
            if (enemy.dead) continue;
            if (regionClaimPercent[enemy.regionIndex] >= 70) {
                enemy.dead = true;
                const deathMessages = {
                    'THE CLOUD': 'CLOUD GROUNDED!',
                    'THE TRACKER': 'TRACKER BLINDED!',
                    'THE ENSHITTIFIER': 'QUALITY RESTORED!',
                    'THE RENT SEEKER': 'OWNERSHIP RECLAIMED!',
                    'THE LOCK-IN': 'CAGE OPENED!',
                    'THE KILL SWITCH': 'CONTROL RESTORED!'
                };
                showMessage(deathMessages[enemy.type.name] || `${DATA_REGIONS[enemy.regionIndex].name} LIBERATED!`);
                gameState.score += 50;
            }
        }
    }

    function completeTrail() {
        if (gameState.trail.length < 2) {
            clearTrail();
            return;
        }

        // Convert trail to claimed
        for (const p of gameState.trail) {
            if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                grid[p.y][p.x] = 1;
            }
        }

        fillEnclosedArea();

        const oldPct = gameState.claimedPercent;
        calculateClaimedPercent();
        const gained = gameState.claimedPercent - oldPct;
        gameState.score += Math.floor(gained * 10);

        if (gained > 2) {
            showMessage(`+${gained.toFixed(1)}% RECLAIMED`);
        }

        checkEnemyDeaths();
        
        // Player is now on the new border - find a valid border position
        const p = gameState.player;
        // Current position should now be claimed and on border
        if (!isOnBorder(p.gx, p.gy)) {
            // Find nearest border cell
            for (let r = 1; r < 10; r++) {
                let found = false;
                for (let dy = -r; dy <= r && !found; dy++) {
                    for (let dx = -r; dx <= r && !found; dx++) {
                        const nx = p.gx + dx;
                        const ny = p.gy + dy;
                        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                            if (grid[ny][nx] === 1 && isOnBorder(nx, ny)) {
                                p.gx = nx;
                                p.gy = ny;
                                p.x = nx + 0.5;
                                p.y = ny + 0.5;
                                found = true;
                            }
                        }
                    }
                }
                if (found) break;
            }
        }
        
        gridDirty = true;
        clearTrail();

        if (gameState.claimedPercent >= CONFIG.winPercentage) {
            levelComplete();
        }
    }

    function fillEnclosedArea() {
        const visited = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(false));
        const regions = [];

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === 0 && !visited[y][x]) {
                    const region = [];
                    const stack = [{ x, y }];
                    while (stack.length) {
                        const { x: cx, y: cy } = stack.pop();
                        if (cx < 0 || cx >= gridWidth || cy < 0 || cy >= gridHeight) continue;
                        if (visited[cy][cx] || grid[cy][cx] !== 0) continue;
                        visited[cy][cx] = true;
                        region.push({ x: cx, y: cy });
                        stack.push({ x: cx - 1, y: cy }, { x: cx + 1, y: cy }, { x: cx, y: cy - 1 }, { x: cx, y: cy + 1 });
                    }
                    regions.push(region);
                }
            }
        }

        for (const region of regions) {
            let hasEnemy = false;
            for (const enemy of gameState.enemies) {
                if (enemy.dead) continue;
                const ex = Math.floor(enemy.x / CONFIG.gridSize);
                const ey = Math.floor(enemy.y / CONFIG.gridSize);
                if (region.some(c => c.x === ex && c.y === ey)) {
                    hasEnemy = true;
                    break;
                }
            }
            if (!hasEnemy) {
                for (const c of region) grid[c.y][c.x] = 1;
            }
        }
    }

    function clearTrail() {
        gameState.trail = [];
        gameState.cutting = false;
        gameState.cutStartPos = null;
    }

    function showMessage(msg) {
        gameState.message = msg;
        gameState.messageTimer = 60;
    }

    function loseLife() {
        gameState.lives--;
        const deathMessages = ['BREACH DETECTED', 'THEY FOUND YOU', 'DATA EXPOSED', 'CAGE CLOSING'];
        showMessage(deathMessages[Math.floor(Math.random() * deathMessages.length)]);
        
        // Reset to where we started cutting (if we were cutting)
        if (gameState.cutStartPos) {
            gameState.player = {
                x: gameState.cutStartPos.x + 0.5,
                y: gameState.cutStartPos.y + 0.5,
                gx: gameState.cutStartPos.x,
                gy: gameState.cutStartPos.y
            };
        }
        // Otherwise stay where we are (but snap to valid border)
        
        clearTrail();
        gridDirty = true;
        if (gameState.lives <= 0) gameOver();
    }

    function levelComplete() {
        gameState.running = false;
        gameState.level++;
        showMessage('EXIT SECURED. NEW SECTOR.');
        setTimeout(() => {
            initGrid();
            const startY = Math.floor(gridHeight / 2);
            gameState.player = { x: 1 + 0.5, y: startY + 0.5, gx: 1, gy: startY };
            spawnEnemies();
            gameState.running = true;
            requestAnimationFrame(gameLoop);
        }, 2000);
    }

    function gameOver() {
        gameState.running = false;
    }

    function spawnEnemies() {
        gameState.enemies = [];
        for (let i = 0; i < DATA_REGIONS.length; i++) {
            const type = GREED_TYPES[i % GREED_TYPES.length];
            const rx = i % 3;
            const ry = Math.floor(i / 3);
            const cx = (rx + 0.5) * (CONFIG.canvasWidth / 3);
            const cy = (ry + 0.5) * (CONFIG.canvasHeight / 2);
            gameState.enemies.push(new Enemy(type, i, cx, cy));
        }
    }

    function update() {
        if (!gameState.running || gameState.paused) return;

        const p = gameState.player;
        let dx = 0, dy = 0;

        // Only move when keys are pressed
        if (gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']) dy = -1;
        else if (gameState.keys['ArrowDown'] || gameState.keys['s'] || gameState.keys['S']) dy = 1;
        else if (gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A']) dx = -1;
        else if (gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D']) dx = 1;

        // Update enemies regardless of player movement
        updateEnemies();

        // No movement if no keys pressed
        if (dx === 0 && dy === 0) return;

        const speed = gameState.cutting ? CONFIG.cutSpeed : CONFIG.playerSpeed;
        const newX = p.x + dx * speed * 0.15;
        const newY = p.y + dy * speed * 0.15;
        const newGX = Math.floor(newX);
        const newGY = Math.floor(newY);

        // Bounds check
        if (newGX < 0 || newGX >= gridWidth || newGY < 0 || newGY >= gridHeight) {
            return;
        }

        // Check if moved to new grid cell
        if (newGX !== p.gx || newGY !== p.gy) {
            const targetCell = grid[newGY][newGX];

            if (gameState.cutting) {
                // While cutting, can move through unclaimed or complete by reaching claimed
                if (targetCell === 1) {
                    // Reached claimed territory - complete the cut!
                    completeTrail();
                } else if (gameState.trail.some(t => t.x === newGX && t.y === newGY)) {
                    // Hit our own trail - lose life
                    loseLife();
                    return;
                } else if (targetCell === 0) {
                    // Continue cutting through unclaimed
                    gameState.trail.push({ x: newGX, y: newGY });
                    p.x = newGX + 0.5;
                    p.y = newGY + 0.5;
                    p.gx = newGX;
                    p.gy = newGY;
                }
            } else {
                // Not cutting - can ONLY move to adjacent border cells
                if (targetCell === 1 && isOnBorder(newGX, newGY)) {
                    // Moving to another border cell - this is the only allowed move
                    p.x = newGX + 0.5;
                    p.y = newGY + 0.5;
                    p.gx = newGX;
                    p.gy = newGY;
                } else if (targetCell === 0 && gameState.spaceHeld && isOnBorder(p.gx, p.gy)) {
                    // Start cutting into unclaimed - must hold SPACE
                    gameState.cutting = true;
                    gameState.cutStartPos = { x: p.gx, y: p.gy };
                    gameState.trail = [{ x: p.gx, y: p.gy }, { x: newGX, y: newGY }];
                    p.x = newGX + 0.5;
                    p.y = newGY + 0.5;
                    p.gx = newGX;
                    p.gy = newGY;
                }
                // Any other move is blocked - stay in place
            }
        } else {
            // Same grid cell - allow smooth movement toward valid directions
            p.x = newX;
            p.y = newY;
        }
    }

    function updateEnemies() {
        const playerPx = gameState.player.gx * CONFIG.gridSize + CONFIG.gridSize / 2;
        const playerPy = gameState.player.gy * CONFIG.gridSize + CONFIG.gridSize / 2;

        gameState.enemies = gameState.enemies.filter(e => {
            const alive = e.update(playerPx, playerPy);
            if (!e.dead && gameState.trail.length > 0 && e.checkTrailCollision(gameState.trail)) {
                loseLife();
            }
            return alive;
        });

        if (gameState.messageTimer > 0) gameState.messageTimer--;
    }

    function drawLocalGhost(ctx, x, y, cutting) {
        const size = 10;  // Ghost size
        ctx.save();
        ctx.translate(x, y);
        
        // Glow effect
        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = cutting ? 18 : 12;
        
        // Ghost body - rounded top, wavy bottom
        ctx.strokeStyle = cutting ? '#88FF88' : '#33FF00';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(51, 255, 0, 0.15)';
        
        ctx.beginPath();
        // Start from bottom left wave
        ctx.moveTo(-size * 0.8, size * 0.6);
        // Wave pattern at bottom
        ctx.lineTo(-size * 0.5, size * 0.3);
        ctx.lineTo(-size * 0.2, size * 0.6);
        ctx.lineTo(size * 0.1, size * 0.3);
        ctx.lineTo(size * 0.4, size * 0.6);
        ctx.lineTo(size * 0.7, size * 0.3);
        ctx.lineTo(size * 0.8, size * 0.6);
        // Right side going up
        ctx.lineTo(size * 0.8, -size * 0.2);
        // Rounded top (ghost head)
        ctx.quadraticCurveTo(size * 0.8, -size * 0.9, 0, -size * 0.9);
        ctx.quadraticCurveTo(-size * 0.8, -size * 0.9, -size * 0.8, -size * 0.2);
        // Left side going down
        ctx.lineTo(-size * 0.8, size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Eyes
        ctx.shadowBlur = 0;
        ctx.fillStyle = cutting ? '#88FF88' : '#33FF00';
        ctx.beginPath();
        ctx.arc(-size * 0.35, -size * 0.3, size * 0.15, 0, Math.PI * 2);
        ctx.arc(size * 0.35, -size * 0.3, size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        // Smile
        ctx.strokeStyle = cutting ? '#88FF88' : '#33FF00';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, size * 0.05, size * 0.35, 0.2, Math.PI - 0.2);
        ctx.stroke();
        
        ctx.restore();
    }

    function draw() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.totalHeight);

        if (gridDirty) renderGridToOffscreen();
        ctx.drawImage(offscreenCanvas, 0, CONFIG.hudHeight);

        // Draw cutting trail as sharp green line
        if (gameState.trail.length > 0) {
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 3;
            ctx.lineCap = 'square';
            ctx.lineJoin = 'miter';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 6;

            ctx.beginPath();
            const first = gameState.trail[0];
            ctx.moveTo(
                first.x * CONFIG.gridSize + CONFIG.gridSize / 2,
                first.y * CONFIG.gridSize + CONFIG.gridSize / 2 + CONFIG.hudHeight
            );
            for (let i = 1; i < gameState.trail.length; i++) {
                const pt = gameState.trail[i];
                ctx.lineTo(
                    pt.x * CONFIG.gridSize + CONFIG.gridSize / 2,
                    pt.y * CONFIG.gridSize + CONFIG.gridSize / 2 + CONFIG.hudHeight
                );
            }
            // Draw to current player position
            ctx.lineTo(
                gameState.player.x * CONFIG.gridSize + CONFIG.gridSize / 2,
                gameState.player.y * CONFIG.gridSize + CONFIG.gridSize / 2 + CONFIG.hudHeight
            );
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Enemies
        ctx.save();
        ctx.translate(0, CONFIG.hudHeight);
        for (const e of gameState.enemies) e.draw(ctx);
        ctx.restore();

        // Player - LocalGhost icon
        const px = gameState.player.x * CONFIG.gridSize + CONFIG.gridSize / 2;
        const py = gameState.player.y * CONFIG.gridSize + CONFIG.gridSize / 2 + CONFIG.hudHeight;

        drawLocalGhost(ctx, px, py, gameState.cutting);

        drawHUD();

        // Message
        if (gameState.messageTimer > 0) {
            ctx.fillStyle = `rgba(51,255,0,${gameState.messageTimer / 40})`;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(gameState.message, CONFIG.canvasWidth / 2, CONFIG.hudHeight + 25);
        }

        // Overlays
        if (!gameState.running || gameState.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, CONFIG.hudHeight, CONFIG.canvasWidth, CONFIG.canvasHeight);
            ctx.textAlign = 'center';
            
            if (gameState.lives <= 0) {
                ctx.fillStyle = '#FF3333';
                ctx.font = 'bold 18px monospace';
                ctx.fillText('THE MACHINE WINS', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 40);
                ctx.fillStyle = '#888';
                ctx.font = '10px monospace';
                ctx.fillText('Your data remains in their dungeons.', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 15);
                ctx.fillStyle = '#33FF00';
                ctx.font = '12px monospace';
                ctx.fillText(`Score: ${gameState.score}  |  ${gameState.claimedPercent.toFixed(1)}% Reclaimed`, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 15);
                ctx.fillStyle = '#666';
                ctx.fillText('Press R to try again', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 45);
                ctx.fillStyle = '#444';
                ctx.font = '8px monospace';
                ctx.fillText('The exit is still open.', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 65);
            } else if (gameState.paused) {
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 18px monospace';
                ctx.fillText('PAUSED', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2);
            }
        }
    }

    function drawHUD() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.hudHeight);
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, CONFIG.canvasWidth, CONFIG.hudHeight);

        const barX = 55, barY = 15, barW = CONFIG.canvasWidth - 110, barH = 10;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#33FF00';
        ctx.fillRect(barX, barY, (gameState.claimedPercent / 100) * barW, barH);

        const targetX = barX + (CONFIG.winPercentage / 100) * barW;
        ctx.strokeStyle = '#FFE66D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetX, barY - 2);
        ctx.lineTo(targetX, barY + barH + 2);
        ctx.stroke();

        ctx.fillStyle = '#33FF00';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${gameState.claimedPercent.toFixed(0)}%`, 8, 23);
        ctx.textAlign = 'right';
        ctx.fillText(`♥${gameState.lives}  L${gameState.level}`, CONFIG.canvasWidth - 8, 23);

        ctx.textAlign = 'center';
        if (gameState.cutting) {
            ctx.fillStyle = '#FF6B6B';
            ctx.fillText('◆ CUTTING', CONFIG.canvasWidth / 2, 35);
        } else if (gameState.spaceHeld) {
            ctx.fillStyle = '#FFE66D';
            ctx.fillText('◇ SPACE + DIRECTION', CONFIG.canvasWidth / 2, 35);
        }
    }

    function gameLoop(timestamp) {
        const elapsed = timestamp - lastFrameTime;
        if (elapsed >= frameInterval) {
            lastFrameTime = timestamp - (elapsed % frameInterval);
            update();
            draw();
        }

        if (gameState.running || gameState.paused) {
            gameState.animationId = requestAnimationFrame(gameLoop);
        }
    }

    function initGame() {
        initGrid();
        // Start on the left border (x=1 is claimed border)
        const startY = Math.floor(gridHeight / 2);
        gameState.player = { x: 1 + 0.5, y: startY + 0.5, gx: 1, gy: startY };
        gameState.trail = [];
        gameState.cutting = false;
        gameState.lives = 3;
        gameState.score = 0;
        gameState.level = 1;
        gameState.running = true;
        gameState.paused = false;
        gameState.spaceHeld = false;
        gameState.message = '';
        gameState.messageTimer = 0;
        spawnEnemies();
        if (gameState.animationId) cancelAnimationFrame(gameState.animationId);
        lastFrameTime = 0;
        gameState.animationId = requestAnimationFrame(gameLoop);
    }

    function handleKeyDown(e) {
        const modal = document.getElementById('exportModal');
        if (!modal || !modal.classList.contains('active')) return;

        gameState.keys[e.key] = true;
        if (e.key === ' ') { gameState.spaceHeld = true; e.preventDefault(); }
        if (e.key === 'p' || e.key === 'P') { if (gameState.running) gameState.paused = !gameState.paused; e.preventDefault(); }
        if (e.key === 'r' || e.key === 'R') { initGame(); e.preventDefault(); }
        if (e.key === 'Escape') { window.ReclaimGame.close(); e.preventDefault(); }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    }

    function handleKeyUp(e) {
        gameState.keys[e.key] = false;
        if (e.key === ' ') gameState.spaceHeld = false;
    }

    function open() {
        const modal = document.getElementById('exportModal');
        if (!modal) return;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        canvas = document.getElementById('exportCanvas');
        if (canvas) {
            ctx = canvas.getContext('2d');
            canvas.width = CONFIG.canvasWidth;
            canvas.height = CONFIG.totalHeight;
            initGame();
        }
        modal.focus();
    }

    function close() {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        gameState.running = false;
        if (gameState.animationId) cancelAnimationFrame(gameState.animationId);
        const ti = document.getElementById('terminalInput');
        if (ti) ti.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    window.ReclaimGame = { open, close };
    window.ExportGame = window.ReclaimGame;

})();