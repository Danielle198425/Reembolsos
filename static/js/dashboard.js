/**
 * dashboard.js — Painel de Controle module
 */
const DashboardPage = {
  _currentScope: 'personal',
  _currentMonth: '',

  _getUserTabs() {
    const role = App.user?.role;
    if (role === 'admin' || role === 'financeiro') {
      return [
        { id: 'tab-pessoal', scope: 'personal', label: 'Pessoal' },
        { id: 'tab-financeiro', scope: 'financial', label: 'Financeiro' }
      ];
    } else if (role === 'aprovador') {
      return [
        { id: 'tab-pessoal', scope: 'personal', label: 'Pessoal' },
        { id: 'tab-time', scope: 'team', label: 'Time' }
      ];
    }
    return null;
  },

  _getMonthOptions() {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${year}-${monthNum}`;
      const name = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const capName = name.charAt(0).toUpperCase() + name.slice(1);
      const isSelected = this._currentMonth === val ? 'selected' : '';
      months.push(`<option value="${val}" ${isSelected}>${capName}</option>`);
    }
    return months.join('');
  },

  async render() {
    const el = document.getElementById('page-dashboard');
    const userTabs = this._getUserTabs();

    el.innerHTML = `
      ${userTabs ? `
      <!-- Tab selector -->
      <div style="display:flex;justify-content:center;margin-bottom:24px;">
        <div class="tabs" style="margin:0;">
          ${userTabs.map(t => `<div class="tab ${t.scope === this._currentScope ? 'active' : ''}" id="${t.id}" onclick="DashboardPage._switchTab('${t.scope}')">${t.label}</div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Page header: greeting + month filter + quick actions -->
      <div class="page-header" style="align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div class="dashboard-greeting">
          <div class="greeting-avatar" id="dash-avatar"></div>
          <div class="greeting-text">
            <h1 id="dash-greeting">Olá!</h1>
            <p id="dash-date"></p>
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
              <span style="font-size:13px;color:var(--text-3);font-weight:600;">📅 Mês:</span>
              <select id="dash-month-select" onchange="DashboardPage._onMonthChange(this.value)" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:600;background:var(--surface);color:var(--text-1);cursor:pointer;outline:none;">
                <option value="">Todos os meses</option>
                ${this._getMonthOptions()}
              </select>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:20px;text-align:center;align-items:flex-start;margin-left:auto;">
          <!-- Carregar: abre formulário de nova despesa -->
          <button id="dash-btn-carregar" title="Criar nova despesa" onclick="DashboardPage._onCarregar()" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;">
            <div class="dash-quick-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            </div>
            <span class="dash-quick-label">Carregar</span>
          </button>

          <!-- Notificações -->
          <button id="dash-btn-notif" title="Notificações de despesas" onclick="DashboardPage._onNotificacoes()" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;position:relative;">
            <div class="dash-quick-icon" id="dash-notif-icon" style="position:relative;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span id="dash-notif-badge" class="notif-badge hidden">0</span>
            </div>
            <span class="dash-quick-label">Notificações</span>
          </button>

          <!-- Políticas: visualiza anexos de Central de Políticas em PDF -->
          <button id="dash-btn-politicas" title="Políticas da Empresa" onclick="DashboardPage._onPoliticas()" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;">
            <div class="dash-quick-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <span class="dash-quick-label">Políticas</span>
          </button>

          <!-- Quilometragem: abre formulário com categoria km pré-selecionada e travada -->
          <button id="dash-btn-km" title="Registrar despesa de quilometragem" onclick="DashboardPage._onQuilometragem()" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;">
            <div class="dash-quick-icon" style="color:var(--ml-pink,#e91e8c);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.333 8 14 8 14s8-8.667 8-14a8 8 0 0 0-8-8z"/></svg>
            </div>
            <span class="dash-quick-label">Quilometragem</span>
          </button>
        </div>
      </div>

      <!-- Summary bar -->
      <div id="dash-summary-bar" class="summary-bar">
        <div class="summary-label">
          <div class="summary-icon" id="dash-summary-icon">💳</div>
          <div id="dash-summary-title">MINHAS<br>DESPESAS</div>
        </div>
        <div class="summary-items">
          <div class="summary-item">
            <span class="summary-item-label">Aguardando Aprovação ⓘ</span>
            <span class="summary-item-value" id="dash-agu-apr">R$ 0,00</span>
          </div>
          <div class="summary-item">
            <span class="summary-item-label">Aguardando Finalização ⓘ</span>
            <span class="summary-item-value" id="dash-agu-fin">R$ 0,00</span>
          </div>
          <div class="summary-item">
            <span class="summary-item-label">Pago</span>
            <span class="summary-item-value" id="dash-pago">R$ 0,00</span>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card tasks-card" id="dash-tasks-card">
          <div class="card-header" id="dash-tasks-header">
            <span class="card-title" id="dash-tasks-title">✅ Tarefas</span>
          </div>
          <div id="dash-tasks-content">
            <div style="text-align:center;padding:20px;color:var(--text-4);">
              <div class="spinner" style="border-color:rgba(79,70,229,.3);border-top-color:var(--ml-indigo);margin:0 auto 8px;"></div>
              Carregando...
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title" id="dash-chart-title">📊 Despesas por Categoria</span>
          </div>
          <div id="dash-chart" class="chart-wrapper">
            <div style="text-align:center;padding:20px;color:var(--text-4);">Carregando...</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title" id="dash-recent-title">🕒 Despesas Recentes</span>
          <button class="btn btn-sm btn-secondary" onclick="navigate('expenses')">Ver todas →</button>
        </div>
        <div id="dash-recent"></div>
      </div>
    `;

    // Greeting
    const now = new Date();
    const hour = now.getHours();
    const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const firstName = (App.user?.name || '').split(' ')[0];
    document.getElementById('dash-avatar').textContent = initials(App.user?.name || '');
    document.getElementById('dash-greeting').textContent = `${greet}, ${firstName}!`;
    document.getElementById('dash-date').textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Load dashboard data (restore active scope or default to personal)
    const savedScope = userTabs ? (localStorage.getItem('active_scope') || 'personal') : 'personal';
    this._switchTab(savedScope);

    // Load notification badge count
    this._loadNotifBadge();
  },

  _onMonthChange(month) {
    this._currentMonth = month || '';
    this._loadData();
  },

  async _loadNotifBadge() {
    try {
      const notifs = await Api.getNotifications();
      const badge = document.getElementById('dash-notif-badge');
      if (!badge) return;
      const count = Array.isArray(notifs) ? notifs.length : 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.textContent = '0';
        badge.classList.add('hidden');
      }
    } catch (err) {
      console.warn('Erro ao carregar badge de notificações:', err);
    }
  },

  async _loadData() {
    try {
      const data = await Api.dashboard(this._currentScope, this._currentMonth);
      this._renderSummary(data);
      this._renderTasks(data);
      this._renderChart(data.expenses_by_category);
      this._renderRecent(data.recent_expenses);

      // Update nav badge
      const badge = document.getElementById('nav-expenses-badge');
      if (badge) {
        if (data.pending_tasks > 0) {
          badge.textContent = data.pending_tasks;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch (err) {
      toast('Erro ao carregar painel: ' + err.message, 'error');
    }
  },

  _switchTab(scope) {
    const userTabs = this._getUserTabs();
    if (!userTabs) scope = 'personal';
    if (scope === 'all') scope = 'financial';
    this._currentScope = scope;
    localStorage.setItem('active_scope', scope);
    window.activeScope = scope;

    const tabPessoal = document.getElementById('tab-pessoal');
    const tabFin = document.getElementById('tab-financeiro');
    const tabTime = document.getElementById('tab-time');

    tabPessoal?.classList.remove('active');
    tabFin?.classList.remove('active');
    tabTime?.classList.remove('active');

    if (scope === 'personal') {
      tabPessoal?.classList.add('active');
      const sumTitle = document.getElementById('dash-summary-title');
      if (sumTitle) sumTitle.innerHTML = 'MINHAS<br>DESPESAS';
      const sumIcon = document.getElementById('dash-summary-icon');
      if (sumIcon) sumIcon.textContent = '💳';
      const chartTitle = document.getElementById('dash-chart-title');
      if (chartTitle) chartTitle.textContent = '📊 Despesas por Categoria';
      const recentTitle = document.getElementById('dash-recent-title');
      if (recentTitle) recentTitle.textContent = '🕒 Despesas Recentes';
    } else if (scope === 'team') {
      tabTime?.classList.add('active');
      const sumTitle = document.getElementById('dash-summary-title');
      if (sumTitle) sumTitle.innerHTML = 'DESPESAS DO<br>TIME';
      const sumIcon = document.getElementById('dash-summary-icon');
      if (sumIcon) sumIcon.textContent = '👥';
      const chartTitle = document.getElementById('dash-chart-title');
      if (chartTitle) chartTitle.textContent = '📊 Despesas do Time por Categoria';
      const recentTitle = document.getElementById('dash-recent-title');
      if (recentTitle) recentTitle.textContent = '🕒 Despesas do Time';
    } else {
      tabFin?.classList.add('active');
      const sumTitle = document.getElementById('dash-summary-title');
      if (sumTitle) sumTitle.innerHTML = 'TODAS AS<br>DESPESAS';
      const sumIcon = document.getElementById('dash-summary-icon');
      if (sumIcon) sumIcon.textContent = '🏢';
      const chartTitle = document.getElementById('dash-chart-title');
      if (chartTitle) chartTitle.textContent = '📊 Despesas por Categoria (Geral)';
      const recentTitle = document.getElementById('dash-recent-title');
      if (recentTitle) recentTitle.textContent = '🕒 Últimas Despesas (Todos)';
    }

    // Show loading state
    const chartEl = document.getElementById('dash-chart');
    if (chartEl) chartEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-4);">Carregando...</div>';
    const recentEl = document.getElementById('dash-recent');
    if (recentEl) recentEl.innerHTML = '';
    const tasksEl = document.getElementById('dash-tasks-content');
    if (tasksEl) tasksEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-4);"><div class="spinner" style="border-color:rgba(79,70,229,.3);border-top-color:var(--ml-indigo);margin:0 auto 8px;"></div>Carregando...</div>';

    this._loadData();
  },

  // ── Quick Action Handlers ────────────────────────────────────────────────

  _onCarregar() {
    navigate('expenses');
    setTimeout(() => {
      if (typeof ExpensesPage !== 'undefined' && ExpensesPage.openForm) {
        ExpensesPage.openForm();
      }
    }, 150);
  },

  async _onNotificacoes() {
    let notifs = [];
    try {
      notifs = await Api.getNotifications();
    } catch(e) {
      toast('Erro ao carregar notificações.', 'error');
    }

    const statusIcons = {
      aprovado: '✅',
      rejeitado: '❌',
      aguardando_finalizacao: '⏳',
      pago: '💰',
      aguardando_aprovacao: '🔄',
    };

    const statusColors = {
      aprovado: '#16a34a',
      rejeitado: '#dc2626',
      aguardando_finalizacao: '#d97706',
      pago: '#2563eb',
      aguardando_aprovacao: '#7c3aed',
    };

    const body = (!notifs || notifs.length === 0)
      ? `<div style="text-align:center;padding:40px;color:var(--text-4);">
           <div style="font-size:48px;margin-bottom:12px;">🔔</div>
           <p style="font-size:15px;">Nenhuma notificação no momento.</p>
         </div>`
      : notifs.map(n => {
          const icon = statusIcons[n.status] || '📋';
          const color = statusColors[n.status] || '#64748b';
          const dateStr = n.date || '';
          const expId = n.expense_id || n.id;
          return `
            <div onclick="Modal.close(); navigate('expenses'); ${expId ? `setTimeout(() => { if (typeof ExpensesPage !== 'undefined' && ExpensesPage.viewExpense) ExpensesPage.viewExpense(${expId}); }, 250);` : ''}"
                 style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;"
                 onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
              <div style="font-size:26px;line-height:1;flex-shrink:0;">${icon}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:14px;color:${color};margin-bottom:4px;">${escHtml(n.title)}</div>
                <div style="font-size:13px;color:var(--text-2);line-height:1.4;margin-bottom:4px;word-break:break-word;">${escHtml(n.message)}</div>
                <div style="font-size:11px;color:var(--text-4);">${escHtml(dateStr)}</div>
              </div>
            </div>`;
        }).join('');

    Modal.open('🔔 Notificações', `
      <div style="max-height:420px;overflow-y:auto;margin:-8px -8px -16px;">
        ${body}
      </div>
    `, `<button class="btn btn-secondary" onclick="Modal.close()">Fechar</button>`);

    const badge = document.getElementById('dash-notif-badge');
    if (badge) badge.classList.add('hidden');
  },

  async _onPoliticas() {
    let policies = [];
    try {
      const all = await Api.getCustomPolicies();
      policies = (all || []).filter(p => p.group === 'central_policies' && p.active !== false);
    } catch(e) {
      toast('Erro ao carregar políticas.', 'error');
    }

    if (policies.length === 1) {
      const p = policies[0];
      let pdfUrl = p.value || '';
      if (!pdfUrl.startsWith('/') && !pdfUrl.startsWith('http') && !pdfUrl.startsWith('data:')) {
        pdfUrl = '/uploads/' + encodeURIComponent(pdfUrl).replace(/%2F/g, '/');
      }
      window.open(pdfUrl, '_blank');
      return;
    } else if (policies.length > 1) {
      const body = `
        <p style="font-size:14px;color:var(--text-2);margin-bottom:16px;">Selecione o documento da Central de Políticas que deseja visualizar:</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${policies.map(p => {
            let pdfUrl = p.value || '';
            if (!pdfUrl.startsWith('/') && !pdfUrl.startsWith('http') && !pdfUrl.startsWith('data:')) {
              pdfUrl = '/uploads/' + encodeURIComponent(pdfUrl).replace(/%2F/g, '/');
            }
            return `
              <div onclick="window.open('${escHtml(pdfUrl)}', '_blank'); Modal.close();"
                   style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s;"
                   onmouseover="this.style.borderColor='var(--ml-indigo)';this.style.background='var(--surface-1)';"
                   onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface-2)';">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="font-size:24px;">📄</span>
                  <div>
                    <div style="font-weight:700;font-size:14px;color:var(--text-1);">${escHtml(p.description || p.key)}</div>
                    <div style="font-size:12px;color:var(--text-3);">${escHtml(p.value)}</div>
                  </div>
                </div>
                <span class="btn btn-sm btn-primary" style="pointer-events:none;">Abrir PDF ↗</span>
              </div>`;
          }).join('')}
        </div>
      `;

      Modal.open('📄 Central de Políticas', body,
        `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>`
      );
      return;
    }

    Modal.open('📄 Central de Políticas', `
      <div style="text-align:center;padding:40px;color:var(--text-4);">
        <div style="font-size:48px;margin-bottom:12px;">📄</div>
        <p style="font-size:15px;">Nenhum documento anexado na Central de Políticas.</p>
      </div>
    `, `<button class="btn btn-secondary" onclick="Modal.close()">Fechar</button>`);
  },
  _onManual() { return this._onPoliticas(); },

  async _onQuilometragem() {
    navigate('expenses');
    setTimeout(async () => {
      if (typeof ExpensesPage !== 'undefined' && ExpensesPage.openForm) {
        await ExpensesPage.openForm(null, { forceKm: true });
      }
    }, 150);
  },

  // ── Render helpers ───────────────────────────────────────────────────────

  _renderSummary(data) {
    const elAguApr = document.getElementById('dash-agu-apr');
    if (elAguApr) elAguApr.textContent = fmt(data.total_aguardando_aprovacao);
    const elAguFin = document.getElementById('dash-agu-fin');
    if (elAguFin) elAguFin.textContent = fmt(data.total_aguardando_finalizacao);
    const elPago = document.getElementById('dash-pago');
    if (elPago) elPago.textContent = fmt(data.total_pago);
  },

  _renderTasks(data) {
    const el = document.getElementById('dash-tasks-content');
    const card = document.getElementById('dash-tasks-card');
    const header = document.getElementById('dash-tasks-header');
    const title = document.getElementById('dash-tasks-title');

    if (!data.pending_tasks || data.pending_tasks === 0) {
      if (card) {
        card.style.border = '';
        card.style.boxShadow = '';
      }
      if (header) {
        header.style.background = '';
        header.style.borderBottom = '';
        header.style.borderRadius = '';
      }
      if (title) {
        title.innerHTML = '✅ Tarefas';
      }
      el.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--text-4);">
          <div style="font-size:36px;margin-bottom:8px;">\uD83C\uDF89</div>
          <p>Sem tarefas pendentes!</p>
        </div>`;
      return;
    }

    // Com tarefas pendentes: destacar o campo para melhor visualização
    if (card) {
      card.style.border = '2px solid #f59e0b';
      card.style.boxShadow = '0 6px 20px -2px rgba(245, 158, 11, 0.22), 0 2px 6px -1px rgba(245, 158, 11, 0.12)';
      card.style.transition = 'all 0.3s ease';
    }
    if (header) {
      header.style.background = 'linear-gradient(90deg, rgba(254, 243, 199, 0.6) 0%, rgba(254, 249, 195, 0.2) 100%)';
      header.style.borderBottom = '1px solid rgba(245, 158, 11, 0.25)';
      header.style.borderRadius = '12px 12px 0 0';
    }
    if (title) {
      title.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="color:#b45309;font-weight:800;display:inline-flex;align-items:center;gap:6px;">
            ⚠️ Tarefas Pendentes
          </span>
          <span class="badge" style="background:#dc2626;color:#ffffff;font-weight:800;font-size:12px;padding:3px 10px;border-radius:20px;box-shadow:0 2px 6px rgba(220,38,38,0.35);letter-spacing:0.5px;">
            ${data.pending_tasks} ${data.pending_tasks === 1 ? 'PENDENTE' : 'PENDENTES'}
          </span>
        </div>`;
    }

    el.innerHTML = `
      <div onclick="localStorage.setItem('ml_filter_expenses_tab', 'pending'); if (typeof ExpensesPage !== 'undefined') ExpensesPage.currentTab = 'pending'; navigate('expenses');"
           title="Clique para ver e aprovar as despesas pendentes"
           style="cursor:pointer;background:linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);border:1.5px solid #f59e0b;border-radius:12px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 2px 8px rgba(245,158,11,0.12);transition:all .2s ease;"
           onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(245,158,11,0.25)';"
           onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(245,158,11,0.12)';">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg, #f59e0b, #d97706);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:900;box-shadow:0 4px 10px rgba(217,119,6,0.35);flex-shrink:0;">
            ${data.pending_tasks}
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#92400e;margin-bottom:3px;">
              ${data.pending_tasks === 1 ? '1 despesa aguarda sua ação!' : `${data.pending_tasks} despesas aguardam sua ação!`}
            </div>
            <div style="font-size:13px;color:#b45309;line-height:1.4;">
              Clique aqui para revisar e aprovar ou finalizar imediatamente.
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;background:#d97706;color:#ffffff;font-weight:700;font-size:13px;padding:10px 16px;border-radius:8px;box-shadow:0 2px 6px rgba(217,119,6,0.3);white-space:nowrap;flex-shrink:0;">
          Revisar agora →
        </div>
      </div>`;
  },

  _renderChart(categories) {
    const el = document.getElementById('dash-chart');
    if (!categories || categories.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">\uD83D\uDCCA</span><p>Nenhuma despesa registrada</p></div>`;
      return;
    }
    const max = Math.max(...categories.map(c => c.total), 1);
    el.innerHTML = categories.map(c => {
      const pct = Math.round((c.total / max) * 100);
      return `
        <div class="chart-row">
          <span class="chart-label" title="${escHtml(c.category)}">${escHtml(c.category)}</span>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width:0%" data-width="${pct}%"></div>
          </div>
          <span class="chart-value">${fmt(c.total)}</span>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
      el.querySelectorAll('.chart-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.width;
      });
    });
  },

  _renderRecent(expenses) {
    const el = document.getElementById('dash-recent');
    if (!expenses || expenses.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">\uD83D\uDCB8</span><p>Nenhuma despesa recente</p></div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Data</th>
            <th>Usu\u00e1rio</th>
            <th>Valor</th>
            <th>Categoria</th>
            <th>Descri\u00e7\u00e3o</th>
          </tr>
        </thead>
        <tbody>
          ${expenses.map(e => `
            <tr style="cursor:pointer;" onclick="navigate('expenses')">
              <td>${statusBadge(e.status)}</td>
              <td>${fmtDate(e.expense_date)}</td>
              <td>${escHtml(e.user_name)}</td>
              <td class="amount-cell">${fmt(e.amount)}</td>
              <td>${escHtml(e.category_name)}</td>
              <td class="expense-description" title="${escHtml(e.description)}">${escHtml(e.description)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  },
};
