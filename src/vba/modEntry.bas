Attribute VB_Name = "modEntry"
' Lenh nguoi dung (Alt+F8 hoac Ribbon "Truong An"). Moi lenh: BeginOp -> xu ly -> EndOp;
' loi -> ReportError (khoi phuc ScreenUpdating/Events/Calculation, ghi errors.log).
Option Explicit

' ---------------------------------------------------------------- Ribbon

Public Sub TA_RibbonAction(control As IRibbonControl)
    Select Case control.Id
    Case "taNewProject": TA_NewProject
    Case "taBuildTemplate": TA_BuildTemplate
    Case "taBackup": TA_Backup
    Case "taLoadCatalog": TA_LoadCatalog
    Case "taSearch": TA_Search
    Case "taInsertByCode": TA_InsertByCode
    Case "taApplyFactor": TA_ApplyFactor
    Case "taRefresh": TA_Refresh
    Case "taValidate": TA_Validate
    Case "taCheckIssue": TA_CheckIssue
    Case "taSelfTest": TA_SelfTest
    Case "taAbout": TA_About
    End Select
End Sub

' ---------------------------------------------------------------- cong trinh

Public Sub TA_NewProject()
    Dim wb As Workbook
    On Error GoTo EH
    BeginOp "TA_NewProject"
    Set wb = Workbooks.Add(xlWBATWorksheet)
    BuildProjectStructure wb
    EndOp
    MsgU Fmt(TR("msg.template_built"), wb.Name), vbInformation
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_NewProject"
End Sub

Public Sub TA_BuildTemplate()
    Dim wb As Workbook, f As Variant
    On Error GoTo EH
    BeginOp "TA_BuildTemplate"
    Set wb = Workbooks.Add(xlWBATWorksheet)
    BuildProjectStructure wb
    EndOp
    f = Application.GetSaveAsFilename(InitialFileName:="TA_Template.xltx", _
                                      FileFilter:="Excel Template (*.xltx),*.xltx")
    If VarType(f) <> vbBoolean Then
        Application.DisplayAlerts = False
        wb.SaveAs Filename:=CStr(f), FileFormat:=xlOpenXMLTemplate
        Application.DisplayAlerts = True
    End If
    MsgU Fmt(TR("msg.template_built"), wb.Name), vbInformation
    Exit Sub
EH:
    Application.DisplayAlerts = True
    ReportError Err.Number, Err.Description, "TA_BuildTemplate"
End Sub

Public Sub TA_Backup()
    Dim wb As Workbook, p As String
    On Error GoTo EH
    Set wb = ActiveProject()
    p = SaveBackup(wb, "manual")
    If Len(p) = 0 Then
        MsgU TR("msg.no_backup_unsaved"), vbExclamation
    Else
        MsgU Fmt(TR("msg.backup_saved"), p), vbInformation
    End If
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_Backup"
End Sub

' ---------------------------------------------------------------- thu vien va chen cong tac

Public Sub TA_LoadCatalog()
    On Error GoTo EH
    BeginOp "TA_LoadCatalog"
    PickAndLoadCatalog
    EndOp
    If CurrentCatalog(False).IsLoaded Then MsgU CatalogSummaryText(CurrentCatalog(False)), vbInformation
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_LoadCatalog"
End Sub

Public Sub TA_Search()
    Dim frm As Object
    On Error GoTo NoForm
    Set frm = VBA.UserForms.Add("frmSearch")
    On Error GoTo EH
    frm.Show vbModeless
    Exit Sub
NoForm:
    MsgU TR("msg.form_missing"), vbExclamation
    TA_InsertByCode
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_Search"
End Sub

' Duong du phong khi chua co form: go ma hieu -> chon bo/revision -> nhap khoi luong.
Public Sub TA_InsertByCode()
    Dim wb As Workbook, cat As CCatalog, code As String, rows As Variant, ms As Double, cancelled As Boolean
    Dim prompt As String, i As Long, pick As String, idx As Double, qtyText As String
    On Error GoTo EH
    Set wb = ActiveProject()
    Set cat = RequireCatalog()
    code = AskText(TR("frm.query"), cancelled)
    If cancelled Or Len(Trim$(code)) = 0 Then Exit Sub
    rows = cat.Search(code, "", "", 30, ms)
    If IsEmpty(rows) Then
        MsgU TR("frm.no_results"), vbInformation
        Exit Sub
    End If
    If UBound(rows) = 1 Then
        idx = 1
    Else
        prompt = ""
        For i = 1 To UBound(rows)
            prompt = prompt & CStr(i) & ". " & Str0(cat.NormValue(rows(i), "code")) & " [" & _
                     Str0(cat.NormValue(rows(i), "namespace")) & " rev " & Str0(cat.NormValue(rows(i), "revision")) & _
                     ", " & Str0(cat.NormValue(rows(i), "status")) & "] " & Left$(Str0(cat.NormValue(rows(i), "name")), 60) & vbLf
        Next i
        pick = AskText(prompt, cancelled, "1")
        If cancelled Then Exit Sub
        If Not TryParseInvariant(pick, idx) Then Err.Raise ERR_INPUT, "TA_InsertByCode", Fmt(TR("msg.invalid_number"), pick)
        If idx < 1 Or idx > UBound(rows) Then Err.Raise ERR_INPUT, "TA_InsertByCode", Fmt(TR("msg.invalid_number"), pick)
    End If
    qtyText = AskText(TR("frm.qty"), cancelled)
    If cancelled Then Exit Sub
    InsertFromForm Str0(cat.NormValue(rows(CLng(idx)), "norm_id")), qtyText, "", False
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_InsertByCode"
End Sub

' Goi tu frmSearch va TA_InsertByCode. Khoi luong de trong -> chua nhap (cong thuc bao #N/A).
Public Sub InsertFromForm(ByVal normId As String, ByVal qtyText As String, ByVal groupId As String, _
                          ByVal allowReview As Boolean)
    Dim wb As Workbook, cat As CCatalog, r As Long, qty As Variant, d As Double, iid As String, st As String
    Dim lo As ListObject, rowIdx As Long
    On Error GoTo EH
    Set wb = ActiveProject()
    Set cat = RequireCatalog()
    r = cat.FindNormRow(normId)
    If r = 0 Then Err.Raise ERR_NOT_FOUND, "InsertFromForm", normId
    st = Str0(cat.NormValue(r, "status"))
    If st <> "verified" Then
        If Not allowReview Then Err.Raise ERR_BLOCKED, "InsertFromForm", Fmt(TR("msg.insert_blocked"), cat.NormValue(r, "code"))
        If MsgU(Fmt(TR("msg.insert_needs_review"), cat.NormValue(r, "code")), vbYesNo + vbQuestion) <> vbYes Then Exit Sub
    End If
    If Len(Trim$(qtyText)) = 0 Then
        qty = Empty
    ElseIf TryParseInvariant(qtyText, d) Then
        qty = d
    Else
        Err.Raise ERR_INPUT, "InsertFromForm", Fmt(TR("msg.invalid_number"), qtyText)
    End If
    BeginOp "InsertFromForm"
    iid = InsertNorm(wb, cat, normId, qty, "", 1#, "", groupId, allowReview)
    RefreshResourceSummary wb
    EndOp
    Set lo = GetTable(wb, "tblItems")
    rowIdx = FindRow(lo, "item_id", iid)
    If rowIdx > 0 Then
        lo.Parent.Activate
        lo.DataBodyRange.Cells(rowIdx, ColIdx(lo, "input_quantity")).Select
    End If
    Application.StatusBar = Fmt(TR("msg.inserted"), cat.NormValue(r, "code"), iid)
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "InsertFromForm"
End Sub

' ---------------------------------------------------------------- dieu chinh va tong hop

Public Sub TA_ApplyFactor()
    Dim wb As Workbook, iid As String, grp As String, fText As String, reason As String, f As Double
    Dim cancelled As Boolean, n As Long
    On Error GoTo EH
    Set wb = ActiveProject()
    iid = SelectedItemId(wb)
    If Len(iid) = 0 Then Err.Raise ERR_INPUT, "TA_ApplyFactor", TR("msg.select_item")
    grp = UCase$(Trim$(AskText(Fmt(TR("msg.factor_group"), iid), cancelled)))
    If cancelled Then Exit Sub
    If grp <> "VL" And grp <> "NC" And grp <> "M" Then Err.Raise ERR_INPUT, "TA_ApplyFactor", Fmt(TR("msg.invalid_group"), grp)
    fText = AskText(Fmt(TR("msg.factor_value"), grp, iid), cancelled, "1")
    If cancelled Then Exit Sub
    If Not TryParseInvariant(fText, f) Then Err.Raise ERR_INPUT, "TA_ApplyFactor", Fmt(TR("msg.invalid_number"), fText)
    reason = AskText(TR("msg.factor_reason"), cancelled)
    If cancelled Then Exit Sub
    If Len(Trim$(reason)) = 0 Then Err.Raise ERR_INPUT, "TA_ApplyFactor", TR("msg.reason_required")
    BeginOp "TA_ApplyFactor"
    n = ApplyFactor(wb, iid, grp, f, reason, "")
    EndOp
    MsgU Fmt(TR("msg.factor_done"), InvariantNum(f), grp, iid, n), vbInformation
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_ApplyFactor"
End Sub

Public Sub TA_Refresh()
    Dim wb As Workbook, nVT As Long, nS As Long, rulesErr As String
    On Error GoTo EH
    Set wb = ActiveProject()
    BeginOp "TA_Refresh"
    nVT = RefreshResourceSummary(wb)
    nS = RefreshSummary(wb, rulesErr)
    EndOp
    If Len(rulesErr) > 0 Then
        MsgU Fmt(TR("msg.rules_invalid"), rulesErr), vbExclamation
    Else
        MsgU Fmt(TR("msg.refreshed"), nVT, nS), vbInformation
    End If
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_Refresh"
End Sub

' ---------------------------------------------------------------- kiem tra

Public Sub TA_Validate()
    Dim wb As Workbook, nB As Long, nE As Long, nW As Long
    On Error GoTo EH
    Set wb = ActiveProject()
    BeginOp "TA_Validate"
    ValidateProject wb, nB, nE, nW
    EndOp
    wb.Worksheets("KIEM_TRA").Activate
    MsgU Fmt(TR("msg.validate_done"), nB, nE, nW), IIf(nB + nE > 0, vbExclamation, vbInformation)
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_Validate"
End Sub

' Kiem tra phat hanh: validation truc tiep tu du lieu + file tu chua. Khong doc so tu sheet KIEM_TRA.
Public Sub TA_CheckIssue()
    Dim wb As Workbook, nB As Long, nE As Long, nW As Long, probs As Collection, p As Variant, s As String
    On Error GoTo EH
    Set wb = ActiveProject()
    BeginOp "TA_CheckIssue"
    ValidateProject wb, nB, nE, nW
    Set probs = SelfContainedProblems(wb)
    EndOp
    If nB + nE + probs.Count = 0 Then
        MsgU TR("msg.issue_ok"), vbInformation
    Else
        s = Fmt(TR("msg.issue_blocked"), nB + nE + probs.Count)
        For Each p In probs
            s = s & vbLf & "- " & CStr(p)
        Next p
        wb.Worksheets("KIEM_TRA").Activate
        MsgU s, vbExclamation
    End If
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_CheckIssue"
End Sub

Public Sub TA_About()
    Dim s As String, cat As CCatalog
    s = TR("app.name") & vbLf & "Code " & TA_CODE_VERSION & " - schema " & TA_SCHEMA_VERSION & vbLf & _
        "Excel " & Application.Version & " - " & Application.OperatingSystem & vbLf
    #If Win64 Then
        s = s & "VBA 64-bit" & vbLf
    #Else
        s = s & "VBA 32-bit" & vbLf
    #End If
    On Error Resume Next
    Set cat = CurrentCatalog(True)
    On Error GoTo 0
    If Not cat Is Nothing Then
        If cat.IsLoaded Then s = s & vbLf & CatalogSummaryText(cat)
    End If
    MsgU s, vbInformation
End Sub
