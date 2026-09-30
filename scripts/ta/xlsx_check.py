"""Kiem tra file .xlsx gui di co tu chua: khong lien ket ngoai, khong macro, khong ket noi/query,
chi dung ham Excel trong danh sach cho phep (khong UDF)."""
import re
import zipfile

from lxml import etree

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ALLOWED_FUNCTIONS = {
    "IF", "AND", "OR", "NOT", "ISNUMBER", "ISERROR", "ISNA", "NA", "N", "INDEX", "MATCH",
    "SUM", "SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS", "SUMPRODUCT", "ROUND",
}
FORBIDDEN_PARTS = ("xl/externalLinks/", "xl/vbaProject.bin", "xl/connections.xml", "xl/queryTables/",
                   "xl/activeX/", "xl/embeddings/")
FUNC_RE = re.compile(r"([A-Z][A-Z0-9_.]*)\(")
STRING_RE = re.compile(r'"(?:[^"]|"")*"')
EXTERNAL_RE = re.compile(r"\[\d+\]|\.xls[xmb]?\]|https?://", re.I)


def check_file(path):
    problems = []
    formulas = 0
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        for n in names:
            if n.startswith(FORBIDDEN_PARTS):
                problems.append(("FORBIDDEN_PART", n))
        ct = z.read("[Content_Types].xml").decode("utf-8")
        if "macroEnabled" in ct:
            problems.append(("MACRO_CONTENT_TYPE", "[Content_Types].xml"))
        wbxml = etree.fromstring(z.read("xl/workbook.xml"))
        for dn in wbxml.findall(".//m:definedName", NS):
            text = dn.text or ""
            problems += [("EXTERNAL_REF", "definedName " + dn.get("name"))] if EXTERNAL_RE.search(text) else []
            problems += _functions(text, "definedName " + dn.get("name"))
        for n in names:
            if not (n.startswith("xl/worksheets/sheet") and n.endswith(".xml")):
                continue
            root = etree.fromstring(z.read(n))
            for c in root.iterfind(".//m:c", NS):
                f = c.find("m:f", NS)
                if f is None or not f.text:
                    continue
                formulas += 1
                where = "%s!%s" % (n, c.get("r"))
                if EXTERNAL_RE.search(STRING_RE.sub('""', f.text)):
                    problems.append(("EXTERNAL_REF", where))
                problems += _functions(f.text, where)
    return {"formulas": formulas, "problems": problems}


def _functions(text, where):
    out = []
    bare = STRING_RE.sub('""', text)
    for name in FUNC_RE.findall(bare):
        fname = name.replace("_xlfn.", "")
        if fname not in ALLOWED_FUNCTIONS:
            out.append(("FUNCTION_NOT_ALLOWED", "%s: %s" % (where, name)))
    return out
