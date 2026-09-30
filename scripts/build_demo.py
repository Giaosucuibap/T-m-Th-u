"""Tao bo file DEMO: Catalog_DEMO.xlsx, TA_Template.xltx, Cong_trinh_DEMO.xlsx.

Chay:  python scripts/build_demo.py --out samples/demo
Can: Python 3.10+, openpyxl. Chi dung o may phat trien; nguoi dung cuoi khong can Python.
"""
import argparse
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ta import cache, lo  # noqa: E402
from ta.catalog import load_demo_catalog  # noqa: E402
from ta.catalog_xlsx import write_catalog  # noqa: E402
from ta.project import Project  # noqa: E402
from ta.schema import ROOT  # noqa: E402
from ta.validate import read_all, validate  # noqa: E402

FIXED_TIME = "2026-09-30T00:00:00"


def demo_catalog():
    return load_demo_catalog(os.path.join(ROOT, "data", "demo"))


def apply_demo_prices(p, cat, skip=()):
    for dp in cat["demo_prices"]:
        if dp["price_id"] in skip or not any(x["price_id"] == dp["price_id"] for x in p.rows["tblPrices"]):
            continue
        p.set_price(dp["price_id"], quoted_price=dp["quoted_price"], tax_basis=dp["tax_basis"],
                    includes_transport=dp["includes_transport"], transport=dp.get("transport"),
                    locality="DEMO", price_date="DEMO", source_ref="Giá giả lập DEMO – không phải giá công bố")


def build_demo_project(cat, now=FIXED_TIME):
    """Cong trinh DEMO dung cho nguoi dung xem thu va cho kiem thu tu dong."""
    p = Project(now=now)
    p.set_project("project_name", "[DEMO] Công trình thử – số liệu giả lập")
    p.set_project("locality", "DEMO")
    p.set_project("price_period", "DEMO")
    p.set_project("prepared_by", "TA Estimate build")
    it1 = p.insert_item(cat, "DEMO|D01|1|DEMO.001|base", "250", group_id="HM1")
    it2 = p.insert_item(cat, "DEMO|D01|1|DEMO.001|base", "250", group_id="HM1")
    p.insert_item(cat, "DEMO|D01|1|DEMO.020|base", "12", group_id="HM1")
    p.insert_item(cat, "DEMO|D01|1|DEMO.030|base", "1.2", input_unit="t", unit_conversion="1000",
                  conversion_basis="Đổi tấn sang kg theo bảng đơn vị (1 t = 1000 kg)", group_id="HM2")
    p.apply_factor(it2, "NC", "1.1", "[DEMO] Thử hệ số NC riêng cho một dòng cùng mã", "DEMO")
    apply_demo_prices(p, cat)
    prof = cat["demo_cost_profile"]
    p.set_cost_rules(prof["profile_id"], prof["rules"], status="demo",
                     source_ref="DEMO – không có căn cứ pháp lý")
    p.refresh_resource_summary()
    p.refresh_summary()
    return p, it1, it2


def build_template(now=FIXED_TIME):
    p = Project(now=now)
    p.refresh_summary()  # san dong VL, NC, M, T nhu add-in (modWorkbook.BuildProjectStructure)
    return p


def write_checks(p, checks):
    p.rows["tblChecks"] = []
    for i, c in enumerate(checks.items, start=1):
        p.add_row("tblChecks", dict(c, check_id=i, status="open"))


def save_with_values(p, path, template=False):
    """Luu file; neu co LibreOffice thi tinh lai, ghi KIEM_TRA va gia tri cache vao o cong thuc."""
    if not lo.available():
        print("CANH BAO: khong co LibreOffice - file khong co gia tri cache va KIEM_TRA trong.")
        return p.save(path, template=template)
    tmp = tempfile.mkdtemp(prefix="ta_build_")
    ext = os.path.splitext(path)[1]
    raw = os.path.join(tmp, "raw" + ext)
    p.save(raw, template=template)
    if p.rows["tblItems"]:
        write_checks(p, validate(read_all(lo.recalc(raw, os.path.join(tmp, "v1")))))
        p.save(raw, template=template)
    values = lo.recalc(raw, os.path.join(tmp, "v2"))
    n = cache.inject(raw, values, path)
    shutil.rmtree(tmp, ignore_errors=True)
    print("Da tao %s (%d o cong thuc co gia tri cache)" % (path, n))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    cat = demo_catalog()
    write_catalog(cat, os.path.join(args.out, "Catalog_DEMO.xlsx"), FIXED_TIME)
    print("Da tao", os.path.join(args.out, "Catalog_DEMO.xlsx"))
    save_with_values(build_template(), os.path.join(args.out, "TA_Template.xltx"), template=True)
    p, _, _ = build_demo_project(cat)
    save_with_values(p, os.path.join(args.out, "Cong_trinh_DEMO.xlsx"))


if __name__ == "__main__":
    main()
