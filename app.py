import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
import models
from routers import auth, dashboard, expenses, exports, admin, sienge
from seed import run_seed

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cria tabelas e popula dados iniciais
    Base.metadata.create_all(bind=engine)
    run_seed()
    os.makedirs("uploads", exist_ok=True)
    # Auto-migration for categories table
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            cols = [r[1] for r in conn.execute(text("PRAGMA table_info(categories)")).fetchall()]
            if "sienge_apportionment_id" not in cols:
                conn.execute(text("ALTER TABLE categories ADD COLUMN sienge_apportionment_id VARCHAR(100)"))
                conn.commit()

            exp_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(expenses)")).fetchall()]
            if "edited_after_approval" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN edited_after_approval BOOLEAN DEFAULT 0"))
                conn.commit()
            if "is_corrected" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN is_corrected BOOLEAN DEFAULT 0"))
                conn.commit()
            if "rejected_by" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN rejected_by INTEGER REFERENCES users(id)"))
                conn.commit()
            if "rejected_at" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN rejected_at DATETIME"))
                conn.commit()
            if "edit_history" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN edit_history TEXT"))
                conn.commit()
            if "finalized_by" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN finalized_by INTEGER REFERENCES users(id)"))
                conn.commit()
            if "finalized_at" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN finalized_at DATETIME"))
                conn.commit()
            if "paid_by" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN paid_by INTEGER REFERENCES users(id)"))
                conn.commit()
            if "paid_at" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN paid_at DATETIME"))
                conn.commit()
            if "export_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN export_id INTEGER REFERENCES exports(id)"))
                conn.commit()
            if "email_sent" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN email_sent BOOLEAN DEFAULT 0"))
                conn.commit()
            if "sienge_title" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN sienge_title VARCHAR(100)"))
                conn.commit()
            if "sienge_sent_at" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN sienge_sent_at DATETIME"))
                conn.commit()
            if "sienge_sent_by" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN sienge_sent_by INTEGER REFERENCES users(id)"))
                conn.commit()
            if "created_by_admin_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN created_by_admin_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "created_by_admin_name" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN created_by_admin_name VARCHAR(200)"))
                conn.commit()
            if "approved_by_admin_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN approved_by_admin_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "approved_by_admin_name" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN approved_by_admin_name VARCHAR(200)"))
                conn.commit()
            if "rejected_by_admin_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN rejected_by_admin_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "rejected_by_admin_name" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN rejected_by_admin_name VARCHAR(200)"))
                conn.commit()
            if "finalized_by_admin_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN finalized_by_admin_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "finalized_by_admin_name" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN finalized_by_admin_name VARCHAR(200)"))
                conn.commit()
            if "paid_by_admin_id" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN paid_by_admin_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "paid_by_admin_name" not in exp_cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN paid_by_admin_name VARCHAR(200)"))
                conn.commit()

            export_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(exports)")).fetchall()]
            if "target_user_id" not in export_cols:
                conn.execute(text("ALTER TABLE exports ADD COLUMN target_user_id INTEGER REFERENCES users(id)"))
                conn.commit()
            if "expense_user_ids" not in export_cols:
                conn.execute(text("ALTER TABLE exports ADD COLUMN expense_user_ids TEXT"))
                conn.commit()
            if "email_sent" not in export_cols:
                conn.execute(text("ALTER TABLE exports ADD COLUMN email_sent BOOLEAN DEFAULT 0"))
                conn.commit()
            if "email_sent_at" not in export_cols:
                conn.execute(text("ALTER TABLE exports ADD COLUMN email_sent_at DATETIME"))
                conn.commit()

            user_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if "approver_rules" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN approver_rules TEXT"))
                conn.commit()

            cc_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(cost_centers)")).fetchall()]
            if "company_id" not in cc_cols:
                conn.execute(text("ALTER TABLE cost_centers ADD COLUMN company_id INTEGER REFERENCES companies(id)"))
                conn.commit()

            ps_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(payment_schedules)")).fetchall()]
            if "approval_date" not in ps_cols:
                conn.execute(text("ALTER TABLE payment_schedules ADD COLUMN approval_date DATE"))
                conn.commit()
            if "closing_date" not in ps_cols:
                conn.execute(text("ALTER TABLE payment_schedules ADD COLUMN closing_date DATE"))
                conn.commit()

            cor_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(category_override_rules)")).fetchall()]
            if "category_ids" not in cor_cols:
                conn.execute(text("ALTER TABLE category_override_rules ADD COLUMN category_ids TEXT"))
                conn.commit()
            if "cost_center_ids" not in cor_cols:
                conn.execute(text("ALTER TABLE category_override_rules ADD COLUMN cost_center_ids TEXT"))
                conn.commit()
    except Exception:
        pass

    try:
        db = SessionLocal()
        sienge.sync_companies(db)
        sienge.sync_cost_centers(db)
        db.close()
    except Exception:
        pass
    yield

app = FastAPI(
    title="Sistema de Reembolsos Moura Leite",
    description="Gestão completa de reembolsos corporativos",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(expenses.router)
app.include_router(exports.router)
app.include_router(admin.router)
app.include_router(sienge.router)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/", include_in_schema=False)
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(request: Request, full_path: str = ""):
    """Serve o SPA para qualquer rota não-API."""
    norm_path = full_path.replace("\\", "/")
    if norm_path.startswith("api/") or norm_path.startswith("static/") or norm_path.startswith("uploads/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index_path = "static/index.html"
    if os.path.exists(index_path):
        return FileResponse(index_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"})
    return JSONResponse({"detail": "Frontend não encontrado"}, status_code=404)
