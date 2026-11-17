import os
import re
import time
import logging
import unicodedata
from typing import Dict, Any, Optional, List, Tuple
from datetime import date, datetime, time as dtime

logger = logging.getLogger(__name__)

DEFAULT_ENDPOINT = "https://di-reembolsos-mouraleite.cognitiveservices.azure.com/"

_client = None
_azure_credential = None


def _get_azure_credential():
    """Retorna instância singleton de DefaultAzureCredential para reaproveitamento de token cache."""
    global _azure_credential
    if _azure_credential is None:
        from azure.identity import DefaultAzureCredential
        _azure_credential = DefaultAzureCredential()
    return _azure_credential


def get_document_analysis_client():
    """
    Retorna o DocumentAnalysisClient autenticado.
    Prioriza autenticação sem chave estática via Microsoft Entra ID (DefaultAzureCredential).
    Caso configurada no ambiente (ex: Vercel) a chave AZURE_DOCUMENT_INTELLIGENCE_KEY,
    utiliza-a como contingência caso o Service Principal ainda esteja pendente de IAM.
    """
    global _client
    if _client is not None:
        return _client

    endpoint = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", DEFAULT_ENDPOINT).strip()
    if not endpoint:
        endpoint = DEFAULT_ENDPOINT

    try:
        from azure.ai.formrecognizer import DocumentAnalysisClient
        from azure.core.credentials import AzureKeyCredential

        api_key = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_KEY")
        if api_key and api_key.strip():
            _client = DocumentAnalysisClient(endpoint=endpoint, credential=AzureKeyCredential(api_key.strip()))
            logger.info("Cliente Azure Document Intelligence inicializado com AzureKeyCredential de contingência.")
            return _client

        credential = _get_azure_credential()
        _client = DocumentAnalysisClient(endpoint=endpoint, credential=credential)
        logger.info("Cliente Azure Document Intelligence inicializado com DefaultAzureCredential (Entra ID).")
        return _client
    except Exception as e:
        logger.error(f"Erro ao inicializar cliente do Azure Document Intelligence: {e}")
        raise


def normalize_text(text: str) -> str:
    """Normaliza texto removendo acentos, convertendo para minúsculas e limpando espaços duplicados."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return re.sub(r"\s+", " ", ascii_str.lower().strip())


# Lista abrangente de termos de bebidas alcoólicas e marcas.
# Conforme solicitação, 'ice' e 'original' não são termos isolados para evitar falsos positivos
# com 'Ice Tea' ou 'Molho Original'.
_ALCOHOL_STANDALONE_TERMS = [
    # Categorias gerais
    "cerveja", "cervejas", "chopp", "chope", "choppinho", "choped", "cervejaria",
    "vinho", "vinhos", "espumante", "espumantes", "champagne", "champanhe", "prosecco",
    "whisky", "whiskey", "uisque", "uisques",
    "vodka", "vodcas", "vodca", "vodkas",
    "gin", "gins",
    "cachaca", "cachaça", "pinga", "pingas", "aguardente",
    "caipirinha", "caipirinhas", "caipiroska", "caipiroskas", "caipivodka",
    "conhaque", "conhaques", "licor", "licores", "rum", "runs", "tequila", "tequilas",
    "aperol", "campari", "vermute", "vermouth", "sidra", "sangria",
    "long neck", "longneck", "litrao", "litrão", "draft beer",
    # Coquetéis clássicos
    "negroni", "mojito", "margarita", "dry martini", "aperol spritz", "tinto de verano",
    # Uvas comuns de vinho
    "cabernet", "merlot", "malbec", "carmenere", "chardonnay", "sauvignon blanc",
    "pinot noir", "syrah", "shiraz", "tempranillo",
    # Marcas de cervejas nacionais e importadas
    "heineken", "amstel", "stella artois", "stella", "budweiser", "bud",
    "brahma", "skol", "antarctica", "bohemia", "corona", "spaten", "eisenbahn",
    "devassa", "baden baden", "colorado", "polar", "schin", "petra", "itaipava",
    "black princess", "blue moon", "guinness", "hoegaarden", "becks", "beck's",
    "tiger", "cerpa", "sol premium",
    # Marcas de destilados / licores
    "smirnoff", "absolut", "ciroc", "grey goose", "bacardi", "havana club",
    "johnnie walker", "red label", "black label", "gold label", "blue label",
    "jack daniels", "jack daniel's", "chivas", "chivas regal", "ballantines",
    "ballantine's", "jameson", "white horse", "passport scotch", "black & white",
    "tanqueray", "bombay", "bombay sapphire", "beefeater", "gordons", "gordon's",
    "hendrick's", "hendricks", "bulldog gin",
    "jagermeister", "jager", "amarula", "cointreau", "drambuie", "baileys", "malibu", "frangelico",
    "velho barreiro", "51", "pitu", "pitú", "ypioca", "ypióca", "sagatiba", "leblon",
    "salinas", "seleta", "boazinha"
]

# Padrões compostos para evitar falso positivo com palavras polissêmicas (ex: ice, original)
_ALCOHOL_COMPOSITE_PATTERNS = [
    r"\b(?:smirnoff|51|cabare|cabaré|syn|skol)\s+ice\b",
    r"\bice\s+(?:drink|balada|lemon|fruit)\b",
    r"\b(?:cerveja|antarctica|chopp|chope)\s+original\b"
]

_ALCOHOL_REGEX = re.compile(
    r"\b(?:" + "|".join(re.escape(normalize_text(t)) for t in _ALCOHOL_STANDALONE_TERMS) + r")\b|" +
    "|".join(_ALCOHOL_COMPOSITE_PATTERNS),
    re.IGNORECASE
)


def _detect_alcohol_in_text(text: str) -> Optional[str]:
    """Retorna o termo alcoólico detectado se encontrado no texto, ou None."""
    if not text:
        return None
    norm = normalize_text(text)
    m = _ALCOHOL_REGEX.search(norm)
    if m:
        return m.group(0)
    return None


def analyze_receipt(file_bytes: bytes, max_retries: int = 2) -> Dict[str, Any]:
    """
    Envia o stream de bytes do comprovante/recibo para o modelo pré-treinado 'prebuilt-receipt'
    do Azure AI Document Intelligence e extrai:
      - estabelecimento (MerchantName com fallback para MerchantAddress)
      - data (TransactionDate formatada em YYYY-MM-DD)
      - hora (TransactionTime formatada em HH:MM:SS)
      - valorTotal (Total numérico float)
      - cnpj (CNPJ extraído via TaxDetails ou regex no conteúdo)
      - chaveAcesso (Chave de 44 dígitos da NFC-e/SAT via regex)
      - itens (Lista de itens com descrição e valor)
      - alertas (Auditoria automática de bebidas alcoólicas e irregularidades)
      - has_alcohol (Boolean indicador)

    Trata limitação de taxa (HTTP 429) com retry e mensagem clara para o plano gratuito F0.
    Não registra dados pessoais extraídos nos logs.
    """
    client = get_document_analysis_client()

    from azure.core.exceptions import HttpResponseError

    attempt = 0
    result = None

    while attempt <= max_retries:
        try:
            poller = client.begin_analyze_document(
                model_id="prebuilt-receipt",
                document=file_bytes
            )
            result = poller.result()
            break
        except HttpResponseError as err:
            status_code = getattr(err, "status_code", None)
            if status_code == 429 and attempt < max_retries:
                attempt += 1
                wait_time = attempt * 2
                logger.warning(f"Limite de taxa (429) no Azure Document Intelligence. Aguardando {wait_time}s para nova tentativa ({attempt}/{max_retries})...")
                time.sleep(wait_time)
                continue
            elif status_code == 429:
                logger.error("Cota de chamadas/páginas excedida no plano gratuito (F0) do Azure Document Intelligence.")
                raise ValueError("Limite de leitura de comprovantes (cota do plano gratuito F0) atingido no Azure. Por favor, preencha os dados manualmente.")
            else:
                logger.error(f"Erro na API do Azure Document Intelligence (status {status_code}): {err.message if hasattr(err, 'message') else err}")
                raise

    estabelecimento: Optional[str] = None
    data_formatada: Optional[str] = None
    hora_formatada: Optional[str] = None
    valor_total: float = 0.0
    cnpj: Optional[str] = None
    chave_acesso: Optional[str] = None
    itens_extraidos: List[Dict[str, Any]] = []
    alertas: List[str] = []
    has_alcohol: bool = False

    raw_content = ""
    if result:
        raw_content = getattr(result, "content", "") or ""

    if result and result.documents:
        receipt = result.documents[0]
        fields = receipt.fields

        # 1. Estabelecimento: MerchantName com fallback para MerchantAddress
        merchant_name_field = fields.get("MerchantName")
        if merchant_name_field and merchant_name_field.value:
            estabelecimento = str(merchant_name_field.value).strip()
        else:
            merchant_address_field = fields.get("MerchantAddress")
            if merchant_address_field:
                val = merchant_address_field.value or merchant_address_field.content
                if val:
                    estabelecimento = str(val).strip()

        # 2. Data: TransactionDate formatada em YYYY-MM-DD
        date_field = fields.get("TransactionDate")
        if date_field and date_field.value:
            d_val = date_field.value
            if isinstance(d_val, (date, datetime)):
                data_formatada = d_val.strftime("%Y-%m-%d")
            elif isinstance(d_val, str):
                try:
                    parsed_d = datetime.fromisoformat(d_val.replace("Z", "+00:00"))
                    data_formatada = parsed_d.strftime("%Y-%m-%d")
                except Exception:
                    data_formatada = d_val[:10]

        # 3. Horário: TransactionTime
        time_field = fields.get("TransactionTime")
        if time_field and time_field.value:
            t_val = time_field.value
            if isinstance(t_val, dtime):
                hora_formatada = t_val.strftime("%H:%M:%S")
            elif isinstance(t_val, (datetime,)):
                hora_formatada = t_val.strftime("%H:%M:%S")
            elif isinstance(t_val, str):
                hora_formatada = t_val.strip()

        # 4. Valor Total: Total numérico
        total_field = fields.get("Total")
        if total_field and total_field.value is not None:
            try:
                valor_total = float(total_field.value)
            except (ValueError, TypeError):
                valor_total = 0.0

        # 5. CNPJ via TaxDetails
        tax_details = fields.get("TaxDetails")
        if tax_details and tax_details.value:
            for td in (tax_details.value if isinstance(tax_details.value, list) else [tax_details]):
                td_val = getattr(td, "value", None) or getattr(td, "content", "")
                if isinstance(td_val, dict):
                    td_val = td_val.get("TaxId", "") or td_val.get("Description", "")
                c_match = re.search(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", str(td_val))
                if c_match:
                    cnpj = re.sub(r"\D", "", c_match.group(0))
                    break

        # 6. Itens e Detecção de Bebidas Alcoólicas
        items_field = fields.get("Items")
        seen_alcohol_items = set()

        if items_field and items_field.value and isinstance(items_field.value, list):
            for item in items_field.value:
                item_dict = item.value if hasattr(item, "value") and isinstance(item.value, dict) else {}
                desc_obj = item_dict.get("Description")
                price_obj = item_dict.get("TotalPrice") or item_dict.get("Price")

                desc = ""
                if desc_obj:
                    desc = str(desc_obj.value or desc_obj.content or "").strip()
                elif hasattr(item, "content"):
                    desc = str(item.content or "").strip()

                price = None
                if price_obj and price_obj.value is not None:
                    try:
                        price = float(price_obj.value)
                    except (ValueError, TypeError):
                        price = None

                if desc:
                    itens_extraidos.append({"descricao": desc, "valor": price})
                    matched = _detect_alcohol_in_text(desc)
                    if matched and desc.lower() not in seen_alcohol_items:
                        seen_alcohol_items.add(desc.lower())
                        has_alcohol = True
                        if price is not None and price > 0:
                            alertas.append(f"Item suspeito de bebida alcoólica: {desc} (R$ {price:.2f})")
                        else:
                            alertas.append(f"Item suspeito de bebida alcoólica: {desc}")

    # Fallback / Complemento de CNPJ e Horário via conteúdo textual
    if not cnpj and raw_content:
        cnpj_match = re.search(r"\b(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})\b", raw_content)
        if cnpj_match:
            cnpj = re.sub(r"\D", "", cnpj_match.group(1))

    if not hora_formatada and raw_content:
        time_match = re.search(r"\b([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b", raw_content)
        if time_match:
            hora_formatada = time_match.group(0)

    # 7. Chave de Acesso (44 dígitos da NFC-e/SAT) via regex no conteúdo
    if raw_content:
        # Busca 44 dígitos que podem estar espaçados em grupos de 4 dígitos (padrão Danfe NFC-e)
        key_match = re.search(r"(?:\b|\D)((?:\d[\s.-]*){44})(?:\b|\D)", raw_content)
        if key_match:
            clean_key = re.sub(r"\D", "", key_match.group(1))
            if len(clean_key) == 44:
                chave_acesso = clean_key

    # Se nenhum item foi parseado nativamente no Items, escaneia linhas textuais para não perder bebidas alcoólicas
    if not itens_extraidos and raw_content:
        for line in raw_content.splitlines():
            line_str = line.strip()
            if not line_str or len(line_str) < 3:
                continue
            matched = _detect_alcohol_in_text(line_str)
            if matched and line_str.lower() not in seen_alcohol_items:
                seen_alcohol_items.add(line_str.lower())
                has_alcohol = True
                # Tenta extrair valor no final da linha se houver
                val_m = re.search(r"R?\$?\s*(\d{1,4}[.,]\d{2})$", line_str)
                if val_m:
                    val_str = val_m.group(1).replace(".", "").replace(",", ".")
                    try:
                        p = float(val_str)
                        alertas.append(f"Item suspeito de bebida alcoólica: {line_str} (R$ {p:.2f})")
                        continue
                    except:
                        pass
                alertas.append(f"Item suspeito de bebida alcoólica: {line_str}")

    logger.info("Análise do comprovante finalizada com sucesso pelo Azure Document Intelligence.")

    return {
        "estabelecimento": estabelecimento or "",
        "data": data_formatada or "",
        "hora": hora_formatada or "",
        "valorTotal": round(valor_total, 2),
        "cnpj": cnpj or "",
        "chaveAcesso": chave_acesso or "",
        "itens": itens_extraidos,
        "alertas": alertas,
        "has_alcohol": bool(has_alcohol)
    }


