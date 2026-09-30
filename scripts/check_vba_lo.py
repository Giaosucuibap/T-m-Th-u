"""Bien dich thu cac module VBA bang Basic cua LibreOffice (Option VBASupport 1).

Day la kiem tra cu phap BO SUNG, khong thay the 'Debug > Compile VBAProject' tren Excel that.
Hai cho LibreOffice khong ho tro (nhung la VBA hop le) duoc thay tam truoc khi nap:
  - khoi '#If VBA7 Then ... Declare PtrSafe ... #End If'  -> ham gia cung ten
  - 'vbObjectError' trong hang so                          -> gia tri so -2147221504
Can: LibreOffice (soffice) va python3-uno.
Chay:  python3 scripts/check_vba_lo.py
"""
import glob
import os
import re
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "vba")
PORT = 2097


def prepare(path):
    code = open(path, encoding="ascii").read().replace("\r\n", "\n")
    code = re.sub(r"#If VBA7 Then.*?#End If",
                  "Private Function MessageBoxW(ByVal hWnd As Long, ByVal lpText As Long, "
                  "ByVal lpCaption As Long, ByVal uType As Long) As Long\nEnd Function", code, flags=re.S)
    code = code.replace("vbObjectError", "-2147221504")
    lines = [ln for ln in code.split("\n") if not ln.startswith("Attribute ")
             and ln not in ("VERSION 1.0 CLASS", "BEGIN", "END") and not ln.strip().startswith("MultiUse")]
    header = "Option VBASupport 1\n" + ("Option ClassModule\n" if path.endswith(".cls") else "")
    return header + "\n".join(lines)


def main():
    import uno  # noqa: F401  (python3-uno)
    from com.sun.star.beans import PropertyValue

    profile = os.path.join(tempfile.gettempdir(), "ta_lo_profile_uno")
    env = dict(os.environ, HOME=profile)
    proc = subprocess.Popen(["soffice", "-env:UserInstallation=file://" + profile, "--headless", "--norestore",
                             "--nologo", "--accept=socket,host=127.0.0.1,port=%d;urp;" % PORT],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(120):
            try:
                ctx = resolver.resolve("uno:socket,host=127.0.0.1,port=%d;urp;StarOffice.ComponentContext" % PORT)
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            raise RuntimeError("Khong ket noi duoc LibreOffice")
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        hidden = PropertyValue()
        hidden.Name, hidden.Value = "Hidden", True
        doc = desktop.loadComponentFromURL("private:factory/scalc", "_blank", 0, (hidden,))
        libs = doc.BasicLibraries
        std = libs.getByName("Standard") if libs.hasByName("Standard") else libs.createLibrary("Standard")
        files = sorted(glob.glob(os.path.join(SRC, "*.bas")) + glob.glob(os.path.join(SRC, "*.cls")))
        mods = []
        for f in files:
            name = os.path.splitext(os.path.basename(f))[0]
            code = prepare(f)
            if f.endswith(".bas"):
                code += "\nPublic Function TAProbe_%s() As Long\n    TAProbe_%s = 7\nEnd Function\n" % (name, name)
                mods.append(name)
            std.insertByName(name, code)
        sp = doc.getScriptProvider()
        failed = []
        for name in mods:
            try:
                r = sp.getScript("vnd.sun.star.script:Standard.%s.TAProbe_%s?language=Basic&location=document"
                                 % (name, name)).invoke((), (), ())
                ok = r[0] == 7
            except Exception:
                ok = False
            print("%-16s %s" % (name, "OK" if ok else "LOI BIEN DICH"))
            if not ok:
                failed.append(name)
        doc.close(True)
        try:
            desktop.terminate()
        except Exception:
            pass
    finally:
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
    print("%d module (+%d lop) nap vao LibreOffice Basic, %d loi" % (len(mods), len(files) - len(mods), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
