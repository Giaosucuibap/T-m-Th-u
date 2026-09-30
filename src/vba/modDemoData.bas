Attribute VB_Name = "modDemoData"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

' Bo catalog DEMO nhung san (sinh tu data/demo). Moi bang: mang 2 chieu, dong 1 la tieu de.
' Moi bang mot ham rieng de khong vuot gioi han kich thuoc thu tuc cua VBA.
Public Function DemoCatalogTable(ByVal tableName As String) As Variant
    Select Case tableName
    Case "tblCatManifest": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatManifest())
    Case "tblCatDocuments": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatDocuments())
    Case "tblCatNorms": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatNorms())
    Case "tblCatResources": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatResources())
    Case "tblCatLines": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatLines())
    Case "tblCatNotes": DemoCatalogTable = RowsToArray(CatalogColumns(tableName), Demo_tblCatNotes())
    End Select
End Function

Private Function Demo_tblCatManifest() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("catalog_release_id"), _
        U("DEMO-1"))
    rows.Add r
    r = Array( _
        U("catalog_schema_version"), _
        U("1.0"))
    rows.Add r
    r = Array( _
        U("is_demo"), _
        True)
    rows.Add r
    r = Array( _
        U("created_at"), _
        U("2026-09-30T00:00:00"))
    rows.Add r
    r = Array( _
        U("warning"), _
        U("To\u00E0n b\u1ED9 l\u00E0 s\u1ED1 gi\u1EA3 l\u1EADp \u0111\u1EC3 ki\u1EC3m tra thu\u1EADt to\u00E1n v\u00E0 giao di\u1EC7n. KH\u00D4NG ph\u1EA3i \u0111\u1ECBnh m\u1EE9c, gi\u00E1 hay v\u0103n b\u1EA3n ph\u00E1p l\u00FD. Kh\u00F4ng d\u00F9ng l\u1EADp d\u1EF1 to\u00E1n th\u1EF1c t\u1EBF."))
    rows.Add r
    r = Array( _
        U("norm_count"), _
        7)
    rows.Add r
    r = Array( _
        U("line_count"), _
        23)
    rows.Add r
    r = Array( _
        U("supported_codes_note"), _
        U("Ch\u1EC9 c\u00E1c m\u00E3 trong b\u1EA3ng NORMS. Kh\u00F4ng ph\u1EA3i th\u01B0 vi\u1EC7n \u0111\u1EA7y \u0111\u1EE7."))
    rows.Add r
    Set Demo_tblCatManifest = rows
End Function

Private Function Demo_tblCatDocuments() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("DEMO"), _
        U("DEMO (kh\u00F4ng ph\u1EA3i v\u0103n b\u1EA3n ph\u00E1p l\u00FD)"), _
        U("Kh\u00F4ng c\u00F3"), _
        U(""), _
        U(""), _
        U(""), _
        U(""), _
        U(""), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO-TL-NOT-A-LEGAL-DOCUMENT"), _
        U("DEMO-TL"), _
        U("DEMO th\u1EE7y l\u1EE3i (kh\u00F4ng ph\u1EA3i v\u0103n b\u1EA3n ph\u00E1p l\u00FD)"), _
        U("Kh\u00F4ng c\u00F3"), _
        U(""), _
        U(""), _
        U(""), _
        U(""), _
        U(""), _
        U(""))
    rows.Add r
    Set Demo_tblCatDocuments = rows
End Function

Private Function Demo_tblCatNorms() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("DEMO|D01|1|DEMO.001|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.001"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 1"), _
        U("Nh\u00F3m DEMO"), _
        U("[DEMO] C\u00F4ng t\u00E1c gi\u1EA3 l\u1EADp theo 100 m\u00B3"), _
        U("m3"), _
        U("100 m\u00B3"), _
        100, _
        U("verified"), _
        True, _
        U("present"), _
        U("present"), _
        U("present"), _
        U("S\u1ED1 gi\u1EA3 l\u1EADp \u0111\u1EC3 ki\u1EC3m ph\u00E9p t\u00EDnh; kh\u00F4ng d\u00F9ng l\u1EADp d\u1EF1 to\u00E1n th\u1EF1c t\u1EBF."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO|D01|2|DEMO.001|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("2"), _
        U("DEMO.001"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 1"), _
        U("Nh\u00F3m DEMO"), _
        U("[DEMO] C\u00F4ng t\u00E1c gi\u1EA3 l\u1EADp theo 100 m\u00B3 (revision 2)"), _
        U("m3"), _
        U("100 m\u00B3"), _
        100, _
        U("verified"), _
        True, _
        U("present"), _
        U("present"), _
        U("present"), _
        U("Gi\u1EA3 l\u1EADp: d\u00F9ng \u0111\u1EC3 th\u1EED hai revision c\u00F9ng m\u00E3."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO-TL|D02|1|DEMO.001|base"), _
        U("DEMO-TL"), _
        U("DEMO-TL-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.001"), _
        U("base"), _
        U("DEMO-TL"), _
        U("Ch\u01B0\u01A1ng DEMO th\u1EE7y l\u1EE3i"), _
        U("Nh\u00F3m DEMO th\u1EE7y l\u1EE3i"), _
        U("[DEMO] C\u00F4ng t\u00E1c gi\u1EA3 l\u1EADp c\u00F9ng m\u00E3 nh\u01B0ng thu\u1ED9c b\u1ED9 th\u1EE7y l\u1EE3i DEMO"), _
        U("m3"), _
        U("100 m\u00B3"), _
        100, _
        U("verified"), _
        True, _
        U("present"), _
        U("present"), _
        U("present"), _
        U("Gi\u1EA3 l\u1EADp: c\u00F9ng chu\u1ED7i m\u00E3 DEMO.001 nh\u01B0ng kh\u00E1c b\u1ED9 ngu\u1ED3n."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.010|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.010"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 2"), _
        U("Khoan v\u00E0 ph\u1EE5t v\u1EEFa DEMO"), _
        U("[DEMO] Khoan ph\u1EE5t v\u1EEFa xi m\u0103ng gi\u1EA3 l\u1EADp"), _
        U("m"), _
        U("1 m"), _
        1, _
        U("needs_review"), _
        True, _
        U("present"), _
        U("present"), _
        U("present"), _
        U("Gi\u1EA3 l\u1EADp m\u00E3 C\u1EA6N KI\u1EC2M: tra c\u1EE9u \u0111\u01B0\u1EE3c nh\u01B0ng b\u1ECB ch\u1EB7n xu\u1EA5t ch\u00EDnh th\u1EE9c."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.020"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 3"), _
        U("B\u00EA t\u00F4ng DEMO"), _
        U("[DEMO] B\u00EA t\u00F4ng k\u00EAnh gi\u1EA3 l\u1EADp, v\u1EADt li\u1EC7u kh\u00E1c theo % nh\u00F3m VL"), _
        U("m3"), _
        U("1 m\u00B3"), _
        1, _
        U("verified"), _
        True, _
        U("present"), _
        U("present"), _
        U("present"), _
        U("Gi\u1EA3 l\u1EADp: d\u00F2ng % l\u1EA5y c\u01A1 s\u1EDF l\u00E0 to\u00E0n b\u1ED9 v\u1EADt li\u1EC7u ch\u00EDnh (nh\u00F3m VL)."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.030|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.030"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 3"), _
        U("Gia c\u00F4ng DEMO"), _
        U("[DEMO] C\u00F4ng t\u00E1c gi\u1EA3 l\u1EADp t\u00EDnh theo kg (th\u1EED \u0111\u1ED5i t\u1EA5n sang kg)"), _
        U("kg"), _
        U("1 kg"), _
        1, _
        U("verified"), _
        True, _
        U("present"), _
        U("present"), _
        U("none_verified"), _
        U("Gi\u1EA3 l\u1EADp: nh\u1EADp kh\u1ED1i l\u01B0\u1EE3ng b\u1EB1ng t\u1EA5n, h\u1EC7 s\u1ED1 \u0111\u1ED5i 1000."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.040|base"), _
        U("DEMO"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        U("1"), _
        U("DEMO.040"), _
        U("base"), _
        U("DEMO"), _
        U("Ch\u01B0\u01A1ng DEMO 4"), _
        U("\u0110\u1EA5t DEMO"), _
        U("[DEMO] \u0110\u1EAFp \u0111\u1EA5t gi\u1EA3 l\u1EADp, \u0111\u01A1n v\u1ECB m\u00B3 \u0111\u1EA7m ch\u1EB7t"), _
        U("m3_dam_chat"), _
        U("100 m\u00B3 \u0111\u1EA7m ch\u1EB7t"), _
        100, _
        U("verified"), _
        True, _
        U("none_verified"), _
        U("present"), _
        U("present"), _
        U("Gi\u1EA3 l\u1EADp: kh\u00F4ng \u0111\u01B0\u1EE3c t\u1EF1 \u0111\u1ED5i m\u00B3 nguy\u00EAn th\u1ED5 sang m\u00B3 \u0111\u1EA7m ch\u1EB7t."), _
        U("DEMO"))
    rows.Add r
    Set Demo_tblCatNorms = rows
End Function

Private Function Demo_tblCatResources() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("DEMO.VL1"), _
        U("DEMO"), _
        U("VL"), _
        U("V\u1EADt li\u1EC7u th\u1EED"), _
        U(""), _
        U("kg"))
    rows.Add r
    r = Array( _
        U("DEMO.VL2"), _
        U("DEMO"), _
        U("VL"), _
        U("V\u1EADt li\u1EC7u th\u1EED 2 (d\u1EA1ng v\u1EEFa)"), _
        U(""), _
        U("m3"))
    rows.Add r
    r = Array( _
        U("DEMO.VL3"), _
        U("DEMO"), _
        U("VL"), _
        U("V\u1EADt li\u1EC7u th\u1EED 3"), _
        U(""), _
        U("kg"))
    rows.Add r
    r = Array( _
        U("DEMO.NC1"), _
        U("DEMO"), _
        U("NC"), _
        U("Nh\u00E2n c\u00F4ng th\u1EED"), _
        U(""), _
        U("cong"))
    rows.Add r
    r = Array( _
        U("DEMO.M1"), _
        U("DEMO"), _
        U("M"), _
        U("M\u00E1y th\u1EED"), _
        U(""), _
        U("ca"))
    rows.Add r
    r = Array( _
        U("DEMO.M2"), _
        U("DEMO"), _
        U("M"), _
        U("M\u00E1y khoan th\u1EED"), _
        U(""), _
        U("ca"))
    rows.Add r
    Set Demo_tblCatResources = rows
End Function

Private Function Demo_tblCatLines() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("DEMO|D01|1|DEMO.001|base"), _
        U("L1"), _
        U("DEMO.VL1"), _
        U("VL"), _
        U("quantity"), _
        10, _
        U("10"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.001|base"), _
        U("L2"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        2, _
        U("2"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.001|base"), _
        U("L3"), _
        U("DEMO.M1"), _
        U("M"), _
        U("quantity"), _
        1, _
        U("1"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.001|base"), _
        U("L4"), _
        U(""), _
        U("VL"), _
        U("percent"), _
        2, _
        U("2"), _
        U("L1"), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|2|DEMO.001|base"), _
        U("L1"), _
        U("DEMO.VL1"), _
        U("VL"), _
        U("quantity"), _
        11, _
        U("11"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|2|DEMO.001|base"), _
        U("L2"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        2.2, _
        U("2.2"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|2|DEMO.001|base"), _
        U("L3"), _
        U("DEMO.M1"), _
        U("M"), _
        U("quantity"), _
        1, _
        U("1"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|2|DEMO.001|base"), _
        U("L4"), _
        U(""), _
        U("VL"), _
        U("percent"), _
        2, _
        U("2"), _
        U("L1"), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO-TL|D02|1|DEMO.001|base"), _
        U("L1"), _
        U("DEMO.VL1"), _
        U("VL"), _
        U("quantity"), _
        9, _
        U("9"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO-TL|D02|1|DEMO.001|base"), _
        U("L2"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        3, _
        U("3"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO-TL|D02|1|DEMO.001|base"), _
        U("L3"), _
        U("DEMO.M1"), _
        U("M"), _
        U("quantity"), _
        0.5, _
        U("0.5"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.010|base"), _
        U("L1"), _
        U("DEMO.VL2"), _
        U("VL"), _
        U("quantity"), _
        0.05, _
        U("0.05"), _
        U(""), _
        U("needs_review"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.010|base"), _
        U("L2"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        0.8, _
        U("0.8"), _
        U(""), _
        U("needs_review"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.010|base"), _
        U("L3"), _
        U("DEMO.M2"), _
        U("M"), _
        U("quantity"), _
        0.12, _
        U("0.12"), _
        U(""), _
        U("needs_review"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("L1"), _
        U("DEMO.VL1"), _
        U("VL"), _
        U("quantity"), _
        300, _
        U("300"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("L2"), _
        U("DEMO.VL3"), _
        U("VL"), _
        U("quantity"), _
        50, _
        U("50"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("L3"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        1.5, _
        U("1.5"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("L4"), _
        U("DEMO.M1"), _
        U("M"), _
        U("quantity"), _
        0.1, _
        U("0.1"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.020|base"), _
        U("L5"), _
        U(""), _
        U("VL"), _
        U("percent"), _
        1.5, _
        U("1.5"), _
        U("VL"), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.030|base"), _
        U("L1"), _
        U("DEMO.VL3"), _
        U("VL"), _
        U("quantity"), _
        1.02, _
        U("1.02"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.030|base"), _
        U("L2"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        0.01, _
        U("0.01"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.040|base"), _
        U("L1"), _
        U("DEMO.NC1"), _
        U("NC"), _
        U("quantity"), _
        5, _
        U("5"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    r = Array( _
        U("DEMO|D01|1|DEMO.040|base"), _
        U("L2"), _
        U("DEMO.M1"), _
        U("M"), _
        U("quantity"), _
        0.8, _
        U("0.8"), _
        U(""), _
        U("verified"), _
        U(""))
    rows.Add r
    Set Demo_tblCatLines = rows
End Function

Private Function Demo_tblCatNotes() As Collection
    Dim rows As New Collection, r As Variant
    r = Array( _
        U("N-GEN-1"), _
        U("document"), _
        U("DEMO-NOT-A-LEGAL-DOCUMENT"), _
        1, _
        U("[DEMO] Thuy\u1EBFt minh chung gi\u1EA3 l\u1EADp: s\u1ED1 li\u1EC7u ch\u1EC9 \u0111\u1EC3 ki\u1EC3m tra ph\u00E9p t\u00EDnh."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("N-CH2-1"), _
        U("chapter"), _
        U("Ch\u01B0\u01A1ng DEMO 2"), _
        1, _
        U("[DEMO] Thuy\u1EBFt minh ch\u01B0\u01A1ng gi\u1EA3 l\u1EADp: khi ch\u1ECDn m\u00E3 khoan ph\u1EE5t ph\u1EA3i x\u00E1c \u0111\u1ECBnh c\u1EA5p \u0111\u1EA5t \u0111\u00E1, \u0111\u01B0\u1EDDng k\u00EDnh, chi\u1EC1u s\u00E2u, lo\u1EA1i v\u1EEFa."), _
        U("DEMO"))
    rows.Add r
    r = Array( _
        U("N-010-1"), _
        U("norm"), _
        U("DEMO|D01|1|DEMO.010|base"), _
        1, _
        U("[DEMO] Ghi ch\u00FA m\u00E3 gi\u1EA3 l\u1EADp: m\u00E3 \u0111ang \u1EDF tr\u1EA1ng th\u00E1i c\u1EA7n ki\u1EC3m."), _
        U("DEMO"))
    rows.Add r
    Set Demo_tblCatNotes = rows
End Function

Private Function RowsToArray(ByVal cols As Variant, ByVal rows As Collection) As Variant
    Dim arr() As Variant, i As Long, j As Long, r As Variant, n As Long
    n = UBound(cols) - LBound(cols) + 1
    ReDim arr(1 To rows.Count + 1, 1 To n)
    For j = 1 To n
        arr(1, j) = cols(LBound(cols) + j - 1)
    Next j
    i = 1
    For Each r In rows
        i = i + 1
        For j = 1 To n
            arr(i, j) = r(LBound(r) + j - 1)
        Next j
    Next r
    RowsToArray = arr
End Function
