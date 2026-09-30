Attribute VB_Name = "modEstimate"
' Chen cong tac, ap he so, dung lai tong hop. Logic phai giong scripts/ta/project.py
' (Python dung de kiem chung cong thuc bang LibreOffice).
Option Explicit

' Chen mot ma dinh muc vao cong trinh. Tra ve item_id moi.
' qty: so hoac Empty (chua nhap -> cong thuc bao #N/A, khong thanh 0).
Public Function InsertNorm(ByVal wb As Workbook, ByVal cat As CCatalog, ByVal normId As String, _
                           ByVal qty As Variant, ByVal inputUnit As String, ByVal conversion As Variant, _
                           ByVal conversionBasis As String, ByVal groupId As String, _
                           ByVal allowReview As Boolean) As String
    Dim r As Long, pinned As String, sid As String, iid As String, code As String, st As String
    Dim loSN As ListObject, loSL As ListObject, loNT As ListObject, loIT As ListObject
    Dim loAN As ListObject, loPR As ListObject
    Dim cmSN As Object, cmSL As Object, cmNT As Object, cmIT As Object, cmAN As Object, cmPR As Object
    Dim lines As Collection, notes As Collection, lr As Variant, nr As Variant
    Dim dSN As Variant, dSL As Variant, dNT As Variant, dIT As Variant, dAN As Variant, dPR As Variant
    Dim i As Long, anNum As Long, kind As String, resId As String, priceId As String, newPrices As Collection
    Dim p As Variant, baseUnit As String

    r = cat.FindNormRow(normId)
    If r = 0 Then Err.Raise ERR_NOT_FOUND, "InsertNorm", "norm_id " & normId
    code = Str0(cat.NormValue(r, "code"))
    st = Str0(cat.NormValue(r, "status"))
    If st <> "verified" And Not allowReview Then
        Err.Raise ERR_BLOCKED, "InsertNorm", Fmt(TR("msg.insert_blocked"), code)
    End If
    pinned = GetProjectValue(wb, "catalog_release_id")
    If Len(pinned) = 0 Then
        SetProjectValue wb, "catalog_release_id", cat.ReleaseId
    ElseIf pinned <> cat.ReleaseId Then
        Err.Raise ERR_BLOCKED, "InsertNorm", Fmt(TR("msg.catalog_mismatch"), pinned, cat.ReleaseId)
    End If

    Set loSN = GetTable(wb, "tblSnapshotNorms"): Set cmSN = ColMap(loSN)
    Set loSL = GetTable(wb, "tblSnapshotLines"): Set cmSL = ColMap(loSL)
    Set loNT = GetTable(wb, "tblSnapshotNotes"): Set cmNT = ColMap(loNT)
    Set loIT = GetTable(wb, "tblItems"): Set cmIT = ColMap(loIT)
    Set loAN = GetTable(wb, "tblAnalysis"): Set cmAN = ColMap(loAN)
    Set loPR = GetTable(wb, "tblPrices"): Set cmPR = ColMap(loPR)

    sid = MakeId("SN", NextIdNumber(loSN, "snapshot_id", "SN"), 4)
    iid = MakeId("IT", NextIdNumber(loIT, "item_id", "IT"), 4)
    baseUnit = Str0(cat.NormValue(r, "base_unit"))

    ' 1. Snapshot dinh muc (ban sao bat bien cho cong trinh)
    dSN = NewRows(loSN, 1)
    PutVal dSN, 1, cmSN, "snapshot_id", sid
    PutVal dSN, 1, cmSN, "norm_id", normId
    PutVal dSN, 1, cmSN, "catalog_release_id", cat.ReleaseId
    PutVal dSN, 1, cmSN, "namespace", Str0(cat.NormValue(r, "namespace"))
    PutVal dSN, 1, cmSN, "document_id", Str0(cat.NormValue(r, "document_id"))
    PutVal dSN, 1, cmSN, "catalog_revision", Str0(cat.NormValue(r, "revision"))
    PutVal dSN, 1, cmSN, "code", code
    PutVal dSN, 1, cmSN, "description", Str0(cat.NormValue(r, "name"))
    PutVal dSN, 1, cmSN, "source_unit_text", Str0(cat.NormValue(r, "source_unit_text"))
    PutVal dSN, 1, cmSN, "base_unit", baseUnit
    PutVal dSN, 1, cmSN, "norm_basis_qty", cat.NormValue(r, "norm_basis_qty")
    PutVal dSN, 1, cmSN, "vl_status", Str0(cat.NormValue(r, "vl_status"))
    PutVal dSN, 1, cmSN, "nc_status", Str0(cat.NormValue(r, "nc_status"))
    PutVal dSN, 1, cmSN, "m_status", Str0(cat.NormValue(r, "m_status"))
    PutVal dSN, 1, cmSN, "conditions", Str0(cat.NormValue(r, "conditions"))
    PutVal dSN, 1, cmSN, "source_ref", Str0(cat.NormValue(r, "source_ref"))
    PutVal dSN, 1, cmSN, "status", st
    PutVal dSN, 1, cmSN, "is_demo", cat.NormIsDemo(r)
    PutVal dSN, 1, cmSN, "pinned_at", NowText()

    ' 2. Dong hao phi cua snapshot va dong chiet tinh
    Set lines = cat.LineRows(normId)
    Set newPrices = New Collection
    anNum = NextIdNumber(loAN, "analysis_id", "AN")
    If lines.Count > 0 Then
        dSL = NewRows(loSL, lines.Count)
        dAN = NewRows(loAN, lines.Count)
        i = 0
        For Each lr In lines
            i = i + 1
            kind = Str0(cat.LineValue(lr, "amount_kind"))
            resId = Str0(cat.LineValue(lr, "resource_id"))
            PutVal dSL, i, cmSL, "snapshot_line_id", sid & "." & Str0(cat.LineValue(lr, "line_id"))
            PutVal dSL, i, cmSL, "snapshot_id", sid
            PutVal dSL, i, cmSL, "local_line_id", Str0(cat.LineValue(lr, "line_id"))
            PutVal dSL, i, cmSL, "resource_id", resId
            PutVal dSL, i, cmSL, "resource_name", LineLabel(cat, lr, kind, resId)
            PutVal dSL, i, cmSL, "resource_unit", LineUnit(cat, kind, resId)
            PutVal dSL, i, cmSL, "group", Str0(cat.LineValue(lr, "group"))
            PutVal dSL, i, cmSL, "amount_kind", kind
            PutVal dSL, i, cmSL, "amount", cat.LineValue(lr, "amount")
            PutVal dSL, i, cmSL, "amount_text", Str0(cat.LineValue(lr, "amount_text"))
            PutVal dSL, i, cmSL, "basis_ref", GlobalBasis(sid, Str0(cat.LineValue(lr, "basis_ref")))
            PutVal dSL, i, cmSL, "status", LineStatus(cat, lr, st)
            PutVal dSL, i, cmSL, "source_ref", Str0(cat.LineValue(lr, "source_ref"))

            PutVal dAN, i, cmAN, "analysis_id", MakeId("AN", anNum + i - 1, 6)
            PutVal dAN, i, cmAN, "item_id", iid
            PutVal dAN, i, cmAN, "snapshot_line_id", sid & "." & Str0(cat.LineValue(lr, "line_id"))
            PutVal dAN, i, cmAN, "resource_id", resId
            PutVal dAN, i, cmAN, "resource_spec", LineLabel(cat, lr, kind, resId)
            PutVal dAN, i, cmAN, "group", Str0(cat.LineValue(lr, "group"))
            PutVal dAN, i, cmAN, "amount_kind", kind
            PutVal dAN, i, cmAN, "resource_unit", LineUnit(cat, kind, resId)
            PutVal dAN, i, cmAN, "adjustment_factor", 1
            PutVal dAN, i, cmAN, "basis_ref", GlobalBasis(sid, Str0(cat.LineValue(lr, "basis_ref")))
            PutVal dAN, i, cmAN, "status", LineStatus(cat, lr, st)
            If kind = "quantity" Then
                priceId = "P." & resId
                PutVal dAN, i, cmAN, "price_id", priceId
                If FindRow(loPR, "price_id", priceId) = 0 And Not InCollection(newPrices, priceId) Then
                    newPrices.Add priceId, priceId
                End If
            End If
        Next lr
    End If

    ' 3. Thuyet minh ap dung
    Set notes = cat.NoteRowsFor(r)

    ' 4. Ghi theo thu tu: snapshot -> dong -> ghi chu -> tien luong -> chiet tinh -> gia
    AppendRows loSN, dSN
    If lines.Count > 0 Then AppendRows loSL, dSL
    If notes.Count > 0 Then
        dNT = NewRows(loNT, notes.Count)
        i = 0
        For Each nr In notes
            i = i + 1
            PutVal dNT, i, cmNT, "note_id", sid & "." & Str0(cat.NoteValue(nr, "note_id"))
            PutVal dNT, i, cmNT, "snapshot_id", sid
            PutVal dNT, i, cmNT, "scope", Str0(cat.NoteValue(nr, "scope"))
            PutVal dNT, i, cmNT, "text", Str0(cat.NoteValue(nr, "text"))
            PutVal dNT, i, cmNT, "source_ref", Str0(cat.NoteValue(nr, "source_ref"))
        Next nr
        AppendRows loNT, dNT
    End If

    dIT = NewRows(loIT, 1)
    PutVal dIT, 1, cmIT, "item_id", iid
    PutVal dIT, 1, cmIT, "group_id", groupId
    PutVal dIT, 1, cmIT, "code", code
    PutVal dIT, 1, cmIT, "description", Str0(cat.NormValue(r, "name"))
    PutVal dIT, 1, cmIT, "input_unit", IIf(Len(inputUnit) > 0, inputUnit, baseUnit)
    PutVal dIT, 1, cmIT, "input_quantity", qty
    PutVal dIT, 1, cmIT, "unit_conversion", conversion
    PutVal dIT, 1, cmIT, "conversion_basis", conversionBasis
    PutVal dIT, 1, cmIT, "quantity_note", ""
    PutVal dIT, 1, cmIT, "norm_id", normId
    PutVal dIT, 1, cmIT, "snapshot_id", sid
    AppendRows loIT, dIT
    If lines.Count > 0 Then AppendRows loAN, dAN

    If newPrices.Count > 0 Then
        dPR = NewRows(loPR, newPrices.Count)
        i = 0
        For Each p In newPrices
            i = i + 1
            resId = Mid$(CStr(p), 3)
            PutVal dPR, i, cmPR, "price_id", CStr(p)
            PutVal dPR, i, cmPR, "resource_id", resId
            PutVal dPR, i, cmPR, "group", Str0(cat.ResourceValue(resId, "group"))
            PutVal dPR, i, cmPR, "spec", Str0(cat.ResourceValue(resId, "name"))
            PutVal dPR, i, cmPR, "unit", Str0(cat.ResourceValue(resId, "unit"))
        Next p
        AppendRows loPR, dPR
    End If

    LogAudit wb, "insert_item", iid, "norm_id", "", normId, "", _
             Fmt(TR("audit.insert_source"), cat.NormValue(r, "document_id"), cat.NormValue(r, "revision"))
    InsertNorm = iid
End Function

Private Function LineLabel(ByVal cat As CCatalog, ByVal lr As Long, ByVal kind As String, ByVal resId As String) As String
    If kind = "quantity" Then
        LineLabel = Str0(cat.ResourceValue(resId, "name"))
    Else
        LineLabel = Fmt(TR("label.percent"), cat.LineValue(lr, "amount_text"), cat.LineValue(lr, "basis_ref"))
    End If
End Function

Private Function LineUnit(ByVal cat As CCatalog, ByVal kind As String, ByVal resId As String) As String
    If kind = "quantity" Then
        LineUnit = Str0(cat.ResourceValue(resId, "unit"))
    Else
        LineUnit = "%"
    End If
End Function

Private Function LineStatus(ByVal cat As CCatalog, ByVal lr As Long, ByVal normStatus As String) As String
    LineStatus = Str0(cat.LineValue(lr, "status"))
    If Len(LineStatus) = 0 Then LineStatus = normStatus
End Function

' basis_ref cua catalog ("L1" hoac "VL" hoac "L1;L2") -> khoa trong cong trinh ("SN0001.L1", "VL").
Public Function GlobalBasis(ByVal sid As String, ByVal basis As String) As String
    Dim parts As Variant, i As Long, out As String, tok As String
    If Len(basis) = 0 Then Exit Function
    parts = Split(basis, ";")
    For i = LBound(parts) To UBound(parts)
        tok = Trim$(CStr(parts(i)))
        If Len(tok) > 0 Then
            If tok <> "VL" And tok <> "NC" And tok <> "M" Then tok = sid & "." & tok
            If Len(out) > 0 Then out = out & ";"
            out = out & tok
        End If
    Next i
    GlobalBasis = out
End Function

Private Function InCollection(ByVal col As Collection, ByVal key As String) As Boolean
    Dim v As Variant
    On Error GoTo NotFound
    v = col(key)
    InCollection = True
    Exit Function
NotFound:
    InCollection = False
End Function

' ---------------------------------------------------------------- he so dieu chinh

' Ap he so cho moi dong quantity cua mot nhom trong mot cong tac (khong nhan them dong %).
' Moi dong duoc ghi NHAT_KY voi gia tri truoc/sau va ly do. Tra ve so dong da sua.
Public Function ApplyFactor(ByVal wb As Workbook, ByVal itemId As String, ByVal grp As String, _
                            ByVal factor As Double, ByVal reason As String, ByVal sourceRef As String) As Long
    Dim lo As ListObject, data As Variant, cm As Object, i As Long, n As Long, events() As Variant, before As Variant
    If grp <> "VL" And grp <> "NC" And grp <> "M" Then Err.Raise ERR_INPUT, "ApplyFactor", Fmt(TR("msg.invalid_group"), grp)
    If Len(Trim$(reason)) = 0 Then Err.Raise ERR_INPUT, "ApplyFactor", TR("msg.reason_required")
    If factor <= 0 Then Err.Raise ERR_INPUT, "ApplyFactor", Fmt(TR("msg.invalid_number"), factor)
    Set lo = GetTable(wb, "tblAnalysis")
    Set cm = ColMap(lo)
    data = TableData(lo)
    If IsEmpty(data) Then Exit Function
    ReDim events(0 To UBound(data, 1))
    For i = 1 To UBound(data, 1)
        If Str0(data(i, cm("item_id"))) = itemId And Str0(data(i, cm("group"))) = grp And _
           Str0(data(i, cm("amount_kind"))) = "quantity" Then
            before = data(i, cm("adjustment_factor"))
            lo.DataBodyRange.Cells(i, cm("adjustment_factor")).Value2 = factor
            events(n) = Array("apply_factor", itemId, "adjustment_factor:" & Str0(data(i, cm("snapshot_line_id"))), _
                              before, factor, reason, sourceRef)
            n = n + 1
        End If
    Next i
    If n > 0 Then
        ReDim Preserve events(0 To n - 1)
        LogAuditMany wb, events
    End If
    ApplyFactor = n
End Function

' Lay item_id cua dong dang chon tren TIEN_LUONG hoac CHIET_TINH ("" neu khong xac dinh duoc).
Public Function SelectedItemId(ByVal wb As Workbook) As String
    Dim cell As Range, lo As ListObject, idx As Long
    On Error GoTo Done
    If Not ActiveSheet.Parent Is wb Then Exit Function
    Set cell = ActiveCell
    For Each lo In cell.Worksheet.ListObjects
        If lo.Name = "tblItems" Or lo.Name = "tblAnalysis" Then
            If Not lo.DataBodyRange Is Nothing Then
                If Not Intersect(cell, lo.DataBodyRange) Is Nothing Then
                    idx = cell.Row - lo.DataBodyRange.Row + 1
                    SelectedItemId = Str0(lo.DataBodyRange.Cells(idx, ColIdx(lo, "item_id")).Value2)
                    Exit Function
                End If
            End If
        End If
    Next lo
Done:
End Function

' ---------------------------------------------------------------- tong hop

' Dung lai TONG_HOP_VT: moi cap (resource_id, price_id) cua dong quantity mot dong; so lieu la cong thuc.
Public Function RefreshResourceSummary(ByVal wb As Workbook) As Long
    Dim loAN As ListObject, loRS As ListObject, cmAN As Object, cmRS As Object, data As Variant
    Dim seen As Object, keys As Collection, i As Long, key As String, out As Variant, k As Variant, r As Long
    Set loAN = GetTable(wb, "tblAnalysis"): Set cmAN = ColMap(loAN)
    Set loRS = GetTable(wb, "tblResourceSummary"): Set cmRS = ColMap(loRS)
    data = TableData(loAN)
    ClearTable loRS
    If IsEmpty(data) Then Exit Function
    Set seen = CreateObject("Scripting.Dictionary")
    Set keys = New Collection
    For i = 1 To UBound(data, 1)
        If Str0(data(i, cmAN("amount_kind"))) = "quantity" Then
            key = Str0(data(i, cmAN("resource_id"))) & "|" & Str0(data(i, cmAN("price_id")))
            If Not seen.Exists(key) Then
                seen.Add key, i
                keys.Add key
            End If
        End If
    Next i
    If keys.Count = 0 Then Exit Function
    out = NewRows(loRS, keys.Count)
    r = 0
    For Each k In keys
        r = r + 1
        i = seen(k)
        PutVal out, r, cmRS, "resource_price_key", CStr(k)
        PutVal out, r, cmRS, "resource_id", Str0(data(i, cmAN("resource_id")))
        PutVal out, r, cmRS, "group", Str0(data(i, cmAN("group")))
        PutVal out, r, cmRS, "spec", Str0(data(i, cmAN("resource_spec")))
        PutVal out, r, cmRS, "unit", Str0(data(i, cmAN("resource_unit")))
        PutVal out, r, cmRS, "price_id", Str0(data(i, cmAN("price_id")))
    Next k
    AppendRows loRS, out
    RefreshResourceSummary = keys.Count
End Function

' Dung lai TONG_HOP: VL, NC, M, T roi cac quy tac theo thu tu topo. Tham chieu o truc tiep de QS doc duoc.
' Quy tac loi -> bao loi, TONG_HOP chi co chi phi truc tiep.
Public Function RefreshSummary(ByVal wb As Workbook, ByRef rulesError As String) As Long
    Dim loS As ListObject, cmS As Object, loR As ListObject, cmR As Object, rules As Variant, order As Variant
    Dim n As Long, out As Variant, i As Long, g As Variant, rowOf As Object, firstRow As Long, amountCol As Long
    Dim rateCol As Long, ws As Worksheet, rr As Long, refs As Variant, j As Long, baseExpr As String
    Dim rid As String, rtype As String, cell As Range, expr As String

    Set loS = GetTable(wb, "tblSummary"): Set cmS = ColMap(loS)
    Set loR = GetTable(wb, "tblCostRules"): Set cmR = ColMap(loR)
    rules = TableData(loR)
    order = OrderRules(rules, cmR, rulesError)
    If Len(rulesError) > 0 Then order = Empty

    n = 4
    If Not IsEmpty(order) Then n = n + UBound(order)
    ClearTable loS
    out = NewRows(loS, n)
    i = 0
    For Each g In Array("VL", "NC", "M")
        i = i + 1
        PutVal out, i, cmS, "cost_id", CStr(g)
        PutVal out, i, cmS, "item_group", TR("summary.scope_all")
        PutVal out, i, cmS, "cost_label", TR("summary." & g)
        PutVal out, i, cmS, "basis", "CHIET_TINH"
        PutVal out, i, cmS, "source_ref", TR("summary.source_ct")
        PutVal out, i, cmS, "status", "auto"
    Next g
    i = i + 1
    PutVal out, i, cmS, "cost_id", "T"
    PutVal out, i, cmS, "item_group", TR("summary.scope_all")
    PutVal out, i, cmS, "cost_label", TR("summary.T")
    PutVal out, i, cmS, "basis", "VL;NC;M"
    PutVal out, i, cmS, "status", "auto"
    If Not IsEmpty(order) Then
        For j = 1 To UBound(order)
            rr = order(j)
            i = i + 1
            PutVal out, i, cmS, "cost_id", Str0(rules(rr, cmR("rule_id")))
            PutVal out, i, cmS, "item_group", TR("summary.scope_all")
            PutVal out, i, cmS, "cost_label", Str0(rules(rr, cmR("label")))
            PutVal out, i, cmS, "basis", Str0(rules(rr, cmR("base_refs")))
            PutVal out, i, cmS, "source_ref", Str0(rules(rr, cmR("source_ref")))
            PutVal out, i, cmS, "status", Str0(rules(rr, cmR("status")))
        Next j
    End If
    AppendRows loS, out

    ' Cong thuc (tham chieu o truc tiep, sinh sau khi biet so dong)
    Set ws = loS.Parent
    Set rowOf = CreateObject("Scripting.Dictionary")
    firstRow = loS.DataBodyRange.Row
    amountCol = loS.Range.Column + cmS("amount") - 1
    rateCol = loS.Range.Column + cmS("rate") - 1
    For i = 1 To n
        rowOf(Str0(loS.DataBodyRange.Cells(i, cmS("cost_id")).Value2)) = firstRow + i - 1
    Next i
    For Each g In Array("VL", "NC", "M")
        ws.Cells(rowOf(g), amountCol).Formula = Replace(FormulaFor("summary.group_sum"), "{GROUP}", CStr(g))
    Next g
    ws.Cells(rowOf("T"), amountCol).Formula = "=" & CellRef(ws, rowOf("VL"), amountCol) & "+" & _
        CellRef(ws, rowOf("NC"), amountCol) & "+" & CellRef(ws, rowOf("M"), amountCol)
    If Not IsEmpty(order) Then
        For j = 1 To UBound(order)
            rr = order(j)
            rid = Str0(rules(rr, cmR("rule_id")))
            rtype = Str0(rules(rr, cmR("rule_type")))
            baseExpr = ""
            refs = Split(Str0(rules(rr, cmR("base_refs"))), ";")
            For i = LBound(refs) To UBound(refs)
                If Len(refs(i)) > 0 Then
                    If Len(baseExpr) > 0 Then baseExpr = baseExpr & "+"
                    baseExpr = baseExpr & CellRef(ws, rowOf(CStr(refs(i))), amountCol)
                End If
            Next i
            Set cell = ws.Cells(rowOf(rid), amountCol)
            Select Case rtype
            Case "percentage_on_basis"
                ws.Cells(rowOf(rid), rateCol).Formula = Replace(FormulaFor("summary.rule_rate"), "{RULE}", rid)
                expr = CellRef(ws, rowOf(rid), rateCol) & "/100*(" & baseExpr & ")"
                If Str0(rules(rr, cmR("rounding_stage"))) = "round_cost" Then
                    cell.Formula = "=ROUND(" & expr & ",TA_RoundCost)"
                Else
                    cell.Formula = "=" & expr
                End If
            Case "sum"
                cell.Formula = "=" & baseExpr
            Case "fixed"
                cell.Formula = Replace(FormulaFor("summary.rule_fixed"), "{RULE}", rid)
            End Select
        Next j
    End If
    RefreshSummary = n
End Function

Private Function CellRef(ByVal ws As Worksheet, ByVal r As Long, ByVal c As Long) As String
    CellRef = ws.Cells(r, c).Address(RowAbsolute:=False, ColumnAbsolute:=False)
End Function
