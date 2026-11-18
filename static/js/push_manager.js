/**
 * push_manager.js — Gerenciador de Web Push Notifications (VAPID / Service Worker)
 */
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

  isIosSafariNonStandalone() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.navigator.standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches;
    return isIos && !isStandalone;
  },

  isSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  },

  async isSubscribed() {
    if (!this.isSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) {
      return false;
    }
  },

  async updateButtonsState() {
    const subscribed = await this.isSubscribed();
    const buttons = document.querySelectorAll('.push-notification-btn');
    buttons.forEach(btn => {
      if (subscribed) {
        btn.innerHTML = '🔔 Notificações Ativadas ✅';
        btn.classList.add('subscribed');
        btn.style.borderColor = '#16a34a';
        btn.style.color = '#15803d';
        btn.setAttribute('title', 'Notificações push ativadas neste dispositivo');
      } else {
        btn.innerHTML = '🔔 Ativar Notificações';
        btn.classList.remove('subscribed');
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.setAttribute('title', 'Clique para receber alertas imediatos no celular ou computador');
      }
    });
  },

  async subscribe() {
    if (this.isIosSafariNonStandalone() && !('Notification' in window)) {
      Modal.open(
        '🔔 Notificações no iPhone',
        `
        <div style="padding:10px 0;text-align:center;">
          <div style="font-size:44px;margin-bottom:12px;">📱</div>
          <h3 style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Instale o atalho na tela de início</h3>
          <p style="font-size:14px;color:var(--text-2);line-height:1.5;margin-bottom:16px;">
            No iPhone, o iOS requer que o aplicativo esteja adicionado à Tela de Início para permitir notificações push nativas.
          </p>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left;font-size:13px;color:var(--text-1);line-height:1.6;">
            <strong>Como ativar:</strong><br>
            1. Toque no botão de <strong>Compartilhar</strong> (ícone <span style="font-size:16px;">⎋</span> ou quadrado com seta para cima na barra inferior do Safari).<br>
            2. Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.<br>
            3. Abra o app pelo ícone criado na tela inicial e ative as notificações.
          </div>
        </div>
        `,
        '<button class="btn btn-primary" onclick="Modal.close()">Entendido</button>'
      );
      return false;
    }

    if (!this.isSupported()) {
      toast('Seu navegador não possui suporte a notificações push nativas.', 'warning');
      return false;
    }

    // Solicitar permissão nativa
    let permission = Notification.permission;
    if (permission !== 'granted') {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        permission = await new Promise(resolve => Notification.requestPermission(resolve));
      }
    }

    if (permission === 'denied') {
      toast('A permissão de notificações foi bloqueada nas configurações do seu navegador.', 'warning');
      return false;
    }

    if (permission !== 'granted') {
      toast('Permissão de notificações não concedida.', 'info');
      return false;
    }

    try {
      if (!this._vapidPublicKey) {
        const resp = await Api.getVapidPublicKey();
        this._vapidPublicKey = resp.public_key;
      }

      if (!this._vapidPublicKey) {
        toast('Chave VAPID não configurada no servidor.', 'error');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const convertedVapidKey = this.urlBase64ToUint8Array(this._vapidPublicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      }

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
      return false;
    }
  },

  async unsubscribe() {
    try {
      if (!this.isSupported()) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await Api.unsubscribePush(endpoint);
      }
      toast('Notificações push desativadas neste dispositivo.', 'info');
      await this.updateButtonsState();
    } catch (err) {
      console.error('[PushManager] Erro ao desinscrever:', err);
      toast('Erro ao desativar notificações.', 'error');
    }
  },

  async toggleSubscription() {
    const isSub = await this.isSubscribed();
    if (isSub) {
      Modal.confirm(
        'Desativar Notificações',
        'Deseja desativar as notificações push neste dispositivo?',
        () => this.unsubscribe()
      );
    } else {
      await this.subscribe();
    }
  }
};
