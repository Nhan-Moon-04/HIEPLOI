import requests

try:
    r = requests.post('http://localhost:8000/api/auth/login', data={'username':'admin','password':'admin123'})
    token = r.json()['access_token']
    h = {'Authorization': f'Bearer {token}'}
    res = requests.get('http://localhost:8000/api/employees?page_size=500', headers=h)
    print("Status code:", res.status_code)
    if res.status_code == 200:
        print("Success! Endpoint returned 200.")
    else:
        print("Failed! Response:", res.json())
except Exception as e:
    print("Error connecting to server:", e)
