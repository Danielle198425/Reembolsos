/**
 * expenses.js — Módulo de Despesas
 */
const ExpensesPage = {
  currentTab: 'pending',
  _currentScope: localStorage.getItem('active_scope') || 'personal',
  categories: [],
  costCenters: [],
  filters: {},
  sortField: 'expense_date',
  sortDirection: 'desc',
  currentFilteredExpenses: [],
  _tbodyClickBound: false,
  _mileageRates: null,

  async ensureMileageRates() {
    if (this._mileageRates && this._mileageRates.length > 0) {
      return this._mileageRates;
    }
    if (window._db && Array.isArray(window._db.mileage_rates) && window._db.mileage_rates.length > 0) {
      this._mileageRates = window._db.mileage_rates;
      return this._mileageRates;
    }
    try {
      const rates = await Api.getMileageRates();
      if (Array.isArray(rates) && rates.length > 0) {
        const extractLevelNumber = (name) => {
          if (!name) return 999999;
          const m = String(name).match(/(?:n[íi]vel\s*)?(\d+)/i);
          return m ? parseInt(m[1], 10) : 999999;
        };
        rates.sort((a, b) => {
          const numA = extractLevelNumber(a.name);
          const numB = extractLevelNumber(b.name);
          if (numA !== numB) return numA - numB;
          return (a.name || '').localeCompare(b.name || '');
        });
        this._mileageRates = rates;
        if (window._db) {
          window._db.mileage_rates = rates;
        }
        return rates;
      }
    } catch(e) {
      console.warn('Erro ao carregar taxas de quilometragem:', e);
    }
    return [];
  },

  getMileageRateForUser(user) {
    const rates = (this._mileageRates && this._mileageRates.length > 0)
      ? this._mileageRates
      : (window._db?.mileage_rates || []);
    
    const activeRates = rates.filter(r => r.active !== false && r.active !== 0 && r.active !== 'false');

    const normalize = (str) => (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    let funcName = (user?.job_function?.name || user?.job_function_name || '').trim();
    if (!funcName && user?.job_function_id && Array.isArray(window._db?.job_functions)) {
      const found = window._db.job_functions.find(f => f.id === user.job_function_id);
      if (found) funcName = (found.name || '').trim();
    }

    const normFunc = normalize(funcName);

    if (normFunc && activeRates.length > 0) {
      // 1. Direct match in applicable_functions
      for (const r of activeRates) {
        let funcs = [];
        if (r.applicable_functions) {
          if (Array.isArray(r.applicable_functions)) {
            funcs = r.applicable_functions;
          } else {
            try {
              const parsed = JSON.parse(r.applicable_functions);
              if (Array.isArray(parsed)) funcs = parsed;
            } catch(e) {
              funcs = String(r.applicable_functions).split(',').map(s => s.trim());
            }
          }
        }
        for (const fn of funcs) {
          const normFn = normalize(fn);
          if (normFn && (normFn === normFunc || normFunc.includes(normFn) || normFn.includes(normFunc))) {
            return { rate: parseFloat(r.rate), name: r.name, obj: r };
          }
        }
      }

      // 2. Match function name in rate name (e.g. "Nível 2 - Diretor" matches "diretor")
      for (const r of activeRates) {
        const normRateName = normalize(r.name);
        if (normRateName.includes(normFunc) || (normFunc.length >= 4 && normRateName.includes(normFunc.slice(0, -1)))) {
          return { rate: parseFloat(r.rate), name: r.name, obj: r };
        }
      }
    }

    // 3. Fallback: match "colaborador", "padrao", or "nivel 1"
    const defaultRate = activeRates.find(r => {
      const n = normalize(r.name);
      return n.includes('colaborador') || n.includes('padrao') || n.includes('nivel 1') || n.includes('1');
    }) || activeRates[0];

    if (defaultRate) {
      return { rate: parseFloat(defaultRate.rate), name: defaultRate.name, obj: defaultRate };
    }

    // Absolute fallback
    return { rate: 1.11, name: 'Nível 1 - Colaborador', obj: null };
  },

  switchScope(scope) {
    this._currentScope = scope;
    localStorage.setItem('active_scope', scope);
    if (scope === 'personal') {
      const uSel = document.getElementById('filter-user');
      if (uSel) uSel.value = '';
    }
    const tabPers = document.getElementById('exp-scope-personal');
    const tabTeam = document.getElementById('exp-scope-team');
    if (tabPers && tabTeam) {
      tabPers.classList.toggle('active', scope === 'personal');
      tabTeam.classList.toggle('active', scope !== 'personal');
    }
    this.loadExpenses();
  },

  async render() {
    const isApproverOrAdmin = ['admin', 'financeiro', 'aprovador'].includes(App.user?.role);
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const teamScopeName = App.user?.role === 'aprovador' ? 'team' : 'financial';
    const teamScopeLabel = App.user?.role === 'aprovador' ? 'Time' : 'Financeiro';
    
    const savedScope = localStorage.getItem('active_scope');
    if (savedScope) {
      this._currentScope = isApproverOrAdmin ? savedScope : 'personal';
    } else {
      this._currentScope = isAdminOrFinance ? 'financial' : (App.user?.role === 'aprovador' ? 'team' : 'personal');
    }

    const colSpan = isAdminOrFinance ? 10 : 9;
    const isInitialCollapsed = localStorage.getItem('ml_expense_desc_collapsed') !== 'false';

    const el = document.getElementById('page-expenses');
    el.innerHTML = `
      ${isApproverOrAdmin ? `
      <div style="display:flex;justify-content:center;margin-bottom:20px;">
        <div class="tabs" id="expense-scope-tabs" style="margin:0;">
          <div class="tab ${this._currentScope === 'personal' ? 'active' : ''}" id="exp-scope-personal" onclick="ExpensesPage.switchScope('personal')">Pessoal</div>
          <div class="tab ${this._currentScope !== 'personal' ? 'active' : ''}" id="exp-scope-team" onclick="ExpensesPage.switchScope('${teamScopeName}')">${teamScopeLabel}</div>
        </div>
      </div>` : ''}

      <div class="page-header">
        <div>
          <h1 class="page-title">Despesas</h1>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-new-expense">＋ Nova Despesa</button>
          ${isAdminOrFinance ? `<button class="btn btn-secondary" id="btn-exec-report">⬇ Exportar Selecionados</button>` : ''}
        </div>
      </div>


      <div class="tabs" id="expense-tabs">
        <div class="tab active" data-tab="pending" id="tab-pending">PENDENTES</div>
        <div class="tab" data-tab="all" id="tab-all">TODAS AS DESPESAS</div>
      </div>


      <div class="table-wrapper">
        <div class="filters-bar" id="expense-filters">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="exp-search" placeholder="Buscar despesa..." />
          </div>
          ${isAdminOrFinance ? `
          <select class="filter-select" id="filter-user">
            <option value="">Todos os usuários</option>
          </select>` : ''}
          <select class="filter-select" id="filter-status">
            <option value="">Todos os status</option>
            <option value="aguardando_aprovacao">Aguardando Aprovação</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="aguardando_finalizacao">Aguardando Finalização</option>
            <option value="finalizado">Finalizado</option>
            <option value="enviado">Enviado</option>
            <option value="pago">Pago</option>
          </select>
          <select class="filter-select" id="filter-category">
            <option value="">Todas as categorias</option>
          </select>
          <select class="filter-select" id="filter-cc">
            <option value="">Todos os CCs</option>
          </select>
          <input type="date" class="filter-select" id="filter-date-from" title="Data inicial" />
          <input type="date" class="filter-select" id="filter-date-to" title="Data final" />
          <button class="btn btn-sm btn-ghost" id="clear-filters-btn">✕ Limpar</button>
        </div>


        <div class="table-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="table-count" id="exp-count">Carregando...</span>
            <span class="table-total" id="exp-total" style="font-size:13px;color:var(--text-3);font-weight:500;"></span>
          </div>
          <div class="table-actions" style="display:flex;align-items:center;gap:8px;">
            ${isAdminOrFinance ? `<button class="btn btn-sm btn-secondary" id="btn-sync-sienge-payments" title="Consultar parcelas no Sienge e atualizar para 'pago' se quitadas (PG)">🔄 Sincronizar Sienge</button>` : ''}
            ${isAdminOrFinance ? `<button class="btn btn-sm btn-primary" id="btn-bulk-sienge">Gerar Título</button>` : ''}
            <button class="btn btn-sm btn-ghost" id="reload-expenses-btn" title="Recarregar">↻</button>
          </div>
        </div>


        <div style="overflow-x:auto;">
          <table id="expenses-table" class="${isInitialCollapsed ? 'desc-collapsed' : 'desc-expanded'}">
            <thead>
              <tr>
                ${isAdminOrFinance ? `<th style="width:36px;text-align:center;"><input type="checkbox" id="select-all-exp" /></th>` : ''}
                <th style="width:28px;padding:0 2px;text-align:center;"></th>
                <th class="th-sortable" data-sort="status" style="cursor:pointer;user-select:none;" title="Ordenar por Status">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Status</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:0.3;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th class="th-sortable" data-sort="expense_date" style="cursor:pointer;user-select:none;" title="Ordenar por Data">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Data</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:1;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th class="th-sortable" data-sort="user_name" style="cursor:pointer;user-select:none;" title="Ordenar por Usuário">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Usuário</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:0.3;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th class="th-sortable" data-sort="amount" style="cursor:pointer;user-select:none;" title="Ordenar por Valor">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Valor</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:0.3;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th class="th-sortable" data-sort="category_name" style="cursor:pointer;user-select:none;" title="Ordenar por Categoria">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Categoria</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:0.3;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th class="th-sortable" data-sort="cost_center" style="cursor:pointer;user-select:none;" title="Ordenar por Centro de Custo">
                  <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>Centro de Custo</span>
                    <span class="sort-arrow" style="font-size:10px;opacity:0.3;transition:opacity .15s;">▼</span>
                  </div>
                </th>
                <th id="th-despesa">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                    <span>Despesa</span>
                    <button type="button" class="btn-desc-toggle" id="btn-toggle-desc-col" title="${isInitialCollapsed ? 'Expandir descrição' : 'Recolher descrição'}" aria-label="${isInitialCollapsed ? 'Expandir descrição' : 'Recolher descrição'}">
                      <span id="desc-toggle-col-icon" style="display:inline-flex;align-items:center;justify-content:center;pointer-events:none;">
                        ${isInitialCollapsed
                          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
                          : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
                        }
                      </span>
                    </button>
                  </div>
                </th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="expenses-tbody">
              <tr class="loading-row"><td colspan="${colSpan}">
                <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:30px;">
                  <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);"></div> Carregando...
                </div>
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;


    // Load aux data
    await this._loadAux();


    // Restore filters from localStorage
    const savedStatus = localStorage.getItem('ml_filter_expenses_status') || '';
    const savedCategory = localStorage.getItem('ml_filter_expenses_category') || '';
    const savedCc = localStorage.getItem('ml_filter_expenses_cc') || '';
    const savedDateFrom = localStorage.getItem('ml_filter_expenses_date_from') || '';
    const savedDateTo = localStorage.getItem('ml_filter_expenses_date_to') || '';
    const savedSearch = localStorage.getItem('ml_filter_expenses_search') || '';
    const savedTab = localStorage.getItem('ml_filter_expenses_tab') || 'pending';


    if (document.getElementById('filter-status')) document.getElementById('filter-status').value = savedStatus;
    if (document.getElementById('filter-category')) document.getElementById('filter-category').value = savedCategory;
    if (document.getElementById('filter-cc')) document.getElementById('filter-cc').value = savedCc;
    if (document.getElementById('filter-date-from')) document.getElementById('filter-date-from').value = savedDateFrom;
    if (document.getElementById('filter-date-to')) document.getElementById('filter-date-to').value = savedDateTo;
    if (document.getElementById('exp-search')) document.getElementById('exp-search').value = savedSearch;


    this.currentTab = savedTab;
    document.querySelectorAll('#expense-tabs .tab').forEach(t => {
      if (t.dataset.tab === this.currentTab) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });


    // Bind events
    document.getElementById('btn-new-expense').addEventListener('click', () => this.openForm());
    document.getElementById('reload-expenses-btn').addEventListener('click', () => this.loadExpenses());
    document.getElementById('btn-exec-report')?.addEventListener('click', () => this.exportSelected());
    document.getElementById('btn-bulk-sienge')?.addEventListener('click', () => this.bulkSendSienge());
    document.getElementById('btn-sync-sienge-payments')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-sync-sienge-payments');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Sincronizando...';
      try {
        const res = await Api.syncSiengePayments();
        if (res.total_updated > 0) {
          toast(res.message || `${res.total_updated} despesa(s) atualizada(s) para 'pago'!`, 'success');
        } else {
          toast(res.message || 'Todas as despesas no Sienge já estão sincronizadas.', 'info');
        }
        this.loadExpenses();
        DashboardPage.render && DashboardPage.render();
      } catch (err) {
        toast('Erro ao sincronizar com o Sienge: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });


    document.querySelectorAll('#expense-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#expense-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        localStorage.setItem('ml_filter_expenses_tab', this.currentTab);
        this.loadExpenses();
      });
    });


    ['filter-user','filter-status','filter-category','filter-cc','filter-date-from','filter-date-to'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const key = 'ml_filter_expenses_' + id.replace('filter-', '').replace('-', '_');
        localStorage.setItem(key, e.target.value);
        this.loadExpenses();
      });
    });
    document.getElementById('exp-search').addEventListener('input', debounce((e) => {
      localStorage.setItem('ml_filter_expenses_search', e.target.value);
      this.loadExpenses();
    }, 350));
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
      ['filter-user','filter-status','filter-category','filter-cc'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
        localStorage.setItem('ml_filter_expenses_' + id.replace('filter-', '').replace('-', '_'), '');
      });
      ['filter-date-from','filter-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
        localStorage.setItem('ml_filter_expenses_' + id.replace('filter-', '').replace('-', '_'), '');
      });
      document.getElementById('exp-search').value = '';
      localStorage.setItem('ml_filter_expenses_search', '');
      this.loadExpenses();
    });


    this._tbodyClickBound = false;

    document.querySelectorAll('#expenses-table th.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (field) this.handleSort(field);
      });
    });

    document.getElementById('select-all-exp')?.addEventListener('change', (e) => {
      document.querySelectorAll('.exp-checkbox:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
      this._updateSelectionSummary();
    });

    document.getElementById('expenses-tbody')?.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('exp-checkbox')) {
        this._updateSelectAllState();
        this._updateSelectionSummary();
      }
    });

    const colBtn = document.getElementById('btn-toggle-desc-col');
    if (colBtn) {
      colBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDescCollapse(e);
      });
    }


    this.loadExpenses();
  },


  async _loadAux() {
    try {
      const [categories, costCenters, siengeCcs, users] = await Promise.all([
        Api.getCategories().catch(() => []),
        Api.getCostCenters().catch(() => []),
        Api.getSiengeCostCenters().catch(() => []),
        Api.getUsers().catch(() => []),
        this.ensureMileageRates().catch(() => []),
      ]);
      this.categories = categories || [];
      this.users = users || [];

      const siengeNameMap = new Map();
      (siengeCcs || []).forEach(sc => {
        if (!sc) return;
        const key = String(sc.code || sc.id).trim();
        if (sc.name) siengeNameMap.set(key, sc.name);
      });

      const ccMap = new Map();
      (costCenters || []).forEach(c => {
        if (!c) return;
        const key = String(c.code || c.id).trim();
        const siengeName = siengeNameMap.get(key) || siengeNameMap.get(String(c.id).trim()) || siengeNameMap.get(String(c.code).trim());
        const name = siengeName || c.name;
        const active = c.active !== false && c.active !== 0 && c.active !== 'false' && c.active !== '0';
        
        if (active) {
          ccMap.set(key, {
            id: c.id,
            code: c.code || String(c.id),
            name: name
          });
        }
      });

      const localOverrides = (window._db && window._db.sienge_cost_centers) ? window._db.sienge_cost_centers : [];

      this.costCenters = Array.from(ccMap.values()).filter(c => {
        if (!c || c.active === false) return false;
        const found = localOverrides.find(lc => {
          const lcKey = String(lc.id || lc.code).trim();
          const cCode = String(c.code || '').trim();
          const cId = String(c.id || '').trim();
          return lcKey === cCode || lcKey === cId;
        });

        if (found && (found.active === false || found.active === 0 || found.active === 'false' || found.active === '0')) {
          return false;
        }
        return true;
      }).sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

      const userSel = document.getElementById('filter-user');
      if (userSel) {
        userSel.innerHTML = '<option value="">Todos os usuários</option>';
        if (Array.isArray(this.users)) {
          this.users.forEach(u => {
            userSel.innerHTML += `<option value="${u.id}">${escHtml(u.name || u.email)}</option>`;
          });
        }
        const savedUser = localStorage.getItem('ml_filter_expenses_user');
        if (savedUser) userSel.value = savedUser;
      }

      const catSel = document.getElementById('filter-category');
      if (catSel) {
        catSel.innerHTML = '<option value="">Todas as Categorias</option>';
        this.categories.forEach(c => {
          catSel.innerHTML += `<option value="${c.id}">${escHtml(c.icon)} ${escHtml(c.name)}</option>`;
        });
      }

      const ccSel = document.getElementById('filter-cc');
      if (ccSel) {
        ccSel.innerHTML = '<option value="">Todos os CCs</option>';
        this.costCenters.forEach(cc => {
          ccSel.innerHTML += `<option value="${cc.id}">${cc.code ? escHtml(cc.code) + ' | ' : ''}${escHtml(cc.name)}</option>`;
        });
      }
    } catch (e) { /* ignore */ }
  },


  async loadExpenses() {
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const colSpan = isAdminOrFinance ? 10 : 9;

    const selectAllEl = document.getElementById('select-all-exp');
    if (selectAllEl) selectAllEl.checked = false;

    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = `<tr class="loading-row"><td colspan="${colSpan}">
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:30px;">
        <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);"></div> Carregando...
      </div></td></tr>`;


    try {
      const isApproverOrAdmin = ['admin', 'financeiro', 'aprovador'].includes(App.user?.role);
      const scope = isApproverOrAdmin ? (this._currentScope || localStorage.getItem('active_scope') || 'personal') : 'personal';
      const userVal = document.getElementById('filter-user')?.value || '';
      const params = {
        scope: scope,
        pending_only: this.currentTab === 'pending',
        user_id: userVal || undefined,
        status: document.getElementById('filter-status').value,
        category_id: document.getElementById('filter-category').value,
        cost_center_id: document.getElementById('filter-cc').value,
        date_from: document.getElementById('filter-date-from').value,
        date_to: document.getElementById('filter-date-to').value,
      };


      const data = await Api.getExpenses(params);
      let expenses = data.items || [];
      this.loadedExpenses = expenses;

      if (userVal) {
        expenses = expenses.filter(e => String(e.user_id) === String(userVal));
      }

      if (this.currentTab === 'pending') {
        if (isAdminOrFinance) {
          expenses = expenses.filter(e => 
            e.status === 'aguardando_aprovacao' || 
            e.status === 'aguardando_finalizacao' || 
            (e.status === 'finalizado' && !e.sienge_title) || 
            e.status === 'rejeitado'
          );
        } else {
          expenses = expenses.filter(e => e.status === 'aguardando_aprovacao' || e.status === 'rejeitado');
        }
      }


      // Client-side search
      const search = document.getElementById('exp-search').value.toLowerCase();
      if (search) {
        expenses = expenses.filter(e =>
          e.description?.toLowerCase().includes(search) ||
          e.user_name?.toLowerCase().includes(search) ||
          e.category_name?.toLowerCase().includes(search) ||
          e.cost_center_name?.toLowerCase().includes(search) ||
          e.cost_center_code?.toLowerCase().includes(search)
        );
      }

      this.currentFilteredExpenses = this._sortExpenses(expenses);
      this._updateSortHeaders();
      this._updateSelectionSummary();

      if (this.currentFilteredExpenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state">
          <span class="empty-icon">📋</span><p>Nenhuma despesa encontrada</p>
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = this.currentFilteredExpenses.map(e => this._rowHTML(e)).join('');
      this._bindRowEvents();
      this._initDescCollapseState();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state">
        <span class="empty-icon">⚠️</span><p>Erro ao carregar: ${escHtml(err.message)}</p>
      </div></td></tr>`;
    }
  },


  _initDescCollapseState() {
    const isCollapsed = localStorage.getItem('ml_expense_desc_collapsed') !== 'false';
    this._setDescCollapse(isCollapsed);
  },

  _setDescCollapse(collapsed) {
    const table = document.getElementById('expenses-table');
    if (!table) return;
    localStorage.setItem('ml_expense_desc_collapsed', collapsed ? 'true' : 'false');

    if (collapsed) {
      table.classList.add('desc-collapsed');
      table.classList.remove('desc-expanded');
    } else {
      table.classList.remove('desc-collapsed');
      table.classList.add('desc-expanded');
    }

    const colBtn = document.getElementById('btn-toggle-desc-col');
    const colIcon = document.getElementById('desc-toggle-col-icon');
    if (colBtn) {
      colBtn.title = collapsed ? 'Expandir descrição' : 'Recolher descrição';
      colBtn.setAttribute('aria-label', colBtn.title);
    }
    if (colIcon) {
      colIcon.innerHTML = collapsed
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }
  },

  _lastToggleTime: 0,
  toggleDescCollapse(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }
    const now = Date.now();
    if (now - this._lastToggleTime < 250) return;
    this._lastToggleTime = now;

    const isCurrentlyCollapsed = localStorage.getItem('ml_expense_desc_collapsed') !== 'false';
    this._setDescCollapse(!isCurrentlyCollapsed);
  },

  handleSort(field) {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = (field === 'expense_date' || field === 'amount') ? 'desc' : 'asc';
    }

    this._updateSortHeaders();
    this.applySortAndRender();
  },

  applySortAndRender() {
    const tbody = document.getElementById('expenses-tbody');
    if (!tbody) return;

    if (!this.currentFilteredExpenses || this.currentFilteredExpenses.length === 0) {
      return;
    }

    // Preserve checked state
    const checkedBoxes = [...document.querySelectorAll('.exp-checkbox:checked')];
    const checkedIds = new Set(checkedBoxes.map(cb => parseInt(cb.value)));

    this.currentFilteredExpenses = this._sortExpenses(this.currentFilteredExpenses);
    tbody.innerHTML = this.currentFilteredExpenses.map(e => this._rowHTML(e, checkedIds)).join('');

    this._initDescCollapseState();
    this._updateSelectionSummary();
    this._updateSelectAllState();
  },

  _updateSortHeaders() {
    const headers = document.querySelectorAll('#expenses-table th.th-sortable');
    headers.forEach(th => {
      const field = th.dataset.sort;
      const arrowEl = th.querySelector('.sort-arrow');
      if (!arrowEl) return;
      if (field === this.sortField) {
        arrowEl.textContent = this.sortDirection === 'asc' ? '▲' : '▼';
        arrowEl.style.opacity = '1';
        arrowEl.style.color = 'var(--text-1)';
        th.style.color = 'var(--text-1)';
      } else {
        arrowEl.textContent = '▼';
        arrowEl.style.opacity = '0.3';
        arrowEl.style.color = 'inherit';
        th.style.color = 'inherit';
      }
    });
  },

  _sortExpenses(list) {
    if (!Array.isArray(list)) return [];
    const field = this.sortField || 'expense_date';
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    return [...list].sort((a, b) => {
      let res = 0;
      switch (field) {
        case 'status': {
          const valA = (STATUS_LABELS[a.status] || a.status || '').toLowerCase();
          const valB = (STATUS_LABELS[b.status] || b.status || '').toLowerCase();
          res = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' }) * dir;
          break;
        }
        case 'expense_date': {
          const valA = a.expense_date || '';
          const valB = b.expense_date || '';
          res = valA.localeCompare(valB) * dir;
          break;
        }
        case 'user_name': {
          const valA = (a.user_name || '').toLowerCase();
          const valB = (b.user_name || '').toLowerCase();
          res = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' }) * dir;
          break;
        }
        case 'amount': {
          const valA = Number(a.amount) || 0;
          const valB = Number(b.amount) || 0;
          res = (valA - valB) * dir;
          break;
        }
        case 'category_name': {
          const valA = (a.category_name || '').toLowerCase();
          const valB = (b.category_name || '').toLowerCase();
          res = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' }) * dir;
          break;
        }
        case 'cost_center': {
          const valA = ((a.cost_center_code || '') + ' ' + (a.cost_center_name || '')).trim().toLowerCase();
          const valB = ((b.cost_center_code || '') + ' ' + (b.cost_center_name || '')).trim().toLowerCase();
          res = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base', numeric: true }) * dir;
          break;
        }
        default:
          res = 0;
      }
      if (res === 0) {
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      }
      return res;
    });
  },

  _updateSelectionSummary() {
    const countEl = document.getElementById('exp-count');
    const totalEl = document.getElementById('exp-total');
    if (!countEl) return;

    const expenses = this.currentFilteredExpenses || [];
    const totalCount = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const checkedBoxes = [...document.querySelectorAll('.exp-checkbox:checked')];
    const checkedIds = new Set(checkedBoxes.map(cb => parseInt(cb.value)));
    const selectedExpenses = expenses.filter(e => checkedIds.has(e.id));
    const selectedCount = selectedExpenses.length;
    const selectedTotal = selectedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    if (selectedCount > 0) {
      countEl.innerHTML = `<strong>${selectedCount}</strong> de ${totalCount} selecionada${selectedCount > 1 ? 's' : ''}`;
      if (totalEl) {
        totalEl.innerHTML = `• Total: <strong>${fmt(selectedTotal)}</strong>`;
        totalEl.title = `Total selecionado: ${fmt(selectedTotal)} | Total da lista (${totalCount} despesas): ${fmt(totalAmount)}`;
      }
    } else {
      countEl.innerHTML = `<strong>${totalCount}</strong> despesa${totalCount !== 1 ? 's' : ''}`;
      if (totalEl) {
        totalEl.innerHTML = `• Total: <strong>${fmt(totalAmount)}</strong>`;
        totalEl.title = `Total da lista (${totalCount} despesas): ${fmt(totalAmount)}`;
      }
    }
  },

  _updateSelectAllState() {
    const selectAll = document.getElementById('select-all-exp');
    if (!selectAll) return;
    const enabledBoxes = [...document.querySelectorAll('.exp-checkbox:not(:disabled)')];
    const allChecked = enabledBoxes.length > 0 && enabledBoxes.every(cb => cb.checked);
    selectAll.checked = allChecked;
  },

  _rowHTML(e, checkedIds = null) {
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const isFinalized = e.status === 'finalizado' || e.status === 'pago';
    const canEdit = App.user?.role === 'admin' || (!isFinalized && (e.user_id === App.user?.id || App.user?.role === 'aprovador' || App.user?.role === 'financeiro'));
    const isSelf = e.user_id === App.user?.id;
    const canApprove = (App.user?.role === 'admin' || (App.user?.role === 'aprovador' && !isSelf)) &&
                       e.status === 'aguardando_aprovacao';
    const canReject = (App.user?.role === 'admin' || App.user?.role === 'financeiro' || (App.user?.role === 'aprovador' && !isSelf)) &&
                      (e.status === 'aguardando_aprovacao' || e.status === 'aguardando_finalizacao' || e.status === 'aprovado');
    const canFinalize = isAdminOrFinance && (e.status === 'aguardando_finalizacao' || e.status === 'aprovado');
    const canPay = false;
    const canDelete = (e.user_id === App.user?.id || isAdminOrFinance);
    const canResubmit = e.status === 'rejeitado' && (e.user_id === App.user?.id || isAdminOrFinance);

    let statusTooltip = '';
    let statusExtraClass = '';

    if (e.status === 'finalizado') {
      if (e.sienge_title) {
        statusTooltip = `Título Sienge ${e.sienge_title}`;
      } else {
        statusTooltip = 'Pendente criar título no Sienge';
        statusExtraClass = 'pendente-titulo';
      }
    } else if (e.status === 'enviado') {
      statusTooltip = e.sienge_title ? `Título Sienge ${e.sienge_title}` : 'Enviado para o Sienge';
    } else if (e.status === 'pago') {
      const pDate = e.paid_at ? fmtDate(e.paid_at) : (e.updated_at ? fmtDate(e.updated_at) : '');
      const tInfo = e.sienge_title ? ` (Título Sienge ${e.sienge_title})` : '';
      statusTooltip = pDate ? `Pagamento realizado em ${pDate}${tInfo}` : `Pagamento realizado${tInfo}`;
    }

    const receipt = e.receipt_path
      ? `<span class="receipt-icon" title="Ver comprovante" style="cursor:pointer;" onclick="ExpensesPage.viewReceipt('${escHtml((e.receipt_path || '').replace(/\\/g, '/'))}')">📎</span>`
      : (e.category_requires_nf ? '<span title="NF obrigatória!" style="color:var(--amber);">⚠️</span>' : '');

    const alertTooltip = e.is_corrected
      ? 'Despesa corrigida'
      : (e.edited_after_approval ? 'Parcela editada após autorização' : '');
    const alertBadge = alertTooltip
      ? `<span title="${alertTooltip}" style="color:#eab308;font-size:16px;line-height:1;cursor:help;display:inline-block;" data-tooltip="${alertTooltip}">⚠️</span>`
      : '';

    let impAlertTooltip = '';
    if (e.created_by_admin_name && e.approved_by_admin_name) {
      impAlertTooltip = `Despesa criada e aprovada pelo Administrador (${escHtml(e.created_by_admin_name)}) no modo 'Ver como'`;
    } else if (e.created_by_admin_name || e.created_by_admin_id) {
      impAlertTooltip = `Despesa criada pelo Administrador (${escHtml(e.created_by_admin_name || 'Administrador')}) no modo 'Ver como'`;
    } else if (e.approved_by_admin_name || e.approved_by_admin_id) {
      impAlertTooltip = `Despesa aprovada pelo Administrador (${escHtml(e.approved_by_admin_name || 'Administrador')}) no modo 'Ver como'`;
    }
    const impAlertBadge = impAlertTooltip
      ? `<span title="${impAlertTooltip}" style="font-size:15px;line-height:1;cursor:help;display:inline-block;" data-tooltip="${impAlertTooltip}">👁️</span>`
      : '';

    const isStatusApproved = e.status === 'aprovado';
    const isStatusFinalized = e.status === 'finalizado';
    const isStatusWaitingFin = e.status === 'aguardando_finalizacao';
    const isStatusRejected = e.status === 'rejeitado';
    const isSelectable = isStatusApproved || isStatusFinalized || isStatusWaitingFin;
    const checkboxTitle = isStatusRejected
      ? 'Despesas rejeitadas não podem ser selecionadas'
      : (isStatusApproved || isStatusWaitingFin
        ? 'Selecionar despesa para exportação / finalização'
        : (isStatusFinalized
          ? 'Selecionar despesa finalizada para exportação ou gerar título'
          : 'Apenas despesas aprovadas, aguardando finalização ou finalizadas podem ser selecionadas'));
    const checkboxDisabled = !isSelectable ? 'disabled style="cursor:not-allowed;opacity:0.35;"' : '';
    const isChecked = checkedIds && checkedIds.has(e.id);

    return `
      <tr data-id="${e.id}">
        ${isAdminOrFinance ? `<td style="width:36px;text-align:center;"><input type="checkbox" class="exp-checkbox" value="${e.id}" data-status="${e.status}" title="${checkboxTitle}" ${checkboxDisabled} ${isChecked ? 'checked' : ''} /></td>` : ''}
        <td style="width:28px;padding:0 2px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;gap:2px;">
            ${alertBadge}
            ${impAlertBadge}
          </div>
        </td>
        <td ${statusTooltip ? `title="${escHtml(statusTooltip)}" style="cursor:help;"` : ''}>${statusBadge(e.status, statusTooltip, statusExtraClass)}</td>
        <td>${fmtDate(e.expense_date)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--ml-indigo),var(--ml-lilac));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;">${initials(e.user_name)}</div>
            <div style="min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:13px;font-weight:600;">${escHtml(e.user_name)}</span>
                ${receipt}
              </div>
            </div>
          </div>
        </td>
        <td class="amount-cell">${fmt(e.amount)}</td>
        <td>${escHtml(e.category_name)}</td>
        <td style="font-size:12px;color:var(--text-3);">${escHtml(e.cost_center_code)} ${escHtml(e.cost_center_name)}</td>
        <td class="col-despesa"><span class="expense-description" title="${escHtml(e.description)}">${escHtml(e.description)}</span></td>
        <td>
          <div class="td-actions">
            <button class="action-btn" title="Ver detalhes" data-action="view" data-id="${e.id}">👁</button>
            ${canApprove ? `
              <button class="action-btn success" title="Aprovar" data-action="approve" data-id="${e.id}">✔</button>
            ` : ''}
            ${canReject ? `
              <button class="action-btn danger" title="Recusar despesa" data-action="reject" data-id="${e.id}">✘</button>
            ` : ''}
            ${canFinalize ? `<button class="action-btn" title="Finalizar despesa" data-action="finalize" data-id="${e.id}" style="color:var(--purple);">🏁</button>` : ''}
            ${(isAdminOrFinance && (e.status === 'finalizado' || e.status === 'aprovado' || e.status === 'aguardando_finalizacao') && !e.sienge_title) ? `
              <button class="action-btn" title="Gerar Título no Sienge" data-action="send-sienge" data-id="${e.id}" style="color:#006633;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
              </button>
            ` : ''}
            ${canResubmit ? `<button class="action-btn" title="Reenviar" data-action="resubmit" data-id="${e.id}" style="color:var(--amber);">↩</button>` : ''}
            ${canEdit ? `<button class="action-btn" title="Editar despesa" data-action="edit" data-id="${e.id}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>` : ''}
            ${canDelete ? `
              <button class="action-btn danger" title="Excluir despesa" data-action="delete" data-id="${e.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>`;
  },

  _bindRowEvents() {
    if (this._tbodyClickBound) return;
    const tbody = document.getElementById('expenses-tbody');
    if (!tbody) return;
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      await this._handleAction(action, parseInt(id));
    });
    this._tbodyClickBound = true;
  },


  async _handleAction(action, id) {
    const actions = {
      view: () => this.viewExpense(id),
      edit: () => this.openForm(id),
      delete: () => Modal.confirm('Excluir despesa', 'Tem certeza que deseja excluir esta despesa?', async () => {
        try { await Api.deleteExpense(id); toast('Despesa excluída', 'success'); this.loadExpenses(); }
        catch (err) { toast(err.message, 'error'); }
      }, true),
      submit: () => this._transition(id, () => Api.submitExpense(id), 'Despesa submetida com sucesso!'),
      send: () => this._transition(id, () => Api.sendExpense(id), 'Enviado para aprovação!'),
      approve: () => Modal.confirm('Aprovar despesa', 'Confirmar aprovação desta despesa?', () =>
        this._transition(id, () => Api.approveExpense(id), 'Despesa aprovada!')),
      reject: () => this._openRejectModal(id),
      finalize: () => Modal.confirm('Finalizar despesa', 'Confirmar a finalização desta despesa?', () =>
        this._transition(id, () => Api.finalizeExpense(id), 'Despesa finalizada com sucesso!')),
      pay: () => Modal.confirm('Finalizar despesa', 'Confirmar a finalização e o pagamento desta despesa?', () =>
        this._transition(id, () => Api.payExpense(id), 'Despesa finalizada com sucesso!')),
      resubmit: () => this._transition(id, () => Api.resubmitExpense(id), 'Despesa reenviada!'),
      'send-sienge': () => Modal.confirm('Enviar para o Sienge', 'Confirma o envio para o Sienge?', async () => {
        try {
          const res = await Api.sendExpenseToSienge(id);
          toast(res.message || `Título nº ${res.title_number} gerado com sucesso`, 'success');
          this.loadExpenses();
          DashboardPage.render && DashboardPage.render();
        } catch (err) {
          toast(err.message, 'error');
        }
      }),
      'check-sienge': async () => {
        try {
          const res = await Api.checkSiengePayment(id);
          if (res.updated) {
            toast(res.message || 'Parcela quitada no Sienge (PG)! Despesa atualizada para Pago.', 'success');
          } else {
            toast(res.message || `Situação da parcela no Sienge: ${res.situation || 'Pendente'}`, 'info');
          }
          this.loadExpenses();
          DashboardPage.render && DashboardPage.render();
        } catch (err) {
          toast('Erro ao consultar Sienge: ' + err.message, 'error');
        }
      },
      'pay-sienge': () => Modal.confirm('Baixa de Pagamento', 'Confirma a baixa do pagamento para esta despesa?', async () => {
        try {
          const res = await Api.payExpenseSienge(id);
          toast(res.message || 'Pagamento registrado com sucesso!', 'success');
          this.loadExpenses();
          DashboardPage.render && DashboardPage.render();
        } catch (err) {
          toast(err.message, 'error');
        }
      }),
    };
    if (actions[action]) await actions[action]();
  },


  async _transition(id, apiFn, successMsg) {
    try {
      await apiFn();
      toast(successMsg, 'success');
      this.loadExpenses();
      DashboardPage.render && DashboardPage.render();
    } catch (err) {
      toast(err.message, 'error');
    }
  },


  async _openRejectModal(id) {
    let reasons = [];
    try {
      reasons = await Api.getRejectionReasons();
    } catch(e) {
      reasons = (window._db && window._db.rejection_reasons) ? window._db.rejection_reasons : [];
    }

    if (!reasons || reasons.length === 0) {
      reasons = [
        { id: 1, label: 'Despesa duplicada' },
        { id: 2, label: 'Comprovante ilegível' },
        { id: 3, label: 'Despesa incompleta' },
        { id: 4, label: 'Despesa fora da política' }
      ];
    }

    const activeReasons = reasons.filter(r => r.active !== false);

    const html = `
      <div class="field" style="margin-bottom:16px;">
        <label for="reject-reason-select" style="font-weight:600;font-size:14px;color:var(--text-1);margin-bottom:6px;display:block;">Motivo da rejeição *</label>
        <select id="reject-reason-select" class="form-control" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text-1);outline:none;cursor:pointer;">
          <option value="">Selecione um motivo cadastrado...</option>
          ${activeReasons.map(r => `<option value="${escHtml(r.label)}">${escHtml(r.label)}</option>`).join('')}
          <option value="__outro__">Outro motivo...</option>
        </select>
      </div>
      <div class="field" id="reject-details-wrap" style="margin-bottom:8px;">
        <label for="reject-reason-details" style="font-weight:600;font-size:13px;color:var(--text-2);margin-bottom:6px;display:block;">Observações / Detalhes adicionais</label>
        <textarea id="reject-reason-details" rows="3" placeholder="Descreva observações ou detalhes adicionais sobre a reprovação..." style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;outline:none;background:var(--surface);color:var(--text-1);box-sizing:border-box;"></textarea>
      </div>
    `;

    Modal.open('Rejeitar despesa', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-danger" id="reject-confirm-btn">Rejeitar</button>`
    );

    const sel = document.getElementById('reject-reason-select');
    const details = document.getElementById('reject-reason-details');

    document.getElementById('reject-confirm-btn').addEventListener('click', async () => {
      const selectedOption = sel ? sel.value : '';
      const customDetails = details ? details.value.trim() : '';

      let finalReason = '';
      if (selectedOption === '__outro__') {
        if (!customDetails) {
          toast('Por favor, descreva o motivo da rejeição no campo de texto.', 'warning');
          details?.focus();
          return;
        }
        finalReason = customDetails;
      } else if (selectedOption) {
        finalReason = customDetails ? `${selectedOption} - ${customDetails}` : selectedOption;
      } else if (customDetails) {
        finalReason = customDetails;
      } else {
        toast('Selecione ou informe o motivo da rejeição.', 'warning');
        sel?.focus();
        return;
      }

      Modal.close();
      await this._transition(id, () => Api.rejectExpense(id, finalReason), 'Despesa rejeitada com sucesso!');
    });
  },


  async viewExpense(id) {
    try {
      const e = await Api.getExpense(id);
      const flowStatuses = ['aguardando_aprovacao','aprovado','aguardando_finalizacao','finalizado','enviado','pago'];
      let normStatus = e.status === 'rejeitado' ? 'aguardando_aprovacao' : e.status;
      if (normStatus === 'rascunho' || normStatus === 'a_enviar') normStatus = 'aguardando_aprovacao';
      const currentIdx = flowStatuses.indexOf(normStatus);


      const flowHTML = flowStatuses.map((s, i) => {
        let dotClass = '';
        if (i < currentIdx) {
          dotClass = 'done';
        } else if (i === currentIdx) {
          if (e.status === 'rejeitado') dotClass = 'rejected';
          else if (s === 'pago') dotClass = 'done';
          else dotClass = 'current';
        }
        return `
          <div class="flow-step">
            <div class="flow-dot ${dotClass}"></div>
            <span class="flow-step-label ${i <= currentIdx ? 'active' : ''}">${STATUS_LABELS[s] || s}</span>
          </div>
          ${i < flowStatuses.length - 1 ? `<div class="flow-line ${i < currentIdx ? 'done' : ''}"></div>` : ''}
        `;
      }).join('');


      const viewStatusTooltip = (e.status === 'finalizado' && !e.sienge_title) ? 'Pendente criar título no Sienge' : (e.sienge_title ? `Título Sienge ${e.sienge_title}` : '');
      const viewStatusClass = (e.status === 'finalizado' && !e.sienge_title) ? 'pendente-titulo' : '';

      const html = `
        <div class="expense-detail">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            ${statusBadge(e.status, viewStatusTooltip, viewStatusClass)}
            <span class="detail-amount">${fmt(e.amount)}</span>
          </div>


          <div class="detail-section">
            <h4>Fluxo de Aprovação</h4>
            <div class="flow-steps">${flowHTML}</div>
          </div>


          ${(e.edited_after_approval || e.is_corrected) ? `
          <div class="detail-section" style="border-left:4px solid #eab308;background:rgba(234,179,8,0.08);padding:14px 16px;border-radius:8px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#ca8a04;font-size:14px;margin-bottom:8px;">
              <span style="font-size:18px;">⚠️</span> ${e.is_corrected ? 'Despesa corrigida' : 'Parcela editada após autorização'}
            </div>
            ${(e.edit_history && e.edit_history.length > 0) ? `
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${e.edit_history.map(h => `
                  <div style="background:var(--surface);padding:10px 12px;border-radius:6px;border:1px solid var(--border);">
                    <div style="font-size:12px;font-weight:600;color:var(--text-3);margin-bottom:4px;">
                      Alterado por <strong>${escHtml(h.user_name || 'Usuário')}</strong> em ${escHtml(h.date || '')}:
                    </div>
                    <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-1);line-height:1.4;">
                      ${(h.changes || []).map(c => `<li>${escHtml(c)}</li>`).join('')}
                    </ul>
                  </div>
                `).join('')}
              </div>
            ` : `
              <p style="font-size:13px;color:var(--text-2);margin:0;">Esta despesa foi modificada e retornou para o fluxo de aprovação.</p>
            `}
          </div>` : ''}


          ${(e.created_by_admin_name || e.approved_by_admin_name || e.rejected_by_admin_name || e.finalized_by_admin_name ) ? `
          <div class="detail-section" style="border-left:4px solid #6366f1;background:rgba(99,102,241,0.08);padding:14px 16px;border-radius:8px;margin-bottom:16px;">
            <div style="font-weight:700;color:#4338ca;font-size:14px;margin-bottom:8px;">
              Ações Realizadas no Modo "Ver Como"
            </div>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-1);line-height:1.5;">
              ${e.created_by_admin_name ? `<li><strong>Lançamento:</strong> realizado pelo administrador <strong>${escHtml(e.created_by_admin_name)}</strong></li>` : ''}
              ${e.approved_by_admin_name ? `<li><strong>Aprovação:</strong> realizada pelo administrador <strong>${escHtml(e.approved_by_admin_name)}</strong></li>` : ''}
              ${e.rejected_by_admin_name ? `<li><strong>Reprovação:</strong> realizada pelo administrador <strong>${escHtml(e.rejected_by_admin_name)}</strong></li>` : ''}
              ${e.finalized_by_admin_name ? `<li><strong>Finalização:</strong> realizada pelo administrador <strong>${escHtml(e.finalized_by_admin_name)}</strong></li>` : ''}
            </ul>
            <div style="font-size:11.5px;color:var(--text-3);margin-top:6px;">
              Registrado para fins de auditoria, transparência e controle administrativo.
            </div>
          </div>` : ''}

          <div class="detail-section">
            <h4>Dados da Despesa</h4>
            <div class="detail-row"><span class="detail-key">Descrição</span><span class="detail-value">${escHtml(e.description)}</span></div>
            <div class="detail-row"><span class="detail-key">Data</span><span class="detail-value">${fmtDate(e.expense_date)}</span></div>
            <div class="detail-row"><span class="detail-key">Categoria</span><span class="detail-value">${escHtml(e.category_name)}</span></div>
            <div class="detail-row"><span class="detail-key">Centro de Custo</span><span class="detail-value">${escHtml(e.cost_center_code)} | ${escHtml(e.cost_center_name)}</span></div>
            ${e.notes ? `<div class="detail-row"><span class="detail-key">Observações</span><span class="detail-value">${escHtml(e.notes)}</span></div>` : ''}
          </div>


          <div class="detail-section" style="border-left:3px solid var(--ml-indigo);">
            <h4 style="text-transform:uppercase;color:var(--text-3);font-size:12px;letter-spacing:0.5px;">Solicitante</h4>
            <div class="detail-row"><span class="detail-key">Nome</span><span class="detail-value">${escHtml(e.user_name)}</span></div>
            <div class="detail-row"><span class="detail-key">E-mail</span><span class="detail-value">${escHtml(e.user_email)}</span></div>
            <div class="detail-row"><span class="detail-key">Criado em</span><span class="detail-value">${fmtDateTime(e.created_at)}</span></div>
            ${(e.created_by_admin_name || e.created_by_admin_id) ? `
            <div class="detail-row" style="background:#eef2ff;padding:6px 10px;border-radius:6px;margin-top:6px;">
              <span class="detail-key" style="color:#4338ca;font-weight:700;">Lançado por (Ver como)</span>
              <span class="detail-value" style="color:#4338ca;font-weight:700;">Administrador: ${escHtml(e.created_by_admin_name || 'Administrador')}</span>
            </div>` : ''}
          </div>


          ${(e.approver_name || e.approved_at) ? `
          <div class="detail-section" style="border-left:3px solid var(--green);">
            <h4 style="text-transform:uppercase;color:var(--green);font-size:12px;letter-spacing:0.5px;">Aprovação</h4>
            <div class="detail-row"><span class="detail-key">Aprovado por</span><span class="detail-value">${escHtml(e.approver_name || 'Aprovador')}</span></div>
            <div class="detail-row"><span class="detail-key">Data</span><span class="detail-value">${fmtDateTime(e.approved_at)}</span></div>
            ${(e.approved_by_admin_name || e.approved_by_admin_id) ? `
            <div class="detail-row" style="background:#ecfdf5;padding:6px 10px;border-radius:6px;margin-top:6px;">
              <span class="detail-key" style="color:#047857;font-weight:700;">Aprovado por (Ver como)</span>
              <span class="detail-value" style="color:#047857;font-weight:700;">Administrador: ${escHtml(e.approved_by_admin_name || 'Administrador')}</span>
            </div>` : ''}
          </div>` : ''}


          ${(e.rejection_reason || e.status === 'rejeitado') ? `
          <div class="detail-section" style="border-left:3px solid var(--red);">
            <h4 style="text-transform:uppercase;color:var(--red);font-size:12px;letter-spacing:0.5px;">Reprovação</h4>
            <div class="detail-row"><span class="detail-key">Reprovado por</span><span class="detail-value">${escHtml(e.rejecter_name || 'Aprovador / Administrador')}</span></div>
            <div class="detail-row"><span class="detail-key">Motivo</span><span class="detail-value" style="color:var(--red-text);">${escHtml(e.rejection_reason || 'Sem motivo informado')}</span></div>
            <div class="detail-row"><span class="detail-key">Data</span><span class="detail-value">${fmtDateTime(e.rejected_at || e.updated_at)}</span></div>
            ${(e.rejected_by_admin_name || e.rejected_by_admin_id) ? `
            <div class="detail-row" style="background:#fef2f2;padding:6px 10px;border-radius:6px;margin-top:6px;">
              <span class="detail-key" style="color:#b91c1c;font-weight:700;">Reprovado por (Ver como)</span>
              <span class="detail-value" style="color:#b91c1c;font-weight:700;">Administrador: ${escHtml(e.rejected_by_admin_name || 'Administrador')}</span>
            </div>` : ''}
          </div>` : ''}


          ${(e.finalizer_name || e.finalized_at || ['aguardando_finalizacao','finalizado','enviado','pago'].includes(e.status)) ? `
          <div class="detail-section" style="border-left:3px solid var(--purple);">
            <h4 style="text-transform:uppercase;color:var(--purple);font-size:12px;letter-spacing:0.5px;">Finalização</h4>
            <div class="detail-row"><span class="detail-key">Finalizado por</span><span class="detail-value">${escHtml(e.finalizer_name || 'Administrador')}</span></div>
            <div class="detail-row"><span class="detail-key">Data</span><span class="detail-value">${fmtDateTime(e.finalized_at || e.updated_at)}</span></div>
            ${(e.finalized_by_admin_name || e.finalized_by_admin_id) ? `
            <div class="detail-row" style="background:#faf5ff;padding:6px 10px;border-radius:6px;margin-top:6px;">
              <span class="detail-key" style="color:#6b21a8;font-weight:700;">Finalizado por (Ver como)</span>
              <span class="detail-value" style="color:#6b21a8;font-weight:700;">Administrador: ${escHtml(e.finalized_by_admin_name || 'Administrador')}</span>
            </div>` : ''}
          </div>` : ''}


          ${(e.sienge_title || e.status === 'enviado') ? `
          <div class="detail-section" style="border-left:3px solid #dc2626;background:rgba(220,38,38,0.04);padding:14px 16px;border-radius:8px;">
            <h4 style="text-transform:uppercase;color:#dc2626;font-size:12px;letter-spacing:0.5px;">Sienge — Título de Pagamento</h4>
            <div class="detail-row"><span class="detail-key">Título Gerado</span><span class="detail-value" style="font-weight:700;color:#dc2626;">nº ${escHtml(e.sienge_title || '-')}</span></div>
            ${e.sienge_sender_name ? `<div class="detail-row"><span class="detail-key">Enviado por</span><span class="detail-value">${escHtml(e.sienge_sender_name)}</span></div>` : ''}
            ${e.sienge_sent_at ? `<div class="detail-row"><span class="detail-key">Data de Envio</span><span class="detail-value">${fmtDateTime(e.sienge_sent_at)}</span></div>` : ''}
          </div>` : ''}


          ${(e.paid_at || e.status === 'pago') ? `
          <div class="detail-section" style="border-left:3px solid #16a34a;background:rgba(22,163,74,0.04);padding:14px 16px;border-radius:8px;">
            <h4 style="text-transform:uppercase;color:#16a34a;font-size:12px;letter-spacing:0.5px;">Pagamento</h4>
            <div class="detail-row"><span class="detail-key">Data do Pagamento</span><span class="detail-value">${fmtDateTime(e.paid_at || e.updated_at)}</span></div>
          </div>` : ''}


          <div class="detail-section">
            <h4>Comprovante</h4>
            ${e.receipt_path
              ? `<button type="button" onclick="ExpensesPage.viewReceipt('${escHtml((e.receipt_path || '').replace(/\\/g, '/'))}')" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">📎 Ver comprovante</button>`
              : `<div style="display:flex;align-items:center;gap:10px;">
                   <span style="color:var(--text-4);font-size:13px;">Nenhum comprovante anexado</span>
                   <button class="btn btn-sm btn-secondary" id="upload-receipt-btn-${id}">📤 Anexar</button>
                 </div>`
            }
          </div>
        </div>
      `;


      const canCheckSienge = (e.status === 'enviado' || e.status === 'pago' || e.sienge_title);
      const footerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:10px;flex-wrap:wrap;">
          <div>
            ${canCheckSienge ? `<button type="button" class="btn btn-secondary btn-sm" id="check-sienge-btn-${id}">🔄 Consultar Situação no Sienge</button>` : ''}
          </div>
          <button class="btn btn-primary btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `;

      Modal.open(`Despesa #${String(id).padStart(6,'0')}`, html,
        footerHTML,
        { size: 'lg' }
      );

      const checkSiengeBtn = document.getElementById(`check-sienge-btn-${id}`);
      if (checkSiengeBtn) {
        checkSiengeBtn.addEventListener('click', async () => {
          checkSiengeBtn.disabled = true;
          checkSiengeBtn.innerHTML = '⏳ Consultando...';
          try {
            const res = await Api.checkSiengePayment(id);
            if (res.updated) {
              toast(res.message || 'Parcela quitada no Sienge (PG)! Despesa atualizada para Pago.', 'success');
              this.loadExpenses();
              DashboardPage.render && DashboardPage.render();
              this.viewExpense(id);
            } else {
              toast(res.message || `Situação da parcela no Sienge: ${res.situation || 'Pendente'}`, 'info');
              checkSiengeBtn.disabled = false;
              checkSiengeBtn.innerHTML = '🔄 Consultar Situação no Sienge';
            }
          } catch (err) {
            toast('Erro ao consultar Sienge: ' + err.message, 'error');
            checkSiengeBtn.disabled = false;
            checkSiengeBtn.innerHTML = '🔄 Consultar Situação no Sienge';
          }
        });
      }


      // Bind upload button if present
      const uploadBtn = document.getElementById(`upload-receipt-btn-${id}`);
      if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*,application/pdf';
          inp.onchange = async () => {
            if (!inp.files[0]) return;
            try {
              await Api.uploadReceipt(id, inp.files[0]);
              toast('Comprovante anexado!', 'success');
              Modal.close();
              this.loadExpenses();
            } catch (err) { toast(err.message, 'error'); }
          };
          inp.click();
        });
      }
    } catch (err) {
      toast('Erro ao carregar despesa: ' + err.message, 'error');
    }
  },


  async openForm(id = null, opts = {}) {
    await this._loadAux();
    await this.ensureMileageRates();

    let expense = null;
    if (id) {
      try { expense = await Api.getExpense(id); } catch(e) { toast(e.message, 'error'); return; }
    }


    const cats = this.categories || [];
    const seenCodes = new Set();
    const ccs = (this.costCenters || []).filter(c => {
      const isActive = c && c.active !== false && c.active !== 0 && c.active !== 'false' && c.active !== '0';
      if (!isActive) return false;
      const key = String(c.code || c.id).trim();
      if (seenCodes.has(key)) return false;
      seenCodes.add(key);
      return true;
    });
    this._kmMap = null;   // reset leaflet map reference
    this._kmData = null;  // reset km calculation result


    let originVal = "";
    let destVal = "";
    let roundTripVal = false;
    let kmNotesVal = "";

    if (expense && expense.notes) {
      let rawNotes = expense.notes;
      const taxIdx = rawNotes.indexOf(" · Taxa R$");
      if (taxIdx !== -1) {
        kmNotesVal = rawNotes.substring(0, taxIdx).trim();
      } else if (rawNotes.startsWith("Taxa R$")) {
        kmNotesVal = "";
      } else {
        kmNotesVal = rawNotes.trim();
      }
    }

    if (expense && expense.description && (expense.description.startsWith("Quilometragem:") || expense.description.startsWith("quilometragem:"))) {
      const desc = expense.description;
      const match = desc.match(/Quilometragem:\s*(.*?)\s*→\s*(.*?)\s*\((\d+(?:\.\d+)?)\s*km\)/i);
      if (match) {
        originVal = match[1].trim();
        destVal = match[2].trim();
      }
      if (desc.includes("Ida e Volta") || desc.includes("ida e volta")) {
        roundTripVal = true;
      }
    }


    const isFormImpersonated = Boolean(sessionStorage.getItem('ml_impersonator_token'));

    const html = `
      <div class="form-grid">
        ${isFormImpersonated ? `
        <div class="field span-2" style="background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:6px;">
          <span style="font-size:24px;">👁️</span>
          <div style="font-size:13px;color:#3730a3;line-height:1.4;">
            <strong>Modo "Ver como" ativo:</strong> Esta despesa será vinculada ao perfil de <strong>${escHtml(App.user?.name || 'Usuário')}</strong> e constará registrada com o alerta de lançamento pelo Administrador.
          </div>
        </div>` : ''}
        <div class="field span-2 required" id="ef-receipt-wrap">
          <label for="ef-receipt">Anexo do Comprovante (PDF/JPG/PNG)</label>
          <input type="file" id="ef-receipt" accept=".pdf,.png,.jpg,.jpeg" />
          <div id="ocr-loading" style="display:none;font-size:12px;color:var(--ml-indigo);margin-top:4px;">
            <span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></span>
            Lendo comprovante com IA...
          </div>
        </div>
        <div class="field span-2 required" id="ef-provider-wrap">
          <label for="ef-provider">Fornecedor</label>
          <input type="text" id="ef-provider" placeholder="Nome do local / fornecedor" value="${escHtml(expense?.provider || '')}" />
        </div>
        <div class="field required">
          <label for="ef-category">Categoria${opts.forceKm ? ' <span style="font-size:11px;color:var(--ml-pink,#e91e8c);font-weight:700;">🔒 fixado</span>' : ''}</label>
          <select id="ef-category" onchange="ExpensesPage._onCategoryChange()" ${opts.forceKm ? 'disabled style="opacity:.75;cursor:not-allowed;"' : ''}>
            <option value="">Selecione...</option>
            ${cats.map(c => `<option value="${c.id}"
              data-limit="${c.daily_limit || ''}"
              data-nf="${c.requires_nf}"
              data-maxdays="${c.max_days || ''}"
              data-name="${escHtml(c.name)}"
              ${(opts.forceKm && c.name.toLowerCase().includes('quilometragem')) ? 'selected' : (expense?.category_id === c.id ? 'selected' : '')}
            >${escHtml(c.icon)} ${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field required">
          <label for="ef-cc">Centro de Custo</label>
          <select id="ef-cc">
            <option value="">Selecione...</option>
            ${ccs.map(cc => `<option value="${cc.id}" ${String(expense?.cost_center_id) === String(cc.id) ? 'selected' : ''}>${cc.code ? escHtml(cc.code) + ' | ' : ''}${escHtml(cc.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field required">
          <label for="ef-date">Data da Despesa</label>
          <input type="date" id="ef-date" value="${expense?.expense_date || new Date().toISOString().slice(0,10)}" />
        </div>


        <!-- Campos padrão (ocultos quando Quilometragem) -->
        <div class="field required" id="ef-amount-wrap">
          <label for="ef-amount">Valor (R$)</label>
          <input type="text" id="ef-amount" placeholder="R$ 0,00" value="${expense?.amount ? expense.amount.toFixed(2).replace('.', ',') : ''}" />
        </div>
        <div class="field span-2 required" id="ef-desc-wrap">
          <label for="ef-description">Descrição</label>
          <input type="text" id="ef-description" placeholder="Descreva a despesa..." value="${escHtml(expense?.description || '')}" maxlength="500" />
        </div>
        <div class="field span-2" id="ef-notes-wrap">
          <label for="ef-notes">Observações</label>
          <textarea id="ef-notes" rows="2" placeholder="Informações adicionais...">${escHtml(expense?.notes || '')}</textarea>
        </div>
      </div>


      <!-- Bloco Quilometragem (oculto por padrão) -->
      <div id="km-block" style="display:none;margin-top:12px;">
        <div class="form-grid">
          <div class="field required span-2">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label for="km-origin" style="margin:0;">📍 Ponto Inicial</label>
              <button class="btn btn-ghost btn-sm" type="button" id="btn-locate-origin" style="padding: 2px 6px; font-size: 12px; font-weight: 600; color: var(--ml-indigo); display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 4px; background: white; cursor: pointer; transition: 0.2s;">
                📍 Localizar minha posição
              </button>
            </div>
            <div style="position:relative; width:100%;">
              <input type="text" id="km-origin"
                style="width:100%;"
                placeholder="Ex: Avenida Vital Brasil, São Paulo, SP"
                autocomplete="off"
                value="${escHtml(originVal)}" />
              <div id="km-origin-suggestions" class="autocomplete-dropdown hidden"></div>
            </div>
          </div>
          <div class="field required span-2">
            <label for="km-dest">🏁 Ponto Final</label>
            <div style="position:relative; width:100%;">
              <input type="text" id="km-dest"
                style="width:100%;"
                placeholder="Ex: Rua Emílio Trevisani, 50, Bauru, SP"
                autocomplete="off"
                value="${escHtml(destVal)}" />
              <div id="km-dest-suggestions" class="autocomplete-dropdown hidden"></div>
            </div>
          </div>
          <div class="field required span-2" style="margin-top:8px;">
            <label for="km-notes">📝 Observação da Despesa *</label>
            <textarea id="km-notes" rows="2" placeholder="Informe a observação / motivo do deslocamento..." style="width:100%;" required>${escHtml(kmNotesVal)}</textarea>
          </div>
          <div class="field span-2" style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <input type="checkbox" id="km-roundtrip" style="width:auto;margin:0;" ${roundTripVal ? 'checked' : ''} />
            <label for="km-roundtrip" style="font-weight:600;margin:0;cursor:pointer;font-size:14px;color:var(--text-2);">🔄 Trajeto de ida e volta (dobrar valor)</label>
          </div>
        </div>


        <button class="btn btn-secondary" type="button"
          id="km-calc-btn"
          style="margin-top:12px;width:100%;justify-content:center;gap:8px;">
          🗺️ Calcular Rota via OpenStreetMap
        </button>


        <p id="km-error" style="color:var(--red);font-size:13px;margin-top:6px;"></p>


        <!-- Leaflet map -->
        <div id="km-map"
          style="height:240px;margin-top:14px;border-radius:10px;overflow:hidden;
                 border:1.5px solid var(--border);display:none;">
        </div>


        <!-- Resultados calculados -->
        <div id="km-results" style="display:none;margin-top:14px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
            <div class="detail-section" style="text-align:center;padding:14px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-4);margin-bottom:4px;">Distância</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-1);" id="km-dist">—</div>
            </div>
            <div class="detail-section" style="text-align:center;padding:14px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-4);margin-bottom:4px;">Valor/km</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-1);" id="km-rate">—</div>
            </div>
            <div class="detail-section" style="text-align:center;padding:14px;background:var(--ml-light);">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ml-indigo);margin-bottom:4px;">Total</div>
              <div style="font-size:20px;font-weight:800;color:var(--ml-indigo);" id="km-total">—</div>
            </div>
          </div>
        </div>
      </div>


      <div id="nf-warning" class="nf-warning hidden">
        ⚠️ Esta categoria requer Nota Fiscal. Lembre-se de anexar o comprovante.
      </div>
      <div id="limit-warning" class="nf-warning hidden" style="background:var(--blue-bg);border-color:#BFDBFE;color:var(--blue-text);">
        ℹ️ <span id="limit-warning-text"></span>
      </div>
      <div id="ef-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;


    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
      ${!id ? `<button class="btn btn-secondary" id="save-draft-btn">💾 Salvar Rascunho</button>` : ''}
      <button class="btn btn-primary" id="save-submit-btn">${id ? '💾 Salvar' : '📤 Salvar e Submeter'}</button>
    `;


    Modal.open(id ? `Editar Despesa #${String(id).padStart(6,'0')}` : 'Nova Despesa', html, footer, { size: 'lg' });


    // Trigger category change to show warnings / km block for pre-filled
    if (expense || opts.forceKm) this._onCategoryChange();


    // Km calculate button
    document.getElementById('km-calc-btn').addEventListener('click', () => this._calcularRota());


    // Geolocation button for origin
    document.getElementById('btn-locate-origin')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Localizando...';
      

      if (!navigator.geolocation) {
        alert('Geolocalização não é suportada pelo seu navegador.');
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }
      

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
              headers: {
                'Accept-Language': 'pt-BR',
                'User-Agent': 'MouraLeiteReembolsos/1.0 (reembolsos@mouraleite.com.br)'
              }
            });
            const data = await res.json();
            if (data && data.display_name) {
              document.getElementById('km-origin').value = data.display_name;
              toast('Posição localizada com sucesso!', 'success');
            } else {
              toast('Não foi possível obter o endereço para sua posição.', 'warning');
            }
          } catch (err) {
            console.error('Erro na engenharia reversa do Nominatim:', err);
            toast('Erro ao buscar endereço da sua posição.', 'error');
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
        },
        (error) => {
          let msg = 'Erro ao obter localização.';
          if (error.code === error.PERMISSION_DENIED) msg = 'Acesso à localização negado pelo usuário.';
          else if (error.code === error.POSITION_UNAVAILABLE) msg = 'Localização indisponível.';
          else if (error.code === error.TIMEOUT) msg = 'Tempo esgotado ao obter localização.';
          toast(msg, 'error');
          btn.disabled = false;
          btn.innerHTML = originalText;
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });


    // Restore km calculation results if editing
    const sel = document.getElementById('ef-category');
    const opt = sel.options[sel.selectedIndex];
    const catName = (opt?.dataset.name || '').toLowerCase();
    const isKm = catName === 'quilometragem' || catName === 'km - viagem' || catName.includes('km') || catName.includes('quilometragem') || catName.includes('viagem');


    if (expense && isKm) {
      let rate = 1.50;
      if (expense.notes) {
        const rateMatch = expense.notes.match(/Taxa\s*R\$\s*(\d+(?:\.\d+)?)/i);
        if (rateMatch) rate = parseFloat(rateMatch[1]);
      }
      

      const distMatch = expense.description.match(/\((\d+(?:\.\d+)?)\s*km\)/);
      const totalDist = distMatch ? parseFloat(distMatch[1]) : 0;
      const baseDist = roundTripVal ? (totalDist / 2) : totalDist;
      

      this._kmData = {
        distKm: baseDist.toFixed(2),
        calcDist: totalDist.toFixed(2),
        isRoundTrip: roundTripVal,
        rate: rate,
        total: expense.amount,
        origin: originVal,
        dest: destVal
      };


      document.getElementById('km-dist').textContent  = `${totalDist.toFixed(2)} km`;
      document.getElementById('km-rate').textContent  = `R$ ${rate.toFixed(2)}`;
      document.getElementById('km-total').textContent = fmt(expense.amount);
      document.getElementById('km-results').style.display = 'block';
    }


    // Listener for change on roundtrip checkbox
    document.getElementById('km-roundtrip')?.addEventListener('change', () => {
      if (this._kmData) {
        const isRound = document.getElementById('km-roundtrip').checked;
        const baseD = parseFloat(this._kmData.distKm);
        const r = this._kmData.rate;
        const calcD = isRound ? (baseD * 2) : baseD;
        const tot = calcD * r;


        this._kmData.isRoundTrip = isRound;
        this._kmData.calcDist = calcD.toFixed(2);
        this._kmData.total = tot;


        document.getElementById('km-dist').textContent  = `${calcD.toFixed(2)} km`;
        document.getElementById('km-total').textContent = fmt(tot);
      }
    });

    // Activate address autocomplete for origin and destination
    this._setupKmAddressAutocomplete('km-origin', 'km-origin-suggestions');
    this._setupKmAddressAutocomplete('km-dest', 'km-dest-suggestions');


    // Draft save
    if (!id) {
      document.getElementById('save-draft-btn').addEventListener('click', () => this._saveExpense(null, false));
    }
    document.getElementById('save-submit-btn').addEventListener('click', () => this._saveExpense(id, true));


    // Mascara de valor em ef-amount e validação em tempo real
    const amtInput = document.getElementById('ef-amount');
    if (amtInput) {
      amtInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val === '') { 
          e.target.value = ''; 
          this._checkAmountLimit();
          return; 
        }
        val = (parseInt(val, 10) / 100).toFixed(2);
        e.target.value = 'R$ ' + val.replace('.', ',');
        this._checkAmountLimit();
      });
    }


    // OCR change event
    const receiptInput = document.getElementById('ef-receipt');
    if (receiptInput) {
      receiptInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        const loader = document.getElementById('ocr-loading');
        if (loader) loader.style.display = 'block';
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/expenses/ocr', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + Api.getToken() },
            body: formData
          });
          if (res.ok) {
            const data = await res.json();
            let countExtracted = 0;
            if (data.provider) {
              document.getElementById('ef-provider').value = data.provider;
              if (data.provider !== 'Estabelecimento Comercial') countExtracted++;
            }
            if (data.date) {
              document.getElementById('ef-date').value = data.date;
              countExtracted++;
            }
            if (data.amount && data.amount > 0) {
              const strVal = data.amount.toFixed(2).replace('.', ',');
              document.getElementById('ef-amount').value = 'R$ ' + strVal;
              countExtracted++;
            }
            if (data.category_suggestion) {
              const sel = document.getElementById('ef-category');
              for (let i=0; i<sel.options.length; i++) {
                if (sel.options[i].text.toLowerCase().includes(data.category_suggestion.toLowerCase())) {
                  sel.selectedIndex = i;
                  break;
                }
              }
            }
            this._onCategoryChange();
            this._checkAmountLimit();

            if (typeof toast === 'function') {
              let missingFields = [];
              if (!data.provider || data.provider === 'Estabelecimento Comercial') missingFields.push("fornecedor");
              if (!data.date) missingFields.push("data de emissão");
              if (!data.amount || data.amount <= 0) missingFields.push("valor total");

              if (missingFields.length > 0) {
                let missingStr = missingFields.join(", ");
                toast(`Não foi possível identificar os dados do documento enviado (${missingStr}), favor inserir manualmente.`, 'warning');
              } else {
                toast('Dados do comprovante lidos com sucesso!', 'success');
              }
            }
          }
        } catch (err) {
          console.warn('Erro ao processar OCR:', err);
        } finally {
          if (loader) loader.style.display = 'none';
        }
      });
    }
  },


  _checkAmountLimit() {
    const sel = document.getElementById('ef-category');
    if (!sel) return { exceeded: false, limit: null, amount: 0 };
    const opt = sel.options[sel.selectedIndex];
    const catName = (opt?.dataset.name || '').toLowerCase();
    const isKm = catName === 'quilometragem' || catName === 'km - viagem' || catName.includes('km') || catName.includes('quilometragem') || catName.includes('viagem');
    
    const limitWarn = document.getElementById('limit-warning');
    const limitText = document.getElementById('limit-warning-text');
    const amtInput = document.getElementById('ef-amount');
    
    if (isKm) {
      return { exceeded: false, limit: null, amount: 0, isKm: true };
    }

    const limitStr = opt?.dataset.limit;
    const limit = (limitStr && !isNaN(parseFloat(limitStr)) && parseFloat(limitStr) > 0) ? parseFloat(limitStr) : null;
    const amtRaw = amtInput?.value || '';
    const amount = parseFloat(amtRaw.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;

    if (!limit) {
      // Categoria sem limite de valor
      if (amtInput) {
        amtInput.style.borderColor = '';
        amtInput.style.backgroundColor = '';
      }
      const maxDays = opt?.dataset.maxdays;
      if (limitWarn && limitText) {
        if (maxDays) {
          limitText.textContent = `Máximo de ${maxDays} dias para esta categoria.`;
          limitWarn.style.background = 'var(--blue-bg)';
          limitWarn.style.borderColor = '#BFDBFE';
          limitWarn.style.color = 'var(--blue-text)';
          limitWarn.classList.remove('hidden');
        } else {
          limitWarn.classList.add('hidden');
        }
      }
      return { exceeded: false, limit: null, amount, isKm: false };
    }

    // Categoria com limite diário configurado
    if (amount > limit) {
      if (amtInput) {
        amtInput.style.borderColor = 'var(--red, #EF4444)';
        amtInput.style.backgroundColor = '#FEF2F2';
      }
      if (limitWarn && limitText) {
        limitText.innerHTML = `⚠️ <strong>Atenção:</strong> O valor digitado (<strong>${fmt(amount)}</strong>) <strong>excede o limite permitido de ${fmt(limit)}</strong> para esta categoria. Corrija o valor para conseguir salvar.`;
        limitWarn.style.background = '#FEF2F2';
        limitWarn.style.borderColor = '#FECACA';
        limitWarn.style.color = '#991B1B';
        limitWarn.classList.remove('hidden');
      }
      return { exceeded: true, limit, amount, isKm: false, catName: opt?.dataset.name || '' };
    } else {
      if (amtInput) {
        amtInput.style.borderColor = '';
        amtInput.style.backgroundColor = '';
      }
      if (limitWarn && limitText) {
        limitText.textContent = `Limite diário para esta categoria: ${fmt(limit)}`;
        limitWarn.style.background = 'var(--blue-bg)';
        limitWarn.style.borderColor = '#BFDBFE';
        limitWarn.style.color = 'var(--blue-text)';
        limitWarn.classList.remove('hidden');
      }
      return { exceeded: false, limit, amount, isKm: false, catName: opt?.dataset.name || '' };
    }
  },


  async _onCategoryChange() {
    const sel = document.getElementById('ef-category');
    const opt = sel.options[sel.selectedIndex];
    const nf      = opt?.dataset.nf === 'true';
    const catName = (opt?.dataset.name || '').toLowerCase();
    const isKm    = catName === 'quilometragem' || catName === 'km - viagem' || catName.includes('km') || catName.includes('quilometragem') || catName.includes('viagem');


    // Toggle KM block vs standard fields
    const kmBlock   = document.getElementById('km-block');
    const amtWrap   = document.getElementById('ef-amount-wrap');
    const descWrap  = document.getElementById('ef-desc-wrap');
    const notesWrap = document.getElementById('ef-notes-wrap');
    const receiptWrap = document.getElementById('ef-receipt-wrap');
    const providerWrap = document.getElementById('ef-provider-wrap');


    if (isKm) {
      kmBlock.style.display   = 'block';
      amtWrap.style.display   = 'none';
      descWrap.style.display  = 'none';
      notesWrap.style.display = 'none';
      if(receiptWrap) receiptWrap.style.display = 'none';
      if(providerWrap) providerWrap.style.display = 'none';
      // Make standard fields not required for km
      document.getElementById('ef-amount').removeAttribute('required');
      document.getElementById('ef-description').removeAttribute('required');
      document.getElementById('ef-provider')?.removeAttribute('required');
      document.getElementById('ef-receipt')?.removeAttribute('required');
    } else {
      kmBlock.style.display   = 'none';
      amtWrap.style.display   = '';
      descWrap.style.display  = '';
      notesWrap.style.display = '';
      if(receiptWrap) receiptWrap.style.display = '';
      if(providerWrap) providerWrap.style.display = '';
      
      // Restore standard required attributes
      document.getElementById('ef-amount').setAttribute('required', 'required');
      document.getElementById('ef-description').setAttribute('required', 'required');
      document.getElementById('ef-provider')?.setAttribute('required', 'required');
      if (nf) {
        document.getElementById('ef-receipt')?.setAttribute('required', 'required');
      } else {
        document.getElementById('ef-receipt')?.removeAttribute('required');
      }
      this._kmData = null;
    }


    document.getElementById('nf-warning').classList.toggle('hidden', !nf || isKm);


    const limitWarn = document.getElementById('limit-warning');
    const limitText = document.getElementById('limit-warning-text');
    if (isKm) {
      await this.ensureMileageRates();
      const rateInfo = this.getMileageRateForUser(App.user);
      const rate = rateInfo.rate;
      const formattedRate = rate.toFixed(2).replace('.', ',');

      limitText.textContent = `Taxa: R$ ${formattedRate}/km · calculado automaticamente pelo mapa (${rateInfo.name})`;
      limitWarn.style.background = 'var(--blue-bg)';
      limitWarn.style.borderColor = '#BFDBFE';
      limitWarn.style.color = 'var(--blue-text)';
      limitWarn.classList.remove('hidden');
    } else {
      this._checkAmountLimit();
    }
  },


  generateRouteImage(origin, dest, distance) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    

    const grad = ctx.createLinearGradient(0, 0, 600, 400);
    grad.addColorStop(0, '#4F46E5');
    grad.addColorStop(1, '#06B6D4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 400);
    

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(40, 40, 520, 320);
    

    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#1e1b4b';
    ctx.fillText('🚗 Comprovante de Km - Viagem', 60, 85);
    

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Ponto Inicial:', 60, 135);
    

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#0f172a';
    const originWords = origin.split(', ');
    let originLine1 = originWords.slice(0, 3).join(', ');
    let originLine2 = originWords.slice(3).join(', ');
    ctx.fillText(originLine1, 60, 155);
    if (originLine2) ctx.fillText(originLine2, 60, 175);
    

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Ponto Final:', 60, 220);
    

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#0f172a';
    const destWords = dest.split(', ');
    let destLine1 = destWords.slice(0, 3).join(', ');
    let destLine2 = destWords.slice(3).join(', ');
    ctx.fillText(destLine1, 60, 240);
    if (destLine2) ctx.fillText(destLine2, 60, 260);
    

    ctx.fillStyle = '#e0e7ff';
    ctx.fillRect(60, 290, 200, 45);
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${distance} km`, 80, 318);
    

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(360, 290, 180, 45);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('ROTA VERIFICADA', 385, 318);
    

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  },


  /* ── Mileage / Route Calculation ─────────────────────────────────────── */

  _setupKmAddressAutocomplete(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let timeoutId = null;

    input.addEventListener('input', (e) => {
      clearTimeout(timeoutId);
      const query = e.target.value.trim();

      if (query.length < 3) {
        dropdown.innerHTML = '';
        dropdown.classList.add('hidden');
        return;
      }

      timeoutId = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=10&addressdetails=1`;
          const res = await fetch(url, {
            headers: {
              'Accept-Language': 'pt-BR',
              'User-Agent': 'MouraLeiteReembolsos/1.0 (reembolsos@mouraleite.com.br)'
            }
          });
          const items = await res.json();

          if (!items || items.length === 0) {
            dropdown.innerHTML = `<div class="autocomplete-item" style="cursor:default;color:var(--text-4);"><span class="autocomplete-item-title">Nenhum endereço encontrado</span></div>`;
            dropdown.classList.remove('hidden');
            return;
          }

          dropdown.innerHTML = items.map(item => {
            const addr = item.address || {};
            const mainName = addr.road || addr.pedestrian || addr.highway || addr.amenity || item.display_name.split(',')[0];
            
            const neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const city = addr.city || addr.town || addr.municipality || addr.village || '';
            const state = addr.state || '';

            const parts = [];
            if (neighborhood) parts.push(neighborhood);
            if (city) parts.push(city);
            if (state) parts.push(state.length > 2 ? state : state.toUpperCase());

            const subText = parts.join(' • ') || item.display_name;

            let cleanAddress = item.display_name
              .replace(/, Região [^,]+/g, '')
              .replace(/, Brasil/g, '')
              .replace(/, [0-9]{5}-[0-9]{3}/g, '');

            return `
              <div class="autocomplete-item" data-address="${escHtml(cleanAddress)}">
                <span class="autocomplete-item-title">📍 ${escHtml(mainName)}</span>
                <span class="autocomplete-item-sub">${escHtml(subText)}</span>
              </div>`;
          }).join('');

          dropdown.classList.remove('hidden');

          dropdown.querySelectorAll('.autocomplete-item[data-address]').forEach(el => {
            el.addEventListener('click', (ev) => {
              ev.stopPropagation();
              input.value = el.dataset.address;
              dropdown.classList.add('hidden');
              dropdown.innerHTML = '';

              const originVal = document.getElementById('km-origin')?.value.trim();
              const destVal = document.getElementById('km-dest')?.value.trim();
              if (originVal && destVal && originVal.toLowerCase() !== destVal.toLowerCase()) {
                ExpensesPage._calcularRota();
              }
            });
          });

        } catch (err) {
          console.warn('Erro na busca de endereços:', err);
        }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
      }
    });
  },


  async _calcularRota() {
    const origin  = document.getElementById('km-origin').value.trim();
    const dest    = document.getElementById('km-dest').value.trim();
    const errEl   = document.getElementById('km-error');
    const calcBtn = document.getElementById('km-calc-btn');
    errEl.textContent = '';


    if (!origin || !dest) {
      errEl.textContent = 'Preencha Ponto Inicial e Final.';
      return;
    }
    if (origin.toLowerCase() === dest.toLowerCase()) {
      errEl.textContent = 'Ponto Inicial e Final não podem ser iguais.';
      return;
    }


    calcBtn.disabled    = true;
    calcBtn.textContent = '⏳ Calculando...';


    try {
      // Geocode both endpoints via Nominatim
      const [geoA, geoB] = await Promise.all([
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(origin)}&limit=1`, {
          headers: {
            'Accept-Language': 'pt-BR',
            'User-Agent': 'MouraLeiteReembolsos/1.0 (reembolsos@mouraleite.com.br)'
          }
        }).then(r => r.json()),
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(dest)}&limit=1`, {
          headers: {
            'Accept-Language': 'pt-BR',
            'User-Agent': 'MouraLeiteReembolsos/1.0 (reembolsos@mouraleite.com.br)'
          }
        }).then(r => r.json()),
      ]);


      if (!geoA.length) { errEl.textContent = `Endereço não encontrado: "${origin}"`; return; }
      if (!geoB.length) { errEl.textContent = `Endereço não encontrado: "${dest}"`; return; }


      const latA = parseFloat(geoA[0].lat), lonA = parseFloat(geoA[0].lon);
      const latB = parseFloat(geoB[0].lat), lonB = parseFloat(geoB[0].lon);


      // Route via OSRM (free, no key needed)
      const routeRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=full&geometries=geojson`
      ).then(r => r.json());


      if (!routeRes.routes?.length) { errEl.textContent = 'Não foi possível calcular a rota.'; return; }


      const distM  = routeRes.routes[0].distance;          // metres
      const distKm = distM / 1000;


      if (distKm < 1) { errEl.textContent = 'Distância mínima: 1 km.'; return; }


      // Read rate from mileage_rates depending on user's job function
      await this.ensureMileageRates();
      const rateInfo = this.getMileageRateForUser(App.user);
      const rate = rateInfo.rate;


      const isRoundTrip = document.getElementById('km-roundtrip')?.checked;
      const calcDist = isRoundTrip ? (distKm * 2) : distKm;
      const total = calcDist * rate;


      this._kmData = { 
        distKm: distKm.toFixed(2), 
        calcDist: calcDist.toFixed(2), 
        isRoundTrip, 
        rate, 
        rateName: rateInfo.name,
        total, 
        origin, 
        dest 
      };


      // Update result chips
      document.getElementById('km-dist').textContent  = `${calcDist.toFixed(2)} km`;
      document.getElementById('km-rate').textContent  = `R$ ${rate.toFixed(2).replace('.', ',')}`;
      document.getElementById('km-total').textContent = fmt(total);
      document.getElementById('km-results').style.display = 'block';


      // Render / update Leaflet map
      const mapEl = document.getElementById('km-map');
      mapEl.style.display = 'block';


      if (this._kmMap) {
        this._kmMap.remove();
        this._kmMap = null;
      }


      // Small delay so the DOM becomes visible before Leaflet measures
      await new Promise(r => setTimeout(r, 80));


      const lmap = L.map('km-map');
      this._kmMap = lmap;


      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(lmap);


      // Draw GeoJSON route polyline
      const geojson = routeRes.routes[0].geometry;
      const poly    = L.geoJSON(geojson, {
        style: { color: '#4F46E5', weight: 4, opacity: 0.85 },
      }).addTo(lmap);


      // Custom markers
      const pinIcon = (label, color) => L.divIcon({
        html: `<div style="background:${color};color:white;font-weight:700;font-size:11px;
                             padding:4px 8px;border-radius:20px;white-space:nowrap;
                             box-shadow:0 2px 8px rgba(0,0,0,.25);">${label}</div>`,
        className: '',
        iconAnchor: [0, 12],
      });


      L.marker([latA, lonA], { icon: pinIcon('Início', '#10B981') }).addTo(lmap)
        .bindPopup(`<b>Início</b><br>${escHtml(origin)}`);
      L.marker([latB, lonB], { icon: pinIcon('Fim', '#EF4444') }).addTo(lmap)
        .bindPopup(`<b>Fim</b><br>${escHtml(dest)}`);


      lmap.fitBounds(poly.getBounds(), { padding: [24, 24] });


      toast(`Rota calculada: ${distKm.toFixed(1)} km • ${fmt(total)}`, 'success');
    } catch (err) {
      errEl.textContent = 'Erro ao calcular rota: ' + err.message;
    } finally {
      calcBtn.disabled    = false;
      calcBtn.textContent = '🗺️ Calcular Rota via OpenStreetMap';
    }
  },


  async _saveExpense(id, submit) {
    const errEl = document.getElementById('ef-error');
    errEl.classList.add('hidden');


    const sel     = document.getElementById('ef-category');
    const opt     = sel.options[sel.selectedIndex];
    const catName = (opt?.dataset.name || '').toLowerCase();
    const isKm    = catName === 'quilometragem' || catName === 'km - viagem' || catName.includes('km') || catName.includes('quilometragem') || catName.includes('viagem');


    const catId = parseInt(document.getElementById('ef-category').value);
    const ccId  = parseInt(document.getElementById('ef-cc').value);
    const date  = document.getElementById('ef-date').value;


    let amount, description, notes, provider;


    if (isKm) {
      // Quilometragem: values come from route calculation
      if (!this._kmData) {
        errEl.textContent = 'Calcule a rota antes de salvar.';
        errEl.classList.remove('hidden');
        return;
      }
      const kmNotes = document.getElementById('km-notes')?.value.trim();
      if (!kmNotes) {
        errEl.textContent = 'Preencha a observação da despesa.';
        errEl.classList.remove('hidden');
        document.getElementById('km-notes')?.focus();
        return;
      }
      amount      = parseFloat(this._kmData.total.toFixed(2));
      const roundTripText = this._kmData.isRoundTrip ? " (Ida e Volta)" : "";
      description = `Quilometragem: ${this._kmData.origin} → ${this._kmData.dest} (${this._kmData.calcDist} km)${roundTripText}`;
      const rateLabel = this._kmData.rateName ? ` (${this._kmData.rateName})` : '';
      notes       = `${kmNotes} · Taxa R$ ${this._kmData.rate.toFixed(2).replace('.', ',')}/km${rateLabel} · Total ${this._kmData.calcDist} km`;
    } else {
      let amtStr  = document.getElementById('ef-amount').value || '';
      amount      = parseFloat(amtStr.replace('R$ ', '').replace(/\\./g, '').replace(',', '.'));
      description = document.getElementById('ef-description').value.trim();
      notes       = document.getElementById('ef-notes').value.trim();
      provider    = document.getElementById('ef-provider')?.value.trim();
    }


    // Validate common fields
    if (!catId || !ccId || !date) {
      errEl.textContent = 'Preencha todos os campos obrigatórios.';
      errEl.classList.remove('hidden');
      return;
    }
    if (!isKm && (!amount || !description)) {
      errEl.textContent = 'Preencha todos os campos obrigatórios.';
      errEl.classList.remove('hidden');
      return;
    }
    if (!isKm && amount <= 0) {
      errEl.textContent = 'O valor deve ser maior que zero.';
      errEl.classList.remove('hidden');
      return;
    }


    // Business rule: check daily limit (skip for km — limit stores rate, not ceiling; skip if no limit)
    if (!isKm) {
      const limitStr = opt?.dataset.limit;
      const limit = (limitStr && !isNaN(parseFloat(limitStr)) && parseFloat(limitStr) > 0) ? parseFloat(limitStr) : null;
      if (limit && amount > limit) {
        errEl.textContent = `O valor de ${fmt(amount)} excede o limite máximo permitido de ${fmt(limit)} para a categoria "${opt?.dataset.name || 'selecionada'}". Corrija o valor para continuar.`;
        errEl.classList.remove('hidden');
        this._checkAmountLimit();
        document.getElementById('ef-amount')?.focus();
        if (typeof toast === 'function') {
          toast(`Valor excede o limite permitido de ${fmt(limit)}. Ajuste o valor antes de salvar.`, 'error');
        }
        return; // BLOQUEIA O SALVAMENTO!
      }
    }


    const body = { category_id: catId, cost_center_id: ccId, expense_date: date, amount, description, notes: notes || null, provider: provider || null };


    const saveBtn = document.getElementById('save-submit-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';


    try {
      let expense;
      if (id) {
        expense = await Api.updateExpense(id, body);
        if (isKm) {
          try {
            const blob = await this.generateRouteImage(this._kmData.origin, this._kmData.dest, this._kmData.calcDist);
            if (blob) {
              const fileName = `mapa_viagem_${expense.id}.png`;
              expense.receipt_path = fileName;
              _saveDb();
              const formData = new FormData();
              formData.append('file', blob, fileName);
              await fetch(`/api/expenses/${expense.id}/upload`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + Api.getToken() },
                body: formData
              });
            }
          } catch(e) {
            console.warn('Erro ao atualizar comprovante de rota:', e);
          }
        }
        if (expense && (expense.reverted_to_approval || expense.status === 'aguardando_aprovacao')) {
          toast('Despesa atualizada! Como estava aprovada, voltou para aprovação.', 'success');
        } else {
          toast('Despesa atualizada!', 'success');
        }
      } else {
        expense = await Api.createExpense(body);
        

        if (isKm) {
          try {
            const blob = await this.generateRouteImage(this._kmData.origin, this._kmData.dest, this._kmData.calcDist);
            if (blob) {
              const fileName = `mapa_viagem_${expense.id}.png`;
              expense.receipt_path = fileName;
              _saveDb();
              const formData = new FormData();
              formData.append('file', blob, fileName);
              await fetch(`/api/expenses/${expense.id}/upload`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + Api.getToken() },
                body: formData
              });
            }
          } catch(e) {
            console.warn('Erro ao gerar comprovante de rota:', e);
          }
        } else {
          const receiptFile = document.getElementById('ef-receipt')?.files?.[0];
          if (receiptFile) {
            expense.receipt_path = receiptFile.name; 
            _saveDb();
            const formData = new FormData();
            formData.append('file', receiptFile);
            try {
              await fetch(`/api/expenses/${expense.id}/upload`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + Api.getToken() },
                body: formData
              });
            } catch(e) {
              console.warn('Erro ao subir anexo:', e);
            }
          }
        }


        if (submit) {
          await Api.submitExpense(expense.id);
          toast('Despesa criada e enviada para aprovação!', 'success');
        } else {
          toast('Rascunho salvo!', 'success');
        }
      }
      Modal.close();
      this.loadExpenses();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = id ? '💾 Salvar' : '📤 Salvar e Submeter';
    }
  },


  exportSelected() {
    const checkedBoxes = [...document.querySelectorAll('.exp-checkbox:checked')];
    if (checkedBoxes.length === 0) {
      toast('Selecione ao menos uma despesa para exportar', 'warning');
      return;
    }
    const checked = checkedBoxes.map(cb => parseInt(cb.value));
    const allSelectedExps = checked.map(id => (this.loadedExpenses || []).find(e => e.id === id)).filter(Boolean);

    // Permitir para exportação despesas com status aprovado ou finalizado
    const exportableExps = allSelectedExps.filter(e => e.status === 'aprovado' || e.status === 'finalizado');
    if (exportableExps.length === 0) {
      toast('Apenas despesas com status APROVADO ou FINALIZADO podem ser selecionadas para exportação.', 'warning');
      return;
    }

    const exportableIds = exportableExps.map(e => e.id);
    sessionStorage.setItem('ml_export_ids', JSON.stringify(exportableIds));
    sessionStorage.setItem('ml_export_expenses', JSON.stringify(exportableExps));
    navigate('exports');
  },

  bulkSendSienge() {
    const checked = [...document.querySelectorAll('.exp-checkbox:checked')].map(cb => parseInt(cb.value));
    if (checked.length === 0) {
      toast('Selecione ao menos uma despesa para enviar ao Sienge', 'warning');
      return;
    }
    
    const selectedExps = checked.map(id => (this.loadedExpenses || []).find(e => e.id === id)).filter(Boolean);
    const invalid = selectedExps.some(e => e.status !== 'finalizado');
    
    if (invalid) {
      toast('Todas as despesas selecionadas devem estar com o status FINALIZADO para criar o título.', 'warning');
      return;
    }

    const distinctUsers = new Set(selectedExps.map(e => e.user_id));
    const userCount = distinctUsers.size;
    const confirmMsg = userCount > 1
      ? `Você selecionou ${checked.length} despesa(s) de ${userCount} colaboradores diferentes. Serão gerados ${userCount} títulos no Sienge (um para cada colaborador). Deseja continuar?`
      : `Deseja gerar o título de reembolso no Sienge para as ${checked.length} despesa(s) selecionada(s)?`;

    Modal.confirm('Gerar Título no Sienge', confirmMsg, async () => {
      toast('Conectando à API do Sienge para gerar título(s)...', 'info', 6000);
      try {
        const res = await Api.bulkSendExpensesToSienge(checked);
        if (res.titles && res.titles.length > 1) {
          const listHtml = res.titles.map(t => `
            <li style="margin-bottom:6px;">
              <strong>${escHtml(t.user_name)}:</strong> Título Nº <strong>${t.bill_id}</strong> (${t.document_number}) — ${fmt(t.total_amount)}${t.due_date_formatted ? ` <span style="color:var(--text-2);font-size:12px;">(Venc: ${t.due_date_formatted})</span>` : ''}
              ${t.pdf_uploaded ? '<span style="color:var(--green);font-size:12px;margin-left:4px;">(PDF anexado)</span>' : '<span style="color:var(--amber);font-size:12px;margin-left:4px;">(PDF pendente)</span>'}
            </li>
          `).join('');

          Modal.alert('Títulos Gerados no Sienge', `
            <div style="font-size:13.5px;color:var(--text-1);">
              <p style="margin-bottom:12px;">Foram gerados com sucesso <strong>${res.titles.length} títulos</strong> no Sienge:</p>
              <ul style="padding-left:18px;margin-bottom:12px;line-height:1.5;">${listHtml}</ul>
            </div>
          `);
        } else {
          toast(res.message || 'Título gerado com sucesso!', 'success', 5000);
        }

        this.loadExpenses();
        if (window.DashboardPage && typeof DashboardPage.render === 'function') {
          DashboardPage.render();
        }
      } catch (err) {
        toast(err.message || 'Erro ao gerar título no Sienge', 'error', 6000);
      }
    });
  },


  viewReceipt(path) {
    if (!path) {
      toast('Comprovante não disponível.', 'warning');
      return;
    }
    let cleanPath = String(path).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanPath.startsWith('uploads/')) {
      cleanPath = 'uploads/' + cleanPath;
    }
    const url = '/' + cleanPath;
    window.open(url, '_blank');
  },
};


function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

window.ExpensesPage = ExpensesPage;
