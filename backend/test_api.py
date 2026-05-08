import requests
import sys

# Login
r = requests.post('http://localhost:8000/api/auth/login', data={'username':'admin','password':'admin123'})
print(f"Login: {r.status_code}")
if r.status_code != 200:
    print(r.text)
    sys.exit(1)
token = r.json()['access_token']
h = {'Authorization': f'Bearer {token}'}

# List routes
r = requests.get('http://localhost:8000/openapi.json')
paths = list(r.json()['paths'].keys())
print(f"Routes ({len(paths)}):")
for p in paths:
    print(f"  {p}")

# Test schedules
print("\n--- Test /api/schedules ---")
r = requests.get('http://localhost:8000/api/schedules', params={'month_key':'2026-05'}, headers=h)
print(f"Status: {r.status_code}")
print(r.text[:200] if r.text else "empty")
