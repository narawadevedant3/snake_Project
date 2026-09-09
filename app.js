/**
 * Snake AI & Human Arena - Frontend Controller & Canvas Renderer
 * Mobile Touch & Swipe Ready + SQLite Leaderboard Integration
 */

// --- Audio Synthesizer (Web Audio API) ---
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.15) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy catch
    }
  }

  playEat() {
    if (!this.enabled) return;
    this.init();
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.07, 0.18), idx * 35);
    });
  }

  playDie() {
    if (!this.enabled) return;
    this.init();
    [330, 220, 110].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.12, 0.25), idx * 60);
    });
  }

  playWin() {
    if (!this.enabled) return;
    this.init();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.15, 0.2), idx * 80);
    });
  }
}

// --- Particle FX Engine ---
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, color = '#fbbf24', count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 1.2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3.5 + 1.5,
        color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02,
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// --- Main Application ---
class SnakeApp {
  constructor() {
    this.gameId = 'arena_' + Math.random().toString(36).substring(2, 7);
    this.mode = 'graph';
    this.gridSize = 6;
    this.speed = 80;
    this.gameState = null;
    this.highScore = 3;

    // Visual options
    this.showAiPath = true;
    this.showGrid = true;
    this.particlesEnabled = true;

    // Infrastructure
    this.ws = null;
    this.wsConnected = false;
    this.sound = new SoundManager();
    this.particles = new ParticleSystem();

    // High-Sensitivity Touch Engine
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchActive = false;
    this.sensitivityLevel = 'high'; // 'ultra' (6px), 'high' (10px), 'normal' (18px)
    this.swipeThreshold = 10;

    // Canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.cacheDom();
    this.bindEvents();
    this.setupSwipeGestures();
    this.resizeCanvas();

    // Initial setup
    this.fetchDbHighScore();
    this.connectWs();
    this.startAnimationLoop();
  }

  cacheDom() {
    this.dom = {
      wsBadge: document.getElementById('wsStatusBadge'),
      wsText: document.getElementById('wsStatusText'),
      modePill: document.getElementById('activeModePill'),
      modeLabel: document.getElementById('currentModeLabel'),
      soundBtn: document.getElementById('soundToggleBtn'),
      soundIcon: document.getElementById('soundIcon'),
      leaderboardBtn: document.getElementById('leaderboardBtn'),
      leaderboardModal: document.getElementById('leaderboardModal'),
      closeLeaderboardBtn: document.getElementById('closeLeaderboardBtn'),
      leaderboardTableBody: document.getElementById('leaderboardTableBody'),
      lbTabs: document.querySelectorAll('.lb-tab'),
      statScore: document.getElementById('statScore'),
      statMaxScore: document.getElementById('statMaxScore'),
      statHighScore: document.getElementById('statHighScore'),
      statMoves: document.getElementById('statMoves'),
      statTime: document.getElementById('statTime'),
      scoreProgressBar: document.getElementById('scoreProgressBar'),
      speedSlider: document.getElementById('speedSlider'),
      speedLabel: document.getElementById('speedLabel'),
      speedChips: document.querySelectorAll('.preset-speeds .chip-btn'),
      gridChips: document.querySelectorAll('.grid-presets .grid-chip'),
      modeCards: document.querySelectorAll('.mode-card'),
      pauseBtn: document.getElementById('pauseBtn'),
      pauseBtnIcon: document.getElementById('pauseBtnIcon'),
      pauseBtnText: document.getElementById('pauseBtnText'),
      stepBtn: document.getElementById('stepBtn'),
      restartBtn: document.getElementById('restartBtn'),
      toggleAiPath: document.getElementById('toggleAiPath'),
      toggleGrid: document.getElementById('toggleGrid'),
      toggleParticles: document.getElementById('toggleParticles'),
      pauseBanner: document.getElementById('pauseBanner'),
      swipeHint: document.getElementById('swipeHint'),
      gestureIndicator: document.getElementById('gestureIndicator'),
      canvasWrapper: document.getElementById('canvasWrapper'),
      gameOverModal: document.getElementById('gameOverModal'),
      modalIcon: document.getElementById('modalIcon'),
      modalTitle: document.getElementById('modalTitle'),
      modalDesc: document.getElementById('modalDesc'),
      modalFinalScore: document.getElementById('modalFinalScore'),
      modalFinalMoves: document.getElementById('modalFinalMoves'),
      modalFinalTime: document.getElementById('modalFinalTime'),
      modalRestartBtn: document.getElementById('modalRestartBtn'),
      saveScoreForm: document.getElementById('saveScoreForm'),
      playerNameInput: document.getElementById('playerNameInput'),
      saveFeedback: document.getElementById('saveFeedback'),
      // Mobile Quick Action Bar
      mobilePauseBtn: document.getElementById('mobilePauseBtn'),
      mobilePauseIcon: document.getElementById('mobilePauseIcon'),
      mobilePauseLabel: document.getElementById('mobilePauseLabel'),
      mobileRestartBtn: document.getElementById('mobileRestartBtn'),
      mobileSpeedBtn: document.getElementById('mobileSpeedBtn'),
      mobileSpeedLabel: document.getElementById('mobileSpeedLabel'),
      mobileSensitivityBtn: document.getElementById('mobileSensitivityBtn'),
      mobileSensitivityLabel: document.getElementById('mobileSensitivityLabel'),
      // D-Pad
      dpadUp: document.getElementById('dpadUp'),
      dpadDown: document.getElementById('dpadDown'),
      dpadLeft: document.getElementById('dpadLeft'),
      dpadRight: document.getElementById('dpadRight'),
      dpadCenterBtn: document.getElementById('dpadCenterBtn'),
    };
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Sound Toggle
    this.dom.soundBtn.addEventListener('click', () => {
      const enabled = this.sound.toggle();
      this.dom.soundIcon.textContent = enabled ? '🔊' : '🔇';
      this.triggerHaptic(15);
    });

    // Leaderboard Modal
    this.dom.leaderboardBtn.addEventListener('click', () => this.openLeaderboard());
    this.dom.closeLeaderboardBtn.addEventListener('click', () => {
      this.dom.leaderboardModal.classList.add('hidden');
    });

    this.dom.lbTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.dom.lbTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.lbmode === 'all' ? null : tab.dataset.lbmode;
        this.loadLeaderboardData(mode);
      });
    });

    // Save Score Form
    this.dom.saveScoreForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitScoreToDb();
    });

    // Mode Switch Cards
    this.dom.modeCards.forEach((card) => {
      card.addEventListener('click', () => {
        this.setMode(card.dataset.mode);
        this.triggerHaptic(12);
      });
    });

    // Speed Controls
    this.dom.speedSlider.addEventListener('input', (e) => {
      this.setSpeed(parseInt(e.target.value, 10));
    });

    this.dom.speedChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.setSpeed(parseInt(chip.dataset.speed, 10));
        this.triggerHaptic(10);
      });
    });

    // Grid Size
    this.dom.gridChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.setGridSize(parseInt(chip.dataset.grid, 10));
        this.triggerHaptic(15);
      });
    });

    // Main Control Buttons
    this.dom.pauseBtn.addEventListener('click', () => this.togglePause());
    this.dom.stepBtn.addEventListener('click', () => this.step());
    this.dom.restartBtn.addEventListener('click', () => this.restartGame());
    this.dom.modalRestartBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.add('hidden');
      this.restartGame();
    });

    // Mobile Quick Action Bar Events
    if (this.dom.mobilePauseBtn) {
      this.dom.mobilePauseBtn.addEventListener('click', () => {
        this.togglePause();
        this.triggerHaptic(12);
      });
    }

    if (this.dom.mobileRestartBtn) {
      this.dom.mobileRestartBtn.addEventListener('click', () => {
        this.restartGame();
        this.triggerHaptic(20);
      });
    }

    if (this.dom.mobileSpeedBtn) {
      this.dom.mobileSpeedBtn.addEventListener('click', () => {
        const speeds = [200, 80, 40, 20];
        const names = { 200: 'Chill', 80: 'Normal', 40: 'Turbo', 20: 'Hyper' };
        const nextIdx = (speeds.indexOf(this.speed) + 1) % speeds.length;
        const nextSpeed = speeds[nextIdx];
        this.setSpeed(nextSpeed);
        this.dom.mobileSpeedLabel.textContent = `⚡ ${names[nextSpeed]}`;
        this.triggerHaptic(12);
      });
    }

    if (this.dom.mobileSensitivityBtn) {
      this.dom.mobileSensitivityBtn.addEventListener('click', () => {
        this.cycleSensitivity();
      });
    }

    if (this.dom.dpadCenterBtn) {
      this.dom.dpadCenterBtn.addEventListener('click', () => {
        this.togglePause();
        this.triggerHaptic(15);
      });
    }

    // Toggles
    this.dom.toggleAiPath.addEventListener('change', (e) => {
      this.showAiPath = e.target.checked;
    });
    this.dom.toggleGrid.addEventListener('change', (e) => {
      this.showGrid = e.target.checked;
    });
    this.dom.toggleParticles.addEventListener('change', (e) => {
      this.particlesEnabled = e.target.checked;
    });

    // Zero-Latency Touch D-Pad with Pointer & Touch Events
    const bindTouchButton = (btn, direction) => {
      if (!btn) return;
      const handlePress = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        this.sendDirection(direction);
        this.triggerHaptic(14);
      };
      const handleRelease = () => {
        btn.classList.remove('pressed');
      };

      btn.addEventListener('pointerdown', handlePress);
      btn.addEventListener('pointerup', handleRelease);
      btn.addEventListener('pointercancel', handleRelease);
      btn.addEventListener('touchstart', handlePress, { passive: false });
      btn.addEventListener('touchend', handleRelease, { passive: true });
    };

    bindTouchButton(this.dom.dpadUp, 'UP');
    bindTouchButton(this.dom.dpadDown, 'DOWN');
    bindTouchButton(this.dom.dpadLeft, 'LEFT');
    bindTouchButton(this.dom.dpadRight, 'RIGHT');
  }

  // --- Mobile Sensitivity Switcher ---
  cycleSensitivity() {
    if (this.sensitivityLevel === 'ultra') {
      this.sensitivityLevel = 'normal';
      this.swipeThreshold = 18;
      this.dom.mobileSensitivityLabel.textContent = '🎯 Normal Touch';
    } else if (this.sensitivityLevel === 'normal') {
      this.sensitivityLevel = 'high';
      this.swipeThreshold = 10;
      this.dom.mobileSensitivityLabel.textContent = '🎯 High Touch';
    } else {
      this.sensitivityLevel = 'ultra';
      this.swipeThreshold = 6;
      this.dom.mobileSensitivityLabel.textContent = '⚡ Ultra Touch';
    }
    this.triggerHaptic(15);
  }

  // --- Haptic Feedback Helper ---
  triggerHaptic(ms = 12) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        // Haptic unsupported
      }
    }
  }

  // --- Ultra-Sensitive Continuous Swipe & Gesture Engine ---
  setupSwipeGestures() {
    const target = this.dom.canvasWrapper || this.canvas;
    if (!target) return;

    const startTouch = (clientX, clientY) => {
      this.touchStartX = clientX;
      this.touchStartY = clientY;
      this.touchActive = true;
    };

    const moveTouch = (clientX, clientY, e) => {
      if (!this.touchActive) return;
      if (e && e.cancelable) e.preventDefault();

      const deltaX = clientX - this.touchStartX;
      const deltaY = clientY - this.touchStartY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (Math.max(absX, absY) >= this.swipeThreshold) {
        if (this.dom.swipeHint) {
          this.dom.swipeHint.classList.add('hidden');
        }

        let dir = 'RIGHT';
        if (absX > absY) {
          dir = deltaX > 0 ? 'RIGHT' : 'LEFT';
        } else {
          dir = deltaY > 0 ? 'DOWN' : 'UP';
        }

        this.sendDirection(dir);
        this.triggerHaptic(10);
        this.showGestureRipple(clientX, clientY, dir);

        // Reset origin immediately to allow fluid continuous corner turns!
        this.touchStartX = clientX;
        this.touchStartY = clientY;
      }
    };

    const endTouch = () => {
      this.touchActive = false;
      if (this.dom.gestureIndicator) {
        this.dom.gestureIndicator.classList.add('hidden');
      }
    };

    // Touch events on canvas and wrapper
    target.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startTouch(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    target.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        moveTouch(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, { passive: false });

    target.addEventListener('touchend', endTouch, { passive: true });
    target.addEventListener('touchcancel', endTouch, { passive: true });

    // Pointer events for desktop drag / mouse swipe
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.buttons !== 1) return;
      startTouch(e.clientX, e.clientY);
    });

    target.addEventListener('pointermove', (e) => {
      if (this.touchActive) {
        moveTouch(e.clientX, e.clientY, e);
      }
    });

    target.addEventListener('pointerup', endTouch);
    target.addEventListener('pointercancel', endTouch);
  }

  showGestureRipple(clientX, clientY, direction) {
    const indicator = this.dom.gestureIndicator;
    const wrapper = this.dom.canvasWrapper;
    if (!indicator || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    if (relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height) {
      indicator.style.left = `${relX}px`;
      indicator.style.top = `${relY}px`;
      indicator.classList.remove('hidden');

      clearTimeout(this._indicatorTimeout);
      this._indicatorTimeout = setTimeout(() => {
        indicator.classList.add('hidden');
      }, 220);
    }
  }

  handleKeyDown(e) {
    const key = e.key;

    if (['ArrowUp', 'KeyW', 'w', 'W'].includes(key)) {
      e.preventDefault();
      this.sendDirection('UP');
    } else if (['ArrowDown', 'KeyS', 's', 'S'].includes(key)) {
      e.preventDefault();
      this.sendDirection('DOWN');
    } else if (['ArrowLeft', 'KeyA', 'a', 'A'].includes(key)) {
      e.preventDefault();
      this.sendDirection('LEFT');
    } else if (['ArrowRight', 'KeyD', 'd', 'D'].includes(key)) {
      e.preventDefault();
      this.sendDirection('RIGHT');
    } else if (key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      this.togglePause();
    } else if (['KeyR', 'r', 'R'].includes(key)) {
      e.preventDefault();
      this.restartGame();
    } else if (['KeyM', 'm', 'M'].includes(key)) {
      e.preventDefault();
      const enabled = this.sound.toggle();
      this.dom.soundIcon.textContent = enabled ? '🔊' : '🔇';
    } else if (['KeyH', 'h', 'H'].includes(key)) {
      e.preventDefault();
      this.openLeaderboard();
    }
  }

  resizeCanvas() {
    const wrapper = document.getElementById('canvasWrapper');
    const width = Math.min(wrapper.clientWidth || 460, 500);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = width + 'px';
    this.canvas.width = width * this.dpr;
    this.canvas.height = width * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.displaySize = width;
  }

  // --- WebSocket Connection ---
  connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || '127.0.0.1:8000';
    const wsUrl = `${protocol}//${host}/ws/game/${this.gameId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.dom.wsBadge.className = 'status-badge connected';
        this.dom.wsText.textContent = 'Live';
        this.sendWs({
          type: 'RESET',
          grid_size: this.gridSize,
          mode: this.mode,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE') {
            this.handleStateUpdate(msg.data);
          } else if (msg.type === 'EVENT') {
            this.handleServerEvent(msg.event, msg.data);
          }
        } catch (err) {
          console.error('WS error:', err);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.dom.wsBadge.className = 'status-badge disconnected';
        this.dom.wsText.textContent = 'Reconnecting';
        setTimeout(() => this.connectWs(), 2500);
      };

      this.ws.onerror = () => {
        this.ws.close();
      };
    } catch (e) {
      setTimeout(() => this.connectWs(), 2500);
    }
  }

  sendWs(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // --- Actions ---
  sendDirection(direction) {
    if (this.mode !== 'human') {
      this.setMode('human');
    }
    this.sendWs({ type: 'MOVE', direction });
  }

  setMode(mode) {
    this.mode = mode;
    this.dom.modeCards.forEach((c) => {
      c.classList.toggle('active', c.dataset.mode === mode);
    });

    const labels = {
      human: '👤 Human Player',
      graph: '🧠 Graph AI',
      rl: '🤖 RL Agent',
    };
    this.dom.modeLabel.textContent = labels[mode] || mode;
    this.sendWs({ type: 'CHANGE_MODE', mode });
    this.fetchDbHighScore();
  }

  setSpeed(speed) {
    this.speed = speed;
    this.dom.speedSlider.value = speed;
    this.dom.speedLabel.textContent = `${speed} ms`;

    this.dom.speedChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.dataset.speed, 10) === speed);
    });

    this.sendWs({ type: 'SET_SPEED', speed });
  }

  setGridSize(size) {
    this.gridSize = size;
    this.dom.gridChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.dataset.grid, 10) === size);
    });
    this.restartGame();
  }

  togglePause() {
    this.sendWs({ type: 'TOGGLE_PAUSE' });
  }

  step() {
    this.sendWs({ type: 'STEP' });
  }

  restartGame() {
    this.dom.gameOverModal.classList.add('hidden');
    this.dom.saveFeedback.classList.add('hidden');
    this.sendWs({
      type: 'RESET',
      grid_size: this.gridSize,
      mode: this.mode,
    });
  }

  // --- Database High Scores & Leaderboard ---
  async fetchDbHighScore() {
    try {
      const res = await fetch(`/api/scores/top?mode=${this.mode}`);
      if (res.ok) {
        const data = await res.json();
        this.highScore = data.high_score;
        this.dom.statHighScore.textContent = this.highScore;
      }
    } catch (e) {
      // Fallback
    }
  }

  async openLeaderboard() {
    this.dom.leaderboardModal.classList.remove('hidden');
    this.loadLeaderboardData();
  }

  async loadLeaderboardData(mode = null) {
    this.dom.leaderboardTableBody.innerHTML =
      '<tr><td colspan="6" class="table-empty">Loading scores...</td></tr>';
    try {
      const url = mode ? `/api/scores?mode=${mode}&limit=15` : '/api/scores?limit=15';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.renderLeaderboardTable(data.scores || []);
      }
    } catch (e) {
      this.dom.leaderboardTableBody.innerHTML =
        '<tr><td colspan="6" class="table-empty">Failed to load scores.</td></tr>';
    }
  }

  renderLeaderboardTable(scores) {
    if (scores.length === 0) {
      this.dom.leaderboardTableBody.innerHTML =
        '<tr><td colspan="6" class="table-empty">No scores recorded yet. Be the first!</td></tr>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    let html = '';
    scores.forEach((s, idx) => {
      const rank = medals[idx] || `${idx + 1}`;
      const modeEmoji = s.mode === 'human' ? '👤' : s.mode === 'rl' ? '🤖' : '🧠';
      const safeName = this.escapeHtml(s.player_name || 'Anonymous');
      html += `
        <tr>
          <td><strong>${rank}</strong></td>
          <td>${safeName}</td>
          <td>${modeEmoji} ${this.escapeHtml(s.mode)}</td>
          <td>${Number(s.grid_size)}x${Number(s.grid_size)}</td>
          <td><strong style="color: #34d399;">${Number(s.score)}</strong></td>
          <td>${Number(s.moves)}</td>
        </tr>
      `;
    });
    this.dom.leaderboardTableBody.innerHTML = html;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  async submitScoreToDb() {
    if (!this.gameState) return;
    const name = this.dom.playerNameInput.value.trim() || 'Player';

    try {
      const payload = {
        player_name: name,
        mode: this.gameState.mode,
        grid_size: this.gameState.grid_size,
        score: this.gameState.score,
        moves: this.gameState.moves,
        time_seconds: this.gameState.elapsed_seconds,
      };

      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        this.dom.saveFeedback.classList.remove('hidden');
        this.fetchDbHighScore();
      }
    } catch (e) {
      console.error('Save score error:', e);
    }
  }

  // --- Event & State Handler ---
  handleServerEvent(event, data) {
    if (event === 'FOOD_EATEN') {
      this.sound.playEat();
      if (this.particlesEnabled && data && data.food) {
        const cellSize = this.displaySize / data.grid_size;
        const x = (data.food.col + 0.5) * cellSize;
        const y = (data.food.row + 0.5) * cellSize;
        this.particles.spawn(x, y, '#fbbf24', 20);
      }
    } else if (event === 'GAME_OVER') {
      if (data.state === 'FULL') {
        this.sound.playWin();
      } else {
        this.sound.playDie();
      }
    }
  }

  handleStateUpdate(state) {
    this.gameState = state;

    if (state.score > this.highScore) {
      this.highScore = state.score;
      this.dom.statHighScore.textContent = this.highScore;
    }

    this.dom.statScore.textContent = state.score;
    this.dom.statMaxScore.textContent = `/ ${state.max_score}`;
    this.dom.statMoves.textContent = state.moves;
    this.dom.statTime.textContent = `${state.elapsed_seconds}s`;

    const progressPct = Math.min(100, Math.round((state.score / state.max_score) * 100));
    this.dom.scoreProgressBar.style.width = `${progressPct}%`;

    this.dom.pauseBanner.classList.toggle('hidden', !state.paused);
    this.dom.pauseBtnIcon.textContent = state.paused ? '▶️' : '⏸️';
    this.dom.pauseBtnText.textContent = state.paused ? 'Resume' : 'Pause';

    if (this.dom.mobilePauseIcon) {
      this.dom.mobilePauseIcon.textContent = state.paused ? '▶️' : '⏸️';
    }
    if (this.dom.mobilePauseLabel) {
      this.dom.mobilePauseLabel.textContent = state.paused ? 'Resume' : 'Pause';
    }

    if (state.state === 'DEAD' || state.state === 'FULL') {
      this.showGameOverModal(state);
    } else {
      this.dom.gameOverModal.classList.add('hidden');
    }
  }

  showGameOverModal(state) {
    const isWin = state.state === 'FULL';
    this.dom.modalIcon.textContent = isWin ? '👑' : '💀';
    this.dom.modalTitle.textContent = isWin ? 'VICTORY!' : 'GAME OVER';
    this.dom.modalDesc.textContent = isWin
      ? 'Outstanding! The snake filled the entire arena!'
      : 'The snake hit a wall or collided with itself.';

    this.dom.modalFinalScore.textContent = state.score;
    this.dom.modalFinalMoves.textContent = state.moves;
    this.dom.modalFinalTime.textContent = `${state.elapsed_seconds}s`;

    this.dom.gameOverModal.classList.remove('hidden');
  }

  // --- Rendering Loop ---
  startAnimationLoop() {
    const render = () => {
      this.draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  draw() {
    const ctx = this.ctx;
    const size = this.displaySize;
    if (!ctx || !size) return;

    ctx.clearRect(0, 0, size, size);

    if (!this.gameState) {
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const grid = this.gameState.grid_size;
    const cellSize = size / grid;

    // Grid
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, size, size);

    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= grid; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * cellSize);
        ctx.lineTo(size, r * cellSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(r * cellSize, 0);
        ctx.lineTo(r * cellSize, size);
        ctx.stroke();
      }
    }

    // AI Path Overlay
    if (this.showAiPath && this.gameState.ai_path && this.gameState.ai_path.length > 0) {
      this.drawAiPath(ctx, this.gameState.ai_path, cellSize);
    }

    // Food
    if (this.gameState.food) {
      this.drawFood(ctx, this.gameState.food, cellSize);
    }

    // Snake
    if (this.gameState.snake_coords && this.gameState.snake_coords.length > 0) {
      this.drawSnake(ctx, this.gameState, cellSize);
    }

    // Particles
    if (this.particlesEnabled) {
      this.particles.update();
      this.particles.draw(ctx);
    }
  }

  drawAiPath(ctx, pathCoords, cellSize) {
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = Math.max(2, cellSize * 0.08);
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    const head = this.gameState.snake_coords[this.gameState.snake_coords.length - 1];
    ctx.moveTo((head.col + 0.5) * cellSize, (head.row + 0.5) * cellSize);

    for (const pt of pathCoords) {
      ctx.lineTo((pt.col + 0.5) * cellSize, (pt.row + 0.5) * cellSize);
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
    for (const pt of pathCoords) {
      ctx.beginPath();
      ctx.arc((pt.col + 0.5) * cellSize, (pt.row + 0.5) * cellSize, cellSize * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFood(ctx, food, cellSize) {
    const x = (food.col + 0.5) * cellSize;
    const y = (food.row + 0.5) * cellSize;
    const radius = cellSize * 0.35;

    ctx.save();
    const time = Date.now() / 280;
    const pulseRadius = radius + Math.sin(time) * (cellSize * 0.07);

    const glowGrad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, pulseRadius * 1.8);
    glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.8)');
    glowGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
    glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSnake(ctx, state, cellSize) {
    const coords = state.snake_coords;
    const isDead = state.state === 'DEAD';
    const isFull = state.state === 'FULL';
    const len = coords.length;
    const padding = cellSize * 0.08;

    ctx.save();

    for (let i = 0; i < len; i++) {
      const pos = coords[i];
      const isHead = i === len - 1;
      const isTail = i === 0;

      const x = pos.col * cellSize + padding;
      const y = pos.row * cellSize + padding;
      const segmentSize = cellSize - padding * 2;
      const radius = isHead ? segmentSize * 0.45 : isTail ? segmentSize * 0.3 : segmentSize * 0.35;

      let fillColor = '#10b981';
      let shadowColor = 'rgba(16, 185, 129, 0.5)';

      if (isDead) {
        fillColor = '#ef4444';
        shadowColor = 'rgba(239, 68, 68, 0.8)';
      } else if (isFull) {
        fillColor = '#fbbf24';
        shadowColor = 'rgba(251, 191, 36, 0.8)';
      } else {
        const progress = i / len;
        const r = Math.round(16 + progress * (5 - 16));
        const g = Math.round(185 + progress * (230 - 185));
        const b = Math.round(129 + progress * (160 - 129));
        fillColor = `rgb(${r}, ${g}, ${b})`;
      }

      ctx.fillStyle = fillColor;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = isHead ? 12 : 5;

      this.drawRoundedRect(ctx, x, y, segmentSize, segmentSize, radius);
      ctx.fill();

      if (isHead) {
        this.drawHeadDetails(ctx, pos, state.direction, cellSize, isDead);
      }
    }
    ctx.restore();
  }

  drawHeadDetails(ctx, headPos, direction, cellSize, isDead) {
    const cx = (headPos.col + 0.5) * cellSize;
    const cy = (headPos.row + 0.5) * cellSize;
    const eyeRadius = cellSize * 0.12;
    const pupilRadius = cellSize * 0.06;

    let eye1 = { x: -0.2 * cellSize, y: -0.2 * cellSize };
    let eye2 = { x: 0.2 * cellSize, y: -0.2 * cellSize };
    let pupilDir = { x: 0, y: -0.04 * cellSize };

    if (direction === 'UP') {
      eye1 = { x: -0.2 * cellSize, y: -0.15 * cellSize };
      eye2 = { x: 0.2 * cellSize, y: -0.15 * cellSize };
      pupilDir = { x: 0, y: -0.04 * cellSize };
    } else if (direction === 'DOWN') {
      eye1 = { x: -0.2 * cellSize, y: 0.15 * cellSize };
      eye2 = { x: 0.2 * cellSize, y: 0.15 * cellSize };
      pupilDir = { x: 0, y: 0.04 * cellSize };
    } else if (direction === 'LEFT') {
      eye1 = { x: -0.15 * cellSize, y: -0.2 * cellSize };
      eye2 = { x: -0.15 * cellSize, y: 0.2 * cellSize };
      pupilDir = { x: -0.04 * cellSize, y: 0 };
    } else if (direction === 'RIGHT') {
      eye1 = { x: 0.15 * cellSize, y: -0.2 * cellSize };
      eye2 = { x: 0.15 * cellSize, y: 0.2 * cellSize };
      pupilDir = { x: 0.04 * cellSize, y: 0 };
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.arc(cx + eye1.x, cy + eye1.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + eye2.x, cy + eye2.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    if (isDead) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      this.drawEyeX(ctx, cx + eye1.x, cy + eye1.y, pupilRadius * 1.5);
      this.drawEyeX(ctx, cx + eye2.x, cy + eye2.y, pupilRadius * 1.5);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx + eye1.x + pupilDir.x, cy + eye1.y + pupilDir.y, pupilRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + eye2.x + pupilDir.x, cy + eye2.y + pupilDir.y, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEyeX(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  window.snakeApp = new SnakeApp();
});
