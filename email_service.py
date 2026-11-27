import os
import smtplib
import logging
import time
import threading
import html
import base64
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

logger = logging.getLogger("reembolsos.email")

# ==============================================================================
# CONFIGURAÇÃO DE REMETENTE E PROVEDORES
# ==============================================================================
# O remetente do sistema é lido dinamicamente da variável AZURE_MAIL_SENDER
# (ex: financeiro@mouraleite.com.br). Nenhum endereço de e-mail é fixado no código.
def get_sender_email() -> str:
    """
    Retorna o endereço do remetente obtido das variáveis de ambiente.
    Prioridade: AZURE_MAIL_SENDER -> SMTP_FROM -> SMTP_USER.
    """
    return (
        os.environ.get("AZURE_MAIL_SENDER", "").strip() or
        os.environ.get("SMTP_FROM", "").strip() or
        os.environ.get("SMTP_USER", "").strip()
    )


def is_graph_configured() -> bool:
    """
    Verifica se todas as variáveis necessárias para envio via Microsoft Graph
    estão devidamente preenchidas no ambiente.
    """
    tenant = os.environ.get("AZURE_TENANT_ID", "").strip()
    client_id = os.environ.get("AZURE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("AZURE_CLIENT_SECRET", "").strip()
    sender = os.environ.get("AZURE_MAIL_SENDER", "").strip()
    return bool(tenant and client_id and client_secret and sender)


def is_smtp_configured() -> bool:
    """
    Verifica se as variáveis mínimas de SMTP estão presentes.
    """
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = get_sender_email()
    return bool(host and sender)


# ==============================================================================
# MICROSOFT GRAPH API: AUTENTICAÇÃO E CACHE DE TOKEN
# ==============================================================================
_token_cache = {
    "access_token": None,
    "expires_at": 0.0
}
_token_lock = threading.Lock()


def get_graph_access_token(force_refresh: bool = False) -> str:
    """
    Obtém o token de acesso OAuth 2.0 para o Microsoft Graph via Client Credentials.
    Guarda o token em cache na memória até próximo de expirar (buffer de 5 minutos).
    
    Atenção: Não valida a claim 'roles' no token, pois a autorização de envio é
    liberada diretamente pelo Exchange Online (RBAC para aplicativos, papel
    'Application Mail.Send') restrita à caixa configurada em AZURE_MAIL_SENDER.
    """
    global _token_cache
    now = time.time()

    with _token_lock:
        if not force_refresh and _token_cache["access_token"] and now < _token_cache["expires_at"]:
            return _token_cache["access_token"]

        tenant_id = os.environ.get("AZURE_TENANT_ID", "").strip()
        client_id = os.environ.get("AZURE_CLIENT_ID", "").strip()
        client_secret = os.environ.get("AZURE_CLIENT_SECRET", "").strip()

        if not (tenant_id and client_id and client_secret):
            raise ValueError(
                "Credenciais do Microsoft Entra ID (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) não configuradas."
            )

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials"
        }

        # Não loga dados sensíveis nem segredos
        try:
            resp = requests.post(token_url, data=payload, timeout=15)
        except Exception as exc:
            logger.error(f"Erro de conexão ao solicitar token ao Microsoft Entra ID: {exc}")
            raise RuntimeError("Falha de rede ao conectar com Microsoft Entra ID para autenticação.")

        if resp.status_code != 200:
            logger.error(f"Erro ao obter token do Microsoft Entra ID (Status HTTP {resp.status_code})")
            raise RuntimeError(f"Falha na autenticação OAuth2 com Microsoft Entra ID (Status {resp.status_code})")

        token_data = resp.json()
        access_token = token_data.get("access_token")
        expires_in = int(token_data.get("expires_in", 3600))

        if not access_token:
            logger.error("Resposta do Microsoft Entra ID não continha access_token.")
            raise RuntimeError("Microsoft Entra ID não retornou access_token válido.")

        _token_cache["access_token"] = access_token
        # Renova com margem de segurança de 300 segundos (5 minutos)
        _token_cache["expires_at"] = now + max(60.0, float(expires_in - 300))
        return access_token


# ==============================================================================
# MICROSOFT GRAPH API: DISPARO DE E-MAIL COM RETRY E TRATAMENTO DE ERROS
# ==============================================================================
def _send_graph_mail(
    subject: str,
    html_content: str,
    to_recipients: list[str],
    attachments: list[dict] = None
) -> bool:
    """
    Dispara e-mail via Microsoft Graph API POST /v1.0/users/{AZURE_MAIL_SENDER}/sendMail.
    - Resposta de sucesso esperada: HTTP 202 Accepted.
    - Tratamento de 401: renova o token (force_refresh=True) e tenta novamente 1 vez.
    - Tratamento de 403 (ErrorAccessDenied): a caixa está fora da política do Exchange Online.
    - Tratamento de 429 ou 5xx: retry com exponential backoff até 3 vezes.
    - Nunca expõe ou loga tokens ou segredos.
    """
    sender = os.environ.get("AZURE_MAIL_SENDER", "").strip()
    if not sender:
        raise ValueError("Variável de ambiente AZURE_MAIL_SENDER não está configurada.")

    recipients_payload = [
        {"emailAddress": {"address": email.strip()}}
        for email in to_recipients
        if email and "@" in email
    ]
    if not recipients_payload:
        logger.warning("Nenhum destinatário de e-mail válido fornecido.")
        return False

    message_payload = {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": html_content
        },
        "toRecipients": recipients_payload
    }

    if attachments:
        message_payload["attachments"] = attachments

    request_body = {
        "message": message_payload,
        "saveToSentItems": True
    }

    send_url = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"

    max_retries = 3
    token_refreshed = False

    for attempt in range(1, max_retries + 1):
        try:
            token = get_graph_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

            resp = requests.post(send_url, json=request_body, headers=headers, timeout=25)

            # Sucesso esperado: 202 Accepted (ou 200/204)
            if resp.status_code in (200, 202, 204):
                logger.info(f"E-mail enviado com sucesso via Microsoft Graph para {to_recipients} a partir de {sender}")
                return True

            # 401 Unauthorized: token expirado ou inválido -> renova uma vez
            if resp.status_code == 401 and not token_refreshed:
                token_refreshed = True
                logger.warning("Token do Microsoft Graph inválido/expirado (401). Renovando token e tentando novamente...")
                get_graph_access_token(force_refresh=True)
                continue

            # 403 Forbidden: ErrorAccessDenied
            if resp.status_code == 403:
                err_msg = (
                    f"Acesso negado (403 ErrorAccessDenied) ao enviar e-mail a partir de '{sender}': "
                    "a caixa informada na variável AZURE_MAIL_SENDER está fora da liberação ou sem o papel "
                    "'Application Mail.Send' concedido no Exchange Online (RBAC para aplicativos)."
                )
                logger.error(err_msg)
                raise PermissionError(err_msg)

            # 429 Too Many Requests ou 5xx Server Error: retry com backoff
            if resp.status_code == 429 or (500 <= resp.status_code < 600):
                if attempt < max_retries:
                    retry_after = resp.headers.get("Retry-After")
                    if retry_after and retry_after.isdigit():
                        wait_sec = min(int(retry_after), 10)
                    else:
                        wait_sec = 2 ** (attempt - 1)
                    logger.warning(
                        f"Microsoft Graph retornou status {resp.status_code} na tentativa {attempt}/{max_retries}. "
                        f"Aguardando {wait_sec}s antes de tentar novamente..."
                    )
                    time.sleep(wait_sec)
                    continue
                else:
                    logger.error(
                        f"Falha ao enviar e-mail via Microsoft Graph após {max_retries} tentativas (Status {resp.status_code})."
                    )
                    return False

            # Outros erros (ex: 400 Bad Request, 404 Mailbox Not Found)
            logger.error(
                f"Erro no envio de e-mail via Microsoft Graph (Status {resp.status_code}): {resp.text}"
            )
            return False

        except PermissionError:
            raise
        except Exception as exc:
            logger.error(f"Exceção na tentativa {attempt}/{max_retries} ao enviar via Microsoft Graph: {exc}")
            if attempt < max_retries:
                time.sleep(2 ** (attempt - 1))
            else:
                return False

    return False


# ==============================================================================
# SMTP FALLBACK (CASO O GRAPH NÃO ESTEJA CONFIGURADO)
# ==============================================================================
def _send_smtp_mail(
    subject: str,
    html_content: str,
    text_content: str,
    to_recipients: list[str],
    attachments: list[dict] = None
) -> bool:
    """
    Fallback de envio via SMTP caso o servidor SMTP esteja configurado.
    """
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    sender = get_sender_email()
    tls = os.environ.get("SMTP_TLS", "true").lower() in ("true", "1", "yes")

    if not (host and sender):
        logger.warning("SMTP não totalmente configurado (necessário SMTP_HOST e remetente).")
        return False

    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = ", ".join(to_recipients)

        body_part = MIMEMultipart("alternative")
        if text_content:
            body_part.attach(MIMEText(text_content, "plain", "utf-8"))
        if html_content:
            body_part.attach(MIMEText(html_content, "html", "utf-8"))
        msg.attach(body_part)

        if attachments:
            for att in attachments:
                b64_content = att.get("contentBytes", "")
                filename = att.get("name", "anexo.pdf")
                raw_data = base64.b64decode(b64_content)
                mime_att = MIMEApplication(raw_data, _subtype="pdf")
                mime_att.add_header("Content-Disposition", "attachment", filename=filename)
                msg.attach(mime_att)

        with smtplib.SMTP(host, port, timeout=15) as server:
            if tls:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(sender, to_recipients, msg.as_string())

        logger.info(f"E-mail enviado via SMTP com sucesso para {to_recipients}")
        return True
    except Exception as exc:
        logger.error(f"Falha ao enviar e-mail via SMTP para {to_recipients}: {exc}")
        return False


# ==============================================================================
# DISPACHER PRINCIPAL
# ==============================================================================
def send_email(
    subject: str,
    html_content: str,
    text_content: str,
    to_recipients: list[str],
    attachments: list[dict] = None
) -> bool:
    """
    Ponto central de envio de e-mails:
    1. Se Microsoft Graph estiver configurado, envia via API do Graph.
    2. Se não, caso SMTP esteja configurado, envia via SMTP.
    3. Em ambiente local/sem credenciais, registra a simulação no log e retorna True.
    """
    valid_recipients = [r.strip() for r in to_recipients if r and "@" in r]
    if not valid_recipients:
        logger.warning(f"Nenhum destinatário válido informado para o e-mail: '{subject}'")
        return False

    if is_graph_configured():
        return _send_graph_mail(
            subject=subject,
            html_content=html_content,
            to_recipients=valid_recipients,
            attachments=attachments
        )
    elif is_smtp_configured():
        return _send_smtp_mail(
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            to_recipients=valid_recipients,
            attachments=attachments
        )
    else:
        logger.info(
            f"[SIMULAÇÃO E-MAIL] Para: {valid_recipients} | Assunto: {subject} "
            f"(AZURE_MAIL_SENDER e SMTP não configurados no ambiente)"
        )
        print(f"[E-mail Simulado] Para: {valid_recipients} | Assunto: {subject}")
        return True


# ==============================================================================
# FUNÇÕES DE NEGÓCIO DE E-MAIL
# ==============================================================================
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
    Todos os dados do usuário são sanitizados via html.escape para segurança.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para o usuário {user_name} ({user_email})")
        return False

    safe_user_name = html.escape(str(user_name or "Colaborador"))
    safe_description = html.escape(str(description or ""))
    safe_rejection_reason = html.escape(str(rejection_reason or "Não informado"))
    safe_reviewer_name = html.escape(str(reviewer_name or "Avaliador"))

    subject = f"[Reembolso] Despesa #{expense_id} foi Reprovada"

    html_content = f"""<!DOCTYPE html>
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
      <p>Olá, <strong>{safe_user_name}</strong>,</p>
      <p>Informamos que a sua solicitação de reembolso abaixo foi reprovada na etapa de avaliação:</p>
      
      <div class="info-box">
        <strong style="color: #991b1b;">Motivo da Reprovação:</strong><br>
        <span style="color: #b91c1c; font-size: 14px; margin-top: 4px; display: inline-block;">{safe_rejection_reason}</span>
      </div>

      <table class="detail-table">
        <tr>
          <td class="detail-label">ID da Despesa:</td>
          <td class="detail-value">#{expense_id}</td>
        </tr>
        <tr>
          <td class="detail-label">Descrição:</td>
          <td class="detail-value">{safe_description}</td>
        </tr>
        <tr>
          <td class="detail-label">Valor:</td>
          <td class="detail-value">R$ {amount:.2f}</td>
        </tr>
        <tr>
          <td class="detail-label">Avaliador:</td>
          <td class="detail-value">{safe_reviewer_name}</td>
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
</html>"""

    text_content = (
        f"Olá {user_name},\n\n"
        f"Sua despesa #{expense_id} ({description}) no valor de R$ {amount:.2f} foi reprovada.\n\n"
        f"Motivo: {rejection_reason}\n"
        f"Avaliador: {reviewer_name}\n\n"
        f"Acesse o sistema para efetuar a correção e reenvio."
    )

    return send_email(
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_recipients=[user_email]
    )


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
    Envia relatório consolidado por e-mail com o arquivo PDF anexado.
    Permite anexar o arquivo diretamente via Microsoft Graph API (contentBytes base64).
    Todos os campos dinâmicos são tratados com html.escape.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para {user_name} ({user_email})")
        return False

    safe_user_name = html.escape(str(user_name or ""))
    safe_report_name = html.escape(str(report_name or "Relatório"))
    safe_payment_info = html.escape(str(payment_info_text or ""))

    subject = custom_subject or f"Reembolso ({report_name})"

    if custom_body:
        text_content = custom_body
        escaped_lines = [html.escape(line) for line in custom_body.replace("\r\n", "\n").split("\n")]
        formatted_body_html = "<br>".join(escaped_lines)
    else:
        text_content = (
            f"Olá {user_name},\n\n"
            f"Segue relatório de reembolso de despesas para sua conferência.\n"
            f"{payment_info_text}\n\n"
            f"Nos avise qualquer divergência.\n\n"
            f"Atenciosamente,\n"
            f"Moura Leite Loteamentos"
        )
        formatted_body_html = (
            f"Olá {safe_user_name},<br><br>"
            f"Segue relatório de reembolso de despesas para sua conferência.<br>"
            f"{safe_payment_info}<br><br>"
            f"Nos avise qualquer divergência.<br><br>"
            f"Atenciosamente,<br>"
            f"Moura Leite Loteamentos"
        )

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
        📎 Arquivo PDF anexado: <strong>{safe_report_name}.pdf</strong>
      </div>
    </div>
    <div class="footer">
      Moura Leite Loteamentos &bull; Sistema de Gestão de Reembolsos
    </div>
  </div>
</body>
</html>"""

    # Localização e leitura do PDF para anexo
    attachments = []
    actual_pdf = None
    if pdf_path:
        for p in (pdf_path, os.path.join("/tmp", pdf_path.lstrip("/")), os.path.join("/tmp/exports", os.path.basename(pdf_path))):
            if p and os.path.isfile(p):
                actual_pdf = p
                break

    if actual_pdf:
        try:
            with open(actual_pdf, "rb") as f:
                pdf_bytes = f.read()
            safe_name = "".join(c for c in report_name if c.isalnum() or c in (" ", "-", "_", ".")).strip()
            if not safe_name.lower().endswith(".pdf"):
                safe_name += ".pdf"

            attachments.append({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": safe_name,
                "contentType": "application/pdf",
                "contentBytes": base64.b64encode(pdf_bytes).decode("utf-8")
            })
        except Exception as e:
            logger.error(f"Erro ao processar anexo PDF '{actual_pdf}': {e}")

    return send_email(
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_recipients=[user_email],
        attachments=attachments
    )


def send_closing_dates_email(
    user_name: str,
    user_email: str,
    closing_date_str: str,
    month_year_str: str,
    custom_subject: str = None,
    custom_body: str = None
) -> bool:
    """
    Envia e-mail com lembrete de data de fechamento/corte de despesas.
    Todos os campos dinâmicos são sanitizados com html.escape.
    """
    if not user_email or "@" not in user_email:
        logger.warning(f"E-mail inválido ou não informado para {user_name} ({user_email})")
        return False

    safe_user_name = html.escape(str(user_name or ""))
    safe_closing_date = html.escape(str(closing_date_str or ""))

    subject = custom_subject or f"[Reembolso] Lembrete: Data de Fechamento de Despesas - {month_year_str}"

    if custom_body:
        text_content = custom_body
        escaped_lines = [html.escape(line) for line in custom_body.replace("\r\n", "\n").split("\n")]
        formatted_body_html = "<br>".join(escaped_lines)
    else:
        text_content = (
            f"Olá {user_name},\n\n"
            f"Lembramos que a data limite para lançamento e envio de todas as despesas de reembolso referentes ao período é {closing_date_str}.\n\n"
            f"Por favor, certifique-se de cadastrar e submeter todos os seus comprovantes no sistema até esta data para inclusão no próximo lote de aprovação e pagamento.\n\n"
            f"Nos avise qualquer dúvida ou divergência.\n\n"
            f"Atenciosamente,\n"
            f"Moura Leite Loteamentos"
        )
        formatted_body_html = (
            f"Olá {safe_user_name},<br><br>"
            f"Lembramos que a data limite para lançamento e envio de todas as despesas de reembolso referentes ao período é <strong>{safe_closing_date}</strong>.<br><br>"
            f"Por favor, certifique-se de cadastrar e submeter todos os seus comprovantes no sistema até esta data para inclusão no próximo lote de aprovação e pagamento.<br><br>"
            f"Nos avise qualquer dúvida ou divergência.<br><br>"
            f"Atenciosamente,<br>"
            f"Moura Leite Loteamentos"
        )

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

    return send_email(
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_recipients=[user_email]
    )
