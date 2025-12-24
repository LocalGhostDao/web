// ===========================================
// RECLAIM.EXE - TAKE BACK YOUR IDENTITY
// A Volfied/Qix-style game for LocalGhost.ai
// Pure polygon-based logic with enhanced visuals
// ===========================================

(function() {
    'use strict';

    const CONFIG = {
        canvasWidth: 800,
        canvasHeight: 750,
        hudHeight: 50,
        totalHeight: 800,
        borderSpeed: 4,
        cutSpeed: 3.5,
        winPercentage: 90,
        regionKillPercent: 90,
        targetFPS: 40
    };

    // Game area - 15px margin for the wire border (more visible at larger size)
    const MARGIN = 15;
    const GAME_LEFT = MARGIN;
    const GAME_RIGHT = CONFIG.canvasWidth - MARGIN;
    const GAME_TOP = MARGIN;
    const GAME_BOTTOM = CONFIG.canvasHeight - MARGIN;
    const TOTAL_AREA = (GAME_RIGHT - GAME_LEFT) * (GAME_BOTTOM - GAME_TOP);

    const DATA_REGIONS = [
        { name: 'PHOTOS', color: '#4ECDC4' },
        { name: 'MESSAGES', color: '#FFE66D' },
        { name: 'LOCATION', color: '#FF6B6B' },
        { name: 'CONTACTS', color: '#96E6A1' },
        { name: 'BROWSING', color: '#DDA0DD' },
        { name: 'PURCHASES', color: '#F4A460' }
    ];

    const GREED_TYPES = [
        { 
            name: 'THE CLOUD', 
            color: '#DC143C', 
            size: 22, 
            speed: 1.2, 
            behavior: 'patrol',
            quotes: ['SYNC REQUIRED', 'SERVER DEPENDENCY', 'ALWAYS ONLINE'],
            tagline: 'Your data. Their servers. Their rules.',
            description: 'That "free" storage that holds your memories hostage. They promised convenience, delivered dependency. When the servers go dark, so do your photos.',
            howItHunts: 'Patrols lazily, confident you\'ll come to it eventually.'
        },
        { 
            name: 'THE TRACKER', 
            color: '#FF2222', 
            size: 16, 
            speed: 3.5, 
            behavior: 'chase',
            quotes: ['TRACKING...', 'WE SEE YOU', 'PERSONALIZED'],
            tagline: 'It knows what you want before you do.',
            description: 'Every click, every scroll, every pause. Sold to the highest bidder. You are the product being optimized.',
            howItHunts: 'Relentlessly pursues. You cannot hide from what\'s already inside.'
        },
        { 
            name: 'THE ENSHITTIFIER', 
            color: '#8B4513', 
            size: 26, 
            speed: 1.0, 
            behavior: 'erratic',
            quotes: ['NEW TOS!', 'FEATURE REMOVED', 'SUBSCRIBE NOW', 'PREMIUM ONLY'],
            tagline: 'First they hook you. Then the decay begins.',
            description: 'Remember when it worked? Before ads. Before paywalls. Before they squeezed every drop of value from users to shareholders.',
            howItHunts: 'Chaotic and unpredictable. You never know what breaks next.'
        },
        { 
            name: 'THE RENT SEEKER', 
            color: '#B22222', 
            size: 18, 
            speed: 1.8, 
            behavior: 'chase',
            quotes: ['FEE DUE', 'PAY NOW', 'SUBSCRIPTION'],
            tagline: 'You will own nothing. They will be happy.',
            description: 'Software you bought becomes software you rent. Skip a payment and watch your tools evaporate. Digital feudalism.',
            howItHunts: 'Chases with predatory persistence. The debt always finds you.'
        },
        { 
            name: 'THE LOCK-IN', 
            color: '#CD5C5C', 
            size: 20, 
            speed: 0.8, 
            behavior: 'wander',
            quotes: ['NO EXPORT', 'PROPRIETARY', 'LOCKED'],
            tagline: 'Check in anytime. Never leave.',
            description: 'Years of your work in their format. No export. No escape. The door was open when you walked in. Now it\'s welded shut.',
            howItHunts: 'Slow but inevitable. Walls close in while you\'re not looking.'
        },
        { 
            name: 'THE KILL SWITCH', 
            color: '#8B0000', 
            size: 24, 
            speed: 0.9, 
            behavior: 'predict',
            quotes: ['BRICKING...', 'REVOKED', 'DISABLED'],
            tagline: 'They giveth. They taketh. Remotely.',
            description: 'Your device. Their permission. One update and your tractor stops, your thermostat dies, your car won\'t start. You never owned it.',
            howItHunts: 'Anticipates your moves. A demon with root access to your life.'
        }
    ];

    // The unclaimed area polygon - player walks on its edges, enemies live inside
    let unclaimedPoly = [];
    
    // Region claim tracking
    let regionClaimPercent = [];
    
    let canvas, ctx;
    let lastFrameTime = 0;
    const frameInterval = 1000 / CONFIG.targetFPS;

    let gameState = {
        running: false,
        paused: false,
        cutting: false,
        won: false,
        showInfo: false,
        infoPage: 0,
        player: { x: 0, y: 0 },
        // Border walking state
        edgeIndex: 0,
        edgeT: 0,
        // Cutting state
        cutStart: null,
        cutDirection: null,
        trail: [],
        // Game
        enemies: [],
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

    // ===================== POLYGON MATH =====================

    function polyArea(poly) {
        if (!poly || poly.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
        }
        return Math.abs(area) / 2;
    }

    function pointInPoly(x, y, poly) {
        if (!poly || poly.length < 3) return false;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function getEdge(i) {
        const p1 = unclaimedPoly[i];
        const p2 = unclaimedPoly[(i + 1) % unclaimedPoly.length];
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }

    function edgeLength(i) {
        const e = getEdge(i);
        return Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    }

    function pointOnEdge(i, t) {
        const e = getEdge(i);
        return { x: e.x1 + t * (e.x2 - e.x1), y: e.y1 + t * (e.y2 - e.y1) };
    }

    function getEdgeInwardNormal(i) {
        const e = getEdge(i);
        const dx = e.x2 - e.x1;
        const dy = e.y2 - e.y1;
        const len = Math.hypot(dx, dy);
        if (len === 0) return { x: 0, y: -1 };
        const mid = { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
        const testPt = { x: mid.x - dy / len * 5, y: mid.y + dx / len * 5 };
        if (pointInPoly(testPt.x, testPt.y, unclaimedPoly)) {
            return { x: -dy / len, y: dx / len };
        } else {
            return { x: dy / len, y: -dx / len };
        }
    }

    function closestOnBoundary(px, py) {
        let best = { dist: Infinity, edge: 0, t: 0, x: 0, y: 0 };
        
        for (let i = 0; i < unclaimedPoly.length; i++) {
            const e = getEdge(i);
            const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
            const lenSq = dx * dx + dy * dy;
            
            let t = lenSq > 0 ? ((px - e.x1) * dx + (py - e.y1) * dy) / lenSq : 0;
            t = Math.max(0, Math.min(1, t));
            
            const cx = e.x1 + t * dx, cy = e.y1 + t * dy;
            const dist = Math.hypot(px - cx, py - cy);
            
            if (dist < best.dist) {
                best = { dist, edge: i, t, x: cx, y: cy };
            }
        }
        return best;
    }

    // ===================== REGION TRACKING =====================
    
    function getRegionBounds(regionIndex) {
        const rx = regionIndex % 3;
        const ry = Math.floor(regionIndex / 3);
        const rw = CONFIG.canvasWidth / 3;
        const rh = CONFIG.canvasHeight / 2;
        return {
            left: rx * rw,
            right: (rx + 1) * rw,
            top: ry * rh,
            bottom: (ry + 1) * rh
        };
    }
    
    function calculateRegionClaim() {
        // Sample points in each region to determine claim percentage
        const samples = 10;
        regionClaimPercent = [];
        
        for (let r = 0; r < 6; r++) {
            const bounds = getRegionBounds(r);
            let claimed = 0;
            let total = 0;
            
            for (let sy = 0; sy < samples; sy++) {
                for (let sx = 0; sx < samples; sx++) {
                    const x = bounds.left + (sx + 0.5) * (bounds.right - bounds.left) / samples;
                    const y = bounds.top + (sy + 0.5) * (bounds.bottom - bounds.top) / samples;
                    
                    // Only count points inside the game area (within the wire border)
                    if (x >= GAME_LEFT && x <= GAME_RIGHT && y >= GAME_TOP && y <= GAME_BOTTOM) {
                        total++;
                        // Point is claimed if it's NOT inside unclaimed polygon
                        if (!pointInPoly(x, y, unclaimedPoly)) {
                            claimed++;
                        }
                    }
                }
            }
            
            regionClaimPercent[r] = total > 0 ? (claimed / total) * 100 : 0;
        }
    }
    
    function checkRegionKills() {
        // Count alive enemies
        const aliveCount = gameState.enemies.filter(e => !e.dead).length;
        
        for (const e of gameState.enemies) {
            if (e.dead) continue;
            const pct = regionClaimPercent[e.regionIndex];
            if (pct >= CONFIG.regionKillPercent) {
                // Don't kill if it's the last one - they must trap it
                if (aliveCount <= 1) {
                    continue;
                }
                e.dead = true;
                const regionName = DATA_REGIONS[e.regionIndex].name;
                showMessage(`${regionName} LIBERATED!`);
                gameState.score += 150;
            }
        }
    }

    // ===================== ENEMY CLASS =====================

    class Enemy {
        constructor(type, regionIndex, x, y) {
            this.type = type;
            this.regionIndex = regionIndex;
            this.x = x;
            this.y = y;
            this.vx = (Math.random() - 0.5) * type.speed * 2;
            this.vy = (Math.random() - 0.5) * type.speed * 2;
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
            if (--this.quoteTimer <= 0 && Math.random() < 0.003) {
                this.currentQuote = this.type.quotes[Math.floor(Math.random() * this.type.quotes.length)];
                this.quoteTimer = 90;
            }

            switch (this.type.behavior) {
                case 'chase': {
                    const d = Math.hypot(playerX - this.x, playerY - this.y);
                    if (d > 0) {
                        // THE TRACKER is extremely aggressive
                        const accel = this.type.name === 'THE TRACKER' ? 0.1 : 0.03;
                        this.vx += ((playerX - this.x) / d) * accel;
                        this.vy += ((playerY - this.y) / d) * accel;
                    }
                    break;
                }
                case 'erratic':
                    if (--this.erraticTimer <= 0) {
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
                case 'wander': {
                    // Slow but persistent wandering - THE LOCK-IN
                    // Occasionally drift toward center to avoid corners
                    if (Math.random() < 0.02) {
                        const cx = unclaimedPoly.reduce((s, p) => s + p.x, 0) / unclaimedPoly.length;
                        const cy = unclaimedPoly.reduce((s, p) => s + p.y, 0) / unclaimedPoly.length;
                        this.patrolAngle = Math.atan2(cy - this.y, cx - this.x) + (Math.random() - 0.5) * 1.5;
                    } else {
                        this.patrolAngle += (Math.random() - 0.5) * 0.15;
                    }
                    this.vx += Math.cos(this.patrolAngle) * 0.025;
                    this.vy += Math.sin(this.patrolAngle) * 0.025;
                    // Light dampening
                    this.vx *= 0.995;
                    this.vy *= 0.995;
                    break;
                }
                case 'predict': {
                    const d = Math.hypot(playerX - this.x, playerY - this.y);
                    if (d > 0) {
                        this.vx += ((playerX - this.x) / d) * 0.025;
                        this.vy += ((playerY - this.y) / d) * 0.025;
                    }
                    break;
                }
            }

            const spd = Math.hypot(this.vx, this.vy);
            const maxSpd = this.type.speed * 1.3;
            if (spd > maxSpd) { this.vx *= maxSpd / spd; this.vy *= maxSpd / spd; }
            
            // If nearly stopped, give a random push (more aggressive for wander type)
            const minSpd = this.type.behavior === 'wander' ? 0.3 : 0.2;
            if (spd < minSpd) {
                const pushAngle = Math.random() * Math.PI * 2;
                this.vx = Math.cos(pushAngle) * this.type.speed * 0.7;
                this.vy = Math.sin(pushAngle) * this.type.speed * 0.7;
            }

            const nx = this.x + this.vx, ny = this.y + this.vy;

            if (pointInPoly(nx, ny, unclaimedPoly)) {
                this.x = nx;
                this.y = ny;
                this.stuckCounter = 0;
            } else {
                // Hit boundary - bounce with randomness
                this.stuckCounter = (this.stuckCounter || 0) + 1;
                
                // Wander gets unstuck faster
                const stuckThreshold = this.type.behavior === 'wander' ? 5 : 10;
                if (this.stuckCounter > stuckThreshold) {
                    // Really stuck - teleport toward center of polygon and reset
                    const cx = unclaimedPoly.reduce((s, p) => s + p.x, 0) / unclaimedPoly.length;
                    const cy = unclaimedPoly.reduce((s, p) => s + p.y, 0) / unclaimedPoly.length;
                    this.x = this.x * 0.6 + cx * 0.4;
                    this.y = this.y * 0.6 + cy * 0.4;
                    this.stuckCounter = 0;
                    // Also reset patrol angle toward center
                    this.patrolAngle = Math.atan2(cy - this.y, cx - this.x);
                }
                
                // Reverse and add random direction
                const bounceAngle = Math.atan2(this.vy, this.vx) + Math.PI + (Math.random() - 0.5) * 1.5;
                const bounceSpeed = this.type.speed * 0.6;
                this.vx = Math.cos(bounceAngle) * bounceSpeed;
                this.vy = Math.sin(bounceAngle) * bounceSpeed;
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
                case 'THE TRACKER': this.drawEye(ctx, s); break;
                case 'THE CLOUD': this.drawCloud(ctx, s); break;
                case 'THE ENSHITTIFIER': this.drawEnshittifier(ctx, s); break;
                case 'THE RENT SEEKER': this.drawRentSeeker(ctx, s); break;
                case 'THE LOCK-IN': this.drawLockIn(ctx, s); break;
                case 'THE KILL SWITCH': this.drawKillSwitch(ctx, s); break;
                default: this.drawDefault(ctx, s);
            }
            ctx.restore();

            if (this.quoteTimer > 0 && this.currentQuote) {
                ctx.save();
                ctx.globalAlpha = Math.min(1, this.quoteTimer / 25) * 0.9;
                ctx.fillStyle = this.type.color;
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(this.currentQuote, this.x, this.y - this.size - 15);
                ctx.restore();
            }
        }

        drawEye(ctx, s) {
            const lookAngle = Math.atan2(gameState.player.y - this.y, gameState.player.x - this.x);
            
            // Intense glow - pulsing
            const pulse = 1 + Math.sin(this.angle * 4) * 0.15;
            ctx.shadowColor = '#FF0000';
            ctx.shadowBlur = 15 * pulse;
            
            // Larger sclera with yellow tint (unhealthy eye)
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.5);
            grad.addColorStop(0, '#FFFFEE');
            grad.addColorStop(0.7, '#FFEECC');
            grad.addColorStop(1, '#FFDDBB');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.5, s * 0.9, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Many bloodshot veins - thicker and angrier
            ctx.shadowBlur = 0;
            for (let i = 0; i < 10; i++) {
                const veinAngle = (i / 10) * Math.PI * 2 + this.angle * 0.15;
                const startR = s * 0.55;
                const endR = s * 1.4;
                
                // Varying thickness
                ctx.strokeStyle = i % 2 === 0 ? '#DD2222' : '#BB4444';
                ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.8;
                
                ctx.beginPath();
                ctx.moveTo(Math.cos(veinAngle) * startR, Math.sin(veinAngle) * startR * 0.6);
                
                // More squiggly veins
                const midR = (startR + endR) / 2;
                const wobble1 = Math.sin(this.angle * 3 + i) * s * 0.15;
                const wobble2 = Math.cos(this.angle * 2 + i * 2) * s * 0.1;
                ctx.bezierCurveTo(
                    Math.cos(veinAngle) * midR * 0.7 + wobble1,
                    Math.sin(veinAngle) * midR * 0.5,
                    Math.cos(veinAngle) * midR * 1.2 + wobble2,
                    Math.sin(veinAngle) * midR * 0.7,
                    Math.cos(veinAngle) * endR,
                    Math.sin(veinAngle) * endR * 0.6
                );
                ctx.stroke();
            }
            
            // Iris - tracks player aggressively (moves more)
            const irisOffsetX = Math.cos(lookAngle) * s * 0.35;
            const irisOffsetY = Math.sin(lookAngle) * s * 0.2;
            
            // Larger, more intense iris
            const irisGrad = ctx.createRadialGradient(irisOffsetX, irisOffsetY, 0, irisOffsetX, irisOffsetY, s * 0.6);
            irisGrad.addColorStop(0, '#FF0000');
            irisGrad.addColorStop(0.5, '#CC0000');
            irisGrad.addColorStop(0.8, '#990000');
            irisGrad.addColorStop(1, '#660000');
            ctx.fillStyle = irisGrad;
            ctx.beginPath();
            ctx.arc(irisOffsetX, irisOffsetY, s * 0.6, 0, Math.PI * 2);
            ctx.fill();
            
            // Iris detail lines - more of them
            ctx.strokeStyle = '#440000';
            ctx.lineWidth = 0.7;
            for (let i = 0; i < 16; i++) {
                const lineAngle = (i / 16) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(irisOffsetX + Math.cos(lineAngle) * s * 0.25, irisOffsetY + Math.sin(lineAngle) * s * 0.25);
                ctx.lineTo(irisOffsetX + Math.cos(lineAngle) * s * 0.55, irisOffsetY + Math.sin(lineAngle) * s * 0.55);
                ctx.stroke();
            }
            
            // Larger, slitted pupil (reptilian)
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(irisOffsetX, irisOffsetY, s * 0.12, s * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Evil glint
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(irisOffsetX - s * 0.15, irisOffsetY - s * 0.15, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
            
            // Second smaller glint
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(irisOffsetX + s * 0.1, irisOffsetY - s * 0.2, s * 0.04, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyelid lines - angry/narrowed
            ctx.strokeStyle = '#882222';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.55, s * 0.95, 0, Math.PI * 0.85, Math.PI * 0.15, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.55, s * 0.95, 0, Math.PI * 0.85, Math.PI * 2.15);
            ctx.stroke();
        }

        drawCloud(ctx, s) {
            // Evil cloud glow
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 15;
            
            // Cloud puffs - overlapping circles to form cloud shape
            const puffs = [
                { x: 0, y: 0, r: s * 0.7 },           // Center
                { x: -s * 0.6, y: s * 0.1, r: s * 0.5 },   // Left
                { x: s * 0.6, y: s * 0.1, r: s * 0.5 },    // Right
                { x: -s * 0.3, y: -s * 0.4, r: s * 0.45 }, // Top left
                { x: s * 0.3, y: -s * 0.4, r: s * 0.45 },  // Top right
                { x: 0, y: s * 0.35, r: s * 0.4 },         // Bottom
                { x: -s * 0.8, y: s * 0.3, r: s * 0.35 },  // Far left
                { x: s * 0.8, y: s * 0.3, r: s * 0.35 },   // Far right
            ];
            
            // Animate puffs slightly
            const pulse = 1 + Math.sin(this.angle * 2) * 0.05;
            
            // Dark crimson gradient for evil cloud
            const cloudGrad = ctx.createRadialGradient(0, -s * 0.2, 0, 0, 0, s * 1.2);
            cloudGrad.addColorStop(0, '#DC143C');
            cloudGrad.addColorStop(0.5, '#8B0000');
            cloudGrad.addColorStop(1, '#4A0000');
            
            // Draw all puffs
            ctx.fillStyle = cloudGrad;
            ctx.beginPath();
            for (const p of puffs) {
                const wobbleX = Math.sin(this.angle * 1.5 + p.x) * s * 0.05;
                const wobbleY = Math.cos(this.angle * 1.5 + p.y) * s * 0.03;
                ctx.moveTo(p.x + wobbleX + p.r * pulse, p.y + wobbleY);
                ctx.arc(p.x + wobbleX, p.y + wobbleY, p.r * pulse, 0, Math.PI * 2);
            }
            ctx.fill();
            
            ctx.shadowBlur = 0;
            
            // Darker bottom for depth
            ctx.fillStyle = 'rgba(30, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.ellipse(0, s * 0.3, s * 0.9, s * 0.3, 0, 0, Math.PI);
            ctx.fill();
            
            // Lightning/data sparks inside
            ctx.strokeStyle = '#FF6666';
            ctx.lineWidth = 1.5;
            const sparkTime = this.angle * 3;
            if (Math.sin(sparkTime) > 0.7) {
                ctx.beginPath();
                ctx.moveTo(-s * 0.2, -s * 0.1);
                ctx.lineTo(0, s * 0.1);
                ctx.lineTo(s * 0.1, -s * 0.05);
                ctx.lineTo(s * 0.2, s * 0.2);
                ctx.stroke();
            }
            
            // Data bits being absorbed (floating around cloud)
            ctx.fillStyle = '#33FF0088';
            ctx.font = '5px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const bits = ['01', '10', 'DB', '{}'];
            for (let i = 0; i < 4; i++) {
                const orbitAngle = this.angle + (i / 4) * Math.PI * 2;
                const orbitR = s * 1.3;
                const bx = Math.cos(orbitAngle) * orbitR;
                const by = Math.sin(orbitAngle) * orbitR * 0.5;
                ctx.fillText(bits[i], bx, by);
            }
            
            // Menacing "eyes" in cloud (two darker spots)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.ellipse(-s * 0.25, -s * 0.1, s * 0.12, s * 0.08, 0, 0, Math.PI * 2);
            ctx.ellipse(s * 0.25, -s * 0.1, s * 0.12, s * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Glowing red pupils
            ctx.fillStyle = '#FF3333';
            ctx.beginPath();
            ctx.arc(-s * 0.25, -s * 0.1, s * 0.04, 0, Math.PI * 2);
            ctx.arc(s * 0.25, -s * 0.1, s * 0.04, 0, Math.PI * 2);
            ctx.fill();
        }

        drawEnshittifier(ctx, s) {
            ctx.rotate(this.angle * 0.5);
            
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 8;
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
            
            ctx.shadowBlur = 0;
            ctx.rotate(-this.angle * 0.5);
            ctx.font = `${s * 1.1}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💩', 0, 0);
        }

        drawRentSeeker(ctx, s) {
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 10;
            
            ctx.fillStyle = this.type.color;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0.3, Math.PI * 2 - 0.3);
            ctx.lineTo(s * 0.3, 0);
            ctx.closePath();
            ctx.fill();
            
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

        drawLockIn(ctx, s) {
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 8;
            
            ctx.strokeStyle = this.type.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.lineWidth = 3;
            const bars = 5;
            for (let i = 0; i < bars; i++) {
                const x = -s * 0.8 + (i / (bars - 1)) * s * 1.6;
                ctx.beginPath();
                ctx.moveTo(x, -s);
                ctx.lineTo(x, s);
                ctx.stroke();
            }
            
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-s, -s * 0.4);
            ctx.lineTo(s, -s * 0.4);
            ctx.moveTo(-s, s * 0.4);
            ctx.lineTo(s, s * 0.4);
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#333';
            ctx.fillRect(-s * 0.25, s * 0.5, s * 0.5, s * 0.4);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, s * 0.5, s * 0.2, Math.PI, 0);
            ctx.stroke();
        }

        drawKillSwitch(ctx, s) {
            ctx.rotate(this.angle * 0.2);
            
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 12;
            
            ctx.strokeStyle = this.type.color;
            ctx.lineWidth = s * 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.85, 0.4, Math.PI * 2 - 0.4);
            ctx.stroke();
            
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.9);
            ctx.lineTo(0, -s * 0.2);
            ctx.stroke();
            
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
    }

    // ===================== GAME LOGIC =====================

    function initPolygon() {
        unclaimedPoly = [
            { x: GAME_LEFT, y: GAME_TOP },
            { x: GAME_RIGHT, y: GAME_TOP },
            { x: GAME_RIGHT, y: GAME_BOTTOM },
            { x: GAME_LEFT, y: GAME_BOTTOM }
        ];
        calculateClaimed();
    }

    function calculateClaimed() {
        const unclaimed = polyArea(unclaimedPoly);
        gameState.claimedPercent = ((TOTAL_AREA - unclaimed) / TOTAL_AREA) * 100;
        calculateRegionClaim();
    }

    function spawnEnemies() {
        gameState.enemies = [];
        // Always spawn 6 enemies, one per region
        for (let i = 0; i < 6; i++) {
            const type = GREED_TYPES[i];
            const rx = i % 3, ry = Math.floor(i / 3);
            const cx = GAME_LEFT + (rx + 0.5) * ((GAME_RIGHT - GAME_LEFT) / 3);
            const cy = GAME_TOP + (ry + 0.5) * ((GAME_BOTTOM - GAME_TOP) / 2);
            gameState.enemies.push(new Enemy(type, i, cx, cy));
        }
    }

    // Helper: Add a point to trail, ensuring axis-alignment
    function addTrailPoint(x, y) {
        if (gameState.trail.length === 0) {
            gameState.trail.push({ x, y });
            return;
        }
        
        const last = gameState.trail[gameState.trail.length - 1];
        const dx = Math.abs(x - last.x);
        const dy = Math.abs(y - last.y);
        
        // Skip if too close
        if (dx < 1 && dy < 1) return;
        
        // If both axes differ, we need a corner point
        if (dx > 1 && dy > 1) {
            // Use current cut direction to decide corner placement
            if (gameState.cutDirection && gameState.cutDirection.dx !== 0) {
                // Moving horizontally - go horizontal first
                gameState.trail.push({ x: x, y: last.y });
            } else {
                // Moving vertically - go vertical first
                gameState.trail.push({ x: last.x, y: y });
            }
        }
        
        gameState.trail.push({ x, y });
    }

    // FIXED: Correct polygon splitting for Volfied-style cuts
    function completeCut() {
        const trail = gameState.trail;
        if (trail.length < 2) { cancelCut(); return; }

        const endPt = closestOnBoundary(gameState.player.x, gameState.player.y);
        const startEdge = gameState.cutStart.edgeIndex;
        const startT = gameState.cutStart.edgeT;
        const endEdge = endPt.edge;
        const endT = endPt.t;

        // Ensure final trail point is on boundary and axis-aligned
        const lastTrail = trail[trail.length - 1];
        if (Math.abs(endPt.x - lastTrail.x) > 1 || Math.abs(endPt.y - lastTrail.y) > 1) {
            addTrailPoint(endPt.x, endPt.y);
        }

        // Build two candidate polygons
        const polyA = buildSplitPoly(trail, startEdge, startT, endEdge, endT, 1);
        const polyB = buildSplitPoly(trail, startEdge, startT, endEdge, endT, -1);

        // Count enemies in each
        const enemiesA = countEnemies(polyA);
        const enemiesB = countEnemies(polyB);

        // Volfied rule: KEEP the side WITH enemies (claim the empty side)
        let newPoly;
        if (enemiesA > 0 && enemiesB === 0) {
            newPoly = polyA;
        } else if (enemiesB > 0 && enemiesA === 0) {
            newPoly = polyB;
        } else if (enemiesA === 0 && enemiesB === 0) {
            // No enemies - keep smaller polygon (claim more)
            newPoly = polyArea(polyA) < polyArea(polyB) ? polyA : polyB;
        } else {
            // Both have enemies - keep larger (more room for enemies)
            newPoly = polyArea(polyA) > polyArea(polyB) ? polyA : polyB;
        }

        if (newPoly && newPoly.length >= 3) {
            const oldArea = polyArea(unclaimedPoly);
            unclaimedPoly = simplifyPoly(newPoly);
            const newArea = polyArea(unclaimedPoly);
            
            if (newArea < oldArea && newArea > 100) {
                const pctGained = ((oldArea - newArea) / TOTAL_AREA) * 100;
                gameState.score += Math.floor(pctGained * 10);
                if (pctGained > 2) showMessage(`+${pctGained.toFixed(1)}% RECLAIMED`);
                calculateClaimed();
                killTrappedEnemies();
                checkRegionKills();
            }
        }

        snapToBorder();
        cancelCut();

        if (gameState.claimedPercent >= CONFIG.winPercentage) {
            levelComplete();
        }
    }

    // Build one of the two split polygons
    // Trail goes from startEdge/startT to endEdge/endT
    // dir=1: walk boundary forward (CW) from end back to start
    // dir=-1: walk boundary backward (CCW) from end back to start
    function buildSplitPoly(trail, startEdge, startT, endEdge, endT, dir) {
        const poly = [];
        const n = unclaimedPoly.length;

        // Add trail points (from cut start to cut end)
        for (const pt of trail) {
            const last = poly[poly.length - 1];
            if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.5) {
                poly.push({ x: pt.x, y: pt.y });
            }
        }

        // Calculate how many vertices to add when walking the boundary
        // from (endEdge, endT) back to (startEdge, startT)
        
        if (dir > 0) {
            // Forward (clockwise): walk from end to start via increasing edge indices
            // Vertices to add: (endEdge+1), (endEdge+2), ..., startEdge
            let numVertices;
            if (startEdge === endEdge) {
                // Same edge: if endT > startT, we go the long way (all vertices)
                // if endT < startT, short way (no vertices, but that's the other polygon)
                numVertices = (endT >= startT) ? n : 0;
            } else {
                numVertices = ((startEdge - endEdge) + n) % n;
            }
            
            let v = (endEdge + 1) % n;
            for (let i = 0; i < numVertices; i++) {
                poly.push({ x: unclaimedPoly[v].x, y: unclaimedPoly[v].y });
                v = (v + 1) % n;
            }
        } else {
            // Backward (counter-clockwise): walk from end to start via decreasing edge indices
            // Vertices to add: endEdge, (endEdge-1), ..., (startEdge+1)
            let numVertices;
            if (startEdge === endEdge) {
                // Same edge: if endT < startT, we go the long way (all vertices)
                numVertices = (endT <= startT) ? n : 0;
            } else {
                numVertices = ((endEdge - startEdge) + n) % n;
            }
            
            let v = endEdge;
            for (let i = 0; i < numVertices; i++) {
                poly.push({ x: unclaimedPoly[v].x, y: unclaimedPoly[v].y });
                v = (v - 1 + n) % n;
            }
        }

        return poly;
    }

    function countEnemies(poly) {
        let c = 0;
        for (const e of gameState.enemies) {
            if (!e.dead && pointInPoly(e.x, e.y, poly)) c++;
        }
        return c;
    }

    function simplifyPoly(poly) {
        if (!poly || poly.length < 3) return poly;
        
        // First pass: remove near-duplicate points (threshold: 2px)
        let result = [];
        for (const pt of poly) {
            const last = result[result.length - 1];
            if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 2) {
                result.push({ x: pt.x, y: pt.y });
            }
        }
        
        // Check first/last
        if (result.length > 2) {
            const first = result[0], last = result[result.length - 1];
            if (Math.hypot(first.x - last.x, first.y - last.y) < 2) {
                result.pop();
            }
        }

        // Second pass: remove collinear points (be more aggressive)
        let simplified = [];
        for (let i = 0; i < result.length; i++) {
            const prev = result[(i - 1 + result.length) % result.length];
            const curr = result[i];
            const next = result[(i + 1) % result.length];
            const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
            if (Math.abs(cross) > 5) simplified.push(curr); // Increased threshold
        }
        
        if (simplified.length < 3) simplified = result;
        
        // Third pass: remove very short edges by merging points
        let final = [];
        const minEdgeLength = 4; // Increased minimum
        for (let i = 0; i < simplified.length; i++) {
            const curr = simplified[i];
            const next = simplified[(i + 1) % simplified.length];
            const edgeLen = Math.hypot(next.x - curr.x, next.y - curr.y);
            
            if (edgeLen >= minEdgeLength) {
                final.push(curr);
            } else if (final.length > 0) {
                // Merge with previous point (take midpoint)
                const prev = final[final.length - 1];
                prev.x = (prev.x + curr.x) / 2;
                prev.y = (prev.y + curr.y) / 2;
            } else {
                final.push(curr);
            }
        }
        
        // Ensure we have a valid polygon
        if (final.length < 3) final = simplified.length >= 3 ? simplified : result;

        return final;
    }

    function killTrappedEnemies() {
        for (const e of gameState.enemies) {
            if (!e.dead && !pointInPoly(e.x, e.y, unclaimedPoly)) {
                e.dead = true;
                const msgs = {
                    'THE CLOUD': 'CLOUD GROUNDED!',
                    'THE TRACKER': 'TRACKER BLINDED!',
                    'THE ENSHITTIFIER': 'QUALITY RESTORED!',
                    'THE RENT SEEKER': 'OWNERSHIP RECLAIMED!',
                    'THE LOCK-IN': 'CAGE OPENED!',
                    'THE KILL SWITCH': 'CONTROL RESTORED!'
                };
                showMessage(msgs[e.type.name] || 'ENTITY FREED!');
                gameState.score += 100;
            }
        }
    }

    function snapToBorder() {
        const closest = closestOnBoundary(gameState.player.x, gameState.player.y);
        gameState.player.x = closest.x;
        gameState.player.y = closest.y;
        gameState.edgeIndex = closest.edge;
        gameState.edgeT = closest.t;
        gameState.cutting = false;
        gameState.cutDirection = null;
    }

    function cancelCut() {
        gameState.trail = [];
        gameState.cutting = false;
        gameState.cutStart = null;
        gameState.cutDirection = null;
    }

    function resetInputState() {
        gameState.keys = {};
        gameState.spaceHeld = false;
        if (gameState.cutting) {
            // Return to cut start position
            if (gameState.cutStart) {
                gameState.player.x = gameState.cutStart.x;
                gameState.player.y = gameState.cutStart.y;
                gameState.edgeIndex = gameState.cutStart.edgeIndex;
                gameState.edgeT = gameState.cutStart.edgeT;
            }
            cancelCut();
        }
    }

    function startCutting(dx, dy) {
        // Ensure we're starting with a clean single-axis direction
        if (dx !== 0 && dy !== 0) {
            // Should never happen, but safety check - pick one axis
            if (Math.abs(dx) >= Math.abs(dy)) {
                dy = 0;
            } else {
                dx = 0;
            }
        }
        
        gameState.cutting = true;
        gameState.cutDirection = { dx, dy }; // Lock direction
        gameState.cutStart = {
            edgeIndex: gameState.edgeIndex,
            edgeT: gameState.edgeT,
            x: gameState.player.x,
            y: gameState.player.y
        };
        gameState.trail = [{ x: gameState.player.x, y: gameState.player.y }];
        
        // Move only on the chosen axis
        gameState.player.x += dx * CONFIG.cutSpeed;
        gameState.player.y += dy * CONFIG.cutSpeed;
        gameState.trail.push({ x: gameState.player.x, y: gameState.player.y });
    }

    function loseLife() {
        gameState.lives--;
        showMessage('BREACH DETECTED');
        
        if (gameState.cutStart) {
            gameState.player.x = gameState.cutStart.x;
            gameState.player.y = gameState.cutStart.y;
            gameState.edgeIndex = gameState.cutStart.edgeIndex;
            gameState.edgeT = gameState.cutStart.edgeT;
        }
        
        cancelCut();
        if (gameState.lives <= 0) gameOver();
    }

    function showMessage(msg) {
        gameState.message = msg;
        gameState.messageTimer = 60;
    }

    function levelComplete() {
        gameState.running = false;
        gameState.won = true;
        gameState.level++;
    }

    function gameOver() {
        gameState.running = false;
        gameState.won = false;
    }

    // ===================== UPDATE =====================

    function update() {
        if (!gameState.running || gameState.paused) return;

        // Get SINGLE axis input - never allow diagonal
        let dx = 0, dy = 0;
        const wantUp = gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W'];
        const wantDown = gameState.keys['ArrowDown'] || gameState.keys['s'] || gameState.keys['S'];
        const wantLeft = gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A'];
        const wantRight = gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D'];
        
        // Priority: vertical over horizontal, but only one axis at a time
        if (wantUp && !wantDown) dy = -1;
        else if (wantDown && !wantUp) dy = 1;
        
        if (dy === 0) {
            if (wantLeft && !wantRight) dx = -1;
            else if (wantRight && !wantLeft) dx = 1;
        }

        updateEnemies();

        if (dx === 0 && dy === 0) return;

        if (gameState.cutting) {
            // Strictly one axis at a time - use current direction's axis preference
            let cdx = 0, cdy = 0;
            const currentDir = gameState.cutDirection;
            
            if (currentDir.dx !== 0) {
                // Currently horizontal - prefer horizontal input
                if (wantLeft) cdx = -1;
                else if (wantRight) cdx = 1;
                else if (wantUp) cdy = -1;
                else if (wantDown) cdy = 1;
            } else {
                // Currently vertical - prefer vertical input
                if (wantUp) cdy = -1;
                else if (wantDown) cdy = 1;
                else if (wantLeft) cdx = -1;
                else if (wantRight) cdx = 1;
            }
            
            if (cdx === 0 && cdy === 0) return;
            
            // Detect direction change and add corner point
            if ((currentDir.dx !== 0 && cdy !== 0) || (currentDir.dy !== 0 && cdx !== 0)) {
                // Direction changed - add corner at current position
                addTrailPoint(gameState.player.x, gameState.player.y);
                gameState.cutDirection = { dx: cdx, dy: cdy };
            }
            
            // Calculate next position - ONLY on one axis
            const nx = gameState.player.x + cdx * CONFIG.cutSpeed;
            const ny = gameState.player.y + cdy * CONFIG.cutSpeed;

            const borderCheck = closestOnBoundary(nx, ny);
            const distFromStart = Math.hypot(nx - gameState.cutStart.x, ny - gameState.cutStart.y);
            
            // Complete cut if we're close to border and far from start
            if (borderCheck.dist < 6 && distFromStart > 30) {
                // Snap to border with proper corner handling
                addTrailPoint(borderCheck.x, borderCheck.y);
                gameState.player.x = borderCheck.x;
                gameState.player.y = borderCheck.y;
                completeCut();
                return;
            }

            // Check if still inside unclaimed area
            if (pointInPoly(nx, ny, unclaimedPoly)) {
                // Check collision with own trail
                for (let i = 0; i < gameState.trail.length - 2; i++) {
                    if (Math.hypot(nx - gameState.trail[i].x, ny - gameState.trail[i].y) < 6) {
                        loseLife();
                        return;
                    }
                }

                gameState.player.x = nx;
                gameState.player.y = ny;

                // Add trail point with axis-alignment
                const last = gameState.trail[gameState.trail.length - 1];
                if (Math.hypot(nx - last.x, ny - last.y) > 3) {
                    addTrailPoint(nx, ny);
                }
            } else {
                // We've exited the unclaimed area - complete the cut
                const snapped = closestOnBoundary(nx, ny);
                addTrailPoint(snapped.x, snapped.y);
                gameState.player.x = snapped.x;
                gameState.player.y = snapped.y;
                completeCut();
            }
        } else {
            // ON BORDER: Move along polygon boundary
            const n = unclaimedPoly.length;
            const speed = CONFIG.borderSpeed;
            
            // Get current position on boundary
            let pos = pointOnEdge(gameState.edgeIndex, gameState.edgeT);
            
            // Calculate target position in world space
            const targetX = pos.x + dx * speed;
            const targetY = pos.y + dy * speed;
            
            // Check for cutting into unclaimed (space + movement into polygon)
            if (gameState.spaceHeld) {
                const testX = pos.x + dx * 8;
                const testY = pos.y + dy * 8;
                if (pointInPoly(testX, testY, unclaimedPoly)) {
                    startCutting(dx, dy);
                    return;
                }
            }
            
            // Find the closest point on the boundary to the target
            let bestDist = Infinity;
            let bestEdge = gameState.edgeIndex;
            let bestT = gameState.edgeT;
            let bestX = pos.x;
            let bestY = pos.y;
            
            // Check current edge and neighbors
            for (let offset = -2; offset <= 2; offset++) {
                const edgeIdx = (gameState.edgeIndex + offset + n) % n;
                const e = getEdge(edgeIdx);
                const len = edgeLength(edgeIdx);
                if (len < 0.5) continue;
                
                // Project target onto this edge
                const ex = e.x2 - e.x1;
                const ey = e.y2 - e.y1;
                let t = ((targetX - e.x1) * ex + (targetY - e.y1) * ey) / (len * len);
                t = Math.max(0, Math.min(1, t));
                
                const projX = e.x1 + t * ex;
                const projY = e.y1 + t * ey;
                const dist = Math.hypot(projX - targetX, projY - targetY);
                
                // Prefer points that are "ahead" in the movement direction
                const moveDist = Math.hypot(projX - pos.x, projY - pos.y);
                const moveDir = (projX - pos.x) * dx + (projY - pos.y) * dy;
                
                // Weight: prefer closer to target AND in the right direction
                const score = dist - (moveDir > 0 ? moveDist * 0.5 : -moveDist * 2);
                
                if (score < bestDist) {
                    bestDist = score;
                    bestEdge = edgeIdx;
                    bestT = t;
                    bestX = projX;
                    bestY = projY;
                }
            }
            
            // Only move if we're actually moving (not stuck)
            const actualMove = Math.hypot(bestX - pos.x, bestY - pos.y);
            if (actualMove > 0.1) {
                gameState.edgeIndex = bestEdge;
                gameState.edgeT = bestT;
                gameState.player.x = bestX;
                gameState.player.y = bestY;
            }
        }
    }

    function updateEnemies() {
        const px = gameState.player.x, py = gameState.player.y;

        gameState.enemies = gameState.enemies.filter(e => {
            const alive = e.update(px, py);

            if (!e.dead && gameState.cutting) {
                for (const t of gameState.trail) {
                    if (Math.hypot(e.x - t.x, e.y - t.y) < e.size + 5) {
                        loseLife();
                        return alive;
                    }
                }
                if (Math.hypot(e.x - px, e.y - py) < e.size + 8) {
                    loseLife();
                }
            }
            return alive;
        });

        if (gameState.messageTimer > 0) gameState.messageTimer--;
    }

    // ===================== DRAWING =====================

    function drawLocalGhost(ctx, x, y, cutting) {
        const size = 14;
        ctx.save();
        ctx.translate(x, y);

        if (!cutting && unclaimedPoly.length > 0) {
            const normal = getEdgeInwardNormal(gameState.edgeIndex);
            const shieldAngle = Math.atan2(normal.y, normal.x);
            
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 12;
            
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, size + 6, shieldAngle - Math.PI * 0.4, shieldAngle + Math.PI * 0.4);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(136, 255, 136, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, size + 9, shieldAngle - Math.PI * 0.3, shieldAngle + Math.PI * 0.3);
            ctx.stroke();
        }

        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = cutting ? 20 : 15;
        ctx.fillStyle = cutting ? 'rgba(255, 100, 100, 0.3)' : 'rgba(51, 255, 0, 0.15)';
        ctx.strokeStyle = cutting ? '#FF6666' : '#33FF00';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(0, -size * 0.3, size * 0.6, Math.PI, 0);
        ctx.lineTo(size * 0.6, size * 0.3);
        ctx.lineTo(size * 0.35, size * 0.15);
        ctx.lineTo(size * 0.1, size * 0.4);
        ctx.lineTo(-size * 0.15, size * 0.15);
        ctx.lineTo(-size * 0.4, size * 0.4);
        ctx.lineTo(-size * 0.6, size * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = cutting ? '#FF6666' : '#33FF00';
        ctx.beginPath();
        ctx.arc(-size * 0.2, -size * 0.2, 2.5, 0, Math.PI * 2);
        ctx.arc(size * 0.2, -size * 0.2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function draw() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.totalHeight);

        ctx.save();
        ctx.translate(0, CONFIG.hudHeight);

        // Draw data region backgrounds across FULL canvas (not just game area)
        const rw = CONFIG.canvasWidth / 3;
        const rh = CONFIG.canvasHeight / 2;
        for (let ry = 0; ry < 2; ry++) {
            for (let rx = 0; rx < 3; rx++) {
                const idx = ry * 3 + rx;
                if (idx >= DATA_REGIONS.length) continue;
                const r = DATA_REGIONS[idx];
                const x = rx * rw;
                const y = ry * rh;
                
                // Dark tinted background for each region
                ctx.fillStyle = r.color + '15';
                ctx.fillRect(x, y, rw, rh);
                
                // Subtle border between regions
                ctx.strokeStyle = r.color + '20';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, rw, rh);
            }
        }

        // Claimed area tint
        ctx.fillStyle = 'rgba(51,255,0,0.06)';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

        // Unclaimed area (dark overlay)
        if (unclaimedPoly.length > 0) {
            ctx.fillStyle = 'rgba(5,5,5,0.85)';
            ctx.beginPath();
            ctx.moveTo(unclaimedPoly[0].x, unclaimedPoly[0].y);
            for (let i = 1; i < unclaimedPoly.length; i++) {
                ctx.lineTo(unclaimedPoly[i].x, unclaimedPoly[i].y);
            }
            ctx.closePath();
            ctx.fill();

            // Region labels
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let ry = 0; ry < 2; ry++) {
                for (let rx = 0; rx < 3; rx++) {
                    const idx = ry * 3 + rx;
                    if (idx >= DATA_REGIONS.length) continue;
                    const r = DATA_REGIONS[idx];
                    const cx = (rx + 0.5) * rw;
                    const cy = (ry + 0.5) * rh;
                    
                    const inUnclaimed = pointInPoly(cx, cy, unclaimedPoly);
                    ctx.fillStyle = inUnclaimed ? r.color + '60' : r.color + '30';
                    ctx.fillText(r.name, cx, cy);
                }
            }

            // Wire border of unclaimed area
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(unclaimedPoly[0].x, unclaimedPoly[0].y);
            for (let i = 1; i < unclaimedPoly.length; i++) {
                ctx.lineTo(unclaimedPoly[i].x, unclaimedPoly[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Cut trail - draw strictly axis-aligned segments
        if (gameState.trail.length > 1) {
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 3;
            ctx.lineCap = 'square'; // Square caps for crisp corners
            ctx.lineJoin = 'miter';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(gameState.trail[0].x, gameState.trail[0].y);
            for (let i = 1; i < gameState.trail.length; i++) {
                ctx.lineTo(gameState.trail[i].x, gameState.trail[i].y);
            }
            
            // Line to current player position - ensure axis-aligned
            const lastTrail = gameState.trail[gameState.trail.length - 1];
            const px = gameState.player.x;
            const py = gameState.player.y;
            
            // If both axes differ significantly, draw via corner
            if (Math.abs(px - lastTrail.x) > 1 && Math.abs(py - lastTrail.y) > 1) {
                if (gameState.cutDirection && gameState.cutDirection.dx !== 0) {
                    ctx.lineTo(px, lastTrail.y);
                } else {
                    ctx.lineTo(lastTrail.x, py);
                }
            }
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Enemies
        for (const e of gameState.enemies) e.draw(ctx);

        // Player
        drawLocalGhost(ctx, gameState.player.x, gameState.player.y, gameState.cutting);

        ctx.restore();

        drawHUD();

        if (gameState.messageTimer > 0) {
            ctx.fillStyle = `rgba(51,255,0,${gameState.messageTimer / 40})`;
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(gameState.message, CONFIG.canvasWidth / 2, CONFIG.hudHeight + 35);
        }

        if (!gameState.running || gameState.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, CONFIG.hudHeight, CONFIG.canvasWidth, CONFIG.canvasHeight);
            ctx.textAlign = 'center';

            if (gameState.won) {
                // Victory screen
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 36px monospace';
                ctx.fillText('DATA RECLAIMED', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 120);
                
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 22px monospace';
                ctx.fillText('THE EXIT IS OPEN', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 70);
                
                ctx.fillStyle = '#AAA';
                ctx.font = '14px monospace';
                const lines = [
                    'The cage is unlocked.',
                    'Your data runs local. Your keys. Your rules.',
                    'No kill switch. No rent. No betrayal.',
                    '',
                    'Physics, not promises.'
                ];
                lines.forEach((line, i) => {
                    ctx.fillText(line, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 20 + i * 24);
                });
                
                ctx.fillStyle = '#33FF00';
                ctx.font = '16px monospace';
                ctx.fillText(`Score: ${gameState.score}  |  ${gameState.claimedPercent.toFixed(1)}% Reclaimed`, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 120);
                
                ctx.fillStyle = '#888';
                ctx.font = '14px monospace';
                ctx.fillText('Press R to reclaim another sector', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 160);
                
                ctx.fillStyle = '#33FF0066';
                ctx.font = '12px monospace';
                ctx.fillText('"The only scarcity left is your courage to use it."', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 200);
                
            } else if (gameState.lives <= 0) {
                ctx.fillStyle = '#FF3333';
                ctx.font = 'bold 32px monospace';
                ctx.fillText('THE MACHINE WINS', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 60);
                ctx.fillStyle = '#AAA';
                ctx.font = '14px monospace';
                ctx.fillText('Your data remains in their dungeons.', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 20);
                ctx.fillStyle = '#33FF00';
                ctx.font = '16px monospace';
                ctx.fillText(`Score: ${gameState.score}  |  ${gameState.claimedPercent.toFixed(1)}% Reclaimed`, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 30);
                ctx.fillStyle = '#888';
                ctx.font = '14px monospace';
                ctx.fillText('Press R to try again', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 70);
                ctx.fillStyle = '#666';
                ctx.font = '12px monospace';
                ctx.fillText('The exit is still open.', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 100);
            } else if (gameState.paused) {
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 32px monospace';
                ctx.fillText('PAUSED', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2);
                ctx.fillStyle = '#888';
                ctx.font = '14px monospace';
                ctx.fillText('Press P to continue', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 40);
            }
        }
        
        // Info screen overlay
        if (gameState.showInfo) {
            drawInfoScreen();
        }
    }

    function drawInfoScreen() {
        ctx.save();
        
        // Full black overlay
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.totalHeight);
        
        ctx.textBaseline = 'alphabetic';
        
        const t = GREED_TYPES[gameState.infoPage];
        const cx = CONFIG.canvasWidth / 2;
        
        // Header
        ctx.textAlign = 'center';
        ctx.fillStyle = '#33FF00';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('KNOW YOUR ENEMY', cx, 35);
        
        // Page indicator
        ctx.fillStyle = '#555';
        ctx.font = '12px monospace';
        ctx.fillText(`${gameState.infoPage + 1} / ${GREED_TYPES.length}`, cx, 55);
        
        // Navigation hints
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('◄ A / ←', 30, CONFIG.totalHeight / 2);
        ctx.textAlign = 'right';
        ctx.fillText('D / → ►', CONFIG.canvasWidth - 30, CONFIG.totalHeight / 2);
        
        // Save real player position for enemy drawing
        const realPlayerX = gameState.player.x;
        const realPlayerY = gameState.player.y;
        gameState.player.x = cx;
        gameState.player.y = 300;
        
        // Draw the monster - BIG and centered
        const monsterY = 160;
        ctx.save();
        ctx.translate(cx, monsterY);
        try {
            const tempEnemy = new Enemy(t, 0, 0);
            tempEnemy.angle = performance.now() * 0.002;
            tempEnemy.patrolAngle = performance.now() * 0.001;
            tempEnemy.size = t.size * 3; // Much bigger
            tempEnemy.dead = false;
            tempEnemy.deathTimer = 0;
            tempEnemy.quoteTimer = 0;
            
            const s = tempEnemy.size;
            switch (t.name) {
                case 'THE TRACKER': tempEnemy.drawEye(ctx, s); break;
                case 'THE CLOUD': tempEnemy.drawCloud(ctx, s); break;
                case 'THE ENSHITTIFIER': tempEnemy.drawEnshittifier(ctx, s); break;
                case 'THE RENT SEEKER': tempEnemy.drawRentSeeker(ctx, s); break;
                case 'THE LOCK-IN': tempEnemy.drawLockIn(ctx, s); break;
                case 'THE KILL SWITCH': tempEnemy.drawKillSwitch(ctx, s); break;
                default:
                    ctx.fillStyle = t.color;
                    ctx.beginPath();
                    ctx.arc(0, 0, s, 0, Math.PI * 2);
                    ctx.fill();
            }
        } catch(e) {
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.arc(0, 0, t.size * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        
        // Restore player position
        gameState.player.x = realPlayerX;
        gameState.player.y = realPlayerY;
        
        // Reset drawing state
        ctx.textBaseline = 'alphabetic';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        
        // Monster name - big and colored
        ctx.fillStyle = t.color;
        ctx.font = 'bold 28px monospace';
        ctx.fillText(t.name, cx, 280);
        
        // Tagline - white italic
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'italic 16px monospace';
        ctx.fillText('"' + t.tagline + '"', cx, 310);
        
        // Divider line
        ctx.strokeStyle = t.color + '44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 250, 330);
        ctx.lineTo(cx + 250, 330);
        ctx.stroke();
        
        // Description - main text block
        ctx.fillStyle = '#CCCCCC';
        ctx.font = '14px monospace';
        const descLines = wrapText(t.description, 500);
        descLines.forEach((line, idx) => {
            ctx.fillText(line, cx, 360 + idx * 22);
        });
        
        // Stats section
        const statsY = 360 + descLines.length * 22 + 40;
        
        // Speed bar
        ctx.fillStyle = '#888';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('THREAT LEVEL:', cx - 60, statsY);
        
        const barW = 150;
        const barX = cx - 50;
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, statsY - 12, barW, 16);
        
        // Speed as threat level (normalized)
        const threatLevel = t.speed / 4.0;
        const barColor = threatLevel > 0.7 ? '#FF3333' : threatLevel > 0.4 ? '#FFAA00' : '#33FF00';
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, statsY - 12, threatLevel * barW, 16);
        
        // Speed label on bar - white with shadow for readability
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        const speedLabels = ['SLOW', 'MODERATE', 'FAST', 'RELENTLESS'];
        const speedIdx = Math.min(3, Math.floor(t.speed / 1.0));
        ctx.fillText(speedLabels[speedIdx], barX + barW/2, statsY);
        ctx.shadowBlur = 0;
        
        // Behavior type
        const behaviorY = statsY + 35;
        ctx.fillStyle = '#888';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('BEHAVIOR:', cx - 60, behaviorY);
        
        const behaviorNames = {
            'chase': 'PURSUER',
            'patrol': 'SENTINEL',
            'erratic': 'CHAOS AGENT',
            'wander': 'DRIFTER',
            'predict': 'INTERCEPTOR'
        };
        ctx.fillStyle = t.color;
        ctx.textAlign = 'left';
        ctx.fillText(behaviorNames[t.behavior] || t.behavior.toUpperCase(), cx - 50, behaviorY);
        
        // How it hunts - the key tactical info
        const huntY = behaviorY + 50;
        ctx.fillStyle = '#FF6666';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚠ HUNTING PATTERN', cx, huntY);
        
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '13px monospace';
        const huntLines = wrapText(t.howItHunts, 450);
        huntLines.forEach((line, idx) => {
            ctx.fillText(line, cx, huntY + 25 + idx * 20);
        });
        
        // Bottom instructions
        ctx.fillStyle = '#33FF00';
        ctx.font = '12px monospace';
        ctx.fillText('TRAP IT or RECLAIM 90% OF ITS REGION TO DESTROY', cx, CONFIG.totalHeight - 55);
        
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('← → or A/D to browse  •  I to close', cx, CONFIG.totalHeight - 30);
        
        // Page dots
        const dotY = CONFIG.totalHeight - 85;
        const dotSpacing = 20;
        const dotsStartX = cx - ((GREED_TYPES.length - 1) * dotSpacing) / 2;
        for (let i = 0; i < GREED_TYPES.length; i++) {
            ctx.fillStyle = i === gameState.infoPage ? '#33FF00' : '#333';
            ctx.beginPath();
            ctx.arc(dotsStartX + i * dotSpacing, dotY, i === gameState.infoPage ? 5 : 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }

    // Helper to wrap text
    function wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        // Approximate character width for 14px monospace
        const charWidth = 8.4;
        const maxChars = Math.floor(maxWidth / charWidth);
        
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            if (testLine.length > maxChars) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        return lines;
    }

    function drawHUD() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.hudHeight);
        ctx.strokeStyle = '#33FF00';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, CONFIG.canvasWidth, CONFIG.hudHeight);

        const barX = 90, barY = 18, barW = CONFIG.canvasWidth - 180, barH = 14;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#33FF00';
        ctx.fillRect(barX, barY, (gameState.claimedPercent / 100) * barW, barH);

        ctx.strokeStyle = '#FFE66D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const targetX = barX + (CONFIG.winPercentage / 100) * barW;
        ctx.moveTo(targetX, barY - 3);
        ctx.lineTo(targetX, barY + barH + 3);
        ctx.stroke();

        ctx.fillStyle = '#33FF00';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${gameState.claimedPercent.toFixed(0)}%`, 12, 29);
        ctx.textAlign = 'right';
        ctx.fillText(`♥${gameState.lives}  L${gameState.level}`, CONFIG.canvasWidth - 12, 29);

        ctx.textAlign = 'center';
        if (gameState.cutting) {
            ctx.fillStyle = '#FF6B6B';
            ctx.font = '12px monospace';
            ctx.fillText('◆ CUTTING', CONFIG.canvasWidth / 2, 44);
        } else if (gameState.spaceHeld) {
            ctx.fillStyle = '#FFE66D';
            ctx.font = '12px monospace';
            ctx.fillText('◇ SPACE + DIRECTION', CONFIG.canvasWidth / 2, 44);
        }
    }

    function gameLoop(ts) {
        const elapsed = ts - lastFrameTime;
        if (elapsed >= frameInterval) {
            lastFrameTime = ts - (elapsed % frameInterval);
            if (!gameState.showInfo) update();
            draw();
        }
        if (gameState.running || gameState.paused || gameState.won || gameState.lives <= 0 || gameState.showInfo) {
            gameState.animationId = requestAnimationFrame(gameLoop);
        }
    }

    function initGame() {
        initPolygon();
        gameState.player = { x: GAME_LEFT, y: (GAME_TOP + GAME_BOTTOM) / 2 };
        gameState.edgeIndex = 3;
        gameState.edgeT = 0.5;
        gameState.cutting = false;
        gameState.trail = [];
        gameState.cutStart = null;
        gameState.cutDirection = null;
        gameState.lives = 3;
        gameState.score = 0;
        gameState.level = 1;
        gameState.running = true;
        gameState.paused = false;
        gameState.won = false;
        gameState.showInfo = false;
        gameState.infoPage = 0;
        gameState.spaceHeld = false;
        gameState.keys = {};
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
        
        // Info screen navigation
        if (gameState.showInfo) {
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                gameState.infoPage = (gameState.infoPage + 1) % GREED_TYPES.length;
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                gameState.infoPage = (gameState.infoPage - 1 + GREED_TYPES.length) % GREED_TYPES.length;
                e.preventDefault();
                return;
            }
            if (e.key === 'i' || e.key === 'I' || e.key === 'Escape') {
                gameState.showInfo = false;
                resetInputState();
                e.preventDefault();
                return;
            }
            // Block other keys while info is open
            e.preventDefault();
            return;
        }
        
        if (e.key === ' ') { gameState.spaceHeld = true; e.preventDefault(); }
        if (e.key === 'p' || e.key === 'P') { 
            if (gameState.running && !gameState.showInfo) {
                gameState.paused = !gameState.paused;
            }
            e.preventDefault(); 
        }
        if (e.key === 'i' || e.key === 'I') { 
            // Toggle info screen and reset input state
            gameState.showInfo = !gameState.showInfo;
            gameState.infoPage = 0;
            if (!gameState.showInfo) {
                resetInputState();
            }
            e.preventDefault(); 
        }
        if (e.key === 'r' || e.key === 'R') { initGame(); e.preventDefault(); }
        if (e.key === 'Escape') { 
            if (gameState.showInfo) { 
                gameState.showInfo = false;
                resetInputState();
            } else { 
                window.ReclaimGame.close(); 
            }
            e.preventDefault(); 
        }
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
        
        // Fix close button - override the onclick
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.ReclaimGame.close();
            };
        }
        
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
        resetInputState();
        if (gameState.animationId) cancelAnimationFrame(gameState.animationId);
        const ti = document.getElementById('terminalInput');
        if (ti) ti.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    window.ReclaimGame = { open, close };
    window.ExportGame = window.ReclaimGame;

})();