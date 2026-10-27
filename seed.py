"""
seed.py — Popula os dados iniciais do sistema de reembolsos Moura Leite.
Executado automaticamente no startup. Idempotente.
"""
from database import SessionLocal
import models
from auth import get_password_hash


def run_seed():
    db = SessionLocal()
    try:
        # Seedar Cargos/Perfis (JobRole) - sempre garante a criação deles
        default_roles = ['Administrador', 'Usuário', 'Aprovador', 'Financeiro']
        for role_name in default_roles:
            existing = db.query(models.JobRole).filter(models.JobRole.name == role_name).first()
            if not existing:
                new_role = models.JobRole(name=role_name, active=True)
                db.add(new_role)
        
        # Seedar Funções (JobFunction) - sempre garante a criação delas
        default_functions = ['Colaborador', 'Supervisor', 'Gestor', 'Diretor']
        for func_name in default_functions:
            existing = db.query(models.JobFunction).filter(models.JobFunction.name == func_name).first()
            if not existing:
                new_func = models.JobFunction(name=func_name, active=True)
                db.add(new_func)
        db.commit()

        # Seedar taxas de quilometragem padrão (se não existirem)
        if db.query(models.MileageRate).count() == 0:
            db.add(models.MileageRate(name="Nível 1 - Colaborador", rate=1.50, active=True))
            db.add(models.MileageRate(name="Nível 2 - Diretor", rate=2.20, active=True))
            db.commit()

        # Seedar Logo oficial da Moura Leite se não existir
        import base64, os
        svg_path = os.path.join("static", "icons", "moura_logo_color.svg")
        if os.path.exists(svg_path):
            with open(svg_path, "r", encoding="utf-8") as f:
                logo_b64 = "data:image/svg+xml;base64," + base64.b64encode(f.read().encode("utf-8")).decode("utf-8")
            logo_entry = db.query(models.CompanyLogo).first()
            if not logo_entry:
                db.add(models.CompanyLogo(data=logo_b64))
                db.commit()

        # Seedar Modelos de E-mail padrão (Datas de fechamento e Data de Pagamento)
        default_templates = [
            {
                "key": "closing_dates",
                "name": "Datas de fechamento",
                "subject": "[Reembolso] Lembrete: Data de Fechamento de Despesas - {mes_ano}",
                "body": (
                    "Olá {nome_usuario},\n\n"
                    "Lembramos que a data limite para lançamento e envio de todas as despesas de reembolso referentes ao período é {data_fechamento}.\n\n"
                    "Por favor, certifique-se de cadastrar e submeter todos os seus comprovantes no sistema até esta data para inclusão no próximo lote de aprovação e pagamento.\n\n"
                    "Nos avise qualquer dúvida ou divergência.\n\n"
                    "Atenciosamente,\n"
                    "Moura Leite Loteamentos"
                ),
                "description": "Modelo de e-mail de aviso/lembrete enviado aos colaboradores sobre o prazo de fechamento e corte das despesas do mês.",
                "available_tags": "{nome_usuario}, {data_fechamento}, {data_aprovação}, {data_pagamento}, {mes_ano}"
            },
            {
                "key": "payment_date",
                "name": "Data de Pagamento",
                "subject": "Reembolso ({nome_relatorio})",
                "body": (
                    "Olá {nome_usuario},\n\n"
                    "Segue relatório de reembolso de despesas para sua conferência.\n"
                    "O pagamento será realizado no dia {data_pagamento}.\n\n"
                    "Nos avise qualquer divergência.\n\n"
                    "Atenciosamente,\n"
                    "Moura Leite Loteamentos"
                ),
                "description": "Modelo padrão corporativo enviado aos colaboradores junto com o relatório de despesas e a previsão da data de pagamento programada.",
                "available_tags": "{nome_usuario}, {data_pagamento}, {nome_relatorio}, {mes_ano}"
            }
        ]
        for tmpl in default_templates:
            existing_tmpl = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == tmpl["key"]).first()
            if not existing_tmpl:
                db.add(models.EmailTemplate(
                    key=tmpl["key"],
                    name=tmpl["name"],
                    subject=tmpl["subject"],
                    body=tmpl["body"],
                    description=tmpl["description"],
                    available_tags=tmpl["available_tags"]
                ))
            db.commit()


        # Garantir geração do arquivo PDF da Política em uploads
        import os, shutil
        os.makedirs("uploads", exist_ok=True)
        pdf_path = os.path.join("uploads", "Politica_reembolso_despesas.pdf")
        alt_path = os.path.join("uploads", "Politica_reembolso_despesas (2).pdf")
        if not os.path.exists(pdf_path) or not os.path.exists(alt_path):
            try:
                from reportlab.lib.pagesizes import letter
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.lib import colors

                doc = SimpleDocTemplate(pdf_path, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
                styles = getSampleStyleSheet()
                title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=colors.HexColor('#002B49'), spaceAfter=12)
                body_style = ParagraphStyle('DocBody', parent=styles['Normal'], fontName='Helvetica', fontSize=11, leading=16, textColor=colors.HexColor('#1A1D20'), spaceAfter=10)
                story = [
                    Paragraph('POLÍTICA DE REEMBOLSO DE DESPESAS', title_style),
                    Paragraph('MOURA LEITE LOTEAMENTOS — DIRETRIZES CORPORATIVAS', ParagraphStyle('Sub', parent=body_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#E91E8C'))),
                    Spacer(1, 15),
                    Paragraph('<b>1. OBJETIVO</b><br/>Esta política estabelece os critérios e procedimentos para solicitação, prestação de contas e reembolso de despesas corporativas realizadas por colaboradores da Moura Leite Loteamentos no exercício de suas funções.', body_style),
                    Paragraph('<b>2. ELEGIBILIDADE E CATEGORIAS PERMITIDAS</b><br/>Serão reembolsadas despesas devidamente comprovadas com nota ou cupom fiscal válido, relativas a:<br/>• <b>Alimentação / Refeição</b>: Respeitando o limite diário da empresa.<br/>• <b>Combustível e Quilometragem (KM)</b>: Cálculo baseado na rota e valor por km vigente.<br/>• <b>Hospedagem</b>: Diárias autorizadas previamente para viagens a trabalho.<br/>• <b>Transporte</b>: Uber, táxi ou passagens com comprovante.', body_style),
                    Paragraph('<b>3. PRAZO E COMPROVAÇÃO</b><br/>• O colaborador deve lançar a despesa em até 30 dias após a realização.<br/>• O comprovante fiscal (NF-e, NFC-e ou Danfe) é <b>obrigatório</b>.<br/>• Cupons não legíveis ou sem detalhamento serão recusados.', body_style),
                    Paragraph('<b>4. FLUXO DE APROVAÇÃO</b><br/>1. Lançamento pelo Colaborador → 2. Análise pelo Aprovador da Área → 3. Validação e Pagamento pelo Departamento Financeiro.', body_style),
                ]
                doc.build(story)
                shutil.copy(pdf_path, alt_path)
            except Exception:
                pass

        policy_entry = db.query(models.CustomPolicy).filter(models.CustomPolicy.group == 'central_policies').first()
        if not policy_entry:
            policy_entry = models.CustomPolicy(
                key="politica_de_reembolsos",
                value="Politica_reembolso_despesas (2).pdf",
                description="Política de reembolsos",
                group="central_policies",
                active=True
            )
            db.add(policy_entry)
            db.commit()

        # Só executa se não houver dados
        if db.query(models.User).count() > 0:
            return

        # ── Centros de Custo ───────────────────────────────────────────────
        cost_centers = [
            models.CostCenter(code="70119", name="TIME | MARKETING"),
            models.CostCenter(code="70122", name="TIME | PROJETOS"),
            models.CostCenter(code="70130", name="TIME | NOVOS NEGÓCIOS"),
        ]
        for cc in cost_centers:
            db.add(cc)
        db.flush()

        cc_marketing = cost_centers[0]
        cc_projetos = cost_centers[1]
        cc_negocios = cost_centers[2]

        # ── Categorias ────────────────────────────────────────────────────
        categories = [
            models.Category(
                name="Refeição",
                daily_limit=150.0,
                requires_nf=False,
                max_days=None,
                icon="🍽️"
            ),
            models.Category(
                name="Combustível",
                daily_limit=None,
                requires_nf=True,
                max_days=None,
                icon="⛽"
            ),
            models.Category(
                name="Hotel",
                daily_limit=None,
                requires_nf=False,
                max_days=30,
                icon="🏨"
            ),
            models.Category(
                name="Despesas de Viagem",
                daily_limit=None,
                requires_nf=False,
                max_days=None,
                icon="✈️"
            ),
            models.Category(
                name="Outros",
                daily_limit=None,
                requires_nf=False,
                max_days=None,
                icon="📄"
            ),
            models.Category(
                name="Quilometragem",
                daily_limit=1.50,   # Valor por KM (R$1,50/km)
                requires_nf=False,
                max_days=None,
                icon="🚗"
            ),
        ]
        for cat in categories:
            db.add(cat)
        db.flush()

        role_admin = db.query(models.JobRole).filter(models.JobRole.name == 'Administrador').first()
        role_usuario = db.query(models.JobRole).filter(models.JobRole.name == 'Usuário').first()
        role_aprovador = db.query(models.JobRole).filter(models.JobRole.name == 'Aprovador').first()

        func_colaborador = db.query(models.JobFunction).filter(models.JobFunction.name == 'Colaborador').first()
        func_gestor = db.query(models.JobFunction).filter(models.JobFunction.name == 'Gestor').first()
        func_diretor = db.query(models.JobFunction).filter(models.JobFunction.name == 'Diretor').first()

        # ── Usuários ──────────────────────────────────────────────────────
        admin_user = models.User(
            name="Administrador",
            email="admin@mouraleite.com.br",
            password_hash=get_password_hash("Admin@123"),
            role=models.UserRole.admin,
            cost_center_id=cc_negocios.id,
            job_role_id=role_admin.id if role_admin else None,
            job_function_id=func_diretor.id if func_diretor else None,
        )
        user1 = models.User(
            name="João Silva",
            email="joao.silva@mouraleite.com.br",
            password_hash=get_password_hash("User@123"),
            role=models.UserRole.usuario,
            cost_center_id=cc_projetos.id,
            job_role_id=role_usuario.id if role_usuario else None,
            job_function_id=func_colaborador.id if func_colaborador else None,
        )
        user2 = models.User(
            name="Maria Santos",
            email="maria.santos@mouraleite.com.br",
            password_hash=get_password_hash("User@123"),
            role=models.UserRole.aprovador,
            cost_center_id=cc_marketing.id,
            job_role_id=role_aprovador.id if role_aprovador else None,
            job_function_id=func_gestor.id if func_gestor else None,
        )
        db.add_all([admin_user, user1, user2])
        db.flush()

        # ── Políticas ─────────────────────────────────────────────────────
        policies = [
            models.Policy(
                key="refeicao_limite_diario",
                value="150.00",
                description="Limite diário para refeições (R$)"
            ),
            models.Policy(
                key="combustivel_requer_nf",
                value="true",
                description="Combustível exige Nota Fiscal"
            ),
            models.Policy(
                key="hotel_max_dias",
                value="30",
                description="Número máximo de diárias de hotel"
            ),
            models.Policy(
                key="moeda_padrao",
                value="BRL",
                description="Moeda padrão do sistema"
            ),
            models.Policy(
                key="aprovacao_automatica_ate",
                value="0",
                description="Valor máximo para aprovação automática (0 = desativado)"
            ),
        ]
        for p in policies:
            db.add(p)

        # ── Despesas de Exemplo ───────────────────────────────────────────
        from datetime import date, datetime

        sample_expenses = [
            models.Expense(
                user_id=user1.id,
                category_id=categories[0].id,  # Refeição
                cost_center_id=cc_projetos.id,
                description="Almoço com cliente - McDonald's",
                amount=58.90,
                expense_date=date(2026, 7, 2),
                status=models.ExpenseStatus.aprovado,
                approved_by=admin_user.id,
                approved_at=datetime(2026, 7, 3, 10, 0, 0),
            ),
            models.Expense(
                user_id=user1.id,
                category_id=categories[3].id,  # Despesas de Viagem
                cost_center_id=cc_projetos.id,
                description="Itu - SP, Brasil",
                amount=473.93,
                expense_date=date(2026, 7, 2),
                status=models.ExpenseStatus.aguardando_aprovacao,
            ),
            models.Expense(
                user_id=user2.id,
                category_id=categories[0].id,  # Refeição
                cost_center_id=cc_negocios.id,
                description="Jantar - Frutaria São Paulo",
                amount=77.99,
                expense_date=date(2026, 7, 2),
                status=models.ExpenseStatus.aprovado,
                approved_by=admin_user.id,
                approved_at=datetime(2026, 7, 3, 11, 0, 0),
            ),
            models.Expense(
                user_id=user1.id,
                category_id=categories[1].id,  # Combustível
                cost_center_id=cc_projetos.id,
                description="Abastecimento - Posto Shell",
                amount=180.00,
                expense_date=date(2026, 7, 1),
                status=models.ExpenseStatus.a_enviar,
            ),
            models.Expense(
                user_id=user2.id,
                category_id=categories[0].id,  # Refeição
                cost_center_id=cc_marketing.id,
                description="Café da manhã - Padaria Central",
                amount=34.60,
                expense_date=date(2026, 7, 1),
                status=models.ExpenseStatus.pago,
                approved_by=admin_user.id,
                approved_at=datetime(2026, 7, 2, 9, 0, 0),
            ),
        ]
        for exp in sample_expenses:
            db.add(exp)

        db.commit()
        print("[OK] Dados iniciais inseridos com sucesso!")
    except Exception as e:
        db.rollback()
        print(f"[ERRO] Erro no seed: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
