import urllib.request
import base64
import json

def fetch_creditors():
    url = "https://api.sienge.com.br/mouraleite/public/api/v1/creditors?limit=200&offset=0"
    username = "mouraleite-contas-a-pagar"
    password = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj"
    
    auth_str = f"{username}:{password}"
    b64_auth = base64.b64encode(auth_str.encode('ascii')).decode('ascii')
    
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Basic {b64_auth}')
    req.add_header('Accept', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            print(f"Success! Fetched {len(data.get('results', []))} results.")
            with open('creditors.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("Saved to creditors.json")
            return data
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_creditors()
