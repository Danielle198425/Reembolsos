/**
 * push_manager.js — Gerenciador de Web Push Notifications (VAPID / Service Worker)
 */
const DEFAULT_VAPID_PUBLIC_KEY = 'BBRP6hAkINeUwNCNC3HDjjgYw1NRkPIZQ_c3g3cE9Wt0SLQWsvETV4DGgCqXI1ZYan56alcKa6URwayIT0rHT-g';

const WebPush = {
  _vapidPublicKey: null,
  _isBusy: false,

  urlBase64ToUint8Array(base64String) {
    if (!base64String || typeof base64String !== 'string') {
      base64String = DEFAULT_VAPID_PUBLIC_KEY;
    }
    // Remove qualquer aspas, quebras de linha e espaços acidentais
    base64String = base64String.replace(/[\s\r\n"']/g, '');
    if (base64String.length < 50) {
      base64String = DEFAULT_VAPID_PUBLIC_KEY;
    }

    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    // Se por qualquer motivo não for um ponto P-256 válido (65 bytes iniciando em 0x04), recorre à chave padrão
    if ((outputArray.length !== 65 || outputArray[0] !== 4) && base64String !== DEFAULT_VAPID_PUBLIC_KEY) {
      return this.urlBase64ToUint8Array(DEFAULT_VAPID_PUBLIC_KEY);
    }

    return outputArray;
  },

  isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  isStandalone() {
    return window.navigator.standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches;
  },

  isSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  },

  async getServiceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      try {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        if (readyReg) reg = readyReg;
      } catch (timeoutErr) {
        // Prossegue com o reg obtido
      }
      return reg;
    } catch (e) {
      console.warn('[WebPush] Falha ao obter registro do SW:', e);
      return null;
    }
  },

  async isSubscribed() {
    if (!this.isSupported()) return false;
    try {
      const reg = await this.getServiceWorkerRegistration();
      if (!reg || !reg.pushManager) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) {
      return false;
    }
  },

  async updateButtonsState() {
    try {
      const subscribed = await this.isSubscribed();
      const buttons = document.querySelectorAll('.push-notification-btn');
      buttons.forEach(btn => {
        if (subscribed) {
          btn.innerHTML = '🔔 Notificações Ativadas ✅';
          btn.classList.add('subscribed');
          btn.style.borderColor = '#16a34a';
          btn.style.color = '#15803d';
          btn.style.background = '#f0fdf4';
          btn.setAttribute('title', 'Notificações push ativadas neste dispositivo (clique para gerenciar)');
        } else {
          btn.innerHTML = '🔔 Ativar Notificações';
          btn.classList.remove('subscribed');
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.style.background = '';
          btn.setAttribute('title', 'Clique para receber alertas imediatos no celular ou computador');
        }
      });
    } catch (e) {
      console.warn('[WebPush] Erro ao atualizar estado dos botões:', e);
    }
  },

  /**
   * Ponto de entrada do clique do usuário.
   * CRÍTICO: Notification.requestPermission() DEVE ser chamado no primeiro ciclo síncrono
   * do clique do usuário para preservar a Transient User Activation nos navegadores.
   */
  async toggleSubscription(btn = null) {
    if (this._isBusy) return;
    this._isBusy = true;

    try {
      // 0. Conexão HTTPS
      if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const modalFn = (window.Modal && window.Modal.open) || alert;
        modalFn(
          '⚠️ Conexão Não Segura',
          `Os navegadores exigem uma conexão HTTPS segura para permitir notificações push.<br><br>Por favor acesse o sistema através de https://.`
        );
        return;
      }

      // 1. Caso especial iPhone
      if (this.isIos() && !this.isStandalone()) {
        if (window.Modal && window.Modal.open) {
          Modal.open(
            '🔔 Notificações no iPhone',
            `
            <div style="padding:10px 0;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">📱</div>
              <h3 style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Instale o atalho na tela inicial</h3>
              <p style="font-size:14px;color:var(--text-2);line-height:1.5;margin-bottom:16px;">
                No iPhone/iPad, a Apple exige que o sistema seja adicionado à <strong>Tela de Início</strong> para permitir notificações push.
              </p>
              <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left;font-size:13px;color:var(--text-1);line-height:1.6;">
                <strong>Como ativar no iPhone:</strong><br>
                1. Toque no botão de <strong>Compartilhar</strong> (ícone <span style="font-size:16px;">⎋</span> ou quadrado com seta para cima na barra do Safari).<br>
                2. Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.<br>
                3. Abra o app pelo ícone criado na tela inicial e clique em <strong>Ativar Notificações</strong>.
              </div>
            </div>
            `,
            '<button class="btn btn-primary" onclick="Modal.close()">Entendido</button>'
          );
        } else {
          alert('No iPhone, adicione o app à Tela de Início (Compartilhar > Adicionar à Tela de Início) para receber notificações.');
        }
        return;
      }

      // 2. Verificação de suporte à Notification API
      if (!('Notification' in window)) {
        if (window.Modal && window.Modal.open) {
          Modal.open(
            '🔔 Notificações Não Suportadas',
            `<p style="padding:12px;text-align:center;color:var(--text-2);">Seu navegador atual não suporta notificações nativas.</p>`,
            '<button class="btn btn-primary" onclick="Modal.close()">Fechar</button>'
          );
        } else {
          alert('Seu navegador não suporta notificações.');
        }
        return;
      }

      // 3. Verificação do estado de permissão atual
      const currentPerm = Notification.permission;

      if (currentPerm === 'denied') {
        if (window.Modal && window.Modal.open) {
          Modal.open(
            '🔔 Notificações Bloqueadas',
            `
            <div style="padding:10px 0;text-align:center;">
              <div style="font-size:44px;margin-bottom:12px;">⚠️</div>
              <h3 style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Permissão bloqueada no navegador</h3>
              <p style="font-size:14px;color:var(--text-2);line-height:1.5;">
                As notificações estão marcadas como bloqueadas nas configurações do seu navegador para este site.<br><br>
                Para ativar, clique no ícone de <strong>cadeado ou configurações</strong> ao lado da barra de endereço do navegador e altere a opção <strong>Notificações</strong> para <strong>Permitir</strong>.
              </p>
            </div>
            `,
            '<button class="btn btn-primary" onclick="Modal.close()">Fechar</button>'
          );
        } else {
          alert('As notificações estão bloqueadas nas configurações do seu navegador. Clique no cadeado ao lado da URL e selecione Permitir.');
        }
        return;
      }

      // 4. Se a permissão for 'default' (ainda não solicitada), SOLICITAR IMEDIATAMENTE (sem await prévio!)
      if (currentPerm === 'default') {
        if (btn) btn.innerHTML = '⏳ Solicitando...';
        
        let reqPromise = null;
        try {
          reqPromise = Notification.requestPermission();
        } catch (e) {
          // Fallback callback para versões antigas
          reqPromise = new Promise(res => Notification.requestPermission(res));
        }

        const newPerm = await reqPromise;

        if (newPerm !== 'granted') {
          if (typeof toast === 'function') {
            toast('Permissão de notificações não concedida.', 'info');
          }
          await this.updateButtonsState();
          return;
        }
      }

      // 5. Se já tem permissão concedida, verificar se já está inscrito ou se quer desativar
      const isSub = await this.isSubscribed();
      if (isSub) {
        if (window.Modal && window.Modal.confirm) {
          Modal.confirm(
            'Desativar Notificações',
            'Deseja desativar as notificações push neste dispositivo?',
            () => this.unsubscribe(btn),
            () => this.updateButtonsState()
          );
        } else if (confirm('Deseja desativar as notificações push neste dispositivo?')) {
          await this.unsubscribe(btn);
        }
      } else {
        await this.subscribe(btn);
      }
    } catch (err) {
      console.error('[WebPush] Erro no toggleSubscription:', err);
      if (typeof toast === 'function') {
        toast('Erro ao processar notificações: ' + (err.message || 'Falha'), 'error');
      }
    } finally {
      this._isBusy = false;
      await this.updateButtonsState();
    }
  },

  async subscribe(triggerBtn = null) {
    if (triggerBtn) {
      triggerBtn.innerHTML = '⏳ Ativando...';
      triggerBtn.disabled = true;
    }

    try {
      // Obter chave pública VAPID
      if (!this._vapidPublicKey) {
        try {
          const resp = await Api.getVapidPublicKey();
          this._vapidPublicKey = resp.public_key || DEFAULT_VAPID_PUBLIC_KEY;
        } catch (e) {
          this._vapidPublicKey = DEFAULT_VAPID_PUBLIC_KEY;
        }
      }
      const vapidKey = this._vapidPublicKey || DEFAULT_VAPID_PUBLIC_KEY;

      // Obter Service Worker
      const reg = await this.getServiceWorkerRegistration();
      if (!reg || !reg.pushManager) {
        throw new Error('Service Worker / PushManager não disponível.');
      }

      // Obter ou renovar inscrição
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch (unsubErr) {
          console.warn('[WebPush] Falha ao limpar subscrição antiga:', unsubErr);
        }
      }

      const convertedKey = this.urlBase64ToUint8Array(vapidKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });

      if (!sub) {
        throw new Error('Falha ao gerar credencial push no navegador.');
      }

      // Enviar ao backend
      const subJson = sub.toJSON();
      await Api.subscribePush({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        user_agent: navigator.userAgent
      });

      if (typeof toast === 'function') {
        toast('Notificações ativadas com sucesso neste dispositivo!', 'success');
      }
      return true;
    } catch (err) {
      console.error('[WebPush] Erro em subscribe:', err);
      if (typeof toast === 'function') {
        toast('Erro ao ativar notificações: ' + (err.message || 'Falha no registro'), 'error');
      }
      return false;
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
      await this.updateButtonsState();
    }
  },

  async unsubscribe(triggerBtn = null) {
    if (triggerBtn) {
      triggerBtn.innerHTML = '⏳ Desativando...';
      triggerBtn.disabled = true;
    }

    try {
      const reg = await this.getServiceWorkerRegistration();
      if (reg && reg.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await Api.unsubscribePush(endpoint);
        }
      }

      if (typeof toast === 'function') {
        toast('Notificações desativadas neste dispositivo.', 'info');
      }
      return true;
    } catch (err) {
      console.error('[WebPush] Erro em unsubscribe:', err);
      if (typeof toast === 'function') {
        toast('Erro ao desativar notificações.', 'error');
      }
      return false;
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
      await this.updateButtonsState();
    }
  }
};

// Exportações globais
window.WebPush = WebPush;
window.togglePushNotifications = function(btn) {
  return WebPush.toggleSubscription(btn);
};

// Inicialização automática
window.addEventListener('DOMContentLoaded', () => {
  WebPush.updateButtonsState();
});
window.addEventListener('load', () => {
  WebPush.updateButtonsState();
});
