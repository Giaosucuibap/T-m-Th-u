"""Chen src/ribbon/customUI14.xml vao mot goi .xlam/.xlsm (tuong duong phan cuoi cua build_addin.ps1).

Dung khi build tren Windows ma muon lam buoc Ribbon bang Python, va de kiem thu tu dong.
  python scripts/inject_ribbon.py dist/TA_Estimate.xlam
"""
import os
import shutil
import sys
import tempfile
import zipfile

from lxml import etree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL_TYPE = "http://schemas.microsoft.com/office/2007/relationships/ui/extensibility"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
TARGET = "customUI/customUI14.xml"


def inject(package, ribbon_xml=os.path.join(ROOT, "src", "ribbon", "customUI14.xml")):
    etree.parse(ribbon_xml)  # XML phai hop le truoc khi dua vao goi
    with open(ribbon_xml, "rb") as f:
        ui = f.read()
    tmp = tempfile.mktemp(suffix=os.path.splitext(package)[1])
    with zipfile.ZipFile(package) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            if info.filename == TARGET:
                continue
            data = zin.read(info.filename)
            if info.filename == "_rels/.rels":
                root = etree.fromstring(data)
                if not any(r.get("Target") == TARGET for r in root):
                    rel = etree.SubElement(root, "{%s}Relationship" % PKG)
                    rel.set("Id", "rIdTAribbon")
                    rel.set("Type", REL_TYPE)
                    rel.set("Target", TARGET)
                data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            zout.writestr(info, data)
        zout.writestr(TARGET, ui)
    shutil.move(tmp, package)
    return package


if __name__ == "__main__":
    print("Da chen Ribbon vao", inject(sys.argv[1]))
