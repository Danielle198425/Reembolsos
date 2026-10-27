import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    Date, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    aprovador = "aprovador"
    financeiro = "financeiro"
    usuario = "usuario"


class ExpenseStatus(str, enum.Enum):
    rascunho = "rascunho"
    a_enviar = "a_enviar"
    aguardando_aprovacao = "aguardando_aprovacao"
    aprovado = "aprovado"
    rejeitado = "rejeitado"
    aguardando_finalizacao = "aguardando_finalizacao"
    finalizado = "finalizado"
    enviado = "enviado"
    pago = "pago"



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.usuario, nullable=False)
    cost_center_id = Column(Integer, ForeignKey("cost_centers.id"), nullable=True)
    job_role_id = Column(Integer, ForeignKey("job_roles.id"), nullable=True)
    job_function_id = Column(Integer, ForeignKey("job_functions.id"), nullable=True)
    active = Column(Boolean, default=True)
    failed_attempts = Column(Integer, default=0)
    is_locked = Column(Boolean, default=False)
    creditor_code = Column(String(50), nullable=True)
    approver_of = Column(Text, nullable=True)
    approver_of_functions = Column(Text, nullable=True)
    approver_rules = Column(Text, nullable=True)
    payment_method = Column(String(10), nullable=True)
    pix_key = Column(String(200), nullable=True)
    bank = Column(String(100), nullable=True)
    agency = Column(String(50), nullable=True)
    account = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cost_center = relationship("CostCenter", foreign_keys=[cost_center_id])
    job_role = relationship("JobRole", foreign_keys=[job_role_id])
    job_function = relationship("JobFunction", foreign_keys=[job_function_id])
    expenses = relationship("Expense", back_populates="user", foreign_keys="Expense.user_id")


class JobRole(Base):
    __tablename__ = "job_roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)


class JobFunction(Base):
    __tablename__ = "job_functions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(250), nullable=False)
    trade_name = Column(String(250), nullable=True)
    cnpj = Column(String(50), nullable=True)
    active = Column(Boolean, default=True)


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    active = Column(Boolean, default=True)

    company = relationship("Company", foreign_keys=[company_id])


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    daily_limit = Column(Float, nullable=True)      # Ex: 150.0 para refeição
    requires_nf = Column(Boolean, default=False)    # Combustível = True
    max_days = Column(Integer, nullable=True)       # Hotel = 30
    icon = Column(String(10), default="📄")
    sienge_apportionment_id = Column(String(100), nullable=True)
    active = Column(Boolean, default=True)


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    cost_center_id = Column(Integer, ForeignKey("cost_centers.id"), nullable=False)
    provider = Column(String(200), nullable=True)
    description = Column(String(500), nullable=False)
    amount = Column(Float, nullable=False)
    expense_date = Column(Date, nullable=False)
    status = Column(SAEnum(ExpenseStatus), default=ExpenseStatus.rascunho, nullable=False)
    receipt_path = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejected_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    finalized_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    finalized_at = Column(DateTime, nullable=True)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    export_id = Column(Integer, ForeignKey("exports.id"), nullable=True)
    email_sent = Column(Boolean, default=False)
    sienge_title = Column(String(100), nullable=True)
    sienge_sent_at = Column(DateTime, nullable=True)
    sienge_sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    edited_after_approval = Column(Boolean, default=False)
    is_corrected = Column(Boolean, default=False)
    edit_history = Column(Text, nullable=True)
    created_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_admin_name = Column(String(200), nullable=True)
    approved_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_admin_name = Column(String(200), nullable=True)
    rejected_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejected_by_admin_name = Column(String(200), nullable=True)
    finalized_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    finalized_by_admin_name = Column(String(200), nullable=True)
    paid_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_by_admin_name = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="expenses", foreign_keys=[user_id])
    category = relationship("Category")
    cost_center = relationship("CostCenter")
    approver = relationship("User", foreign_keys=[approved_by])
    rejecter = relationship("User", foreign_keys=[rejected_by])
    finalizer = relationship("User", foreign_keys=[finalized_by])
    payer = relationship("User", foreign_keys=[paid_by])
    sienge_sender = relationship("User", foreign_keys=[sienge_sent_by])
    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])



class Export(Base):
    __tablename__ = "exports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    expense_user_ids = Column(Text, nullable=True)
    export_type = Column(String(50), default="Padrão")
    file_path = Column(String(500), nullable=True)
    email_sent = Column(Boolean, default=False)
    email_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])
    target_user = relationship("User", foreign_keys=[target_user_id])


class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(500), nullable=False)
    description = Column(String(300), nullable=True)


class MileageRate(Base):
    __tablename__ = "mileage_rates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    rate = Column(Float, nullable=False)
    active = Column(Boolean, default=True)


class RejectionReason(Base):
    __tablename__ = "rejection_reasons"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(200), nullable=False)
    applicable_roles = Column(String(500), nullable=True)  # JSON array of role names
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CustomPolicy(Base):
    __tablename__ = "custom_policies"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(200), nullable=False)
    value = Column(Text, nullable=False)
    description = Column(String(500), nullable=True)
    group = Column(String(100), nullable=True)  # group label (e.g. 'Refeição')
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False)   # e.g. 'CREATE_USER', 'UNLOCK_USER'
    target_email = Column(String(200), nullable=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_name = Column(String(200), nullable=True)
    status = Column(String(50), default='sucesso')  # 'sucesso' or 'falha'
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)


class CompanyLogo(Base):
    __tablename__ = "company_logo"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(Text, nullable=False)  # base64 encoded image
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentSchedule(Base):
    __tablename__ = "payment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    payment_date = Column(Date, nullable=False)
    approval_date = Column(Date, nullable=True)
    closing_date = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])


class CostCenterRule(Base):
    __tablename__ = "cost_center_rules"

    id = Column(Integer, primary_key=True, index=True)
    cost_center_ids = Column(Text, nullable=False)   # JSON array of cost center IDs e.g. "[1, 2]"
    allowed_user_ids = Column(Text, nullable=False)  # JSON array of user IDs e.g. "[3, 4]"
    created_at = Column(DateTime, default=datetime.utcnow)


class ApportionmentRule(Base):
    __tablename__ = "apportionment_rules"

    id = Column(Integer, primary_key=True, index=True)
    apportionment_ids = Column(Text, nullable=False)   # JSON array of apportionment IDs/codes
    allowed_user_ids = Column(Text, nullable=False)  # JSON array of user IDs
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    category_ids = Column(Text, nullable=False)   # JSON array of category IDs
    allowed_user_ids = Column(Text, nullable=False)  # JSON array of user IDs
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryOverrideRule(Base):
    __tablename__ = "category_override_rules"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category_ids = Column(Text, nullable=True)       # JSON array of category IDs or '["*"]'
    cost_center_id = Column(String(50), nullable=True)
    cost_center_ids = Column(Text, nullable=True)    # JSON array of cost center codes/IDs or '["*"]'
    sienge_apportionment_id = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category")


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, nullable=False, index=True)  # 'closing_dates', 'payment_date'
    name = Column(String(150), nullable=False)                          # 'Datas de fechamento', 'Data de Pagamento'
    subject = Column(String(250), nullable=False)
    body = Column(Text, nullable=False)
    description = Column(String(300), nullable=True)
    available_tags = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



