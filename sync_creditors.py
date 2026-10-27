import urllib.request
import base64
import json
import time
import os

def fetch_all_creditors():
    base_url = "https://api.sienge.com.br/mouraleite/public/api/v1/creditors"
    username = "mouraleite-contas-a-pagar"
    password = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj"
    
    auth_str = f"{username}:{password}"
    b64_auth = base64.b64encode(auth_str.encode('ascii')).decode('ascii')
    
    limit = 200
    offset = 0
    all_results = []
    
    # Ensure directory exists
    data_dir = os.path.join('static', 'data')
    os.makedirs(data_dir, exist_ok=True)
    out_file = os.path.join(data_dir, 'creditors.json')
    
    print("Iniciando download de credores do Sienge...")
    
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
                    break # Fim dos resultados
                
                offset += limit
                time.sleep(0.5) # Pausa amigavel
        except Exception as e:
            print(f"Erro na requisicao: {e}")
            break
            
    print(f"Download concluido! Total: {len(all_results)} credores.")
    
    # Salvar em arquivo estatico
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False)
        
    print(f"Arquivo salvo em {out_file}")

if __name__ == "__main__":
    fetch_all_creditors()
