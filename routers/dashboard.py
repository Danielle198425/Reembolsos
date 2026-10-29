from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, extract
from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(
    scope: str = Query("personal", description="personal, team, financial or all"),
    month: Optional[str] = Query(None, description="Filtro de mês no formato YYYY-MM"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    is_admin_fin = current_user.role in [models.UserRole.admin, models.UserRole.financeiro]
    is_approver = current_user.role == models.UserRole.aprovador

    # Base query
    base = db.query(models.Expense)

    if scope in ["team", "time"] and (is_approver or is_admin_fin):
        # Escopo de equipe: despesas de outros usuários para aprovação
        base = base.filter(models.Expense.user_id != current_user.id)
        if is_approver:
            import json
            rules = []
            if getattr(current_user, 'approver_rules', None):
                try: rules = json.loads(current_user.approver_rules)
                except Exception: pass

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
                    base = base.join(models.User, models.Expense.user_id == models.User.id).filter(or_(*rule_conditions))
                else:
                    base = base.filter(models.Expense.user_id == -1)
            else:
                app_cc_ids = []
                if current_user.approver_of:
                    try: app_cc_ids = json.loads(current_user.approver_of)
                    except Exception: pass
                if not app_cc_ids and current_user.cost_center_id:
                    app_cc_ids = [current_user.cost_center_id]

                app_func_ids = []
                if current_user.approver_of_functions:
                    try: app_func_ids = json.loads(current_user.approver_of_functions)
                    except Exception: pass

                if app_cc_ids or app_func_ids:
                    base = base.join(models.User, models.Expense.user_id == models.User.id)
                    if app_cc_ids:
                        base = base.filter(or_(models.User.cost_center_id.in_(app_cc_ids), models.Expense.cost_center_id.in_(app_cc_ids)))
                    if app_func_ids:
                        base = base.filter(models.User.job_function_id.in_(app_func_ids))
                else:
                    base = base.filter(models.Expense.user_id == -1)

        pending_tasks = base.filter(
            models.Expense.status == models.ExpenseStatus.aguardando_aprovacao
        ).count()
    elif scope in ["all", "financial", "financeiro"] and is_admin_fin:
        # Escopo geral financeiro: visão completa de todas as despesas da empresa
        pending_tasks = base.filter(
            or_(
                models.Expense.status.in_([
                    models.ExpenseStatus.aguardando_aprovacao,
                    models.ExpenseStatus.aguardando_finalizacao
                ]),
                and_(
                    models.Expense.status == models.ExpenseStatus.finalizado,
                    or_(models.Expense.sienge_title == None, models.Expense.sienge_title == '')
                )
            )
        ).count()
    else:
        # Escopo pessoal: despesas rejeitadas que precisam de correção pelo próprio usuário
        scope = "personal"
        base = base.filter(models.Expense.user_id == current_user.id)
        pending_tasks = db.query(models.Expense).filter(
            models.Expense.user_id == current_user.id,
            models.Expense.status == models.ExpenseStatus.rejeitado
        ).count()

    # Filtro opcional por mês (YYYY-MM)
    if month and len(month.strip()) == 7:
        m_clean = month.strip()
        try:
            y_val, m_val = int(m_clean[:4]), int(m_clean[5:7])
            base = base.filter(
                extract('year', models.Expense.expense_date) == y_val,
                extract('month', models.Expense.expense_date) == m_val,
            )
        except ValueError:
            pass

    def total_by_status(status_val):
        result = base.filter(models.Expense.status == status_val).with_entities(
            func.coalesce(func.sum(models.Expense.amount), 0)
        ).scalar()
        return float(result or 0)

    # Expenses by category (top 5)
    cat_query = (
        base.join(models.Category, models.Expense.category_id == models.Category.id)
        .with_entities(
            models.Category.name,
            func.coalesce(func.sum(models.Expense.amount), 0).label("total")
        )
        .group_by(models.Category.name)
        .order_by(func.coalesce(func.sum(models.Expense.amount), 0).desc())
        .limit(5)
        .all()
    )

    expenses_by_category = [
        {"category": row[0], "total": float(row[1])} for row in cat_query
    ]

    # Last 5 expenses
    recent = (
        base.order_by(models.Expense.expense_date.desc(), models.Expense.id.desc())
        .limit(5)
        .all()
    )

    return {
        "total_a_enviar": 0.0,
        "total_aguardando_aprovacao": total_by_status(models.ExpenseStatus.aguardando_aprovacao),
        "total_aguardando_finalizacao": total_by_status(models.ExpenseStatus.aguardando_finalizacao),
        "total_pago": total_by_status(models.ExpenseStatus.pago),
        "pending_tasks": pending_tasks,
        "expenses_by_category": expenses_by_category,
        "recent_expenses": [_expense_dict(e) for e in recent],
        "is_finance_admin": is_admin_fin,
        "is_approver": is_approver,
        "scope": scope,
        "month": month,
    }


@router.get("/notifications")
def get_notifications(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Return recent expense status events as notifications for the current user."""
    notable_statuses = [
        models.ExpenseStatus.aprovado,
        models.ExpenseStatus.rejeitado,
        models.ExpenseStatus.aguardando_finalizacao,
        models.ExpenseStatus.pago,
        models.ExpenseStatus.aguardando_aprovacao,
    ]
    expenses = (
        db.query(models.Expense)
        .filter(
            models.Expense.user_id == current_user.id,
            models.Expense.status.in_(notable_statuses)
        )
        .order_by(models.Expense.updated_at.desc() if hasattr(models.Expense, 'updated_at') else models.Expense.created_at.desc())
        .limit(20)
        .all()
    )

    notifications = []
    for e in expenses:
        status_val = e.status.value if hasattr(e.status, 'value') else str(e.status)
        cat_name = e.category.name if e.category else "Geral"

        dt = getattr(e, 'approved_at', None) or getattr(e, 'updated_at', None) or getattr(e, 'created_at', None)
        if dt:
            formatted_dt = dt.strftime("%d/%m/%Y")
        else:
            formatted_dt = str(e.expense_date)

        approver_name = e.approver.name if e.approver else None
        rejecter_name = e.rejecter.name if getattr(e, 'rejecter', None) else None
        reviewer_name = approver_name or rejecter_name or "Administrador"
        rejection_reason = e.rejection_reason or "Despesa fora da política"

        if status_val == "aprovado":
            title = "✅ Despesa Aprovada"
            message = f"Despesa #{e.id} ({e.description}) aprovada em {formatted_dt} por {reviewer_name}"
        elif status_val == "rejeitado":
            title = "❌ Despesa Reprovada"
            message = f"Despesa #{e.id} ({e.description}) reprovada por {reviewer_name}. Motivo: {rejection_reason}"
        elif status_val == "pago":
            title = "💰 Despesa Paga"
            message = f"Despesa #{e.id} ({e.description}) paga no valor de R$ {e.amount:.2f}"
        elif status_val == "aguardando_finalizacao":
            title = "⏳ Aguardando Finalização"
            message = f"Despesa #{e.id} ({cat_name}) aguardando finalização financeira"
        else:
            title = "🔄 Aguardando Aprovação"
            message = f"Despesa #{e.id} ({e.description}) enviada em {formatted_dt} e aguardando aprovação"

        notifications.append({
            "id": e.id,
            "expense_id": e.id,
            "title": title,
            "message": message,
            "status": status_val,
            "date": formatted_dt,
            "timestamp": (dt.isoformat() + "Z") if dt else None,
        })

    # Notificações de relatórios de exportação gerados para o usuário
    uid_str = f"%{current_user.id}%"
    exports = (
        db.query(models.Export)
        .filter(
            (models.Export.target_user_id == current_user.id) |
            (models.Export.expense_user_ids.like(uid_str))
        )
        .order_by(models.Export.created_at.desc())
        .limit(10)
        .all()
    )

    for ex in exports:
        dt = ex.created_at
        formatted_dt = dt.strftime("%d/%m/%Y") if dt else ""
        notifications.append({
            "id": f"export_{ex.id}",
            "expense_id": None,
            "title": "📄 Relatório de Reembolso Gerado",
            "message": f"Foi gerado o seu relatório de reembolso do mês ({ex.name}).",
            "status": "finalizado",
            "date": formatted_dt,
            "timestamp": (dt.isoformat() + "Z") if dt else None,
        })

    return notifications


def _expense_dict(e: models.Expense):
    return {
        "id": e.id,
        "description": e.description,
        "amount": e.amount,
        "expense_date": str(e.expense_date),
        "status": e.status.value if hasattr(e.status, 'value') else e.status,
        "user_name": e.user.name if e.user else "-",
        "category_name": e.category.name if e.category else "-",
        "cost_center": f"{e.cost_center.code} | {e.cost_center.name}" if e.cost_center else "-",
    }



def _expense_dict(e: models.Expense):
    return {
        "id": e.id,
        "description": e.description,
        "amount": e.amount,
        "expense_date": str(e.expense_date),
        "status": e.status.value if hasattr(e.status, 'value') else e.status,
        "user_name": e.user.name if e.user else "-",
        "category_name": e.category.name if e.category else "-",
        "cost_center": f"{e.cost_center.code} | {e.cost_center.name}" if e.cost_center else "-",
    }
