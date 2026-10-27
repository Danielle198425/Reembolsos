"""
Migra os dados do SQLite local (reembolsos.db) para o Postgres do Supabase
e envia uploads/ e exports/ para o Supabase Storage.

Uso (PowerShell):
    $env:DATABASE_URL = "postgresql://...supabase..."
    $env:SUPABASE_URL = "https://xxxx.supabase.co"
    $env:SUPABASE_SERVICE_KEY = "..."
    python migrate_to_supabase.py
"""
import os
import sys
from sqlalchemy import create_engine, text, insert

SQLITE_URL = "sqlite:///./reembolsos.db"
PG_URL = os.environ.get("DATABASE_URL", "")

if not PG_URL or PG_URL.startswith("sqlite"):
    sys.exit("Defina DATABASE_URL com a connection string do Postgres do Supabase.")

# importa depois de validar, pois database.py usa DATABASE_URL
import database  # noqa: E402
import models  # noqa: F401,E402
import storage  # noqa: E402

src = create_engine(SQLITE_URL)
dst = database.engine
metadata = database.Base.metadata

print("Criando tabelas no Postgres...")
metadata.create_all(bind=dst)

with dst.begin() as conn:
    existing = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
if existing:
    sys.exit(f"O destino já tem {existing} usuário(s). Abortando para não duplicar dados.")

# colunas que existem nas duas pontas (o SQLite pode ter colunas a menos/mais)
with src.connect() as sconn, dst.begin() as dconn:
    for table in metadata.sorted_tables:
        try:
            rows = sconn.execute(table.select()).mappings().all()
        except Exception as e:
            print(f"  - {table.name}: ignorada ({e.__class__.__name__})")
            continue
        if rows:
            dconn.execute(insert(table), [dict(r) for r in rows])
        print(f"  - {table.name}: {len(rows)} linha(s)")

    # ajusta as sequences de id do Postgres
    for table in metadata.sorted_tables:
        if "id" in table.c:
            dconn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table.name}), 1), "
                f"(SELECT COUNT(*) FROM {table.name}) > 0)"
            ))

print("Dados migrados.")

if storage.enabled():
    print("Enviando arquivos para o Supabase Storage...")
    storage.sync_up()
    print("Arquivos enviados.")
else:
    print("SUPABASE_URL/SUPABASE_SERVICE_KEY não definidos: arquivos NÃO foram enviados.")
