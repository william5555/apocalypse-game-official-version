(function (window) {
  class GameState {
    constructor() {
      this.cardId = null;
      this.shotId = null;
      this.chapter = null;
      this.decisions = new Map();
      this.metrics = {
        creativity: 0, greed: 0,
        unity: 0, xenophobia: 0,
        wisdom: 0, cunning: 0,
        caution: 0, brutality: 0,
        altruism: 0, selfishness: 0
      };
      this.flags = new Map();
      this.shotProgress = new Map();
    }
    
    updateMetric(key, value) {
      if (this.metrics[key] !== undefined) {
        this.metrics[key] = Math.max(-100, Math.min(100, this.metrics[key] + value));
      }
    }
    
    recordDecision(cardId, choice) {
      this.decisions.set(cardId, choice);
    }
    
    recordShotProgress(shotId, data) {
      this.shotProgress.set(shotId, { ...data, timestamp: Date.now() });
    }
  }
  
    class UIManager {
      constructor() {
        this.elements = {};
        this.initElements();
      }
      
      initElements() {
        const roles = ['text', 'choices', 'chapterLabel', 'hint', 'bg'];
        roles.forEach(role => {
          this.elements[role] = document.querySelector(`[data-role="${role}"]`);
        });
      }
      
      // 添加這個方法來更新章節標籤
    updateChapterLabel(chapterName) {
      if (!this.elements.chapterLabel || !chapterName) return;

      // 預設先用原本的 ID（例如 "prologue"）
      let label = chapterName;

      try {
        // 從 GameData.config.chapters 找對應的中文名稱
        const config = window.GameData?.config;
        if (config && Array.isArray(config.chapters)) {
          const found = config.chapters.find(ch => ch.id === chapterName);
          if (found && found.label) {
            label = found.label;  // 例如 "序章：靜默的證詞"
          }
        }
      } catch (e) {
        // 就算讀不到 config，也不要讓整個遊戲炸掉
        console.warn('updateChapterLabel error:', e);
      }

      this.elements.chapterLabel.textContent = label;
    }


    showHint(message, duration = 2000) {
      if (!this.elements.hint) return;
      
      this.elements.hint.textContent = message || '';
      if (message && duration) {
        setTimeout(() => {
          if (this.elements.hint.textContent === message) {
            this.elements.hint.textContent = '';
          }
        }, duration);
      }
    }
    
    clearChoices() {
      if (this.elements.choices) {
        this.elements.choices.innerHTML = '';
      }
    }
    
    createButton(text, onClick, primary = false) {
      const button = document.createElement('button');
      button.className = `choice-btn ${primary ? 'choice-btn--primary' : ''}`;
      button.textContent = text;
      button.onclick = (e) => {
        e.preventDefault();
        onClick();
      };
      return button;
    }
    
    showContinueButton(onClick) {
      this.clearChoices();
      const button = this.createButton('繼續', onClick, true);
      this.elements.choices.appendChild(button);
    }
    
    showChoices(options) {
      this.clearChoices();
      options.forEach(option => {
        const button = this.createButton(option.label, option.onClick);
        this.elements.choices.appendChild(button);
      });
    }
  }
  
  class GameController {
    constructor() {
      this.state = new GameState();
      this.ui = new UIManager();
      this.isPaused = false;
      this.textSpeed = 55;
      this.audioEnabled = true;
      
      this.initControls();
    }
    
    initControls() {
      const container = document.querySelector('.control-panel') || document.body;
      
      const controls = document.createElement('div');
      controls.className = 'control-panel';
      controls.innerHTML = `
        <button data-action="pause" title="暫停/繼續">暫停</button>
        <button data-action="replay" title="重播">重播</button>
        <button data-action="mute" title="靜音">靜音</button>
        <input type="range" min="0" max="100" value="70" 
             title="總音量" data-action="volume" style="width: 60px;">
        <input type="range" min="20" max="200" value="55" 
               title="文字速度" data-action="speed">
      `;
      
      container.appendChild(controls);
      
      // 事件委託
      controls.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        
        switch (action) {
          case 'pause': this.togglePause(); break;
          case 'replay': this.replay(); break;
          case 'mute': this.toggleMute(); break;
        }
      });
      
      controls.addEventListener('input', (e) => {
        const action = e.target.dataset.action; 
        if (action === 'speed') { // 這裡也可以改用 action 變數讓寫法統一
          this.textSpeed = parseInt(e.target.value);
          this.ui.showHint(`文字速度: ${this.textSpeed}`, 1000);
        }
        
        // === 把音量調整搬來這裡 ===
        if (action === 'volume') {
           // 轉成 0.0 ~ 1.0 (例如 50 變成 0.5)
           const vol = parseInt(e.target.value) / 100;
           
           // 呼叫 EffectsManager (記得先確認你有在 game-effects.js 新增 setMasterVolume)
           if (window.GameEffects && window.GameEffects.setMasterVolume) {
               window.GameEffects.setMasterVolume(vol);
           }
           
           this.ui.showHint(`音量: ${Math.round(vol * 100)}%`, 1000);
        }
      });
    }
    
    togglePause() {
      this.isPaused = !this.isPaused;
      
      if (this.isPaused) {
        GameEffects.clearTypewriter();
        this.pauseAllAudio();
        this.ui.showHint('遊戲已暫停');
      } else {
        this.resumeAllAudio();
        this.ui.showHint('遊戲繼續');
      }
      
      const pauseBtn = document.querySelector('[data-action="pause"]');
      if (pauseBtn) {
        pauseBtn.textContent = this.isPaused ? '繼續' : '暫停';
      }
    }
    
    pauseAllAudio() {
      // 由 EffectsManager 統一管理（能暫停 BGM + 所有 SFX/ambient loop）
      if (window.GameEffects?.pauseAllAudio) {
        window.GameEffects.pauseAllAudio();
      }
    }

    resumeAllAudio() {
      // 由 EffectsManager 統一管理（能恢復之前正在播的聲音）
      if (window.GameEffects?.resumeAllAudio) {
        window.GameEffects.resumeAllAudio();
      }
    }

    toggleMute() {
      this.audioEnabled = !GameEffects.toggleMute();
      const muteBtn = document.querySelector('[data-action="mute"]');
      if (muteBtn) {
        muteBtn.textContent = this.audioEnabled ? '靜音' : '音效開';
      }
      this.ui.showHint(this.audioEnabled ? '音效已開啟' : '音效已關閉');
    }
    
    replay() {
      this.ui.showHint('重新播放當前內容');
      
      if (this.isPaused) {
        this.isPaused = false;
        const pauseBtn = document.querySelector('[data-action="pause"]');
        if (pauseBtn) pauseBtn.textContent = '暫停';
      }
      
      GameEffects.clearTypewriter();
      
      if (this.state.shotId) {
        this.playShot(this.state.shotId);
      } else if (this.state.cardId) {
        const card = GameData.getCard(this.state.cardId);
        if (card) this.renderCard(card, true);
      }
    }
    
    // =============== 核心渲染邏輯 ===============
    
    async renderCard(card, instant = false) {
      if (!card) return;

      this.state.cardId = card.id;
      this.state.chapter = card.chapter;
      this.ui.clearChoices();
      this.ui.showHint('');
      GameEffects.clearTypewriter();
      
      if (card.chapter) {
        this.ui.updateChapterLabel(card.chapter);
      }

      // 處理分鏡卡片
      if (card.type === "shot" && card.shotId) {
        await this.playShot(card.shotId);
        return;
      }
      
      // 處理蒙太奇卡片
      if (card.type === "montage" && card.shotSequence) {
        await this.playMontage(card.shotSequence);
        return;
      }
      
      // 設置背景音樂
      if (card.bgm) {
        GameEffects.playBgm(card.bgm);
      }
      
      // 設置背景圖片
      if (card.bg) {
        GameEffects.fadeBackground(card.bg);
      }
      
      // 根據卡片類型渲染
      switch (card.type) {
        case 'sequence':
          await this.renderSequence(card);
          break;
        case 'choice':
          await this.renderChoice(card);
          break;
        case 'report':
          await this.renderReport(card);
          break;
        default: // narration
          await this.renderNarration(card, instant);
          break;
      }
    }
    
    async renderNarration(card, instant) {
      await GameEffects.displayText(this.ui.elements.text, card.text, {
        typewriter: !instant,
        speed: this.textSpeed,
        instant: instant
      });
      
      if (card.next) {
        this.ui.showContinueButton(() => {
          this.goToCard(card.next);
        });
      }
    }
    
    async renderSequence(card) {
      this.ui.showHint('記憶洪流播放中...');
      
      for (const frame of card.frames || []) {
        if (this.isPaused) break;
        
        if (frame.bg) {
          GameEffects.fadeBackground(frame.bg, { transition: 'fade' });
        }
        
        if (frame.sfx) {
          GameEffects.playSfx(frame.sfx);
        }
        
        if (frame.text) {
          this.ui.elements.text.innerHTML = frame.text.join('<br>');
        }
        
        await GameEffects.wait(frame.durationMs || 1000);
      }
      
      if (card.next) {
        this.goToCard(card.next);
      } else {
        this.ui.showHint('記憶片段結束');
      }
    }
    
    async renderChoice(card) {
      this.ui.elements.text.innerHTML = card.question || '';
      
      const options = (card.options || []).map(option => ({
        label: option.label,
        onClick: () => {
          GameEffects.playSfx('SFX_UI_CHOICE_CLICK');
          
          // 記錄決策
          this.state.recordDecision(card.id, option.label);
          
          // 更新指標
          if (option.metrics) {
            Object.entries(option.metrics).forEach(([key, value]) => {
              this.state.updateMetric(key, value);
            });
          }
          
          // 顯示結果或跳轉
          if (option.resultText) {
            this.ui.elements.text.innerHTML = option.resultText;
            this.ui.clearChoices();
            setTimeout(() => {
              if (option.next) this.goToCard(option.next);
            }, 1500);
          } else if (option.next) {
            this.goToCard(option.next);
          }
        }
      }));
      
      this.ui.showChoices(options);
      this.ui.showHint('請做出你的選擇...');
    }
    
    async renderReport(card) {
      const lines = card.lines || [];
      this.ui.elements.text.innerHTML = lines.map(line => {
        if (line.startsWith('【')) {
          return `<strong>${line}</strong>`;
        } else if (line.trim() === '') {
          return '<div class="spacer"></div>';
        }
        return line;
      }).join('<br>');
      
      if (card.next) {
        this.ui.showContinueButton(() => {
          this.goToCard(card.next);
        });
      }
    }
    
    // =============== 分鏡處理 ===============
    
    async playShot(shotId) {
      const shot = GameData.getShot(shotId);
      if (!shot) return;
      
      this.state.shotId = shotId;
      this.ui.showHint('播放中...');
      
      await GameEffects.playShot(shotId);
      
      // 處理下一步
      if (shot.nextShot) {
        await this.playShot(shot.nextShot);
      } else if (shot.nextCard) {
        this.goToCard(shot.nextCard);
      }
    }
    
    async playMontage(sequenceId) {
      const shots = GameData.getShotSequence?.(sequenceId) || [];
      if (shots.length === 0) return;
      
      this.ui.showHint('蒙太奇播放中...');
      await GameEffects.playMontage(shots);
    }
    
    // =============== 導航系統 ===============
    
    goToCard(cardId, instant = false) {
      const card = GameData.getCard(cardId);
      if (!card) {
        this.ui.showHint('找不到指定的卡片');
        return;
      }
      
      this.renderCard(card, instant);
    }
    
    // =============== 初始化 ===============
    
    async init() {
      try {
        this.ui.showHint('載入遊戲資料中...');
        await GameData.init();
        
        const startId = GameData.getStartCardId();
        if (startId) {
          this.goToCard(startId);
          this.ui.showHint('');
        } else {
          this.ui.showHint('找不到起始點');
        }
      } catch (error) {
        console.error('遊戲初始化失敗:', error);
        this.ui.showHint('載入失敗，請刷新頁面');
      }
    }
  }
  
  // 初始化遊戲
  document.addEventListener('DOMContentLoaded', async () => {
    window.GameController = new GameController();
    await window.GameController.init();
  });
})(window);