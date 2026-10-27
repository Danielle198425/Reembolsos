import os
import json
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db
import models, schemas, auth
from pdf_generator import generate_export_pdf
from email_service import send_report_email

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("")
def list_exports(
    scope: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(models.Export)

    # Controle de acesso e escopo:
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro, models.UserRole.aprovador]:
        # Usuário comum: vê relatórios gerados por ele OU contendo suas despesas
        uid_str = f"%{current_user.id}%"
        q = q.filter(
            (models.Export.created_by == current_user.id) |
            (models.Export.target_user_id == current_user.id) |
            (models.Export.expense_user_ids.like(uid_str))
        )
    elif scope in ["personal", "pessoal"]:
        q = q.filter(
            (models.Export.target_user_id == current_user.id) |
            ((models.Export.target_user_id.is_(None)) & (models.Export.created_by == current_user.id))
        )
    elif scope in ["team", "time"]:
        q = q.filter(
            (models.Export.target_user_id != current_user.id) |
            ((models.Export.target_user_id.is_(None)) & (models.Export.created_by != current_user.id))
        )

    q = q.order_by(models.Export.created_at.desc())
    total = q.count()
    exports = q.offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": [_export_dict(e) for e in exports]
    }


@router.post("", status_code=201)
def create_export(
    body: schemas.ExportCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem executar relatórios.")

    # Busca despesas com filtros
    q = db.query(models.Expense).options(
        joinedload(models.Expense.cost_center).joinedload(models.CostCenter.company),
        joinedload(models.Expense.user)
    )
    if body.expense_ids:
        q = q.filter(models.Expense.id.in_(body.expense_ids))
        q = q.filter(models.Expense.status != models.ExpenseStatus.rejeitado)
    else:
        if body.date_from:
            q = q.filter(models.Expense.expense_date >= body.date_from)
        if body.date_to:
            q = q.filter(models.Expense.expense_date <= body.date_to)
        if body.status_filter:
            statuses = body.status_filter.split(",")
            q = q.filter(models.Expense.status.in_(statuses))
        else:
            q = q.filter(models.Expense.status.in_([models.ExpenseStatus.aprovado, models.ExpenseStatus.aguardando_finalizacao, models.ExpenseStatus.finalizado]))

    sort_key = getattr(body, 'sort_by', None) or 'category'
    if sort_key not in ["date", "cost_center", "category"]:
        sort_key = "category"

    if sort_key == "cost_center":
        q = q.join(models.CostCenter, models.Expense.cost_center_id == models.CostCenter.id, isouter=True)\
             .order_by(models.CostCenter.code.asc(), models.Expense.expense_date.asc())
    elif sort_key == "category":
        q = q.join(models.Category, models.Expense.category_id == models.Category.id, isouter=True)\
             .order_by(models.Category.name.asc(), models.Expense.expense_date.asc())
    else:
        q = q.order_by(models.Expense.expense_date.asc(), models.Expense.id.asc())

    expenses = q.all()

    # Alterar automaticamente o status das despesas para finalizado ao executar o relatório
    from datetime import datetime
    now_utc = datetime.utcnow()
    for exp in expenses:
        exp.status = models.ExpenseStatus.finalizado
        if not exp.finalized_at:
            exp.finalized_at = now_utc
        if not exp.finalized_by:
            exp.finalized_by = current_user.id

    if not expenses:
        # Nenhum registro encontrado, gerar relatório vazio padrão
        os.makedirs("exports", exist_ok=True)
        timestamp = int(now_utc.timestamp())
        filename = f"exports/exportacao_{timestamp}.pdf"
        generate_export_pdf(expenses, body.name, filename, generator_name=current_user.name, view_mode=sort_key)
        export = models.Export(
            name=body.name,
            created_by=current_user.id,
            target_user_id=None,
            expense_user_ids=None,
            export_type="Padrão",
            file_path=filename,
        )
        db.add(export)
        db.commit()
        db.refresh(export)
        res = _export_dict(export)
        res["exports"] = [_export_dict(export)]
        res["count"] = 1
        return res

    # Obter empresa padrão Moura Leite caso algum centro de custo não tenha empresa explicitamente vinculada
    ml_comp = db.query(models.Company).filter(models.Company.code == '1').first()
    if not ml_comp:
        ml_comp = db.query(models.Company).filter(models.Company.name.ilike('%MOURA LEITE DESENVOLVIMENTO%')).first()
    default_comp_name = ml_comp.name if ml_comp else "MOURA LEITE DESENVOLVIMENTO E URBANIZAÇÃO LTDA"

    from collections import OrderedDict
    is_mass = (getattr(body, 'export_mode', None) == "massa")

    # Obter mês atual em português (independente da data da despesa)
    MONTHS_PT = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
    }
    now_local = datetime.now()
    default_month_str = f"{MONTHS_PT[now_local.month]} de {now_local.year}"

    os.makedirs("exports", exist_ok=True)
    timestamp = int(now_utc.timestamp())
    created_exports = []

    if is_mass:
        # Extrai o sufixo de mês/ano informado no campo do formulário
        month_year_suffix = default_month_str
        raw_name = (body.name or "").strip()
        if " - " in raw_name:
            parts = raw_name.split(" - ", 1)
            if parts[1].strip():
                month_year_suffix = parts[1].strip()
        elif raw_name and not any(ph in raw_name for ph in ["[Nome", "Usuário", "{"]):
            month_year_suffix = raw_name

        # Agrupar por usuário e, dentro de cada usuário, por empresa
        user_groups = OrderedDict()
        for exp in expenses:
            uid = exp.user_id or 0
            u = exp.user
            u_name = u.name if u else "Usuário"
            if uid not in user_groups:
                user_groups[uid] = {
                    "user": u,
                    "user_name": u_name,
                    "companies": OrderedDict()
                }

            comp = exp.cost_center.company if (exp.cost_center and exp.cost_center.company) else None
            if comp:
                c_key = f"comp_{comp.id}"
                c_name = comp.name
            else:
                c_key = f"comp_{ml_comp.id}" if ml_comp else "comp_default"
                c_name = default_comp_name

            if c_key not in user_groups[uid]["companies"]:
                user_groups[uid]["companies"][c_key] = {
                    "company_name": c_name,
                    "company": comp,
                    "expenses": []
                }
            user_groups[uid]["companies"][c_key]["expenses"].append(exp)

        file_idx = 1
        for uid, u_data in user_groups.items():
            u_name = u_data["user_name"]
            user_comps = u_data["companies"]

            # Nome base do relatório do usuário: Nome do Usuário - Mês e Ano
            base_user_report = f"{u_name} - {month_year_suffix}"

            for c_key, c_data in user_comps.items():
                g_expenses = c_data["expenses"]
                g_comp_name = c_data["company_name"]

                # Sempre inclui o nome da empresa no relatório para padronização e identificação visual na tela
                export_record_name = f"{base_user_report} - {g_comp_name}"

                filename = f"exports/exportacao_{timestamp}_{file_idx}.pdf"
                file_idx += 1

                generate_export_pdf(
                    g_expenses,
                    base_user_report,
                    filename,
                    generator_name=current_user.name,
                    company_name=g_comp_name,
                    view_mode=sort_key
                )

                export = models.Export(
                    name=export_record_name,
                    created_by=current_user.id,
                    target_user_id=uid if uid else None,
                    expense_user_ids=json.dumps([uid]) if uid else None,
                    export_type="Massa",
                    file_path=filename,
                )
                db.add(export)
                db.commit()
                db.refresh(export)

                for exp in g_expenses:
                    exp.export_id = export.id
                db.commit()

                created_exports.append(export)
    else:
        # Modo Individual: agrupa apenas por empresa mantendo o nome fornecido
        groups = OrderedDict()
        for exp in expenses:
            comp = exp.cost_center.company if (exp.cost_center and exp.cost_center.company) else None
            if comp:
                c_key = f"comp_{comp.id}"
                c_name = comp.name
            else:
                c_key = f"comp_{ml_comp.id}" if ml_comp else "comp_default"
                c_name = default_comp_name

            if c_key not in groups:
                groups[c_key] = {
                    "company_name": c_name,
                    "company": comp,
                    "expenses": []
                }
            groups[c_key]["expenses"].append(exp)

        multiple_groups = len(groups) > 1
        for idx, (group_key, g_data) in enumerate(groups.items(), start=1):
            g_expenses = g_data["expenses"]
            g_comp_name = g_data["company_name"]

            exp_user_ids = list(set([exp.user_id for exp in g_expenses if getattr(exp, 'user_id', None)]))
            target_uid = exp_user_ids[0] if exp_user_ids else None

            if multiple_groups:
                export_record_name = f"{body.name} - {g_comp_name}"
                filename = f"exports/exportacao_{timestamp}_{idx}.pdf"
            else:
                if g_comp_name and g_comp_name.lower() not in body.name.lower():
                    export_record_name = f"{body.name} - {g_comp_name}"
                else:
                    export_record_name = body.name
                filename = f"exports/exportacao_{timestamp}.pdf"

            generate_export_pdf(
                g_expenses,
                body.name,
                filename,
                generator_name=current_user.name,
                company_name=g_comp_name,
                view_mode=sort_key
            )

            export = models.Export(
                name=export_record_name,
                created_by=current_user.id,
                target_user_id=target_uid,
                expense_user_ids=json.dumps(exp_user_ids) if exp_user_ids else None,
                export_type="Padrão",
                file_path=filename,
            )
            db.add(export)
            db.commit()
            db.refresh(export)

            for exp in g_expenses:
                exp.export_id = export.id
            db.commit()

            created_exports.append(export)

    res = _export_dict(created_exports[0])
    res["exports"] = [_export_dict(e) for e in created_exports]
    res["count"] = len(created_exports)
    return res


@router.get("/{export_id}/download")
def download_export(
    export_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    export = db.query(models.Export).filter(models.Export.id == export_id).first()
    if not export:
        raise HTTPException(404, "Exportação não encontrada")
    if not export.file_path or not os.path.exists(export.file_path):
        raise HTTPException(404, "Arquivo não encontrado")

    # Verificar permissão para usuário comum
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro, models.UserRole.aprovador]:
        is_creator = export.created_by == current_user.id
        is_target = getattr(export, 'target_user_id', None) == current_user.id
        is_in_list = False
        if getattr(export, 'expense_user_ids', None):
            try:
                uids = json.loads(export.expense_user_ids)
                is_in_list = current_user.id in uids
            except Exception:
                is_in_list = str(current_user.id) in (export.expense_user_ids or "")
        if not (is_creator or is_target or is_in_list):
            raise HTTPException(403, "Acesso negado para este relatório")

    return FileResponse(
        export.file_path,
        media_type="application/pdf",
        filename=f"{export.name}.pdf"
    )


@router.delete("/{export_id}", status_code=204)
def delete_export(
    export_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    export = db.query(models.Export).filter(models.Export.id == export_id).first()
    if not export:
        raise HTTPException(404, "Exportação não encontrada")
    if export.file_path and os.path.exists(export.file_path):
        os.remove(export.file_path)
    db.delete(export)
    db.commit()


@router.post("/{export_id}/send-email")
def send_export_email(
    export_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem enviar relatórios por e-mail.")

    export = db.query(models.Export).filter(models.Export.id == export_id).first()
    if not export:
        raise HTTPException(404, "Exportação não encontrada")

    target_user = getattr(export, 'target_user', None)
    if not target_user and getattr(export, 'target_user_id', None):
        target_user = db.query(models.User).filter(models.User.id == export.target_user_id).first()
    if not target_user:
        target_user = export.creator

    if not target_user or not target_user.email:
        raise HTTPException(400, "Usuário destinatário ou e-mail não encontrado para este relatório.")

    from datetime import datetime as dt_cls
    ref_dt = export.created_at or dt_cls.utcnow()
    exp_year = ref_dt.year
    exp_month = ref_dt.month

    sched = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.year == exp_year,
        models.PaymentSchedule.month == exp_month
    ).first()

    if sched and sched.payment_date:
        fmt_date = sched.payment_date.strftime('%d/%m/%Y')
        payment_info_text = f"O pagamento será realizado no dia {fmt_date}."
    else:
        fmt_date = "em breve"
        payment_info_text = "O pagamento será realizado em breve."

    fmt_approval = sched.approval_date.strftime('%d/%m/%Y') if (sched and sched.approval_date) else ""
    fmt_closing = sched.closing_date.strftime('%d/%m/%Y') if (sched and sched.closing_date) else ""

    tmpl = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == "payment_date").first()
    if tmpl:
        email_title = tmpl.subject.replace("{nome_usuario}", target_user.name or "")\
                                  .replace("{nome_relatorio}", export.name or "")\
                                  .replace("{data_pagamento}", fmt_date)\
                                  .replace("{data_fechamento}", fmt_closing)\
                                  .replace("{data_aprovação}", fmt_approval)\
                                  .replace("{data_aprovacao}", fmt_approval)\
                                  .replace("{mes_ano}", f"{exp_month:02d}/{exp_year}")
        email_body = tmpl.body.replace("{nome_usuario}", target_user.name or "")\
                              .replace("{nome_relatorio}", export.name or "")\
                              .replace("{data_pagamento}", fmt_date)\
                              .replace("{data_fechamento}", fmt_closing)\
                              .replace("{data_aprovação}", fmt_approval)\
                              .replace("{data_aprovacao}", fmt_approval)\
                              .replace("{mes_ano}", f"{exp_month:02d}/{exp_year}")
    else:
        email_title = f"Reembolso ({export.name})"
        email_body = (
            f"Olá {target_user.name},\n\n"
            f"Segue relatório de reembolso de despesas para sua conferência.\n"
            f"{payment_info_text}\n\n"
            f"Nos avise qualquer divergência.\n\n"
            f"Atenciosamente,\n"
            f"Moura Leite Loteamentos"
        )

    send_report_email(
        user_name=target_user.name,
        user_email=target_user.email,
        report_name=export.name,
        pdf_path=export.file_path,
        payment_info_text=payment_info_text,
        custom_subject=email_title,
        custom_body=email_body
    )


    audit = models.AuditLog(
        action="EMAIL_REPORT",
        target_email=target_user.email,
        admin_id=current_user.id,
        admin_name=current_user.name,
        status="sucesso",
        details=f"Relatório '{export.name}' enviado para {target_user.email}"
    )
    db.add(audit)

    # Marcar email_sent = True nas despesas vinculadas a este export e no próprio export
    export.email_sent = True
    export.email_sent_at = dt_cls.utcnow()

    linked_expenses = db.query(models.Expense).filter(models.Expense.export_id == export.id).all()
    if not linked_expenses and getattr(export, 'target_user_id', None):
        linked_expenses = db.query(models.Expense).filter(
            models.Expense.user_id == export.target_user_id,
            models.Expense.status == models.ExpenseStatus.finalizado
        ).all()
    for exp in linked_expenses:
        exp.email_sent = True

    db.commit()

    return {
        "success": True,
        "message": f"E-mail com o relatório '{export.name}' enviado com sucesso para {target_user.name} ({target_user.email})!",
        "target_email": target_user.email,
        "title": email_title,
        "body": email_body
    }


@router.post("/bulk-send-emails")
def bulk_send_export_emails(
    body: schemas.BulkExportEmailRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas administradores e financeiro podem enviar relatórios por e-mail.")

    if not body.export_ids:
        raise HTTPException(400, "Nenhum relatório selecionado.")

    exports = db.query(models.Export).filter(models.Export.id.in_(body.export_ids)).all()
    if not exports:
        raise HTTPException(404, "Nenhum relatório encontrado para os IDs fornecidos.")

    from datetime import datetime as dt_cls
    now_utc = dt_cls.utcnow()
    sent_count = 0
    failed_count = 0

    for export in exports:
        target_user = getattr(export, 'target_user', None)
        if not target_user and getattr(export, 'target_user_id', None):
            target_user = db.query(models.User).filter(models.User.id == export.target_user_id).first()
        if not target_user:
            target_user = export.creator

        if not target_user or not target_user.email:
            failed_count += 1
            continue

        ref_dt = export.created_at or now_utc
        sched = db.query(models.PaymentSchedule).filter(
            models.PaymentSchedule.year == ref_dt.year,
            models.PaymentSchedule.month == ref_dt.month
        ).first()

        if sched and sched.payment_date:
            fmt_date = sched.payment_date.strftime('%d/%m/%Y')
            payment_info_text = f"O pagamento será realizado no dia {fmt_date}."
        else:
            fmt_date = "em breve"
            payment_info_text = "O pagamento será realizado em breve."

        fmt_approval = sched.approval_date.strftime('%d/%m/%Y') if (sched and sched.approval_date) else ""
        fmt_closing = sched.closing_date.strftime('%d/%m/%Y') if (sched and sched.closing_date) else ""

        tmpl = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == "payment_date").first()
        if tmpl:
            email_title = tmpl.subject.replace("{nome_usuario}", target_user.name or "")\
                                      .replace("{nome_relatorio}", export.name or "")\
                                      .replace("{data_pagamento}", fmt_date)\
                                      .replace("{data_fechamento}", fmt_closing)\
                                      .replace("{data_aprovação}", fmt_approval)\
                                      .replace("{data_aprovacao}", fmt_approval)\
                                      .replace("{mes_ano}", f"{ref_dt.month:02d}/{ref_dt.year}")
            email_body = tmpl.body.replace("{nome_usuario}", target_user.name or "")\
                                  .replace("{nome_relatorio}", export.name or "")\
                                  .replace("{data_pagamento}", fmt_date)\
                                  .replace("{data_fechamento}", fmt_closing)\
                                  .replace("{data_aprovação}", fmt_approval)\
                                  .replace("{data_aprovacao}", fmt_approval)\
                                  .replace("{mes_ano}", f"{ref_dt.month:02d}/{ref_dt.year}")
        else:
            email_title = f"Reembolso ({export.name})"
            email_body = (
                f"Olá {target_user.name},\n\n"
                f"Segue relatório de reembolso de despesas para sua conferência.\n"
                f"{payment_info_text}\n\n"
                f"Nos avise qualquer divergência.\n\n"
                f"Atenciosamente,\n"
                f"Moura Leite Loteamentos"
            )

        send_report_email(
            user_name=target_user.name,
            user_email=target_user.email,
            report_name=export.name,
            pdf_path=export.file_path,
            payment_info_text=payment_info_text,
            custom_subject=email_title,
            custom_body=email_body
        )


        export.email_sent = True
        export.email_sent_at = now_utc

        linked_expenses = db.query(models.Expense).filter(models.Expense.export_id == export.id).all()
        if not linked_expenses and getattr(export, 'target_user_id', None):
            linked_expenses = db.query(models.Expense).filter(
                models.Expense.user_id == export.target_user_id,
                models.Expense.status == models.ExpenseStatus.finalizado
            ).all()
        for exp in linked_expenses:
            exp.email_sent = True

        audit = models.AuditLog(
            action="EMAIL_REPORT_BULK",
            target_email=target_user.email,
            admin_id=current_user.id,
            admin_name=current_user.name,
            status="sucesso",
            details=f"Relatório '{export.name}' enviado em lote para {target_user.email}"
        )
        db.add(audit)
        sent_count += 1

    db.commit()

    return {
        "success": True,
        "total": len(exports),
        "sent": sent_count,
        "failed": failed_count,
        "message": f"{sent_count} relatório(s) enviado(s) por e-mail com sucesso!"
    }


def _export_dict(e: models.Export) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "created_by": e.created_by,
        "target_user_id": getattr(e, 'target_user_id', None),
        "expense_user_ids": json.loads(e.expense_user_ids) if getattr(e, 'expense_user_ids', None) else [],
        "export_type": e.export_type,
        "file_path": e.file_path,
        "email_sent": bool(getattr(e, 'email_sent', False)),
        "email_sent_at": e.email_sent_at.isoformat() if getattr(e, 'email_sent_at', None) else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "creator_name": e.creator.name if e.creator else "-",
        "creator_email": e.creator.email if e.creator else "-",
        "target_user_name": e.target_user.name if getattr(e, 'target_user', None) else None,
    }
