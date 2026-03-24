/**
 * 美伊局势模拟器 - 游戏状态与回合逻辑
 * 参考现实：军费、兵力、股市、原油、舆论（支持率）决定胜负；可选美国(进攻方)或伊朗(防守方)；第三方中国
 *
 * 单位约定（为了让数值好玩且易算）：
 * - 石油储备单位：10万桶（即 1 = 100,000 barrels）
 * - 美国每日消耗：100万桶 => 10 单位/天
 * - 伊朗每日产出：50万桶 => 5 单位/天
 * - 原油价格：美元/桶（如 75）
 * - 军费：抽象单位（可理解为十亿美元级别），油品交易通过公式换算到军费
 */
const Game = {
  phase: 'choose',  // 'choose' | 'play'
  playerSide: null, // 'usa' | 'iran'
  day: 1,
  maxDay: 15,
  log: [],
  maxLog: 25,

  usa: {
    militaryBudget: 3000,
    troops: 150,
    approval: 50,
    oilReserve: 120, // 120 * 10万桶 = 1200万桶
    stockHoldings: 0, // “指数份额”，用于交易盈亏
  },
  iran: {
    militaryBudget: 300,
    troops: 80,
    approval: 50,
    oilReserve: 80,
  },
  global: {
    oilPrice: 75,   // 原油价格（美元/桶），影响伊朗收入、美国成本
    stockIndex: 3800, // 美股指数，影响美国舆论与军费观感
  },
  china: 0,          // -10 亲美 ~ 0 中立 ~ +10 亲伊，影响事件选项与调停
  tension: 30,       // 0-100，局势紧张度，影响油价/股市波动与事件效果
  allySupport: 60,   // 0-100，盟友对美国的支持度
  sanctionLevel: 40, // 0-100，对伊朗制裁强度

  /** 今日已使用过的策略 id 列表，同一条每天只能选一次，最多 3 条 */
  strategyUsedToday: [],
  lastTrade: null,   // 'buy' | 'sell' | null，每日一次股票交易
  lastOilDeal: null, // 'buy' | 'sell' | null，每日一次石油买卖
  iranDebt: 0,       // 伊朗向中国借贷的未偿本金（每日按 10% 计息）
  /** 伊朗“压美国支持率”类行动的后续反噬（方案B）：持续 2~3 天的财政/民生/制裁压力 */
  iranBacklash: [],
  /** 已出现过的“私信/对话”ID：同一局用过一次就不再生成（分别按阵营记录） */
  usedChatIds: { usa: [], iran: [] },

  init() {
    this.phase = 'choose';
    this.playerSide = null;
    this.day = 1;
    this.usa = { militaryBudget: 3000, troops: 150, approval: 50, oilReserve: 120, stockHoldings: 0 };
    this.iran = { militaryBudget: 300, troops: 80, approval: 50, oilReserve: 80 };
    this.global = { oilPrice: 75, stockIndex: 3800 };
    this.china = 0;
    this.tension = 30;
    this.allySupport = 60;
    this.sanctionLevel = 40;
    this.strategyUsedToday = [];
    this.lastTrade = null;
    this.lastOilDeal = null;
    this.iranDebt = 0;
    this.iranBacklash = [];
    this.usedChatIds = { usa: [], iran: [] };
    this.log = ['选择你的阵营：美国（进攻方）或伊朗（防守方），在约 15 天内用军费、兵力、股市、原油与舆论决出胜负。'];
  },

  startAs(side) {
    this.playerSide = side;
    this.phase = 'play';
    this.day = 1;
    this.strategyUsedToday = [];
    this.lastTrade = null;
    this.lastOilDeal = null;
    this.iranDebt = 0;
    this.iranBacklash = [];
    this.usedChatIds = { usa: [], iran: [] };
    const sideName = side === 'usa' ? '美国' : '伊朗';
    this.addLog(`你选择了${sideName}。每日可执行 3 次策略，并可进行一次股票买卖与石油操作；随后会遭遇随机事件与领导人对话。`);
  },

  /** 方案B：伊朗用“压美国支持率”的打法会带来制裁/紧张度上升与持续反噬 */
  maybeApplyIranApprovalAttackBacklash(effect, strategyName) {
    if (!effect || this.playerSide !== 'iran') return;
    const delta = effect.usa && typeof effect.usa.approval === 'number' ? effect.usa.approval : 0;
    if (delta >= 0) return;

    const intensity = Math.min(12, Math.max(2, Math.abs(delta))); // 与“压支持率”强度挂钩
    const tensionUp = 4 + Math.floor(intensity / 2); // 5~10
    const sanctionUp = 5 + Math.floor(intensity / 3); // 5~9
    const allyUp = 2 + Math.floor(intensity / 4); // 2~5（盟友更抱团）
    this.applyEffect({
      tension: tensionUp,
      sanctionLevel: sanctionUp,
      allySupport: allyUp,
      log: `伊朗舆论/灰色行动引发国际反制（${strategyName || '相关行动'}）：制裁与紧张度上升，盟友更团结。`,
    });

    // 反噬持续 2~3 天：制裁执行更严、内部财政/民生压力上升
    const days = Math.random() < 0.45 ? 3 : 2;
    const budgetPerDay = -(2 * intensity + 6); // -10~-30 左右
    const approvalPerDay = -(Math.random() < 0.5 ? 1 : 2);
    const extraSanctionPerDay = Math.random() < 0.35 ? 1 : 0;
    this.iranBacklash.push({
      daysLeft: days,
      budgetPerDay,
      approvalPerDay,
      extraSanctionPerDay,
    });
  },

  applyIranBacklashDaily() {
    if (!Array.isArray(this.iranBacklash) || !this.iranBacklash.length) return;
    const next = [];
    let budgetSum = 0;
    let apprSum = 0;
    let sanctionSum = 0;
    for (const b of this.iranBacklash) {
      if (!b || b.daysLeft <= 0) continue;
      budgetSum += b.budgetPerDay || 0;
      apprSum += b.approvalPerDay || 0;
      sanctionSum += b.extraSanctionPerDay || 0;
      const left = b.daysLeft - 1;
      if (left > 0) next.push({ ...b, daysLeft: left });
    }
    this.iranBacklash = next;
    if (budgetSum || apprSum || sanctionSum) {
      this.applyEffect({
        iran: { militaryBudget: budgetSum, approval: apprSum },
        sanctionLevel: sanctionSum,
        log: '反噬持续发酵：制裁执行更严、财政与民生压力上升。',
      });
    }
  },

  addLog(text) {
    this.log.unshift(`[第${this.day}天] ${text}`);
    if (this.log.length > this.maxLog) this.log.pop();
  },

  /** 获取当前玩家阵营数据 */
  getPlayer() {
    return this.playerSide === 'usa' ? this.usa : this.iran;
  },
  getOpponent() {
    return this.playerSide === 'usa' ? this.iran : this.usa;
  },

  formatEffectSummary(effect) {
    const parts = [];
    if (effect.usa) {
      if (effect.usa.militaryBudget) parts.push(`美军费${effect.usa.militaryBudget >= 0 ? '+' : ''}${effect.usa.militaryBudget}`);
      if (effect.usa.troops) parts.push(`美兵力${effect.usa.troops >= 0 ? '+' : ''}${effect.usa.troops}`);
      if (effect.usa.approval) parts.push(`美支持率${effect.usa.approval >= 0 ? '+' : ''}${effect.usa.approval}`);
      if (effect.usa.oilReserve) parts.push(`美石油${effect.usa.oilReserve >= 0 ? '+' : ''}${effect.usa.oilReserve}`);
      if (effect.usa.stockHoldings) parts.push(`美持仓${effect.usa.stockHoldings >= 0 ? '+' : ''}${effect.usa.stockHoldings}`);
    }
    if (effect.iran) {
      if (effect.iran.militaryBudget) parts.push(`伊军费${effect.iran.militaryBudget >= 0 ? '+' : ''}${effect.iran.militaryBudget}`);
      if (effect.iran.troops) parts.push(`伊兵力${effect.iran.troops >= 0 ? '+' : ''}${effect.iran.troops}`);
      if (effect.iran.approval) parts.push(`伊支持率${effect.iran.approval >= 0 ? '+' : ''}${effect.iran.approval}`);
      if (effect.iran.oilReserve) parts.push(`伊石油${effect.iran.oilReserve >= 0 ? '+' : ''}${effect.iran.oilReserve}`);
    }
    if (effect.global) {
      if (effect.global.oilPrice) parts.push(`油价${effect.global.oilPrice >= 0 ? '+' : ''}${effect.global.oilPrice}`);
      if (effect.global.stockIndex) parts.push(`美股${effect.global.stockIndex >= 0 ? '+' : ''}${effect.global.stockIndex}`);
    }
    if (effect.china !== undefined && effect.china !== 0) parts.push(`中国${effect.china >= 0 ? '+' : ''}${effect.china}`);
    if (effect.tension !== undefined && effect.tension !== 0) parts.push(`紧张度${effect.tension >= 0 ? '+' : ''}${effect.tension}`);
    if (effect.allySupport !== undefined && effect.allySupport !== 0) parts.push(`盟友${effect.allySupport >= 0 ? '+' : ''}${effect.allySupport}`);
    if (effect.sanctionLevel !== undefined && effect.sanctionLevel !== 0) parts.push(`制裁${effect.sanctionLevel >= 0 ? '+' : ''}${effect.sanctionLevel}`);
    return parts.length ? parts.join('，') : '';
  },

  formatCostSummary(mbCost, cd, cg) {
    const parts = [];
    if (mbCost) parts.push(`军费-${mbCost}`);
    if (cd && cd.troops) parts.push(`兵力-${cd.troops}`);
    if (cd && cd.approval) parts.push(`支持率-${cd.approval}`);
    if (cd && cd.oilReserve) parts.push(`石油-${cd.oilReserve}`);
    if (cg && cg.china) parts.push(`中国-${cg.china}`);
    if (cg && cg.tension) parts.push(`紧张度-${cg.tension}`);
    if (cg && cg.allySupport) parts.push(`盟友-${cg.allySupport}`);
    if (cg && cg.sanctionLevel) parts.push(`制裁-${cg.sanctionLevel}`);
    return parts.length ? parts.join('，') : '';
  },

  /** 执行策略（每日每条最多 1 次，最多选 3 条） */
  doStrategy(id) {
    if (this.strategyUsedToday.includes(id)) return { ok: false, msg: '该策略今日已使用过，请选其他策略。' };
    if (this.strategyUsedToday.length >= 3) return { ok: false, msg: '今日策略次数已用完（最多 3 次）。' };
    const s = this.playerSide === 'usa' ? STRATEGIES_USA : STRATEGIES_IRAN;
    const strategy = s.find((x) => x.id === id);
    if (!strategy) return { ok: false, msg: '未知策略。' };
    const cd = strategy.costDetail || {};
    const cg = strategy.costGlobal || {};
    // 美伊军费尺度差异：美国 4x，伊朗 2x（相对当前伊朗消耗翻倍）
    const mbMult = this.playerSide === 'usa' ? 4 : 2;
    const mbCost = (strategy.cost || 0) * mbMult;
    const player = this.getPlayer();
    // 策略消耗允许将军费扣为负数（失败条件见 checkVictory：军费 < -100）
    if ((cd.troops || 0) > player.troops) return { ok: false, msg: '兵力不足。' };
    if ((cd.approval || 0) > player.approval) return { ok: false, msg: '支持率不足。' };
    if ((cd.oilReserve || 0) > player.oilReserve) return { ok: false, msg: '石油储备不足。' };
    if ((cg.china || 0) > Math.abs(this.china)) return { ok: false, msg: '中国资源不足。' };
    if ((cg.tension || 0) > this.tension) return { ok: false, msg: '紧张度不足。' };
    if ((cg.allySupport || 0) > this.allySupport) return { ok: false, msg: '盟友资源不足。' };
    if ((cg.sanctionLevel || 0) > this.sanctionLevel) return { ok: false, msg: '制裁资源不足。' };

    // 先记录“策略消耗”，保证每次资源变动都进入战报
    const costSummary = this.formatCostSummary(mbCost, cd, cg);
    if (costSummary) this.addLog(`执行策略「${strategy.name}」消耗：【${costSummary}】`);

    player.militaryBudget -= mbCost;
    if (cd.troops) player.troops = Math.max(0, player.troops - cd.troops);
    if (cd.approval) player.approval = Math.max(0, player.approval - cd.approval);
    if (cd.oilReserve) player.oilReserve = Math.max(0, player.oilReserve - cd.oilReserve);
    if (cg.china) this.china = Math.max(-10, Math.min(10, this.china - cg.china));
    if (cg.tension) this.tension = Math.max(0, Math.min(100, this.tension - cg.tension));
    if (cg.allySupport) this.allySupport = Math.max(0, Math.min(100, this.allySupport - cg.allySupport));
    if (cg.sanctionLevel) this.sanctionLevel = Math.max(0, Math.min(100, this.sanctionLevel - cg.sanctionLevel));
    // 策略效果支持静态 effect 或动态 apply(game)
    const eff = typeof strategy.apply === 'function' ? strategy.apply(this) : strategy.effect;
    if (eff) this.applyEffect(eff);
    this.strategyUsedToday.push(id);
    this.addLog(strategy.log || strategy.name);
    // 方案B：伊朗若通过策略显著降低美国支持率，会触发制裁/紧张度上升与持续反噬
    if (eff) this.maybeApplyIranApprovalAttackBacklash(eff, strategy.name);
    return { ok: true };
  },

  /**
   * 应用效果。effect: {
   *   usa?: { militaryBudget?, troops?, approval?, oilReserve?, stockHoldings? },
   *   iran?: { militaryBudget?, troops?, approval?, oilReserve? },
   *   global?: { oilPrice?, stockIndex? },
   *   china?, tension?, allySupport?, sanctionLevel?, log?
   * }
   */
  applyEffect(effect) {
    if (effect.usa) {
      if (effect.usa.militaryBudget !== undefined) this.usa.militaryBudget = this.usa.militaryBudget + effect.usa.militaryBudget;
      if (effect.usa.troops !== undefined) this.usa.troops = Math.max(0, this.usa.troops + effect.usa.troops);
      if (effect.usa.approval !== undefined) this.usa.approval = Math.max(0, Math.min(100, this.usa.approval + effect.usa.approval));
      if (effect.usa.oilReserve !== undefined) this.usa.oilReserve = Math.max(0, this.usa.oilReserve + effect.usa.oilReserve);
      if (effect.usa.stockHoldings !== undefined) this.usa.stockHoldings = Math.max(0, this.usa.stockHoldings + effect.usa.stockHoldings);
    }
    if (effect.iran) {
      if (effect.iran.militaryBudget !== undefined) this.iran.militaryBudget = this.iran.militaryBudget + effect.iran.militaryBudget;
      if (effect.iran.troops !== undefined) this.iran.troops = Math.max(0, this.iran.troops + effect.iran.troops);
      if (effect.iran.approval !== undefined) this.iran.approval = Math.max(0, Math.min(100, this.iran.approval + effect.iran.approval));
      if (effect.iran.oilReserve !== undefined) this.iran.oilReserve = Math.max(0, this.iran.oilReserve + effect.iran.oilReserve);
    }
    if (effect.global) {
      if (effect.global.oilPrice !== undefined) this.global.oilPrice = Math.max(20, Math.min(200, this.global.oilPrice + effect.global.oilPrice));
      if (effect.global.stockIndex !== undefined) this.global.stockIndex = Math.max(1500, Math.min(5500, this.global.stockIndex + effect.global.stockIndex));
    }
    if (effect.china !== undefined) this.china = Math.max(-10, Math.min(10, this.china + effect.china));
    if (effect.tension !== undefined) this.tension = Math.max(0, Math.min(100, this.tension + effect.tension));
    if (effect.allySupport !== undefined) this.allySupport = Math.max(0, Math.min(100, this.allySupport + effect.allySupport));
    if (effect.sanctionLevel !== undefined) this.sanctionLevel = Math.max(0, Math.min(100, this.sanctionLevel + effect.sanctionLevel));
    if (effect.log) {
      const summary = this.formatEffectSummary(effect);
      this.addLog(summary ? `${effect.log} 【${summary}】` : effect.log);
    }
  },

  /**
   * 石油-军费转换：把油品交易金额换算为军费点数
   * - qty 单位：10万桶
   * - amountUSD = qty * 100000 * oilPrice
   * - 按百万美元折算为军费，且至少为 1，避免买油不扣军费
   */
  oilToBudget(qty) {
    const amountUSD = qty * 100000 * this.global.oilPrice;
    return Math.max(1, Math.round(amountUSD / 1_000_000));
  },

  /** 股票交易（每日一次）。qty：指数份额，按 stockIndex 成交；盈亏体现在军费上 */
  tradeStock(action, qty) {
    if (this.phase !== 'play') return { ok: false, msg: '尚未开始游戏。' };
    if (this.lastTrade !== null) return { ok: false, msg: '今日已进行过股票操作。' };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, msg: '数量必须为正数。' };
    if (this.playerSide !== 'usa') return { ok: false, msg: '当前版本仅支持美国进行美股交易。' };

    const cost = Math.round((qty * this.global.stockIndex) / 100); // 约等于“指数/100”为一份成本
    if (action === 'buy') {
      if (this.usa.militaryBudget < cost) return { ok: false, msg: '军费不足，买不起。' };
      this.usa.militaryBudget -= cost;
      this.usa.stockHoldings += qty;
      this.lastTrade = 'buy';
      this.addLog(`买入指数份额 ${qty}（成本 ${cost} 军费）。`);
      return { ok: true };
    }
    if (action === 'sell') {
      if (this.usa.stockHoldings < qty) return { ok: false, msg: '持仓不足。' };
      this.usa.stockHoldings -= qty;
      this.usa.militaryBudget += cost;
      this.lastTrade = 'sell';
      this.addLog(`卖出指数份额 ${qty}（回收 ${cost} 军费）。`);
      return { ok: true };
    }
    return { ok: false, msg: '未知操作。' };
  },

  /** 伊朗可用：向中国借贷（每日一次，50~100） */
  borrowFromChina(amount) {
    if (this.phase !== 'play') return { ok: false, msg: '尚未开始游戏。' };
    if (this.playerSide !== 'iran') return { ok: false, msg: '当前仅伊朗可进行中国借贷。' };
    if (this.lastTrade !== null) return { ok: false, msg: '今日已进行过借贷/美股操作。' };
    if (!Number.isFinite(amount) || amount < 50 || amount > 100) return { ok: false, msg: '借贷金额需在 50~100 之间。' };
    const val = Math.round(amount);
    this.iran.militaryBudget += val;
    this.iranDebt += val;
    this.lastTrade = 'loan';
    this.china = Math.min(10, this.china + 1);
    this.addLog(`向中国借贷 ${val} 军费到账（未偿本金 ${this.iranDebt}，日息 10%）。`);
    return { ok: true };
  },

  /** 石油买卖（每日一次，默认玩家侧操作）。qty：10万桶单位 */
  tradeOil(action, qty) {
    if (this.phase !== 'play') return { ok: false, msg: '尚未开始游戏。' };
    if (this.lastOilDeal !== null) return { ok: false, msg: '今日已进行过石油操作。' };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, msg: '数量必须为正数。' };

    const budgetDelta = this.oilToBudget(qty);
    const player = this.getPlayer();
    if (action === 'buy') {
      if (player.militaryBudget < budgetDelta) return { ok: false, msg: '军费不足，买不起石油。' };
      player.militaryBudget -= budgetDelta;
      player.oilReserve += qty;
      this.lastOilDeal = 'buy';
      this.addLog(`买入石油 ${qty} 单位（约 ${qty * 10} 万桶），花费 ${budgetDelta} 军费。`);
      return { ok: true };
    }
    if (action === 'sell') {
      if (player.oilReserve < qty) return { ok: false, msg: '石油储备不足。' };
      player.oilReserve -= qty;
      player.militaryBudget += budgetDelta;
      this.lastOilDeal = 'sell';
      this.addLog(`卖出石油 ${qty} 单位（约 ${qty * 10} 万桶），获得 ${budgetDelta} 军费。`);
      return { ok: true };
    }
    return { ok: false, msg: '未知操作。' };
  },

  /** 下一日：结算油气与全球波动（事件/聊天由 UI 触发展示） */
  nextDay() {
    this.day += 1;
    this.strategyUsedToday = [];
    this.lastTrade = null;
    this.lastOilDeal = null;

    // 石油：美国消耗 10 单位/天，伊朗产出 5 单位/天
    this.usa.oilReserve = Math.max(0, this.usa.oilReserve - 10);
    this.iran.oilReserve += 5;

    // 油价/股市：受 tension 影响的随机游走（越紧张油价越涨、股市越抖/偏跌）
    const oilBase = (Math.random() - 0.45) * 6 + this.tension * 0.06; // tension 30 => +1.8 左右
    const stockBase = (Math.random() - 0.55) * 70 - this.tension * 0.8; // tension 越高越压股市
    this.global.oilPrice = Math.max(20, Math.min(200, Math.round(this.global.oilPrice + oilBase)));
    this.global.stockIndex = Math.max(1500, Math.min(5500, Math.round(this.global.stockIndex + stockBase)));

    // 伊朗每日卖油收入：默认卖出 2 单位（20万桶）到市场；受制裁强度影响打折
    const autoSell = Math.min(2, this.iran.oilReserve);
    if (autoSell > 0) {
      this.iran.oilReserve -= autoSell;
      let income = this.oilToBudget(autoSell);
      const factor = 1 - this.sanctionLevel * 0.003; // 0~0.7 的折扣
      income = Math.max(0, Math.round(income * factor));
      this.iran.militaryBudget += income;
      this.addLog(`伊朗例行出口石油 ${autoSell} 单位，受制裁影响实际获得军费 ${income}。`);
    }

    // 美股持仓盈亏：以指数变动间接体现（简化为“持仓份额 * 今日涨跌/100”）
    const pnl = Math.round((this.usa.stockHoldings * stockBase) / 100);
    if (pnl !== 0) this.usa.militaryBudget = this.usa.militaryBudget + pnl;
    if (this.usa.stockHoldings > 0) this.addLog(`美股持仓浮动：${pnl >= 0 ? '+' : ''}${pnl} 军费（指数变动 ${stockBase >= 0 ? '+' : ''}${Math.round(stockBase)}）。`);

    // 伊朗借贷日息：按未偿本金 10% 每日结算利息
    if (this.iranDebt > 0) {
      const interest = Math.max(1, Math.round(this.iranDebt * 0.1));
      this.iran.militaryBudget -= interest;
      this.addLog(`中国借贷利息结算：支付 ${interest}（未偿本金 ${this.iranDebt}，日息 10%）。`);
    }

    // 方案B：伊朗“压美国支持率”类行动的持续反噬（2~3 天）
    this.applyIranBacklashDaily();

    const result = this.checkVictory();
    if (result.gameOver) return result;
    return { gameOver: false };
  },

  checkVictory() {
    if (this.usa.militaryBudget < -100) return { gameOver: true, winner: 'iran', reason: '美国军费赤字跌破 -100，财政体系失控。' };
    if (this.iran.militaryBudget < -100) return { gameOver: true, winner: 'usa', reason: '伊朗军费赤字跌破 -100，财政体系失控。' };
    if (this.usa.approval <= 0) return { gameOver: true, winner: 'iran', reason: '美国国内支持率归零，政府被迫收手。' };
    if (this.iran.approval <= 0) return { gameOver: true, winner: 'usa', reason: '伊朗国内支持率归零，政权不稳。' };
    if (this.usa.oilReserve <= 0) return { gameOver: true, winner: 'iran', reason: '美国石油储备归零，后勤崩盘。' };
    if (this.iran.oilReserve <= 0) return { gameOver: true, winner: 'usa', reason: '伊朗石油储备归零，财政断流。' };
    if (this.global.stockIndex <= 1900) return { gameOver: true, winner: 'iran', reason: '美股跌破 50%，美国国内金融恐慌，战略收缩。' };
    if (this.usa.troops <= 0 && this.usa.militaryBudget < 50) return { gameOver: true, winner: 'iran', reason: '美军无力再战。' };
    if (this.iran.troops <= 0 && this.iran.militaryBudget < 20) return { gameOver: true, winner: 'usa', reason: '伊朗军力耗尽。' };
    if (this.day >= this.maxDay) {
      // 到期综合评分：军费、兵力、支持率、油储、美股/油价（各自核心变量）与紧张度
      const us =
        this.usa.militaryBudget * 0.15 +
        this.usa.troops * 0.8 +
        this.usa.approval * 2.2 +
        this.usa.oilReserve * 1.5 +
        this.global.stockIndex / 25 -
        this.tension * 1.0 +
        this.allySupport * 0.8 -
        Math.max(0, this.china) * 1.2; // 中国更亲伊会降低美国外部空间
      const ir =
        this.iran.militaryBudget * 0.25 +
        this.iran.troops * 0.9 +
        this.iran.approval * 2.0 +
        this.iran.oilReserve * 1.7 +
        this.global.oilPrice * 1.2 -
        Math.max(0, -this.china) * 2.0 -
        this.sanctionLevel * 0.6; // 制裁越高，终局扣分越多
      return { gameOver: true, winner: us >= ir ? 'usa' : 'iran', reason: '15 天到期，按局势与实力判定胜负。' };
    }
    return { gameOver: false };
  },

  getState() {
    return {
      phase: this.phase,
      playerSide: this.playerSide,
      day: this.day,
      strategyUsedToday: [...this.strategyUsedToday],
      lastTrade: this.lastTrade,
      lastOilDeal: this.lastOilDeal,
      iranDebt: this.iranDebt,
      iranBacklash: Array.isArray(this.iranBacklash) ? this.iranBacklash.map((x) => ({ ...x })) : [],
      usedChatIds: {
        usa: Array.isArray(this.usedChatIds?.usa) ? [...this.usedChatIds.usa] : [],
        iran: Array.isArray(this.usedChatIds?.iran) ? [...this.usedChatIds.iran] : [],
      },
      usa: { ...this.usa },
      iran: { ...this.iran },
      global: { ...this.global },
      china: this.china,
      tension: this.tension,
      allySupport: this.allySupport,
      sanctionLevel: this.sanctionLevel,
      log: [...this.log],
    };
  },

  loadState(state) {
    this.phase = state.phase || 'play';
    this.playerSide = state.playerSide;
    this.day = state.day || 1;
    this.strategyUsedToday = Array.isArray(state.strategyUsedToday) ? [...state.strategyUsedToday] : (state.lastStrategy != null ? [] : []);
    this.lastTrade = state.lastTrade ?? null;
    this.lastOilDeal = state.lastOilDeal ?? null;
    this.iranDebt = Number.isFinite(state.iranDebt) ? state.iranDebt : 0;
    this.iranBacklash = Array.isArray(state.iranBacklash) ? state.iranBacklash.map((x) => ({ ...x })) : [];
    this.usedChatIds = {
      usa: Array.isArray(state.usedChatIds?.usa) ? [...state.usedChatIds.usa] : [],
      iran: Array.isArray(state.usedChatIds?.iran) ? [...state.usedChatIds.iran] : [],
    };
    this.usa = state.usa ? { ...state.usa } : this.usa;
    this.iran = state.iran ? { ...state.iran } : this.iran;
    this.global = state.global ? { ...state.global } : this.global;
    this.china = state.china ?? 0;
    this.tension = state.tension ?? 30;
    this.allySupport = state.allySupport ?? 60;
    this.sanctionLevel = state.sanctionLevel ?? 40;
    this.log = state.log && state.log.length ? [...state.log] : this.log;
  },
};

/** 美国策略 */
const STRATEGIES_USA = [
  {
    // === 目标：消耗伊朗军费（2条：低风险/高风险） ===
    id: 'usa_attack_ir_budget_low',
    name: '金融封锁加严/二级制裁（低风险，打伊军费）',
    cost: 30,
    costDetail: { approval: 2 },
    gain: '伊朗军费-20~40，制裁+4，紧张度+3；小概率反噬（油价+4~10，美国支持率-2）',
    apply(game) {
      const hit = 20 + Math.floor(Math.random() * 21); // 20~40（相对伊朗初始军费300：不会一两次打穿）
      const oilUp = 4 + Math.floor(Math.random() * 7); // 4~10
      const backlash = Math.random() < 0.22;
      if (backlash) {
        return {
          iran: { militaryBudget: -Math.round(hit * 0.75) },
          global: { oilPrice: oilUp },
          usa: { approval: -2 },
          sanctionLevel: 4,
          tension: 4,
          log: `制裁见效但油价反噬：伊朗军费-${Math.round(hit * 0.75)}，油价+${oilUp}，美国支持率-2，制裁+4。`,
        };
      }
      return { iran: { militaryBudget: -hit }, sanctionLevel: 4, tension: 3, log: `二级制裁推进：伊朗军费-${hit}，制裁+4。` };
    },
    log: '低风险打伊军费：慢刀子割肉，但更可控。',
  },
  {
    id: 'usa_attack_ir_budget_high',
    name: '大规模资产冻结/断结算（高风险，重击伊军费）',
    cost: 60,
    costDetail: { approval: 4 },
    gain: '伊朗军费-40~80，制裁+7~12，紧张度+6；高概率反噬（油价+10~25，美股-40~-120，美国支持率-3~-7）',
    apply(game) {
      const hit = 40 + Math.floor(Math.random() * 41); // 40~80（约20%~40%伊朗初始军费）
      const sanc = 7 + Math.floor(Math.random() * 6); // 7~12
      const backlash = Math.random() < 0.58;
      if (backlash) {
        const oilUp = 10 + Math.floor(Math.random() * 16); // 10~25
        const stockDown = 40 + Math.floor(Math.random() * 81); // 40~120
        const apprDown = 3 + Math.floor(Math.random() * 5); // 3~7
        return {
          iran: { militaryBudget: -Math.round(hit * 0.8) },
          global: { oilPrice: oilUp, stockIndex: -stockDown },
          usa: { approval: -apprDown },
          sanctionLevel: sanc,
          tension: 6,
          log: `断结算重击伊朗，但反噬强：伊朗军费-${Math.round(hit * 0.8)}，油价+${oilUp}，美股-${stockDown}，美国支持率-${apprDown}，制裁+${sanc}。`,
        };
      }
      return { iran: { militaryBudget: -hit }, sanctionLevel: sanc, tension: 6, log: `断结算出手：伊朗军费-${hit}，制裁+${sanc}。` };
    },
    log: '高风险打伊军费：很疼，但也会打到你自己的市场与民意。',
  },

  // === 目标：消耗伊朗兵力（2条：低风险/高风险） ===
  {
    id: 'usa_attack_ir_troops_low',
    name: '情报定点/小规模打击（低风险，磨伊兵力）',
    cost: 28,
    costDetail: { troops: 10 },
    gain: '伊朗兵力-3~6，紧张度+4；小概率翻车（美国支持率-2，紧张度+3）',
    apply(game) {
      const hit = 3 + Math.floor(Math.random() * 4); // 3~6（伊朗初始80：需要多次才见效）
      const backfire = Math.random() < 0.2;
      if (backfire) {
        return {
          iran: { troops: -Math.max(2, Math.floor(hit * 0.6)) },
          usa: { approval: -2 },
          tension: 7,
          log: `定点行动奏效但舆论有反弹：伊朗兵力-${Math.max(2, Math.floor(hit * 0.6))}，美国支持率-2。`,
        };
      }
      return { iran: { troops: -hit }, tension: 4, log: `情报定点打击：伊朗兵力-${hit}。` };
    },
    log: '低风险磨兵力：稳，但不爆炸。',
  },
  {
    id: 'usa_attack_ir_troops_high',
    name: '空袭升级/连续轰炸（高风险，重击伊兵力）',
    cost: 70,
    costDetail: { approval: 5 },
    gain: '伊朗兵力-7~14，紧张度+12；高概率反噬（美国支持率-6~-12，盟友-4~-10，油价+6~18）',
    apply(game) {
      const hit = 7 + Math.floor(Math.random() * 8); // 7~14
      const backlash = Math.random() < 0.6;
      if (backlash) {
        const apprDown = 6 + Math.floor(Math.random() * 7); // 6~12
        const allyDown = 4 + Math.floor(Math.random() * 7); // 4~10
        const oilUp = 6 + Math.floor(Math.random() * 13); // 6~18
        return {
          iran: { troops: -Math.round(hit * 0.75), approval: -(1 + Math.floor(Math.random() * 3)) },
          usa: { approval: -apprDown },
          allySupport: -allyDown,
          global: { oilPrice: oilUp },
          tension: 12,
          log: `轰炸造成伊朗兵力-${Math.round(hit * 0.75)}，但反战声浪扩大：美国支持率-${apprDown}，盟友-${allyDown}，油价+${oilUp}。`,
        };
      }
      return { iran: { troops: -hit }, tension: 12, log: `连续轰炸得手：伊朗兵力-${hit}。` };
    },
    log: '高风险打兵力：推进快，但政治代价更大。',
  },

  // === 目标：消耗伊朗支持率（2条：低风险/高风险） ===
  {
    id: 'usa_attack_ir_approval_low',
    name: '信息战/精准宣传（低风险，压伊支持率）',
    cost: 22,
    gain: '伊朗支持率-2~5，中国-1，紧张度+2；小概率翻车（伊朗支持率+1，制裁有效性下降：制裁-2）',
    apply(game) {
      const hit = 2 + Math.floor(Math.random() * 4); // 2~5
      const backfire = Math.random() < 0.18;
      if (backfire) {
        return { iran: { approval: 1 }, sanctionLevel: -2, tension: 2, log: '信息战翻车：对方“反向团结”，制裁执行还变松了。' };
      }
      return { iran: { approval: -hit }, china: -1, tension: 2, log: `信息战发酵：伊朗支持率-${hit}。` };
    },
    log: '低风险压支持率：不容易翻大车，但也不致命。',
  },
  {
    id: 'usa_attack_ir_approval_high',
    name: '定点清除/斩首式行动（高风险，重压伊支持率）',
    cost: 75,
    costDetail: { troops: 2, approval: 6 },
    gain: '伊朗支持率-4~9，紧张度+14；高概率反噬（伊朗支持率反弹+2~6 或 美国支持率-8~-15，油价+10~25）',
    apply(game) {
      const hit = 4 + Math.floor(Math.random() * 6); // 6~14
      const backlash = Math.random() < 0.65;
      if (backlash) {
        const roll = Math.random();
        if (roll < 0.45) {
          const rally = 2 + Math.floor(Math.random() * 5); // 2~6
          return {
            iran: { approval: rally },
            global: { oilPrice: 10 + Math.floor(Math.random() * 16) },
            tension: 14,
            log: `高风险行动引发“同仇敌忾”：伊朗支持率反弹+${rally}，油价上行。`,
          };
        }
        const apprDown = 8 + Math.floor(Math.random() * 8); // 8~15
        const oilUp = 10 + Math.floor(Math.random() * 16); // 10~25
        return {
          iran: { approval: -Math.max(3, Math.floor(hit * 0.6)) },
          usa: { approval: -apprDown },
          global: { oilPrice: oilUp },
          tension: 14,
          log: `行动造成伊朗支持率-${Math.max(3, Math.floor(hit * 0.6))}，但国内反战更大：美国支持率-${apprDown}，油价+${oilUp}。`,
        };
      }
      return { iran: { approval: -hit }, tension: 14, log: `高风险行动得手：伊朗支持率-${hit}。` };
    },
    log: '高风险压支持率：推进快，但最容易触发“反向团结”或国内反战。',
  },

  // === 目标：消耗伊朗石油储备（2条：低风险/高风险） ===
  {
    id: 'usa_attack_ir_oil_low',
    name: '海上拦截/查扣油轮（低风险，磨伊油储）',
    cost: 26,
    costDetail: { approval: 1 },
    gain: '伊朗石油-3~7，制裁+3，紧张度+4；小概率反噬（盟友-3，油价+4~12）',
    apply(game) {
      const hit = 3 + Math.floor(Math.random() * 5); // 3~7（伊朗初始80）
      const backlash = Math.random() < 0.22;
      if (backlash) {
        const oilUp = 4 + Math.floor(Math.random() * 9); // 4~12
        return {
          iran: { oilReserve: -Math.max(2, Math.floor(hit * 0.6)) },
          allySupport: -3,
          global: { oilPrice: oilUp },
          sanctionLevel: 3,
          tension: 5,
          log: `拦截引争议：伊朗石油-${Math.max(2, Math.floor(hit * 0.6))}，盟友-3，油价+${oilUp}，制裁+3。`,
        };
      }
      return { iran: { oilReserve: -hit }, sanctionLevel: 3, tension: 4, log: `拦截查扣：伊朗石油储备-${hit}，制裁+3。` };
    },
    log: '低风险打油储：掐得住，但别掐过头。',
  },
  {
    id: 'usa_attack_ir_oil_high',
    name: '封锁升级/强力查扣（高风险，重击伊油储）',
    cost: 65,
    costDetail: { troops: 2, approval: 4 },
    gain: '伊朗石油-7~14，制裁+6~10，紧张度+12；高概率反噬（油价+12~30，美股-60~-180，美国支持率-4~-10）',
    apply(game) {
      const hit = 7 + Math.floor(Math.random() * 8); // 8~18
      const sanc = 6 + Math.floor(Math.random() * 5); // 6~10
      const backlash = Math.random() < 0.6;
      if (backlash) {
        const oilUp = 12 + Math.floor(Math.random() * 19); // 12~30
        const stockDown = 60 + Math.floor(Math.random() * 121); // 60~180
        const apprDown = 4 + Math.floor(Math.random() * 7); // 4~10
        return {
          iran: { oilReserve: -Math.round(hit * 0.75) },
          global: { oilPrice: oilUp, stockIndex: -stockDown },
          usa: { approval: -apprDown },
          sanctionLevel: sanc,
          tension: 12,
          log: `封锁升级重击伊朗，但市场反噬：伊朗石油-${Math.round(hit * 0.75)}，油价+${oilUp}，美股-${stockDown}，美国支持率-${apprDown}，制裁+${sanc}。`,
        };
      }
      return { iran: { oilReserve: -hit }, sanctionLevel: sanc, tension: 12, log: `封锁升级：伊朗石油储备-${hit}，制裁+${sanc}。` };
    },
    log: '高风险打油储：推进快，但会直接烧到油价与市场。',
  },

  // === 美国自增：军费 / 兵力 / 支持率（各1条） ===
  {
    id: 'usa_boost_budget',
    name: '战时预算追加/军工扩产（加军费）',
    cost: 0,
    costDetail: { approval: 5 },
    gain: '美国军费+240~520，支持率-5；小概率股市-40~-120',
    apply(game) {
      const add = 240 + Math.floor(Math.random() * 281); // 240~520（相对美国初始3000：可见但不离谱）
      const stockHit = Math.random() < 0.25 ? (40 + Math.floor(Math.random() * 81)) : 0;
      return {
        usa: { militaryBudget: add },
        global: stockHit ? { stockIndex: -stockHit } : undefined,
        log: stockHit
          ? `预算追加/扩产：军费+${add}，但市场担忧赤字：美股-${stockHit}。`
          : `预算追加/扩产：军费+${add}（支持率消耗已计入）。`,
      };
    },
    log: '用民意换产能：钱到位，争议也到位。',
  },
  {
    id: 'usa_boost_troops',
    name: '增兵与轮换（加兵力）',
    cost: 35,
    gain: '美国兵力+10~25，紧张度+3；小概率支持率-2',
    apply(game) {
      const add = 10 + Math.floor(Math.random() * 16); // 10~25
      const backlash = Math.random() < 0.2 ? -2 : 0;
      return {
        usa: { troops: add, approval: backlash },
        tension: 3,
        log: backlash ? `增兵轮换：兵力+${add}，但“战争疲劳”支持率-2。` : `增兵轮换：兵力+${add}。`,
      };
    },
    log: '补兵：能上前线，但也会被问“为什么要去”。',
  },
  {
    id: 'usa_boost_approval',
    name: '降温表态/稳民意组合拳（加支持率）',
    cost: 28,
    gain: '美国支持率+5~12，紧张度-4，股市+30~120；小概率盟友-3',
    apply(game) {
      const add = 5 + Math.floor(Math.random() * 8); // 5~12
      const stock = 30 + Math.floor(Math.random() * 91); // 30~120
      const allyDown = Math.random() < 0.18 ? -3 : 0;
      return {
        usa: { approval: add },
        global: { stockIndex: stock },
        tension: -4,
        allySupport: allyDown,
        log: allyDown
          ? `稳民意表态：支持率+${add}，美股+${stock}，但盟友觉得你“太软”盟友-3。`
          : `稳民意表态：支持率+${add}，美股+${stock}，紧张度下降。`,
      };
    },
    log: '给市场和选民一个台阶：短期很有效。',
  },
];

/** 伊朗策略 */
const STRATEGIES_IRAN = [
  {
    // === 目标：消耗美国军费（2条：低风险/高风险） ===
    id: 'iran_attack_us_budget_low',
    name: '金融/制裁缝隙套利（低风险，打美军费）',
    cost: 14,
    gain: '美国军费-120~220，紧张度+2；小概率被抓包（伊朗支持率-2，制裁+2）',
    apply(game) {
      const hit = 120 + Math.floor(Math.random() * 101); // 120~220
      const caught = Math.random() < 0.18;
      if (caught) {
        return {
          usa: { militaryBudget: -Math.round(hit * 0.6) },
          iran: { approval: -2 },
          tension: 3,
          sanctionLevel: 2,
          log: `套利行动部分奏效，但被曝出“灰色网络”：美军费-${Math.round(hit * 0.6)}，伊朗支持率-2，制裁+2。`,
        };
      }
      return { usa: { militaryBudget: -hit }, tension: 2, log: `金融/采购链条被扰动：美国军费-${hit}。` };
    },
    log: '低风险打预算：慢一点，但更稳。',
  },
  {
    id: 'iran_attack_us_budget_high',
    name: '供应链破坏/黑客勒索（高风险，重击美军费）',
    cost: 38,
    costDetail: { troops: 2, approval: 2 },
    gain: '美国军费-260~520，紧张度+6~10；大概率反噬（制裁+6~10，伊朗军费-20~60或支持率-4）',
    apply(game) {
      const hit = 260 + Math.floor(Math.random() * 261); // 260~520
      const backlash = Math.random() < 0.65;
      const tensionUp = 6 + Math.floor(Math.random() * 5); // 6~10
      if (backlash) {
        const sanc = 6 + Math.floor(Math.random() * 5); // 6~10
        const type = Math.random();
        if (type < 0.55) {
          const irLoss = 20 + Math.floor(Math.random() * 41); // 20~60
          return {
            usa: { militaryBudget: -Math.round(hit * 0.8) },
            iran: { militaryBudget: -irLoss },
            sanctionLevel: sanc,
            tension: tensionUp,
            log: `高风险行动造成美军费-${Math.round(hit * 0.8)}，但被溯源反制：伊朗军费-${irLoss}，制裁+${sanc}。`,
          };
        }
        return {
          usa: { militaryBudget: -Math.round(hit * 0.8) },
          iran: { approval: -4 },
          sanctionLevel: sanc,
          tension: tensionUp,
          log: `高风险行动重创部分预算，但被溯源反制：伊朗支持率-4，制裁+${sanc}。`,
        };
      }
      return { usa: { militaryBudget: -hit }, tension: tensionUp, log: `供应链/黑客行动得手：美国军费-${hit}。` };
    },
    log: '高风险打预算：打得到更深，但很容易被反制。',
  },

  // === 目标：消耗美国兵力（2条：低风险/高风险） ===
  {
    id: 'iran_attack_us_troops_low',
    name: '边缘摩擦/小规模袭扰（低风险，磨美兵力）',
    cost: 16,
    costDetail: { troops: 1 },
    gain: '美国兵力-2~6，紧张度+4；小概率翻车（伊朗兵力-2，支持率-1）',
    apply(game) {
      const dmg = 2 + Math.floor(Math.random() * 5); // 2~6
      const backfire = Math.random() < 0.2;
      if (backfire) {
        return {
          usa: { troops: -Math.max(1, Math.floor(dmg / 2)) },
          iran: { troops: -2, approval: -1 },
          tension: 5,
          log: `小规模袭扰部分奏效，但遭遇反击：美军-${Math.max(1, Math.floor(dmg / 2))}，伊朗兵力-2，支持率-1。`,
        };
      }
      return { usa: { troops: -dmg }, tension: 4, log: `边缘摩擦升级：美军兵力-${dmg}。` };
    },
    log: '低风险磨兵力：少量多次，慢慢磨。',
  },
  {
    id: 'iran_attack_us_troops_high',
    name: '精确伏击/无人机饱和打击（高风险，重击美兵力）',
    cost: 36,
    costDetail: { troops: 3, approval: 2 },
    gain: '美国兵力-7~18，紧张度+10；高概率反噬（伊朗兵力-4~10或支持率-5，制裁+4~8）',
    apply(game) {
      const dmg = 7 + Math.floor(Math.random() * 12); // 7~18
      const sanc = 4 + Math.floor(Math.random() * 5); // 4~8
      const backlash = Math.random() < 0.6;
      if (backlash) {
        const hitType = Math.random();
        if (hitType < 0.6) {
          const irTroopsLoss = 4 + Math.floor(Math.random() * 7); // 4~10
          return {
            usa: { troops: -Math.round(dmg * 0.75) },
            iran: { troops: -irTroopsLoss },
            sanctionLevel: sanc,
            tension: 10,
            log: `高风险打击造成美军-${Math.round(dmg * 0.75)}，但遭强力回击：伊朗兵力-${irTroopsLoss}，制裁+${sanc}。`,
          };
        }
        return {
          usa: { troops: -Math.round(dmg * 0.75) },
          iran: { approval: -5 },
          sanctionLevel: sanc,
          tension: 10,
          log: `高风险打击造成美军-${Math.round(dmg * 0.75)}，但引发国内压力：伊朗支持率-5，制裁+${sanc}。`,
        };
      }
      return { usa: { troops: -dmg }, sanctionLevel: 1, tension: 10, log: `精确打击得手：美军兵力-${dmg}（国际追责升温）。` };
    },
    log: '高风险打兵力：一把梭哈，后果也更硬。',
  },

  // === 目标：消耗美国支持率（2条：低风险/高风险） ===
  {
    id: 'iran_attack_us_approval_low',
    name: '舆论放大/议题带节奏（低风险，压美支持率）',
    cost: 14,
    costDetail: { militaryBudget: 0 },
    gain: '美国支持率-2~5，紧张度+2；小概率翻车（美国支持率+1，伊朗支持率-2）',
    apply(game) {
      const hit = 2 + Math.floor(Math.random() * 4); // 2~5
      const backfire = Math.random() < 0.18;
      if (backfire) {
        return { usa: { approval: 1 }, iran: { approval: -2 }, tension: 2, log: '议题操作翻车：美方舆论反弹，伊朗反而被骂。' };
      }
      return { usa: { approval: -hit }, tension: 2, log: `舆论发酵：美国支持率-${hit}。` };
    },
    log: '低风险压支持率：效果中等，但更稳定。',
  },
  {
    id: 'iran_attack_us_approval_high',
    name: '重大爆料/黑料投放（高风险，重压美支持率）',
    cost: 34,
    costDetail: { approval: 3 },
    gain: '美国支持率-6~12，紧张度+6；高概率反噬（伊朗支持率-4~8，制裁+3~7）',
    apply(game) {
      const hit = 6 + Math.floor(Math.random() * 7); // 6~12
      const backlash = Math.random() < 0.55;
      if (backlash) {
        const irLoss = 4 + Math.floor(Math.random() * 5); // 4~8
        const sanc = 3 + Math.floor(Math.random() * 5); // 3~7
        return {
          usa: { approval: -Math.max(3, Math.floor(hit * 0.6)) },
          iran: { approval: -irLoss },
          sanctionLevel: sanc,
          tension: 6,
          log: `爆料引发震荡但被追查：美国支持率-${Math.max(3, Math.floor(hit * 0.6))}，伊朗支持率-${irLoss}，制裁+${sanc}。`,
        };
      }
      return { usa: { approval: -hit }, tension: 6, log: `爆料扩散：美国支持率-${hit}。` };
    },
    log: '高风险压支持率：打得狠，但更容易遭全球反制（并触发持续反噬）。',
  },

  // === 目标：消耗美国石油储备（2条：低风险/高风险） ===
  {
    id: 'iran_attack_us_oil_low',
    name: '航运扰动/保险溢价（低风险，磨美油储）',
    cost: 16,
    costDetail: { oilReserve: 2 },
    gain: '美国石油-3~6，油价+4~10，紧张度+4；小概率翻车（伊朗石油-2）',
    apply(game) {
      const hit = 3 + Math.floor(Math.random() * 4); // 3~6
      const oilUp = 4 + Math.floor(Math.random() * 7); // 4~10
      const backfire = Math.random() < 0.2;
      if (backfire) {
        return {
          usa: { oilReserve: -Math.max(1, Math.floor(hit / 2)) },
          iran: { oilReserve: -2 },
          global: { oilPrice: oilUp },
          tension: 4,
          log: `航运扰动部分奏效，但自身供应也受影响：美石油-${Math.max(1, Math.floor(hit / 2))}，伊朗石油-2，油价+${oilUp}。`,
        };
      }
      return { usa: { oilReserve: -hit }, global: { oilPrice: oilUp }, tension: 4, log: `航运成本飙升：美国石油储备-${hit}，油价+${oilUp}。` };
    },
    log: '低风险打油储：让对手多消耗一点油。',
  },
  {
    id: 'iran_attack_us_oil_high',
    name: '海上封锁式升级/大规模骚扰（高风险，重击美油储）',
    cost: 34,
    costDetail: { troops: 2, oilReserve: 3, approval: 2 },
    gain: '美国石油-7~16，油价+12~28，紧张度+12；高概率反噬（制裁+5~10，伊朗军费-20~70或兵力-3~8）',
    apply(game) {
      const hit = 7 + Math.floor(Math.random() * 10); // 7~16
      const oilUp = 12 + Math.floor(Math.random() * 17); // 12~28
      const sanc = 5 + Math.floor(Math.random() * 6); // 5~10
      const backlash = Math.random() < 0.62;
      if (backlash) {
        const t = Math.random();
        if (t < 0.55) {
          const irLoss = 20 + Math.floor(Math.random() * 51); // 20~70
          return {
            usa: { oilReserve: -Math.round(hit * 0.75) },
            iran: { militaryBudget: -irLoss },
            global: { oilPrice: oilUp },
            sanctionLevel: sanc,
            tension: 12,
            log: `升级行动推升油价但遭严厉反制：美石油-${Math.round(hit * 0.75)}，伊朗军费-${irLoss}，制裁+${sanc}，油价+${oilUp}。`,
          };
        }
        const irTroopsLoss = 3 + Math.floor(Math.random() * 6); // 3~8
        return {
          usa: { oilReserve: -Math.round(hit * 0.75) },
          iran: { troops: -irTroopsLoss },
          global: { oilPrice: oilUp },
          sanctionLevel: sanc,
          tension: 12,
          log: `升级行动奏效但遭军事压制：美石油-${Math.round(hit * 0.75)}，伊朗兵力-${irTroopsLoss}，制裁+${sanc}，油价+${oilUp}。`,
        };
      }
      return {
        usa: { oilReserve: -hit },
        global: { oilPrice: oilUp },
        sanctionLevel: 2,
        tension: 12,
        log: `海上骚扰升级：美国石油储备-${hit}，油价+${oilUp}（国际压力上升）。`,
      };
    },
    log: '高风险打油储：打得很疼，但也最容易把自己拖进制裁深渊。',
  },

  // === 伊朗自增：军费 / 兵力 / 支持率（各1条） ===
  {
    id: 'iran_boost_budget',
    name: '战时动员经济（加军费）',
    cost: 0,
    costDetail: { approval: 5 },
    gain: '伊朗军费+30~90，支持率-5，紧张度+2',
    apply(game) {
      const add = 30 + Math.floor(Math.random() * 61); // 30~90
      return { iran: { militaryBudget: add }, tension: 2, log: `动员经济与募资：伊朗军费+${add}（支持率消耗已计入）。` };
    },
    log: '用民生换现金流：能撑住，但不会舒服。',
  },
  {
    id: 'iran_boost_troops',
    name: '征召/训练加速（加兵力）',
    cost: 22,
    costDetail: { approval: 2 },
    gain: '伊朗兵力+10~22，紧张度+3',
    apply(game) {
      const add = 10 + Math.floor(Math.random() * 13); // 10~22
      return { iran: { troops: add }, tension: 3, log: `征召/训练加速：伊朗兵力+${add}。` };
    },
    log: '补兵：短期涨得快，长期压力更大。',
  },
  {
    id: 'iran_boost_approval',
    name: '稳民生组合拳（加支持率）',
    cost: 26,
    gain: '伊朗支持率+6~14，紧张度-2；小概率翻车（军费-20）',
    apply(game) {
      const add = 6 + Math.floor(Math.random() * 9); // 6~14
      const backfire = Math.random() < 0.2;
      if (backfire) return { iran: { approval: Math.max(2, Math.floor(add * 0.5)), militaryBudget: -20 }, tension: -1, log: '稳民生政策“钱不够”：支持率涨得有限且财政吃紧。' };
      return { iran: { approval: add }, tension: -2, log: `稳民生措施奏效：伊朗支持率+${add}。` };
    },
    log: '稳民心：最稳的胜利条件，代价也最真实。',
  },
];
