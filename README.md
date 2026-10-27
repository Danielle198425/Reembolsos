# Sistema de Reembolsos Moura Leite 💼

Sistema web completo de gestão de reembolsos corporativos, desenvolvido com Python + FastAPI + SQLite.

## 🚀 Início Rápido

### 1. Instalar dependências
```bash
pip install -r requirements.txt
```

### 2. Iniciar o servidor
```bash
uvicorn app:app --reload
```

### 3. Acessar o sistema
Abra o navegador em: **http://localhost:8000**

---

## 👤 Contas de Acesso (padrão)

| Usuário | E-mail | Senha | Perfil |
|---|---|---|---|
| Administrador | admin@mouraleite.com.br | Admin@123 | Admin |
| João Silva | joao.silva@mouraleite.com.br | User@123 | Usuário |
| Maria Santos | maria.santos@mouraleite.com.br | User@123 | Aprovador |

---

## 📋 Módulos

### Painel de Controle
- Saudação personalizada com horário
- Resumo financeiro (A Enviar / Aguardando Aprovação / Aguardando Finalização / Pago)
- Gráfico de despesas por categoria
- Tarefas pendentes
- Despesas recentes

### Despesas
- Listagem com filtros avançados (status, categoria, CC, período, busca)
- Criação com validação de regras de negócio:
  - Refeição: limite de R$150/dia
  - Combustível: NF obrigatória
  - Hotel: máximo de 30 dias
- Fluxo completo de aprovação
- Upload de comprovantes (JPG, PNG, PDF)
- Geração de PDF individual por despesa

### Exportações
- Geração de relatórios PDF consolidados
- Filtros por período, status e IDs específicos
- Download direto do PDF

### Admin (somente Admin)
- Gestão de usuários (CRUD + ativar/desativar)
- Gestão de categorias com regras de negócio
- Gestão de centros de custo
- Edição de políticas/regras do sistema

---

## 🔄 Fluxo de Status

```
RASCUNHO → A ENVIAR → AGUARDANDO APROVAÇÃO → APROVADO → AGUARDANDO FINALIZAÇÃO → PAGO
                                           ↓
                                       REJEITADO → (reenviar) → A ENVIAR
```

### Permissões por ação

| Ação | Usuário | Aprovador | Admin |
|---|---|---|---|
| Criar despesa | ✅ | ✅ | ✅ |
| Submeter (Rascunho → A Enviar) | ✅ | ✅ | ✅ |
| Enviar para aprovação | — | ✅ | ✅ |
| Aprovar / Rejeitar | — | ✅ | ✅ |
| Finalizar | — | — | ✅ |
| Marcar como Pago | — | — | ✅ |

---

## 🏗️ Stack Técnica

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Banco de dados | SQLite + SQLAlchemy 2.0 |
| Autenticação | JWT (python-jose) + bcrypt (passlib) |
| PDF | ReportLab 4.x |
| Upload | aiofiles + multipart |
| Frontend | HTML5 + CSS3 + JavaScript (SPA) |
| PWA | manifest.json + Service Worker |
| Tipografia | Inter (Google Fonts) |

---

## 📁 Estrutura do Projeto

```
Projeto Reembolsos/
├── app.py                  # FastAPI app principal
├── database.py             # Configuração SQLite
├── models.py               # Modelos ORM (User, Expense, etc.)
├── schemas.py              # Schemas Pydantic
├── auth.py                 # JWT + bcrypt
├── seed.py                 # Dados iniciais
├── pdf_generator.py        # Geração PDF ReportLab
├── requirements.txt
├── README.md
├── reembolsos.db           # Banco SQLite (criado automaticamente)
├── routers/
│   ├── auth.py             # Endpoints de autenticação
│   ├── dashboard.py        # Endpoints do painel
│   ├── expenses.py         # Endpoints de despesas
│   ├── exports.py          # Endpoints de exportações
│   └── admin.py            # Endpoints administrativos
├── static/
│   ├── index.html          # SPA shell
│   ├── manifest.json       # PWA
│   ├── sw.js               # Service Worker
│   ├── css/style.css       # Design system
│   ├── js/
│   │   ├── api.js          # Fetch wrapper
│   │   ├── app.js          # Router + auth
│   │   ├── dashboard.js
│   │   ├── expenses.js
│   │   ├── exports.js
│   │   └── admin.js
│   └── icons/
│       └── icon.svg
├── uploads/                # Comprovantes enviados
└── exports/                # PDFs gerados
```

---

## 🌐 API

Documentação interativa disponível em: **http://localhost:8000/api/docs**

### Endpoints principais

| Método | Endpoint | Descrição |
|---|---|---|
| POST | /api/auth/login | Autenticação |
| GET | /api/auth/me | Usuário atual |
| GET | /api/dashboard/summary | Resumo do painel |
| GET | /api/expenses | Listar despesas |
| POST | /api/expenses | Criar despesa |
| POST | /api/expenses/{id}/approve | Aprovar |
| POST | /api/expenses/{id}/reject | Rejeitar |
| GET | /api/expenses/{id}/pdf | Baixar PDF |
| POST | /api/exports | Gerar exportação |
| GET | /api/admin/users | Listar usuários |

---

## 📱 PWA (Progressive Web App)

O sistema suporta instalação como aplicativo:
1. Acesse http://localhost:8000 no Chrome/Edge
2. Clique no banner "Instalar o app" ou no ícone de instalação na barra do navegador
3. O app funcionará offline para o formulário de criação de despesas

---

## 🔒 Segurança

- Senhas com hash bcrypt
- Tokens JWT com expiração de 8 horas
- Validação de permissões por rota e por ação
- Upload restrito a JPG, PNG e PDF
- CORS configurado

---

## 📊 Dados Iniciais

O sistema popula automaticamente:
- **1 Administrador** — controle total
- **2 Usuários** — João (usuário) e Maria (aprovadora)
- **3 Centros de Custo** — Marketing, Projetos, Novos Negócios
- **5 Categorias** — Refeição, Combustível, Hotel, Viagem, Outros
- **5 Políticas** — Limites e regras de negócio
- **5 Despesas de exemplo** — em diferentes status

---

*Moura Leite © 2026 — Sistema de Reembolsos v2.0*
