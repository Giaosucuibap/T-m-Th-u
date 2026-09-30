"""Kiem tra tinh ma VBA (thay the mot phan cho 'Debug > Compile' khi khong co Excel).

Phat hien: ky tu ngoai ASCII, dong khong CRLF, thieu Option Explicit, VB_Name sai, khoi lenh mo/dong lech
(Sub/Function/If/For/Do/While/With/Select/Type/Enum/#If), Exit sai loai, bien/thu tuc chua khai bao,
khai bao trung trong cung pham vi, nhan GoTo khong ton tai, tham so Optional dat sai, dong qua dai.

KHONG chung minh ma bien dich duoc tren Excel: khong kiem kieu du lieu, so tham so, thanh vien doi tuong.
Chay:  python scripts/lint_vba.py [--fix-eol]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "vba")

KEYWORDS = set("""
and as byref byval call case const declare dim do each else elseif end enum erase error exit explicit false for
friend function get global gosub goto if implements in is let lib like loop me mod new next not nothing null empty
on option optional or xor eqv imp paramarray preserve private property ptrsafe public redim rem resume select set
static step stop sub then to true type typeof until wend while with withevents alias compare binary text base
module attribute begin version class multiuse print
""".split())
TYPES = set("""
boolean byte currency date decimal double integer long longlong longptr object single string variant collection
workbook worksheet range listobject listcolumn listrow name window iribboncontrol msforms returnboolean
returninteger userform ccatalog dictionary
""".split())
FUNCTIONS = set("""
abs array asc ascw cbool cbyte ccur cdate cdbl cdec chr chrw cint clng clngptr clnglng createobject csng cstr cvar
cverr date dateadd datediff day dir doevents environ eof err error exp filelen fix format freefile getobject
getsetting savesetting hex hour iif input inputbox instr instrrev int isarray isdate isempty iserror ismissing
isnull isnumeric isobject join lbound lcase left len log ltrim mid minute month msgbox now oct replace rgb right rnd
round rtrim second sgn space split sqr str strcomp strconv string strptr strreverse time timer trim typename ubound
ucase val vartype weekday year objptr varptr debug unload load
application activeworkbook activesheet activecell activewindow thisworkbook workbooks worksheets sheets cells
rows columns selection intersect union evaluate worksheetfunction vba userforms vba7 win64 win32
""".split())
CONST_PREFIXES = ("vb", "xl", "mso", "fm")

TOKEN_RE = re.compile(r"&H[0-9A-Fa-f]+&?|\d+\.?\d*(?:[eE][+-]?\d+)?[#!@&%]?|[A-Za-z_][A-Za-z0-9_]*[$%&#!@]?|:=|<>|<=|>=|\S")
PROC_RE = re.compile(r"^(?:(public|private|friend|global)\s+)?(?:static\s+)?(sub|function|property\s+(?:get|let|set))\s+([a-z_]\w*)", re.I)
DECLARE_RE = re.compile(r"^(?:(public|private)\s+)?declare\s+(?:ptrsafe\s+)?(?:sub|function)\s+([a-z_]\w*)", re.I)
LABEL_RE = re.compile(r"^([A-Za-z_]\w*):(?!=)(\s|$)")


class Issue(Exception):
    pass


def strip_strings_comments(line):
    """Tra ve (code_khong_chuoi, co_chu_thich). Chuoi thay bang "" giu vi tri tuong doi."""
    out, i, n = [], 0, len(line)
    while i < n:
        ch = line[i]
        if ch == '"':
            j = i + 1
            while j < n:
                if line[j] == '"':
                    if j + 1 < n and line[j + 1] == '"':
                        j += 2
                        continue
                    break
                j += 1
            out.append('""')
            i = j + 1
            continue
        if ch == "'":
            break
        out.append(ch)
        i += 1
    code = "".join(out)
    if re.match(r"^\s*rem(\s|$)", code, re.I):
        return ""
    return code


def logical_lines(text):
    """Noi dong tiep noi ' _'. Tra ve list (so_dong_bat_dau, code)."""
    phys = text.split("\n")
    out, buf, start = [], "", None
    for idx, raw in enumerate(phys, start=1):
        raw = raw.rstrip("\r")
        code = strip_strings_comments(raw)
        if start is None:
            start = idx
        if code.rstrip().endswith(" _"):
            buf += code.rstrip()[:-1] + " "
            continue
        buf += code
        out.append((start, buf))
        buf, start = "", None
    return out


def split_statements(code):
    parts, cur, i = [], "", 0
    while i < len(code):
        ch = code[i]
        if ch == ":" and not code[i + 1:i + 2] == "=":
            parts.append(cur)
            cur = ""
        else:
            cur += ch
        i += 1
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def param_names(sig):
    m = re.search(r"\((.*)\)", sig)
    if not m:
        return [], []
    depth, cur, params = 0, "", []
    for ch in m.group(1):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            params.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        params.append(cur)
    names, problems = [], []
    seen_optional = False
    for p in params:
        words = p.strip().split()
        low = [w.lower() for w in words]
        is_opt = "optional" in low or "paramarray" in low
        if seen_optional and not is_opt:
            problems.append("tham so bat buoc dung sau Optional/ParamArray: " + p.strip())
        seen_optional = seen_optional or is_opt
        words = [w for w in words if w.lower() not in ("optional", "byval", "byref", "paramarray")]
        if words:
            names.append(re.match(r"[A-Za-z_]\w*", words[0]).group(0).lower())
    return names, problems


def declared_vars(stmt):
    """Ten bien trong cau Dim/Static/Const/Private/Public ... (danh sach phan cach dau phay)."""
    body = re.sub(r"^(dim|static|const|private|public|global|redim(\s+preserve)?)\s+", "", stmt, flags=re.I)
    body = re.sub(r"^(const|withevents)\s+", "", body, flags=re.I)
    depth, cur, items = 0, "", []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            items.append(cur)
            cur = ""
        else:
            cur += ch
    items.append(cur)
    out = []
    for it in items:
        m = re.match(r"\s*([A-Za-z_]\w*)", it)
        if m:
            out.append(m.group(1).lower())
    return out


def module_symbols(path, text):
    """Ky hieu cap module: (public_set, private_set, ten_module)."""
    pub, priv = set(), set()
    name = os.path.splitext(os.path.basename(path))[0]
    is_class = path.endswith(".cls")
    in_proc = False
    in_type = False
    for _, code in logical_lines(text):
        s = code.strip()
        low = s.lower()
        if not s or low.startswith("attribute ") or low.startswith("#"):
            continue
        if in_type:
            if re.match(r"end\s+(type|enum)\b", low):
                in_type = False
            elif not is_class:
                pub.add(re.match(r"[A-Za-z_]\w*", s).group(0).lower())
            continue
        m = PROC_RE.match(s)
        if m:
            target = priv if (m.group(1) or "").lower() == "private" or is_class else pub
            target.add(m.group(3).lower())
            in_proc = True
            continue
        if re.match(r"end\s+(sub|function|property)\b", low):
            in_proc = False
            continue
        if in_proc:
            continue
        m = DECLARE_RE.match(s)
        if m:
            (priv if (m.group(1) or "").lower() == "private" else pub).add(m.group(2).lower())
            continue
        m = re.match(r"^(?:(public|private)\s+)?(type|enum)\s+([a-z_]\w*)", s, re.I)
        if m:
            in_type = True
            (pub if (m.group(1) or "").lower() != "private" else priv).add(m.group(3).lower())
            continue
        m = re.match(r"^(public|private|dim|global|const)\b", low)
        if m:
            names = declared_vars(s)
            scope = priv if (low.startswith("private") or low.startswith("dim") or is_class
                             or (low.startswith("const"))) else pub
            scope.update(names)
    return pub, priv, name


def lint_file(path, project_public, form_controls, problems):
    with open(path, "rb") as f:
        raw = f.read()
    rel = os.path.relpath(path, ROOT)
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError as e:
        problems.append("%s: ky tu ngoai ASCII tai byte %d (VBE khong doc UTF-8 on dinh)" % (rel, e.start))
        text = raw.decode("utf-8", "replace")
    if path.endswith((".bas", ".cls")) and re.search(rb"(?<!\r)\n", raw):
        problems.append("%s: co dong ket thuc LF, can CRLF de VBE nhap dung (chay --fix-eol)" % rel)
    for n, ln in enumerate(text.split("\n"), 1):
        if len(ln.rstrip("\r")) > 1023:
            problems.append("%s:%d: dong dai hon 1023 ky tu" % (rel, n))
    stem = os.path.splitext(os.path.basename(path))[0]
    if path.endswith(".bas") and not text.startswith('Attribute VB_Name = "%s"' % stem):
        problems.append("%s: dong dau phai la Attribute VB_Name = \"%s\"" % (rel, stem))
    if path.endswith(".cls") and 'Attribute VB_Name = "%s"' % stem not in text:
        problems.append("%s: thieu Attribute VB_Name = \"%s\"" % (rel, stem))
    if not re.search(r"^Option Explicit\s*$", text, re.M):
        problems.append("%s: thieu Option Explicit" % rel)

    pub, priv, _ = module_symbols(path, text)
    module_scope = pub | priv | form_controls
    is_class = path.endswith(".cls")
    stack, pp_stack = [], []
    proc = None  # dict: kind, locals, labels, gotos, line
    skip_else_branch = False

    def err(line, msg):
        problems.append("%s:%d: %s" % (rel, line, msg))

    for lineno, code in logical_lines(text):
        s = code.strip()
        if not s:
            continue
        low = s.lower()
        if low.startswith("attribute ") or low in ("version 1.0 class", "begin", "end") or low.startswith("multiuse"):
            continue
        # tien xu ly #If
        if low.startswith("#if"):
            pp_stack.append(lineno)
            continue
        if low.startswith("#else"):
            if not pp_stack:
                err(lineno, "#Else khong co #If")
            skip_else_branch = True
            continue
        if low.startswith("#end if"):
            if not pp_stack:
                err(lineno, "#End If thua")
            else:
                pp_stack.pop()
            skip_else_branch = False
            continue
        if skip_else_branch:
            continue
        m = LABEL_RE.match(s)
        if m and m.group(1).lower() not in KEYWORDS:
            if proc is not None:
                proc["labels"].add(m.group(1).lower())
            s = s[m.end():].strip()
            if not s:
                continue
        statements = [s] if re.match(r"^if\b.*\bthen\s+\S", s, re.I) else split_statements(s)
        for st in statements:
            lst = st.lower()
            first = lst.split()[0] if lst.split() else ""
            pm = PROC_RE.match(st)
            if pm and not re.match(r"^\s*(exit|end)\b", lst):
                if proc is not None:
                    err(lineno, "thu tuc long nhau (thieu End Sub/Function?)")
                names, pprobs = param_names(st)
                for pp in pprobs:
                    err(lineno, pp)
                kind = pm.group(2).lower().split()[0]
                proc = {"kind": kind, "locals": set(), "labels": set(), "gotos": [], "line": lineno,
                        "name": pm.group(3)}
                for nm in names:
                    if nm in proc["locals"]:
                        err(lineno, "tham so trung ten: " + nm)
                    if nm in project_public:
                        err(lineno, "tham so %s che ten thu tuc/bien cong khai cung ten" % nm)
                    proc["locals"].add(nm)
                stack.append(("proc", lineno))
                continue
            if DECLARE_RE.match(st):
                continue
            if re.match(r"^end\s+(sub|function|property)\b", lst):
                if not stack or stack[-1][0] != "proc":
                    err(lineno, "%s nhung khoi dang mo la %s" % (st, stack[-1][0] if stack else "khong co"))
                    while stack and stack[-1][0] != "proc":
                        stack.pop()
                if stack:
                    stack.pop()
                if proc is not None:
                    for gl, lab in proc["gotos"]:
                        if lab not in proc["labels"]:
                            err(gl, "GoTo/Resume toi nhan khong ton tai: " + lab)
                proc = None
                continue
            if re.match(r"^(public|private)?\s*(type|enum)\s+\w+", lst) and proc is None:
                stack.append(("type", lineno))
                continue
            if re.match(r"^end\s+(type|enum)\b", lst):
                if stack and stack[-1][0] == "type":
                    stack.pop()
                else:
                    err(lineno, "End Type/Enum thua")
                continue
            if stack and stack[-1][0] == "type":
                continue
            # khoi lenh
            if first == "if" and re.search(r"\bthen\s*$", lst):
                stack.append(("if", lineno))
            elif first == "elseif" or lst == "else":
                if not stack or stack[-1][0] != "if":
                    err(lineno, "%s ngoai khoi If" % st.split()[0])
            elif re.match(r"^end\s+if\b", lst):
                pop(stack, "if", lineno, err)
            elif first == "for":
                stack.append(("for", lineno))
            elif first == "next":
                pop(stack, "for", lineno, err)
            elif first == "do":
                stack.append(("do", lineno))
            elif first == "loop":
                pop(stack, "do", lineno, err)
            elif first == "while":
                stack.append(("while", lineno))
            elif first == "wend":
                pop(stack, "while", lineno, err)
            elif first == "with":
                stack.append(("with", lineno))
            elif re.match(r"^end\s+with\b", lst):
                pop(stack, "with", lineno, err)
            elif re.match(r"^select\s+case\b", lst):
                stack.append(("select", lineno))
            elif first == "case":
                if not stack or stack[-1][0] != "select":
                    err(lineno, "Case ngoai Select")
            elif re.match(r"^end\s+select\b", lst):
                pop(stack, "select", lineno, err)
            m = re.match(r"^exit\s+(sub|function|property|for|do)\b", lst)
            if m and proc is not None:
                what = m.group(1)
                if what in ("sub", "function", "property") and what != proc["kind"]:
                    err(lineno, "Exit %s trong %s" % (what.title(), proc["kind"].title()))
                if what == "for" and not any(k == "for" for k, _ in stack):
                    err(lineno, "Exit For ngoai vong For")
                if what == "do" and not any(k == "do" for k, _ in stack):
                    err(lineno, "Exit Do ngoai vong Do")
            # khai bao
            if proc is not None and re.match(r"^(dim|static|const|redim)\b", lst):
                for nm in declared_vars(st):
                    if lst.startswith("redim"):
                        proc["locals"].add(nm)
                        continue
                    if nm in proc["locals"]:
                        err(lineno, "khai bao trung trong thu tuc %s: %s" % (proc["name"], nm))
                    proc["locals"].add(nm)
                    if nm in project_public:
                        err(lineno, "bien cuc bo %s che ten thu tuc/bien cong khai cung ten" % nm)
                check_identifiers(st, lineno, proc, module_scope, project_public, err, declaration=True)
                continue
            if proc is None:
                continue
            for gm in re.finditer(r"\b(?:goto|resume)\s+([a-z_]\w*)", lst):
                if gm.group(1) not in ("next",):
                    proc["gotos"].append((lineno, gm.group(1)))
            check_identifiers(st, lineno, proc, module_scope, project_public, err)
    for kind, ln in stack:
        err(ln, "khoi %s khong duoc dong" % kind)
    for ln in pp_stack:
        err(ln, "#If khong duoc dong")


def pop(stack, kind, lineno, err):
    if not stack or stack[-1][0] != kind:
        err(lineno, "dong khoi %s nhung khoi dang mo la %s" % (kind, stack[-1][0] if stack else "khong co"))
        for i in range(len(stack) - 1, -1, -1):
            if stack[i][0] == kind:
                del stack[i:]
                return
        return
    stack.pop()


def check_identifiers(st, lineno, proc, module_scope, project_public, err, declaration=False):
    tokens = TOKEN_RE.findall(st)
    prev = ""
    skip_next_type = False
    for i, tok in enumerate(tokens):
        low = tok.lower().rstrip("$%&#!@")
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if not re.match(r"[a-z_]", low) or tok.lower().startswith("&h"):
            prev = tok
            continue
        if skip_next_type or prev in (".", "!"):
            skip_next_type = False
            prev = tok
            continue
        if low in ("as", "new"):
            skip_next_type = True
            prev = tok
            continue
        if nxt == ":=":
            prev = tok
            continue
        if prev.lower() in ("goto", "resume"):
            prev = tok
            continue
        if declaration and prev.lower() in ("dim", "static", "const", ",", "redim", "preserve"):
            prev = tok
            continue
        known = (low in KEYWORDS or low in TYPES or low in FUNCTIONS or low.startswith(CONST_PREFIXES)
                 or low in proc["locals"] or low in module_scope or low in project_public)
        if not known:
            err(lineno, "chua khai bao: %s (thu tuc %s)" % (tok, proc["name"]))
        prev = tok


def main():
    fix = "--fix-eol" in sys.argv
    files = sorted(os.path.join(SRC, f) for f in os.listdir(SRC) if f.endswith((".bas", ".cls")))
    form = os.path.join(SRC, "forms", "frmSearch.code.vba")
    if fix:
        for p in files:
            with open(p, "rb") as f:
                data = f.read().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
            with open(p, "wb") as f:
                f.write(data)
    project_public = set()
    for p in files:
        with open(p, encoding="ascii", errors="replace") as f:
            pub, _, name = module_symbols(p, f.read())
        project_public |= pub
        project_public.add(name.lower())
    with open(os.path.join(SRC, "modDevBuild.bas"), encoding="ascii") as f:
        controls = set(m.lower() for m in re.findall(r'"Forms\.\w+\.1", "(\w+)"', f.read()))
    problems = []
    for p in files:
        lint_file(p, project_public, set(), problems)
    if os.path.exists(form):
        lint_file(form, project_public, controls | {"frmsearch"}, problems)
    for pr in problems:
        print(pr)
    print("%d file, %d van de" % (len(files) + 1, len(problems)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
