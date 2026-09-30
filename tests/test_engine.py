"""Kiem thu loi tinh tham chieu voi golden_cases.json (ky vong doc lap, khong sua de khop code)."""
import json
import os
import sys
import unittest
from decimal import Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from ta import engine as E  # noqa: E402
from ta.catalog import load_demo_catalog, search  # noqa: E402
from ta.errors import TAError  # noqa: E402
from ta.units import resolve_conversion  # noqa: E402

with open(os.path.join(ROOT, "tests", "golden_cases.json"), encoding="utf-8") as f:
    GOLDEN = {c["id"]: c for c in json.load(f)["cases"]}
with open(os.path.join(ROOT, "data", "demo", "norm_demo.json"), encoding="utf-8") as f:
    NORM_DEMO = json.load(f)


def dec(s):
    return Decimal(s)


class GoldenCases(unittest.TestCase):
    def assertError(self, code, fn, *a, **kw):
        with self.assertRaises(TAError) as cm:
            fn(*a, **kw)
        self.assertEqual(cm.exception.code, code)

    def test_G01_norm_count(self):
        c = GOLDEN["G01"]
        i = c["input"]
        self.assertEqual(E.norm_count(i["q"], i["conversion"], i["norm_basis"]), dec(c["expected"]["norm_count"]))

    def _qty_cost(self, cid):
        c = GOLDEN[cid]
        i = c["input"]
        qty = E.line_quantity(i["norm_count"], i["consumption"], i.get("factor", "1"))
        self.assertEqual(qty, dec(c["expected"]["quantity"]))
        self.assertEqual(E.line_cost(qty, i["price"]), dec(c["expected"]["cost"]))

    def test_G02_VL(self):
        self._qty_cost("G02")

    def test_G03_NC(self):
        self._qty_cost("G03")

    def test_G04_M(self):
        self._qty_cost("G04")

    def test_G05_percent(self):
        c = GOLDEN["G05"]
        self.assertEqual(E.percent_amount(c["input"]["base"], c["input"]["percent"]), dec(c["expected"]["cost"]))

    def test_G06_direct_sum(self):
        c = GOLDEN["G06"]
        self.assertEqual(sum(dec(x) for x in c["input"]["costs"]), dec(c["expected"]["sum"]))

    def test_G07_nc_factor_only(self):
        self._qty_cost("G07")
        prices = {p["resource_id"]: p["unit_price"] for p in NORM_DEMO["prices"]}
        base = E.compute_item(NORM_DEMO, "250", "1", prices)
        adj = E.compute_item(NORM_DEMO, "250", "1", prices, factors={"NC": "1.1"})
        self.assertEqual(adj["group_cost"]["NC"], dec("2200000"))
        self.assertTrue(GOLDEN["G07"]["expected"]["other_groups_unchanged"])
        self.assertEqual(adj["group_cost"]["VL"], base["group_cost"]["VL"])
        self.assertEqual(adj["group_cost"]["M"], base["group_cost"]["M"])

    def test_G08_ton_to_kg(self):
        c = GOLDEN["G08"]
        i = c["input"]
        factor, method = resolve_conversion("t", "kg")
        self.assertEqual(factor, dec(i["conversion"]))
        self.assertEqual(method, "table")
        self.assertEqual(E.norm_count(i["q"], i["conversion"], i["norm_basis"]), dec(c["expected"]["norm_count"]))

    def test_G09_missing_price(self):
        c = GOLDEN["G09"]
        self.assertError(c["expected"]["error"], E.line_cost, "25", c["input"]["price"])
        gate = E.export_gate([{"is_demo": False, "status": "verified"}], missing_prices=1)
        self.assertEqual(gate["official_export"], c["expected"]["official_export"])

    def test_G10_zero_basis(self):
        c = GOLDEN["G10"]
        self.assertError(c["expected"]["error"], E.norm_count, "250", "1", c["input"]["norm_basis"])

    def test_G11_circular_percent(self):
        c = GOLDEN["G11"]
        lines = [{"line_id": "L1", "group": "VL", "amount_kind": "quantity", "amount": "10"},
                 {"line_id": "L4", "group": "VL", "amount_kind": "percent", "amount": "2",
                  "basis_ref": c["input"]["basis_ref"]}]
        self.assertError(c["expected"]["error"], E.resolve_basis, lines, lines[1])

    def test_G12_demo_blocks_official(self):
        c = GOLDEN["G12"]
        gate = E.export_gate([{"is_demo": c["input"]["is_demo"], "status": "verified"}])
        self.assertEqual(gate["official_export"], c["expected"]["official_export"])
        self.assertEqual(gate["draft_allowed"], c["expected"]["draft_allowed"])

    def test_G13_soil_state(self):
        c = GOLDEN["G13"]
        i = c["input"]
        self.assertError(c["expected"]["error"], resolve_conversion, i["from"], i["to"], i["conversion"])

    def test_G14_excel_round(self):
        c = GOLDEN["G14"]
        self.assertEqual(E.excel_round(c["input"]["number"], c["input"]["places"]), dec(c["expected"]["result"]))

    def test_G15_transport_included(self):
        c = GOLDEN["G15"]
        i = c["input"]
        price, warnings = E.effective_price(i["quoted_price"], i["includes_transport"], i["additional_transport"])
        self.assertEqual(price, dec(c["expected"]["effective_price"]))
        self.assertIn(c["expected"]["warning"], warnings)

    def test_G16_catalog_pinned(self):
        c = GOLDEN["G16"]
        plan = E.plan_catalog_update(c["input"]["project_catalog"], c["input"]["installed_catalog"])
        self.assertEqual(plan["project_catalog"], c["expected"]["project_catalog"])
        self.assertEqual(plan["auto_update"], c["expected"]["auto_update"])


class DemoFixture(unittest.TestCase):
    def test_full_demo_item(self):
        prices = {p["resource_id"]: p["unit_price"] for p in NORM_DEMO["prices"]}
        r = E.compute_item(NORM_DEMO, NORM_DEMO["project_quantity"], NORM_DEMO["unit_conversion"], prices)
        exp = NORM_DEMO["expected"]
        self.assertEqual(r["norm_count"], dec(exp["norm_count"]))
        self.assertEqual(r["lines"]["L1"]["cost"], dec(exp["VL_main"]))
        self.assertEqual(r["lines"]["L4"]["cost"], dec(exp["VL_other"]))
        self.assertEqual(r["group_cost"]["NC"], dec(exp["NC"]))
        self.assertEqual(r["group_cost"]["M"], dec(exp["M"]))
        self.assertEqual(r["direct_cost"], dec(exp["direct_cost"]))

    def test_missing_price_is_not_zero(self):
        prices = {p["resource_id"]: p["unit_price"] for p in NORM_DEMO["prices"]}
        prices["DEMO.VL1"] = None
        r = E.compute_item(NORM_DEMO, "250", "1", prices)
        self.assertIsNone(r["direct_cost"])
        self.assertIsNone(r["group_cost"]["VL"])
        self.assertEqual(r["group_cost"]["NC"], dec("2000000"))
        codes = dict(r["errors"])
        self.assertEqual(codes["L1"], "MISSING_PRICE")
        self.assertEqual(codes["L4"], "BASIS_HAS_ERROR")

    def test_percent_not_in_resource_quantity(self):
        prices = {p["resource_id"]: p["unit_price"] for p in NORM_DEMO["prices"]}
        r = E.compute_item(NORM_DEMO, "250", "1", prices)
        self.assertIsNone(r["lines"]["L4"]["quantity"])


class MoreRules(unittest.TestCase):
    def test_parse_localized_no_guess(self):
        self.assertEqual(E.parse_localized("1.250", "vi"), dec("1250"))
        self.assertEqual(E.parse_localized("1,25", "vi"), dec("1.25"))
        self.assertEqual(E.parse_localized("1,250", "en"), dec("1250"))
        with self.assertRaises(TAError):
            E.parse_localized("1.250", None)
        with self.assertRaises(TAError):
            E.parse_localized("12.34.5", "vi")

    def test_strict_decimal(self):
        with self.assertRaises(TAError):
            E.D(0.1)
        with self.assertRaises(TAError):
            E.D("1,5")

    def test_excel_round_negative_and_digits(self):
        self.assertEqual(E.excel_round("-2.5", 0), dec("-3"))
        self.assertEqual(E.excel_round("1.005", 2), dec("1.01"))
        self.assertEqual(E.excel_round("1234567.5", -3), dec("1.235E+6"))

    def test_scales_1_10_100(self):
        for basis, q, exp in (("1", "7", "7"), ("10", "7", "0.7"), ("100", "7", "0.07")):
            self.assertEqual(E.norm_count(q, "1", basis), dec(exp))

    def test_zero_quantity_is_valid(self):
        self.assertEqual(E.norm_count("0", "1", "100"), dec("0"))

    def test_group_basis_token(self):
        lines = [{"line_id": "L1", "group": "VL", "amount_kind": "quantity"},
                 {"line_id": "L2", "group": "VL", "amount_kind": "quantity"},
                 {"line_id": "L3", "group": "NC", "amount_kind": "quantity"},
                 {"line_id": "L5", "group": "VL", "amount_kind": "percent", "basis_ref": ["VL"]}]
        self.assertEqual(E.resolve_basis(lines, lines[3]), ["L1", "L2"])

    def test_percent_on_percent_blocked(self):
        lines = [{"line_id": "L1", "group": "VL", "amount_kind": "quantity"},
                 {"line_id": "L4", "group": "VL", "amount_kind": "percent", "basis_ref": ["L1"]},
                 {"line_id": "L5", "group": "VL", "amount_kind": "percent", "basis_ref": ["L4"]}]
        with self.assertRaises(TAError) as cm:
            E.resolve_basis(lines, lines[2])
        self.assertEqual(cm.exception.code, "PERCENT_ON_PERCENT_UNSUPPORTED")

    def test_units(self):
        self.assertEqual(resolve_conversion("m³", "m3")[0], dec("1"))
        with self.assertRaises(TAError) as cm:
            resolve_conversion("kg", "m3")
        self.assertEqual(cm.exception.code, "UNIT_DIMENSION_MISMATCH")
        with self.assertRaises(TAError) as cm:
            resolve_conversion("m3", "m3_dam_chat")
        self.assertEqual(cm.exception.code, "MISSING_PHYSICAL_CONVERSION")
        self.assertEqual(resolve_conversion("m3_nguyen_tho", "m3_dam_chat", "0.85"), (dec("0.85"), "manual"))

    def test_price_rules(self):
        self.assertEqual(E.effective_price("100000", "no", "10000", "2000")[0], dec("112000"))
        for args, code in ((("0", "yes"), "ZERO_PRICE_UNAPPROVED"), ((None, "yes"), "MISSING_PRICE"),
                           (("100", "no"), "MISSING_TRANSPORT"), (("100", None), "MISSING_TRANSPORT_FLAG")):
            with self.assertRaises(TAError) as cm:
                E.effective_price(*args)
            self.assertEqual(cm.exception.code, code)
        self.assertEqual(E.effective_price("0", "n/a", zero_reason="Cap mien phi", reviewer="QS")[0], dec("0"))

    def test_cost_rules(self):
        rules = [{"rule_id": "C", "rule_type": "percentage_on_basis", "base_refs": "T", "rate": "3.5"},
                 {"rule_id": "TL", "rule_type": "percentage_on_basis", "base_refs": "T;C", "rate": "2.5"},
                 {"rule_id": "G", "rule_type": "sum", "base_refs": "T;C;TL"}]
        v = E.evaluate_cost_rules({"VL": dec("510000"), "NC": dec("2000000"), "M": dec("2500000")}, rules)
        self.assertEqual(v["T"], dec("5010000"))
        self.assertEqual(v["C"], dec("175350"))
        self.assertEqual(v["TL"], dec("129634"))  # (5010000+175350)*2.5% = 129633.75 -> 129634
        self.assertEqual(v["G"], dec("5314984"))
        cyc = [{"rule_id": "A", "rule_type": "sum", "base_refs": "B"},
               {"rule_id": "B", "rule_type": "sum", "base_refs": "A"}]
        with self.assertRaises(TAError) as cm:
            E.order_cost_rules(cyc)
        self.assertEqual(cm.exception.code, "CIRCULAR_RULE")
        with self.assertRaises(TAError) as cm:
            E.order_cost_rules([{"rule_id": "X", "rule_type": "interpolation", "base_refs": "T"}])
        self.assertEqual(cm.exception.code, "UNSUPPORTED_RULE_TYPE")
        missing = E.evaluate_cost_rules({"VL": None, "NC": dec("1"), "M": dec("1")}, rules)
        self.assertIsNone(missing["G"])


class Search(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = load_demo_catalog(os.path.join(ROOT, "data", "demo"))

    def test_exact_code_lists_all_sources_and_revisions(self):
        res = search(self.cat["norms"], "DEMO.001")
        ids = [n["norm_id"] for rank, n in res if rank == 0]
        self.assertEqual(len(ids), 3)
        self.assertIn("DEMO|D01|1|DEMO.001|base", ids)
        self.assertIn("DEMO|D01|2|DEMO.001|base", ids)
        self.assertIn("DEMO-TL|D02|1|DEMO.001|base", ids)

    def test_unaccented_query(self):
        res = search(self.cat["norms"], "khoan phut")
        self.assertEqual([n["code"] for _, n in res], ["DEMO.010"])
        self.assertIn("Khoan phụt", res[0][1]["name"])  # ten goc giu nguyen dau

    def test_accented_query(self):
        res = search(self.cat["norms"], "bê tông")
        self.assertEqual([n["code"] for _, n in res], ["DEMO.020"])

    def test_no_result(self):
        self.assertEqual(search(self.cat["norms"], "khong ton tai xyz"), [])

    def test_prefix_rank(self):
        res = search(self.cat["norms"], "demo.0")
        self.assertTrue(all(rank == 1 for rank, _ in res))

    def test_filter_keeps_notes_available(self):
        res = search(self.cat["norms"], "", {"status": "needs_review"})
        self.assertEqual([n["code"] for _, n in res], ["DEMO.010"])
        notes = [x for x in self.cat["notes"] if x["scope_key"] in (res[0][1]["norm_id"], res[0][1]["chapter"])]
        self.assertEqual(len(notes), 2)


if __name__ == "__main__":
    unittest.main()
