/**
 * exports.js — Módulo de Exportações
 */
const ExportsPage = {
  _allExports: [],
  _currentScope: localStorage.getItem('active_scope') || 'personal',

  switchScope(scope) {
    this._currentScope = scope;
    localStorage.setItem('active_scope', scope);
    const tabPers = document.getElementById('export-scope-personal');
    const tabTeam = document.getElementById('export-scope-team');
    if (tabPers && tabTeam) {
      tabPers.classList.toggle('active', scope === 'personal');
      tabTeam.classList.toggle('active', scope !== 'personal');
    }
    this.loadExports();
  },

  async render() {
    const isApproverOrAdmin = ['admin', 'financeiro', 'aprovador'].includes(App.user?.role);
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const teamScopeName = App.user?.role === 'aprovador' ? 'team' : 'financial';
    const teamScopeLabel = App.user?.role === 'aprovador' ? 'Time' : 'Financeiro';
    
    const savedScope = localStorage.getItem('active_scope') || 'personal';
    this._currentScope = isApproverOrAdmin ? savedScope : 'personal';

    const colSpan = isAdminOrFinance ? 7 : 5;

    const el = document.getElementById('page-exports');
    el.innerHTML = `
      ${isApproverOrAdmin ? `
      <div style="display:flex;justify-content:center;margin-bottom:20px;">
        <div class="tabs" id="export-scope-tabs" style="margin:0;">
          <div class="tab ${this._currentScope === 'personal' ? 'active' : ''}" id="export-scope-personal" onclick="ExportsPage.switchScope('personal')">Pessoal</div>
          <div class="tab ${this._currentScope !== 'personal' ? 'active' : ''}" id="export-scope-team" onclick="ExportsPage.switchScope('${teamScopeName}')">${teamScopeLabel}</div>
        </div>
      </div>` : ''}

      <div class="page-header">
        <div>
          <h1 class="page-title">Exportações</h1>
          <p class="page-subtitle">Relatórios gerados em PDF</p>
        </div>
        ${isAdminOrFinance ? `
        <div class="exports-header-actions">
          <button class="btn btn-primary" id="btn-new-export">⬇ Executar Relatório</button>
        </div>` : ''}
      </div>

      <div id="exports-content">
        <div class="table-wrapper">
          <div class="filters-bar" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div class="search-wrapper" style="flex:1;min-width:200px;">
              <span class="search-icon">🔍</span>
              <input type="text" class="search-input" id="export-search" placeholder="Buscar relatório..." />
            </div>
            ${isAdminOrFinance ? `
            <button class="btn btn-sm btn-primary" id="btn-bulk-email-export" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:7px 14px;font-size:13px;border-radius:8px;background:var(--ml-indigo);border-color:var(--ml-indigo);color:white;cursor:pointer;">
              📧 Enviar e-mail em massa
            </button>` : ''}
            <select class="filter-select" id="select-report-filter" style="min-width:240px;">
              <option value="">Todos os relatórios...</option>
            </select>
            <select class="filter-select" id="select-email-status-filter" style="min-width:180px;">
              <option value="">Todos os status...</option>
              <option value="a_enviar">A enviar</option>
              <option value="enviados">Já enviados</option>
            </select>
            <button class="btn btn-sm btn-ghost" id="clear-export-filter-btn">✕ Limpar</button>
          </div>
          <div class="table-header">
            <span class="table-count" id="exports-count">Carregando...</span>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  ${isAdminOrFinance ? `<th><input type="checkbox" id="select-all-exp-exp" /></th>` : ''}
                  <th>Nome do Relatório</th>
                  <th>Gerado Por</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Baixar PDF</th>
                  ${isAdminOrFinance ? `<th>Ações</th>` : ''}
                </tr>
              </thead>
              <tbody id="exports-tbody">
                <tr class="loading-row"><td colspan="${colSpan}">
                  <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:30px;">
                    <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);"></div> Carregando...
                  </div>
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Events
    document.getElementById('btn-new-export')?.addEventListener('click', () => this.openExportModal());
    document.getElementById('btn-bulk-email-export')?.addEventListener('click', () => this.bulkSendEmails());
    document.getElementById('select-report-filter')?.addEventListener('change', () => this._filterAndRenderExports());
    document.getElementById('select-email-status-filter')?.addEventListener('change', () => this._filterAndRenderExports());
    document.getElementById('export-search')?.addEventListener('input', () => this._filterAndRenderExports());
    document.getElementById('clear-export-filter-btn')?.addEventListener('click', () => {
      const sel = document.getElementById('select-report-filter');
      const emailSel = document.getElementById('select-email-status-filter');
      const search = document.getElementById('export-search');
      if (sel) sel.value = '';
      if (emailSel) emailSel.value = '';
      if (search) search.value = '';
      this._filterAndRenderExports();
    });

    document.getElementById('select-all-exp-exp')?.addEventListener('change', (e) => {
      document.querySelectorAll('#exports-tbody input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
    });

    // Check if came from expense selection
    const savedIds = sessionStorage.getItem('ml_export_ids');
    const savedExps = sessionStorage.getItem('ml_export_expenses');
    if (savedIds && isAdminOrFinance) {
      sessionStorage.removeItem('ml_export_ids');
      sessionStorage.removeItem('ml_export_expenses');
      const parsedIds = JSON.parse(savedIds);
      const parsedExps = savedExps ? JSON.parse(savedExps) : null;
      setTimeout(() => this.openExportModal(parsedIds, parsedExps), 300);
    }

    await this.loadExports();
  },

  async loadExports() {
    const isApproverOrAdmin = ['admin', 'financeiro', 'aprovador'].includes(App.user?.role);
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const scope = isApproverOrAdmin ? (this._currentScope || localStorage.getItem('active_scope') || 'personal') : 'personal';
    const colSpan = isAdminOrFinance ? 7 : 5;
    const tbody = document.getElementById('exports-tbody');
    if (!tbody) return;
    try {
      const data = await Api.getExports({ scope: scope });
      this._allExports = data.items || [];

      // Populate report selector dropdown
      const sel = document.getElementById('select-report-filter');
      if (sel) {
        const curVal = sel.value;
        sel.innerHTML = '<option value="">Todos os relatórios...</option>';
        this._allExports.forEach(ex => {
          const dateStr = fmtDate(ex.created_at);
          sel.innerHTML += `<option value="${ex.id}">${escHtml(ex.name)} (${dateStr})</option>`;
        });
        if (curVal) sel.value = curVal;
      }

      this._filterAndRenderExports();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state">
        <span class="empty-icon">⚠️</span><p>Erro: ${escHtml(err.message)}</p>
      </div></td></tr>`;
    }
  },

  _filterAndRenderExports() {
    const isAdminOrFinance = App.user?.role === 'admin' || App.user?.role === 'financeiro';
    const colSpan = isAdminOrFinance ? 7 : 5;
    const tbody = document.getElementById('exports-tbody');
    if (!tbody) return;

    let items = this._allExports || [];
    const selectedId = document.getElementById('select-report-filter')?.value;
    const emailStatus = document.getElementById('select-email-status-filter')?.value;
    const search = document.getElementById('export-search')?.value.toLowerCase();

    if (selectedId) {
      items = items.filter(ex => String(ex.id) === String(selectedId));
    }
    if (emailStatus === 'a_enviar') {
      items = items.filter(ex => !ex.email_sent);
    } else if (emailStatus === 'enviados') {
      items = items.filter(ex => Boolean(ex.email_sent));
    }
    if (search) {
      items = items.filter(ex =>
        ex.name?.toLowerCase().includes(search) ||
        ex.creator_name?.toLowerCase().includes(search) ||
        ex.export_type?.toLowerCase().includes(search)
      );
    }

    document.getElementById('exports-count').innerHTML = `<strong>${items.length}</strong> relatório(s)`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state">
        <span class="empty-icon">📄</span><p>Nenhum relatório gerado</p>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(ex => `
      <tr>
        ${isAdminOrFinance ? `<td><input type="checkbox" value="${ex.id}" /></td>` : ''}
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:20px;">📄</span>
            <div>
              <div style="font-weight:600;font-size:13px;color:var(--text-1);">${escHtml(ex.name)}</div>
              <div style="font-size:11px;color:var(--text-4);">Formato PDF</div>
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--ml-indigo),var(--ml-lilac));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;">${initials(ex.creator_name)}</div>
            <span style="font-size:13px;">${escHtml(ex.creator_name)}</span>
          </div>
        </td>
        <td>
          <div>
            <div style="font-weight:600;font-size:13px;">${escHtml(ex.export_type || 'Padrão')}</div>
          </div>
        </td>
        <td style="font-size:13px;color:var(--text-3);">${fmtDate(ex.created_at)}</td>
        <td>
          <a href="${Api.exportDownloadUrl(ex.id)}" target="_blank" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:4px;">
            📄 Baixar PDF
          </a>
        </td>
        ${isAdminOrFinance ? `
        <td>
          ${ex.email_sent ? `
            <button class="btn-icon text-success" title="Relatório enviado" style="margin-right:6px;font-size:16px;cursor:pointer;background:none;border:none;color:#10b981;font-weight:bold;" onclick="ExportsPage.sendReportEmail(${ex.id})">📧<span style="font-size:10px;vertical-align:top;margin-left:1px;color:#10b981;font-weight:bold;">✓</span></button>
          ` : `
            <button class="btn-icon text-indigo" title="Enviar relatório por e-mail" style="margin-right:6px;font-size:15px;cursor:pointer;background:none;border:none;opacity:0.7;" onclick="ExportsPage.sendReportEmail(${ex.id})">📧</button>
          `}
          ${App.user?.role === 'admin' ? `
            <button class="action-btn danger" title="Excluir" onclick="ExportsPage.deleteExport(${ex.id})">🗑</button>
          ` : ''}
        </td>` : ''}
      </tr>
    `).join('');
  },

  async sendReportEmail(id) {
    const ex = (this._allExports || []).find(item => item.id === id);
    const isSent = ex && Boolean(ex.email_sent);
    const promptMsg = isSent
      ? "Este relatório já foi enviado por e-mail. Deseja reenviar o relatório por e-mail?"
      : "Deseja enviar este relatório por e-mail para o usuário proprietário das despesas?";
    if (!confirm(promptMsg)) return;
    try {
      const res = await Api.sendExportEmail(id);
      if (ex) ex.email_sent = true;
      this._filterAndRenderExports();
      const msg = isSent
        ? (res.message || "Relatório reenviado por e-mail com sucesso!")
        : (res.message || "E-mail enviado com sucesso!");
      if (typeof toast === 'function') toast(msg, 'success');
      else if (typeof Toast !== 'undefined') Toast.show(msg, "success");
    } catch (err) {
      if (typeof toast === 'function') toast(err.message, 'error');
      else if (typeof Toast !== 'undefined') Toast.show(err.message, "error");
    }
  },

  async bulkSendEmails() {
    const checkedBoxes = Array.from(document.querySelectorAll('#exports-tbody input[type="checkbox"]:checked'));
    const ids = checkedBoxes.map(cb => parseInt(cb.value, 10)).filter(id => !isNaN(id) && id > 0);

    if (ids.length === 0) {
      const warningMsg = "Selecione ao menos um relatório para enviar por e-mail.";
      if (typeof toast === 'function') toast(warningMsg, 'warning');
      else if (typeof Toast !== 'undefined') Toast.show(warningMsg, 'warning');
      else alert(warningMsg);
      return;
    }

    const count = ids.length;
    const confirmMsg = `Deseja enviar por e-mail os ${count} relatório(s) selecionado(s) para os respectivos usuários com o PDF anexado?`;
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('btn-bulk-email-export');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Enviando...';
    }

    try {
      const res = await Api.bulkSendExportEmails(ids);

      // Marca como enviado localmente nos relatórios correspondentes
      (this._allExports || []).forEach(ex => {
        if (ids.includes(ex.id)) {
          ex.email_sent = true;
        }
      });

      // Desmarca o checkbox mestre do cabeçalho
      const masterCb = document.getElementById('select-all-exp-exp');
      if (masterCb) masterCb.checked = false;

      this._filterAndRenderExports();

      const successMsg = res.message || `${res.sent || count} relatório(s) enviado(s) por e-mail com sucesso!`;
      if (typeof toast === 'function') toast(successMsg, 'success');
      else if (typeof Toast !== 'undefined') Toast.show(successMsg, 'success');
      else alert(successMsg);
    } catch (err) {
      const errMsg = err.message || "Erro ao enviar e-mails em massa.";
      if (typeof toast === 'function') toast(errMsg, 'error');
      else if (typeof Toast !== 'undefined') Toast.show(errMsg, 'error');
      else alert(errMsg);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  },

  openExportModal(preSelectedIds = null, preSelectedExpenses = null) {
    const monthsPt = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const now = new Date();
    const monthCapitalized = `${monthsPt[now.getMonth()]} de ${now.getFullYear()}`;

    let dateFromVal = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    let dateToVal = now.toISOString().slice(0, 10);
    let targetUserName = App.user?.name || 'Usuário';

    // If preSelectedExpenses passed, or check loadedExpenses
    let expsList = preSelectedExpenses;
    if ((!expsList || expsList.length === 0) && preSelectedIds && preSelectedIds.length > 0) {
      if (window.ExpensesPage && window.ExpensesPage.loadedExpenses) {
        expsList = window.ExpensesPage.loadedExpenses.filter(e => preSelectedIds.includes(e.id));
      }
    }

    let distinctUsers = [];
    if (expsList && expsList.length > 0) {
      const userMap = new Map();
      expsList.forEach(e => {
        if (e.user_id) userMap.set(e.user_id, e.user_name || 'Usuário');
      });
      distinctUsers = Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
      if (distinctUsers.length > 0) {
        targetUserName = distinctUsers[0].name;
      }
      const dates = expsList.map(e => e.expense_date).filter(Boolean).sort();
      if (dates.length > 0) {
        dateFromVal = dates[0];
        dateToVal = dates[dates.length - 1];
      }
    } else {
      const userFilterEl = document.getElementById('filter-user');
      if (userFilterEl && userFilterEl.value && userFilterEl.selectedOptions[0]) {
        targetUserName = userFilterEl.selectedOptions[0].text;
      }
    }

    const isMultipleUsers = distinctUsers.length > 1;
    const defaultReportName = `${targetUserName} - ${monthCapitalized}`;

    let estimatedReportsCount = null;
    if (expsList && expsList.length > 0) {
      const userCompPairs = new Set();
      expsList.forEach(e => {
        const uId = e.user_id || 'unknown';
        const cId = (e.cost_center && e.cost_center.company && e.cost_center.company.id) ||
                    (e.cost_center && e.cost_center.company_id) ||
                    e.company_id || 'default';
        userCompPairs.add(`${uId}_${cId}`);
      });
      estimatedReportsCount = userCompPairs.size;
    }

    const renderBanner = (mode) => {
      const hasPre = preSelectedIds && preSelectedIds.length > 0;
      if (mode === 'massa') {
        const expCount = hasPre ? preSelectedIds.length : null;
        const uCount = distinctUsers.length || (hasPre ? 'vários' : null);
        return `
          <div class="nf-warning" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;color:#166534;display:flex;align-items:flex-start;gap:10px;margin-bottom:0;">
            <span style="font-size:18px;line-height:1.2;flex-shrink:0;">ℹ️</span>
            <div style="flex:1;font-size:13px;line-height:1.5;">
              ${hasPre ? `
                <div><strong>${expCount} despesa(s)</strong> de <strong>${uCount} usuário(s)</strong> selecionada(s).</div>
                <div style="font-size:12px;color:#15803d;margin-top:3px;">
                  ${estimatedReportsCount ? `Previsão: <strong>${estimatedReportsCount} relatório(s)</strong> em PDF a serem gerados (um para cada empresa por usuário).` : `Será gerado um relatório para cada empresa por usuário.`}
                </div>
              ` : `
                <div><strong>Modo Relatório em Massa</strong></div>
                <div style="font-size:12px;color:#15803d;margin-top:3px;">
                  Serão gerados relatórios separados para cada usuário e empresa com despesas no período selecionado.
                </div>
              `}
            </div>
          </div>
        `;
      } else {
        if (!hasPre) return '';
        return `
          <div class="nf-warning" style="background:var(--blue-bg);border:1px solid #BFDBFE;border-radius:8px;padding:12px 14px;color:var(--blue-text);display:flex;align-items:center;gap:10px;margin-bottom:0;">
            <span style="font-size:18px;line-height:1;flex-shrink:0;">ℹ️</span>
            <div style="flex:1;font-size:13px;line-height:1.4;">
              <strong>${preSelectedIds.length} despesa(s)</strong> selecionada(s) serão incluídas neste relatório.
            </div>
          </div>
        `;
      }
    };

    const initialMode = isMultipleUsers ? 'massa' : 'individual';

    const html = `
      <div class="form-grid">
        <div class="field span-2">
          <label for="ex-mode">Tipo de Relatório</label>
          <select id="ex-mode">
            <option value="massa" ${isMultipleUsers ? 'selected' : ''}>Relatório em massa</option>
            <option value="individual" ${!isMultipleUsers ? 'selected' : ''}>Relatório individual</option>
          </select>
        </div>
        <div class="field span-2 required" id="wrap-ex-name" style="${initialMode === 'massa' ? 'display:none;' : ''}">
          <label for="ex-name" id="lbl-ex-name">Nome do Relatório</label>
          <input type="text" id="ex-name" placeholder="Ex: ${escHtml(targetUserName)} - ${monthCapitalized}"
            value="${escHtml(defaultReportName)}" />
        </div>
        <div class="field">
          <label for="ex-date-from">Data Inicial</label>
          <input type="date" id="ex-date-from" value="${dateFromVal}" />
        </div>
        <div class="field">
          <label for="ex-date-to">Data Final</label>
          <input type="date" id="ex-date-to" value="${dateToVal}" />
        </div>
        <div class="field span-2">
          <label for="ex-sort-by">Modo de visualização</label>
          <select id="ex-sort-by">
            <option value="category" selected>Categoria</option>
            <option value="cost_center">Centro de Custo</option>
            <option value="date">Data</option>
          </select>
        </div>
        <div class="field span-2" id="ex-info-banner">
          ${renderBanner(initialMode)}
        </div>
      </div>
      <div id="export-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;

    Modal.open('Executar Relatório', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-primary" id="run-export-btn">⬇ Gerar PDF</button>`
    );

    const modeSel = document.getElementById('ex-mode');
    const wrapName = document.getElementById('wrap-ex-name');
    const bannerEl = document.getElementById('ex-info-banner');

    const updateModalMode = (mode) => {
      if (wrapName) {
        wrapName.style.display = (mode === 'massa') ? 'none' : 'block';
      }
      if (bannerEl) {
        bannerEl.innerHTML = renderBanner(mode);
      }
    };

    if (modeSel) {
      modeSel.addEventListener('change', () => updateModalMode(modeSel.value));
      updateModalMode(modeSel.value);
    }

    // Asynchronously update report name and dates if preSelectedIds exists and expsList wasn't available
    if (preSelectedIds && preSelectedIds.length > 0 && (!expsList || expsList.length === 0)) {
      Api.getExpense(preSelectedIds[0]).then(exp => {
        if (exp) {
          const uName = exp.user_name || targetUserName;
          const input = document.getElementById('ex-name');
          if (input && !input.value.trim()) input.value = `${uName} - ${monthCapitalized}`;
        }
      }).catch(() => {});
    }

    document.getElementById('run-export-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('export-error');
      const exportMode = document.getElementById('ex-mode')?.value || 'individual';
      let name = document.getElementById('ex-name')?.value?.trim();
      const dateFrom = document.getElementById('ex-date-from').value;
      const dateTo = document.getElementById('ex-date-to').value;
      const sortBy = document.getElementById('ex-sort-by')?.value || 'category';

      if (exportMode === 'massa') {
        if (!name) name = `Relatório em massa - ${monthCapitalized}`;
      } else {
        if (!name) {
          errEl.textContent = 'Informe o nome do relatório.';
          errEl.classList.remove('hidden');
          return;
        }
      }

      const btn = document.getElementById('run-export-btn');
      btn.disabled = true;
      btn.textContent = 'Gerando PDF...';

      try {
        const body = {
          name,
          date_from: preSelectedIds ? null : (dateFrom || null),
          date_to: preSelectedIds ? null : (dateTo || null),
          sort_by: sortBy || 'date',
          expense_ids: preSelectedIds || null,
          export_mode: exportMode,
        };
        const res = await Api.createExport(body);
        const exportList = res.exports || [res];
        if (exportList.length > 1) {
          toast(`${exportList.length} relatórios gerados com sucesso!`, 'success');
        } else {
          toast('Relatório gerado com sucesso!', 'success');
        }
        Modal.close();
        this.loadExports();

        // Auto-download each generated export
        exportList.forEach((ex, idx) => {
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = Api.exportDownloadUrl(ex.id);
            a.download = `${ex.name}.pdf`;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }, 350 * (idx + 1));
        });
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = '⬇ Gerar PDF';
      }
    });
  },

  async deleteExport(id) {
    Modal.confirm('Excluir exportação', 'Tem certeza que deseja excluir esta exportação?', async () => {
      try {
        await Api.deleteExport(id);
        toast('Exportação excluída', 'success');
        this.loadExports();
      } catch (err) { toast(err.message, 'error'); }
    }, true);
  },
};
