/**
 * 美伊局势模拟器 - 界面更新与交互
 */
(function () {
  const screenChoose = document.getElementById('screen-choose');
  const screenPlay = document.getElementById('screen-play');
  const logChoose = document.getElementById('log-choose');
  const logEl = document.getElementById('log');
  const oilPriceEl = document.getElementById('oil-price');
  const stockIndexEl = document.getElementById('stock-index');
  const chinaRelEl = document.getElementById('china-rel');
  const tensionEl = document.getElementById('tension');
  const dayEl = document.getElementById('day');
  const allySupportEl = document.getElementById('ally-support');
  const sanctionLevelEl = document.getElementById('sanction-level');
  const usaBudgetEl = document.getElementById('usa-budget');
  const usaTroopsEl = document.getElementById('usa-troops');
  const usaApprovalEl = document.getElementById('usa-approval');
  const usaOilEl = document.getElementById('usa-oil');
  const usaStockHoldEl = document.getElementById('usa-stock-hold');
  const iranBudgetEl = document.getElementById('iran-budget');
  const iranTroopsEl = document.getElementById('iran-troops');
  const iranApprovalEl = document.getElementById('iran-approval');
  const iranOilEl = document.getElementById('iran-oil');
  const strategyListEl = document.getElementById('strategy-list');
  const eventModal = document.getElementById('event-modal');
  const eventTitle = document.getElementById('event-title');
  const eventDesc = document.getElementById('event-desc');
  const eventChoices = document.getElementById('event-choices');
  const panelUsa = document.getElementById('panel-usa');
  const panelIran = document.getElementById('panel-iran');
  const chatLogEl = document.getElementById('chat-log');
  const chatModal = document.getElementById('chat-modal');
  const chatTitle = document.getElementById('chat-title');
  const chatDesc = document.getElementById('chat-desc');
  const chatChoices = document.getElementById('chat-choices');
  const resultModal = document.getElementById('result-modal');
  const resultTitle = document.getElementById('result-title');
  const resultReason = document.getElementById('result-reason');
  const btnRestart = document.getElementById('btn-restart');
  const contactModal = document.getElementById('contact-modal');
  const btnContactClose = document.getElementById('btn-contact-close');
  const stockQtyEl = document.getElementById('stock-qty');
  const loanAmountEl = document.getElementById('loan-amount');
  const oilQtyEl = document.getElementById('oil-qty');
  const iranDebtEl = document.getElementById('iran-debt');
  const loanBlockEl = document.getElementById('loan-block');
  const stockBlockEl = document.getElementById('stock-block');
  const btnLoanBorrow = document.getElementById('btn-loan-borrow');
  const btnStockBuy = document.getElementById('btn-stock-buy');
  const btnStockSell = document.getElementById('btn-stock-sell');
  const chatUnreadEl = document.getElementById('chat-unread');
  const btnOpenChat = document.getElementById('btn-open-chat');
  const geoMetricsEl = document.getElementById('geo-metrics');

  let pendingChats = [];
  let unreadChats = 0;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function autoSave() {
    try {
      localStorage.setItem('usIranSimulatorSave', JSON.stringify(Game.getState()));
    } catch (e) {
      // 静默失败，不打断游戏流程
    }
  }

  function showScreen(name) {
    if (name === 'choose') {
      screenChoose.classList.remove('hidden');
      screenPlay.classList.add('hidden');
    } else {
      screenChoose.classList.add('hidden');
      screenPlay.classList.remove('hidden');
    }
  }

  function renderChoose() {
    logChoose.innerHTML = Game.log.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
  }

  function renderGlobal() {
    oilPriceEl.textContent = Game.global.oilPrice;
    stockIndexEl.textContent = Game.global.stockIndex;
    chinaRelEl.textContent = Game.china;
    chinaRelEl.title = '中国态度：负=亲美，正=亲伊';
    tensionEl.textContent = Game.tension;
    allySupportEl.textContent = Game.allySupport;
    sanctionLevelEl.textContent = Game.sanctionLevel;
    dayEl.textContent = Game.day;
  }

  function renderSides() {
    usaBudgetEl.textContent = Game.usa.militaryBudget;
    usaTroopsEl.textContent = Game.usa.troops;
    usaApprovalEl.textContent = Game.usa.approval;
    usaOilEl.textContent = Game.usa.oilReserve;
    usaStockHoldEl.textContent = Game.usa.stockHoldings;
    iranBudgetEl.textContent = Game.iran.militaryBudget;
    iranTroopsEl.textContent = Game.iran.troops;
    iranApprovalEl.textContent = Game.iran.approval;
    iranOilEl.textContent = Game.iran.oilReserve;
    if (iranDebtEl) iranDebtEl.textContent = Game.iranDebt || 0;
    panelUsa.classList.toggle('player', Game.playerSide === 'usa');
    panelIran.classList.toggle('player', Game.playerSide === 'iran');

    // 按阵营把“局势指标”放进对应阵营的“军费”框附近（提高可见性）
    if (geoMetricsEl) {
      const target = Game.playerSide === 'iran' ? panelIran : panelUsa;
      if (target) {
        const budgetVal = Game.playerSide === 'iran' ? iranBudgetEl : usaBudgetEl;
        const budgetRow = budgetVal ? budgetVal.closest('.side-stat') : null;
        if (geoMetricsEl.parentElement !== target) target.appendChild(geoMetricsEl);
        if (budgetRow && geoMetricsEl.previousElementSibling !== budgetRow) {
          budgetRow.insertAdjacentElement('afterend', geoMetricsEl);
        }
      }
    }
  }

  function formatCost(s, costMultiplier) {
    const mb = (s.cost || 0) * costMultiplier;
    const cd = s.costDetail || {};
    const cg = s.costGlobal || {};
    const parts = [];
    if (mb) parts.push(`军费 ${mb}`);
    if (cd.troops) parts.push(`兵力 ${cd.troops}`);
    if (cd.approval) parts.push(`支持率 ${cd.approval}`);
    if (cd.oilReserve) parts.push(`石油 ${cd.oilReserve}`);
    if (cg.china) parts.push(`中国 ${cg.china}`);
    if (cg.tension) parts.push(`紧张度 ${cg.tension}`);
    if (cg.allySupport) parts.push(`盟友 ${cg.allySupport}`);
    if (cg.sanctionLevel) parts.push(`制裁 ${cg.sanctionLevel}`);
    return parts.length ? parts.join('，') : '无';
  }

  function renderStrategies() {
    const list = Game.playerSide === 'usa' ? STRATEGIES_USA : STRATEGIES_IRAN;
    const used = Game.strategyUsedToday || [];
    // 美伊军费尺度差异：美国 4x，伊朗 2x
    const costMultiplier = Game.playerSide === 'usa' ? 4 : 2;
    strategyListEl.innerHTML = list
      .map(
        (s) => {
          const alreadyUsed = used.includes(s.id);
          const noSlots = used.length >= 3;
          const disabled = alreadyUsed || noSlots;
          const costStr = formatCost(s, costMultiplier);
          const gainStr = s.gain || '见战报';
          return `
        <div class="strategy-card" data-id="${s.id}">
          <div class="strategy-name">${escapeHtml(s.name)}${alreadyUsed ? ' [已用]' : ''}</div>
          <div class="strategy-cost"><span class="label">消耗：</span>${escapeHtml(costStr)}</div>
          <div class="strategy-gain"><span class="label">获得：</span>${escapeHtml(gainStr)}</div>
          <button class="btn btn-strategy" data-id="${s.id}" ${disabled ? 'disabled' : ''} title="${escapeHtml(s.log || s.name)}">选择</button>
        </div>
      `;
        }
      )
      .join('');
    strategyListEl.querySelectorAll('.btn-strategy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = Game.doStrategy(btn.dataset.id);
        if (!r.ok) {
          alert(r.msg);
          return;
        }
        renderAll();
        autoSave();
      });
    });
  }

  function renderMarketButtons() {
    const stockUsed = Game.lastTrade !== null;
    const oilUsed = Game.lastOilDeal !== null;
    const btnOilBuy = document.getElementById('btn-oil-buy');
    const btnOilSell = document.getElementById('btn-oil-sell');
    const isUsa = Game.playerSide === 'usa';
    if (stockBlockEl) stockBlockEl.style.display = isUsa ? '' : 'none';
    if (loanBlockEl) loanBlockEl.style.display = isUsa ? 'none' : '';
    if (btnStockBuy) {
      btnStockBuy.disabled = stockUsed || !isUsa;
      btnStockBuy.style.display = isUsa ? '' : 'none';
    }
    if (btnStockSell) {
      btnStockSell.disabled = stockUsed || !isUsa;
      btnStockSell.style.display = isUsa ? '' : 'none';
    }
    if (stockQtyEl) stockQtyEl.style.display = isUsa ? '' : 'none';
    if (btnLoanBorrow) btnLoanBorrow.disabled = stockUsed || isUsa;
    if (btnOilBuy) btnOilBuy.disabled = oilUsed;
    if (btnOilSell) btnOilSell.disabled = oilUsed;
  }

  function renderLog() {
    logEl.innerHTML = Game.log.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
  }

  function renderChatLog() {
    if (!pendingChats.length) {
      chatLogEl.innerHTML = `<div class="chat-empty">今天暂无新消息（罕见）。</div>`;
      return;
    }
    chatLogEl.innerHTML = pendingChats
      .map((m) => {
        const from = `${m.from.avatar} ${m.from.name}`;
        return `<div class="chat-item">
          <div class="chat-meta">${escapeHtml(m.channel)} · ${escapeHtml(from)}</div>
          <div class="chat-text">${escapeHtml(m.text)}</div>
        </div>`;
      })
      .join('');
  }

  function updateChatUnread() {
    unreadChats = pendingChats.length;
    if (chatUnreadEl) {
      chatUnreadEl.textContent = unreadChats;
      chatUnreadEl.style.visibility = unreadChats > 0 ? 'visible' : 'hidden';
    }
  }

  function renderAll() {
    if (Game.phase === 'choose') {
      renderChoose();
      return;
    }
    renderGlobal();
    renderSides();
    renderStrategies();
    renderMarketButtons();
    renderChatLog();
    renderLog();
  }

  function showGameOver(result) {
    if (!resultModal) {
      alert((result.winner === Game.playerSide ? '你赢了！' : '你输了。') + '\n' + result.reason);
      return;
    }
    const youWin = result.winner === Game.playerSide;
    resultTitle.textContent = youWin ? '游戏结束：你赢了' : '游戏结束：你输了';
    resultReason.textContent = result.reason;
    resultModal.classList.remove('hidden');
  }

  function restartGame() {
    try {
      localStorage.removeItem('usIranSimulatorSave');
    } catch (e) {
      // ignore
    }
    pendingChats = [];
    updateChatUnread();
    Game.init();
    showScreen('choose');
    renderAll();
    if (resultModal) resultModal.classList.add('hidden');
    if (eventModal) eventModal.classList.add('hidden');
    if (chatModal) chatModal.classList.add('hidden');
  }

  function showEvent(event) {
    eventTitle.textContent = event.title;
    // 事件改为“直接结算结果”，无需玩家选择
    if (event && event.effect) {
        Game.applyEffect(event.effect);
      autoSave();
    }
    renderAll();
    const extra = event && event.effect && event.effect.log ? `\n\n影响：${event.effect.log}` : '';
    eventDesc.textContent = (event.desc || '') + extra;
    eventChoices.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn btn-choice';
    btn.textContent = '知道了';
    btn.addEventListener('click', () => {
      eventModal.classList.add('hidden');
      const result = Game.checkVictory();
      if (result.gameOver) showGameOver(result);
    });
    eventChoices.appendChild(btn);
    eventModal.classList.remove('hidden');
  }

  function showChat(chat) {
    const from = `${chat.from.avatar} ${chat.from.name}`;
    chatTitle.textContent = `${chat.channel} · ${from}`;
    chatDesc.textContent = chat.text;
    chatChoices.innerHTML = '';
    chat.replies.forEach((r) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-choice';
      btn.textContent = r.text;
      btn.addEventListener('click', () => {
        Game.applyEffect(r.effect);
        chatModal.classList.add('hidden');
        renderAll();
        autoSave();
        const result = Game.checkVictory();
        if (result.gameOver) {
          showGameOver(result);
        }
      });
      chatChoices.appendChild(btn);
    });
    chatModal.classList.remove('hidden');
  }

  function nextDay() {
    const result = Game.nextDay();
    renderAll();
    autoSave();
    if (result.gameOver) {
      showGameOver(result);
      return;
    }
    pendingChats = generateDailyChats(Game);
    updateChatUnread();
    renderChatLog();
    const ev = getRandomEvent();
    showEvent(ev);
  }

  document.getElementById('btn-choose-usa').addEventListener('click', () => {
    Game.startAs('usa');
    showScreen('play');
    renderAll();
  });

  document.getElementById('btn-choose-iran').addEventListener('click', () => {
    Game.startAs('iran');
    showScreen('play');
    renderAll();
  });

  document.getElementById('btn-next').addEventListener('click', nextDay);

  if (btnRestart) btnRestart.addEventListener('click', restartGame);

  if (btnOpenChat) {
    btnOpenChat.addEventListener('click', () => {
      if (!pendingChats.length) {
        alert('暂无未读私信。');
        return;
      }
      const chat = pendingChats.shift();
      updateChatUnread();
      renderChatLog();
      showChat(chat);
    });
  }

  document.getElementById('btn-stock-buy').addEventListener('click', () => {
    const qty = parseInt(stockQtyEl.value, 10);
    const r = Game.tradeStock('buy', qty);
    if (!r.ok) alert(r.msg);
    renderAll();
    if (r.ok) autoSave();
  });
  document.getElementById('btn-stock-sell').addEventListener('click', () => {
    const qty = parseInt(stockQtyEl.value, 10);
    const r = Game.tradeStock('sell', qty);
    if (!r.ok) alert(r.msg);
    renderAll();
    if (r.ok) autoSave();
  });

  if (btnLoanBorrow) {
    btnLoanBorrow.addEventListener('click', () => {
      const amount = parseInt(loanAmountEl.value, 10);
      const r = Game.borrowFromChina(amount);
      if (!r.ok) alert(r.msg);
      renderAll();
      if (r.ok) autoSave();
    });
  }

  document.getElementById('btn-oil-buy').addEventListener('click', () => {
    const qty = parseInt(oilQtyEl.value, 10);
    const r = Game.tradeOil('buy', qty);
    if (!r.ok) alert(r.msg);
    renderAll();
    if (r.ok) autoSave();
  });
  document.getElementById('btn-oil-sell').addEventListener('click', () => {
    const qty = parseInt(oilQtyEl.value, 10);
    const r = Game.tradeOil('sell', qty);
    if (!r.ok) alert(r.msg);
    renderAll();
    if (r.ok) autoSave();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    try {
      localStorage.setItem('usIranSimulatorSave', JSON.stringify(Game.getState()));
      alert('存档成功。');
    } catch (e) {
      alert('存档失败：' + e.message);
    }
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    try {
      const raw = localStorage.getItem('usIranSimulatorSave');
      if (!raw) {
        alert('没有找到存档。');
        return;
      }
      Game.loadState(JSON.parse(raw));
      if (Game.phase === 'play') showScreen('play');
      pendingChats = [];
      renderAll();
      alert('读档成功。');
    } catch (e) {
      alert('读档失败：' + e.message);
    }
  });

  function showContactModal() {
    if (contactModal) contactModal.classList.remove('hidden');
  }
  function hideContactModal() {
    if (contactModal) contactModal.classList.add('hidden');
  }
  const btnContact = document.getElementById('btn-contact');
  const btnContactChoose = document.getElementById('btn-contact-choose');
  if (btnContact) btnContact.addEventListener('click', showContactModal);
  if (btnContactChoose) btnContactChoose.addEventListener('click', showContactModal);
  if (btnContactClose) btnContactClose.addEventListener('click', hideContactModal);

  // 启动时优先尝试从本地存档自动恢复
  (function bootstrap() {
    try {
      const raw = localStorage.getItem('usIranSimulatorSave');
      if (raw) {
        Game.loadState(JSON.parse(raw));
      } else {
        Game.init();
      }
    } catch (e) {
      Game.init();
    }
    showScreen(Game.phase === 'choose' ? 'choose' : 'play');
    // 若是进行中的局，再次生成当日对话
    if (Game.phase === 'play') {
      pendingChats = generateDailyChats(Game);
      updateChatUnread();
    }
    renderAll();
  })();
})();
