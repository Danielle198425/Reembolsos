import json
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''    async deleteCC(id) {
      Modal.confirm('Desativar CC', 'Deseja desativar este centro de custo?', async () => {
        try { await Api.deleteCostCenter(id); toast('CC desativado', 'success'); this.renderCostCenters(); }
        catch(err) { toast(err.message, 'error'); }
      }, true);
    },

    // ── POLICIES ──────────────────────────────────────────────────────────────'''

replacement = '''    async deleteCC(id) {
      Modal.confirm('Desativar CC', 'Deseja desativar este centro de custo?', async () => {
        try { await Api.deleteCostCenter(id); toast('CC desativado', 'success'); this.renderCostCenters(); }
        catch(err) { toast(err.message, 'error'); }
      }, true);
    },

    // ────────────────────────────────────────────────────────────────────────────────
    // ROLES (Funções)
    // ────────────────────────────────────────────────────────────────────────────────
    async renderRoles() {
      const el = document.getElementById('admin-section-content');
      el.innerHTML = 
        <div class="table-wrapper">
          <div class="table-header">
            <span class="card-title">👨‍💼 Funções</span>
            <button class="btn btn-primary btn-sm" id="btn-add-role">➕ Nova Função</button>
          </div>
          <table>
            <thead>
              <tr><th>Nome</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody id="role-tbody">
              <tr class="loading-row"><td colspan="3">Carregando...</td></tr>
            </tbody>
          </table>
        </div>;

      document.getElementById('btn-add-role').addEventListener('click', () => this.openRoleForm());

      try {
        const roles = await Api.getJobRoles();
        document.getElementById('role-tbody').innerHTML = roles.map(r => 
          <tr>
            <td style="font-weight:600;">\</td>
            <td><span class="badge \">\</span></td>
            <td>
              <div class="td-actions">
                <button class="action-btn" onclick="AdminPage.openRoleForm(\)">✏️</button>
                <button class="action-btn danger" onclick="AdminPage.deleteRole(\)">🗑</button>
              </div>
            </td>
          </tr>).join('');
      } catch(err) {
        document.getElementById('role-tbody').innerHTML = <tr><td colspan="3" style="color:var(--red);">Erro: \</td></tr>;
      }
    },

    async openRoleForm(id = null) {
      let role = null;
      if (id) {
        const roles = await Api.getJobRoles();
        role = roles.find(r => r.id === id);
      }
      const html = 
        <div class="form-grid">
          <div class="field required span-2">
            <label for="role-name">Nome da Função</label>
            <input type="text" id="role-name" value="\" placeholder="Ex: Gerente de Projetos" />
          </div>
          <div class="field span-2" style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <style>
              .toggle-switch-r { position: relative; display: inline-block; width: 36px; height: 20px; }
              .toggle-switch-r input { opacity: 0; width: 0; height: 0; }
              .toggle-slider-r { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 20px; }
              .toggle-slider-r:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
              .toggle-switch-r input:checked + .toggle-slider-r { background-color: #10B981; }
              .toggle-switch-r input:checked + .toggle-slider-r:before { transform: translateX(16px); }
            </style>
            <label class="toggle-switch-r">
              <input type="checkbox" id="role-active" \>
              <span class="toggle-slider-r"></span>
            </label>
            <span style="font-size:14px;font-weight:500;">Função Ativa</span>
          </div>
        </div>
        <div id="role-error" class="login-error hidden" style="margin-top:12px;"></div>
      ;

      Modal.open(id ? 'Editar Função' : 'Nova Função', html,
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
         <button class="btn btn-primary" id="save-role-btn">✔️ Salvar</button>
      );

      document.getElementById('save-role-btn').addEventListener('click', async () => {
        const btn = document.getElementById('save-role-btn');
        const errEl = document.getElementById('role-error');
        errEl.classList.add('hidden');

        const name = document.getElementById('role-name').value.trim();
        const active = document.getElementById('role-active').checked;

        if (!name) {
          errEl.textContent = 'Preencha o nome da função.';
          errEl.classList.remove('hidden');
          return;
        }

        btn.disabled = true;
        try {
          if (id) await Api.updateJobRole(id, { name, active });
          else await Api.createJobRole({ name, active });
          Modal.close();
          toast(id ? 'Função atualizada' : 'Função criada', 'success');
          this.renderRoles();
        } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); btn.disabled = false; }
      });
    },

    async deleteRole(id) {
      Modal.confirm('Desativar Função', 'Deseja desativar esta função?', async () => {
        try { await Api.deleteJobRole(id); toast('Função desativada', 'success'); this.renderRoles(); }
        catch(err) { toast(err.message, 'error'); }
      }, true);
    },

    // ── POLICIES ──────────────────────────────────────────────────────────────'''

if target in content:
    content = content.replace(target, replacement)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replacement successful")
else:
    print("Target not found")
