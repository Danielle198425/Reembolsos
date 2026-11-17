import logging
from typing import Optional, List, Tuple, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import models, auth
from services import azure_maps

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/maps", tags=["maps"])


class RouteRequest(BaseModel):
    origin: str
    dest: str
    origin_coords: Optional[List[float]] = None
    dest_coords: Optional[List[float]] = None


@router.get("/search")
def search_addresses(
    q: str = Query(..., min_length=2, description="Texto para busca ou autocomplete de endereço"),
    limit: int = Query(5, ge=1, le=10),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Busca de endereços e autocomplete via Azure Maps com fallback para OpenStreetMap (Nominatim).
    """
    try:
        results = azure_maps.search_address(query=q, limit=limit)
        return {"results": results}
    except Exception as e:
        logger.error(f"[maps_router] Erro ao buscar endereços: {e}")
        return {"results": []}


@router.get("/reverse")
def reverse_geocoding(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Geocodificação reversa para converter latitude/longitude do GPS em endereço legível.
    """
    try:
        res = azure_maps.reverse_geocode(lat=lat, lon=lon)
        if not res:
            raise HTTPException(status_code=404, detail="Endereço não localizado para as coordenadas informadas.")
        return res
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[maps_router] Erro no reverse geocoding: {e}")
        raise HTTPException(status_code=500, detail="Erro ao converter coordenadas em endereço.")


@router.post("/route")
def calculate_route(
    req: RouteRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Calcula distância e traçado de rota entre origem e destino via Azure Maps Route Directions API.
    Retorna GeoJSON pronto para plotagem no Leaflet, quilometragem e tempo estimado.
    """
    clean_origin = (req.origin or "").strip()
    clean_dest = (req.dest or "").strip()

    if not clean_origin or not clean_dest:
        raise HTTPException(status_code=400, detail="Preencha Ponto Inicial e Final.")

    if clean_origin.lower() == clean_dest.lower():
        raise HTTPException(status_code=400, detail="Ponto Inicial e Final não podem ser iguais.")

    try:
        route_info = azure_maps.calculate_route(
            origin=clean_origin,
            dest=clean_dest,
            origin_coords=tuple(req.origin_coords) if req.origin_coords and len(req.origin_coords) == 2 else None,
            dest_coords=tuple(req.dest_coords) if req.dest_coords and len(req.dest_coords) == 2 else None
        )

        if not route_info or "distance_km" not in route_info:
            raise HTTPException(status_code=500, detail="Não foi possível calcular a rota para os endereços informados.")

        return route_info
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=502, detail=str(re))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[maps_router] Erro inesperado ao calcular rota: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao processar rota.")
