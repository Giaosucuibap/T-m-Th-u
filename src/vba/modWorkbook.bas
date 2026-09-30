Attribute VB_Name = "modWorkbook"
' Thao tac workbook cong trinh. Moi Range deu gan voi workbook/worksheet cu the,
' khong dung ActiveWorkbook/ActiveSheet ngam dinh (tru khi xac dinh file cong trinh dang chon).
Option Explicit

Private Const DV_LAST_ROW As Long = 3000
Private Const INPUT_FILL As Long = 13431551   ' RGB(255, 242, 204) nen vang nhat
Private Const INPUT_FONT As Long = 16711680    ' RGB(0, 0, 255) chu xanh
Private Const HEADER_FILL As Long = 15917529   ' RGB(217, 225, 242)

' ---------------------------------------------------------------- nhan dien file cong trinh

Public Function FindTable(ByVal wb As Workbook, ByVal tableName As String) As ListObject
    Dim ws As Worksheet, lo As ListObject
    For Each ws In wb.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, tableName, vbTextCompare) = 0 Then
                Set FindTable = lo
                Exit Function
            End If
        Next lo
    Next ws
End Function

Public Function GetTable(ByVal wb As Workbook, ByVal tableName As String) As ListObject
    Set GetTable = FindTable(wb, tableName)
    If GetTable Is Nothing Then
        Err.Raise ERR_SCHEMA, "GetTable", Fmt(TR("msg.schema_mismatch"), "?", TA_SCHEMA_VERSION, tableName)
    End If
End Function

Public Function IsProjectWorkbook(ByVal wb As Workbook) As Boolean
    If wb Is Nothing Then Exit Function
    If FindTable(wb, "tblItems") Is Nothing Then Exit Function
    If FindTable(wb, "tblProject") Is Nothing Then Exit Function
    IsProjectWorkbook = True
End Function

' File cong trinh dang chon; khong bao gio la chinh add-in (ThisWorkbook).
Public Function ActiveProject() As Workbook
    Dim wb As Workbook, missing As String
    On Error Resume Next
    Set wb = ActiveWorkbook
    On Error GoTo 0
    If wb Is Nothing Then Err.Raise ERR_NOT_PROJECT, "ActiveProject", TR("msg.no_project")
    If wb Is ThisWorkbook Then Err.Raise ERR_NOT_PROJECT, "ActiveProject", TR("msg.no_project")
    If Not IsProjectWorkbook(wb) Then Err.Raise ERR_NOT_PROJECT, "ActiveProject", TR("msg.no_project")
    If Not SchemaOk(wb, missing) Then
        Err.Raise ERR_SCHEMA, "ActiveProject", Fmt(TR("msg.schema_mismatch"), GetProjectValue(wb, "schema_version"), _
                                                   TA_SCHEMA_VERSION, missing)
    End If
    Set ActiveProject = wb
End Function

' Kiem tra du bang va cot theo hop dong (thu tu cot khong bat buoc).
Public Function SchemaOk(ByVal wb As Workbook, ByRef missing As String) As Boolean
    Dim tbls As Variant, t As Long, cols As Variant, c As Long, lo As ListObject
    missing = ""
    tbls = TableNames()
    For t = LBound(tbls) To UBound(tbls)
        Set lo = FindTable(wb, CStr(tbls(t)))
        If lo Is Nothing Then
            missing = missing & tbls(t) & "; "
        Else
            cols = TableColumns(CStr(tbls(t)))
            For c = LBound(cols) To UBound(cols)
                If ColIdxOrZero(lo, CStr(cols(c))) = 0 Then missing = missing & tbls(t) & "." & cols(c) & "; "
            Next c
        End If
    Next t
    SchemaOk = (Len(missing) = 0)
End Function

' ---------------------------------------------------------------- tien ich bang

Public Function ColIdxOrZero(ByVal lo As ListObject, ByVal colName As String) As Long
    Dim lc As ListColumn
    For Each lc In lo.ListColumns
        If StrComp(lc.Name, colName, vbTextCompare) = 0 Then
            ColIdxOrZero = lc.Index
            Exit Function
        End If
    Next lc
End Function

Public Function ColIdx(ByVal lo As ListObject, ByVal colName As String) As Long
    ColIdx = ColIdxOrZero(lo, colName)
    If ColIdx = 0 Then Err.Raise ERR_SCHEMA, "ColIdx", "Missing column " & colName & " in " & lo.Name
End Function

' Ten cot -> chi so (Dictionary, khong phan biet hoa thuong).
Public Function ColMap(ByVal lo As ListObject) As Object
    Dim d As Object, lc As ListColumn
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    For Each lc In lo.ListColumns
        d(lc.Name) = lc.Index
    Next lc
    Set ColMap = d
End Function

Public Function IsRowEmpty(ByVal lo As ListObject, ByVal idx As Long) As Boolean
    IsRowEmpty = (Application.WorksheetFunction.CountA(lo.ListRows(idx).Range) = 0)
End Function

' So dong du lieu thuc (bang moi cua Excel co 1 dong rong -> 0).
Public Function DataRowCount(ByVal lo As ListObject) As Long
    If lo.DataBodyRange Is Nothing Then Exit Function
    If lo.ListRows.Count = 1 Then
        If IsRowEmpty(lo, 1) Then Exit Function
    End If
    DataRowCount = lo.ListRows.Count
End Function

' Mang 2 chieu Value2 cua phan du lieu (1..n, 1..cot), hoac Empty neu bang rong.
Public Function TableData(ByVal lo As ListObject) As Variant
    If DataRowCount(lo) = 0 Then Exit Function
    TableData = lo.DataBodyRange.Value2
End Function

Public Function NewRows(ByVal lo As ListObject, ByVal n As Long) As Variant
    Dim arr() As Variant
    ReDim arr(1 To n, 1 To lo.ListColumns.Count)
    NewRows = arr
End Function

Public Sub PutVal(ByRef arr As Variant, ByVal r As Long, ByVal cm As Object, ByVal colName As String, ByVal v As Variant)
    If Not cm.Exists(colName) Then Err.Raise ERR_SCHEMA, "PutVal", "Missing column " & colName
    If VarType(v) = vbString Then v = SafeCellText(CStr(v))
    arr(r, cm(colName)) = v
End Sub

' Them n dong cuoi bang: ghi gia tri theo khoi, gan cong thuc chuan cho cot cong thuc,
' dinh dang o nhap. Tra ve chi so (trong DataBodyRange) cua dong moi dau tien.
Public Function AppendRows(ByVal lo As ListObject, ByVal data As Variant) As Long
    Dim n As Long, nCols As Long, startIdx As Long, newRange As Range, c As Long, key As String
    n = UBound(data, 1) - LBound(data, 1) + 1
    nCols = lo.ListColumns.Count
    If UBound(data, 2) - LBound(data, 2) + 1 <> nCols Then
        Err.Raise ERR_SCHEMA, "AppendRows", "Column count mismatch for " & lo.Name
    End If
    If lo.DataBodyRange Is Nothing Then
        startIdx = 1
        EnsureBelowEmpty lo, n
        lo.Resize lo.HeaderRowRange.Resize(n + 1)
    ElseIf DataRowCount(lo) = 0 Then
        startIdx = 1
        If n > 1 Then
            EnsureBelowEmpty lo, n - 1
            lo.Resize lo.Range.Resize(lo.Range.Rows.Count + n - 1)
        End If
    Else
        startIdx = lo.ListRows.Count + 1
        EnsureBelowEmpty lo, n
        lo.Resize lo.Range.Resize(lo.Range.Rows.Count + n)
    End If
    Set newRange = lo.DataBodyRange.Rows(startIdx).Resize(n)
    newRange.Value2 = data
    For c = 1 To nCols
        key = lo.Name & "." & lo.ListColumns(c).Name
        If HasFormula(key) Then newRange.Columns(c).Formula = FormulaFor(key)
    Next c
    FormatRows lo, newRange
    AppendRows = startIdx
End Function

Private Sub EnsureBelowEmpty(ByVal lo As ListObject, ByVal n As Long)
    Dim below As Range
    Set below = lo.Range.Offset(lo.Range.Rows.Count).Resize(n)
    If Application.WorksheetFunction.CountA(below) > 0 Then
        Err.Raise ERR_SCHEMA, "AppendRows", "Vung duoi bang " & lo.Name & " khong trong (" & below.Address & ")"
    End If
End Sub

Public Sub ClearTable(ByVal lo As ListObject)
    If lo.DataBodyRange Is Nothing Then Exit Sub
    lo.DataBodyRange.Delete xlShiftUp
End Sub

Public Function FindRow(ByVal lo As ListObject, ByVal colName As String, ByVal key As String) As Long
    Dim data As Variant, c As Long, i As Long
    data = TableData(lo)
    If IsEmpty(data) Then Exit Function
    c = ColIdx(lo, colName)
    For i = 1 To UBound(data, 1)
        If Str0(data(i, c)) = key Then
            FindRow = i
            Exit Function
        End If
    Next i
End Function

' Ma tiep theo dang PREFIX0001 (lay so lon nhat dang co + 1, khong dung lai ma da xoa).
Public Function NextIdNumber(ByVal lo As ListObject, ByVal colName As String, ByVal prefix As String) As Long
    Dim data As Variant, c As Long, i As Long, s As String, v As Double, mx As Long
    data = TableData(lo)
    If Not IsEmpty(data) Then
        c = ColIdx(lo, colName)
        For i = 1 To UBound(data, 1)
            s = Str0(data(i, c))
            If Left$(s, Len(prefix)) = prefix Then
                If TryParseInvariant(Mid$(s, Len(prefix) + 1), v) Then
                    If v > mx Then mx = CLng(v)
                End If
            End If
        Next i
    End If
    NextIdNumber = mx + 1
End Function

Public Function MakeId(ByVal prefix As String, ByVal num As Long, ByVal width As Long) As String
    MakeId = prefix & Right$(String$(width, "0") & CStr(num), width)
End Function

' ---------------------------------------------------------------- THONG_TIN

Public Function GetProjectValue(ByVal wb As Workbook, ByVal key As String) As String
    Dim lo As ListObject, r As Long
    Set lo = FindTable(wb, "tblProject")
    If lo Is Nothing Then Exit Function
    r = FindRow(lo, "key", key)
    If r > 0 Then GetProjectValue = Str0(lo.DataBodyRange.Cells(r, ColIdx(lo, "value")).Value2)
End Function

Public Sub SetProjectValue(ByVal wb As Workbook, ByVal key As String, ByVal value As Variant)
    Dim lo As ListObject, r As Long
    Set lo = GetTable(wb, "tblProject")
    r = FindRow(lo, "key", key)
    If r = 0 Then Err.Raise ERR_SCHEMA, "SetProjectValue", "Missing key " & key
    If VarType(value) = vbString Then value = SafeCellText(CStr(value))
    lo.DataBodyRange.Cells(r, ColIdx(lo, "value")).Value2 = value
End Sub

' ---------------------------------------------------------------- dinh dang

Private Function ColumnSpec(ByVal tableName As String, ByVal colName As String) As Variant
    Dim specs As Variant, i As Long, parts As Variant
    specs = TableColumnSpecs(tableName)
    If IsEmpty(specs) Then Exit Function
    For i = LBound(specs) To UBound(specs)
        parts = Split(specs(i), "|")
        If parts(0) = colName Then
            ColumnSpec = parts
            Exit Function
        End If
    Next i
End Function

Private Function NumberFormatFor(ByVal fmtName As String) As String
    Select Case fmtName
    Case "money": NumberFormatFor = "#,##0"
    Case "qty", "amount": NumberFormatFor = "#,##0.0000"
    Case "rate": NumberFormatFor = "0.00"
    End Select
End Function

Private Sub FormatRows(ByVal lo As ListObject, ByVal rng As Range)
    Dim c As Long, spec As Variant, colRange As Range, nf As String
    For c = 1 To lo.ListColumns.Count
        spec = ColumnSpec(lo.Name, lo.ListColumns(c).Name)
        If Not IsEmpty(spec) Then
            Set colRange = rng.Columns(c)
            nf = NumberFormatFor(CStr(spec(2)))
            If Len(nf) > 0 Then colRange.NumberFormat = nf
            If spec(1) = "input" Then
                colRange.Interior.Color = INPUT_FILL
                colRange.Font.Color = INPUT_FONT
                colRange.Locked = False
            End If
        End If
    Next c
End Sub

' ---------------------------------------------------------------- tao khung cong trinh

' Tao toan bo sheet/bang/ten/kiem tra du lieu theo hop dong trong workbook moi (1 sheet).
Public Sub BuildProjectStructure(ByVal wb As Workbook)
    Dim sheetList As Variant, i As Long, ws As Worksheet, tbls As Variant, t As Long
    Dim noteKey As String, specs As Variant, parts As Variant, dn As Variant, data As Variant, lo As ListObject
    Dim rulesErr As String
    sheetList = SheetNames()
    For i = LBound(sheetList) To UBound(sheetList)
        If i = LBound(sheetList) Then
            Set ws = wb.Worksheets(1)
        Else
            Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
        End If
        ws.Name = CStr(sheetList(i))
        ws.Cells(1, 1).Value2 = SheetTitle(CStr(sheetList(i)))
        ws.Cells(1, 1).Font.Bold = True
        ws.Cells(1, 1).Font.Size = 14
        If sheetList(i) <> "TONG_HOP" Then
            Select Case sheetList(i)
            Case "DM_SNAPSHOT": noteKey = "sheet.note.snapshot"
            Case "KIEM_TRA": noteKey = "sheet.note.checks"
            Case Else: noteKey = "sheet.note.input"
            End Select
            ws.Cells(2, 1).Value2 = TR(noteKey)
            ws.Cells(2, 1).Font.Italic = True
            ws.Cells(2, 1).Font.Size = 9
        End If
    Next i
    ' Xoa cac sheet thua (workbook moi co the co san nhieu sheet tuy thiet lap Excel)
    Application.DisplayAlerts = False
    For i = wb.Worksheets.Count To 1 Step -1
        If Not InList(wb.Worksheets(i).Name, sheetList) Then wb.Worksheets(i).Delete
    Next i
    Application.DisplayAlerts = True

    tbls = TableNames()
    For t = LBound(tbls) To UBound(tbls)
        CreateTable wb, CStr(tbls(t))
    Next t

    ' Khoa THONG_TIN
    Set lo = GetTable(wb, "tblProject")
    specs = ProjectKeySpecs()
    data = NewRows(lo, UBound(specs) - LBound(specs) + 1)
    For i = LBound(specs) To UBound(specs)
        parts = Split(specs(i), "|")
        data(i - LBound(specs) + 1, ColIdx(lo, "key")) = SafeCellText(CStr(parts(0)))
        data(i - LBound(specs) + 1, ColIdx(lo, "label")) = SafeCellText(U(CStr(parts(1))))
        If parts(3) = "n" Then
            data(i - LBound(specs) + 1, ColIdx(lo, "value")) = Val(parts(2))
        Else
            data(i - LBound(specs) + 1, ColIdx(lo, "value")) = SafeCellText(CStr(parts(2)))
        End If
    Next i
    AppendRows lo, data
    SetProjectValue wb, "code_version", TA_CODE_VERSION

    ' Ten dinh nghia (cong thuc dat ten, dung tham chieu bang nen sap xep khong lam sai)
    specs = DefinedNameSpecs()
    For i = LBound(specs) To UBound(specs)
        dn = Split(specs(i), "|", 2)
        wb.Names.Add Name:=CStr(dn(0)), RefersTo:="=" & CStr(dn(1))
    Next i

    WriteBanner wb.Worksheets("TONG_HOP")
    AddListValidation wb, "tblPrices", "tax_basis", "tax_basis"
    AddListValidation wb, "tblPrices", "includes_transport", "includes_transport"
    AddListValidation wb, "tblCostRules", "rule_type", "rule_type"
    AddListValidation wb, "tblCostRules", "rounding_stage", "rounding_stage"
    AddListValidation wb, "tblCostRules", "status", "rule_status"
    RefreshSummary wb, rulesErr
    SetupPages wb
    wb.Worksheets("TONG_HOP").Activate
End Sub

Private Function InList(ByVal s As String, ByVal arr As Variant) As Boolean
    Dim i As Long
    For i = LBound(arr) To UBound(arr)
        If StrComp(s, CStr(arr(i)), vbTextCompare) = 0 Then
            InList = True
            Exit Function
        End If
    Next i
End Function

Private Sub CreateTable(ByVal wb As Workbook, ByVal tableName As String)
    Dim ws As Worksheet, specs As Variant, hr As Long, c0 As Long, i As Long, n As Long, parts As Variant
    Dim lo As ListObject
    Set ws = wb.Worksheets(TableSheet(tableName))
    specs = TableColumnSpecs(tableName)
    hr = SheetHeaderRow(TableSheet(tableName))
    c0 = TableFirstCol(tableName)
    n = UBound(specs) - LBound(specs) + 1
    For i = 0 To n - 1
        parts = Split(specs(LBound(specs) + i), "|")
        ws.Cells(hr - 1, c0 + i).Value2 = U(CStr(parts(4)))
        ws.Cells(hr, c0 + i).Value2 = CStr(parts(0))
        ws.Columns(c0 + i).ColumnWidth = Val(parts(3))
    Next i
    With ws.Range(ws.Cells(hr - 1, c0), ws.Cells(hr - 1, c0 + n - 1))
        .Font.Bold = True
        .Font.Size = 9
        .WrapText = True
        .VerticalAlignment = xlBottom
    End With
    ws.Rows(hr - 1).RowHeight = 30
    Set lo = ws.ListObjects.Add(xlSrcRange, ws.Range(ws.Cells(hr, c0), ws.Cells(hr + 1, c0 + n - 1)), , xlYes)
    lo.Name = tableName
    lo.TableStyle = "TableStyleLight1"
    lo.ShowTableStyleRowStripes = False
    lo.HeaderRowRange.Font.Bold = True
    lo.HeaderRowRange.Font.Size = 9
    lo.HeaderRowRange.Interior.Color = HEADER_FILL
    FormatRows lo, lo.DataBodyRange
End Sub

' Dong trang thai tren TONG_HOP: giong scripts/ta/project.py _write_banner.
Private Sub WriteBanner(ByVal ws As Worksheet)
    ws.Range("A2").Value2 = TR("banner.project")
    ws.Range("F2").Formula = FormulaFor("banner.project_name")
    ws.Range("A3").Value2 = TR("banner.demo")
    ws.Range("F3").Formula = FormulaFor("banner.demo_norms")
    ws.Range("A4").Value2 = TR("banner.errors")
    ws.Range("F4").Formula = FormulaFor("banner.error_lines")
    ws.Range("A5").Value2 = TR("banner.draft")
    ws.Range("F5").Formula = FormulaFor("banner.draft_direct")
    ws.Range("F5").NumberFormat = "#,##0"
    ws.Range("A6").Formula = "=""" & TR("banner.status_prefix") & """&IF(F3>0,""" & TR("banner.status_demo") & _
        """,IF(F4>0,""" & TR("banner.status_error") & """,""" & TR("banner.status_ok") & """))"
    ws.Range("A6").Font.Bold = True
    ws.Range("A6").Font.Color = RGB(192, 0, 0)
    ws.Range("A2:A5").Font.Bold = True
    ws.Range("F2:F5").Font.Bold = True
End Sub

Private Sub AddListValidation(ByVal wb As Workbook, ByVal tableName As String, ByVal colName As String, _
                              ByVal listName As String)
    Dim lo As ListObject, ws As Worksheet, col As Long, rng As Range, hr As Long
    Set lo = GetTable(wb, tableName)
    Set ws = lo.Parent
    col = lo.Range.Column + ColIdx(lo, colName) - 1
    hr = lo.HeaderRowRange.Row
    Set rng = ws.Range(ws.Cells(hr + 1, col), ws.Cells(hr + DV_LAST_ROW, col))
    rng.Validation.Delete
    rng.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                       Formula1:=ListValues(listName)
End Sub

' In: A3 cho sheet rong, A4 cho sheet khac; ngang; vua chieu rong; lap dong tieu de.
Private Sub SetupPages(ByVal wb As Workbook)
    Dim ws As Worksheet, hr As Long
    On Error Resume Next
    Application.PrintCommunication = False
    For Each ws In wb.Worksheets
        hr = SheetHeaderRow(ws.Name)
        With ws.PageSetup
            .Orientation = xlLandscape
            Select Case ws.Name
            Case "TIEN_LUONG", "CHIET_TINH", "GIA_DAU_VAO", "DM_SNAPSHOT": .PaperSize = xlPaperA3
            Case Else: .PaperSize = xlPaperA4
            End Select
            .Zoom = False
            .FitToPagesWide = 1
            .FitToPagesTall = False
            If hr > 0 Then .PrintTitleRows = "$" & hr & ":$" & hr
            .LeftFooter = "TA Estimate - &A"
            .CenterFooter = "Trang &P/&N"
        End With
        FreezeBelow ws, hr
    Next ws
    Application.PrintCommunication = True
    On Error GoTo 0
End Sub

Private Sub FreezeBelow(ByVal ws As Worksheet, ByVal hr As Long)
    If hr <= 0 Then Exit Sub
    ws.Activate
    With ws.Parent.Windows(1)
        .FreezePanes = False
        .ScrollRow = 1
        .ScrollColumn = 1
        .SplitColumn = 1
        .SplitRow = hr
        .FreezePanes = True
    End With
End Sub
