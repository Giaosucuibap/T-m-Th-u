"""Sinh cac module VBA tu nguon JSON (nguon duy nhat cho Python va VBA).

  modRes.bas      chuoi tieng Viet (ma hoa \\uXXXX, giai ma bang ChrW), bang bo dau
  modSchema.bas   sheet, bang, cot, nhan, dinh dang, khoa THONG_TIN, danh sach chon
  modFormulas.bas cong thuc Excel chuan
  modUnitsData.bas bang don vi (tu scripts/ta/units.py)
  modGolden.bas   golden cases (tests/golden_cases.json) cho TA_SelfTest
  modFormCode.bas ma cua frmSearch (tu src/vba/forms/frmSearch.code.vba) cho buoc build form

Chay: python scripts/gen_vba.py  (ghi vao src/vba, dong CRLF, chi ky tu ASCII)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ta import units  # noqa: E402
from ta.schema import ROOT, load_formulas, load_schema, load_strings  # noqa: E402
from ta.textnorm import vietnamese_fold_table  # noqa: E402

OUT = os.environ.get("TA_VBA_OUT") or os.path.join(ROOT, "src", "vba")
FORM_SRC = os.path.join(ROOT, "src", "vba", "forms", "frmSearch.code.vba")
CHUNK = 180
HEADER = "' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.\r\n"


def esc(text):
    """Chuoi Unicode -> chuoi ASCII voi \\uXXXX cho ky tu ngoai ASCII va dau \\ ."""
    out = []
    for ch in str(text):
        cp = ord(ch)
        if ch == "\\":
            out.append("\\u005C")
        elif 32 <= cp < 127:
            out.append(ch)
        else:
            out.append("\\u%04X" % cp)
    return "".join(out)


def lit(text):
    """Literal VBA (ASCII) cho chuoi da escape."""
    return '"' + text.replace('"', '""') + '"'


def chunked_assign(var, text, indent="    "):
    """Gan chuoi dai qua nhieu cau lenh de tranh gioi han do dai dong va so dong noi cua VBE."""
    lines = []
    parts = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)] or [""]
    lines.append("%s%s = %s" % (indent, var, lit(parts[0])))
    for p in parts[1:]:
        lines.append("%s%s = %s & %s" % (indent, var, var, lit(p)))
    return lines


def module(name, body_lines):
    text = 'Attribute VB_Name = "%s"\r\n' % name + HEADER + "Option Explicit\r\n\r\n" + "\r\n".join(body_lines) + "\r\n"
    text.encode("ascii")  # bao dam chi ASCII
    for ln in text.split("\r\n"):
        if len(ln) > 1000:
            raise ValueError("Dong qua dai trong %s: %d" % (name, len(ln)))
    with open(os.path.join(OUT, name + ".bas"), "w", encoding="ascii", newline="") as f:
        f.write(text)
    return name


def gen_res():
    strings = load_strings()
    body = ["Private mKeys As Collection", "Private mFold() As String", "Private mFoldReady As Boolean", "",
            "' Tra ve chuoi giao dien tieng Viet theo khoa (xem src/resources/strings_vi.json).",
            "Public Function TR(ByVal key As String) As String",
            "    If mKeys Is Nothing Then LoadStrings",
            "    On Error GoTo Missing",
            "    TR = mKeys(key)",
            "    Exit Function",
            "Missing:",
            "    TR = \"[\" & key & \"]\"",
            "End Function", "",
            "Public Function HasTR(ByVal key As String) As Boolean",
            "    Dim s As String",
            "    If mKeys Is Nothing Then LoadStrings",
            "    On Error GoTo Missing",
            "    s = mKeys(key)",
            "    HasTR = True",
            "    Exit Function",
            "Missing:",
            "    HasTR = False",
            "End Function", "",
            "' Giai ma \\uXXXX thanh ky tu Unicode.",
            "Public Function U(ByVal s As String) As String",
            "    Dim i As Long, n As Long, out As String, ch As String",
            "    n = Len(s)",
            "    i = 1",
            "    Do While i <= n",
            "        ch = Mid$(s, i, 1)",
            "        If ch = \"\\\" And i + 5 <= n Then",
            "            If Mid$(s, i + 1, 1) = \"u\" Then",
            "                out = out & ChrW$(CLng(\"&H\" & Mid$(s, i + 2, 4)))",
            "                i = i + 6",
            "            Else",
            "                out = out & ch",
            "                i = i + 1",
            "            End If",
            "        Else",
            "            out = out & ch",
            "            i = i + 1",
            "        End If",
            "    Loop",
            "    U = out",
            "End Function", "",
            "Private Sub AddS(ByVal key As String, ByVal escaped As String)",
            "    mKeys.Add U(escaped), key",
            "End Sub", "",
            "Private Sub LoadStrings()",
            "    Dim s As String",
            "    Set mKeys = New Collection"]
    for k, v in strings.items():
        e = esc(v)
        if len(e) <= CHUNK:
            body.append("    AddS %s, %s" % (lit(k), lit(e)))
        else:
            body += chunked_assign("s", e)
            body.append("    AddS %s, s" % lit(k))
    body += ["End Sub", ""]
    pairs = "".join("%04X%s" % (cp, rep) for cp, rep in vietnamese_fold_table())
    body += ["' Bang bo dau: moi cap = 4 ky tu hex ma Unicode + 1 ky tu ASCII thay the.",
             "Private Function FoldPairs() As String", "    Dim s As String"]
    body += chunked_assign("s", pairs)
    body += ["    FoldPairs = s", "End Function", "",
             "' Tra ky tu thay the cho ma Unicode (\"\" neu khong co trong bang).",
             "Public Function FoldChar(ByVal code As Long) As String",
             "    Dim p As String, i As Long",
             "    If Not mFoldReady Then",
             "        ReDim mFold(0 To &H1EFF)",
             "        p = FoldPairs()",
             "        For i = 1 To Len(p) Step 5",
             "            mFold(CLng(\"&H\" & Mid$(p, i, 4))) = Mid$(p, i + 4, 1)",
             "        Next i",
             "        mFoldReady = True",
             "    End If",
             "    If code >= 0 And code <= &H1EFF Then FoldChar = mFold(code)",
             "End Function"]
    return module("modRes", body)


def gen_schema():
    schema = load_schema()
    sheets = schema["sheets"]
    tables = schema["tables"]
    b = ["Public Const TA_SCHEMA_VERSION As String = %s" % lit(schema["schema_version"]),
         "Public Const TA_CODE_VERSION As String = %s" % lit(next(k["value"] for k in schema["project_keys"]
                                                                  if k["key"] == "code_version")), ""]
    b += ["Public Function SheetNames() As Variant",
          "    SheetNames = Array(%s)" % ", ".join(lit(s["name"]) for s in sheets), "End Function", "",
          "Public Function TableNames() As Variant",
          "    TableNames = Array(%s)" % ", ".join(lit(t["name"]) for t in tables), "End Function", ""]
    b += ["Public Function SheetTitle(ByVal sheetName As String) As String", "    Select Case sheetName"]
    for s in sheets:
        b += ["    Case %s: SheetTitle = U(%s)" % (lit(s["name"]), lit(esc(s["title"])))]
    b += ["    End Select", "End Function", "",
          "Public Function SheetHeaderRow(ByVal sheetName As String) As Long", "    Select Case sheetName"]
    for s in sheets:
        b += ["    Case %s: SheetHeaderRow = %d" % (lit(s["name"]), s["header_row"])]
    b += ["    End Select", "End Function", "",
          "Public Function TableSheet(ByVal tableName As String) As String", "    Select Case tableName"]
    for t in tables:
        b += ["    Case %s: TableSheet = %s" % (lit(t["name"]), lit(t["sheet"]))]
    b += ["    End Select", "End Function", "",
          "Public Function TableFirstCol(ByVal tableName As String) As Long", "    Select Case tableName"]
    for t in tables:
        b += ["    Case %s: TableFirstCol = %d" % (lit(t["name"]), t["first_col"])]
    b += ["    End Select", "End Function", ""]
    # cot: ten | kind | format | width | caption(escaped)
    b += ["' Moi phan tu: ten|kind|format|width|caption (caption da escape \\uXXXX).",
          "Public Function TableColumnSpecs(ByVal tableName As String) As Variant",
          "    Select Case tableName"]
    for t in tables:
        specs = ["%s|%s|%s|%s|%s" % (c["name"], c["kind"], c.get("format", ""), c.get("width", 12), esc(c["caption"]))
                 for c in t["columns"]]
        b.append("    Case %s" % lit(t["name"]))
        b.append("        TableColumnSpecs = Array( _")
        for i, sp in enumerate(specs):
            b.append("            %s%s" % (lit(sp), ", _" if i < len(specs) - 1 else ")"))
    b += ["    End Select", "End Function", "",
          "Public Function TableColumns(ByVal tableName As String) As Variant",
          "    Dim specs As Variant, out() As String, i As Long",
          "    specs = TableColumnSpecs(tableName)",
          "    ReDim out(LBound(specs) To UBound(specs))",
          "    For i = LBound(specs) To UBound(specs)",
          "        out(i) = Split(specs(i), \"|\")(0)",
          "    Next i",
          "    TableColumns = out",
          "End Function", ""]
    pk = schema["project_keys"]
    b += ["' Khoa THONG_TIN: key|label(escaped)|gia tri mac dinh|kieu (s/n)",
          "Public Function ProjectKeySpecs() As Variant", "    ProjectKeySpecs = Array( _"]
    for i, k in enumerate(pk):
        kind = "n" if isinstance(k["value"], (int, float)) else "s"
        b.append("        %s%s" % (lit("%s|%s|%s|%s" % (k["key"], esc(k["label"]), k["value"], kind)),
                                   ", _" if i < len(pk) - 1 else ")"))
    b += ["End Function", "", "Public Function DefinedNameSpecs() As Variant", "    DefinedNameSpecs = Array( _"]
    dn = list(schema["defined_names"].items())
    for i, (n, expr) in enumerate(dn):
        b.append("        %s%s" % (lit(n + "|" + expr), ", _" if i < len(dn) - 1 else ")"))
    b += ["End Function", "", "Public Function ListValues(ByVal listName As String) As String", "    Select Case listName"]
    for n, vals in schema["lists"].items():
        b.append("    Case %s: ListValues = %s" % (lit(n), lit(",".join(vals))))
    b += ["    End Select", "End Function", ""]
    with open(os.path.join(ROOT, "contracts", "catalog_tables.json"), encoding="utf-8") as f:
        cat = json.load(f)
    b += ["Public Function CatalogTableNames() As Variant",
          "    CatalogTableNames = Array(%s)" % ", ".join(lit(t["name"]) for t in cat["tables"]),
          "End Function", "",
          "Public Function CatalogColumns(ByVal tableName As String) As Variant", "    Select Case tableName"]
    for t in cat["tables"]:
        b.append("    Case %s: CatalogColumns = Array(%s)" % (lit(t["name"]), ", ".join(lit(c) for c in t["columns"])))
    b += ["    End Select", "End Function"]
    return module("modSchema", b)


def gen_formulas():
    formulas = load_formulas()
    b = ["' Cong thuc Excel chuan cho cot kind=formula (khoa: bang.cot) va cac mau tong hop.",
         "Public Function FormulaFor(ByVal key As String) As String",
         "    Dim s As String",
         "    Select Case key"]
    for k, f in formulas.items():
        f.encode("ascii")
        b.append("    Case %s" % lit(k))
        b += chunked_assign("s", f, "        ")
    b += ["    Case Else",
          "        Err.Raise vbObjectError + 700, \"FormulaFor\", \"Khong co cong thuc cho khoa \" & key",
          "    End Select",
          "    FormulaFor = s",
          "End Function", "",
          "Public Function HasFormula(ByVal key As String) As Boolean",
          "    Select Case key",
          "    Case %s" % ", ".join(lit(k) for k in formulas),
          "        HasFormula = True",
          "    End Select",
          "End Function"]
    return module("modFormulas", b)


def gen_units():
    alias = ";".join("%s=%s" % (esc(k), v) for k, v in sorted(units.ALIASES.items()))
    dims = ";".join("%s=%s:%s" % (k, d, str(f)) for k, (d, f) in sorted(units.DIMENSIONS.items()))
    b = ["' Bang don vi sinh tu scripts/ta/units.py. alias=chuan ; chuan=dai_luong:he_so_ve_goc",
         "Public Function UnitAliasData() As String", "    Dim s As String"]
    b += chunked_assign("s", alias)
    b += ["    UnitAliasData = s", "End Function", "",
          "Public Function UnitDimensionData() As String", "    Dim s As String"]
    b += chunked_assign("s", dims)
    b += ["    UnitDimensionData = s", "End Function", "",
          "Public Function StatefulUnits() As String",
          "    StatefulUnits = %s" % lit(";" + ";".join(sorted(units.STATEFUL)) + ";"),
          "End Function"]
    return module("modUnitsData", b)


def flatten(prefix, value, out):
    if isinstance(value, dict):
        for k, v in value.items():
            flatten(prefix + "." + k, v, out)
    elif isinstance(value, list):
        out[prefix] = ";".join(str(x) for x in value)
    elif value is None:
        out[prefix] = None
    elif isinstance(value, bool):
        out[prefix] = "true" if value else "false"
    else:
        out[prefix] = str(value)


def gen_golden():
    with open(os.path.join(ROOT, "tests", "golden_cases.json"), encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    with open(os.path.join(ROOT, "data", "demo", "norm_demo.json"), encoding="utf-8") as f:
        demo = json.load(f)
    flat = {}
    for c in cases:
        flatten(c["id"] + ".input", c["input"], flat)
        flatten(c["id"] + ".expected", c["expected"], flat)
    flatten("demo.expected", demo["expected"], flat)
    flatten("demo.project_quantity", demo["project_quantity"], flat)
    flatten("demo.norm_id", demo["norm_id"], flat)
    for p in demo["prices"]:
        flatten("demo.price." + p["resource_id"], p["unit_price"], flat)
    b = ["' Golden cases (tests/golden_cases.json). Null = gia tri null trong JSON.",
         "Public Function GoldenIds() As Variant",
         "    GoldenIds = Array(%s)" % ", ".join(lit(c["id"]) for c in cases), "End Function", "",
         "Public Function GoldenName(ByVal id As String) As String", "    Select Case id"]
    for c in cases:
        b.append("    Case %s: GoldenName = U(%s)" % (lit(c["id"]), lit(esc(c["name"]))))
    b += ["    End Select", "End Function", "",
          "Public Function Golden(ByVal path As String) As Variant", "    Select Case path"]
    for k, v in flat.items():
        b.append("    Case %s: Golden = %s" % (lit(k), "Null" if v is None else lit(esc(v))))
    b += ["    Case Else: Err.Raise vbObjectError + 701, \"Golden\", \"Khong co \" & path",
          "    End Select", "End Function"]
    return module("modGolden", b)


def vba_value(v):
    if v is None:
        return "Empty"
    if isinstance(v, bool):
        return "True" if v else "False"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    return "U(%s)" % lit(esc(v))


def gen_demo_data():
    """Nhung bo catalog DEMO (giong het Catalog_DEMO.xlsx) de TA_SelfTest khong can file ngoai."""
    from ta.catalog import load_demo_catalog
    from ta.catalog_xlsx import catalog_rows, load_catalog_contract
    cat = load_demo_catalog(os.path.join(ROOT, "data", "demo"))
    data = catalog_rows(cat, "2026-09-30T00:00:00")
    contract = load_catalog_contract()
    b = ["' Bo catalog DEMO nhung san (sinh tu data/demo). Moi bang: mang 2 chieu, dong 1 la tieu de.",
         "' Moi bang mot ham rieng de khong vuot gioi han kich thuoc thu tuc cua VBA.",
         "Public Function DemoCatalogTable(ByVal tableName As String) As Variant",
         "    Select Case tableName"]
    for t in contract["tables"]:
        b.append("    Case %s: DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_%s())" % (lit(t["name"]), t["name"]))
    b += ["    End Select", "End Function", ""]
    for t in contract["tables"]:
        b += ["Private Function Demo_%s() As Collection" % t["name"],
              "    Dim rows As New Collection, r As Variant"]
        for row in data[t["name"]]:
            vals = [vba_value(row.get(c)) for c in t["columns"]]
            b.append("    r = Array( _")
            for i, v in enumerate(vals):
                b.append("        %s%s" % (v, ", _" if i < len(vals) - 1 else ")"))
            b.append("    rows.Add r")
        b += ["    Set Demo_%s = rows" % t["name"], "End Function", ""]
    b += ["Private Function RowsToArray(ByVal cols As Variant, ByVal rows As Collection) As Variant",
          "    Dim arr() As Variant, i As Long, j As Long, r As Variant, n As Long",
          "    n = UBound(cols) - LBound(cols) + 1",
          "    ReDim arr(1 To rows.Count + 1, 1 To n)",
          "    For j = 1 To n",
          "        arr(1, j) = cols(LBound(cols) + j - 1)",
          "    Next j",
          "    i = 1",
          "    For Each r In rows",
          "        i = i + 1",
          "        For j = 1 To n",
          "            arr(i, j) = r(LBound(r) + j - 1)",
          "        Next j",
          "    Next r",
          "    RowsToArray = arr",
          "End Function"]
    return module("modDemoData", b)


def gen_form_code():
    with open(FORM_SRC, encoding="ascii") as f:
        code = f.read().replace("\r\n", "\n")
    b = ["' Ma nguon cua frmSearch (src/vba/forms/frmSearch.code.vba), chen vao form khi build.",
         "Public Function FrmSearchCode() As String", "    Dim s As String", "    s = \"\""]
    for ln in code.split("\n"):
        b.append("    s = s & %s & vbCrLf" % lit(ln))
    b += ["    FrmSearchCode = s", "End Function"]
    return module("modFormCode", b)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = [gen_res(), gen_schema(), gen_formulas(), gen_units(), gen_golden(), gen_demo_data()]
    if os.path.exists(FORM_SRC):
        made.append(gen_form_code())
    print("Da sinh:", ", ".join(m + ".bas" for m in made))


if __name__ == "__main__":
    main()
