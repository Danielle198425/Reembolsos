import os
import json
import logging
from typing import Optional, List
from sqlalchemy.orm import Session
from pywebpush import webpush, WebPushException
import models

logger = logging.getLogger(__name__)


def _load_env_fallback():
    """Carrega variáveis do arquivo .env local caso não estejam no os.environ."""
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass


_load_env_fallback()

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:suporte@mouraleite.com.br")


def get_vapid_public_key() -> str:
    """Retorna a chave pública VAPID configurada."""
    return os.getenv("VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY).strip()


def send_user_push(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    url: str = "/"
) -> int:
    """
    Envia uma notificação push para todos os navegadores/dispositivos registrados de um usuário.
    Remove automaticamente inscrições expiradas ou canceladas (HTTP 404/410).
    Retorna a quantidade de notificações enviadas com sucesso.
    """
    priv_key = os.getenv("VAPID_PRIVATE_KEY", VAPID_PRIVATE_KEY).strip()
    claims_email = os.getenv("VAPID_CLAIMS_EMAIL", VAPID_CLAIMS_EMAIL).strip()

    if not priv_key:
        logger.warning("[WebPush] VAPID_PRIVATE_KEY não configurada. Notificação não enviada.")
        return 0

    subscriptions = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == user_id
    ).all()

    if not subscriptions:
        return 0

    payload = json.dumps({
        "title": title,
        "body": message,
        "icon": "/static/icons/icon-192.png",
        "badge": "/static/icons/logo-icon.png",
        "data": {
            "url": url
        }
    })

    vapid_claims = {"sub": claims_email}
    sent_count = 0
    subs_to_delete: List[models.PushSubscription] = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth
            }
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=priv_key,
                vapid_claims=vapid_claims
            )
            sent_count += 1
        except WebPushException as ex:
            status_code = getattr(getattr(ex, "response", None), "status_code", None)
            if status_code in (404, 410):
                # Inscrição expirada ou dispositivo descadastrado
                logger.info(f"[WebPush] Removendo inscrição expirada (HTTP {status_code}): {sub.endpoint[:40]}...")
                subs_to_delete.append(sub)
            else:
                logger.warning(f"[WebPush] Erro ao enviar push para usuário {user_id} (HTTP {status_code}): {ex}")
        except Exception as e:
            logger.error(f"[WebPush] Falha inesperada ao enviar push: {e}")

    if subs_to_delete:
        try:
            for s in subs_to_delete:
                db.delete(s)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"[WebPush] Erro ao limpar inscrições expiradas: {e}")

    return sent_count
