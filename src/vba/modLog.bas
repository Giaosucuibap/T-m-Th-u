Attribute VB_Name = "modLog"
' Nhat ky thay doi (NHAT_KY) va sao luu. Nhat ky trong Excel ho tro giai trinh,
' khong phai co che chong sua tuyet doi.
Option Explicit

Public Function CurrentUserName() As String
    CurrentUserName = Application.UserName
    If Len(CurrentUserName) = 0 Then CurrentUserName = "?"
End Function

Public Function NowText() As String
    NowText = Format$(Now, "yyyy-mm-dd hh:nn:ss")
End Function

Public Sub LogAudit(ByVal wb As Workbook, ByVal action As String, ByVal itemId As String, ByVal field As String, _
                    ByVal before As Variant, ByVal after As Variant, ByVal reason As String, ByVal sourceRef As String)
    LogAuditMany wb, Array(Array(action, itemId, field, before, after, reason, sourceRef))
End Sub

' Ghi nhieu su kien mot lan (moi phan tu: action, item_id, field, before, after, reason, source_ref).
Public Sub LogAuditMany(ByVal wb As Workbook, ByVal events As Variant)
    Dim lo As ListObject, cm As Object, data As Variant, i As Long, n As Long, num As Long, ev As Variant
    If IsEmpty(events) Then Exit Sub
    n = UBound(events) - LBound(events) + 1
    If n <= 0 Then Exit Sub
    Set lo = GetTable(wb, "tblAudit")
    Set cm = ColMap(lo)
    data = NewRows(lo, n)
    num = NextIdNumber(lo, "event_id", "EV")
    For i = 1 To n
        ev = events(LBound(events) + i - 1)
        PutVal data, i, cm, "event_id", MakeId("EV", num + i - 1, 6)
        PutVal data, i, cm, "timestamp", NowText()
        PutVal data, i, cm, "user", CurrentUserName()
        PutVal data, i, cm, "action", ev(0)
        PutVal data, i, cm, "item_id", ev(1)
        PutVal data, i, cm, "field", ev(2)
        PutVal data, i, cm, "before", ev(3)
        PutVal data, i, cm, "after", ev(4)
        PutVal data, i, cm, "reason", ev(5)
        PutVal data, i, cm, "source_ref", ev(6)
    Next i
    AppendRows lo, data
End Sub

' Sao luu truoc thao tac cap nhat hang loat. Tra ve duong dan ban sao ("" neu file chua luu lan nao).
Public Function SaveBackup(ByVal wb As Workbook, ByVal tag As String) As String
    Dim fso As Object, folder As String, baseName As String, ext As String, target As String
    If Len(wb.Path) = 0 Then Exit Function
    Set fso = CreateObject("Scripting.FileSystemObject")
    folder = wb.Path & "\TA_backup"
    If Not fso.FolderExists(folder) Then fso.CreateFolder folder
    baseName = fso.GetBaseName(wb.Name)
    ext = fso.GetExtensionName(wb.Name)
    target = folder & "\" & baseName & "_" & tag & "_" & Format$(Now, "yyyymmdd_hhnnss") & "." & ext
    wb.SaveCopyAs target
    SaveBackup = target
End Function
