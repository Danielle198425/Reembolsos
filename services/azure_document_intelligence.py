import os
import logging
from typing import Dict, Any, Optional
from datetime import date, datetime

logger = logging.getLogger(__name__)

_client = None

def get_document_analysis_client():
    """
    Retorna o DocumentAnalysisClient autenticado via DefaultAzureCredential.
    Utiliza as credenciais do Microsoft Entra ID configuradas no ambiente
    (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) sem necessidade de API Key estática.
    """
    global _client
    if _client is not None:
        return _client

    endpoint = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    if not endpoint:
        raise ValueError(
            "Variável de ambiente AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT não configurada."
        )

    endpoint = endpoint.strip()
    try:
        from azure.identity import DefaultAzureCredential
        from azure.ai.formrecognizer import DocumentAnalysisClient

        credential = DefaultAzureCredential()
        _client = DocumentAnalysisClient(endpoint=endpoint, credential=credential)
        return _client
    except Exception as e:
        logger.error(f"Erro ao inicializar cliente do Azure Document Intelligence: {e}")
        raise


def analyze_receipt(file_bytes: bytes) -> Dict[str, Any]:
    """
    Envia o stream de bytes do comprovante/recibo para o modelo pré-treinado 'prebuilt-receipt'
    do Azure AI Document Intelligence e extrai:
      - estabelecimento (MerchantName com fallback para MerchantAddress)
      - data (TransactionDate formatada em YYYY-MM-DD)
      - valorTotal (Total numérico float)
    """
    client = get_document_analysis_client()

    poller = client.begin_analyze_document(
        model_id="prebuilt-receipt",
        document=file_bytes
    )
    result = poller.result()

    estabelecimento: Optional[str] = None
    data_formatada: Optional[str] = None
    valor_total: float = 0.0

    if result.documents:
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
