from typing import Optional, List, Any
from datetime import datetime, date
from pydantic import BaseModel, EmailStr
from models import UserRole, ExpenseStatus


# ─── Auth ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


# ─── CostCenter ──────────────────────────────────────────────────────────────
# ─── Company ─────────────────────────────────────────────────────────────────
class CompanyBase(BaseModel):
    code: str
    name: str
    trade_name: Optional[str] = None
    cnpj: Optional[str] = None
    active: bool = True


class CompanyCreate(CompanyBase):
    pass


class CompanyOut(CompanyBase):
    id: int

    class Config:
        from_attributes = True


# ─── CostCenter ──────────────────────────────────────────────────────────────
class CostCenterBase(BaseModel):
    code: str
    name: str
    company_id: Optional[int] = None
    active: bool = True


class CostCenterCreate(CostCenterBase):
    pass


class CostCenterOut(CostCenterBase):
    id: int
    company: Optional[CompanyOut] = None

    class Config:
        from_attributes = True


# ─── Category ────────────────────────────────────────────────────────────────
class CategoryBase(BaseModel):
    name: str
    daily_limit: Optional[float] = None
    requires_nf: bool = False
    max_days: Optional[int] = None
    icon: str = "📄"
    sienge_apportionment_id: Optional[str] = None
    active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    id: int

    class Config:
        from_attributes = True


# ─── User ────────────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    name: str
    email: str
    role: UserRole = UserRole.usuario
    cost_center_id: Optional[int] = None
    job_role_id: Optional[int] = None
    job_function_id: Optional[int] = None
    creditor_code: Optional[str] = None
    approver_of: Optional[List[int]] = None
    approver_of_functions: Optional[List[int]] = None
    approver_rules: Optional[List[dict]] = None
    groups: Optional[List[int]] = None
    active: bool = True
    payment_method: Optional[str] = None
    pix_key: Optional[str] = None
    bank: Optional[str] = None
    agency: Optional[str] = None
    account: Optional[str] = None


class UserCreate(UserBase):
    password: Optional[str] = "123456"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None
    cost_center_id: Optional[int] = None
    job_role_id: Optional[int] = None
    job_function_id: Optional[int] = None
    creditor_code: Optional[str] = None
    approver_of: Optional[List[int]] = None
    approver_of_functions: Optional[List[int]] = None
    approver_rules: Optional[List[dict]] = None
    groups: Optional[List[int]] = None
    active: Optional[bool] = None
    password: Optional[str] = None
    payment_method: Optional[str] = None
    pix_key: Optional[str] = None
    bank: Optional[str] = None
    agency: Optional[str] = None
    account: Optional[str] = None


class JobRoleBase(BaseModel):
    name: str
    active: bool = True


class JobRoleCreate(JobRoleBase):
    pass


class JobRoleOut(JobRoleBase):
    id: int

    class Config:
        from_attributes = True


class JobFunctionBase(BaseModel):
    name: str
    active: bool = True


class JobFunctionCreate(JobFunctionBase):
    pass


class JobFunctionOut(JobFunctionBase):
    id: int

    class Config:
        from_attributes = True


class UserOut(UserBase):
    id: int
    created_at: datetime
    cost_center: Optional[CostCenterOut] = None
    job_role: Optional[JobRoleOut] = None
    job_function: Optional[JobFunctionOut] = None

    class Config:
        from_attributes = True


# ─── Expense ─────────────────────────────────────────────────────────────────
class ExpenseBase(BaseModel):
    category_id: int
    cost_center_id: int
    provider: Optional[str] = None
    description: str
    amount: float
    expense_date: date
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    cost_center_id: Optional[int] = None
    provider: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    expense_date: Optional[date] = None
    notes: Optional[str] = None


class ExpenseOut(ExpenseBase):
    id: int
    user_id: int
    status: ExpenseStatus
    receipt_path: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejected_by: Optional[int] = None
    edited_after_approval: Optional[bool] = False
    is_corrected: Optional[bool] = False
    edit_history: Optional[Any] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserOut] = None
    category: Optional[CategoryOut] = None
    cost_center: Optional[CostCenterOut] = None
    approver: Optional[UserOut] = None
    rejecter: Optional[UserOut] = None

    class Config:
        from_attributes = True


class RejectRequest(BaseModel):
    reason: str


# ─── Export ──────────────────────────────────────────────────────────────────
class ExportCreate(BaseModel):
    name: str
    expense_ids: Optional[List[int]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    status_filter: Optional[str] = None
    sort_by: Optional[str] = "category"
    export_mode: Optional[str] = "individual"


class ExportOut(BaseModel):
    id: int
    name: str
    created_by: int
    export_type: str
    file_path: Optional[str] = None
    email_sent: Optional[bool] = False
    email_sent_at: Optional[datetime] = None
    created_at: datetime
    creator: Optional[UserOut] = None

    class Config:
        from_attributes = True


class BulkExportEmailRequest(BaseModel):
    export_ids: List[int]


# ─── Policy ──────────────────────────────────────────────────────────────────
class PolicyUpdate(BaseModel):
    value: str
    description: Optional[str] = None


class PolicyOut(BaseModel):
    id: int
    key: str
    value: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Dashboard ───────────────────────────────────────────────────────────────
class DashboardSummary(BaseModel):
    total_a_enviar: float
    total_aguardando_aprovacao: float
    total_aguardando_finalizacao: float
    total_pago: float
    pending_tasks: int
    expenses_by_category: List[dict]
    recent_expenses: List[ExpenseOut]


# ─── MileageRate ─────────────────────────────────────────────────────────────
class MileageRateCreate(BaseModel):
    name: str
    rate: float
    active: bool = True


class MileageRateUpdate(BaseModel):
    name: Optional[str] = None
    rate: Optional[float] = None
    active: Optional[bool] = None


# ─── RejectionReason ─────────────────────────────────────────────────────────
class RejectionReasonCreate(BaseModel):
    label: str
    applicable_roles: Optional[str] = None  # JSON string
    active: bool = True


class RejectionReasonUpdate(BaseModel):
    label: Optional[str] = None
    applicable_roles: Optional[str] = None
    active: Optional[bool] = None


# ─── CustomPolicy ─────────────────────────────────────────────────────────────
class CustomPolicyCreate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    group: Optional[str] = None
    active: bool = True


class CustomPolicyUpdate(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None
    description: Optional[str] = None
    group: Optional[str] = None
    active: Optional[bool] = None


# ─── Logo ────────────────────────────────────────────────────────────────────
class LogoUpdate(BaseModel):
    data: str  # base64 encoded image


# ─── Email ───────────────────────────────────────────────────────────────────
class SendPasswordEmailRequest(BaseModel):
    email: str
