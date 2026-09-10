/**
 * Snake Arena - Frontend Controller & Canvas Renderer
 * Multi-Screen Flow, Persistent Settings, Custom Themes, & Phone Optimization
 */

// ==========================================================================
// 1. SOUND MANAGER (Web Audio Synthesizer)
// ==========================================================================
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

  toggle(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
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

  playClick() {
    this.playTone(400, 'sine', 0.04, 0.08);
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
    [330, 220, 110, 80].forEach((freq, idx) => {
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

// ==========================================================================
// 2. PARTICLE FX ENGINE
// ==========================================================================
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, color = '#fbbf24', count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4.0 + 1.2;
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

// ==========================================================================
// 3. MAIN SNAKE ARENA APPLICATION
// ==========================================================================
class SnakeApp {
  static STORAGE_KEY = 'snake_arena_user_settings_v3';

  constructor() {
    this.gameId = 'arena_' + Math.random().toString(36).substring(2, 7);
    this.gameState = null;
    this.highScore = 3;
    this.currentScreen = 'start'; // 'start' | 'game'

    // Default User Settings (Overridden by localStorage)
    this.settings = {
      theme: 'emerald',
      customBgColor: '#090d16',
      snakeSkin: 'emerald',
      foodStyle: 'orb',
      gridSize: 6,
      speed: 80,
      mode: 'human',
      controlLayout: 'both',
      sensitivity: 'high',
      hapticsEnabled: true,
      soundEnabled: true,
      showGrid: true,
      showAiPath: true,
      particlesEnabled: true,
      playerName: 'Player',
    };

    // Touch & Swipe Engine
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchActive = false;
    this.swipeThreshold = 10;

    // Infrastructure
    this.ws = null;
    this.wsConnected = false;
    this.sound = new SoundManager();
    this.particles = new ParticleSystem();

    // Canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.cacheDom();
    this.loadSettings();
    this.applySettingsToDom();
    this.bindEvents();
    this.setupSwipeGestures();
    this.resizeCanvas();

    // Initial Database & Server Connection
    this.fetchDbHighScore();
    this.connectWs();
    this.startAnimationLoop();
  }

  // --- DOM Caching ---
  cacheDom() {
    this.dom = {
      // Background
      body: document.body,
      appBackground: document.getElementById('appBackground'),
      glow1: document.getElementById('glow1'),
      glow2: document.getElementById('glow2'),
      glow3: document.getElementById('glow3'),

      // Screens
      startScreen: document.getElementById('startScreen'),
      gameScreen: document.getElementById('gameScreen'),

      // Start Screen Elements
      startPlayerName: document.getElementById('startPlayerName'),
      startPlayerBadge: document.getElementById('startPlayerBadge'),
      startThemeQuickBtn: document.getElementById('startThemeQuickBtn'),
      startSoundBtn: document.getElementById('startSoundBtn'),
      startSoundIcon: document.getElementById('startSoundIcon'),
      startSettingsBtn: document.getElementById('startSettingsBtn'),
      startHighScoreVal: document.getElementById('startHighScoreVal'),
      startGlobalHighVal: document.getElementById('startGlobalHighVal'),
      startLeaderboardBtn: document.getElementById('startLeaderboardBtn'),
      startModeCards: document.querySelectorAll('.start-mode-card'),
      mainPlayBtn: document.getElementById('mainPlayBtn'),
      startOpenSettingsBtn: document.getElementById('startOpenSettingsBtn'),
      startOpenLeaderboardBtn: document.getElementById('startOpenLeaderboardBtn'),

      // In-Game Screen Elements
      hudHomeBtn: document.getElementById('hudHomeBtn'),
      hudModePill: document.getElementById('hudModePill'),
      hudModeLabel: document.getElementById('hudModeLabel'),
      hudScore: document.getElementById('hudScore'),
      hudHighScore: document.getElementById('hudHighScore'),
      hudPauseBtn: document.getElementById('hudPauseBtn'),
      hudPauseIcon: document.getElementById('hudPauseIcon'),
      hudRestartBtn: document.getElementById('hudRestartBtn'),
      hudSettingsBtn: document.getElementById('hudSettingsBtn'),
      hudSoundBtn: document.getElementById('hudSoundBtn'),
      hudSoundIcon: document.getElementById('hudSoundIcon'),
      hudMoves: document.getElementById('hudMoves'),
      hudTime: document.getElementById('hudTime'),
      hudProgressBar: document.getElementById('hudProgressBar'),
      canvasBox: document.getElementById('canvasBox'),
      canvasPauseOverlay: document.getElementById('canvasPauseOverlay'),
      pauseResumeBtn: document.getElementById('pauseResumeBtn'),
      gestureIndicator: document.getElementById('gestureIndicator'),
      swipeFloatingHint: document.getElementById('swipeFloatingHint'),

      // Mobile Quick Actions & D-Pad
      gameQuickBar: document.getElementById('gameQuickBar'),
      gqbPauseBtn: document.getElementById('gqbPauseBtn'),
      gqbPauseIcon: document.getElementById('gqbPauseIcon'),
      gqbPauseLabel: document.getElementById('gqbPauseLabel'),
      gqbRestartBtn: document.getElementById('gqbRestartBtn'),
      gqbSpeedBtn: document.getElementById('gqbSpeedBtn'),
      gqbSpeedLabel: document.getElementById('gqbSpeedLabel'),
      gqbThemeBtn: document.getElementById('gqbThemeBtn'),
      phoneDpadContainer: document.getElementById('phoneDpadContainer'),
      dpadUp: document.getElementById('dpadUp'),
      dpadDown: document.getElementById('dpadDown'),
      dpadLeft: document.getElementById('dpadLeft'),
      dpadRight: document.getElementById('dpadRight'),
      dpadCenterBtn: document.getElementById('dpadCenterBtn'),

      // Game Over / End Game Modal
      gameOverModal: document.getElementById('gameOverModal'),
      modalIcon: document.getElementById('modalIcon'),
      modalTitle: document.getElementById('modalTitle'),
      modalDesc: document.getElementById('modalDesc'),
      newRecordBadge: document.getElementById('newRecordBadge'),
      modalFinalScore: document.getElementById('modalFinalScore'),
      modalHighScoreRecord: document.getElementById('modalHighScoreRecord'),
      modalFinalMoves: document.getElementById('modalFinalMoves'),
      modalFinalTime: document.getElementById('modalFinalTime'),
      saveScoreForm: document.getElementById('saveScoreForm'),
      playerNameInput: document.getElementById('playerNameInput'),
      saveFeedback: document.getElementById('saveFeedback'),
      endGameScoresBody: document.getElementById('endGameScoresBody'),
      endViewFullScoresBtn: document.getElementById('endViewFullScoresBtn'),
      modalRestartBtn: document.getElementById('modalRestartBtn'),
      modalSettingsBtn: document.getElementById('modalSettingsBtn'),
      modalHomeBtn: document.getElementById('modalHomeBtn'),

      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      themePaletteGrid: document.getElementById('themePaletteGrid'),
      themeChips: document.querySelectorAll('.theme-chip'),
      customBgColorInput: document.getElementById('customBgColorInput'),
      customColorCode: document.getElementById('customColorCode'),
      snakeSkinChips: document.querySelectorAll('#snakeSkinGroup .select-chip'),
      foodStyleChips: document.querySelectorAll('#foodStyleGroup .select-chip'),
      settingsGridChips: document.querySelectorAll('#settingsGridGroup .select-chip'),
      settingsSpeedSlider: document.getElementById('settingsSpeedSlider'),
      settingsSpeedBadge: document.getElementById('settingsSpeedBadge'),
      settingsSpeedChips: document.querySelectorAll('#settingsSpeedChips .speed-chip'),
      controlLayoutChips: document.querySelectorAll('#controlLayoutGroup .select-chip'),
      swipeSensitivityChips: document.querySelectorAll('#swipeSensitivityGroup .select-chip'),
      toggleHaptics: document.getElementById('toggleHaptics'),
      toggleSound: document.getElementById('toggleSound'),
      toggleParticles: document.getElementById('toggleParticles'),
      toggleGrid: document.getElementById('toggleGrid'),
      toggleAiPath: document.getElementById('toggleAiPath'),
      settingsNicknameInput: document.getElementById('settingsNicknameInput'),
      resetSettingsBtn: document.getElementById('resetSettingsBtn'),
      saveSettingsDoneBtn: document.getElementById('saveSettingsDoneBtn'),

      // Leaderboard Modal
      leaderboardModal: document.getElementById('leaderboardModal'),
      closeLeaderboardBtn: document.getElementById('closeLeaderboardBtn'),
      lbTabs: document.querySelectorAll('.lb-tab'),
      leaderboardTableBody: document.getElementById('leaderboardTableBody'),
    };
  }

  // ==========================================================================
  // SETTINGS & LOCAL STORAGE PERSISTENCE
  // ==========================================================================
  loadSettings() {
    try {
      const saved = localStorage.getItem(SnakeApp.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch (e) {
      console.warn('Could not load settings from localStorage:', e);
    }

    // Apply sensitivity threshold
    this.updateSensitivityThreshold();
    this.sound.toggle(this.settings.soundEnabled);
  }

  saveSettings() {
    try {
      localStorage.setItem(SnakeApp.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage:', e);
    }
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    this.applySettingsToDom();
  }

  updateSensitivityThreshold() {
    if (this.settings.sensitivity === 'ultra') {
      this.swipeThreshold = 6;
    } else if (this.settings.sensitivity === 'normal') {
      this.swipeThreshold = 18;
    } else {
      this.swipeThreshold = 10; // high
    }
  }

  applySettingsToDom() {
    // Theme
    this.applyTheme(this.settings.theme, this.settings.customBgColor);

    // Player Nickname
    if (this.dom.startPlayerName) {
      this.dom.startPlayerName.textContent = this.settings.playerName || 'Player';
    }
    if (this.dom.playerNameInput) {
      this.dom.playerNameInput.value = this.settings.playerName || 'Player';
    }
    if (this.dom.settingsNicknameInput) {
      this.dom.settingsNicknameInput.value = this.settings.playerName || 'Player';
    }

    // Mode Active Chips
    this.dom.startModeCards.forEach((c) => {
      c.classList.toggle('active', c.dataset.mode === this.settings.mode);
    });

    // Theme Chips
    this.dom.themeChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.theme === this.settings.theme);
    });

    if (this.dom.customBgColorInput) {
      this.dom.customBgColorInput.value = this.settings.customBgColor || '#090d16';
    }
    if (this.dom.customColorCode) {
      this.dom.customColorCode.textContent = this.settings.customBgColor || '#090d16';
    }

    // Snake Skin Chips
    this.dom.snakeSkinChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.skin === this.settings.snakeSkin);
    });

    // Food Style Chips
    this.dom.foodStyleChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.food === this.settings.foodStyle);
    });

    // Grid Size Chips
    this.dom.settingsGridChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.dataset.grid, 10) === this.settings.gridSize);
    });

    // Speed Slider & Badge
    if (this.dom.settingsSpeedSlider) {
      this.dom.settingsSpeedSlider.value = this.settings.speed;
    }
    if (this.dom.settingsSpeedBadge) {
      this.dom.settingsSpeedBadge.textContent = `${this.settings.speed} ms`;
    }
    this.dom.settingsSpeedChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.dataset.speed, 10) === this.settings.speed);
    });

    // Control Layout
    this.dom.controlLayoutChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.layout === this.settings.controlLayout);
    });

    // D-Pad Visibility based on Control Layout
    if (this.dom.phoneDpadContainer) {
      if (this.settings.controlLayout === 'swipe') {
        this.dom.phoneDpadContainer.classList.add('hidden');
      } else {
        this.dom.phoneDpadContainer.classList.remove('hidden');
      }
    }

    // Sensitivity
    this.dom.swipeSensitivityChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.sensitivity === this.settings.sensitivity);
    });
    this.updateSensitivityThreshold();

    // Toggles
    if (this.dom.toggleHaptics) this.dom.toggleHaptics.checked = this.settings.hapticsEnabled;
    if (this.dom.toggleSound) this.dom.toggleSound.checked = this.settings.soundEnabled;
    if (this.dom.toggleParticles) this.dom.toggleParticles.checked = this.settings.particlesEnabled;
    if (this.dom.toggleGrid) this.dom.toggleGrid.checked = this.settings.showGrid;
    if (this.dom.toggleAiPath) this.dom.toggleAiPath.checked = this.settings.showAiPath;

    // Sound Icons
    const soundIcon = this.settings.soundEnabled ? '🔊' : '🔇';
    if (this.dom.startSoundIcon) this.dom.startSoundIcon.textContent = soundIcon;
    if (this.dom.hudSoundIcon) this.dom.hudSoundIcon.textContent = soundIcon;

    // HUD Mode Labels
    const modeLabels = {
      human: '👤 Human',
      graph: '🧠 Graph AI',
      rl: '🤖 RL Agent',
    };
    if (this.dom.hudModeLabel) {
      this.dom.hudModeLabel.textContent = modeLabels[this.settings.mode] || this.settings.mode;
    }
  }

  applyTheme(themeName, customColor = null) {
    const validThemes = ['emerald', 'violet', 'ocean', 'crimson', 'matrix', 'neon', 'gold', 'oled'];
    validThemes.forEach((t) => document.body.classList.remove(`theme-${t}`));

    if (themeName === 'custom' && customColor) {
      document.body.style.setProperty('--bg-dark', customColor);
    } else {
      document.body.style.removeProperty('--bg-dark');
      const chosen = validThemes.includes(themeName) ? themeName : 'emerald';
      document.body.classList.add(`theme-${chosen}`);
    }
  }

  cycleTheme() {
    const themes = ['emerald', 'violet', 'ocean', 'crimson', 'matrix', 'neon', 'gold', 'oled'];
    const currentIdx = themes.indexOf(this.settings.theme);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    this.updateSetting('theme', nextTheme);
    this.triggerHaptic(15);
  }

  // ==========================================================================
  // SCREEN CONTROLLER (Start Screen <-> Game Screen)
  // ==========================================================================
  showScreen(screenName) {
    this.currentScreen = screenName;
    if (screenName === 'game') {
      this.dom.startScreen.classList.remove('active');
      this.dom.gameScreen.classList.add('active');
      this.resizeCanvas();
      this.restartGame();
    } else {
      this.dom.gameScreen.classList.remove('active');
      this.dom.startScreen.classList.add('active');
      this.dom.gameOverModal.classList.add('hidden');
      this.sendWs({ type: 'PAUSE' });
      this.fetchDbHighScore();
    }
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================
  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // --- Start Screen Events ---
    this.dom.mainPlayBtn.addEventListener('click', () => {
      this.sound.playClick();
      this.triggerHaptic(20);
      this.showScreen('game');
    });

    this.dom.startModeCards.forEach((card) => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        this.updateSetting('mode', mode);
        this.sound.playClick();
        this.triggerHaptic(12);
        this.fetchDbHighScore();
      });
    });

    this.dom.startThemeQuickBtn.addEventListener('click', () => this.cycleTheme());
    this.dom.startSoundBtn.addEventListener('click', () => this.toggleSound());
    this.dom.startSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.startOpenSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.startLeaderboardBtn.addEventListener('click', () => this.openLeaderboard());
    this.dom.startOpenLeaderboardBtn.addEventListener('click', () => this.openLeaderboard());

    this.dom.startPlayerBadge.addEventListener('click', () => {
      const newName = prompt('Enter your player nickname:', this.settings.playerName);
      if (newName !== null && newName.trim()) {
        this.updateSetting('playerName', newName.trim().substring(0, 15));
      }
    });

    // --- In-Game Screen Events ---
    this.dom.hudHomeBtn.addEventListener('click', () => {
      this.sound.playClick();
      this.showScreen('start');
    });

    this.dom.hudPauseBtn.addEventListener('click', () => {
      this.togglePause();
      this.triggerHaptic(12);
    });

    this.dom.pauseResumeBtn.addEventListener('click', () => {
      this.togglePause();
      this.triggerHaptic(12);
    });

    this.dom.hudRestartBtn.addEventListener('click', () => {
      this.restartGame();
      this.triggerHaptic(20);
    });

    this.dom.hudSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.hudSoundBtn.addEventListener('click', () => this.toggleSound());

    // In-Game Quick Action Bar
    this.dom.gqbPauseBtn.addEventListener('click', () => {
      this.togglePause();
      this.triggerHaptic(12);
    });

    this.dom.gqbRestartBtn.addEventListener('click', () => {
      this.restartGame();
      this.triggerHaptic(20);
    });

    this.dom.gqbSpeedBtn.addEventListener('click', () => {
      const speeds = [200, 80, 50, 30, 20];
      const names = { 200: 'Chill', 80: 'Normal', 50: 'Fast', 30: 'Turbo', 20: 'Hyper' };
      const nextIdx = (speeds.indexOf(this.settings.speed) + 1) % speeds.length;
      const nextSpeed = speeds[nextIdx];
      this.updateSetting('speed', nextSpeed);
      this.dom.gqbSpeedLabel.textContent = `⚡ ${names[nextSpeed]}`;
      this.setSpeed(nextSpeed);
      this.triggerHaptic(12);
    });

    this.dom.gqbThemeBtn.addEventListener('click', () => this.cycleTheme());

    // --- End Game Modal Events ---
    this.dom.modalRestartBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.add('hidden');
      this.restartGame();
      this.triggerHaptic(20);
    });

    this.dom.modalSettingsBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.add('hidden');
      this.openSettingsModal();
    });

    this.dom.modalHomeBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.add('hidden');
      this.showScreen('start');
    });

    this.dom.endViewFullScoresBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.add('hidden');
      this.openLeaderboard();
    });

    this.dom.saveScoreForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitScoreToDb();
    });

    // --- Settings Modal Events ---
    this.dom.closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    this.dom.saveSettingsDoneBtn.addEventListener('click', () => this.closeSettingsModal());

    this.dom.themeChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.updateSetting('theme', chip.dataset.theme);
        this.triggerHaptic(12);
      });
    });

    this.dom.customBgColorInput.addEventListener('input', (e) => {
      const color = e.target.value;
      this.settings.customBgColor = color;
      this.settings.theme = 'custom';
      this.saveSettings();
      this.applySettingsToDom();
    });

    this.dom.snakeSkinChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.updateSetting('snakeSkin', chip.dataset.skin);
        this.triggerHaptic(10);
      });
    });

    this.dom.foodStyleChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.updateSetting('foodStyle', chip.dataset.food);
        this.triggerHaptic(10);
      });
    });

    this.dom.settingsGridChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const size = parseInt(chip.dataset.grid, 10);
        this.updateSetting('gridSize', size);
        this.triggerHaptic(15);
        if (this.currentScreen === 'game') {
          this.restartGame();
        }
      });
    });

    this.dom.settingsSpeedSlider.addEventListener('input', (e) => {
      const speed = parseInt(e.target.value, 10);
      this.updateSetting('speed', speed);
      this.setSpeed(speed);
    });

    this.dom.settingsSpeedChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const speed = parseInt(chip.dataset.speed, 10);
        this.updateSetting('speed', speed);
        this.setSpeed(speed);
        this.triggerHaptic(10);
      });
    });

    this.dom.controlLayoutChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.updateSetting('controlLayout', chip.dataset.layout);
        this.triggerHaptic(12);
      });
    });

    this.dom.swipeSensitivityChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.updateSetting('sensitivity', chip.dataset.sensitivity);
        this.triggerHaptic(12);
      });
    });

    this.dom.toggleHaptics.addEventListener('change', (e) => {
      this.updateSetting('hapticsEnabled', e.target.checked);
    });

    this.dom.toggleSound.addEventListener('change', (e) => {
      this.updateSetting('soundEnabled', e.target.checked);
      this.sound.toggle(e.target.checked);
    });

    this.dom.toggleParticles.addEventListener('change', (e) => {
      this.updateSetting('particlesEnabled', e.target.checked);
    });

    this.dom.toggleGrid.addEventListener('change', (e) => {
      this.updateSetting('showGrid', e.target.checked);
    });

    this.dom.toggleAiPath.addEventListener('change', (e) => {
      this.updateSetting('showAiPath', e.target.checked);
    });

    this.dom.settingsNicknameInput.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        this.updateSetting('playerName', val.substring(0, 15));
      }
    });

    this.dom.resetSettingsBtn.addEventListener('click', () => {
      if (confirm('Reset all game settings to default?')) {
        this.settings = {
          theme: 'emerald',
          customBgColor: '#090d16',
          snakeSkin: 'emerald',
          foodStyle: 'orb',
          gridSize: 6,
          speed: 80,
          mode: 'human',
          controlLayout: 'both',
          sensitivity: 'high',
          hapticsEnabled: true,
          soundEnabled: true,
          showGrid: true,
          showAiPath: true,
          particlesEnabled: true,
          playerName: 'Player',
        };
        this.saveSettings();
        this.applySettingsToDom();
        this.triggerHaptic(20);
      }
    });

    // --- Leaderboard Modal Events ---
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

    // --- Zero-Latency Touch D-Pad Events ---
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

    if (this.dom.dpadCenterBtn) {
      this.dom.dpadCenterBtn.addEventListener('click', () => {
        this.togglePause();
        this.triggerHaptic(15);
      });
    }
  }

  // --- Haptic Feedback Helper ---
  triggerHaptic(ms = 12) {
    if (this.settings.hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        // Haptic unsupported
      }
    }
  }

  toggleSound() {
    const newState = this.sound.toggle();
    this.updateSetting('soundEnabled', newState);
    this.triggerHaptic(12);
  }

  openSettingsModal() {
    this.sound.playClick();
    this.dom.settingsModal.classList.remove('hidden');
  }

  closeSettingsModal() {
    this.dom.settingsModal.classList.add('hidden');
  }

  // ==========================================================================
  // ULTRA-SENSITIVE CONTINUOUS TOUCH & GESTURE ENGINE
  // ==========================================================================
  setupSwipeGestures() {
    const target = this.dom.canvasBox || this.canvas;
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
        if (this.dom.swipeFloatingHint) {
          this.dom.swipeFloatingHint.classList.add('hidden');
        }

        let dir = 'RIGHT';
        if (absX > absY) {
          dir = deltaX > 0 ? 'RIGHT' : 'LEFT';
        } else {
          dir = deltaY > 0 ? 'DOWN' : 'UP';
        }

        this.sendDirection(dir);
        this.triggerHaptic(10);
        this.showGestureRipple(clientX, clientY);

        // Reset origin immediately to allow fluid continuous turns!
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

    // Touch events on canvas and container
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

  showGestureRipple(clientX, clientY) {
    const indicator = this.dom.gestureIndicator;
    const wrapper = this.dom.canvasBox;
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
      }, 200);
    }
  }

  handleKeyDown(e) {
    const key = e.key;

    if (this.currentScreen === 'start') {
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        this.showScreen('game');
      }
      return;
    }

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
      this.toggleSound();
    } else if (['KeyH', 'h', 'H'].includes(key)) {
      e.preventDefault();
      this.openLeaderboard();
    }
  }

  resizeCanvas() {
    const box = this.dom.canvasBox;
    if (!box) return;
    const size = Math.min(box.clientWidth || 440, box.clientHeight || 440, 500);
    if (size <= 0) return;

    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.displaySize = size;
  }

  // ==========================================================================
  // WEBSOCKET CONNECTION
  // ==========================================================================
  connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || '127.0.0.1:8000';
    const wsUrl = `${protocol}//${host}/ws/game/${this.gameId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.sendWs({
          type: 'RESET',
          grid_size: this.settings.gridSize,
          mode: this.settings.mode,
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

  // ==========================================================================
  // GAMEPLAY ACTIONS
  // ==========================================================================
  sendDirection(direction) {
    if (this.settings.mode !== 'human') {
      this.updateSetting('mode', 'human');
      this.sendWs({ type: 'CHANGE_MODE', mode: 'human' });
    }
    this.sendWs({ type: 'MOVE', direction });
  }

  setSpeed(speed) {
    this.settings.speed = speed;
    this.sendWs({ type: 'SET_SPEED', speed });
  }

  togglePause() {
    this.sendWs({ type: 'TOGGLE_PAUSE' });
  }

  restartGame() {
    this.dom.gameOverModal.classList.add('hidden');
    this.dom.saveFeedback.classList.add('hidden');
    this.sendWs({
      type: 'RESET',
      grid_size: this.settings.gridSize,
      mode: this.settings.mode,
    });
  }

  // ==========================================================================
  // DATABASE HIGH SCORES & LEADERBOARD
  // ==========================================================================
  async fetchDbHighScore() {
    try {
      const res = await fetch(`/api/scores/top?mode=${this.settings.mode}`);
      if (res.ok) {
        const data = await res.json();
        const topScore = Math.max(data.high_score || 0, this.highScore);
        this.highScore = topScore;
        if (this.dom.hudHighScore) this.dom.hudHighScore.textContent = this.highScore;
        if (this.dom.startHighScoreVal) this.dom.startHighScoreVal.textContent = this.highScore;
        if (this.dom.modalHighScoreRecord) this.dom.modalHighScoreRecord.textContent = this.highScore;
      }

      // Fetch global highest across all modes
      const globalRes = await fetch('/api/scores/top');
      if (globalRes.ok) {
        const globalData = await globalRes.json();
        if (this.dom.startGlobalHighVal) {
          this.dom.startGlobalHighVal.textContent = globalData.high_score || 3;
        }
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
      '<tr><td colspan="7" class="table-empty">Loading scores...</td></tr>';
    try {
      const url = mode ? `/api/scores?mode=${mode}&limit=15` : '/api/scores?limit=15';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.renderLeaderboardTable(data.scores || []);
      }
    } catch (e) {
      this.dom.leaderboardTableBody.innerHTML =
        '<tr><td colspan="7" class="table-empty">Failed to load scores.</td></tr>';
    }
  }

  renderLeaderboardTable(scores) {
    if (scores.length === 0) {
      this.dom.leaderboardTableBody.innerHTML =
        '<tr><td colspan="7" class="table-empty">No scores recorded yet. Be the first!</td></tr>';
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
          <td>${Number(s.grid_size)}×${Number(s.grid_size)}</td>
          <td><strong style="color: #34d399;">${Number(s.score)}</strong></td>
          <td>${Number(s.moves)}</td>
          <td>${s.time_seconds ? s.time_seconds + 's' : '--'}</td>
        </tr>
      `;
    });
    this.dom.leaderboardTableBody.innerHTML = html;
  }

  async loadEndGameMiniLeaderboard() {
    try {
      const res = await fetch(`/api/scores?mode=${this.settings.mode}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        const scores = data.scores || [];
        if (scores.length === 0) {
          this.dom.endGameScoresBody.innerHTML =
            '<tr><td colspan="4" class="table-loading">No scores recorded yet.</td></tr>';
          return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        let html = '';
        scores.slice(0, 5).forEach((s, idx) => {
          const rank = medals[idx] || `${idx + 1}`;
          const modeEmoji = s.mode === 'human' ? '👤' : s.mode === 'rl' ? '🤖' : '🧠';
          const safeName = this.escapeHtml(s.player_name || 'Anonymous');
          html += `
            <tr>
              <td><strong>${rank}</strong></td>
              <td>${safeName}</td>
              <td>${modeEmoji}</td>
              <td><strong style="color: #34d399;">${Number(s.score)}</strong></td>
            </tr>
          `;
        });
        this.dom.endGameScoresBody.innerHTML = html;
      }
    } catch (e) {
      this.dom.endGameScoresBody.innerHTML =
        '<tr><td colspan="4" class="table-loading">Failed to load scores.</td></tr>';
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async submitScoreToDb() {
    if (!this.gameState) return;
    const name = this.dom.playerNameInput.value.trim() || this.settings.playerName || 'Player';
    this.updateSetting('playerName', name);

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
        this.loadEndGameMiniLeaderboard();
      }
    } catch (e) {
      console.error('Save score error:', e);
    }
  }

  // ==========================================================================
  // EVENT & STATE HANDLERS
  // ==========================================================================
  handleServerEvent(event, data) {
    if (event === 'FOOD_EATEN') {
      this.sound.playEat();
      if (this.settings.particlesEnabled && data && data.food) {
        const cellSize = this.displaySize / data.grid_size;
        const x = (data.food.col + 0.5) * cellSize;
        const y = (data.food.row + 0.5) * cellSize;
        this.particles.spawn(x, y, '#fbbf24', 22);
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

    // Check High Score
    const isNewHighScore = state.score > this.highScore;
    if (isNewHighScore) {
      this.highScore = state.score;
      if (this.dom.hudHighScore) this.dom.hudHighScore.textContent = this.highScore;
      if (this.dom.startHighScoreVal) this.dom.startHighScoreVal.textContent = this.highScore;
    }

    if (this.dom.hudScore) this.dom.hudScore.textContent = state.score;
    if (this.dom.hudMoves) this.dom.hudMoves.textContent = state.moves;
    if (this.dom.hudTime) this.dom.hudTime.textContent = `${state.elapsed_seconds}s`;

    const progressPct = Math.min(100, Math.round((state.score / state.max_score) * 100));
    if (this.dom.hudProgressBar) {
      this.dom.hudProgressBar.style.width = `${progressPct}%`;
    }

    // Pause UI
    if (this.dom.canvasPauseOverlay) {
      this.dom.canvasPauseOverlay.classList.toggle('hidden', !state.paused);
    }
    if (this.dom.hudPauseIcon) {
      this.dom.hudPauseIcon.textContent = state.paused ? '▶️' : '⏸️';
    }
    if (this.dom.gqbPauseIcon) {
      this.dom.gqbPauseIcon.textContent = state.paused ? '▶️' : '⏸️';
    }
    if (this.dom.gqbPauseLabel) {
      this.dom.gqbPauseLabel.textContent = state.paused ? 'Resume' : 'Pause';
    }

    // End Game Modal Triggering (When snake dies or wins)
    if (state.state === 'DEAD' || state.state === 'FULL') {
      if (this.currentScreen === 'game') {
        this.showGameOverModal(state, isNewHighScore);
      }
    }
  }

  showGameOverModal(state, isNewHighScore) {
    const isWin = state.state === 'FULL';
    this.dom.modalIcon.textContent = isWin ? '👑' : '💀';
    this.dom.modalTitle.textContent = isWin ? 'VICTORY!' : 'GAME OVER';
    this.dom.modalDesc.textContent = isWin
      ? 'Spectacular! The snake filled the entire arena!'
      : 'The snake hit a wall or collided with itself.';

    this.dom.newRecordBadge.classList.toggle('hidden', !isNewHighScore);

    this.dom.modalFinalScore.textContent = state.score;
    this.dom.modalHighScoreRecord.textContent = this.highScore;
    this.dom.modalFinalMoves.textContent = state.moves;
    this.dom.modalFinalTime.textContent = `${state.elapsed_seconds}s`;

    this.dom.playerNameInput.value = this.settings.playerName || 'Player';
    this.dom.saveFeedback.classList.add('hidden');

    this.loadEndGameMiniLeaderboard();
    this.dom.gameOverModal.classList.remove('hidden');

    // Trigger celebration particles on new high score or victory
    if (isNewHighScore || isWin) {
      this.particles.spawn(this.displaySize / 2, this.displaySize / 2, '#fbbf24', 40);
    }
  }

  // ==========================================================================
  // RENDERING LOOP & CANVAS GRAPHICS
  // ==========================================================================
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

    // Board Background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, size, size);

    if (!this.gameState) return;

    const grid = this.gameState.grid_size;
    const cellSize = size / grid;

    // Grid lines
    if (this.settings.showGrid) {
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
    if (this.settings.showAiPath && this.gameState.ai_path && this.gameState.ai_path.length > 0) {
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
    if (this.settings.particlesEnabled) {
      this.particles.update();
      this.particles.draw(ctx);
    }
  }

  drawAiPath(ctx, pathCoords, cellSize) {
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
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
    ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
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
    const style = this.settings.foodStyle;

    ctx.save();
    const time = Date.now() / 280;
    const pulseRadius = radius + Math.sin(time) * (cellSize * 0.06);

    if (style === 'apple') {
      // 🍎 Apple style
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y + radius * 0.1, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Leaf
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(x + radius * 0.3, y - radius * 0.6, radius * 0.3, radius * 0.15, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // Shine
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - radius * 0.25, y - radius * 0.2, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();

    } else if (style === 'gem') {
      // 💎 Gem style
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(x, y - radius * 0.6);
      ctx.lineTo(x + radius * 0.5, y);
      ctx.lineTo(x, y + radius * 0.6);
      ctx.lineTo(x - radius * 0.5, y);
      ctx.closePath();
      ctx.fill();

    } else if (style === 'star') {
      // ⭐ Star style
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fbbf24';
      this.drawStar(ctx, x, y, 5, radius * 0.9, radius * 0.45);
      ctx.fill();

    } else {
      // 🟡 Glow Orb (Default)
      const glowGrad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, pulseRadius * 1.8);
      glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
      glowGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.3)');
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
    }

    ctx.restore();
  }

  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  drawSnake(ctx, state, cellSize) {
    const coords = state.snake_coords;
    const isDead = state.state === 'DEAD';
    const isFull = state.state === 'FULL';
    const len = coords.length;
    const padding = cellSize * 0.08;
    const skin = this.settings.snakeSkin;

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
        if (skin === 'cyan') {
          fillColor = `hsl(${190 + progress * 20}, 90%, ${45 + progress * 20}%)`;
          shadowColor = 'rgba(6, 182, 212, 0.5)';
        } else if (skin === 'gold') {
          fillColor = `hsl(${40 + progress * 15}, 95%, ${45 + progress * 20}%)`;
          shadowColor = 'rgba(245, 158, 11, 0.5)';
        } else if (skin === 'magenta') {
          fillColor = `hsl(${310 + progress * 30}, 85%, ${45 + progress * 20}%)`;
          shadowColor = 'rgba(236, 72, 153, 0.5)';
        } else if (skin === 'rainbow') {
          const hue = ((Date.now() / 20) + i * 20) % 360;
          fillColor = `hsl(${hue}, 90%, 55%)`;
          shadowColor = `hsla(${hue}, 90%, 55%, 0.6)`;
        } else {
          // Emerald Default
          const r = Math.round(16 + progress * (5 - 16));
          const g = Math.round(185 + progress * (230 - 185));
          const b = Math.round(129 + progress * (160 - 129));
          fillColor = `rgb(${r}, ${g}, ${b})`;
          shadowColor = 'rgba(16, 185, 129, 0.5)';
        }
      }

      ctx.fillStyle = fillColor;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = isHead ? 14 : 6;

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

// Start application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.snakeApp = new SnakeApp();
});
