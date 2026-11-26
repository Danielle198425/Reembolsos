import os
import time
import logging
from typing import Dict, Any, Optional, List, Tuple
import requests

logger = logging.getLogger(__name__)

# Cache de token Entra ID em memória
_cached_token: Optional[str] = None
_token_expires_at: float = 0.0

# Singleton de credencial Entra ID e de sessão HTTP com pooling
_azure_credential = None
_http_session: Optional[requests.Session] = None

DEFAULT_USER_AGENT = "MouraLeiteReembolsos/1.0 (reembolsos@mouraleite.com.br)"


def _get_azure_credential():
    """Retorna instância singleton de DefaultAzureCredential para reaproveitamento de cache interno."""
    global _azure_credential
    if _azure_credential is None:
        from azure.identity import DefaultAzureCredential
        _azure_credential = DefaultAzureCredential()
    return _azure_credential


def _get_http_session() -> requests.Session:
    """Retorna instância singleton de requests.Session com pool de conexões reutilizáveis (keep-alive)."""
    global _http_session
    if _http_session is None:
        s = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=1)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
        _http_session = s
    return _http_session


def _ensure_env_loaded():
    """Carrega variáveis do arquivo .env caso não estejam no os.environ."""
    if os.environ.get("AZURE_MAPS_CLIENT_ID"):
        return
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass


def is_azure_maps_configured() -> bool:
    """
    Verifica se o Azure Maps possui credenciais válidas configuradas no ambiente.
    Retorna False se o Client ID não estiver definido, estiver vazio ou for o placeholder '00000000-...'.
    """
    _ensure_env_loaded()
    client_id = os.environ.get("AZURE_MAPS_CLIENT_ID", "").strip()

    if client_id and not client_id.startswith("00000000") and len(client_id) > 10:
        return True

    return False


def get_azure_maps_headers() -> Optional[Dict[str, str]]:
    """
    Retorna os headers de autenticação para o Azure Maps utilizando exclusivamente
    Microsoft Entra ID (DefaultAzureCredential no escopo https://atlas.microsoft.com/.default)
    e o header x-ms-client-id. Não utiliza chaves compartilhadas (Shared Key).
    """
    _ensure_env_loaded()
    client_id = os.environ.get("AZURE_MAPS_CLIENT_ID", "").strip()
    if not client_id or client_id.startswith("00000000"):
        return None

    global _cached_token, _token_expires_at
    now = time.time()

    if _cached_token and now < (_token_expires_at - 120):
        return {
            "Authorization": f"Bearer {_cached_token}",
            "x-ms-client-id": client_id
        }

    try:
        credential = _get_azure_credential()
        # Escopo oficial do Azure Maps para autenticação Entra ID
        token_obj = credential.get_token("https://atlas.microsoft.com/.default")
        _cached_token = token_obj.token
        _token_expires_at = token_obj.expires_on if hasattr(token_obj, "expires_on") else (now + 3000)

        return {
            "Authorization": f"Bearer {_cached_token}",
            "x-ms-client-id": client_id
        }
    except Exception as e:
        logger.warning(f"[azure_maps] Falha ao obter token Entra ID para Azure Maps: {e}")
        return None


# ─── FALLBACK: NOMINATIM & OSRM ───────────────────────────────────────────────

def _fallback_search_nominatim(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Fallback para busca de endereços via Nominatim (OpenStreetMap)."""
    try:
        url = "https://nominatim.openstreetmap.org/search"
        resp = _get_http_session().get(
            url,
            params={
                "format": "json",
                "q": query,
                "countrycodes": "br",
                "limit": limit,
                "addressdetails": 1
            },
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept-Language": "pt-BR"
            },
            timeout=10
        )
        if resp.status_code != 200:
            return []

        data = resp.json()
        results = []
        for item in data:
            addr = item.get("address", {})
            main_name = (
                addr.get("road")
                or addr.get("pedestrian")
                or addr.get("highway")
                or addr.get("amenity")
                or item.get("display_name", "").split(",")[0]
            )

            parts = []
            neighborhood = addr.get("suburb") or addr.get("neighbourhood") or addr.get("city_district")
            city = addr.get("city") or addr.get("town") or addr.get("municipality") or addr.get("village")
            state = addr.get("state")
            if neighborhood:
                parts.append(neighborhood)
            if city:
                parts.append(city)
            if state:
                parts.append(state.upper() if len(state) <= 3 else state)

            sub_text = " • ".join(parts) if parts else item.get("display_name", "")

            # Limpa cauda do display_name para endereço limpo
            raw_display = item.get("display_name", "")
            clean_addr = raw_display.replace(", Brasil", "").replace(", Região Sudeste", "")

            results.append({
                "main_name": main_name,
                "sub_text": sub_text,
                "formatted_address": clean_addr,
                "lat": float(item.get("lat")),
                "lon": float(item.get("lon")),
                "provider": "nominatim_fallback"
            })
        return results
    except Exception as e:
        logger.error(f"[azure_maps] Erro no fallback Nominatim search: {e}")
        return []


def _fallback_reverse_nominatim(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fallback para geocodificação reversa via Nominatim (OpenStreetMap)."""
    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        resp = _get_http_session().get(
            url,
            params={
                "format": "json",
                "lat": lat,
                "lon": lon,
                "zoom": 18,
                "addressdetails": 1
            },
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept-Language": "pt-BR"
            },
            timeout=10
        )
        if resp.status_code != 200:
            return None

        data = resp.json()
        display_name = data.get("display_name")
        if not display_name:
            return None

        clean_addr = display_name.replace(", Brasil", "").replace(", Região Sudeste", "")
        return {
            "formatted_address": clean_addr,
            "lat": lat,
            "lon": lon,
            "provider": "nominatim_fallback"
        }
    except Exception as e:
        logger.error(f"[azure_maps] Erro no fallback Nominatim reverse: {e}")
        return None


def _fallback_route_osrm(
    lat_a: float, lon_a: float, lat_b: float, lon_b: float,
    origin_name: str, dest_name: str
) -> Optional[Dict[str, Any]]:
    """Fallback para cálculo de rota via OSRM público."""
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{lon_a},{lat_a};{lon_b},{lat_b}?overview=full&geometries=geojson"
        resp = _get_http_session().get(url, headers={"User-Agent": DEFAULT_USER_AGENT}, timeout=10)
        if resp.status_code != 200:
            return None

        data = resp.json()
        routes = data.get("routes", [])
        if not routes:
            return None

        dist_m = routes[0].get("distance", 0.0)
        dist_km = dist_m / 1000.0
        dur_sec = routes[0].get("duration", 0.0)
        dur_min = dur_sec / 60.0
        geometry = routes[0].get("geometry", {})

        return {
            "distance_km": round(dist_km, 2),
            "duration_min": round(dur_min, 1),
            "has_tolls": False,
            "toll_amount": None,
            "toll_sections_count": 0,
            "origin": origin_name,
            "dest": dest_name,
            "origin_coords": [lat_a, lon_a],
            "dest_coords": [lat_b, lon_b],
            "geojson": {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "distance_km": round(dist_km, 2),
                    "duration_min": round(dur_min, 1)
                }
            },
            "provider": "osrm_fallback"
        }
    except Exception as e:
        logger.error(f"[azure_maps] Erro no fallback OSRM route: {e}")
        return None


# ─── SERVIÇO PRINCIPAL: AZURE MAPS (COM FALLBACK AUTOMÁTICO) ─────────────────

def search_address(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Busca endereços / autocomplete utilizando o Azure Maps Search Address API.
    Caso o Azure Maps não esteja configurado ou ocorra falha, recorre ao Nominatim.
    """
    clean_query = (query or "").strip()
    if not clean_query:
        return []

    if not is_azure_maps_configured():
        return _fallback_search_nominatim(clean_query, limit=limit)

    headers = get_azure_maps_headers()
    if not headers:
        return _fallback_search_nominatim(clean_query, limit=limit)

    url = "https://atlas.microsoft.com/search/address/json"
    params = {
        "api-version": "1.0",
        "countrySet": "BR",
        "language": "pt-BR",
        "limit": limit,
        "query": clean_query
    }

    try:
        resp = _get_http_session().get(url, params=params, headers=headers, timeout=8)
        if resp.status_code == 429:
            logger.warning("[azure_maps] Limite de requisições (429) no Azure Maps. Acionando fallback.")
            return _fallback_search_nominatim(clean_query, limit=limit)

        if resp.status_code != 200:
            logger.warning(f"[azure_maps] Status {resp.status_code} na busca. Acionando fallback.")
            return _fallback_search_nominatim(clean_query, limit=limit)

        data = resp.json()
        results = []
        for item in data.get("results", []):
            addr = item.get("address", {})
            pos = item.get("position", {})

            street = addr.get("streetName")
            num = addr.get("streetNumber")
            if street and num:
                main_name = f"{street}, {num}"
            elif street:
                main_name = street
            else:
                main_name = (addr.get("freeformAddress") or clean_query).split(",")[0]

            parts = []
            bairro = addr.get("municipalitySubdivision")
            cidade = addr.get("municipality")
            uf = addr.get("countrySubdivision")
            if bairro:
                parts.append(bairro)
            if cidade:
                parts.append(cidade)
            if uf:
                parts.append(uf.upper() if len(uf) <= 3 else uf)

            sub_text = " • ".join(parts) if parts else (addr.get("freeformAddress") or "")
            formatted_addr = addr.get("freeformAddress") or f"{main_name}, {sub_text}"

            results.append({
                "main_name": main_name,
                "sub_text": sub_text,
                "formatted_address": formatted_addr,
                "lat": float(pos.get("lat")),
                "lon": float(pos.get("lon")),
                "provider": "azure_maps"
            })

        if not results:
            return _fallback_search_nominatim(clean_query, limit=limit)

        return results
    except Exception as e:
        logger.warning(f"[azure_maps] Exceção na busca Azure Maps: {e}. Acionando fallback.")
        return _fallback_search_nominatim(clean_query, limit=limit)


def reverse_geocode(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Converte coordenadas de GPS em endereço formatado legível via Azure Maps Reverse Search.
    Caso não configurado ou ocorra falha, recorre ao Nominatim.
    """
    if not is_azure_maps_configured():
        return _fallback_reverse_nominatim(lat, lon)

    headers = get_azure_maps_headers()
    if not headers:
        return _fallback_reverse_nominatim(lat, lon)

    url = "https://atlas.microsoft.com/search/address/reverse/json"
    params = {
        "api-version": "1.0",
        "language": "pt-BR",
        "query": f"{lat},{lon}"
    }

    try:
        resp = _get_http_session().get(url, params=params, headers=headers, timeout=8)
        if resp.status_code != 200:
            logger.warning(f"[azure_maps] Status {resp.status_code} no reverse geocode. Acionando fallback.")
            return _fallback_reverse_nominatim(lat, lon)

        data = resp.json()
        addresses = data.get("addresses", [])
        if not addresses:
            return _fallback_reverse_nominatim(lat, lon)

        addr = addresses[0].get("address", {})
        freeform = addr.get("freeformAddress")
        if not freeform:
            return _fallback_reverse_nominatim(lat, lon)

        return {
            "formatted_address": freeform,
            "lat": lat,
            "lon": lon,
            "provider": "azure_maps"
        }
    except Exception as e:
        logger.warning(f"[azure_maps] Exceção no reverse geocode Azure Maps: {e}. Acionando fallback.")
        return _fallback_reverse_nominatim(lat, lon)


def calculate_route(
    origin: str,
    dest: str,
    origin_coords: Optional[Tuple[float, float]] = None,
    dest_coords: Optional[Tuple[float, float]] = None
) -> Dict[str, Any]:
    """
    Calcula distância e traçado de rota entre origem e destino via Azure Maps Route Directions API.
    Retorna GeoJSON compatível com Leaflet e valores de distância em km e tempo em minutos.
    Caso ocorra qualquer erro ou limite de cota, aciona automaticamente o fallback OSRM.
    """
    # 1. Obter coordenadas de origem se não informadas
    lat_a, lon_a = None, None
    if origin_coords and len(origin_coords) == 2:
        lat_a, lon_a = float(origin_coords[0]), float(origin_coords[1])
    else:
        geo_a = search_address(origin, limit=1)
        if geo_a:
            lat_a, lon_a = geo_a[0]["lat"], geo_a[0]["lon"]

    # 2. Obter coordenadas de destino se não informadas
    lat_b, lon_b = None, None
    if dest_coords and len(dest_coords) == 2:
        lat_b, lon_b = float(dest_coords[0]), float(dest_coords[1])
    else:
        geo_b = search_address(dest, limit=1)
        if geo_b:
            lat_b, lon_b = geo_b[0]["lat"], geo_b[0]["lon"]

    if lat_a is None or lon_a is None:
        raise ValueError(f"Não foi possível localizar o endereço de origem: {origin}")
    if lat_b is None or lon_b is None:
        raise ValueError(f"Não foi possível localizar o endereço de destino: {dest}")

    # Fallback se Azure Maps não estiver configurado
    if not is_azure_maps_configured():
        res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
        if res:
            return res
        raise RuntimeError("Não foi possível calcular a rota pelos provedores disponíveis.")

    headers = get_azure_maps_headers()
    if not headers:
        res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
        if res:
            return res
        raise RuntimeError("Não foi possível calcular a rota pelos provedores disponíveis.")

    # 3. Consulta ao Azure Maps Route Directions API
    url = "https://atlas.microsoft.com/route/directions/json"
    params = {
        "api-version": "1.0",
        "travelMode": "car",
        "routeType": "fastest",
        "sectionType": "tollRoad",
        "report": "effectiveSettings",
        "query": f"{lat_a},{lon_a}:{lat_b},{lon_b}"
    }

    try:
        resp = _get_http_session().get(url, params=params, headers=headers, timeout=12)
        if resp.status_code == 429:
            logger.warning("[azure_maps] Limite de requisições (429) no cálculo de rotas. Acionando fallback OSRM.")
            res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
            if res:
                return res

        if resp.status_code != 200:
            logger.warning(f"[azure_maps] Erro HTTP {resp.status_code} no cálculo de rotas. Acionando fallback OSRM.")
            res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
            if res:
                return res
            raise RuntimeError(f"Erro no serviço de mapas (status {resp.status_code}).")

        data = resp.json()
        routes = data.get("routes", [])
        if not routes:
            logger.warning("[azure_maps] Nenhuma rota retornada pelo Azure Maps. Acionando fallback OSRM.")
            res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
            if res:
                return res
            raise RuntimeError("Não foi possível encontrar uma rota para o trajeto informado.")

        summary = routes[0].get("summary", {})
        length_m = summary.get("lengthInMeters", 0.0)
        dist_km = length_m / 1000.0
        time_sec = summary.get("travelTimeInSeconds", 0.0)
        duration_min = time_sec / 60.0

        # Detecção de pedágios (toll roads)
        sections = routes[0].get("sections", [])
        toll_sections = [
            s for s in sections
            if str(s.get("sectionType", "")).upper() in ("TOLL_ROAD", "TOLLROAD")
        ]
        toll_sections_count = len(toll_sections)

        # Captura de valor de pedágio se fornecido pelo Azure Maps
        toll_amount = None
        toll_cost_val = summary.get("tollCost")
        if toll_cost_val is not None:
            try:
                toll_amount = float(toll_cost_val)
            except (ValueError, TypeError):
                toll_amount = None

        has_tolls = (toll_sections_count > 0) or (toll_amount is not None and toll_amount > 0)

        # Converte lista de points para coordenadas GeoJSON [lon, lat]
        coordinates = []
        for leg in routes[0].get("legs", []):
            for pt in leg.get("points", []):
                # pt possui 'latitude' e 'longitude'
                coordinates.append([float(pt["longitude"]), float(pt["latitude"])])

        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates
            },
            "properties": {
                "distance_km": round(dist_km, 2),
                "duration_min": round(duration_min, 1),
                "has_tolls": bool(has_tolls),
                "toll_amount": toll_amount,
                "toll_sections_count": toll_sections_count
            }
        }

        return {
            "distance_km": round(dist_km, 2),
            "duration_min": round(duration_min, 1),
            "has_tolls": bool(has_tolls),
            "toll_amount": toll_amount,
            "toll_sections_count": toll_sections_count,
            "origin": origin,
            "dest": dest,
            "origin_coords": [lat_a, lon_a],
            "dest_coords": [lat_b, lon_b],
            "geojson": geojson,
            "provider": "azure_maps"
        }

    except Exception as e:
        logger.warning(f"[azure_maps] Exceção no Azure Maps route: {e}. Acionando fallback OSRM.")
        res = _fallback_route_osrm(lat_a, lon_a, lat_b, lon_b, origin, dest)
        if res:
            return res
        raise RuntimeError(f"Erro ao calcular rota: {str(e)}")


def get_map_tile(z: int, x: int, y: int) -> Tuple[bytes, str]:
    """
    Obtém a imagem de tile do mapa via Azure Maps Render Tile API.
    Utiliza autenticação gerenciada via Entra ID (DefaultAzureCredential) + x-ms-client-id.
    Se não configurado ou em caso de indisponibilidade, recorre aos tiles do OpenStreetMap.
    """
    if is_azure_maps_configured():
        headers = get_azure_maps_headers()
        if headers:
            url = "https://atlas.microsoft.com/map/tile"
            params = {
                "api-version": "2024-04-01",
                "tilesetId": "microsoft.base.road",
                "zoom": z,
                "x": x,
                "y": y,
                "language": "pt-BR"
            }
            try:
                resp = _get_http_session().get(url, params=params, headers=headers, timeout=5)
                if resp.status_code == 200 and resp.content:
                    c_type = resp.headers.get("Content-Type", "image/png")
                    return resp.content, c_type
                else:
                    logger.warning(f"[azure_maps] Status {resp.status_code} no Render Tile API. Usando fallback.")
            except Exception as e:
                logger.warning(f"[azure_maps] Erro ao carregar tile do Azure Maps: {e}. Usando fallback.")

    # Fallback para OpenStreetMap
    osm_url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    resp = _get_http_session().get(
        osm_url,
        headers={"User-Agent": DEFAULT_USER_AGENT},
        timeout=6
    )
    return resp.content, resp.headers.get("Content-Type", "image/png")
