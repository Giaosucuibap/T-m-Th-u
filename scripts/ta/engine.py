"""Loi tinh tham chieu (oracle) cho TA Estimate.

Muc dich: tinh doc lap bang Decimal de doi chieu voi cong thuc Excel va VBA.
Khong doc gi tu workbook. Moi quy tac tien/so luong theo AGENTS.md va docs/06_spec.md.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation, getcontext

from .errors import TAError

getcontext().prec = 34

GROUPS = ("VL", "NC", "M")


# ----------------------------------------------------------------- so lieu

def D(value):
    """Doc so theo chuan JSON cua hop dong: chuoi thap phan dau cham, khong phan cach nghin."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise TAError("INVALID_NUMBER", "Gia tri logic khong phai so: %r" % value)
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        raise TAError("INVALID_NUMBER", "Khong nhan float nhi phan, dung chuoi thap phan: %r" % value)
    text = str(value).strip()
    if not text or "," in text or " " in text:
        raise TAError("INVALID_NUMBER", "Chuoi so khong dung chuan (dau cham, khong phan cach): %r" % value)
    try:
        return Decimal(text)
    except InvalidOperation:
        raise TAError("INVALID_NUMBER", "Khong doc duoc so: %r" % value)


def parse_localized(text, locale):
    """Doc so nguoi dung nhap theo locale khai bao. Khong doan.

    vi: '.' phan cach nghin, ',' thap phan  ->  '1.250' = 1250 ; '1,25' = 1.25
    en: ',' phan cach nghin, '.' thap phan  ->  '1,250' = 1250 ; '1.25' = 1.25
    """
    if locale not in ("vi", "en"):
        raise TAError("LOCALE_REQUIRED", "Phai khai bao locale khi doc so nhap tay")
    s = str(text).strip().replace(" ", "").replace(" ", "")
    group, dec = (".", ",") if locale == "vi" else (",", ".")
    if s.count(dec) > 1:
        raise TAError("INVALID_NUMBER", "Nhieu dau thap phan: %r" % text)
    int_part, _, frac_part = s.partition(dec)
    sign = ""
    if int_part.startswith("-"):
        sign, int_part = "-", int_part[1:]
    if group in int_part:
        chunks = int_part.split(group)
        if not (1 <= len(chunks[0]) <= 3 and all(len(c) == 3 for c in chunks[1:])):
            raise TAError("INVALID_NUMBER", "Phan cach nghin sai vi tri: %r" % text)
        int_part = "".join(chunks)
    if not int_part.isdigit() or (frac_part and not frac_part.isdigit()):
        raise TAError("INVALID_NUMBER", "Khong doc duoc so: %r" % text)
    return Decimal(sign + int_part + ("." + frac_part if frac_part else ""))


def excel_round(value, digits):
    """Giong ham ROUND cua Excel: lam tron nua ra xa so 0 (khac VBA Round lam tron ngan hang)."""
    v = D(value)
    q = Decimal(1).scaleb(-int(digits))
    return v.quantize(q, rounding=ROUND_HALF_UP)


# ----------------------------------------------------------------- khoi luong

def norm_count(input_quantity, unit_conversion, norm_basis_qty):
    basis = D(norm_basis_qty)
    if basis is None or basis <= 0:
        raise TAError("INVALID_NORM_BASIS", "norm_basis_qty phai > 0 (nhan %r)" % norm_basis_qty)
    if input_quantity is None:
        raise TAError("MISSING_QUANTITY", "Chua nhap khoi luong")
    if unit_conversion is None:
        raise TAError("MISSING_CONVERSION", "Chua co he so doi don vi")
    conv = D(unit_conversion)
    if conv <= 0:
        raise TAError("INVALID_CONVERSION", "He so doi don vi phai > 0")
    return D(input_quantity) * conv / basis


def line_quantity(count, amount, factor="1"):
    return D(count) * D(amount) * D(factor)


def line_cost(quantity, price, digits=0):
    if price is None:
        raise TAError("MISSING_PRICE", "Thieu gia")
    return excel_round(D(quantity) * D(price), digits)


def percent_amount(base, percent, digits=0):
    """amount=2 nghia la 2% -> base * 2 / 100."""
    return excel_round(D(base) * D(percent) / Decimal(100), digits)


# ----------------------------------------------------------------- dong phan tram

def resolve_basis(lines, percent_line):
    """Tra ve danh sach line_id dung lam co so cho dong phan tram.

    basis_ref gom line_id hoac token nhom (VL/NC/M = moi dong quantity cua nhom).
    Loi: CIRCULAR_BASIS, BASIS_NOT_FOUND, PERCENT_WITHOUT_BASIS, PERCENT_ON_PERCENT_UNSUPPORTED.
    """
    refs = percent_line.get("basis_ref") or []
    if isinstance(refs, str):
        refs = [r for r in refs.split(";") if r]
    if not refs:
        raise TAError("PERCENT_WITHOUT_BASIS", "Dong %% %s khong co basis_ref" % percent_line.get("line_id"))
    by_id = {ln["line_id"]: ln for ln in lines}
    own = percent_line.get("line_id")
    result = []
    for ref in refs:
        if ref == own:
            raise TAError("CIRCULAR_BASIS", "Dong %s lay chinh no lam co so" % own)
        if ref in GROUPS:
            members = [ln["line_id"] for ln in lines
                       if ln.get("group") == ref and ln.get("amount_kind") == "quantity"]
            if not members:
                raise TAError("BASIS_NOT_FOUND", "Nhom %s khong co dong quantity" % ref)
            result.extend(members)
            continue
        if ref not in by_id:
            raise TAError("BASIS_NOT_FOUND", "Khong co dong co so %s" % ref)
        target = by_id[ref]
        if target.get("amount_kind") != "quantity":
            _check_percent_cycle(by_id, own, ref)
            raise TAError("PERCENT_ON_PERCENT_UNSUPPORTED",
                          "Dong %s lay dong %% %s lam co so: chua ho tro" % (own, ref))
        result.append(ref)
    return result


def _check_percent_cycle(by_id, start, ref, seen=None):
    seen = set(seen or ())
    seen.add(start)
    if ref in seen:
        raise TAError("CIRCULAR_BASIS", "Vong tham chieu phan tram qua %s" % ref)
    line = by_id.get(ref)
    if not line or line.get("amount_kind") != "percent":
        return
    refs = line.get("basis_ref") or []
    for nxt in refs:
        _check_percent_cycle(by_id, ref, nxt, seen)


# ----------------------------------------------------------------- mot cong tac

def compute_item(norm, input_quantity, unit_conversion="1", prices=None, factors=None,
                 line_factors=None, cost_digits=0):
    """Tinh mot cong tac. prices: {resource_id: gia hoac None}. factors: {nhom: he so}.

    Tra ve dict: norm_count, lines[{line_id, quantity, cost, error}], group_cost, direct_cost, errors.
    Thieu gia khong thanh 0: dong do co error, tong nhom/tong truc tiep = None.
    """
    prices = prices or {}
    factors = factors or {}
    line_factors = line_factors or {}
    count = norm_count(input_quantity, unit_conversion, norm["norm_basis_qty"])
    lines = norm["consumptions"]
    out = {}
    errors = []
    for ln in lines:
        if ln["amount_kind"] != "quantity":
            continue
        factor = D(line_factors.get(ln["line_id"], factors.get(ln["group"], "1")))
        qty = line_quantity(count, ln["amount"], factor)
        price = prices.get(ln["resource_id"])
        try:
            cost = line_cost(qty, price, cost_digits)
            err = None
        except TAError as e:
            cost, err = None, e.code
            errors.append((ln["line_id"], e.code))
        out[ln["line_id"]] = {"line_id": ln["line_id"], "group": ln["group"], "kind": "quantity",
                              "quantity": qty, "cost": cost, "error": err}
    for ln in lines:
        if ln["amount_kind"] != "percent":
            continue
        rate = D(ln["amount"]) * D(line_factors.get(ln["line_id"], "1"))
        try:
            basis_ids = resolve_basis(lines, ln)
            base_costs = [out[b]["cost"] for b in basis_ids]
            if any(c is None for c in base_costs):
                raise TAError("BASIS_HAS_ERROR", "Co so cua dong %% co dong thieu gia")
            cost = percent_amount(sum(base_costs, Decimal(0)), rate, cost_digits)
            err = None
        except TAError as e:
            cost, err = None, e.code
            errors.append((ln["line_id"], e.code))
        out[ln["line_id"]] = {"line_id": ln["line_id"], "group": ln["group"], "kind": "percent",
                              "quantity": None, "cost": cost, "error": err}
    group_cost = {}
    for g in GROUPS:
        costs = [v["cost"] for v in out.values() if v["group"] == g]
        group_cost[g] = None if any(c is None for c in costs) else sum(costs, Decimal(0))
    direct = None if any(v is None for v in group_cost.values()) else sum(group_cost.values(), Decimal(0))
    return {"norm_count": count, "lines": out, "group_cost": group_cost,
            "direct_cost": direct, "errors": errors}


def resource_totals(items):
    """Tong luong theo (resource_id, price_id); dong % khong cong vao luong."""
    totals = {}
    for item in items:
        for ln in item["lines"]:
            if ln["kind"] != "quantity":
                continue
            key = (ln["resource_id"], ln["price_id"])
            totals[key] = totals.get(key, Decimal(0)) + ln["quantity"]
    return totals


# ----------------------------------------------------------------- gia hien truong

def effective_price(quoted_price, includes_transport, transport=None, handling=None,
                    zero_reason=None, reviewer=None, digits=0):
    """Tra ve (gia_ap_dung, canh_bao). includes_transport: 'yes' | 'no' | 'n/a' (hoac bool)."""
    warnings = []
    if isinstance(includes_transport, bool):
        includes_transport = "yes" if includes_transport else "no"
    if quoted_price is None:
        raise TAError("MISSING_PRICE", "Chua co gia goc")
    q = D(quoted_price)
    if q == 0 and not (zero_reason and reviewer):
        raise TAError("ZERO_PRICE_UNAPPROVED", "Gia 0 can ly do va nguoi xac nhan")
    h = D(handling) if handling is not None else Decimal(0)
    if includes_transport == "no":
        if transport is None:
            raise TAError("MISSING_TRANSPORT", "Gia chua gom van chuyen nhung chua nhap cuoc")
        return excel_round(q + D(transport) + h, digits), warnings
    if includes_transport in ("yes", "n/a"):
        if transport is not None and D(transport) != 0:
            warnings.append("DUPLICATE_TRANSPORT")
        return excel_round(q + h, digits), warnings
    raise TAError("MISSING_TRANSPORT_FLAG", "Chua khai bao gia da gom van chuyen hay chua")


# ----------------------------------------------------------------- quy tac chi phi

RULE_TYPES = ("percentage_on_basis", "sum", "fixed")
BUILTIN_BASES = ("VL", "NC", "M", "T")


def order_cost_rules(rules):
    """Kiem tra va sap xep topo. Loi: DUPLICATE_RULE, UNSUPPORTED_RULE_TYPE, UNKNOWN_BASE, CIRCULAR_RULE."""
    by_id = {}
    for r in rules:
        rid = r["rule_id"]
        if rid in by_id or rid in BUILTIN_BASES:
            raise TAError("DUPLICATE_RULE", "Trung ky hieu %s" % rid)
        if r["rule_type"] not in RULE_TYPES:
            raise TAError("UNSUPPORTED_RULE_TYPE", "Loai %s chua ho tro" % r["rule_type"])
        by_id[rid] = r
    deps = {}
    for rid, r in by_id.items():
        refs = [x for x in (r.get("base_refs") or "").split(";") if x]
        if r["rule_type"] != "fixed" and not refs:
            raise TAError("UNKNOWN_BASE", "Khoan %s thieu co so" % rid)
        for x in refs:
            if x not in by_id and x not in BUILTIN_BASES:
                raise TAError("UNKNOWN_BASE", "Khoan %s tham chieu %s khong ton tai" % (rid, x))
        deps[rid] = [x for x in refs if x in by_id]
    ordered, state = [], {}

    def visit(rid, path):
        if state.get(rid) == 2:
            return
        if state.get(rid) == 1:
            raise TAError("CIRCULAR_RULE", "Vong phu thuoc: %s" % " -> ".join(path + [rid]))
        state[rid] = 1
        for d in deps[rid]:
            visit(d, path + [rid])
        state[rid] = 2
        ordered.append(rid)

    for r in rules:
        visit(r["rule_id"], [])
    return [by_id[rid] for rid in ordered]


def evaluate_cost_rules(base_amounts, rules, cost_digits=0):
    """base_amounts: {VL, NC, M} (T tu tinh). Tra ve dict ky hieu -> so tien (None neu thieu)."""
    values = dict(base_amounts)
    if "T" not in values:
        parts = [values.get(g) for g in GROUPS]
        values["T"] = None if any(p is None for p in parts) else sum(parts, Decimal(0))
    for r in order_cost_rules(rules):
        refs = [x for x in (r.get("base_refs") or "").split(";") if x]
        base = [values.get(x) for x in refs]
        if r["rule_type"] == "fixed":
            amt = D(r["fixed_amount"]) if r.get("fixed_amount") is not None else None
        elif any(b is None for b in base):
            amt = None
        elif r["rule_type"] == "sum":
            amt = sum(base, Decimal(0))
        else:
            if r.get("rate") is None:
                amt = None
            else:
                raw = sum(base, Decimal(0)) * D(r["rate"]) / Decimal(100)
                amt = excel_round(raw, cost_digits) if r.get("rounding_stage", "round_cost") == "round_cost" else raw
        values[r["rule_id"]] = amt
    return values


# ----------------------------------------------------------------- phat hanh

def export_gate(norm_flags, missing_prices=0, profile_status="approved", open_errors=0):
    """norm_flags: list dict {is_demo, status}. Tra ve dict {official_export, draft_allowed, reasons}."""
    reasons = []
    if any(n.get("is_demo") for n in norm_flags):
        reasons.append("DEMO_DATA")
    if any(n.get("status") != "verified" for n in norm_flags):
        reasons.append("NORM_NOT_VERIFIED")
    if missing_prices:
        reasons.append("MISSING_PRICE")
    if profile_status != "approved":
        reasons.append("PROFILE_NOT_APPROVED")
    if open_errors:
        reasons.append("OPEN_ERRORS")
    return {"official_export": not reasons, "draft_allowed": True, "reasons": reasons}


def plan_catalog_update(project_catalog, installed_catalog):
    """Cong trinh giu bo da chot; cap nhat chi qua thao tac xem diff va xac nhan."""
    return {
        "project_catalog": project_catalog,
        "installed_catalog": installed_catalog,
        "auto_update": False,
        "requires_review": project_catalog != installed_catalog,
    }
