"""Doc hop dong workbook, cong thuc va chuoi giao dien (nguon duy nhat cho Python va VBA)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


def load_schema():
    return _load("contracts/workbook_tables.json")


def load_formulas():
    return _load("src/resources/formulas.json")["formulas"]


def load_strings():
    return _load("src/resources/strings_vi.json")["strings"]


def table_map(schema):
    sheets = {s["name"]: s for s in schema["sheets"]}
    out = {}
    for t in schema["tables"]:
        info = dict(t)
        info["header_row"] = sheets[t["sheet"]]["header_row"]
        info["names"] = [c["name"] for c in t["columns"]]
        out[t["name"]] = info
    return out
