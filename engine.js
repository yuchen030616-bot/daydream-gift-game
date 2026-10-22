(function (root) {
  'use strict';
  const GIFTS = Object.freeze([
    ['嘉年华', '🎡', 30000], ['飞艇', '🚀', 20000], ['抖音一号', '🛸', 10001],
    ['邮轮', '🛳️', 6000], ['钻石跑车', '🏎️', 3000], ['热气球', '🎈', 520],
    ['比心兔兔', '🐰', 299], ['亲吻', '💋', 99], ['小心心', '💗', 1]
  ].map(([name, icon, score]) => Object.freeze({ name, icon, score })));
  class Engine {
    constructor(rng = Math.random) {
      if (typeof rng !== 'function') throw new TypeError('随机源必须为函数');
      this.rng = rng;
      this.gifts = GIFTS;
      this.boxes = GIFTS.map((_, i) => i);
      for (let i = this.boxes.length - 1; i > 0; i--) {
        const value = rng();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数须在 [0, 1) 内');
        const j = Math.floor(value * (i + 1));
        [this.boxes[i], this.boxes[j]] = [this.boxes[j], this.boxes[i]];
      }
      this.selected = null;
      this.opened = [];
      this.phase = 'select';
      this.round = 0;
      this.offer = null;
      this.result = null;
      this.rejects = 0;
      this.lastDecisionMs = 0;
    }
    _index(i) {
      if (!Number.isInteger(i) || i < 0 || i >= this.boxes.length) throw new RangeError('无效箱号');
    }
    select(i) {
      this._index(i);
      if (this.phase !== 'select') throw new Error('当前不能选箱');
      this.selected = i;
      this.phase = 'open';
      return this.snapshot();
    }
    open(i) {
      this._index(i);
      if (this.phase !== 'open' || i === this.selected || this.opened.includes(i)) throw new Error('当前不能打开该箱');
      this.opened.push(i);
      this.round++;
      const remaining = this.boxes.filter((_, index) => !this.opened.includes(index));
      const mean = remaining.reduce((sum, gift) => sum + GIFTS[gift].score, 0) / remaining.length;
      const random = this.rng();
      if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('随机数须在 [0, 1) 内');
      const jackpotLost = this.boxes[i] === 0;
      const baseFactor = Math.max(.56, Math.min(.84, .60 + this.round * .02 + this.rejects * .012
        + (this.lastDecisionMs > 8000 ? -.025 : this.lastDecisionMs < 2000 && this.rejects ? .015 : 0)
        + (jackpotLost ? -.025 : 0) + (random * 2 - 1) * .018));
      // A certain offer becomes more attractive when the alternative can end in a tiny gift.
      // Use only the publicly remaining pool, never the reserved box's hidden content.
      const values = remaining.map(gift => GIFTS[gift].score);
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
        for (const gift of GIFTS) {
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
      if (this.offer && next.name === this.offer.name) {
        for (const delta of [.012, -.012, .025, -.025]) {
          const adjusted = Math.max(0, Math.min(cap, Math.floor(target + mean * delta)));
          const candidate = combine(adjusted);
          if (candidate.name !== this.offer.name) { next = candidate; break; }
        }
      }
      this.offer = next;
      this.phase = this.round === 8 ? 'final' : 'offer';
      return GIFTS[this.boxes[i]];
    }
    continue(decisionMs = 0) {
      if (this.phase !== 'offer') throw new Error('当前不能继续');
      if (!Number.isFinite(decisionMs) || decisionMs < 0) throw new RangeError('思考时间必须为非负毫秒数');
      this.rejects++;
      this.lastDecisionMs = decisionMs;
      this.phase = 'open';
      return this.snapshot();
    }
    accept() {
      if (this.phase !== 'offer') throw new Error('当前不能接受估值');
      this.result = this.offer;
      this.phase = 'ended';
      return this.result;
    }
    reveal() {
      if (this.phase !== 'final' && this.phase !== 'ended') throw new Error('当前不能揭晓保留箱');
      const original = GIFTS[this.boxes[this.selected]];
      if (this.phase === 'final') {
        this.result = original;
        this.phase = 'ended';
      }
      return original;
    }
    snapshot() {
      const copy = value => value && { ...value, ...(value.items ? { items: value.items.map(item => ({ ...item })) } : {}) };
      return { boxes: [...this.boxes], selected: this.selected, opened: [...this.opened], phase: this.phase, round: this.round, rejects: this.rejects, lastDecisionMs: this.lastDecisionMs, offer: copy(this.offer), result: copy(this.result) };
    }
  }
  Engine.GIFTS = GIFTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (root) root.DreamEngine = Engine;
})(typeof window !== 'undefined' ? window : null);
