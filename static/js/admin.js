/**
 * admin.js — Módulo Administrativo
 */
const AdminPage = {
  currentSection: 'users',

  render() {
    const isFinanceiro = App.user?.role === 'financeiro';
    const isAdmin = App.user?.role === 'admin';
    if (!isAdmin && !isFinanceiro) {
      document.getElementById('page-admin').innerHTML =
        `<div class="empty-state"><span class="empty-icon">🔒</span><p>Acesso restrito a administradores</p></div>`;
      return;
    }

    try {
      localStorage.removeItem('ml_admin_status_filters');
    } catch (e) {}

    this.currentSection = localStorage.getItem('ml_admin_current_section') || 'users';
    if (isFinanceiro && ['audit', 'unlock', 'impersonate', 'email-closing', 'email-payment'].includes(this.currentSection)) {
      this.currentSection = 'users';
      localStorage.setItem('ml_admin_current_section', 'users');
    }

    const adminPageEl = document.getElementById('page-admin');
    if (isFinanceiro) {
      adminPageEl.classList.add('admin-financeiro-mode');
    } else {
      adminPageEl.classList.remove('admin-financeiro-mode');
    }

    document.getElementById('page-admin').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Administração</h1>
          <p class="page-subtitle">Gerenciamento do sistema</p>
        </div>
      </div>

      <div class="admin-layout">
        <aside class="admin-sidenav">
          <div class="admin-section-label">GERENCIAMENTO DE USUÁRIOS</div>
          <div class="admin-nav-item" data-section="users" id="anav-users">Usuários</div>
          <div class="admin-nav-item" data-section="grupos" id="anav-cost-centers">Departamento</div>
          <div class="admin-nav-item" data-section="roles" id="anav-roles">Perfil</div>
          <div class="admin-nav-item" data-section="functions" id="anav-functions">Função</div>
          
          <div class="admin-section-label">CAMPOS</div>
          <div class="admin-nav-item" data-section="categories" id="anav-categories">Categorias</div>
          <div class="admin-nav-item" data-section="sienge-cost-centers" id="anav-sienge-cost-centers">Centros de custo</div>
          <div class="admin-nav-item" data-section="sienge-companies" id="anav-sienge-companies">Empresas</div>
          <div class="admin-nav-item" data-section="sienge-apportionments" id="anav-sienge-apportionments">Apropriações</div>
          <div class="admin-nav-item" data-section="mileage" id="anav-mileage">Quilometragem</div>
          <div class="admin-nav-item" data-section="logo" id="anav-logo">Logo</div>
          
          <div class="admin-section-label">REGRAS E POLÍTICAS</div>
          <div class="admin-nav-item" data-section="central-policies" id="anav-central-policies">Central de políticas</div>
          <div class="admin-nav-item" data-section="policies" id="anav-policies">Regras</div>
          <div class="admin-nav-item" data-section="rejection-reasons" id="anav-rejection-reasons">Motivos de rejeição</div>

          
          ${isFinanceiro ? '' : `
          <div class="admin-section-label">SEGURANÇA</div>
          <div class="admin-nav-item" id="anav-audit">Logs de Auditoria</div>
          <div class="admin-nav-item" id="anav-unlock">Desbloquear Usuários</div>
          <div class="admin-nav-item" id="anav-impersonate">Ver como</div>

          <div class="admin-section-label">MODELOS DE E-MAIL</div>
          <div class="admin-nav-item" data-section="email-closing" id="anav-email-closing">Datas de fechamento</div>
          <div class="admin-nav-item" data-section="email-payment" id="anav-email-payment">Data de Pagamento</div>
          `}
        </aside>

        <div class="admin-content" id="admin-section-content">
          <div style="text-align:center;padding:40px;color:var(--text-4);">
            <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);margin:0 auto 12px;"></div>
            Carregando...
          </div>
        </div>
      </div>
    `;

    // Apply active class to current restored section
    document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('anav-' + this.currentSection);
    if (activeNav) activeNav.classList.add('active');

    // Click listeners for active items
    ['users', 'categories', 'cost-centers', 'sienge-cost-centers', 'sienge-companies', 'sienge-apportionments', 'mileage', 'logo', 'central-policies', 'policies', 'rejection-reasons', 'roles', 'functions', 'audit', 'unlock', 'impersonate', 'email-closing', 'email-payment'].forEach(sec => {
      document.getElementById('anav-' + sec)?.addEventListener('click', () => {
        document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
        document.getElementById('anav-' + sec).classList.add('active');
        this.currentSection = sec;
        localStorage.setItem('ml_admin_current_section', sec);
        this.renderSection(this.currentSection);
      });
    });

    // Click listeners for dummy items
    document.querySelectorAll('.dummy-nav').forEach(el => {
      el.addEventListener('click', (e) => {
        document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('admin-section-content').innerHTML = 
          `<div class="empty-state"><span class="empty-icon">🚧</span><p>Módulo ${e.target.textContent} em desenvolvimento</p></div>`;
      });
    });

    this.renderSection(this.currentSection);
  },

  renderSection(section) {
    if (App.user?.role === 'financeiro') {
      if (['audit', 'unlock', 'impersonate', 'email-closing', 'email-payment'].includes(section)) {
        this.currentSection = 'users';
        localStorage.setItem('ml_admin_current_section', 'users');
        this.renderSection('users');
        return;
      }
    }
    if (section === 'policies') {
      this._sectionCollapseStates = {};
      this._overrideCardStates = {};
    }
    switch(section) {
      case 'users': this.renderUsers(); break;
      case 'categories': this.renderCategories(); break;
      case 'cost-centers': this.renderCostCenters(); break; // Local departments
      case 'sienge-cost-centers': this.renderSiengeCostCenters(); break;
      case 'sienge-companies': this.renderSiengeCompanies(); break;
      case 'sienge-apportionments': this.renderSiengeApportionments(); break;
      case 'mileage': this.renderMileage(); break;
      case 'logo': this.renderLogo(); break;
      case 'central-policies': this.renderCentralPolicies(); break;
      case 'policies': this.renderPolicies(); break;
      case 'rejection-reasons': this.renderRejectionReasons(); break;
      case 'roles': this.renderRoles(); break;
      case 'functions': this.renderFunctions(); break;
      case 'audit': this.renderAuditLogs(); break;
      case 'unlock': this.renderUnlockUsers(); break;
      case 'impersonate': this.renderImpersonate(); break;
      case 'email-closing': this.renderEmailTemplates('closing_dates'); break;
      case 'email-payment': this.renderEmailTemplates('payment_date'); break;
    }
    if (App.user?.role === 'financeiro') {
      this._observeFinanceReadOnly();
    }
  },

  _observeFinanceReadOnly() {
    if (App.user?.role !== 'financeiro') return;

    if (!document.getElementById('financeiro-admin-style')) {
      const style = document.createElement('style');
      style.id = 'financeiro-admin-style';
      style.textContent = `
        .admin-financeiro-mode #btn-add-user,
        .admin-financeiro-mode [id^="btn-new"],
        .admin-financeiro-mode [id^="btn-add"],
        .admin-financeiro-mode [id^="btn-sync"],
        .admin-financeiro-mode [id^="btn-save"],
        .admin-financeiro-mode [id^="btn-upload"],
        .admin-financeiro-mode .action-btn.danger,
        .admin-financeiro-mode button.danger,
        .admin-financeiro-mode button[title*="Excluir"],
        .admin-financeiro-mode button[title*="Editar"],
        .admin-financeiro-mode button[title*="Novo"],
        .admin-financeiro-mode button[title*="Nova"],
        .admin-financeiro-mode button[title*="Salvar"],
        .admin-financeiro-mode button[title*="Sincronizar"],
        .admin-financeiro-mode .toggle-switch,
        .admin-financeiro-mode input[type="file"],
        .admin-financeiro-mode .override-card-actions {
          display: none !important;
        }
        .admin-financeiro-mode #admin-section-content input:not([id^="filter"]),
        .admin-financeiro-mode #admin-section-content select:not([id^="filter"]),
        .admin-financeiro-mode #admin-section-content textarea {
          pointer-events: none !important;
          background-color: var(--surface-2, #f3f4f6) !important;
          opacity: 0.85 !important;
          cursor: not-allowed !important;
        }
      `;
      document.head.appendChild(style);
    }

    const content = document.getElementById('admin-section-content');
    if (!content) return;

    const applyReadOnly = () => {
      if (!content.querySelector('.finance-consult-banner')) {
        const banner = document.createElement('div');
        banner.className = 'finance-consult-banner';
        banner.style.cssText = 'margin-bottom:16px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);color:var(--text-1);padding:10px 14px;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:8px;';
        banner.innerHTML = `<span style="font-size:16px;">ℹ️</span><span><strong>Modo Consulta (Perfil Financeiro):</strong> Permissão de consulta concedida. Alterações, inclusões, exclusões e edições são restritas ao perfil Administrador.</span>`;
        content.insertBefore(banner, content.firstChild);
      }

      // Hide Ações column if table exists
      content.querySelectorAll('table').forEach(table => {
        const ths = table.querySelectorAll('thead th');
        let actionsColIndex = -1;
        ths.forEach((th, idx) => {
          const txt = th.textContent.trim().toLowerCase();
          if (txt.includes('ações') || txt.includes('acoes')) {
            actionsColIndex = idx;
            th.style.display = 'none';
          }
        });
        if (actionsColIndex !== -1) {
          table.querySelectorAll('tbody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds[actionsColIndex]) {
              tds[actionsColIndex].style.display = 'none';
            }
          });
        }
      });
    };

    applyReadOnly();

    if (this._financeObserver) {
      this._financeObserver.disconnect();
    }
    this._financeObserver = new MutationObserver(() => {
      applyReadOnly();
    });
    this._financeObserver.observe(content, { childList: true, subtree: true });
  },

  async renderAuditLogs() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🛡️ Logs de Auditoria</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Ação</th>
              <th>Alvo / E-mail</th>
              <th>Administrador</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="audit-tbody">
            <tr class="loading-row"><td colspan="5">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    try {
      const logs = await Api.getAuditLogs();
      const tbody = document.getElementById('audit-tbody');
      
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-4);">Nenhum log encontrado.</td></tr>';
        return;
      }

      const actionMap = {
        'UNLOCK_USER': 'Desbloqueio de Usuário',
        'SEND_PASSWORD_EMAIL': 'Envio de E-mail (Senha)',
        'LOGIN_FAILED': 'Falha no Login',
        'LOGIN_SUCCESS': 'Login Realizado',
        'RESET_PASSWORD': 'Redefinição de Senha',
        'CREATE_USER': 'Criação de Usuário',
        'UPDATE_USER': 'Edição de Usuário',
        'DELETE_USER': 'Exclusão de Usuário'
      };

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-size:13px;color:var(--text-3);">${fmtDateTime(l.timestamp)}</td>
          <td style="font-weight:600;font-size:13px;">${escHtml(actionMap[l.action] || l.action)}</td>
          <td style="font-size:13px;">${escHtml(l.target_email)}</td>
          <td style="font-size:13px;color:var(--text-2);">${escHtml(l.admin_name || 'Sistema')}</td>
          <td>
            <span class="badge ${l.status === 'sucesso' ? 'badge-aprovado' : 'badge-rejeitado'}">${escHtml(l.status.toUpperCase())}</span>
          </td>
        </tr>
      `).join('');
    } catch(err) {
      document.getElementById('audit-tbody').innerHTML = `<tr><td colspan="5" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async renderUnlockUsers() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🔓 Desbloquear Usuários</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Status</th>
              <th>Falhas</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="unlock-tbody">
            <tr class="loading-row"><td colspan="5">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    try {
      const users = await Api.getLockedUsers();
      const tbody = document.getElementById('unlock-tbody');
      
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-4);">Nenhum usuário bloqueado ou com falhas.</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(u => {
        const isLocked = u.is_locked || u.failed_attempts >= 3;
        return `
          <tr>
            <td style="font-weight:600;font-size:13px;">${escHtml(u.name)}</td>
            <td style="font-size:13px;color:var(--text-3);">${escHtml(u.email)}</td>
            <td>
              <span class="badge ${isLocked ? 'badge-rejeitado' : 'badge-aprovado'}">${isLocked ? 'BLOQUEADO' : 'ATIVO'}</span>
            </td>
            <td style="font-size:13px;font-weight:600;color:${u.failed_attempts > 0 ? 'var(--red)' : 'var(--text-3)'};">${u.failed_attempts || 0}</td>
            <td>
              <div class="td-actions" style="justify-content:flex-start; gap:10px;">
                <button class="btn btn-sm btn-outline" style="padding:4px 8px; font-size:12px; display:flex; align-items:center; gap:4px;" onclick="AdminPage.unlockUser(${u.id})">
                  🔓 Desbloquear
                </button>
                <button class="btn btn-sm btn-primary" style="padding:4px 8px; font-size:12px; display:flex; align-items:center; gap:4px;" onclick="AdminPage.resendPasswordEmail('${u.email}')">
                  📨 Reenviar Senha
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch(err) {
      document.getElementById('unlock-tbody').innerHTML = `<tr><td colspan="5" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async unlockUser(id) {
    try {
      await Api.unlockUser(id);
      toast('Usuário desbloqueado com sucesso!', 'success');
      this.renderUnlockUsers();
    } catch(err) {
      toast(err.message || 'Erro ao desbloquear usuário', 'error');
    }
  },

  async resendPasswordEmail(email) {
    try {
      await Api.sendPasswordEmail(email);
      toast('E-mail de senha reenviado com sucesso!', 'success');
    } catch(err) {
      toast(err.message || 'Erro ao reenviar e-mail', 'error');
    }
  },

  setSection(sec) {
    this.currentSection = sec;
    localStorage.setItem('ml_admin_current_section', sec);
    document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('anav-' + sec)?.classList.add('active');
    this.renderSection(sec);
  },

  async renderImpersonate() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="card" style="margin-bottom: 20px; padding: 20px; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border-left: 4px solid var(--ml-indigo);">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <h3 style="margin:0 0 6px; font-size:16px; font-weight:700; color:var(--text-1); display:flex; align-items:center; gap:8px;">
              <span>👁️</span> Ver como (Simulação de Perfil)
            </h3>
            <p style="margin:0; font-size:13.5px; color:var(--text-3); max-width:760px; line-height:1.5;">
              Selecione qualquer usuário para navegar e testar o sistema exatamente com a visão, permissões e restrições atribuídas ao perfil dele (Administrador, Aprovador, Financeiro ou Usuário).
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:rgba(34,127,63,0.1); color:var(--ml-indigo); font-weight:600; padding:6px 12px; font-size:12px;">
              Segurança & Auditoria Ativa
            </span>
          </div>
        </div>

        <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
          <div style="flex:1; min-width:280px; position:relative;">
            <select id="impersonate-quick-select" class="form-control" style="width:100%; height:40px; font-size:13.5px; border-radius:8px;">
              <option value="">Carregando usuários...</option>
            </select>
          </div>
          <button id="btn-impersonate-quick" class="btn btn-primary" style="height:40px; padding:0 20px; font-size:13.5px; font-weight:600; display:inline-flex; align-items:center; gap:8px; white-space:nowrap;" disabled>
            <span>👁️</span> Ver como
          </button>
        </div>
      </div>

      <div class="table-wrapper">
        <div class="table-header" style="flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="card-title" style="margin:0;">👤 Usuários Disponíveis</span>
            <span id="impersonate-count-badge" class="badge" style="background:var(--ml-light); color:var(--ml-indigo); font-weight:700;">0</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex:1; justify-content:flex-end; max-width:400px;">
            <input type="search" id="impersonate-search-input" class="form-control" placeholder="🔍 Buscar por nome, e-mail ou perfil..." style="width:100%; height:36px; font-size:13px; border-radius:6px;" />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Departamento</th>
              <th>Status</th>
              <th style="text-align:right;">Ação</th>
            </tr>
          </thead>
          <tbody id="impersonate-tbody">
            <tr class="loading-row"><td colspan="6">Carregando usuários...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    try {
      const [users, depts] = await Promise.all([
        Api.getUsers(),
        Api.getSiengeDepartments().catch(() => [])
      ]);
      const deptsMap = new Map();
      (depts || []).forEach(d => {
        const dId = String(d.id || d.departmentId);
        const dName = d.name || d.departmentName;
        if (dId && dName) deptsMap.set(dId, dName);
      });

      this._impersonateUsersList = users || [];

      const getDeptName = (u) => {
        if (u.department_name) return u.department_name;
        if (u.department && u.department.name) return u.department.name;
        if (u.cost_center_id && deptsMap.has(String(u.cost_center_id))) {
          return deptsMap.get(String(u.cost_center_id));
        }
        return u.cost_center?.name || u.cost_center_name || '—';
      };

      const quickSelect = document.getElementById('impersonate-quick-select');
      const quickBtn = document.getElementById('btn-impersonate-quick');
      const tbody = document.getElementById('impersonate-tbody');
      const countBadge = document.getElementById('impersonate-count-badge');
      const searchInput = document.getElementById('impersonate-search-input');

      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-4);padding:30px;">Nenhum usuário cadastrado.</td></tr>';
        if (quickSelect) quickSelect.innerHTML = '<option value="">Nenhum usuário encontrado</option>';
        return;
      }

      // Populate Quick Select
      quickSelect.innerHTML = `
        <option value="">Selecione um usuário para simulação rápida...</option>
        ${users.filter(u => u.active !== false).map(u => {
          let role = u.role;
          if (u.job_role?.name) {
            const jrn = u.job_role.name.toLowerCase();
            if (jrn.includes('financ')) role = 'financeiro';
            else if (jrn.includes('admin')) role = 'admin';
            else if (jrn.includes('aprov')) role = 'aprovador';
          }
          const roleLabel = ROLE_LABELS[role] || role;
          const isCurrent = (App.user && App.user.id === u.id);
          const dept = getDeptName(u);
          const deptDisplay = (dept && dept !== '—') ? ` — ${escHtml(dept)}` : '';
          return `<option value="${u.id}" ${isCurrent ? 'disabled' : ''}>${escHtml(u.name)} (${roleLabel}${deptDisplay} — ${escHtml(u.email)})${isCurrent ? ' [Perfil Atual]' : ''}</option>`;
        }).join('')}
      `;

      quickSelect.addEventListener('change', () => {
        const val = quickSelect.value;
        quickBtn.disabled = !val || (App.user && String(App.user.id) === String(val));
      });

      quickBtn.addEventListener('click', () => {
        const val = quickSelect.value;
        if (val) AdminPage.startImpersonation(Number(val));
      });

      const renderTableRows = (filterText = '') => {
        const q = filterText.trim().toLowerCase();
        const filtered = this._impersonateUsersList.filter(u => {
          if (!q) return true;
          const roleLabel = (ROLE_LABELS[u.role] || u.role || '').toLowerCase();
          const dept = getDeptName(u).toLowerCase();
          return (u.name || '').toLowerCase().includes(q) ||
                 (u.email || '').toLowerCase().includes(q) ||
                 roleLabel.includes(q) ||
                 dept.includes(q);
        });

        countBadge.textContent = filtered.length;

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-4);padding:24px;">Nenhum usuário coincide com a busca "${escHtml(filterText)}".</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(u => {
          const isCurrent = (App.user && App.user.id === u.id);
          const isActive = u.active !== false;
          let role = u.role;
          if (u.job_role?.name) {
            const jrn = u.job_role.name.toLowerCase();
            if (jrn.includes('financ')) role = 'financeiro';
            else if (jrn.includes('admin')) role = 'admin';
            else if (jrn.includes('aprov')) role = 'aprovador';
          }
          const roleLabel = ROLE_LABELS[role] || role;
          const deptName = getDeptName(u);

          let roleBadgeStyle = 'background:#e0e7ff;color:#3730a3;'; // indigo default
          if (role === 'admin') roleBadgeStyle = 'background:#fef3c7;color:#92400e;'; // amber
          else if (role === 'aprovador') roleBadgeStyle = 'background:#dbeafe;color:#1e40af;'; // blue
          else if (role === 'financeiro') roleBadgeStyle = 'background:#f3e8ff;color:#6b21a8;'; // purple
          else if (role === 'usuario') roleBadgeStyle = 'background:#f1f5f9;color:#334155;'; // slate

          return `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:34px;height:34px;border-radius:50%;background:var(--ml-indigo);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">
                    ${initials(u.name)}
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:13.5px;color:var(--text-1);">${escHtml(u.name)}</div>
                    ${isCurrent ? '<span style="font-size:11px;color:var(--ml-indigo);font-weight:600;">(Você)</span>' : ''}
                  </div>
                </div>
              </td>
              <td style="font-size:13px;color:var(--text-3);">${escHtml(u.email)}</td>
              <td>
                <span class="badge" style="${roleBadgeStyle}font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:4px;">
                  ${roleLabel}
                </span>
              </td>
              <td style="font-size:13px;color:var(--text-2);">${escHtml(deptName)}</td>
              <td>
                <span class="badge ${isActive ? 'badge-aprovado' : 'badge-rejeitado'}" style="font-size:11px;">
                  ${isActive ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td style="text-align:right;">
                ${isCurrent ? `
                  <button class="btn btn-sm btn-ghost" disabled style="opacity:0.6;font-size:12px;">
                    Perfil Atual
                  </button>
                ` : !isActive ? `
                  <button class="btn btn-sm btn-secondary" disabled style="opacity:0.5;font-size:12px;" title="Usuário inativo não pode ser simulado">
                    Inativo
                  </button>
                ` : `
                  <button class="btn btn-sm btn-primary" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:5px 12px;font-weight:600;" onclick="AdminPage.startImpersonation(${u.id})">
                    <span>👁️</span> Ver como
                  </button>
                `}
              </td>
            </tr>
          `;
        }).join('');
      };

      renderTableRows('');

      searchInput?.addEventListener('input', (e) => {
        renderTableRows(e.target.value);
      });

    } catch (err) {
      document.getElementById('impersonate-tbody').innerHTML = `
        <tr><td colspan="6" style="color:var(--red);text-align:center;padding:24px;">Erro ao carregar usuários: ${escHtml(err.message)}</td></tr>
      `;
    }
  },

  async startImpersonation(userId) {
    if (!userId) return;
    try {
      if (!sessionStorage.getItem('ml_impersonator_token')) {
        sessionStorage.setItem('ml_impersonator_token', Api.getToken());
        sessionStorage.setItem('ml_impersonator_user', JSON.stringify(App.user));
      }

      toast('Carregando perfil para simulação...', 'info', 2000);
      const res = await Api.impersonateUser(userId);

      if (!res || !res.access_token || !res.user) {
        throw new Error('Resposta inválida do servidor ao iniciar simulação.');
      }

      if (res.user.job_role?.name) {
        const jrn = res.user.job_role.name.toLowerCase();
        if (jrn.includes('financ')) res.user.role = 'financeiro';
        else if (jrn.includes('admin')) res.user.role = 'admin';
        else if (jrn.includes('aprov')) res.user.role = 'aprovador';
      }

      Api.setToken(res.access_token);
      showApp(res.user);
      navigate('dashboard');
      toast(`Modo "Ver como" ativo: visualizando como ${res.user.name}`, 'success', 4000);
    } catch (err) {
      toast(err.message || 'Erro ao iniciar modo Ver como', 'error');
    }
  },

  // ── USERS ─────────────────────────────────────────────────────────────────
  filterSiengeCCTable() {
    const searchInput = document.getElementById('search-sienge-cc');
    const term = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const select = document.getElementById('filter-sienge-cc-tbody');
    const status = select ? select.value : 'active';

    const rows = document.querySelectorAll('#sienge-cc-tbody tr[data-status]');
    rows.forEach(row => {
      const rowStatus = row.getAttribute('data-status');
      const matchesStatus = (status === 'all' || rowStatus === status);
      const text = row.textContent.toLowerCase();
      const matchesSearch = !term || text.includes(term);

      if (matchesStatus && matchesSearch) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  filterTable(status, tbodyId) {
    if (tbodyId === 'sienge-cc-tbody') {
      this.filterSiengeCCTable();
      return;
    }
    const select = document.getElementById(`filter-${tbodyId}`);
    if (select && select.value !== status) {
      select.value = status;
    }
    const rows = document.querySelectorAll(`#${tbodyId} tr[data-status]`);
    rows.forEach(row => {
      if (status === 'all') {
        row.style.display = '';
      } else if (row.getAttribute('data-status') === status) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  applyCurrentFilter(tbodyId) {
    if (tbodyId === 'sienge-cc-tbody') {
      const select = document.getElementById('filter-sienge-cc-tbody');
      const status = (select && select.value) ? select.value : 'active';
      if (select) select.value = status;
      this.filterSiengeCCTable();
      return;
    }
    const select = document.getElementById(`filter-${tbodyId}`);
    const status = (select && select.value) ? select.value : 'active';
    if (select) select.value = status;
    this.filterTable(status, tbodyId);
  },

  async renderUsers() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">👤 Usuários</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-users-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'users-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-add-user">＋ Novo Usuário</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Função</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            <tr class="loading-row"><td colspan="6">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;

    document.getElementById('btn-add-user').addEventListener('click', () => this.openUserForm());

    try {
      const users = await Api.getUsers();
      const ccs = await Api.getSiengeDepartments();
      document.getElementById('users-tbody').innerHTML = users.map(u => `
        <tr data-status="${u.active !== false ? 'active' : 'inactive'}">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--ml-indigo);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;">${initials(u.name)}</div>
              <span style="font-weight:600;">${escHtml(u.name)}</span>
            </div>
          </td>
          <td style="color:var(--text-3);font-size:13px;">${escHtml(u.email)}</td>
          <td style="font-size:13px;">${escHtml(u.job_role?.name || '—')}</td>
          <td style="font-size:13px;">${escHtml(u.job_function?.name || '—')}</td>
          <td>
            <div style="display:inline-flex; align-items:center; gap:8px;">
              <style>
                .toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
                .toggle-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
                .toggle-switch input:checked + .toggle-slider { background-color: var(--ml-indigo); }
                .toggle-switch input:checked + .toggle-slider:before { transform: translateX(16px); }
              </style>
              <label class="toggle-switch" style="cursor:pointer;" onclick="event.preventDefault(); AdminPage.toggleUser(${u.id}, ${!u.active})">
                <input type="checkbox" ${u.active ? 'checked' : ''} tabindex="-1">
                <span class="toggle-slider"></span>
              </label>
              <span style="font-size:13px; font-weight:500; color:var(--text-2);">${u.active ? 'Ativo' : 'Inativo'}</span>
            </div>
          </td>
          <td>
            <div class="td-actions">
              <button class="action-btn" title="Editar" onclick="AdminPage.openUserForm(${u.id})">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
              <button class="action-btn danger" title="Excluir usuário" onclick="AdminPage.deleteUserConfirm(${u.id}, '${escHtml(u.name)}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </td>
        </tr>`).join('');
      this.applyCurrentFilter('users-tbody');
    } catch (err) {
      document.getElementById('users-tbody').innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async openUserForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    let user = null;
    let ccs = await Api.getSiengeDepartments();
    let jobRoles = await Api.getJobRoles();
    let jobFunctions = await Api.getJobFunctions();

    if (id) {
      try {
        const users = await Api.getUsers();
        user = users.find(u => u.id === id);
      } catch(e) {}
    }

    const localDepts = (window._db && window._db.sienge_departments) ? window._db.sienge_departments : [];
    ccs.forEach(d => {
      const found = localDepts.find(ld => String(ld.id) === String(d.id));
      if (found) d.active = found.active;
    });

    ccs = ccs.filter(c => c.active !== false || (user && (String(user.cost_center_id) === String(c.id) || (user.groups || []).map(String).includes(String(c.id)) || (user.approver_of || []).map(String).includes(String(c.id)))));
    jobRoles = jobRoles.filter(r => r.active !== false || (user && String(user.job_role_id) === String(r.id)));
    jobFunctions = jobFunctions.filter(f => f.active !== false || (user && (String(user.job_function_id) === String(f.id) || (user.approver_of_functions || []).map(String).includes(String(f.id)))));
    jobFunctions.sort((a, b) => AdminPage.getFunctionRank(a.name) - AdminPage.getFunctionRank(b.name));

    AdminPage._modalData = { ccs, jobFunctions, jobRoles, user };
    let initialRules = [];
    if (user?.approver_rules && Array.isArray(user.approver_rules) && user.approver_rules.length > 0) {
      initialRules = JSON.parse(JSON.stringify(user.approver_rules));
    } else if (user?.approver_of_functions && user.approver_of_functions.length > 0) {
      initialRules = [{
        function_ids: (user.approver_of_functions || []).map(Number),
        department_ids: (user.approver_of || []).map(Number)
      }];
    } else {
      initialRules = [{
        function_ids: [],
        department_ids: (user?.approver_of || []).map(Number)
      }];
    }
    AdminPage._approverRules = initialRules;

    const html = `
      <div class="form-grid">
        <div class="field required">
          <label for="uf-creditor">Código do credor</label>
          <input type="text" id="uf-creditor" value="${escHtml(user?.creditor_code || '')}" placeholder="Apenas números" oninput="this.value = this.value.replace(/[^0-9]/g, '')" onblur="AdminPage.autoFillCreditor(this.value)" />
        </div>
        <div class="field required" style="position:relative; z-index:10000;">
          <label for="uf-name">Nome completo</label>
          <input type="text" id="uf-name" value="${escHtml(user?.name || '')}" placeholder="Nome ou Busca (ex: %Moura%)" oninput="AdminPage.autoFillCreditorByName(this.value)" onkeydown="if(event.key === 'Tab' || event.key === 'Enter') { AdminPage.autoFillCreditorOnTabOrBlur(this.value); }" onblur="AdminPage.autoFillCreditorOnTabOrBlur(this.value)" />
        </div>
        <div class="field required">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label for="uf-email">E-mail</label>
            <span style="cursor:pointer; font-size:16px;" title="Enviar e-mail de criação de senha" onclick="AdminPage.sendPasswordEmail()">📨</span>
          </div>
          <input type="email" id="uf-email" value="${escHtml(user?.email || '')}" placeholder="email@mouraleite.com.br" />
        </div>
        <div class="field">
          <label for="uf-job-function">Função</label>
          <select id="uf-job-function" onchange="AdminPage.onJobRoleChange()">
            <option value="">Nenhuma...</option>
            ${jobFunctions.map(jf => `<option value="${jf.id}" ${(user && (String(user.job_function_id) === String(jf.id) || String(user.job_function?.id) === String(jf.id))) ? 'selected' : ''}>${escHtml(jf.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field required">
          <label for="uf-groups">Departamento</label>
          <select id="uf-groups" onchange="AdminPage.syncScopeDeptFixed()">
            <option value="">Selecione...</option>
            ${ccs.map(cc => `<option value="${cc.id}" ${(String(user?.cost_center_id) === String(cc.id) || (user?.groups || []).map(String).includes(String(cc.id))) ? 'selected' : ''}>${cc.code ? escHtml(cc.code) + ' | ' : ''}${escHtml(cc.name)}</option>`).join('')}
          </select>
        </div>
        <style>
          .custom-multiselect { position: relative; width: 100%; outline: none; }
          .ms-selected { border: 1.5px solid var(--border); border-radius: 6px; padding: 8px 12px; background: white; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 14px; min-height: 40px; color: var(--text-2); }
          .ms-options { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1.5px solid var(--border); border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 4px; padding: 4px 0; }
          .ms-options label { display: flex; align-items: center; padding: 8px 12px; cursor: pointer; margin: 0; font-weight: 500; font-size: 13px; }
          .ms-options label::after { content: none !important; }
          .ms-options label:hover { background: var(--surface-2); }
          .ms-options input[type="checkbox"] { margin-right: 8px; width: 16px; height: 16px; accent-color: var(--ml-indigo); }
        </style>
        <div class="field required">
          <label for="uf-job-role">Perfil</label>
          <select id="uf-job-role" onchange="AdminPage.onJobRoleChange()">
            <option value="">Selecione...</option>
            ${jobRoles.map(jr => `<option value="${jr.id}" ${String(user?.job_role_id) === String(jr.id) ? 'selected' : ''}>${escHtml(jr.name)}</option>`).join('')}
          </select>
        </div>
        <div id="scope-fields" class="form-grid" style="grid-column: span 2; display:none; padding: 16px; background: var(--surface-2); border-radius: 8px; border: 1px solid var(--border); gap: 16px;">
          <div style="grid-column: span 2; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <h4 style="margin: 0; font-size: 14px; color: var(--text-2); font-weight: 600;">Aprovador de</h4>
            <button type="button" id="btn-add-approver-rule" style="display: none; background: #ffffff; border: 1.5px solid var(--border); border-radius: 6px; width: 32px; height: 32px; font-size: 22px; line-height: 1; cursor: pointer; color: #1e293b; align-items: center; justify-content: center; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;" title="Adicionar outra regra de aprovação" onmouseover="this.style.borderColor='var(--ml-indigo)'; this.style.color='var(--ml-indigo)';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='#1e293b';" onclick="AdminPage.addApproverRuleRow()">+</button>
          </div>
          <div id="scope-rules-container" style="grid-column: span 2; display: flex; flex-direction: column; gap: 16px; width: 100%;">
          </div>
        </div>
        <div class="field required">
          <label for="uf-payment">Forma de Pagamento</label>
          <select id="uf-payment" onchange="AdminPage.onPaymentMethodChange()">
            <option value="">Selecione...</option>
            <option value="TED" ${user?.payment_method === 'TED' ? 'selected' : ''}>TED</option>
            <option value="PIX" ${user?.payment_method === 'PIX' ? 'selected' : ''}>PIX</option>
            <option value="Depósito Itaú" ${user?.payment_method === 'Depósito Itaú' ? 'selected' : ''}>Depósito Itaú</option>
          </select>
        </div>
        <div id="pix-fields" class="form-grid" style="grid-column: span 2; ${user?.payment_method === 'PIX' ? 'display:grid;' : 'display:none;'} gap:16px;">
          <div class="field required">
            <label for="uf-pix">Chave PIX</label>
            <input type="text" id="uf-pix" value="${escHtml(user?.pix_key || '')}" placeholder="Chave PIX" />
          </div>
        </div>
        <div id="ted-fields" class="form-grid" style="grid-column: span 2; ${['TED', 'Depósito Itaú'].includes(user?.payment_method) ? 'display:grid; grid-template-columns: 1fr 1fr 1fr;' : 'display:none;'} gap:16px;">
          <div class="field required">
            <label for="uf-bank">Banco</label>
            <input type="text" id="uf-bank" value="${escHtml(user?.bank || '')}" placeholder="Ex: 341" />
          </div>
          <div class="field required">
            <label for="uf-agency">Agência</label>
            <input type="text" id="uf-agency" value="${escHtml(user?.agency || '')}" placeholder="Agência" />
          </div>
          <div class="field required">
            <label for="uf-account">Conta</label>
            <input type="text" id="uf-account" value="${escHtml(user?.account || '')}" placeholder="Conta" />
          </div>
        </div>
      </div>
      <div id="uf-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;

    Modal.open(id ? 'Editar Usuário' : 'Novo Usuário', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-primary" id="save-user-btn">💾 Salvar</button>`,
      { size: 'lg' }
    );
    setTimeout(() => {
      AdminPage.renderApproverRules();
      AdminPage.syncScopeDeptFixed();
      AdminPage.onJobRoleChange();
    }, 50);

    document.getElementById('save-user-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('uf-error');
      errEl.classList.add('hidden');
      const name = document.getElementById('uf-name').value.trim();
      const email = document.getElementById('uf-email').value.trim();
      const jobRoleId = document.getElementById('uf-job-role').value;
      const jobFunctionId = document.getElementById('uf-job-function').value;
      const groupsVal = document.getElementById('uf-groups').value;
      const groups = groupsVal ? [parseInt(groupsVal)] : [];
      
      const creditorCode = document.getElementById('uf-creditor').value.trim();
      const select = document.getElementById('uf-job-role');
      const selectedText = select.options[select.selectedIndex]?.text.toLowerCase() || '';
      const isApprover = selectedText.includes('aprov');
      const isAdmin = selectedText.includes('admin');

      AdminPage.syncApproverRulesFromDom();
      let approverRules = [];
      let scopeDepartments = [];
      let scopeFunctions = [];
      
      const funcSelect = document.getElementById('uf-job-function');
      const funcText = funcSelect ? (funcSelect.options[funcSelect.selectedIndex]?.text.toLowerCase() || '') : '';
      const isGestorOrDiretor = AdminPage.getFunctionRank(funcText) <= 2;

      if (isApprover || isAdmin || isFinance) {
        if (isAdmin || isFinance || (isApprover && isGestorOrDiretor)) {
          approverRules = (AdminPage._approverRules || []).map(r => ({
            function_ids: (r.function_ids || []).map(Number),
            department_ids: (r.department_ids || []).map(Number)
          })).filter(r => r.function_ids.length > 0 || r.department_ids.length > 0);
        } else if (isApprover) {
          const firstRule = (AdminPage._approverRules && AdminPage._approverRules[0]) || { function_ids: [] };
          approverRules = [{
            function_ids: (firstRule.function_ids || []).map(Number),
            department_ids: groups
          }];
        }

        if (isAdmin || isFinance || (isApprover && isGestorOrDiretor)) {
          if (approverRules.length === 0) {
            errEl.textContent = 'Adicione pelo menos uma regra de aprovação com Função e Departamento.';
            errEl.classList.remove('hidden');
            return;
          }
          for (let i = 0; i < approverRules.length; i++) {
            const rule = approverRules[i];
            if (!rule.function_ids || rule.function_ids.length === 0) {
              errEl.textContent = `Selecione pelo menos uma Função na regra ${i + 1} de aprovação.`;
              errEl.classList.remove('hidden');
              return;
            }
            if (!rule.department_ids || rule.department_ids.length === 0) {
              errEl.textContent = `Selecione pelo menos um Departamento na regra ${i + 1} de aprovação.`;
              errEl.classList.remove('hidden');
              return;
            }
          }
        } else if (isApprover) {
          if (approverRules.length === 0 || !approverRules[0].function_ids || approverRules[0].function_ids.length === 0) {
            errEl.textContent = 'Selecione pelo menos uma Função para aprovação.';
            errEl.classList.remove('hidden');
            return;
          }
        }

        scopeFunctions = Array.from(new Set(approverRules.flatMap(r => r.function_ids)));
        scopeDepartments = Array.from(new Set(approverRules.flatMap(r => r.department_ids)));
      }

      const paymentMethod = document.getElementById('uf-payment').value;
      const pixKey = document.getElementById('uf-pix').value.trim();
      const bank = document.getElementById('uf-bank').value.trim();
      const agency = document.getElementById('uf-agency').value.trim();
      const account = document.getElementById('uf-account').value.trim();

      if (!creditorCode || !name || !email || !paymentMethod || groups.length === 0 || !jobRoleId) {
        errEl.textContent = 'Preencha os campos obrigatórios básicos (Código do credor, Nome, E-mail, Perfil, Departamento, Forma de Pagamento).';
        errEl.classList.remove('hidden');
        return;
      }

      const isBankPayment = ['TED', 'Depósito Itaú'].includes(paymentMethod);
      const body = { 
        creditor_code: creditorCode,
        name, 
        email, 
        job_role_id: jobRoleId ? parseInt(jobRoleId) : null,
        job_function_id: jobFunctionId ? parseInt(jobFunctionId) : null,
        groups,
        cost_center_id: groups.length > 0 ? groups[0] : null,
        approver_of: scopeDepartments,
        approver_of_functions: scopeFunctions,
        approver_rules: approverRules,
        payment_method: paymentMethod || null,
        pix_key: paymentMethod === 'PIX' ? pixKey : null,
        bank: isBankPayment ? bank : null,
        agency: isBankPayment ? agency : null,
        account: isBankPayment ? account : null
      };
      if (!id) body.active = true;

      const btn = document.getElementById('save-user-btn');
      btn.disabled = true;
      try {
        if (id) await Api.updateUser(id, body);
        else await Api.createUser(body);
        toast(id ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
        Modal.close();
        this.renderUsers();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
      }
    });
  },

  toggleUserConfirm(id, active, name) {
    this.toggleUser(id, active);
  },

  async toggleUser(id, active) {
    try {
      await Api.updateUser(id, { active });
      toast(active ? 'Usuário ativado' : 'Usuário desativado', 'success');
      this.renderUsers();
    } catch(err) { toast(err.message, 'error'); }
  },

  deleteUserConfirm(id, name) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    Modal.confirm('Confirmar ação', `Deseja realmente excluir o cadastro do usuário ${name}? Esta ação não poderá ser desfeita.`, async () => {
      try {
        await Api.deleteUser(id);
        toast('Usuário excluído com sucesso!', 'success');
        this.renderUsers();
      } catch (err) {
        toast(err.message || 'Erro ao excluir usuário', 'error');
      }
    });
  },

  onPaymentMethodChange() {
    const val = document.getElementById('uf-payment').value;
    document.getElementById('pix-fields').style.display = val === 'PIX' ? 'grid' : 'none';
    document.getElementById('ted-fields').style.display = (val === 'TED' || val === 'Depósito Itaú') ? 'grid' : 'none';
  },

  async autoFillCreditorOnTabOrBlur(nameQuery) {
    nameQuery = (nameQuery || '').trim();
    if (!nameQuery || nameQuery.length < 2) return;

    try {
      const res = await fetch('/api/sienge/creditors/search?query=' + encodeURIComponent(nameQuery));
      if (!res.ok) return;
      const matches = await res.json();
      if (matches && matches.length > 0) {
        const cred = matches[0];
        document.getElementById('uf-creditor').value = cred.id;
        document.getElementById('uf-name').value = cred.name;
        const existing = document.getElementById('creditor-autocomplete');
        if (existing) existing.remove();
        AdminPage.autoFillCreditor(cred.id);
      }
    } catch(e) {
      console.warn('Tab/Blur creditor search error:', e);
    }
  },

  async autoFillCreditorByName(nameQuery) {
    nameQuery = (nameQuery || '').trim();
    const existing = document.getElementById('creditor-autocomplete');
    if (existing) existing.remove();

    if (!nameQuery || nameQuery.length < 2) return;

    const input = document.getElementById('uf-name');
    if (!input) return;

    try {
      const res = await fetch('/api/sienge/creditors/search?query=' + encodeURIComponent(nameQuery));
      if (!res.ok) return;
      const matches = await res.json();

      const currentExisting = document.getElementById('creditor-autocomplete');
      if (currentExisting) currentExisting.remove();

      if (!matches || matches.length === 0) return;

      const dropdown = document.createElement('div');
      dropdown.id = 'creditor-autocomplete';
      dropdown.style.cssText = 'position:absolute; background:#ffffff; border:2px solid var(--ml-indigo, #006633); border-radius:8px; max-height:240px; overflow-y:auto; z-index:999999; box-shadow:0 8px 24px rgba(0,0,0,0.25); width:100%; left:0; top:calc(100% + 4px); padding:4px 0;';

      const header = document.createElement('div');
      header.style.cssText = 'padding:6px 12px; font-size:11px; font-weight:700; color:var(--ml-indigo, #006633); background:var(--surface-2, #f4f6f8); border-bottom:1px solid var(--border, #e0e0e0); text-transform:uppercase; letter-spacing:0.5px;';
      header.textContent = `Credores encontrados (${matches.length})`;
      dropdown.appendChild(header);

      matches.forEach(cred => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 12px; cursor:pointer; border-bottom:1px solid #f0f0f0; font-size:13px; color:#222222; text-align:left; display:flex; flex-direction:column; gap:3px; background:#ffffff; transition:background 0.15s;';
        item.innerHTML = `<div style="font-weight:700; color:#0e4b26;">${escHtml(cred.name)}</div><div style="font-size:11px; color:#666666;">Código Credor: <strong>${cred.id}</strong>${cred.cpf ? ' | CPF: ' + cred.cpf : ''}${cred.cnpj ? ' | CNPJ: ' + cred.cnpj : ''}</div>`;
        
        item.onmouseover = () => item.style.background = '#eef7f2';
        item.onmouseout = () => item.style.background = '#ffffff';

        item.onmousedown = (e) => {
          e.preventDefault();
          dropdown.remove();
          document.getElementById('uf-creditor').value = cred.id;
          document.getElementById('uf-name').value = cred.name;
          AdminPage.autoFillCreditor(cred.id);
        };
        dropdown.appendChild(item);
      });

      const parentField = input.closest('.field') || input.parentNode;
      parentField.style.position = 'relative';
      parentField.style.zIndex = '10000';
      parentField.appendChild(dropdown);

      document.addEventListener('mousedown', function onClickOutside(e) {
        if (!dropdown.contains(e.target) && e.target !== input) {
          dropdown.remove();
          document.removeEventListener('mousedown', onClickOutside);
        }
      });
    } catch(e) {
      console.warn('Creditor search error:', e);
    }
  },

  async autoFillCreditor(code) {
    if (!code) {
      document.getElementById('uf-name').value = '';
      document.getElementById('uf-email').value = '';
      return;
    }
    
    let cred = window.siengeCreditors ? window.siengeCreditors.find(c => c.id == code) : null;
    let fetchStatus = 'NotFetched';
    
    try {
      const credRes = await fetch(`/api/sienge/creditors/${code}`);
      if (credRes.ok) {
        const liveCred = await credRes.json();
        if (liveCred) {
          cred = liveCred;
          fetchStatus = 'LiveOK';
        }
      } else {
        fetchStatus = 'HTTP' + credRes.status;
      }
    } catch (e) {
      console.warn('Live creditor fetch error:', e);
      fetchStatus = 'Err:' + e.message;
    }

    if (cred) {
      document.getElementById('uf-name').value = cred.name || '';
      
      let email = '';
      if (cred.contacts && cred.contacts.length > 0) {
        const cEmail = cred.contacts.find(c => c.email && c.email.trim() !== '');
        if (cEmail) email = cEmail.email.trim();
      }
      if (!email && cred.otherContactMethods && cred.otherContactMethods.length > 0) {
        // Look for any string with @ in any property, just to be safe
        const oEmail = cred.otherContactMethods.find(o => 
          (o.address && o.address.includes('@')) || 
          (o.email && o.email.includes('@')) ||
          (o.contact && typeof o.contact === 'string' && o.contact.includes('@'))
        );
        if (oEmail) {
           email = (oEmail.address || oEmail.email || oEmail.contact || '').trim();
        }
      }
      
      if (!email) {
         // fallback: show debug info
         document.getElementById('uf-email').placeholder = `[${fetchStatus}] c:${cred.contacts?.length||0} o:${cred.otherContactMethods?.length||0}`;
         document.getElementById('uf-email').value = '';
      } else {
         document.getElementById('uf-email').value = email;
      }
    } else {
      document.getElementById('uf-name').value = '';
      document.getElementById('uf-email').value = '';
    }

    try {
      let pixKeyToFill = null;
      let bankInfoToFill = null;
      let paymentFormToFill = null;

      try {
        const pixRes = await Api.getCreditorPixInformations(code);
        if (pixRes && pixRes.results && pixRes.results.length > 0) {
          const pixInfo = pixRes.results.find(p => p.defaultFlag === 'S') || pixRes.results[0];
          pixKeyToFill = pixInfo.pixKey || pixInfo.cpf || pixInfo.cnpj || '';
          paymentFormToFill = 'PIX';
        }
      } catch(e) {
        console.warn('PIX info fetch error:', e);
      }

      try {
        const bankRes = await Api.getCreditorBankInformations(code);
        if (bankRes && bankRes.results && bankRes.results.length > 0) {
          const bankInfo = bankRes.results.find(b => b.defaultFlag === 'S') || bankRes.results[0];
          
          if (!paymentFormToFill && bankInfo.paymentForm === 'PIX') {
            paymentFormToFill = 'PIX';
            if (!pixKeyToFill) {
               pixKeyToFill = bankInfo.cpf || bankInfo.cnpj || '';
            }
          } else if (!paymentFormToFill) {
            paymentFormToFill = (String(bankInfo.bank).includes('341')) ? 'Depósito Itaú' : 'TED';
            bankInfoToFill = bankInfo;
          }
        }
      } catch(e) {
        console.warn('Bank info fetch error:', e);
      }

      if (paymentFormToFill) {
        document.getElementById('uf-payment').value = paymentFormToFill;
        AdminPage.onPaymentMethodChange();

        if (paymentFormToFill === 'PIX') {
          document.getElementById('uf-pix').value = pixKeyToFill || '';
        } else if ((paymentFormToFill === 'TED' || paymentFormToFill === 'Depósito Itaú') && bankInfoToFill) {
          document.getElementById('uf-bank').value = bankInfoToFill.bank || '';
          document.getElementById('uf-agency').value = bankInfoToFill.agency || '';
          let acc = bankInfoToFill.accountNumber || '';
          if (bankInfoToFill.checkDigit) acc += '-' + bankInfoToFill.checkDigit;
          document.getElementById('uf-account').value = acc;
        }
        toast('Dados bancários importados do Sienge', 'success');
      }
    } catch(err) {
      console.warn('Bank info fetch error:', err);
    }
  },

  async sendPasswordEmail() {
    const emailInput = document.getElementById('uf-email');
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email) {
      toast('Preencha o campo de e-mail primeiro', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast('Digite um e-mail válido', 'warning');
      return;
    }

    try {
      await Api.sendPasswordEmail(email);
      toast('E-mail enviado com sucesso!', 'success');
    } catch(err) {
      toast(err.message || 'Erro ao enviar e-mail', 'error');
    }
  },

  getFunctionRank(name) {
    if (!name) return 999;
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (n.includes('diretor')) return 1;
    if (n.includes('gestor') || n.includes('gerente')) return 2;
    if (n.includes('supervisor') || n.includes('coordenador')) return 3;
    if (n.includes('colaborador')) return 4;
    return 4;
  },

  renderApproverRules() {
    const container = document.getElementById('scope-rules-container');
    if (!container) return;
    const { jobFunctions = [], ccs = [] } = AdminPage._modalData || {};
    const rules = AdminPage._approverRules || [{ function_ids: [], department_ids: [] }];

    container.innerHTML = rules.map((rule, idx) => {
      const fIds = (rule.function_ids || []).map(String);
      const dIds = (rule.department_ids || []).map(String);

      return `
        <div class="scope-rule-row" data-row-index="${idx}" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; align-items: start; ${idx > 0 ? 'padding-top: 14px; border-top: 1px dashed var(--border);' : ''}">
          <div class="field required" style="margin: 0;">
            <label>Função *</label>
            <div class="custom-multiselect" tabindex="0" onfocusout="if(!this.contains(event.relatedTarget)) this.querySelector('.ms-options').classList.add('hidden')">
              <div class="ms-selected" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span id="uf-scope-func-opts-${idx}-text">Selecione...</span>
                <span style="font-size:10px;">▼</span>
              </div>
              <div class="ms-options hidden" id="uf-scope-func-opts-${idx}">
                <label style="border-bottom: 1px solid var(--border); margin-bottom: 4px;"><input type="checkbox" onchange="const chks = this.closest('.ms-options').querySelectorAll('.uf-chk-scope-func'); chks.forEach(c => { if (c.closest('label').style.display !== 'none' && !c.disabled) c.checked = this.checked; }); AdminPage.onApproverFunctionChange(${idx});"> <strong>Marcar todos</strong></label>
                ${jobFunctions.map(jf => `<label class="uf-lbl-scope-func" data-id="${jf.id}" data-name="${escHtml(jf.name)}"><input type="checkbox" class="uf-chk-scope-func" value="${jf.id}" data-name="${escHtml(jf.name)}" ${fIds.includes(String(jf.id)) ? 'checked' : ''} onchange="AdminPage.onApproverFunctionChange(${idx})"> ${escHtml(jf.name)}</label>`).join('')}
              </div>
            </div>
          </div>
          <div class="field required scope-dept-col" style="margin: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="margin: 0;">Departamento *</label>
              ${idx > 0 ? `<button type="button" class="btn-remove-rule" onclick="AdminPage.removeApproverRuleRow(${idx})" style="background: none; border: none; color: var(--danger, #dc2626); cursor: pointer; font-size: 12px; font-weight: 600; padding: 0; line-height: 1;" title="Remover regra">✕ Remover</button>` : ''}
            </div>
            <div id="scope-dept-multi-${idx}" class="custom-multiselect scope-dept-multi" tabindex="0" onfocusout="if(!this.contains(event.relatedTarget)) this.querySelector('.ms-options').classList.add('hidden')">
              <div class="ms-selected" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span id="uf-scope-dept-opts-${idx}-text">Selecione...</span>
                <span style="font-size:10px;">▼</span>
              </div>
              <div class="ms-options hidden" id="uf-scope-dept-opts-${idx}">
                <label style="border-bottom: 1px solid var(--border); margin-bottom: 4px;"><input type="checkbox" onchange="const chks = this.closest('.ms-options').querySelectorAll('.uf-chk-scope-dept:not(:disabled)'); chks.forEach(c => c.checked = this.checked); AdminPage.updateMsText('uf-scope-dept-opts-${idx}');"> <strong>Marcar todos</strong></label>
                ${ccs.map(cc => `<label><input type="checkbox" class="uf-chk-scope-dept" value="${cc.id}" ${dIds.includes(String(cc.id)) ? 'checked' : ''} onchange="AdminPage.updateMsText('uf-scope-dept-opts-${idx}')"> ${cc.code ? escHtml(cc.code) + ' | ' : ''}${escHtml(cc.name)}</label>`).join('')}
              </div>
            </div>
            ${idx === 0 ? `<input type="text" id="scope-dept-fixed" readonly style="display:none; background-color: var(--bg); color: var(--text-3); cursor: not-allowed; border: 1.5px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 14px; width: 100%; box-sizing: border-box;" value="Selecione o departamento principal..." />` : ''}
          </div>
        </div>
      `;
    }).join('');

    AdminPage.filterScopeFunctions();
    rules.forEach((_, idx) => {
      AdminPage.updateMsText(`uf-scope-func-opts-${idx}`);
      AdminPage.updateMsText(`uf-scope-dept-opts-${idx}`);
    });
  },

  onApproverFunctionChange(changedIdx) {
    AdminPage.syncApproverRulesFromDom();
    AdminPage.filterScopeFunctions();
    const rows = document.querySelectorAll('.scope-rule-row');
    rows.forEach((_, idx) => {
      AdminPage.updateMsText(`uf-scope-func-opts-${idx}`);
    });
  },

  filterScopeFunctions() {
    const funcSelect = document.getElementById('uf-job-function');
    const selectedFuncText = funcSelect ? (funcSelect.options[funcSelect.selectedIndex]?.text || '') : '';
    const userRank = funcSelect && funcSelect.value ? AdminPage.getFunctionRank(selectedFuncText) : 999;

    const rows = document.querySelectorAll('.scope-rule-row');
    if (!rows || rows.length === 0) return;

    // Collect checked functions per row
    const rowCheckedFuncs = [];
    rows.forEach((row, idx) => {
      const container = row.querySelector(`#uf-scope-func-opts-${idx}`);
      const checkedVals = container ? Array.from(container.querySelectorAll('.uf-chk-scope-func:checked')).map(c => String(c.value)) : [];
      rowCheckedFuncs.push(new Set(checkedVals));
    });

    // For each row:
    // Functions chosen in other rows must not appear in this row!
    rows.forEach((row, idx) => {
      const container = row.querySelector(`#uf-scope-func-opts-${idx}`);
      if (!container) return;

      const checkedInOtherRows = new Set();
      rowCheckedFuncs.forEach((set, otherIdx) => {
        if (otherIdx !== idx) {
          set.forEach(val => checkedInOtherRows.add(val));
        }
      });

      const labels = container.querySelectorAll('label.uf-lbl-scope-func');
      labels.forEach(lbl => {
        const funcId = lbl.getAttribute('data-id') || lbl.querySelector('.uf-chk-scope-func')?.value;
        const funcName = lbl.getAttribute('data-name') || lbl.textContent.trim();
        const targetRank = AdminPage.getFunctionRank(funcName);
        const chk = lbl.querySelector('.uf-chk-scope-func');

        const isAllowedByRank = (userRank === 999) || (targetRank >= userRank);
        const isSelectedElsewhere = checkedInOtherRows.has(String(funcId));
        const isAllowed = isAllowedByRank && !isSelectedElsewhere;

        if (isAllowed) {
          lbl.style.display = 'flex';
          if (chk) chk.disabled = false;
        } else {
          lbl.style.display = 'none';
          if (chk) {
            chk.checked = false;
            chk.disabled = true;
          }
        }
      });

      AdminPage.updateMsText(`uf-scope-func-opts-${idx}`);
    });
  },

  addApproverRuleRow() {
    AdminPage.syncApproverRulesFromDom();

    const funcSelect = document.getElementById('uf-job-function');
    const selectedFuncText = funcSelect ? (funcSelect.options[funcSelect.selectedIndex]?.text || '') : '';
    const userRank = funcSelect && funcSelect.value ? AdminPage.getFunctionRank(selectedFuncText) : 1;

    const allFunctions = (AdminPage._modalData?.jobFunctions && AdminPage._modalData.jobFunctions.length > 0)
      ? AdminPage._modalData.jobFunctions
      : [];

    const availableFunctions = allFunctions.filter(jf => {
      const targetRank = AdminPage.getFunctionRank(jf.name);
      return targetRank >= userRank;
    });

    const allSelectedFuncIds = new Set((AdminPage._approverRules || []).flatMap(r => (r.function_ids || []).map(String)));

    if (availableFunctions.length > 0 && allSelectedFuncIds.size >= availableFunctions.length) {
      toast('Todas as funções permitidas já foram adicionadas em regras de aprovação.', 'info');
      return;
    }

    if (!AdminPage._approverRules) AdminPage._approverRules = [];
    AdminPage._approverRules.push({ function_ids: [], department_ids: [] });
    AdminPage.renderApproverRules();
    AdminPage.onJobRoleChange();
  },

  removeApproverRuleRow(idx) {
    AdminPage.syncApproverRulesFromDom();
    if (AdminPage._approverRules && AdminPage._approverRules.length > idx) {
      AdminPage._approverRules.splice(idx, 1);
    }
    if (!AdminPage._approverRules || AdminPage._approverRules.length === 0) {
      AdminPage._approverRules = [{ function_ids: [], department_ids: [] }];
    }
    AdminPage.renderApproverRules();
    AdminPage.onJobRoleChange();
  },

  syncApproverRulesFromDom() {
    const rows = document.querySelectorAll('.scope-rule-row');
    if (!rows || rows.length === 0) return;
    const newRules = [];
    rows.forEach((row, idx) => {
      const funcContainer = row.querySelector(`#uf-scope-func-opts-${idx}`);
      const deptContainer = row.querySelector(`#uf-scope-dept-opts-${idx}`);
      const fIds = funcContainer ? Array.from(funcContainer.querySelectorAll('.uf-chk-scope-func:checked')).map(c => parseInt(c.value)) : [];
      const dIds = deptContainer ? Array.from(deptContainer.querySelectorAll('.uf-chk-scope-dept:checked')).map(c => parseInt(c.value)) : [];
      newRules.push({ function_ids: fIds, department_ids: dIds });
    });
    AdminPage._approverRules = newRules;
  },

  onJobRoleChange() {
    const roleSelect = document.getElementById('uf-job-role');
    const funcSelect = document.getElementById('uf-job-function');
    if (!roleSelect) return;
    
    const roleText = roleSelect.options[roleSelect.selectedIndex]?.text.toLowerCase() || '';
    const isApprover = roleText.includes('aprov');
    const isAdmin = roleText.includes('admin');
    const isFinance = roleText.includes('financ');
    
    const funcText = funcSelect ? (funcSelect.options[funcSelect.selectedIndex]?.text.toLowerCase() || '') : '';
    const userRank = AdminPage.getFunctionRank(funcText);
    const isGestorOrDiretor = userRank <= 2;
    
    const scopeFields = document.getElementById('scope-fields');
    const addBtn = document.getElementById('btn-add-approver-rule');
    const deptFixed = document.getElementById('scope-dept-fixed');

    if (isApprover || isAdmin || isFinance) {
      scopeFields.style.display = 'grid';
      
      // "+" button: only for diretor or gestor
      if (addBtn) {
        addBtn.style.display = isGestorOrDiretor ? 'inline-flex' : 'none';
      }

      // If not gestor or diretor, trim extra rows to 1
      if (!isGestorOrDiretor && AdminPage._approverRules && AdminPage._approverRules.length > 1) {
        AdminPage._approverRules = [AdminPage._approverRules[0]];
        AdminPage.renderApproverRules();
      }

      const allDeptMultis = document.querySelectorAll('.scope-dept-multi');
      if (isAdmin || isFinance || (isApprover && isGestorOrDiretor)) {
        allDeptMultis.forEach(el => el.style.display = 'block');
        if (deptFixed) deptFixed.style.display = 'none';
      } else {
        allDeptMultis.forEach(el => el.style.display = 'none');
        if (deptFixed) deptFixed.style.display = 'block';
      }
      AdminPage.syncScopeDeptFixed();
      AdminPage.filterScopeFunctions();
    } else {
      scopeFields.style.display = 'none';
      if (addBtn) addBtn.style.display = 'none';
    }
  },

  syncScopeDeptFixed() {
    const mainDept = document.getElementById('uf-groups');
    const fixedInput = document.getElementById('scope-dept-fixed');
    if (mainDept && mainDept.options[mainDept.selectedIndex]) {
      const selectedVal = mainDept.options[mainDept.selectedIndex].value;
      const selectedText = mainDept.options[mainDept.selectedIndex].text;
      
      if (fixedInput) {
        fixedInput.value = selectedVal ? selectedText : 'Selecione o departamento principal...';
      }
    }
  },

  updateMsText(id) {
    const container = document.getElementById(id);
    if (!container) return;
    const checked = Array.from(container.querySelectorAll('.uf-chk-scope-func:checked, .uf-chk-scope-dept:checked'));
    const textEl = document.getElementById(id + '-text');
    if (!textEl) return;
    if (checked.length === 0) textEl.textContent = 'Selecione...';
    else if (checked.length === 1) textEl.textContent = checked[0].parentNode.textContent.trim();
    else textEl.textContent = checked.length + ' selecionados';

    // Sync "Marcar todos" checkbox state
    const selectAllChk = container.querySelector('input[type="checkbox"]:not(.uf-chk-scope-func):not(.uf-chk-scope-dept)');
    if (selectAllChk) {
      const visibleChks = Array.from(container.querySelectorAll('.uf-chk-scope-func, .uf-chk-scope-dept')).filter(c => c.closest('label').style.display !== 'none' && !c.disabled);
      selectAllChk.checked = visibleChks.length > 0 && visibleChks.every(c => c.checked);
    }
  },

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  async renderCategories() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🏷️ Categorias</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-cats-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'cats-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-add-cat">＋ Nova Categoria</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Nome</th>
              <th>Apropriação Sienge</th>
              <th>Limite Diário</th>
              <th>Requer NF</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="cats-tbody">
            <tr class="loading-row"><td colspan="7">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;

    document.getElementById('btn-add-cat').addEventListener('click', () => this.openCategoryForm());

    try {
      const [cats, plans] = await Promise.all([
        Api.getCategories(),
        Api.getSiengeFinancialPlans().catch(() => [])
      ]);
      
      document.getElementById('cats-tbody').innerHTML = cats.map(c => {
        const fmtCode = (code) => {
          if (!code) return '';
          const s = String(code).trim();
          if (/^\d{7}$/.test(s)) return `${s[0]}.${s.slice(1,3)}.${s.slice(3,5)}.${s.slice(5,7)}`;
          return s;
        };
        const selPlan = (plans || []).find(p => String(p.id || p.code) === String(c.sienge_apportionment_id));
        const appLabel = selPlan
          ? `${escHtml(fmtCode(selPlan.id || selPlan.code))} - ${escHtml(selPlan.name || selPlan.description)}`
          : (c.sienge_apportionment_id ? `${escHtml(fmtCode(c.sienge_apportionment_id))}` : '—');
        
        return `
        <tr data-status="${c.active !== false ? 'active' : 'inactive'}">
          <td style="font-size:22px;text-align:center;">${c.icon}</td>
          <td style="font-weight:600;">${escHtml(c.name)}</td>
          <td><span style="font-size:13px; font-weight:500; color:var(--ml-indigo);">${appLabel}</span></td>
          <td>${c.daily_limit ? fmt(c.daily_limit) + '/dia' : '—'}</td>
          <td>${c.requires_nf ? '<span class="badge badge-aguardando_aprovacao">Obrigatória</span>' : '<span class="badge badge-rascunho">Não</span>'}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <label class="toggle-switch-r">
                <input type="checkbox" ${c.active ? 'checked' : ''} onchange="AdminPage.toggleCategoryStatus(${c.id}, this.checked); this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('cats-tbody');">
                <span class="toggle-slider-r"></span>
              </label>
              <span style="font-size:13px; font-weight:500; color:var(--text-2);">${c.active ? 'Ativa' : 'Inativa'}</span>
            </div>
          </td>
          <td>
            <div class="td-actions">
              <button class="action-btn" title="Editar" onclick="AdminPage.openCategoryForm(${c.id})">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
      this.applyCurrentFilter('cats-tbody');
    } catch(err) {
      document.getElementById('cats-tbody').innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async openCategoryForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    let cat = null;
    if (id) {
      const cats = await Api.getCategories();
      cat = cats.find(c => c.id === id);
    }

    let plans = [];
    try {
      plans = await Api.getSiengeFinancialPlans();
      if (!plans || plans.length === 0) {
         await Api.syncSiengeFinancialPlans();
         plans = await Api.getSiengeFinancialPlans();
      }
    } catch(e) {}
    
    const selPlan = plans.find(p => String(p.id || p.code) === String(cat?.sienge_apportionment_id));
    const selPlanName = selPlan ? escHtml(selPlan.description || selPlan.name) : '';
    const initialPlanId = cat?.sienge_apportionment_id != null ? String(cat.sienge_apportionment_id) : '';

    const html = `
      <div class="form-grid">
        <div class="field required">
          <label for="cf-name">Nome</label>
          <input type="text" id="cf-name" value="${escHtml(cat?.name || '')}" placeholder="Ex: Refeição" />
        </div>
        <div class="field">
          <label for="cf-icon">Ícone (emoji)</label>
          <input type="text" id="cf-icon" value="${cat?.icon || '📄'}" maxlength="4" style="font-size:18px;" />
        </div>
        <div class="field">
          <label for="cf-limit">Limite Diário (R$)</label>
          <input type="number" id="cf-limit" min="0" step="0.01" value="${cat?.daily_limit != null ? cat.daily_limit : ''}" ${(cat == null || cat.daily_limit == null) ? 'disabled' : ''} />
          <label style="display:flex; align-items:center; gap:6px; margin-top:8px; cursor:pointer; font-weight:normal; font-size:13px; color:var(--text-2);">
            <input type="checkbox" id="cf-no-limit" ${(cat == null || cat.daily_limit == null) ? 'checked' : ''} style="width:auto; margin:0;" onchange="document.getElementById('cf-limit').disabled = this.checked; if(this.checked) document.getElementById('cf-limit').value = '';" />
            Categoria sem limite de gastos
          </label>
        </div>
        <div class="field" style="position:relative;">
          <label>Apropriação Financeira Sienge</label>
          <input type="text" id="cf-app-input" value="${selPlanName}" placeholder="Digite para buscar..." autocomplete="off" data-selected-id="${initialPlanId}" />
          <div id="cf-app-list" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:200px; overflow-y:auto; background:#fff; border:1px solid #d1d5db; border-radius:4px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); z-index:999;"></div>
        </div>
        <div class="field">
          <label>Requer Nota Fiscal?</label>
          <select id="cf-nf">
            <option value="false" ${!cat?.requires_nf ? 'selected' : ''}>Não</option>
            <option value="true" ${cat?.requires_nf ? 'selected' : ''}>Sim</option>
          </select>
        </div>
      </div>
      <div id="cf-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;

    Modal.open(id ? 'Editar Categoria' : 'Nova Categoria', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-primary" id="save-cat-btn">💾 Salvar</button>`
    );

    const appInput = document.getElementById('cf-app-input');
    const appList = document.getElementById('cf-app-list');
    
    appInput.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        appList.innerHTML = '';
        delete this.dataset.selectedId;
        if (!val) {
            appList.style.display = 'none';
            return;
        }
        
        let count = 0;
        plans.forEach(p => {
            const pName = p.description || p.name;
            if (pName && pName.toLowerCase().includes(val) && count < 30) {
                const div = document.createElement('div');
                div.style.cssText = 'padding:10px; cursor:pointer; border-bottom:1px solid #f3f4f6; font-size:13px; color:var(--text-1);';
                div.onmouseover = () => div.style.backgroundColor = '#f3f4f6';
                div.onmouseout = () => div.style.backgroundColor = 'transparent';
                
                const idx = pName.toLowerCase().indexOf(val);
                div.innerHTML = pName.substring(0, idx) + '<strong>' + pName.substring(idx, idx + val.length) + '</strong>' + pName.substring(idx + val.length);
                
                div.addEventListener('click', function() {
                    appInput.value = pName;
                    appInput.dataset.selectedId = String(p.id || p.code || '');
                    appList.style.display = 'none';
                });
                appList.appendChild(div);
                count++;
            }
        });
        
        appList.style.display = count > 0 ? 'block' : 'none';
    });

    document.addEventListener('click', function(e) {
        if (e.target !== appInput && appList) {
            appList.style.display = 'none';
        }
    });

    document.getElementById('save-cat-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('cf-error');
      errEl.classList.add('hidden');
      const name = document.getElementById('cf-name').value.trim();
      if (!name) {
        errEl.textContent = 'O nome é obrigatório.';
        errEl.classList.remove('hidden');
        return;
      }
      const body = {
        name,
        icon: document.getElementById('cf-icon').value || '📄',
        daily_limit: document.getElementById('cf-no-limit').checked ? null : (parseFloat(document.getElementById('cf-limit').value) || 0),
        sienge_apportionment_id: (() => {
          const appName = document.getElementById('cf-app-input').value.trim();
          if (!appName) return null;
          const selectedId = document.getElementById('cf-app-input').dataset.selectedId;
          if (selectedId) return selectedId;
          const p = plans.find(p => (p.description || p.name) === appName);
          return p ? String(p.id || p.code) : null;
        })(),
        requires_nf: document.getElementById('cf-nf').value === 'true',
        active: true,
      };
      const btn = document.getElementById('save-cat-btn');
      btn.disabled = true;
      try {
        if (id) await Api.updateCategory(id, body);
        else await Api.createCategory(body);
        toast(id ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
        Modal.close();
        this.renderCategories();
      } catch(err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
      }
    });
  },

  async toggleCategoryStatus(id, active) {
    try {
      const cats = await Api.getCategories();
      const cat = cats.find(c => c.id === id);
      if (cat) {
        await Api.updateCategory(id, { ...cat, active });
        toast(active ? 'Categoria ativada' : 'Categoria desativada', 'success');
      }
      this.renderCategories();
    } catch(err) {
      toast(err.message, 'error');
    }
  },

  // ── DEPARTAMENTOS ──────────────────────────────────────────────────────────
  async renderCostCenters() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🏢 Departamento Sienge</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-cc-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'cc-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary" onclick="AdminPage.syncSiengeDepartments()">🔄 Sincronizar Sienge</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Código</th><th>Nome</th><th>Status</th></tr>
          </thead>
          <tbody id="cc-tbody">
            <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;

    try {
      let depts = await Api.getSiengeDepartments();
      if (!depts || depts.length === 0) {
         toast('Buscando dados no Sienge...', 'info');
         await Api.syncSiengeDepartments();
         depts = await Api.getSiengeDepartments();
      }

      const localDepts = _db.sienge_departments || [];
      depts.forEach(d => {
        const found = localDepts.find(ld => String(ld.id) === String(d.id));
        if (found) d.active = found.active;
      });

      if (!depts || depts.length === 0) {
         document.getElementById('cc-tbody').innerHTML = `<tr><td colspan="3">Nenhum departamento encontrado.</td></tr>`;
      } else {
        document.getElementById('cc-tbody').innerHTML = depts.map(d => `
        <tr data-status="${d.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:700;color:var(--ml-indigo);font-family:monospace;">${escHtml(String(d.id))}</td>
            <td style="font-weight:600;">${escHtml(d.name)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${d.active !== false ? 'checked' : ''} onchange="AdminPage.toggleSiengeDeptStatus('${d.id}', this.checked); this.parentElement.nextElementSibling.textContent = this.checked ? 'Ativo' : 'Inativo'; this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('cc-tbody');">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:14px;font-weight:500;">${d.active !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
          </tr>`).join('');
      }
      this.applyCurrentFilter('cc-tbody');
    } catch (err) {
      document.getElementById('cc-tbody').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  toggleSiengeDeptStatus(id, active) {
    if (!_db.sienge_departments) _db.sienge_departments = [];
    let d = _db.sienge_departments.find(x => String(x.id) === String(id));
    if (!d) {
      d = { id: id, active: active };
      _db.sienge_departments.push(d);
    } else {
      d.active = active;
    }
    _saveDb();
    toast('Status atualizado', 'success');
  },

  async syncSiengeDepartments() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    toast('Sincronizando departamentos...', 'info');
    await Api.syncSiengeDepartments();
    toast('Sincronização concluída.', 'success');
    this.renderCostCenters();
  },

  // ── POLICIES ──────────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────────────────────────────
    // ROLES (Funções)
    // ────────────────────────────────────────────────────────────────────────────────
    async renderRoles() {
      const el = document.getElementById('admin-section-content');
      el.innerHTML = `
        <style>
          .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
          .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
          .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
          .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
          .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
          .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
        </style>
        <div class="table-wrapper">
          <div class="table-header">
            <span class="card-title">👨‍💼 Perfil</span>
            <div style="display:flex; gap:10px; align-items:center;">
              <select id="filter-role-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'role-tbody')">
                <option value="active" selected>Somente Ativos</option>
                <option value="all">Todos</option>
                <option value="inactive">Somente Inativos</option>
              </select>
              <button class="btn btn-primary btn-sm" id="btn-add-role">➕ Novo Perfil</button>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Nome</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody id="role-tbody">
              <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
            </tbody>
          </table>
        </div>`;

      document.getElementById('btn-add-role').addEventListener('click', () => this.openRoleForm());

      try {
        const roles = await Api.getJobRoles();
        document.getElementById('role-tbody').innerHTML = roles.map(r => `
        <tr data-status="${r.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:600;">${escHtml(r.name)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${r.active ? 'checked' : ''} onchange="AdminPage.toggleRoleStatus(${r.id}, this.checked); this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive';">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:14px;font-weight:500;">${r.active ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
            <td>
              <div class="td-actions">
                <button class="action-btn" onclick="AdminPage.openRoleForm(${r.id})">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>`).join('');
      this.applyCurrentFilter('role-tbody');
    } catch(err) {
        document.getElementById('role-tbody').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
      }
    },

    async openRoleForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

      let role = null;
      if (id) {
        const roles = await Api.getJobRoles();
        role = roles.find(r => r.id === id);
      }
      const html = `
        <div class="form-grid">
          <div class="field required span-2">
            <label for="role-name">Nome do Perfil</label>
            <input type="text" id="role-name" value="${escHtml(role?.name || '')}" placeholder="Ex: Gerente de Projetos" />
          </div>
        </div>
        <div id="role-error" class="login-error hidden" style="margin-top:12px;"></div>
      `;

      Modal.open(id ? 'Editar Perfil' : 'Novo Perfil', html,
        `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
         <button class="btn btn-primary" id="save-role-btn">✔️ Salvar</button>`
      );

      document.getElementById('save-role-btn').addEventListener('click', async () => {
        const btn = document.getElementById('save-role-btn');
        const errEl = document.getElementById('role-error');
        errEl.classList.add('hidden');

        const name = document.getElementById('role-name').value.trim();
        const active = role ? role.active : true;

        if (!name) {
          errEl.textContent = 'Preencha o nome do perfil.';
          errEl.classList.remove('hidden');
          return;
        }

        btn.disabled = true;
        try {
          if (id) await Api.updateJobRole(id, { name, active });
          else await Api.createJobRole({ name, active });
          Modal.close();
          toast(id ? 'Perfil atualizado' : 'Perfil criado', 'success');
          this.renderRoles();
        } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); btn.disabled = false; }
      });
    },

    async toggleRoleStatus(id, active) {
      try {
        await Api.updateJobRole(id, { active });
        toast(active ? 'Perfil ativado' : 'Perfil desativado', 'success');
        this.renderRoles();
      } catch(err) {
        toast(err.message, 'error');
        this.renderRoles();
      }
    },

    async renderFunctions() {
      const el = document.getElementById('admin-section-content');
      el.innerHTML = `
        <style>
          .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
          .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
          .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
          .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
          .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
          .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
        </style>
        <div class="table-wrapper">
          <div class="table-header">
            <span class="card-title">💼 Função</span>
            <div style="display:flex; gap:10px; align-items:center;">
              <select id="filter-func-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'func-tbody')">
                <option value="active" selected>Somente Ativos</option>
                <option value="all">Todos</option>
                <option value="inactive">Somente Inativos</option>
              </select>
              <button class="btn btn-primary btn-sm" id="btn-add-func">➕ Nova Função</button>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Nome</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody id="func-tbody">
              <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
            </tbody>
          </table>
        </div>`;

      document.getElementById('btn-add-func').addEventListener('click', () => this.openFuncForm());
      try {
        const funcs = await Api.getJobFunctions();
        document.getElementById('func-tbody').innerHTML = funcs.map(f => `
        <tr data-status="${f.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:600;">${escHtml(f.name)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${f.active ? 'checked' : ''} onchange="AdminPage.toggleFuncStatus(${f.id}, this.checked); this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive';">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:14px;font-weight:500;">${f.active ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
            <td>
              <div class="td-actions">
                <button class="action-btn" title="Editar" onclick="AdminPage.openFuncForm(${f.id})">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>`).join('');
        this.applyCurrentFilter('func-tbody');
      } catch(err) {
        document.getElementById('func-tbody').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
      }
    },

    async openFuncForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

      let func = null;
      if (id) {
        const funcs = await Api.getJobFunctions();
        func = funcs.find(f => f.id === id);
      }
      const html = `
        <div class="form-grid">
          <div class="field required span-2">
            <label for="func-name">Nome da Função</label>
            <input type="text" id="func-name" value="${escHtml(func?.name || '')}" placeholder="Ex: Colaborador" />
          </div>
        </div>
        <div id="func-error" class="login-error hidden" style="margin-top:12px;"></div>
      `;

      Modal.open(id ? 'Editar Função' : 'Nova Função', html,
        `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
         <button class="btn btn-primary" id="save-func-btn">✔️ Salvar</button>`
      );

      document.getElementById('save-func-btn').addEventListener('click', async () => {
        const btn = document.getElementById('save-func-btn');
        const errEl = document.getElementById('func-error');
        errEl.classList.add('hidden');

        const name = document.getElementById('func-name').value.trim();
        const active = func ? func.active : true;

        if (!name) {
          errEl.textContent = 'Preencha o nome da função.';
          errEl.classList.remove('hidden');
          return;
        }

        btn.disabled = true;
        try {
          if (id) await Api.updateJobFunction(id, { name, active });
          else await Api.createJobFunction({ name, active });
          Modal.close();
          toast(id ? 'Função atualizada' : 'Função criada', 'success');
          this.renderFunctions();
        } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); btn.disabled = false; }
      });
    },

    async toggleFuncStatus(id, active) {
      try {
        await Api.updateJobFunction(id, { active });
        toast(active ? 'Função ativada' : 'Função desativada', 'success');
        this.renderFunctions();
      } catch(err) {
        toast(err.message, 'error');
        this.renderFunctions();
      }
    },

  async renderSiengeCostCenters() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
        .cc-company-select {
          width: 100%;
          max-width: 280px;
          padding: 6px 10px;
          font-size: 13px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background-color: var(--surface);
          color: var(--text-1);
          outline: none;
          transition: border-color 0.2s;
        }
        .cc-company-select:focus {
          border-color: var(--ml-indigo);
        }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🏢 Centros de Custo</span>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="search-sienge-cc" placeholder="🔍 Buscar por código ou nome..." oninput="AdminPage.filterSiengeCCTable()" style="padding:6px 12px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text-1); min-width:240px; outline:none;" />
            <select id="filter-sienge-cc-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'sienge-cc-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary" onclick="AdminPage.syncSiengeCostCenters()">🔄 Sincronizar Sienge</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Código</th><th>Nome</th><th>Empresa</th><th>Status</th></tr>
          </thead>
          <tbody id="sienge-cc-tbody">
            <tr class="loading-row"><td colspan="4">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;
    
    try {
      const [ccsRes, companiesRes] = await Promise.all([
        Api.getSiengeCostCenters(),
        Api.getSiengeCompanies().catch(() => [])
      ]);

      let ccs = ccsRes;
      if (!ccs || ccs.length === 0) {
         toast('Buscando dados no Sienge...', 'info');
         await Api.syncSiengeCostCenters();
         ccs = await Api.getSiengeCostCenters();
      }

      // Constar apenas empresas com status ativa
      const activeCompanies = (companiesRes || []).filter(comp => comp.active !== false);
      activeCompanies.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const localCcs = _db.sienge_cost_centers || [];
      ccs.forEach(c => {
        const found = localCcs.find(lc => String(lc.id || lc.code) === String(c.id || c.code));
        if (found) {
          if (c.company_id != null) {
            found.company_id = c.company_id;
          } else if (found.company_id !== undefined) {
            c.company_id = found.company_id;
          }
          if (c.active !== undefined) {
            found.active = c.active;
          } else if (found.active !== undefined) {
            c.active = found.active;
          }
        }
      });
      _saveDb();

      if (!ccs || ccs.length === 0) {
         document.getElementById('sienge-cc-tbody').innerHTML = `<tr><td colspan="4">Nenhum centro de custo encontrado.</td></tr>`;
      } else {
        document.getElementById('sienge-cc-tbody').innerHTML = ccs.map(cc => {
          const selectedCompId = cc.company_id != null ? String(cc.company_id) : (cc.idCompany != null ? String(cc.idCompany) : '');

          return `
          <tr data-status="${cc.active !== false ? 'active' : 'inactive'}">
              <td style="font-weight:700;color:var(--ml-indigo);font-family:monospace;">${escHtml(String(cc.id || cc.code || ''))}</td>
              <td style="font-weight:600;">${escHtml(cc.name)}</td>
              <td>
                <select class="cc-company-select" onchange="AdminPage.updateCostCenterCompany('${cc.id || cc.code}', this.value)">
                  <option value="">Selecione uma empresa...</option>
                  ${activeCompanies.map(comp => {
                    const isSelected = cc.company_id != null 
                      ? String(comp.id) === String(cc.company_id)
                      : (cc.idCompany != null ? String(comp.code) === String(cc.idCompany) : false);
                    return `<option value="${comp.id}" ${isSelected ? 'selected' : ''}>${escHtml(comp.name || comp.tradeName || ('Empresa ' + comp.code))}</option>`;
                  }).join('')}
                </select>
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <label class="toggle-switch-r">
                    <input type="checkbox" ${cc.active !== false ? 'checked' : ''} onchange="AdminPage.toggleSiengeCCStatus('${cc.id || cc.code}', this.checked); this.parentElement.nextElementSibling.textContent = this.checked ? 'Ativo' : 'Inativo'; this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.filterSiengeCCTable();">
                    <span class="toggle-slider-r"></span>
                  </label>
                  <span style="font-size:14px;font-weight:500;">${cc.active !== false ? 'Ativo' : 'Inativo'}</span>
                </div>
              </td>
            </tr>`;
        }).join('');
      }

      this.applyCurrentFilter('sienge-cc-tbody');
    } catch (err) {
      document.getElementById('sienge-cc-tbody').innerHTML = `<tr><td colspan="4" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async updateCostCenterCompany(ccId, companyId) {
    const compId = companyId ? parseInt(companyId) : null;
    if (!_db.sienge_cost_centers) _db.sienge_cost_centers = [];
    let cc = _db.sienge_cost_centers.find(c => String(c.id || c.code) === String(ccId));
    if (!cc) {
      cc = { id: ccId, company_id: compId };
      _db.sienge_cost_centers.push(cc);
    } else {
      cc.company_id = compId;
    }
    _saveDb();
    try {
      await Api.updateCostCenterCompany(ccId, compId);
      toast('Empresa vinculada com sucesso', 'success');
    } catch (e) {
      toast('Erro ao vincular empresa: ' + e.message, 'error');
    }
  },

  async toggleSiengeCCStatus(id, active) {
    if (!_db.sienge_cost_centers) _db.sienge_cost_centers = [];
    let cc = _db.sienge_cost_centers.find(c => String(c.id || c.code) === String(id));
    if (!cc) {
      cc = { id: id, active: active };
      _db.sienge_cost_centers.push(cc);
    } else {
      cc.active = active;
    }
    _saveDb();
    try {
      await Api.put(`/api/admin/cost-centers/toggle-status/${id}`, { active: active });
    } catch(e) {}
    toast('Status atualizado com sucesso', 'success');
  },

  async syncSiengeCostCenters() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    toast('Sincronizando centros de custo...', 'info');
    await Api.syncSiengeCostCenters();
    toast('Sincronização concluída.', 'success');
    this.renderSiengeCostCenters();
  },

  async renderSiengeCompanies() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🏢 Empresas</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-sienge-companies-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'sienge-companies-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary" onclick="AdminPage.syncSiengeCompanies()">🔄 Sincronizar Sienge</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Código</th><th>Descrição</th><th>Status</th></tr>
          </thead>
          <tbody id="sienge-companies-tbody">
            <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;
    
    try {
      let comps = await Api.getSiengeCompanies();
      if (!comps || comps.length === 0) {
         toast('Buscando empresas no Sienge...', 'info');
         await Api.syncSiengeCompanies();
         comps = await Api.getSiengeCompanies();
      }

      const localComps = _db.sienge_companies || [];
      comps.forEach(c => {
        const found = localComps.find(lc => String(lc.id || lc.code) === String(c.id || c.code));
        if (found) c.active = found.active;
      });

      if (!comps || comps.length === 0) {
         document.getElementById('sienge-companies-tbody').innerHTML = `<tr><td colspan="3">Nenhuma empresa encontrada.</td></tr>`;
      } else {
        document.getElementById('sienge-companies-tbody').innerHTML = comps.map(c => `
        <tr data-status="${c.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:700;color:var(--ml-indigo);font-family:monospace;">${escHtml(String(c.id || c.code || ''))}</td>
            <td style="font-weight:600;">${escHtml(c.name || c.tradeName || '')}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${c.active !== false ? 'checked' : ''} onchange="AdminPage.toggleSiengeCompanyStatus('${c.id || c.code}', this.checked); this.parentElement.nextElementSibling.textContent = this.checked ? 'Ativo' : 'Inativo'; this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('sienge-companies-tbody');">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:14px;font-weight:500;">${c.active !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
          </tr>`).join('');
      }
      this.applyCurrentFilter('sienge-companies-tbody');
    } catch (err) {
      document.getElementById('sienge-companies-tbody').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async toggleSiengeCompanyStatus(id, active) {
    if (!_db.sienge_companies) _db.sienge_companies = [];
    let comp = _db.sienge_companies.find(c => String(c.id || c.code) === String(id));
    if (!comp) {
      comp = { id: id, active: active };
      _db.sienge_companies.push(comp);
    } else {
      comp.active = active;
    }
    _saveDb();
    try {
      await Api.put(`/api/admin/companies/toggle-status/${id}`, { active: active });
    } catch(e) {}
    toast('Status atualizado com sucesso', 'success');
  },

  async syncSiengeCompanies() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    toast('Sincronizando empresas...', 'info');
    await Api.syncSiengeCompanies();
    toast('Sincronização concluída.', 'success');
    this.renderSiengeCompanies();
  },

  async renderSiengeApportionments() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">📊 Apropriações Financeiras</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-sienge-app-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, \'sienge-app-tbody\')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary" onclick="AdminPage.syncSiengeApportionments()">🔄 Sincronizar Sienge</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>ID</th><th>Nome / Descrição</th><th>Status</th></tr>
          </thead>
          <tbody id="sienge-app-tbody">
            <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;
    
    try {
      let plans = await Api.getSiengeFinancialPlans();
      if (!plans || plans.length === 0) {
         toast('Buscando dados no Sienge...', 'info');
         await Api.syncSiengeFinancialPlans();
         plans = await Api.getSiengeFinancialPlans();
      }
      
      const localPlans = _db.sienge_financial_plans || [];
      plans.forEach(p => {
        const found = localPlans.find(lp => String(lp.id || lp.code) === String(p.id || p.code));
        if (found) p.active = found.active;
      });

      if (!plans || plans.length === 0) {
         document.getElementById('sienge-app-tbody').innerHTML = `<tr><td colspan="3">Nenhuma apropriação encontrada.</td></tr>`;
      } else {
        document.getElementById('sienge-app-tbody').innerHTML = plans.map(p => `
        <tr data-status="${p.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:700;color:var(--ml-indigo);font-family:monospace;">${escHtml(String(p.id || p.code || ''))}</td>
            <td style="font-weight:600;">${escHtml(p.name || p.description)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${p.active !== false ? 'checked' : ''} onchange="AdminPage.toggleSiengeAppStatus('${p.id || p.code}', this.checked); this.parentElement.nextElementSibling.textContent = this.checked ? 'Ativo' : 'Inativo'; this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('sienge-app-tbody');">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:14px;font-weight:500;">${p.active !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
          </tr>`).join('');
      }
      this.applyCurrentFilter('sienge-app-tbody');
    } catch (err) {
      document.getElementById('sienge-app-tbody').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  toggleSiengeAppStatus(id, active) {
    if (!_db.sienge_financial_plans) _db.sienge_financial_plans = [];
    let p = _db.sienge_financial_plans.find(x => String(x.id || x.code) === String(id));
    if (!p) {
      p = { id: id, active: active };
      _db.sienge_financial_plans.push(p);
    } else {
      p.active = active;
    }
    _saveDb();
    toast('Status atualizado', 'success');
  },

  async syncSiengeApportionments() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    toast('Sincronizando apropriações...', 'info');
    await Api.syncSiengeFinancialPlans();
    toast('Sincronização concluída.', 'success');
    this.renderSiengeApportionments();
  },

  async renderMileage() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🚗 Níveis de Quilometragem</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-mileage-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'mileage-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary" id="btn-add-mileage">➕ Novo Nível</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Nível / Descrição</th><th>Valor por Km (R$)</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody id="mileage-tbody">
            <tr class="loading-row"><td colspan="4">Carregando...</td></tr>
          </tbody>
        </table>
      </div>`;
    document.getElementById('btn-add-mileage').addEventListener('click', () => this.openMileageForm());
    await this.populateMileageTable();
  },
  
  async populateMileageTable() {
    try {
      let rates = await Api.getMileageRates();
      // Ordenação numérica crescente por nível (ex: Nível 1, Nível 2, Nível 3, ...)
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

      // Keep in sync with _db for expenses.js usage
      _db.mileage_rates = rates;
      if (window.ExpensesPage) window.ExpensesPage._mileageRates = rates;

      document.getElementById('mileage-tbody').innerHTML = rates.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:var(--text-4);">Nenhuma taxa cadastrada</td></tr>'
        : rates.map(r => `
          <tr data-status="${r.active !== false ? 'active' : 'inactive'}">
          <td style="font-weight:600;">${escHtml(r.name)}</td>
          <td>R$ ${Number(r.rate).toFixed(2).replace('.',',')}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <label class="toggle-switch-r">
                <input type="checkbox" ${r.active !== false ? 'checked' : ''} onchange="AdminPage.toggleMileageStatus(${r.id}, this.checked); this.parentElement.nextElementSibling.textContent = this.checked ? 'Ativo' : 'Inativo'; this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('mileage-tbody');">
                <span class="toggle-slider-r"></span>
              </label>
              <span style="font-size:13px; font-weight:500; color:var(--text-2);">${r.active !== false ? 'Ativo' : 'Inativo'}</span>
            </div>
          </td>
          <td>
            <div class="td-actions">
              <button class="action-btn" title="Editar" onclick="AdminPage.openMileageForm(${r.id})">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>`).join('');
      this.applyCurrentFilter('mileage-tbody');
    } catch(err) {
      document.getElementById('mileage-tbody').innerHTML = `<tr><td colspan="4" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },
  
  async toggleMileageStatus(id, active) {
    try {
      await Api.updateMileageRate(id, { active });
      toast('Status atualizado', 'success');
      await this.populateMileageTable();
    } catch(err) { toast(err.message, 'error'); }
  },
  
  async openMileageForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    let rate = null;
    let jobFunctions = [];
    try {
      jobFunctions = await Api.getJobFunctions();
    } catch(e) {}

    if (id) {
      try { 
        const rates = await Api.getMileageRates(); 
        rate = rates.find(r => r.id === id); 
      } catch(e) {}
    }

    let selectedFuncs = [];
    if (rate?.applicable_functions) {
      try {
        selectedFuncs = typeof rate.applicable_functions === 'string' 
          ? JSON.parse(rate.applicable_functions) 
          : rate.applicable_functions;
      } catch(e) {
        selectedFuncs = rate.applicable_functions ? [rate.applicable_functions] : [];
      }
    } else if (rate?.name) {
      const normName = (rate.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      selectedFuncs = jobFunctions.filter(jf => {
        const normJf = (jf.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return normName.includes(normJf);
      }).map(jf => jf.name);
    }
    
    const html = `
      <div class="form-grid">
        <div class="field required" style="grid-column: span 2;">
          <label>Nome / Nível</label>
          <input type="text" id="mileage-name" value="${escHtml(rate?.name || '')}" placeholder="Ex: Nível 1 - Colaborador" />
        </div>
        <div class="field required" style="grid-column: span 2;">
          <label>Valor por Km (R$)</label>
          <input type="number" step="0.01" id="mileage-rate" value="${rate ? rate.rate : ''}" placeholder="Ex: 1.11" />
        </div>
        <div class="field" style="grid-column: span 2;">
          <label style="margin-bottom:6px;display:block;">Funções Vinculadas a este Nível</label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;">
            ${jobFunctions.map(jf => `
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;background:#fff;padding:6px 12px;border-radius:6px;border:1px solid var(--border);">
                <input type="checkbox" class="mileage-func-cb" value="${escHtml(jf.name)}" ${selectedFuncs.map(f => String(f).toLowerCase()).includes(jf.name.toLowerCase()) ? 'checked' : ''} />
                <span>${escHtml(jf.name)}</span>
              </label>
            `).join('')}
          </div>
          <small style="color:var(--text-3);font-size:11px;display:block;margin-top:6px;">Se nenhuma função for marcada, o sistema identificará automaticamente pelo nome do nível (ex: Colaborador, Diretor, Gestor, Supervisor).</small>
        </div>
      </div>
      <div id="mileage-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;
    Modal.open(id ? 'Editar Nível' : 'Novo Nível', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-primary" id="save-mileage-btn">💾 Salvar</button>`
    );
    
    document.getElementById('save-mileage-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('mileage-error');
      errEl.classList.add('hidden');
      const name = document.getElementById('mileage-name').value.trim();
      const rateVal = parseFloat(document.getElementById('mileage-rate').value);
      if (!name || isNaN(rateVal)) { 
        errEl.textContent = 'Preencha todos os campos obrigatórios.'; 
        errEl.classList.remove('hidden'); 
        return; 
      }
      const checkedFuncs = Array.from(document.querySelectorAll('.mileage-func-cb:checked')).map(cb => cb.value);
      const payload = {
        name,
        rate: rateVal,
        applicable_functions: checkedFuncs.length > 0 ? JSON.stringify(checkedFuncs) : null
      };
      try {
        if (id) {
          await Api.updateMileageRate(id, payload);
        } else {
          payload.active = true;
          await Api.createMileageRate(payload);
        }
        Modal.close();
        toast('Nível salvo com sucesso', 'success');
        AdminPage.populateMileageTable();
      } catch(err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  },

  async renderLogo() {
    const el = document.getElementById('admin-section-content');
    let currentLogo = '';
    try { const res = await Api.getLogo(); currentLogo = res.data || ''; } catch(e) {}
    
    el.innerHTML = `
      <div class="page-header" style="margin-bottom:16px;">
        <span class="card-title">🖼️ Logo da Empresa</span>
      </div>
      <div class="card" style="padding:20px; max-width: 600px;">
        <div style="margin-bottom:16px; font-weight:500;">Configurar Logo (Relatórios)</div>
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="field">
            <label>Logo Atual</label>
            <div style="margin-top:8px; margin-bottom:16px; padding:16px; border:1px dashed var(--border); border-radius:6px; display:inline-block; background:#f9fafb;">
              ${currentLogo ? `<img id="preview-logo" src="${currentLogo}" style="max-height:100px; max-width:200px; object-fit:contain;" />` : `<div id="preview-logo-placeholder" style="color:var(--text-3); font-size:13px; font-style:italic;">Nenhum logo configurado.</div><img id="preview-logo" style="display:none; max-height:100px; max-width:200px; object-fit:contain;" />`}
            </div>
          </div>
          <div class="field">
            <label>Selecione uma imagem (Qualquer extensão)</label>
            <input type="file" id="logo-file" accept="image/*" style="padding-top:6px;" onchange="AdminPage.previewLogo(this)" />
            <div style="font-size:12px; color:var(--text-3); margin-top:4px;">Recomendado: imagem com fundo transparente.</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="AdminPage.saveLogo()">💾 Salvar Logo</button>
      </div>
    `;
  },

  previewLogo(input) {
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const preview = document.getElementById('preview-logo');
        const placeholder = document.getElementById('preview-logo-placeholder');
        if(placeholder) placeholder.style.display = 'none';
        preview.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(input.files[0]);
    }
  },

  saveLogo() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    const fileInput = document.getElementById('logo-file');
    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          await Api.updateLogo(e.target.result);
          // Also cache in _db for immediate use
          _db.logo = e.target.result;
          _saveDb();
          if (typeof applyAppLogo === 'function') applyAppLogo();
          toast('Logo salvo com sucesso', 'success');
        } catch(err) {
          toast('Erro ao salvar logo: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      toast('Selecione uma imagem primeiro.', 'error');
    }
  },

  renderCentralPolicies() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="page-header" style="margin-bottom:16px;">
        <span class="card-title">📄 Central de Políticas</span>
      </div>
      <div class="card" style="padding:20px;">
        <div style="margin-bottom:16px; font-weight:500;">Adicionar Nova Política</div>
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="field required">
            <label>Nome da Política</label>
            <input type="text" id="central-policy-name" placeholder="Ex: Política de Viagens 2026" />
          </div>
          <div class="field required">
            <label>Anexar Arquivo (PDF)</label>
            <input type="file" id="central-policy-file" accept="application/pdf" style="padding-top:6px;" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="AdminPage.saveCentralPolicy()">💾 Salvar Política</button>
      </div>
      
      <div style="margin-top:24px;">
        <div class="page-header" style="margin-bottom:12px;">
          <span class="card-title">Políticas Salvas</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Arquivo</th>
              <th width="80">Ações</th>
            </tr>
          </thead>
          <tbody id="central-policies-tbody">
            <tr><td colspan="3" style="text-align:center;">Nenhuma política cadastrada</td></tr>
          </tbody>
        </table>
      </div>
    `;
    this.populateCentralPolicies();
  },

  async populateCentralPolicies() {
    const tbody = document.getElementById('central-policies-tbody');
    try {
      const all = await Api.getCustomPolicies();
      const policies = all.filter(p => p.group === 'central_policies');
      if (policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-4);">Nenhuma política cadastrada</td></tr>';
        return;
      }
      tbody.innerHTML = policies.map(p => {
        let pdfUrl = p.value || '';
        if (!pdfUrl.startsWith('/') && !pdfUrl.startsWith('http') && !pdfUrl.startsWith('data:')) {
          pdfUrl = '/uploads/' + encodeURIComponent(pdfUrl).replace(/%2F/g, '/');
        }
        return `
          <tr>
            <td style="font-weight:600;">${escHtml(p.description || p.key)}</td>
            <td><a href="${escHtml(pdfUrl)}" target="_blank" rel="noopener" style="color:var(--ml-indigo);text-decoration:underline;font-weight:600;">📄 ${escHtml(p.value)}</a></td>
            <td>
              <button class="btn btn-sm btn-secondary" style="color:var(--red);" onclick="AdminPage.deleteCentralPolicy(${p.id})">Excluir</button>
            </td>
          </tr>`;
      }).join('');
    } catch(err) {
      tbody.innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async saveCentralPolicy() {
    const nameInput = document.getElementById('central-policy-name');
    const fileInput = document.getElementById('central-policy-file');
    const name = nameInput.value.trim();
    if (!name || !fileInput.files.length) {
      toast('Preencha o nome e selecione um arquivo.', 'error');
      return;
    }
    const file = fileInput.files[0];
    try {
      let filename = file.name;
      if (file.name.match(/\.pdf$/i)) {
        const fd = new FormData();
        fd.append('file', file);
        const up = await Api.upload('/api/admin/policies/upload', fd);
        if (up && up.filename) filename = up.filename;
      }

      // Automatically clean up old initial placeholder policies if user is adding their own
      const all = await Api.getCustomPolicies();
      const defaultHolders = all.filter(p => p.group === 'central_policies' && (p.key === 'politica_de_reembolsos' || p.value.includes('Politica_reembolso_despesas')));
      for (const oldP of defaultHolders) {
        try { await Api.deleteCustomPolicy(oldP.id); } catch(e) {}
      }

      await Api.createCustomPolicy({
        key: name.toLowerCase().replace(/\s+/g,'_'),
        value: filename,
        description: name,
        group: 'central_policies',
        active: true
      });
      toast('Política salva com sucesso', 'success');
      nameInput.value = '';
      fileInput.value = '';
      this.populateCentralPolicies();
    } catch(err) { toast(err.message, 'error'); }
  },

  async deleteCentralPolicy(id) {
    if(!confirm('Tem certeza que deseja excluir esta política?')) return;
    try {
      await Api.deleteCustomPolicy(id);
      toast('Política excluída', 'success');
      this.populateCentralPolicies();
    } catch(err) { toast(err.message, 'error'); }
  },

  async renderRejectionReasons() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <style>
        .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
        .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
        .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        .toggle-switch-r input:checked + .toggle-slider-r { background-color: var(--ml-indigo); }
        .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
      </style>
      <div class="table-wrapper">
        <div class="table-header">
          <span class="card-title">🚫 Motivos de Rejeição</span>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="filter-reasons-tbody" class="form-control" style="width:auto; padding:4px 8px; font-size:13px;" onchange="AdminPage.filterTable(this.value, 'reasons-tbody')">
              <option value="active" selected>Somente Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-add-reason">+ Novo Motivo</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Motivo</th>
              <th>Perfis Autorizados</th>
              <th>Status</th>
              <th width="80">Ações</th>
            </tr>
          </thead>
          <tbody id="reasons-tbody">
            <tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    `;
    
    document.getElementById('btn-add-reason').addEventListener('click', () => this.openRejectionReasonForm());
    
    try {
      await this.populateRejectionReasonsTable();
    } catch(err) {
      document.getElementById('reasons-tbody').innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async populateRejectionReasonsTable() {
    try {
      const reasons = await Api.getRejectionReasons();
      if(reasons.length === 0) {
        document.getElementById('reasons-tbody').innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-4);">Nenhum motivo cadastrado</td></tr>`;
        return;
      }
      document.getElementById('reasons-tbody').innerHTML = reasons.map(r => {
        const authorizedRoles = Array.isArray(r.applicable_roles) && r.applicable_roles.length > 0
          ? r.applicable_roles.join(', ') : 'Todos';
        return `
          <tr data-status="${r.active !== false ? 'active' : 'inactive'}">
            <td style="font-weight:600;">${escHtml(r.label)}</td>
            <td style="color:var(--text-2); font-size:13px;">${escHtml(authorizedRoles)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="toggle-switch-r">
                  <input type="checkbox" ${r.active !== false ? 'checked' : ''} onchange="AdminPage.toggleRejectionReasonStatus(${r.id}, this.checked); this.closest('tr').dataset.status = this.checked ? 'active' : 'inactive'; AdminPage.applyCurrentFilter('reasons-tbody');">
                  <span class="toggle-slider-r"></span>
                </label>
                <span style="font-size:13px; font-weight:500; color:var(--text-2);">${r.active !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
            </td>
            <td>
              <div class="td-actions">
                <button class="action-btn" title="Editar" onclick="AdminPage.openRejectionReasonForm(${r.id})">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      this.applyCurrentFilter('reasons-tbody');
    } catch(err) {
      document.getElementById('reasons-tbody').innerHTML = `<tr><td colspan="4" style="color:var(--red);">Erro: ${escHtml(err.message)}</td></tr>`;
    }
  },

  async toggleRejectionReasonStatus(id, active) {
    try {
      await Api.updateRejectionReason(id, { active });
      toast('Status atualizado', 'success');
      await this.populateRejectionReasonsTable();
    } catch(err) { toast(err.message, 'error'); }
  },

  async openRejectionReasonForm(id = null) {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    let reason = null;
    if (id) {
      try { const reasons = await Api.getRejectionReasons(); reason = reasons.find(r => r.id === id); } catch(e) {}
    }
    let roles = [];
    try { roles = await Api.getJobRoles(); } catch(e) {}
    roles = roles.filter(ro => ro.name.toLowerCase() !== 'usuário' && ro.name.toLowerCase() !== 'usuario');

    const rolesOptions = roles.map(ro => {
        let isChecked = false;
        let isDisabled = false;
        
        if (ro.name.toLowerCase() === 'administrador') {
            isChecked = true;
            isDisabled = true;
        } else if (reason) {
            isChecked = Array.isArray(reason.applicable_roles) && reason.applicable_roles.includes(ro.name);
        }
        
        const selected = isChecked ? 'checked' : '';
        const disabledAttr = isDisabled ? 'disabled' : '';
        const labelStyle = isDisabled ? 'cursor:not-allowed; opacity:0.8;' : 'cursor:pointer;';
        
        return `<label style="display:block; margin-bottom:8px; font-weight:normal; font-size:14px; ${labelStyle}"><input type="checkbox" name="reason-roles" value="${ro.id}" ${selected} ${disabledAttr} style="margin-right:8px; width: 16px; height: 16px; accent-color: var(--ml-indigo); vertical-align: middle; ${labelStyle}" /> ${escHtml(ro.name)} <span style="color:var(--red);">*</span></label>`;
    }).join('');

    const html = `
      <div class="form-grid">
        <div class="field required" style="grid-column:1/-1;">
          <label>Motivo de Rejeição</label>
          <input type="text" id="rr-reason" value="${escHtml(reason?.label || '')}" placeholder="Ex: Valor excede o limite permitido" />
        </div>
        <div class="field required" style="grid-column:1/-1;">
          <label>Perfis que podem utilizar este motivo</label>
          <div style="max-height:150px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:6px;">
            ${rolesOptions}
          </div>
        </div>
      </div>
      <div id="rr-error" class="login-error hidden" style="margin-top:12px;"></div>
    `;
    
    Modal.open(id ? 'Editar Motivo' : 'Novo Motivo', html,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn btn-primary" id="save-rr-btn">💾 Salvar</button>`
    );
    
    document.getElementById('save-rr-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('rr-error');
      errEl.classList.add('hidden');
      const text = document.getElementById('rr-reason').value.trim();
      const checkboxes = document.querySelectorAll('input[name="reason-roles"]:checked');
      const selectedRoles = Array.from(checkboxes).map(cb => cb.value);
      
      if (!text) { 
        errEl.textContent = 'Preencha o motivo.'; 
        errEl.classList.remove('hidden'); 
        return; 
      }
      if (selectedRoles.length === 0) {
        errEl.textContent = 'Selecione ao menos um perfil.'; 
        errEl.classList.remove('hidden'); 
        return; 
      }
      
      try {
        const roleNames = Array.from(document.querySelectorAll('input[name="reason-roles"]:checked')).map(cb => {
          const label = cb.closest('label');
          return label ? label.textContent.replace('*','').trim() : cb.value;
        });
        if (id) {
          await Api.updateRejectionReason(id, { label: text, applicable_roles: JSON.stringify(roleNames) });
        } else {
          await Api.createRejectionReason({ label: text, applicable_roles: JSON.stringify(roleNames), active: true });
        }
        Modal.close();
        toast('Motivo salvo com sucesso', 'success');
        AdminPage.populateRejectionReasonsTable();
      } catch(err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  },

  async renderPolicies() {
    const el = document.getElementById('admin-section-content');
    el.innerHTML = `
      <div class="page-header" style="margin-bottom:20px;">
        <span class="card-title">📜 Regras de Negócio</span>
        <button class="btn btn-primary" id="btn-new-policy">+ Nova Regra</button>
      </div>
      <div id="cc-rules-container"></div>
      <div id="cat-rules-container"></div>
      <div id="cat-override-rules-container"></div>
      <div id="policy-groups" style="display:flex;flex-direction:column;gap:24px;">
        <div style="text-align:center;padding:40px;color:var(--text-4);">Carregando...</div>
      </div>`;
    document.getElementById('btn-new-policy').addEventListener('click', () => this.openPolicyForm());
    this.renderCostCenterRulesSection();
    this.renderCategoryRulesSection();
    this.renderCategoryOverrideRulesSection();

    try {
      const policies = await Api.getCustomPolicies();
      const filteredPolicies = policies.filter(p => p.group !== 'central_policies');
      const groups = {};
      filteredPolicies.forEach(p => {
        const g = p.group || 'Geral';
        if (!groups[g]) groups[g] = [];
        groups[g].push(p);
      });

      const groupIcons = {
        'Regras Temporais': '⏱️',
        'Regras de Valor': '💰',
        'Regras de Comprovante': '📎',
        'Regras de Quilometragem': '🚗',
        'Regras de Fluxo': '🔄'
      };

      if (filteredPolicies.length === 0) {
        document.getElementById('policy-groups').innerHTML = '';
        return;
      }

      document.getElementById('policy-groups').innerHTML = Object.keys(groups).map(groupName => {
        const icon = groupIcons[groupName] || '📋';
        const cards = groups[groupName].map(p => {
          let inputHtml = '';
          if (p.type === 'select' && p.options) {
            inputHtml = `<select id="policy-input-${p.id}" style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;outline:none;background:#fff;" hidden>
              ${p.options.map(opt => `<option value="${escHtml(opt)}" ${opt === p.value ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}
            </select>`;
          } else {
            inputHtml = `<input type="text" id="policy-input-${p.id}" value="${escHtml(p.value)}"
              style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;outline:none;"
              hidden />`;
          }
          return `
          <div class="policy-card" id="policy-card-${p.id}" style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px 20px;display:flex;flex-direction:column;gap:6px;position:relative;">
            <button onclick="AdminPage.deletePolicy(${p.id})" title="Excluir regra"
              style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:var(--text-4);font-size:16px;padding:2px 6px;border-radius:4px;transition:all .2s;"
              onmouseover="this.style.color='var(--red)';this.style.background='rgba(239,68,68,0.08)';"
              onmouseout="this.style.color='var(--text-4)';this.style.background='none';">✕</button>
            <div style="font-weight:600;font-size:14px;color:var(--text-1);text-transform:capitalize;padding-right:24px;">${escHtml(p.key.replace(/_/g, ' '))}</div>
            <div style="font-size:12px;color:var(--text-3);line-height:1.4;">${escHtml(p.description || '')}</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
              <div id="policy-val-${p.id}" style="flex:1;font-size:15px;font-weight:700;color:var(--ml-indigo);">${escHtml(p.value)}${p.type === 'number' && p.key.includes('valor') || p.key.includes('limite_mensal') || p.key.includes('comprovante_obrigatorio') || p.key.includes('auto_aprovacao') ? '' : p.type === 'number' && p.key.includes('dias') || p.key.includes('prazo') || p.key.includes('retroativa') ? ' dias' : p.type === 'number' && p.key.includes('km') ? ' km' : ''}</div>
              ${inputHtml}
              <button class="btn btn-sm btn-secondary" id="policy-edit-btn-${p.id}"
                onclick="AdminPage.togglePolicyEdit(${p.id}, '${escHtml(p.key)}')" style="white-space:nowrap;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg> Editar
              </button>
              <button class="btn btn-sm btn-primary hidden" id="policy-save-btn-${p.id}"
                onclick="AdminPage.savePolicy('${escHtml(p.key)}', ${p.id})" style="white-space:nowrap;">💾 Salvar</button>
            </div>
          </div>`;
        }).join('');

        return `
          <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--surface-2);">
            <div style="padding:14px 20px;background:linear-gradient(135deg, var(--ml-indigo), #1a6b32);color:#fff;font-weight:700;font-size:15px;letter-spacing:0.3px;display:flex;align-items:center;justify-content:space-between;">
              <span>${icon} ${escHtml(groupName)}</span>
              <button onclick="AdminPage.deletePolicyGroup('${escHtml(groupName)}')" title="Excluir grupo"
                style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;font-size:12px;font-weight:600;padding:4px 8px;border-radius:6px;transition:all .2s;display:flex;align-items:center;gap:4px;"
                onmouseover="this.style.background='var(--red)';"
                onmouseout="this.style.background='rgba(255,255,255,0.15)';">✕ Excluir Grupo</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;padding:16px;">
              ${cards}
            </div>
          </div>`;
      }).join('');
    } catch(err) {
      document.getElementById('policy-groups').innerHTML = `<div style="color:var(--red);">Erro: ${escHtml(err.message)}</div>`;
    }
  },

  async openPolicyForm() {
    let existingGroups = [];
    try { const all = await Api.getCustomPolicies(); existingGroups = [...new Set(all.map(p => p.group).filter(g => g && g !== 'central_policies'))]; } catch(e) {}
    const groupOptions = existingGroups.map(g => `<option value="${escHtml(g)}">${escHtml(g)}</option>`).join('');

    Modal.open('📜 Nova Regra', `
      <div class="form-grid">
        <div class="field required" style="grid-column:1/-1;">
          <label>Nome da Regra (identificador)</label>
          <input type="text" id="pol-key" placeholder="Ex: prazo_pagamento_dias" />
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Use letras minúsculas com underline. Ex: limite_diario_hotel</div>
        </div>
        <div class="field required" style="grid-column:1/-1;">
          <label>Descrição</label>
          <input type="text" id="pol-desc" placeholder="Ex: Prazo máximo para pagamento após aprovação" />
        </div>
        <div class="field required">
          <label>Valor Padrão</label>
          <input type="text" id="pol-value" placeholder="Ex: 30" />
        </div>
        <div class="field required">
          <label>Tipo de Campo</label>
          <select id="pol-type" onchange="document.getElementById('pol-options-wrapper').style.display = this.value === 'select' ? 'block' : 'none';">
            <option value="number">Numérico</option>
            <option value="text">Texto</option>
            <option value="select">Seleção (Dropdown)</option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1;display:none;" id="pol-options-wrapper">
          <label>Opções (separadas por vírgula)</label>
          <input type="text" id="pol-options" placeholder="Ex: Sim, Não, Opcional" />
        </div>
        <div class="field required" style="grid-column:1/-1;">
          <label>Grupo</label>
          <div style="display:flex;gap:8px;">
            <select id="pol-group" style="flex:1;" onchange="document.getElementById('pol-group-new').style.display = this.value === '__new__' ? 'block' : 'none';">
              ${groupOptions}
              <option value="__new__">+ Novo Grupo...</option>
            </select>
            <input type="text" id="pol-group-new" placeholder="Nome do novo grupo" style="flex:1;display:none;" />
          </div>
        </div>
        <div id="pol-error" class="login-error hidden" style="grid-column:1/-1;"></div>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
      <button class="btn btn-primary" onclick="AdminPage.savePolicyForm()">💾 Salvar</button>
    `);
  },

  async savePolicyForm() {
    if (App.user?.role === 'financeiro') {
      toast('Perfil Financeiro possui permissão apenas de consulta nesta tela.', 'info');
      return;
    }

    const key = document.getElementById('pol-key').value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const desc = document.getElementById('pol-desc').value.trim();
    const value = document.getElementById('pol-value').value.trim();
    const type = document.getElementById('pol-type').value;
    const optionsRaw = document.getElementById('pol-options').value.trim();
    const groupSelect = document.getElementById('pol-group').value;
    const groupNew = document.getElementById('pol-group-new').value.trim();
    const errEl = document.getElementById('pol-error');

    if (!key || !desc || !value) {
      errEl.textContent = 'Preencha nome, descrição e valor.';
      errEl.classList.remove('hidden');
      return;
    }

    const group = groupSelect === '__new__' ? groupNew : groupSelect;
    if (!group) {
      errEl.textContent = 'Selecione ou crie um grupo.';
      errEl.classList.remove('hidden');
      return;
    }
    try {
      await Api.createCustomPolicy({ key, value, description: desc, group, active: true });
      Modal.close();
      toast('Regra criada com sucesso!', 'success');
      this.renderPolicies();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  },

  async deletePolicy(id) {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return;
    try {
      await Api.deleteCustomPolicy(id);
      toast('Regra excluída', 'success');
      this.renderPolicies();
    } catch(err) { toast(err.message, 'error'); }
  },

  async deletePolicyGroup(groupName) {
    if (!confirm(`Tem certeza que deseja excluir o grupo "${groupName}" e TODAS as suas regras?`)) return;
    try {
      const all = await Api.getCustomPolicies();
      const toDelete = all.filter(p => p.group === groupName);
      await Promise.all(toDelete.map(p => Api.deleteCustomPolicy(p.id)));
      toast(`Grupo "${groupName}" excluído com sucesso!`, 'success');
      this.renderPolicies();
    } catch(err) { toast(err.message, 'error'); }
  },

  togglePolicyEdit(id, key) {
    const inp = document.getElementById(`policy-input-${id}`);
    const val = document.getElementById(`policy-val-${id}`);
    const editBtn = document.getElementById(`policy-edit-btn-${id}`);
    const saveBtn = document.getElementById(`policy-save-btn-${id}`);
    const isHidden = inp.hidden || inp.style.display === 'none';
    if (isHidden) {
      inp.hidden = false;
      inp.style.display = '';
      val.style.display = 'none';
      editBtn.textContent = '✕ Cancelar';
      saveBtn.classList.remove('hidden');
    } else {
      inp.hidden = true;
      val.style.display = '';
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ml-indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg> Editar';
      saveBtn.classList.add('hidden');
    }
  },

  async savePolicy(key, id) {
    const val = document.getElementById(`policy-input-${id}`).value.trim();
    if (!val) { toast('Informe um valor', 'warning'); return; }
    try {
      await Api.updatePolicy(key, { value: val });
      toast('Regra atualizada!', 'success');
      this.renderPolicies();
    } catch(err) { toast(err.message, 'error'); }
  },

  async renderCostCenterRulesSection() {
    let container = document.getElementById('cc-rules-container');
    if (!container) return;

    try {
      const [rules, allCcs, siengeCcs, allUsers] = await Promise.all([
        Api.getCostCenterRules().catch(() => []),
        Api.getCostCenters().catch(() => []),
        Api.getSiengeCostCenters().catch(() => []),
        Api.getUsers().catch(() => [])
      ]);

      const ccMap = new Map();
      (allCcs || []).forEach(c => {
        const key = String(c.code || c.id);
        ccMap.set(key, { id: c.id, code: c.code || String(c.id), name: c.name, active: c.active !== false });
      });

      (siengeCcs || []).forEach(c => {
        const key = String(c.code || c.id);
        if (ccMap.has(key)) {
          const existing = ccMap.get(key);
          if (c.name) existing.name = c.name;
        } else {
          ccMap.set(key, { id: c.id || c.code, code: c.code || String(c.id), name: c.name, active: c.active !== false });
        }
      });

      const localCcs = _db.sienge_cost_centers || [];
      localCcs.forEach(lc => {
        const key = String(lc.id || lc.code);
        if (ccMap.has(key)) {
          ccMap.get(key).active = lc.active !== false;
        }
      });

      const activeCcs = Array.from(ccMap.values())
        .filter(c => c.active !== false)
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

      const seenCcUserEmails = new Set();
      const activeUsers = (allUsers || []).filter(u => {
        if (!u || u.active === false) return false;
        const emailKey = (u.email || u.name || String(u.id)).toLowerCase().trim();
        if (seenCcUserEmails.has(emailKey)) return false;
        seenCcUserEmails.add(emailKey);
        return true;
      });

      this._ccRuleActiveCcs = activeCcs;
      this._ccRuleActiveUsers = activeUsers;
      this._ccRulesList = rules || [];

      const ccOptionsHtml = activeCcs.map(c => 
        `<option value="${c.id}">${escHtml(c.code ? c.code + ' - ' : '')}${escHtml(c.name)}</option>`
      ).join('');

      const usersChecklistHtml = activeUsers.map(u => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-1);cursor:pointer;padding:6px 8px;border-radius:6px;background:var(--surface);border:1px solid var(--border);">
          <input type="checkbox" class="cc-user-checkbox" value="${u.id}" />
          <span>${escHtml(u.name)} <small style="color:var(--text-3);">(${escHtml(u.role)})</small></span>
        </label>
      `).join('');

      let rulesListHtml = '';
      if (!rules || rules.length === 0) {
        rulesListHtml = `<div style="text-align:center;padding:20px;color:var(--text-4);font-size:13px;">Nenhuma regra por centro de custo cadastrada.</div>`;
      } else {
        rulesListHtml = rules.map(r => {
          const ccsBadges = (r.cost_centers || []).map(c => 
            `<span class="badge" style="background:var(--ml-indigo);color:#fff;font-size:12px;margin:2px;">${escHtml(c.code ? c.code + ' - ' : '')}${escHtml(c.name)}</span>`
          ).join('');
          const usersBadges = (r.allowed_users || []).map(u => 
            `<span class="badge" style="background:var(--surface-2);color:var(--text-1);border:1px solid var(--border);font-size:12px;margin:2px;">👤 ${escHtml(u.name)}</span>`
          ).join('');

          const ccNames = (r.cost_centers || []).map(c => c.name).join(', ') || 'Nenhum Centro de Custo';
          const userCount = (r.allowed_users || []).length;

          return `
            <div class="cc-rule-item" id="cc-rule-item-${r.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:all 0.2s;">
              <!-- Cabeçalho Compacto do Card (Clique para expandir/recolher) -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-2);cursor:pointer;user-select:none;gap:12px;" onclick="AdminPage.toggleCcRuleExpand(${r.id})">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                  <span id="cc-rule-chevron-${r.id}" style="font-size:11px;color:var(--text-3);transition:transform 0.2s;display:inline-block;">▶</span>
                  <span style="font-size:13px;font-weight:700;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(ccNames)}">
                    🏢 ${escHtml(ccNames)}
                  </span>
                  <span class="badge" style="background:rgba(26,107,50,0.1);color:var(--ml-indigo);font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;white-space:nowrap;">
                    👤 ${userCount} ${userCount === 1 ? 'usuário' : 'usuários'}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="btn btn-sm btn-ghost" id="cc-rule-btn-text-${r.id}" style="font-size:12px;color:var(--ml-indigo);font-weight:600;padding:2px 8px;">
                    Expandir
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.editCcRule(${r.id})" title="Editar regra" style="color:var(--ml-indigo);padding:2px 6px;">
                    ✏️ Editar
                  </button>
                  <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.deleteCcRule(${r.id})" title="Excluir regra" style="color:var(--red);padding:2px 6px;">
                    ✕ Excluir
                  </button>
                </div>
              </div>
              <!-- Corpo Detalhado Expansível (Inicia oculto) -->
              <div id="cc-rule-body-${r.id}" style="display:none;padding:14px 16px;border-top:1px solid var(--border);background:var(--surface);">
                <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:6px;">CENTROS DE CUSTO:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">${ccsBadges || '<span style="color:var(--text-4);font-size:12px;">Nenhum</span>'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:6px;">USUÁRIOS PERMITIDOS:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${usersBadges || '<span style="color:var(--text-4);font-size:12px;">Nenhum</span>'}</div>
              </div>
            </div>`;
        }).join('');
      }

      if (!this._sectionCollapseStates) this._sectionCollapseStates = {};
      const ccIsCollapsed = this._sectionCollapseStates['cc-rules'] !== undefined ? !!this._sectionCollapseStates['cc-rules'] : true;

      container.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04);position:relative;z-index:20;">
          <div style="padding:14px 20px;background:linear-gradient(135deg, var(--ml-indigo), #1a6b32);color:#fff;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;border-radius:${ccIsCollapsed ? '11px' : '11px 11px 0 0'};" onclick="AdminPage.toggleSectionExpand('cc-rules-section-body', 'cc-rules-section-btn', 'cc-rules')">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>🏢 Regra por Centro de Custo</span>
              <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">
                • ${(rules || []).length} ${(rules || []).length === 1 ? 'regra' : 'regras'}
              </span>
            </div>
            <button type="button" class="btn btn-sm" id="cc-rules-section-btn" onclick="event.stopPropagation(); AdminPage.toggleSectionExpand('cc-rules-section-body', 'cc-rules-section-btn', 'cc-rules')" style="background:rgba(255,255,255,0.2);color:#fff;border:none;padding:4px 10px;font-size:12px;font-weight:600;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">
              <span>${ccIsCollapsed ? '▶' : '▼'}</span> <span class="cc-sec-txt">${ccIsCollapsed ? 'Expandir' : 'Recolher'}</span>
            </button>
          </div>
          
          <div id="cc-rules-section-body" style="padding:20px;display:${ccIsCollapsed ? 'none' : 'flex'};flex-direction:column;gap:16px;">
            <div style="font-size:13px;color:var(--text-2);line-height:1.4;">
              Configure quais usuários possuem permissão para visualizar e selecionar Centros de Custo específicos ao lançar despesas e filtrar relatórios.
            </div>

            <!-- Formulário de Nova Regra -->
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:14px;">
              <div style="font-weight:700;font-size:14px;color:var(--text-1);" id="cc-form-title">➕ Criar Nova Regra por Centro de Custo</div>
              
              <!-- 1. Seletor de Centro de Custo -->
              <div class="field required">
                <label style="font-weight:600;font-size:13px;margin-bottom:6px;display:block;">Centros de Custo *</label>
                <div id="cc-rule-selectors-wrapper" style="display:flex;flex-direction:column;gap:8px;">
                  <div class="cc-selector-row" style="display:flex;align-items:center;gap:8px;">
                    <select class="cc-rule-select" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);">
                      <option value="">Selecione a centro de custo...</option>
                      ${ccOptionsHtml}
                    </select>
                  </div>
                </div>
              </div>

              <!-- 2. Seletor de Usuários (Estilo Dropdown Multi-Seleção) -->
              <div class="field required" style="position:relative;z-index:50;">
                <label style="font-weight:600;font-size:13px;margin-bottom:6px;display:block;">Usuários Permitidos *</label>
                <button type="button" id="cc-users-dropdown-btn" onclick="AdminPage.toggleCcUsersDropdown(event)"
                        style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);display:flex;align-items:center;justify-content:space-between;cursor:pointer;outline:none;">
                  <span id="cc-users-dropdown-label" style="font-weight:500;">Selecione os usuários permitidos...</span>
                  <span style="font-size:12px;color:var(--text-3);">▼</span>
                </button>

                <div id="cc-users-dropdown-menu" onclick="event.stopPropagation()" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:240px;overflow-y:auto;overscroll-behavior:contain;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:10px;margin-top:4px;">
                  <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px;">
                    ${usersChecklistHtml || '<div style="color:var(--text-4);font-size:12px;">Nenhum usuário ativo encontrado.</div>'}
                  </div>
                </div>
              </div>

              <!-- Botão Salvar Regra -->
              <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:4px;flex-wrap:wrap;gap:10px;">
                <button class="btn btn-primary" id="btn-save-cc-rule" onclick="AdminPage.saveCcRule()">
                  💾 Salvar Regra por Centro de Custo
                </button>
              </div>
            </div>

            <!-- Lista de Regras Existentes -->
            <div style="margin-top:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div style="font-weight:700;font-size:14px;color:var(--text-1);">Regras Cadastradas</div>
                ${rules && rules.length > 0 ? `
                  <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-all-cc-rules" onclick="AdminPage.toggleAllCcRules()" style="font-size:12px;font-weight:600;color:var(--ml-indigo);display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:6px;padding:4px 10px;background:var(--surface);">
                    <span id="cc-rules-toggle-all-icon">▼</span> <span id="cc-rules-toggle-all-text">Expandir Todas</span>
                  </button>
                ` : ''}
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                ${rulesListHtml}
              </div>
            </div>
          </div>
        </div>
      `;

      // Event listeners para atualização dinâmica do rótulo do dropdown de usuários
      document.querySelectorAll('.cc-user-checkbox').forEach(cb => {
        cb.addEventListener('change', () => this.updateCcUsersDropdownLabel());
      });

      // Fechar dropdown ao clicar fora
      if (!this._ccUserDropdownOutsideBound) {
        this._ccUserDropdownOutsideBound = true;
        document.addEventListener('click', (e) => {
          const btn = document.getElementById('cc-users-dropdown-btn');
          const menu = document.getElementById('cc-users-dropdown-menu');
          if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
          }
        });
      }

    } catch(err) {
      container.innerHTML = `<div style="color:var(--red);padding:20px;">Erro ao carregar regras por centro de custo: ${escHtml(err.message)}</div>`;
    }
  },

  toggleCcRuleExpand(id) {
    const body = document.getElementById(`cc-rule-body-${id}`);
    const chevron = document.getElementById(`cc-rule-chevron-${id}`);
    const btnText = document.getElementById(`cc-rule-btn-text-${id}`);
    if (!body) return;

    const isHidden = body.style.display === 'none';
    if (isHidden) {
      body.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(90deg)';
      if (btnText) btnText.textContent = 'Recolher';
    } else {
      body.style.display = 'none';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
      if (btnText) btnText.textContent = 'Expandir';
    }
  },

  toggleAllCcRules() {
    const bodies = document.querySelectorAll('[id^="cc-rule-body-"]');
    if (bodies.length === 0) return;

    let allExpanded = true;
    bodies.forEach(b => {
      if (b.style.display === 'none') allExpanded = false;
    });

    const shouldExpand = !allExpanded;
    bodies.forEach(b => {
      const id = b.id.replace('cc-rule-body-', '');
      const chevron = document.getElementById(`cc-rule-chevron-${id}`);
      const btnText = document.getElementById(`cc-rule-btn-text-${id}`);
      if (shouldExpand) {
        b.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (btnText) btnText.textContent = 'Recolher';
      } else {
        b.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (btnText) btnText.textContent = 'Expandir';
      }
    });

    const icon = document.getElementById('cc-rules-toggle-all-icon');
    const text = document.getElementById('cc-rules-toggle-all-text');
    if (icon && text) {
      icon.textContent = shouldExpand ? '▲' : '▼';
      text.textContent = shouldExpand ? 'Recolher Todas' : 'Expandir Todas';
    }
  },

  toggleCcUsersDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('cc-users-dropdown-menu');
    if (!menu) return;
    const isHidden = menu.style.display === 'none';
    menu.style.display = isHidden ? 'block' : 'none';
  },

  updateCcUsersDropdownLabel() {
    const label = document.getElementById('cc-users-dropdown-label');
    if (!label) return;
    const checked = document.querySelectorAll('.cc-user-checkbox:checked');
    if (checked.length === 0) {
      label.textContent = 'Selecione os usuários permitidos...';
      label.style.fontWeight = '500';
    } else if (checked.length === 1) {
      const parentLabel = checked[0].parentElement;
      const userName = parentLabel ? (parentLabel.querySelector('span')?.textContent || '1 usuário') : '1 usuário';
      label.textContent = `1 usuário selecionado (${userName.split('(')[0].trim()})`;
      label.style.fontWeight = '600';
    } else {
      label.textContent = `${checked.length} usuários selecionados`;
      label.style.fontWeight = '600';
    }
  },

  addCcSelectorRow() {
    const wrapper = document.getElementById('cc-rule-selectors-wrapper');
    if (!wrapper || !this._ccRuleActiveCcs) return;

    const ccOptionsHtml = this._ccRuleActiveCcs.map(c => 
      `<option value="${c.id}">${escHtml(c.code ? c.code + ' - ' : '')}${escHtml(c.name)}</option>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'cc-selector-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = `
      <select class="cc-rule-select" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);">
        <option value="">Selecione outro centro de custo...</option>
        ${ccOptionsHtml}
      </select>
      <button class="btn btn-sm btn-ghost" onclick="this.parentElement.remove()" title="Remover seletor" style="color:var(--red);padding:4px 8px;">✕</button>
    `;
    wrapper.appendChild(row);
  },

  editCcRule(id) {
    const rules = this._ccRulesList || [];
    const rule = rules.find(r => r.id === id);
    if (!rule) return;

    this._editingCcRuleId = id;

    const select = document.querySelector('.cc-rule-select');
    if (select && rule.cost_center_ids && rule.cost_center_ids.length > 0) {
      select.value = rule.cost_center_ids[0];
    }

    const allowedUserIds = (rule.allowed_user_ids || []).map(u => String(u));
    document.querySelectorAll('.cc-user-checkbox').forEach(cb => {
      cb.checked = allowedUserIds.includes(String(cb.value));
    });
    this.updateCcUsersDropdownLabel();

    const formTitle = document.getElementById('cc-form-title');
    if (formTitle) formTitle.textContent = '✏️ Editar Regra por Centro de Custo';

    const saveBtn = document.getElementById('btn-save-cc-rule');
    if (saveBtn) saveBtn.textContent = '💾 Atualizar Regra por Centro de Custo';

    let cancelBtn = document.getElementById('btn-cancel-cc-rule');
    if (!cancelBtn && saveBtn && saveBtn.parentElement) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = 'btn-cancel-cc-rule';
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.style.marginRight = '8px';
      cancelBtn.textContent = 'Cancelar Edição';
      cancelBtn.onclick = () => this.cancelCcRuleEdit();
      saveBtn.parentElement.insertBefore(cancelBtn, saveBtn);
    }

    const formContainer = document.getElementById('cc-rule-selectors-wrapper');
    if (formContainer) formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  cancelCcRuleEdit() {
    this._editingCcRuleId = null;
    const formTitle = document.getElementById('cc-form-title');
    if (formTitle) formTitle.textContent = '➕ Criar Nova Regra por Centro de Custo';

    const saveBtn = document.getElementById('btn-save-cc-rule');
    if (saveBtn) saveBtn.textContent = '💾 Salvar Regra por Centro de Custo';

    const cancelBtn = document.getElementById('btn-cancel-cc-rule');
    if (cancelBtn) cancelBtn.remove();

    const select = document.querySelector('.cc-rule-select');
    if (select) select.value = '';

    document.querySelectorAll('.cc-user-checkbox').forEach(cb => cb.checked = false);
    this.updateCcUsersDropdownLabel();
  },

  async saveCcRule() {
    const ccSelects = document.querySelectorAll('.cc-rule-select');
    const selectedCcIds = [];
    ccSelects.forEach(sel => {
      if (sel.value) selectedCcIds.push(parseInt(sel.value));
    });

    const userCheckboxes = document.querySelectorAll('.cc-user-checkbox:checked');
    const selectedUserIds = [];
    userCheckboxes.forEach(cb => {
      if (cb.value) selectedUserIds.push(parseInt(cb.value));
    });

    if (selectedCcIds.length === 0) {
      toast('Selecione pelo menos 1 Centro de Custo ativo.', 'warning');
      return;
    }
    if (selectedUserIds.length === 0) {
      toast('Selecione pelo menos 1 Usuário ativo.', 'warning');
      return;
    }

    try {
      const payload = {
        cost_center_ids: selectedCcIds,
        allowed_user_ids: selectedUserIds
      };
      if (this._editingCcRuleId) {
        payload.rule_id = this._editingCcRuleId;
      }

      await Api.saveCostCenterRule(payload);
      toast(this._editingCcRuleId ? 'Regra por Centro de Custo atualizada com sucesso!' : 'Regra por Centro de Custo salva com sucesso!', 'success');
      this._editingCcRuleId = null;
      this.renderPolicies();
    } catch(err) {
      toast('Erro ao salvar regra: ' + err.message, 'error');
    }
  },

  async deleteCcRule(id) {
    if (!confirm('Tem certeza que deseja excluir esta regra por centro de custo?')) return;
    try {
      await Api.deleteCostCenterRule(id);
      toast('Regra excluída com sucesso!', 'success');
      this.renderPolicies();
    } catch(err) {
      toast('Erro ao excluir regra: ' + err.message, 'error');
    }
  },

  toggleSectionExpand(bodyId, btnId, secKey) {
    const body = document.getElementById(bodyId);
    const btn = document.getElementById(btnId);
    if (!body) return;

    if (!this._sectionCollapseStates) this._sectionCollapseStates = {};
    const isCurrentlyHidden = body.style.display === 'none';
    const willCollapse = !isCurrentlyHidden;

    if (secKey) {
      this._sectionCollapseStates[secKey] = willCollapse;
    }

    const header = body.previousElementSibling;
    if (willCollapse) {
      body.style.display = 'none';
      if (header) header.style.borderRadius = '11px';
      if (btn) btn.innerHTML = '<span>▶</span> <span class="sec-txt">Expandir</span>';
    } else {
      body.style.display = 'flex';
      if (header) header.style.borderRadius = '11px 11px 0 0';
      if (btn) btn.innerHTML = '<span>▼</span> <span class="sec-txt">Recolher</span>';
    }
  },

  async renderCategoryRulesSection() {
    let container = document.getElementById('cat-rules-container');
    if (!container) return;

    try {
      const [rules, allCats, allUsers] = await Promise.all([
        Api.getCategoryRules().catch(() => []),
        Api.getCategories().catch(() => []),
        Api.getUsers().catch(() => [])
      ]);

      const activeCats = (allCats || []).filter(c => c.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const seenCatUserEmails = new Set();
      const activeUsers = (allUsers || []).filter(u => {
        if (!u || u.active === false) return false;
        const emailKey = (u.email || u.name || String(u.id)).toLowerCase().trim();
        if (seenCatUserEmails.has(emailKey)) return false;
        seenCatUserEmails.add(emailKey);
        return true;
      });

      this._catRuleActiveCats = activeCats;
      this._catRuleActiveUsers = activeUsers;
      this._catRulesList = rules || [];

      const catOptionsHtml = activeCats.map(c => 
        `<option value="${c.id}">${escHtml(c.icon ? c.icon + ' ' : '')}${escHtml(c.name)}</option>`
      ).join('');

      const usersChecklistHtml = activeUsers.map(u => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-1);cursor:pointer;padding:6px 8px;border-radius:6px;background:var(--surface);border:1px solid var(--border);">
          <input type="checkbox" class="cat-user-checkbox" value="${u.id}" />
          <span>${escHtml(u.name)} <small style="color:var(--text-3);">(${escHtml(u.role)})</small></span>
        </label>
      `).join('');

      let rulesListHtml = '';
      if (!rules || rules.length === 0) {
        rulesListHtml = `<div style="text-align:center;padding:20px;color:var(--text-4);font-size:13px;">Nenhuma regra por categoria cadastrada.</div>`;
      } else {
        rulesListHtml = rules.map(r => {
          const catsBadges = (r.categories || []).map(c => 
            `<span class="badge" style="background:var(--ml-indigo);color:#fff;font-size:12px;margin:2px;">${escHtml(c.icon ? c.icon + ' ' : '')}${escHtml(c.name)}</span>`
          ).join('');

          const usersBadges = (r.allowed_users || []).map(u => 
            `<span class="badge" style="background:var(--surface-2);color:var(--text-1);border:1px solid var(--border);font-size:12px;margin:2px;">👤 ${escHtml(u.name)}</span>`
          ).join('');

          const catNames = (r.categories || []).map(c => (c.icon ? c.icon + ' ' : '') + c.name).join(', ') || 'Nenhuma Categoria';
          const userCount = (r.allowed_users || []).length;

          return `
            <div class="cat-rule-item" id="cat-rule-item-${r.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:all 0.2s;">
              <!-- Cabeçalho Compacto do Card -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-2);cursor:pointer;user-select:none;gap:12px;" onclick="AdminPage.toggleCatRuleExpand(${r.id})">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                  <span id="cat-rule-chevron-${r.id}" style="font-size:11px;color:var(--text-3);transition:transform 0.2s;display:inline-block;">▶</span>
                  <span style="font-size:13px;font-weight:700;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(catNames)}">
                    🏷️ ${escHtml(catNames)}
                  </span>
                  <span class="badge" style="background:rgba(26,107,50,0.1);color:var(--ml-indigo);font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;white-space:nowrap;">
                    👤 ${userCount} ${userCount === 1 ? 'usuário' : 'usuários'}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="btn btn-sm btn-ghost" id="cat-rule-btn-text-${r.id}" style="font-size:12px;color:var(--ml-indigo);font-weight:600;padding:2px 8px;">
                    Expandir
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.editCatRule(${r.id})" title="Editar regra" style="color:var(--ml-indigo);padding:2px 6px;">
                    ✏️ Editar
                  </button>
                  <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.deleteCatRule(${r.id})" title="Excluir regra" style="color:var(--red);padding:2px 6px;">
                    ✕ Excluir
                  </button>
                </div>
              </div>
              <!-- Corpo Detalhado Expansível -->
              <div id="cat-rule-body-${r.id}" style="display:none;padding:14px 16px;border-top:1px solid var(--border);background:var(--surface);">
                <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:6px;">CATEGORIAS:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">${catsBadges || '<span style="color:var(--text-4);font-size:12px;">Nenhuma</span>'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:6px;">USUÁRIOS PERMITIDOS:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${usersBadges || '<span style="color:var(--text-4);font-size:12px;">Nenhum</span>'}</div>
              </div>
            </div>`;
        }).join('');
      }

      if (!this._sectionCollapseStates) this._sectionCollapseStates = {};
      const catIsCollapsed = this._sectionCollapseStates['cat-rules'] !== undefined ? !!this._sectionCollapseStates['cat-rules'] : true;

      container.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04);position:relative;z-index:10;">
          <div style="padding:14px 20px;background:linear-gradient(135deg, var(--ml-indigo), #1a6b32);color:#fff;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;border-radius:${catIsCollapsed ? '11px' : '11px 11px 0 0'};" onclick="AdminPage.toggleSectionExpand('cat-rules-section-body', 'cat-rules-section-btn', 'cat-rules')">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>🏷️ Regra por Categoria</span>
              <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">
                • ${(rules || []).length} ${(rules || []).length === 1 ? 'regra' : 'regras'}
              </span>
            </div>
            <button type="button" class="btn btn-sm" id="cat-rules-section-btn" onclick="event.stopPropagation(); AdminPage.toggleSectionExpand('cat-rules-section-body', 'cat-rules-section-btn', 'cat-rules')" style="background:rgba(255,255,255,0.2);color:#fff;border:none;padding:4px 10px;font-size:12px;font-weight:600;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">
              <span>${catIsCollapsed ? '▶' : '▼'}</span> <span class="cat-sec-txt">${catIsCollapsed ? 'Expandir' : 'Recolher'}</span>
            </button>
          </div>
          
          <div id="cat-rules-section-body" style="padding:20px;display:${catIsCollapsed ? 'none' : 'flex'};flex-direction:column;gap:16px;">
            <div style="font-size:13px;color:var(--text-2);line-height:1.4;">
              Configure quais usuários possuem permissão para visualizar e selecionar Categorias específicas ao lançar despesas e filtrar relatórios.
            </div>

            <!-- Formulário de Nova Regra -->
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:14px;">
              <div style="font-weight:700;font-size:14px;color:var(--text-1);" id="cat-form-title">➕ Criar Nova Regra por Categoria</div>
              
              <!-- 1. Seletor de Categoria -->
              <div class="field required">
                <label style="font-weight:600;font-size:13px;margin-bottom:6px;display:block;">Categorias *</label>
                <div id="cat-rule-selectors-wrapper" style="display:flex;flex-direction:column;gap:8px;">
                  <div class="cat-selector-row" style="display:flex;align-items:center;gap:8px;">
                    <select class="cat-rule-select" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);">
                      <option value="">Selecione a categoria...</option>
                      ${catOptionsHtml}
                    </select>
                  </div>
                </div>
              </div>

              <!-- 2. Seletor de Usuários -->
              <div class="field required" style="position:relative;z-index:50;">
                <label style="font-weight:600;font-size:13px;margin-bottom:6px;display:block;">Usuários Permitidos *</label>
                <button type="button" id="cat-users-dropdown-btn" onclick="AdminPage.toggleCatUsersDropdown(event)"
                        style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);display:flex;align-items:center;justify-content:space-between;cursor:pointer;outline:none;">
                  <span id="cat-users-dropdown-label" style="font-weight:500;">Selecione os usuários permitidos...</span>
                  <span style="font-size:12px;color:var(--text-3);">▼</span>
                </button>

                <div id="cat-users-dropdown-menu" onclick="event.stopPropagation()" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:240px;overflow-y:auto;overscroll-behavior:contain;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:10px;margin-top:4px;">
                  <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px;">
                    ${usersChecklistHtml || '<div style="color:var(--text-4);font-size:12px;">Nenhum usuário ativo encontrado.</div>'}
                  </div>
                </div>
              </div>

              <!-- Botão Salvar Regra -->
              <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:4px;flex-wrap:wrap;gap:10px;">
                <button class="btn btn-primary" id="btn-save-cat-rule" onclick="AdminPage.saveCatRule()">
                  💾 Salvar Regra por Categoria
                </button>
              </div>
            </div>

            <!-- Lista de Regras Existentes -->
            <div style="margin-top:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div style="font-weight:700;font-size:14px;color:var(--text-1);">Regras Cadastradas</div>
                ${rules && rules.length > 0 ? `
                  <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-all-cat-rules" onclick="AdminPage.toggleAllCatRules()" style="font-size:12px;font-weight:600;color:var(--ml-indigo);display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:6px;padding:4px 10px;background:var(--surface);">
                    <span id="cat-rules-toggle-all-icon">▼</span> <span id="cat-rules-toggle-all-text">Expandir Todas</span>
                  </button>
                ` : ''}
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                ${rulesListHtml}
              </div>
            </div>
          </div>
        </div>
      `;

      document.querySelectorAll('.cat-user-checkbox').forEach(cb => {
        cb.addEventListener('change', () => this.updateCatUsersDropdownLabel());
      });

      if (!this._catUserDropdownOutsideBound) {
        this._catUserDropdownOutsideBound = true;
        document.addEventListener('click', (e) => {
          const btn = document.getElementById('cat-users-dropdown-btn');
          const menu = document.getElementById('cat-users-dropdown-menu');
          if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
          }
        });
      }

    } catch(err) {
      container.innerHTML = `<div style="color:var(--red);padding:20px;">Erro ao carregar regras por categoria: ${escHtml(err.message)}</div>`;
    }
  },

  toggleCatUsersDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('cat-users-dropdown-menu');
    if (!menu) return;
    const isHidden = menu.style.display === 'none';
    menu.style.display = isHidden ? 'block' : 'none';
  },

  updateCatUsersDropdownLabel() {
    const label = document.getElementById('cat-users-dropdown-label');
    if (!label) return;
    const checked = document.querySelectorAll('.cat-user-checkbox:checked');
    if (checked.length === 0) {
      label.textContent = 'Selecione os usuários permitidos...';
      label.style.fontWeight = '500';
    } else if (checked.length === 1) {
      const parentLabel = checked[0].parentElement;
      const userName = parentLabel ? (parentLabel.querySelector('span')?.textContent || '1 usuário') : '1 usuário';
      label.textContent = `1 usuário selecionado (${userName.split('(')[0].trim()})`;
      label.style.fontWeight = '600';
    } else {
      label.textContent = `${checked.length} usuários selecionados`;
      label.style.fontWeight = '600';
    }
  },

  editCatRule(id) {
    const rules = this._catRulesList || [];
    const rule = rules.find(r => r.id === id);
    if (!rule) return;

    this._editingCatRuleId = id;

    const select = document.querySelector('.cat-rule-select');
    if (select && rule.category_ids && rule.category_ids.length > 0) {
      select.value = rule.category_ids[0];
    }

    const allowedUserIds = (rule.allowed_user_ids || []).map(u => String(u));
    document.querySelectorAll('.cat-user-checkbox').forEach(cb => {
      cb.checked = allowedUserIds.includes(String(cb.value));
    });
    this.updateCatUsersDropdownLabel();

    const formTitle = document.getElementById('cat-form-title');
    if (formTitle) formTitle.textContent = '✏️ Editar Regra por Categoria';

    const saveBtn = document.getElementById('btn-save-cat-rule');
    if (saveBtn) saveBtn.textContent = '💾 Atualizar Regra por Categoria';

    let cancelBtn = document.getElementById('btn-cancel-cat-rule');
    if (!cancelBtn && saveBtn && saveBtn.parentElement) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = 'btn-cancel-cat-rule';
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.style.marginRight = '8px';
      cancelBtn.textContent = 'Cancelar Edição';
      cancelBtn.onclick = () => this.cancelCatRuleEdit();
      saveBtn.parentElement.insertBefore(cancelBtn, saveBtn);
    }

    const formContainer = document.getElementById('cat-rule-selectors-wrapper');
    if (formContainer) formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  cancelCatRuleEdit() {
    this._editingCatRuleId = null;
    const formTitle = document.getElementById('cat-form-title');
    if (formTitle) formTitle.textContent = '➕ Criar Nova Regra por Categoria';

    const saveBtn = document.getElementById('btn-save-cat-rule');
    if (saveBtn) saveBtn.textContent = '💾 Salvar Regra por Categoria';

    const cancelBtn = document.getElementById('btn-cancel-cat-rule');
    if (cancelBtn) cancelBtn.remove();

    const select = document.querySelector('.cat-rule-select');
    if (select) select.value = '';

    document.querySelectorAll('.cat-user-checkbox').forEach(cb => cb.checked = false);
    this.updateCatUsersDropdownLabel();
  },

  async saveCatRule() {
    const catSelects = document.querySelectorAll('.cat-rule-select');
    const selectedCatIds = [];
    catSelects.forEach(sel => {
      if (sel.value) selectedCatIds.push(parseInt(sel.value));
    });

    const userCheckboxes = document.querySelectorAll('.cat-user-checkbox:checked');
    const selectedUserIds = [];
    userCheckboxes.forEach(cb => {
      if (cb.value) selectedUserIds.push(parseInt(cb.value));
    });

    if (selectedCatIds.length === 0) {
      toast('Selecione pelo menos 1 Categoria ativa.', 'warning');
      return;
    }
    if (selectedUserIds.length === 0) {
      toast('Selecione pelo menos 1 Usuário ativo.', 'warning');
      return;
    }

    try {
      const payload = {
        category_ids: selectedCatIds,
        allowed_user_ids: selectedUserIds
      };
      if (this._editingCatRuleId) {
        payload.rule_id = this._editingCatRuleId;
      }

      await Api.saveCategoryRule(payload);
      toast(this._editingCatRuleId ? 'Regra por Categoria atualizada com sucesso!' : 'Regra por Categoria salva com sucesso!', 'success');
      this._editingCatRuleId = null;
      this.renderPolicies();
    } catch(err) {
      toast('Erro ao salvar regra: ' + err.message, 'error');
    }
  },

  async deleteCatRule(id) {
    if (!confirm('Tem certeza que deseja excluir esta regra por categoria?')) return;
    try {
      await Api.deleteCategoryRule(id);
      toast('Regra excluída com sucesso!', 'success');
      this.renderPolicies();
    } catch(err) {
      toast('Erro ao excluir regra: ' + err.message, 'error');
    }
  },

  toggleCatRuleExpand(id) {
    const body = document.getElementById(`cat-rule-body-${id}`);
    const chevron = document.getElementById(`cat-rule-chevron-${id}`);
    const btnText = document.getElementById(`cat-rule-btn-text-${id}`);
    if (!body) return;

    const isHidden = body.style.display === 'none';
    if (isHidden) {
      body.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(90deg)';
      if (btnText) btnText.textContent = 'Recolher';
    } else {
      body.style.display = 'none';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
      if (btnText) btnText.textContent = 'Expandir';
    }
  },

  toggleAllCatRules() {
    const bodies = document.querySelectorAll('[id^="cat-rule-body-"]');
    if (bodies.length === 0) return;

    let allExpanded = true;
    bodies.forEach(b => {
      if (b.style.display === 'none') allExpanded = false;
    });

    const shouldExpand = !allExpanded;
    bodies.forEach(b => {
      const id = b.id.replace('cat-rule-body-', '');
      const chevron = document.getElementById(`cat-rule-chevron-${id}`);
      const btnText = document.getElementById(`cat-rule-btn-text-${id}`);
      if (shouldExpand) {
        b.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (btnText) btnText.textContent = 'Recolher';
      } else {
        b.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (btnText) btnText.textContent = 'Expandir';
      }
    });

    const icon = document.getElementById('cat-rules-toggle-all-icon');
    const text = document.getElementById('cat-rules-toggle-all-text');
    if (icon && text) {
      icon.textContent = shouldExpand ? '▲' : '▼';
      text.textContent = shouldExpand ? 'Recolher Todas' : 'Expandir Todas';
    }
  },

  // ── REGRAS DE ALTERAÇÃO NA CATEGORIA ──────────────────────────────────────
  async renderCategoryOverrideRulesSection() {
    let container = document.getElementById('cat-override-rules-container');
    if (!container) return;

    try {
      const [rules, allDepts, allCats, allCcs, siengeCcs, financialPlans] = await Promise.all([
        Api.getCategoryOverrideRules().catch(() => []),
        Api.getSiengeDepartments().catch(() => []),
        Api.getCategories().catch(() => []),
        Api.getCostCenters().catch(() => []),
        Api.getSiengeCostCenters().catch(() => []),
        Api.getSiengeFinancialPlans().catch(() => [])
      ]);

      // Departamentos
      const activeDepts = (allDepts || []).filter(d => d.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Categorias
      const activeCats = (allCats || []).filter(c => c.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Centros de custo
      const ccMap = new Map();
      (allCcs || []).forEach(c => {
        const key = String(c.code || c.id);
        ccMap.set(key, { id: c.id, code: c.code || String(c.id), name: c.name, active: c.active !== false });
      });
      (siengeCcs || []).forEach(c => {
        const key = String(c.code || c.id);
        if (ccMap.has(key)) {
          const existing = ccMap.get(key);
          if (c.name) existing.name = c.name;
        } else {
          ccMap.set(key, { id: c.id || c.code, code: c.code || String(c.id), name: c.name, active: c.active !== false });
        }
      });
      const localCcs = _db.sienge_cost_centers || [];
      localCcs.forEach(lc => {
        const key = String(lc.id || lc.code);
        if (ccMap.has(key)) {
          ccMap.get(key).active = lc.active !== false;
        }
      });
      const activeCcs = Array.from(ccMap.values())
        .filter(c => c.active !== false)
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

      // Planos Financeiros
      const validPlans = (financialPlans || []).map(p => {
        const pid = String(p.id || p.code || '').trim();
        const pname = p.name || p.description || '';
        let formatted = pid;
        if (pid.length === 7 && /^\d+$/.test(pid)) {
          formatted = `${pid[0]}.${pid.substring(1,3)}.${pid.substring(3,5)}.${pid.substring(5,7)}`;
        }
        return {
          id: pid,
          code: pid,
          name: pname,
          formatted: formatted,
          display: formatted ? `${formatted} - ${pname}` : pname
        };
      }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

      this._catOverrideRulesList = rules || [];
      this._catOverrideActiveDepts = activeDepts;
      this._catOverrideActiveCats = activeCats;
      this._catOverrideActiveCcs = activeCcs;
      this._catOverrideFinancialPlans = validPlans;

      if (!this._overrideFormRows || this._overrideFormRows.length === 0) {
        this._overrideFormRows = [{ id: 0 }];
      }

      // Geração dos Cards das Regras Cadastradas (com Recolher/Expandir)
      let rulesListHtml = '';
      if (!rules || rules.length === 0) {
        rulesListHtml = `<div style="text-align:center;padding:24px;color:var(--text-4);font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:8px;">Nenhuma regra de alteração cadastrada.</div>`;
      } else {
        rulesListHtml = rules.map(r => {
          let catBadges = '';
          if (r.all_categories) {
            catBadges = `<span class="badge" style="background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;">🏷️ Todas as Categorias</span>`;
          } else {
            catBadges = (r.categories || []).map(c => 
              `<span class="badge" style="display:inline-flex;align-items:center;gap:6px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;margin:2px 0;">
                <span>${escHtml(c.icon || '🏷️')} ${escHtml(c.name)}</span>
                <button type="button" onclick="event.stopPropagation(); AdminPage.removeCatFromSavedRule(${r.id}, ${c.id})" title="Excluir categoria da regra" style="background:none;border:none;cursor:pointer;color:#92400e;font-size:12px;font-weight:800;line-height:1;padding:0 3px;margin-left:2px;border-radius:3px;transition:all 0.15s;" onmouseover="this.style.color='var(--red)';this.style.background='rgba(239,68,68,0.1)';" onmouseout="this.style.color='#92400e';this.style.background='none';">✕</button>
              </span>`
            ).join(' ');
          }

          let ccBadges = '';
          if (r.all_cost_centers) {
            ccBadges = `<span class="badge" style="background:#f3f4f6;color:#1f2937;border:1px solid var(--border);font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;">📍 Todos os Centros de Custo</span>`;
          } else {
            ccBadges = (r.cost_centers || []).map(c => {
              const ccCodeVal = String(c.code || c.id || '');
              return `
                <span class="badge" style="display:inline-flex;align-items:center;gap:6px;background:#f3f4f6;color:#1f2937;border:1px solid var(--border);font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;margin:2px 0;">
                  <span>📍 ${escHtml(c.code ? c.code + ' - ' : '')}${escHtml(c.name)}</span>
                  <button type="button" onclick="event.stopPropagation(); AdminPage.removeCcFromSavedRule(${r.id}, '${escHtml(ccCodeVal)}')" title="Excluir este centro de custo da regra imediatamente" style="background:none;border:none;cursor:pointer;color:var(--text-4);font-size:12px;font-weight:800;line-height:1;padding:0 3px;margin-left:2px;border-radius:3px;transition:all 0.15s;" onmouseover="this.style.color='var(--red)';this.style.background='rgba(239,68,68,0.1)';" onmouseout="this.style.color='var(--text-4)';this.style.background='none';">✕</button>
                </span>
              `;
            }).join(' ');
          }

          const catSummary = r.all_categories ? '🏷️ Todas as Categorias' : `🏷️ ${(r.categories || []).length} ${(r.categories || []).length === 1 ? 'categoria' : 'categorias'}`;
          const ccSummary = r.all_cost_centers ? '📍 Todos os CCs' : `📍 ${(r.cost_centers || []).length} ${(r.cost_centers || []).length === 1 ? 'centro' : 'centros'}`;
          const isExpanded = !!(this._overrideCardStates && this._overrideCardStates[r.id]);

          return `
            <div class="override-rule-card" id="override-rule-card-${r.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <!-- Cabeçalho Compacto do Card (Clique para expandir/recolher) -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface-2);cursor:pointer;user-select:none;gap:12px;flex-wrap:wrap;" onclick="AdminPage.toggleOverrideRuleCard(${r.id})">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:280px;flex-wrap:wrap;">
                  <span id="override-rule-chevron-${r.id}" style="font-size:11px;color:var(--text-3);transition:transform 0.2s;display:inline-block;">${isExpanded ? '▼' : '▶'}</span>
                  <span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;">
                    🏢 ${escHtml(r.department_name)}
                  </span>
                  <span style="color:var(--text-4);font-weight:700;">+</span>
                  <span class="badge" style="background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;">
                    ${catSummary}
                  </span>
                  <span style="color:var(--text-4);font-weight:700;">+</span>
                  <span class="badge" style="background:#f3f4f6;color:#1f2937;border:1px solid var(--border);font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;">
                    ${ccSummary}
                  </span>
                  <span style="color:var(--ml-indigo);font-weight:800;font-size:14px;">➔</span>
                  <span class="badge" style="background:rgba(26,107,50,0.12);color:#166534;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;border:1px solid rgba(26,107,50,0.25);">
                    ✨ ${escHtml(r.formatted_apportionment ? r.formatted_apportionment + ' - ' : '')}${escHtml(r.apportionment_name || r.sienge_apportionment_id)}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="btn btn-sm btn-ghost" id="override-rule-btn-text-${r.id}" style="font-size:12px;color:var(--ml-indigo);font-weight:600;padding:2px 8px;">
                    ${isExpanded ? 'Recolher' : 'Expandir'}
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.editCategoryOverrideRule(${r.id})" title="Editar regra" style="color:var(--ml-indigo);padding:2px 8px;font-weight:600;">
                    ✏️ Editar
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); AdminPage.deleteCategoryOverrideRule(${r.id})" title="Excluir regra" style="color:var(--red);padding:2px 8px;font-weight:600;">
                    ✕ Excluir
                  </button>
                </div>
              </div>

              <!-- Corpo Expansível (Oculto por padrão ou mantido aberto) -->
              <div class="override-rule-body" id="override-rule-body-${r.id}" style="display:${isExpanded ? 'flex' : 'none'};padding:16px;background:var(--surface);border-top:1px solid var(--border);flex-direction:column;gap:14px;">
                <!-- Categoria(s) Detalhadas -->
                <div>
                  <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:6px;">
                    Categoria(s) Aplicáveis:
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${catBadges}
                  </div>
                </div>
                <!-- Centros de Custo Detalhados com Botão X de exclusão imediata -->
                <div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
                    <span style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;">
                      Centro(s) de Custo Aplicáveis:
                    </span>
                    <span style="font-size:11px;color:var(--text-4);">Clique no ✕ para excluir o centro de custo imediatamente</span>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${ccBadges}
                  </div>
                </div>
                <!-- Nova Apropriação Financeira Detalhada -->
                <div style="padding:10px 14px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;gap:10px;">
                  <span style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Nova Apropriação Financeira:</span>
                  <span style="font-weight:700;color:#166534;font-size:13px;">
                    ✨ ${escHtml(r.formatted_apportionment ? r.formatted_apportionment + ' - ' : '')}${escHtml(r.apportionment_name || r.sienge_apportionment_id)}
                  </span>
              </div>
            </div>`;
        }).join('');
      }

      if (!this._sectionCollapseStates) this._sectionCollapseStates = {};
      const overrideIsCollapsed = this._sectionCollapseStates['cat-override-rules'] !== undefined ? !!this._sectionCollapseStates['cat-override-rules'] : true;

      // Montagem do formulário com suporte a múltiplas linhas
      const rowsHtml = this._overrideFormRows.map(row => `
        <div class="override-rule-row" id="override-rule-row-${row.id}" data-row-id="${row.id}">
          ${this.renderOverrideRuleRowInnerHtml(row.id)}
        </div>
      `).join('');

      container.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04);position:relative;z-index:5;">
          <div style="padding:14px 20px;background:linear-gradient(135deg, var(--ml-indigo), #1a6b32);color:#fff;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;border-radius:${overrideIsCollapsed ? '11px' : '11px 11px 0 0'};" onclick="AdminPage.toggleSectionExpand('cat-override-rules-section-body', 'cat-override-rules-section-btn', 'cat-override-rules')">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>🔀 Alteração na categoria</span>
              <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">
                • ${rules.length} ${rules.length === 1 ? 'regra' : 'regras'}
              </span>
            </div>
            <button type="button" class="btn btn-sm" id="cat-override-rules-section-btn" onclick="event.stopPropagation(); AdminPage.toggleSectionExpand('cat-override-rules-section-body', 'cat-override-rules-section-btn', 'cat-override-rules')" style="background:rgba(255,255,255,0.2);color:#fff;border:none;padding:4px 10px;font-size:12px;font-weight:600;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">
              <span>${overrideIsCollapsed ? '▶' : '▼'}</span> <span class="override-sec-txt">${overrideIsCollapsed ? 'Expandir' : 'Recolher'}</span>
            </button>
          </div>
          
          <div id="cat-override-rules-section-body" style="padding:20px;display:${overrideIsCollapsed ? 'none' : 'flex'};flex-direction:column;gap:18px;">
            <div style="font-size:13px;color:var(--text-2);line-height:1.5;">
              Defina regras de substituição de conta financeira. Quando uma despesa do departamento especificado tiver determinada(s) categoria(s) e centro(s) de custo, a apropriação financeira da despesa será alterada no relatório e na integração do Sienge.
            </div>

            <!-- Formulário de Criação/Edição (Multi-Regras) -->
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="font-size:14px;font-weight:700;color:var(--text-1);" id="override-form-title">
                  ➕ Criar Nova Regra de Alteração na Categoria
                </div>
                <input type="hidden" id="override-rule-id" value="" />
              </div>

              <!-- Container de Linhas de Regras -->
              <div id="override-rule-rows-container" style="display:flex;flex-direction:column;gap:14px;">
                ${rowsHtml}
              </div>

              <!-- Barra de Ações: Adicionar Linha e Salvar -->
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--border);">
                <div>
                  <button type="button" class="btn btn-secondary" id="btn-add-override-row" onclick="AdminPage.addOverrideRuleRow()" style="padding:8px 16px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
                    <span style="font-size:15px;font-weight:700;">➕</span> Adicionar Mais Regras
                  </button>
                </div>

                <div style="display:flex;align-items:center;gap:10px;">
                  <button type="button" class="btn btn-ghost" id="btn-cancel-override-rule" onclick="AdminPage.clearCategoryOverrideRuleForm()" style="display:none;padding:8px 16px;font-weight:600;">
                    Cancelar Edição
                  </button>
                  <button type="button" class="btn btn-primary" id="btn-save-override-rule" onclick="AdminPage.saveCategoryOverrideRule()" style="padding:8px 22px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                    💾 Salvar Regras de Alteração
                  </button>
                </div>
              </div>
            </div>

            <!-- Lista de Regras Cadastradas com Recolher/Expandir -->
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:6px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="font-size:13px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;">
                  Regras Cadastradas (${rules.length})
                </div>
                ${rules.length > 0 ? `
                  <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-all-override-rules" onclick="AdminPage.toggleAllOverrideRules()" style="font-size:12px;color:var(--ml-indigo);font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:3px 8px;">
                    <span id="override-rules-toggle-all-icon">▼</span> <span id="override-rules-toggle-all-text">Expandir Todas</span>
                  </button>
                ` : ''}
              </div>
              <div id="override-rules-list" style="display:flex;flex-direction:column;gap:10px;">
                ${rulesListHtml}
              </div>
            </div>
          </div>
        </div>
      `;

      // Vincular listeners nos checkboxes de cada linha ativa
      this._overrideFormRows.forEach(row => {
        document.querySelectorAll(`.override-cat-checkbox-${row.id}`).forEach(cb => {
          cb.addEventListener('change', () => this.updateOverrideCatDropdownLabel(row.id));
        });
        document.querySelectorAll(`.override-cc-checkbox-${row.id}`).forEach(cb => {
          cb.addEventListener('change', () => this.updateOverrideCcDropdownLabel(row.id));
        });
      });

      this.updateOverrideRowHeaders();

      // Fechar menus dropdown ao clicar fora
      if (!this._overrideDropdownsOutsideBound) {
        this._overrideDropdownsOutsideBound = true;
        document.addEventListener('click', (e) => {
          // Categorias
          document.querySelectorAll('[id^="override-cat-dropdown-menu-"]').forEach(menu => {
            const rowId = menu.id.replace('override-cat-dropdown-menu-', '');
            const btn = document.getElementById(`override-cat-dropdown-btn-${rowId}`);
            if (btn && !btn.contains(e.target) && !menu.contains(e.target)) {
              menu.style.display = 'none';
            }
          });
          // Centros de custo
          document.querySelectorAll('[id^="override-cc-dropdown-menu-"]').forEach(menu => {
            const rowId = menu.id.replace('override-cc-dropdown-menu-', '');
            const btn = document.getElementById(`override-cc-dropdown-btn-${rowId}`);
            if (btn && !btn.contains(e.target) && !menu.contains(e.target)) {
              menu.style.display = 'none';
            }
          });
          // Autocomplete apropriação financeira
          document.querySelectorAll('[id^="override-plan-dropdown-"]').forEach(menu => {
            const rowId = menu.id.replace('override-plan-dropdown-', '');
            const inp = document.getElementById(`override-plan-input-${rowId}`);
            if (inp && !inp.contains(e.target) && !menu.contains(e.target)) {
              menu.style.display = 'none';
            }
          });
        });
      }
    } catch(err) {
      console.error('Erro ao renderizar regras de alteração na categoria:', err);
      container.innerHTML = `<div style="padding:16px;color:var(--red);background:#fee2e2;border-radius:8px;font-size:13px;">Erro ao carregar Regras de Alteração: ${escHtml(err.message)}</div>`;
    }
  },

  // Helper para renderizar os 4 seletores perfeitamente alinhados na linha
  renderOverrideRuleRowInnerHtml(rowId, defaultDeptId = '') {
    const activeDepts = this._catOverrideActiveDepts || [];
    const deptOptionsHtml = activeDepts.map(d =>
      `<option value="${d.id}" ${String(d.id) === String(defaultDeptId) ? 'selected' : ''}>${escHtml(d.name)}</option>`
    ).join('');

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px;position:relative;">
        <div class="override-row-header" style="display:none;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:2px;">
          <span class="override-row-number" style="font-size:12px;font-weight:700;color:var(--ml-indigo);">Regra</span>
          <button type="button" class="btn btn-sm btn-ghost" onclick="AdminPage.removeOverrideRuleRow(${rowId})" style="color:var(--red);font-size:12px;padding:2px 8px;font-weight:600;">
            ✕ Remover Regra
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px;align-items:flex-end;">
          <!-- 1. Departamento -->
          <div style="display:flex;flex-direction:column;justify-content:flex-end;">
            <label style="display:flex;align-items:flex-end;height:26px;font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">
              DEPARTAMENTO DO SOLICITANTE <span style="color:var(--red);margin-left:2px;">*</span>
            </label>
            <select id="override-dept-${rowId}" style="height:42px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);outline:none;">
              <option value="">Selecione o departamento...</option>
              ${deptOptionsHtml}
            </select>
          </div>

          <!-- 2. Categoria (Multi-Seleção com Marcar Todos) -->
          <div style="display:flex;flex-direction:column;justify-content:flex-end;position:relative;z-index:40;">
            <label style="display:flex;align-items:flex-end;height:26px;font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">
              CATEGORIA DA DESPESA <span style="color:var(--red);margin-left:2px;">*</span>
            </label>
            <button type="button" id="override-cat-dropdown-btn-${rowId}" onclick="AdminPage.toggleOverrideCatDropdown(${rowId}, event)"
                    style="height:42px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);display:flex;align-items:center;justify-content:space-between;cursor:pointer;outline:none;">
              <span id="override-cat-dropdown-label-${rowId}" style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Selecione a(s) categoria(s)...</span>
              <span style="font-size:12px;color:var(--text-3);margin-left:8px;">▼</span>
            </button>

            <div id="override-cat-dropdown-menu-${rowId}" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:280px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:10px;">
              <div style="padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:8px;display:flex;flex-direction:column;gap:6px;">
                <input type="text" placeholder="🔍 Filtrar categorias..." oninput="AdminPage.filterOverrideCatCheckboxes(${rowId}, this.value)" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text-1);outline:none;" />
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--ml-indigo);cursor:pointer;">
                    <input type="checkbox" id="override-cat-select-all-${rowId}" onchange="AdminPage.toggleSelectAllOverrideCats(${rowId}, this.checked)" />
                    <span>Marcar Todos</span>
                  </label>
                  <span id="override-cat-count-badge-${rowId}" style="font-size:11px;color:var(--text-3);font-weight:600;">0 selecionadas</span>
                </div>
              </div>
              <div id="override-cat-items-wrapper-${rowId}" style="display:flex;flex-direction:column;gap:4px;">
                ${this.getCatChecklistHtml(rowId)}
              </div>
            </div>
          </div>

          <!-- 3. Centro de Custo (Multi-Seleção com Marcar Todos) -->
          <div style="display:flex;flex-direction:column;justify-content:flex-end;position:relative;z-index:30;">
            <label style="display:flex;align-items:flex-end;height:26px;font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">
              CENTRO DE CUSTO DA DESPESA <span style="color:var(--red);margin-left:2px;">*</span>
            </label>
            <button type="button" id="override-cc-dropdown-btn-${rowId}" onclick="AdminPage.toggleOverrideCcDropdown(${rowId}, event)"
                    style="height:42px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);display:flex;align-items:center;justify-content:space-between;cursor:pointer;outline:none;">
              <span id="override-cc-dropdown-label-${rowId}" style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Selecione o(s) centro(s)...</span>
              <span style="font-size:12px;color:var(--text-3);margin-left:8px;">▼</span>
            </button>

            <div id="override-cc-dropdown-menu-${rowId}" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:280px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:10px;">
              <div style="padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:8px;display:flex;flex-direction:column;gap:6px;">
                <input type="text" placeholder="🔍 Filtrar centros de custo..." oninput="AdminPage.filterOverrideCcCheckboxes(${rowId}, this.value)" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text-1);outline:none;" />
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--ml-indigo);cursor:pointer;">
                    <input type="checkbox" id="override-cc-select-all-${rowId}" onchange="AdminPage.toggleSelectAllOverrideCcs(${rowId}, this.checked)" />
                    <span>Marcar Todos</span>
                  </label>
                  <span id="override-cc-count-badge-${rowId}" style="font-size:11px;color:var(--text-3);font-weight:600;">0 selecionados</span>
                </div>
              </div>
              <div id="override-cc-items-wrapper-${rowId}" style="display:flex;flex-direction:column;gap:4px;">
                ${this.getCcChecklistHtml(rowId)}
              </div>
            </div>
          </div>

          <!-- 4. Nova Apropriação Financeira (Autocomplete ao digitar) -->
          <div style="display:flex;flex-direction:column;justify-content:flex-end;position:relative;z-index:20;">
            <label style="display:flex;align-items:flex-end;height:26px;font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">
              NOVA APROPRIAÇÃO FINANCEIRA (RELATÓRIO) <span style="color:var(--red);margin-left:2px;">*</span>
            </label>
            <div style="position:relative;width:100%;">
              <input type="text" id="override-plan-input-${rowId}" placeholder="🔍 Digite para buscar a conta..." autocomplete="off"
                     oninput="AdminPage.onPlanSearchInput(${rowId}, this.value)"
                     onfocus="AdminPage.onPlanSearchFocus(${rowId})"
                     style="height:42px;width:100%;box-sizing:border-box;padding:0 30px 0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-1);outline:none;" />
              <button type="button" onclick="AdminPage.clearPlanSearch(${rowId})" title="Limpar seleção"
                      id="override-plan-clear-${rowId}"
                      style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-4);cursor:pointer;font-size:14px;padding:2px 4px;">✕</button>
              <input type="hidden" id="override-plan-id-${rowId}" value="" />
              
              <div id="override-plan-dropdown-${rowId}" onclick="event.stopPropagation()"
                   style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:260px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);z-index:150;">
              </div>
            </div>
          </div>
        </div>

        <!-- Lista dos Centros de Custo Selecionados com botão ✕ para excluir da lista imediatamente -->
        <div id="override-cc-chips-wrapper-${rowId}" style="display:none;padding:10px 14px;background:var(--surface-2);border:1px dashed var(--border);border-radius:8px;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.3px;">
              Centros de Custo Selecionados (<span id="override-cc-chips-count-${rowId}">0</span>):
            </span>
            <span style="font-size:11px;color:var(--text-3);">Clique no ✕ para excluir o centro de custo imediatamente da lista</span>
          </div>
          <div id="override-cc-chips-list-${rowId}" style="display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow-y:auto;"></div>
        </div>
      </div>
    `;
  },

  getCatChecklistHtml(rowId) {
    const cats = this._catOverrideActiveCats || [];
    if (cats.length === 0) return '<div style="color:var(--text-4);font-size:12px;">Nenhuma categoria ativa.</div>';
    return cats.map(c => `
      <label class="override-cat-item-label-${rowId}" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-1);cursor:pointer;padding:6px 8px;border-radius:6px;background:var(--surface);border:1px solid var(--border);transition:background 0.15s;">
        <input type="checkbox" class="override-cat-checkbox-${rowId}" value="${c.id}" data-name="${escHtml(c.name)}" />
        <span style="display:flex;align-items:center;gap:6px;">${escHtml(c.icon ? c.icon + ' ' : '')}${escHtml(c.name)}</span>
      </label>
    `).join('');
  },

  getCcChecklistHtml(rowId) {
    const ccs = this._catOverrideActiveCcs || [];
    if (ccs.length === 0) return '<div style="color:var(--text-4);font-size:12px;">Nenhum centro de custo ativo.</div>';
    return ccs.map(c => `
      <label class="override-cc-item-label-${rowId}" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-1);cursor:pointer;padding:6px 8px;border-radius:6px;background:var(--surface);border:1px solid var(--border);transition:background 0.15s;">
        <input type="checkbox" class="override-cc-checkbox-${rowId}" value="${c.code || c.id}" data-code="${escHtml(c.code || '')}" data-name="${escHtml(c.name)}" />
        <span>${escHtml(c.code ? c.code + ' - ' : '')}${escHtml(c.name)}</span>
      </label>
    `).join('');
  },

  addOverrideRuleRow() {
    if (!this._overrideFormRows) this._overrideFormRows = [{ id: 0 }];
    this._nextOverrideRowId = (this._nextOverrideRowId || 1) + 1;
    const newId = this._nextOverrideRowId;

    // Pegar departamento da última linha existente para facilitar
    const lastRow = this._overrideFormRows[this._overrideFormRows.length - 1];
    let defaultDept = '';
    if (lastRow) {
      const lastDeptEl = document.getElementById(`override-dept-${lastRow.id}`);
      if (lastDeptEl) defaultDept = lastDeptEl.value;
    }

    this._overrideFormRows.push({ id: newId });

    const container = document.getElementById('override-rule-rows-container');
    if (container) {
      const rowDiv = document.createElement('div');
      rowDiv.id = `override-rule-row-${newId}`;
      rowDiv.className = 'override-rule-row';
      rowDiv.setAttribute('data-row-id', newId);
      rowDiv.innerHTML = this.renderOverrideRuleRowInnerHtml(newId, defaultDept);
      container.appendChild(rowDiv);

      if (defaultDept) {
        const deptEl = document.getElementById(`override-dept-${newId}`);
        if (deptEl) deptEl.value = defaultDept;
      }

      // Bind checkbox listeners
      document.querySelectorAll(`.override-cat-checkbox-${newId}`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCatDropdownLabel(newId));
      });
      document.querySelectorAll(`.override-cc-checkbox-${newId}`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCcDropdownLabel(newId));
      });

      this.updateOverrideRowHeaders();
    }
  },

  removeOverrideRuleRow(rowId) {
    if (!this._overrideFormRows || this._overrideFormRows.length <= 1) return;
    this._overrideFormRows = this._overrideFormRows.filter(r => r.id !== rowId);
    const rowEl = document.getElementById(`override-rule-row-${rowId}`);
    if (rowEl) rowEl.remove();
    this.updateOverrideRowHeaders();
  },

  updateOverrideRowHeaders() {
    const rows = document.querySelectorAll('.override-rule-row');
    const count = rows.length;
    rows.forEach((rowEl, idx) => {
      const headerEl = rowEl.querySelector('.override-row-header');
      if (headerEl) {
        headerEl.style.display = count > 1 ? 'flex' : 'none';
        const numSpan = headerEl.querySelector('.override-row-number');
        if (numSpan) numSpan.textContent = `Regra #${idx + 1}`;
      }
    });
  },

  toggleOverrideCatDropdown(rowId, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById(`override-cat-dropdown-menu-${rowId}`);
    const otherMenu = document.getElementById(`override-cc-dropdown-menu-${rowId}`);
    if (otherMenu) otherMenu.style.display = 'none';
    const planMenu = document.getElementById(`override-plan-dropdown-${rowId}`);
    if (planMenu) planMenu.style.display = 'none';
    if (!menu) return;
    menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
  },

  toggleOverrideCcDropdown(rowId, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById(`override-cc-dropdown-menu-${rowId}`);
    const otherMenu = document.getElementById(`override-cat-dropdown-menu-${rowId}`);
    if (otherMenu) otherMenu.style.display = 'none';
    const planMenu = document.getElementById(`override-plan-dropdown-${rowId}`);
    if (planMenu) planMenu.style.display = 'none';
    if (!menu) return;
    menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
  },

  updateOverrideCatDropdownLabel(rowId) {
    const label = document.getElementById(`override-cat-dropdown-label-${rowId}`);
    const selectAllCb = document.getElementById(`override-cat-select-all-${rowId}`);
    const badge = document.getElementById(`override-cat-count-badge-${rowId}`);
    const checkboxes = document.querySelectorAll(`.override-cat-checkbox-${rowId}`);
    const checked = document.querySelectorAll(`.override-cat-checkbox-${rowId}:checked`);
    const total = checkboxes.length;

    if (badge) badge.textContent = `${checked.length} de ${total}`;

    if (!label) return;
    if (checked.length === 0) {
      label.textContent = 'Selecione a(s) categoria(s)...';
      label.style.fontWeight = '500';
      if (selectAllCb) selectAllCb.checked = false;
    } else if (checked.length === total) {
      label.textContent = `Todas as categorias (${total})`;
      label.style.fontWeight = '700';
      if (selectAllCb) selectAllCb.checked = true;
    } else if (checked.length === 1) {
      const name = checked[0].dataset.name || '1 categoria';
      label.textContent = `1 categoria (${name})`;
      label.style.fontWeight = '600';
      if (selectAllCb) selectAllCb.checked = false;
    } else {
      label.textContent = `${checked.length} categorias selecionadas`;
      label.style.fontWeight = '600';
      if (selectAllCb) selectAllCb.checked = false;
    }
  },

  updateOverrideCcDropdownLabel(rowId) {
    const label = document.getElementById(`override-cc-dropdown-label-${rowId}`);
    const selectAllCb = document.getElementById(`override-cc-select-all-${rowId}`);
    const badge = document.getElementById(`override-cc-count-badge-${rowId}`);
    const checkboxes = document.querySelectorAll(`.override-cc-checkbox-${rowId}`);
    const checked = document.querySelectorAll(`.override-cc-checkbox-${rowId}:checked`);
    const total = checkboxes.length;

    if (badge) badge.textContent = `${checked.length} de ${total}`;

    if (label) {
      if (checked.length === 0) {
        label.textContent = 'Selecione o(s) centro(s)...';
        label.style.fontWeight = '500';
        if (selectAllCb) selectAllCb.checked = false;
      } else if (checked.length === total) {
        label.textContent = `Todos os centros de custo (${total})`;
        label.style.fontWeight = '700';
        if (selectAllCb) selectAllCb.checked = true;
      } else if (checked.length === 1) {
        const code = checked[0].dataset.code || checked[0].dataset.name || '1 centro';
        label.textContent = `1 centro (${code})`;
        label.style.fontWeight = '600';
        if (selectAllCb) selectAllCb.checked = false;
      } else {
        label.textContent = `${checked.length} centros selecionados`;
        label.style.fontWeight = '600';
        if (selectAllCb) selectAllCb.checked = false;
      }
    }

    this.updateOverrideCcChips(rowId);
  },

  updateOverrideCcChips(rowId) {
    const wrapper = document.getElementById(`override-cc-chips-wrapper-${rowId}`);
    const listEl = document.getElementById(`override-cc-chips-list-${rowId}`);
    const countEl = document.getElementById(`override-cc-chips-count-${rowId}`);
    if (!wrapper || !listEl) return;

    const checked = Array.from(document.querySelectorAll(`.override-cc-checkbox-${rowId}:checked`));
    if (checked.length === 0) {
      wrapper.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }

    wrapper.style.display = 'flex';
    if (countEl) countEl.textContent = checked.length;

    listEl.innerHTML = checked.map(cb => {
      const code = cb.dataset.code || cb.value;
      const name = cb.dataset.name || '';
      const val = cb.value;
      return `
        <span class="badge" style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);color:var(--text-1);font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
          <span>📍 ${escHtml(code ? code + ' - ' : '')}${escHtml(name)}</span>
          <button type="button" onclick="AdminPage.uncheckCcFromForm(${rowId}, '${escHtml(val)}')"
                  title="Excluir da seleção"
                  style="background:none;border:none;cursor:pointer;color:var(--text-4);font-size:12px;font-weight:800;line-height:1;padding:0 3px;margin-left:2px;border-radius:3px;transition:all 0.15s;"
                  onmouseover="this.style.color='var(--red)';this.style.background='rgba(239,68,68,0.1)';"
                  onmouseout="this.style.color='var(--text-4)';this.style.background='none';">
            ✕
          </button>
        </span>
      `;
    }).join(' ');
  },

  uncheckCcFromForm(rowId, val) {
    const cb = document.querySelector(`.override-cc-checkbox-${rowId}[value="${val}"]`);
    if (cb) {
      cb.checked = false;
    }
    const selectAllCb = document.getElementById(`override-cc-select-all-${rowId}`);
    if (selectAllCb) selectAllCb.checked = false;
    this.updateOverrideCcDropdownLabel(rowId);
  },

  async removeCcFromSavedRule(ruleId, ccCode) {
    if (!this._catOverrideRulesList) return;
    const rule = this._catOverrideRulesList.find(r => r.id === ruleId);
    if (!rule) return;

    const targetCode = String(ccCode).trim();
    let currentCcIds = [];

    if (rule.all_cost_centers) {
      currentCcIds = (this._catOverrideActiveCcs || [])
        .map(c => String(c.code || c.id).trim())
        .filter(c => c && c !== targetCode);
    } else {
      currentCcIds = (rule.cost_center_ids || [rule.cost_center_id])
        .map(c => String(c).trim())
        .filter(c => c && c !== targetCode);
    }

    if (currentCcIds.length === 0) {
      toast('A regra precisa ter pelo menos um Centro de Custo.', 'warning');
      return;
    }

    try {
      const payload = {
        rule_id: rule.id,
        department_id: rule.department_id,
        category_ids: rule.all_categories ? ['*'] : (rule.category_ids || [rule.category_id]),
        cost_center_ids: currentCcIds,
        sienge_apportionment_id: String(rule.sienge_apportionment_id),
        active: true
      };
      await Api.saveCategoryOverrideRule(payload);

      if (!this._overrideCardStates) this._overrideCardStates = {};
      this._overrideCardStates[rule.id] = true;

      toast(`Centro de custo ${targetCode} removido com sucesso!`, 'success');
      await this.renderCategoryOverrideRulesSection();
    } catch(err) {
      toast('Erro ao remover centro de custo: ' + err.message, 'error');
    }
  },

  async removeCatFromSavedRule(ruleId, catId) {
    if (!this._catOverrideRulesList) return;
    const rule = this._catOverrideRulesList.find(r => r.id === ruleId);
    if (!rule) return;

    const targetId = String(catId).trim();
    let currentCatIds = [];

    if (rule.all_categories) {
      currentCatIds = (this._catOverrideActiveCats || [])
        .map(c => c.id)
        .filter(c => String(c) !== targetId);
    } else {
      currentCatIds = (rule.category_ids || [rule.category_id])
        .map(c => parseInt(c) || c)
        .filter(c => String(c) !== targetId);
    }

    if (currentCatIds.length === 0) {
      toast('A regra precisa ter pelo menos uma Categoria.', 'warning');
      return;
    }

    try {
      const payload = {
        rule_id: rule.id,
        department_id: rule.department_id,
        category_ids: currentCatIds,
        cost_center_ids: rule.all_cost_centers ? ['*'] : (rule.cost_center_ids || [rule.cost_center_id]),
        sienge_apportionment_id: String(rule.sienge_apportionment_id),
        active: true
      };
      await Api.saveCategoryOverrideRule(payload);

      if (!this._overrideCardStates) this._overrideCardStates = {};
      this._overrideCardStates[rule.id] = true;

      toast('Categoria removida com sucesso!', 'success');
      await this.renderCategoryOverrideRulesSection();
    } catch(err) {
      toast('Erro ao remover categoria: ' + err.message, 'error');
    }
  },

  toggleSelectAllOverrideCats(rowId, checked) {
    document.querySelectorAll(`.override-cat-checkbox-${rowId}`).forEach(cb => {
      cb.checked = checked;
    });
    this.updateOverrideCatDropdownLabel(rowId);
  },

  toggleSelectAllOverrideCcs(rowId, checked) {
    document.querySelectorAll(`.override-cc-checkbox-${rowId}`).forEach(cb => {
      cb.checked = checked;
    });
    this.updateOverrideCcDropdownLabel(rowId);
  },

  filterOverrideCatCheckboxes(rowId, query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll(`.override-cat-item-label-${rowId}`).forEach(lbl => {
      const text = lbl.textContent.toLowerCase();
      lbl.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
    });
  },

  filterOverrideCcCheckboxes(rowId, query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll(`.override-cc-item-label-${rowId}`).forEach(lbl => {
      const text = lbl.textContent.toLowerCase();
      lbl.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
    });
  },

  // ── Autocomplete da Nova Apropriação Financeira ──
  onPlanSearchInput(rowId, query) {
    const clearBtn = document.getElementById(`override-plan-clear-${rowId}`);
    if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

    if (!query) {
      const hidden = document.getElementById(`override-plan-id-${rowId}`);
      if (hidden) hidden.value = '';
    }
    this.renderPlanDropdownOptions(rowId, query);
  },

  onPlanSearchFocus(rowId) {
    const inp = document.getElementById(`override-plan-input-${rowId}`);
    this.renderPlanDropdownOptions(rowId, inp ? inp.value : '');
  },

  renderPlanDropdownOptions(rowId, query) {
    const menu = document.getElementById(`override-plan-dropdown-${rowId}`);
    if (!menu || !this._catOverrideFinancialPlans) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = this._catOverrideFinancialPlans.filter(p => {
      if (!q) return true;
      return p.display.toLowerCase().includes(q) ||
             p.id.toLowerCase().includes(q) ||
             p.name.toLowerCase().includes(q) ||
             (p.formatted && p.formatted.toLowerCase().includes(q));
    }).slice(0, 60);

    if (filtered.length === 0) {
      menu.innerHTML = `<div style="padding:12px;color:var(--text-4);font-size:12px;text-align:center;">Nenhuma apropriação encontrada para "${escHtml(query)}"</div>`;
    } else {
      menu.innerHTML = filtered.map(p => `
        <div class="override-plan-opt" data-plan-id="${escHtml(p.id)}" data-plan-display="${escHtml(p.display)}"
             onclick="AdminPage.selectPlanOptionFromElement(${rowId}, this)"
             style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);transition:background 0.15s;display:flex;flex-direction:column;gap:2px;"
             onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'">
          <span style="font-weight:700;color:var(--text-1);">${escHtml(p.formatted || p.id)}</span>
          <span style="font-size:11px;color:var(--text-3);">${escHtml(p.name)}</span>
        </div>
      `).join('');
    }
    menu.style.display = 'block';
  },

  selectPlanOptionFromElement(rowId, el) {
    const planId = el.getAttribute('data-plan-id') || '';
    const display = el.getAttribute('data-plan-display') || '';
    const inp = document.getElementById(`override-plan-input-${rowId}`);
    const hidden = document.getElementById(`override-plan-id-${rowId}`);
    const clearBtn = document.getElementById(`override-plan-clear-${rowId}`);
    const menu = document.getElementById(`override-plan-dropdown-${rowId}`);

    if (inp) inp.value = display;
    if (hidden) hidden.value = planId;
    if (clearBtn) clearBtn.style.display = 'block';
    if (menu) menu.style.display = 'none';
  },

  clearPlanSearch(rowId) {
    const inp = document.getElementById(`override-plan-input-${rowId}`);
    const hidden = document.getElementById(`override-plan-id-${rowId}`);
    const clearBtn = document.getElementById(`override-plan-clear-${rowId}`);
    const menu = document.getElementById(`override-plan-dropdown-${rowId}`);

    if (inp) {
      inp.value = '';
      inp.focus();
    }
    if (hidden) hidden.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (menu) this.renderPlanDropdownOptions(rowId, '');
  },

  // ── Recolher / Expandir Cards de Regras Cadastradas ──
  toggleOverrideRuleCard(ruleId) {
    const body = document.getElementById(`override-rule-body-${ruleId}`);
    const chevron = document.getElementById(`override-rule-chevron-${ruleId}`);
    const btnText = document.getElementById(`override-rule-btn-text-${ruleId}`);
    if (!body) return;

    const isHidden = body.style.display === 'none' || !body.style.display;
    body.style.display = isHidden ? 'flex' : 'none';
    if (chevron) chevron.textContent = isHidden ? '▼' : '▶';
    if (btnText) btnText.textContent = isHidden ? 'Recolher' : 'Expandir';

    if (!this._overrideCardStates) this._overrideCardStates = {};
    this._overrideCardStates[ruleId] = isHidden;
  },

  toggleAllOverrideRules() {
    const bodies = document.querySelectorAll('.override-rule-body');
    if (bodies.length === 0) return;

    let anyCollapsed = false;
    bodies.forEach(b => {
      if (b.style.display === 'none' || !b.style.display) anyCollapsed = true;
    });

    const shouldExpand = anyCollapsed;
    if (!this._overrideCardStates) this._overrideCardStates = {};
    bodies.forEach(b => {
      b.style.display = shouldExpand ? 'flex' : 'none';
      const ruleId = b.id.replace('override-rule-body-', '');
      this._overrideCardStates[ruleId] = shouldExpand;
      const chevron = document.getElementById(`override-rule-chevron-${ruleId}`);
      const btnText = document.getElementById(`override-rule-btn-text-${ruleId}`);
      if (chevron) chevron.textContent = shouldExpand ? '▼' : '▶';
      if (btnText) btnText.textContent = shouldExpand ? 'Recolher' : 'Expandir';
    });

    const icon = document.getElementById('override-rules-toggle-all-icon');
    const text = document.getElementById('override-rules-toggle-all-text');
    if (icon) icon.textContent = shouldExpand ? '▲' : '▼';
    if (text) text.textContent = shouldExpand ? 'Recolher Todas' : 'Expandir Todas';
  },

  clearCategoryOverrideRuleForm() {
    this._editingOverrideRuleId = null;
    this._overrideFormRows = [{ id: 0 }];

    const hiddenId = document.getElementById('override-rule-id');
    if (hiddenId) hiddenId.value = '';

    const formTitle = document.getElementById('override-form-title');
    if (formTitle) formTitle.textContent = '➕ Criar Nova Regra de Alteração na Categoria';

    const saveBtn = document.getElementById('btn-save-override-rule');
    if (saveBtn) saveBtn.innerHTML = '💾 Salvar Regras de Alteração';

    const cancelBtn = document.getElementById('btn-cancel-override-rule');
    if (cancelBtn) cancelBtn.style.display = 'none';

    const addRowBtn = document.getElementById('btn-add-override-row');
    if (addRowBtn) addRowBtn.style.display = 'inline-flex';

    const container = document.getElementById('override-rule-rows-container');
    if (container) {
      container.innerHTML = `
        <div class="override-rule-row" id="override-rule-row-0" data-row-id="0">
          ${this.renderOverrideRuleRowInnerHtml(0)}
        </div>
      `;
      document.querySelectorAll(`.override-cat-checkbox-0`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCatDropdownLabel(0));
      });
      document.querySelectorAll(`.override-cc-checkbox-0`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCcDropdownLabel(0));
      });
      this.updateOverrideRowHeaders();
    }
  },

  editCategoryOverrideRule(ruleId) {
    if (!this._catOverrideRulesList) return;
    const rule = this._catOverrideRulesList.find(r => r.id === ruleId);
    if (!rule) return;

    this._editingOverrideRuleId = ruleId;
    this._overrideFormRows = [{ id: 0 }];

    const hiddenId = document.getElementById('override-rule-id');
    if (hiddenId) hiddenId.value = ruleId;

    const container = document.getElementById('override-rule-rows-container');
    if (container) {
      container.innerHTML = `
        <div class="override-rule-row" id="override-rule-row-0" data-row-id="0">
          ${this.renderOverrideRuleRowInnerHtml(0, String(rule.department_id))}
        </div>
      `;
      document.querySelectorAll(`.override-cat-checkbox-0`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCatDropdownLabel(0));
      });
      document.querySelectorAll(`.override-cc-checkbox-0`).forEach(cb => {
        cb.addEventListener('change', () => this.updateOverrideCcDropdownLabel(0));
      });
    }

    const deptSel = document.getElementById('override-dept-0');
    if (deptSel) deptSel.value = String(rule.department_id);

    // Categorias
    if (rule.all_categories || (rule.category_ids && (rule.category_ids.includes('*') || rule.category_ids.includes('all')))) {
      document.querySelectorAll('.override-cat-checkbox-0').forEach(cb => cb.checked = true);
      const selAll = document.getElementById('override-cat-select-all-0');
      if (selAll) selAll.checked = true;
    } else {
      const targetCatIds = (rule.category_ids || [rule.category_id]).map(String);
      document.querySelectorAll('.override-cat-checkbox-0').forEach(cb => {
        cb.checked = targetCatIds.includes(String(cb.value));
      });
      const selAll = document.getElementById('override-cat-select-all-0');
      if (selAll) selAll.checked = false;
    }
    this.updateOverrideCatDropdownLabel(0);

    // Centros de custo
    if (rule.all_cost_centers || (rule.cost_center_ids && (rule.cost_center_ids.includes('*') || rule.cost_center_ids.includes('all')))) {
      document.querySelectorAll('.override-cc-checkbox-0').forEach(cb => cb.checked = true);
      const selAll = document.getElementById('override-cc-select-all-0');
      if (selAll) selAll.checked = true;
    } else {
      const targetCcIds = (rule.cost_center_ids || [rule.cost_center_id]).map(String);
      document.querySelectorAll('.override-cc-checkbox-0').forEach(cb => {
        const val = String(cb.value).trim();
        const code = String(cb.dataset.code || '').trim();
        cb.checked = targetCcIds.includes(val) || (code && targetCcIds.includes(code));
      });
      const selAll = document.getElementById('override-cc-select-all-0');
      if (selAll) selAll.checked = false;
    }
    this.updateOverrideCcDropdownLabel(0);

    // Nova Apropriação Financeira
    const planHidden = document.getElementById('override-plan-id-0');
    const planInput = document.getElementById('override-plan-input-0');
    const planClear = document.getElementById('override-plan-clear-0');

    const pid = String(rule.sienge_apportionment_id || '');
    if (planHidden) planHidden.value = pid;

    const matchedPlan = (this._catOverrideFinancialPlans || []).find(p => p.id === pid);
    const planDisplay = matchedPlan ? matchedPlan.display : (rule.formatted_apportionment ? `${rule.formatted_apportionment} - ${rule.apportionment_name || ''}` : pid);
    if (planInput) planInput.value = planDisplay;
    if (planClear) planClear.style.display = pid ? 'block' : 'none';

    const formTitle = document.getElementById('override-form-title');
    if (formTitle) formTitle.textContent = `✏️ Editar Regra de Alteração #${ruleId}`;

    const saveBtn = document.getElementById('btn-save-override-rule');
    if (saveBtn) saveBtn.innerHTML = '💾 Atualizar Regra de Alteração';

    const cancelBtn = document.getElementById('btn-cancel-override-rule');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    const addRowBtn = document.getElementById('btn-add-override-row');
    if (addRowBtn) addRowBtn.style.display = 'none';

    this.updateOverrideRowHeaders();

    const formEl = document.getElementById('override-form-title');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async saveCategoryOverrideRule() {
    const isEditing = !!this._editingOverrideRuleId;
    const rows = this._overrideFormRows || [{ id: 0 }];

    const collectedRules = [];

    for (let i = 0; i < rows.length; i++) {
      const rowId = rows[i].id;
      const deptSel = document.getElementById(`override-dept-${rowId}`);
      const planHidden = document.getElementById(`override-plan-id-${rowId}`);
      const planInput = document.getElementById(`override-plan-input-${rowId}`);

      const department_id = deptSel ? deptSel.value : '';
      let sienge_apportionment_id = planHidden ? planHidden.value : '';

      if (!sienge_apportionment_id && planInput && planInput.value.trim() && this._catOverrideFinancialPlans) {
        const match = this._catOverrideFinancialPlans.find(p => p.display.toLowerCase() === planInput.value.trim().toLowerCase() || p.id === planInput.value.trim());
        if (match) sienge_apportionment_id = match.id;
      }

      // Categorias selecionadas
      const catSelectAll = document.getElementById(`override-cat-select-all-${rowId}`);
      const checkedCats = Array.from(document.querySelectorAll(`.override-cat-checkbox-${rowId}:checked`));
      const totalCats = document.querySelectorAll(`.override-cat-checkbox-${rowId}`).length;

      let selectedCatIds = [];
      if (catSelectAll && catSelectAll.checked) {
        selectedCatIds = ['*'];
      } else if (checkedCats.length === totalCats && totalCats > 0) {
        selectedCatIds = ['*'];
      } else {
        selectedCatIds = checkedCats.map(cb => parseInt(cb.value));
      }

      // Centros de custo selecionados
      const ccSelectAll = document.getElementById(`override-cc-select-all-${rowId}`);
      const checkedCcs = Array.from(document.querySelectorAll(`.override-cc-checkbox-${rowId}:checked`));
      const totalCcs = document.querySelectorAll(`.override-cc-checkbox-${rowId}`).length;

      let selectedCcIds = [];
      if (ccSelectAll && ccSelectAll.checked) {
        selectedCcIds = ['*'];
      } else if (checkedCcs.length === totalCcs && totalCcs > 0) {
        selectedCcIds = ['*'];
      } else {
        selectedCcIds = checkedCcs.map(cb => cb.value);
      }

      const rowPrefix = rows.length > 1 ? `Regra #${i + 1}: ` : '';

      if (!department_id) {
        toast(`${rowPrefix}Selecione o Departamento do colaborador solicitante.`, 'warning');
        return;
      }
      if (selectedCatIds.length === 0) {
        toast(`${rowPrefix}Selecione pelo menos uma Categoria (ou Marcar Todos).`, 'warning');
        return;
      }
      if (selectedCcIds.length === 0) {
        toast(`${rowPrefix}Selecione pelo menos um Centro de Custo (ou Marcar Todos).`, 'warning');
        return;
      }
      if (!sienge_apportionment_id) {
        toast(`${rowPrefix}Busque e selecione a nova Apropriação Financeira na lista ao digitar.`, 'warning');
        return;
      }

      collectedRules.push({
        department_id: parseInt(department_id),
        category_ids: selectedCatIds,
        cost_center_ids: selectedCcIds,
        sienge_apportionment_id: String(sienge_apportionment_id),
        active: true
      });
    }

    try {
      let res;
      if (isEditing) {
        const payload = {
          rule_id: this._editingOverrideRuleId,
          ...collectedRules[0]
        };
        res = await Api.saveCategoryOverrideRule(payload);
      } else {
        const payload = {
          rules: collectedRules
        };
        res = await Api.saveCategoryOverrideRule(payload);
      }

      toast(res.message || 'Regra(s) de alteração salva(s) com sucesso!', 'success');
      this.clearCategoryOverrideRuleForm();
      await this.renderCategoryOverrideRulesSection();
    } catch(err) {
      toast('Erro ao salvar regra(s): ' + err.message, 'error');
    }
  },

  async deleteCategoryOverrideRule(ruleId) {
    if (!confirm('Tem certeza que deseja excluir esta regra de alteração na categoria?')) return;
    try {
      await Api.deleteCategoryOverrideRule(ruleId);
      toast('Regra de alteração excluída com sucesso!', 'success');
      await this.renderCategoryOverrideRulesSection();
    } catch(err) {
      toast('Erro ao excluir regra: ' + err.message, 'error');
    }
  },

  async renderEmailTemplates(activeKey = 'closing_dates') {
    const el = document.getElementById('admin-section-content');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:60px;">
        <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);"></div>
        Carregando modelos de e-mail...
      </div>
    `;

    const _esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    try {
      const templates = await Api.getEmailTemplates();
      let currentTmpl = templates.find(t => t.key === activeKey) || templates[0];
      if (!currentTmpl) {
        el.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Nenhum modelo de e-mail encontrado.</p></div>`;
        return;
      }

        let schedules = [];
        try { schedules = await Api.getPaymentCalendar(); } catch (e) {}

        const renderView = () => {
          const isClosing = this.activeEmailTemplateKey === 'closing_dates';

          // Sample placeholder data for live preview
          const now = new Date();
          const curYear = now.getFullYear();
          const curMonth = now.getMonth() + 1;
          const curMonthStr = String(curMonth).padStart(2, '0') + '/' + curYear;

          const curSched = (schedules || []).find(s => s.year === curYear && s.month === curMonth);
          const sampleDate = (curSched && curSched.payment_date) ? fmtDate(curSched.payment_date) : ('28/' + curMonthStr);
          const sampleClosing = (curSched && curSched.closing_date) ? fmtDate(curSched.closing_date) : ('20/' + curMonthStr);
          const sampleApproval = (curSched && curSched.approval_date) ? fmtDate(curSched.approval_date) : ('25/' + curMonthStr);
          const sampleUser = App.user?.name || 'João Silva';

        el.innerHTML = `
          <div class="card" style="margin-bottom: 20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
              <div>
                <h2 style="font-size:20px;font-weight:700;color:var(--text-1);margin:0 0 4px 0;display:flex;align-items:center;gap:8px;">
                  ✉️ Modelos de E-mail
                </h2>
                <p style="font-size:13.5px;color:var(--text-3);margin:0;">
                  Gerenciamento dos comunicados e modelos de e-mail padrão do sistema
                </p>
              </div>

              <!-- Tabs para alternar entre os modelos -->
              <div style="display:flex;gap:6px;background:var(--surface-2);padding:4px;border-radius:10px;border:1px solid var(--border);">
                <button type="button" class="btn btn-sm ${isClosing ? 'btn-primary' : 'btn-ghost'}" id="tab-email-closing" style="font-weight:600;border-radius:8px;padding:7px 16px;">
                  📅 Datas de fechamento
                </button>
                <button type="button" class="btn btn-sm ${!isClosing ? 'btn-primary' : 'btn-ghost'}" id="tab-email-payment" style="font-weight:600;border-radius:8px;padding:7px 16px;">
                  💳 Data de Pagamento
                </button>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:minmax(380px, 1.15fr) minmax(360px, 1fr);gap:24px;align-items:start;">
            
            <!-- COLUNA DA ESQUERDA: EDITOR DO MODELO -->
            <div class="card" style="box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:14px;">
                <div>
                  <div style="font-size:16px;font-weight:700;color:var(--text-1);display:flex;align-items:center;gap:8px;">
                    <span>${isClosing ? '📅' : '💳'}</span>
                    <span>${_esc(currentTmpl.name)}</span>
                  </div>
                  <div style="font-size:12.5px;color:var(--text-3);margin-top:4px;">
                    ${_esc(currentTmpl.description || '')}
                  </div>
                </div>
                <span class="badge" style="background:var(--ml-light);color:var(--ml-indigo);font-weight:700;padding:4px 10px;border-radius:12px;font-size:11px;">
                  ${isClosing ? 'LEMBRETE MENSAL' : 'RELATÓRIO / PAGAMENTO'}
                </span>
              </div>

              <!-- TAGS DISPONÍVEIS -->
              <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 14px;margin-bottom:18px;">
                <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                  <span>💡 Variáveis Dinâmicas (clique para inserir no texto):</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;" id="tags-container">
                  ${isClosing ? `
                    <button type="button" class="tag-pill" data-tag="{nome_usuario}" title="Nome do colaborador">👤 {nome_usuario}</button>
                    <button type="button" class="tag-pill" data-tag="{data_fechamento}" title="Data limite para envio das despesas">📅 {data_fechamento}</button>
                    <button type="button" class="tag-pill" data-tag="{data_aprovação}" title="Data limite para aprovação">✅ {data_aprovação}</button>
                    <button type="button" class="tag-pill" data-tag="{data_pagamento}" title="Data programada para pagamento">💳 {data_pagamento}</button>
                    <button type="button" class="tag-pill" data-tag="{mes_ano}" title="Mês e ano (ex: 08/2026)">🗓️ {mes_ano}</button>
                  ` : `
                    <button type="button" class="tag-pill" data-tag="{nome_usuario}" title="Nome do colaborador">👤 {nome_usuario}</button>
                    <button type="button" class="tag-pill" data-tag="{data_pagamento}" title="Data programada para pagamento">💳 {data_pagamento}</button>
                    <button type="button" class="tag-pill" data-tag="{nome_relatorio}" title="Nome do relatório gerado">📄 {nome_relatorio}</button>
                    <button type="button" class="tag-pill" data-tag="{mes_ano}" title="Mês e ano (ex: 08/2026)">🗓️ {mes_ano}</button>
                  `}
                </div>
              </div>

              <form id="email-template-form">
                <div class="field required" style="margin-bottom: 16px;">
                  <label for="tmpl-subject" style="font-weight:600;font-size:13.5px;color:var(--text-1);display:block;margin-bottom:6px;">
                    Assunto do E-mail
                  </label>
                  <input type="text" id="tmpl-subject" class="form-control" value="${_esc(currentTmpl.subject)}" required
                         style="width:100%;padding:10px 14px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;color:var(--text-1);" />
                </div>

                <div class="field required" style="margin-bottom: 20px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <label for="tmpl-body" style="font-weight:600;font-size:13.5px;color:var(--text-1);">
                      Corpo da Mensagem
                    </label>
                    <span id="body-char-count" style="font-size:11.5px;color:var(--text-4);"></span>
                  </div>
                  <textarea id="tmpl-body" rows="12" class="form-control" required
                            style="width:100%;padding:12px 14px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-family:Consolas, Monaco, 'Courier New', monospace;font-size:13px;line-height:1.6;color:var(--text-1);resize:vertical;">${_esc(currentTmpl.body)}</textarea>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-top:12px;border-top:1px solid var(--border);">
                  <div style="display:flex;gap:10px;">
                    <button type="submit" class="btn btn-primary" id="save-tmpl-btn" style="padding:10px 20px;font-weight:600;">
                      💾 Salvar Modelo
                    </button>
                    <button type="button" class="btn btn-secondary" id="reset-tmpl-btn" style="padding:10px 16px;">
                      🔄 Restaurar Padrão
                    </button>
                  </div>
                  <button type="button" class="btn btn-outline" id="test-tmpl-btn" style="padding:10px 16px;color:var(--ml-indigo);border-color:var(--ml-indigo);">
                    📤 Enviar E-mail de Teste
                  </button>
                </div>
              </form>
            </div>

            <!-- COLUNA DA DIREITA: PRÉ-VISUALIZAÇÃO EM TEMPO REAL -->
            <div class="card" style="box-shadow: 0 4px 14px rgba(0,0,0,0.06);padding:0;overflow:hidden;border:1px solid #cbd5e1;background:#f8fafc;">
              
              <!-- Barra estilo cliente de e-mail -->
              <div style="background:#0f172a;color:#ffffff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="height:10px;width:10px;border-radius:50%;background:#ef4444;display:inline-block;"></span>
                  <span style="height:10px;width:10px;border-radius:50%;background:#eab308;display:inline-block;"></span>
                  <span style="height:10px;width:10px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
                  <span style="font-size:12.5px;color:#94a3b8;font-weight:600;margin-left:8px;">👁️ Pré-visualização do E-mail</span>
                </div>
                <span style="font-size:11px;color:#94a3b8;background:rgba(255,255,255,0.1);padding:3px 8px;border-radius:4px;">
                  Modo Realista
                </span>
              </div>

              <!-- Cabeçalho do e-mail recebido -->
              <div style="background:#ffffff;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;" id="preview-subject">
                  Carregando assunto...
                </div>
                <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:#64748b;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#15803D;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">
                    ML
                  </div>
                  <div>
                    <div style="color:#0f172a;font-weight:600;">
                      Moura Leite Loteamentos <span style="font-weight:400;color:#64748b;">&lt;reembolsos@mouraleite.com.br&gt;</span>
                    </div>
                    <div>
                      Para: <strong style="color:#334155;">${_esc(sampleUser)}</strong> &lt;usuario@mouraleite.com.br&gt;
                    </div>
                  </div>
                </div>
              </div>

              <!-- Corpo do e-mail renderizado no formato institucional -->
              <div style="padding:20px;background:#f1f5f9;">
                <div style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                  <!-- Banner superior corporativo -->
                  <div style="background:#15803D;color:#ffffff;padding:18px 24px;text-align:center;">
                    <div style="font-size:17px;font-weight:800;letter-spacing:0.5px;">Moura Leite</div>
                    <div style="font-size:12px;opacity:0.9;margin-top:2px;">
                      ${isClosing ? 'Lembrete: Fechamento de Despesas' : 'Relatório de Reembolso de Despesas'}
                    </div>
                  </div>

                  <!-- Conteúdo principal do e-mail -->
                  <div style="padding:22px 24px;color:#334155;font-size:13.5px;line-height:1.6;" id="preview-body-content">
                    Carregando corpo...
                  </div>

                  <!-- Anexo PDF (apenas para relatório de pagamento) -->
                  ${!isClosing ? `
                    <div style="padding:0 24px 20px 24px;">
                      <div style="display:inline-flex;align-items:center;background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:12.5px;color:#475569;font-weight:500;">
                        📎 Arquivo PDF anexado: <strong>Relatório_Reembolso_${sampleUser}_${curMonthStr}.pdf</strong>
                      </div>
                    </div>
                  ` : ''}

                  <!-- Rodapé institucional -->
                  <div style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11.5px;color:#94a3b8;border-top:1px solid #e2e8f0;">
                    Moura Leite Loteamentos &bull; Sistema de Gestão de Reembolsos &bull; E-mail automático
                  </div>
                </div>
              </div>
            </div>

          </div>
        `;

        // Style for tag pills
        const styleId = 'email-tmpl-custom-styles';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            .tag-pill {
              background: #ffffff;
              border: 1px solid #cbd5e1;
              color: #334155;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s ease;
            }
            .tag-pill:hover {
              background: var(--ml-light);
              border-color: var(--ml-indigo);
              color: var(--ml-indigo);
              transform: translateY(-1px);
            }
          `;
          document.head.appendChild(style);
        }

        const subjectInput = document.getElementById('tmpl-subject');
        const bodyTextarea = document.getElementById('tmpl-body');
        const previewSubject = document.getElementById('preview-subject');
        const previewBody = document.getElementById('preview-body-content');
        const charCount = document.getElementById('body-char-count');

        // Monitor last focused field to know where to insert variable tags
        let lastFocusedInput = subjectInput;
        subjectInput.addEventListener('focus', () => { lastFocusedInput = subjectInput; });
        subjectInput.addEventListener('click', () => { lastFocusedInput = subjectInput; });
        subjectInput.addEventListener('keyup', () => { lastFocusedInput = subjectInput; });

        bodyTextarea.addEventListener('focus', () => { lastFocusedInput = bodyTextarea; });
        bodyTextarea.addEventListener('click', () => { lastFocusedInput = bodyTextarea; });
        bodyTextarea.addEventListener('keyup', () => { lastFocusedInput = bodyTextarea; });

        const updateLivePreview = () => {
          const rawSub = subjectInput.value || '';
          const rawBody = bodyTextarea.value || '';

          // Replace tags for preview
          const renderText = (str) => {
            return str
              .replaceAll('{nome_usuario}', sampleUser)
              .replaceAll('{data_pagamento}', sampleDate)
              .replaceAll('{data_fechamento}', sampleClosing)
              .replaceAll('{data_aprovação}', sampleApproval)
              .replaceAll('{data_aprovacao}', sampleApproval)
              .replaceAll('{nome_relatorio}', `Relatório_${sampleUser}_${curMonthStr}`)
              .replaceAll('{mes_ano}', curMonthStr);
          };

          previewSubject.textContent = renderText(rawSub);
          const renderedBody = _esc(renderText(rawBody)).replace(/\n/g, '<br>');
          previewBody.innerHTML = renderedBody;

          if (charCount) charCount.textContent = `${rawBody.length} caracteres`;
        };

        subjectInput.addEventListener('input', updateLivePreview);
        bodyTextarea.addEventListener('input', updateLivePreview);
        updateLivePreview();

        // Tag click insertion targeting the currently active or last active field
        document.querySelectorAll('.tag-pill').forEach(btn => {
          btn.addEventListener('mousedown', (e) => {
            // Prevent button from stealing focus from lastFocusedInput
            e.preventDefault();
          });

          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = btn.dataset.tag;
            const targetEl = lastFocusedInput || subjectInput;
            const start = typeof targetEl.selectionStart === 'number' ? targetEl.selectionStart : targetEl.value.length;
            const end = typeof targetEl.selectionEnd === 'number' ? targetEl.selectionEnd : targetEl.value.length;
            const text = targetEl.value;
            targetEl.value = text.substring(0, start) + tag + text.substring(end);
            targetEl.selectionStart = targetEl.selectionEnd = start + tag.length;
            targetEl.focus();
            updateLivePreview();
          });
        });


        // Tabs click
        document.getElementById('tab-email-closing').addEventListener('click', () => {
          this.activeEmailTemplateKey = 'closing_dates';
          currentTmpl = templates.find(t => t.key === 'closing_dates') || currentTmpl;
          this.currentSection = 'email-closing';
          localStorage.setItem('ml_admin_current_section', 'email-closing');
          document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
          document.getElementById('anav-email-closing')?.classList.add('active');
          renderView();
        });

        document.getElementById('tab-email-payment').addEventListener('click', () => {
          this.activeEmailTemplateKey = 'payment_date';
          currentTmpl = templates.find(t => t.key === 'payment_date') || currentTmpl;
          this.currentSection = 'email-payment';
          localStorage.setItem('ml_admin_current_section', 'email-payment');
          document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
          document.getElementById('anav-email-payment')?.classList.add('active');
          renderView();
        });

        // Save form
        document.getElementById('email-template-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const saveBtn = document.getElementById('save-tmpl-btn');
          saveBtn.disabled = true;
          saveBtn.textContent = 'Salvando...';

          try {
            const res = await Api.updateEmailTemplate(this.activeEmailTemplateKey, {
              subject: subjectInput.value,
              body: bodyTextarea.value
            });
            toast(res.message || 'Modelo salvo com sucesso!', 'success');
            currentTmpl.subject = subjectInput.value;
            currentTmpl.body = bodyTextarea.value;
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Salvar Modelo';
          }
        });

        // Reset button
        document.getElementById('reset-tmpl-btn').addEventListener('click', async () => {
          if (!confirm(`Deseja restaurar o modelo "${currentTmpl.name}" para o texto padrão original?`)) return;
          try {
            const res = await Api.resetEmailTemplate(this.activeEmailTemplateKey);
            toast(res.message, 'success');
            subjectInput.value = res.template.subject;
            bodyTextarea.value = res.template.body;
            currentTmpl.subject = res.template.subject;
            currentTmpl.body = res.template.body;
            updateLivePreview();
          } catch (err) {
            toast(err.message, 'error');
          }
        });

        // Test email button
        document.getElementById('test-tmpl-btn').addEventListener('click', async () => {
          const adminEmail = App.user?.email || 'admin@mouraleite.com.br';
          const target = prompt(`Digite o e-mail de destino para o teste do modelo "${currentTmpl.name}":`, adminEmail);
          if (!target) return;

          const testBtn = document.getElementById('test-tmpl-btn');
          testBtn.disabled = true;
          testBtn.textContent = 'Enviando...';

          try {
            const res = await Api.sendTestEmailTemplate(this.activeEmailTemplateKey, {
              target_email: target,
              subject: subjectInput.value,
              body: bodyTextarea.value
            });
            toast(res.message || 'E-mail de teste enviado com sucesso!', 'success');
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            testBtn.disabled = false;
            testBtn.textContent = '📤 Enviar E-mail de Teste';
          }
        });
      };

      renderView();
    } catch (err) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <p>Erro ao carregar modelos de e-mail: ${_esc(err.message)}</p>
        </div>
      `;
    }
  },
};
