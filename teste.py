import requests
import urllib.parse
import json

# Link do navegador fornecido pelo usuário (contém o JWT com acesso à campanha 6988)
auth_url = "https://graphql.00px.com.br/auth/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJBbsO0bmltbyIsInVzZXJfcm9sZSI6IlNJVEUiLCJhY2NvdW50X2lkIjo4NywiY2FtcGFpZ25faWQiOjY5ODgsInNpdGVfaWQiOjM1MDAsInRlYW1faWQiOjI1LCJ1c2VyX2FuYWx5dGljc19hY2Nlc3MiOnRydWUsInVzZXJfYWRtaW5fYWNjZXNzIjpmYWxzZSwidXNlcl9tZWRpYWtpdF9hY2Nlc3MiOmZhbHNlLCJyZWRpcmVjdCI6Imh0dHBzOi8vYW5hbHl0aWNzLmFkeC5zcGFjZS9kYXNoYm9hcmQvY2FtcGFpZ24vNjk4OC9zaXRlLzM1MDAiLCJpYXQiOjE3NzMzNTAwMTksImV4cCI6MTc3NTg1NTYxOX0.n7nrgKEVT50et75P4ZhjajxKiQWUYsSfQUr2YUDrddU"

print("Autenticando e extraindo token de sessão...")

# 1. Realiza o handshake para pegar o token de sessão final via redirecionamento
s = requests.Session()
r_auth = s.get(auth_url, allow_redirects=True)

# 2. Extrai o token 's' da URL final redirecionada
query = urllib.parse.urlparse(r_auth.url).query
params = urllib.parse.parse_qs(query)
session_token = params.get('s', [None])[0]

if not session_token:
    print("Erro: Não foi possível obter o token de sessão via redirecionamento.")
    exit()

# 3. Endpoint final de GraphQL
url = f"https://graphql.00px.com.br/login/?s={session_token}"

# 4. Define a query com o filtro específico para a campanha 6988
# O filtro precisa ser uma string JSON para evitar ambiguidade no SQL da API
filter_json = json.dumps({"campaigns.campaign_id": 6988})

payload = {
    "query": f"""
    query {{
      campaign(filter: {json.dumps(filter_json)}) {{
        sites {{
          site_name
          purchases {{
            cpm {{
              quantity
              total_data {{
                impressions
                valids
                viewability
              }}
            }}
          }}
        }}
      }}
    }}
    """
}

# 5. Executa a query
r = s.post(url, json=payload)
data = r.json()

# valida erro da API
if "errors" in data:
    print("Erro na API:", data["errors"])
    exit()

# 6. Processa e exibe os resultados
campaign_data = data.get("data", {}).get("campaign")
if not campaign_data:
    print("Nenhuma campanha encontrada com esse filtro.")
    exit()

for site in campaign_data["sites"]:
    name = site.get("site_name", "Desconhecido")
    cpm = site.get("purchases", {}).get("cpm", {})
    total = cpm.get("total_data") or {}

    contratado = cpm.get("quantity", 0)
    entregue = total.get("valids", 0) or 0
    viewability = total.get("viewability", 0) or 0
    impressions = total.get("impressions", 0) or 0

    ritmo = (entregue / contratado) if contratado else 0
    faltam = max(0, contratado - entregue)

    print(f"\n📍 {name}")
    print(f"Contratado: {contratado:,}".replace(",", "."))
    print(f"Entregue (Valids): {entregue:,}".replace(",", "."))
    print(f"Impressões Totais: {impressions:,}".replace(",", "."))
    print(f"Ritmo de Entrega: {ritmo:.2%}")
    print(f"Faltam: {faltam:,}".replace(",", "."))
    print(f"Viewability: {viewability:.2%}")