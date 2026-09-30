Attribute VB_Name = "modValidation"
' Kiem tra ho so tu du lieu dang co (khong doc sheet KIEM_TRA). Giong scripts/ta/validate.py.
' Muc BLOCKER/ERROR chan phat hanh; WARNING/INFO khong chan. Ket qua ghi vao tblChecks (chi la bao cao).
Option Explicit

Private mChecks As Collection

Private Sub AddCheck(ByVal severity As String, ByVal code As String, ByVal itemId As String, ByVal location As String, _
                     ParamArray args() As Variant)
    Dim msg As String, i As Long, fixText As String
    msg = TR("chk." & code)
    For i = LBound(args) To UBound(args)
        msg = Replace(msg, "{" & CStr(i) & "}", ToText(args(i)))
    Next i
    If HasTR("chk." & code & ".fix") Then fixText = TR("chk." & code & ".fix")
    mChecks.Add Array(severity, code, itemId, location, msg, fixText)
End Sub

' Chay toan bo kiem tra, ghi KIEM_TRA. Tra ve so loi chan (BLOCKER + ERROR).
Public Function ValidateProject(ByVal wb As Workbook, ByRef nBlock As Long, ByRef nError As Long, _
                                ByRef nWarn As Long) As Collection
    Dim loIT As ListObject, loAN As ListObject, loSN As ListObject, loPR As ListObject, loCR As ListObject
    Dim loAU As ListObject, loS As ListObject, loRS As ListObject
    Dim cIT As Object, cAN As Object, cSN As Object, cPR As Object, cCR As Object, cAU As Object, cS As Object, cRS As Object
    Dim dIT As Variant, dAN As Variant, dSN As Variant, dPR As Variant, dCR As Variant, dAU As Variant, dS As Variant, dRS As Variant
    Dim snapIdx As Object, itemIdx As Object, priceIdx As Object, audited As Object, used As Object
    Dim i As Long, j As Long, iid As String, sr As Long, loc As String, q As Variant, conv As Variant, v As Variant
    Dim pinned As String, g As Variant, explained As Boolean, pid As String, basis As String
    Dim ids() As String, kinds() As String, groups() As String, nLines As Long, errCode As String
    Dim incl As Long, notIncl As Long, rulesErr As String, pending As String, c As Variant

    Application.CalculateFull
    Set mChecks = New Collection
    Set loIT = GetTable(wb, "tblItems"): Set cIT = ColMap(loIT): dIT = TableData(loIT)
    Set loAN = GetTable(wb, "tblAnalysis"): Set cAN = ColMap(loAN): dAN = TableData(loAN)
    Set loSN = GetTable(wb, "tblSnapshotNorms"): Set cSN = ColMap(loSN): dSN = TableData(loSN)
    Set loPR = GetTable(wb, "tblPrices"): Set cPR = ColMap(loPR): dPR = TableData(loPR)
    Set loCR = GetTable(wb, "tblCostRules"): Set cCR = ColMap(loCR): dCR = TableData(loCR)
    Set loAU = GetTable(wb, "tblAudit"): Set cAU = ColMap(loAU): dAU = TableData(loAU)
    Set loS = GetTable(wb, "tblSummary"): Set cS = ColMap(loS): dS = TableData(loS)
    Set loRS = GetTable(wb, "tblResourceSummary"): Set cRS = ColMap(loRS): dRS = TableData(loRS)
    pinned = GetProjectValue(wb, "catalog_release_id")

    CheckDuplicates dIT, cIT, "tblItems", "item_id"
    CheckDuplicates dAN, cAN, "tblAnalysis", "analysis_id"
    CheckDuplicates dSN, cSN, "tblSnapshotNorms", "snapshot_id"
    CheckDuplicates dPR, cPR, "tblPrices", "price_id"
    CheckDuplicates dCR, cCR, "tblCostRules", "rule_id"
    CheckDuplicates TableData(GetTable(wb, "tblSnapshotLines")), ColMap(GetTable(wb, "tblSnapshotLines")), _
                    "tblSnapshotLines", "snapshot_line_id"

    Set snapIdx = IndexBy(dSN, cSN, "snapshot_id")
    Set itemIdx = IndexBy(dIT, cIT, "item_id")
    Set priceIdx = IndexBy(dPR, cPR, "price_id")

    ' ---- cong tac
    If Not IsEmpty(dIT) Then
        For i = 1 To UBound(dIT, 1)
            iid = Str0(dIT(i, cIT("item_id")))
            loc = "TIEN_LUONG!" & iid
            If Not snapIdx.Exists(Str0(dIT(i, cIT("snapshot_id")))) Then
                AddCheck "ERROR", "ORPHAN_SNAPSHOT", iid, loc, dIT(i, cIT("snapshot_id"))
                GoTo NextItem
            End If
            sr = snapIdx(Str0(dIT(i, cIT("snapshot_id"))))
            If CountLines(dAN, cAN, iid) = 0 Then AddCheck "ERROR", "NO_ANALYSIS_LINES", iid, loc
            q = dIT(i, cIT("input_quantity"))
            If Not IsNumberValue(q) Then
                AddCheck "BLOCKER", "MISSING_QUANTITY", iid, loc & ".input_quantity"
            ElseIf CDbl(q) < 0 Then
                If IsBlankValue(dIT(i, cIT("quantity_note"))) Then
                    AddCheck "BLOCKER", "NEGATIVE_QUANTITY", iid, loc & ".input_quantity", q
                Else
                    AddCheck "WARNING", "NEGATIVE_QUANTITY", iid, loc & ".input_quantity", q
                End If
            End If
            conv = dIT(i, cIT("unit_conversion"))
            If Not IsNumberValue(conv) Then
                AddCheck "BLOCKER", "INVALID_CONVERSION", iid, loc & ".unit_conversion", conv
            ElseIf CDbl(conv) <= 0 Then
                AddCheck "BLOCKER", "INVALID_CONVERSION", iid, loc & ".unit_conversion", conv
            Else
                CheckUnits iid, loc, Str0(dIT(i, cIT("input_unit"))), Str0(dSN(sr, cSN("base_unit"))), _
                           CDbl(conv), Not IsBlankValue(dIT(i, cIT("conversion_basis")))
            End If
            If IsTrue(dSN(sr, cSN("is_demo"))) Then AddCheck "BLOCKER", "DEMO_DATA", iid, loc
            If Str0(dSN(sr, cSN("status"))) <> "verified" Then
                AddCheck "BLOCKER", "NORM_NOT_VERIFIED", iid, loc, dSN(sr, cSN("code")), dSN(sr, cSN("status"))
            End If
            For Each g In Array("vl_status|VL", "nc_status|NC", "m_status|M")
                v = Str0(dSN(sr, cSN(Split(g, "|")(0))))
                If v <> "present" And v <> "none_verified" Then
                    AddCheck "BLOCKER", "GROUP_STATUS_UNKNOWN", iid, loc, dSN(sr, cSN("code")), Split(g, "|")(1)
                End If
            Next g
            If Len(pinned) > 0 And Str0(dSN(sr, cSN("catalog_release_id"))) <> pinned Then
                AddCheck "ERROR", "CATALOG_MISMATCH", iid, loc, dSN(sr, cSN("snapshot_id")), _
                         dSN(sr, cSN("catalog_release_id")), pinned
            End If
NextItem:
        Next i
    End If

    ' ---- dong chiet tinh
    Set audited = CreateObject("Scripting.Dictionary")
    If Not IsEmpty(dAU) Then
        For i = 1 To UBound(dAU, 1)
            If Not IsBlankValue(dAU(i, cAU("reason"))) Then
                audited(Str0(dAU(i, cAU("item_id"))) & "|" & Str0(dAU(i, cAU("field")))) = True
            End If
        Next i
    End If
    Set used = CreateObject("Scripting.Dictionary")
    If Not IsEmpty(dAN) Then
        For i = 1 To UBound(dAN, 1)
            iid = Str0(dAN(i, cAN("item_id")))
            loc = "CHIET_TINH!" & Str0(dAN(i, cAN("analysis_id")))
            If Not itemIdx.Exists(iid) Then AddCheck "ERROR", "ORPHAN_LINE", iid, loc, dAN(i, cAN("analysis_id"))
            v = Str0(dAN(i, cAN("status")))
            If v <> "verified" And v <> "not_applicable" Then
                AddCheck "BLOCKER", "LINE_NOT_VERIFIED", iid, loc, dAN(i, cAN("snapshot_line_id")), v
            End If
            v = dAN(i, cAN("adjustment_factor"))
            If IsNumberValue(v) Then
                If CDbl(v) <> 1 And Not audited.Exists(iid & "|adjustment_factor:" & Str0(dAN(i, cAN("snapshot_line_id")))) Then
                    AddCheck "BLOCKER", "FACTOR_WITHOUT_LOG", iid, loc, dAN(i, cAN("snapshot_line_id")), v
                End If
            End If
            explained = False
            If Str0(dAN(i, cAN("amount_kind"))) = "quantity" Then
                pid = Str0(dAN(i, cAN("price_id")))
                used(pid) = True
                If Len(pid) = 0 Then
                    AddCheck "BLOCKER", "MISSING_PRICE_ID", iid, loc, dAN(i, cAN("snapshot_line_id"))
                    explained = True
                ElseIf IsError(dAN(i, cAN("price"))) Then
                    AddCheck "BLOCKER", "MISSING_PRICE", iid, loc, dAN(i, cAN("resource_id")), pid
                    explained = True
                End If
            ElseIf Str0(dAN(i, cAN("amount_kind"))) = "percent" Then
                ItemLines dAN, cAN, iid, ids, kinds, groups, nLines
                basis = Str0(dAN(i, cAN("basis_ref")))
                If nLines > 0 Then
                    errCode = PercentBasisError(Str0(dAN(i, cAN("snapshot_line_id"))), basis, ids, kinds, groups)
                Else
                    errCode = "BASIS_NOT_FOUND"
                End If
                If Len(errCode) > 0 Then
                    Select Case errCode
                    Case "UNSUPPORTED_MULTI_BASIS", "BASIS_NOT_FOUND"
                        AddCheck "BLOCKER", errCode, iid, loc, dAN(i, cAN("snapshot_line_id")), basis
                    Case Else
                        AddCheck "BLOCKER", errCode, iid, loc, dAN(i, cAN("snapshot_line_id"))
                    End Select
                    explained = True
                ElseIf BasisHasError(dAN, cAN, iid, basis) Then
                    explained = True  ' loi day chuyen tu dong co so thieu gia: da bao o dong goc
                End If
            End If
            If IsError(dAN(i, cAN("cost"))) And Not explained Then
                If itemIdx.Exists(iid) Then
                    If IsNumberValue(dIT(itemIdx(iid), cIT("input_quantity"))) Then
                        AddCheck "ERROR", "FORMULA_ERROR", iid, loc & ".cost", loc, dAN(i, cAN("cost"))
                    End If
                Else
                    AddCheck "ERROR", "FORMULA_ERROR", iid, loc & ".cost", loc, dAN(i, cAN("cost"))
                End If
            End If
        Next i
    End If

    ' ---- gia dang dung
    If Not IsEmpty(dPR) Then
        For i = 1 To UBound(dPR, 1)
            pid = Str0(dPR(i, cPR("price_id")))
            If used.Exists(pid) Then
                loc = "GIA_DAU_VAO!" & pid
                If Str0(dPR(i, cPR("tax_basis"))) = "incl_vat" Then incl = incl + 1 Else notIncl = notIncl + 1
                q = dPR(i, cPR("quoted_price"))
                If IsNumberValue(q) Then
                    If CDbl(q) = 0 And (IsBlankValue(dPR(i, cPR("zero_reason"))) Or IsBlankValue(dPR(i, cPR("reviewer")))) Then
                        AddCheck "BLOCKER", "ZERO_PRICE_UNAPPROVED", "", loc, pid
                    End If
                End If
                v = Str0(dPR(i, cPR("includes_transport")))
                If (v = "yes" Or v = "n/a") And IsNumberValue(dPR(i, cPR("transport"))) Then
                    If CDbl(dPR(i, cPR("transport"))) <> 0 Then
                        AddCheck "WARNING", "DUPLICATE_TRANSPORT", "", loc, pid, dPR(i, cPR("transport"))
                    End If
                End If
            End If
        Next i
    End If
    If incl > 0 And notIncl > 0 Then AddCheck "WARNING", "MIXED_TAX_BASIS", "", "GIA_DAU_VAO", incl

    ' ---- quy tac chi phi va tong
    If IsEmpty(dCR) Then
        AddCheck "WARNING", "NO_RULES", "", "QUY_TAC_CP"
    Else
        OrderRules dCR, cCR, rulesErr
        If Len(rulesErr) > 0 Then AddCheck "ERROR", "RULES_INVALID", "", "QUY_TAC_CP", rulesErr
        For i = 1 To UBound(dCR, 1)
            If Len(Str0(dCR(i, cCR("rule_id")))) > 0 And Str0(dCR(i, cCR("status"))) <> "approved" Then
                If Len(pending) > 0 Then pending = pending & ", "
                pending = pending & Str0(dCR(i, cCR("rule_id")))
            End If
        Next i
        If Len(pending) > 0 Then
            AddCheck "BLOCKER", "PROFILE_NOT_APPROVED", "", "QUY_TAC_CP", GetProjectValue(wb, "cost_rule_profile_id"), pending
        End If
    End If
    CheckTotals dIT, cIT, dAN, cAN, dS, cS, dRS, cRS
    If mChecks.Count = 0 Then AddCheck "INFO", "OK", "", ""

    nBlock = 0: nError = 0: nWarn = 0
    For Each c In mChecks
        Select Case c(0)
        Case "BLOCKER": nBlock = nBlock + 1
        Case "ERROR": nError = nError + 1
        Case "WARNING": nWarn = nWarn + 1
        End Select
    Next c
    WriteChecks wb
    Set ValidateProject = mChecks
End Function

Private Sub CheckUnits(ByVal iid As String, ByVal loc As String, ByVal inputUnit As String, ByVal baseUnit As String, _
                       ByVal conv As Double, ByVal hasBasis As Boolean)
    Dim factor As Double, method As String, errCode As String
    ResolveConversion inputUnit, baseUnit, hasBasis, conv, factor, method, errCode
    Select Case errCode
    Case ""
        If method <> "manual" And Not SameNumber(factor, conv) Then
            AddCheck "BLOCKER", "CONVERSION_CONFLICT", iid, loc & ".unit_conversion", inputUnit, baseUnit, factor, conv
        End If
    Case "MISSING_PHYSICAL_CONVERSION"
        AddCheck "BLOCKER", errCode, iid, loc & ".conversion_basis", inputUnit, baseUnit
    Case "UNIT_DIMENSION_MISMATCH"
        AddCheck "BLOCKER", errCode, iid, loc & ".input_unit", inputUnit
    Case Else
        AddCheck "BLOCKER", "UNKNOWN_UNIT", iid, loc & ".input_unit", inputUnit
    End Select
End Sub

Private Sub CheckDuplicates(ByVal data As Variant, ByVal cm As Object, ByVal tableName As String, ByVal keyCol As String)
    Dim seen As Object, i As Long, k As String
    If IsEmpty(data) Then Exit Sub
    Set seen = CreateObject("Scripting.Dictionary")
    For i = 1 To UBound(data, 1)
        k = Str0(data(i, cm(keyCol)))
        If Len(k) > 0 Then
            If seen.Exists(k) Then
                AddCheck "ERROR", "DUPLICATE_ID", "", tableName & "[" & keyCol & "]", k, tableName
            Else
                seen.Add k, i
            End If
        End If
    Next i
End Sub

Private Function IndexBy(ByVal data As Variant, ByVal cm As Object, ByVal keyCol As String) As Object
    Dim d As Object, i As Long, k As String
    Set d = CreateObject("Scripting.Dictionary")
    If Not IsEmpty(data) Then
        For i = 1 To UBound(data, 1)
            k = Str0(data(i, cm(keyCol)))
            If Not d.Exists(k) Then d.Add k, i
        Next i
    End If
    Set IndexBy = d
End Function

Private Function CountLines(ByVal dAN As Variant, ByVal cAN As Object, ByVal iid As String) As Long
    Dim i As Long
    If IsEmpty(dAN) Then Exit Function
    For i = 1 To UBound(dAN, 1)
        If Str0(dAN(i, cAN("item_id"))) = iid Then CountLines = CountLines + 1
    Next i
End Function

Private Sub ItemLines(ByVal dAN As Variant, ByVal cAN As Object, ByVal iid As String, ByRef ids() As String, _
                      ByRef kinds() As String, ByRef groups() As String, ByRef n As Long)
    Dim i As Long
    n = 0
    ReDim ids(1 To UBound(dAN, 1))
    ReDim kinds(1 To UBound(dAN, 1))
    ReDim groups(1 To UBound(dAN, 1))
    For i = 1 To UBound(dAN, 1)
        If Str0(dAN(i, cAN("item_id"))) = iid Then
            n = n + 1
            ids(n) = Str0(dAN(i, cAN("snapshot_line_id")))
            kinds(n) = Str0(dAN(i, cAN("amount_kind")))
            groups(n) = Str0(dAN(i, cAN("group")))
        End If
    Next i
    If n > 0 Then
        ReDim Preserve ids(1 To n)
        ReDim Preserve kinds(1 To n)
        ReDim Preserve groups(1 To n)
    End If
End Sub

Private Function BasisHasError(ByVal dAN As Variant, ByVal cAN As Object, ByVal iid As String, ByVal basis As String) As Boolean
    Dim i As Long
    For i = 1 To UBound(dAN, 1)
        If Str0(dAN(i, cAN("item_id"))) = iid And Str0(dAN(i, cAN("amount_kind"))) = "quantity" Then
            If Str0(dAN(i, cAN("snapshot_line_id"))) = basis Or Str0(dAN(i, cAN("group"))) = basis Then
                If IsError(dAN(i, cAN("qty_cost"))) Then
                    BasisHasError = True
                    Exit Function
                End If
            End If
        End If
    Next i
End Function

Private Function IsTrue(ByVal v As Variant) As Boolean
    If IsError(v) Then Exit Function
    If VarType(v) = vbBoolean Then
        IsTrue = v
    Else
        IsTrue = (LCase$(Str0(v)) = "true")
    End If
End Function

' Tong truc tiep TONG_HOP = tong TIEN_LUONG = tong TONG_HOP_VT + dong % (chi so khi deu tinh duoc).
Private Sub CheckTotals(ByVal dIT As Variant, ByVal cIT As Object, ByVal dAN As Variant, ByVal cAN As Object, _
                        ByVal dS As Variant, ByVal cS As Object, ByVal dRS As Variant, ByVal cRS As Object)
    Dim t As Variant, i As Long, sItems As Double, sRes As Double, v As Variant
    If IsEmpty(dS) Or IsEmpty(dIT) Then Exit Sub
    For i = 1 To UBound(dS, 1)
        If Str0(dS(i, cS("cost_id"))) = "T" Then t = dS(i, cS("amount"))
    Next i
    If Not IsNumberValue(t) Then Exit Sub
    For i = 1 To UBound(dIT, 1)
        v = dIT(i, cIT("direct_cost"))
        If Not IsNumberValue(v) Then Exit Sub
        sItems = sItems + CDbl(v)
    Next i
    If Abs(sItems - CDbl(t)) > 0.5 Then
        AddCheck "ERROR", "INCONSISTENT_TOTALS", "", "TONG_HOP!T", "T", t, "SUM TIEN_LUONG", sItems
    End If
    If IsEmpty(dRS) Then Exit Sub
    For i = 1 To UBound(dRS, 1)
        v = dRS(i, cRS("cost"))
        If Not IsNumberValue(v) Then Exit Sub
        sRes = sRes + CDbl(v)
    Next i
    If Not IsEmpty(dAN) Then
        For i = 1 To UBound(dAN, 1)
            If Str0(dAN(i, cAN("amount_kind"))) = "percent" Then
                v = dAN(i, cAN("cost"))
                If Not IsNumberValue(v) Then Exit Sub
                sRes = sRes + CDbl(v)
            End If
        Next i
    End If
    If Abs(sRes - CDbl(t)) > 0.5 Then
        AddCheck "ERROR", "INCONSISTENT_TOTALS", "", "TONG_HOP_VT", "T", t, "SUM TONG_HOP_VT + %", sRes
    End If
End Sub

Private Sub WriteChecks(ByVal wb As Workbook)
    Dim lo As ListObject, cm As Object, data As Variant, i As Long, c As Variant
    Set lo = GetTable(wb, "tblChecks")
    Set cm = ColMap(lo)
    ClearTable lo
    If mChecks.Count = 0 Then Exit Sub
    data = NewRows(lo, mChecks.Count)
    i = 0
    For Each c In mChecks
        i = i + 1
        PutVal data, i, cm, "check_id", i
        PutVal data, i, cm, "severity", c(0)
        PutVal data, i, cm, "error_code", c(1)
        PutVal data, i, cm, "item_id", c(2)
        PutVal data, i, cm, "location", c(3)
        PutVal data, i, cm, "message", c(4)
        PutVal data, i, cm, "resolution", c(5)
        PutVal data, i, cm, "status", "open"
    Next c
    AppendRows lo, data
End Sub
