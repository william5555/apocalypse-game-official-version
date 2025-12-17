(function (window) {
  class SaveSystem {
    constructor() {
      this.SAVE_SLOTS = 3;
      this.AUTO_SAVE_INTERVAL = 30;
      this.SAVE_VERSION = "1.0";
      this.cardCounter = 0;
      this.init();
    }
    
    init() {
      this.createMenu();
      this.bindEvents();
    }
    
    createMenu() {
      const menuBtn = document.createElement('button');
      menuBtn.id = 'save-menu-btn';
      menuBtn.className = 'save-menu-btn';
      menuBtn.innerHTML = '☰';
      menuBtn.title = '遊戲選單';
      document.body.appendChild(menuBtn);
      
      const modal = document.createElement('div');
      modal.id = 'save-menu-modal';
      modal.className = 'save-menu-modal';
      modal.innerHTML = `
        <div class="save-menu-content">
          <div class="save-menu-header">
            <h3>遊戲選單</h3>
            <button class="close-btn">&times;</button>
          </div>
          <div class="save-menu-body">
            <div class="save-slots">
              ${Array.from({length: this.SAVE_SLOTS}, (_, i) => `
                <div class="save-slot" data-slot="${i + 1}">
                  <div class="slot-info">
                    <span class="slot-number">存檔 ${i + 1}</span>
                    <span class="slot-time"></span>
                  </div>
                  <div class="slot-actions">
                    <button class="slot-btn save-btn">儲存</button>
                    <button class="slot-btn load-btn">載入</button>
                    <button class="slot-btn delete-btn">刪除</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="game-info">
              <div>章節: <span id="current-chapter">-</span></div>
              <div>決定數: <span id="decision-count">0</span></div>
            </div>
          </div>
          <div class="save-menu-footer">
            <button class="menu-btn" data-action="restart">重新開始</button>
            <button class="menu-btn" data-action="export">匯出</button>
            <button class="menu-btn" data-action="import">匯入</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    bindEvents() {
      // 切換選單
      document.getElementById('save-menu-btn').addEventListener('click', () => {
        this.toggleMenu();
      });
      
      // 關閉選單
      document.querySelector('.close-btn').addEventListener('click', () => {
        this.closeMenu();
      });
      
      // 選單操作
      document.getElementById('save-menu-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('save-btn')) {
          const slot = e.target.closest('.save-slot').dataset.slot;
          this.saveToSlot(slot);
        } else if (e.target.classList.contains('load-btn')) {
          const slot = e.target.closest('.save-slot').dataset.slot;
          this.loadFromSlot(slot);
        } else if (e.target.classList.contains('delete-btn')) {
          const slot = e.target.closest('.save-slot').dataset.slot;
          this.deleteSlot(slot);
        } else if (e.target.dataset.action) {
          this.handleAction(e.target.dataset.action);
        }
      });
      
      // 快捷鍵
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeMenu();
        if (e.altKey && e.key === 's') this.toggleMenu();
      });
    }
    
    toggleMenu() {
      const modal = document.getElementById('save-menu-modal');
      modal.classList.toggle('active');
      if (modal.classList.contains('active')) {
        this.updateMenuInfo();
        this.updateSaveSlots();
      }
    }
    
    closeMenu() {
      document.getElementById('save-menu-modal').classList.remove('active');
    }
    
    updateMenuInfo() {
      const state = window.GameController?.state;
      if (!state) return;
      
      const chapterEl = document.getElementById('current-chapter');
      const decisionEl = document.getElementById('decision-count');
      
      if (chapterEl) chapterEl.textContent = state.chapter || '-';
      if (decisionEl) decisionEl.textContent = state.decisions.size || 0;
    }
    
    updateSaveSlots() {
      for (let i = 1; i <= this.SAVE_SLOTS; i++) {
        const slotEl = document.querySelector(`.save-slot[data-slot="${i}"]`);
        if (!slotEl) continue;
        
        const saveData = localStorage.getItem(`save_${i}`);
        const timeEl = slotEl.querySelector('.slot-time');
        
        if (saveData) {
          const save = JSON.parse(saveData);
          timeEl.textContent = new Date(save.timestamp).toLocaleString('zh-TW');
          slotEl.classList.add('has-save');
        } else {
          timeEl.textContent = '無存檔';
          slotEl.classList.remove('has-save');
        }
      }
    }
    
    async saveToSlot(slot) {
      const state = window.GameController?.state;
      if (!state) return;
      
      const saveData = {
        version: this.SAVE_VERSION,
        timestamp: Date.now(),
        state: {
          cardId: state.cardId,
          shotId: state.shotId,
          chapter: state.chapter,
          decisions: Object.fromEntries(state.decisions),
          metrics: { ...state.metrics },
          flags: Object.fromEntries(state.flags)
        }
      };
      
      localStorage.setItem(`save_${slot}`, JSON.stringify(saveData));
      this.updateSaveSlots();
      this.showToast(`已儲存到存檔 ${slot}`);
    }
    
    async loadFromSlot(slot) {
      const saveData = localStorage.getItem(`save_${slot}`);
      if (!saveData) {
        alert(`存檔 ${slot} 不存在`);
        return;
      }
      
      if (!confirm(`載入存檔 ${slot} 會覆蓋當前進度，確定嗎？`)) return;
      
      try {
        const save = JSON.parse(saveData);
        const state = window.GameController?.state;
        
        // 還原狀態
        Object.assign(state, save.state);
        state.decisions = new Map(Object.entries(save.state.decisions || {}));
        state.flags = new Map(Object.entries(save.state.flags || {}));
        
        // 跳轉到保存的卡片
        if (save.state.shotId) {
          window.GameController.playShot(save.state.shotId);
        } else if (save.state.cardId) {
          window.GameController.goToCard(save.state.cardId, true);
        }
        
        this.closeMenu();
        this.showToast(`已載入存檔 ${slot}`);
      } catch (error) {
        console.error('載入存檔失敗:', error);
        alert('存檔損毀');
      }
    }
    
    deleteSlot(slot) {
      if (!confirm(`確定要刪除存檔 ${slot} 嗎？`)) return;
      
      localStorage.removeItem(`save_${slot}`);
      this.updateSaveSlots();
      this.showToast(`已刪除存檔 ${slot}`);
    }
    
    handleAction(action) {
      switch (action) {
        case 'restart':
          if (confirm('確定要重新開始遊戲嗎？')) {
            window.location.reload();
          }
          break;
        case 'export':
          this.exportSaves();
          break;
        case 'import':
          this.importSaves();
          break;
      }
    }
    
    exportSaves() {
      const saves = {};
      for (let i = 1; i <= this.SAVE_SLOTS; i++) {
        const data = localStorage.getItem(`save_${i}`);
        if (data) saves[i] = JSON.parse(data);
      }
      
      const blob = new Blob([JSON.stringify(saves, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game_saves_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showToast('存檔已匯出');
    }
    
    importSaves() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const saves = JSON.parse(event.target.result);
            
            if (!confirm('匯入存檔會覆蓋現有存檔，確定嗎？')) return;
            
            for (let i = 1; i <= this.SAVE_SLOTS; i++) {
              if (saves[i]) {
                localStorage.setItem(`save_${i}`, JSON.stringify(saves[i]));
              }
            }
            
            this.updateSaveSlots();
            this.showToast('存檔已匯入');
          } catch (error) {
            alert('匯入失敗：檔案格式錯誤');
          }
        };
        reader.readAsText(file);
      };
      
      input.click();
    }
    
    showToast(message, duration = 2000) {
      let toast = document.getElementById('save-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'save-toast';
        toast.className = 'save-toast';
        document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      toast.classList.add('show');
      
      setTimeout(() => {
        toast.classList.remove('show');
      }, duration);
    }
    
    autoSave() {
      this.cardCounter++;
      if (this.cardCounter >= this.AUTO_SAVE_INTERVAL) {
        this.cardCounter = 0;
        this.saveToSlot(1); // 自動存到第一個槽位
      }
    }
  }
  
  window.SaveSystem = new SaveSystem();
})(window);