(function (root) {
  'use strict';
  const GIFTS = Object.freeze([
    ['嘉年华', '🎡', 30000], ['飞艇', '🚀', 20000], ['抖音一号', '🛸', 10001],
    ['邮轮', '🛳️', 6000], ['钻石跑车', '🏎️', 1500], ['热气球', '🎈', 520],
    ['比心兔兔', '🐰', 299], ['亲吻', '💋', 99], ['小心心', '💗', 1]
  ].map(([name, icon, score]) => Object.freeze({ name, icon, score })));
  const QUOTE_ROUNDS=Object.freeze([2,4,6,7]);
  function numeric(value,mode,max){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(mode==='drink'&&!Number.isInteger(value)))throw new RangeError(mode==='drink'?'小口数须为范围内整数':'金额须为范围内非负数');
    return (mode==='money'?Math.round(value/10)*10:Math.round(value))||0;
  }
  function numericGift(value,mode){return {name:`${value} ${mode==='money'?'元':'小口'}`,icon:mode==='money'?'🪙':'🥤',score:value,value,kind:mode};}
  function makePool(configuration){
    const mode=configuration?.mode??'gift';
    if(!['gift','money','drink'].includes(mode))throw new RangeError('无效游戏模式');
    if(mode==='gift')return {mode,config:{mode,min:1,max:30000,values:GIFTS.map(g=>g.score)},gifts:GIFTS};
    const limit=mode==='money'?1000000:5;
    const rawMin=configuration.min??0,rawMax=configuration.max??(mode==='money'?1000:5);
    const min=numeric(rawMin,mode,limit),max=numeric(rawMax,mode,limit);
    if(rawMin>rawMax)throw new RangeError('最小值不能大于最大值');
    const explicit=configuration.values!==undefined;
    const values=configuration.values??Array.from({length:9},(_,i)=>mode==='money'?min+(max-min)*i/8:Math.round(min+(max-min)*i/8));
    if(!Array.isArray(values)||values.length!==9)throw new RangeError('请设置九个箱子的数值');
    const normalized=values.map(value=>{const result=numeric(value,mode,explicit?rawMax:max);if(value<(explicit?rawMin:min))throw new RangeError('箱子数值不能低于最小值');return result;});
    return {mode,config:{mode,min,max,values:normalized},gifts:normalized.map(value=>Object.freeze(numericGift(value,mode)))};
  }
  class Engine {
    constructor(rng = Math.random, configuration = null) {
      if (typeof rng !== 'function') throw new TypeError('随机源必须为函数');
      this.rng = rng;
      this.gameId = typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
      Object.assign(this,makePool(configuration));
      this.boxes = this.gifts.map((_, i) => i);
      for (let i = this.boxes.length - 1; i > 0; i--) {
        const value = rng();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数须在 [0, 1) 内');
        const j = Math.floor(value * (i + 1));
        [this.boxes[i], this.boxes[j]] = [this.boxes[j], this.boxes[i]];
      }
      this.selected = null;
      this.started = true;
      this.initialSelected = null;
      this.finalChoice = null;
      this.opened = [];
      this.phase = 'select';
      this.round = 0;
      this.offer = null;
      this.result = null;
      this.rejects = 0;
      this.lastDecisionMs = 0;
      this.cadence = '2-2-2-1';
      this.previousOfferName = null;
      this.lastDeclinedOffer = null;
      this.comparison = null;
      this.pricesVersion = 'car1500';
      this.directorPreset = null;
      this.directorLog = [];
      this.stageEvent = null;
      this.counterProposal = null;
      this.counterBudget = null;
      this.reshuffleRequest = null;
      this.poolProposal = null;
    }
    _index(i) {
      if (!Number.isInteger(i) || i < 0 || i >= this.boxes.length) throw new RangeError('无效箱号');
    }
    get reshuffleRequest(){
      if(this._reshuffleRequestState&&this._reshuffleRequestState.gameId!==this.gameId)this._reshuffleRequestState=null;
      return this._reshuffleRequestState||null;
    }
    set reshuffleRequest(value){this._reshuffleRequestState=value;}
    submitReshuffleRequest(){
      if(this.poolProposal?.status==='pending'&&this.poolProposal.gameId===this.gameId)throw new Error('数值方案等待审批，暂时不能申请洗牌');
      if(this.reshuffleRequest)throw new Error('本局已经申请过重新洗牌');
      const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
      this.reshuffleRequest={id,gameId:this.gameId,status:'pending',phrase:'求求熊二大王了，我是你的兵'};
      return {...this.reshuffleRequest};
    }
    reviewReshuffleRequest(id,approved){
      const request=this.reshuffleRequest;
      if(!request||request.status!=='pending'||typeof id!=='string'||request.id!==id||typeof approved!=='boolean')throw new Error('这份洗牌申请已失效或审批无效');
      request.status=approved?'approved':'declined';return {...request};
    }
    _poolSetup(){
      if(!['money','drink'].includes(this.mode)||this.started!==false||this.phase!=='select'||this.selected!==null||this.reshuffleRequest?.status==='pending')throw new Error('仅数值模式开始前可提交或审批数值');
    }
    submitPoolProposal(configuration){
      this._poolSetup();if(this.poolProposal&&this.poolProposal.gameId===this.gameId&&this.poolProposal.status!=='declined')throw new Error('数值方案已提交，请等待房主确认');
      const config=makePool(configuration).config;if(config.mode!==this.mode)throw new Error('不能通过数值方案切换版本');
      const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
      this.poolProposal={id,gameId:this.gameId,status:'pending',config};return JSON.parse(JSON.stringify(this.poolProposal));
    }
    decidePoolProposal(id,configuration){
      this._poolSetup();const proposal=this.poolProposal;
      if(!proposal||proposal.status!=='pending'||proposal.id!==id||proposal.gameId!==this.gameId)throw new Error('这份数值方案已失效');
      if(configuration===null){proposal.status='declined';return null;}
      const config=makePool(configuration).config;if(config.mode!==this.mode)throw new Error('审批不能切换游戏版本');
      proposal.config=config;proposal.status='approved';return {...config,values:[...config.values]};
    }
    configure(configuration){
      if(this.poolProposal?.status==='pending'&&this.poolProposal.gameId===this.gameId)throw new Error('数值方案等待审批，不能直接更换数值');
      if(this.phase!=='select'||this.selected!==null)throw new Error('仅未选箱时可以更换模式');
      const started=this.started,next=new Engine(this.rng,configuration);Object.assign(this,next);this.started=started;this.original=null;
      return this.snapshot();
    }
    select(i) {
      this._index(i);
      if(this.started===false)throw new Error('请先点击开始游戏');
      if (this.phase !== 'select') throw new Error('当前不能选箱');
      this.selected = i;
      this.initialSelected = i;
      if(this.directorPreset!==null){this._moveTreasure(this.directorPreset);this.directorPreset=null;}
      this.phase = 'open';
      return this.snapshot();
    }
    start() {
      if(this.poolProposal?.status==='pending'&&this.poolProposal.gameId===this.gameId)throw new Error('数值方案等待审批，不能直接开始');
      if(this.phase!=='select'||this.started!==false)throw new Error('当前无需开始游戏');
      this.started=true;
      return this.snapshot();
    }
    open(i, manualOffer = false) {
      this._index(i);
      if (this.phase !== 'open' || i === this.selected || this.opened.includes(i)) throw new Error('当前不能打开该箱');
      this.counterProposal=null;this.counterBudget=null;
      this.opened.push(i);
      this.round++;
      if(!QUOTE_ROUNDS.includes(this.round)){
        this.offer=null;
        return this.gifts[this.boxes[i]];
      }
      const remaining = this.boxes.filter((_, index) => !this.opened.includes(index));
      if(this.mode!=='gift'){
        const random=this.rng();if(!Number.isFinite(random)||random<0||random>=1)throw new RangeError('随机数须在 [0, 1) 内');
        const mean=remaining.reduce((sum,index)=>sum+this.gifts[index].value,0)/remaining.length;
        const factor=Math.max(.56,Math.min(.84,.60+this.round*.02+this.rejects*.012+(random*2-1)*.018));
        const rounded=this.mode==='money'?Math.round(mean*factor/10)*10:Math.floor(mean*factor+1e-9);
        const value=Math.max(this.config.min,Math.min(this.config.max,rounded));
        this.offer=manualOffer?null:{...numericGift(value,this.mode),factor,reason:'试探报价'};
        this.phase=manualOffer?'pricing':'offer';return this.gifts[this.boxes[i]];
      }
      const mean = remaining.reduce((sum, gift) => sum + this.gifts[gift].score, 0) / remaining.length;
      const random = this.rng();
      if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('随机数须在 [0, 1) 内');
      const jackpotLost = this.boxes[i] === 0;
      const baseFactor = Math.max(.56, Math.min(.84, .60 + this.round * .02 + this.rejects * .012
        + (this.lastDecisionMs > 8000 ? -.025 : this.lastDecisionMs < 2000 && this.rejects ? .015 : 0)
        + (jackpotLost ? -.025 : 0) + (random * 2 - 1) * .018));
      // A certain offer becomes more attractive when the alternative can end in a tiny gift.
      // Use only the publicly remaining pool, never the reserved box's hidden content.
      const values = remaining.map(gift => this.gifts[gift].score);
      const lowCount = values.filter(value => value <= 520 && value < mean * .12).length;
      const lowRisk = lowCount / values.length;
      const certaintyValue = Math.pow(values.reduce((sum, value) => sum + Math.sqrt(value), 0) / values.length, 2);
      const latePressure = Math.max(0, (4 - values.length) / 3);
      const riskWeight = lowCount ? Math.min(.9, .5 + latePressure * .3 + lowRisk * .2) : 0;
      const bargainingAnchor = mean - (mean - certaintyValue) * riskWeight;
      const factor = bargainingAnchor / mean * baseFactor;
      const cap = Math.floor(mean * .84);
      const combine = target => {
        let rest = target;
        const items = [];
        for (const gift of this.gifts) {
          if (gift.score > rest) continue;
          const count = Math.floor(rest / gift.score);
          items.push({ ...gift, count });
          rest -= count * gift.score;
          if (items.length === 2 || rest === 0) break;
        }
        return { name: items.map(item => `${item.name} × ${item.count}`).join(' + ') || '暂不报价',
          icon: items[0]?.icon || '💭', items, score: target - rest, estimate: target, factor, baseFactor,
          reason: lowRisk >= .25 && riskWeight > 0 ? '低奖风险' : jackpotLost ? '奖池回落' : this.rejects && this.lastDecisionMs < 2000 ? '适度让步' : '试探报价' };
      };
      const target = Math.floor(mean * factor);
      let next = combine(target);
      const previousName=this.offer?.name||this.previousOfferName;
      if (previousName && next.name === previousName) {
        for (const delta of [.012, -.012, .025, -.025]) {
          const adjusted = Math.max(0, Math.min(cap, Math.floor(target + mean * delta)));
          const candidate = combine(adjusted);
          if (candidate.name !== previousName) { next = candidate; break; }
        }
      }
      this.offer = next;
      if(!manualOffer)this.counterBudget=this._counterLimit();
      this.phase = manualOffer ? 'pricing' : 'offer';
      if(manualOffer) this.offer = null;
      return this.gifts[this.boxes[i]];
    }
    _moveTreasure(giftIndex, targetBox = this.selected) {
      this._index(targetBox);
      if(this.opened.includes(targetBox))throw new Error('这个箱子已经打开，不能再设置');
      const source=this.boxes.indexOf(giftIndex);
      if(source<0||this.opened.includes(source))throw new Error('这份礼物已经开出，不能放回藏宝箱');
      [this.boxes[targetBox],this.boxes[source]]=[this.boxes[source],this.boxes[targetBox]];
    }
    setTreasure(giftIndex, targetBox = this.selected) {
      if(this.reshuffleRequest?.status==='pending')throw new Error('洗牌申请等待审批，暂时不能调整藏宝');
      this._index(giftIndex);
      if(!['select','open','pricing','final'].includes(this.phase))throw new Error('报价已发出或本局已结束，当前不能调整藏宝');
      const preset=this.selected===null;
      if(preset){if(this.phase!=='select'||targetBox!==null)throw new Error('请先选择保留箱，再设置其他箱子');this.directorPreset=giftIndex;}
      else this._moveTreasure(giftIndex,targetBox);
      this.directorLog??=[];
      this.directorLog.push({action:preset?'preset':'treasure',at:Date.now(),box:targetBox,giftIndex});
      return this.snapshot();
    }
    clearTreasurePreset() {
      if(this.reshuffleRequest?.status==='pending')throw new Error('洗牌申请等待审批，暂时不能调整藏宝');
      if(this.phase!=='select'||this.selected!==null)throw new Error('选箱后不能撤回预设');
      if(this.directorPreset===null)return this.snapshot();
      this.directorPreset=null;
      this.directorLog??=[];
      this.directorLog.push({action:'clear',at:Date.now(),box:null});
      return this.snapshot();
    }
    setOffer(giftIndex, count = 1) {
      this._index(giftIndex);
      if(!Number.isInteger(count) || count < 1 || count > 9999) throw new RangeError('礼物数量须为1至9999的整数');
      return this.setBundle([{gift:giftIndex,count}]);
    }
    setBundle(bundle) {
      if(this.mode!=='gift')throw new Error('数值模式请直接设置报价');
      if(this.phase !== 'pricing') throw new Error('当前不能报价');
      if(!Array.isArray(bundle)||!bundle.length||bundle.length>9) throw new Error('无效礼物组合');
      const seen=new Set(),items=bundle.map(item=>{this._index(item.gift);if(seen.has(item.gift)||!Number.isInteger(item.count)||item.count<1||item.count>99999999)throw new Error('无效礼物数量');seen.add(item.gift);return{...this.gifts[item.gift],count:item.count};});
      this.offer={name:items.map(g=>`${g.name} × ${g.count}`).join(' + '),icon:items[0].icon,items,score:items.reduce((n,g)=>n+g.score*g.count,0),issuer:'host'};
      this.counterProposal=null;this.counterBudget??=this._counterLimit();
      this.phase='offer';return this.snapshot();
    }
    _counterLimit(){
      const values=this.boxes.filter((_,i)=>!this.opened.includes(i)).map(index=>this.gifts[index].score);
      const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
      const low=values.filter(value=>value<=520&&value<mean*.12).length/values.length;
      const certainty=Math.pow(values.reduce((sum,value)=>sum+Math.sqrt(value),0)/values.length,2);
      const weight=low?Math.min(.9,.5+Math.max(0,(4-values.length)/3)*.3+low*.2):0;
      const anchor=mean-(mean-certainty)*weight;
      return Math.max(this.offer.score,Math.floor(Math.min(mean*.75,anchor*.82)));
    }
    submitCounter(bundle){
      if(this.mode!=='gift'||this.phase!=='offer'||this.counterProposal?.status==='pending')throw new Error('当前不能提出礼物还价');
      if(!Array.isArray(bundle)||bundle.length<1||bundle.length>3)throw new Error('最多填写三组礼物');
      const merged=new Map();
      for(const row of bundle){
        if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('无效还价礼物');
        if(row.gift===''||row.gift===null)continue;
        this._index(row.gift);
        if(!Number.isInteger(row.count)||row.count<1||row.count>9999)throw new Error('礼物数量须为1至9999的整数');
        const count=(merged.get(row.gift)||0)+row.count;if(count>9999)throw new Error('同一礼物合计不能超过9999');merged.set(row.gift,count);
      }
      if(!merged.size)throw new Error('请至少选择一组礼物');
      const items=[...merged].map(([gift,count])=>({gift,count}));
      const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
      this.counterBudget??=this._counterLimit();
      this.counterProposal={id,round:this.round,gameId:this.gameId,items,name:items.map(item=>`${this.gifts[item.gift].name} × ${item.count}`).join(' + '),status:'pending'};
      return {...this.counterProposal,items:items.map(item=>({...item}))};
    }
    _pendingCounter(id){
      const proposal=this.counterProposal;
      if(this.mode!=='gift'||this.phase!=='offer'||!proposal||proposal.status!=='pending'||typeof id!=='string'||proposal.id!==id||proposal.gameId!==this.gameId||proposal.round!==this.round)throw new Error('这份还价请求已失效');
      return proposal;
    }
    _counterOffer(proposal){
      const items=proposal.items.map(item=>({...this.gifts[item.gift],count:item.count}));
      return {name:items.map(item=>`${item.name} × ${item.count}`).join(' + '),icon:items[0].icon,items,score:items.reduce((sum,item)=>sum+item.score*item.count,0),issuer:'host'};
    }
    decideCounter(id,accept){
      const proposal=this._pendingCounter(id);if(typeof accept!=='boolean')throw new Error('请明确接受或拒绝还价');
      if(accept){this.offer=this._counterOffer(proposal);proposal.status='accepted';}
      else{proposal.status='declined';this.offer=null;this.phase='pricing';}
      return this.snapshot();
    }
    withdrawCounter(id){const proposal=this._pendingCounter(id);proposal.status='withdrawn';return this.snapshot();}
    resolveCounterAuto(id){
      const proposal=this._pendingCounter(id);this.counterBudget??=this._counterLimit();const offer=this._counterOffer(proposal);
      if(offer.score<=this.counterBudget){this.offer=offer;proposal.status='accepted';}
      else proposal.status='declined';
      return this.snapshot();
    }
    setNumericOffer(value){
      if(this.mode==='gift'||this.phase!=='pricing')throw new Error('当前不能设置数值报价');
      value=numeric(value,this.mode,this.config.max);
      this.offer={...numericGift(value,this.mode),issuer:'host'};this.phase='offer';return this.snapshot();
    }
    skip(){
      if(this.mode!=='drink'||this.phase==='ended')throw new Error('当前不能跳过');
      this.result={...numericGift(0,'drink'),name:'已跳过 · 0 小口'};this.offer=null;this.phase='ended';
      this.comparison={kind:'skip',alternative:numericGift(0,'drink'),verdict:'even'};return this.result;
    }
    continue(decisionMs = 0) {
      if (this.phase !== 'offer') throw new Error('当前不能继续');
      if(this.counterProposal?.status==='pending')throw new Error('还价等待回复，请先撤回或等房主决定');
      if (!Number.isFinite(decisionMs) || decisionMs < 0) throw new RangeError('思考时间必须为非负毫秒数');
      this.rejects++;
      this.lastDecisionMs = decisionMs;
      this.previousOfferName=this.offer.name;
      this.lastDeclinedOffer=this.offer;
      this.offer=null;
      this.counterProposal=null;
      this.phase = this.round>=7?'final':'open';
      return this.snapshot();
    }
    accept() {
      if (this.phase !== 'offer') throw new Error('当前不能接受估值');
      if(this.counterProposal?.status==='pending')throw new Error('还价等待回复，请先撤回或等房主决定');
      this.result = this.offer;
      this.phase = 'ended';
      this._compare('deal', this.gifts[this.boxes[this.initialSelected??this.selected]]);
      return this.result;
    }
    _compare(kind, alternative) {
      const difference=(this.result.score-alternative.score)*(this.mode==='drink'?-1:1);
      this.comparison={kind,alternative,verdict:difference<0?'loss':difference>0?'win':'even'};
    }
    swap() {
      if(this.phase!=='final'||this.finalChoice)throw new Error('当前不能换箱');
      const remaining=this.boxes.map((_,i)=>i).filter(i=>!this.opened.includes(i));
      if(remaining.length!==2||!remaining.includes(this.selected))throw new Error('仅剩两个未开箱时可以换箱');
      this.initialSelected??=this.selected;
      this.selected=remaining.find(i=>i!==this.selected);
      this.finalChoice='swap';
      return this.reveal();
    }
    reveal() {
      if (this.phase !== 'final' && this.phase !== 'ended') throw new Error('当前不能揭晓保留箱');
      if(this.comparison?.kind==='skip')return this.result;
      this.initialSelected??=this.selected;
      if (this.phase === 'final') {
        this.finalChoice??='keep';
        this.result = this.gifts[this.boxes[this.selected]];
        this.phase = 'ended';
        this._compare(this.finalChoice, this.finalChoice==='swap'?this.gifts[this.boxes[this.initialSelected]]:this.lastDeclinedOffer||this.result);
        return this.result;
      }
      return this.gifts[this.boxes[this.initialSelected]];
    }
    snapshot() {
      const copy = value => value && { ...value, ...(value.items ? { items: value.items.map(item => ({ ...item })) } : {}) };
      return { poolProposal:this.poolProposal&&JSON.parse(JSON.stringify(this.poolProposal)),reshuffleRequest:this.reshuffleRequest&&JSON.parse(JSON.stringify(this.reshuffleRequest)),counterBudget:this.counterBudget,counterProposal:this.counterProposal&&{...this.counterProposal,items:this.counterProposal.items.map(item=>({...item}))},mode:this.mode,config:{...this.config,values:[...this.config.values]},gifts:this.gifts.map(g=>({...g})),stageEvent:this.stageEvent==null?null:JSON.parse(JSON.stringify(this.stageEvent)),boxes: [...this.boxes], directorPreset:this.directorPreset,directorLog:(this.directorLog||[]).map(e=>({...e})),gameId:this.gameId, started:this.started, selected: this.selected, initialSelected:this.initialSelected,finalChoice:this.finalChoice,opened: [...this.opened], phase: this.phase, round: this.round, rejects: this.rejects, lastDecisionMs: this.lastDecisionMs, cadence:this.cadence,previousOfferName:this.previousOfferName,pricesVersion:this.pricesVersion,lastDeclinedOffer:copy(this.lastDeclinedOffer),comparison:this.comparison&&{...this.comparison,alternative:copy(this.comparison.alternative)},offer: copy(this.offer), result: copy(this.result) };
    }
  }
  Engine.GIFTS = GIFTS;
  Engine.makePool=makePool;
  Engine.moneyGift=value=>numericGift(numeric(value,'money',1000000),'money');
  Engine.reprice = gift => {
    if(!gift)return gift;
    const items=gift.items?.map(item=>({...item,score:GIFTS.find(g=>g.name===item.name)?.score??item.score}));
    return {...gift,...(items?{items,score:items.reduce((sum,g)=>sum+g.score*g.count,0)}:{score:GIFTS.find(g=>g.name===gift.name)?.score??gift.score})};
  };
  Engine.QUOTE_ROUNDS=QUOTE_ROUNDS;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (root) root.DreamEngine = Engine;
})(typeof window !== 'undefined' ? window : null);
