/**
 * app.js — SPA Router, Auth, Global UI (Modal, Toast, PWA)
 */

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
const App = {
  user: null,
  currentPage: 'dashboard',
  pwaPrompt: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function fmt(amount) {
  if (amount == null) return 'R$ 0,00';
  return 'R$ ' + Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
  } catch { return dateStr; }
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    let s = String(dateStr).trim();
    if (s.includes('T') && !s.endsWith('Z') && !s.includes('+') && !/-\d\d:\d\d$/.test(s)) {
      s = s + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR');
  } catch { return dateStr; }
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_LABELS = {
  rascunho: 'Rascunho',
  a_enviar: 'A Enviar',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  aguardando_finalizacao: 'Aguardando Finalização',
  finalizado: 'Finalizado',
  enviado: 'Enviado',
  pago: 'Pago',
};

const ROLE_LABELS = {
  admin: 'Administrador',
  aprovador: 'Aprovador',
  financeiro: 'Financeiro',
  usuario: 'Usuário',
};

async function applyAppLogo() {
  try {
    const res = await Api.getLogo();
    const logoData = (res && res.data) ? res.data : '/static/icons/logo-stacked.svg';
    const loginLogo = document.getElementById('login-logo-mark');
    if (loginLogo) {
      loginLogo.innerHTML = `<img src="${logoData}" style="max-height:100%; max-width:100%; object-fit:contain; display:block; margin:auto;" alt="Moura Leite" />`;
      loginLogo.style.background = '#ffffff';
      loginLogo.style.padding = '12px 16px';
      loginLogo.style.display = 'inline-flex';
      loginLogo.style.alignItems = 'center';
      loginLogo.style.justifyContent = 'center';
      loginLogo.style.borderRadius = '14px';
      loginLogo.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
      loginLogo.style.width = 'auto';
      loginLogo.style.height = '80px';
      loginLogo.style.flexShrink = '0';
    }
    const sidebarLogo = document.getElementById('sidebar-logo-mark');
    if (sidebarLogo) {
      sidebarLogo.innerHTML = `<img src="${logoData}" style="max-height:100%; max-width:100%; object-fit:contain; display:block; margin:auto;" alt="Moura Leite" />`;
      sidebarLogo.style.background = '#ffffff';
      sidebarLogo.style.padding = '8px 14px';
      sidebarLogo.style.display = 'inline-flex';
      sidebarLogo.style.alignItems = 'center';
      sidebarLogo.style.justifyContent = 'center';
      sidebarLogo.style.borderRadius = '10px';
      sidebarLogo.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      sidebarLogo.style.width = 'auto';
      sidebarLogo.style.height = '56px';
      sidebarLogo.style.flexShrink = '0';
      
      const brandText = document.querySelector('.sidebar-brand');
      if (brandText && logoData !== '/static/icons/logo-stacked.svg') {
        brandText.style.display = 'none';
      } else if (brandText) {
        brandText.style.display = 'block';
      }
    }
  } catch(e) {
    console.warn('Failed to load logo:', e);
  }
}
window.applyAppLogo = applyAppLogo;


function statusBadge(status, customTitle = null, extraClass = '') {
  const label = STATUS_LABELS[status] || status;
  const titleAttr = customTitle ? ` title="${escHtml(customTitle)}" style="cursor:help;"` : '';
  const classes = ['badge', `badge-${status}`, extraClass].filter(Boolean).join(' ');
  return `<span class="${classes}"${titleAttr}>${label}</span>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════
function toast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${escHtml(msg)}</span>`;
  const container = document.getElementById('toast-container');
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOutRight .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════════════════════
const Modal = {
  open(title, bodyHTML, footerHTML = '', opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    const box = document.getElementById('modal-box');
    box.className = 'modal' + (opts.size ? ` modal-${opts.size}` : '');
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  },
  confirm(title, msg, onConfirm, danger = false) {
    Modal.open(
      title,
      `<p style="color:var(--text-2);font-size:14px;">${escHtml(msg)}</p>`,
      `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
       <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">Confirmar</button>`
    );
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
      Modal.close();
      onConfirm();
    });
  },
};

document.getElementById('modal-close-btn').addEventListener('click', Modal.close);
let mousedownOnOverlay = false;
const overlayEl = document.getElementById('modal-overlay');
overlayEl.addEventListener('mousedown', (e) => {
  mousedownOnOverlay = (e.target === overlayEl);
});
overlayEl.addEventListener('click', (e) => {
  if (mousedownOnOverlay && e.target === overlayEl) {
    Modal.close();
  }
  mousedownOnOverlay = false;
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════════════════════════
const pages = ['dashboard', 'expenses', 'transactions', 'exports', 'payment-calendar', 'smartaudit', 'admin'];

function getRequestedPage() {
  // 1. Pathname da URL (ex: /expenses, /admin, /exports, /payment-calendar, /dashboard)
  const path = (window.location.pathname || '').replace(/^\/+/, '').trim();
  if (path) {
    const parts = path.split('/').filter(Boolean);
    const candidate = parts[0].toLowerCase();
    if (pages.includes(candidate)) {
      if (candidate === 'admin' && parts[1]) {
        localStorage.setItem('ml_admin_current_section', parts[1]);
      }
      return candidate;
    }
  }

  // 2. Hash da URL (ex: #expenses, #admin, #payment-calendar)
  const hash = (window.location.hash || '').replace(/^#\/?/, '').trim();
  if (hash) {
    const parts = hash.split('/').filter(Boolean);
    const candidate = parts[0].toLowerCase();
    if (pages.includes(candidate)) {
      if (candidate === 'admin' && parts[1]) {
        localStorage.setItem('ml_admin_current_section', parts[1]);
      }
      return candidate;
    }
  }

  // 3. Página salva no localStorage antes de atualizar (F5)
  const saved = localStorage.getItem('ml_current_page');
  if (saved && pages.includes(saved)) {
    return saved;
  }

  return 'dashboard';
}

function navigate(page, updateHistory = true) {
  if (!pages.includes(page)) page = 'dashboard';
  if (page === 'admin' && !['admin', 'financeiro'].includes(App.user?.role)) page = 'dashboard';

  App.currentPage = page;
  localStorage.setItem('ml_current_page', page);

  const targetPath = page === 'dashboard' ? '/' : `/${page}`;
  if (updateHistory) {
    try {
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ page }, '', targetPath);
      }
    } catch (e) {}
  }
  try {
    if (window.location.hash !== `#${page}`) {
      window.history.replaceState({ page }, '', `${targetPath}#${page}`);
    }
  } catch (e) {}

  // Esconde todas as páginas
  pages.forEach(p => {
    const pageEl = document.getElementById(`page-${p}`);
    if (pageEl) pageEl.classList.add('hidden');
    document.getElementById(`nav-${p}`)?.classList.remove('active');
  });

  const activePageEl = document.getElementById(`page-${page}`);
  if (activePageEl) {
    activePageEl.classList.remove('hidden');
  } else {
    // create if doesn't exist
    const main = document.getElementById('main-content');
    const newPage = document.createElement('div');
    newPage.id = `page-${page}`;
    newPage.className = 'page';
    newPage.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title" style="text-transform: capitalize;">${page.replace('smartaudit', 'Smart Audit').replace('transactions', 'Transações')}</h2>
        </div>
      </div>
      <div class="empty-state">
        <span class="empty-icon">🚧</span>
        <p>Módulo em desenvolvimento.</p>
      </div>`;
    main.appendChild(newPage);
  }
  document.getElementById(`nav-${page}`)?.classList.add('active');

  // Renderiza a página
  switch (page) {
    case 'dashboard': DashboardPage.render(); break;
    case 'expenses':  ExpensesPage.render(); break;
    case 'exports':   ExportsPage.render(); break;
    case 'payment-calendar': PaymentCalendarPage.render(); break;
    case 'admin':     AdminPage.render(); break;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp(user) {
  if (user && user.job_role && user.job_role.name) {
    const jrName = user.job_role.name.toLowerCase();
    if (jrName.includes('financ') && user.role !== 'financeiro') {
      user.role = 'financeiro';
    } else if (jrName.includes('admin') && user.role !== 'admin') {
      user.role = 'admin';
    } else if (jrName.includes('aprov') && user.role !== 'aprovador') {
      user.role = 'aprovador';
    }
  }
  App.user = user;
  if (window.ExpensesPage) {
    ExpensesPage.costCenters = [];
    ExpensesPage.categories = [];
    ExpensesPage.users = [];
  }
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Update sidebar user info
  document.getElementById('sidebar-avatar').textContent = initials(user.name);
  document.getElementById('sidebar-user-name').textContent = user.name;
  document.getElementById('sidebar-user-role').textContent = ROLE_LABELS[user.role] || user.role;

  // Impersonation Banner State
  const impersonatorToken = sessionStorage.getItem('ml_impersonator_token');
  const bar = document.getElementById('impersonation-bar');
  const barText = document.getElementById('impersonation-bar-text');

  if (impersonatorToken && bar && barText) {
    bar.classList.remove('hidden');
    const roleLabel = ROLE_LABELS[user.role] || user.role;
    barText.innerHTML = `Você está visualizando o sistema como <strong>${escHtml(user.name)}</strong> (${roleLabel})`;
  } else if (bar) {
    bar.classList.add('hidden');
  }

  if (['admin', 'financeiro'].includes(user.role)) {
    document.getElementById('nav-admin').classList.remove('hidden');
  } else {
    document.getElementById('nav-admin').classList.add('hidden');
  }

  if (['admin', 'financeiro'].includes(user.role)) {
    document.getElementById('nav-payment-calendar')?.classList.remove('hidden');
  } else {
    document.getElementById('nav-payment-calendar')?.classList.add('hidden');
  }

  // Navigate to requested page (redirect if non-admin on admin route)
  let initialPage = getRequestedPage();
  if (initialPage === 'admin' && !['admin', 'financeiro'].includes(user.role)) {
    initialPage = 'dashboard';
  }
  navigate(initialPage, false);
}

async function exitImpersonation() {
  const adminToken = sessionStorage.getItem('ml_impersonator_token');
  const adminUserRaw = sessionStorage.getItem('ml_impersonator_user');
  if (!adminToken) return;

  sessionStorage.removeItem('ml_impersonator_token');
  sessionStorage.removeItem('ml_impersonator_user');

  Api.setToken(adminToken);

  let adminUser = null;
  try {
    adminUser = adminUserRaw ? JSON.parse(adminUserRaw) : null;
  } catch (e) {}

  toast('Modo "Ver como" encerrado. Retornando ao perfil de Administrador.', 'info');

  if (adminUser) {
    showApp(adminUser);
    navigate('admin');
    if (window.AdminPage && AdminPage.setSection) {
      AdminPage.setSection('impersonate');
    }
  } else {
    try {
      const me = await Api.me();
      showApp(me);
      navigate('admin');
      if (window.AdminPage && AdminPage.setSection) {
        AdminPage.setSection('impersonate');
      }
    } catch {
      tryAutoLogin();
    }
  }
}
window.exitImpersonation = exitImpersonation;

document.getElementById('impersonation-exit-btn')?.addEventListener('click', exitImpersonation);

async function tryAutoLogin() {
  const token = Api.getToken();
  if (!token) { showLogin(); return; }
  try {
    const user = await Api.me();
    showApp(user);
  } catch {
    Api.setToken(null);
    sessionStorage.removeItem('ml_impersonator_token');
    sessionStorage.removeItem('ml_impersonator_user');
    showLogin();
  }
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const btnText = document.getElementById('login-btn-text');

  errEl.classList.add('hidden');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  btnText.textContent = 'Entrando...';

  try {
    const res = await Api.login(email, password);
    Api.setToken(res.access_token);
    showApp(res.user);
  } catch (err) {
    errEl.textContent = err.message || 'Credenciais inválidas';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
    btnText.textContent = 'Entrar';
  }
});

// Toggle password visibility
document.getElementById('toggle-pw-btn').addEventListener('click', () => {
  const inp = document.getElementById('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  document.getElementById('toggle-pw-btn').textContent = inp.type === 'password' ? '👁️' : '🙈';
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('ml_impersonator_token');
  sessionStorage.removeItem('ml_impersonator_user');
  localStorage.removeItem('ml_current_page');
  Api.setToken(null);
  App.user = null;
  if (window.ExpensesPage) {
    ExpensesPage.costCenters = [];
    ExpensesPage.categories = [];
    ExpensesPage.users = [];
  }
  try {
    window.history.replaceState({}, '', '/');
  } catch (e) {}
  window.location.hash = '';
  showLogin();
  toast('Sessão encerrada', 'info');
});

// Fill login demo
function fillLogin(email, pwd) {
  const emailInput = document.getElementById('login-email');
  const pwdInput = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');

  if (emailInput) {
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    emailInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (pwdInput) {
    pwdInput.value = pwd;
    pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
    pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (errEl) errEl.classList.add('hidden');
}
window.fillLogin = fillLogin;

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COLLAPSE
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById('collapse-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// Nav click
document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(el.dataset.page);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PWA
// ══════════════════════════════════════════════════════════════════════════════
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  App.pwaPrompt = e;
  if (!localStorage.getItem('ml_pwa_dismissed')) {
    document.getElementById('pwa-banner').classList.remove('hidden');
  }
});

document.getElementById('pwa-install-btn').addEventListener('click', async () => {
  if (!App.pwaPrompt) return;
  App.pwaPrompt.prompt();
  const result = await App.pwaPrompt.userChoice;
  if (result.outcome === 'accepted') toast('App instalado com sucesso!', 'success');
  document.getElementById('pwa-banner').classList.add('hidden');
  App.pwaPrompt = null;
});

document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
  localStorage.setItem('ml_pwa_dismissed', '1');
  document.getElementById('pwa-banner').classList.add('hidden');
});

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER & CACHE PURGE
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister().then(() => {
        console.log('SW unregistered');
      });
    }
  });
}
if ('caches' in window) {
  caches.keys().then(names => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
window.addEventListener('popstate', () => {
  if (App.user) {
    const page = getRequestedPage();
    if (page !== App.currentPage) {
      navigate(page, false);
    }
  }
});

window.addEventListener('hashchange', () => {
  if (App.user) {
    const page = getRequestedPage();
    if (page !== App.currentPage) {
      navigate(page, false);
    }
  }
});

applyAppLogo();
tryAutoLogin();
