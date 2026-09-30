Attribute VB_Name = "modExport"
' Kiem tra file cong trinh tu chua: khong lien ket ngoai, khong ket noi, khong macro,
' chi dung ham Excel trong danh sach cho phep (giong scripts/ta/xlsx_check.py).
Option Explicit

Private Const ALLOWED As String = "|IF|AND|OR|NOT|ISNUMBER|ISERROR|ISNA|NA|N|INDEX|MATCH|SUM|SUMIF|SUMIFS|" & _
    "COUNTIF|COUNTIFS|SUMPRODUCT|ROUND|"

Public Function SelfContainedProblems(ByVal wb As Workbook) As Collection
    Dim out As New Collection, links As Variant, ws As Worksheet, rng As Range, c As Range
    Dim bad As String, nm As Name, seen As Object, f As String, hasVb As Boolean
    links = wb.LinkSources(xlExcelLinks)
    If Not IsEmpty(links) Then out.Add "EXTERNAL_LINK: " & Join(links, ", ")
    If wb.Connections.Count > 0 Then out.Add "CONNECTIONS: " & CStr(wb.Connections.Count)
    On Error Resume Next
    hasVb = wb.HasVBProject
    On Error GoTo 0
    If hasVb Then out.Add "VBA_PROJECT"
    For Each nm In wb.Names
        If InStr(1, nm.RefersTo, "[") > 0 And InStr(1, nm.RefersTo, ".xl", vbTextCompare) > 0 Then
            out.Add "EXTERNAL_NAME: " & nm.Name
        End If
    Next nm
    Set seen = CreateObject("Scripting.Dictionary")
    For Each ws In wb.Worksheets
        Set rng = Nothing
        On Error Resume Next
        Set rng = ws.UsedRange.SpecialCells(xlCellTypeFormulas)
        On Error GoTo 0
        If Not rng Is Nothing Then
            For Each c In rng.Cells
                f = c.FormulaR1C1
                If Not seen.Exists(f) Then
                    seen.Add f, True
                    bad = DisallowedFunction(f)
                    If Len(bad) > 0 Then out.Add "FUNCTION_NOT_ALLOWED: " & ws.Name & "!" & c.Address(False, False) & " " & bad
                    If InStr(1, f, ".xl", vbTextCompare) > 0 And InStr(1, f, "[") > 0 Then
                        out.Add "EXTERNAL_REF: " & ws.Name & "!" & c.Address(False, False)
                    End If
                End If
            Next c
        End If
    Next ws
    Set SelfContainedProblems = out
End Function

' Tim ten ham (chu/so/dau cham/gach duoi truoc dau mo ngoac) ngoai chuoi, khong co trong danh sach cho phep.
Public Function DisallowedFunction(ByVal formula As String) As String
    Dim i As Long, ch As String, quoted As Boolean, token As String, nameUp As String
    For i = 1 To Len(formula)
        ch = Mid$(formula, i, 1)
        If ch = """" Then
            quoted = Not quoted
            token = ""
        ElseIf Not quoted Then
            If (ch >= "A" And ch <= "Z") Or (ch >= "a" And ch <= "z") Or (ch >= "0" And ch <= "9") Or ch = "." Or ch = "_" Then
                token = token & ch
            Else
                If ch = "(" And Len(token) > 0 Then
                    nameUp = UCase$(Replace(token, "_xlfn.", "", , , vbTextCompare))
                    If Not (Left$(nameUp, 1) >= "0" And Left$(nameUp, 1) <= "9") Then
                        If InStr(1, ALLOWED, "|" & nameUp & "|") = 0 Then
                            DisallowedFunction = nameUp
                            Exit Function
                        End If
                    End If
                End If
                token = ""
            End If
        End If
    Next i
End Function
