Option Explicit
' Ma cua frmSearch (form khong phu thuoc OCX, chi dung control MSForms chuan).
' Form duoc tao khi build bang modDevBuild.TA_Dev_BuildForms; nhan tieng Viet gan luc chay tu modRes.

Private mRows As Variant

Private Sub UserForm_Initialize()
    Me.Caption = TR("frm.title")
    lblQuery.Caption = TR("frm.query")
    cmdSearch.Caption = TR("frm.search")
    lblNs.Caption = TR("frm.ns")
    lblStatus.Caption = TR("frm.status")
    chkReview.Caption = TR("frm.allow_review")
    lblQty.Caption = TR("frm.qty")
    lblGroup.Caption = TR("frm.group")
    cmdInsert.Caption = TR("frm.insert")
    cmdClose.Caption = TR("frm.close")
    lblCount.Caption = ""
    lstResults.ColumnCount = 5
    lstResults.ColumnWidths = "70 pt;60 pt;30 pt;360 pt;70 pt"
    cboStatus.Clear
    cboStatus.AddItem TR("frm.all")
    cboStatus.AddItem "verified"
    cboStatus.AddItem "needs_review"
    cboStatus.ListIndex = 0
    cboNs.Clear
    cboNs.AddItem TR("frm.all")
    cboNs.ListIndex = 0
    FillNamespaces CurrentCatalogSafe()
End Sub

Private Function CurrentCatalogSafe() As CCatalog
    On Error Resume Next
    Set CurrentCatalogSafe = CurrentCatalog(True)
End Function

Private Sub FillNamespaces(ByVal cat As CCatalog)
    Dim ns As Variant
    If cat Is Nothing Then Exit Sub
    If Not cat.IsLoaded Then Exit Sub
    If cboNs.ListCount > 1 Then Exit Sub
    For Each ns In cat.Namespaces
        cboNs.AddItem CStr(ns)
    Next ns
End Sub

Private Sub cmdSearch_Click()
    DoSearch
End Sub

Private Sub DoSearch()
    Dim cat As CCatalog, rows As Variant, ms As Double, i As Long, n As Long, arr() As Variant
    Dim ns As String, st As String
    On Error GoTo EH
    Set cat = RequireCatalog()
    FillNamespaces cat
    If cboNs.ListIndex > 0 Then ns = cboNs.Value
    If cboStatus.ListIndex > 0 Then st = cboStatus.Value
    rows = cat.Search(txtQuery.Text, ns, st, 500, ms)
    lstResults.Clear
    txtDetail.Text = ""
    mRows = rows
    If IsEmpty(rows) Then
        lblCount.Caption = TR("frm.no_results")
        Exit Sub
    End If
    n = UBound(rows)
    ReDim arr(0 To n - 1, 0 To 4)
    For i = 1 To n
        arr(i - 1, 0) = Str0(cat.NormValue(rows(i), "code"))
        arr(i - 1, 1) = Str0(cat.NormValue(rows(i), "namespace"))
        arr(i - 1, 2) = Str0(cat.NormValue(rows(i), "revision"))
        arr(i - 1, 3) = Str0(cat.NormValue(rows(i), "name"))
        arr(i - 1, 4) = Str0(cat.NormValue(rows(i), "status"))
    Next i
    lstResults.List = arr
    lblCount.Caption = Fmt(TR("frm.results"), n, Round(ms, 0))
    lstResults.ListIndex = 0
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "frmSearch.DoSearch"
End Sub

Private Sub lstResults_Click()
    Dim cat As CCatalog
    On Error GoTo EH
    If lstResults.ListIndex < 0 Or IsEmpty(mRows) Then Exit Sub
    Set cat = RequireCatalog()
    txtDetail.Text = cat.DetailText(mRows(lstResults.ListIndex + 1))
    txtDetail.SelStart = 0
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "frmSearch.Detail"
End Sub

Private Sub lstResults_DblClick(ByVal Cancel As MSForms.ReturnBoolean)
    cmdInsert_Click
End Sub

Private Sub cmdInsert_Click()
    Dim cat As CCatalog, normId As String, allow As Boolean
    On Error GoTo EH
    If lstResults.ListIndex < 0 Or IsEmpty(mRows) Then Exit Sub
    Set cat = RequireCatalog()
    normId = Str0(cat.NormValue(mRows(lstResults.ListIndex + 1), "norm_id"))
    If Not IsNull(chkReview.Value) Then allow = CBool(chkReview.Value)
    InsertFromForm normId, txtQty.Text, txtGroup.Text, allow
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "frmSearch.Insert"
End Sub

Private Sub cmdClose_Click()
    Unload Me
End Sub
