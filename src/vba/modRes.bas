Attribute VB_Name = "modRes"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

Private mKeys As Collection
Private mFold() As String
Private mFoldReady As Boolean

' Tra ve chuoi giao dien tieng Viet theo khoa (xem src/resources/strings_vi.json).
Public Function TR(ByVal key As String) As String
    If mKeys Is Nothing Then LoadStrings
    On Error GoTo Missing
    TR = mKeys(key)
    Exit Function
Missing:
    TR = "[" & key & "]"
End Function

Public Function HasTR(ByVal key As String) As Boolean
    Dim s As String
    If mKeys Is Nothing Then LoadStrings
    On Error GoTo Missing
    s = mKeys(key)
    HasTR = True
    Exit Function
Missing:
    HasTR = False
End Function

' Giai ma \uXXXX thanh ky tu Unicode.
Public Function U(ByVal s As String) As String
    Dim i As Long, n As Long, out As String, ch As String
    n = Len(s)
    i = 1
    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch = "\" And i + 5 <= n Then
            If Mid$(s, i + 1, 1) = "u" Then
                out = out & ChrW$(CLng("&H" & Mid$(s, i + 2, 4)))
                i = i + 6
            Else
                out = out & ch
                i = i + 1
            End If
        Else
            out = out & ch
            i = i + 1
        End If
    Loop
    U = out
End Function

Private Sub AddS(ByVal key As String, ByVal escaped As String)
    mKeys.Add U(escaped), key
End Sub

Private Sub LoadStrings()
    Dim s As String
    Set mKeys = New Collection
    AddS "app.name", "TA Estimate \u2013 Tr\u01B0\u1EDDng An"
    s = "\u00D4 n\u1EC1n v\u00E0ng ch\u1EEF xanh l\u00E0 \u00F4 nh\u1EADp. \u00D4 kh\u00E1c do add-in ghi ho\u1EB7c l\u00E0 c\u00F4ng th\u1EE9c Excel chu\u1EA9n \u2013 kh\u00F4ng s\u1EEDa t"
    s = s & "ay."
    AddS "sheet.note.input", s
    s = "B\u1EA3n sao \u0111\u1ECBnh m\u1EE9c t\u1EA1i th\u1EDDi \u0111i\u1EC3m ch\u00E8n. C\u1EADp nh\u1EADt th\u01B0 vi\u1EC7n kh\u00F4ng l\u00E0m \u0111\u1ED5i c\u00E1c d\u00F2ng n\u00E0"
    s = s & "y."
    AddS "sheet.note.snapshot", s
    AddS "sheet.note.checks", "B\u00E1o c\u00E1o do l\u1EC7nh Ki\u1EC3m tra ghi ra. C\u00F4ng th\u1EE9c d\u1EF1 to\u00E1n kh\u00F4ng l\u1EA5y s\u1ED1 t\u1EEB sheet n\u00E0y."
    AddS "sheet.note.summary", "M\u1ECDi s\u1ED1 ti\u1EC1n l\u00E0 c\u00F4ng th\u1EE9c Excel chu\u1EA9n; t\u1EAFt add-in v\u1EABn t\u00EDnh l\u1EA1i \u0111\u01B0\u1EE3c."
    AddS "banner.project", "C\u00F4ng tr\u00ECnh:"
    AddS "banner.demo", "S\u1ED1 m\u00E3 DEMO trong c\u00F4ng tr\u00ECnh:"
    AddS "banner.errors", "S\u1ED1 d\u00F2ng chi\u1EBFt t\u00EDnh l\u1ED7i (#N/A \u2013 thi\u1EBFu gi\u00E1, hao ph\u00ED ho\u1EB7c kh\u1ED1i l\u01B0\u1EE3ng):"
    AddS "banner.draft", "Chi ph\u00ED tr\u1EF1c ti\u1EBFp t\u1EA1m t\u00EDnh, b\u1ECF qua d\u00F2ng l\u1ED7i (ch\u1EC9 \u0111\u1EC3 tham kh\u1EA3o):"
    AddS "banner.status_prefix", "Tr\u1EA1ng th\u00E1i: "
    AddS "banner.status_demo", "B\u1EA2N NH\u00C1P \u2013 C\u00D3 D\u1EEE LI\u1EC6U DEMO, KH\u00D4NG \u0110\u01AF\u1EE2C PH\u00C1T H\u00C0NH"
    AddS "banner.status_error", "B\u1EA2N NH\u00C1P \u2013 C\u00D2N D\u00D2NG THI\u1EBEU GI\u00C1 HO\u1EB6C HAO PH\u00CD"
    AddS "banner.status_ok", "Ch\u01B0a ph\u00E1t h\u00E0nh \u2013 ch\u1EA1y l\u1EC7nh Ki\u1EC3m tra ph\u00E1t h\u00E0nh tr\u00EAn thanh Tr\u01B0\u1EDDng An"
    AddS "summary.VL", "Chi ph\u00ED v\u1EADt li\u1EC7u"
    AddS "summary.NC", "Chi ph\u00ED nh\u00E2n c\u00F4ng"
    AddS "summary.M", "Chi ph\u00ED m\u00E1y thi c\u00F4ng"
    AddS "summary.T", "Chi ph\u00ED tr\u1EF1c ti\u1EBFp (VL + NC + M)"
    AddS "summary.scope_all", "To\u00E0n b\u1ED9"
    AddS "summary.source_ct", "T\u1ED5ng t\u1EEB CHIET_TINH"
    AddS "label.percent", "Kho\u1EA3n % ({0}% tr\u00EAn {1})"
    AddS "audit.insert_source", "{0} rev {1}"
    s = "Workbook \u0111ang ch\u1ECDn kh\u00F4ng ph\u1EA3i file c\u00F4ng tr\u00ECnh TA Estimate (kh\u00F4ng c\u00F3 b\u1EA3ng tblItems).\u000AH\u00E3y m\u1EDF file c\u00F4ng tr\u00ECnh ho\"
    s = s & "u1EB7c b\u1EA5m 'C\u00F4ng tr\u00ECnh m\u1EDBi'."
    AddS "msg.no_project", s
    AddS "msg.schema_mismatch", "File c\u00F4ng tr\u00ECnh c\u00F3 c\u1EA5u tr\u00FAc {0}, add-in c\u1EA7n {1}. B\u1EA3ng/c\u1ED9t thi\u1EBFu: {2}"
    AddS "msg.catalog_not_loaded", "Ch\u01B0a n\u1EA1p th\u01B0 vi\u1EC7n \u0111\u1ECBnh m\u1EE9c. B\u1EA5m 'N\u1EA1p th\u01B0 vi\u1EC7n' tr\u00EAn thanh Tr\u01B0\u1EDDng An."
    AddS "msg.catalog_pick", "Ch\u1ECDn file th\u01B0 vi\u1EC7n \u0111\u1ECBnh m\u1EE9c (Catalog_*.xlsx)"
    AddS "msg.catalog_loaded", "\u0110\u00E3 n\u1EA1p th\u01B0 vi\u1EC7n {0}: {1} m\u00E3, {2} d\u00F2ng hao ph\u00ED, {3} ghi ch\u00FA ({4} ms)."
    AddS "msg.catalog_is_demo", "\u000AC\u1EA2NH B\u00C1O: \u0111\u00E2y l\u00E0 b\u1ED9 DEMO \u2013 s\u1ED1 gi\u1EA3 l\u1EADp, kh\u00F4ng d\u00F9ng l\u1EADp h\u1ED3 s\u01A1 th\u1EADt."
    AddS "msg.catalog_invalid", "Th\u01B0 vi\u1EC7n kh\u00F4ng \u0111\u00FAng c\u1EA5u tr\u00FAc: thi\u1EBFu b\u1EA3ng ho\u1EB7c c\u1ED9t {0}."
    s = "M\u00E3 {0} \u0111ang \u1EDF tr\u1EA1ng th\u00E1i C\u1EA6N KI\u1EC2M.\u000ACh\u1EC9 \u0111\u01B0\u1EE3c ch\u00E8n cho b\u1EA3n nh\u00E1p v\u00E0 s\u1EBD b\u1ECB ch\u1EB7n khi ph\u0"
    s = s & "0E1t h\u00E0nh. Ti\u1EBFp t\u1EE5c ch\u00E8n?"
    AddS "msg.insert_needs_review", s
    s = "M\u00E3 {0} \u0111ang \u1EDF tr\u1EA1ng th\u00E1i C\u1EA6N KI\u1EC2M. H\u00E3y \u0111\u00E1nh d\u1EA5u 'Cho ph\u00E9p m\u00E3 c\u1EA7n ki\u1EC3m (b\u1EA3n nh\u00E1p)' n\u1EBFu mu\u"
    s = s & "1ED1n ch\u00E8n \u0111\u1EC3 th\u1EED."
    AddS "msg.insert_blocked", s
    s = "C\u00F4ng tr\u00ECnh \u0111\u00E3 ch\u1ED1t b\u1ED9 \u0111\u1ECBnh m\u1EE9c {0}, th\u01B0 vi\u1EC7n \u0111ang n\u1EA1p l\u00E0 {1}.\u000AAdd-in kh\u00F4ng t\u1EF1 \u0111\u1ED5i b\u"
    s = s & "1ED9 \u0111\u1ECBnh m\u1EE9c c\u1EE7a c\u00F4ng tr\u00ECnh."
    AddS "msg.catalog_mismatch", s
    AddS "msg.inserted", "\u0110\u00E3 ch\u00E8n {0} \u2013 d\u00F2ng {1}."
    AddS "msg.select_item", "H\u00E3y ch\u1ECDn m\u1ED9t \u00F4 n\u1EB1m trong d\u00F2ng c\u00F4ng t\u00E1c \u1EDF sheet TIEN_LUONG ho\u1EB7c CHIET_TINH."
    AddS "msg.factor_group", "Nh\u1EADp nh\u00F3m c\u1EA7n \u00E1p h\u1EC7 s\u1ED1 cho d\u00F2ng {0} (VL, NC ho\u1EB7c M):"
    AddS "msg.factor_value", "Nh\u1EADp h\u1EC7 s\u1ED1 cho nh\u00F3m {0} c\u1EE7a d\u00F2ng {1}.\u000AD\u00F9ng d\u1EA5u ch\u1EA5m th\u1EADp ph\u00E2n, v\u00ED d\u1EE5 1.1"
    AddS "msg.factor_reason", "Nh\u1EADp c\u0103n c\u1EE9 / l\u00FD do \u00E1p h\u1EC7 s\u1ED1 (b\u1EAFt bu\u1ED9c, ghi v\u00E0o NHAT_KY):"
    AddS "msg.factor_done", "\u0110\u00E3 \u00E1p h\u1EC7 s\u1ED1 {0} cho nh\u00F3m {1} c\u1EE7a d\u00F2ng {2} ({3} d\u00F2ng hao ph\u00ED). D\u00F2ng % kh\u00F4ng b\u1ECB nh\u00E2n th\u00EAm."
    AddS "msg.invalid_group", "Nh\u00F3m kh\u00F4ng h\u1EE3p l\u1EC7: {0}. Ch\u1EC9 nh\u1EADn VL, NC ho\u1EB7c M."
    AddS "msg.invalid_number", "S\u1ED1 kh\u00F4ng h\u1EE3p l\u1EC7: {0}\u000AD\u00F9ng d\u1EA5u ch\u1EA5m th\u1EADp ph\u00E2n, kh\u00F4ng d\u00F9ng d\u1EA5u ph\u00E2n c\u00E1ch h\u00E0ng ngh\u00ECn."
    AddS "msg.reason_required", "Ph\u1EA3i nh\u1EADp c\u0103n c\u1EE9 / l\u00FD do. Thao t\u00E1c \u0111\u00E3 h\u1EE7y."
    AddS "msg.cancelled", "\u0110\u00E3 h\u1EE7y thao t\u00E1c."
    AddS "msg.refreshed", "\u0110\u00E3 c\u1EADp nh\u1EADt TONG_HOP_VT ({0} d\u00F2ng) v\u00E0 TONG_HOP ({1} d\u00F2ng)."
    AddS "msg.rules_invalid", "Quy t\u1EAFc chi ph\u00ED kh\u00F4ng h\u1EE3p l\u1EC7: {0}\u000ATONG_HOP ch\u1EC9 ghi ph\u1EA7n chi ph\u00ED tr\u1EF1c ti\u1EBFp."
    AddS "msg.validate_done", "Ki\u1EC3m tra xong: {0} l\u1ED7i ch\u1EB7n ph\u00E1t h\u00E0nh, {1} l\u1ED7i, {2} c\u1EA3nh b\u00E1o.\u000AXem chi ti\u1EBFt \u1EDF sheet KIEM_TRA."
    s = "Kh\u00F4ng c\u00F3 l\u1ED7i ch\u1EB7n. H\u1ED3 s\u01A1 \u0111\u1EE7 \u0111i\u1EC1u ki\u1EC7n k\u1EF9 thu\u1EADt \u0111\u1EC3 ph\u00E1t h\u00E0nh.\u000AVi\u1EC7c ph\u00E1t h\u00E0nh"
    s = s & " ch\u00EDnh th\u1EE9c v\u1EABn c\u1EA7n k\u1EF9 s\u01B0 QS k\u00FD x\u00E1c nh\u1EADn."
    AddS "msg.issue_ok", s
    AddS "msg.issue_blocked", "KH\u00D4NG \u0110\u01AF\u1EE2C PH\u00C1T H\u00C0NH: c\u00F2n {0} l\u1ED7i ch\u1EB7n. Xem sheet KIEM_TRA."
    AddS "msg.selftest_done", "T\u1EF1 ki\u1EC3m tra xong: {0} \u0111\u1EA1t, {1} kh\u00F4ng \u0111\u1EA1t.\u000AK\u1EBFt qu\u1EA3 n\u1EB1m trong workbook m\u1EDBi m\u1EDF."
    AddS "msg.error", "L\u1ED7i {0}: {1}\u000AThao t\u00E1c: {2}\u000AThi\u1EBFt l\u1EADp Excel \u0111\u00E3 \u0111\u01B0\u1EE3c kh\u00F4i ph\u1EE5c."
    s = "\u0110\u00E3 t\u1EA1o khung c\u00F4ng tr\u00ECnh m\u1EDBi trong workbook '{0}'.\u000AL\u01B0u th\u00E0nh .xlsx \u0111\u1EC3 d\u00F9ng, ho\u1EB7c Excel Template (.xltx) \u0111\u1EC3"
    s = s & " l\u00E0m m\u1EABu."
    AddS "msg.template_built", s
    AddS "msg.backup_saved", "\u0110\u00E3 l\u01B0u b\u1EA3n sao l\u01B0u: {0}"
    AddS "msg.no_backup_unsaved", "File c\u00F4ng tr\u00ECnh ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u l\u1EA7n n\u00E0o n\u00EAn ch\u01B0a c\u00F3 b\u1EA3n sao l\u01B0u."
    AddS "msg.export_ok", "\u0110\u00E3 xu\u1EA5t b\u1EA3n g\u1EEDi \u0111i: {0}\u000AFile ch\u1EC9 ch\u1EE9a c\u00F4ng th\u1EE9c Excel chu\u1EA9n v\u00E0 b\u1EA3n sao \u0111\u1ECBnh m\u1EE9c."
    AddS "msg.export_blocked", "Kh\u00F4ng xu\u1EA5t \u0111\u01B0\u1EE3c: {0}"
    AddS "msg.form_missing", "Ch\u01B0a c\u00F3 c\u1EEDa s\u1ED5 tra c\u1EE9u (frmSearch) trong add-in. Build l\u1EA1i add-in theo docs/BUILD.md."
    AddS "frm.title", "Tra c\u1EE9u \u0111\u1ECBnh m\u1EE9c \u2013 TA Estimate"
    AddS "frm.query", "M\u00E3 hi\u1EC7u ho\u1EB7c t\u1EEB kh\u00F3a (g\u00F5 c\u00F3 d\u1EA5u ho\u1EB7c kh\u00F4ng d\u1EA5u):"
    AddS "frm.search", "T\u00ECm"
    AddS "frm.insert", "Ch\u00E8n v\u00E0o c\u00F4ng tr\u00ECnh"
    AddS "frm.close", "\u0110\u00F3ng"
    AddS "frm.allow_review", "Cho ph\u00E9p ch\u00E8n m\u00E3 c\u1EA7n ki\u1EC3m (ch\u1EC9 b\u1EA3n nh\u00E1p)"
    AddS "frm.ns", "B\u1ED9 ngu\u1ED3n:"
    AddS "frm.status", "Tr\u1EA1ng th\u00E1i:"
    AddS "frm.all", "(t\u1EA5t c\u1EA3)"
    AddS "frm.results", "{0} k\u1EBFt qu\u1EA3 \u2013 {1} ms"
    AddS "frm.no_results", "Kh\u00F4ng c\u00F3 k\u1EBFt qu\u1EA3."
    AddS "frm.qty", "Kh\u1ED1i l\u01B0\u1EE3ng:"
    AddS "frm.group", "H\u1EA1ng m\u1EE5c:"
    AddS "frm.detail.unit", "\u0110\u01A1n v\u1ECB \u0111\u1ECBnh m\u1EE9c: {0} (quy m\u00F4 {1} {2})"
    AddS "frm.detail.source", "Ngu\u1ED3n: {0} \u2013 v\u0103n b\u1EA3n {1} \u2013 revision {2} \u2013 tr\u1EA1ng th\u00E1i {3}"
    AddS "frm.detail.conditions", "\u0110i\u1EC1u ki\u1EC7n \u00E1p d\u1EE5ng: {0}"
    AddS "frm.detail.lines", "HAO PH\u00CD:"
    AddS "frm.detail.notes", "THUY\u1EBET MINH:"
    AddS "frm.detail.percent", "{0}% tr\u00EAn {1}"
    AddS "frm.detail.demo", "*** D\u1EEE LI\u1EC6U DEMO \u2013 S\u1ED0 GI\u1EA2 L\u1EACP ***"
    AddS "frm.detail.review", "*** C\u1EA6N KI\u1EC2M \u2013 ch\u1EB7n ph\u00E1t h\u00E0nh ch\u00EDnh th\u1EE9c ***"
    AddS "frm.detail.none_verified", "Nh\u00F3m {0}: kh\u00F4ng c\u00F3 hao ph\u00ED (\u0111\u00E3 x\u00E1c nh\u1EADn theo ngu\u1ED3n)"
    AddS "frm.detail.unknown", "Nh\u00F3m {0}: CH\u01AFA R\u00D5 \u2013 d\u1EEF li\u1EC7u c\u00F3 th\u1EC3 thi\u1EBFu"
    AddS "chk.MISSING_PRICE", "Thi\u1EBFu gi\u00E1 \u00E1p d\u1EE5ng cho t\u00E0i nguy\u00EAn {0} (m\u00E3 gi\u00E1 {1})."
    AddS "chk.MISSING_PRICE.fix", "Nh\u1EADp gi\u00E1 g\u1ED1c v\u00E0 c\u1EDD v\u1EADn chuy\u1EC3n \u1EDF GIA_DAU_VAO."
    AddS "chk.MISSING_PRICE_ID", "D\u00F2ng hao ph\u00ED {0} ch\u01B0a g\u00E1n m\u00E3 gi\u00E1."
    AddS "chk.ZERO_PRICE_UNAPPROVED", "Gi\u00E1 0 ch\u01B0a c\u00F3 l\u00FD do ho\u1EB7c ng\u01B0\u1EDDi x\u00E1c nh\u1EADn (m\u00E3 gi\u00E1 {0})."
    AddS "chk.DUPLICATE_TRANSPORT", "Gi\u00E1 {0} \u0111\u00E3 g\u1ED3m v\u1EADn chuy\u1EC3n nh\u01B0ng v\u1EABn nh\u1EADp c\u01B0\u1EDBc {1} \u2013 c\u01B0\u1EDBc kh\u00F4ng \u0111\u01B0\u1EE3c c\u1ED9ng."
    AddS "chk.DUPLICATE_TRANSPORT.fix", "X\u00F3a c\u01B0\u1EDBc ho\u1EB7c \u0111\u1ED5i c\u1EDD '\u0110\u00E3 g\u1ED3m VC' sang 'no' n\u1EBFu gi\u00E1 g\u1ED1c ch\u01B0a g\u1ED3m v\u1EADn chuy\u1EC3n."
    AddS "chk.MIXED_TAX_BASIS", "B\u1EA3ng gi\u00E1 tr\u1ED9n gi\u00E1 ch\u01B0a VAT v\u00E0 \u0111\u00E3 VAT ({0} d\u00F2ng \u0111\u00E3 VAT)."
    AddS "chk.MIXED_TAX_BASIS.fix", "\u0110\u01B0a gi\u00E1 v\u1EC1 c\u00F9ng c\u01A1 s\u1EDF thu\u1EBF theo ph\u01B0\u01A1ng ph\u00E1p c\u1EE7a h\u1ED3 s\u01A1 tr\u01B0\u1EDBc khi t\u1ED5ng h\u1EE3p."
    AddS "chk.MISSING_QUANTITY", "Ch\u01B0a nh\u1EADp kh\u1ED1i l\u01B0\u1EE3ng ho\u1EB7c kh\u1ED1i l\u01B0\u1EE3ng kh\u00F4ng ph\u1EA3i s\u1ED1."
    AddS "chk.NEGATIVE_QUANTITY", "Kh\u1ED1i l\u01B0\u1EE3ng \u00E2m: {0}."
    AddS "chk.INVALID_CONVERSION", "H\u1EC7 s\u1ED1 \u0111\u1ED5i \u0111\u01A1n v\u1ECB kh\u00F4ng h\u1EE3p l\u1EC7: {0}."
    AddS "chk.MISSING_PHYSICAL_CONVERSION", "\u0110\u01A1n v\u1ECB nh\u1EADp {0} kh\u00E1c \u0111\u01A1n v\u1ECB \u0111\u1ECBnh m\u1EE9c {1} nh\u01B0ng ch\u01B0a c\u00F3 c\u0103n c\u1EE9 \u0111\u1ED5i \u0111\u01A1n v\u1ECB."
    s = "Nh\u1EADp h\u1EC7 s\u1ED1 v\u00E0 c\u0103n c\u1EE9 \u1EDF c\u1ED9t 'C\u0103n c\u1EE9 \u0111\u1ED5i \u0110V'. Kh\u00F4ng t\u1EF1 \u0111\u1ED5i \u0111\u1EA5t nguy\u00EAn th\u1ED5/r\u"
    s = s & "1EDDi/\u0111\u1EA7m ch\u1EB7t."
    AddS "chk.MISSING_PHYSICAL_CONVERSION.fix", s
    AddS "chk.CONVERSION_CONFLICT", "H\u1EC7 s\u1ED1 \u0111\u1ED5i {0} \u2192 {1} ph\u1EA3i l\u00E0 {2}, \u0111ang nh\u1EADp {3}."
    AddS "chk.UNKNOWN_UNIT", "\u0110\u01A1n v\u1ECB {0} ch\u01B0a c\u00F3 trong b\u1EA3ng quy \u0111\u1ED5i."
    AddS "chk.UNIT_DIMENSION_MISMATCH", "\u0110\u01A1n v\u1ECB nh\u1EADp {0} kh\u00E1c \u0111\u1EA1i l\u01B0\u1EE3ng v\u1EDBi \u0111\u01A1n v\u1ECB \u0111\u1ECBnh m\u1EE9c."
    AddS "chk.DEMO_DATA", "C\u00F4ng t\u00E1c d\u00F9ng d\u1EEF li\u1EC7u DEMO (s\u1ED1 gi\u1EA3 l\u1EADp)."
    AddS "chk.DEMO_DATA.fix", "Thay b\u1EB1ng m\u00E3 t\u1EEB b\u1ED9 \u0111\u1ECBnh m\u1EE9c \u0111\u00E3 ph\u00E1t h\u00E0nh ch\u00EDnh th\u1EE9c."
    AddS "chk.NORM_NOT_VERIFIED", "M\u00E3 {0} c\u00F3 tr\u1EA1ng th\u00E1i {1} \u2013 ch\u01B0a \u0111\u01B0\u1EE3c QS x\u00E1c nh\u1EADn."
    AddS "chk.GROUP_STATUS_UNKNOWN", "M\u00E3 {0}: nh\u00F3m {1} kh\u00F4ng c\u00F3 hao ph\u00ED v\u00E0 ch\u01B0a \u0111\u01B0\u1EE3c x\u00E1c nh\u1EADn l\u00E0 kh\u00F4ng \u00E1p d\u1EE5ng."
    AddS "chk.LINE_NOT_VERIFIED", "D\u00F2ng hao ph\u00ED {0} c\u00F3 tr\u1EA1ng th\u00E1i {1}."
    AddS "chk.FORMULA_ERROR", "\u00D4 {0} \u0111ang l\u1ED7i {1}."
    AddS "chk.FORMULA_ERROR.fix", "Xem c\u00E1c l\u1ED7i kh\u00E1c c\u00F9ng d\u00F2ng (thi\u1EBFu gi\u00E1, kh\u1ED1i l\u01B0\u1EE3ng, hao ph\u00ED)."
    AddS "chk.PERCENT_WITHOUT_BASIS", "D\u00F2ng % {0} kh\u00F4ng c\u00F3 c\u01A1 s\u1EDF t\u00EDnh."
    AddS "chk.CIRCULAR_BASIS", "D\u00F2ng % {0} l\u1EA5y ch\u00EDnh n\u00F3 l\u00E0m c\u01A1 s\u1EDF."
    AddS "chk.BASIS_NOT_FOUND", "D\u00F2ng % {0}: kh\u00F4ng t\u00ECm th\u1EA5y d\u00F2ng/nh\u00F3m c\u01A1 s\u1EDF {1} trong c\u00F9ng c\u00F4ng t\u00E1c."
    AddS "chk.PERCENT_ON_PERCENT_UNSUPPORTED", "D\u00F2ng % {0} l\u1EA5y d\u00F2ng % kh\u00E1c l\u00E0m c\u01A1 s\u1EDF \u2013 ch\u01B0a h\u1ED7 tr\u1EE3."
    AddS "chk.UNSUPPORTED_MULTI_BASIS", "D\u00F2ng % {0} c\u00F3 nhi\u1EC1u d\u00F2ng c\u01A1 s\u1EDF ({1}) \u2013 b\u1EA3n n\u00E0y ch\u1EC9 h\u1ED7 tr\u1EE3 m\u1ED9t d\u00F2ng ho\u1EB7c m\u1ED9t nh\u00F3m."
    AddS "chk.DUPLICATE_ID", "Tr\u00F9ng kh\u00F3a {0} trong b\u1EA3ng {1}."
    AddS "chk.ORPHAN_LINE", "D\u00F2ng chi\u1EBFt t\u00EDnh {0} kh\u00F4ng thu\u1ED9c c\u00F4ng t\u00E1c n\u00E0o."
    AddS "chk.ORPHAN_SNAPSHOT", "C\u00F4ng t\u00E1c tr\u1ECF t\u1EDBi snapshot {0} kh\u00F4ng t\u1ED3n t\u1EA1i."
    AddS "chk.NO_ANALYSIS_LINES", "C\u00F4ng t\u00E1c kh\u00F4ng c\u00F3 d\u00F2ng chi\u1EBFt t\u00EDnh n\u00E0o."
    AddS "chk.FACTOR_WITHOUT_LOG", "D\u00F2ng {0} c\u00F3 h\u1EC7 s\u1ED1 {1} nh\u01B0ng NHAT_KY kh\u00F4ng c\u00F3 l\u00FD do."
    AddS "chk.INCONSISTENT_TOTALS", "T\u1ED5ng kh\u00F4ng kh\u1EDBp: {0} = {1} nh\u01B0ng {2} = {3}."
    AddS "chk.CATALOG_MISMATCH", "Snapshot {0} thu\u1ED9c b\u1ED9 {1}, c\u00F4ng tr\u00ECnh ch\u1ED1t b\u1ED9 {2}."
    AddS "chk.PROFILE_NOT_APPROVED", "B\u1ED9 quy t\u1EAFc chi ph\u00ED {0} c\u00F3 kho\u1EA3n ch\u01B0a \u0111\u01B0\u1EE3c duy\u1EC7t ({1})."
    AddS "chk.PROFILE_NOT_APPROVED.fix", "Ng\u01B0\u1EDDi c\u00F3 tr\u00E1ch nhi\u1EC7m ki\u1EC3m tra t\u1EF7 l\u1EC7, c\u0103n c\u1EE9 r\u1ED3i \u0111\u1ED5i tr\u1EA1ng th\u00E1i sang approved."
    AddS "chk.RULES_INVALID", "Quy t\u1EAFc chi ph\u00ED l\u1ED7i: {0}."
    AddS "chk.NO_RULES", "Ch\u01B0a khai b\u00E1o quy t\u1EAFc chi ph\u00ED (ch\u1EC9 c\u00F3 chi ph\u00ED tr\u1EF1c ti\u1EBFp)."
    AddS "chk.OK", "Kh\u00F4ng ph\u00E1t hi\u1EC7n l\u1ED7i."
    AddS "sev.BLOCKER", "CH\u1EB6N"
    AddS "sev.ERROR", "L\u1ED6I"
    AddS "sev.WARNING", "C\u1EA2NH B\u00C1O"
    AddS "sev.INFO", "TH\u00D4NG TIN"
End Sub

' Bang bo dau: moi cap = 4 ky tu hex ma Unicode + 1 ky tu ASCII thay the.
Private Function FoldPairs() As String
    Dim s As String
    s = "00B2200B3300C0a00C1a00C2a00C3a00C4a00C5a00C7c00C8e00C9e00CAe00CBe00CCi00CDi00CEi00CFi00D1n00D2o00D3o00D4o00D5o00D6o00D9u00DAu00DBu00DCu00DDy00E0a00E1a00E2a00E3a00E4a00E5a00E7c00E8e"
    s = s & "00E9e00EAe00EBe00ECi00EDi00EEi00EFi00F1n00F2o00F3o00F4o00F5o00F6o00F9u00FAu00FBu00FCu00FDy00FFy0100a0101a0102a0103a0104a0105a0106c0107c0108c0109c010Ac010Bc010Cc010Dc010Ed010Fd0110d"
    s = s & "0111d0112e0113e0114e0115e0116e0117e0118e0119e011Ae011Be011Cg011Dg011Eg011Fg0120g0121g0122g0123g0124h0125h0128i0129i012Ai012Bi012Ci012Di012Ei012Fi0130i0134j0135j0136k0137k0139l013Al"
    s = s & "013Bl013Cl013Dl013El0143n0144n0145n0146n0147n0148n014Co014Do014Eo014Fo0150o0151o0154r0155r0156r0157r0158r0159r015As015Bs015Cs015Ds015Es015Fs0160s0161s0162t0163t0164t0165t0168u0169u"
    s = s & "016Au016Bu016Cu016Du016Eu016Fu0170u0171u0172u0173u0174w0175w0176y0177y0178y0179z017Az017Bz017Cz017Dz017Ez01A0o01A1o01AFu01B0u01CDa01CEa01CFi01D0i01D1o01D2o01D3u01D4u01D5u01D6u01D7u"
    s = s & "01D8u01D9u01DAu01DBu01DCu01DEa01DFa01E0a01E1a01E6g01E7g01E8k01E9k01EAo01EBo01ECo01EDo01F0j01F4g01F5g01F8n01F9n01FAa01FBa0200a0201a0202a0203a0204e0205e0206e0207e0208i0209i020Ai020Bi"
    s = s & "020Co020Do020Eo020Fo0210r0211r0212r0213r0214u0215u0216u0217u0218s0219s021At021Bt021Eh021Fh0226a0227a0228e0229e022Ao022Bo022Co022Do022Eo022Fo0230o0231o0232y0233y1E00a1E01a1E02b1E03b"
    s = s & "1E04b1E05b1E06b1E07b1E08c1E09c1E0Ad1E0Bd1E0Cd1E0Dd1E0Ed1E0Fd1E10d1E11d1E12d1E13d1E14e1E15e1E16e1E17e1E18e1E19e1E1Ae1E1Be1E1Ce1E1De1E1Ef1E1Ff1E20g1E21g1E22h1E23h1E24h1E25h1E26h1E27h"
    s = s & "1E28h1E29h1E2Ah1E2Bh1E2Ci1E2Di1E2Ei1E2Fi1E30k1E31k1E32k1E33k1E34k1E35k1E36l1E37l1E38l1E39l1E3Al1E3Bl1E3Cl1E3Dl1E3Em1E3Fm1E40m1E41m1E42m1E43m1E44n1E45n1E46n1E47n1E48n1E49n1E4An1E4Bn"
    s = s & "1E4Co1E4Do1E4Eo1E4Fo1E50o1E51o1E52o1E53o1E54p1E55p1E56p1E57p1E58r1E59r1E5Ar1E5Br1E5Cr1E5Dr1E5Er1E5Fr1E60s1E61s1E62s1E63s1E64s1E65s1E66s1E67s1E68s1E69s1E6At1E6Bt1E6Ct1E6Dt1E6Et1E6Ft"
    s = s & "1E70t1E71t1E72u1E73u1E74u1E75u1E76u1E77u1E78u1E79u1E7Au1E7Bu1E7Cv1E7Dv1E7Ev1E7Fv1E80w1E81w1E82w1E83w1E84w1E85w1E86w1E87w1E88w1E89w1E8Ax1E8Bx1E8Cx1E8Dx1E8Ey1E8Fy1E90z1E91z1E92z1E93z"
    s = s & "1E94z1E95z1E96h1E97t1E98w1E99y1EA0a1EA1a1EA2a1EA3a1EA4a1EA5a1EA6a1EA7a1EA8a1EA9a1EAAa1EABa1EACa1EADa1EAEa1EAFa1EB0a1EB1a1EB2a1EB3a1EB4a1EB5a1EB6a1EB7a1EB8e1EB9e1EBAe1EBBe1EBCe1EBDe"
    s = s & "1EBEe1EBFe1EC0e1EC1e1EC2e1EC3e1EC4e1EC5e1EC6e1EC7e1EC8i1EC9i1ECAi1ECBi1ECCo1ECDo1ECEo1ECFo1ED0o1ED1o1ED2o1ED3o1ED4o1ED5o1ED6o1ED7o1ED8o1ED9o1EDAo1EDBo1EDCo1EDDo1EDEo1EDFo1EE0o1EE1o"
    s = s & "1EE2o1EE3o1EE4u1EE5u1EE6u1EE7u1EE8u1EE9u1EEAu1EEBu1EECu1EEDu1EEEu1EEFu1EF0u1EF1u1EF2y1EF3y1EF4y1EF5y1EF6y1EF7y1EF8y1EF9y"
    FoldPairs = s
End Function

' Tra ky tu thay the cho ma Unicode ("" neu khong co trong bang).
Public Function FoldChar(ByVal code As Long) As String
    Dim p As String, i As Long
    If Not mFoldReady Then
        ReDim mFold(0 To &H1EFF)
        p = FoldPairs()
        For i = 1 To Len(p) Step 5
            mFold(CLng("&H" & Mid$(p, i, 4))) = Mid$(p, i + 4, 1)
        Next i
        mFoldReady = True
    End If
    If code >= 0 And code <= &H1EFF Then FoldChar = mFold(code)
End Function
