"""Kiem thu tich hop cong thuc Excel: dung file bang openpyxl, tinh lai bang LibreOffice,
so voi loi tham chieu Decimal (ky vong doc lap) va validator.

LibreOffice KHONG thay the nghiem thu tren Excel that; day la kiem tra logic cong thuc.
Bo qua neu may khong co LibreOffice.
"""
import os
import sys
import tempfile
import unittest
from decimal import Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from build_demo import apply_demo_prices, build_demo_project, build_template, demo_catalog  # noqa: E402
from ta import engine as E  # noqa: E402
from ta import lo  # noqa: E402
from ta.project import Project  # noqa: E402
from ta.validate import read_all, validate  # noqa: E402
from ta.xlsx_check import check_file  # noqa: E402

CAT = demo_catalog()
PRICES = {p["resource_id"]: p["quoted_price"] for p in CAT["demo_prices"]}
NORMS = {n["norm_id"]: n for n in CAT["norms"]}
D001 = "DEMO|D01|1|DEMO.001|base"


def scenario_missing_price():
    p = Project(now="T")
    p.insert_item(CAT, D001, "250")
    p.insert_item(CAT, "DEMO|D01|1|DEMO.020|base", "2")
    apply_demo_prices(p, CAT, skip=("P.DEMO.VL1",))
    p.refresh_resource_summary()
    p.refresh_summary()
    return p


def scenario_sorted():
    p, _, _ = build_demo_project(CAT)
    for t in ("tblItems", "tblAnalysis", "tblSnapshotLines", "tblSnapshotNorms", "tblPrices", "tblResourceSummary"):
        p.rows[t].reverse()
    return p


def scenario_faults():
    p = Project(now="T")
    p.insert_item(CAT, D001, None)                                              # IT0001 thieu khoi luong
    p.insert_item(CAT, "DEMO|D01|1|DEMO.040|base", "300", input_unit="m3_nguyen_tho")  # IT0002 doi trang thai dat
    p.insert_item(CAT, D001, "100")                                             # IT0003 % tu tham chieu
    for a in p.rows["tblAnalysis"]:
        if a["item_id"] == "IT0003" and a["amount_kind"] == "percent":
            a["basis_ref"] = a["snapshot_line_id"]
    p.insert_item(CAT, "DEMO|D01|1|DEMO.010|base", "10", allow_review=True)    # IT0004 ma can kiem
    p.insert_item(CAT, D001, "100")                                             # IT0005 quy mo 0 + he so khong log
    for s in p.rows["tblSnapshotNorms"]:
        if s["snapshot_id"] == "SN0005":
            s["norm_basis_qty"] = 0
    for a in p.rows["tblAnalysis"]:
        if a["item_id"] == "IT0005" and a["group"] == "M":
            a["adjustment_factor"] = 1.2
    p.insert_item(CAT, "DEMO|D01|1|DEMO.030|base", "2", input_unit="t", unit_conversion="100")  # IT0006 sai he so
    apply_demo_prices(p, CAT)
    p.set_price("P.DEMO.VL1", transport="10000")                               # da gom VC + nhap cuoc
    p.set_price("P.DEMO.M1", quoted_price="0")                                  # gia 0 khong ly do
    p.refresh_resource_summary()
    p.refresh_summary()
    p.set_cost_rules("BAD", [{"rule_id": "A", "label": "A", "rule_type": "sum", "base_refs": "B"},
                             {"rule_id": "B", "label": "B", "rule_type": "sum", "base_refs": "A"}])
    return p


def scenario_zero_price_ok():
    p = Project(now="T")
    p.insert_item(CAT, D001, "250")
    apply_demo_prices(p, CAT)
    p.set_price("P.DEMO.M1", quoted_price="0", zero_reason="Máy chủ đầu tư cấp", reviewer="QS")
    p.refresh_resource_summary()
    p.refresh_summary()
    return p


@unittest.skipUnless(lo.available(), "Can LibreOffice de tinh lai cong thuc")
class WorkbookFormulas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="ta_wb_")
        cls.demo, cls.it1, cls.it2 = build_demo_project(CAT)
        builders = {"demo": lambda: cls.demo, "missing": scenario_missing_price, "sorted": scenario_sorted,
                    "faults": scenario_faults, "zero_ok": scenario_zero_price_ok, "template": build_template}
        cls.src = {}
        for name, fn in builders.items():
            path = os.path.join(cls.tmp, name + ".xlsx")
            fn().save(path)
            cls.src[name] = path
        outs = lo.recalc_many(list(cls.src.values()), os.path.join(cls.tmp, "out"))
        cls.data = {name: read_all(out) for name, out in zip(cls.src, outs)}
        cls.out = dict(zip(cls.src, outs))

    def items(self, name):
        return {r["item_id"]: r for r in self.data[name]["tblItems"]}

    def summary(self, name):
        return {r["cost_id"]: r["amount"] for r in self.data[name]["tblSummary"]}

    # ---------------------------------------------------------------- DEMO
    def test_demo_item_matches_golden_5010000(self):
        it = self.items("demo")[self.it1]
        self.assertEqual(it["norm_count"], 2.5)
        self.assertEqual(it["cost_VL"], 510000)
        self.assertEqual(it["cost_NC"], 2000000)
        self.assertEqual(it["cost_M"], 2500000)
        self.assertEqual(it["direct_cost"], 5010000)

    def test_all_items_match_reference_engine(self):
        factors = {self.it2: {"NC": "1.1"}}
        for row in self.demo.rows["tblItems"]:
            norm = NORMS[row["norm_id"]]
            conv = str(row["unit_conversion"])
            ref = E.compute_item(norm, str(row["input_quantity"]), conv, PRICES, factors.get(row["item_id"]))
            got = self.items("demo")[row["item_id"]]
            for g in ("VL", "NC", "M"):
                self.assertEqual(Decimal(str(got["cost_" + g])), ref["group_cost"][g], (row["item_id"], g))
            self.assertEqual(Decimal(str(got["direct_cost"])), ref["direct_cost"], row["item_id"])

    def test_same_code_factor_does_not_leak(self):
        items = self.items("demo")
        self.assertEqual(items[self.it2]["cost_NC"], 2200000)
        self.assertEqual(items[self.it1]["cost_NC"], 2000000)
        self.assertEqual(items[self.it2]["cost_VL"], items[self.it1]["cost_VL"])

    def test_summary_matches_reference_rules(self):
        s = self.summary("demo")
        base = {g: Decimal(str(s[g])) for g in ("VL", "NC", "M")}
        rules = [{k: (str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v)
                  for k, v in r.items()} for r in self.demo.rows["tblCostRules"]]
        ref = E.evaluate_cost_rules(base, rules)
        for k, v in ref.items():
            self.assertEqual(Decimal(str(s[k])), v, k)
        self.assertEqual(s["T"], sum(r["direct_cost"] for r in self.data["demo"]["tblItems"]))

    def test_percent_not_counted_in_resource_quantity(self):
        rs = {r["resource_id"]: r for r in self.data["demo"]["tblResourceSummary"]}
        self.assertNotIn("", rs)
        self.assertEqual(rs["DEMO.VL1"]["quantity"], 25 + 25 + 3600)
        pct = sum(r["cost"] for r in self.data["demo"]["tblAnalysis"] if r["amount_kind"] == "percent")
        self.assertEqual(sum(r["cost"] for r in rs.values()) + pct, self.summary("demo")["T"])

    def test_demo_banner_and_validation(self):
        cells = lo.read_cells(self.out["demo"], "TONG_HOP", ["F3", "F4", "F5", "A6"])
        self.assertEqual(cells["F3"], 4)
        self.assertEqual(cells["F4"], 0)
        self.assertIn("DEMO", cells["A6"])
        ck = validate(self.data["demo"])
        self.assertEqual(sorted(set(ck.codes())), ["DEMO_DATA", "PROFILE_NOT_APPROVED"])

    # ---------------------------------------------------------------- thieu gia
    def test_missing_price_propagates_as_error_not_zero(self):
        d = self.data["missing"]
        items = self.items("missing")
        self.assertEqual(items["IT0001"]["cost_VL"], "#N/A")
        self.assertEqual(items["IT0001"]["direct_cost"], "#N/A")
        self.assertEqual(items["IT0001"]["cost_NC"], 2000000)
        self.assertEqual(items["IT0002"]["cost_VL"], "#N/A")  # DEMO.020 dung VL1 va % nhom VL
        s = self.summary("missing")
        self.assertEqual(s["VL"], "#N/A")
        self.assertEqual(s["T"], "#N/A")
        self.assertEqual(s["NC"], 2000000 + 2 * 1.5 * 400000)
        bad = [r for r in d["tblAnalysis"] if r["cost"] == "#N/A"]
        cells = lo.read_cells(self.out["missing"], "TONG_HOP", ["F4", "F5"])
        self.assertEqual(cells["F4"], len(bad))
        ok = sum(r["cost"] for r in d["tblAnalysis"] if isinstance(r["cost"], (int, float)))
        self.assertEqual(cells["F5"], ok)
        ck = validate(d)
        missing = [c for c in ck.items if c["error_code"] == "MISSING_PRICE"]
        self.assertEqual({c["item_id"] for c in missing}, {"IT0001", "IT0002"})
        self.assertNotIn("FORMULA_ERROR", ck.codes())

    # ---------------------------------------------------------------- sap xep
    def test_sort_rows_keeps_relationships(self):
        a, b = self.items("demo"), self.items("sorted")
        for iid in a:
            self.assertEqual(a[iid]["direct_cost"], b[iid]["direct_cost"], iid)
        self.assertEqual(self.summary("demo"), self.summary("sorted"))

    # ---------------------------------------------------------------- loi co chu dich
    def test_fault_scenarios_detected(self):
        d = self.data["faults"]
        items = self.items("faults")
        self.assertEqual(items["IT0001"]["norm_count"], "#N/A")          # thieu khoi luong -> khong phai 0
        self.assertEqual(items["IT0005"]["norm_count"], "#N/A")          # quy mo 0
        self.assertEqual(items["IT0006"]["norm_count"], 200)             # cong thuc tinh, validator bat sai he so
        pct = [r for r in d["tblAnalysis"] if r["item_id"] == "IT0003" and r["amount_kind"] == "percent"][0]
        self.assertEqual(pct["cost"], "#N/A")                           # % tu tham chieu
        prices = {r["price_id"]: r for r in d["tblPrices"]}
        self.assertEqual(prices["P.DEMO.VL1"]["effective_price"], 20000)  # khong cong cuoc lan 2
        self.assertEqual(prices["P.DEMO.M1"]["effective_price"], "#N/A")  # gia 0 chua duyet
        ck = validate(d)
        by = {}
        for c in ck.items:
            by.setdefault(c["error_code"], set()).add(c["item_id"])
        self.assertIn("IT0001", by["MISSING_QUANTITY"])
        self.assertIn("IT0002", by["MISSING_PHYSICAL_CONVERSION"])
        self.assertIn("IT0003", by["CIRCULAR_BASIS"])
        self.assertIn("IT0004", by["NORM_NOT_VERIFIED"])
        self.assertIn("IT0005", by["FACTOR_WITHOUT_LOG"])
        self.assertIn("IT0006", by["CONVERSION_CONFLICT"])
        for code in ("DUPLICATE_TRANSPORT", "ZERO_PRICE_UNAPPROVED", "RULES_INVALID", "MISSING_PRICE"):
            self.assertIn(code, by)
        self.assertNotIn("IT0002", by.get("GROUP_STATUS_UNKNOWN", set()))

    def test_zero_price_with_reason_is_valid(self):
        items = self.items("zero_ok")
        self.assertEqual(items["IT0001"]["cost_M"], 0)
        self.assertEqual(items["IT0001"]["direct_cost"], 2510000)
        self.assertNotIn("ZERO_PRICE_UNAPPROVED", validate(self.data["zero_ok"]).codes())

    # ---------------------------------------------------------------- doc lap
    def test_files_are_self_contained(self):
        for name, path in self.src.items():
            r = check_file(path)
            self.assertEqual(r["problems"], [], name)
            self.assertGreater(r["formulas"], 0, name)

    def test_template_empty_is_clean(self):
        d = self.data["template"]
        self.assertEqual(d["tblItems"], [])
        self.assertEqual(len(d["tblProject"]), 14)
        self.assertEqual([r["cost_id"] for r in d["tblSummary"]], ["VL", "NC", "M", "T"])
        self.assertEqual([r["amount"] for r in d["tblSummary"]], [0, 0, 0, 0])


class SelfContainedDetector(unittest.TestCase):
    def test_detects_udf_and_external_link(self):
        from openpyxl import Workbook
        path = os.path.join(tempfile.mkdtemp(), "bad.xlsx")
        wb = Workbook()
        wb.active["A1"] = "=MYUDF(1)"
        wb.active["A2"] = "=[1]Sheet1!A1"
        wb.active["A3"] = '="text MYUDF(1) inside string"'
        wb.save(path)
        kinds = [p[0] for p in check_file(path)["problems"]]
        self.assertEqual(kinds.count("FUNCTION_NOT_ALLOWED"), 1)
        self.assertEqual(kinds.count("EXTERNAL_REF"), 1)


if __name__ == "__main__":
    unittest.main()
