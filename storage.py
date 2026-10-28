"""
Espelhamento de arquivos (uploads/ e exports/) no Supabase Storage.

Em hospedagens gratuitas (Render) o disco é efêmero. Este módulo mantém o
código existente, que lê/grava em disco local, e sincroniza esses diretórios
com um bucket do Supabase Storage:

  - ao iniciar: baixa tudo do bucket para o disco local;
  - após requisições de escrita: envia arquivos novos/alterados e remove
    do bucket os arquivos apagados localmente.

Sem SUPABASE_URL / SUPABASE_SERVICE_KEY definidos, nada é feito (uso local).
"""
import json
import mimetypes
import os
import threading
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
BUCKET = os.environ.get("SUPABASE_BUCKET", "reembolsos").strip()
SYNC_DIRS = ("uploads", "exports")

_lock = threading.Lock()
# caminho relativo (posix) -> (mtime, size) do que já está no bucket
_synced = {}


def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _headers(extra=None):
    h = {"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY}
    if extra:
        h.update(extra)
    return h


def _object_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}"


def _list_prefix(prefix: str):
    """Lista (recursivamente) os arquivos de um prefixo no bucket."""
    files = []
    offset = 0
    while True:
        body = json.dumps({"prefix": prefix, "limit": 1000, "offset": offset}).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
            data=body,
            headers=_headers({"Content-Type": "application/json"}),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            items = json.loads(resp.read().decode())
        for it in items:
            name = it.get("name")
            if not name:
                continue
            full = f"{prefix}/{name}" if prefix else name
            if it.get("id") is None:  # pasta
                files.extend(_list_prefix(full))
            else:
                files.append(full)
        if len(items) < 1000:
            break
        offset += 1000
    return files


def ensure_bucket():
    """Cria o bucket privado se ainda não existir."""
    if not enabled():
        return
    body = json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/bucket",
        data=body,
        headers=_headers({"Content-Type": "application/json"}),
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=30).close()
        print(f"[storage] bucket '{BUCKET}' criado")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        if e.code in (400, 409) and "exists" in detail.lower():
            return
        print(f"[storage] não foi possível criar o bucket: {e.code} {detail}")


def download_all():
    """Baixa todo o conteúdo do bucket para o disco local (na inicialização)."""
    if not enabled():
        return
    for d in SYNC_DIRS:
        os.makedirs(d, exist_ok=True)
    try:
        for d in SYNC_DIRS:
            for path in _list_prefix(d):
                local = path.replace("/", os.sep)
                os.makedirs(os.path.dirname(local) or ".", exist_ok=True)
                try:
                    req = urllib.request.Request(_object_url(path), headers=_headers())
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        data = resp.read()
                    with open(local, "wb") as f:
                        f.write(data)
                    st = os.stat(local)
                    _synced[path] = (st.st_mtime, st.st_size)
                except Exception as e:  # um arquivo ruim não derruba o boot
                    print(f"[storage] falha ao baixar {path}: {e}")
    except Exception as e:
        print(f"[storage] falha ao listar bucket: {e}")


def download_bytes(path: str):
    if not enabled():
        return None
    try:
        req = urllib.request.Request(_object_url(path), headers=_headers())
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except Exception as e:
        print(f"[storage] falha ao buscar {path}: {e}")
        return None


def upload_file(remote_path: str, local: str):
    if not enabled():
        return
    try:
        _upload(remote_path, local)
    except Exception as e:
        print(f"[storage] falha ao enviar {remote_path}: {e}")


def _upload(path: str, local: str):
    with open(local, "rb") as f:
        data = f.read()
    ctype = mimetypes.guess_type(local)[0] or "application/octet-stream"
    req = urllib.request.Request(
        _object_url(path),
        data=data,
        headers=_headers({"Content-Type": ctype, "x-upsert": "true"}),
        method="POST",
    )
    urllib.request.urlopen(req, timeout=60).close()


def _delete(path: str):
    req = urllib.request.Request(_object_url(path), headers=_headers(), method="DELETE")
    try:
        urllib.request.urlopen(req, timeout=30).close()
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise


def sync_up():
    """Envia arquivos novos/alterados e remove do bucket os apagados localmente."""
    if not enabled():
        return
    with _lock:
        current = {}
        for d in SYNC_DIRS:
            dirs_to_scan = [d]
            tmp_d = os.path.join("/tmp", d)
            if os.path.isdir(tmp_d):
                dirs_to_scan.append(tmp_d)
            for base_dir in dirs_to_scan:
                if not os.path.isdir(base_dir):
                    continue
                for root, _dirs, files in os.walk(base_dir):
                    for name in files:
                        local = os.path.join(root, name)
                        rel_from_base = os.path.relpath(local, base_dir).replace(os.sep, "/")
                        rel = f"{d}/{rel_from_base}"
                        try:
                            st = os.stat(local)
                        except OSError:
                            continue
                        current[rel] = (st.st_mtime, st.st_size, local)
        for rel, (mtime, size, local_path) in current.items():
            if _synced.get(rel) != (mtime, size):
                try:
                    _upload(rel, local_path)
                    _synced[rel] = (mtime, size)
                except Exception as e:
                    print(f"[storage] falha ao enviar {rel}: {e}")
        # Só remove se não estiver no Vercel (onde arquivos locais podem não existir na lambda)
        if not os.environ.get("VERCEL"):
            for rel in [p for p in _synced if p not in current]:
                try:
                    _delete(rel)
                    _synced.pop(rel, None)
                except Exception as e:
                    print(f"[storage] falha ao remover {rel}: {e}")


def sync_up_async():
    threading.Thread(target=sync_up, daemon=True).start()

