/**
 * 美伊局势模拟器 - 每日对话（群聊/私聊）
 *
 * 设计：
 * - 每天会生成 1~2 条领导人消息（偏幽默但尽量贴事实语境）
 * - 玩家选择回复（3 选 1），每个回复带不同效果（影响支持率、军费、油价、股市、紧张度、中国态度、盟友支持度、制裁强度等）
 *
 * 注意：这是“玩法化”的讽刺模拟，不代表现实建议。
 */

const Leaders = {
  usa: { id: 'usa', name: '美国总统', avatar: '🇺🇸' },
  iran: { id: 'iran', name: '伊朗最高领袖', avatar: '🇮🇷' },
  china: { id: 'china', name: '中国领导人', avatar: '🇨🇳' },
  eu: { id: 'eu', name: '欧盟主席', avatar: '🇪🇺' },
  israel: { id: 'israel', name: '以色列总理', avatar: '🇮🇱' },
  russia: { id: 'russia', name: '俄罗斯总统', avatar: '🇷🇺' },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function leaderBySide(side) {
  return side === 'usa' ? Leaders.usa : Leaders.iran;
}

function ensureUsedChatStore(game) {
  if (!game.usedChatIds || typeof game.usedChatIds !== 'object') game.usedChatIds = { usa: [], iran: [] };
  if (!Array.isArray(game.usedChatIds.usa)) game.usedChatIds.usa = [];
  if (!Array.isArray(game.usedChatIds.iran)) game.usedChatIds.iran = [];
  return game.usedChatIds;
}

function wrapChat(id, chat) {
  return { id, ...chat };
}

function markUsedChat(game, side, id) {
  if (!id) return;
  const used = ensureUsedChatStore(game);
  const arr = side === 'usa' ? used.usa : used.iran;
  if (!arr.includes(id)) arr.push(id);
}

function pickUnusedById(game, side, candidates) {
  const used = ensureUsedChatStore(game);
  const set = new Set(side === 'usa' ? used.usa : used.iran);
  const unused = candidates.filter((c) => c && c.id && !set.has(c.id));
  return unused.length ? pick(unused) : null;
}

function analyzeState(game) {
  const tags = {};
  tags.oilLowUSA = game.usa.oilReserve < 40;
  tags.oilLowIran = game.iran.oilReserve < 30;
  tags.stockCrisis = game.global.stockIndex < 2300;
  tags.tensionHigh = game.tension > 70;
  tags.tensionVeryHigh = game.tension > 85;
  tags.allyLow = game.allySupport < 35;
  tags.sanctionHigh = game.sanctionLevel > 70;
  tags.sanctionLow = game.sanctionLevel < 25;
  tags.chinaProIran = game.china > 4;
  tags.chinaProUSA = game.china < -4;
  return tags;
}

// ===== 各类话题模板 =====

function makeDeescalateChat(game, tags) {
  const me = leaderBySide(game.playerSide);
  const from = pick([Leaders.china, Leaders.eu, Leaders.russia]);
  const text = game.playerSide === 'usa'
    ? `你们美国最近动作太大，战争一开谁都讨不到好。我们建议先想想怎么降温，你们这边怎么看？`
    : `你们伊朗和对方都在升级，战争一开谁都讨不到好。我们建议先想想怎么降温，你们这边怎么看？`;
  return {
    channel: '紧急联络群',
    from,
    text,
    replies: [
      {
        text: `${me.avatar}：好，我们先克制几天，看看能谈出什么来。`,
        effect: {
          tension: -10,
          allySupport: 3,
          global: { oilPrice: -4, stockIndex: 35 },
          usa: { approval: game.playerSide === 'usa' ? 2 : 0 },
          iran: { approval: game.playerSide === 'iran' ? 2 : 0 },
          log: '你公开表示会克制几天，市场和盟友都松了口气。',
        },
      },
      {
        text: `${me.avatar}：我们很克制了，这些军舰/导弹只是“路过”。`,
        effect: {
          tension: 6,
          global: { oilPrice: 5 },
          allySupport: -2,
          log: '你嘴上说克制，行动上很显眼，紧张度上升。',
        },
      },
      {
        text: `${me.avatar}：可以谈，但要对方先给点实质动作。`,
        effect: {
          tension: -4,
          sanctionLevel: game.playerSide === 'usa' ? 2 : 0,
          global: { stockIndex: 20 },
          log: '你提出“对方先动”的条件，局势略缓，但分歧还在。',
        },
      },
    ],
  };
}

function makeOilCrisisChat(game, tags) {
  const player = game.playerSide;
  const me = leaderBySide(player);
  const from = player === 'usa' ? Leaders.eu : Leaders.china;
  const text = player === 'usa'
    ? '你们美国那边的战略石油储备看着有点瘦了，你们打算靠谁撑？我们这边可以谈合作，但你们得先拿个态度。'
    : '你们伊朗再这么卖油、被制裁这么压，国内预算要扛不住了。我们想听听你们打算怎么应对。';

  return {
    channel: '能源小群',
    from,
    text,
    replies: [
      {
        text: `${me.avatar}：先囤一点，短期少赚点钱没关系。`,
        effect: {
          tension: 1,
          global: { oilPrice: 6 },
          ...(player === 'usa'
            ? { usa: { oilReserve: 4, militaryBudget: -game.oilToBudget(4) } }
            : { iran: { oilReserve: 3, militaryBudget: -game.oilToBudget(1) } }),
          log: '你选择囤油待价，短期收入变少，但手里多了点油。',
        },
      },
      {
        text: `${me.avatar}：继续大卖，先把军费补上再说。`,
        effect: {
          tension: 4,
          global: { oilPrice: -3 },
          ...(player === 'usa'
            ? { usa: { militaryBudget: game.oilToBudget(4), oilReserve: -4 } }
            : { iran: { militaryBudget: game.oilToBudget(3), oilReserve: -3 } }),
          log: '你继续大卖石油，军费多了些，价格略回落。',
        },
      },
      {
        text: `${me.avatar}：能不能让中国/盟友帮忙做一点掉期？`,
        effect: {
          china: player === 'iran' ? 2 : -1,
          allySupport: player === 'usa' ? 3 : 0,
          global: { oilPrice: -2, stockIndex: 20 },
          log: '你尝试用金融手段平滑油价，有部分效果。',
        },
      },
    ],
  };
}

function makeStockPanicChat(game, tags) {
  const player = game.playerSide;
  const me = leaderBySide(player);
  const from = player === 'usa' ? pick([Leaders.eu, Leaders.china]) : Leaders.usa;
  const text = player === 'usa'
    ? '你们美国这边能不能先别吵，把指数从“自由落体”拉回来一点？我们这边基金经理已经快没头发了。'
    : '你们伊朗那边能不能先别吵，把指数从“自由落体”拉回来一点？我们华尔街已经快没头发了。';
  return {
    channel: '华尔街吐槽群',
    from,
    text,
    replies: [
      {
        text: `${me.avatar}：好，我公开说一句“不会长期冲突”。`,
        effect: {
          tension: -6,
          global: { stockIndex: 80, oilPrice: -3 },
          usa: { approval: 2 },
          allySupport: 2,
          log: '你给出“不会长期冲突”的信号，美股反弹，油价略回落。',
        },
      },
      {
        text: `${me.avatar}：市场自己会修正，我们先把对手打服。`,
        effect: {
          tension: 8,
          global: { stockIndex: -50, oilPrice: 6 },
          usa: { approval: -3 },
          log: '你选择继续强硬，市场更紧张，反战声更大。',
        },
      },
      {
        text: `${me.avatar}：我们会考虑一些“技术性措施”，细节不对外讲。`,
        effect: {
          global: { stockIndex: 40 },
          usa: { approval: 1 },
          log: '你放出口风要技术救市，市场略有安慰。',
        },
      },
    ],
  };
}

function makeAllyComplaintChat(game, tags) {
  const player = game.playerSide;
  const me = leaderBySide(player);
  const from = Leaders.eu;
  const youSide = player === 'usa' ? '美国' : '伊朗';
  const text = `我们觉得你们${youSide}最近要么太激进，要么太软，我们不好跟选民解释。你们能不能给个明确说法？`;
  return {
    channel: '盟友小圈群',
    from,
    text,
    replies: [
      {
        text: `${me.avatar}：好，我们收敛一点，你们也多说好话。`,
        effect: {
          allySupport: 8,
          tension: -4,
          global: { oilPrice: -3, stockIndex: 30 },
          log: '你安抚了盟友，朋友圈稍微稳了一点。',
        },
      },
      {
        text: `${me.avatar}：安全问题上，我们不会道歉。`,
        effect: {
          allySupport: -6,
          tension: 4,
          global: { oilPrice: 4 },
          usa: { approval: player === 'usa' ? 2 : 0 },
          log: '你继续强硬，盟友更紧张，但国内部分人叫好。',
        },
      },
      {
        text: `${me.avatar}：要不你们出点钱/兵，我们一起硬。`,
        effect: {
          allySupport: 3,
          usa: { militaryBudget: player === 'usa' ? 10 : 0 },
          tension: 3,
          log: '盟友勉强出点钱，朋友圈没那么生气，你也多了点军费。',
        },
      },
    ],
  };
}

function makeSanctionChat(game, tags) {
  const me = leaderBySide(game.playerSide);
  const from = game.playerSide === 'usa' ? Leaders.usa : Leaders.iran;
  const isUSA = game.playerSide === 'usa';
  const text = isUSA
    ? '你们对伊朗的制裁已经打得很重了，但也有人说这对我们自己也有副作用。你们准备怎么调？'
    : '这些制裁再这么打，你们伊朗这边的预算会越来越紧。你们还打算硬扛多久？';

  return {
    channel: '制裁协调群',
    from,
    text,
    replies: [
      {
        text: `${me.avatar}：再加一轮，让对方知道是认真的。`,
        effect: isUSA
          ? {
              sanctionLevel: 8,
              iran: { militaryBudget: -15 },
              global: { oilPrice: 6 },
              allySupport: 3,
              tension: 6,
              log: '你再加一轮制裁，盟友叫好，油价也往上蹦。',
            }
          : {
              sanctionLevel: 5,
              iran: { approval: 3 },
              tension: 5,
              log: '你表示会继续硬扛，国内支持率略升，制裁环境更紧。',
            },
      },
      {
        text: `${me.avatar}：适当放一点口风，看看能否换回对方让步。`,
        effect: {
          sanctionLevel: -6,
          tension: -5,
          global: { oilPrice: -3, stockIndex: 25 },
          log: '你释放“可以谈”的信号，制裁稍微松一点，市场稍稳。',
        },
      },
      {
        text: `${me.avatar}：我们自己再搞点灰色渠道/豁免。`,
        effect: isUSA
          ? {
              allySupport: -2,
              usa: { approval: -2 },
              iran: { militaryBudget: -5 },
              log: '你给部分国家豁免，盟友有人不爽，局面略复杂。',
            }
          : {
              iran: { militaryBudget: 10 },
              sanctionLevel: -3,
              china: 2,
              log: '你通过灰色渠道绕了一些制裁，军费略有缓解。',
            },
      },
    ],
  };
}

function makeGenericGroupChat(game) {
  const groupChannels = ['外交群聊：四方小群', '联合国临时群', '中东局势工作群'];
  const groupFrom = pick([Leaders.china, Leaders.eu, Leaders.russia]);
  const youSide = game.playerSide === 'usa' ? '美国' : '伊朗';
  const groupTopics = game.playerSide === 'usa'
    ? [
        `我们呼吁你们美国克制、别升级冲突。`,
        `想跟你们美国这边提议：技术层面谈谈油轮安全。`,
        `建议你们双方先把话说清楚：谁先动手？`,
        `你们两边再这么搞，油价再涨大家都要吃土。`,
      ]
    : [
        `我们呼吁你们伊朗克制、别升级冲突。`,
        `想跟你们伊朗这边提议：技术层面谈谈油轮安全。`,
        `建议你们双方先把话说清楚：谁先动手？`,
        `你们两边再这么搞，油价再涨大家都要吃土。`,
      ];
  const me = leaderBySide(game.playerSide);
  return {
    channel: pick(groupChannels),
    from: groupFrom,
    text: `${pick(groupTopics)}（顺便：媒体已经写好标题了。）`,
    replies: [
      {
        text: `${me.avatar}：同意对话，但我们要“先讲原则”。`,
        effect: {
          tension: -5,
          china: game.playerSide === 'usa' ? 1 : 2,
          allySupport: 2,
          log: '你在群里释放对话信号，紧张度下降一点。',
        },
      },
      {
        text: `${me.avatar}：我们很克制——只是把航母/导弹放在更显眼的位置。`,
        effect: { tension: 6, global: { oilPrice: 5 }, log: '你在群里“克制但显眼”，油价略涨，紧张度上升。' },
      },
      {
        text: `${me.avatar}：别吵了，先谈石油和股市怎么稳住。`,
        effect: { tension: -3, global: { oilPrice: -3, stockIndex: 40 }, log: '你把话题拉回经济，油价略回落，美股略稳。' },
      },
    ],
  };
}

function makeGenericPrivateChat(game) {
  const player = game.playerSide;
  const opponent = player === 'usa' ? 'iran' : 'usa';
  const me = leaderBySide(player);
  const them = leaderBySide(opponent);
  const from = pick([them, Leaders.china, Leaders.eu]);

  if (from.id === 'china') {
    const youSide = player === 'usa' ? '美国' : '伊朗';
    return {
      channel: '私聊',
      from,
      text: `🇨🇳 ${Leaders.china.name}：我先确认一下。\n你们${youSide}现在这条线如果再往上走，油价和航运保险都会一起炸。\n\n你准备怎么做？给我一句“我能转述”的话。`,
      replies: [
        {
          text: `${me.avatar}：我们愿意谈判，先把温度降下来。`,
          effect: { tension: -8, china: 2, allySupport: 2, log: '你向中国表达降温意愿。对方回：好，我去安排“台阶”。' },
        },
        {
          text: `${me.avatar}：我们会更强硬，你别劝了。`,
          effect: { tension: 8, china: -2, global: { oilPrice: 6 }, log: '你回绝调停，紧张度上升。对方回：明白了，那我只能准备应对外溢。' },
        },
        {
          text: `${me.avatar}：你能不能帮我做点渠道/背书？`,
          effect: player === 'iran'
            ? { china: 3, iran: { militaryBudget: game.oilToBudget(3) }, tension: -2, log: '你争取中国渠道，获得部分收入。对方回：可以试试，但别太高调。' }
            : { china: -1, global: { stockIndex: 30 }, log: '你希望中国表态稳市场，效果一般但略稳。对方回：公开背书不现实，我只能做点私下工作。' },
        },
      ],
    };
  }

  if (from.id === opponent) {
    const text = player === 'usa'
      ? `${them.avatar} ${them.name}：你们说“不想打”，但你们每天都在加码。\n\n今天你准备怎么“证明”决心？给我一句明白话。`
      : `${them.avatar} ${them.name}：你们说要谈判，但航母一直不走。\n\n你到底想谈，还是想秀？别绕弯子。`;
    return {
      channel: '私聊',
      from,
      text,
      replies: [
        { text: `${me.avatar}：我们愿意谈，先降温。`, effect: { tension: -10, log: '你向对手释放降温信号。对方回：那就拿出点动作。' } },
        {
          text: `${me.avatar}：我们会继续施压/反击。`,
          effect: { tension: 12, global: { oilPrice: 8 }, log: '你强硬回应，油价上扬，国内也更撕裂。对方回：行，那就继续耗。' },
        },
        {
          text: `${me.avatar}：我们要一个“体面结局”：交换条件。`,
          effect: { tension: -6, global: { stockIndex: 40, oilPrice: -4 }, log: '你提出交换条件，市场略稳。对方回：把条件发来。' },
        },
      ],
    };
  }

  // 欧盟私聊
  const youSide = player === 'usa' ? '美国' : '伊朗';
  return {
    channel: '私聊',
    from,
    text: `🇪🇺 ${Leaders.eu.name}：我不想再听“解释”了。\n油价、难民、街头抗议，全在问：你们${youSide}到底要把事闹多大？\n\n能不能把戏演得“没那么像真的”？给我一个能回去交差的说法。`,
    replies: [
      {
        text: `${me.avatar}：好，我们克制一点。`,
        effect: { tension: -7, global: { oilPrice: -5, stockIndex: 30 }, allySupport: 4, log: '你给欧盟面子，市场略稳。对方回：行，我帮你压一压舆论。' },
      },
      {
        text: `${me.avatar}：不行，这是原则问题。`,
        effect: { tension: 6, global: { oilPrice: 4 }, allySupport: -3, log: '你坚持原则，油价略涨。对方回：那我们只能公开“保持距离”。' },
      },
      {
        text: `${me.avatar}：你们出钱/出力，我们就冷静。`,
        effect: {
          tension: -3,
          usa: { militaryBudget: game.playerSide === 'usa' ? 15 : 0 },
          iran: { militaryBudget: game.playerSide === 'iran' ? 10 : 0 },
          allySupport: 3,
          log: '你试图要“援助”，对方勉强给点。对方回：我只能给一点，别把我推上前台。',
        },
      },
    ],
  };
}

// ===== 状态机版 generateDailyChats =====

function makePrivatePoolUSA(game, tags) {
  const me = Leaders.usa;
  const opponent = Leaders.iran;
  const pool = [];

  pool.push(wrapChat('usa_pm_china_01', {
    channel: '私聊',
    from: Leaders.china,
    text: `🇨🇳 ${Leaders.china.name}：我直说了。\n现在再升级，航运保险、油价、供应链都会一起炸。\n\n你准备给一个“克制窗口”吗？我需要一句能对外说的话。`,
    replies: [
      { text: `${me.avatar}：给窗口。但你也要让对方停手。`, effect: { tension: -7, global: { oilPrice: -4, stockIndex: 40 }, allySupport: 2, log: '你答应给“克制窗口”。对方回：可以转达，但要看你们行动。' } },
      { text: `${me.avatar}：不行。我们要把压力拉满。`, effect: { tension: 7, global: { oilPrice: 6, stockIndex: -50 }, usa: { approval: -2 }, log: '你拒绝降温。对方回：那我们只能准备“溢出效应”了。' } },
      { text: `${me.avatar}：你能不能公开帮我们背书稳市场？`, effect: { china: -2, global: { stockIndex: 30 }, log: '你要求公开背书。对方回：公开背书很难，但我可以私下做点工作。' } },
    ],
  }));

  pool.push(wrapChat('usa_pm_eu_01', {
    channel: '私聊',
    from: Leaders.eu,
    text: `🇪🇺 ${Leaders.eu.name}：我这边真的顶不住了。\n油价、难民、街头抗议，全在问“你们到底想干嘛”。\n\n你能不能把节奏放慢一点？给我一个能解释的说法。`,
    replies: [
      { text: `${me.avatar}：好，我把行动强度降一档。`, effect: { allySupport: 4, tension: -5, global: { oilPrice: -3, stockIndex: 25 }, log: '你放缓节奏安抚盟友。对方回：行，我帮你压一压舆论。' } },
      { text: `${me.avatar}：这是安全问题，我们不会退。`, effect: { allySupport: -5, tension: 4, global: { oilPrice: 4 }, log: '你坚持强硬。对方回：那我只能跟选民说“我们无力影响你们”。' } },
      { text: `${me.avatar}：要不你们出点资源，我们就更好收手。`, effect: { allySupport: 2, usa: { militaryBudget: 30 }, tension: 2, log: '你顺势要资源。对方回：我只能给一点“象征性”的。' } },
    ],
  }));

  pool.push(wrapChat('usa_pm_wallst_01', {
    channel: '私聊',
    from: pick([Leaders.eu, Leaders.china]),
    text: `📈 对方：你别笑。\n基金经理刚给我打电话：你们到底是“短冲突”还是“长期拉扯”？\n\n给一句可预期的口径，不然他们要开始砍仓位了。`,
    replies: [
      { text: `${me.avatar}：短冲突，我们会控制升级。`, effect: { tension: -6, global: { stockIndex: 90, oilPrice: -2 }, usa: { approval: 2 }, log: '你给出“短冲突”口径。对方回：行，我去跟市场说“可控”。' } },
      { text: `${me.avatar}：该强硬就强硬，让市场自己适应。`, effect: { tension: 6, global: { stockIndex: -70, oilPrice: 5 }, usa: { approval: -3 }, log: '你选择强硬口径。对方回：那就只能“让市场用脚投票”了。' } },
      { text: `${me.avatar}：我们会做技术性稳市，细节不公开。`, effect: { global: { stockIndex: 50 }, usa: { approval: 1 }, log: '你暗示稳市。对方回：好，至少有一句“会管”。' } },
    ],
  }));

  pool.push(wrapChat('usa_pm_opponent_01', {
    channel: '私聊',
    from: opponent,
    text: `${opponent.avatar} ${opponent.name}：你们说要谈，但制裁没松，军舰也没走。\n\n你到底想谈，还是想逼我们先低头？给一句准话。`,
    replies: [
      { text: `${me.avatar}：谈。但你们先停手，我们才松。`, effect: { tension: -4, sanctionLevel: 2, log: '你抛出条件。对方回：那就看谁先眨眼。' } },
      { text: `${me.avatar}：我们会继续施压，你自己选。`, effect: { tension: 10, global: { oilPrice: 7 }, log: '你强硬回应。对方回：那我们也不会退。' } },
      { text: `${me.avatar}：交换条件，给双方一个台阶。`, effect: { tension: -7, global: { stockIndex: 40, oilPrice: -3 }, log: '你提出交换条件。对方回：把条件发来，我会看。' } },
    ],
  }));

  // 根据状态追加一些更“针对”的私信
  if (tags.stockCrisis) {
    pool.push(wrapChat('usa_pm_stockcrisis_01', {
      channel: '私聊',
      from: Leaders.eu,
      text: `🇪🇺 ${Leaders.eu.name}：你看看指数。\n已经不是“抖一抖”了，是在流血。\n\n你能不能放一句“不会升级”？给市场止血。`,
      replies: [
        { text: `${me.avatar}：行，我现在就放话降温。`, effect: { tension: -8, global: { stockIndex: 120, oilPrice: -3 }, usa: { approval: 2 }, log: '你公开降温止血。对方回：我会把这句放到头条。' } },
        { text: `${me.avatar}：不，我们不向市场妥协。`, effect: { global: { stockIndex: -60 }, usa: { approval: -2 }, log: '你拒绝“为市场改口”。对方回：那就别怪市场也不留情。' } },
        { text: `${me.avatar}：我会做技术性稳市，别问细节。`, effect: { global: { stockIndex: 70 }, log: '你暗示救市。对方回：至少不是“摆烂”。' } },
      ],
    }));
  }

  if (tags.oilLowUSA) {
    pool.push(wrapChat('usa_pm_oillow_01', {
      channel: '私聊',
      from: Leaders.china,
      text: `🇨🇳 ${Leaders.china.name}：你们油储有点紧。\n别撑面子了，油价再飙一次，你们国内自己先炸。\n\n要不要先把油价这条线稳住？`,
      replies: [
        { text: `${me.avatar}：先稳油价，我会压一压节奏。`, effect: { tension: -6, global: { oilPrice: -5, stockIndex: 25 }, usa: { approval: 1 }, log: '你优先稳油价。对方回：行，我会按你的口径去沟通。' } },
        { text: `${me.avatar}：该用就用储备，先把油价压住。`, effect: { usa: { oilReserve: -5, approval: 1 }, global: { oilPrice: -6 }, tension: -3, log: '你动用储备压油价。对方回：短期有效，别玩脱。' } },
        { text: `${me.avatar}：继续强硬，油价涨也要扛。`, effect: { tension: 6, global: { oilPrice: 8 }, usa: { approval: -3 }, log: '你继续强硬。对方回：那我们只能准备“震荡”了。' } },
      ],
    }));
  }

  return pool;
}

function makePrivatePoolIRAN(game, tags) {
  const me = Leaders.iran;
  const opponent = Leaders.usa;
  const pool = [];

  pool.push(wrapChat('iran_pm_china_01', {
    channel: '私聊',
    from: Leaders.china,
    text: `🇨🇳 ${Leaders.china.name}：我跟你说实话。\n制裁强度已经不低了，再打下去你们财政会先扛不住。\n\n你要不要给一个“谈判信号”？我可以帮你换一点喘息。`,
    replies: [
      { text: `${me.avatar}：行，我们愿意谈。先降温。`, effect: { tension: -7, china: 2, sanctionLevel: -3, global: { stockIndex: 20, oilPrice: -2 }, log: '你释放谈判信号。对方回：我来安排“台阶”，但你别半路翻脸。' } },
      { text: `${me.avatar}：不谈。我们扛得住。`, effect: { tension: 6, iran: { approval: 2 }, log: '你继续硬扛。对方回：那我也没法替你解释太多。' } },
      { text: `${me.avatar}：帮我开渠道，钱先回来。`, effect: { china: 3, iran: { militaryBudget: 20 }, log: '你争取渠道支持。对方回：我尽力，但别指望“公开”。' } },
    ],
  }));

  pool.push(wrapChat('iran_pm_eu_01', {
    channel: '私聊',
    from: Leaders.eu,
    text: `🇪🇺 ${Leaders.eu.name}：我不想绕弯子。\n油价一涨，我们国内先炸。\n\n你们能不能别再加戏？给市场一个确定性。`,
    replies: [
      { text: `${me.avatar}：好，我会收敛一点。`, effect: { tension: -6, global: { oilPrice: -4, stockIndex: 25 }, log: '你给欧盟面子。对方回：行，我也会帮你降一点舆论温度。' } },
      { text: `${me.avatar}：不行，这是生存问题。`, effect: { tension: 5, global: { oilPrice: 4 }, iran: { approval: 1 }, log: '你坚持强硬。对方回：那你别指望我们替你说话。' } },
      { text: `${me.avatar}：想我收敛？拿点实质帮助来。`, effect: { iran: { militaryBudget: 15 }, allySupport: -2, log: '你要援助。对方回：我可以给点，但别把我推到火上。' } },
    ],
  }));

  pool.push(wrapChat('iran_pm_russia_01', {
    channel: '私聊',
    from: Leaders.russia,
    text: `🇷🇺 ${Leaders.russia.name}：别只靠情绪撑。\n你们现在最缺的是：钱、油，还是时间？\n\n说清楚，我才知道怎么“帮”。`,
    replies: [
      { text: `${me.avatar}：我要现金流，先活下去。`, effect: { iran: { militaryBudget: 30, approval: -1 }, tension: 2, log: '你优先要现金流。对方回：行，生意可以谈。' } },
      { text: `${me.avatar}：我要降温，稳住局势。`, effect: { tension: -8, global: { stockIndex: 30, oilPrice: -3 }, log: '你选择降温。对方回：聪明，活得久才有牌。' } },
      { text: `${me.avatar}：我要油价上去，让他们先疼。`, effect: { global: { oilPrice: 8 }, tension: 4, log: '你选择推油价。对方回：行，但别把火烧到自己。' } },
    ],
  }));

  pool.push(wrapChat('iran_pm_opponent_01', {
    channel: '私聊',
    from: opponent,
    text: `${opponent.avatar} ${opponent.name}：我需要一句明白话。\n你们到底想不想谈？你们一升级，我们国内就更难收手。\n\n给个方向。`,
    replies: [
      { text: `${me.avatar}：谈。先松一点制裁。`, effect: { tension: -5, sanctionLevel: -3, log: '你提出先松制裁。对方回：我可以试试，但你别搞突袭。' } },
      { text: `${me.avatar}：不谈。你们别装无辜。`, effect: { tension: 10, global: { oilPrice: 7 }, iran: { approval: 2 }, log: '你强硬回应。对方回：那就继续耗。' } },
      { text: `${me.avatar}：交换条件，给双方一个台阶。`, effect: { tension: -7, global: { stockIndex: 35, oilPrice: -2 }, log: '你提出交换条件。对方回：把条件列出来。' } },
    ],
  }));

  if (tags.oilLowIran) {
    pool.push(wrapChat('iran_pm_oillow_01', {
      channel: '私聊',
      from: Leaders.china,
      text: `🇨🇳 ${Leaders.china.name}：你们油储不多了。\n再这么打，先没钱的是你们。\n\n要不要先减少内耗，把财政稳住？`,
      replies: [
        { text: `${me.avatar}：行，我先节流稳财政。`, effect: { iran: { militaryBudget: 25, approval: -1 }, log: '你优先稳财政。对方回：明白，我帮你挡一挡外部压力。' } },
        { text: `${me.avatar}：我继续强硬，先争空间。`, effect: { tension: 6, iran: { approval: 2 }, global: { oilPrice: 5 }, log: '你继续强硬。对方回：那你要承担更大波动。' } },
        { text: `${me.avatar}：给我开个口子，钱先回来。`, effect: { china: 3, iran: { militaryBudget: 20 }, log: '你争取渠道。对方回：我尽力，但你也得配合降温。' } },
      ],
    }));
  }

  if (tags.sanctionHigh) {
    pool.push(wrapChat('iran_pm_sanction_01', {
      channel: '私聊',
      from: Leaders.eu,
      text: `🇪🇺 ${Leaders.eu.name}：制裁已经很高了。\n再往上，你们财政会先出事。\n\n要不要考虑一个“体面降温”？我可以帮你找台阶。`,
      replies: [
        { text: `${me.avatar}：好，降温换喘息。`, effect: { tension: -8, sanctionLevel: -4, global: { oilPrice: -3, stockIndex: 25 }, log: '你同意体面降温。对方回：行，我会推动“降一档”。' } },
        { text: `${me.avatar}：不，我们扛得住。`, effect: { iran: { approval: 2 }, tension: 5, log: '你继续硬扛。对方回：那我也救不了你。' } },
        { text: `${me.avatar}：我们走灰色渠道，先活下去。`, effect: { iran: { militaryBudget: 25 }, sanctionLevel: -2, tension: 2, log: '你加码灰色渠道。对方回：别太高调，不然更麻烦。' } },
      ],
    }));
  }

  return pool;
}

function makeGroupPoolUSA(game, tags) {
  const pool = [];
  if (tags.stockCrisis) pool.push(wrapChat('usa_grp_stockpanic_01', makeStockPanicChat(game, tags)));
  if (tags.allyLow) pool.push(wrapChat('usa_grp_ally_01', makeAllyComplaintChat(game, tags)));
  if (tags.sanctionHigh) pool.push(wrapChat('usa_grp_sanction_01', makeSanctionChat(game, tags)));
  pool.push(wrapChat('usa_grp_generic_01', makeGenericGroupChat(game)));
  pool.push(wrapChat('usa_grp_generic_02', makeGenericGroupChat(game)));
  return pool;
}

function makeGroupPoolIRAN(game, tags) {
  const pool = [];
  if (tags.tensionVeryHigh) pool.push(wrapChat('iran_grp_deescalate_01', makeDeescalateChat(game, tags)));
  if (tags.oilLowUSA || tags.oilLowIran) pool.push(wrapChat('iran_grp_oilcrisis_01', makeOilCrisisChat(game, tags)));
  if (tags.sanctionHigh) pool.push(wrapChat('iran_grp_sanction_01', makeSanctionChat(game, tags)));
  pool.push(wrapChat('iran_grp_generic_01', makeGenericGroupChat(game)));
  pool.push(wrapChat('iran_grp_generic_02', makeGenericGroupChat(game)));
  return pool;
}

function generateChatsNoRepeat(game, side, tags) {
  const msgs = [];
  const groupPool = side === 'usa' ? makeGroupPoolUSA(game, tags) : makeGroupPoolIRAN(game, tags);
  const privatePool = side === 'usa' ? makePrivatePoolUSA(game, tags) : makePrivatePoolIRAN(game, tags);

  // 先选 1 条群聊（若有未用的）
  const g = pickUnusedById(game, side, groupPool);
  if (g) {
    msgs.push(g);
    markUsedChat(game, side, g.id);
  }

  // 再选 0~1 条私聊（更偏“多一些私信”）
  const wantPrivate = Math.random() < 0.75 || !msgs.length;
  if (wantPrivate) {
    const p = pickUnusedById(game, side, privatePool);
    if (p) {
      msgs.push(p);
      markUsedChat(game, side, p.id);
    }
  }

  // 若还不足 2 条，再补一条（优先私聊，再群聊）
  if (msgs.length < 2) {
    const p2 = pickUnusedById(game, side, privatePool);
    if (p2 && !msgs.find((x) => x.id === p2.id)) {
      msgs.push(p2);
      markUsedChat(game, side, p2.id);
    } else {
      const g2 = pickUnusedById(game, side, groupPool);
      if (g2 && !msgs.find((x) => x.id === g2.id)) {
        msgs.push(g2);
        markUsedChat(game, side, g2.id);
      }
    }
  }

  // 去掉内部 id 对 UI 的影响：UI 不关心 id，但留着也没坏处；这里直接保留
  return msgs.slice(0, 2);
}

/**
 * 生成当天消息列表（美伊两边内容不重复、不重叠）
 * @returns {Array<{from, channel, text, replies: Array<{text, effect}>}>}
 */
function generateDailyChats(game) {
  if (!game || game.phase !== 'play') return [];
  const tags = analyzeState(game);
  const side = game.playerSide === 'usa' ? 'usa' : 'iran';
  return generateChatsNoRepeat(game, side, tags);
}
