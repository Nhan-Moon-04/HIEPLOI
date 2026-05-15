"""Migration: drop old x_overtime_configs (has month_key), recreate with work_date"""
import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    dbname="hieploi_hr", user="hieploi", password="hieploi2026"
)
cur = conn.cursor()

# Drop old table (có month_key)
cur.execute("DROP TABLE IF EXISTS x_overtime_configs CASCADE;")

# Tạo lại với work_date
cur.execute("""
CREATE TABLE x_overtime_configs (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    ot_end_time TIME,
    ot_hours NUMERIC(4,1) DEFAULT 0,
    meal_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_x_ot_emp_date UNIQUE (employee_id, work_date)
);
""")
cur.execute("CREATE INDEX ix_x_ot_emp_id ON x_overtime_configs(employee_id);")
cur.execute("CREATE INDEX ix_x_ot_work_date ON x_overtime_configs(work_date);")

conn.commit()
cur.close()
conn.close()
print("OK - x_overtime_configs recreated with work_date column")
