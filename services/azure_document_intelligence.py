import os
import time
import logging
from typing import Dict, Any, Optional
from datetime import date, datetime

logger = logging.getLogger(__name__)

DEFAULT_ENDPOINT = "https://di-reembolsos-mouraleite.cognitiveservices.azure.com/"

_client = None

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
        from azure.identity import DefaultAzureCredential

        api_key = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_KEY")
        if api_key and api_key.strip():
            _client = DocumentAnalysisClient(endpoint=endpoint, credential=AzureKeyCredential(api_key.strip()))
            logger.info("Cliente Azure Document Intelligence inicializado com AzureKeyCredential de contingência.")
            return _client

        credential = DefaultAzureCredential()
        _client = DocumentAnalysisClient(endpoint=endpoint, credential=credential)
        logger.info("Cliente Azure Document Intelligence inicializado com DefaultAzureCredential (Entra ID).")
        return _client
    except Exception as e:
        logger.error(f"Erro ao inicializar cliente do Azure Document Intelligence: {e}")
        raise


def analyze_receipt(file_bytes: bytes, max_retries: int = 2) -> Dict[str, Any]:
    """
    Envia o stream de bytes do comprovante/recibo para o modelo pré-treinado 'prebuilt-receipt'
    do Azure AI Document Intelligence e extrai:
      - estabelecimento (MerchantName com fallback para MerchantAddress)
      - data (TransactionDate formatada em YYYY-MM-DD)
      - valorTotal (Total numérico float)

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
    valor_total: float = 0.0

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

        # 3. Valor Total: Total numérico
        total_field = fields.get("Total")
        if total_field and total_field.value is not None:
            try:
                valor_total = float(total_field.value)
            except (ValueError, TypeError):
                valor_total = 0.0

    return {
        "estabelecimento": estabelecimento or "",
        "data": data_formatada or "",
        "valorTotal": round(valor_total, 2)
    }


