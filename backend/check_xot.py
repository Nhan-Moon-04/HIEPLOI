import sqlite3
conn = sqlite3.connect('hieploi_hr.db')
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print('Tables:', [t[0] for t in tables])
info = conn.execute("PRAGMA table_info(x_overtime_configs)").fetchall()
print('x_overtime_configs columns:', [col[1] for col in info])
conn.close()
