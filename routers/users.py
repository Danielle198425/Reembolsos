from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/users", tags=["users"])


def _normalize(addr: str) -> str:
    return " ".join((addr or "").strip().lower().split())


@router.get("/saved-addresses", response_model=schemas.SavedAddressesResponse)
def get_saved_addresses(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retorna os endereços favoritos e os 3 últimos endereços recentes distintos do usuário,
    sem duplicar endereços já presentes nos favoritos.
    """
    # 1. Favoritos
    favorites = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == True
        )
        .order_by(models.UserSavedAddress.id.desc())
        .all()
    )

    fav_normalized = {_normalize(f.address) for f in favorites}

    # 2. Recentes (is_favorite == False), ordenados por last_used_at DESC
    all_recents = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == False
        )
        .order_by(desc(models.UserSavedAddress.last_used_at))
        .all()
    )

    # Filtrar para não duplicar favoritos nem duplicar entre si, pegando no máximo 3
    filtered_recent = []
    seen = set()
    for r in all_recents:
        norm = _normalize(r.address)
        if norm not in fav_normalized and norm not in seen:
            seen.add(norm)
            filtered_recent.append(r)
            if len(filtered_recent) == 3:
                break

    return {
        "favorites": favorites,
        "recent": filtered_recent
    }


@router.post("/saved-addresses/favorite", response_model=schemas.SavedAddressOut)
def save_favorite_address(
    req: schemas.SaveFavoriteRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    clean_addr = (req.address or "").strip()
    if not clean_addr:
        raise HTTPException(status_code=400, detail="Endereço não pode ser vazio.")

    clean_label = (req.label or "").strip() if req.label else None
    norm = _normalize(clean_addr)

    # Verifica se já existe esse endereço salvo (como favorito ou recente)
    existing_items = (
        db.query(models.UserSavedAddress)
        .filter(models.UserSavedAddress.user_id == current_user.id)
        .all()
    )

    matched = None
    for item in existing_items:
        if _normalize(item.address) == norm:
            matched = item
            break

    if matched:
        matched.is_favorite = True
        if clean_label:
            matched.label = clean_label
        matched.last_used_at = datetime.utcnow()
        db.commit()
        db.refresh(matched)
        return matched

    # Cria novo favorito
    new_fav = models.UserSavedAddress(
        user_id=current_user.id,
        address=clean_addr,
        label=clean_label,
        is_favorite=True,
        last_used_at=datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    db.add(new_fav)
    db.commit()
    db.refresh(new_fav)
    return new_fav


@router.delete("/saved-addresses/favorite/{address_id}")
def delete_favorite_address(
    address_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    item = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.id == address_id,
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == True
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Endereço favorito não encontrado.")

    db.delete(item)
    db.commit()
    return {"success": True, "message": "Favorito removido com sucesso."}


@router.post("/saved-addresses/recent")
def add_recent_address(
    req: schemas.AddRecentRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    clean_addr = (req.address or "").strip()
    if not clean_addr:
        return {"success": False, "message": "Endereço vazio."}

    norm = _normalize(clean_addr)

    # 1. Se já está nos favoritos, não salva em recentes (evita duplicação)
    fav_exists = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == True
        )
        .all()
    )
    for fav in fav_exists:
        if _normalize(fav.address) == norm:
            return {"success": True, "message": "Já presente nos favoritos."}

    # 2. Se já existe em recentes, apenas atualiza last_used_at
    recent_items = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == False
        )
        .order_by(desc(models.UserSavedAddress.last_used_at))
        .all()
    )

    matched = None
    for r in recent_items:
        if _normalize(r.address) == norm:
            matched = r
            break

    if matched:
        matched.last_used_at = datetime.utcnow()
    else:
        new_recent = models.UserSavedAddress(
            user_id=current_user.id,
            address=clean_addr,
            is_favorite=False,
            last_used_at=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
        db.add(new_recent)

    db.commit()

    # 3. Limpeza: manter apenas os 3 mais recentes do usuário
    all_updated_recents = (
        db.query(models.UserSavedAddress)
        .filter(
            models.UserSavedAddress.user_id == current_user.id,
            models.UserSavedAddress.is_favorite == False
        )
        .order_by(desc(models.UserSavedAddress.last_used_at))
        .all()
    )

    if len(all_updated_recents) > 3:
        for excess in all_updated_recents[3:]:
            db.delete(excess)
        db.commit()

    return {"success": True}
