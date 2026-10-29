import base64
import json
import logging
import os
import tempfile
import time
from datetime import datetime, date
from typing import Dict, List, Optional, Tuple, Any

try:
    import requests
except ImportError:
    import urllib.request
    import urllib.error
    import urllib.parse

    class _UrllibResponse:
        def __init__(self, status_code, content, headers=None):
            self.status_code = status_code
            self.content = content
            self.text = content.decode("utf-8", errors="replace") if isinstance(content, (bytes, bytearray)) else str(content or "")
            self.headers = headers or {}

        def json(self):
            return json.loads(self.text)

        def raise_for_status(self):
            if 400 <= self.status_code < 600:
                raise RuntimeError(f"HTTP Error {self.status_code}: {self.text}")

    class _RequestsFallback:
        @staticmethod
        def get(url, headers=None, timeout=30):
            req = urllib.request.Request(url, headers=headers or {})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return _UrllibResponse(resp.status, resp.read(), dict(resp.headers))
            except urllib.error.HTTPError as e:
                return _UrllibResponse(e.code, e.read(), dict(e.headers))

        @staticmethod
        def post(url, headers=None, json=None, files=None, timeout=30):
            headers = dict(headers or {})
            data = None
            if files:
                boundary = "----WebKitFormBoundary" + hex(int(time.time() * 1000))[2:]
                headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
                body_parts = []
                for field, file_info in files.items():
                    filename, file_bytes, ctype = file_info
                    part = (
                        f"--{boundary}\r\n"
                        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
                        f"Content-Type: {ctype}\r\n\r\n"
                    ).encode("utf-8") + file_bytes + b"\r\n"
                    body_parts.append(part)
                body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))
                data = b"".join(body_parts)
            elif json is not None:
                import json as json_mod
                headers["Content-Type"] = "application/json"
                data = json_mod.dumps(json).encode("utf-8")

            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return _UrllibResponse(resp.status, resp.read(), dict(resp.headers))
            except urllib.error.HTTPError as e:
                return _UrllibResponse(e.code, e.read(), dict(e.headers))

        @staticmethod
        def patch(url, headers=None, json=None, timeout=30):
            headers = dict(headers or {})
            import json as json_mod
            data = json_mod.dumps(json).encode("utf-8") if json is not None else None
            req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return _UrllibResponse(resp.status, resp.read(), dict(resp.headers))
            except urllib.error.HTTPError as e:
                return _UrllibResponse(e.code, e.read(), dict(e.headers))

    requests = _RequestsFallback()

from sqlalchemy.orm import Session


import models
from pdf_generator import generate_export_pdf

logger = logging.getLogger(__name__)

BASE_URL = "https://api.sienge.com.br/mouraleite/public/api/v1"
USERNAME = "mouraleite-contas-a-pagar"
PASSWORD = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj"

MONTHS_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
}

_treasury_dept_id_cache: Optional[int] = None
_cost_center_company_cache: Dict[str, int] = {}


def get_auth_header() -> str:
    auth_str = f"{USERNAME}:{PASSWORD}"
    b64_auth = base64.b64encode(auth_str.encode("ascii")).decode("ascii")
    return f"Basic {b64_auth}"


def get_headers(content_type: str = "application/json") -> dict:
    h = {
        "Authorization": get_auth_header(),
        "Accept": "application/json",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def get_treasury_department_id() -> int:
    """Busca dinamicamente o ID do departamento 'Tesouraria' no Sienge."""
    global _treasury_dept_id_cache
    if _treasury_dept_id_cache is not None:
        return _treasury_dept_id_cache

    url = f"{BASE_URL}/departments?limit=200&offset=0"
    resp = requests.get(url, headers=get_headers(), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results", []) if isinstance(data, dict) else data

    for d in results:
        name = (d.get("name") or d.get("departmentName") or "").strip().lower()
        if "tesouraria" in name:
            raw_id = d.get("id") or d.get("departmentId")
            _treasury_dept_id_cache = int(raw_id)
            return _treasury_dept_id_cache

    # Fallback conhecido na base Moura Leite
    _treasury_dept_id_cache = 31
    return _treasury_dept_id_cache


def get_company_id_for_cost_center(cost_center_code: str, db: Optional[Session] = None) -> int:
    """Recupera o ID da empresa (debtorId) a partir do centro de custo."""
    cc_key = str(cost_center_code).strip()
    if cc_key in _cost_center_company_cache:
        return _cost_center_company_cache[cc_key]

    # 1. Tentar via Sienge API: GET /cost-centers/{id}
    try:
        url = f"{BASE_URL}/cost-centers/{cc_key}"
        resp = requests.get(url, headers=get_headers(), timeout=10)
        if resp.status_code == 200:
            cc_data = resp.json()
            comp_id = cc_data.get("idCompany") or cc_data.get("companyId")
            if comp_id is not None:
                comp_int = int(comp_id)
                _cost_center_company_cache[cc_key] = comp_int
                return comp_int
    except Exception as exc:
        logger.warning(f"Erro ao consultar centro de custo {cc_key} no Sienge: {exc}")

    # 2. Fallback via banco de dados local
    if db is not None:
        cc_db = db.query(models.CostCenter).filter(models.CostCenter.code == cc_key).first()
        if cc_db and cc_db.company and cc_db.company.code:
            try:
                comp_int = int(cc_db.company.code)
                _cost_center_company_cache[cc_key] = comp_int
                return comp_int
            except (ValueError, TypeError):
                pass

    # Padrão empresa 1
    return 1


def get_creditor_bank_info(creditor_id: int) -> Optional[dict]:
    """Consulta dados bancários do credor no Sienge via GET /creditors/{creditorId}/bank-informations."""
    url = f"{BASE_URL}/creditors/{creditor_id}/bank-informations?limit=100&offset=0"
    try:
        resp = requests.get(url, headers=get_headers(), timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", []) if isinstance(data, dict) else []
            if not results:
                return None
            # Vale a conta com defaultFlag = S, senão a primeira
            for r in results:
                if str(r.get("defaultFlag", "")).upper() == "S":
                    return r
            return results[0]
    except Exception as exc:
        logger.warning(f"Erro ao consultar bank-informations do credor {creditor_id}: {exc}")
    return None


def create_sienge_bill(payload: dict) -> str:
    """Envia o POST /bills e obtém o ID do título gerado."""
    url = f"{BASE_URL}/bills"
    resp = requests.post(url, headers=get_headers(), json=payload, timeout=25)

    if resp.status_code not in (200, 201):
        err_msg = resp.text
        try:
            err_json = resp.json()
            if "message" in err_json:
                err_msg = err_json["message"]
            elif "developerMessage" in err_json:
                err_msg = err_json["developerMessage"]
        except Exception:
            pass
        raise RuntimeError(f"Erro ao criar título no Sienge ({resp.status_code}): {err_msg}")

    # 1. Tentar ler do corpo
    try:
        body = resp.json()
        if isinstance(body, dict):
            bill_id = body.get("id") or body.get("billId")
            if bill_id:
                return str(bill_id)
    except Exception:
        pass

    # 2. Tentar ler do header Location
    loc = resp.headers.get("Location") or resp.headers.get("location")
    if loc:
        parts = loc.strip().rstrip("/").split("/")
        if parts:
            last = parts[-1]
            if last.isdigit():
                return last

    # 3. Fallback: busca por documentNumber na data de hoje
    today_str = datetime.now().strftime("%Y-%m-%d")
    debtor = payload.get("debtorId")
    creditor = payload.get("creditorId")
    doc_num = payload.get("documentNumber")
    search_url = f"{BASE_URL}/bills?startDate={today_str}&endDate={today_str}&debtorId={debtor}&creditorId={creditor}"
    try:
        s_resp = requests.get(search_url, headers=get_headers(), timeout=15)
        if s_resp.status_code == 200:
            s_data = s_resp.json()
            results = s_data.get("results", []) if isinstance(s_data, dict) else s_data
            for b in results:
                if b.get("documentNumber") == doc_num:
                    found_id = b.get("id") or b.get("billId")
                    if found_id:
                        return str(found_id)
    except Exception as exc:
        logger.warning(f"Fallback search bills falhou: {exc}")

    raise RuntimeError("Título criado no Sienge, mas não foi possível recuperar seu número identificador.")


def wait_for_installment(bill_id: str, max_retries: int = 6, delays: Tuple[float, ...] = (1.5, 3.0, 4.5, 6.0, 7.5)) -> Optional[str]:
    """Consulta GET /bills/{billId}/installments até a parcela ser disponibilizada."""
    url = f"{BASE_URL}/bills/{bill_id}/installments"
    for i in range(max_retries):
        try:
            resp = requests.get(url, headers=get_headers(), timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                if results:
                    first = results[0]
                    p_id = first.get("installmentNumber") or first.get("id") or 1
                    return str(p_id)
        except Exception as exc:
            logger.warning(f"Tentativa {i+1} de obter parcela do título {bill_id} falhou: {exc}")

        delay = delays[i] if i < len(delays) else delays[-1]
        time.sleep(delay)

    return "1"  # Fallback: parcela 1


def set_installment_payment_info(bill_id: str, installment_id: str, bank_info: Optional[dict], creditor_name: str) -> bool:
    """Aplica o PATCH de pagamento na parcela (PIX ou Transferência Bancária)."""
    if not bank_info:
        logger.info(f"Credor sem dados bancários cadastrados no Sienge. Parcela {installment_id} do título {bill_id} mantida sem forma de pagamento.")
        return False

    payment_form = str(bank_info.get("paymentForm") or "").strip().upper()
    is_pix = payment_form == "PIX"

    if is_pix:
        url = f"{BASE_URL}/bills/{bill_id}/installments/{installment_id}/payment-information/pix"
        payload = {
            "paymentTypeId": 17,
            "isUsingCreditorData": "S",
            "notes": "Pagamento via PIX (Chave padrão do Credor)",
        }
    else:
        url = f"{BASE_URL}/bills/{bill_id}/installments/{installment_id}/payment-information/bank-transfer"
        raw_agency = str(bank_info.get("agency") or "").strip()
        branch_num = raw_agency
        branch_digit = ""
        if "-" in raw_agency:
            parts = raw_agency.split("-", 1)
            branch_num, branch_digit = parts[0], parts[1]

        bank_code = str(bank_info.get("bank") or "").strip()
        bank_name = str(bank_info.get("nameOfBank") or "").strip()
        account_num = str(bank_info.get("accountNumber") or "").strip()
        account_digit = str(bank_info.get("checkDigit") or "").strip()
        account_type = str(bank_info.get("accountType") or "C").strip().upper()[:1]
        recipient = creditor_name or str(bank_info.get("nameOfRecipient") or "").strip()

        payload = {
            "paymentTypeId": 5,
            "beneficiaryAccountType": account_type if account_type in ("C", "P") else "C",
            "beneficiaryBankCode": bank_code,
            "beneficiaryBankBranchNumber": branch_num,
            "beneficiaryBankBranchDigit": branch_digit,
            "beneficiaryAccountNumber": account_num,
            "beneficiaryAccountDigit": account_digit,
            "beneficiaryName": recipient,
            "notes": f"Banco: {bank_code}-{bank_name}\nAgência: {raw_agency}\nConta: {account_num}-{account_digit}\nFavorecido: {recipient}",
        }

    # Tenta até 3 vezes com espera de 2s e 4s
    delays = (2.0, 4.0, 0.0)
    for attempt in range(3):
        try:
            resp = requests.patch(url, headers=get_headers(), json=payload, timeout=15)
            if resp.status_code in (200, 204):
                return True
            logger.warning(f"PATCH pagamento falhou (tentativa {attempt+1}): {resp.status_code} - {resp.text}")
        except Exception as exc:
            logger.warning(f"PATCH pagamento erro (tentativa {attempt+1}): {exc}")

        if attempt < 2:
            time.sleep(delays[attempt])

    return False


def upload_bill_attachment(bill_id: str, pdf_bytes: bytes, filename: str) -> bool:
    """Anexa o PDF do reembolso no título Sienge via POST multipart/form-data."""
    url = f"{BASE_URL}/bills/{bill_id}/attachments?description={filename}"
    headers = {
        "Authorization": get_auth_header(),
    }
    files = {
        "file": (filename, pdf_bytes, "application/pdf")
    }

    try:
        resp = requests.post(url, headers=headers, files=files, timeout=40)
        if resp.status_code in (200, 201, 204):
            return True
        logger.warning(f"Upload do PDF falhou para o título {bill_id}: {resp.status_code} - {resp.text}")
    except Exception as exc:
        logger.warning(f"Erro ao enviar anexo PDF para o título {bill_id}: {exc}")

    return False


def calculate_budget_categories_rateio(expenses: List[models.Expense], db: Optional[Session] = None) -> List[dict]:
    """Calcula o rateio proporcional de Centro de Custo e Plano Financeiro somando exatamente 100.0%."""
    from pdf_generator import get_effective_apportionment

    total_amount = sum(float(e.amount or 0) for e in expenses)
    if total_amount <= 0:
        total_amount = 1.0

    # Agrupar por (costCenterId, paymentCategoriesId)
    groups: Dict[Tuple[int, str], float] = {}
    for exp in expenses:
        cc_code_str = str(exp.cost_center.code if exp.cost_center else exp.cost_center_id).strip()
        try:
            cc_id = int(cc_code_str)
        except (ValueError, TypeError):
            cc_id = exp.cost_center_id

        cat_apportionment = get_effective_apportionment(exp, db=db)
        if not cat_apportionment and exp.category:
            cat_apportionment = exp.category.sienge_apportionment_id

        clean_cat = str(cat_apportionment or "").replace(".", "").strip()

        key = (cc_id, clean_cat)
        groups[key] = groups.get(key, 0.0) + float(exp.amount or 0)

    # Converter em percentuais
    items = []
    for (cc_id, cat_id), amt in groups.items():
        pct = round((amt / total_amount) * 100.0, 2)
        items.append({
            "costCenterId": cc_id,
            "paymentCategoriesId": cat_id,
            "percentage": pct
        })

    # Ajuste de centavos para garantir soma exata de 100.0
    if items:
        diff = round(100.0 - sum(i["percentage"] for i in items), 2)
        items[0]["percentage"] = round(items[0]["percentage"] + diff, 2)

    return items


def generate_expenses_pdf_bytes(expenses: List[models.Expense], report_name: str, company_name: Optional[str] = None) -> bytes:
    """Gera o arquivo PDF consolidado em memória usando o layout oficial de pdf_generator.py."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        generate_export_pdf(
            expenses=expenses,
            export_name=report_name,
            output_path=tmp_path,
            generator_name="Sistema Moura Leite",
            company_name=company_name,
            view_mode="category"
        )
        with open(tmp_path, "rb") as f:
            pdf_bytes = f.read()
        return pdf_bytes
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def get_payment_date_from_calendar(expenses: List[models.Expense], db: Session) -> date:
    """
    Determina a data de vencimento a partir do Calendário de Pagamentos (PaymentSchedule).
    A data de vencimento segue a Data Programada de Pagamento cadastrada no calendário.
    
    Ordem de resolução:
    1. Competência (mês/ano) da despesa mais recente do lote.
    2. Data de criação do relatório/exportação vinculado (se houver export_id).
    3. Mês e ano correntes (hoje).
    4. Próxima data de pagamento futura cadastrada (payment_date >= hoje).
    5. Agendamento mais recente cadastrado no calendário.
    Caso não exista nenhum agendamento cadastrado no sistema, retorna a data de hoje.
    """
    dates = [exp.expense_date for exp in expenses if exp.expense_date]
    latest_date = max(dates) if dates else date.today()

    # 1. Busca pelo mês e ano da despesa mais recente
    sched = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.year == latest_date.year,
        models.PaymentSchedule.month == latest_date.month
    ).first()
    if sched and sched.payment_date:
        return sched.payment_date

    # 2. Busca pelo mês e ano do relatório de exportação vinculado
    for exp in expenses:
        if exp.export_id:
            export_obj = db.query(models.Export).filter(models.Export.id == exp.export_id).first()
            if export_obj and export_obj.created_at:
                exp_sched = db.query(models.PaymentSchedule).filter(
                    models.PaymentSchedule.year == export_obj.created_at.year,
                    models.PaymentSchedule.month == export_obj.created_at.month
                ).first()
                if exp_sched and exp_sched.payment_date:
                    return exp_sched.payment_date

    # 3. Busca pelo mês e ano correntes
    now = datetime.now()
    cur_sched = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.year == now.year,
        models.PaymentSchedule.month == now.month
    ).first()
    if cur_sched and cur_sched.payment_date:
        return cur_sched.payment_date

    # 4. Busca pela próxima data de pagamento futura cadastrada
    future_sched = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.payment_date >= date.today()
    ).order_by(models.PaymentSchedule.payment_date.asc()).first()
    if future_sched and future_sched.payment_date:
        return future_sched.payment_date

    # 5. Agendamento mais recente existente no calendário
    last_sched = db.query(models.PaymentSchedule).order_by(
        models.PaymentSchedule.year.desc(),
        models.PaymentSchedule.month.desc()
    ).first()
    if last_sched and last_sched.payment_date:
        return last_sched.payment_date

    # Fallback seguro: data de hoje
    return date.today()


def process_sienge_bill_for_user_expenses(
    user: models.User,
    expenses: List[models.Expense],
    admin_user: models.User,
    db: Session,
    custom_due_date: Optional[str] = None
) -> dict:
    """Executa o fluxo completo do Integra para um conjunto de despesas de um único colaborador."""
    if not user.creditor_code:
        raise ValueError(f"O colaborador {user.name} ({user.email}) não possui código de credor Sienge configurado.")

    creditor_id = int(str(user.creditor_code).strip())

    # 1. Validar categorias sem plano financeiro (considerando regras de alteração)
    from pdf_generator import get_effective_apportionment
    for exp in expenses:
        effective_app = get_effective_apportionment(exp, db=db)
        if not effective_app and (not exp.category or not exp.category.sienge_apportionment_id):
            cat_name = exp.category.name if exp.category else f"ID #{exp.category_id}"
            raise ValueError(f"A categoria '{cat_name}' da despesa #{exp.id} não possui conta financeira Sienge configurada.")

    # 2. Competência mais recente
    dates = [exp.expense_date for exp in expenses if exp.expense_date]
    if not dates:
        dates = [date.today()]
    latest_date = max(dates)
    comp_mm_aaaa = f"{latest_date.month:02d}.{latest_date.year}"
    comp_extenso = f"{MONTHS_PT.get(latest_date.month, '')} {latest_date.year}"

    doc_number = f"Reembolso {comp_mm_aaaa}"
    notes = f"Reembolso Despesas Mensais referente {comp_extenso}"

    # 3. Empresa devedora: centro de custo de maior valor
    cc_sums: Dict[str, float] = {}
    for exp in expenses:
        cc_code = str(exp.cost_center.code if exp.cost_center else exp.cost_center_id).strip()
        cc_sums[cc_code] = cc_sums.get(cc_code, 0.0) + float(exp.amount or 0)

    top_cc_code = max(cc_sums.keys(), key=lambda k: cc_sums[k])
    debtor_id = get_company_id_for_cost_center(top_cc_code, db=db)

    # 4. Departamento: Tesouraria
    treasury_dept_id = get_treasury_department_id()

    # 5. Rateio de centros de custo e contas financeiras
    budget_cats = calculate_budget_categories_rateio(expenses, db=db)

    total_amount = round(sum(float(e.amount or 0) for e in expenses), 2)
    today_str = datetime.now().strftime("%Y-%m-%d")

    # 6. Data de vencimento (dueDate) pelo Calendário de Pagamentos
    if custom_due_date:
        try:
            from datetime import datetime as dt_cls
            resolved_due_date = dt_cls.strptime(custom_due_date, "%Y-%m-%d").date()
        except Exception:
            resolved_due_date = get_payment_date_from_calendar(expenses, db=db)
    else:
        resolved_due_date = get_payment_date_from_calendar(expenses, db=db)

    due_date_str = resolved_due_date.strftime("%Y-%m-%d")
    due_date_formatted = resolved_due_date.strftime("%d/%m/%Y")

    # 7. Montar payload do POST /bills
    payload = {
        "debtorId": debtor_id,
        "creditorId": creditor_id,
        "documentIdentificationId": "REEM",
        "documentNumber": doc_number,
        "issueDate": today_str,
        "installmentsNumber": 1,
        "indexId": 0,
        "baseDate": today_str,
        "dueDate": due_date_str,
        "billDate": today_str,
        "totalInvoiceAmount": total_amount,
        "notes": notes,
        "discount": 0,
        "budgetCategories": budget_cats,
        "departmentsCost": [
            {"departmentId": treasury_dept_id, "percentage": 100}
        ],
        "buildingsCost": [],
        "taxes": [],
        "units": []
    }

    # 8. Criar o título no Sienge
    bill_id = create_sienge_bill(payload)

    # 9. Informação de pagamento na primeira parcela
    installment_id = wait_for_installment(bill_id)
    bank_info = get_creditor_bank_info(creditor_id)
    payment_attached = set_installment_payment_info(bill_id, installment_id, bank_info, user.name)

    # 10. Anexo do relatório em PDF
    filename = f"reembolso-{latest_date.month:02d}-{latest_date.year}.pdf"
    pdf_uploaded = False
    try:
        pdf_bytes = generate_expenses_pdf_bytes(expenses, doc_number)
        pdf_uploaded = upload_bill_attachment(bill_id, pdf_bytes, filename)
    except Exception as exc:
        logger.warning(f"Erro ao gerar/enviar PDF para o título {bill_id}: {exc}")

    # 11. Atualizar despesas no banco de dados local
    now = datetime.utcnow()
    for exp in expenses:
        exp.status = models.ExpenseStatus.enviado
        exp.sienge_title = str(bill_id)
        exp.sienge_sent_at = now
        exp.sienge_sent_by = admin_user.id

        audit = models.AuditLog(
            action="SEND_SIENGE_TITLE",
            target_email=user.email,
            admin_id=admin_user.id,
            admin_name=admin_user.name,
            status="sucesso",
            details=f"Título REEM nº {bill_id} gerado no Sienge ({doc_number}) para a despesa #{exp.id}. Valor: R$ {exp.amount:.2f}. Vencimento: {due_date_formatted}."
        )
        db.add(audit)

    db.commit()

    return {
        "user_id": user.id,
        "user_name": user.name,
        "creditor_id": creditor_id,
        "bill_id": str(bill_id),
        "document_number": doc_number,
        "total_amount": total_amount,
        "expense_count": len(expenses),
        "payment_attached": payment_attached,
        "pdf_uploaded": pdf_uploaded,
        "due_date": due_date_str,
        "due_date_formatted": due_date_formatted,
    }


def is_situation_paid(situation: Optional[str]) -> bool:
    """
    Verifica se a situação da parcela no Sienge indica que foi paga.
    No Sienge:
      - PG: Paga / Totalmente paga (quitação total)
      - PC: Parcialmente paga
      - NP: Não paga
    Aceita variações 'PG', 'Totalmente paga', 'Paga', 'Pago', 'Liquidada', 'Baixada'.
    """
    if not situation:
        return False
    s = str(situation).strip().upper()
    return s in ("PG", "TOTALMENTE PAGA", "PAGA", "PAGO", "LIQUIDADA", "BAIXADA")


def get_bill_installments_info(
    bill_id: str,
    creditor_id: Optional[int] = None,
    doc_number: Optional[str] = None
) -> Tuple[str, List[dict]]:
    """
    Consulta as parcelas de um título no Sienge via GET /bills/{bill_id}/installments.
    Caso o endpoint retorne 404 e haja credor informado, realiza uma busca de contingência
    nos títulos recentes do credor para localizar o título correspondente.
    """
    url = f"{BASE_URL}/bills/{bill_id}/installments"
    try:
        resp = requests.get(url, headers=get_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            return str(bill_id), results
    except Exception as exc:
        logger.warning(f"Erro ao consultar parcelas do título {bill_id} no Sienge: {exc}")

    # Fallback: busca por credor e documento se o título retornar 404
    if creditor_id:
        today = datetime.now()
        start_date = f"{today.year}-{today.month:02d}-01"
        search_url = f"{BASE_URL}/bills?startDate={start_date}&endDate={today.strftime('%Y-%m-%d')}&creditorId={creditor_id}"
        try:
            s_resp = requests.get(search_url, headers=get_headers(), timeout=15)
            if s_resp.status_code == 200:
                s_data = s_resp.json()
                bills = s_data.get("results", []) if isinstance(s_data, dict) else s_data
                for b in bills:
                    b_doc = (b.get("documentNumber") or "").strip()
                    if (doc_number and b_doc == doc_number.strip()) or (not doc_number):
                        new_id = str(b.get("id"))
                        i_resp = requests.get(f"{BASE_URL}/bills/{new_id}/installments", headers=get_headers(), timeout=15)
                        if i_resp.status_code == 200:
                            i_data = i_resp.json()
                            results = i_data.get("results", []) if isinstance(i_data, dict) else (i_data if isinstance(i_data, list) else [])
                            return new_id, results
        except Exception as exc:
            logger.warning(f"Erro no fallback de consulta de títulos por credor: {exc}")

    return str(bill_id), []


def sync_expense_sienge_payment(
    expense: models.Expense,
    db: Session,
    current_user: Optional[models.User] = None
) -> dict:
    """
    Verifica a situação da parcela no Sienge (API de parcelas do contas a pagar).
    Se estiver 'PG' (Totalmente paga), atualiza o status da despesa para 'pago'
    e reflete no fluxo de aprovação.
    """
    # Determinar título Sienge a consultar
    bill_id = expense.sienge_title
    creditor_id = None
    if expense.user and expense.user.creditor_code:
        try:
            creditor_id = int(str(expense.user.creditor_code).strip())
        except Exception:
            pass

    doc_number = None
    if expense.expense_date:
        doc_number = f"Reembolso {expense.expense_date.month:02d}.{expense.expense_date.year}"

    if not bill_id and not creditor_id:
        return {
            "success": False,
            "updated": False,
            "message": "Despesa não possui título Sienge nem credor vinculado para verificação.",
            "status": expense.status.value if hasattr(expense.status, 'value') else expense.status
        }

    effective_bill_id, installments = get_bill_installments_info(
        bill_id or "0",
        creditor_id=creditor_id,
        doc_number=doc_number
    )

    if not installments:
        return {
            "success": True,
            "updated": False,
            "message": f"Nenhuma parcela encontrada para o título Sienge nº {effective_bill_id or bill_id}.",
            "bill_id": effective_bill_id,
            "status": expense.status.value if hasattr(expense.status, 'value') else expense.status
        }

    # Atualizar título na despesa se foi recuperado via fallback
    if effective_bill_id and effective_bill_id != expense.sienge_title and effective_bill_id != "0":
        expense.sienge_title = effective_bill_id

    # Analisar situações das parcelas
    situations = [inst.get("situation") for inst in installments if inst.get("situation")]
    primary_situation = situations[0] if situations else "Não identificada"
    is_paid = all(is_situation_paid(inst.get("situation")) for inst in installments)

    if is_paid:
        previous_status = expense.status.value if hasattr(expense.status, 'value') else expense.status
        now = datetime.utcnow()
        expense.status = models.ExpenseStatus.pago
        if not expense.paid_at:
            expense.paid_at = now
        if current_user and not expense.paid_by:
            expense.paid_by = current_user.id
            if current_user.role == models.UserRole.admin:
                expense.paid_by_admin_id = current_user.id
                expense.paid_by_admin_name = current_user.name

        # Registro em log de auditoria
        audit = models.AuditLog(
            action="SIENGE_PAYMENT_SYNC",
            target_email=expense.user.email if expense.user else None,
            admin_id=current_user.id if current_user else None,
            admin_name=current_user.name if current_user else "Sistema (Sienge API)",
            status="sucesso",
            details=f"Despesa #{expense.id} atualizada para PAGO após confirmação da parcela do título Sienge nº {effective_bill_id} (Situação: {primary_situation} - PG)."
        )
        db.add(audit)
        db.commit()
        db.refresh(expense)

        return {
            "success": True,
            "updated": True,
            "previous_status": previous_status,
            "new_status": "pago",
            "situation": primary_situation,
            "bill_id": effective_bill_id,
            "installments_count": len(installments),
            "message": f"Parcela quitada no Sienge ({primary_situation} - PG). Status atualizado para 'pago'."
        }

    return {
        "success": True,
        "updated": False,
        "situation": primary_situation,
        "bill_id": effective_bill_id,
        "installments_count": len(installments),
        "status": expense.status.value if hasattr(expense.status, 'value') else expense.status,
        "message": f"Situação da parcela no Sienge: {primary_situation}. Pagamento pendente de quitação total (PG)."
    }


def sync_all_pending_sienge_payments(
    db: Session,
    current_user: Optional[models.User] = None
) -> dict:
    """
    Varre todas as despesas no status 'enviado' (ou finalizadas com título Sienge)
    e sincroniza a situação de pagamento com o Sienge.
    """
    candidates = db.query(models.Expense).filter(
        (models.Expense.status == models.ExpenseStatus.enviado) |
        ((models.Expense.sienge_title != None) & (models.Expense.status != models.ExpenseStatus.pago))
    ).all()

    total_checked = 0
    total_updated = 0
    updated_expenses = []

    for exp in candidates:
        total_checked += 1
        try:
            res = sync_expense_sienge_payment(exp, db, current_user=current_user)
            if res.get("updated"):
                total_updated += 1
                updated_expenses.append({
                    "id": exp.id,
                    "user_name": exp.user.name if exp.user else "-",
                    "amount": exp.amount,
                    "bill_id": res.get("bill_id"),
                    "situation": res.get("situation")
                })
        except Exception as exc:
            logger.warning(f"Erro ao sincronizar despesa #{exp.id} com Sienge: {exc}")

    return {
        "total_checked": total_checked,
        "total_updated": total_updated,
        "updated_expenses": updated_expenses,
        "message": f"{total_updated} de {total_checked} despesa(s) atualizada(s) para 'pago' com base no Sienge."
    }

