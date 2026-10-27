import urllib.request
import base64
import json
import time
import os

def fetch_all_departments():
    base_url = "https://api.sienge.com.br/mouraleite/public/api/v1/departments"
    username = "mouraleite-contas-a-pagar"
    password = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj"
    
    auth_str = f"{username}:{password}"
    b64_auth = base64.b64encode(auth_str.encode('ascii')).decode('ascii')
    
    limit = 100
    offset = 0
    all_results = []
    
    data_dir = os.path.join('static', 'data')
    os.makedirs(data_dir, exist_ok=True)
    out_json = os.path.join(data_dir, 'departments.json')
    out_js = os.path.join(data_dir, 'departments.js')
    
    print("Iniciando download de departamentos do Sienge...")
    
    while True:
        url = f"{base_url}?limit={limit}&offset={offset}"
        req = urllib.request.Request(url)
        req.add_header('Authorization', f'Basic {b64_auth}')
        req.add_header('Accept', 'application/json')
        
        try:
            print(f"Buscando offset {offset}...")
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                results = data.get('results', [])
                all_results.extend(results)
                
                if len(results) < limit:
                    break
                
                offset += limit
                time.sleep(0.5)
        except Exception as e:
            print(f"Erro na requisicao: {e}")
            break
            
    print(f"Download concluido! Total: {len(all_results)} departamentos.")
    
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False)
        
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write('window.siengeDepartments = ' + json.dumps(all_results) + ';')
        
    print(f"Arquivos salvos em {out_json} e {out_js}")

if __name__ == "__main__":
    fetch_all_departments()
