import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger("reembolsos.email")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", "reembolsos@empresa.com.br"))
SMTP_TLS = os.environ.get("SMTP_TLS", "true").lower() in ("true", "1", "yes")

def send_rejection_email(
    user_name: str,
    user_email: str,
    expense_id: int,
    amount: float,
    description: str,
    rejection_reason: str,
    reviewer_name: str
) -> bool:
    """
    Envia e-mail automático para o usuário quando sua despesa for rejeitada.
    Caso o servidor SMTP não esteja configurado, efetua log da notificação.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para o usuário {user_name} ({user_email})")
        return False

    subject = f"[Reembolso] Despesa #{expense_id} foi Reprovada"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
        .header {{ background: #dc2626; color: #ffffff; padding: 24px; text-align: center; }}
        .header h2 {{ margin: 0; font-size: 20px; font-weight: 700; }}
        .content {{ padding: 24px; }}
        .info-box {{ background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 4px; margin: 18px 0; }}
        .detail-table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
        .detail-table td {{ padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
        .detail-label {{ color: #64748b; font-weight: 600; width: 140px; }}
        .detail-value {{ color: #0f172a; font-weight: 500; }}
        .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Despesa Reprovada</h2>
        </div>
        <div class="content">
          <p>Olá, <strong>{user_name}</strong>,</p>
          <p>Informamos que a sua solicitação de reembolso abaixo foi reprovada na etapa de avaliação:</p>
          
          <div class="info-box">
            <strong style="color: #991b1b;">Motivo da Reprovação:</strong><br>
            <span style="color: #b91c1c; font-size: 14px; margin-top: 4px; display: inline-block;">{rejection_reason}</span>
          </div>

          <table class="detail-table">
            <tr>
              <td class="detail-label">ID da Despesa:</td>
              <td class="detail-value">#{expense_id}</td>
            </tr>
            <tr>
              <td class="detail-label">Descrição:</td>
              <td class="detail-value">{description}</td>
            </tr>
            <tr>
              <td class="detail-label">Valor:</td>
              <td class="detail-value">R$ {amount:.2f}</td>
            </tr>
            <tr>
              <td class="detail-label">Avaliador:</td>
              <td class="detail-value">{reviewer_name}</td>
            </tr>
          </table>

          <p style="margin-top: 20px; font-size: 14px; line-height: 1.5; color: #475569;">
            Você pode acessar o sistema de Reembolsos a qualquer momento para editar e corrigir as informações necessárias. Ao corrigir a despesa, ela será automaticamente reenviada para o fluxo de aprovação.
          </p>
        </div>
        <div class="footer">
          Sistema de Gestão de Reembolsos &bull; E-mail automático, por favor não responda.
        </div>
      </div>
    </body>
    </html>
    """

    text_content = f"""
    Olá {user_name},

    Sua despesa #{expense_id} ({description}) no valor de R$ {amount:.2f} foi reprovada.

    Motivo: {rejection_reason}
    Avaliador: {reviewer_name}

    Acesse o sistema para efetuar a correção e reenvio.
    """

    if not SMTP_HOST:
        logger.info(
            f"[SIMULACAO E-MAIL] Para: {user_email} | Assunto: {subject} | "
            f"Despesa #{expense_id} reprovada por '{reviewer_name}' com motivo '{rejection_reason}'"
        )
        print(f"[E-mail automatico disparado para {user_email}] Assunto: {subject}")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = user_email

        msg.attach(MIMEText(text_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            if SMTP_TLS:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [user_email], msg.as_string())

        logger.info(f"E-mail de rejeição enviado com sucesso para {user_email}")
        return True
    except Exception as exc:
        logger.error(f"Falha ao enviar e-mail de rejeição para {user_email}: {exc}")
        return False


def send_report_email(
    user_name: str,
    user_email: str,
    report_name: str,
    pdf_path: str = None,
    payment_info_text: str = "O pagamento será realizado em breve.",
    custom_subject: str = None,
    custom_body: str = None
) -> bool:
    """
    Envia relatório consolidado por e-mail com o arquivo PDF anexado
    e o texto padrão corporativo da Moura Leite ou modelo personalizado.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para {user_name} ({user_email})")
        return False

    subject = custom_subject or f"Reembolso ({report_name})"

    if custom_body:
        text_content = custom_body
    else:
        text_content = (
            f"Olá {user_name},\n\n"
            f"Segue relatório de reembolso de despesas para sua conferência.\n"
            f"{payment_info_text}\n\n"
            f"Nos avise qualquer divergência.\n\n"
            f"Atenciosamente,\n"
            f"Moura Leite Loteamentos"
        )

    # Converte quebras de linha do corpo em <p> / <br> para HTML
    formatted_body_html = "<br>".join(text_content.replace("\r\n", "\n").split("\n"))

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: #15803D; color: #ffffff; padding: 22px; text-align: center; }}
    .header h2 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .content {{ padding: 24px; font-size: 14px; line-height: 1.6; color: #334155; }}
    .info-box {{ background: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 4px; margin: 18px 0; color: #166534; font-weight: 500; font-size: 14px; }}
    .attachment-badge {{ display: inline-flex; align-items: center; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; font-size: 13px; color: #475569; margin: 10px 0; font-weight: 500; }}
    .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Relatório de Reembolso de Despesas</h2>
    </div>
    <div class="content">
      <div style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
        {formatted_body_html}
      </div>

      <div class="attachment-badge">
        📎 Arquivo PDF anexado: <strong>{report_name}.pdf</strong>
      </div>
    </div>
    <div class="footer">
      Moura Leite Loteamentos &bull; Sistema de Gestão de Reembolsos
    </div>
  </div>
</body>
</html>"""


    # Monta mensagem com anexo
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = user_email

    msg_body = MIMEMultipart("alternative")
    msg_body.attach(MIMEText(text_content, "plain", "utf-8"))
    msg_body.attach(MIMEText(html_content, "html", "utf-8"))
    msg.attach(msg_body)

    # Anexa arquivo PDF
    actual_pdf = None
    if pdf_path:
        for p in (pdf_path, os.path.join("/tmp", pdf_path.lstrip("/")), os.path.join("/tmp/exports", os.path.basename(pdf_path))):
            if p and os.path.isfile(p):
                actual_pdf = p
                break

    if actual_pdf:
        try:
            from email.mime.application import MIMEApplication
            with open(actual_pdf, "rb") as f:
                pdf_data = f.read()
            pdf_attachment = MIMEApplication(pdf_data, _subtype="pdf")
            safe_name = "".join(c for c in report_name if c.isalnum() or c in (" ", "-", "_", ".")).strip()
            if not safe_name.lower().endswith(".pdf"):
                safe_name += ".pdf"
            pdf_attachment.add_header("Content-Disposition", "attachment", filename=safe_name)
            msg.attach(pdf_attachment)
        except Exception as e:
            logger.error(f"Erro ao anexar arquivo PDF '{actual_pdf}': {e}")

    if not SMTP_HOST:
        logger.info(
            f"[SIMULAÇÃO E-MAIL] Para: {user_email} | Assunto: {subject} | Anexo: {pdf_path}"
        )
        print(f"[E-mail com relatório e PDF disparado para {user_email}] Assunto: {subject} | Anexo: {pdf_path}")
        return True

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            if SMTP_TLS:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [user_email], msg.as_string())
        logger.info(f"E-mail de relatório enviado com sucesso para {user_email}")
        return True
    except Exception as exc:
        logger.error(f"Falha ao enviar e-mail de relatório para {user_email}: {exc}")
        return False


def send_closing_dates_email(
    user_name: str,
    user_email: str,
    closing_date_str: str,
    month_year_str: str,
    custom_subject: str = None,
    custom_body: str = None
) -> bool:
    """
    Envia e-mail com lembrete de data de fechamento/corte de despesas
    para os colaboradores da empresa.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para {user_name} ({user_email})")
        return False

    subject = custom_subject or f"[Reembolso] Lembrete: Data de Fechamento de Despesas - {month_year_str}"

    if custom_body:
        text_content = custom_body
    else:
        text_content = (
            f"Olá {user_name},\n\n"
            f"Lembramos que a data limite para lançamento e envio de todas as despesas de reembolso referentes ao período é {closing_date_str}.\n\n"
            f"Por favor, certifique-se de cadastrar e submeter todos os seus comprovantes no sistema até esta data para inclusão no próximo lote de aprovação e pagamento.\n\n"
            f"Nos avise qualquer dúvida ou divergência.\n\n"
            f"Atenciosamente,\n"
            f"Moura Leite Loteamentos"
        )

    formatted_body_html = "<br>".join(text_content.replace("\r\n", "\n").split("\n"))

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: #15803D; color: #ffffff; padding: 22px; text-align: center; }}
    .header h2 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .content {{ padding: 24px; font-size: 14px; line-height: 1.6; color: #334155; }}
    .info-box {{ background: #fefce8; border-left: 4px solid #eab308; padding: 14px 16px; border-radius: 4px; margin: 18px 0; color: #854d0e; font-weight: 600; font-size: 14px; }}
    .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Lembrete: Fechamento de Despesas</h2>
    </div>
    <div class="content">
      <div style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
        {formatted_body_html}
      </div>
    </div>
    <div class="footer">
      Moura Leite Loteamentos &bull; Sistema de Gestão de Reembolsos
    </div>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = user_email
    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    if not SMTP_HOST:
        logger.info(
            f"[SIMULAÇÃO E-MAIL] Para: {user_email} | Assunto: {subject} | Data: {closing_date_str}"
        )
        print(f"[E-mail fechamento disparado para {user_email}] Assunto: {subject}")
        return True

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            if SMTP_TLS:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [user_email], msg.as_string())
        logger.info(f"E-mail de fechamento enviado com sucesso para {user_email}")
        return True
    except Exception as exc:
        logger.error(f"Falha ao enviar e-mail de fechamento para {user_email}: {exc}")
        return False

