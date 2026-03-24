/**
 * 美伊局势模拟器 - 随机事件池（基于现实、幽默诙谐）
 * 效果格式: {
 *   usa?: { militaryBudget?, troops?, approval?, oilReserve?, stockHoldings? },
 *   iran?: { militaryBudget?, troops?, approval?, oilReserve? },
 *   global?: { oilPrice?, stockIndex? },
 *   china?, tension?, log?
 * }
 */
const GameEvents = [
  {
    title: '伊朗威胁封锁霍尔木兹海峡',
    desc: '伊朗革命卫队称「若被逼到墙角就封锁海峡」。全球油轮保险费用飙升，油价应声上涨。',
    outcomes: [
      { text: '航母“例行路过”，双方都说自己赢麻了。', effect: { usa: { militaryBudget: -40, approval: -3 }, iran: { approval: 4 }, global: { oilPrice: 15 }, log: '美军护航，油价涨 15，伊朗国内强硬派支持率升。' } },
      { text: '盟友开会开到凌晨：口头支持拉满，行动…下次一定。', effect: { global: { oilPrice: 8 }, iran: { approval: 2 }, usa: { approval: 2 }, log: '多国施压，油价小幅上涨，美国国内略稳。' } },
      { text: '快艇围观 + 无人机航拍：热搜刷屏，保险公司先笑。', effect: { global: { oilPrice: 25 }, usa: { approval: -10 }, iran: { approval: 6 }, log: '海峡紧张，油价暴涨，美国支持率大跌。' } },
    ],
  },
  {
    title: '伊朗宣布不向美国及其盟友出口石油',
    desc: '「一滴油都不卖给敌人。」美国本土不靠伊朗油，但盟友和全球市场抖三抖。',
    outcomes: [
      { text: '沙特一脚油门：产量上去，网友嘴也上去。', effect: { global: { oilPrice: -10 }, usa: { approval: 3 }, iran: { militaryBudget: -15 }, log: '沙特增产，油价跌，伊朗收入减，美国舆论缓和。' } },
      { text: '市场今天像开盲盒：先冲高再跳水。', effect: { global: { oilPrice: 5, stockIndex: -50 }, log: '油价小幅涨、美股跌，市场波动。' } },
      { text: '中国买买买：公开说中立，账单说真话。', effect: { iran: { militaryBudget: 30 }, china: 4, usa: { approval: -5 }, log: '中国买伊油，伊朗军费+30，中国好感+4，美国不满。' } },
    ],
  },
  {
    title: '无人机/定点清除事件',
    desc: '某方又搞了一次「精准打击」，对方声称「我们的人一个没少，炸的是仓库」。',
    outcomes: [
      { text: '“精准”到连天气预报都开始紧张。', effect: { usa: { approval: -4 }, iran: { troops: -5, approval: -3 }, log: '美军空袭，伊朗损兵折将、国内不满。' } },
      { text: '基地挨了几枚：新闻稿写了三版，口径终于统一。', effect: { usa: { troops: -4, approval: -6 }, iran: { approval: 5 }, log: '伊朗反击，美军伤亡，美国国内反战声起。' } },
      { text: '双方都说对方先动手：主持人问“证据呢”，空气沉默。', effect: { usa: { approval: -2 }, iran: { approval: -2 }, log: '各说各话，两边支持率都略降。' } },
    ],
  },
  {
    title: '中国呼吁「对话解决、不要选边」',
    desc: '外交部例行记者会：「我们呼吁各方冷静，通过对话解决分歧。」外媒：所以你们买伊油算不算选边？',
    outcomes: [
      { text: '“站队”这个词一出口，空气就尴尬了。', effect: { china: -2, usa: { approval: -2 }, log: '美国施压中国选边，中国好感-2，美国国内也有争议。' } },
      { text: '伊朗公开感谢：镜头给得很足，字幕也很足。', effect: { china: 2, iran: { approval: 2 }, log: '伊朗感谢中国，中国好感+2，伊朗支持率+2。' } },
      { text: '买油与劝和同步进行：嘴上和平，手里合同。', effect: { iran: { militaryBudget: 15 }, china: 1, global: { oilPrice: -3 }, log: '中国继续购伊油并劝和，伊朗收入+15，油价略跌。' } },
    ],
  },
  {
    title: '美国制裁伊朗石油出口',
    desc: '「谁买伊油就制裁谁。」部分国家减购，伊朗外汇吃紧；油价也跟着抖。',
    outcomes: [
      { text: '严格执行：表格一填，油价就懂事地涨了。', effect: { iran: { militaryBudget: -35, approval: -5 }, global: { oilPrice: 12 }, log: '制裁见效，伊朗收入大减、支持率跌，油价涨。' } },
      { text: '豁免名单一公布：国内键盘迅速开战。', effect: { iran: { militaryBudget: -10 }, usa: { approval: -4 }, log: '豁免引发国内「对伊软弱」批评，伊朗压力略减。' } },
      { text: '“长臂管辖”四个字：翻译们今天加班。', effect: { iran: { militaryBudget: 20 }, china: 3, usa: { approval: -5 }, log: '中国继续买伊油，伊朗+20 军费，中国好感+3，美国不满。' } },
    ],
  },
  {
    title: '伊朗国内抗议/美国国内反战游行',
    desc: '两边街上都有人举牌子：一边「不要战争」，一边「不要对我们屈服」。',
    outcomes: [
      { text: '伊朗：限流一开，梗图越传越快。', effect: { iran: { approval: -8 }, log: '伊朗国内舆论受压，支持率 -8。' } },
      { text: '美国：游行上头条，支持率先掉队。', effect: { usa: { approval: -6 }, log: '反战游行上头条，美国支持率 -6。' } },
      { text: '互相指责：谁在煽动不重要，热搜很重要。', effect: { usa: { approval: -3 }, iran: { approval: -3 }, log: '互相指责，两边支持率各 -3。' } },
    ],
  },
  {
    title: '油轮在阿曼湾遇袭',
    desc: '又一艘油轮冒烟了。没人认领，但大家心里都有数。油价和保险又涨了。',
    outcomes: [
      { text: '“我们有证据”与“我们也受害”同时登场。', effect: { usa: { approval: -3 }, iran: { approval: -2 }, global: { oilPrice: 18 }, log: '美国指责伊朗，油价涨 18，双方支持率略降。' } },
      { text: '伊朗否认：话术熟练得像背过。', effect: { global: { oilPrice: 12 }, iran: { approval: 1 }, log: '伊朗否认，油价仍涨 12，伊朗国内略稳。' } },
      { text: '中国呼吁调查：字数很短，含义很长。', effect: { china: 2, global: { oilPrice: 8 }, log: '中国呼吁冷静，油价涨 8，中国好感 +2。' } },
    ],
  },
  {
    title: '以色列「顺便」卷进来了',
    desc: '以方称「伊朗在叙利亚的据点必须打」。中东乱成一锅粥。',
    outcomes: [
      { text: '“默许”两个字：听起来就很贵。', effect: { iran: { troops: -6, approval: -4 }, usa: { approval: -5 }, log: '以军打击伊目标，伊朗损兵、支持率跌；美国国内争议。' } },
      { text: '公开撇清：话说得越快，大家越不信。', effect: { usa: { approval: 2 }, iran: { approval: -2 }, log: '美国撇清，国内略稳，伊朗仍不满。' } },
      { text: '威胁报复：油价先替大家紧张。', effect: { global: { oilPrice: 10 }, iran: { approval: 4 }, log: '伊以对峙，油价涨，伊朗国内强硬派支持率升。' } },
    ],
  },
  {
    title: '美股因中东局势大跌',
    desc: '华尔街最怕不确定性。战云密布，三大股指集体跳水。',
    outcomes: [
      { text: '美联储一眨眼：市场就先涨给你看。', effect: { global: { stockIndex: 60 }, usa: { approval: 2 }, log: '央行救市，美股反弹 60，美国支持率 +2。' } },
      { text: '推特很强，但K线更强。', effect: { global: { stockIndex: -30 }, usa: { approval: -4 }, log: '市场不买账，美股再跌 30，支持率 -4。' } },
      { text: '股油双杀：投资者的表情管理失败。', effect: { global: { stockIndex: -80, oilPrice: 15 }, usa: { approval: -6 }, log: '股油双杀，美股 -80、油价 +15，美国支持率 -6。' } },
    ],
  },
  {
    title: '伊朗展示新导弹/无人机',
    desc: '电视里播着「国产新型导弹试射成功」。西方分析师：看起来像某东方大国的技术。',
    outcomes: [
      { text: '美国：反导预算一拍桌子就通过了。', effect: { usa: { militaryBudget: -50 }, iran: { approval: 2 }, log: '美国加大反导投入，伊朗国内士气 +2。' } },
      { text: '伊朗：再试射一波，镜头角度挑到最好。', effect: { iran: { approval: 6 }, usa: { approval: -4 }, log: '伊朗秀肌肉，国内 +6，美国 -4。' } },
      { text: '中国：只卖民用设备（大家都点点头）。', effect: { china: -1, iran: { approval: 3 }, log: '中国撇清军售，中国好感 -1，伊朗仍 +3。' } },
    ],
  },
  {
    title: 'OPEC+ 开会：增产还是限产？',
    desc: '沙特和俄罗斯牵头的 OPEC+ 在吵：美国想压油价，产油国想保收入。',
    outcomes: [
      { text: '小幅增产：新闻标题写“重磅”，其实“还行”。', effect: { global: { oilPrice: -8 }, iran: { militaryBudget: -10 }, usa: { approval: 4 }, log: 'OPEC+ 增产，油价跌，伊朗收入减，美国支持率 +4。' } },
      { text: '继续限产：产油国说“稳定”，消费者说“你们礼貌吗”。', effect: { global: { oilPrice: 10 }, iran: { militaryBudget: 15 }, usa: { approval: -3 }, log: '限产保价，伊朗收入 +15，美国支持率 -3。' } },
      { text: '谈崩：大家各回各家，各发各的通稿。', effect: { global: { oilPrice: -5, stockIndex: -20 }, log: '谈崩，油价略跌、股市震荡。' } },
    ],
  },
  {
    title: '中国与伊朗签长期能源协议',
    desc: '「正常商业合作。」美国：你管这叫正常？中国：我们管这叫正常。',
    outcomes: [
      { text: '美国威胁制裁：企业法务群聊瞬间沸腾。', effect: { china: -3, iran: { militaryBudget: 10 }, usa: { approval: -2 }, log: '美国威胁制裁，中国好感 -3，伊朗仍获部分收入。' } },
      { text: '伊朗喜提大单：外汇稳了，表情包也稳了。', effect: { iran: { militaryBudget: 40, approval: 5 }, china: 4, usa: { approval: -6 }, log: '伊中大单，伊朗军费 +40、支持率 +5，中国 +4，美国 -6。' } },
      { text: '中国低调执行：不声张，但账单很响。', effect: { iran: { militaryBudget: 25 }, china: 2, log: '低调执行，伊朗 +25 军费，中国好感 +2。' } },
    ],
  },
  {
    title: '联合国安理会吵成一团',
    desc: '美国提草案制裁伊朗，中俄反对，英法弃权。主持人：散会，下次再吵。',
    outcomes: [
      { text: '单边制裁继续：文件一摞，效率一流。', effect: { iran: { militaryBudget: -20 }, usa: { approval: 2 }, log: '美国单边制裁，伊朗收入 -20，美国国内 +2。' } },
      { text: '反对单边主义：发言很长，掌声很短。', effect: { china: 2, iran: { approval: 3 }, usa: { approval: -2 }, log: '中国反对单边，中国 +2、伊朗 +3、美国 -2。' } },
      { text: '暂时不表决：吵累了，先散会。', effect: { log: '安理会搁置表决，局势无大变化。' } },
    ],
  },
  {
    title: '伊朗核设施「又」出状况',
    desc: '国际原子能机构报告：伊方某设施离心机数量有变化。伊方：我们有权和平利用核能。',
    outcomes: [
      { text: '红线警告：红线越画越多，地图快不够用了。', effect: { usa: { militaryBudget: -30, approval: -5 }, iran: { approval: -5 }, log: '美国强硬表态，军费与支持率都承压，伊朗也紧张。' } },
      { text: '打太极：每句话都像是“我没说”。', effect: { iran: { approval: 2 }, usa: { approval: -2 }, log: '伊朗打太极，国内 +2，美国 -2。' } },
      { text: '中欧呼吁谈判：把话筒递来递去，局势先喘口气。', effect: { china: 2, usa: { approval: 1 }, iran: { approval: 1 }, log: '多边谈判呼声起，三方支持率微调。' } },
    ],
  },
  {
    title: '美国航母战斗群过海峡',
    desc: '「例行航行。」伊朗快艇围观、无人机飞过。两边都在直播，网友看热闹。',
    outcomes: [
      { text: '开火警告：海面上最大的声音是“警告”。', effect: { usa: { approval: -6 }, iran: { troops: -3, approval: -4 }, log: '美舰开火警告，伊朗损兵、支持率跌，美国国内反战 -6。' } },
      { text: '“演习”导弹：油价直接演了个高抛。', effect: { global: { oilPrice: 20 }, usa: { approval: -8 }, iran: { approval: 5 }, log: '伊方演习，油价暴涨，美国 -8、伊朗国内 +5。' } },
      { text: '双方克制：通稿里“强烈关切”出现了七次。', effect: { usa: { approval: -1 }, iran: { approval: 1 }, log: '紧张但未交火，舆论小波动。' } },
    ],
  },
];

function getRandomEvent() {
  const idx = Math.floor(Math.random() * GameEvents.length);
  const base = GameEvents[idx];
  const out = base.outcomes ? base.outcomes[Math.floor(Math.random() * base.outcomes.length)] : null;
  if (!out) return { title: base.title, desc: base.desc, effect: { log: '今天无事发生（但大家都很忙）。' } };
  return {
    title: base.title,
    desc: `${base.desc}\n\n今天结果：${out.text}`,
    effect: out.effect,
  };
}
