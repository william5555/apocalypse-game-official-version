(function (window) {
  class EffectsManager {
    constructor() {
      this.currentBgm = null;
      this.currentSfx = new Set();
      this.isMuted = false;
      this.volume = { bgm: 0.7, sfx: 1.0 };
      this.typewriterInterval = null;
      this.activeTransitions = new Map();

      // === 新增：暫停/恢復狀態記錄 ===
      this._pauseState = {
        bgmWasPlaying: false,
        sfxWasPlaying: new WeakMap() // audio -> true/false
      };
    }

    // =============== 文字處理系統 ===============

    async displayText(element, content, options = {}) {
      const {
        typewriter = true,
        speed = 50,
        instant = false,
        onComplete = null
      } = options;

      this.clearTypewriter();

      if (!element || !content) {
        onComplete?.();
        return;
      }

      element.innerHTML = '';

      if (instant || !typewriter) {
        this.renderFullText(element, content);
        onComplete?.();
      } else {
        await this.typeText(element, content, speed);
        onComplete?.();
      }
    }

    async typeText(element, content, speed) {
      return new Promise((resolve) => {
        const text = Array.isArray(content) ? content.join('\n') : content;
        let index = 0;

        this.typewriterInterval = setInterval(() => {
          if (index >= text.length) {
            this.clearTypewriter();
            resolve();
            return;
          }

          const char = text.charAt(index);
          if (char === '\n') {
            element.innerHTML += '<br>';
          } else {
            element.innerHTML += this.escapeHtml(char);
          }

          index++;
          element.scrollTop = element.scrollHeight;
        }, speed);
      });
    }

    renderFullText(element, content) {
      const text = Array.isArray(content) ? content.join('\n') : content;
      element.innerHTML = this.escapeHtml(text).replace(/\n/g, '<br>');
    }

    clearTypewriter() {
      if (this.typewriterInterval) {
        clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // =============== 視覺效果系統 ===============

    async fadeBackground(toImageId, options = {}) {
      const {
        transition = 'fade',
        duration = 1000,
        fromImageId = null
      } = options;

      const bgElement = document.querySelector('[data-role="bg"]');
      if (!bgElement) return;

      const toUrl = GameData.getImage(toImageId) || toImageId;
      console.log(`[圖片檢查] ID: ${toImageId} | 解析路徑: ${toUrl}`);
      const fromUrl = fromImageId ? GameData.getImage(fromImageId) : null;

      if (!toUrl) return;

      return new Promise((resolve) => {
        switch (transition) {
          case 'hard-cut':
            bgElement.style.backgroundImage = `url('${toUrl}')`;
            resolve();
            break;

          case 'fade-in':
            bgElement.style.backgroundImage = `url('${toUrl}')`;
            bgElement.style.opacity = 0;
            bgElement.style.transition = `opacity ${duration}ms ease`;

            setTimeout(() => {
              bgElement.style.opacity = 1;
              setTimeout(resolve, duration);
            }, 10);
            break;

          case 'fade-out':
            bgElement.style.transition = `opacity ${duration}ms ease`;
            bgElement.style.opacity = 0;

            setTimeout(() => {
              bgElement.style.backgroundImage = `url('${toUrl}')`;
              bgElement.style.opacity = 1;
              setTimeout(resolve, 50);
            }, duration);
            break;

          case 'dissolve':
            this.applyDissolve(bgElement, toUrl, duration).then(resolve);
            break;

          default:
            bgElement.style.transition = `opacity ${duration}ms ease`;
            bgElement.style.opacity = 0;

            setTimeout(() => {
              bgElement.style.backgroundImage = `url('${toUrl}')`;
              setTimeout(() => {
                bgElement.style.opacity = 1;
                resolve();
              }, 50);
            }, duration);
        }
      });
    }

    async applyDissolve(element, newImageUrl, duration) {
      return new Promise((resolve) => {
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = `
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background-image: url('${newImageUrl}');
          background-size: cover;
          background-position: center;
          opacity: 0;
          z-index: 1;
          transition: opacity ${duration}ms ease;
        `;

        element.parentElement.appendChild(tempDiv);

        setTimeout(() => {
          tempDiv.style.opacity = '1';
        }, 10);

        setTimeout(() => {
          element.style.backgroundImage = `url('${newImageUrl}')`;
          tempDiv.remove();
          resolve();
        }, duration + 50);
      });
    }

    // =============== 音效系統（升級版：支援 loop / fade / pause-resume / hardCut） ===============

    // 工具：安全取得 url
    _getAudioUrl(id) {
      return GameData.getAudio(id) || id || null;
    }

    // 工具：取消所有既有淡入淡出（避免疊加造成音量怪）
    _clearFadeTimers(audio) {
      if (!audio) return;
      if (audio.__fadeTimer) {
        clearInterval(audio.__fadeTimer);
        audio.__fadeTimer = null;
      }
    }

    // 工具：用「小步進」實作淡入/淡出（不需要 WebAudio，使用原始 Audio 設計）
    _fadeTo(audio, targetVolume, durationMs = 300, onDone = null) {
      if (!audio) {
        onDone?.();
        return;
      }

      this._clearFadeTimers(audio);

      const steps = Math.max(1, Math.floor(durationMs / 30)); // 30ms 一步
      const start = audio.volume;
      const delta = (targetVolume - start) / steps;
      let currentStep = 0;

      audio.__fadeTimer = setInterval(() => {
        currentStep++;
        const v = start + delta * currentStep;
        audio.volume = Math.max(0, Math.min(1, v));

        if (currentStep >= steps) {
          this._clearFadeTimers(audio);
          audio.volume = Math.max(0, Math.min(1, targetVolume));
          onDone?.();
        }
      }, 30);
    }

    // 讓「突然靜音硬切」的情況下可直接呼叫
    hardCutAllAudio() {
      // 立刻停掉 BGM + SFX（不淡出）
      this.stopBgm(true);
      this.stopAllSfx(true);
    }

    playBgm(id, options = {}) {
      // options: loop=true, volume, fadeInMs, fadeOutMs(停的時候用), startAt
      const {
        loop = true,
        volume = this.volume.bgm,
        fadeInMs = 0,
        startAt = 0
      } = options;

      // 先停前一首（可選擇淡出）
      this.stopBgm(false, options.fadeOutMs);

      if (this.isMuted || !id) return;

      const url = this._getAudioUrl(id);
      if (!url) return;

      const audio = new Audio(url);
      audio.loop = !!loop;
      audio.volume = 0; // 先 0，讓 fadeIn 可控
      audio.currentTime = Math.max(0, startAt || 0);

      this.currentBgm = audio;

      const startPlay = () => {
        audio.play().catch(() => {
          document.addEventListener('click', () => {
            this.currentBgm?.play().catch(() => {});
          }, { once: true });
        });
      };

      startPlay();

      // 淡入到指定音量（若不淡入就立刻到位）
      if (fadeInMs > 0) {
        this._fadeTo(audio, Math.max(0, Math.min(1, volume)), fadeInMs);
      } else {
        audio.volume = Math.max(0, Math.min(1, volume));
      }

      // 套用靜音狀態
      audio.muted = this.isMuted;
    }

    // stopBgm(hardCut=false, fadeOutMs=0)
    stopBgm(hardCut = false, fadeOutMs = 0) {
      if (!this.currentBgm) return;

      const audio = this.currentBgm;
      this.currentBgm = null;

      const doStop = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (_) {}
      };

      if (hardCut || !fadeOutMs) {
        this._clearFadeTimers(audio);
        doStop();
        return;
      }

      // 淡出後停
      this._fadeTo(audio, 0, fadeOutMs, () => {
        doStop();
      });
    }

    playSfx(id, options = {}) {
      // options: volume, loop, fadeInMs, fadeOutMs, stopAfterMs
      if (this.isMuted || !id) return null;

      const url = this._getAudioUrl(id);
      if (!url) return null;

      const {
        volume = this.volume.sfx,
        loop = false,
        fadeInMs = 0,
        stopAfterMs = null,
        fadeOutMs = 0
      } = options;

      const audio = new Audio(url);
      audio.loop = !!loop;
      audio.muted = this.isMuted;

      // 先把音量設 0，便於淡入
      audio.volume = fadeInMs > 0 ? 0 : Math.max(0, Math.min(1, volume));

      audio.play().catch(() => {});

      // 淡入
      if (fadeInMs > 0) {
        this._fadeTo(audio, Math.max(0, Math.min(1, volume)), fadeInMs);
      }

      // 結束清理（非 loop 時才會 ended）
      audio.addEventListener('ended', () => {
        this._clearFadeTimers(audio);
        this.currentSfx.delete(audio);
      });

      this.currentSfx.add(audio);

      // 若指定播放多久後停止（適合「環境音」或「短暫底噪」）
      if (typeof stopAfterMs === 'number' && stopAfterMs > 0) {
        setTimeout(() => {
          // 如果還在集合裡才處理
          if (!this.currentSfx.has(audio)) return;

          if (fadeOutMs > 0) {
            this._fadeTo(audio, 0, fadeOutMs, () => {
              audio.pause();
              audio.currentTime = 0;
              this.currentSfx.delete(audio);
            });
          } else {
            audio.pause();
            audio.currentTime = 0;
            this.currentSfx.delete(audio);
          }
        }, stopAfterMs);
      }

      return audio;
    }

    // stopAllSfx(hardCut=false, fadeOutMs=0)
    stopAllSfx(hardCut = false, fadeOutMs = 0) {
      this.currentSfx.forEach(sfx => {
        this._clearFadeTimers(sfx);

        const doStop = () => {
          try {
            sfx.pause();
            sfx.currentTime = 0;
          } catch (_) {}
        };

        if (hardCut || !fadeOutMs) {
          doStop();
        } else {
          this._fadeTo(sfx, 0, fadeOutMs, doStop);
        }
      });

      if (hardCut || !fadeOutMs) {
        this.currentSfx.clear();
      } else {
        // 淡出後才清（避免還在跑）
        setTimeout(() => this.currentSfx.clear(), fadeOutMs + 50);
      }
    }

    // === 新增：暫停/繼續（對應你的控制面板）===
    pauseAllAudio() {
      // BGM
      if (this.currentBgm) {
        this._pauseState.bgmWasPlaying = !this.currentBgm.paused;
        if (!this.currentBgm.paused) this.currentBgm.pause();
      } else {
        this._pauseState.bgmWasPlaying = false;
      }

      // SFX（含 loop ambient）
      this.currentSfx.forEach(sfx => {
        const wasPlaying = !sfx.paused;
        this._pauseState.sfxWasPlaying.set(sfx, wasPlaying);
        if (wasPlaying) sfx.pause();
      });
    }

    resumeAllAudio() {
      // BGM
      if (this.currentBgm && this._pauseState.bgmWasPlaying) {
        this.currentBgm.play().catch(() => {});
        this._pauseState.bgmWasPlaying = false;
      }

      // SFX
      this.currentSfx.forEach(sfx => {
        const wasPlaying = this._pauseState.sfxWasPlaying.get(sfx);
        if (wasPlaying) {
          sfx.play().catch(() => {});
        }
        this._pauseState.sfxWasPlaying.delete(sfx);
      });
    }

    toggleMute() {
      this.isMuted = !this.isMuted;

      if (this.currentBgm) {
        this.currentBgm.muted = this.isMuted;
      }

      this.currentSfx.forEach(sfx => {
        sfx.muted = this.isMuted;
      });

      return this.isMuted;
    }

    // === 新增這個方法 ===
    setMasterVolume(level) {
      // 1. 確保數值在 0 到 1 之間
      const newVolume = Math.max(0, Math.min(1, level));

      // 2. 更新全域設定 (這樣下次播放新的音效時才會生效)
      this.volume.bgm = newVolume;
      this.volume.sfx = newVolume;

      // 3. 立即調整正在播放的 BGM 音量
      if (this.currentBgm) {
        this.currentBgm.volume = newVolume;
      }

      // 4. 立即調整所有正在播放的 SFX (環境音/音效)
      this.currentSfx.forEach(audio => {
        // 防止有些正在淡出的音效突然變大聲，只調整非淡出狀態的
        if (!audio.__fadeTimer) { 
           audio.volume = newVolume;
        }
      });
    }

    // =============== 分鏡效果 ===============

    async playShot(shotId) {
      const shot = GameData.getShot(shotId);
      if (!shot) return;

      // 背景效果
      if (shot.background) {
        await this.fadeBackground(shot.background, {
          transition: shot.transition || 'fade',
          duration: (shot.duration || 1) * 1000
        });
      }

      // 音效：ambient（現在 loop 真的有效了）
      if (shot.ambientSound) {
        this.playSfx(shot.ambientSound, {
          volume: shot.ambientVolume || 0.5,
          loop: shot.loopAmbient || false
        });
      }

      if (shot.triggerSound) {
        this.playSfx(shot.triggerSound, {
          volume: shot.triggerVolume || 1.0
        });
      }

      // 文字顯示
      if (shot.text) {
        const textElement = document.querySelector('[data-role="text"]');
        if (textElement) {
          await this.displayText(textElement, shot.text, {
            typewriter: true,
            speed: shot.textSpeed || 50
          });
        }
      }
    }

    async playMontage(shots, rhythm = [300, 200, 150, 100]) {
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const duration = rhythm[i % rhythm.length];

        if (shot.background) {
          this.fadeBackground(shot.background, { transition: 'hard-cut' });
        }

        if (shot.sound) {
          this.playSfx(shot.sound, { volume: 0.7 });
        }

        await this.wait(duration);
      }
    }

    wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  window.GameEffects = new EffectsManager();
})(window);
