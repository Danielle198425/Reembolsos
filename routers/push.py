from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models, auth
from services.push_notifications import get_vapid_public_key

router = APIRouter(prefix="/api/push", tags=["push-notifications"])


class PushKeysSchema(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeSchema(BaseModel):
    endpoint: str
    keys: PushKeysSchema
    user_agent: Optional[str] = None


class PushUnsubscribeSchema(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
def vapid_public_key():
    """Retorna a VAPID Public Key configurada no servidor."""
    key = get_vapid_public_key()
    return {"public_key": key}


@router.post("/subscribe")
def subscribe_push(
    body: PushSubscribeSchema,
    request: Request,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Registra ou atualiza uma inscrição de notificações push Web Push para o usuário atual."""
    endpoint = body.endpoint.strip()
    if not endpoint or not body.keys.p256dh or not body.keys.auth:
        raise HTTPException(status_code=400, detail="Dados de inscrição inválidos.")

    ua = body.user_agent or request.headers.get("user-agent", "")

    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == endpoint
    ).first()

    if existing:
        existing.user_id = current_user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        existing.user_agent = ua[:500] if ua else None
        existing.updated_at = datetime.utcnow()
    else:
        new_sub = models.PushSubscription(
            user_id=current_user.id,
            endpoint=endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            user_agent=ua[:500] if ua else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(new_sub)

    db.commit()
    return {"success": True, "message": "Notificações push ativadas com sucesso."}


@router.delete("/unsubscribe")
def unsubscribe_push(
    body: PushUnsubscribeSchema,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a inscrição de notificações push do usuário."""
    endpoint = body.endpoint.strip()
    sub = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == endpoint,
        models.PushSubscription.user_id == current_user.id
    ).first()

    if sub:
        db.delete(sub)
        db.commit()

    return {"success": True, "message": "Inscrição removida."}
