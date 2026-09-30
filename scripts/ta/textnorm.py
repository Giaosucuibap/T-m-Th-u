"""Chuan hoa chuoi tieng Viet cho tim kiem (bo dau chi dung de tim, khong sua ten goc)."""
import unicodedata


EXTRA = {"²": "2", "³": "3"}  # m2, m3 viet bang so mu


def fold(text):
    """Bo dau, doi d/D, chu thuong, chi giu a-z 0-9 va dau cham, gop khoang trang.

    Phai cho ket qua giong modText.FoldVi trong VBA (bang anh xa sinh tu vietnamese_fold_table).
    """
    if text is None:
        return ""
    out = []
    for ch in str(text):
        if ch in EXTRA:
            out.append(EXTRA[ch])
            continue
        base = unicodedata.normalize("NFD", ch)
        base = "".join(c for c in base if unicodedata.category(c) != "Mn")
        if ch in ("đ", "Đ"):
            base = "d"
        base = base.lower()
        out.append(base if len(base) == 1 and (base.isascii() and (base.isalnum() or base == ".")) else " ")
    return " ".join("".join(out).split())


def vietnamese_fold_table():
    """Bang anh xa ky tu co dau -> khong dau cho moi ky tu Latin tieng Viet.

    Dung de sinh bang tra trong VBA (modText). Tra ve list (codepoint, ascii).
    """
    pairs = {}
    ranges = list(range(0x00C0, 0x0250)) + list(range(0x1E00, 0x1F00))
    for cp in ranges:
        ch = chr(cp)
        base = unicodedata.normalize("NFD", ch)
        base = "".join(c for c in base if unicodedata.category(c) != "Mn")
        if cp in (0x0110, 0x0111):
            base = "d"
        base = base.lower()
        if len(base) == 1 and base.isascii() and base.isalpha() and base != ch:
            pairs[cp] = base
    for ch, rep in EXTRA.items():
        pairs[ord(ch)] = rep
    return sorted(pairs.items())
