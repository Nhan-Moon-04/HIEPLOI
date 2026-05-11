import sqlite3
import json

conn = sqlite3.connect('D:/CODE/HIEPLOI/backend/hieploi_hr.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)

if 'shift_templates' in tables:
    cur.execute('SELECT id, code, name FROM shift_templates')
    print('Shifts:', [dict(r) for r in cur.fetchall()])
