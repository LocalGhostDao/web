// ===========================================
// LOCALGHOST.AI - Terminal & Interactive Logic
// ===========================================

(function() {
    'use strict';

    // ===========================================
    // CONSTANTS & CONFIG
    // ===========================================
    
    const CONFIG = {
        typeSpeed: 35,
        lineDelay: 200,
        gridSize: 20,
        gameSpeed: 100
    };

    const introLines = [
        { text: 'CONNECTING...', delay: 0, type: 'normal' },
        { text: '1993 WAS A WARNING.', delay: 800, type: 'link', href: '/cypherpunk' },
        { text: `${new Date().getFullYear()} IS THE REALITY.`, delay: 600, type: 'link', href: '/manifesto' },
        { text: '', delay: 400, type: 'empty' },
        { text: 'WE CANNOT FIX THE INTERNET.', delay: 600, type: 'warning' },
        { text: 'BUT WE CAN BUILD A ROOM WHERE IT CANNOT SEE YOU.', delay: 800, type: 'normal' },
        { text: '', delay: 400, type: 'empty' },
        { text: 'TYPE "?" FOR COMMANDS', delay: 600, type: 'dim' },
    ];

    const fileTypes = [
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

    const knowledgeLevels = [
        { threshold: 0, level: 'STRANGER', color: '#808080' },
        { threshold: 3, level: 'ACQUAINTANCE', color: '#A0A0A0' },
        { threshold: 6, level: 'FAMILIAR', color: '#33FF00' },
        { threshold: 10, level: 'CONFIDANT', color: '#33FF00' },
        { threshold: 15, level: 'TRUSTED', color: '#4ECDC4' },
        { threshold: 20, level: 'FULLY SYNCED', color: '#FFE66D' },
    ];

    const feedbackMessages = {
        thoughts: [
            "Now I can help you process what's on your mind.",
            "Your reflections help me understand how you think.",
            "I'll remember these thoughts when you need them.",
        ],
        memories: [
            "That sunset in 2019. You were happy.",
            "These moments tell me what matters to you.",
            "I can help you find these memories when you want them.",
        ],
        finances: [
            "Now I can spot patterns in your spending.",
            "I can help you track your goals over time.",
            "This helps me understand your priorities.",
        ],
        health: [
            "I can notice trends you might miss.",
            "This helps me give you better suggestions.",
            "I'll keep track so you don't have to.",
        ],
        movement: [
            "Now I know your favorite places.",
            "I can remind you of places you loved.",
            "This helps me understand your routines.",
        ],
        interests: [
            "Your curiosity tells me what excites you.",
            "Now I can surface things you'd actually care about.",
            "I'm learning what you're drawn to.",
        ],
        relationships: [
            "I can see who matters most to you.",
            "This helps me understand your world.",
            "I'll help you remember the important moments.",
        ],
        schedule: [
            "Now I understand how you spend your time.",
            "I can help you protect what matters.",
            "Your time tells me your real priorities.",
        ],
        taste: [
            "Music says a lot about you. I'm listening.",
            "Now I know what moves you.",
            "I can find things that match your vibe.",
        ],
        ideas: [
            "I'll help you build on these when you're ready.",
            "Your ideas are safe here. I won't forget them.",
            "Now I can connect dots you might miss.",
        ],
    };

    // ===========================================
    // DOM REFERENCES
    // ===========================================
    
    let elements = {};

    function cacheElements() {
        elements = {
            terminalOutput: document.getElementById('terminalOutput'),
            inputLine: document.getElementById('inputLine'),
            terminalInput: document.getElementById('terminalInput'),
            inputCursor: document.getElementById('inputCursor'),
            inputMirror: document.getElementById('inputMirror'),
            heroTerminal: document.getElementById('heroTerminal'),
            matrixCanvas: document.getElementById('matrixCanvas'),
            gameCanvas: document.getElementById('gameCanvas'),
            snakeScore: document.getElementById('snakeScore'),
            knowledgeLevel: document.getElementById('knowledgeLevel'),
            gameFileConsumed: document.getElementById('gameFileConsumed'),
            gameFeedback: document.getElementById('gameFeedback'),
            gameOverText: document.getElementById('gameOverText'),
            gameModal: document.getElementById('gameModal'),
            donateModal: document.getElementById('donateModal'),
            waitlistModal: document.getElementById('waitlistModal'),
            contactModal: document.getElementById('contactModal'),
            copyBtn: document.getElementById('copyBtn'),
            copyEmailBtn: document.getElementById('copyEmailBtn')
        };
    }

    // ===========================================
    // TERMINAL STATE
    // ===========================================
    
    let terminalState = {
        currentLineIndex: 0,
        currentCharIndex: 0,
        isTyping: false,
        introComplete: false,
        currentLineElement: null,
        typingCursor: null
    };

    // ===========================================
    // TERMINAL FUNCTIONS
    // ===========================================
    
    function createLine() {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.innerHTML = '<span class="terminal-prompt">&gt;</span> ';
        elements.terminalOutput.appendChild(line);
        return line;
    }

    function addCursor(element) {
        if (terminalState.typingCursor) terminalState.typingCursor.remove();
        terminalState.typingCursor = document.createElement('span');
        terminalState.typingCursor.className = 'cursor typing';
        element.appendChild(terminalState.typingCursor);
    }

    function removeCursor() {
        if (terminalState.typingCursor) {
            terminalState.typingCursor.remove();
            terminalState.typingCursor = null;
        }
    }

    function typeCharacter() {
        if (terminalState.currentLineIndex >= introLines.length) {
            finishIntro();
            return;
        }

        const lineData = introLines[terminalState.currentLineIndex];

        if (terminalState.currentCharIndex === 0) {
            if (lineData.type === 'empty') {
                const emptyLine = document.createElement('div');
                emptyLine.className = 'terminal-line';
                emptyLine.innerHTML = '<span class="terminal-prompt">&gt;</span>';
                elements.terminalOutput.appendChild(emptyLine);
                terminalState.currentLineIndex++;
                setTimeout(typeCharacter, CONFIG.lineDelay);
                return;
            }

            terminalState.currentLineElement = createLine();
            addCursor(terminalState.currentLineElement);
        }

        if (terminalState.currentCharIndex < lineData.text.length) {
            const char = lineData.text[terminalState.currentCharIndex];
            let textSpan = terminalState.currentLineElement.querySelector('.terminal-text, .terminal-link');

            if (!textSpan) {
                if (lineData.type === 'link') {
                    textSpan = document.createElement('a');
                    textSpan.className = 'terminal-link';
                    textSpan.href = lineData.href;
                } else {
                    textSpan = document.createElement('span');
                    textSpan.className = lineData.type === 'warning' ? 'terminal-warning' :
                        lineData.type === 'dim' ? 'terminal-dim' : 'terminal-text';
                }
                terminalState.currentLineElement.insertBefore(textSpan, terminalState.typingCursor);
            }

            textSpan.textContent += char;
            terminalState.currentCharIndex++;

            const variation = Math.random() * 30 - 15;
            setTimeout(typeCharacter, CONFIG.typeSpeed + variation);
        } else {
            removeCursor();
            terminalState.currentCharIndex = 0;
            terminalState.currentLineIndex++;

            const nextDelay = terminalState.currentLineIndex < introLines.length ?
                introLines[terminalState.currentLineIndex].delay : CONFIG.lineDelay;
            setTimeout(typeCharacter, nextDelay);
        }
    }

    function finishIntro() {
        terminalState.introComplete = true;
        elements.inputLine.style.display = 'flex';
        elements.terminalInput.focus();
    }

    function addOutputLine(text, type = 'normal') {
        const line = document.createElement('div');
        line.className = 'terminal-line';

        const typeClass = type === 'warning' ? 'terminal-warning' :
            type === 'success' ? 'terminal-success' :
            type === 'dim' ? 'terminal-dim' : 'terminal-text';

        line.innerHTML = `<span class="terminal-prompt">&gt;</span> <span class="${typeClass}">${text}</span>`;
        elements.terminalOutput.appendChild(line);
        elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
    }

    function restoreIntroLines() {
        const staticIntro = [
            { text: 'CONNECTING...', type: 'normal' },
            { text: '1993 WAS A WARNING.', type: 'link', href: '/cypherpunk' },
            { text: `${new Date().getFullYear()} IS THE REALITY.`, type: 'link', href: '/manifesto' },
            { text: '', type: 'empty' },
            { text: 'WE CANNOT FIX THE INTERNET.', type: 'warning' },
            { text: 'BUT WE CAN BUILD A ROOM WHERE IT CANNOT SEE YOU.', type: 'normal' },
            { text: '', type: 'empty' },
            { text: 'TYPE "?" FOR COMMANDS', type: 'dim' },
        ];

        staticIntro.forEach(lineData => {
            const line = document.createElement('div');
            line.className = 'terminal-line';

            if (lineData.type === 'empty') {
                line.innerHTML = '<span class="terminal-prompt">&gt;</span>';
            } else if (lineData.type === 'link') {
                line.innerHTML = `<span class="terminal-prompt">&gt;</span> <a href="${lineData.href}" class="terminal-link">${lineData.text}</a>`;
            } else {
                const typeClass = lineData.type === 'warning' ? 'terminal-warning' :
                    lineData.type === 'dim' ? 'terminal-dim' : 'terminal-text';
                line.innerHTML = `<span class="terminal-prompt">&gt;</span> <span class="${typeClass}">${lineData.text}</span>`;
            }
            elements.terminalOutput.appendChild(line);
        });
    }

    function processCommand(cmd) {
        addOutputLine(cmd, 'dim');

        switch (cmd) {
            case 'help':
            case '?':
                addOutputLine('AVAILABLE COMMANDS:', 'success');
                addOutputLine('  help      - Show this message');
                addOutputLine('  about     - Learn about LocalGhost');
                addOutputLine('  manifesto - Read the full manifesto');
                addOutputLine('  faq       - Jump to FAQ section');
                addOutputLine('  escape    - ???');
                addOutputLine('  game      - Play a game');
                addOutputLine('  clear     - Clear terminal');
                addOutputLine('  github    - Open GitHub');
                addOutputLine('  donate    - Support the project');
                break;

            case 'about':
                addOutputLine('LOCALGHOST.AI', 'success');
                addOutputLine('The only cloud is you.');
                addOutputLine('Privacy through code, not promises.');
                break;

            case 'manifesto':
                addOutputLine('LOADING MANIFESTO...', 'success');
                setTimeout(() => {
                    window.location.href = '/manifesto';
                }, 500);
                break;

            case 'faq':
            case 'wtf':
            case 'what':
                addOutputLine('SCROLLING TO FAQ...', 'success');
                setTimeout(() => {
                    document.getElementById('faq').scrollIntoView({ behavior: 'smooth' });
                }, 300);
                break;

            case 'escape':
                addOutputLine('INITIATING ESCAPE SEQUENCE...', 'warning');
                setTimeout(() => {
                    addOutputLine('REALITY.EXE HAS STOPPED RESPONDING', 'warning');
                    triggerMatrixRain();
                }, 500);
                break;

            case 'game':
            case 'snake':
                addOutputLine('LAUNCHING THE_SHADOW.EXE...', 'success');
                setTimeout(openGameModal, 300);
                break;

            case 'clear':
                elements.terminalOutput.innerHTML = '';
                restoreIntroLines();
                break;

            case 'github':
                addOutputLine('OPENING GITHUB...', 'success');
                window.open('https://github.com/orgs/LocalGhostDao/repositories', '_blank');
                break;

            case 'donate':
                addOutputLine('OPENING DONATION PORTAL...', 'success');
                setTimeout(openDonateModal, 300);
                break;

            case 'sudo':
            case 'sudo rm -rf':
            case 'sudo rm -rf /':
                addOutputLine('Nice try.', 'warning');
                break;

            case 'ls':
                addOutputLine('your_data/  your_ai/  your_privacy/  freedom.txt');
                break;

            case 'cat freedom.txt':
                addOutputLine('"The only cloud is you."');
                break;

            case 'whoami':
                addOutputLine('A sovereign individual.', 'success');
                break;

            case 'matrix':
                triggerMatrixRain();
                break;

            case '':
                break;

            default:
                addOutputLine(`Command not found: ${cmd}`, 'warning');
                addOutputLine('Type "help" for available commands.', 'dim');
        }
    }

    // ===========================================
    // BLACK HOLE ESCAPE EFFECT
    // ===========================================
    
    let escapeState = {
        animationId: null,
        particles: [],
        blackHoleTime: 0,
        ctx: null
    };

    class Particle {
        constructor(canvasWidth, canvasHeight, centerX, centerY) {
            const edge = Math.floor(Math.random() * 4);
            switch (edge) {
                case 0: this.x = Math.random() * canvasWidth; this.y = 0; break;
                case 1: this.x = canvasWidth; this.y = Math.random() * canvasHeight; break;
                case 2: this.x = Math.random() * canvasWidth; this.y = canvasHeight; break;
                case 3: this.x = 0; this.y = Math.random() * canvasHeight; break;
            }
            this.centerX = centerX;
            this.centerY = centerY;
            this.size = Math.random() * 3 + 1;
            this.speed = Math.random() * 2 + 1;
            this.angle = Math.atan2(centerY - this.y, centerX - this.x);
            this.char = 'GHOST01░▒▓█'[Math.floor(Math.random() * 11)];
            this.orbit = Math.random() * 0.02 + 0.01;
            this.distance = Math.hypot(this.x - centerX, this.y - centerY);
        }

        update() {
            this.distance -= this.speed;
            this.angle += this.orbit;
            this.x = this.centerX + Math.cos(this.angle) * this.distance;
            this.y = this.centerY + Math.sin(this.angle) * this.distance;
            return this.distance > 10;
        }
    }

    function initBlackHole() {
        elements.matrixCanvas.width = window.innerWidth;
        elements.matrixCanvas.height = window.innerHeight;
        escapeState.particles = [];
        escapeState.blackHoleTime = 0;
        escapeState.ctx = elements.matrixCanvas.getContext('2d');
    }

    function drawBlackHole() {
        const canvas = elements.matrixCanvas;
        const ctx = escapeState.ctx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        ctx.fillStyle = 'rgba(17, 17, 17, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (escapeState.blackHoleTime < 150) {
            for (let i = 0; i < 3; i++) {
                escapeState.particles.push(new Particle(canvas.width, canvas.height, centerX, centerY));
            }
        }

        const holeSize = Math.min(escapeState.blackHoleTime * 0.8, 80);
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, holeSize + 50);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(0.5, 'rgba(17, 17, 17, 0.9)');
        gradient.addColorStop(0.8, 'rgba(51, 255, 0, 0.1)');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(centerX, centerY, holeSize + 50, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, holeSize + 30, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(51, 255, 0, ${0.3 + Math.sin(escapeState.blackHoleTime * 0.1) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '14px JetBrains Mono, monospace';
        escapeState.particles = escapeState.particles.filter(p => {
            const alive = p.update();
            if (alive) {
                const alpha = Math.min(1, p.distance / 200);
                ctx.fillStyle = `rgba(51, 255, 0, ${alpha})`;
                ctx.fillText(p.char, p.x, p.y);
            }
            return alive;
        });

        escapeState.blackHoleTime++;
        escapeState.animationId = requestAnimationFrame(drawBlackHole);
    }

    function triggerMatrixRain() {
        initBlackHole();
        elements.matrixCanvas.classList.add('active');
        drawBlackHole();

        setTimeout(() => {
            cancelAnimationFrame(escapeState.animationId);
            elements.matrixCanvas.classList.remove('active');
            escapeState.ctx.clearRect(0, 0, elements.matrixCanvas.width, elements.matrixCanvas.height);
            addOutputLine('ESCAPE SUCCESSFUL. WELCOME BACK.', 'success');
        }, 3000);
    }

    // ===========================================
    // SNAKE GAME (THE SHADOW)
    // ===========================================
    
    let gameState = {
        ctx: null,
        snake: [],
        food: { x: 0, y: 0, type: null },
        dx: 0,
        dy: 0,
        score: 0,
        filesEaten: [],
        loop: null,
        running: false,
        paused: false,
        tileCount: 0
    };

    function getKnowledgeLevel() {
        for (let i = knowledgeLevels.length - 1; i >= 0; i--) {
            if (gameState.score / 10 >= knowledgeLevels[i].threshold) {
                return knowledgeLevels[i];
            }
        }
        return knowledgeLevels[0];
    }

    function getRandomFeedback(category) {
        const messages = feedbackMessages[category];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    function initGame() {
        gameState.ctx = elements.gameCanvas.getContext('2d');
        gameState.tileCount = elements.gameCanvas.width / CONFIG.gridSize;
        
        gameState.snake = [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 }
        ];
        gameState.dx = 1;
        gameState.dy = 0;
        gameState.score = 0;
        gameState.filesEaten = [];
        
        elements.snakeScore.textContent = '0';
        elements.knowledgeLevel.textContent = 'STRANGER';
        elements.knowledgeLevel.style.color = '#808080';
        elements.gameFileConsumed.textContent = '';
        elements.gameFeedback.textContent = 'Press SPACE or any arrow key to begin...';
        elements.gameOverText.classList.remove('visible');
        
        placeFood();
        gameState.running = true;
        gameState.paused = true;

        if (gameState.loop) clearInterval(gameState.loop);
        gameState.loop = setInterval(updateGame, CONFIG.gameSpeed);
        drawGame();
    }

    function placeFood() {
        gameState.food.x = Math.floor(Math.random() * gameState.tileCount);
        gameState.food.y = Math.floor(Math.random() * gameState.tileCount);
        gameState.food.type = fileTypes[Math.floor(Math.random() * fileTypes.length)];

        for (let segment of gameState.snake) {
            if (segment.x === gameState.food.x && segment.y === gameState.food.y) {
                placeFood();
                return;
            }
        }
    }

    function updateGame() {
        if (!gameState.running || gameState.paused) return;

        const head = { x: gameState.snake[0].x + gameState.dx, y: gameState.snake[0].y + gameState.dy };

        if (head.x < 0 || head.x >= gameState.tileCount || head.y < 0 || head.y >= gameState.tileCount) {
            gameOver();
            return;
        }

        for (let segment of gameState.snake) {
            if (head.x === segment.x && head.y === segment.y) {
                gameOver();
                return;
            }
        }

        gameState.snake.unshift(head);

        if (head.x === gameState.food.x && head.y === gameState.food.y) {
            gameState.score += 10;
            elements.snakeScore.textContent = gameState.score / 10;
            gameState.filesEaten.push(gameState.food.type);

            const knowledge = getKnowledgeLevel();
            elements.knowledgeLevel.textContent = knowledge.level;
            elements.knowledgeLevel.style.color = knowledge.color;

            elements.gameFileConsumed.innerHTML = `<span style="color: ${gameState.food.type.color}">[${gameState.food.type.name}]</span>`;
            elements.gameFeedback.textContent = getRandomFeedback(gameState.food.type.category);

            placeFood();
        } else {
            gameState.snake.pop();
        }

        drawGame();
    }

    function drawGame() {
        const ctx = gameState.ctx;
        const canvas = elements.gameCanvas;
        const gridSize = CONFIG.gridSize;

        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#1a1a1a';
        for (let i = 0; i < gameState.tileCount; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridSize, 0);
            ctx.lineTo(i * gridSize, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * gridSize);
            ctx.lineTo(canvas.width, i * gridSize);
            ctx.stroke();
        }

        gameState.snake.forEach((segment, index) => {
            if (index === 0) {
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#33FF00';
            } else {
                ctx.shadowBlur = 0;
                const alpha = 1 - (index / gameState.snake.length) * 0.6;
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

        ctx.shadowColor = gameState.food.type.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = gameState.food.type.color;
        ctx.fillRect(
            gameState.food.x * gridSize + 2,
            gameState.food.y * gridSize + 2,
            gridSize - 4,
            gridSize - 4
        );
        ctx.shadowBlur = 0;
    }

    function gameOver() {
        gameState.running = false;
        clearInterval(gameState.loop);
        elements.gameOverText.classList.add('visible');
        elements.gameFileConsumed.textContent = '';

        const knowledge = getKnowledgeLevel();
        const fileCount = gameState.score / 10;
        
        if (knowledge.level === 'FULLY SYNCED') {
            elements.gameFeedback.textContent = `${fileCount} files synced. I understand you completely now.`;
        } else if (fileCount >= 10) {
            elements.gameFeedback.textContent = `${fileCount} files synced. We're getting to know each other.`;
        } else if (fileCount >= 5) {
            elements.gameFeedback.textContent = `${fileCount} files synced. A good start.`;
        } else {
            elements.gameFeedback.textContent = `${fileCount} files synced. There's so much more to learn.`;
        }
    }

    function handleGameInput(e) {
        if (!elements.gameModal.classList.contains('active')) return;

        switch (e.key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                if (gameState.dy !== 1) { gameState.dx = 0; gameState.dy = -1; }
                if (gameState.paused) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowdown':
            case 's':
                if (gameState.dy !== -1) { gameState.dx = 0; gameState.dy = 1; }
                if (gameState.paused) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowleft':
            case 'a':
                if (gameState.dx !== 1) { gameState.dx = -1; gameState.dy = 0; }
                if (gameState.paused) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowright':
            case 'd':
                if (gameState.dx !== -1) { gameState.dx = 1; gameState.dy = 0; }
                if (gameState.paused) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case ' ':
                gameState.paused = !gameState.paused;
                elements.gameFeedback.textContent = gameState.paused ? 'Paused...' : 'Syncing your data...';
                e.preventDefault();
                break;
            case 'r':
                initGame();
                e.preventDefault();
                break;
        }
    }

    // ===========================================
    // MODAL FUNCTIONS
    // ===========================================
    
    function openDonateModal() {
        elements.donateModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDonateModal() {
        elements.donateModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openWaitlistModal() {
        elements.waitlistModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeWaitlistModal() {
        elements.waitlistModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openContactModal() {
        elements.contactModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeContactModal() {
        elements.contactModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openGameModal() {
        elements.gameModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        initGame();
    }

    function closeGameModal() {
        elements.gameModal.classList.remove('active');
        document.body.style.overflow = '';
        gameState.running = false;
        if (gameState.loop) clearInterval(gameState.loop);
    }

    function closeAllModals() {
        closeDonateModal();
        closeWaitlistModal();
        closeContactModal();
    }

    // ===========================================
    // UTILITY FUNCTIONS
    // ===========================================
    
    function copyAddress() {
        const address = 'zerocool.eth\n0xc72C85BDd6584324619176618E86E5e3196C6b47';
        navigator.clipboard.writeText(address).then(() => {
            const btn = elements.copyBtn;
            btn.textContent = '[ COPIED ]';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = '[ COPY ADDRESS ]';
                btn.classList.remove('copied');
            }, 2000);
        });
    }

    function copyEmail() {
        const email = 'info@localghost.ai';
        navigator.clipboard.writeText(email).then(() => {
            const btn = elements.copyEmailBtn;
            btn.textContent = '[ COPIED ]';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = '[ COPY EMAIL ]';
                btn.classList.remove('copied');
            }, 2000);
        });
    }

    function addCalendarReminder() {
        const event = {
            title: 'Check LocalGhost.ai',
            description: 'See if the Sovereign Box has launched. https://localghost.ai',
            start: '20250501T090000',
            end: '20250501T093000'
        };

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//LocalGhost//NONSGML v1.0//EN',
            'BEGIN:VEVENT',
            'DTSTART:' + event.start,
            'DTEND:' + event.end,
            'SUMMARY:' + event.title,
            'DESCRIPTION:' + event.description,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'localghost-reminder.ics';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // ===========================================
    // TERMINAL BUTTON ACTIONS
    // ===========================================
    
    function terminalMinimize() {
        elements.heroTerminal.style.transform = 'scale(0.95)';
        setTimeout(() => {
            elements.heroTerminal.style.transform = '';
        }, 200);
    }

    function terminalMaximize() {
        elements.heroTerminal.classList.toggle('fullscreen');
    }

    // ===========================================
    // EVENT LISTENERS
    // ===========================================
    
    function setupEventListeners() {
        // Terminal input
        elements.terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const command = elements.terminalInput.value.trim().toLowerCase();
                processCommand(command);
                elements.terminalInput.value = '';
                elements.inputMirror.textContent = '';
            }
        });

        elements.terminalInput.addEventListener('input', () => {
            elements.inputMirror.textContent = elements.terminalInput.value;
        });

        elements.terminalInput.addEventListener('focus', () => {
            elements.inputCursor.style.opacity = '1';
            elements.inputCursor.style.animation = 'blink 1.2s step-end infinite';
        });

        elements.terminalInput.addEventListener('blur', () => {
            elements.inputCursor.style.animation = 'none';
            elements.inputCursor.style.opacity = '0.5';
        });

        elements.heroTerminal.addEventListener('click', () => {
            if (terminalState.introComplete) elements.terminalInput.focus();
        });

        elements.inputLine.addEventListener('click', () => {
            elements.terminalInput.focus();
        });

        // Game input
        document.addEventListener('keydown', handleGameInput);

        // Modal overlay clicks
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                    if (overlay.id === 'gameModal') {
                        gameState.running = false;
                        if (gameState.loop) clearInterval(gameState.loop);
                    }
                }
            });
        });

        // Escape key for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.gameModal.classList.contains('active')) {
                    closeGameModal();
                } else {
                    closeAllModals();
                }
            }
        });

        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Window resize for matrix canvas
        window.addEventListener('resize', () => {
            if (elements.matrixCanvas.classList.contains('active')) {
                elements.matrixCanvas.width = window.innerWidth;
                elements.matrixCanvas.height = window.innerHeight;
            }
        });

        // Konami code easter egg
        let konamiCode = [];
        const secretCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

        document.addEventListener('keydown', (e) => {
            if (elements.gameModal.classList.contains('active')) return;

            konamiCode.push(e.keyCode);
            konamiCode = konamiCode.slice(-10);

            if (konamiCode.join(',') === secretCode.join(',')) {
                triggerMatrixRain();
            }
        });
    }

    // ===========================================
    // INITIALIZATION
    // ===========================================
    
    function init() {
        cacheElements();
        setupEventListeners();

        document.body.style.opacity = '0';
        setTimeout(() => {
            document.body.style.transition = 'opacity 0.5s ease';
            document.body.style.opacity = '1';
            setTimeout(typeCharacter, 500);
        }, 100);
    }

    // ===========================================
    // PUBLIC API (exposed to window for onclick handlers)
    // ===========================================
    
    window.LocalGhost = {
        triggerMatrixRain,
        terminalMinimize,
        terminalMaximize,
        openDonateModal,
        closeDonateModal,
        openWaitlistModal,
        closeWaitlistModal,
        openContactModal,
        closeContactModal,
        openGameModal,
        closeGameModal,
        copyAddress,
        copyEmail,
        addCalendarReminder
    };

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();