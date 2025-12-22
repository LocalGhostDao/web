// ===========================================
// RECLAIM.EXE - TAKE BACK YOUR IDENTITY
// A Volfied/Qix-style game for LocalGhost.ai
// Pure polygon-based logic with enhanced visuals
// ===========================================

(function() {
    'use strict';

    const CONFIG = {
        canvasWidth: 400,
        canvasHeight: 360,
        hudHeight: 40,
        totalHeight: 400,
        borderSpeed: 3,
        cutSpeed: 2.5,
        winPercentage: 80,
        regionKillPercent: 90,
        targetFPS: 40
    };

    // Game area - 10px margin for the wire border
    const MARGIN = 10;
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
        { name: 'THE CLOUD', color: '#DC143C', size: 12, speed: 0.8, behavior: 'patrol', quotes: ['SYNC REQUIRED', 'SERVER DEPENDENCY', 'ALWAYS ONLINE'] },
        { name: 'THE TRACKER', color: '#FF2222', size: 9, speed: 1.5, behavior: 'chase', quotes: ['TRACKING...', 'WE SEE YOU', 'PERSONALIZED'] },
        { name: 'THE ENSHITTIFIER', color: '#8B4513', size: 14, speed: 0.7, behavior: 'erratic', quotes: ['NEW TOS!', 'FEATURE REMOVED', 'SUBSCRIBE NOW', 'PREMIUM ONLY'] },
        { name: 'THE RENT SEEKER', color: '#B22222', size: 10, speed: 1.2, behavior: 'chase', quotes: ['FEE DUE', 'PAY NOW', 'SUBSCRIPTION'] },
        { name: 'THE LOCK-IN', color: '#CD5C5C', size: 11, speed: 0.4, behavior: 'wander', quotes: ['NO EXPORT', 'PROPRIETARY', 'LOCKED'] },
        { name: 'THE KILL SWITCH', color: '#8B0000', size: 13, speed: 0.6, behavior: 'predict', quotes: ['BRICKING...', 'REVOKED', 'DISABLED'] }
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
        player: { x: 0, y: 0 },
        // Border walking state
        edgeIndex: 0,
        edgeT: 0,
        // Cutting state
        cutStart: null,
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
        for (const e of gameState.enemies) {
            if (e.dead) continue;
            const pct = regionClaimPercent[e.regionIndex];
            if (pct >= CONFIG.regionKillPercent) {
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
                        this.vx += ((playerX - this.x) / d) * 0.03;
                        this.vy += ((playerY - this.y) / d) * 0.03;
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
                    // Slow wandering - gently changes direction over time
                    this.patrolAngle += (Math.random() - 0.5) * 0.1;
                    this.vx += Math.cos(this.patrolAngle) * 0.015;
                    this.vy += Math.sin(this.patrolAngle) * 0.015;
                    // Add some momentum dampening to prevent getting stuck
                    this.vx *= 0.98;
                    this.vy *= 0.98;
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
            
            // If nearly stopped, give a random push
            if (spd < 0.2) {
                const pushAngle = Math.random() * Math.PI * 2;
                this.vx = Math.cos(pushAngle) * this.type.speed * 0.5;
                this.vy = Math.sin(pushAngle) * this.type.speed * 0.5;
            }

            const nx = this.x + this.vx, ny = this.y + this.vy;

            if (pointInPoly(nx, ny, unclaimedPoly)) {
                this.x = nx;
                this.y = ny;
                this.stuckCounter = 0;
            } else {
                // Hit boundary - bounce with randomness
                this.stuckCounter = (this.stuckCounter || 0) + 1;
                
                if (this.stuckCounter > 10) {
                    // Really stuck - teleport toward center of polygon and reset
                    const cx = unclaimedPoly.reduce((s, p) => s + p.x, 0) / unclaimedPoly.length;
                    const cy = unclaimedPoly.reduce((s, p) => s + p.y, 0) / unclaimedPoly.length;
                    this.x = this.x * 0.7 + cx * 0.3;
                    this.y = this.y * 0.7 + cy * 0.3;
                    this.stuckCounter = 0;
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
                ctx.globalAlpha = Math.min(1, this.quoteTimer / 25) * 0.9;
                ctx.fillStyle = this.type.color;
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(this.currentQuote, this.x, this.y - this.size - 12);
                ctx.globalAlpha = 1;
            }
        }

        drawEye(ctx, s) {
            const lookAngle = Math.atan2(gameState.player.y - this.y, gameState.player.x - this.x);
            
            // Glow
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 10;
            
            // Sclera (white of eye) - almond shape
            ctx.fillStyle = '#F5F5F5';
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.3, s * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Bloodshot veins
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#CC3333';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 6; i++) {
                const veinAngle = (i / 6) * Math.PI * 2 + this.angle * 0.1;
                const startR = s * 0.5;
                const endR = s * 1.1;
                ctx.beginPath();
                ctx.moveTo(Math.cos(veinAngle) * startR, Math.sin(veinAngle) * startR * 0.6);
                // Squiggly vein
                const midR = (startR + endR) / 2;
                const wobble = Math.sin(this.angle * 2 + i) * s * 0.1;
                ctx.quadraticCurveTo(
                    Math.cos(veinAngle) * midR + wobble,
                    Math.sin(veinAngle) * midR * 0.6,
                    Math.cos(veinAngle) * endR,
                    Math.sin(veinAngle) * endR * 0.6
                );
                ctx.stroke();
            }
            
            // Iris - tracks player
            const irisOffsetX = Math.cos(lookAngle) * s * 0.25;
            const irisOffsetY = Math.sin(lookAngle) * s * 0.15;
            
            // Iris gradient (red/crimson)
            const irisGrad = ctx.createRadialGradient(irisOffsetX, irisOffsetY, 0, irisOffsetX, irisOffsetY, s * 0.5);
            irisGrad.addColorStop(0, '#8B0000');
            irisGrad.addColorStop(0.7, '#DC143C');
            irisGrad.addColorStop(1, '#8B0000');
            ctx.fillStyle = irisGrad;
            ctx.beginPath();
            ctx.arc(irisOffsetX, irisOffsetY, s * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Iris detail lines
            ctx.strokeStyle = '#5C0000';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 12; i++) {
                const lineAngle = (i / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(irisOffsetX + Math.cos(lineAngle) * s * 0.2, irisOffsetY + Math.sin(lineAngle) * s * 0.2);
                ctx.lineTo(irisOffsetX + Math.cos(lineAngle) * s * 0.45, irisOffsetY + Math.sin(lineAngle) * s * 0.45);
                ctx.stroke();
            }
            
            // Pupil
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(irisOffsetX, irisOffsetY, s * 0.2, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupil highlight
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(irisOffsetX - s * 0.08, irisOffsetY - s * 0.08, s * 0.06, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyelid lines (top and bottom)
            ctx.strokeStyle = '#AA2222';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.35, s * 0.85, 0, Math.PI * 0.9, Math.PI * 0.1, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.35, s * 0.85, 0, Math.PI * 0.9, Math.PI * 2.1);
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

    // FIXED: Correct polygon splitting for Volfied-style cuts
    function completeCut() {
        const trail = gameState.trail;
        if (trail.length < 2) { cancelCut(); return; }

        const endPt = closestOnBoundary(gameState.player.x, gameState.player.y);
        const startEdge = gameState.cutStart.edgeIndex;
        const startT = gameState.cutStart.edgeT;
        const endEdge = endPt.edge;
        const endT = endPt.t;

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

        // Second pass: remove collinear points
        let simplified = [];
        for (let i = 0; i < result.length; i++) {
            const prev = result[(i - 1 + result.length) % result.length];
            const curr = result[i];
            const next = result[(i + 1) % result.length];
            const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
            if (Math.abs(cross) > 1) simplified.push(curr);
        }
        
        if (simplified.length < 3) simplified = result;
        
        // Third pass: remove very short edges by merging points
        let final = [];
        const minEdgeLength = 3;
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

        return final.length >= 3 ? final : simplified;
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
    }

    function cancelCut() {
        gameState.trail = [];
        gameState.cutting = false;
        gameState.cutStart = null;
    }

    function startCutting(dx, dy) {
        gameState.cutting = true;
        gameState.cutStart = {
            edgeIndex: gameState.edgeIndex,
            edgeT: gameState.edgeT,
            x: gameState.player.x,
            y: gameState.player.y
        };
        gameState.trail = [{ x: gameState.player.x, y: gameState.player.y }];
        
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

        let dx = 0, dy = 0;
        if (gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']) dy = -1;
        else if (gameState.keys['ArrowDown'] || gameState.keys['s'] || gameState.keys['S']) dy = 1;
        else if (gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A']) dx = -1;
        else if (gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D']) dx = 1;

        updateEnemies();

        if (dx === 0 && dy === 0) return;

        if (gameState.cutting) {
            const nx = gameState.player.x + dx * CONFIG.cutSpeed;
            const ny = gameState.player.y + dy * CONFIG.cutSpeed;

            const borderCheck = closestOnBoundary(nx, ny);
            const distFromStart = Math.hypot(nx - gameState.cutStart.x, ny - gameState.cutStart.y);
            
            // Complete cut if we're close to border and far from start
            if (borderCheck.dist < 4 && distFromStart > 20) {
                gameState.player.x = borderCheck.x;
                gameState.player.y = borderCheck.y;
                gameState.trail.push({ x: borderCheck.x, y: borderCheck.y });
                completeCut();
                return;
            }

            // Check if still inside unclaimed area
            if (pointInPoly(nx, ny, unclaimedPoly)) {
                // Check collision with own trail
                for (let i = 0; i < gameState.trail.length - 2; i++) {
                    if (Math.hypot(nx - gameState.trail[i].x, ny - gameState.trail[i].y) < 4) {
                        loseLife();
                        return;
                    }
                }

                gameState.player.x = nx;
                gameState.player.y = ny;

                const last = gameState.trail[gameState.trail.length - 1];
                if (Math.hypot(nx - last.x, ny - last.y) > 2) {
                    gameState.trail.push({ x: nx, y: ny });
                }
            } else {
                // We've exited the unclaimed area - complete the cut
                const snapped = closestOnBoundary(nx, ny);
                gameState.player.x = snapped.x;
                gameState.player.y = snapped.y;
                gameState.trail.push({ x: snapped.x, y: snapped.y });
                completeCut();
            }
        } else {
            // ON BORDER: Move along polygon boundary
            // Simple approach: project movement onto current edge, handle edge transitions cleanly
            
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
                    if (Math.hypot(e.x - t.x, e.y - t.y) < e.size + 3) {
                        loseLife();
                        return alive;
                    }
                }
                if (Math.hypot(e.x - px, e.y - py) < e.size + 5) {
                    loseLife();
                }
            }
            return alive;
        });

        if (gameState.messageTimer > 0) gameState.messageTimer--;
    }

    // ===================== DRAWING =====================

    function drawLocalGhost(ctx, x, y, cutting) {
        const size = 8;
        ctx.save();
        ctx.translate(x, y);

        if (!cutting && unclaimedPoly.length > 0) {
            const normal = getEdgeInwardNormal(gameState.edgeIndex);
            const shieldAngle = Math.atan2(normal.y, normal.x);
            
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 8;
            
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, size + 4, shieldAngle - Math.PI * 0.4, shieldAngle + Math.PI * 0.4);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(136, 255, 136, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, size + 6, shieldAngle - Math.PI * 0.3, shieldAngle + Math.PI * 0.3);
            ctx.stroke();
        }

        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = cutting ? 15 : 10;
        ctx.fillStyle = cutting ? 'rgba(255, 100, 100, 0.3)' : 'rgba(51, 255, 0, 0.15)';
        ctx.strokeStyle = cutting ? '#FF6666' : '#33FF00';
        ctx.lineWidth = 1;

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
        ctx.arc(-size * 0.2, -size * 0.2, 1.5, 0, Math.PI * 2);
        ctx.arc(size * 0.2, -size * 0.2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function draw() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.totalHeight);

        ctx.save();
        ctx.translate(0, CONFIG.hudHeight);

        // Draw data region backgrounds across FULL canvas (not just game area)
        // These extend to edges so they're visible outside the wire border
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

        // Claimed area tint - full canvas (the 10px border is already "yours")
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

            // Region labels - always visible
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let ry = 0; ry < 2; ry++) {
                for (let rx = 0; rx < 3; rx++) {
                    const idx = ry * 3 + rx;
                    if (idx >= DATA_REGIONS.length) continue;
                    const r = DATA_REGIONS[idx];
                    const cx = (rx + 0.5) * rw;
                    const cy = (ry + 0.5) * rh;
                    
                    // Brighter in unclaimed area, dimmer when claimed
                    const inUnclaimed = pointInPoly(cx, cy, unclaimedPoly);
                    ctx.fillStyle = inUnclaimed ? r.color + '50' : r.color + '25';
                    ctx.fillText(r.name, cx, cy);
                }
            }

            // Wire border of unclaimed area (the green line ghost walks on)
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.moveTo(unclaimedPoly[0].x, unclaimedPoly[0].y);
            for (let i = 1; i < unclaimedPoly.length; i++) {
                ctx.lineTo(unclaimedPoly[i].x, unclaimedPoly[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Cut trail
        if (gameState.trail.length > 1) {
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(gameState.trail[0].x, gameState.trail[0].y);
            for (let i = 1; i < gameState.trail.length; i++) {
                ctx.lineTo(gameState.trail[i].x, gameState.trail[i].y);
            }
            ctx.lineTo(gameState.player.x, gameState.player.y);
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
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(gameState.message, CONFIG.canvasWidth / 2, CONFIG.hudHeight + 25);
        }

        if (!gameState.running || gameState.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, CONFIG.hudHeight, CONFIG.canvasWidth, CONFIG.canvasHeight);
            ctx.textAlign = 'center';

            if (gameState.won) {
                // Victory screen with manifesto-inspired text
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 20px monospace';
                ctx.fillText('DATA RECLAIMED', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 80);
                
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 14px monospace';
                ctx.fillText('THE EXIT IS OPEN', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 50);
                
                ctx.fillStyle = '#888';
                ctx.font = '9px monospace';
                const lines = [
                    'The cage is unlocked.',
                    'Your data runs local. Your keys. Your rules.',
                    'No kill switch. No rent. No betrayal.',
                    '',
                    'Physics, not promises.'
                ];
                lines.forEach((line, i) => {
                    ctx.fillText(line, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 - 15 + i * 14);
                });
                
                ctx.fillStyle = '#33FF00';
                ctx.font = '12px monospace';
                ctx.fillText(`Score: ${gameState.score}  |  ${gameState.claimedPercent.toFixed(1)}% Reclaimed`, CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 70);
                
                ctx.fillStyle = '#666';
                ctx.font = '10px monospace';
                ctx.fillText('Press R to reclaim another sector', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 95);
                
                ctx.fillStyle = '#33FF0044';
                ctx.font = '7px monospace';
                ctx.fillText('"The only scarcity left is your courage to use it."', CONFIG.canvasWidth / 2, CONFIG.totalHeight / 2 + 115);
                
            } else if (gameState.lives <= 0) {
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

        ctx.strokeStyle = '#FFE66D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const targetX = barX + (CONFIG.winPercentage / 100) * barW;
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

    function gameLoop(ts) {
        const elapsed = ts - lastFrameTime;
        if (elapsed >= frameInterval) {
            lastFrameTime = ts - (elapsed % frameInterval);
            update();
            draw();
        }
        if (gameState.running || gameState.paused || gameState.won || gameState.lives <= 0) {
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
        gameState.lives = 3;
        gameState.score = 0;
        gameState.level = 1;
        gameState.running = true;
        gameState.paused = false;
        gameState.won = false;
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