import os
import json
import shutil
from typing import Optional
from datetime import date, datetime
from urllib.parse import unquote
from fastapi import (
    APIRouter, Depends, HTTPException, status,
    UploadFile, File, Query, Request
)
from fastapi.responses import FileResponse
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from database import get_db
import models, schemas, auth
import storage
import logging
from pdf_generator import generate_expense_pdf
from email_service import send_rejection_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

UPLOAD_DIR = "/tmp/uploads" if (os.environ.get("VERCEL") or not os.path.exists("uploads")) else "uploads"

STATUS_TRANSITIONS = {
    # status_atual -> [roles permitidos] -> novo_status
    models.ExpenseStatus.rascunho: {
        "submit": (
            [models.UserRole.usuario, models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.aguardando_aprovacao
        )
    },
    models.ExpenseStatus.a_enviar: {
        "send": (
            [models.UserRole.usuario, models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.aguardando_aprovacao
        ),
        # Usuário pode auto-enviar se for aprovador/admin
        "submit_own": (
            [models.UserRole.usuario, models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.aguardando_aprovacao
        ),
    },
    models.ExpenseStatus.aguardando_aprovacao: {
        "approve": (
            [models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.aprovado
        ),
        "reject": (
            [models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.rejeitado
        ),
    },
    models.ExpenseStatus.aprovado: {
        "finalize": (
            [models.UserRole.admin],
            models.ExpenseStatus.finalizado
        ),
    },
    models.ExpenseStatus.aguardando_finalizacao: {
        "finalize": (
            [models.UserRole.admin],
            models.ExpenseStatus.finalizado
        ),
        "pay": (
            [models.UserRole.admin],
            models.ExpenseStatus.finalizado
        ),
    },
    models.ExpenseStatus.rejeitado: {
        "resubmit": (
            [models.UserRole.usuario, models.UserRole.aprovador, models.UserRole.admin],
            models.ExpenseStatus.aguardando_aprovacao
        ),
    },
}


def _can_view(expense: models.Expense, user: models.User) -> bool:
    if user.role in [models.UserRole.admin, models.UserRole.financeiro]:
        return True
    if user.role == models.UserRole.aprovador:
        if expense.user_id == user.id:
            return True
        rules = []
        if getattr(user, 'approver_rules', None):
            try:
                rules = json.loads(user.approver_rules)
            except Exception:
                rules = []
        if rules and expense.user:
            for r in rules:
                f_ids = r.get("function_ids", [])
                d_ids = r.get("department_ids", [])
                f_ok = not f_ids or (expense.user.job_function_id in f_ids)
                d_ok = not d_ids or (expense.user.cost_center_id in d_ids or expense.cost_center_id in d_ids)
                if f_ok and d_ok:
                    return True
            return False

        app_cc_ids = []
        if user.approver_of:
            try:
                app_cc_ids = json.loads(user.approver_of)
            except Exception:
                app_cc_ids = []
        if not app_cc_ids and user.cost_center_id:
            app_cc_ids = [user.cost_center_id]

        app_func_ids = []
        if getattr(user, 'approver_of_functions', None):
            try:
                app_func_ids = json.loads(user.approver_of_functions)
            except Exception:
                app_func_ids = []

        if expense.user:
            d_ok = not app_cc_ids or (expense.user.cost_center_id in app_cc_ids or expense.cost_center_id in app_cc_ids)
            f_ok = not app_func_ids or (expense.user.job_function_id in app_func_ids)
            return d_ok and f_ok
        return False
    return expense.user_id == user.id


def _expense_out(e: models.Expense) -> dict:
    return {
        "id": e.id,
        "user_id": e.user_id,
        "category_id": e.category_id,
        "cost_center_id": e.cost_center_id,
        "provider": e.provider,
        "description": e.description,
        "amount": e.amount,
        "expense_date": str(e.expense_date),
        "status": e.status.value if hasattr(e.status, 'value') else e.status,
        "receipt_path": (e.receipt_path.replace("\\", "/").lstrip("/") if e.receipt_path else None),
        "notes": e.notes,
        "rejection_reason": e.rejection_reason,
        "approved_by": e.approved_by,
        "approved_at": (e.approved_at.isoformat() + "Z") if e.approved_at else None,
        "rejected_by": getattr(e, 'rejected_by', None),
        "rejected_at": (e.rejected_at.isoformat() + "Z") if getattr(e, 'rejected_at', None) else None,
        "created_at": (e.created_at.isoformat() + "Z") if e.created_at else None,
        "updated_at": (e.updated_at.isoformat() + "Z") if e.updated_at else None,
        "user_name": e.user.name if e.user else "-",
        "user_email": e.user.email if e.user else "-",
        "category_name": e.category.name if e.category else "-",
        "category_requires_nf": e.category.requires_nf if e.category else False,
        "category_daily_limit": e.category.daily_limit if e.category else None,
        "cost_center_code": e.cost_center.code if e.cost_center else "-",
        "cost_center_name": e.cost_center.name if e.cost_center else "-",
        "company_id": (e.cost_center.company_id if e.cost_center else None),
        "company_name": (e.cost_center.company.name if (e.cost_center and e.cost_center.company) else "-"),
        "approver_name": e.approver.name if e.approver else None,
        "rejecter_name": e.rejecter.name if getattr(e, 'rejecter', None) else None,
        "finalized_by": getattr(e, 'finalized_by', None),
        "finalized_at": (e.finalized_at.isoformat() + "Z") if getattr(e, 'finalized_at', None) else None,
        "finalizer_name": e.finalizer.name if getattr(e, 'finalizer', None) else None,
        "paid_by": getattr(e, 'paid_by', None),
        "paid_at": (e.paid_at.isoformat() + "Z") if getattr(e, 'paid_at', None) else None,
        "payer_name": (e.payer.name if getattr(e, 'payer', None) else ("Sienge (Integração Contas a Pagar)" if (hasattr(e, 'status') and (e.status == models.ExpenseStatus.pago or getattr(e.status, 'value', None) == 'pago')) else None)),
        "export_id": getattr(e, 'export_id', None),
        "email_sent": bool(getattr(e, 'email_sent', False)),
        "sienge_title": getattr(e, 'sienge_title', None),
        "sienge_sent_at": (e.sienge_sent_at.isoformat() + "Z") if getattr(e, 'sienge_sent_at', None) else None,
        "sienge_sent_by": getattr(e, 'sienge_sent_by', None),
        "sienge_sender_name": e.sienge_sender.name if getattr(e, 'sienge_sender', None) else None,
        "edited_after_approval": bool(getattr(e, 'edited_after_approval', False)),
        "is_corrected": bool(getattr(e, 'is_corrected', False)),
        "created_by_admin_id": getattr(e, 'created_by_admin_id', None),
        "created_by_admin_name": getattr(e, 'created_by_admin_name', None) or (e.created_by_admin.name if getattr(e, 'created_by_admin', None) else None),
        "approved_by_admin_id": getattr(e, 'approved_by_admin_id', None),
        "approved_by_admin_name": getattr(e, 'approved_by_admin_name', None),
        "rejected_by_admin_id": getattr(e, 'rejected_by_admin_id', None),
        "rejected_by_admin_name": getattr(e, 'rejected_by_admin_name', None),
        "finalized_by_admin_id": getattr(e, 'finalized_by_admin_id', None),
        "finalized_by_admin_name": getattr(e, 'finalized_by_admin_name', None),
        "paid_by_admin_id": getattr(e, 'paid_by_admin_id', None),
        "paid_by_admin_name": getattr(e, 'paid_by_admin_name', None),
        "edit_history": json.loads(e.edit_history) if getattr(e, 'edit_history', None) else [],
    }


@router.get("")
def list_expenses(
    status_filter: Optional[str] = Query(None, alias="status"),
    category_id: Optional[int] = None,
    cost_center_id: Optional[int] = None,
    user_id: Optional[int] = None,
    scope: Optional[str] = Query("personal"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    pending_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(models.Expense)

    # Controle de acesso e escopo:
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro, models.UserRole.aprovador]:
        q = q.filter(models.Expense.user_id == current_user.id)
    elif scope in ["personal", "pessoal"]:
        q = q.filter(models.Expense.user_id == current_user.id)
    elif current_user.role == models.UserRole.aprovador:
        if user_id:
            q = q.filter(models.Expense.user_id == user_id)

        rules = []
        if getattr(current_user, 'approver_rules', None):
            try:
                rules = json.loads(current_user.approver_rules)
            except Exception:
                rules = []

        if rules:
            rule_conditions = []
            for r in rules:
                f_ids = r.get("function_ids", [])
                d_ids = r.get("department_ids", [])
                cond_f = models.User.job_function_id.in_(f_ids) if f_ids else None
                cond_d = or_(models.User.cost_center_id.in_(d_ids), models.Expense.cost_center_id.in_(d_ids)) if d_ids else None
                if cond_f is not None and cond_d is not None:
                    rule_conditions.append(and_(cond_f, cond_d))
                elif cond_f is not None:
                    rule_conditions.append(cond_f)
                elif cond_d is not None:
                    rule_conditions.append(cond_d)
            if rule_conditions:
                q = q.join(models.User, models.Expense.user_id == models.User.id).filter(or_(*rule_conditions))
            else:
                q = q.filter(models.Expense.user_id == current_user.id)
        else:
            # Filtrar por centros de custo (departamentos) permitidos ao aprovador
            app_cc_ids = []
            if current_user.approver_of:
                try:
                    app_cc_ids = json.loads(current_user.approver_of)
                except Exception:
                    app_cc_ids = []
            if not app_cc_ids and current_user.cost_center_id:
                app_cc_ids = [current_user.cost_center_id]

            # Filtrar por funções permitidas ao aprovador
            app_func_ids = []
            if current_user.approver_of_functions:
                try:
                    app_func_ids = json.loads(current_user.approver_of_functions)
                except Exception:
                    app_func_ids = []

            if app_cc_ids or app_func_ids:
                q = q.join(models.User, models.Expense.user_id == models.User.id)
                if app_cc_ids:
                    q = q.filter(or_(models.User.cost_center_id.in_(app_cc_ids), models.Expense.cost_center_id.in_(app_cc_ids)))
                if app_func_ids:
                    q = q.filter(models.User.job_function_id.in_(app_func_ids))
            else:
                q = q.filter(models.Expense.user_id == current_user.id)
    elif user_id:
        q = q.filter(models.Expense.user_id == user_id)

    if pending_only:
        if current_user.role in [models.UserRole.admin, models.UserRole.financeiro]:
            q = q.filter(models.Expense.status.in_([
                models.ExpenseStatus.aguardando_aprovacao,
                models.ExpenseStatus.aguardando_finalizacao,
                models.ExpenseStatus.rejeitado,
            ]))
        else:
            q = q.filter(models.Expense.status.in_([
                models.ExpenseStatus.aguardando_aprovacao,
                models.ExpenseStatus.rejeitado,
            ]))
    elif status_filter:
        statuses = status_filter.split(",")
        q = q.filter(models.Expense.status.in_(statuses))

    if category_id:
        q = q.filter(models.Expense.category_id == category_id)
    if cost_center_id:
        q = q.filter(models.Expense.cost_center_id == cost_center_id)
    if date_from:
        q = q.filter(models.Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(models.Expense.expense_date <= date_to)

    q = q.order_by(models.Expense.expense_date.desc(), models.Expense.id.desc())
    total = q.count()
    expenses = q.offset(skip).limit(limit).all()

    return {"total": total, "items": [_expense_out(e) for e in expenses]}


def _validate_user_cost_center_and_category(db: Session, current_user: models.User, cost_center_id: Optional[int], category_id: Optional[int]):
    if current_user.role in [models.UserRole.admin, models.UserRole.financeiro]:
        return

    from routers import admin
    if cost_center_id is not None:
        allowed_ccs = admin.list_cost_centers(db=db, current_user=current_user)
        allowed_cc_ids = {c.id for c in allowed_ccs}
        if cost_center_id not in allowed_cc_ids:
            raise HTTPException(status_code=403, detail="Você não tem permissão para lançar despesas neste Centro de Custo.")

    if category_id is not None:
        allowed_cats = admin.list_categories(db=db, current_user=current_user)
        allowed_cat_ids = {c.id for c in allowed_cats}
        if category_id not in allowed_cat_ids:
            raise HTTPException(status_code=403, detail="Você não tem permissão para lançar despesas nesta Categoria.")


@router.post("", status_code=201)
def create_expense(
    body: schemas.ExpenseCreate,
    request: Request,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Validação de regras por centro de custo e categoria
    _validate_user_cost_center_and_category(db, current_user, body.cost_center_id, body.category_id)

    # Validações de negócio
    category = db.query(models.Category).filter(models.Category.id == body.category_id).first()
    if not category:
        raise HTTPException(404, "Categoria não encontrada")

    # Trava de limite de valor (apenas se a categoria possuir limite definido > 0 e não for quilometragem)
    cat_name_lower = category.name.lower()
    is_km = any(k in cat_name_lower for k in ["quilometragem", "km"])
    if not is_km and category.daily_limit is not None and category.daily_limit > 0:
        if body.amount > category.daily_limit:
            raise HTTPException(
                400,
                f"O valor de R$ {body.amount:.2f} excede o limite máximo permitido de R$ {category.daily_limit:.2f} para a categoria '{category.name}'. Corrija o valor para continuar."
            )

    if category.requires_nf:
        # NF será validada no upload — aqui apenas registramos
        pass

    # Identificar se a despesa está sendo criada por um administrador no modo "Ver como"
    imp_id = getattr(current_user, '_impersonator_id', None)
    imp_name = getattr(current_user, '_impersonator_name', None)

    header_imp_id = request.headers.get("X-Impersonator-Id")
    if not imp_id and header_imp_id:
        try:
            imp_id = int(header_imp_id)
        except Exception:
            imp_id = None

    header_imp_name = request.headers.get("X-Impersonator-Name")
    if not imp_name and header_imp_name:
        imp_name = unquote(header_imp_name)

    admin_creator = None
    if imp_id:
        admin_creator = db.query(models.User).filter(models.User.id == imp_id).first()
        if admin_creator:
            imp_name = admin_creator.name

    initial_history = None
    if imp_id and imp_name:
        now_str = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
        initial_history = json.dumps([{
            "date": now_str,
            "user_name": imp_name,
            "changes": [f"Despesa criada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name})"]
        }])

    expense = models.Expense(
        user_id=current_user.id,
        category_id=body.category_id,
        cost_center_id=body.cost_center_id,
        provider=body.provider,
        description=body.description,
        amount=body.amount,
        expense_date=body.expense_date,
        notes=body.notes,
        status=models.ExpenseStatus.rascunho,
        created_by_admin_id=imp_id if admin_creator else None,
        created_by_admin_name=imp_name if imp_id else None,
        edit_history=initial_history,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _expense_out(expense)


@router.get("/{expense_id}")
def get_expense(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if not _can_view(expense, current_user):
        raise HTTPException(403, "Acesso negado")

    # Se estiver com status 'enviado' ou tiver título Sienge pendente de baixa,
    # consulta a situação da parcela no Sienge e atualiza para 'pago' se for PG
    if expense.status == models.ExpenseStatus.enviado or (expense.sienge_title and expense.status != models.ExpenseStatus.pago):
        try:
            from services.sienge_service import sync_expense_sienge_payment
            sync_expense_sienge_payment(expense, db, current_user=current_user)
        except Exception as exc:
            logger.warning(f"Erro ao verificar pagamento Sienge no get_expense: {exc}")

    return _expense_out(expense)


@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    body: schemas.ExpenseUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = models.Expense.filter(models.Expense.id == expense_id).first() if hasattr(models.Expense, 'filter') else db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if expense.user_id != current_user.id and current_user.role not in [models.UserRole.admin, models.UserRole.aprovador]:
        raise HTTPException(403, "Acesso negado")
    if expense.status in [models.ExpenseStatus.finalizado, models.ExpenseStatus.pago] and current_user.role != models.UserRole.admin:
        raise HTTPException(400, "Despesas finalizadas só podem ser editadas pelo administrador.")

    # Validação de regras por centro de custo e categoria ao atualizar
    target_cc_id = body.cost_center_id if body.cost_center_id is not None else expense.cost_center_id
    target_cat_id = body.category_id if body.category_id is not None else expense.category_id
    _validate_user_cost_center_and_category(db, current_user, target_cc_id, target_cat_id)

    # Trava de limite de valor ao atualizar
    cat_id = body.category_id if body.category_id is not None else expense.category_id
    category = db.query(models.Category).filter(models.Category.id == cat_id).first()
    new_amount = body.amount if body.amount is not None else expense.amount
    if category:
        cat_name_lower = category.name.lower()
        is_km = any(k in cat_name_lower for k in ["quilometragem", "km"])
        if not is_km and category.daily_limit is not None and category.daily_limit > 0:
            if new_amount is not None and new_amount > category.daily_limit:
                raise HTTPException(
                    400,
                    f"O valor de R$ {new_amount:.2f} excede o limite máximo permitido de R$ {category.daily_limit:.2f} para a categoria '{category.name}'. Corrija o valor para continuar."
                )

    reverted_to_approval = False
    approved_statuses = [
        models.ExpenseStatus.aprovado,
        models.ExpenseStatus.aguardando_finalizacao,
        models.ExpenseStatus.pago,
    ]
    was_rejected = (
        expense.status == models.ExpenseStatus.rejeitado or
        bool(getattr(expense, 'is_corrected', False))
    )
    was_previously_approved = (
        expense.status in approved_statuses or
        bool(getattr(expense, 'edited_after_approval', False)) or
        expense.approved_at is not None
    )

    update_dict = body.model_dump(exclude_none=True)
    changes = []

    if was_previously_approved or was_rejected:
        if "amount" in update_dict and update_dict["amount"] != expense.amount:
            changes.append(f"Valor: alterado de R$ {expense.amount:.2f} para R$ {update_dict['amount']:.2f}")
        if "description" in update_dict and update_dict["description"] != expense.description:
            changes.append(f"Descrição: alterada de '{expense.description}' para '{update_dict['description']}'")
        if "expense_date" in update_dict and str(update_dict["expense_date"]) != str(expense.expense_date):
            d_old = expense.expense_date.strftime("%d/%m/%Y") if hasattr(expense.expense_date, 'strftime') else str(expense.expense_date)
            d_new = update_dict["expense_date"].strftime("%d/%m/%Y") if hasattr(update_dict["expense_date"], 'strftime') else str(update_dict["expense_date"])
            changes.append(f"Data: alterada de {d_old} para {d_new}")
        if "category_id" in update_dict and update_dict["category_id"] != expense.category_id:
            old_cat = db.query(models.Category).filter(models.Category.id == expense.category_id).first()
            new_cat = db.query(models.Category).filter(models.Category.id == update_dict["category_id"]).first()
            changes.append(f"Categoria: alterada de '{old_cat.name if old_cat else '-'}' para '{new_cat.name if new_cat else '-'}'")
        if "cost_center_id" in update_dict and update_dict["cost_center_id"] != expense.cost_center_id:
            old_cc = db.query(models.CostCenter).filter(models.CostCenter.id == expense.cost_center_id).first()
            new_cc = db.query(models.CostCenter).filter(models.CostCenter.id == update_dict["cost_center_id"]).first()
            old_cc_str = f"{old_cc.code} | {old_cc.name}" if old_cc else "-"
            new_cc_str = f"{new_cc.code} | {new_cc.name}" if new_cc else "-"
            changes.append(f"Centro de Custo: alterado de '{old_cc_str}' para '{new_cc_str}'")
        if "notes" in update_dict and (update_dict["notes"] or "") != (expense.notes or ""):
            changes.append(f"Observações: alteradas")
        if "provider" in update_dict and (update_dict["provider"] or "") != (expense.provider or ""):
            changes.append(f"Fornecedor: alterado de '{expense.provider or ''}' para '{update_dict['provider'] or ''}'")

        if was_rejected:
            expense.status = models.ExpenseStatus.aguardando_aprovacao
            expense.is_corrected = True
            reverted_to_approval = True

            history_list = []
            if getattr(expense, 'edit_history', None):
                try:
                    history_list = json.loads(expense.edit_history)
                except Exception:
                    history_list = []

            now_str = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
            rej_info = f" (Motivo da reprovação: {expense.rejection_reason})" if expense.rejection_reason else ""
            history_list.append({
                "date": now_str,
                "user_name": current_user.name or current_user.email,
                "type": "correction",
                "changes": changes if changes else [f"Despesa corrigida e reenviada{rej_info}"]
            })
            expense.edit_history = json.dumps(history_list)

        elif was_previously_approved and (changes or expense.status in approved_statuses):
            expense.status = models.ExpenseStatus.aguardando_aprovacao
            expense.approved_by = None
            expense.approved_at = None
            expense.edited_after_approval = True
            reverted_to_approval = True

            history_list = []
            if getattr(expense, 'edit_history', None):
                try:
                    history_list = json.loads(expense.edit_history)
                except Exception:
                    history_list = []

            now_str = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
            history_list.append({
                "date": now_str,
                "user_name": current_user.name or current_user.email,
                "type": "post_approval_edit",
                "changes": changes if changes else ["Edição realizada após aprovação prévia"]
            })
            expense.edit_history = json.dumps(history_list)

    for field, value in update_dict.items():
        setattr(expense, field, value)
    expense.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(expense)
    res = _expense_out(expense)
    if reverted_to_approval:
        res["reverted_to_approval"] = True
    return res


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if expense.user_id != current_user.id and current_user.role != models.UserRole.admin:
        raise HTTPException(403, "Acesso negado para excluir esta despesa. Apenas o criador ou o administrador podem realizar esta ação.")
    db.delete(expense)
    db.commit()


def _transition(expense_id: int, action: str, current_user: models.User, db: Session, reason: str = None, request: Request = None):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")

    transitions = STATUS_TRANSITIONS.get(expense.status, {})
    if action not in transitions:
        raise HTTPException(400, f"Ação '{action}' não permitida para status '{expense.status}'")

    allowed_roles, new_status = transitions[action]
    if current_user.role not in allowed_roles:
        raise HTTPException(403, "Você não tem permissão para esta ação")

    # Identificar se a ação está sendo executada no modo "Ver como" por um administrador
    imp_id = getattr(current_user, '_impersonator_id', None)
    imp_name = getattr(current_user, '_impersonator_name', None)
    if request:
        header_imp_id = request.headers.get("X-Impersonator-Id")
        if not imp_id and header_imp_id:
            try:
                imp_id = int(header_imp_id)
            except Exception:
                imp_id = None
        header_imp_name = request.headers.get("X-Impersonator-Name")
        if not imp_name and header_imp_name:
            imp_name = unquote(header_imp_name)

    if imp_id:
        admin_obj = db.query(models.User).filter(models.User.id == imp_id).first()
        if admin_obj:
            imp_name = admin_obj.name

    # Aprovador não pode aprovar/reprovar a própria despesa (administrador pode)
    if action in ["approve", "reject"] and current_user.role == models.UserRole.aprovador:
        if expense.user_id == current_user.id:
            raise HTTPException(403, "Aprovadores não possuem permissão para aprovar ou reprovar as suas próprias despesas.")

        rules = []
        if getattr(current_user, 'approver_rules', None):
            try:
                rules = json.loads(current_user.approver_rules)
            except Exception:
                rules = []

        if rules:
            matched = False
            if expense.user:
                for r in rules:
                    f_ids = r.get("function_ids", [])
                    d_ids = r.get("department_ids", [])
                    f_ok = not f_ids or (expense.user.job_function_id in f_ids)
                    d_ok = not d_ids or (expense.user.cost_center_id in d_ids or expense.cost_center_id in d_ids)
                    if f_ok and d_ok:
                        matched = True
                        break
            if not matched:
                raise HTTPException(403, "Você não tem permissão para aprovar ou reprovar despesas deste departamento e função.")
        else:
            # Validação de escopo por departamento legado
            app_cc_ids = []
            if current_user.approver_of:
                try:
                    app_cc_ids = json.loads(current_user.approver_of)
                except Exception:
                    app_cc_ids = []
            if not app_cc_ids and current_user.cost_center_id:
                app_cc_ids = [current_user.cost_center_id]

            if app_cc_ids and expense.user and (expense.user.cost_center_id not in app_cc_ids and expense.cost_center_id not in app_cc_ids):
                raise HTTPException(403, "Você não tem permissão para aprovar ou reprovar despesas deste departamento.")

            # Validação de escopo por função legado
            app_func_ids = []
            if current_user.approver_of_functions:
                try:
                    app_func_ids = json.loads(current_user.approver_of_functions)
                except Exception:
                    app_func_ids = []
            if app_func_ids and expense.user and expense.user.job_function_id and expense.user.job_function_id not in app_func_ids:
                raise HTTPException(403, "Você não tem permissão para aprovar ou reprovar despesas desta função.")

    expense.status = new_status
    expense.updated_at = datetime.utcnow()

    now_str = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    history_list = []
    if getattr(expense, 'edit_history', None):
        try:
            history_list = json.loads(expense.edit_history)
        except Exception:
            history_list = []

    if action == "approve":
        expense.approved_by = current_user.id
        expense.approved_at = datetime.utcnow()
        if imp_id and imp_name:
            expense.approved_by_admin_id = imp_id
            expense.approved_by_admin_name = imp_name
            history_list.append({
                "date": now_str,
                "user_name": imp_name,
                "changes": [f"Despesa aprovada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name})"]
            })
            expense.edit_history = json.dumps(history_list)

    if action == "reject" and reason:
        expense.rejected_by = current_user.id
        expense.rejected_at = datetime.utcnow()
        expense.rejection_reason = reason
        if imp_id and imp_name:
            expense.rejected_by_admin_id = imp_id
            expense.rejected_by_admin_name = imp_name
            history_list.append({
                "date": now_str,
                "user_name": imp_name,
                "changes": [f"Despesa reprovada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name}). Motivo: {reason}"]
            })
            expense.edit_history = json.dumps(history_list)
        # Disparar e-mail de notificação para o usuário
        try:
            if expense.user and expense.user.email:
                send_rejection_email(
                    user_name=expense.user.name or "Colaborador",
                    user_email=expense.user.email,
                    expense_id=expense.id,
                    amount=expense.amount,
                    description=expense.description,
                    rejection_reason=reason,
                    reviewer_name=imp_name if imp_id else (current_user.name or current_user.email)
                )
        except Exception as exc:
            print(f"Erro ao disparar e-mail de rejeição: {exc}")

    if action == "resubmit":
        expense.is_corrected = True
        if imp_id and imp_name:
            history_list.append({
                "date": now_str,
                "user_name": imp_name,
                "changes": [f"Despesa reenviada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name})"]
            })
            expense.edit_history = json.dumps(history_list)

    if action == "finalize":
        expense.finalized_by = current_user.id
        expense.finalized_at = datetime.utcnow()
        if imp_id and imp_name:
            expense.finalized_by_admin_id = imp_id
            expense.finalized_by_admin_name = imp_name
            history_list.append({
                "date": now_str,
                "user_name": imp_name,
                "changes": [f"Despesa finalizada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name})"]
            })
            expense.edit_history = json.dumps(history_list)

    if action == "pay":
        expense.paid_by = current_user.id
        expense.paid_at = datetime.utcnow()
        if imp_id and imp_name:
            expense.paid_by_admin_id = imp_id
            expense.paid_by_admin_name = imp_name
            history_list.append({
                "date": now_str,
                "user_name": imp_name,
                "changes": [f"Baixa de pagamento realizada pelo Administrador {imp_name} no modo 'Ver como' (simulando perfil de {current_user.name})"]
            })
            expense.edit_history = json.dumps(history_list)

    db.commit()
    db.refresh(expense)
    return _expense_out(expense)


@router.post("/{expense_id}/submit")
def submit_expense(expense_id: int, request: Request, current_user=Depends(auth.get_current_user), db=Depends(get_db)):
    return _transition(expense_id, "submit", current_user, db, request=request)


@router.post("/{expense_id}/send")
def send_expense(expense_id: int, request: Request, current_user=Depends(auth.get_current_user), db=Depends(get_db)):
    if current_user.role == models.UserRole.usuario:
        return _transition(expense_id, "submit_own", current_user, db, request=request)
    return _transition(expense_id, "send", current_user, db, request=request)


@router.post("/{expense_id}/approve")
def approve_expense(expense_id: int, request: Request, current_user=Depends(auth.require_approver), db=Depends(get_db)):
    return _transition(expense_id, "approve", current_user, db, request=request)


@router.post("/{expense_id}/reject")
def reject_expense(
    expense_id: int,
    body: schemas.RejectRequest,
    request: Request,
    current_user=Depends(auth.require_approver),
    db=Depends(get_db)
):
    return _transition(expense_id, "reject", current_user, db, reason=body.reason, request=request)


@router.post("/{expense_id}/finalize")
def finalize_expense(expense_id: int, request: Request, current_user=Depends(auth.require_admin), db=Depends(get_db)):
    return _transition(expense_id, "finalize", current_user, db, request=request)


@router.post("/{expense_id}/pay")
def pay_expense(expense_id: int, request: Request, current_user=Depends(auth.require_admin), db=Depends(get_db)):
    return _transition(expense_id, "pay", current_user, db, request=request)


@router.post("/{expense_id}/resubmit")
def resubmit_expense(expense_id: int, request: Request, current_user=Depends(auth.get_current_user), db=Depends(get_db)):
    return _transition(expense_id, "resubmit", current_user, db, request=request)


@router.post("/{expense_id}/upload")
async def upload_receipt(
    expense_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if expense.user_id != current_user.id and current_user.role != models.UserRole.admin:
        raise HTTPException(403, "Acesso negado")

    allowed_types = ["image/jpeg", "image/png", "image/gif", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Tipo de arquivo não permitido. Use JPG, PNG ou PDF.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "file")[1]
    filename = f"expense_{expense_id}_{int(datetime.utcnow().timestamp())}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    web_path = f"uploads/{filename}"
    expense.receipt_path = web_path
    expense.updated_at = datetime.utcnow()
    db.commit()

    if storage.enabled():
        storage.upload_file(f"uploads/{filename}", filepath)

    return {"receipt_path": web_path, "filename": filename}


@router.get("/{expense_id}/pdf")
def expense_pdf(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if not _can_view(expense, current_user):
        raise HTTPException(403, "Acesso negado")

    export_dir = "/tmp/exports" if (os.environ.get("VERCEL") or not os.path.exists("exports")) else "exports"
    os.makedirs(export_dir, exist_ok=True)
    output_path = os.path.join(export_dir, f"despesa_{expense_id}.pdf")
    generate_expense_pdf(expense, output_path)
    if storage.enabled():
        storage.upload_file(f"exports/despesa_{expense_id}.pdf", output_path)
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"Despesa_{expense_id:06d}.pdf"
    )

_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
        except Exception:
            _ocr_engine = False
    return _ocr_engine if _ocr_engine is not False else None


@router.post("/ocr")
async def extract_receipt_data(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Extração inteligente de dados do comprovante via RapidOCR, PyPDF, EXIF transposition, QR Code e Regex.
    """
    import re
    import io
    import numpy as np
    import cv2
    from PIL import Image, ImageOps
    from datetime import datetime

    file_bytes = await file.read()
    filename = file.filename or ""
    filename_lower = filename.lower()

    text_extracted = ""
    qr_text = None

    # 1. Tentar leitura de PDF via pypdf se for arquivo PDF
    if filename_lower.endswith(".pdf") or file_bytes.startswith(b"%PDF"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pdf_texts = []
            for page in reader.pages:
                txt = page.extract_text()
                if txt:
                    pdf_texts.append(txt)
            if pdf_texts:
                text_extracted = "\n".join(pdf_texts)
        except Exception:
            pass

    # 2. Leitura visual (QR Code e RapidOCR) com correção de rotação EXIF e multi-ângulo
    if not text_extracted or not filename_lower.endswith(".pdf"):
        try:
            pil_img = Image.open(io.BytesIO(file_bytes))
            pil_img = ImageOps.exif_transpose(pil_img).convert('RGB')
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

            # 2a. QR Code detector
            try:
                detector = cv2.QRCodeDetector()
                val, pts, _ = detector.detectAndDecode(img)
                if val:
                    qr_text = val
            except Exception:
                pass

            # 2b. RapidOCR engine com rotação multi-ângulo caso necessário
            engine = get_ocr_engine()
            if engine:
                try:
                    res, _ = engine(img)
                    ocr_lines = []
                    if res and len(res) >= 3:
                        ocr_lines = [item[1].strip() for item in res if item[1].strip()]
                    else:
                        # Testar ângulos (90°, 180°, 270°) caso foto esteja virada
                        for angle in [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE]:
                            rot_img = cv2.rotate(img, angle)
                            res_rot, _ = engine(rot_img)
                            if res_rot and len(res_rot) >= 3:
                                ocr_lines = [item[1].strip() for item in res_rot if item[1].strip()]
                                break
                    if ocr_lines:
                        text_extracted = "\n".join(ocr_lines)
                except Exception:
                    pass

            # 2c. Fallback Tesseract se necessário
            if not text_extracted:
                try:
                    import pytesseract
                    text_extracted = pytesseract.image_to_string(pil_img, lang='por+eng')
                except Exception:
                    pass
        except Exception:
            # Em caso de falha no decode de PIL/OpenCV
            try:
                nparr = np.frombuffer(file_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is not None:
                    engine = get_ocr_engine()
                    if engine:
                        res, _ = engine(img)
                        if res:
                            text_extracted = "\n".join([item[1].strip() for item in res if item[1].strip()])
            except Exception:
                pass

    # Linhas extraídas EXCLUSIVAMENTE pelo OCR (sem incluir o nome do arquivo para não sujar o fornecedor)
    ocr_lines = [l.strip() for l in text_extracted.split('\n') if l.strip()]
    combined_search_text = (text_extracted + "\n" + (qr_text or "") + "\n" + filename).lower()

    provider = None
    date_str = None
    amount_val = None
    category = "Outros"

    # 3. QR Code Parsing (NFC-e / DANFE)
    if qr_text:
        parts = qr_text.split('|')
        for p in reversed(parts):
            p_clean = p.replace(',', '.').strip()
            try:
                val = float(p_clean)
                if 0.5 <= val <= 100000:
                    amount_val = val
                    break
            except ValueError:
                pass
        key_match = re.search(r'\b\d{2}(\d{2})(\d{2})(\d{14})', qr_text)
        if key_match:
            yy, mm, cnpj = key_match.groups()
            date_str = f"20{yy}-{mm}-01"

    # 4. Mapeamento de estabelecimentos conhecidos (usando regex estrito com word boundary)
    providers_patterns = [
        (r'\b(confianca|zogheib)\b', "Supermercados Confiança", "Refeição"),
        (r'\bamericanas\b', "Lojas Americanas", "Outros"),
        (r'\bkalunga\b', "Kalunga", "Outros"),
        (r'\b(posto\s+ipiranga|ipiranga)\b', "Posto Ipiranga", "Combustível"),
        (r'\b(posto\s+shell|shell\s+box|\bshell\b)', "Posto Shell", "Combustível"),
        (r'\b(posto\s+petrobras|petrobras|br\s+mania)\b', "Posto Petrobras", "Combustível"),
        (r'\bcarrefour\b', "Carrefour", "Refeição"),
        (r'\b(pao\s+de\s+acucar|pão\s+de\s+açúcar|pao\s+de\s+açucar)\b', "Pão de Açúcar", "Refeição"),
        (r'\b(extra\s+supermercado|extra\s+hipermercado|supermercados?\s+extra)\b', "Extra Supermercados", "Refeição"),
        (r'\b(assai|assaí)(\s+atacadista)?\b', "Assaí Atacadista", "Refeição"),
        (r'\b(atacadao|atacadão)\b', "Atacadão", "Refeição"),
        (r'\b(uber\s*rides|uber\s*do\s*brasil|uber\s*trip|uber\s*eats|\buber\b)\b', "Uber", "Despesas de Viagem"),
        (r'\b(99\s*app|99app|99\s*tecnologia|99\s*t[aá]xi|99\s*pop|99\s*pay|99\s*motorista|99\s*corrida|app\s*99)\b', "99", "Despesas de Viagem"),
        (r'\b(mcdonalds?|mc\s*donalds?)\b', "McDonald's", "Refeição"),
        (r'\boutback(\s+steakhouse)?\b', "Outback Steakhouse", "Refeição"),
        (r'\bsubway\b', "Subway", "Refeição"),
        (r'\bburger\s*king\b', "Burger King", "Refeição"),
        (r'\b(habibs|habib\'s)\b', "Habib's", "Refeição"),
    ]

    for pat, name, cat in providers_patterns:
        if re.search(pat, combined_search_text, re.IGNORECASE):
            provider = name
            category = cat
            break

    # Se não encontrado no mapa de provedores específicos:
    # 4a. Tentar localizar CNPJ do cupom e verificar se bate com algum credor cadastrado
    if not provider:
        cnpj_match = re.search(r'\b\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b', text_extracted)
        if not cnpj_match and qr_text:
            cnpj_match = re.search(r'\b\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b', qr_text)

        if cnpj_match:
            raw_cnpj = re.sub(r'\D', '', cnpj_match.group(0))
            try:
                import json
                for cred_path in ["creditors.json", "static/data/creditors.json", "static/data/creditors.js"]:
                    if os.path.exists(cred_path):
                        with open(cred_path, "r", encoding="utf-8") as f:
                            content = f.read()
                            if cred_path.endswith(".js"):
                                content = content.replace("window.siengeCreditors =", "").strip()
                                if content.endswith(";"):
                                    content = content[:-1].strip()
                            cred_list = json.loads(content)
                            for cred in cred_list:
                                c_cnpj = re.sub(r'\D', '', cred.get("cnpj") or "")
                                if c_cnpj and c_cnpj == raw_cnpj:
                                    provider = cred.get("tradeName") or cred.get("name") or provider
                                    break
                    if provider:
                        break
            except Exception:
                pass

    # 4b. Se não encontrado em credores, extrai o nome comercial diretamente das primeiras linhas do cabeçalho da nota (OCR)
    if not provider and ocr_lines:
        ignore_header_pattern = re.compile(
            r'\b(DOCUMENTO|AUXILIAR|NOTA\s+FISCAL|CONSUMIDOR|DANFE|NFC-?E|NFCE|NF-?E|NFE|CF-?E|CFE|SAT|EXTRATO|EMITIDA|CONTING[EÊ]NCIA|PENDENTE|AUTORIZA[CÇ][AÃ]O|CNPJ|INSCRI[CÇ][AÃ]O|ESTADUAL|IE|IM|RUA|AV|AVENIDA|RODOVIA|ALAMEDA|PRA[CÇ]A|BAIRRO|CENTRO|FONE|TEL|TELEFONE|CEP|ITEM|C[OÓ]DIGO|QTDE?|UN|VL|VALOR|TOTAL|SUBTOTAL|PAGAMENTO|TROCO|CART[AÃ]O|CHAVE\s+DE\s+ACESSO|CONSULTE|PROTOCOLO|TRIBUTOS|IBPT|PROCON|SEQ|DESCRITMO|DESCRICAO|DESCONTO)\b',
            re.IGNORECASE
        )
        for l in ocr_lines[:10]:
            l_clean = l.strip()
            if len(l_clean) < 3 or re.match(r'^[\d\s\.\,\-\/\:\;]+$', l_clean) or re.match(r'^\d{5,}', l_clean):
                continue
            if ignore_header_pattern.search(l_clean):
                continue
            words = l_clean.split()
            clean_words = []
            for w in words:
                w_low = w.lower()
                if len(w_low) <= 3 and w_low in ['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'na', 'no', 'ltda', 's/a', 's.a.', 'me', 'epp', 'eireli']:
                    clean_words.append('Ltda' if w_low == 'ltda' else ('S/A' if w_low in ['s/a', 's.a.'] else ('ME' if w_low == 'me' else ('EPP' if w_low == 'epp' else ('Eireli' if w_low == 'eireli' else w_low)))))
                else:
                    clean_words.append(w.capitalize())
            candidate = " ".join(clean_words)
            if len(candidate) >= 3:
                provider = candidate
                break

    # 5. Extração da Data (Formato DD/MM/YYYY ou YYYY-MM-DD)
    search_full_text = text_extracted + "\n" + (qr_text or "") + "\n" + filename
    if not date_str:
        date_patterns = [
            r'(?:emiss[ãa]o|data|autoriza[çc][ãa]o|dt\.?|loja|pdv|cupom)?[:\s]*\b(\d{2})[/.-](\d{2})[/.-](20\d{2}|\d{2})\b',
            r'\b(20\d{2})[-/.](\d{2})[-/.](0[1-9]|[12]\d|3[01])\b'
        ]
        for pat in date_patterns:
            matches = re.findall(pat, search_full_text, re.IGNORECASE)
            for m in matches:
                if len(m) == 3:
                    if len(m[0]) == 4:
                        y, m_m, d = m
                    else:
                        d, m_m, y = m
                    day, month = int(d), int(m_m)
                    if 1 <= day <= 31 and 1 <= month <= 12:
                        year = y if len(y) == 4 else '20' + y
                        date_str = f"{year}-{month:02d}-{day:02d}"
                        break
            if date_str:
                break

    # 6. Extração Inteligente do Valor Total da Nota
    if not amount_val:
        search_clean = search_full_text.replace('\r', '')
        
        # Prioridade 1: Valor Líquido / Valor a Pagar
        p1 = r'(?:VALOR\s*A\s*PAGAR|VALOR\s*À\s*PAGAR|VALORA\s*PAGAR|VALORAPAGAR|VALOR\s*PAGO|VALOR\s*LIQUIDO|VALOR\s*LÍQUIDO)[\s\n:]*(?:R\$)?[\s\n]*(\d+(?:[.,]\d{3})*[.,]\d{2})'
        m1 = re.findall(p1, search_clean, re.IGNORECASE)
        for val_s in m1:
            clean = val_s.replace('.', '').replace(',', '.') if ',' in val_s else val_s
            try:
                v = float(clean)
                if v > 0:
                    amount_val = v
                    break
            except ValueError: pass

    if not amount_val:
        # Prioridade 2: Valor Total Bruto / Total (R$)
        p2 = r'(?:VALOR\s*TOTAL|VALORTOTAL|VLTOTAL|TOTAL\s*R\$|TOTAL\s*\(R\$\)|TOTAL\s*GERAL)[\s\n:]*(?:R\$)?[\s\n]*(\d+(?:[.,]\d{3})*[.,]\d{2})'
        m2 = re.findall(p2, search_clean, re.IGNORECASE)
        for val_s in m2:
            clean = val_s.replace('.', '').replace(',', '.') if ',' in val_s else val_s
            try:
                v = float(clean)
                if v > 0:
                    amount_val = v
                    break
            except ValueError: pass

    if not amount_val:
        # Prioridade 3: Pagamento com cartão / Pix / Total:
        p3 = r'(?:CARTAO|CRÉDITO|CREDITO|DEBITO|DÉBITO|PIX|MONEY|TOTAL)[\s\n:]*(?:R\$)?[\s\n]*(\d+(?:[.,]\d{3})*[.,]\d{2})'
        m3 = re.findall(p3, search_clean, re.IGNORECASE)
        for val_s in m3:
            clean = val_s.replace('.', '').replace(',', '.') if ',' in val_s else val_s
            try:
                v = float(clean)
                if v > 0:
                    amount_val = v
                    break
            except ValueError: pass

    if not amount_val:
        # Prioridade 4: Busca de baixo para cima (evitando cabeçalho/itens e impostos)
        bottom_lines = [l.strip() for l in search_clean.split('\n') if l.strip()]
        amounts_found = []
        for l in reversed(bottom_lines):
            if any(w in l.upper() for w in ['TRIB', 'IBPT', 'CHAVE', 'CNPJ', 'IE:']):
                continue
            matches = re.findall(r'(?:R\$\s*)?(\d+(?:[.,]\d{3})*[.,]\d{2})', l)
            for m in matches:
                clean = m.replace('.', '').replace(',', '.') if ',' in m else m
                try:
                    v = float(clean)
                    if 0.5 <= v <= 100000:
                        amounts_found.append(v)
                except ValueError: pass
            if amounts_found:
                amount_val = max(amounts_found)
                break

    # Categoria sugerida
    if category == "Outros":
        comb_lower = combined_search_text
        if any(w in comb_lower for w in ["refeicao", "refeição", "restaurante", "padaria", "supermercado", "alimento", "coca", "lanche", "snack", "fandangos", "crocantissimo", "crocantíssimo", "salgadinho", "biscoito", "chocolate", "almoço", "almoco", "jantar", "food", "confianca", "zogheib", "pizzaria", "hamburguer", "burger", "sanduiche", "sanduíche", "bebida", "suco", "agua", "água", "cafe", "café", "marmita", "refeicoes", "refeições"]):
            category = "Refeição"
        elif any(w in comb_lower for w in ["posto", "combustivel", "combustível", "gasolina", "etanol", "diesel", "litros", "abastecimento", "lubrificante", "ipiranga", "shell", "petrobras"]):
            category = "Combustível"
        elif any(w in comb_lower for w in ["hotel", "pousada", "hospedagem", "diaria", "diária", "flat", "resort", "ibis", "novotel", "accor"]):
            category = "Hotel"
        elif re.search(r'\b(uber|99\s*app|99app|99\s*pop|99\s*t[aá]xi|táxi|taxi|estacionamento|pedagio|pedágio|viagem|passagem|voo|aereo|aéreo|rodoviaria|rodoviária)\b', comb_lower):
            category = "Despesas de Viagem"

    # Fallbacks se ainda não determinado
    if not provider:
        provider = "Estabelecimento Comercial"
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    if not amount_val:
        amount_val = 0.0

    return {
        "provider": provider,
        "date": date_str,
        "amount": round(amount_val, 2),
        "category_suggestion": category
    }


@router.post("/{expense_id}/send-sienge")
def send_expense_to_sienge(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem enviar despesas para o Sienge.")

    exp = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(404, "Despesa não encontrada.")

    if exp.status != models.ExpenseStatus.finalizado:
        raise HTTPException(400, "A despesa precisa estar finalizada para ser enviada ao Sienge.")

    try:
        from services.sienge_service import process_sienge_bill_for_user_expenses
        res = process_sienge_bill_for_user_expenses(exp.user, [exp], current_user, db)
        due_fmt = res.get("due_date_formatted") or res.get("due_date")
        due_msg = f" (Vencimento: {due_fmt})" if due_fmt else ""
        return {
            "ok": True,
            "success": True,
            "title_number": res["bill_id"],
            "message": f"Título nº {res['bill_id']} ({res['document_number']}) gerado com sucesso no Sienge{due_msg}.",
            "expense": _expense_out(exp),
            "details": res
        }
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    except Exception as exc:
        raise HTTPException(502, f"Erro na integração Sienge: {exc}")


@router.post("/bulk-send-sienge")
def bulk_send_sienge(
    body: dict,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem enviar despesas para o Sienge.")
    
    expense_ids = body.get("expense_ids", [])
    if not expense_ids:
        raise HTTPException(400, "Nenhuma despesa selecionada.")

    expenses = db.query(models.Expense).filter(models.Expense.id.in_(expense_ids)).all()
    if not expenses:
        raise HTTPException(404, "Nenhuma despesa encontrada.")

    # 1. Validar se todas as despesas estão finalizadas
    non_finalized = [e for e in expenses if e.status != models.ExpenseStatus.finalizado]
    if non_finalized:
        ids_str = ", ".join(f"#{e.id}" for e in non_finalized)
        raise HTTPException(400, f"Todas as despesas selecionadas devem estar com o status FINALIZADO. Despesas não finalizadas: {ids_str}.")

    # 2. Pré-validar colaboradores e contas financeiras de todas as despesas
    for exp in expenses:
        if not exp.user:
            raise HTTPException(400, f"A despesa #{exp.id} não possui colaborador associado.")
        if not exp.user.creditor_code:
            raise HTTPException(400, f"O colaborador {exp.user.name} ({exp.user.email}) não possui código de credor Sienge configurado.")
        if not exp.category or not exp.category.sienge_apportionment_id:
            cat_name = exp.category.name if exp.category else f"ID #{exp.category_id}"
            raise HTTPException(400, f"A categoria '{cat_name}' (despesa #{exp.id}) não possui conta financeira Sienge configurada.")

    # 3. Agrupar por (user_id, company_id) para garantir 'um título por empresa por colaborador'
    try:
        from services.sienge_service import process_sienge_bill_for_user_expenses, get_company_id_for_cost_center
    except Exception as e:
        logger.error(f"[bulk_send_sienge] Erro ao carregar serviço do Sienge: {e}", exc_info=True)
        raise HTTPException(502, f"Erro ao inicializar serviço do Sienge: {e}")

    custom_due_date = body.get("due_date")

    try:
        groups = {}
        for exp in expenses:
            cc_code = str(exp.cost_center.code if exp.cost_center else exp.cost_center_id).strip()
            comp_id = get_company_id_for_cost_center(cc_code, db=db)
            key = (exp.user_id, comp_id)
            groups.setdefault(key, []).append(exp)

        created_titles = []
        errors = []

        for (u_id, comp_id), u_expenses in groups.items():
            user = u_expenses[0].user
            try:
                res = process_sienge_bill_for_user_expenses(user, u_expenses, current_user, db, custom_due_date=custom_due_date)
                created_titles.append(res)
            except Exception as exc:
                logger.error(f"[bulk_send_sienge] Erro para colaborador {user.name}: {exc}", exc_info=True)
                errors.append(f"Colaborador {user.name}: {exc}")

        if errors and not created_titles:
            raise HTTPException(502, f"Falha ao gerar títulos no Sienge: {'; '.join(errors)}")

        bill_ids_str = ", ".join(t["bill_id"] for t in created_titles)
        msg = f"{len(created_titles)} título(s) gerado(s) com sucesso no Sienge (Nº {bill_ids_str}) para {len(expenses)} despesa(s)."
        if errors:
            msg += f" Porém, ocorreram erros em alguns grupos: {'; '.join(errors)}"

        return {
            "ok": True,
            "success": True,
            "title_number": bill_ids_str,
            "titles": created_titles,
            "errors": errors if errors else None,
            "message": msg
        }
    except HTTPException:
        raise
    except Exception as err:
        logger.error(f"[bulk_send_sienge] Erro inesperado: {err}", exc_info=True)
        raise HTTPException(502, f"Erro ao processar integração com o Sienge: {err}")


@router.post("/{expense_id}/pay-sienge")
def pay_expense_sienge(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem registrar baixa de pagamento.")

    exp = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(404, "Despesa não encontrada.")

    exp.status = models.ExpenseStatus.pago
    exp.paid_at = datetime.utcnow()
    exp.paid_by = current_user.id

    audit = models.AuditLog(
        action="PAY_EXPENSE_SIENGE",
        target_email=exp.user.email if exp.user else None,
        admin_id=current_user.id,
        admin_name=current_user.name,
        status="sucesso",
        details=f"Baixa de pagamento registrada para a despesa #{exp.id}"
    )
    db.add(audit)
    db.commit()
    db.refresh(exp)

    return {
        "success": True,
        "message": "Baixa de pagamento registrada com sucesso!",
        "expense": _expense_out(exp)
    }


@router.post("/{expense_id}/check-sienge-payment")
def check_expense_sienge_payment(
    expense_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada.")
    if not _can_view(expense, current_user):
        raise HTTPException(403, "Acesso negado.")

    from services.sienge_service import sync_expense_sienge_payment
    result = sync_expense_sienge_payment(expense, db, current_user=current_user)
    result["expense"] = _expense_out(expense)
    return result


@router.post("/sync-sienge-payments")
def sync_all_sienge_payments_route(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem sincronizar pagamentos com o Sienge.")

    from services.sienge_service import sync_all_pending_sienge_payments
    return sync_all_pending_sienge_payments(db, current_user=current_user)




