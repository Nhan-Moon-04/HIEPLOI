import sys
try:
    import xlrd
    wb = xlrd.open_workbook(r'D:\CODE\HIEPLOI\4 月份文房薪資 2026 (1).xls')
    print("Sheets:", wb.sheet_names())
    for sheet_name in wb.sheet_names():
        ws = wb.sheet_by_name(sheet_name)
        print(f"\n=== SHEET: {sheet_name} ({ws.nrows} rows x {ws.ncols} cols) ===")
        for i in range(min(ws.nrows, 100)):
            row = ws.row_values(i)
            if any(v != '' and v != 0 and v is not None for v in row):
                print(f"Row {i}: {row}")
except Exception as e:
    print(f"xlrd error: {e}")
    try:
        import openpyxl
        wb = openpyxl.load_workbook(r'D:\CODE\HIEPLOI\4 月份文房薪資 2026 (1).xls', read_only=True, data_only=True)
        print("openpyxl sheets:", wb.sheetnames)
    except Exception as e2:
        print(f"openpyxl error: {e2}")
