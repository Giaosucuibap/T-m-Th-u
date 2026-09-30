"""Quy doi don vi chi trong cung dai luong va cung trang thai vat ly.

Khong co quy tac 'ten gan giong'. Don vi co trang thai (dat nguyen tho/roi/dam chat)
chi quy doi khi nguoi lap nhap he so co can cu.
"""
from decimal import Decimal

from .errors import TAError

# Bi danh -> ma chuan (ASCII)
ALIASES = {
    "m3": "m3", "m³": "m3", "khoi": "m3",
    "m2": "m2", "m²": "m2",
    "m": "m", "md": "m", "km": "km", "cm": "cm", "mm": "mm",
    "kg": "kg", "g": "g", "t": "t", "tan": "t", "tấn": "t", "tấn": "t",
    "l": "l", "lit": "l", "lít": "l", "dm3": "dm3",
    "ha": "ha",
    "cong": "cong", "công": "cong",
    "ca": "ca",
    "m3_nguyen_tho": "m3_nguyen_tho", "m3_roi": "m3_roi", "m3_dam_chat": "m3_dam_chat",
}

# ma chuan -> (dai luong, he so ve don vi goc cua dai luong)
DIMENSIONS = {
    "kg": ("mass", Decimal("1")), "g": ("mass", Decimal("0.001")), "t": ("mass", Decimal("1000")),
    "m": ("length", Decimal("1")), "km": ("length", Decimal("1000")),
    "cm": ("length", Decimal("0.01")), "mm": ("length", Decimal("0.001")),
    "m2": ("area", Decimal("1")), "ha": ("area", Decimal("10000")),
    "m3": ("volume", Decimal("1")), "l": ("volume", Decimal("0.001")), "dm3": ("volume", Decimal("0.001")),
    "cong": ("labour", Decimal("1")),
    "ca": ("machine_shift", Decimal("1")),
}

# Don vi co trang thai vat ly: chi dong nhat voi chinh no
STATEFUL = {"m3_nguyen_tho", "m3_roi", "m3_dam_chat"}


def normalize_unit(unit):
    if unit is None:
        raise TAError("MISSING_UNIT", "Thieu don vi")
    key = str(unit).strip().lower()
    if key not in ALIASES:
        raise TAError("UNKNOWN_UNIT", "Don vi chua co trong danh muc: %r" % unit)
    return ALIASES[key]


def resolve_conversion(from_unit, to_unit, explicit=None):
    """Tra ve (he_so, phuong_thuc). phuong_thuc: 'identity' | 'table' | 'manual'.

    explicit: he so do nguoi lap nhap (bat buoc co can cu khi doi trang thai vat ly).
    """
    a = normalize_unit(from_unit)
    b = normalize_unit(to_unit)
    if a == b:
        return Decimal("1"), "identity"
    if a in STATEFUL or b in STATEFUL:
        if explicit is None:
            raise TAError(
                "MISSING_PHYSICAL_CONVERSION",
                "Khong tu quy doi %s sang %s: can he so co can cu" % (a, b),
            )
        return _positive(explicit), "manual"
    if a not in DIMENSIONS or b not in DIMENSIONS:
        raise TAError("UNKNOWN_UNIT", "Khong co quy doi cho %s -> %s" % (a, b))
    da, fa = DIMENSIONS[a]
    db, fb = DIMENSIONS[b]
    if da != db:
        raise TAError("UNIT_DIMENSION_MISMATCH", "Khac dai luong: %s (%s) va %s (%s)" % (a, da, b, db))
    factor = fa / fb
    if explicit is not None and _positive(explicit) != factor:
        raise TAError("CONVERSION_CONFLICT", "He so nhap %s khac he so chuan %s" % (explicit, factor))
    return factor, "table"


def _positive(value):
    v = Decimal(str(value))
    if v <= 0:
        raise TAError("INVALID_CONVERSION", "He so doi don vi phai > 0")
    return v
