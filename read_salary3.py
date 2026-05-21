# -*- coding: utf-8 -*-
import sys
import io

# Force stdout to UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    import xlrd
    wb = xlrd.open_workbook(r'D:\CODE\HIEPLOI\salary_temp.xls')
    sheet_names = wb.sheet_names()
    print("Sheets:", sheet_names)
    for sheet_name in sheet_names:
        ws = wb.sheet_by_name(sheet_name)
        print(f"\n=== SHEET: {sheet_name} ({ws.nrows} rows x {ws.ncols} cols) ===")
        for i in range(min(ws.nrows, 100)):
            row = ws.row_values(i)
            if any(v != '' and v != 0 and v is not None for v in row):
                print(f"Row {i}: {row}")
except Exception as e:
    print(f"xlrd error: {e}")
    import traceback; traceback.print_exc()
