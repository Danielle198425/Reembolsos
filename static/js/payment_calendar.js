/**
 * payment_calendar.js — Módulo do Calendário de Pagamentos
 */
const PaymentCalendarPage = {
  schedules: [],

  async render() {
    const el = document.getElementById('page-payment-calendar');
    if (!el) return;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Calendários</h1>
          <p class="page-subtitle">Configuração das datas programadas de pagamento, aprovação e limite para envio de despesas</p>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px; max-width: 600px;">
        <div class="card-title" style="margin-bottom:18px; font-size:16px; font-weight:700;">
          📅 Agendar datas
        </div>
        <form id="payment-schedule-form">
          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="field required">
              <label for="sched-month">Mês</label>
              <select id="sched-month" class="form-control" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;">
                <option value="1">Janeiro</option>
                <option value="2">Fevereiro</option>
                <option value="3">Março</option>
                <option value="4">Abril</option>
                <option value="5">Maio</option>
                <option value="6">Junho</option>
                <option value="7">Julho</option>
                <option value="8">Agosto</option>
                <option value="9">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </div>
            <div class="field required">
              <label for="sched-year">Ano</label>
              <input type="number" id="sched-year" value="${curYear}" min="2024" max="2035" class="form-control" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;" />
            </div>

            <div class="field span-2 required" style="grid-column: span 2;">
              <label for="sched-date">Data do Pagamento</label>
              <input type="date" id="sched-date" class="form-control" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;" required />
            </div>

            <div class="field span-2" style="grid-column: span 2;">
              <label for="sched-approval-date">Data de Aprovação</label>
              <input type="date" id="sched-approval-date" class="form-control" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;" />
            </div>

            <div class="field span-2" style="grid-column: span 2;">
              <label for="sched-closing-date">Limite para Envio</label>
              <input type="date" id="sched-closing-date" class="form-control" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);font-size:14px;" />
            </div>
          </div>
          <div style="margin-top: 20px; display:flex; justify-content:flex-end;">
            <button type="submit" class="btn btn-primary" id="save-sched-btn" style="background:var(--ml-green, #15803D);border-color:var(--ml-green, #15803D);padding:10px 22px;border-radius:8px;font-weight:600;display:inline-flex;align-items:center;gap:8px;">
              💾 Salvar datas
            </button>
          </div>
        </form>
      </div>

      <div class="table-wrapper">
        <div class="table-header">
          <span class="table-count" id="sched-count">Carregando agendamentos...</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;">
            <thead>
              <tr>
                <th style="padding:12px 14px; white-space:nowrap;">MÊS / ANO</th>
                <th style="padding:12px 14px; white-space:nowrap;">DATA PROGRAMADA DE PAGAMENTO</th>
                <th style="padding:12px 14px; white-space:nowrap;">DATA DE APROVAÇÃO</th>
                <th style="padding:12px 14px; white-space:nowrap;">LIMITE PARA ENVIO</th>
                <th style="padding:12px 14px; white-space:nowrap;">CADASTRADO POR</th>
                <th style="padding:12px 14px; white-space:nowrap;">DATA DO CADASTRO</th>
              </tr>
            </thead>
            <tbody id="sched-tbody">
              <tr class="loading-row"><td colspan="6">
                <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:30px;">
                  <div class="spinner" style="border-color:rgba(79,70,229,.2);border-top-color:var(--ml-indigo);"></div> Carregando...
                </div>
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('sched-month').value = curMonth;

    const updateCalendarDate = () => {
      const y = parseInt(document.getElementById('sched-year').value);
      const m = parseInt(document.getElementById('sched-month').value);
      const dateInput = document.getElementById('sched-date');
      const approvalInput = document.getElementById('sched-approval-date');
      const closingInput = document.getElementById('sched-closing-date');

      if (!y || !m) return;

      const existing = (this.schedules || []).find(s => s.year === y && s.month === m);
      if (existing) {
        dateInput.value = existing.payment_date || '';
        approvalInput.value = existing.approval_date || '';
        closingInput.value = existing.closing_date || '';
      } else {
        const dPay = new Date(y, m - 1, 28);
        if (dPay.getMonth() !== m - 1) dPay.setDate(0);
        dateInput.value = dPay.toISOString().slice(0, 10);

        const dApp = new Date(y, m - 1, 25);
        if (dApp.getMonth() !== m - 1) dApp.setDate(0);
        approvalInput.value = dApp.toISOString().slice(0, 10);

        const dClose = new Date(y, m - 1, 20);
        if (dClose.getMonth() !== m - 1) dClose.setDate(0);
        closingInput.value = dClose.toISOString().slice(0, 10);
      }
    };

    document.getElementById('sched-month').addEventListener('change', updateCalendarDate);
    document.getElementById('sched-year').addEventListener('change', updateCalendarDate);

    document.getElementById('payment-schedule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const month = parseInt(document.getElementById('sched-month').value);
      const year = parseInt(document.getElementById('sched-year').value);
      const paymentDate = document.getElementById('sched-date').value;
      const approvalDate = document.getElementById('sched-approval-date').value || null;
      const closingDate = document.getElementById('sched-closing-date').value || null;

      if (!paymentDate) {
        toast('Selecione a data de pagamento.', 'warning');
        return;
      }

      const btn = document.getElementById('save-sched-btn');
      btn.disabled = true;

      try {
        const res = await Api.savePaymentCalendar({
          year,
          month,
          payment_date: paymentDate,
          approval_date: approvalDate,
          closing_date: closingDate
        });
        toast(res.message || 'Datas salvas com sucesso!', 'success');
        await this.loadSchedules();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    await this.loadSchedules();
    updateCalendarDate();
  },

  async loadSchedules() {
    const tbody = document.getElementById('sched-tbody');
    const countEl = document.getElementById('sched-count');
    if (!tbody) return;

    const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    try {
      this.schedules = await Api.getPaymentCalendar();
      if (countEl) countEl.innerHTML = `<strong>${this.schedules.length}</strong> agendamento(s)`;

      if (!this.schedules || this.schedules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
          <span class="empty-icon">📅</span><p>Nenhuma data cadastrada</p>
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = this.schedules.map(s => `
        <tr>
          <td style="padding:12px 14px; white-space:nowrap;">
            <div style="font-weight:700;font-size:14px;color:var(--text-1);">
              ${monthNames[s.month] || s.month} / ${s.year}
            </div>
          </td>
          <td style="padding:12px 14px; white-space:nowrap;">
            <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--ml-indigo);background:var(--ml-light);padding:5px 12px;border-radius:12px;">
              🗓️ ${fmtDate(s.payment_date)}
            </span>
          </td>
          <td style="padding:12px 14px; white-space:nowrap;">
            ${s.approval_date ? `
              <span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;color:#0e7490;background:#ecfeff;padding:5px 12px;border-radius:12px;border:1px solid #cffafe;">
                ✅ ${fmtDate(s.approval_date)}
              </span>
            ` : `<span style="color:var(--text-3);font-size:13px;">—</span>`}
          </td>
          <td style="padding:12px 14px; white-space:nowrap;">
            ${s.closing_date ? `
              <span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;color:#b45309;background:#fef3c7;padding:5px 12px;border-radius:12px;border:1px solid #fde68a;">
                ⏰ ${fmtDate(s.closing_date)}
              </span>
            ` : `<span style="color:var(--text-3);font-size:13px;">—</span>`}
          </td>
          <td style="padding:12px 14px; color:var(--text-2); font-size:13px;">
            ${escHtml(s.creator_name || '-')}
          </td>
          <td style="padding:12px 14px; color:var(--text-3); font-size:13px; white-space:nowrap;">
            ${fmtDate(s.created_at)}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
        <span class="empty-icon">⚠️</span><p>Erro ao carregar: ${escHtml(err.message)}</p>
      </div></td></tr>`;
    }
  }
};
