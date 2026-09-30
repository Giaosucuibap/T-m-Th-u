"""Kiem tra ho so cong trinh tu gia tri da tinh (tham chieu cho modValidation.bas).

Doc truc tiep cac bang (khong doc sheet KIEM_TRA). Moi loi co ma, muc, item_id, vi tri.
Muc: BLOCKER va ERROR chan phat hanh; WARNING/INFO khong chan.
"""
from decimal import Decimal

from . import lo
from .errors import TAError
from .engine import order_cost_rules
from .schema import load_schema, load_strings, table_map
from .units import resolve_conversion

EXCEL_ERRORS = {"#N/A", "#VALUE!", "#REF!", "#DIV/0!", "#NUM!", "#NAME?", "#NULL!"}
BLOCKING = ("BLOCKER", "ERROR")


def is_err(v):
    return isinstance(v, str) and v in EXCEL_ERRORS


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def read_all(path):
    t = table_map(load_schema())
    wb = lo.open_values(path)
    return {name: lo.read_table(wb, ti["sheet"], ti["header_row"], ti["first_col"], ti["names"])
            for name, ti in t.items()}


class Checks:
    def __init__(self):
        self.s = load_strings()
        self.items = []

    def add(self, severity, code, item_id, location, *args):
        msg = self.s.get("chk." + code, code)
        for i, a in enumerate(args):
            msg = msg.replace("{%d}" % i, str(a))
        self.items.append({"severity": severity, "error_code": code, "item_id": item_id or "",
                           "location": location, "message": msg,
                           "resolution": self.s.get("chk.%s.fix" % code, "")})

    def codes(self):
        return [c["error_code"] for c in self.items]

    def blocking(self):
        return [c for c in self.items if c["severity"] in BLOCKING]


def validate(data):
    ck = Checks()
    proj = {r["key"]: r["value"] for r in data["tblProject"]}
    items, lines = data["tblItems"], data["tblAnalysis"]
    snaps = {r["snapshot_id"]: r for r in data["tblSnapshotNorms"]}
    slines = {r["snapshot_line_id"]: r for r in data["tblSnapshotLines"]}
    prices = {r["price_id"]: r for r in data["tblPrices"]}

    for table, key in (("tblItems", "item_id"), ("tblAnalysis", "analysis_id"),
                       ("tblSnapshotNorms", "snapshot_id"), ("tblSnapshotLines", "snapshot_line_id"),
                       ("tblPrices", "price_id"), ("tblCostRules", "rule_id")):
        seen = set()
        for r in data[table]:
            if r[key] in seen:
                ck.add("ERROR", "DUPLICATE_ID", "", "%s[%s]" % (table, key), r[key], table)
            seen.add(r[key])

    item_ids = {r["item_id"] for r in items}
    lines_by_item = {}
    for ln in lines:
        lines_by_item.setdefault(ln["item_id"], []).append(ln)

    # ---- cong tac
    for it in items:
        iid = it["item_id"]
        loc = "TIEN_LUONG!" + iid
        sn = snaps.get(it["snapshot_id"])
        if sn is None:
            ck.add("ERROR", "ORPHAN_SNAPSHOT", iid, loc, it["snapshot_id"])
            continue
        if not lines_by_item.get(iid):
            ck.add("ERROR", "NO_ANALYSIS_LINES", iid, loc)
        q = it["input_quantity"]
        if not is_num(q):
            ck.add("BLOCKER", "MISSING_QUANTITY", iid, loc + ".input_quantity")
        elif q < 0 and not it.get("quantity_note"):
            ck.add("BLOCKER", "NEGATIVE_QUANTITY", iid, loc + ".input_quantity", q)
        elif q < 0:
            ck.add("WARNING", "NEGATIVE_QUANTITY", iid, loc + ".input_quantity", q)
        conv = it["unit_conversion"]
        if not is_num(conv) or conv <= 0:
            ck.add("BLOCKER", "INVALID_CONVERSION", iid, loc + ".unit_conversion", conv)
        else:
            _check_units(ck, it, sn, conv, loc)
        if sn.get("is_demo") is True:
            ck.add("BLOCKER", "DEMO_DATA", iid, loc)
        if sn.get("status") != "verified":
            ck.add("BLOCKER", "NORM_NOT_VERIFIED", iid, loc, sn.get("code"), sn.get("status"))
        for g, col in (("VL", "vl_status"), ("NC", "nc_status"), ("M", "m_status")):
            if sn.get(col) not in ("present", "none_verified"):
                ck.add("BLOCKER", "GROUP_STATUS_UNKNOWN", iid, loc, sn.get("code"), g)
        if proj.get("catalog_release_id") and sn.get("catalog_release_id") != proj.get("catalog_release_id"):
            ck.add("ERROR", "CATALOG_MISMATCH", iid, loc, sn["snapshot_id"], sn.get("catalog_release_id"),
                   proj.get("catalog_release_id"))

    # ---- dong chiet tinh
    audit_fields = {(a["item_id"], a["field"]) for a in data["tblAudit"] if a.get("reason")}
    for ln in lines:
        iid = ln["item_id"]
        loc = "CHIET_TINH!" + ln["analysis_id"]
        if iid not in item_ids:
            ck.add("ERROR", "ORPHAN_LINE", iid, loc, ln["analysis_id"])
        st = ln.get("status")
        if st not in ("verified", "not_applicable"):
            ck.add("BLOCKER", "LINE_NOT_VERIFIED", iid, loc, ln["snapshot_line_id"], st)
        f = ln.get("adjustment_factor")
        if is_num(f) and f != 1 and (iid, "adjustment_factor:" + ln["snapshot_line_id"]) not in audit_fields:
            ck.add("BLOCKER", "FACTOR_WITHOUT_LOG", iid, loc, ln["snapshot_line_id"], f)
        explained = False
        if ln["amount_kind"] == "quantity":
            pid = ln.get("price_id")
            if not pid:
                ck.add("BLOCKER", "MISSING_PRICE_ID", iid, loc, ln["snapshot_line_id"])
                explained = True
            elif is_err(ln.get("price")):
                ck.add("BLOCKER", "MISSING_PRICE", iid, loc, ln["resource_id"], pid)
                explained = True
        elif ln["amount_kind"] == "percent":
            item_lines = lines_by_item.get(iid, [])
            explained = _check_percent(ck, ln, item_lines, loc)
            basis = ln.get("basis_ref") or ""
            # Loi day chuyen: co so co dong thieu gia -> da bao o dong goc, khong bao them FORMULA_ERROR
            if not explained and any(is_err(x.get("qty_cost")) for x in item_lines
                                     if x["amount_kind"] == "quantity"
                                     and basis in (x["snapshot_line_id"], x["group"])):
                explained = True
        if is_err(ln.get("cost")) and not explained:
            it = next((x for x in items if x["item_id"] == iid), None)
            if not (it and (not is_num(it["input_quantity"]))):
                ck.add("ERROR", "FORMULA_ERROR", iid, loc + ".cost", loc, ln.get("cost"))

    # ---- gia
    used = {ln.get("price_id") for ln in lines if ln["amount_kind"] == "quantity"}
    tax = [prices[p].get("tax_basis") for p in used if p in prices]
    if "incl_vat" in tax and any(t != "incl_vat" for t in tax):
        ck.add("WARNING", "MIXED_TAX_BASIS", "", "GIA_DAU_VAO", tax.count("incl_vat"))
    for pid in sorted(used):
        p = prices.get(pid)
        if not p:
            continue
        loc = "GIA_DAU_VAO!" + pid
        q = p.get("quoted_price")
        if is_num(q) and q == 0 and not (p.get("zero_reason") and p.get("reviewer")):
            ck.add("BLOCKER", "ZERO_PRICE_UNAPPROVED", "", loc, pid)
        flag = p.get("includes_transport")
        if flag in ("yes", "n/a") and is_num(p.get("transport")) and p["transport"] != 0:
            ck.add("WARNING", "DUPLICATE_TRANSPORT", "", loc, pid, p["transport"])

    # ---- quy tac chi phi va tong
    rules = [r for r in data["tblCostRules"] if r.get("rule_id")]
    if not rules:
        ck.add("WARNING", "NO_RULES", "", "QUY_TAC_CP")
    else:
        try:
            order_cost_rules([dict(r, base_refs=r.get("base_refs") or "") for r in rules])
        except TAError as e:
            ck.add("ERROR", "RULES_INVALID", "", "QUY_TAC_CP", e.message)
        pending = [r["rule_id"] for r in rules if r.get("status") != "approved"]
        if pending:
            ck.add("BLOCKER", "PROFILE_NOT_APPROVED", "", "QUY_TAC_CP", proj.get("cost_rule_profile_id"),
                   ", ".join(pending))
    _check_totals(ck, data)
    if not ck.items:
        ck.add("INFO", "OK", "", "")
    return ck


def _check_units(ck, it, sn, conv, loc):
    iid = it["item_id"]
    try:
        factor, method = resolve_conversion(it["input_unit"], sn["base_unit"],
                                            explicit=str(conv) if it.get("conversion_basis") else None)
    except TAError as e:
        if e.code == "MISSING_PHYSICAL_CONVERSION":
            ck.add("BLOCKER", e.code, iid, loc + ".conversion_basis", it["input_unit"], sn["base_unit"])
        elif e.code == "CONVERSION_CONFLICT":
            f2, _ = resolve_conversion(it["input_unit"], sn["base_unit"])
            ck.add("BLOCKER", e.code, iid, loc + ".unit_conversion", it["input_unit"], sn["base_unit"], f2, conv)
        else:
            ck.add("BLOCKER", "UNKNOWN_UNIT" if e.code == "UNKNOWN_UNIT" else e.code, iid, loc + ".input_unit",
                   it["input_unit"])
        return
    if method in ("identity", "table") and Decimal(str(conv)) != factor:
        ck.add("BLOCKER", "CONVERSION_CONFLICT", iid, loc + ".unit_conversion", it["input_unit"],
               sn["base_unit"], factor, conv)


def _check_percent(ck, ln, item_lines, loc):
    iid, own, basis = ln["item_id"], ln["snapshot_line_id"], ln.get("basis_ref") or ""
    if not basis:
        ck.add("BLOCKER", "PERCENT_WITHOUT_BASIS", iid, loc, own)
        return True
    if ";" in basis:
        ck.add("BLOCKER", "UNSUPPORTED_MULTI_BASIS", iid, loc, own, basis)
        return True
    if basis == own:
        ck.add("BLOCKER", "CIRCULAR_BASIS", iid, loc, own)
        return True
    if basis in ("VL", "NC", "M"):
        if not any(x["group"] == basis and x["amount_kind"] == "quantity" for x in item_lines):
            ck.add("BLOCKER", "BASIS_NOT_FOUND", iid, loc, own, basis)
            return True
        return False
    target = next((x for x in item_lines if x["snapshot_line_id"] == basis), None)
    if target is None:
        ck.add("BLOCKER", "BASIS_NOT_FOUND", iid, loc, own, basis)
        return True
    if target["amount_kind"] != "quantity":
        ck.add("BLOCKER", "PERCENT_ON_PERCENT_UNSUPPORTED", iid, loc, own)
        return True
    return False


def _check_totals(ck, data):
    summ = {r["cost_id"]: r["amount"] for r in data["tblSummary"]}
    t = summ.get("T")
    item_total = [r["direct_cost"] for r in data["tblItems"]]
    if not is_num(t) or any(not is_num(v) for v in item_total):
        return  # da co loi thieu gia/khoi luong; khong so tong khi chua tinh duoc
    s_items = sum(item_total)
    if abs(s_items - t) > 0.5:
        ck.add("ERROR", "INCONSISTENT_TOTALS", "", "TONG_HOP!T", "T", t, "Σ TIEN_LUONG", s_items)
    res = [r["cost"] for r in data["tblResourceSummary"]]
    pct = [r["cost"] for r in data["tblAnalysis"] if r["amount_kind"] == "percent"]
    if all(is_num(v) for v in res + pct):
        s_res = sum(res) + sum(pct)
        if abs(s_res - t) > 0.5:
            ck.add("ERROR", "INCONSISTENT_TOTALS", "", "TONG_HOP_VT", "T", t, "Σ TONG_HOP_VT + dòng %", s_res)
