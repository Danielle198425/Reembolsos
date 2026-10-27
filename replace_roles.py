import json

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Nav
    content = content.replace('<div class="admin-nav-item" data-section="roles" id="anav-roles">Funções</div>', '<div class="admin-nav-item" data-section="roles" id="anav-roles">Perfis</div>')
    
    # Table headers
    content = content.replace('<th>Perfil</th>\n              <th>Função</th>', '<th>Nível de Acesso</th>\n              <th>Perfil</th>')
    
    # Form labels
    content = content.replace('<label for="uf-role">Perfil *</label>', '<label for="uf-role">Nível de Acesso *</label>')
    content = content.replace('<label for="uf-job-role">Função</label>', '<label for="uf-job-role">Perfil</label>')
    
    # renderRoles UI
    content = content.replace('<span class="card-title">👨‍💼 Funções</span>', '<span class="card-title">👨‍💼 Perfis</span>')
    content = content.replace('<button class="btn btn-primary btn-sm" id="btn-add-role">➕ Nova Função</button>', '<button class="btn btn-primary btn-sm" id="btn-add-role">➕ Novo Perfil</button>')
    
    # openRoleForm UI
    content = content.replace('<label for="role-name">Nome da Função</label>', '<label for="role-name">Nome do Perfil</label>')
    content = content.replace('Função Ativa</span>', 'Perfil Ativo</span>')
    content = content.replace("Modal.open(id ? 'Editar Função' : 'Nova Função'", "Modal.open(id ? 'Editar Perfil' : 'Novo Perfil'")
    content = content.replace("Preencha o nome da função.", "Preencha o nome do perfil.")
    content = content.replace("toast(id ? 'Função atualizada' : 'Função criada'", "toast(id ? 'Perfil atualizado' : 'Perfil criado'")
    
    # deleteRole UI
    content = content.replace("Modal.confirm('Desativar Função', 'Deseja desativar esta função?'", "Modal.confirm('Desativar Perfil', 'Deseja desativar este perfil?'")
    content = content.replace("toast('Função desativada'", "toast('Perfil desativado'")
    
    # Extra fix just in case the character encoding was weird in previous edit
    content = content.replace("Funo", "Perfil").replace("Funes", "Perfis").replace("Funǜo", "Perfil")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Replacements done in index.html")

replace_all('index.html')
