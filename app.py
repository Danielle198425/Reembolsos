import os
import mimetypes
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from database import engine, Base, SessionLocal, IS_SQLITE
import models
import storage
from routers import auth, dashboard, expenses, exports, admin, sienge
from seed import run_seed

# Tipos compatíveis entre SQLite e Postgres
_DT = "DATETIME" if IS_SQLITE else "TIMESTAMP"
_BOOL_FALSE = "BOOLEAN DEFAULT 0" if IS_SQLITE else "BOOLEAN DEFAULT FALSE"

# Auto-migration: (tabela, coluna, definição SQL)
_MIGRATIONS = [
    ("categories", "sienge_apportionment_id", "VARCHAR(100)"),

    ("expenses", "edited_after_approval", _BOOL_FALSE),
    ("expenses", "is_corrected", _BOOL_FALSE),
    ("expenses", "rejected_by", "INTEGER REFERENCES users(id)"),
    ("expenses", "rejected_at", _DT),
    ("expenses", "edit_history", "TEXT"),
    ("expenses", "finalized_by", "INTEGER REFERENCES users(id)"),
    ("expenses", "finalized_at", _DT),
    ("expenses", "paid_by", "INTEGER REFERENCES users(id)"),
    ("expenses", "paid_at", _DT),
    ("expenses", "export_id", "INTEGER REFERENCES exports(id)"),
    ("expenses", "email_sent", _BOOL_FALSE),
    ("expenses", "sienge_title", "VARCHAR(100)"),
    ("expenses", "sienge_sent_at", _DT),
    ("expenses", "sienge_sent_by", "INTEGER REFERENCES users(id)"),
    ("expenses", "created_by_admin_id", "INTEGER REFERENCES users(id)"),
    ("expenses", "created_by_admin_name", "VARCHAR(200)"),
    ("expenses", "approved_by_admin_id", "INTEGER REFERENCES users(id)"),
    ("expenses", "approved_by_admin_name", "VARCHAR(200)"),
    ("expenses", "rejected_by_admin_id", "INTEGER REFERENCES users(id)"),
    ("expenses", "rejected_by_admin_name", "VARCHAR(200)"),
    ("expenses", "finalized_by_admin_id", "INTEGER REFERENCES users(id)"),
    ("expenses", "finalized_by_admin_name", "VARCHAR(200)"),
    ("expenses", "paid_by_admin_id", "INTEGER REFERENCES users(id)"),
    ("expenses", "paid_by_admin_name", "VARCHAR(200)"),

    ("exports", "target_user_id", "INTEGER REFERENCES users(id)"),
    ("exports", "expense_user_ids", "TEXT"),
    ("exports", "email_sent", _BOOL_FALSE),
    ("exports", "email_sent_at", _DT),

    ("users", "approver_rules", "TEXT"),

    ("cost_centers", "company_id", "INTEGER REFERENCES companies(id)"),

    ("payment_schedules", "approval_date", "DATE"),
    ("payment_schedules", "closing_date", "DATE"),

    ("category_override_rules", "category_ids", "TEXT"),
    ("category_override_rules", "cost_center_ids", "TEXT"),
]


def run_auto_migrations():
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    cache = {}
    for table, column, ddl in _MIGRATIONS:
        if table not in existing_tables:
            continue
        if table not in cache:
            cache[table] = {c["name"] for c in insp.get_columns(table)}
        if column in cache[table]:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            cache[table].add(column)
        except Exception as e:
            print(f"[migration] {table}.{column}: {e}")


IS_VERCEL = bool(os.environ.get("VERCEL"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # No Vercel (serverless lambda), o filesystem é somente leitura exceto /tmp.
    # Supabase (Postgres + Storage) é a fonte de verdade persistente.
    if IS_VERCEL:
        try:
            os.makedirs("/tmp/uploads", exist_ok=True)
            os.makedirs("/tmp/exports", exist_ok=True)
        except Exception:
            pass
        try:
            storage.ensure_bucket()
            storage.sync_up_async()
        except Exception:
            pass
        yield
        return

    # Em ambiente com disco (Local / Render):
    storage.ensure_bucket()
    storage.download_all()
    # Cria tabelas e popula dados iniciais
    Base.metadata.create_all(bind=engine)
    run_seed()
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("exports", exist_ok=True)
    try:
        run_auto_migrations()
    except Exception as e:
        print(f"[migration] erro: {e}")

    try:
        db = SessionLocal()
        sienge.sync_companies(db)
        sienge.sync_cost_centers(db)
        db.close()
    except Exception:
        pass
    storage.sync_up()
    yield

app = FastAPI(
    title="Sistema de Reembolsos Moura Leite",
    description="Gestão completa de reembolsos corporativos",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def sync_files_after_write(request: Request, call_next):
    """Após requisições que alteram dados, espelha uploads/exports no Supabase."""
    response = await call_next(request)
    if storage.enabled() and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        storage.sync_up_async()
    return response


# Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(expenses.router)
app.include_router(exports.router)
app.include_router(admin.router)
app.include_router(sienge.router)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

import urllib.parse  # noqa: E402


@app.get("/uploads/{file_path:path}", include_in_schema=False)
async def serve_upload(file_path: str):
    clean_name = urllib.parse.unquote(file_path).lstrip("/")
    raw_name = file_path.lstrip("/")

    # 1. Checa em /tmp/uploads (disco de escrita no Vercel)
    for candidate in (raw_name, clean_name):
        tmp_path = os.path.join("/tmp/uploads", candidate)
        if os.path.isfile(tmp_path):
            return FileResponse(tmp_path)

    # 2. Checa em uploads/ (arquivos empacotados com a aplicação)
    for candidate in (raw_name, clean_name):
        local_path = os.path.join("uploads", candidate)
        if os.path.isfile(local_path):
            return FileResponse(local_path)

    # 3. Busca no Supabase Storage
    if storage.enabled():
        for candidate in (clean_name, raw_name):
            remote_path = f"uploads/{candidate}"
            data = storage.download_bytes(remote_path)
            if data is not None:
                # Salva em /tmp/uploads para cache local rápido
                tmp_path = os.path.join("/tmp/uploads", candidate)
                try:
                    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                    with open(tmp_path, "wb") as f:
                        f.write(data)
                    return FileResponse(tmp_path)
                except Exception:
                    pass
                ctype = mimetypes.guess_type(candidate)[0] or ("application/pdf" if candidate.lower().endswith(".pdf") else "application/octet-stream")
                fname = os.path.basename(candidate)
                return Response(
                    content=data,
                    media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{fname}"'}
                )

    return JSONResponse({"detail": "Não encontrado"}, status_code=404)


@app.get("/exports/{file_path:path}", include_in_schema=False)
async def serve_export(file_path: str):
    clean_name = urllib.parse.unquote(file_path).lstrip("/")
    raw_name = file_path.lstrip("/")

    # 1. Checa em /tmp/exports
    for candidate in (raw_name, clean_name):
        tmp_path = os.path.join("/tmp/exports", candidate)
        if os.path.isfile(tmp_path):
            return FileResponse(tmp_path)

    # 2. Checa em exports/
    for candidate in (raw_name, clean_name):
        local_path = os.path.join("exports", candidate)
        if os.path.isfile(local_path):
            return FileResponse(local_path)

    # 3. Supabase Storage
    if storage.enabled():
        for candidate in (clean_name, raw_name):
            remote_path = f"exports/{candidate}"
            data = storage.download_bytes(remote_path)
            if data is not None:
                tmp_path = os.path.join("/tmp/exports", candidate)
                try:
                    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                    with open(tmp_path, "wb") as f:
                        f.write(data)
                    return FileResponse(tmp_path)
                except Exception:
                    pass
                ctype = mimetypes.guess_type(candidate)[0] or ("application/pdf" if candidate.lower().endswith(".pdf") else "application/octet-stream")
                fname = os.path.basename(candidate)
                return Response(
                    content=data,
                    media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{fname}"'}
                )

    return JSONResponse({"detail": "Não encontrado"}, status_code=404)


@app.get("/", include_in_schema=False)
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(request: Request, full_path: str = ""):
    """Serve o SPA para qualquer rota não-API."""
    norm_path = full_path.replace("\\", "/")
    if norm_path.startswith("api/") or norm_path.startswith("static/") or norm_path.startswith("uploads/") or norm_path.startswith("exports/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index_path = "index.html" if os.path.exists("index.html") else "static/index.html"
    if os.path.exists(index_path):
        return FileResponse(index_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"})
    return JSONResponse({"detail": "Frontend não encontrado"}, status_code=404)


class AsgiPathRewrite:
    """
    Restaura o caminho de endpoints do FastAPI reescritos pela Vercel através de __path.
    Funciona antes do roteamento do Starlette/FastAPI ser executado.
    """
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            qs_bytes = scope.get("query_string", b"")
            qs = qs_bytes.decode("utf-8", errors="ignore")
            if "__path=" in qs:
                params = urllib.parse.parse_qs(qs)
                if "__path" in params:
                    raw_val = params.pop("__path")[0].lstrip("/")
                    if raw_val.startswith("uploads/") or raw_val.startswith("exports/"):
                        new_p = "/" + raw_val
                    elif raw_val.startswith("api/"):
                        new_p = "/" + raw_val
                    else:
                        new_p = "/api/" + raw_val
                    scope["path"] = new_p
                    scope["raw_path"] = new_p.encode("utf-8")
                    clean_qs = urllib.parse.urlencode([(k, v) for k, vs in params.items() for v in vs])
                    scope["query_string"] = clean_qs.encode("ascii")
        await self.asgi_app(scope, receive, send)


app = AsgiPathRewrite(app)
