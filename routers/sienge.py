import urllib.request
import urllib.error
import base64
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, auth

router = APIRouter(prefix="/api/sienge", tags=["sienge"])

BASE_URL = "https://api.sienge.com.br/mouraleite/public/api/v1"
USERNAME = "mouraleite-contas-a-pagar"
PASSWORD = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj"

def _get_auth_header():
    auth_str = f"{USERNAME}:{PASSWORD}"
    b64_auth = base64.b64encode(auth_str.encode('ascii')).decode('ascii')
    return f"Basic {b64_auth}"

@router.get("/creditors/{creditor_id}/bank-informations")
def get_creditor_bank_informations(
    creditor_id: int,
    limit: int = 200,
    offset: int = 0
):
    url = f"{BASE_URL}/creditors/{creditor_id}/bank-informations?limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data
    except urllib.error.HTTPError as e:
        try:
            error_body = e.read().decode()
        except:
            error_body = str(e)
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/creditors/{creditor_id}/pix-informations")
def get_creditor_pix_informations(
    creditor_id: int,
    limit: int = 200,
    offset: int = 0
):
    url = f"{BASE_URL}/creditors/{creditor_id}/pix-informations?limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data
    except urllib.error.HTTPError as e:
        try:
            error_body = e.read().decode()
        except:
            error_body = str(e)
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import re
import time
import threading

_creditors_cache = []
_creditors_cache_time = 0
_is_warming_up = False

def _get_all_creditors_cached():
    global _creditors_cache, _creditors_cache_time, _is_warming_up
    if _creditors_cache and (time.time() - _creditors_cache_time < 600):
        return _creditors_cache

    if _is_warming_up and _creditors_cache:
        return _creditors_cache

    _is_warming_up = True
    try:
        all_creditors = []
        offset = 0
        limit = 200
        auth_header = _get_auth_header()
        while len(all_creditors) < 6000:
            url = f"{BASE_URL}/creditors?limit={limit}&offset={offset}"
            req = urllib.request.Request(url)
            req.add_header('Authorization', auth_header)
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                results = data.get("results", [])
                if not results:
                    break
                all_creditors.extend(results)
                if len(results) < limit:
                    break
                offset += limit
        if all_creditors:
            _creditors_cache = all_creditors
            _creditors_cache_time = time.time()
    except Exception as e:
        print(f"Error caching Sienge creditors: {e}")
    finally:
        _is_warming_up = False

    return _creditors_cache

def warmup_creditors_in_background():
    threading.Thread(target=_get_all_creditors_cached, daemon=True).start()

# Warmup cache in background on import
warmup_creditors_in_background()

@router.get("/creditors/search")
def search_creditors(query: str = ""):
    query = query.strip()
    if not query:
        return []

    creditors = _get_all_creditors_cached()
    results = []

    if query.isdigit():
        q_id = int(query)
        for c in creditors:
            c_id = c.get("id")
            if c_id == q_id or str(c_id).startswith(query):
                results.append({"id": c_id, "name": c.get("name"), "cpf": c.get("cpf"), "cnpj": c.get("cnpj")})
        return results[:30]

    raw_parts = [p.strip() for p in re.split(r'[% ]+', query) if p.strip()]
    if not raw_parts:
        return []

    pattern_parts = [re.escape(part) for part in raw_parts]
    regex_str = ".*".join(pattern_parts)
    try:
        regex = re.compile(regex_str, re.IGNORECASE)
    except Exception:
        regex = re.compile(re.escape(query), re.IGNORECASE)

    for c in creditors:
        name = c.get("name") or ""
        trade = c.get("tradeName") or ""
        if regex.search(name) or regex.search(trade):
            results.append({"id": c.get("id"), "name": name, "tradeName": trade, "cpf": c.get("cpf"), "cnpj": c.get("cnpj")})

    return results[:50]

@router.get("/creditors/{creditor_id}")
def get_creditor(
    creditor_id: int
):
    url = f"{BASE_URL}/creditors/{creditor_id}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data
    except urllib.error.HTTPError as e:
        try:
            error_body = e.read().decode()
        except:
            error_body = str(e)
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def fetch_all_sienge_cost_centers():
    """
    Busca todos os centros de custo da API do Sienge utilizando paginação,
    já que o Sienge limita cada requisição a no máximo 200 registros.
    """
    all_results = []
    offset = 0
    page_size = 200
    auth_header = _get_auth_header()
    while True:
        url = f"{BASE_URL}/cost-centers?limit={page_size}&offset={offset}"
        req = urllib.request.Request(url)
        req.add_header('Authorization', auth_header)
        req.add_header('Accept', 'application/json')
        with urllib.request.urlopen(req, timeout=25) as response:
            res_data = json.loads(response.read().decode('utf-8', errors='replace'))
            batch = res_data.get("results", []) if isinstance(res_data, dict) else res_data
            if not batch:
                break
            all_results.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    return all_results

@router.get("/cost-centers")
def get_cost_centers(limit: int = 500, offset: int = 0, db: Session = Depends(get_db)):
    try:
        if offset == 0 and limit >= 200:
            results = fetch_all_sienge_cost_centers()
        else:
            url = f"{BASE_URL}/cost-centers?limit={limit}&offset={offset}"
            req = urllib.request.Request(url)
            req.add_header('Authorization', _get_auth_header())
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=15) as response:
                res_data = json.loads(response.read().decode('utf-8', errors='replace'))
                results = res_data.get("results", [])
        
        db_ccs = {str(c.code): c for c in db.query(models.CostCenter).all()}
        companies_by_code = {str(c.code): c.id for c in db.query(models.Company).all()}
        
        for cc in results:
            c_id_str = str(cc.get("id", ""))
            c_db = db_ccs.get(c_id_str)
            if c_db:
                cc["active"] = c_db.active
                cc["company_id"] = c_db.company_id
            else:
                cc["active"] = True
                sienge_comp = cc.get("idCompany")
                cc["company_id"] = companies_by_code.get(str(sienge_comp)) if sienge_comp is not None else None

        return results
    except urllib.error.HTTPError as e:
        db_ccs = db.query(models.CostCenter).all()
        if db_ccs:
            return [{"id": c.code, "code": c.code, "name": c.name, "company_id": c.company_id, "active": c.active} for c in db_ccs]
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {e.read().decode(errors='ignore')}")
    except Exception as e:
        db_ccs = db.query(models.CostCenter).all()
        if db_ccs:
            return [{"id": c.code, "code": c.code, "name": c.name, "company_id": c.company_id, "active": c.active} for c in db_ccs]
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cost-centers/sync")
def sync_cost_centers(db: Session = Depends(get_db)):
    try:
        results = fetch_all_sienge_cost_centers()
        companies_by_code = {str(c.code): c.id for c in db.query(models.Company).all()}
        
        synced_count = 0
        for cc_item in results:
            cc_id_str = str(cc_item.get("id", ""))
            cc_name = cc_item.get("name", "")
            if not cc_name or not cc_id_str:
                continue
            
            sienge_comp_code = str(cc_item.get("idCompany")) if cc_item.get("idCompany") is not None else None
            matched_company_id = companies_by_code.get(sienge_comp_code) if sienge_comp_code else None

            existing = db.query(models.CostCenter).filter(
                models.CostCenter.code == cc_id_str
            ).first()
            if not existing and cc_name:
                existing = db.query(models.CostCenter).filter(
                    models.CostCenter.name == cc_name
                ).first()
            
            if not existing:
                new_cc = models.CostCenter(
                    code=cc_id_str,
                    name=cc_name,
                    company_id=matched_company_id,
                    active=True
                )
                db.add(new_cc)
                synced_count += 1
            else:
                existing.code = cc_id_str
                existing.name = cc_name
                if existing.company_id is None and matched_company_id is not None:
                    existing.company_id = matched_company_id

        db.commit()
        return {"status": "synchronized", "synced": synced_count, "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/financial-plans")
def get_financial_plans(limit: int = 200, offset: int = 0):
    url = f"{BASE_URL}/payment-categories?limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            results = data.get("results", []) if isinstance(data, dict) else data
            filtered_data = []
            for item in results:
                item_id = str(item.get("id", ""))
                item_name = item.get("name", "")
                
                # Excluir receitas (iniciadas em 1)
                if item_id.startswith("1"):
                    continue
                # Excluir retenções (contém (-))
                if "(-)" in item_name:
                    continue
                # Excluir impostos (flag flImposto ou nome)
                if item.get("flImposto") == "S" or "IMPOSTO" in item_name.upper():
                    continue
                    
                filtered_data.append(item)
            return filtered_data
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {e.read().decode(errors='ignore')}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/financial-plans/sync")
def sync_financial_plans():
    return {"status": "synchronized"}

@router.get("/departments")
def get_departments(limit: int = 200, offset: int = 0):
    url = f"{BASE_URL}/departments?limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            results = data.get("results", []) if isinstance(data, dict) else data
            formatted = []
            for d in results:
                raw_id = d.get("departmentId") or d.get("id")
                try:
                    d_id = int(raw_id)
                except (ValueError, TypeError):
                    d_id = str(raw_id or "")
                formatted.append({
                    "id": d_id,
                    "name": d.get("departmentName") or d.get("name", ""),
                    "active": True
                })
            return formatted
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {e.read().decode(errors='ignore')}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/departments/sync")
def sync_departments():
    return {"status": "synchronized"}


@router.get("/companies")
def get_companies(limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    url = f"{BASE_URL}/companies?limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', _get_auth_header())
    req.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode('utf-8', errors='replace'))
            results = res_data.get("results", []) if isinstance(res_data, dict) else res_data
            
            # Map status from database
            db_companies = {str(c.code): c for c in db.query(models.Company).all()}
            for comp in results:
                c_id_str = str(comp.get("id", ""))
                c_db = db_companies.get(c_id_str)
                comp["active"] = c_db.active if c_db else True
            
            return results
    except urllib.error.HTTPError as e:
        db_companies = db.query(models.Company).all()
        if db_companies:
            return [{"id": c.code, "code": c.code, "name": c.name, "tradeName": c.trade_name, "cnpj": c.cnpj, "active": c.active} for c in db_companies]
        raise HTTPException(status_code=e.code, detail=f"Erro da API Sienge: {e.read().decode(errors='ignore')}")
    except Exception as e:
        db_companies = db.query(models.Company).all()
        if db_companies:
            return [{"id": c.code, "code": c.code, "name": c.name, "tradeName": c.trade_name, "cnpj": c.cnpj, "active": c.active} for c in db_companies]
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/companies/sync")
def sync_companies(db: Session = Depends(get_db)):
    try:
        url = f"{BASE_URL}/companies?limit=500&offset=0"
        req = urllib.request.Request(url)
        req.add_header('Authorization', _get_auth_header())
        req.add_header('Accept', 'application/json')
        
        with urllib.request.urlopen(req, timeout=20) as response:
            res_data = json.loads(response.read().decode('utf-8', errors='replace'))
            results = res_data.get("results", []) if isinstance(res_data, dict) else res_data
            
            synced_count = 0
            for c_item in results:
                c_id_str = str(c_item.get("id", ""))
                c_name = c_item.get("name", "")
                c_trade = c_item.get("tradeName", "")
                c_cnpj = c_item.get("cnpj", "")
                if not c_name and not c_trade:
                    continue
                
                existing = db.query(models.Company).filter(
                    (models.Company.code == c_id_str) | (models.Company.name == c_name)
                ).first()
                
                if not existing:
                    new_comp = models.Company(
                        code=c_id_str,
                        name=c_name or c_trade,
                        trade_name=c_trade,
                        cnpj=c_cnpj,
                        active=True
                    )
                    db.add(new_comp)
                    synced_count += 1
                else:
                    existing.code = c_id_str
                    existing.name = c_name or existing.name
                    existing.trade_name = c_trade or existing.trade_name
                    existing.cnpj = c_cnpj or existing.cnpj

            db.commit()
            return {"status": "synchronized", "synced": synced_count, "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


