import os
import html
from io import BytesIO
from datetime import datetime
from typing import Optional, List, Dict, Tuple
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image as RLImage
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Moura Leite brand colors (Verde Padrão Moura Leite)
ML_DARK = colors.HexColor("#166534")        # Verde escuro para cabeçalhos de tabela
ML_GREEN = colors.HexColor("#15803D")       # Verde oficial marca Moura Leite
ML_LIGHT_GREEN = colors.HexColor("#F0FDF4") # Verde claro para fundos e totalizadores
ML_GRAY = colors.HexColor("#4B5563")        # Cinza texto
ML_LIGHT_GRAY = colors.HexColor("#F3F4F6")  # Cinza claro para linhas alternadas
ML_RED = colors.HexColor("#EF4444")         # Vermelho para reprovação

STATUS_LABELS = {
    "rascunho": "Rascunho",
    "a_enviar": "A Enviar",
    "aguardando_aprovacao": "Aguardando Aprovação",
    "aprovado": "Aprovado",
    "rejeitado": "Rejeitado",
    "aguardando_finalizacao": "Aguardando Finalização",
    "finalizado": "Finalizado",
    "pago": "Pago",
}


_sienge_plans_cache = None

def _get_sienge_plans_map():
    global _sienge_plans_cache
    if _sienge_plans_cache is not None:
        return _sienge_plans_cache
    pm = {}
    try:
        from routers.sienge import get_financial_plans
        plans = get_financial_plans()
        for p in plans:
            pid = str(p.get("id") or p.get("code") or "")
            pname = p.get("name") or p.get("description") or ""
            if pid:
                pm[pid] = pname
    except Exception:
        pass
    _sienge_plans_cache = pm
    return pm

def format_apportionment_code(code_str: str) -> str:
    if not code_str:
        return ""
    c = str(code_str).strip()
    if c.isdigit() and len(c) == 7:
        return f"{c[0]}.{c[1:3]}.{c[3:5]}.{c[5:7]}"
    return c

def get_effective_apportionment(expense, db=None) -> Optional[str]:
    """
    Verifica se existe uma regra de 'Alteração na categoria' (CategoryOverrideRule)
    para o departamento do colaborador, categoria e centro de custo da despesa.
    Retorna o sienge_apportionment_id alterado ou o padrão da categoria.
    """
    if not expense:
        return None
    cat = getattr(expense, 'category', None)
    default_app = getattr(cat, 'sienge_apportionment_id', None) if cat else None

    user_dept_id = None
    u = getattr(expense, 'user', None)
    if u and getattr(u, 'cost_center_id', None) is not None:
        try:
            user_dept_id = int(u.cost_center_id)
        except (ValueError, TypeError):
            pass

    cat_id = getattr(expense, 'category_id', None) or (cat.id if cat else None)

    cc = getattr(expense, 'cost_center', None)
    cc_code = str(cc.code).strip() if (cc and getattr(cc, 'code', None)) else ""
    cc_id = str(getattr(expense, 'cost_center_id', '') or '').strip()

    if not user_dept_id or not cat_id or (not cc_code and not cc_id):
        return default_app

    try:
        import json
        from database import SessionLocal
        import models
        close_db = False
        if db is None:
            db_session = SessionLocal()
            close_db = True
        else:
            db_session = db

        rules = db_session.query(models.CategoryOverrideRule).filter(
            models.CategoryOverrideRule.active == True,
            models.CategoryOverrideRule.department_id == user_dept_id
        ).all()

        matching_app = None
        for r in rules:
            # 1. Verificar categoria
            cat_match = False
            if r.category_ids:
                try:
                    c_ids = json.loads(r.category_ids)
                    if "*" in c_ids or "all" in c_ids:
                        cat_match = True
                    elif cat_id in c_ids or str(cat_id) in [str(x) for x in c_ids]:
                        cat_match = True
                except Exception:
                    pass
            elif r.category_id is not None:
                cat_match = (r.category_id == cat_id)

            if not cat_match:
                continue

            # 2. Verificar centro de custo
            cc_match = False
            if r.cost_center_ids:
                try:
                    ccs = json.loads(r.cost_center_ids)
                    if "*" in ccs or "all" in ccs:
                        cc_match = True
                    else:
                        clean_ccs = [str(x).strip() for x in ccs]
                        if cc_code and cc_code in clean_ccs:
                            cc_match = True
                        elif cc_id and cc_id in clean_ccs:
                            cc_match = True
                except Exception:
                    pass
            elif r.cost_center_id:
                r_cc = str(r.cost_center_id).strip()
                if r_cc and (r_cc == cc_code or r_cc == cc_id):
                    cc_match = True

            if cc_match:
                matching_app = str(r.sienge_apportionment_id).strip()
                break

        if close_db:
            db_session.close()

        if matching_app:
            return matching_app
    except Exception:
        pass

    return default_app


def get_category_full_name(category, expense=None) -> str:
    if not category and not expense:
        return "-"
    cat_name = getattr(category, "name", "") if category else ""
    if not cat_name and expense and getattr(expense, "category", None):
        cat_name = getattr(expense.category, "name", "")
    if not cat_name:
        cat_name = "Outros"

    app_id = None
    if expense is not None:
        app_id = get_effective_apportionment(expense)
    if not app_id and category:
        app_id = getattr(category, "sienge_apportionment_id", None)
    if not app_id:
        return cat_name
    
    pm = _get_sienge_plans_map()
    plan_name = pm.get(str(app_id), "") or pm.get(str(app_id).replace(".", ""), "")
    formatted_code = format_apportionment_code(app_id)
    if plan_name:
        return f"{cat_name} - {formatted_code} - {plan_name}"
    else:
        return f"{cat_name} - {formatted_code}"


def _get_logo_flowable():
    logo_icon_path = os.path.join("static", "icons", "logo-icon.png")
    if os.path.exists(logo_icon_path):
        icon_img = RLImage(logo_icon_path, width=1.4*cm, height=1.4*cm)
        text_para = Paragraph(
            '<font color="#15803D" size="14"><b>MOURA LEITE</b></font><br/>'
            '<font color="#166534" size="8">LOTEAMENTOS</font>',
            getSampleStyleSheet()["Normal"]
        )
        logo_table = Table([[icon_img, text_para]], colWidths=[1.6*cm, 4.5*cm])
        logo_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        return logo_table
    else:
        return Paragraph(
            '<font color="#15803D" size="16"><b>Moura Leite</b></font><br/>'
            '<font color="#166534" size="9">Sistema de Reembolsos</font>',
            getSampleStyleSheet()["Normal"]
        )


def generate_expense_pdf(expense, output_path: str):
    """Gera PDF individual de uma despesa."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )
    styles = getSampleStyleSheet()
    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    header_logo = _get_logo_flowable()

    header_data = [[
        header_logo,
        Paragraph(
            f'<font color="#6B7280" size="9">Relatório de Despesa</font><br/>'
            f'<font color="#15803D" size="14"><b>#{expense.id:06d}</b></font>',
            ParagraphStyle("right", alignment=TA_RIGHT)
        )
    ]]
    header_table = Table(header_data, colWidths=[9*cm, 8*cm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=ML_GREEN))
    story.append(Spacer(1, 0.5*cm))

    # ── Status badge ────────────────────────────────────────────────────────
    status_label = STATUS_LABELS.get(expense.status.value if hasattr(expense.status, 'value') else expense.status, expense.status)
    status_color = ML_GREEN if "aprovado" in str(expense.status) or "pago" in str(expense.status) or "finalizado" in str(expense.status) else (ML_RED if "rejeitado" in str(expense.status) else ML_DARK)

    status_data = [[
        Paragraph(f'<font color="white" size="10"><b>  {status_label}  </b></font>',
                  ParagraphStyle("center", alignment=TA_CENTER)),
    ]]
    status_table = Table(status_data, colWidths=[5*cm])
    status_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), status_color),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING", (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, 0), (0, 0), 6),
    ]))
    story.append(status_table)
    story.append(Spacer(1, 0.5*cm))

    # ── Dados principais ────────────────────────────────────────────────────
    def field_row(label, value):
        return [
            Paragraph(f'<font color="#4B5563" size="9">{label}</font>', styles["Normal"]),
            Paragraph(f'<font color="#1F2937" size="10"><b>{value}</b></font>', styles["Normal"]),
        ]

    amount_str = f"R$ {expense.amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    expense_date_str = expense.expense_date.strftime("%d/%m/%Y") if expense.expense_date else "-"
    created_str = expense.created_at.strftime("%d/%m/%Y %H:%M") if expense.created_at else "-"

    info_data = [
        field_row("Solicitante", expense.user.name if expense.user else "-"),
        field_row("E-mail", expense.user.email if expense.user else "-"),
        field_row("Data da Despesa", expense_date_str),
        field_row("Data de Criação", created_str),
        field_row("Categoria", get_category_full_name(expense.category, expense=expense)),
        field_row("Centro de Custo", f"{expense.cost_center.code} | {expense.cost_center.name}" if expense.cost_center else "-"),
        field_row("Valor", amount_str),
        field_row("Descrição", expense.description),
    ]

    if expense.notes:
        info_data.append(field_row("Observações", expense.notes))

    if expense.approver:
        approved_date = expense.approved_at.strftime("%d/%m/%Y %H:%M") if expense.approved_at else "-"
        info_data.append(field_row("Aprovado por", expense.approver.name))
        info_data.append(field_row("Data de Aprovação", approved_date))

    if expense.rejection_reason:
        info_data.append(field_row("Motivo de Rejeição", expense.rejection_reason))

    info_table = Table(info_data, colWidths=[5*cm, 12*cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), ML_LIGHT_GREEN),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DCFCE7")),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 1*cm))

    # ── Comprovante ─────────────────────────────────────────────────────────
    if expense.receipt_path and os.path.exists(expense.receipt_path):
        story.append(Paragraph('<font color="#15803D" size="11"><b>Comprovante Anexado</b></font>', styles["Normal"]))
        story.append(Spacer(1, 0.3*cm))
        ext = os.path.splitext(expense.receipt_path)[1].lower()
        if ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            try:
                from PIL import Image as PILImage
                
                with PILImage.open(expense.receipt_path) as pimg:
                    w, h = pimg.size
                
                max_w = 14 * cm
                max_h = 10 * cm
                aspect = h / float(w or 1)
                
                render_w = max_w
                render_h = max_w * aspect
                if render_h > max_h:
                    render_h = max_h
                    render_w = max_h / aspect
                
                img = RLImage(expense.receipt_path, width=render_w, height=render_h)
                story.append(img)
            except Exception:
                story.append(Paragraph(f'<font color="#6B7280" size="9">Comprovante anexado: {os.path.basename(expense.receipt_path)}</font>', styles["Normal"]))
        else:
            story.append(Paragraph(f'<font color="#166534" size="10"><b>Documento PDF Anexado:</b> {os.path.basename(expense.receipt_path)}</font>', styles["Normal"]))
    else:
        story.append(Paragraph('<font color="#6B7280" size="9">Nenhum comprovante físico anexado.</font>', styles["Normal"]))

    story.append(Spacer(1, 1*cm))

    # ── Rodapé ──────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=ML_GRAY))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        f'<font color="#9CA3AF" size="8">Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")} • '
        f'Sistema de Reembolsos Moura Leite • Documento #{expense.id:06d}</font>',
        ParagraphStyle("footer", alignment=TA_CENTER)
    ))

    doc.build(story)


def generate_export_pdf(expenses: list, export_name: str, output_path: str, filters: dict = None, generator_name: str = "Administrador", company_name: str = None, view_mode: str = "category"):
    """Gera PDF consolidado de exportação no layout corporativo idêntico ao modelo fornecido."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm
    )
    styles = getSampleStyleSheet()
    story = []

    # Se company_name não foi passado, tentar deduzir a partir dos centros de custo das despesas
    if not company_name and expenses:
        comp_names = [
            e.cost_center.company.name
            for e in expenses
            if getattr(e, 'cost_center', None) and getattr(e.cost_center, 'company', None) and e.cost_center.company.name
        ]
        if comp_names:
            unique_comps = list(dict.fromkeys(comp_names))
            company_name = " / ".join(unique_comps)

    # Identificar solicitante das despesas
    user_names = sorted(list(set([e.user.name for e in expenses if getattr(e, 'user', None)])))
    user_display = ", ".join(user_names) if user_names else "Controladoria Moura Leite"

    today_str = datetime.now().strftime("%d/%m/%Y")

    # ── 1. Cabeçalho Corporativo com Meta-dados Alinhados à Direita ────────────
    logo_flowable = _get_logo_flowable()

    meta_right = Paragraph(
        f'<font color="#1F2937" size="9"><b>De:</b> {generator_name}</font><br/>'
        f'<font color="#1F2937" size="9"><b>Data do relatório:</b> {today_str}</font><br/>'
        f'<font color="#1F2937" size="9"><b>ID do usuário:</b> {user_display}</font>',
        ParagraphStyle("header_right", alignment=TA_RIGHT, leading=14)
    )

    header_table = Table([[logo_flowable, meta_right]], colWidths=[8*cm, 10.5*cm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.6*cm))

    # ── 2. Título Centralizado e Nome da Empresa logo abaixo ─────────────────
    story.append(Paragraph(
        f'<font color="#1F2937" size="15"><b>{export_name}</b></font>',
        ParagraphStyle("report_title_centered", alignment=TA_CENTER, leading=18)
    ))
    if company_name:
        story.append(Spacer(1, 0.55*cm))
        story.append(Paragraph(
            f'<font color="#374151" size="11"><b>{html.escape(company_name)}</b></font>',
            ParagraphStyle("report_company_centered", alignment=TA_CENTER, leading=14)
        ))
    story.append(Spacer(1, 0.4*cm))

    # ── 3. Sub-rótulo à Direita conforme a seleção ────────────────────────────
    if view_mode == "cost_center":
        sub_label = "Resumido por centro de custo"
    elif view_mode == "category":
        sub_label = "Resumido por categoria"
    else:
        sub_label = "Resumido por data"

    story.append(Paragraph(
        f'<font color="#4B5563" size="8.5"><i>{sub_label}</i></font>',
        ParagraphStyle("sub_right", alignment=TA_RIGHT)
    ))
    story.append(Spacer(1, 0.2*cm))

    if not expenses:
        story.append(Paragraph('<font color="#6B7280">Nenhuma despesa encontrada para os filtros aplicados.</font>', styles["Normal"]))
    else:
        # ── 4. Tabela de Despesas Agrupadas conforme o Modo de Visualização ─────
        from collections import OrderedDict
        from datetime import date as d_date
        grouped_expenses = OrderedDict()

        if view_mode == "cost_center":
            # Agrupa por Centro de Custo
            sorted_exps = sorted(
                expenses,
                key=lambda e: (
                    (getattr(e.cost_center, "code", "") or "") if getattr(e, "cost_center", None) else "ZZZZZ",
                    e.expense_date or d_date.min,
                    e.id or 0
                )
            )
            for exp in sorted_exps:
                if getattr(exp, "cost_center", None):
                    cc = exp.cost_center
                    cc_code = getattr(cc, "code", "") or ""
                    cc_name = getattr(cc, "name", "") or ""
                    if cc_code and cc_name:
                        group_key = f"{cc_code} - {cc_name}"
                    elif cc_code:
                        group_key = f"{cc_code}"
                    elif cc_name:
                        group_key = f"{cc_name}"
                    else:
                        group_key = "Sem Centro de Custo"
                else:
                    group_key = "Sem Centro de Custo"

                if group_key not in grouped_expenses:
                    grouped_expenses[group_key] = []
                grouped_expenses[group_key].append(exp)

        elif view_mode == "category":
            # Agrupa por Categoria
            sorted_exps = sorted(
                expenses,
                key=lambda e: (
                    get_category_full_name(e.category, expense=e) if getattr(e, "category", None) else "ZZZZZ",
                    e.expense_date or d_date.min,
                    e.id or 0
                )
            )
            for exp in sorted_exps:
                cat_name = get_category_full_name(exp.category, expense=exp) if getattr(exp, "category", None) else "Outros"
                if cat_name not in grouped_expenses:
                    grouped_expenses[cat_name] = []
                grouped_expenses[cat_name].append(exp)

        else:
            # Modo Data: agrupa por Data
            sorted_exps = sorted(
                expenses,
                key=lambda e: (
                    e.expense_date or d_date.min,
                    e.id or 0
                )
            )
            for exp in sorted_exps:
                if getattr(exp, "expense_date", None):
                    group_key = exp.expense_date.strftime("%d/%m/%Y")
                else:
                    group_key = "Sem Data"

                if group_key not in grouped_expenses:
                    grouped_expenses[group_key] = []
                grouped_expenses[group_key].append(exp)

        header = [
            Paragraph('<font color="#111827" size="8"><b>DATA</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>SOLICITANTE</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>ESTABELECIMENTO / DESCRIÇÃO</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>CATEGORIA</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>CENTRO DE CUSTO</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>STATUS</b></font>', styles["Normal"]),
            Paragraph('<font color="#111827" size="8"><b>QUANTIA</b></font>', ParagraphStyle("right", alignment=TA_RIGHT)),
        ]
        table_data = [header]
        total_geral = 0.0
        exp_counter = 1
        group_header_rows = []

        for group_title, g_exps in grouped_expenses.items():
            g_total = sum([e.amount or 0 for e in g_exps])
            total_geral += g_total
            g_total_str = f"{g_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

            # Subcabeçalho do Grupo (Categoria, Centro de Custo ou Data)
            g_row_index = len(table_data)
            group_header_rows.append(g_row_index)
            g_title_para = Paragraph(f'<font color="#111827" size="9"><i><b>{html.escape(group_title)}</b></i></font>', styles["Normal"])
            g_sum_para = Paragraph(f'<font color="#111827" size="9"><b>{g_total_str}</b></font>', ParagraphStyle("right", alignment=TA_RIGHT))

            table_data.append([g_title_para, "", "", "", "", "", g_sum_para])

            # Linhas de despesas deste grupo
            for exp in g_exps:
                val = exp.amount or 0
                val_str = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                date_str = exp.expense_date.strftime("%d/%m/%Y") if exp.expense_date else "-"
                status_label = STATUS_LABELS.get(
                    exp.status.value if hasattr(exp.status, 'value') else str(exp.status), str(exp.status)
                )
                cc_code = f"{exp.cost_center.code}" if getattr(exp, 'cost_center', None) and exp.cost_center.code else "-"
                user_name = exp.user.name if getattr(exp, 'user', None) and exp.user.name else "-"
                desc_text = exp.description if exp.description else "-"
                cat_name = get_category_full_name(exp.category, expense=exp) if getattr(exp, 'category', None) else "Outros"

                row = [
                    Paragraph(f'<font color="#1F2937" size="8">{exp_counter}  {date_str}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8">{user_name}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8">{desc_text}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8">{cat_name}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8">{cc_code}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8">{status_label}</font>', styles["Normal"]),
                    Paragraph(f'<font color="#1F2937" size="8"><b>{val_str}</b></font>', ParagraphStyle("right", alignment=TA_RIGHT)),
                ]
                table_data.append(row)
                exp_counter += 1

        col_widths = [2.4*cm, 3.2*cm, 4.3*cm, 3.0*cm, 2.0*cm, 2.0*cm, 2.4*cm]
        exp_table = Table(table_data, colWidths=col_widths, repeatRows=1)

        table_styles = [
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("LINEABOVE", (0, 0), (-1, 0), 1.0, colors.HexColor("#111827")),
            ("LINEBELOW", (0, 0), (-1, 0), 1.0, colors.HexColor("#111827")),
            ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#F3F4F6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]

        for r_idx in group_header_rows:
            table_styles.append(("SPAN", (0, r_idx), (5, r_idx)))
            table_styles.append(("TOPPADDING", (0, r_idx), (-1, r_idx), 8))
            table_styles.append(("BOTTOMPADDING", (0, r_idx), (-1, r_idx), 6))

        exp_table.setStyle(TableStyle(table_styles))
        story.append(exp_table)
        story.append(Spacer(1, 0.4*cm))

        # ── 5. Apenas a Linha Divisória Final com o Verde Padrão Moura Leite ─────
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#15803D")))
        story.append(Spacer(1, 0.4*cm))

        # ── Totalizadores de Rodapé Alinhados à Direita (Sem R$ e Sem BRL) ──
        total_geral_str = f"{total_geral:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        totals_text = Paragraph(
            f'<font color="#1F2937" size="9"><b>TOTAL: {total_geral_str}</b></font><br/>'
            f'<font color="#4B5563" size="8">Tax Total: 0,00</font><br/>'
            f'<font color="#4B5563" size="8">Total excl. Tax: {total_geral_str}</font><br/><br/>'
            f'<font color="#1F2937" size="9"><b>Reembolsáveis: {total_geral_str}</b></font><br/><br/>'
            f'<font color="#4B5563" size="8">Nota Fiscal: 0,00</font>',
            ParagraphStyle("totals_right", alignment=TA_RIGHT, leading=13)
        )

        totals_table = Table([[Paragraph("", styles["Normal"]), totals_text]], colWidths=[10.5*cm, 8*cm])
        totals_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(totals_table)

    # ── Rodapé do Documento ───────────────────────────────────────────────────
    story.append(Spacer(1, 0.8*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=ML_GRAY))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        f'<font color="#9CA3AF" size="8">Moura Leite Loteamentos • Sistema de Reembolsos • '
        f'Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")}</font>',
        ParagraphStyle("footer", alignment=TA_CENTER)
    ))

    doc.build(story)
