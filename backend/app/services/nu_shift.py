from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, date, timedelta, time
from typing import Optional


NU_SHIFT_CODE = "NU"
XNU_SHIFT_CODE = "XNU"

NU_MORNING_MODE = "morning"
NU_NIGHT_MODE = "night"

XNU_MODE_1 = "xnu_shift1"
XNU_MODE_2 = "xnu_shift2"
XNU_MODE_3 = "xnu_shift3"

NU_DYNAMIC_SHIFT_CODES = {"NU", "NUT1", "NUT2", "NU1", "NU2", "NU3", "NUN", "XNU"}

NU_STANDARD_HOURS = 8.0
NU_MAX_OT_HOURS = 4.0  # Ca NU tối đa 12h = 8h standard + 4h OT
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

NU_WARNING_NOTE_PREFIX = "Canh bao NU:"


@dataclass
class NuShiftDayResult:
    mode: str
    week_mode: str
    shift_code: str
    has_midday_check: bool
    warning_note: Optional[str]
    check_in: Optional[datetime]
    check_out: Optional[datetime]
    standard_hours: float
    total_ot_hours: float
    meal_allowance: float
    meal_count: int
    night_allowance: float
    shift_name: str


def is_nu_dynamic_shift_code(code):
    return str(code or "").strip().upper() in NU_DYNAMIC_SHIFT_CODES


def _is_midday_check(event_time):
    # Support both datetime and time objects
    hour = event_time.hour if hasattr(event_time, 'hour') else event_time.hour
    return 10 <= hour <= 13


def _is_evening_check(event_time):
    hour = event_time.hour if hasattr(event_time, 'hour') else event_time.hour
    return hour >= 17


def _is_morning_check(event_time):
    hour = event_time.hour if hasattr(event_time, 'hour') else event_time.hour
    return hour <= 8


def _detect_daily_mode(today_events, next_day_events, is_sunday=False, shift_code=None):
    is_xnu = (shift_code == XNU_SHIFT_CODE)
    
    if is_xnu:
        if not today_events:
            return None, False
            
        first_event = today_events[0]
        first_hour = first_event.hour
        
        # XNU Shift 3: 22:00 - 06:00 (starts late)
        if first_hour >= 20:
            return XNU_MODE_3, False
            
        # XNU Shift 1: 06:00 - 14:00 (starts early)
        if first_hour <= 10:
            has_midday = any(10 <= item.hour <= 13 for item in today_events)
            return XNU_MODE_1, has_midday
            
        # XNU Shift 2: 14:00 - 22:00 (starts afternoon)
        if 12 <= first_hour <= 18:
            return XNU_MODE_2, False
            
        return None, False

    # Standard NU logic
    has_midday = any(_is_midday_check(item) for item in today_events)
    if has_midday:
        return NU_MORNING_MODE, has_midday

    has_evening = any(_is_evening_check(item) for item in today_events)
    has_next_day_morning = any(_is_morning_check(item) for item in next_day_events)
    if has_evening and has_next_day_morning:
        return NU_NIGHT_MODE, has_midday

    has_morning = any(_is_morning_check(item) for item in today_events)
    if not is_sunday and has_morning and has_evening:
        return NU_MORNING_MODE, has_midday

    return None, has_midday


def _fallback_mode(today_events, is_sunday=False):
    if not today_events:
        return NU_MORNING_MODE

    first_event = today_events[0]
    if first_event.hour <= 10:
        return NU_NIGHT_MODE if is_sunday else NU_MORNING_MODE
    if first_event.hour >= 15:
        return NU_NIGHT_MODE

    if any(_is_evening_check(item) for item in today_events):
        return NU_NIGHT_MODE

    return NU_MORNING_MODE


def _pick_check_times(mode, today_events, next_day_events, is_sunday=False):
    if mode == XNU_MODE_1:
        # 06:00 - 14:00
        check_in = next((item for item in today_events if item.hour < 10), (today_events[0] if today_events else None))
        check_out = next((item for item in reversed(today_events) if item.hour >= 13), (today_events[-1] if today_events else None))
        return check_in, check_out
        
    if mode == XNU_MODE_2:
        # 14:00 - 22:00
        check_in = next((item for item in today_events if 12 <= item.hour < 17), (today_events[0] if today_events else None))
        check_out = next((item for item in reversed(today_events) if item.hour >= 20), (today_events[-1] if today_events else None))
        return check_in, check_out
        
    if mode == XNU_MODE_3:
        # 22:00 - 06:00 (next day)
        check_in = next((item for item in today_events if item.hour >= 20), (today_events[0] if today_events else None))
        check_out = next((item for item in next_day_events if item.hour < 10), None)
        return check_in, check_out

    if mode == NU_MORNING_MODE:
        morning_candidates = [item for item in today_events if item.hour < 14]
        evening_candidates = [item for item in today_events if item.hour >= 14]

        check_in = morning_candidates[0] if morning_candidates else (today_events[0] if today_events else None)
        # On Sunday, early morning punches are check-outs from Sat night.
        # They should NOT be check-ins for Sunday Morning shift.
        if is_sunday and check_in and check_in.hour < 12:
            return None, None

        check_out = (
            evening_candidates[-1]
            if evening_candidates
            else (today_events[-1] if today_events else None)
        )
        return check_in, check_out

    # Night mode: check-in belongs to the current date evening, check-out belongs to next day.
    evening_candidates = [item for item in today_events if item.hour >= 15]
    next_day_candidates = [item for item in next_day_events if item.hour <= 12]

    # Special case: Sunday in night week is usually an off day.
    # Morning punches are just check-outs from Saturday night.
    if is_sunday and not evening_candidates:
        return None, None

    check_in = evening_candidates[0] if evening_candidates else (today_events[-1] if today_events else None)
    # If check_in is a morning punch on Sunday, ignore it for the Sunday work date
    if is_sunday and check_in and check_in.hour < 12:
        return None, None

    check_out = next_day_candidates[0] if next_day_candidates else None

    return check_in, check_out


def _build_shift_name(mode, shift_code):
    if shift_code == XNU_SHIFT_CODE:
        if mode == XNU_MODE_1: return "Ca XNU - Ca 1 (06:00-14:00)"
        if mode == XNU_MODE_2: return "Ca XNU - Ca 2 (14:00-22:00)"
        if mode == XNU_MODE_3: return "Ca XNU - Ca 3 (22:00-06:00)"
        return "Ca XNU (XNU)"

    mode_label = "sang" if mode == NU_MORNING_MODE else "toi"
    code = (shift_code or NU_SHIFT_CODE).upper()

    if code == "NUT1":
        return f"Ca nu {mode_label} +1h OT (NUT1)"
    if code == "NUT2":
        return f"Ca nu {mode_label} +2h OT (NUT2)"
    if code == "NU1":
        return f"Ca nu {mode_label} tru 1h cong (NU1)"
    if code == "NU2":
        return f"Ca nu {mode_label} tru 2h cong (NU2)"
    if code == "NU3":
        return f"Ca nu {mode_label} tru 3h cong (NU3)"
    if code == "NUN":
        return f"Ca nu {mode_label} tru 4h cong (NUN)"

    return f"Ca nu {mode_label} (NU)"


def _hours_between(start_at, end_at):
    if not start_at or not end_at or end_at <= start_at:
        return 0.0
    return (end_at - start_at).total_seconds() / 3600.0


def normalize_nu_overtime_hours(raw_overtime_hours):
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


def _compute_dynamic_nu_overtime_hours(check_in, check_out, mode):
    if not check_in or not check_out:
        return None
        
    # Cap check-in at 06:00 for Morning mode calculation
    calc_check_in = check_in
    if mode == NU_MORNING_MODE:
        start_6am = check_in.replace(hour=6, minute=0, second=0, microsecond=0)
        if calc_check_in < start_6am:
            calc_check_in = start_6am

    worked_hours = _hours_between(calc_check_in, check_out)
    if worked_hours <= 0:
        return None

    raw_overtime_hours = max(worked_hours - NU_STANDARD_HOURS, 0.0)
    
    # Morning shift has 0.5h break deducted from OT
    if mode == NU_MORNING_MODE and raw_overtime_hours >= 0.5:
        raw_overtime_hours -= 0.5
        
    return normalize_nu_overtime_hours(raw_overtime_hours)


def _build_result(mode, week_mode, shift_code, has_midday_check, warning_note, check_in, check_out, night_allowance_rate=0.0):
    code = (shift_code or NU_SHIFT_CODE).upper()
    standard_hours = max(
        NU_STANDARD_HOURS - NU_STANDARD_HOURS_DEDUCTION_BY_CODE.get(code, 0.0),
        0.0,
    )
    base_overtime = (
        NU_NIGHT_DEFAULT_OT_HOURS if mode == NU_NIGHT_MODE else NU_MORNING_DEFAULT_OT_HOURS
    )
    dynamic_overtime = _compute_dynamic_nu_overtime_hours(check_in, check_out, mode)
    
    if not check_in and not check_out:
        overtime_hours = 0.0
        standard_hours = 0.0
        meal_allowance = 0.0
        meal_count = 0
        night_allowance = 0.0
    else:
        overtime_hours = (
            dynamic_overtime if dynamic_overtime is not None else base_overtime
        )
        overtime_hours += NU_EXTRA_OT_BY_CODE.get(code, 0.0)
        
        if mode == XNU_MODE_3:
            meal_allowance = 35000.0
            meal_count = 1
            night_allowance = night_allowance_rate if night_allowance_rate > 0 else NU_NIGHT_PCCD
        elif mode in [XNU_MODE_1, XNU_MODE_2]:
            meal_allowance = 35000.0
            meal_count = 1
            night_allowance = 0.0
        elif mode == NU_NIGHT_MODE:
            meal_allowance = NU_NIGHT_MEAL_ALLOWANCE
            meal_count = 1
            night_allowance = night_allowance_rate if night_allowance_rate > 0 else NU_NIGHT_PCCD
        else:
            meal_allowance = NU_MORNING_MEAL_ALLOWANCE
            meal_count = 1
            night_allowance = 0.0
            # 2nd meal bonus if OT >= 3.0h (after break deduction)
            if overtime_hours >= 3.0:
                meal_allowance += NU_MORNING_MEAL_ALLOWANCE_OT_BONUS
                meal_count = 2

    return NuShiftDayResult(
        mode=mode,
        week_mode=week_mode,
        shift_code=code,
        has_midday_check=has_midday_check,
        warning_note=warning_note,
        check_in=check_in,
        check_out=check_out,
        standard_hours=standard_hours,
        total_ot_hours=overtime_hours,
        meal_allowance=meal_allowance,
        meal_count=meal_count,
        night_allowance=night_allowance,
        shift_name=_build_shift_name(mode, code),
    )


def build_nu_shift_day_results(
    nu_shift_code_map,
    employee_id_list,
    attendance_log_rows,
    night_allowance_rate=0.0
):
    """
    nu_shift_code_map: {(employee_id, date): shift_code}
    attendance_log_rows: list of objects with employee_id and event_time
    """
    events_by_employee_date = defaultdict(list)

    for row in attendance_log_rows:
        employee_id = getattr(row, "employee_id", None)
        event_time = getattr(row, "event_time", None)

        if employee_id is None or not isinstance(event_time, datetime):
            continue

        events_by_employee_date[(employee_id, event_time.date())].append(event_time)

    for event_list in events_by_employee_date.values():
        event_list.sort()

    results = {}

    for employee_id in employee_id_list:
        # Get all relevant dates for this employee from the map
        emp_dates = [k[1] for k in nu_shift_code_map.keys() if k[0] == employee_id]
        if not emp_dates:
            continue
            
        sorted_dates = sorted(emp_dates)
        day_mode_candidates = {}
        week_to_modes = defaultdict(list)
        week_to_days = defaultdict(list)

        for work_date in sorted_dates:
            today_events = events_by_employee_date.get((employee_id, work_date), [])
            next_day_events = events_by_employee_date.get((employee_id, work_date + timedelta(days=1)), [])

            is_sun = (work_date.weekday() == 6)
            shift_code = str(nu_shift_code_map.get((employee_id, work_date), NU_SHIFT_CODE)).upper()
            detected_mode, has_midday = _detect_daily_mode(today_events, next_day_events, is_sunday=is_sun, shift_code=shift_code)
            fallback_mode = _fallback_mode(today_events, is_sunday=is_sun)
            day_mode_candidates[work_date] = {
                "detected_mode": detected_mode,
                "fallback_mode": fallback_mode,
                "has_midday": has_midday,
                "today_events": today_events,
                "next_day_events": next_day_events,
            }

            # NU week starts on Sunday for grouping
            week_start = work_date - timedelta(days=(work_date.weekday() + 1) % 7)
            week_key = week_start
            week_to_days[week_key].append(work_date)
            if detected_mode:
                week_to_modes[week_key].append(detected_mode)

        week_mode_map = {}
        previous_week_mode = None
        for week_key in sorted(week_to_days.keys()):
            detected_modes = week_to_modes.get(week_key, [])
            if detected_modes:
                week_mode_map[week_key] = detected_modes[0]
            elif previous_week_mode:
                week_mode_map[week_key] = previous_week_mode
            else:
                week_days = week_to_days.get(week_key, [])
                fallback_modes = [day_mode_candidates[item]["fallback_mode"] for item in week_days]
                week_mode_map[week_key] = Counter(fallback_modes).most_common(1)[0][0]

            previous_week_mode = week_mode_map[week_key]

        for work_date in sorted_dates:
            shift_code = str(nu_shift_code_map.get((employee_id, work_date), NU_SHIFT_CODE)).upper()
            data = day_mode_candidates[work_date]
            detected_mode = data["detected_mode"]
            
            week_start = work_date - timedelta(days=(work_date.weekday() + 1) % 7)
            week_key = week_start
            week_mode = week_mode_map.get(week_key) or data["fallback_mode"]
            
            effective_mode = detected_mode or week_mode
            # Sunday night rotation special case
            if work_date.weekday() == 6 and detected_mode == NU_NIGHT_MODE:
                effective_mode = NU_NIGHT_MODE

            today_events = data["today_events"]
            next_day_events = data["next_day_events"]
            has_midday = data["has_midday"]

            warning_parts = []
            if (
                effective_mode == NU_MORNING_MODE
                and work_date.weekday() != 6
                and today_events
                and not has_midday
            ):
                warning_parts.append("Tuan sang thieu check giua ca (10h-13h)")

            warning_note = None
            if warning_parts:
                warning_note = f"{NU_WARNING_NOTE_PREFIX} {'; '.join(warning_parts)}"

            check_in, check_out = _pick_check_times(effective_mode, today_events, next_day_events, is_sunday=(work_date.weekday() == 6))

            results[(employee_id, work_date)] = _build_result(
                effective_mode,
                week_mode,
                shift_code,
                has_midday_check=has_midday,
                warning_note=warning_note,
                check_in=check_in,
                check_out=check_out,
                night_allowance_rate=night_allowance_rate
            )

    return results

# Keep these for backward compatibility if needed, but they are simplified
def is_nu_warning_note(notes):
    text_value = str(notes or "").lower()
    return NU_WARNING_NOTE_PREFIX.lower() in text_value

def calculate_nu_shift_details(shift_code: str, actual_hours: float, is_night: bool = False, night_allowance_rate: float = 0.0):
    # This is a simplified version for single-day calculation without log access
    code = shift_code.upper()
    standard_hours = max(NU_STANDARD_HOURS - NU_STANDARD_HOURS_DEDUCTION_BY_CODE.get(code, 0.0), 0.0)
    
    raw_ot = max(actual_hours - NU_STANDARD_HOURS, 0.0)
    
    # Morning shift has 0.5h break deducted from OT
    if not is_night and raw_ot >= 0.5:
        raw_ot -= 0.5
        
    normalized_ot = normalize_nu_overtime_hours(raw_ot)
    extra_ot = NU_EXTRA_OT_BY_CODE.get(code, 0.0)
    total_ot = normalized_ot + extra_ot
    
    if is_night:
        meal_allowance = NU_NIGHT_MEAL_ALLOWANCE
        night_allowance = night_allowance_rate if night_allowance_rate > 0 else NU_NIGHT_PCCD
    else:
        meal_allowance = NU_MORNING_MEAL_ALLOWANCE
        night_allowance = 0.0
        # Threshold for 2nd meal bonus: 3.0h OT (after break)
        if total_ot >= 3.0:
            meal_allowance += NU_MORNING_MEAL_ALLOWANCE_OT_BONUS
            
    return {
        "standard_hours": standard_hours,
        "ot_hours": total_ot,
        "meal_allowance": meal_allowance,
        "night_allowance": night_allowance,
        "is_night": is_night
    }

