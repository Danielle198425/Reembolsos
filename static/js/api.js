/**
 * api.js — Fetch wrapper with JWT token management
 */
// _db is kept for backward compatibility with legacy code (Sienge local cache only)
let _db;
try {
  _db = JSON.parse(localStorage.getItem('ml_db')) || {};
} catch(e) {
  _db = {};
}
window._db = _db;
window._saveDb = function() {
  localStorage.setItem('ml_db', JSON.stringify(window._db));
};

const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:8000' : '';

const Api = {
  _token: null,

  getToken() {
    return this._token || localStorage.getItem('ml_token');
  },

  setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('ml_token', token);
    else localStorage.removeItem('ml_token');
  },

  async _request(method, path, body = null, isFormData = false) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData && body) headers['Content-Type'] = 'application/json';

    const impersonatorToken = sessionStorage.getItem('ml_impersonator_token');
    if (impersonatorToken) {
      const impUserRaw = sessionStorage.getItem('ml_impersonator_user');
      try {
        const impUser = impUserRaw ? JSON.parse(impUserRaw) : null;
        if (impUser && impUser.id) {
          headers['X-Impersonator-Id'] = String(impUser.id);
          headers['X-Impersonator-Name'] = encodeURIComponent(impUser.name || '');
        }
      } catch (e) {}
    }

    const opts = { method, headers };
    if (body) {
      opts.body = isFormData ? body : JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(API_BASE + path, opts);
    } catch (e) {
      throw new Error('Sem conexão com o servidor.');
    }

    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.detail || `Erro ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  },

  get: (path) => Api._request('GET', path),
  post: (path, body) => Api._request('POST', path, body),
  put: (path, body) => Api._request('PUT', path, body),
  delete: (path) => Api._request('DELETE', path),
  upload: (path, formData) => Api._request('POST', path, formData, true),

  // ── Auth ─────────────────────────────────────────────────────────────────
  login(email, password) {
    return Api.post('/api/auth/login', { email, password });
  },
  me() { return Api.get('/api/auth/me'); },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard(scope = 'personal', month = null) {
    const q = month ? `&month=${encodeURIComponent(month)}` : '';
    return Api.get(`/api/dashboard/summary?scope=${scope}${q}`);
  },
  getNotifications() { return Api.get('/api/dashboard/notifications'); },

  // ── Expenses ──────────────────────────────────────────────────────────────
  getExpenses(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') qs.append(k, v); });
    return Api.get(`/api/expenses?${qs.toString()}`);
  },
  getExpense(id) { return Api.get(`/api/expenses/${id}`); },
  createExpense(data) { return Api.post('/api/expenses', data); },
  updateExpense(id, data) { return Api.put(`/api/expenses/${id}`, data); },
  deleteExpense(id) { return Api.delete(`/api/expenses/${id}`); },
  submitExpense(id) { return Api.post(`/api/expenses/${id}/submit`); },
  sendExpense(id) { return Api.post(`/api/expenses/${id}/send`); },
  approveExpense(id) { return Api.post(`/api/expenses/${id}/approve`); },
  rejectExpense(id, reason) { return Api.post(`/api/expenses/${id}/reject`, { reason }); },
  finalizeExpense(id) { return Api.post(`/api/expenses/${id}/finalize`); },
  payExpense(id) { return Api.post(`/api/expenses/${id}/pay`); },
  resubmitExpense(id) { return Api.post(`/api/expenses/${id}/resubmit`); },
  sendExpenseToSienge(id) { return Api.post(`/api/expenses/${id}/send-sienge`); },
  bulkSendExpensesToSienge(ids) { return Api.post(`/api/expenses/bulk-send-sienge`, { expense_ids: ids }); },
  payExpenseSienge(id) { return Api.post(`/api/expenses/${id}/pay-sienge`); },
  getPaymentCalendar() { return Api.get('/api/admin/payment-calendar'); },
  savePaymentCalendar(data) { return Api.post('/api/admin/payment-calendar', data); },
  uploadReceipt(id, file) {
    const fd = new FormData();
    fd.append('file', file);
    return Api.upload(`/api/expenses/${id}/upload`, fd);
  },
  expensePdfUrl(id) {
    const token = localStorage.getItem('ml_token') || '';
    return `/api/expenses/${id}/pdf?token=${encodeURIComponent(token)}`;
  },

  // ── Exports ───────────────────────────────────────────────────────────────
  getExports(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') qs.append(k, v); });
    const qStr = qs.toString();
    return Api.get(`/api/exports${qStr ? '?' + qStr : ''}`);
  },
  createExport(data) { return Api.post('/api/exports', data); },
  sendExportEmail(id) { return Api.post(`/api/exports/${id}/send-email`); },
  bulkSendExportEmails(exportIds) { return Api.post('/api/exports/bulk-send-emails', { export_ids: exportIds }); },
  deleteExport(id) { return Api.delete(`/api/exports/${id}`); },
  exportDownloadUrl(id) {
    const token = localStorage.getItem('ml_token') || '';
    return `/api/exports/${id}/download?token=${encodeURIComponent(token)}`;
  },

  // ── Admin — Users ─────────────────────────────────────────────────────────
  getUsers() { return Api.get('/api/admin/users'); },
  createUser(data) { return Api.post('/api/admin/users', data); },
  updateUser(id, data) { return Api.put(`/api/admin/users/${id}`, data); },
  deleteUser(id) { return Api.delete(`/api/admin/users/${id}`); },
  sendPasswordEmail(email) { return Api.post('/api/admin/users/send-password-email', { email }); },
  getAuditLogs() { return Api.get('/api/admin/audit-logs'); },
  getLockedUsers() { return Api.get('/api/admin/users/locked'); },
  unlockUser(id) { return Api.post(`/api/admin/users/${id}/unlock`); },
  impersonateUser(id) { return Api.post(`/api/admin/users/${id}/impersonate`); },

  // ── Admin — Cost Centers ──────────────────────────────────────────────────
  getCostCenters() { return Api.get('/api/admin/cost-centers'); },
  createCostCenter(data) { return Api.post('/api/admin/cost-centers', data); },
  updateCostCenter(id, data) { return Api.put(`/api/admin/cost-centers/${id}`, data); },
  deleteCostCenter(id) { return Api.delete(`/api/admin/cost-centers/${id}`); },
  updateCostCenterCompany(id, companyId) {
    return Api.put(`/api/admin/cost-centers/${id}/company`, { company_id: companyId ? parseInt(companyId) : null });
  },
  getCostCenterRules() { return Api.get('/api/admin/cost-center-rules'); },
  saveCostCenterRule(data) { return Api.post('/api/admin/cost-center-rules', data); },
  deleteCostCenterRule(id) { return Api.delete(`/api/admin/cost-center-rules/${id}`); },

  // ── Admin — Companies ─────────────────────────────────────────────────────
  getCompanies() { return Api.get('/api/admin/companies'); },
  createCompany(data) { return Api.post('/api/admin/companies', data); },
  updateCompany(id, data) { return Api.put(`/api/admin/companies/${id}`, data); },
  deleteCompany(id) { return Api.delete(`/api/admin/companies/${id}`); },

  // ── Admin — Job Roles ─────────────────────────────────────────────────────
  getJobRoles() { return Api.get('/api/admin/job-roles'); },
  createJobRole(data) { return Api.post('/api/admin/job-roles', data); },
  updateJobRole(id, data) { return Api.put(`/api/admin/job-roles/${id}`, data); },
  deleteJobRole(id) { return Api.delete(`/api/admin/job-roles/${id}`); },

  // ── Admin — Job Functions ─────────────────────────────────────────────────
  getJobFunctions() { return Api.get('/api/admin/job-functions'); },
  createJobFunction(data) { return Api.post('/api/admin/job-functions', data); },
  updateJobFunction(id, data) { return Api.put(`/api/admin/job-functions/${id}`, data); },
  deleteJobFunction(id) { return Api.delete(`/api/admin/job-functions/${id}`); },

  // ── Admin — Categories ───────────────────────────────────────────────────
  getCategories() { return Api.get('/api/admin/categories'); },
  createCategory(data) { return Api.post('/api/admin/categories', data); },
  updateCategory(id, data) { return Api.put(`/api/admin/categories/${id}`, data); },
  deleteCategory(id) { return Api.delete(`/api/admin/categories/${id}`); },

  // ── Admin — Built-in Policies ─────────────────────────────────────────────
  getPolicies() { return Api.get('/api/admin/policies'); },
  updatePolicy(key, data) { return Api.put(`/api/admin/policies/${key}`, data); },

  // ── Admin — Mileage Rates (NOW IN DB) ─────────────────────────────────────
  getMileageRates() { return Api.get('/api/admin/mileage-rates'); },
  createMileageRate(data) { return Api.post('/api/admin/mileage-rates', data); },
  updateMileageRate(id, data) { return Api.put(`/api/admin/mileage-rates/${id}`, data); },
  deleteMileageRate(id) { return Api.delete(`/api/admin/mileage-rates/${id}`); },

  // ── Admin — Rejection Reasons (NOW IN DB) ────────────────────────────────
  getRejectionReasons() { return Api.get('/api/admin/rejection-reasons'); },
  createRejectionReason(data) { return Api.post('/api/admin/rejection-reasons', data); },
  updateRejectionReason(id, data) { return Api.put(`/api/admin/rejection-reasons/${id}`, data); },
  deleteRejectionReason(id) { return Api.delete(`/api/admin/rejection-reasons/${id}`); },

  // ── Admin — Custom Policies (NOW IN DB) ───────────────────────────────────
  getCustomPolicies() { return Api.get('/api/admin/custom-policies'); },
  createCustomPolicy(data) { return Api.post('/api/admin/custom-policies', data); },
  updateCustomPolicy(id, data) { return Api.put(`/api/admin/custom-policies/${id}`, data); },
  deleteCustomPolicy(id) { return Api.delete(`/api/admin/custom-policies/${id}`); },

  // ── Admin — Logo (NOW IN DB) ──────────────────────────────────────────────
  getLogo() { return Api.get('/api/admin/logo'); },
  updateLogo(data) { return Api.put('/api/admin/logo', { data }); },

  // ── Sienge ────────────────────────────────────────────────────────────────
  getCreditorBankInformations(creditorId) { return Api.get(`/api/sienge/creditors/${creditorId}/bank-informations`); },
  getCreditorPixInformations(creditorId) { return Api.get(`/api/sienge/creditors/${creditorId}/pix-informations`); },
  getSiengeCostCenters() { return Api.get('/api/sienge/cost-centers'); },
  syncSiengeCostCenters() { return Api.post('/api/sienge/cost-centers/sync'); },
  getSiengeCompanies() { return Api.get('/api/sienge/companies'); },
  syncSiengeCompanies() { return Api.post('/api/sienge/companies/sync'); },
  getSiengeFinancialPlans() { return Api.get('/api/sienge/financial-plans'); },
  syncSiengeFinancialPlans() { return Api.post('/api/sienge/financial-plans/sync'); },
  getSiengeDepartments() { return Api.get('/api/sienge/departments'); },
  syncSiengeDepartments() { return Api.post('/api/sienge/departments/sync'); },

  // ── Admin — Regras por Apropriação ─────────────────────────────────────────
  getApportionmentRules() { return Api.get('/api/admin/apportionment-rules'); },
  saveApportionmentRule(data) { return Api.post('/api/admin/apportionment-rules', data); },
  deleteApportionmentRule(id) { return Api.delete(`/api/admin/apportionment-rules/${id}`); },

  // ── Admin — Regras por Categoria ──────────────────────────────────────────
  getCategoryRules() { return Api.get('/api/admin/category-rules'); },
  saveCategoryRule(data) { return Api.post('/api/admin/category-rules', data); },
  deleteCategoryRule(id) { return Api.delete(`/api/admin/category-rules/${id}`); },

  // ── Admin — Regras de Alteração na Categoria ──────────────────────────────
  getCategoryOverrideRules() { return Api.get('/api/admin/category-override-rules'); },
  saveCategoryOverrideRule(data) { return Api.post('/api/admin/category-override-rules', data); },
  deleteCategoryOverrideRule(id) { return Api.delete(`/api/admin/category-override-rules/${id}`); },

  // ── Admin — Modelos de E-mail ─────────────────────────────────────────────
  getEmailTemplates() { return Api.get('/api/admin/email-templates'); },
  getEmailTemplate(key) { return Api.get(`/api/admin/email-templates/${key}`); },
  updateEmailTemplate(key, data) { return Api.put(`/api/admin/email-templates/${key}`, data); },
  resetEmailTemplate(key) { return Api.post(`/api/admin/email-templates/${key}/reset`); },
  sendTestEmailTemplate(key, data) { return Api.post(`/api/admin/email-templates/${key}/send-test`, data); },
};
