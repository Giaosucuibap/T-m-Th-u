"""Kiem thu cong cu: ma VBA sinh tu dong khop nguon, lint VBA sach, Ribbon hop le,
khoa chuoi giao dien day du, thuat toan bo dau VBA khop Python, bien dich thu bang LibreOffice Basic."""
import glob
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

from lxml import etree
from openpyxl import Workbook

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from ta.catalog import load_demo_catalog  # noqa: E402
from ta.schema import load_strings  # noqa: E402
from ta.textnorm import fold  # noqa: E402

SRC = os.path.join(ROOT, "src", "vba")
VBA_FILES = sorted(glob.glob(os.path.join(SRC, "*.bas")) + glob.glob(os.path.join(SRC, "*.cls"))
                   + glob.glob(os.path.join(SRC, "forms", "*.vba")))


def vba_text():
    out = {}
    for p in VBA_FILES:
        with open(p, encoding="ascii") as f:
            out[p] = f.read()
    return out


class GeneratedModules(unittest.TestCase):
    def test_generated_modules_up_to_date(self):
        tmp = tempfile.mkdtemp()
        env = dict(os.environ, TA_VBA_OUT=tmp)
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "gen_vba.py")], check=True, env=env,
                       capture_output=True)
        made = sorted(os.listdir(tmp))
        self.assertIn("modRes.bas", made)
        for name in made:
            with open(os.path.join(tmp, name), "rb") as a, open(os.path.join(SRC, name), "rb") as b:
                self.assertEqual(a.read(), b.read(), "%s cu - chay python scripts/gen_vba.py" % name)
        shutil.rmtree(tmp)

    def test_lint_clean(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "lint_vba.py")], capture_output=True,
                           text=True)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_vba_fold_matches_python(self):
        """Mo phong FoldVi (modText) voi bang FoldPairs lay tu modRes.bas da sinh."""
        with open(os.path.join(SRC, "modRes.bas"), encoding="ascii") as f:
            text = f.read()
        body = text[text.index("Private Function FoldPairs"):text.index("FoldPairs = s")]
        pairs = "".join(re.findall(r'"([^"]*)"', body))
        table = {int(pairs[i:i + 4], 16): pairs[i + 4] for i in range(0, len(pairs), 5)}

        def vba_fold(s):
            buf, pending = "", False
            for ch in s:
                code = ord(ch)
                if code < 128:
                    c = ch.lower()
                    rep = c if (c.isalnum() or c == ".") else ""
                else:
                    rep = table.get(code, "")
                if not rep:
                    if buf:
                        pending = True
                else:
                    if pending:
                        buf += " "
                        pending = False
                    buf += rep
            return buf

        cat = load_demo_catalog(os.path.join(ROOT, "data", "demo"))
        samples = [n["name"] for n in cat["norms"]] + [n["text"] for n in cat["notes"]] + list(load_strings().values())
        samples += ["Bê tông cốt thép M250", "ĐÀO ĐẤT CẤP III", "Khoan phụt vữa XM", "  100 m³  ", "Ưỡn Ờ ỹ"]
        for s in samples:
            self.assertEqual(vba_fold(s), fold(s), s)


class RibbonAndStrings(unittest.TestCase):
    def test_ribbon_xml_and_callbacks(self):
        tree = etree.parse(os.path.join(ROOT, "src", "ribbon", "customUI14.xml"))
        ns = {"c": "http://schemas.microsoft.com/office/2009/07/customui"}
        buttons = tree.findall(".//c:button", ns)
        self.assertGreater(len(buttons), 5)
        with open(os.path.join(SRC, "modEntry.bas"), encoding="ascii") as f:
            entry = f.read()
        for b in buttons:
            self.assertEqual(b.get("onAction"), "TA_RibbonAction")
            self.assertIn('Case "%s"' % b.get("id"), entry, b.get("id"))
        self.assertIn("Public Sub TA_RibbonAction(control As IRibbonControl)", entry)

    def test_ribbon_injection(self):
        spec = importlib.util.spec_from_file_location("inject_ribbon", os.path.join(ROOT, "scripts", "inject_ribbon.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        path = os.path.join(tempfile.mkdtemp(), "t.xlsx")
        Workbook().save(path)
        mod.inject(path)
        mod.inject(path)  # chay lai khong nhan doi quan he
        with zipfile.ZipFile(path) as z:
            self.assertIn("customUI/customUI14.xml", z.namelist())
            rels = etree.fromstring(z.read("_rels/.rels"))
            targets = [r.get("Target") for r in rels]
            self.assertEqual(targets.count("customUI/customUI14.xml"), 1)

    def test_every_string_key_exists(self):
        strings = load_strings()
        keys = set()
        for text in vba_text().values():
            keys |= set(re.findall(r'\bTR\("([^"]+)"\)', text))
            keys |= set("chk." + c for c in re.findall(r'AddCheck\s+"[A-Z]+",\s+"([A-Z_]+)"', text))
        keys |= set("summary." + g for g in ("VL", "NC", "M"))
        missing = sorted(k for k in keys if k not in strings)
        self.assertEqual(missing, [])
        with open(os.path.join(ROOT, "scripts", "ta", "validate.py"), encoding="utf-8") as f:
            py = f.read()
        py_codes = set(re.findall(r'ck\.add\("[A-Z]+", "([A-Z_]+)"', py))
        all_vba = "".join(vba_text().values())
        vba_codes = set(re.findall(r'AddCheck\s+"[A-Z]+",\s+"([A-Z_]+)"', all_vba))
        # ma loi tra ve dong tu modCalc.PercentBasisError / modUnits.ResolveConversion roi AddCheck errCode
        vba_codes |= set(re.findall(r'(?:PercentBasisError|errCode) = "([A-Z_]+)"', all_vba))
        self.assertEqual(sorted(k for k in vba_codes if "chk." + k not in strings and k not in
                                ("MISSING_CONVERSION", "INVALID_NORM_BASIS", "MISSING_TRANSPORT",
                                 "MISSING_TRANSPORT_FLAG")), [])
        self.assertEqual(sorted(k for k in py_codes if "chk." + k not in strings), [])
        # Bo kiem tra VBA phai co cac ma loi cua ban Python (tru ma sinh dong trong _check_units)
        self.assertEqual(sorted(py_codes - vba_codes - {"UNKNOWN_UNIT"}), [])

    def test_build_script_ascii(self):
        for p in (os.path.join(ROOT, "scripts", "build_addin.ps1"),):
            with open(p, "rb") as f:
                f.read().decode("ascii")


@unittest.skipUnless(shutil.which("soffice") and importlib.util.find_spec("uno"), "Can LibreOffice + python3-uno")
class LibreOfficeBasicCompile(unittest.TestCase):
    def test_modules_compile_in_libreoffice_basic(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "check_vba_lo.py")], capture_output=True,
                           text=True, timeout=600)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
