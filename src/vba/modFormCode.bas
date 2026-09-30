Attribute VB_Name = "modFormCode"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

' Ma nguon cua frmSearch (src/vba/forms/frmSearch.code.vba), chen vao form khi build.
Public Function FrmSearchCode() As String
    Dim s As String
    s = ""
    s = s & "Option Explicit" & vbCrLf
    s = s & "' Ma cua frmSearch (form khong phu thuoc OCX, chi dung control MSForms chuan)." & vbCrLf
    s = s & "' Form duoc tao khi build bang modDevBuild.TA_Dev_BuildForms; nhan tieng Viet gan luc chay tu modRes." & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private mRows As Variant" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub UserForm_Initialize()" & vbCrLf
    s = s & "    Me.Caption = TR(""frm.title"")" & vbCrLf
    s = s & "    lblQuery.Caption = TR(""frm.query"")" & vbCrLf
    s = s & "    cmdSearch.Caption = TR(""frm.search"")" & vbCrLf
    s = s & "    lblNs.Caption = TR(""frm.ns"")" & vbCrLf
    s = s & "    lblStatus.Caption = TR(""frm.status"")" & vbCrLf
    s = s & "    chkReview.Caption = TR(""frm.allow_review"")" & vbCrLf
    s = s & "    lblQty.Caption = TR(""frm.qty"")" & vbCrLf
    s = s & "    lblGroup.Caption = TR(""frm.group"")" & vbCrLf
    s = s & "    cmdInsert.Caption = TR(""frm.insert"")" & vbCrLf
    s = s & "    cmdClose.Caption = TR(""frm.close"")" & vbCrLf
    s = s & "    lblCount.Caption = """"" & vbCrLf
    s = s & "    lstResults.ColumnCount = 5" & vbCrLf
    s = s & "    lstResults.ColumnWidths = ""70 pt;60 pt;30 pt;360 pt;70 pt""" & vbCrLf
    s = s & "    cboStatus.Clear" & vbCrLf
    s = s & "    cboStatus.AddItem TR(""frm.all"")" & vbCrLf
    s = s & "    cboStatus.AddItem ""verified""" & vbCrLf
    s = s & "    cboStatus.AddItem ""needs_review""" & vbCrLf
    s = s & "    cboStatus.ListIndex = 0" & vbCrLf
    s = s & "    cboNs.Clear" & vbCrLf
    s = s & "    cboNs.AddItem TR(""frm.all"")" & vbCrLf
    s = s & "    cboNs.ListIndex = 0" & vbCrLf
    s = s & "    FillNamespaces CurrentCatalogSafe()" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Function CurrentCatalogSafe() As CCatalog" & vbCrLf
    s = s & "    On Error Resume Next" & vbCrLf
    s = s & "    Set CurrentCatalogSafe = CurrentCatalog(True)" & vbCrLf
    s = s & "End Function" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub FillNamespaces(ByVal cat As CCatalog)" & vbCrLf
    s = s & "    Dim ns As Variant" & vbCrLf
    s = s & "    If cat Is Nothing Then Exit Sub" & vbCrLf
    s = s & "    If Not cat.IsLoaded Then Exit Sub" & vbCrLf
    s = s & "    If cboNs.ListCount > 1 Then Exit Sub" & vbCrLf
    s = s & "    For Each ns In cat.Namespaces" & vbCrLf
    s = s & "        cboNs.AddItem CStr(ns)" & vbCrLf
    s = s & "    Next ns" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub cmdSearch_Click()" & vbCrLf
    s = s & "    DoSearch" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub DoSearch()" & vbCrLf
    s = s & "    Dim cat As CCatalog, rows As Variant, ms As Double, i As Long, n As Long, arr() As Variant" & vbCrLf
    s = s & "    Dim ns As String, st As String" & vbCrLf
    s = s & "    On Error GoTo EH" & vbCrLf
    s = s & "    Set cat = RequireCatalog()" & vbCrLf
    s = s & "    FillNamespaces cat" & vbCrLf
    s = s & "    If cboNs.ListIndex > 0 Then ns = cboNs.Value" & vbCrLf
    s = s & "    If cboStatus.ListIndex > 0 Then st = cboStatus.Value" & vbCrLf
    s = s & "    rows = cat.Search(txtQuery.Text, ns, st, 500, ms)" & vbCrLf
    s = s & "    lstResults.Clear" & vbCrLf
    s = s & "    txtDetail.Text = """"" & vbCrLf
    s = s & "    mRows = rows" & vbCrLf
    s = s & "    If IsEmpty(rows) Then" & vbCrLf
    s = s & "        lblCount.Caption = TR(""frm.no_results"")" & vbCrLf
    s = s & "        Exit Sub" & vbCrLf
    s = s & "    End If" & vbCrLf
    s = s & "    n = UBound(rows)" & vbCrLf
    s = s & "    ReDim arr(0 To n - 1, 0 To 4)" & vbCrLf
    s = s & "    For i = 1 To n" & vbCrLf
    s = s & "        arr(i - 1, 0) = Str0(cat.NormValue(rows(i), ""code""))" & vbCrLf
    s = s & "        arr(i - 1, 1) = Str0(cat.NormValue(rows(i), ""namespace""))" & vbCrLf
    s = s & "        arr(i - 1, 2) = Str0(cat.NormValue(rows(i), ""revision""))" & vbCrLf
    s = s & "        arr(i - 1, 3) = Str0(cat.NormValue(rows(i), ""name""))" & vbCrLf
    s = s & "        arr(i - 1, 4) = Str0(cat.NormValue(rows(i), ""status""))" & vbCrLf
    s = s & "    Next i" & vbCrLf
    s = s & "    lstResults.List = arr" & vbCrLf
    s = s & "    lblCount.Caption = Fmt(TR(""frm.results""), n, Round(ms, 0))" & vbCrLf
    s = s & "    lstResults.ListIndex = 0" & vbCrLf
    s = s & "    Exit Sub" & vbCrLf
    s = s & "EH:" & vbCrLf
    s = s & "    ReportError Err.Number, Err.Description, ""frmSearch.DoSearch""" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub lstResults_Click()" & vbCrLf
    s = s & "    Dim cat As CCatalog" & vbCrLf
    s = s & "    On Error GoTo EH" & vbCrLf
    s = s & "    If lstResults.ListIndex < 0 Or IsEmpty(mRows) Then Exit Sub" & vbCrLf
    s = s & "    Set cat = RequireCatalog()" & vbCrLf
    s = s & "    txtDetail.Text = cat.DetailText(mRows(lstResults.ListIndex + 1))" & vbCrLf
    s = s & "    txtDetail.SelStart = 0" & vbCrLf
    s = s & "    Exit Sub" & vbCrLf
    s = s & "EH:" & vbCrLf
    s = s & "    ReportError Err.Number, Err.Description, ""frmSearch.Detail""" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub lstResults_DblClick(ByVal Cancel As MSForms.ReturnBoolean)" & vbCrLf
    s = s & "    cmdInsert_Click" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub cmdInsert_Click()" & vbCrLf
    s = s & "    Dim cat As CCatalog, normId As String, allow As Boolean" & vbCrLf
    s = s & "    On Error GoTo EH" & vbCrLf
    s = s & "    If lstResults.ListIndex < 0 Or IsEmpty(mRows) Then Exit Sub" & vbCrLf
    s = s & "    Set cat = RequireCatalog()" & vbCrLf
    s = s & "    normId = Str0(cat.NormValue(mRows(lstResults.ListIndex + 1), ""norm_id""))" & vbCrLf
    s = s & "    If Not IsNull(chkReview.Value) Then allow = CBool(chkReview.Value)" & vbCrLf
    s = s & "    InsertFromForm normId, txtQty.Text, txtGroup.Text, allow" & vbCrLf
    s = s & "    Exit Sub" & vbCrLf
    s = s & "EH:" & vbCrLf
    s = s & "    ReportError Err.Number, Err.Description, ""frmSearch.Insert""" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    s = s & "Private Sub cmdClose_Click()" & vbCrLf
    s = s & "    Unload Me" & vbCrLf
    s = s & "End Sub" & vbCrLf
    s = s & "" & vbCrLf
    FrmSearchCode = s
End Function
