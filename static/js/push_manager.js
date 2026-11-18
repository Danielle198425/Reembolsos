/**
 * push_manager.js — Gerenciador de Web Push Notifications (VAPID / Service Worker)
 */
const DEFAULT_VAPID_PUBLIC_KEY = 'BBRP6hAkINeUwNCNC3HDjjgYw1NRkPIZQ_c3g3cE9Wt0SLQWsvETV4DGgCqXI1ZYan56alcKa6URwayIT0rHT-g';

const PushManager = {
  _vapidPublicKey: null,

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
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
      return reg;
    } catch (e) {
      console.warn('[PushManager] Falha ao obter registro do SW:', e);
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
          btn.setAttribute('title', 'Notificações push ativadas neste dispositivo');
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
      console.warn('[PushManager] Erro ao atualizar estado dos botões:', e);
    }
  },

  async subscribe(triggerBtn = null) {
    // 1. Caso especial: iPhone / iPad no navegador Safari (não adicionado à tela inicial)
    if (this.isIos() && !this.isStandalone()) {
      Modal.open(
        '🔔 Notificações no iPhone',
        `
        <div style="padding:10px 0;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">📱</div>
          <h3 style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Instale o atalho na tela inicial</h3>
          <p style="font-size:14px;color:var(--text-2);line-height:1.5;margin-bottom:16px;">
            No iPhone/iPad, a Apple exige que o aplicativo seja adicionado à <strong>Tela de Início</strong> para permitir notificações push nativas.
          </p>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left;font-size:13px;color:var(--text-1);line-height:1.6;">
            <strong>Como ativar:</strong><br>
            1. Toque no botão de <strong>Compartilhar</strong> (ícone <span style="font-size:16px;">⎋</span> ou quadrado com seta para cima na barra do Safari).<br>
            2. Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong>.<br>
            3. Abra o app pelo ícone criado na tela inicial do seu celular e clique novamente em <strong>Ativar Notificações</strong>.
          </div>
        </div>
        `,
        '<button class="btn btn-primary" onclick="Modal.close()">Entendido</button>'
      );
      return false;
    }

    if (!('Notification' in window)) {
      toast('Seu navegador não possui suporte a notificações.', 'warning');
      return false;
    }

    // 2. IMPORTANTE: Solicitar permissão nativa imediatamente no clique do usuário (para não perder o user activation)
    let permission = Notification.permission;
    if (permission !== 'granted') {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        permission = await new Promise(resolve => Notification.requestPermission(resolve));
      }
    }

    if (permission === 'denied') {
      Modal.open(
        '🔔 Notificações Bloqueadas',
        `
        <div style="padding:10px 0;text-align:center;">
          <div style="font-size:44px;margin-bottom:12px;">⚠️</div>
          <h3 style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Permissão bloqueada no navegador</h3>
          <p style="font-size:14px;color:var(--text-2);line-height:1.5;">
            As notificações estão marcadas como bloqueadas nas configurações do seu navegador para este site.<br><br>
            Para ativar, clique no ícone de <strong>cadeado ou configurações</strong> ao lado do endereço do site na barra do navegador e altere a opção <strong>Notificações</strong> para <strong>Permitir</strong>.
          </p>
        </div>
        `,
        '<button class="btn btn-primary" onclick="Modal.close()">Fechar</button>'
      );
      return false;
    }

    if (permission !== 'granted') {
      toast('Permissão de notificações não concedida.', 'info');
      return false;
    }

    // Feedback visual imediato
    if (triggerBtn) {
      triggerBtn.innerHTML = '⏳ Ativando...';
      triggerBtn.disabled = true;
    }

    try {
      // 3. Obter VAPID Public Key (com fallback seguro caso a variável ainda esteja propagando)
      if (!this._vapidPublicKey) {
        try {
          const resp = await Api.getVapidPublicKey();
          this._vapidPublicKey = resp.public_key || DEFAULT_VAPID_PUBLIC_KEY;
        } catch (e) {
          this._vapidPublicKey = DEFAULT_VAPID_PUBLIC_KEY;
        }
      }

      const vapidKey = this._vapidPublicKey || DEFAULT_VAPID_PUBLIC_KEY;

      // 4. Obter registro do Service Worker
      const reg = await this.getServiceWorkerRegistration();
      if (!reg) {
        throw new Error('Service Worker não registrado neste navegador.');
      }

      // 5. Obter ou criar Push Subscription
      let sub = null;
      if (reg.pushManager) {
        sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const convertedVapidKey = this.urlBase64ToUint8Array(vapidKey);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }
      } else {
        throw new Error('PushManager indisponível no navegador.');
      }

      if (!sub) {
        throw new Error('Não foi possível gerar a inscrição de push.');
      }

      // 6. Enviar a inscrição para o backend
      const subJson = sub.toJSON();
      await Api.subscribePush({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        user_agent: navigator.userAgent
      });

      toast('Notificações push ativadas com sucesso neste dispositivo!', 'success');
      await this.updateButtonsState();
      return true;
    } catch (err) {
      console.error('[PushManager] Erro ao registrar push:', err);
      toast('Erro ao ativar notificações: ' + (err.message || 'Falha no registro'), 'error');
      await this.updateButtonsState();
      return false;
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
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
      toast('Notificações push desativadas neste dispositivo.', 'info');
      await this.updateButtonsState();
    } catch (err) {
      console.error('[PushManager] Erro ao desinscrever:', err);
      toast('Erro ao desativar notificações.', 'error');
      await this.updateButtonsState();
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
    }
  },

  async toggleSubscription(btn = null) {
    try {
      const isSub = await this.isSubscribed();
      if (isSub) {
        Modal.confirm(
          'Desativar Notificações',
          'Deseja desativar as notificações push neste dispositivo?',
          () => this.unsubscribe(btn)
        );
      } else {
        await this.subscribe(btn);
      }
    } catch (err) {
      console.error('[PushManager] Erro no toggle:', err);
      await this.subscribe(btn);
    }
  }
};

// Expor explicitamente no objeto global window
window.PushManager = PushManager;
window.togglePushNotifications = function(btn) {
  return PushManager.toggleSubscription(btn);
};
