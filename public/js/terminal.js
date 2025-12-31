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
        lineDelay: 200
    };

    const introLines = [
        { text: 'CONNECTING...', delay: 0, type: 'normal' },
        { text: '1993 WAS A WARNING.', delay: 800, type: 'link', href: '/cypherpunk' },
        { text: `${new Date().getFullYear()} IS THE REALITY.`, delay: 600, type: 'link', href: '/manifesto' },
        { text: '2026 IS THE DEADLINE.', delay: 600, type: 'link', href: '/inflection' },
        { text: '', delay: 400, type: 'empty' },
        { text: 'WE CANNOT FIX THE INTERNET.', delay: 600, type: 'warning' },
        { text: 'BUT WE CAN BUILD A ROOM WHERE IT CANNOT SEE YOU.', delay: 800, type: 'normal' },
        { text: '', delay: 400, type: 'empty' },
        { text: 'TYPE "?" FOR COMMANDS', delay: 600, type: 'dim' },
    ];

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
        elements.terminalInput.focus({ preventScroll: true });
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
        
        // Check if mobile/touch device
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        hint.innerHTML = isMobile 
            ? '<span class="skip-key">TAP</span> SKIP'
            : '<span class="skip-key">ESC</span> SKIP';
        
        hint.style.cursor = 'pointer';
        hint.addEventListener('click', skipIntro);
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
            { text: '2026 IS THE DEADLINE.', type: 'link', href: '/inflection' },
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
                addOutputLine('  inflection - Why now matters');
                addOutputLine('  faq       - Jump to FAQ section');
                addOutputLine('  quit      - ???');
                addOutputLine('  shadow    - Play The Shadow (snake)');
                addOutputLine('  reclaim   - Play Reclaim (desktop)');
                addOutputLine('  escape    - Play Escape (desktop)');
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

            case 'inflection':
            case 'why':
            case 'whynow':
            case 'why now':
                addOutputLine('LOADING INFLECTION...', 'success');
                setTimeout(() => {
                    window.location.href = '/inflection';
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
            case 'quit':
                addOutputLine('INITIATING ESCAPE SEQUENCE...', 'warning');
                setTimeout(() => {
                    addOutputLine('REALITY.EXE HAS STOPPED RESPONDING', 'warning');
                    triggerEscapeSequence();
                }, 500);
                break;

            case 'game':
            case 'shadow':
            case 'snake':
                addOutputLine('LAUNCHING THE_SHADOW.EXE...', 'success');
                addOutputLine('The more I learn, the more I can help.', 'dim');
                setTimeout(() => {
                    if (typeof window.TheShadow !== 'undefined') {
                        window.TheShadow.open();
                    } else {
                        addOutputLine('ERROR: THE_SHADOW.EXE NOT LOADED', 'warning');
                    }
                }, 300);
                break;

            case 'export':
            case 'reclaim':
            case 'volfied':
                // Check if mobile - reclaim requires keyboard
                const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
                if (isMobileDevice) {
                    addOutputLine('RECLAIM.EXE requires keyboard controls.', 'warning');
                    addOutputLine('Play on desktop for full experience.', 'dim');
                } else {
                    addOutputLine('LAUNCHING RECLAIM.EXE...', 'success');
                    addOutputLine('Trap the greedy entities. Reclaim your data.', 'dim');
                    setTimeout(openReclaimGame, 300);
                }
                break;

            case 'escape':
            case 'run':
            case 'flee':
            case 'temple':
            case 'dino':
                // Check if mobile - escape requires keyboard
                const isMobileForEscape = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
                if (isMobileForEscape) {
                    addOutputLine('ESCAPE.EXE requires keyboard controls.', 'warning');
                    addOutputLine('Play on desktop for full experience.', 'dim');
                } else {
                    addOutputLine('LAUNCHING ESCAPE.EXE...', 'success');
                    addOutputLine('Run from the machine. Jump bureaucracy. Duck privacy banners.', 'dim');
                    setTimeout(() => {
                        if (typeof window.EscapeGame !== 'undefined') {
                            window.EscapeGame.open();
                        } else {
                            addOutputLine('ERROR: ESCAPE.EXE NOT LOADED', 'warning');
                            addOutputLine('Game module missing. Check console.', 'dim');
                        }
                    }, 300);
                }
                break;


            case 'scores':
            case 'leaderboard':
                if (typeof window.TheShadow !== 'undefined') {
                    window.TheShadow.loadHighScores();
                    const scores = window.TheShadow.getHighScores();
                    if (scores.length === 0) {
                        addOutputLine('NO SHADOW RECORDS YET.', 'dim');
                        addOutputLine('Play "shadow" and consume over 4 files to qualify.', 'dim');
                    } else {
                        addOutputLine('THE SHADOW LEADERBOARD:', 'success');
                        scores.forEach((entry, i) => {
                            addOutputLine(`  ${String(i + 1).padStart(2, '0')}. ${entry.name.padEnd(12)} ${String(entry.score).padStart(4)} files  ${entry.date}`);
                        });
                    }
                } else {
                    addOutputLine('NO SHADOW RECORDS YET.', 'dim');
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
                triggerEscapeSequence();
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
        phase: 'growing',
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
            this.vy += 0.4;
            this.vx *= 0.99;
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

        let shakeX = 0, shakeY = 0;
        if (escapeState.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * escapeState.screenShake;
            shakeY = (Math.random() - 0.5) * escapeState.screenShake;
            escapeState.screenShake *= 0.95;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        ctx.fillStyle = 'rgba(17, 17, 17, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (let y = 0; y < canvas.height; y += 4) {
            ctx.fillRect(0, y, canvas.width, 2);
        }

        if (Math.random() < 0.1 && escapeState.phase !== 'done') {
            escapeState.glitchLines.push(new GlitchLine(canvas.height));
        }
        escapeState.glitchLines = escapeState.glitchLines.filter(line => {
            line.draw(ctx, canvas);
            return line.update();
        });

        escapeState.frame++;
        escapeState.messageTimer++;

        const messageInterval = escapeState.phase === 'exploding' ? 20 : 35;
        if (escapeState.messageTimer > messageInterval && escapeState.currentMessage < escapeState.messages.length - 1) {
            escapeState.messageTimer = 0;
            escapeState.currentMessage++;
        }

        const msg = escapeState.messages[escapeState.currentMessage];
        ctx.textAlign = 'center';
        
        // Position text at top of screen, away from snake
        const textY = 80;
        
        if (escapeState.phase === 'exploding' || escapeState.phase === 'done') {
            ctx.font = 'bold 28px JetBrains Mono, monospace';
            const glitchOffset = escapeState.phase === 'done' ? 0 : (Math.random() - 0.5) * 15;
            
            // Dark background for text readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, textY - 35, canvas.width, 50);
            
            ctx.fillStyle = '#003300';
            ctx.fillText(msg, centerX + 3 + glitchOffset, textY + 3);
            
            ctx.fillStyle = escapeState.frame % 3 === 0 ? '#FF0000' : '#33FF00';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 20;
            ctx.fillText(msg, centerX + glitchOffset, textY);
            ctx.shadowBlur = 0;
            
            if (escapeState.frame % 40 < 25) {
                // Bottom text with background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(0, canvas.height - 100, canvas.width, 60);
                
                ctx.font = '18px JetBrains Mono, monospace';
                ctx.fillStyle = '#33FF00';
                ctx.shadowColor = '#33FF00';
                ctx.shadowBlur = 15;
                ctx.fillText('[ CORPORATE GREED ELIMINATED ]', centerX, canvas.height - 70);
                ctx.font = '14px JetBrains Mono, monospace';
                ctx.fillStyle = '#00AA00';
                ctx.fillText('NOW DO IT FOR REAL: LOCALGHOST.AI', centerX, canvas.height - 45);
            }
        } else {
            // Dark background for text readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, textY - 30, canvas.width, 45);
            
            ctx.font = 'bold 22px JetBrains Mono, monospace';
            ctx.fillStyle = '#33FF00';
            ctx.shadowColor = '#33FF00';
            ctx.shadowBlur = 15;
            ctx.fillText('> ' + msg, centerX, textY);
            ctx.shadowBlur = 0;
            
            if (escapeState.frame % 20 < 10) {
                ctx.fillRect(centerX + ctx.measureText('> ' + msg).width / 2 + 5, textY - 15, 12, 20);
            }
        }

        switch (escapeState.phase) {
            case 'growing':
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

                const eatRate = Math.max(3, 8 - Math.floor((50 - aliveSegments.length) / 8));
                if (escapeState.frame % eatRate === 0 && aliveSegments.length > 5) {
                    const victim = aliveSegments[aliveSegments.length - 1];
                    victim.alive = false;
                    escapeState.screenShake = Math.max(escapeState.screenShake, 5 + (50 - aliveSegments.length) * 0.3);
                    
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
                const remaining = escapeState.snake.filter(s => s.alive);
                remaining.forEach((seg, i) => {
                    seg.x += (Math.random() - 0.5) * 30;
                    seg.y += (Math.random() - 0.5) * 30;
                    seg.size *= 1.04;
                    seg.color = escapeState.frame % 4 < 2 ? '#33FF00' : '#FF0000';
                });

                escapeState.screenShake = 25;
                escapeState.deathFrame++;
                
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
                    
                    remaining.forEach(seg => {
                        for (let i = 0; i < 30; i++) {
                            escapeState.explosionParticles.push(
                                new ExplosionParticle(seg.x, seg.y, corporateColors[i % corporateColors.length])
                            );
                        }
                        seg.alive = false;
                    });

                    for (let i = 0; i < 80; i++) {
                        const isText = i < 15;
                        escapeState.explosionParticles.push(
                            new ExplosionParticle(centerX, centerY, corporateColors[i % corporateColors.length], isText)
                        );
                    }
                    
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
                
                if (Math.random() < 0.3) {
                    escapeState.glitchLines.push(new GlitchLine(canvas.height));
                }
                
                if (escapeState.deathFrame > 180 && escapeState.explosionParticles.length < 20) {
                    escapeState.phase = 'done';
                }
                break;
        }

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

        aliveSegs.forEach((seg, i) => {
            ctx.save();
            
            ctx.shadowColor = seg.color;
            ctx.shadowBlur = 25;
            
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, seg.size, 0, Math.PI * 2);
            ctx.fillStyle = seg.color;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, seg.size * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.font = `bold ${seg.size}px Arial`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seg.symbol, seg.x, seg.y);
            
            if (i === 0) {
                const eyeOffset = seg.size * 0.35;
                
                ctx.fillStyle = '#FF0000';
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(seg.x - eyeOffset, seg.y - eyeOffset, 6, 0, Math.PI * 2);
                ctx.arc(seg.x + eyeOffset, seg.y - eyeOffset, 6, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(seg.x - eyeOffset - 10, seg.y - eyeOffset - 12);
                ctx.lineTo(seg.x - eyeOffset + 10, seg.y - eyeOffset - 4);
                ctx.moveTo(seg.x + eyeOffset + 10, seg.y - eyeOffset - 12);
                ctx.lineTo(seg.x + eyeOffset - 10, seg.y - eyeOffset - 4);
                ctx.stroke();

                ctx.fillStyle = '#000';
                const tail = aliveSegs[aliveSegs.length - 1];
                if (tail && tail !== seg) {
                    const lookAngle = Math.atan2(tail.y - seg.y, tail.x - seg.x);
                    ctx.beginPath();
                    ctx.arc(seg.x - eyeOffset + Math.cos(lookAngle) * 3, seg.y - eyeOffset + Math.sin(lookAngle) * 3, 3, 0, Math.PI * 2);
                    ctx.arc(seg.x + eyeOffset + Math.cos(lookAngle) * 3, seg.y - eyeOffset + Math.sin(lookAngle) * 3, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(seg.x, seg.y + seg.size * 0.3, seg.size * 0.4, 0.2, Math.PI - 0.2);
                ctx.stroke();
            }
            
            ctx.restore();
        });

        escapeState.explosionParticles = escapeState.explosionParticles.filter(p => {
            p.draw(ctx);
            return p.update();
        });

        ctx.restore();

        if (escapeState.phase === 'done' && escapeState.explosionParticles.length === 0) {
            setTimeout(() => {
                cancelAnimationFrame(escapeState.animationId);
                elements.matrixCanvas.classList.remove('active');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                addOutputLine('', 'normal');
                addOutputLine('████████████████████████████████████████', 'success');
                addOutputLine('  CORPORATE GREED: [TERMINATED]', 'success');
                addOutputLine('  JUST KIDDING. IF ONLY.', 'warning');
                addOutputLine('  BUILD THE ALTERNATIVE: LOCALGHOST.AI', 'success');
                addOutputLine('████████████████████████████████████████', 'success');
            }, 800);
            return;
        }

        escapeState.animationId = requestAnimationFrame(drawEscapeAnimation);
    }

    function triggerEscapeSequence() {
        initEscapeAnimation();
        elements.matrixCanvas.classList.add('active');
        drawEscapeAnimation();
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

    function openReclaimGame() {
        if (typeof window.ReclaimGame !== 'undefined') {
            window.ReclaimGame.open();
        } else {
            addOutputLine('ERROR: RECLAIM.EXE NOT LOADED', 'warning');
            addOutputLine('Game module missing. Check console.', 'dim');
        }
    }

    function closeReclaimGame() {
        if (typeof window.ReclaimGame !== 'undefined') {
            window.ReclaimGame.close();
        }
    }

    function closeAllModals() {
        closeDonateModal();
        closeWaitlistModal();
        closeContactModal();
        closeReclaimGame();
        if (typeof window.TheShadow !== 'undefined') {
            window.TheShadow.close();
        }
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
            if (elements.gameModal && elements.gameModal.classList.contains('active')) return;
            
            if (e.key === 'Enter') {
                const command = elements.terminalInput.value.trim().toLowerCase();
                processCommand(command);
                elements.terminalInput.value = '';
                elements.inputMirror.textContent = '';
            }
        });

        elements.terminalInput.addEventListener('input', () => {
            // Ignore if game modal is open
            if (elements.gameModal && elements.gameModal.classList.contains('active')) return;
            
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
            if (terminalState.introComplete && !(elements.gameModal && elements.gameModal.classList.contains('active'))) {
                elements.terminalInput.focus({ preventScroll: true });
            }
        });

        elements.inputLine.addEventListener('click', () => {
            if (!(elements.gameModal && elements.gameModal.classList.contains('active'))) {
                elements.terminalInput.focus({ preventScroll: true });
            }
        });

        // Modal overlay clicks (excluding game modal - handled by TheShadow)
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            if (overlay.id === 'gameModal') return; // TheShadow handles this
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
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
                // Close modals
                closeAllModals();
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
            if (elements.gameModal && elements.gameModal.classList.contains('active')) return;

            konamiCode.push(e.keyCode);
            konamiCode = konamiCode.slice(-10);

            if (konamiCode.join(',') === secretCode.join(',')) {
                triggerEscapeSequence();
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
        triggerEscapeSequence,
        terminalMinimize,
        terminalMaximize,
        openDonateModal,
        closeDonateModal,
        openWaitlistModal,
        closeWaitlistModal,
        openContactModal,
        closeContactModal,
        copyAddress,
        copyEmail,
        addCalendarReminder,
        addOutputLine
    };

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();