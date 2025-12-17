(function (window) {
  const DataManager = {
    story: null,
    shots: null,
    config: null,
    resources: null,
    cardIndex: new Map(),
    shotIndex: new Map(),
    
    async init() {
      try {
        const [story, shots, config, resources] = await Promise.all([
          this.loadJSON('data/story.json'),
          this.loadJSON('data/shots.json'),
          this.loadJSON('data/config.json'),
          this.loadJSON('data/resources.json')
        ]);
        
        this.story = story;
        this.shots = shots;
        this.config = config;
        this.resources = resources;
        
        // 建立索引
        this.buildIndexes();
        return true;
      } catch (error) {
        console.error('初始化失敗:', error);
        throw error;
      }
    },
    
    async loadJSON(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`無法載入 ${url}`);
      return response.json();
    },
    
    buildIndexes() {
      // 卡片索引
      if (this.story?.cards) {
        this.story.cards.forEach(card => {
          if (card?.id) this.cardIndex.set(card.id, card);
        });
      }
      
      // 分鏡索引
      if (this.shots?.shots) {
        this.shots.shots.forEach(shot => {
          if (shot?.id) this.shotIndex.set(shot.id, shot);
        });
      }
    },
    
    // 資源解析
    getImage(id) {
      return this.resources?.images?.[id] || null;
    },
    
    getAudio(id) {
      return this.resources?.audio?.[id] || null;
    },
    
    // 數據獲取
    getCard(id) {
      return this.cardIndex.get(id) || null;
    },
    
    getShot(id) {
      return this.shotIndex.get(id) || null;
    },
    
    getStartCardId() {
      return this.config?.startCardId || null;
    },
    
    getCardsByChapter(chapter) {
      return this.story?.cards?.filter(card => card.chapter === chapter) || [];
    },
    
    getShotsByChapter(chapter) {
      return this.shots?.shots?.filter(shot => shot.chapter === chapter) || [];
    }
  };
  
  window.GameData = DataManager;
})(window);