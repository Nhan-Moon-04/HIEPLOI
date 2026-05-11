from datetime import time, datetime, date, timedelta
from typing import Optional
from collections import defaultdict, Counter

# Constants from nu_shift.txt
NU_SHIFT_CODE = "NU"
NU_MORNING_MODE = "morning"
NU_NIGHT_MODE = "night"

NU_MORNING_START_TIME = time(6, 0)
NU_NIGHT_START_TIME = time(18, 0)

NU_DYNAMIC_SHIFT_CODES = {"NU", "NUT1", "NUT2", "NU1", "NU2", "NU3", "NUN"}

NU_STANDARD_HOURS = 8.0
NU_MAX_OT_HOURS = 4.0  # Total 12h = 8h standard + 4h OT
NU_MORNING_DEFAULT_OT_HOURS = 3.5
NU_NIGHT_DEFAULT_OT_HOURS = 4.0

NU_MORNING_MEAL_ALLOWANCE = 35000.0
NU_MORNING_MEAL_ALLOWANCE_OT_BONUS = 35000.0
NU_NIGHT_MEAL_ALLOWANCE = 35000.0
NU_NIGHT_PCCD = 100000.0  # Phụ cấp ca đêm

NU_OT_HALF_HOUR_FROM_MINUTES = 20.0
NU_OT_FULL_HOUR_FROM_MINUTES = 40.0

NU_EXTRA_OT_BY_CODE = {
    "NUT1": 1.0,
    "NUT2": 2.0,
}

NU_STANDARD_HOURS_DEDUCTION_BY_CODE = {
    "NU1": 1.0,
    "NU2": 2.0,
    "NU3": 3.0,
    "NUN": 4.0,
}

def is_nu_dynamic_shift_code(code: str) -> bool:
    if not code:
        return False
    return code.upper() in NU_DYNAMIC_SHIFT_CODES

def normalize_nu_overtime_hours(raw_overtime_hours: float) -> float:
    """Rounding rules: 20m -> 0.5h, 40m -> 1h, capped at 4h."""
    if raw_overtime_hours <= 0:
        return 0.0

    total_minutes = raw_overtime_hours * 60.0
    whole_hours = int(total_minutes // 60.0)
    remainder_minutes = round(total_minutes - (whole_hours * 60.0), 4)

    if remainder_minutes < NU_OT_HALF_HOUR_FROM_MINUTES:
        normalized = float(whole_hours)
    elif remainder_minutes < NU_OT_FULL_HOUR_FROM_MINUTES:
        normalized = whole_hours + 0.5
    else:
        normalized = whole_hours + 1.0
    
    return min(normalized, NU_MAX_OT_HOURS)

def _is_midday_check(t: time):
    return 10 <= t.hour <= 13

def _is_evening_check(t: time):
    return t.hour >= 17

def _is_morning_check(t: time):
    return t.hour <= 8

def _detect_daily_mode(today_events: list[datetime], next_day_events: list[datetime]):
    """Detect mode based on punch patterns."""
    has_midday = any(_is_midday_check(item.time()) for item in today_events)
    if has_midday:
        return NU_MORNING_MODE, has_midday

    has_evening = any(_is_evening_check(item.time()) for item in today_events)
    has_next_day_morning = any(_is_morning_check(item.time()) for item in next_day_events)
    if has_evening and has_next_day_morning:
        return NU_NIGHT_MODE, has_midday

    has_morning = any(_is_morning_check(item.time()) for item in today_events)
    if has_morning and has_evening:
        return NU_MORNING_MODE, has_midday

    return None, has_midday

def _fallback_mode(today_events: list[datetime]):
    if not today_events:
        return NU_MORNING_MODE
    
    first_event = today_events[0]
    if first_event.hour <= 10:
        return NU_MORNING_MODE
    if first_event.hour >= 15:
        return NU_NIGHT_MODE
    
    if any(_is_evening_check(item.time()) for item in today_events):
        return NU_NIGHT_MODE
    
    return NU_MORNING_MODE

def detect_nu_modes(attendance_logs: list, start_date: date, end_date: date):
    """
    Groups logs by employee and date, then detects the shift mode (morning vs night).
    Returns a dict: (employee_id, date) -> is_night (bool)
    """
    
    # 1. Group logs
    events_by_emp_date = defaultdict(list)
    for log in attendance_logs:
        events_by_emp_date[(log.employee_id, log.event_time.date())].append(log.event_time)
        
    for ev_list in events_by_emp_date.values():
        ev_list.sort()
        
    # 2. Per-day detection and week-mode grouping
    emp_ids = {k[0] for k in events_by_emp_date.keys()}
    results = {} # (emp_id, date) -> is_night
    
    for emp_id in emp_ids:
        # We need a range of dates to handle week continuity
        current = start_date
        day_info = {}
        week_to_modes = defaultdict(list)
        week_to_days = defaultdict(list)
        
        while current <= end_date:
            today_events = events_by_emp_date.get((emp_id, current), [])
            next_day_events = events_by_emp_date.get((emp_id, current + timedelta(days=1)), [])
            
            det_mode, _ = _detect_daily_mode(today_events, next_day_events)
            fallback = _fallback_mode(today_events)
            
            day_info[current] = {
                "det_mode": det_mode,
                "fallback": fallback,
                "today_events": today_events
            }
            
            week_key = current.isocalendar()[1]
            week_to_days[week_key].append(current)
            if det_mode:
                week_to_modes[week_key].append(det_mode)
            
            current += timedelta(days=1)
            
        # 3. Resolve week mode
        week_mode_map = {}
        sorted_weeks = sorted(week_to_days.keys())
        prev_week_mode = None
        
        for w in sorted_weeks:
            det_modes = week_to_modes.get(w, [])
            if det_modes:
                week_mode_map[w] = det_modes[0]
            elif prev_week_mode:
                week_mode_map[w] = prev_week_mode
            else:
                fbs = [day_info[d]["fallback"] for d in week_to_days[w]]
                week_mode_map[w] = Counter(fbs).most_common(1)[0][0]
            prev_week_mode = week_mode_map[w]
            
        # 4. Final assignment
        for d, info in day_info.items():
            week_key = d.isocalendar()[1]
            mode = info["det_mode"] or week_mode_map.get(week_key) or info["fallback"]
            results[(emp_id, d)] = (mode == NU_NIGHT_MODE)
            
    return results

def calculate_nu_shift_details(shift_code: str, actual_hours: float, is_night: bool = False, night_allowance_rate: float = 0.0):
    """
    Calculate standard hours, OT hours, and meal allowance for NU shifts.
    Based on actual worked hours.
    """
    code = shift_code.upper()
    
    # 1. Standard Hours
    base_standard = NU_STANDARD_HOURS
    deduction = NU_STANDARD_HOURS_DEDUCTION_BY_CODE.get(code, 0.0)
    standard_hours = max(base_standard - deduction, 0.0)
    
    # 2. Overtime Hours
    # Rules: worked hours up to 12h. 8h standard, rest is OT (max 4h).
    # If they work more than 8h, the excess is OT.
    raw_ot = max(actual_hours - NU_STANDARD_HOURS, 0.0)
    normalized_ot = normalize_nu_overtime_hours(raw_ot)
    
    # Extra OT from code (NUT1, NUT2)
    extra_ot = NU_EXTRA_OT_BY_CODE.get(code, 0.0)
    total_ot = normalized_ot + extra_ot
    
    # 3. Meal Allowance & PCCD
    if is_night:
        meal_allowance = NU_NIGHT_MEAL_ALLOWANCE # 35k
        night_allowance = night_allowance_rate # Dynamic PCCD
    else:
        meal_allowance = NU_MORNING_MEAL_ALLOWANCE # 35k
        night_allowance = 0.0
        # If OT >= 3h, double meal allowance
        if total_ot >= 3.0:
            meal_allowance += NU_MORNING_MEAL_ALLOWANCE_OT_BONUS
            
    return {
        "standard_hours": standard_hours,
        "ot_hours": total_ot,
        "meal_allowance": meal_allowance,
        "night_allowance": night_allowance,
        "is_night": is_night
    }
