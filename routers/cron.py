import os
import json
import logging
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from database import get_db
import models
from services.push_notifications import send_user_push

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["cron"])


def verify_cron_secret(
    authorization: str = Header(None),
    x_cron_secret: str = Header(None),
    cron_token: str = Query(None)
):
    """Valida o segredo do Cron Job da Vercel."""
    expected_secret = os.getenv("CRON_SECRET", "").strip()
    if not expected_secret:
        # Se não houver segredo configurado, registrar aviso e bloquear por segurança
        logger.error("[Cron] CRON_SECRET não configurado no ambiente.")
        raise HTTPException(status_code=401, detail="CRON_SECRET não configurado.")

    provided_secret = None
    if authorization and authorization.lower().startswith("bearer "):
        provided_secret = authorization[7:].strip()
    elif x_cron_secret:
        provided_secret = x_cron_secret.strip()
    elif cron_token:
        provided_secret = cron_token.strip()

    if not provided_secret or provided_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Acesso não autorizado ao Cron Job.")


@router.get("/friday-pending-approvals")
def friday_pending_approvals(
    _=Depends(verify_cron_secret),
    db: Session = Depends(get_db)
):
    """
    Gatilho 2: Lembrete Semanal às Sextas-Feiras para Aprovadores (09:00 Horário de Brasília / 12:00 UTC).
    Verifica despesas pendentes de aprovação e envia 1 push consolidado para cada aprovador com pendências.
    """
    # 1. Buscar todas as despesas atualmente aguardando aprovação
    pending_expenses = (
        db.query(models.Expense)
        .filter(models.Expense.status == models.ExpenseStatus.aguardando_aprovacao)
        .all()
    )

    if not pending_expenses:
        logger.info("[Cron] Nenhuma despesa aguardando aprovação hoje. Encerrando silenciosamente.")
        return {
            "status": "success",
            "message": "Nenhuma despesa pendente de aprovação.",
            "notified_approvers": 0
        }

    # 2. Buscar todos os aprovadores ativos
    approvers = (
        db.query(models.User)
        .filter(
            models.User.role == models.UserRole.aprovador,
            models.User.active == True
        )
        .all()
    )

    approver_pending_counts: Dict[int, int] = {}

    for app_user in approvers:
        # Regras de alçada do aprovador
        rules = []
        if getattr(app_user, 'approver_rules', None):
            try:
                rules = json.loads(app_user.approver_rules)
            except Exception:
                rules = []

        app_cc_ids = []
        if app_user.approver_of:
            try:
                app_cc_ids = json.loads(app_user.approver_of)
            except Exception:
                app_cc_ids = []
        if not app_cc_ids and app_user.cost_center_id:
            app_cc_ids = [app_user.cost_center_id]

        app_func_ids = []
        if app_user.approver_of_functions:
            try:
                app_func_ids = json.loads(app_user.approver_of_functions)
            except Exception:
                app_func_ids = []

        count = 0
        for exp in pending_expenses:
            # O aprovador não aprova a sua própria despesa
            if exp.user_id == app_user.id:
                continue

            matched = False
            if rules:
                for r in rules:
                    f_ids = r.get("function_ids", [])
                    d_ids = r.get("department_ids", [])
                    f_ok = not f_ids or (exp.user and exp.user.job_function_id in f_ids)
                    d_ok = not d_ids or ((exp.user and exp.user.cost_center_id in d_ids) or exp.cost_center_id in d_ids)
                    if f_ok and d_ok:
                        matched = True
                        break
            else:
                cc_ok = not app_cc_ids or ((exp.user and exp.user.cost_center_id in app_cc_ids) or exp.cost_center_id in app_cc_ids)
                func_ok = not app_func_ids or (exp.user and exp.user.job_function_id in app_func_ids)
                if cc_ok and func_ok:
                    matched = True

            if matched:
                count += 1

        if count > 0:
            approver_pending_counts[app_user.id] = count

    # 3. Disparar notificação push apenas para os aprovadores com 1 ou mais despesas pendentes
    notified_count = 0
    title = "Aprovações Pendentes — Moura Leite"

    for approver_id, pending_n in approver_pending_counts.items():
        plural = "despesa" if pending_n == 1 else "despesas"
        plural_verb = "aguardando"
        message = f"Você tem {pending_n} {plural} {plural_verb} sua aprovação antes do fechamento da semana."
        
        sent = send_user_push(
            db=db,
            user_id=approver_id,
            title=title,
            message=message,
            url="/#expenses"
        )
        if sent > 0:
            notified_count += 1

    logger.info(f"[Cron] Lembrete semanal enviado: {notified_count} aprovadores notificados de {len(approver_pending_counts)} elegíveis.")

    return {
        "status": "success",
        "total_pending_expenses": len(pending_expenses),
        "eligible_approvers": len(approver_pending_counts),
        "notified_approvers": notified_count
    }
