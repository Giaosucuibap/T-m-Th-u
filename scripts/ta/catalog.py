"""Doc bo DEMO, kiem tra toan ven va tim kiem (tham chieu cho modCatalog VBA)."""
import json
import os

from .errors import TAError
from .textnorm import fold

NORM_FIELDS = ["norm_id", "namespace", "document_id", "revision", "code", "variant_id",
               "appendix", "chapter", "group_name", "name", "base_unit", "source_unit_text",
               "norm_basis_qty", "status", "is_demo", "vl_status", "nc_status", "m_status",
               "conditions", "source_ref"]


def _norm_from_fixture(fx):
    """Chuyen data/demo/norm_demo.json (fixture golden) sang dang norm cua catalog."""
    parts = fx["norm_id"].split("|")
    return {
        "norm_id": fx["norm_id"], "namespace": parts[0], "document_id": fx["document_id"],
        "revision": fx["revision"], "code": fx["code"], "variant_id": parts[4],
        "appendix": "DEMO", "chapter": "Chương DEMO 1", "group_name": "Nhóm DEMO",
        "name": "[DEMO] " + fx["name"], "base_unit": fx["base_unit"],
        "source_unit_text": fx["source_unit_text"], "norm_basis_qty": fx["norm_basis_qty"],
        "status": fx["test_status"], "conditions": fx.get("warning", ""),
        "consumptions": fx["consumptions"],
    }


def load_demo_catalog(demo_dir):
    with open(os.path.join(demo_dir, "catalog_demo.json"), encoding="utf-8") as f:
        cat = json.load(f)
    with open(os.path.join(demo_dir, cat["include_norm_fixture"]), encoding="utf-8") as f:
        fixture = json.load(f)
    norms = [_norm_from_fixture(fixture)] + cat["norms"]
    for n in norms:
        n["is_demo"] = True
        gs = n.get("group_status", {})
        for g in ("VL", "NC", "M"):
            has = any(c["group"] == g for c in n["consumptions"])
            key = g.lower() + "_status"
            n[key] = "present" if has else gs.get(g, "unknown")
        n.setdefault("source_ref", "DEMO")
        n.setdefault("variant_id", "base")
    cat["norms"] = norms
    validate_catalog(cat)
    return cat


def validate_catalog(cat):
    """Kiem tra khoa trung, tai nguyen thieu, dong % thieu co so, nhom thieu. Tra ve list loi."""
    problems = []
    seen = set()
    res_ids = {r["resource_id"] for r in cat["resources"]}
    for n in cat["norms"]:
        if n["norm_id"] in seen:
            problems.append(("DUPLICATE_NORM_ID", n["norm_id"]))
        seen.add(n["norm_id"])
        expected = "|".join([n["namespace"], n["norm_id"].split("|")[1], n["revision"], n["code"], n["variant_id"]])
        if expected != n["norm_id"]:
            problems.append(("NORM_ID_MISMATCH", n["norm_id"]))
        if float(n["norm_basis_qty"]) <= 0:
            problems.append(("INVALID_NORM_BASIS", n["norm_id"]))
        line_ids = set()
        for c in n["consumptions"]:
            if c["line_id"] in line_ids:
                problems.append(("DUPLICATE_LINE_ID", n["norm_id"] + ":" + c["line_id"]))
            line_ids.add(c["line_id"])
            if c["amount_kind"] == "quantity" and c["resource_id"] not in res_ids:
                problems.append(("MISSING_RESOURCE", n["norm_id"] + ":" + c["line_id"]))
            if c["amount_kind"] == "percent" and not c.get("basis_ref"):
                problems.append(("PERCENT_WITHOUT_BASIS", n["norm_id"] + ":" + c["line_id"]))
        for g in ("vl_status", "nc_status", "m_status"):
            if n[g] == "unknown":
                problems.append(("GROUP_STATUS_UNKNOWN", n["norm_id"] + ":" + g))
    if problems:
        raise TAError("CATALOG_INVALID", "; ".join("%s %s" % p for p in problems), problems=problems)
    return problems


def search(norms, query, filters=None, limit=200):
    """Xep hang: 0 = trung ma hoan toan, 1 = tien to ma, 2 = moi tu khoa co trong ma/ten.

    Bo dau chi dung de so khop; ket qua tra ve ten goc. Hai ma cung chuoi khac bo deu xuat hien.
    """
    filters = filters or {}
    q = fold(query)
    tokens = q.split()
    results = []
    for n in norms:
        if any(str(n.get(k)) != str(v) for k, v in filters.items() if v not in (None, "")):
            continue
        code = fold(n["code"])
        hay = code + " " + fold(n["name"]) + " " + fold(n.get("group_name", ""))
        if not tokens:
            rank = 3
        elif q == code:
            rank = 0
        elif code.startswith(q):
            rank = 1
        elif all(t in hay for t in tokens):
            rank = 2
        else:
            continue
        results.append((rank, n["code"], n["namespace"], n["revision"], n))
    results.sort(key=lambda r: (r[0], r[1], r[2], r[3]))
    return [(r[0], r[4]) for r in results[:limit]]
