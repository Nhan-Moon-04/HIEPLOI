"""Seed database with default data: admin user, shift templates, sample employees"""
import asyncio
from datetime import time, date
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models.user import AppUser, UserRole
from app.models.shift import ShiftTemplate
from app.models.employee import Employee
from app.utils.security import get_password_hash


DEFAULT_SHIFTS = [
    {"code": "X", "name": "Ca ngày", "start_time": time(7, 0), "end_time": time(17, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 0, "meal_allowance": 25000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "XVP", "name": "Ca ngày VP", "start_time": time(7, 30), "end_time": time(17, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 0, "meal_allowance": 25000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "D", "name": "Ca đêm", "start_time": time(19, 0), "end_time": time(7, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 4, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": True, "is_leave_code": False, "is_paid_leave": False},
    {"code": "CND", "name": "Ca đêm CN", "start_time": time(19, 0), "end_time": time(7, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 4, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": True, "is_leave_code": False, "is_paid_leave": False},
    {"code": "CN", "name": "Ca Chủ nhật", "start_time": time(7, 0), "end_time": time(17, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 0, "meal_allowance": 25000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "S", "name": "Nghỉ sáng", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 4, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": True},
    {"code": "C", "name": "Nghỉ chiều", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 4, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": True},
    {"code": "P", "name": "Nghỉ phép", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 8, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": True},
    {"code": "N", "name": "Nghỉ không phép", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 0, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": False},
    {"code": "OFF", "name": "Ngày OFF", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 0, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": False},
    {"code": "L", "name": "Ngày lễ", "start_time": None, "end_time": None, "break_minutes": 0, "standard_hours": 8, "default_overtime_hours": 0, "meal_allowance": 0, "meal_count": 0, "is_night_shift": False, "is_leave_code": True, "is_paid_leave": True},
    {"code": "NU", "name": "Ca Nụ (NU)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 3.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NUT1", "name": "Ca nụ +1h OT (NUT1)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 4.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NUT2", "name": "Ca nụ +2h OT (NUT2)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 8, "default_overtime_hours": 5.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NU1", "name": "Ca nụ trừ 1h công (NU1)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 7, "default_overtime_hours": 3.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NU2", "name": "Ca nụ trừ 2h công (NU2)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 6, "default_overtime_hours": 3.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NU3", "name": "Ca nụ trừ 3h công (NU3)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 5, "default_overtime_hours": 3.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
    {"code": "NUN", "name": "Ca nụ trừ 4h công (NUN)", "start_time": time(6, 0), "end_time": time(18, 0), "break_minutes": 60, "standard_hours": 4, "default_overtime_hours": 3.5, "meal_allowance": 35000, "meal_count": 1, "is_night_shift": False, "is_leave_code": False, "is_paid_leave": False},
]


SAMPLE_EMPLOYEES = [
    {"employee_code": "1", "full_name": "TRIỆU HUỆ KIỀU", "full_name_tw": "TRIỆU HUỆ KIỀU", "department": "CHỦ QUẢN", "department_tw": "主管", "position": "Chủ quản", "base_salary": Decimal("33300000"), "join_date": date(2011, 1, 1), "default_shift_code": "XVP"},
    {"employee_code": "2", "full_name": "TRẦN THỊ THÙY NGUYÊN", "full_name_tw": "TRẦN THỊ THÙY NGUYÊN", "department": "KT-HR", "department_tw": "會計長", "position": "Kế toán", "base_salary": Decimal("28000000"), "join_date": date(2026, 3, 17), "default_shift_code": "XVP"},
    {"employee_code": "3", "full_name": "NGUYỄN THIỆN NHÂN", "full_name_tw": "NGUYỄN THIỆN NHÂN", "department": "XNK", "department_tw": "經理助理", "position": "Xuất nhập khẩu", "base_salary": Decimal("13000000"), "join_date": date(2026, 3, 18), "default_shift_code": "XVP"},
    {"employee_code": "4", "full_name": "PHÙNG VĂN GHÉT", "full_name_tw": "PHÙNG VĂN GHÉT", "department": "XNK", "department_tw": "經理助理", "base_salary": Decimal("16600000"), "join_date": date(2019, 3, 14), "leave_date": date(2026, 4, 30), "default_shift_code": "XVP"},
    {"employee_code": "5", "full_name": "HONG CHOI VAN", "full_name_tw": "HONG CHOI VAN", "department": "KTNB", "department_tw": "內帳會計", "base_salary": Decimal("15100000"), "join_date": date(2011, 3, 2), "leave_date": date(2026, 4, 15), "default_shift_code": "XVP"},
    {"employee_code": "6", "full_name": "CHAU VĂN LUÂN", "full_name_tw": "CHAU VĂN LUÂN", "department": "SALES", "department_tw": "業務員", "base_salary": Decimal("13100000"), "join_date": date(2019, 2, 12), "default_shift_code": "XVP"},
    {"employee_code": "7", "full_name": "CAO LƯU THIÊN BẢO", "full_name_tw": "CAO LƯU THIÊN BẢO", "department": "TAIXE-SX", "department_tw": "貨車司機", "base_salary": Decimal("9400000"), "join_date": date(2023, 1, 31), "default_shift_code": "X"},
    {"employee_code": "8", "full_name": "ĐẶNG KHÔI NGÔI", "full_name_tw": "ĐẶNG KHÔI NGÔI", "department": "TAIXE-SX", "department_tw": "貨車司機", "base_salary": Decimal("8000000"), "join_date": date(2025, 11, 24), "default_shift_code": "X"},
    {"employee_code": "9", "full_name": "ĐẶNG VĂN TÍNH", "full_name_tw": "ĐẶNG VĂN TÍNH", "department": "TAIXE-VP", "department_tw": "文房司機", "base_salary": Decimal("8300000"), "join_date": date(2025, 1, 4), "default_shift_code": "XVP"},
    {"employee_code": "10", "full_name": "BÙI THỊ HOA", "full_name_tw": "裴氏花 BÙI THỊ HOA", "department": "KHO", "department_tw": "倉管", "base_salary": Decimal("10140000"), "join_date": date(2013, 4, 18), "default_shift_code": "X"},
    {"employee_code": "11", "full_name": "NGUYỄN THỊ NHẠN", "full_name_tw": "阮氏言 NGUYỄN THỊ NHẠN", "department": "HẤP -KIỂM PHẨM", "department_tw": "品檢", "base_salary": Decimal("7000000"), "join_date": date(2023, 2, 8), "default_shift_code": "X"},
    {"employee_code": "12", "full_name": "ĐẶNG QUỐC TOÀN", "full_name_tw": "鄧國全 ĐẶNG QUỐC TOÀN", "department": "HẤP -KIỂM PHẨM", "department_tw": "鍋爐", "base_salary": Decimal("7600000"), "join_date": date(2022, 4, 21), "default_shift_code": "X"},
    {"employee_code": "13", "full_name": "LÂM VĂN ĐƯỢC", "full_name_tw": "LÂM VĂN ĐƯỢC", "department": "HẤP -KIỂM PHẨM", "department_tw": "鍋爐", "base_salary": Decimal("6800000"), "join_date": date(2025, 11, 19), "default_shift_code": "X"},
    {"employee_code": "14", "full_name": "LÊ T. HỒNG HẠNH", "full_name_tw": "黎氏紅妲 LÊ T. HỒNG HẠNH", "department": "SẢN XUẤT", "department_tw": "倒筒", "base_salary": Decimal("7500000"), "join_date": date(2011, 5, 4), "default_shift_code": "X"},
    {"employee_code": "15", "full_name": "NGUYỄN VĂN XUÂN", "full_name_tw": "阮文春 NGUYỄN VĂN XUÂN", "department": "SẢN XUẤT", "department_tw": "維修機械", "base_salary": Decimal("11900000"), "join_date": date(2011, 1, 1), "default_shift_code": "X"},
    {"employee_code": "16", "full_name": "NGUYỄN VĂN SÁCH", "full_name_tw": "阮文策 NGUYỄN VĂN SÁCH", "department": "BẢO TRÌ", "department_tw": "維修機械", "base_salary": Decimal("10700000"), "join_date": date(2012, 4, 16), "default_shift_code": "X"},
    {"employee_code": "17", "full_name": "HỒ NGỌC ĐIỆP", "full_name_tw": "胡玉蝶 HỒ NGỌC ĐIỆP", "department": "TAIXE-SX", "department_tw": "跟車員", "base_salary": Decimal("6700000"), "join_date": date(2025, 2, 18), "default_shift_code": "X"},
    {"employee_code": "18", "full_name": "THẠCH HOÀI TÂN", "full_name_tw": "THẠCH HOÀI TÂN", "department": "PHỤ XE SX", "base_salary": Decimal("6000000"), "default_shift_code": "X"},
    {"employee_code": "19", "full_name": "PHẠM VĂN THÔNG", "full_name_tw": "范文桐 PHẠM VĂN THÔNG", "department": "KÉO TRỤC", "department_tw": "整經組長", "position": "Tổ trưởng", "base_salary": Decimal("11000000"), "join_date": date(2011, 8, 2), "default_shift_code": "X"},
    {"employee_code": "20", "full_name": "LÊ HOÀNG KÈO", "full_name_tw": "黎皇橋 LÊ HOÀNG KÈO", "department": "KÉO TRỤC", "department_tw": "整經", "base_salary": Decimal("8250000"), "join_date": date(2022, 2, 8), "default_shift_code": "X"},
    {"employee_code": "21", "full_name": "LÊ ĐÌNH THANH", "full_name_tw": "黎廷青LÊ ĐÌNH THANH", "department": "KÉO TRỤC", "department_tw": "整經", "base_salary": Decimal("9500000"), "join_date": date(2024, 3, 2), "default_shift_code": "X"},
    {"employee_code": "22", "full_name": "PHAN DUY TÂN", "full_name_tw": "潘維新 PHAN DUY TÂN", "department": "KÉO TRỤC", "department_tw": "整經", "base_salary": Decimal("7350000"), "join_date": date(2021, 3, 19), "default_shift_code": "X"},
    {"employee_code": "23", "full_name": "PHAN MINH HÙNG", "full_name_tw": "潘明雄 PHAN MINH HÙNG", "department": "KÉO TRỤC", "department_tw": "整經", "base_salary": Decimal("6800000"), "join_date": date(2022, 10, 28), "default_shift_code": "X"},
    {"employee_code": "24", "full_name": "HOÀNG THỊ TÂN", "full_name_tw": "皇氏新 HOÀNG THỊ TÂN", "department": "KÉO TRỤC", "department_tw": "整經", "base_salary": Decimal("6400000"), "join_date": date(2025, 2, 6), "default_shift_code": "X"},
    {"employee_code": "25", "full_name": "PHẠM THỊ LÊ HOA", "full_name_tw": "PHẠM THỊ LÊ HOA", "department": "KÉO TRỤC", "base_salary": Decimal("6100000"), "join_date": date(2025, 8, 8), "default_shift_code": "X"},
    {"employee_code": "26", "full_name": "PHAN THỊ MỸ TIÊN", "full_name_tw": "潘氏美仙 PHAN THỊ MỸ TIÊN", "department": "SE SỢI", "department_tw": "倍捻組長", "position": "Tổ trưởng", "base_salary": Decimal("9140000"), "join_date": date(2019, 2, 12), "default_shift_code": "X"},
    {"employee_code": "27", "full_name": "NGUYỄN THỊ NGHĨA", "full_name_tw": "院氏儀 NGUYỄN THỊ NGHĨA", "department": "SE SỢI", "department_tw": "倍捻班長", "position": "Ban trưởng", "base_salary": Decimal("9140000"), "join_date": date(2011, 1, 1), "default_shift_code": "X"},
    {"employee_code": "28", "full_name": "LÊ THỊ ĐÙA", "full_name_tw": "黎氏杜 LÊ THỊ ĐÙA", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("7200000"), "join_date": date(2017, 8, 22), "default_shift_code": "X"},
    {"employee_code": "29", "full_name": "DƯƠNG THANH LONG", "full_name_tw": "楊青龍 DƯƠNG THANH LONG", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("7300000"), "join_date": date(2018, 2, 27), "default_shift_code": "X"},
    {"employee_code": "30", "full_name": "LÊ T THU HẰNG", "full_name_tw": "黎氏秋姮 LÊ T THU HẰNG", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("7440000"), "join_date": date(2016, 3, 17), "default_shift_code": "X"},
    {"employee_code": "31", "full_name": "LƯU T TUYẾT DIỄM", "full_name_tw": "劉氏翠顏 LƯU T TUYẾT DIỄM", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("7200000"), "join_date": date(2017, 7, 26), "default_shift_code": "X"},
    {"employee_code": "32", "full_name": "NGO THỤY KIỀU THANH UYÊN", "full_name_tw": "吳垂嬌清淵 NGO THỤY KIỀU THANH UYÊN", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("6900000"), "join_date": date(2020, 8, 1), "default_shift_code": "X"},
    {"employee_code": "33", "full_name": "PHẠM THỊ LÙN", "full_name_tw": "範氏棱 PHẠM THỊ LÙN", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("6600000"), "join_date": date(2022, 3, 30), "default_shift_code": "X"},
    {"employee_code": "34", "full_name": "TRẦN THỊ NGA", "full_name_tw": "陳氏娥 TRẦN THỊ NGA", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("7100000"), "join_date": date(2018, 5, 15), "default_shift_code": "X"},
    {"employee_code": "35", "full_name": "NGUYỄN MINH ĐƯƠNG", "full_name_tw": "阮明當 NGUYỄN MINH ĐƯƠNG", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("6300000"), "join_date": date(2024, 2, 15), "default_shift_code": "X"},
    {"employee_code": "36", "full_name": "NGUYỄN THỊ XIẾU", "full_name_tw": "阮氏小 NGUYỄN THỊ XIẾU", "department": "SE SỢI", "department_tw": "倍捻", "base_salary": Decimal("6900000"), "join_date": date(2019, 12, 4), "default_shift_code": "X"},
    {"employee_code": "37", "full_name": "NGUYỄN THỊ HẰNG", "full_name_tw": "阮氏姮 NGUYỄN THỊ HẰNG", "department": "SẢN XUẤT", "department_tw": "雜工", "base_salary": Decimal("6900000"), "join_date": date(2023, 7, 11), "default_shift_code": "X"},
]


async def seed_database():
    """Seed default data into database"""
    async with AsyncSessionLocal() as db:
        # Seed admin user
        result = await db.execute(select(AppUser).where(AppUser.username == "admin"))
        if not result.scalar_one_or_none():
            admin = AppUser(
                username="admin",
                password_hash=get_password_hash("admin123"),
                full_name="Administrator",
                role=UserRole.ADMIN,
            )
            db.add(admin)
            # Also create accountant user
            accountant = AppUser(
                username="ketoan",
                password_hash=get_password_hash("ketoan123"),
                full_name="Kế toán",
                role=UserRole.ACCOUNTANT,
            )
            db.add(accountant)
            print("[OK] Seeded admin + ke toan users")

        # Seed shift templates
        for shift_data in DEFAULT_SHIFTS:
            result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == shift_data["code"]))
            if not result.scalar_one_or_none():
                shift = ShiftTemplate(**shift_data)
                db.add(shift)
        print("[OK] Seeded shift templates")

        # Seed employees
        for emp_data in SAMPLE_EMPLOYEES:
            result = await db.execute(select(Employee).where(Employee.employee_code == emp_data["employee_code"]))
            if not result.scalar_one_or_none():
                emp = Employee(**emp_data)
                db.add(emp)
        print("[OK] Seeded 37 employees")

        await db.commit()
        print("[DONE] Database seeding complete!")

