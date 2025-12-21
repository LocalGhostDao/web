// ===========================================
// EXPORT.EXE - RECLAIM YOUR IDENTITY
// A Volfied/Qix-style game for LocalGhost.ai
// ===========================================

(function() {
    'use strict';

    const CONFIG = {
        gridSize: 4,        // Size of each cell
        canvasWidth: 400,
        canvasHeight: 400,
        playerSpeed: 2,
        cutSpeed: 1.5,      // Slower when cutting
        enemySpeed: 1.2,
        winPercentage: 80
    };

    // Your personal data - different regions of the map
    const DATA_REGIONS = [
        { name: 'PHOTOS', color: '#4ECDC4', darkColor: '#2A7A75' },
        { name: 'MESSAGES', color: '#FFE66D', darkColor: '#998A41' },
        { name: 'LOCATION', color: '#FF6B6B', darkColor: '#993F3F' },
        { name: 'CONTACTS', color: '#96E6A1', darkColor: '#5A8A60' },
        { name: 'BROWSING', color: '#DDA0DD', darkColor: '#846084' },
        { name: 'PURCHASES', color: '#F4A460', darkColor: '#92623A' },
        { name: 'HEALTH', color: '#FF8B94', darkColor: '#995358' },
        { name: 'FINANCES', color: '#45B7D1', darkColor: '#2A6D7D' },
        { name: 'SEARCH', color: '#98D8C8', darkColor: '#5B8178' },
        { name: 'SOCIAL', color: '#F7DC6F', darkColor: '#948442' }
    ];

    const GREED_QUOTES = [
        "YOUR DATA IS MINE",
        "MONETIZING...",
        "HARVESTING...",
        "PROFILING...",
        "SELLING...",
        "TRACKING..."
    ];

    let canvas, ctx;
    let gridWidth, gridHeight;
    let grid = [];          // 0 = unclaimed, 1 = claimed, 2 = trail
    let dataMap = [];       // Which data type each cell belongs to
    
    let gameState = {
        running: false,
        paused: false,
        cutting: false,     // True when SPACE is held and we're in unclaimed territory
        player: { x: 0, y: 0 },
        direction: { x: 0, y: 0 },
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
        constructor(x, y) {
            this.x = x || CONFIG.canvasWidth / 2;
            this.y = y || CONFIG.canvasHeight / 2;
            this.vx = (Math.random() > 0.5 ? 1 : -1) * CONFIG.enemySpeed;
            this.vy = (Math.random() > 0.5 ? 1 : -1) * CONFIG.enemySpeed;
            this.size = 12;
            this.angle = 0;
            this.quoteTimer = 0;
            this.currentQuote = '';
        }

        update() {
            this.angle += 0.03;
            this.quoteTimer--;

            if (this.quoteTimer <= 0 && Math.random() < 0.005) {
                this.currentQuote = GREED_QUOTES[Math.floor(Math.random() * GREED_QUOTES.length)];
                this.quoteTimer = 120;
            }

            let nextX = this.x + this.vx;
            let nextY = this.y + this.vy;

            // Get grid position
            const gx = Math.floor(nextX / CONFIG.gridSize);
            const gy = Math.floor(nextY / CONFIG.gridSize);

            // Bounce off claimed areas and borders
            if (nextX < this.size || nextX > CONFIG.canvasWidth - this.size || 
                (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx] === 1)) {
                this.vx *= -1;
                this.vx += (Math.random() - 0.5) * 0.3;
                nextX = this.x;
            }

            if (nextY < this.size || nextY > CONFIG.canvasHeight - this.size ||
                (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx] === 1)) {
                this.vy *= -1;
                this.vy += (Math.random() - 0.5) * 0.3;
                nextY = this.y;
            }

            // Normalize speed
            const speed = Math.hypot(this.vx, this.vy);
            const targetSpeed = CONFIG.enemySpeed * (1 + gameState.level * 0.1);
            if (speed > 0) {
                this.vx = (this.vx / speed) * targetSpeed;
                this.vy = (this.vy / speed) * targetSpeed;
            }

            this.x = nextX;
            this.y = nextY;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);

            // Glow
            ctx.shadowColor = '#FF0000';
            ctx.shadowBlur = 15;

            // Rotating evil shape
            ctx.rotate(this.angle);
            ctx.fillStyle = '#FF3333';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const r = i % 2 === 0 ? this.size : this.size * 0.5;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();

            // Dollar sign
            ctx.rotate(-this.angle);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);

            ctx.restore();

            // Quote bubble
            if (this.quoteTimer > 0 && this.currentQuote) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.font = '8px JetBrains Mono, monospace';
                ctx.textAlign = 'center';
                ctx.fillText(this.currentQuote, this.x, this.y - 20);
            }
        }

        checkTrailCollision(trail) {
            for (const point of trail) {
                const px = point.x * CONFIG.gridSize + CONFIG.gridSize / 2;
                const py = point.y * CONFIG.gridSize + CONFIG.gridSize / 2;
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

        // Create grid - border is claimed, inside is unclaimed
        for (let y = 0; y < gridHeight; y++) {
            grid[y] = [];
            dataMap[y] = [];
            for (let x = 0; x < gridWidth; x++) {
                // Border is claimed (2 cells thick)
                const isBorder = x < 2 || x >= gridWidth - 2 || y < 2 || y >= gridHeight - 2;
                grid[y][x] = isBorder ? 1 : 0;
                
                // Assign data regions in a patchwork pattern
                const regionX = Math.floor(x / (gridWidth / 4));
                const regionY = Math.floor(y / (gridHeight / 3));
                const regionIndex = (regionY * 4 + regionX) % DATA_REGIONS.length;
                dataMap[y][x] = regionIndex;
            }
        }

        calculateClaimedPercent();
    }

    function calculateClaimedPercent() {
        let claimed = 0;
        let total = 0;

        for (let y = 2; y < gridHeight - 2; y++) {
            for (let x = 2; x < gridWidth - 2; x++) {
                total++;
                if (grid[y][x] === 1) claimed++;
            }
        }

        gameState.claimedPercent = total > 0 ? (claimed / total) * 100 : 0;
    }

    function isOnClaimedBorder(gx, gy) {
        if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return false;
        if (grid[gy][gx] !== 1) return false;

        // Check if adjacent to unclaimed
        const neighbors = [
            [gx - 1, gy], [gx + 1, gy],
            [gx, gy - 1], [gx, gy + 1]
        ];

        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                if (grid[ny][nx] === 0) return true;
            }
        }

        return false;
    }

    function isOnClaimed(gx, gy) {
        if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return false;
        return grid[gy][gx] === 1;
    }

    function completeTrail() {
        if (gameState.trail.length < 2) {
            clearTrail();
            return;
        }

        // Mark trail as claimed
        for (const point of gameState.trail) {
            if (point.x >= 0 && point.x < gridWidth && point.y >= 0 && point.y < gridHeight) {
                grid[point.y][point.x] = 1;
            }
        }

        // Flood fill to claim the smaller area
        fillEnclosedArea();

        // Calculate score
        const oldPercent = gameState.claimedPercent;
        calculateClaimedPercent();
        const gained = gameState.claimedPercent - oldPercent;
        gameState.score += Math.floor(gained * 10);

        // Show message
        if (gained > 5) {
            const region = DATA_REGIONS[dataMap[gameState.trail[0].y][gameState.trail[0].x]];
            showMessage(`+${gained.toFixed(1)}% ${region.name} RECLAIMED!`);
        }

        clearTrail();

        // Check win
        if (gameState.claimedPercent >= CONFIG.winPercentage) {
            levelComplete();
        }
    }

    function fillEnclosedArea() {
        // Find all unclaimed regions and fill the one without enemies
        const visited = [];
        for (let y = 0; y < gridHeight; y++) {
            visited[y] = [];
            for (let x = 0; x < gridWidth; x++) {
                visited[y][x] = false;
            }
        }

        const regions = [];

        // Find all separate unclaimed regions
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === 0 && !visited[y][x]) {
                    const region = floodFillFind(x, y, visited);
                    regions.push(region);
                }
            }
        }

        // Find which regions contain enemies
        for (const region of regions) {
            let hasEnemy = false;
            for (const enemy of gameState.enemies) {
                const ex = Math.floor(enemy.x / CONFIG.gridSize);
                const ey = Math.floor(enemy.y / CONFIG.gridSize);
                for (const cell of region) {
                    if (cell.x === ex && cell.y === ey) {
                        hasEnemy = true;
                        break;
                    }
                }
                if (hasEnemy) break;
            }
            region.hasEnemy = hasEnemy;
        }

        // Claim all regions without enemies
        for (const region of regions) {
            if (!region.hasEnemy) {
                for (const cell of region) {
                    grid[cell.y][cell.x] = 1;
                }
            }
        }
    }

    function floodFillFind(startX, startY, visited) {
        const region = [];
        const stack = [{ x: startX, y: startY }];

        while (stack.length > 0) {
            const { x, y } = stack.pop();

            if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
            if (visited[y][x] || grid[y][x] !== 0) continue;

            visited[y][x] = true;
            region.push({ x, y });

            stack.push({ x: x - 1, y });
            stack.push({ x: x + 1, y });
            stack.push({ x, y: y - 1 });
            stack.push({ x, y: y + 1 });
        }

        return region;
    }

    function clearTrail() {
        // Clear trail markers from grid
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === 2) grid[y][x] = 0;
            }
        }
        gameState.trail = [];
        gameState.cutting = false;
    }

    function showMessage(msg) {
        gameState.message = msg;
        gameState.messageTimer = 90;
    }

    function loseLife() {
        gameState.lives--;
        clearTrail();
        showMessage('LIFE LOST!');

        // Reset player to safe spot
        gameState.player.x = 2;
        gameState.player.y = gridHeight / 2;
        gameState.cutting = false;

        if (gameState.lives <= 0) {
            gameOver();
        }
    }

    function levelComplete() {
        gameState.running = false;
        gameState.level++;
        showMessage(`LEVEL ${gameState.level - 1} COMPLETE!`);
        
        setTimeout(() => {
            // Reset for next level with more enemies
            initGrid();
            gameState.player = { x: 2, y: Math.floor(gridHeight / 2) };
            gameState.enemies = [];
            for (let i = 0; i < gameState.level; i++) {
                gameState.enemies.push(new Enemy(
                    CONFIG.canvasWidth / 2 + (Math.random() - 0.5) * 100,
                    CONFIG.canvasHeight / 2 + (Math.random() - 0.5) * 100
                ));
            }
            gameState.running = true;
            gameState.animationId = requestAnimationFrame(gameLoop);
        }, 2000);
    }

    function gameOver() {
        gameState.running = false;
        showMessage('IDENTITY COMPROMISED');
    }

    function update() {
        if (!gameState.running || gameState.paused) return;

        const p = gameState.player;
        let dx = 0, dy = 0;

        if (gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']) dy = -1;
        if (gameState.keys['ArrowDown'] || gameState.keys['s'] || gameState.keys['S']) dy = 1;
        if (gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A']) dx = -1;
        if (gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D']) dx = 1;

        // Only allow one direction at a time
        if (dx !== 0 && dy !== 0) {
            if (gameState.direction.x !== 0) dy = 0;
            else dx = 0;
        }

        gameState.direction = { x: dx, y: dy };

        if (dx === 0 && dy === 0) return;

        const speed = gameState.cutting ? CONFIG.cutSpeed : CONFIG.playerSpeed;
        const newX = p.x + dx * speed * 0.1;
        const newY = p.y + dy * speed * 0.1;

        const newGX = Math.floor(newX);
        const newGY = Math.floor(newY);
        const currentGX = Math.floor(p.x);
        const currentGY = Math.floor(p.y);

        // Check if we moved to a new grid cell
        if (newGX !== currentGX || newGY !== currentGY) {
            if (newGX < 0 || newGX >= gridWidth || newGY < 0 || newGY >= gridHeight) {
                return; // Out of bounds
            }

            const targetCell = grid[newGY][newGX];

            if (gameState.cutting) {
                // We're cutting through unclaimed territory
                if (targetCell === 1) {
                    // Reached claimed territory - complete the cut!
                    completeTrail();
                    p.x = newX;
                    p.y = newY;
                } else if (targetCell === 2) {
                    // Hit our own trail - lose life
                    loseLife();
                } else {
                    // Continue cutting
                    grid[newGY][newGX] = 2;
                    gameState.trail.push({ x: newGX, y: newGY });
                    p.x = newX;
                    p.y = newY;
                }
            } else {
                // We're on claimed territory
                if (targetCell === 1) {
                    // Stay on claimed
                    p.x = newX;
                    p.y = newY;
                } else if (gameState.spaceHeld) {
                    // Start cutting!
                    gameState.cutting = true;
                    grid[newGY][newGX] = 2;
                    gameState.trail.push({ x: newGX, y: newGY });
                    p.x = newX;
                    p.y = newY;
                }
                // If not holding space and target is unclaimed, don't move
            }
        } else {
            // Still in same grid cell, just update position
            p.x = newX;
            p.y = newY;
        }

        // Update enemies
        for (const enemy of gameState.enemies) {
            enemy.update();

            // Check if enemy hit trail
            if (gameState.trail.length > 0 && enemy.checkTrailCollision(gameState.trail)) {
                loseLife();
                break;
            }
        }

        // Update message timer
        if (gameState.messageTimer > 0) {
            gameState.messageTimer--;
        }
    }

    function draw() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

        // Draw grid cells
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const cell = grid[y][x];
                const dataType = DATA_REGIONS[dataMap[y][x]];
                const px = x * CONFIG.gridSize;
                const py = y * CONFIG.gridSize;

                if (cell === 1) {
                    // Claimed - show with data color
                    ctx.fillStyle = dataType.color + '40';
                    ctx.fillRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                    
                    // Add subtle grid lines
                    ctx.strokeStyle = dataType.color + '20';
                    ctx.strokeRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                } else if (cell === 0) {
                    // Unclaimed - darker, represents stolen data
                    ctx.fillStyle = dataType.darkColor + '60';
                    ctx.fillRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                } else if (cell === 2) {
                    // Trail
                    ctx.fillStyle = '#33FF00';
                    ctx.fillRect(px, py, CONFIG.gridSize, CONFIG.gridSize);
                }
            }
        }

        // Draw data region labels (only on unclaimed areas)
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const labelPositions = [
            { rx: 0, ry: 0 }, { rx: 1, ry: 0 }, { rx: 2, ry: 0 }, { rx: 3, ry: 0 },
            { rx: 0, ry: 1 }, { rx: 1, ry: 1 }, { rx: 2, ry: 1 }, { rx: 3, ry: 1 },
            { rx: 0, ry: 2 }, { rx: 1, ry: 2 }
        ];

        labelPositions.forEach((pos, i) => {
            if (i >= DATA_REGIONS.length) return;
            const region = DATA_REGIONS[i];
            const cx = (pos.rx + 0.5) * (CONFIG.canvasWidth / 4);
            const cy = (pos.ry + 0.5) * (CONFIG.canvasHeight / 3);
            
            // Check if this area is mostly unclaimed
            const gx = Math.floor(cx / CONFIG.gridSize);
            const gy = Math.floor(cy / CONFIG.gridSize);
            if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx] === 0) {
                ctx.fillStyle = region.color + '80';
                ctx.fillText(region.name, cx, cy);
            }
        });

        // Draw trail with glow
        if (gameState.trail.length > 0) {
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#33FF00';
            ctx.lineWidth = CONFIG.gridSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            const first = gameState.trail[0];
            ctx.moveTo(first.x * CONFIG.gridSize + CONFIG.gridSize / 2, 
                      first.y * CONFIG.gridSize + CONFIG.gridSize / 2);
            
            for (const point of gameState.trail) {
                ctx.lineTo(point.x * CONFIG.gridSize + CONFIG.gridSize / 2,
                          point.y * CONFIG.gridSize + CONFIG.gridSize / 2);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw enemies
        for (const enemy of gameState.enemies) {
            enemy.draw(ctx);
        }

        // Draw player
        const px = gameState.player.x * CONFIG.gridSize + CONFIG.gridSize / 2;
        const py = gameState.player.y * CONFIG.gridSize + CONFIG.gridSize / 2;

        ctx.shadowColor = '#33FF00';
        ctx.shadowBlur = gameState.cutting ? 20 : 10;
        ctx.fillStyle = gameState.cutting ? '#66FF66' : '#33FF00';
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw HUD
        drawHUD();

        // Draw message
        if (gameState.messageTimer > 0) {
            ctx.fillStyle = `rgba(51, 255, 0, ${gameState.messageTimer / 90})`;
            ctx.font = 'bold 16px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(gameState.message, CONFIG.canvasWidth / 2, 50);
        }

        // Draw game over / paused overlay
        if (!gameState.running || gameState.paused) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

            ctx.textAlign = 'center';
            
            if (gameState.lives <= 0) {
                ctx.fillStyle = '#FF3333';
                ctx.font = 'bold 24px JetBrains Mono, monospace';
                ctx.fillText('IDENTITY COMPROMISED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 40);
                
                ctx.fillStyle = '#33FF00';
                ctx.font = '14px JetBrains Mono, monospace';
                ctx.fillText(`Final Score: ${gameState.score}`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2);
                ctx.fillText(`${gameState.claimedPercent.toFixed(1)}% Reclaimed`, CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 25);
                
                ctx.fillStyle = '#666';
                ctx.fillText('Press R to restart', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 60);
            } else if (gameState.paused) {
                ctx.fillStyle = '#33FF00';
                ctx.font = 'bold 20px JetBrains Mono, monospace';
                ctx.fillText('PAUSED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2);
                ctx.font = '12px JetBrains Mono, monospace';
                ctx.fillText('Press P to resume', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 30);
            }
        }
    }

    function drawHUD() {
        // Bottom bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, CONFIG.canvasHeight - 25, CONFIG.canvasWidth, 25);

        // Progress bar
        const barWidth = CONFIG.canvasWidth - 120;
        const barX = 60;
        const barY = CONFIG.canvasHeight - 18;
        
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, 10);
        
        ctx.fillStyle = '#33FF00';
        ctx.fillRect(barX, barY, (gameState.claimedPercent / 100) * barWidth, 10);
        
        // Target line
        const targetX = barX + (CONFIG.winPercentage / 100) * barWidth;
        ctx.strokeStyle = '#FFE66D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetX, barY - 2);
        ctx.lineTo(targetX, barY + 12);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#33FF00';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${gameState.claimedPercent.toFixed(1)}%`, 5, CONFIG.canvasHeight - 10);

        ctx.textAlign = 'right';
        ctx.fillText(`♥${gameState.lives}  L${gameState.level}`, CONFIG.canvasWidth - 5, CONFIG.canvasHeight - 10);

        // Cutting indicator
        if (gameState.cutting) {
            ctx.fillStyle = '#FF6B6B';
            ctx.textAlign = 'center';
            ctx.fillText('CUTTING...', CONFIG.canvasWidth / 2, 20);
        } else if (gameState.spaceHeld) {
            ctx.fillStyle = '#FFE66D';
            ctx.textAlign = 'center';
            ctx.fillText('READY TO CUT', CONFIG.canvasWidth / 2, 20);
        }
    }

    function gameLoop(timestamp) {
        update();
        draw();

        if (gameState.running || gameState.paused) {
            gameState.animationId = requestAnimationFrame(gameLoop);
        }
    }

    function initGame() {
        initGrid();

        gameState.player = { x: 2, y: Math.floor(gridHeight / 2) };
        gameState.enemies = [new Enemy()];
        gameState.trail = [];
        gameState.cutting = false;
        gameState.lives = 3;
        gameState.score = 0;
        gameState.level = 1;
        gameState.running = true;
        gameState.paused = false;
        gameState.message = '';
        gameState.messageTimer = 0;

        if (gameState.animationId) {
            cancelAnimationFrame(gameState.animationId);
        }
        gameState.animationId = requestAnimationFrame(gameLoop);
    }

    function handleKeyDown(e) {
        const modal = document.getElementById('exportModal');
        if (!modal || !modal.classList.contains('active')) return;

        gameState.keys[e.key] = true;

        if (e.key === ' ') {
            gameState.spaceHeld = true;
            e.preventDefault();
        }

        if (e.key === 'p' || e.key === 'P') {
            if (gameState.running) {
                gameState.paused = !gameState.paused;
            }
            e.preventDefault();
        }

        if (e.key === 'r' || e.key === 'R') {
            initGame();
            e.preventDefault();
        }

        if (e.key === 'Escape') {
            window.ExportGame.close();
            e.preventDefault();
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
    }

    function handleKeyUp(e) {
        gameState.keys[e.key] = false;

        if (e.key === ' ') {
            gameState.spaceHeld = false;
        }
    }

    function open() {
        const modal = document.getElementById('exportModal');
        if (!modal) {
            console.error('Export modal not found');
            return;
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        canvas = document.getElementById('exportCanvas');
        if (canvas) {
            ctx = canvas.getContext('2d');
            canvas.width = CONFIG.canvasWidth;
            canvas.height = CONFIG.canvasHeight;
            initGame();
        }

        modal.focus();
    }

    function close() {
        const modal = document.getElementById('exportModal');
        if (modal) {
            modal.classList.remove('active');
        }
        document.body.style.overflow = '';

        gameState.running = false;
        if (gameState.animationId) {
            cancelAnimationFrame(gameState.animationId);
        }

        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) terminalInput.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    window.ExportGame = {
        open,
        close,
        getState: () => gameState
    };

})();