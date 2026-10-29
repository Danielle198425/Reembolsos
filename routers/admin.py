import os
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, IS_SQLITE
import models, schemas, auth
import storage
import json
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── HELPERS ─────────────────────────────────────────────────────────────────
def _log_action(db: Session, action: str, target_email: str = None,
                admin=None, status: str = 'sucesso', details: str = None):
    """Record an audit log entry."""
    try:
        log = models.AuditLog(
            action=action,
            target_email=target_email,
            admin_id=admin.id if admin else None,
            admin_name=admin.name if admin else 'Sistema',
            status=status,
            details=details,
            timestamp=datetime.utcnow()
        )
        db.add(log)
        db.commit()
    except Exception:
        pass  # Never let logging break the main flow


_departments_map = None

def _get_department_info(dept_id: Optional[int]) -> Optional[dict]:
    """Recupera informações do departamento a partir do arquivo sincronizado do Sienge."""
    global _departments_map
    if not dept_id:
        return None
    if _departments_map is None:
        _departments_map = {}
        try:
            dept_file = os.path.join("static", "data", "departments.json")
            if os.path.exists(dept_file):
                with open(dept_file, "r", encoding="utf-8") as f:
                    depts = json.load(f)
                    for d in depts:
                        d_id = d.get("departmentId") or d.get("id")
                        d_name = d.get("departmentName") or d.get("name")
                        if d_id is not None and d_name:
                            try:
                                _departments_map[int(d_id)] = d_name.strip()
                            except (ValueError, TypeError):
                                pass
        except Exception:
            pass

    name = _departments_map.get(dept_id)
    if name:
        return {"id": dept_id, "name": name}
    return None


def _user_dict(u: models.User) -> dict:
    app_of = []
    if getattr(u, 'approver_of', None):
        try: app_of = json.loads(u.approver_of)
        except: pass
    elif u.cost_center_id:
        app_of = [u.cost_center_id]

    app_of_func = []
    if getattr(u, 'approver_of_functions', None):
        try: app_of_func = json.loads(u.approver_of_functions)
        except: pass
    elif u.job_function_id:
        app_of_func = [u.job_function_id]

    app_rules = []
    if getattr(u, 'approver_rules', None):
        try: app_rules = json.loads(u.approver_rules)
        except: pass

    dept_info = _get_department_info(u.cost_center_id)
    dept_name = dept_info["name"] if dept_info else (u.cost_center.name if u.cost_center else None)

    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": u.role.value if hasattr(u.role, 'value') else u.role,
        "cost_center_id": u.cost_center_id,
        "department_id": u.cost_center_id,
        "department_name": dept_name,
        "department": (
            {"id": u.cost_center_id, "name": dept_name}
            if dept_name else None
        ),
        "job_role_id": getattr(u, 'job_role_id', None),
        "job_function_id": getattr(u, 'job_function_id', None),
        "cost_center": (
            {"id": u.cost_center.id, "code": u.cost_center.code, "name": u.cost_center.name}
            if u.cost_center else None
        ),
        "job_role": (
            {"id": u.job_role.id, "name": u.job_role.name}
            if getattr(u, 'job_role', None) else None
        ),
        "job_function": (
            {"id": u.job_function.id, "name": u.job_function.name}
            if getattr(u, 'job_function', None) else None
        ),
        "active": u.active,
        "failed_attempts": getattr(u, 'failed_attempts', 0) or 0,
        "is_locked": getattr(u, 'is_locked', False) or False,
        "creditor_code": getattr(u, 'creditor_code', None),
        "approver_of": app_of,
        "approver_of_functions": app_of_func,
        "approver_rules": app_rules,
        "groups": [u.cost_center_id] if u.cost_center_id else [],
        "payment_method": u.payment_method,
        "pix_key": u.pix_key,
        "bank": u.bank,
        "agency": u.agency,
        "account": u.account,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


# ─── USERS ───────────────────────────────────────────────────────────────────
@router.get("/users")
def list_users(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    users = db.query(models.User).order_by(models.User.name).all()
    return [_user_dict(u) for u in users]


@router.get("/users/locked")
def list_locked_users(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Return users that are locked or have failed login attempts."""
    users = db.query(models.User).filter(
        (models.User.is_locked == True) | (models.User.failed_attempts > 0)
    ).all()
    return [_user_dict(u) for u in users]


@router.post("/users", status_code=201)
def create_user(
    body: schemas.UserCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(400, "E-mail já cadastrado")

    # Garante que a coluna payment_method possui tamanho suficiente no PostgreSQL
    if not IS_SQLITE:
        try:
            db.execute(text("ALTER TABLE users ALTER COLUMN payment_method TYPE VARCHAR(50);"))
            db.commit()
        except Exception:
            db.rollback()
        try:
            db.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cost_center_id_fkey;"))
            db.commit()
        except Exception:
            db.rollback()

    inferred_role = models.UserRole.usuario
    if body.job_role_id:
        job_role = db.query(models.JobRole).filter(models.JobRole.id == body.job_role_id).first()
        if job_role:
            name_lower = job_role.name.lower()
            if "admin" in name_lower:
                inferred_role = models.UserRole.admin
            elif "financ" in name_lower:
                inferred_role = models.UserRole.financeiro
            elif "aprov" in name_lower:
                inferred_role = models.UserRole.aprovador
    elif body.role:
        inferred_role = body.role

    user = models.User(
        name=body.name,
        email=body.email,
        password_hash=auth.get_password_hash(body.password or "123456"),
        role=inferred_role,
        cost_center_id=body.cost_center_id,
        job_role_id=body.job_role_id,
        job_function_id=body.job_function_id,
        creditor_code=body.creditor_code,
        approver_of=json.dumps(body.approver_of) if body.approver_of is not None else None,
        approver_of_functions=json.dumps(body.approver_of_functions) if body.approver_of_functions is not None else None,
        approver_rules=json.dumps(body.approver_rules) if body.approver_rules is not None else None,
        active=body.active,
        payment_method=body.payment_method,
        pix_key=body.pix_key,
        bank=body.bank,
        agency=body.agency,
        account=body.account,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        print(f"[create_user] Error creating user: {e}")
        raise HTTPException(400, f"Erro ao criar usuário: {e}")

    _log_action(db, 'CREATE_USER', target_email=body.email, admin=current_user)
    return _user_dict(user)


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    body: schemas.UserUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    if not IS_SQLITE:
        try:
            db.execute(text("ALTER TABLE users ALTER COLUMN payment_method TYPE VARCHAR(50);"))
            db.commit()
        except Exception:
            db.rollback()

    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.password_hash = auth.get_password_hash(data.pop("password"))
    elif "password" in data:
        data.pop("password")

    if "approver_of" in data:
        user.approver_of = json.dumps(data.pop("approver_of")) if data["approver_of"] is not None else None
    if "approver_of_functions" in data:
        user.approver_of_functions = json.dumps(data.pop("approver_of_functions")) if data["approver_of_functions"] is not None else None
    if "approver_rules" in data:
        user.approver_rules = json.dumps(data.pop("approver_rules")) if data["approver_rules"] is not None else None
    if "groups" in data:
        data.pop("groups")

    if "job_role_id" in data:
        job_role_id = data["job_role_id"]
        inferred_role = models.UserRole.usuario
        if job_role_id:
            job_role = db.query(models.JobRole).filter(models.JobRole.id == job_role_id).first()
            if job_role:
                name_lower = job_role.name.lower()
                if "admin" in name_lower:
                    inferred_role = models.UserRole.admin
                elif "financ" in name_lower:
                    inferred_role = models.UserRole.financeiro
                elif "aprov" in name_lower:
                    inferred_role = models.UserRole.aprovador
        user.role = inferred_role
        if "role" in data:
            data.pop("role")
    elif "role" in data and data["role"]:
        user.role = data["role"]

    for k, v in data.items():
        setattr(user, k, v)
    try:
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        print(f"[update_user] Error updating user: {e}")
        raise HTTPException(400, f"Erro ao atualizar usuário: {e}")

    _log_action(db, 'UPDATE_USER', target_email=user.email, admin=current_user)
    return _user_dict(user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if user.id == current_user.id:
        raise HTTPException(400, "Não é possível excluir seu próprio usuário")
    target_email = user.email
    db.query(models.Expense).filter(models.Expense.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    _log_action(db, 'DELETE_USER', target_email=target_email, admin=current_user)


@router.post("/users/{user_id}/unlock")
def unlock_user(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    user.is_locked = False
    user.failed_attempts = 0
    db.commit()
    _log_action(db, 'UNLOCK_USER', target_email=user.email, admin=current_user)
    return {"ok": True, "message": "Usuário desbloqueado com sucesso"}


@router.post("/users/{user_id}/impersonate")
def impersonate_user(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if not user.active:
        raise HTTPException(400, "Não é possível visualizar como um usuário inativo.")

    token = auth.create_access_token({
        "sub": str(user.id),
        "impersonator_id": current_user.id,
        "impersonator_name": current_user.name
    })
    _log_action(db, 'IMPERSONATE_USER', target_email=user.email, admin=current_user,
                details=f"Iniciou modo 'Ver como' do perfil {user.name} ({user.role.value if hasattr(user.role, 'value') else user.role})")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "cost_center_id": user.cost_center_id,
            "job_function_id": getattr(user, 'job_function_id', None),
            "job_role_id": getattr(user, 'job_role_id', None),
        }
    }


@router.post("/users/send-password-email")
def send_password_email(
    body: schemas.SendPasswordEmailRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    # In a real system this would send an actual email
    # For now we just log the action and return success
    _log_action(db, 'SEND_PASSWORD_EMAIL', target_email=body.email, admin=current_user,
                details='Simulação de envio (SMTP não configurado)')
    return {"ok": True, "message": f"E-mail de senha enviado para {body.email}"}


# ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
@router.get("/audit-logs")
def list_audit_logs(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(500).all()
    return [
        {
            "id": l.id,
            "action": l.action,
            "target_email": l.target_email,
            "admin_name": l.admin_name,
            "status": l.status,
            "details": l.details,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        }
        for l in logs
    ]


# ─── COST CENTERS ────────────────────────────────────────────────────────────
@router.get("/cost-centers")
def list_cost_centers(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    all_active_ccs = db.query(models.CostCenter).filter(models.CostCenter.active == True).all()

    if current_user.role in [models.UserRole.admin, models.UserRole.financeiro]:
        return all_active_ccs

    rules = db.query(models.CostCenterRule).all()
    if not rules:
        return all_active_ccs

    restricted_cc_keys = set()
    allowed_for_user_cc_keys = set()

    for r in rules:
        try:
            cc_ids = json.loads(r.cost_center_ids) if r.cost_center_ids else []
        except:
            cc_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        user_has_access = (
            current_user.id in user_ids or 
            str(current_user.id) in [str(u) for u in user_ids] or
            (str(current_user.id).isdigit() and int(current_user.id) in [int(u) for u in user_ids if str(u).isdigit()])
        )

        for cid in cc_ids:
            cid_str = str(cid)
            restricted_cc_keys.add(cid_str)
            if user_has_access:
                allowed_for_user_cc_keys.add(cid_str)

    allowed_ccs = []
    for cc in all_active_ccs:
        cc_id_str = str(cc.id)
        cc_code_str = str(cc.code) if cc.code else ""
        
        is_restricted = (cc_id_str in restricted_cc_keys) or (cc_code_str and cc_code_str in restricted_cc_keys)
        
        if is_restricted:
            is_allowed = (cc_id_str in allowed_for_user_cc_keys) or (cc_code_str and cc_code_str in allowed_for_user_cc_keys)
            if is_allowed:
                allowed_ccs.append(cc)
        else:
            allowed_ccs.append(cc)

    return allowed_ccs


@router.post("/cost-centers", status_code=201)
def create_cost_center(
    body: schemas.CostCenterCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cc = models.CostCenter(**body.model_dump())
    db.add(cc)
    db.commit()
    db.refresh(cc)
    return cc


@router.put("/cost-centers/{cc_id}")
def update_cost_center(
    cc_id: int,
    body: schemas.CostCenterCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cc = db.query(models.CostCenter).filter(models.CostCenter.id == cc_id).first()
    if not cc:
        raise HTTPException(404, "Centro de custo não encontrado")
    for k, v in body.model_dump().items():
        setattr(cc, k, v)
    db.commit()
    db.refresh(cc)
    return cc


@router.delete("/cost-centers/{cc_id}", status_code=204)
def delete_cost_center(
    cc_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cc = db.query(models.CostCenter).filter(models.CostCenter.id == cc_id).first()
    if not cc:
        raise HTTPException(404, "Centro de custo não encontrado")
    cc.active = False
    db.commit()


@router.put("/cost-centers/toggle-status/{code_or_id}")
def toggle_cost_center_status(
    code_or_id: str,
    active: bool = Body(..., embed=True),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    code_str = str(code_or_id).strip()
    id_num = int(code_str) if code_str.isdigit() else -1

    ccs = db.query(models.CostCenter).filter(
        (models.CostCenter.code == code_str) | (models.CostCenter.id == id_num)
    ).all()

    if ccs:
        for cc in ccs:
            cc.active = active
        db.commit()
        return {"id": code_str, "code": code_str, "active": active, "updated_count": len(ccs)}

    new_cc = models.CostCenter(
        code=code_str,
        name=f"Centro {code_str}",
        active=active
    )
    db.add(new_cc)
    db.commit()
    return {"id": code_str, "code": code_str, "active": active, "created": True}


@router.put("/cost-centers/{code_or_id}/company")
def set_cost_center_company(
    code_or_id: str,
    company_id: Optional[int] = Body(None, embed=True),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    code_str = str(code_or_id).strip()
    id_num = int(code_str) if code_str.isdigit() else -1

    cc = db.query(models.CostCenter).filter(models.CostCenter.code == code_str).first()
    if not cc and id_num != -1:
        cc = db.query(models.CostCenter).filter(models.CostCenter.id == id_num).first()

    if not cc:
        cc = models.CostCenter(
            code=code_str,
            name=f"Centro {code_str}",
            active=True,
            company_id=company_id
        )
        db.add(cc)
    else:
        cc.company_id = company_id

    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "code": cc.code, "company_id": cc.company_id}


# ─── COMPANIES ───────────────────────────────────────────────────────────────
@router.get("/companies")
def list_companies(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    return db.query(models.Company).filter(models.Company.active == True).all()


@router.post("/companies", status_code=201)
def create_company(
    body: schemas.CompanyCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    comp = models.Company(**body.model_dump())
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


@router.put("/companies/{comp_id}")
def update_company(
    comp_id: int,
    body: schemas.CompanyCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    comp = db.query(models.Company).filter(models.Company.id == comp_id).first()
    if not comp:
        raise HTTPException(404, "Empresa não encontrada")
    for k, v in body.model_dump().items():
        setattr(comp, k, v)
    db.commit()
    db.refresh(comp)
    return comp


@router.delete("/companies/{comp_id}", status_code=204)
def delete_company(
    comp_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    comp = db.query(models.Company).filter(models.Company.id == comp_id).first()
    if not comp:
        raise HTTPException(404, "Empresa não encontrada")
    comp.active = False
    db.commit()


@router.put("/companies/toggle-status/{code_or_id}")
def toggle_company_status(
    code_or_id: str,
    active: bool = Body(..., embed=True),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    code_str = str(code_or_id).strip()
    id_num = int(code_str) if code_str.isdigit() else -1

    comps = db.query(models.Company).filter(models.Company.code == code_str).all()
    if not comps and id_num != -1:
        comps = db.query(models.Company).filter(models.Company.id == id_num).all()

    if comps:
        for c in comps:
            c.active = active
        db.commit()
        return {"id": code_str, "code": code_str, "active": active, "updated_count": len(comps)}

    new_comp = models.Company(
        code=code_str,
        name=f"Empresa {code_str}",
        active=active
    )
    db.add(new_comp)
    db.commit()
    return {"id": code_str, "code": code_str, "active": active, "created": True}


# ─── CATEGORIES ──────────────────────────────────────────────────────────────
@router.get("/categories")
def list_categories(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    all_active_cats = db.query(models.Category).filter(models.Category.active == True).all()

    if current_user.role in [models.UserRole.admin, models.UserRole.financeiro]:
        return all_active_cats

    cat_rules = db.query(models.CategoryRule).all()
    app_rules = db.query(models.ApportionmentRule).all()

    if not cat_rules and not app_rules:
        return all_active_cats

    restricted_cat_keys = set()
    allowed_for_user_cat_keys = set()

    for r in cat_rules:
        try:
            cat_ids = json.loads(r.category_ids) if r.category_ids else []
        except:
            cat_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        user_has_access = (
            current_user.id in user_ids or 
            str(current_user.id) in [str(u) for u in user_ids] or
            (str(current_user.id).isdigit() and int(current_user.id) in [int(u) for u in user_ids if str(u).isdigit()])
        )

        for cid in cat_ids:
            cid_str = str(cid)
            restricted_cat_keys.add(cid_str)
            if user_has_access:
                allowed_for_user_cat_keys.add(cid_str)

    restricted_app_keys = set()
    allowed_for_user_app_keys = set()

    for r in app_rules:
        try:
            app_ids = json.loads(r.apportionment_ids) if r.apportionment_ids else []
        except:
            app_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        user_has_access = (
            current_user.id in user_ids or 
            str(current_user.id) in [str(u) for u in user_ids] or
            (str(current_user.id).isdigit() and int(current_user.id) in [int(u) for u in user_ids if str(u).isdigit()])
        )

        for aid in app_ids:
            aid_str = str(aid).strip()
            restricted_app_keys.add(aid_str)
            if user_has_access:
                allowed_for_user_app_keys.add(aid_str)

    allowed_cats = []
    for cat in all_active_cats:
        cat_id_str = str(cat.id)
        app_id_str = str(cat.sienge_apportionment_id).strip() if getattr(cat, 'sienge_apportionment_id', None) else ""
        
        is_restricted_cat = cat_id_str in restricted_cat_keys
        is_restricted_app = bool(app_id_str and app_id_str in restricted_app_keys)

        cat_allowed = not is_restricted_cat or (cat_id_str in allowed_for_user_cat_keys)
        app_allowed = not is_restricted_app or (app_id_str in allowed_for_user_app_keys)

        if cat_allowed and app_allowed:
            allowed_cats.append(cat)

    return allowed_cats


@router.post("/categories", status_code=201)
def create_category(
    body: schemas.CategoryCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cat = models.Category(**body.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}")
def update_category(
    cat_id: int,
    body: schemas.CategoryCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    for k, v in body.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    cat.active = False
    db.commit()


# ─── POLICIES (system built-in) ──────────────────────────────────────────────
@router.get("/policies")
def list_policies(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    return db.query(models.Policy).all()


@router.put("/policies/{key}")
def update_policy(
    key: str,
    body: schemas.PolicyUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    policy = db.query(models.Policy).filter(models.Policy.key == key).first()
    if not policy:
        raise HTTPException(404, "Política não encontrada")
    policy.value = body.value
    if body.description:
        policy.description = body.description
    db.commit()
    db.refresh(policy)
    return policy


# ─── MILEAGE RATES ───────────────────────────────────────────────────────────
@router.get("/mileage-rates")
def list_mileage_rates(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    rates = db.query(models.MileageRate).all()
    if not rates:
        # Seed defaults if empty
        defaults = [
            models.MileageRate(name="Nível 1 - Colaborador", rate=1.11, active=True, applicable_functions='["Colaborador"]'),
            models.MileageRate(name="Nível 2 - Diretor", rate=1.36, active=True, applicable_functions='["Diretor"]'),
            models.MileageRate(name="Nível 3 - Gestor e Supervisor", rate=1.36, active=True, applicable_functions='["Gestor", "Supervisor"]'),
        ]
        for r in defaults:
            db.add(r)
        db.commit()
        rates = db.query(models.MileageRate).all()

    import re
    def _extract_level(name: str) -> int:
        m = re.search(r'(?:n[íi]vel\s*)?(\d+)', name or '', re.IGNORECASE)
        return int(m.group(1)) if m else 999999

    rates = sorted(rates, key=lambda r: (_extract_level(r.name), (r.name or '').lower()))

    return [
        {
            "id": r.id,
            "name": r.name,
            "rate": r.rate,
            "active": r.active,
            "applicable_functions": getattr(r, 'applicable_functions', None)
        }
        for r in rates
    ]


@router.post("/mileage-rates", status_code=201)
def create_mileage_rate(
    body: schemas.MileageRateCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rate = models.MileageRate(**body.model_dump())
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return {
        "id": rate.id,
        "name": rate.name,
        "rate": rate.rate,
        "active": rate.active,
        "applicable_functions": getattr(rate, 'applicable_functions', None)
    }


@router.put("/mileage-rates/{rate_id}")
def update_mileage_rate(
    rate_id: int,
    body: schemas.MileageRateUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rate = db.query(models.MileageRate).filter(models.MileageRate.id == rate_id).first()
    if not rate:
        raise HTTPException(404, "Taxa não encontrada")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(rate, k, v)
    db.commit()
    db.refresh(rate)
    return {
        "id": rate.id,
        "name": rate.name,
        "rate": rate.rate,
        "active": rate.active,
        "applicable_functions": getattr(rate, 'applicable_functions', None)
    }


@router.delete("/mileage-rates/{rate_id}", status_code=204)
def delete_mileage_rate(
    rate_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rate = db.query(models.MileageRate).filter(models.MileageRate.id == rate_id).first()
    if not rate:
        raise HTTPException(404, "Taxa não encontrada")
    db.delete(rate)
    db.commit()


# ─── REJECTION REASONS ───────────────────────────────────────────────────────
@router.get("/rejection-reasons")
def list_rejection_reasons(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    reasons = db.query(models.RejectionReason).filter(models.RejectionReason.active == True).all()
    return [
        {
            "id": r.id,
            "label": r.label,
            "applicable_roles": json.loads(r.applicable_roles) if r.applicable_roles else [],
            "active": r.active,
        }
        for r in reasons
    ]


@router.post("/rejection-reasons", status_code=201)
def create_rejection_reason(
    body: schemas.RejectionReasonCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    data = body.model_dump()
    if isinstance(data.get('applicable_roles'), list):
        data['applicable_roles'] = json.dumps(data['applicable_roles'])
    reason = models.RejectionReason(**data)
    db.add(reason)
    db.commit()
    db.refresh(reason)
    return {
        "id": reason.id, "label": reason.label,
        "applicable_roles": json.loads(reason.applicable_roles) if reason.applicable_roles else [],
        "active": reason.active,
    }


@router.put("/rejection-reasons/{reason_id}")
def update_rejection_reason(
    reason_id: int,
    body: schemas.RejectionReasonUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    reason = db.query(models.RejectionReason).filter(models.RejectionReason.id == reason_id).first()
    if not reason:
        raise HTTPException(404, "Motivo não encontrado")
    data = body.model_dump(exclude_none=True)
    if isinstance(data.get('applicable_roles'), list):
        data['applicable_roles'] = json.dumps(data['applicable_roles'])
    for k, v in data.items():
        setattr(reason, k, v)
    db.commit()
    db.refresh(reason)
    return {
        "id": reason.id, "label": reason.label,
        "applicable_roles": json.loads(reason.applicable_roles) if reason.applicable_roles else [],
        "active": reason.active,
    }


@router.delete("/rejection-reasons/{reason_id}", status_code=204)
def delete_rejection_reason(
    reason_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    reason = db.query(models.RejectionReason).filter(models.RejectionReason.id == reason_id).first()
    if not reason:
        raise HTTPException(404, "Motivo não encontrado")
    reason.active = False
    db.commit()


# ─── CUSTOM POLICIES (rules) ─────────────────────────────────────────────────
@router.get("/custom-policies")
def list_custom_policies(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    policies = db.query(models.CustomPolicy).filter(models.CustomPolicy.active == True).order_by(models.CustomPolicy.id.desc()).all()
    return [
        {"id": p.id, "key": p.key, "value": p.value, "description": p.description,
         "group": p.group, "active": p.active}
        for p in policies
    ]


@router.post("/custom-policies", status_code=201)
def create_custom_policy(
    body: schemas.CustomPolicyCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    policy = models.CustomPolicy(**body.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return {"id": policy.id, "key": policy.key, "value": policy.value,
            "description": policy.description, "group": policy.group, "active": policy.active}


@router.put("/custom-policies/{policy_id}")
def update_custom_policy(
    policy_id: int,
    body: schemas.CustomPolicyUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    policy = db.query(models.CustomPolicy).filter(models.CustomPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Política não encontrada")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(policy, k, v)
    db.commit()
    db.refresh(policy)
    return {"id": policy.id, "key": policy.key, "value": policy.value,
            "description": policy.description, "group": policy.group, "active": policy.active}


@router.delete("/custom-policies/{policy_id}", status_code=204)
def delete_custom_policy(
    policy_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    policy = db.query(models.CustomPolicy).filter(models.CustomPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Política não encontrada")
    db.delete(policy)
    db.commit()


@router.post("/policies/upload")
async def upload_policy_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.require_admin)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Apenas arquivos PDF são permitidos para políticas.")
    
    upload_dir = "/tmp/uploads" if (os.environ.get("VERCEL") or not os.path.exists("uploads")) else "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    safe_filename = f"policy_{int(datetime.utcnow().timestamp())}_{file.filename.replace(' ', '_')}"
    filepath = os.path.join(upload_dir, safe_filename)
    
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
        
    if storage.enabled():
        storage.upload_file(f"uploads/{safe_filename}", filepath)
        
    return {"filename": safe_filename, "url": f"/uploads/{safe_filename}"}


# ─── LOGO ────────────────────────────────────────────────────────────────────
@router.get("/logo")
def get_logo(db: Session = Depends(get_db)):
    logo = db.query(models.CompanyLogo).first()
    if not logo:
        return {"data": None}
    return {"data": logo.data}


@router.put("/logo")
def update_logo(
    body: schemas.LogoUpdate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    logo = db.query(models.CompanyLogo).first()
    if logo:
        logo.data = body.data
    else:
        logo = models.CompanyLogo(data=body.data)
        db.add(logo)
    db.commit()
    return {"ok": True}


# ─── JOB ROLES ────────────────────────────────────────────────────────────────
@router.get("/job-roles")
def list_job_roles(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    return db.query(models.JobRole).filter(models.JobRole.active == True).all()


@router.post("/job-roles", status_code=201)
def create_job_role(
    body: schemas.JobRoleCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    role = models.JobRole(**body.model_dump())
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/job-roles/{role_id}")
def update_job_role(
    role_id: int,
    body: schemas.JobRoleCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    role = db.query(models.JobRole).filter(models.JobRole.id == role_id).first()
    if not role:
        raise HTTPException(404, "Perfil não encontrado")
    for k, v in body.model_dump().items():
        setattr(role, k, v)
    db.commit()
    db.refresh(role)
    return role


@router.delete("/job-roles/{role_id}", status_code=204)
def delete_job_role(
    role_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    role = db.query(models.JobRole).filter(models.JobRole.id == role_id).first()
    if not role:
        raise HTTPException(404, "Perfil não encontrado")
    role.active = False
    db.commit()


# ─── JOB FUNCTIONS ────────────────────────────────────────────────────────────
@router.get("/job-functions")
def list_job_functions(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    return db.query(models.JobFunction).filter(models.JobFunction.active == True).all()


@router.post("/job-functions", status_code=201)
def create_job_function(
    body: schemas.JobFunctionCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    func = models.JobFunction(**body.model_dump())
    db.add(func)
    db.commit()
    db.refresh(func)
    return func


@router.put("/job-functions/{func_id}")
def update_job_function(
    func_id: int,
    body: schemas.JobFunctionCreate,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    func = db.query(models.JobFunction).filter(models.JobFunction.id == func_id).first()
    if not func:
        raise HTTPException(404, "Função não encontrada")
    for k, v in body.model_dump().items():
        setattr(func, k, v)
    db.commit()
    db.refresh(func)
    return func


@router.delete("/job-functions/{func_id}", status_code=204)
def delete_job_function(
    func_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    func = db.query(models.JobFunction).filter(models.JobFunction.id == func_id).first()
    if not func:
        raise HTTPException(404, "Função não encontrada")
    func.active = False
    db.commit()


# ─── PAYMENT CALENDAR ────────────────────────────────────────────────────────
@router.get("/payment-calendar")
def get_payment_calendar(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Acesso permitido apenas para Administrador e Financeiro.")
    schedules = db.query(models.PaymentSchedule).order_by(
        models.PaymentSchedule.year.desc(), models.PaymentSchedule.month.desc()
    ).limit(6).all()
    return [
        {
            "id": s.id,
            "year": s.year,
            "month": s.month,
            "payment_date": str(s.payment_date) if s.payment_date else None,
            "approval_date": str(s.approval_date) if s.approval_date else None,
            "closing_date": str(s.closing_date) if s.closing_date else None,
            "created_by": s.created_by,
            "creator_name": s.creator.name if s.creator else "-",
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
        for s in schedules
    ]


@router.post("/payment-calendar", status_code=201)
def save_payment_calendar(
    body: dict,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in [models.UserRole.admin, models.UserRole.financeiro]:
        raise HTTPException(403, "Apenas Administrador e Financeiro podem configurar o calendário de pagamentos.")

    year = int(body.get("year", datetime.utcnow().year))
    month = int(body.get("month", datetime.utcnow().month))
    payment_date_str = body.get("payment_date")
    approval_date_str = body.get("approval_date")
    closing_date_str = body.get("closing_date")

    if not payment_date_str:
        raise HTTPException(400, "A data de pagamento é obrigatória.")

    from datetime import datetime as dt_cls
    payment_date = dt_cls.strptime(payment_date_str, "%Y-%m-%d").date()
    approval_date = dt_cls.strptime(approval_date_str, "%Y-%m-%d").date() if approval_date_str else None
    closing_date = dt_cls.strptime(closing_date_str, "%Y-%m-%d").date() if closing_date_str else None

    existing = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.year == year,
        models.PaymentSchedule.month == month
    ).first()

    if existing:
        existing.payment_date = payment_date
        existing.approval_date = approval_date
        existing.closing_date = closing_date
        existing.created_by = current_user.id
        existing.updated_at = datetime.utcnow()
        sched = existing
    else:
        sched = models.PaymentSchedule(
            year=year,
            month=month,
            payment_date=payment_date,
            approval_date=approval_date,
            closing_date=closing_date,
            created_by=current_user.id
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)

    return {
        "success": True,
        "message": f"Datas para {month:02d}/{year} salvas com sucesso!",
        "schedule": {
            "id": sched.id,
            "year": sched.year,
            "month": sched.month,
            "payment_date": str(sched.payment_date) if sched.payment_date else None,
            "approval_date": str(sched.approval_date) if sched.approval_date else None,
            "closing_date": str(sched.closing_date) if sched.closing_date else None,
            "creator_name": current_user.name
        }
    }


# ─── REGRAS POR CENTRO DE CUSTO ──────────────────────────────────────────────
@router.get("/cost-center-rules")
def list_cost_center_rules(
    current_user: models.User = Depends(auth.require_admin_or_finance),
    db: Session = Depends(get_db)
):
    rules = db.query(models.CostCenterRule).order_by(models.CostCenterRule.id.desc()).all()
    all_ccs = db.query(models.CostCenter).all()
    ccs_by_id = {cc.id: cc for cc in all_ccs}
    ccs_by_code = {str(cc.code): cc for cc in all_ccs if cc.code}
    
    all_users = db.query(models.User).all()
    users_by_id = {u.id: u for u in all_users}

    res = []
    for r in rules:
        try:
            cc_ids = json.loads(r.cost_center_ids) if r.cost_center_ids else []
        except:
            cc_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        ccs = []
        for raw_id in cc_ids:
            cc_obj = ccs_by_id.get(raw_id) or ccs_by_id.get(int(raw_id) if str(raw_id).isdigit() else -1)
            if not cc_obj:
                cc_obj = ccs_by_code.get(str(raw_id))
            
            if cc_obj:
                ccs.append({"id": cc_obj.id, "code": cc_obj.code, "name": cc_obj.name})
            else:
                ccs.append({"id": raw_id, "code": str(raw_id), "name": f"Centro {raw_id}"})

        users = []
        for u_id in user_ids:
            u_obj = users_by_id.get(u_id) or users_by_id.get(int(u_id) if str(u_id).isdigit() else -1)
            if u_obj:
                users.append({"id": u_obj.id, "name": u_obj.name, "email": u_obj.email})

        res.append({
            "id": r.id,
            "cost_center_ids": cc_ids,
            "cost_centers": ccs,
            "allowed_user_ids": user_ids,
            "allowed_users": users,
            "created_at": str(r.created_at) if r.created_at else ""
        })

    return res


@router.post("/cost-center-rules")
def save_cost_center_rule(
    body: dict = Body(...),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule_id = body.get("rule_id")
    cost_center_ids = body.get("cost_center_ids", [])
    allowed_user_ids = body.get("allowed_user_ids", [])

    if not cost_center_ids or not isinstance(cost_center_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos um Centro de Custo ativo.")
    if not allowed_user_ids or not isinstance(allowed_user_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos um Usuário ativo.")

    cc_ids_clean = [int(x) for x in cost_center_ids if str(x).isdigit()]
    user_ids_clean = [int(x) for x in allowed_user_ids if str(x).isdigit()]

    if not cc_ids_clean or not user_ids_clean:
        raise HTTPException(status_code=400, detail="Identificadores inválidos de Centro de Custo ou Usuários.")

    if rule_id:
        rule = db.query(models.CostCenterRule).filter(models.CostCenterRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Regra não encontrada.")
    else:
        rule = models.CostCenterRule()
        db.add(rule)

    rule.cost_center_ids = json.dumps(cc_ids_clean)
    rule.allowed_user_ids = json.dumps(user_ids_clean)

    db.commit()
    db.refresh(rule)

    _log_action(db, "SAVE_COST_CENTER_RULE", admin=current_user, details=f"Regra ID {rule.id} salva para CCs {cc_ids_clean}")

    return {"success": True, "id": rule.id, "message": "Regra por Centro de Custo salva com sucesso!"}


@router.delete("/cost-center-rules/{rule_id}")
def delete_cost_center_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule = db.query(models.CostCenterRule).filter(models.CostCenterRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")

    db.delete(rule)
    db.commit()

    _log_action(db, "DELETE_COST_CENTER_RULE", admin=current_user, details=f"Regra ID {rule_id} excluída.")
    return {"success": True, "message": "Regra excluída com sucesso."}


# ─── REGRAS POR APROPRIAÇÃO FINANCEIRA ──────────────────────────────────────
@router.get("/apportionment-rules")
def list_apportionment_rules(
    current_user: models.User = Depends(auth.require_admin_or_finance),
    db: Session = Depends(get_db)
):
    rules = db.query(models.ApportionmentRule).order_by(models.ApportionmentRule.id.desc()).all()
    all_users = db.query(models.User).all()
    users_by_id = {u.id: u for u in all_users}

    res = []
    for r in rules:
        try:
            app_ids = json.loads(r.apportionment_ids) if r.apportionment_ids else []
        except:
            app_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        apps = []
        for raw_id in app_ids:
            apps.append({"id": str(raw_id), "code": str(raw_id), "name": str(raw_id)})

        users = []
        for u_id in user_ids:
            u_obj = users_by_id.get(u_id) or users_by_id.get(int(u_id) if str(u_id).isdigit() else -1)
            if u_obj:
                users.append({"id": u_obj.id, "name": u_obj.name, "email": u_obj.email})

        res.append({
            "id": r.id,
            "apportionment_ids": app_ids,
            "apportionments": apps,
            "allowed_user_ids": user_ids,
            "allowed_users": users,
            "created_at": str(r.created_at) if r.created_at else ""
        })

    return res


@router.post("/apportionment-rules")
def save_apportionment_rule(
    body: dict = Body(...),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule_id = body.get("rule_id")
    apportionment_ids = body.get("apportionment_ids", [])
    allowed_user_ids = body.get("allowed_user_ids", [])

    if not apportionment_ids or not isinstance(apportionment_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma Apropriação Financeira ativa.")
    if not allowed_user_ids or not isinstance(allowed_user_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos um Usuário ativo.")

    app_ids_clean = [str(x).strip() for x in apportionment_ids if str(x).strip()]
    user_ids_clean = [int(x) for x in allowed_user_ids if str(x).isdigit()]

    if not app_ids_clean or not user_ids_clean:
        raise HTTPException(status_code=400, detail="Identificadores inválidos de Apropriação Financeira ou Usuários.")

    if rule_id:
        rule = db.query(models.ApportionmentRule).filter(models.ApportionmentRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Regra não encontrada.")
    else:
        rule = models.ApportionmentRule()
        db.add(rule)

    rule.apportionment_ids = json.dumps(app_ids_clean)
    rule.allowed_user_ids = json.dumps(user_ids_clean)

    db.commit()
    db.refresh(rule)

    _log_action(db, "SAVE_APPORTIONMENT_RULE", admin=current_user, details=f"Regra ID {rule.id} salva para Apropriações {app_ids_clean}")

    return {"success": True, "id": rule.id, "message": "Regra por Apropriação Financeira salva com sucesso!"}


@router.delete("/apportionment-rules/{rule_id}")
def delete_apportionment_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule = db.query(models.ApportionmentRule).filter(models.ApportionmentRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")

    db.delete(rule)
    db.commit()

    _log_action(db, "DELETE_APPORTIONMENT_RULE", admin=current_user, details=f"Regra ID {rule_id} excluída.")
    return {"success": True, "message": "Regra excluída com sucesso."}


# ─── REGRAS POR CATEGORIA ───────────────────────────────────────────────────
@router.get("/category-rules")
def list_category_rules(
    current_user: models.User = Depends(auth.require_admin_or_finance),
    db: Session = Depends(get_db)
):
    rules = db.query(models.CategoryRule).order_by(models.CategoryRule.id.desc()).all()
    all_cats = db.query(models.Category).all()
    cats_by_id = {c.id: c for c in all_cats}
    
    all_users = db.query(models.User).all()
    users_by_id = {u.id: u for u in all_users}

    res = []
    for r in rules:
        try:
            cat_ids = json.loads(r.category_ids) if r.category_ids else []
        except:
            cat_ids = []
        try:
            user_ids = json.loads(r.allowed_user_ids) if r.allowed_user_ids else []
        except:
            user_ids = []

        cats = []
        for raw_id in cat_ids:
            cat_obj = cats_by_id.get(raw_id) or cats_by_id.get(int(raw_id) if str(raw_id).isdigit() else -1)
            if cat_obj:
                cats.append({"id": cat_obj.id, "name": cat_obj.name, "icon": getattr(cat_obj, 'icon', '📁')})
            else:
                cats.append({"id": raw_id, "name": f"Categoria {raw_id}", "icon": "📁"})

        users = []
        for u_id in user_ids:
            u_obj = users_by_id.get(u_id) or users_by_id.get(int(u_id) if str(u_id).isdigit() else -1)
            if u_obj:
                users.append({"id": u_obj.id, "name": u_obj.name, "email": u_obj.email})

        res.append({
            "id": r.id,
            "category_ids": cat_ids,
            "categories": cats,
            "allowed_user_ids": user_ids,
            "allowed_users": users,
            "created_at": str(r.created_at) if r.created_at else ""
        })

    return res


@router.post("/category-rules")
def save_category_rule(
    body: dict = Body(...),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule_id = body.get("rule_id")
    category_ids = body.get("category_ids", [])
    allowed_user_ids = body.get("allowed_user_ids", [])

    if not category_ids or not isinstance(category_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma Categoria ativa.")
    if not allowed_user_ids or not isinstance(allowed_user_ids, list):
        raise HTTPException(status_code=400, detail="Selecione pelo menos um Usuário ativo.")

    cat_ids_clean = [int(x) for x in category_ids if str(x).isdigit()]
    user_ids_clean = [int(x) for x in allowed_user_ids if str(x).isdigit()]

    if not cat_ids_clean or not user_ids_clean:
        raise HTTPException(status_code=400, detail="Identificadores inválidos de Categorias ou Usuários.")

    if rule_id:
        rule = db.query(models.CategoryRule).filter(models.CategoryRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Regra não encontrada.")
    else:
        rule = models.CategoryRule()
        db.add(rule)

    rule.category_ids = json.dumps(cat_ids_clean)
    rule.allowed_user_ids = json.dumps(user_ids_clean)

    db.commit()
    db.refresh(rule)

    _log_action(db, "SAVE_CATEGORY_RULE", admin=current_user, details=f"Regra ID {rule.id} salva para Categorias {cat_ids_clean}")

    return {"success": True, "id": rule.id, "message": "Regra por Categoria salva com sucesso!"}


@router.delete("/category-rules/{rule_id}")
def delete_category_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule = db.query(models.CategoryRule).filter(models.CategoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")

    db.delete(rule)
    db.commit()

    _log_action(db, "DELETE_CATEGORY_RULE", admin=current_user, details=f"Regra ID {rule_id} excluída.")
    return {"success": True, "message": "Regra excluída com sucesso."}


# ─── REGRAS DE ALTERAÇÃO NA CATEGORIA ─────────────────────────────────────────
@router.get("/category-override-rules")
def list_category_override_rules(
    current_user: models.User = Depends(auth.require_admin_or_finance),
    db: Session = Depends(get_db)
):
    from pdf_generator import _get_sienge_plans_map, format_apportionment_code

    rules = db.query(models.CategoryOverrideRule).order_by(models.CategoryOverrideRule.id.desc()).all()
    all_cats = db.query(models.Category).all()
    cats_by_id = {c.id: c for c in all_cats}

    all_ccs = db.query(models.CostCenter).all()
    ccs_by_id = {str(cc.id): cc for cc in all_ccs}
    ccs_by_code = {str(cc.code): cc for cc in all_ccs if cc.code}

    plans_map = _get_sienge_plans_map()

    res = []
    for r in rules:
        dept_info = _get_department_info(r.department_id)
        dept_name = dept_info["name"] if dept_info else f"Departamento {r.department_id}"

        # Categorias
        cat_ids = []
        if r.category_ids:
            try:
                cat_ids = json.loads(r.category_ids)
            except Exception:
                cat_ids = []
        elif r.category_id is not None:
            cat_ids = [r.category_id]

        is_all_cats = ("*" in cat_ids or "all" in cat_ids)
        cats_list = []
        if is_all_cats:
            cats_list = [{"id": "*", "name": "Todas as Categorias", "icon": "🏷️"}]
        else:
            for c_id in cat_ids:
                c_obj = cats_by_id.get(int(c_id) if str(c_id).isdigit() else c_id)
                if c_obj:
                    cats_list.append({"id": c_obj.id, "name": c_obj.name, "icon": getattr(c_obj, "icon", "📁") or "📁"})
                else:
                    cats_list.append({"id": c_id, "name": f"Categoria {c_id}", "icon": "📁"})

        # Centros de Custo
        cc_ids = []
        if r.cost_center_ids:
            try:
                cc_ids = json.loads(r.cost_center_ids)
            except Exception:
                cc_ids = []
        elif r.cost_center_id:
            cc_ids = [str(r.cost_center_id)]

        is_all_ccs = ("*" in cc_ids or "all" in cc_ids)
        ccs_list = []
        if is_all_ccs:
            ccs_list = [{"id": "*", "code": "*", "name": "Todos os Centros de Custo"}]
        else:
            for raw_cc in cc_ids:
                s_cc = str(raw_cc).strip()
                cc_obj = ccs_by_code.get(s_cc) or ccs_by_id.get(s_cc)
                if cc_obj:
                    ccs_list.append({"id": cc_obj.id, "code": cc_obj.code or s_cc, "name": cc_obj.name})
                else:
                    ccs_list.append({"id": s_cc, "code": s_cc, "name": f"Centro {s_cc}"})

        clean_app_id = str(r.sienge_apportionment_id or "").strip()
        app_name = plans_map.get(clean_app_id) or plans_map.get(clean_app_id.replace(".", "")) or ""
        formatted_code = format_apportionment_code(clean_app_id)

        res.append({
            "id": r.id,
            "department_id": r.department_id,
            "department_name": dept_name,
            "category_ids": cat_ids,
            "categories": cats_list,
            "all_categories": is_all_cats,
            "category_id": r.category_id,
            "category_name": cats_list[0]["name"] if cats_list else "Todas",
            "cost_center_ids": cc_ids,
            "cost_centers": ccs_list,
            "all_cost_centers": is_all_ccs,
            "cost_center_id": r.cost_center_id,
            "cost_center_code": ccs_list[0]["code"] if ccs_list else "*",
            "cost_center_name": ccs_list[0]["name"] if ccs_list else "Todos",
            "sienge_apportionment_id": clean_app_id,
            "apportionment_name": app_name,
            "formatted_apportionment": formatted_code,
            "active": bool(r.active),
            "created_at": str(r.created_at) if r.created_at else ""
        })

    return res


@router.post("/category-override-rules")
def save_category_override_rule(
    body: dict = Body(...),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    # Suporte para salvamento em lote (múltiplas regras de uma vez)
    rules_data = body.get("rules")
    if isinstance(rules_data, list) and rules_data:
        saved_ids = []
        for item in rules_data:
            r_id = item.get("rule_id")
            dept_id = item.get("department_id")
            category_ids = item.get("category_ids", [])
            cost_center_ids = item.get("cost_center_ids", [])
            app_id = item.get("sienge_apportionment_id")
            active = item.get("active", True)

            if not dept_id or not category_ids or not cost_center_ids or not app_id:
                continue

            try:
                dept_id = int(dept_id)
            except (ValueError, TypeError):
                continue

            clean_cat_ids = ["*"] if ("*" in category_ids or "all" in category_ids) else [int(c) if str(c).isdigit() else str(c).strip() for c in category_ids]
            clean_cc_ids = ["*"] if ("*" in cost_center_ids or "all" in cost_center_ids) else [str(cc).strip() for cc in cost_center_ids if str(cc).strip()]

            if not clean_cat_ids or not clean_cc_ids:
                continue

            app_id_str = str(app_id).strip()

            if r_id:
                rule = db.query(models.CategoryOverrideRule).filter(models.CategoryOverrideRule.id == r_id).first()
                if not rule:
                    rule = models.CategoryOverrideRule()
                    db.add(rule)
            else:
                rule = models.CategoryOverrideRule()
                db.add(rule)

            rule.department_id = dept_id
            rule.category_ids = json.dumps(clean_cat_ids)
            rule.category_id = clean_cat_ids[0] if (clean_cat_ids and isinstance(clean_cat_ids[0], int)) else None
            rule.cost_center_ids = json.dumps(clean_cc_ids)
            rule.cost_center_id = clean_cc_ids[0] if clean_cc_ids else ""
            rule.sienge_apportionment_id = app_id_str
            rule.active = bool(active)
            db.flush()
            saved_ids.append(rule.id)

        if not saved_ids:
            raise HTTPException(status_code=400, detail="Nenhuma regra válida para salvar. Preencha todos os campos obrigatórios.")

        db.commit()
        _log_action(db, "SAVE_CATEGORY_OVERRIDE_RULES", admin=current_user,
                    details=f"{len(saved_ids)} regras de alteração salvas em lote: IDs {saved_ids}")
        return {"success": True, "ids": saved_ids, "message": f"{len(saved_ids)} regra(s) de alteração salva(s) com sucesso!"}

    rule_id = body.get("rule_id")
    dept_id = body.get("department_id")
    category_ids = body.get("category_ids", [])
    cost_center_ids = body.get("cost_center_ids", [])
    app_id = body.get("sienge_apportionment_id")
    active = body.get("active", True)

    # Suporte retrocompatível para category_id e cost_center_id singulares
    if not category_ids and body.get("category_id") is not None:
        category_ids = [body.get("category_id")]
    if not cost_center_ids and body.get("cost_center_id"):
        cost_center_ids = [body.get("cost_center_id")]

    if not dept_id:
        raise HTTPException(status_code=400, detail="Selecione o Departamento.")
    if not category_ids:
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma Categoria (ou Marcar Todos).")
    if not cost_center_ids:
        raise HTTPException(status_code=400, detail="Selecione pelo menos um Centro de Custo (ou Marcar Todos).")
    if not app_id:
        raise HTTPException(status_code=400, detail="Selecione a nova Apropriação Financeira.")

    try:
        dept_id = int(dept_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Identificador inválido de Departamento.")

    # Tratar category_ids
    clean_cat_ids = []
    if "*" in category_ids or "all" in category_ids:
        clean_cat_ids = ["*"]
    else:
        for c in category_ids:
            if str(c).isdigit():
                clean_cat_ids.append(int(c))
            elif str(c).strip():
                clean_cat_ids.append(str(c).strip())

    # Tratar cost_center_ids
    clean_cc_ids = []
    if "*" in cost_center_ids or "all" in cost_center_ids:
        clean_cc_ids = ["*"]
    else:
        for cc in cost_center_ids:
            s_cc = str(cc).strip()
            if s_cc:
                clean_cc_ids.append(s_cc)

    if not clean_cat_ids or not clean_cc_ids:
        raise HTTPException(status_code=400, detail="Selecione categorias e centros de custo válidos.")

    app_id_str = str(app_id).strip()

    if rule_id:
        rule = db.query(models.CategoryOverrideRule).filter(models.CategoryOverrideRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Regra não encontrada.")
    else:
        rule = models.CategoryOverrideRule()
        db.add(rule)

    rule.department_id = dept_id
    rule.category_ids = json.dumps(clean_cat_ids)
    rule.category_id = clean_cat_ids[0] if (clean_cat_ids and isinstance(clean_cat_ids[0], int)) else None
    rule.cost_center_ids = json.dumps(clean_cc_ids)
    rule.cost_center_id = clean_cc_ids[0] if clean_cc_ids else ""
    rule.sienge_apportionment_id = app_id_str
    rule.active = bool(active)

    db.commit()
    db.refresh(rule)

    _log_action(db, "SAVE_CATEGORY_OVERRIDE_RULE", admin=current_user,
                details=f"Regra de alteração ID {rule.id}: Depto {dept_id}, Cats {clean_cat_ids}, CCs {clean_cc_ids} -> Apropriação {app_id_str}")

    return {"success": True, "id": rule.id, "message": "Regra de alteração na categoria salva com sucesso!"}


@router.delete("/category-override-rules/{rule_id}")
def delete_category_override_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    rule = db.query(models.CategoryOverrideRule).filter(models.CategoryOverrideRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")

    db.delete(rule)
    db.commit()

    _log_action(db, "DELETE_CATEGORY_OVERRIDE_RULE", admin=current_user, details=f"Regra de alteração ID {rule_id} excluída.")
    return {"success": True, "message": "Regra de alteração excluída com sucesso."}



# ─── MODELOS DE E-MAIL ────────────────────────────────────────────────────────
DEFAULT_EMAIL_TEMPLATES = {
    "closing_dates": {
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
        "description": "Modelo de e-mail enviado aos colaboradores para comunicar a data limite de fechamento e envio das despesas do mês.",
        "available_tags": "{nome_usuario}, {data_fechamento}, {data_aprovação}, {data_pagamento}, {mes_ano}"
    },
    "payment_date": {
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
        "description": "Modelo padrão corporativo enviado aos colaboradores com o relatório de despesas e a previsão da data de pagamento programada.",
        "available_tags": "{nome_usuario}, {data_pagamento}, {nome_relatorio}, {mes_ano}"
    }
}


def _ensure_default_email_templates(db: Session):
    from database import Base, engine
    Base.metadata.create_all(bind=engine)
    for key, data in DEFAULT_EMAIL_TEMPLATES.items():
        existing = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == key).first()
        if not existing:
            tmpl = models.EmailTemplate(
                key=key,
                name=data["name"],
                subject=data["subject"],
                body=data["body"],
                description=data["description"],
                available_tags=data["available_tags"]
            )
            db.add(tmpl)
        else:
            if existing.available_tags != data["available_tags"]:
                existing.available_tags = data["available_tags"]
    db.commit()


@router.get("/email-templates")
def list_email_templates(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    _ensure_default_email_templates(db)
    templates = db.query(models.EmailTemplate).all()
    return [
        {
            "id": t.id,
            "key": t.key,
            "name": t.name,
            "subject": t.subject,
            "body": t.body,
            "description": t.description,
            "available_tags": t.available_tags,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        }
        for t in templates
    ]


@router.get("/email-templates/{key}")
def get_email_template(
    key: str,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    _ensure_default_email_templates(db)
    template = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == key).first()
    if not template:
        raise HTTPException(status_code=404, detail=f"Modelo '{key}' não encontrado.")
    return {
        "id": template.id,
        "key": template.key,
        "name": template.name,
        "subject": template.subject,
        "body": template.body,
        "description": template.description,
        "available_tags": template.available_tags,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None
    }


@router.put("/email-templates/{key}")
def update_email_template(
    key: str,
    body: dict,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    _ensure_default_email_templates(db)
    template = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == key).first()
    if not template:
        raise HTTPException(status_code=404, detail=f"Modelo '{key}' não encontrado.")

    subject = body.get("subject", "").strip()
    content = body.get("body", "").strip()

    if not subject:
        raise HTTPException(status_code=400, detail="O assunto do e-mail não pode ficar em branco.")
    if not content:
        raise HTTPException(status_code=400, detail="O corpo do e-mail não pode ficar em branco.")

    template.subject = subject
    template.body = content
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)

    _log_action(db, "UPDATE_EMAIL_TEMPLATE", admin=current_user, details=f"Modelo '{template.name}' atualizado.")

    return {
        "success": True,
        "message": f"Modelo '{template.name}' salvo com sucesso!",
        "template": {
            "id": template.id,
            "key": template.key,
            "name": template.name,
            "subject": template.subject,
            "body": template.body,
            "description": template.description,
            "available_tags": template.available_tags,
            "updated_at": template.updated_at.isoformat() if template.updated_at else None
        }
    }


@router.post("/email-templates/{key}/reset")
def reset_email_template(
    key: str,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    if key not in DEFAULT_EMAIL_TEMPLATES:
        raise HTTPException(status_code=404, detail=f"Modelo padrão para '{key}' não existe.")

    template = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == key).first()
    def_data = DEFAULT_EMAIL_TEMPLATES[key]

    if template:
        template.subject = def_data["subject"]
        template.body = def_data["body"]
        template.description = def_data["description"]
        template.available_tags = def_data["available_tags"]
        template.updated_at = datetime.utcnow()
    else:
        template = models.EmailTemplate(
            key=key,
            name=def_data["name"],
            subject=def_data["subject"],
            body=def_data["body"],
            description=def_data["description"],
            available_tags=def_data["available_tags"]
        )
        db.add(template)

    db.commit()
    db.refresh(template)

    _log_action(db, "RESET_EMAIL_TEMPLATE", admin=current_user, details=f"Modelo '{template.name}' restaurado para o padrão.")

    return {
        "success": True,
        "message": f"Modelo '{template.name}' restaurado para o padrão com sucesso!",
        "template": {
            "id": template.id,
            "key": template.key,
            "name": template.name,
            "subject": template.subject,
            "body": template.body,
            "description": template.description,
            "available_tags": template.available_tags,
            "updated_at": template.updated_at.isoformat() if template.updated_at else None
        }
    }


@router.post("/email-templates/{key}/send-test")
def send_test_email_template(
    key: str,
    body: dict,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    _ensure_default_email_templates(db)
    template = db.query(models.EmailTemplate).filter(models.EmailTemplate.key == key).first()
    if not template:
        raise HTTPException(status_code=404, detail=f"Modelo '{key}' não encontrado.")

    target_email = body.get("target_email") or current_user.email
    custom_subject = body.get("subject") or template.subject
    custom_body = body.get("body") or template.body

    now = datetime.utcnow()
    sample_month_year = f"{now.month:02d}/{now.year}"
    sched = db.query(models.PaymentSchedule).filter(
        models.PaymentSchedule.year == now.year,
        models.PaymentSchedule.month == now.month
    ).first()

    sample_date = (sched.payment_date.strftime("%d/%m/%Y") if sched and sched.payment_date 
                   else (now.replace(day=28) if now.day <= 28 else now).strftime("%d/%m/%Y"))
    sample_closing = (sched.closing_date.strftime("%d/%m/%Y") if sched and sched.closing_date 
                     else (now.replace(day=20) if now.day <= 20 else now).strftime("%d/%m/%Y"))
    sample_approval = (sched.approval_date.strftime("%d/%m/%Y") if sched and sched.approval_date 
                      else (now.replace(day=25) if now.day <= 25 else now).strftime("%d/%m/%Y"))

    sub_rendered = custom_subject.replace("{nome_usuario}", current_user.name)\
                                 .replace("{nome_relatorio}", f"Relatório_{current_user.name}_{sample_month_year}")\
                                 .replace("{data_pagamento}", sample_date)\
                                 .replace("{data_fechamento}", sample_closing)\
                                 .replace("{data_aprovação}", sample_approval)\
                                 .replace("{data_aprovacao}", sample_approval)\
                                 .replace("{mes_ano}", sample_month_year)

    body_rendered = custom_body.replace("{nome_usuario}", current_user.name)\
                               .replace("{nome_relatorio}", f"Relatório_{current_user.name}_{sample_month_year}")\
                               .replace("{data_pagamento}", sample_date)\
                               .replace("{data_fechamento}", sample_closing)\
                               .replace("{data_aprovação}", sample_approval)\
                               .replace("{data_aprovacao}", sample_approval)\
                               .replace("{mes_ano}", sample_month_year)


    import email_service
    if key == "closing_dates":
        ok = email_service.send_closing_dates_email(
            user_name=current_user.name,
            user_email=target_email,
            closing_date_str=sample_closing,
            month_year_str=sample_month_year,
            custom_subject=sub_rendered,
            custom_body=body_rendered
        )
    else:
        ok = email_service.send_report_email(
            user_name=current_user.name,
            user_email=target_email,
            report_name=f"Relatório Teste ({sample_month_year})",
            pdf_path=None,
            payment_info_text=f"O pagamento será realizado no dia {sample_date}.",
            custom_subject=sub_rendered,
            custom_body=body_rendered
        )

    _log_action(db, "TEST_EMAIL_TEMPLATE", admin=current_user, target_email=target_email,
                details=f"E-mail de teste enviado para {target_email} usando modelo '{template.name}'.")

    return {
        "success": ok,
        "message": f"E-mail de teste enviado com sucesso para {target_email}!",
        "rendered_subject": sub_rendered,
        "rendered_body": body_rendered
    }



