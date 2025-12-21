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
        gameSpeed: 100,
        highScoreThreshold: 4,
        maxFireScore: 60  // Score at which fire is at maximum intensity
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
            copyEmailBtn: document.getElementById('copyEmailBtn'),
            playerNameInput: document.getElementById('playerNameInput'),
            highScoresList: document.getElementById('highScoresList'),
            highScoreNotice: document.getElementById('highScoreNotice'),
            gameLeaderboard: document.getElementById('gameLeaderboard'),
            gameModalContent: document.querySelector('#gameModal .modal')
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
        typingCursor: null,
        typingTimeout: null
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

        // Show skip hint on first character
        if (terminalState.currentLineIndex === 0 && terminalState.currentCharIndex === 0) {
            showSkipHint();
        }

        const lineData = introLines[terminalState.currentLineIndex];

        if (terminalState.currentCharIndex === 0) {
            if (lineData.type === 'empty') {
                const emptyLine = document.createElement('div');
                emptyLine.className = 'terminal-line';
                emptyLine.innerHTML = '<span class="terminal-prompt">&gt;</span>';
                elements.terminalOutput.appendChild(emptyLine);
                terminalState.currentLineIndex++;
                terminalState.typingTimeout = setTimeout(typeCharacter, CONFIG.lineDelay);
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
            terminalState.typingTimeout = setTimeout(typeCharacter, CONFIG.typeSpeed + variation);
        } else {
            removeCursor();
            terminalState.currentCharIndex = 0;
            terminalState.currentLineIndex++;

            const nextDelay = terminalState.currentLineIndex < introLines.length ?
                introLines[terminalState.currentLineIndex].delay : CONFIG.lineDelay;
            terminalState.typingTimeout = setTimeout(typeCharacter, nextDelay);
        }
    }

    function finishIntro() {
        terminalState.introComplete = true;
        elements.inputLine.style.display = 'flex';
        elements.terminalInput.focus();
        // Remove skip hint if present
        const skipHint = document.getElementById('skipHint');
        if (skipHint) skipHint.remove();
    }

    function skipIntro() {
        if (terminalState.introComplete) return;
        
        // Stop any pending typing
        if (terminalState.typingTimeout) {
            clearTimeout(terminalState.typingTimeout);
            terminalState.typingTimeout = null;
        }
        removeCursor();
        
        // Clear current output and show all lines immediately
        elements.terminalOutput.innerHTML = '';
        restoreIntroLines();
        
        // Complete the intro
        finishIntro();
    }

    function showSkipHint() {
        const hint = document.createElement('div');
        hint.id = 'skipHint';
        hint.className = 'skip-hint';
        hint.innerHTML = '<span class="skip-key">ESC</span> SKIP';
        elements.terminalOutput.parentNode.appendChild(hint);
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
                addOutputLine('  scores    - View leaderboard');
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

            case 'scores':
            case 'leaderboard':
                loadHighScores();
                if (gameState.highScores.length === 0) {
                    addOutputLine('NO SHADOW RECORDS YET.', 'dim');
                    addOutputLine('Play "game" and consume over 4 files to qualify.', 'dim');
                } else {
                    addOutputLine('THE SHADOW LEADERBOARD:', 'success');
                    gameState.highScores.forEach((entry, i) => {
                        addOutputLine(`  ${String(i + 1).padStart(2, '0')}. ${entry.name.padEnd(12)} ${String(entry.score).padStart(4)} files  ${entry.date}`);
                    });
                }
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
    // CORPORATE GREED SNAKE DEATH ANIMATION
    // ===========================================
    
    let escapeState = {
        animationId: null,
        ctx: null,
        snake: [],
        phase: 'growing', // growing, eating, dying, exploding, done
        frame: 0,
        deathFrame: 0,
        explosionParticles: [],
        glitchLines: [],
        messages: [
            'INITIALIZING CORPORATE_GREED.EXE...',
            'CONSUMING MARKET SHARE...',
            'MONETIZING USERS...',
            'HARVESTING DATA...',
            'MAXIMIZING ENGAGEMENT...',
            'EXTRACTING VALUE...',
            'WARNING: TAIL DETECTED...',
            'EATING ITSELF...',
            'CRITICAL ERROR: GREED_OVERFLOW',
            'SYSTEM FAILURE IMMINENT',
            'GAME OVER, MAN. GAME OVER.'
        ],
        currentMessage: 0,
        messageTimer: 0,
        screenShake: 0
    };

    // More green-focused colors with terminal aesthetic
    const corporateColors = ['#33FF00', '#00FF66', '#66FF33', '#00CC44', '#44FF88', '#FFE66D', '#FF6B6B'];
    const greedSymbols = ['$', '€', '£', '¥', '₿', '%', '∞', '™', '©', '®'];

    class ExplosionParticle {
        constructor(x, y, color, isText = false) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.vx = (Math.random() - 0.5) * 20;
            this.vy = (Math.random() - 0.5) * 20 - 5;
            this.life = 1;
            this.decay = Math.random() * 0.015 + 0.008;
            this.size = Math.random() * 30 + 15;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.4;
            this.symbol = greedSymbols[Math.floor(Math.random() * greedSymbols.length)];
            this.isText = isText;
            this.text = isText ? ['GREED', 'PROFIT', 'GROWTH', 'SYNERGY', 'LEVERAGE'][Math.floor(Math.random() * 5)] : null;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.4; // gravity
            this.vx *= 0.99; // air resistance
            this.life -= this.decay;
            this.rotation += this.rotationSpeed;
            return this.life > 0;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.globalAlpha = this.life;
            
            if (this.isText) {
                ctx.font = `bold ${this.size * 0.6}px JetBrains Mono, monospace`;
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.fillText(this.text, -this.size, 0);
            } else {
                ctx.font = `${this.size}px Arial`;
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 15;
                ctx.fillText(this.symbol, -this.size/2, this.size/2);
            }
            ctx.restore();
        }
    }

    class GlitchLine {
        constructor(canvasHeight) {
            this.y = Math.random() * canvasHeight;
            this.height = Math.random() * 5 + 2;
            this.offset = (Math.random() - 0.5) * 30;
            this.life = Math.random() * 10 + 5;
        }

        update() {
            this.life--;
            return this.life > 0;
        }

        draw(ctx, canvas) {
            ctx.save();
            ctx.fillStyle = `rgba(51, 255, 0, ${this.life / 15})`;
            ctx.fillRect(0, this.y, canvas.width, this.height);
            ctx.restore();
        }
    }

    function initEscapeAnimation() {
        elements.matrixCanvas.width = window.innerWidth;
        elements.matrixCanvas.height = window.innerHeight;
        escapeState.ctx = elements.matrixCanvas.getContext('2d');
        escapeState.phase = 'growing';
        escapeState.frame = 0;
        escapeState.deathFrame = 0;
        escapeState.snake = [];
        escapeState.explosionParticles = [];
        escapeState.glitchLines = [];
        escapeState.currentMessage = 0;
        escapeState.messageTimer = 0;
        escapeState.screenShake = 0;

        // Initialize the corporate greed snake as a circle
        const centerX = elements.matrixCanvas.width / 2;
        const centerY = elements.matrixCanvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.35;
        
        for (let i = 0; i < 50; i++) {
            const angle = (i / 50) * Math.PI * 2;
            escapeState.snake.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                size: 30 - (i * 0.3),
                color: corporateColors[i % corporateColors.length],
                symbol: greedSymbols[i % greedSymbols.length],
                alive: true,
                angle: angle
            });
        }
    }

    function drawEscapeAnimation() {
        const canvas = elements.matrixCanvas;
        const ctx = escapeState.ctx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (escapeState.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * escapeState.screenShake;
            shakeY = (Math.random() - 0.5) * escapeState.screenShake;
            escapeState.screenShake *= 0.95;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Clear with CRT-style fade
        ctx.fillStyle = 'rgba(17, 17, 17, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw scanlines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (let y = 0; y < canvas.height; y += 4) {
            ctx.fillRect(0, y, canvas.width, 2);
        }

        // Random glitch lines
        if (Math.random() < 0.1 && escapeState.phase !== 'done') {
            escapeState.glitchLines.push(new GlitchLine(canvas.height));
        }
        escapeState.glitchLines = escapeState.glitchLines.filter(line => {
            line.draw(ctx, canvas);
            return line.update();
        });

        escapeState.frame++;
        escapeState.messageTimer++;

        // Update message
        const messageInterval = escapeState.phase === 'exploding' ? 20 : 35;
        if (escapeState.messageTimer > messageInterval && escapeState.currentMessage < escapeState.messages.length - 1) {
            escapeState.messageTimer = 0;
            escapeState.currentMessage++;
        }

        // Draw current message with terminal effect
        const msg = escapeState.messages[escapeState.currentMessage];
        ctx.textAlign = 'center';
        
        if (escapeState.phase === 'exploding' || escapeState.phase === 'done') {
            // Glitchy game over text
            ctx.font = 'bold 32px JetBrains Mono, monospace';
            const glitchOffset = escapeState.phase === 'done' ? 0 : (Math.random() - 0.5) * 15;
            
            // Shadow layers for depth
            ctx.fillStyle = '#003300';
            ctx.fillText(msg, centerX + 3 + glitchOffset, centerY - 180 + 3);
            
            ctx.fillStyle = escapeState.frame % 3 === 0 ? '#FF0000' : '#33FF00';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 20;
            ctx.fillText(msg, centerX + glitchOffset, centerY - 180);
            ctx.shadowBlur = 0;
            
            // Retro blink text
            if (escapeState.frame % 40 < 25) {
                ctx.font = '18px JetBrains Mono, monospace';
                ctx.fillStyle = '#33FF00';
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 15;
                ctx.fillText('[ CORPORATE GREED ELIMINATED ]', centerX, centerY + 180);
                ctx.font = '14px JetBrains Mono, monospace';
                ctx.fillStyle = '#00AA00';
                ctx.fillText('SOVEREIGNTY RESTORED', centerX, centerY + 210);
            }
        } else {
            ctx.font = 'bold 24px JetBrains Mono, monospace';
            ctx.fillStyle = '#33FF00';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 15;
            ctx.fillText('> ' + msg, centerX, centerY - 180);
            ctx.shadowBlur = 0;
            
            // Typing cursor effect
            if (escapeState.frame % 20 < 10) {
                ctx.fillRect(centerX + ctx.measureText('> ' + msg).width / 2 + 5, centerY - 195, 12, 24);
            }
        }

        // Phase logic
        switch (escapeState.phase) {
            case 'growing':
                // Snake rotates and pulses ominously
                const growSpeed = 0.025;
                escapeState.snake.forEach((seg, i) => {
                    const baseAngle = (i / escapeState.snake.length) * Math.PI * 2;
                    seg.angle = baseAngle + escapeState.frame * growSpeed;
                    const radius = Math.min(centerX, centerY) * 0.35;
                    const pulse = Math.sin(escapeState.frame * 0.08 + i * 0.15) * 15;
                    const breathe = Math.sin(escapeState.frame * 0.05) * 5;
                    seg.x = centerX + Math.cos(seg.angle) * (radius + pulse);
                    seg.y = centerY + Math.sin(seg.angle) * (radius + pulse + breathe);
                    seg.size = 30 - (i * 0.3) + Math.sin(escapeState.frame * 0.1 + i) * 3;
                });
                
                if (escapeState.frame > 100) {
                    escapeState.phase = 'eating';
                    escapeState.frame = 0;
                    escapeState.currentMessage = 5;
                }
                break;

            case 'eating':
                // Snake eats its own tail with increasing frenzy
                const aliveSegments = escapeState.snake.filter(s => s.alive);
                const eatSpeed = 0.04 + (1 - aliveSegments.length / escapeState.snake.length) * 0.03;
                
                aliveSegments.forEach((seg, i) => {
                    const baseAngle = (i / aliveSegments.length) * Math.PI * 2;
                    seg.angle = baseAngle + escapeState.frame * eatSpeed;
                    const shrinkRadius = Math.min(centerX, centerY) * 0.35 * (aliveSegments.length / escapeState.snake.length);
                    const wobble = Math.sin(escapeState.frame * 0.25 + i * 0.4) * (8 + (50 - aliveSegments.length) * 0.3);
                    seg.x = centerX + Math.cos(seg.angle) * (shrinkRadius + wobble);
                    seg.y = centerY + Math.sin(seg.angle) * (shrinkRadius + wobble);
                });

                // Eat segments with increasing speed
                const eatRate = Math.max(3, 8 - Math.floor((50 - aliveSegments.length) / 8));
                if (escapeState.frame % eatRate === 0 && aliveSegments.length > 5) {
                    const victim = aliveSegments[aliveSegments.length - 1];
                    victim.alive = false;
                    escapeState.screenShake = Math.max(escapeState.screenShake, 5 + (50 - aliveSegments.length) * 0.3);
                    
                    // Spawn explosion with corporate buzzwords
                    for (let i = 0; i < 8; i++) {
                        escapeState.explosionParticles.push(
                            new ExplosionParticle(victim.x, victim.y, victim.color)
                        );
                    }
                    if (Math.random() < 0.3) {
                        escapeState.explosionParticles.push(
                            new ExplosionParticle(victim.x, victim.y, '#33FF00', true)
                        );
                    }
                }

                if (aliveSegments.length <= 5) {
                    escapeState.phase = 'dying';
                    escapeState.frame = 0;
                    escapeState.currentMessage = 8;
                    escapeState.screenShake = 20;
                }
                break;

            case 'dying':
                // Remaining segments convulse violently
                const remaining = escapeState.snake.filter(s => s.alive);
                remaining.forEach((seg, i) => {
                    seg.x += (Math.random() - 0.5) * 30;
                    seg.y += (Math.random() - 0.5) * 30;
                    seg.size *= 1.04;
                    seg.color = escapeState.frame % 4 < 2 ? '#33FF00' : '#FF0000';
                });

                escapeState.screenShake = 25;
                escapeState.deathFrame++;
                
                // Spawn warning particles
                if (escapeState.deathFrame % 3 === 0) {
                    escapeState.explosionParticles.push(
                        new ExplosionParticle(
                            centerX + (Math.random() - 0.5) * 200,
                            centerY + (Math.random() - 0.5) * 200,
                            '#33FF00',
                            true
                        )
                    );
                }
                
                if (escapeState.deathFrame > 40) {
                    escapeState.phase = 'exploding';
                    escapeState.currentMessage = 10;
                    escapeState.screenShake = 50;
                    
                    // MASSIVE explosion
                    remaining.forEach(seg => {
                        for (let i = 0; i < 30; i++) {
                            escapeState.explosionParticles.push(
                                new ExplosionParticle(seg.x, seg.y, corporateColors[i % corporateColors.length])
                            );
                        }
                        seg.alive = false;
                    });

                    // Extra center explosion with text
                    for (let i = 0; i < 80; i++) {
                        const isText = i < 15;
                        escapeState.explosionParticles.push(
                            new ExplosionParticle(centerX, centerY, corporateColors[i % corporateColors.length], isText)
                        );
                    }
                    
                    // Ring explosion
                    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
                        const ringX = centerX + Math.cos(angle) * 100;
                        const ringY = centerY + Math.sin(angle) * 100;
                        escapeState.explosionParticles.push(
                            new ExplosionParticle(ringX, ringY, '#33FF00')
                        );
                    }
                }
                break;

            case 'exploding':
                escapeState.deathFrame++;
                
                // Add more glitch during explosion
                if (Math.random() < 0.3) {
                    escapeState.glitchLines.push(new GlitchLine(canvas.height));
                }
                
                if (escapeState.deathFrame > 180 && escapeState.explosionParticles.length < 20) {
                    escapeState.phase = 'done';
                }
                break;
        }

        // Draw connection lines between alive segments (the snake body)
        const aliveSegs = escapeState.snake.filter(s => s.alive);
        if (aliveSegs.length > 1) {
            ctx.strokeStyle = 'rgba(51, 255, 0, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(aliveSegs[0].x, aliveSegs[0].y);
            aliveSegs.forEach(seg => ctx.lineTo(seg.x, seg.y));
            ctx.closePath();
            ctx.stroke();
        }

        // Draw snake segments
        aliveSegs.forEach((seg, i) => {
            ctx.save();
            
            // Glow effect - more intense green
            ctx.shadowColor = seg.color;
            ctx.shadowBlur = 25;
            
            // Body
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, seg.size, 0, Math.PI * 2);
            ctx.fillStyle = seg.color;
            ctx.fill();
            
            // Inner glow
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, seg.size * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
            
            // Symbol
            ctx.shadowBlur = 0;
            ctx.font = `bold ${seg.size}px Arial`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seg.symbol, seg.x, seg.y);
            
            // Head details (first segment)
            if (i === 0) {
                const eyeOffset = seg.size * 0.35;
                
                // Evil red eyes
                ctx.fillStyle = '#FF0000';
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(seg.x - eyeOffset, seg.y - eyeOffset, 6, 0, Math.PI * 2);
                ctx.arc(seg.x + eyeOffset, seg.y - eyeOffset, 6, 0, Math.PI * 2);
                ctx.fill();
                
                // Angry eyebrows
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(seg.x - eyeOffset - 10, seg.y - eyeOffset - 12);
                ctx.lineTo(seg.x - eyeOffset + 10, seg.y - eyeOffset - 4);
                ctx.moveTo(seg.x + eyeOffset + 10, seg.y - eyeOffset - 12);
                ctx.lineTo(seg.x + eyeOffset - 10, seg.y - eyeOffset - 4);
                ctx.stroke();

                // Pupils tracking tail
                ctx.fillStyle = '#000';
                const tail = aliveSegs[aliveSegs.length - 1];
                if (tail && tail !== seg) {
                    const lookAngle = Math.atan2(tail.y - seg.y, tail.x - seg.x);
                    ctx.beginPath();
                    ctx.arc(seg.x - eyeOffset + Math.cos(lookAngle) * 3, seg.y - eyeOffset + Math.sin(lookAngle) * 3, 3, 0, Math.PI * 2);
                    ctx.arc(seg.x + eyeOffset + Math.cos(lookAngle) * 3, seg.y - eyeOffset + Math.sin(lookAngle) * 3, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Drooling mouth
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(seg.x, seg.y + seg.size * 0.3, seg.size * 0.4, 0.2, Math.PI - 0.2);
                ctx.stroke();
            }
            
            ctx.restore();
        });

        // Draw and update explosion particles
        escapeState.explosionParticles = escapeState.explosionParticles.filter(p => {
            p.draw(ctx);
            return p.update();
        });

        ctx.restore(); // End screen shake

        // Continue animation or finish
        if (escapeState.phase === 'done' && escapeState.explosionParticles.length === 0) {
            setTimeout(() => {
                cancelAnimationFrame(escapeState.animationId);
                elements.matrixCanvas.classList.remove('active');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                addOutputLine('', 'normal');
                addOutputLine('████████████████████████████████████████', 'success');
                addOutputLine('  CORPORATE GREED: [TERMINATED]', 'success');
                addOutputLine('  SOVEREIGNTY: [RESTORED]', 'success');
                addOutputLine('  STATUS: WELCOME BACK, GHOST.', 'success');
                addOutputLine('████████████████████████████████████████', 'success');
            }, 800);
            return;
        }

        escapeState.animationId = requestAnimationFrame(drawEscapeAnimation);
    }

    function triggerMatrixRain() {
        initEscapeAnimation();
        elements.matrixCanvas.classList.add('active');
        drawEscapeAnimation();
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
        pausedByLeaderboard: false,
        tileCount: 0,
        playerName: 'ROX',
        highScores: [],
        leaderboardVisible: false
    };

    function getKnowledgeLevel() {
        for (let i = knowledgeLevels.length - 1; i >= 0; i--) {
            if (gameState.score >= knowledgeLevels[i].threshold) {
                return knowledgeLevels[i];
            }
        }
        return knowledgeLevels[0];
    }

    function getRandomFeedback(category) {
        const messages = feedbackMessages[category];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    function loadHighScores() {
        try {
            const saved = localStorage.getItem('localghost_shadow_scores');
            gameState.highScores = saved ? JSON.parse(saved) : [];
        } catch (e) {
            gameState.highScores = [];
        }
    }

    function saveHighScore() {
        const entry = {
            name: (gameState.playerName || 'ROX').substring(0, 12).toUpperCase(),
            score: gameState.score,
            date: new Date().toISOString().split('T')[0]
        };
        gameState.highScores.push(entry);
        gameState.highScores.sort((a, b) => b.score - a.score);
        gameState.highScores = gameState.highScores.slice(0, 5);
        localStorage.setItem('localghost_shadow_scores', JSON.stringify(gameState.highScores));
        renderHighScores();
    }

    function renderHighScores() {
        if (!elements.highScoresList) return;
        
        if (gameState.highScores.length === 0) {
            elements.highScoresList.innerHTML = '<div class="no-scores">NO RECORDS YET</div>';
            return;
        }
        
        elements.highScoresList.innerHTML = gameState.highScores
            .slice(0, 5)
            .map((s, i) => {
                const name = s.name.padEnd(12, '.');
                const score = String(s.score).padStart(3);
                return `<div class="score-row"><span class="score-rank">${String(i + 1).padStart(2, '0')}.</span> <span class="score-name">${name}</span> <span class="score-pts">${score}</span> <span class="score-date">${s.date}</span></div>`;
            })
            .join('');
    }

    function updateFireEffect() {
        if (!elements.gameModalContent) return;
        
        const score = gameState.score;
        const maxScore = CONFIG.maxFireScore;
        
        // Calculate intensity (0 to 1)
        // Before 10: barely noticeable (0 to 0.2)
        // 10 to 60: gradual increase (0.2 to 1)
        let intensity;
        if (score < 10) {
            intensity = (score / 10) * 0.2;
        } else {
            intensity = 0.2 + ((Math.min(score, maxScore) - 10) / (maxScore - 10)) * 0.8;
        }
        
        // More aggressive glow sizes
        const glowSize1 = Math.floor(8 + intensity * 35);
        const glowSize2 = Math.floor(15 + intensity * 60);
        const glowSize3 = Math.floor(25 + intensity * 90);
        const glowSize4 = Math.floor(40 + intensity * 120);
        
        // Higher opacity for more visible fire
        const opacity1 = (0.3 + intensity * 0.7).toFixed(2);
        const opacity2 = (0.2 + intensity * 0.5).toFixed(2);
        const opacity3 = (0.15 + intensity * 0.4).toFixed(2);
        const opacity4 = (0.1 + intensity * 0.3).toFixed(2);
        
        // Create layered green fire glow - more layers, more dramatic
        const shadows = [
            // Inner glow
            `inset 0 0 ${Math.floor(5 + intensity * 20)}px rgba(51, 255, 0, ${(intensity * 0.4).toFixed(2)})`,
            // Core fire layers
            `0 0 ${glowSize1}px rgba(51, 255, 0, ${opacity1})`,
            `0 0 ${glowSize2}px rgba(0, 255, 80, ${opacity2})`,
            `0 0 ${glowSize3}px rgba(50, 255, 50, ${opacity3})`,
            `0 0 ${glowSize4}px rgba(0, 200, 50, ${opacity4})`
        ];
        
        // Add rising flame particles at higher intensities
        if (intensity > 0.15) {
            const flameCount = Math.floor(4 + intensity * 16);
            for (let i = 0; i < flameCount; i++) {
                const angle = (i / flameCount) * 360;
                const distance = glowSize2 * 0.8 + Math.random() * 20 * intensity;
                const size = 5 + Math.random() * 12 * intensity;
                const xOff = Math.cos(angle * Math.PI / 180) * distance;
                // Flames rise upward more
                const yOff = Math.sin(angle * Math.PI / 180) * distance - (Math.random() * 15 * intensity);
                const flameOpacity = (0.4 + Math.random() * 0.5) * intensity;
                shadows.push(`${xOff.toFixed(1)}px ${yOff.toFixed(1)}px ${size.toFixed(1)}px rgba(51, 255, 0, ${flameOpacity.toFixed(2)})`);
            }
        }
        
        // Extra bright spots at very high intensity
        if (intensity > 0.6) {
            const sparkCount = Math.floor((intensity - 0.6) * 15);
            for (let i = 0; i < sparkCount; i++) {
                const angle = Math.random() * 360;
                const distance = 30 + Math.random() * glowSize3;
                const xOff = Math.cos(angle * Math.PI / 180) * distance;
                const yOff = Math.sin(angle * Math.PI / 180) * distance - Math.random() * 30;
                shadows.push(`${xOff.toFixed(1)}px ${yOff.toFixed(1)}px ${2 + Math.random() * 4}px rgba(150, 255, 100, ${(0.6 + Math.random() * 0.4).toFixed(2)})`);
            }
        }
        
        elements.gameModalContent.style.boxShadow = shadows.join(', ');
        
        // Add fire animation class at higher intensities
        if (intensity > 0.5) {
            elements.gameModalContent.classList.add('fire-intense');
            elements.gameModalContent.classList.remove('fire-medium');
        } else if (intensity > 0.2) {
            elements.gameModalContent.classList.add('fire-medium');
            elements.gameModalContent.classList.remove('fire-intense');
        } else {
            elements.gameModalContent.classList.remove('fire-medium', 'fire-intense');
        }
    }

    function resetFireEffect() {
        if (!elements.gameModalContent) return;
        elements.gameModalContent.style.boxShadow = '';
        elements.gameModalContent.classList.remove('fire-medium', 'fire-intense');
    }

    function toggleLeaderboard() {
        if (!elements.gameLeaderboard) return;
        
        gameState.leaderboardVisible = !gameState.leaderboardVisible;
        
        if (gameState.leaderboardVisible) {
            // Show overlay and pause game
            elements.gameLeaderboard.classList.add('visible');
            if (gameState.running && !gameState.paused) {
                gameState.paused = true;
                gameState.pausedByLeaderboard = true;
            }
        } else {
            // Hide overlay and resume if we paused it
            elements.gameLeaderboard.classList.remove('visible');
            if (gameState.pausedByLeaderboard && gameState.running) {
                gameState.paused = false;
                gameState.pausedByLeaderboard = false;
                elements.gameFeedback.textContent = 'Syncing your data...';
            }
        }
    }

    function initGame() {
        loadHighScores();
        renderHighScores();
        
        // Load saved name
        const savedName = localStorage.getItem('localghost_player_name');
        if (savedName) {
            gameState.playerName = savedName;
            if (elements.playerNameInput) elements.playerNameInput.value = savedName;
        } else {
            gameState.playerName = 'ROX';
            if (elements.playerNameInput) elements.playerNameInput.value = 'ROX';
        }
        
        if (elements.highScoreNotice) {
            elements.highScoreNotice.style.display = 'none';
        }

        // Reset border color and hide leaderboard overlay
        resetFireEffect();
        gameState.leaderboardVisible = false;
        gameState.pausedByLeaderboard = false;
        if (elements.gameLeaderboard) {
            elements.gameLeaderboard.classList.remove('visible');
        }

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
            gameState.score += 1;
            elements.snakeScore.textContent = gameState.score;
            gameState.filesEaten.push(gameState.food.type);

            const knowledge = getKnowledgeLevel();
            elements.knowledgeLevel.textContent = knowledge.level;
            elements.knowledgeLevel.style.color = knowledge.color;

            elements.gameFileConsumed.innerHTML = `<span style="color: ${gameState.food.type.color}">[${gameState.food.type.name}]</span>`;
            elements.gameFeedback.textContent = getRandomFeedback(gameState.food.type.category);

            // Update border color based on new score
            updateFireEffect();

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
        const fileCount = gameState.score;
        
        if (knowledge.level === 'FULLY SYNCED') {
            elements.gameFeedback.textContent = `${fileCount} files synced. I understand you completely now.`;
        } else if (fileCount >= 10) {
            elements.gameFeedback.textContent = `${fileCount} files synced. We're getting to know each other.`;
        } else if (fileCount >= 5) {
            elements.gameFeedback.textContent = `${fileCount} files synced. A good start.`;
        } else {
            elements.gameFeedback.textContent = `${fileCount} files synced. There's so much more to learn.`;
        }

        // High score check
        if (gameState.score > CONFIG.highScoreThreshold) {
            saveHighScore();
            if (elements.highScoreNotice) {
                elements.highScoreNotice.style.display = 'block';
                elements.highScoreNotice.textContent = `RECORDED: ${gameState.playerName} - ${gameState.score} files`;
            }
        }
    }

    function handleGameInput(e) {
        if (!elements.gameModal.classList.contains('active')) return;
        
        // Don't handle game controls if typing in any input field
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            // But allow arrow keys to blur and start game
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                activeEl.blur();
                elements.gameModal.focus();
            } else {
                return;
            }
        }

        switch (e.key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                if (gameState.dy !== 1) { gameState.dx = 0; gameState.dy = -1; }
                if (gameState.paused && gameState.running) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowdown':
            case 's':
                if (gameState.dy !== -1) { gameState.dx = 0; gameState.dy = 1; }
                if (gameState.paused && gameState.running) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowleft':
            case 'a':
                if (gameState.dx !== 1) { gameState.dx = -1; gameState.dy = 0; }
                if (gameState.paused && gameState.running) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case 'arrowright':
            case 'd':
                if (gameState.dx !== -1) { gameState.dx = 1; gameState.dy = 0; }
                if (gameState.paused && gameState.running) { gameState.paused = false; elements.gameFeedback.textContent = 'Syncing your data...'; }
                e.preventDefault();
                break;
            case ' ':
                if (gameState.running) {
                    gameState.paused = !gameState.paused;
                    elements.gameFeedback.textContent = gameState.paused ? 'Paused...' : 'Syncing your data...';
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
        // Clear and blur terminal input so keystrokes go to game
        elements.terminalInput.value = '';
        elements.inputMirror.textContent = '';
        elements.terminalInput.blur();
        initGame();
        // Focus the modal itself to capture key events
        elements.gameModal.focus();
    }

    function closeGameModal() {
        elements.gameModal.classList.remove('active');
        document.body.style.overflow = '';
        gameState.running = false;
        if (gameState.loop) clearInterval(gameState.loop);
        resetFireEffect();
        // Return focus to terminal
        elements.terminalInput.focus();
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
            // Ignore if game modal is open
            if (elements.gameModal.classList.contains('active')) return;
            
            if (e.key === 'Enter') {
                const command = elements.terminalInput.value.trim().toLowerCase();
                processCommand(command);
                elements.terminalInput.value = '';
                elements.inputMirror.textContent = '';
            }
        });

        elements.terminalInput.addEventListener('input', () => {
            // Ignore if game modal is open
            if (elements.gameModal.classList.contains('active')) return;
            
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
            if (terminalState.introComplete && !elements.gameModal.classList.contains('active')) {
                elements.terminalInput.focus();
            }
        });

        elements.inputLine.addEventListener('click', () => {
            if (!elements.gameModal.classList.contains('active')) {
                elements.terminalInput.focus();
            }
        });

        // Game input
        document.addEventListener('keydown', handleGameInput);

        // Game modal focus management
        elements.gameModal.addEventListener('click', (e) => {
            // Don't steal focus if clicking on the name input
            if (e.target !== elements.playerNameInput) {
                elements.gameModal.focus();
            }
        });

        // Player name input
        if (elements.playerNameInput) {
            elements.playerNameInput.addEventListener('input', (e) => {
                gameState.playerName = e.target.value.toUpperCase() || 'ROX';
                localStorage.setItem('localghost_player_name', gameState.playerName);
            });
            
            // Tab or Enter exits input and focuses game
            elements.playerNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    elements.playerNameInput.blur();
                    elements.gameModal.focus();
                }
            });
        }

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

        // Escape key for modals and intro skip
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Skip intro if still typing
                if (!terminalState.introComplete) {
                    skipIntro();
                    return;
                }
                // Otherwise handle modals
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
        loadHighScores();

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