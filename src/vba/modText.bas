Attribute VB_Name = "modText"
' Xu ly chuoi va so doc lap locale.
Option Explicit

' Bo dau tieng Viet, chu thuong, chi giu a-z 0-9 va dau cham, gop khoang trang.
' Phai cho ket qua giong scripts/ta/textnorm.fold (bang bo dau sinh tu cung mot nguon).
Public Function FoldVi(ByVal s As String) As String
    Dim i As Long, code As Long, ch As String, rep As String
    Dim buf As String, pendingSpace As Boolean
    For i = 1 To Len(s)
        code = AscW(Mid$(s, i, 1)) And &HFFFF&
        If code < 128 Then
            ch = LCase$(ChrW$(code))
            If (ch >= "a" And ch <= "z") Or (ch >= "0" And ch <= "9") Or ch = "." Then
                rep = ch
            Else
                rep = ""
            End If
        Else
            rep = FoldChar(code)
        End If
        If Len(rep) = 0 Then
            If Len(buf) > 0 Then pendingSpace = True
        Else
            If pendingSpace Then
                buf = buf & " "
                pendingSpace = False
            End If
            buf = buf & rep
        End If
    Next i
    FoldVi = buf
End Function

' Doc so theo chuan hop dong: dau cham thap phan, khong phan cach nghin. Khong dung CDbl (phu thuoc locale).
Public Function TryParseInvariant(ByVal s As String, ByRef value As Double) As Boolean
    Dim t As String, i As Long, ch As String, dots As Long, digits As Long
    t = Trim$(s)
    If Len(t) = 0 Then Exit Function
    For i = 1 To Len(t)
        ch = Mid$(t, i, 1)
        If ch = "-" Then
            If i <> 1 Then Exit Function
        ElseIf ch = "." Then
            dots = dots + 1
            If dots > 1 Then Exit Function
        ElseIf ch >= "0" And ch <= "9" Then
            digits = digits + 1
        Else
            Exit Function
        End If
    Next i
    If digits = 0 Then Exit Function
    value = Val(t)
    TryParseInvariant = True
End Function

' So -> chuoi dau cham (Str$ khong phu thuoc locale).
Public Function InvariantNum(ByVal d As Double) As String
    InvariantNum = Trim$(Str$(d))
End Function

Public Function Fmt(ByVal template As String, ParamArray args() As Variant) As String
    Dim i As Long, s As String
    s = template
    For i = LBound(args) To UBound(args)
        s = Replace(s, "{" & CStr(i) & "}", ToText(args(i)))
    Next i
    Fmt = s
End Function

Public Function ToText(ByVal v As Variant) As String
    If IsError(v) Then
        ToText = ErrorText(v)
    ElseIf IsNull(v) Or IsEmpty(v) Then
        ToText = ""
    ElseIf IsArray(v) Then
        ToText = "(array)"
    ElseIf VarType(v) = vbDouble Or VarType(v) = vbSingle Then
        ToText = InvariantNum(CDbl(v))
    Else
        ToText = CStr(v)
    End If
End Function

Public Function ErrorText(ByVal v As Variant) As String
    Select Case CLng(v)
    Case 2000: ErrorText = "#NULL!"
    Case 2007: ErrorText = "#DIV/0!"
    Case 2015: ErrorText = "#VALUE!"
    Case 2023: ErrorText = "#REF!"
    Case 2029: ErrorText = "#NAME?"
    Case 2036: ErrorText = "#NUM!"
    Case 2042: ErrorText = "#N/A"
    Case Else: ErrorText = "#ERR" & CStr(CLng(v))
    End Select
End Function

Public Function IsBlankValue(ByVal v As Variant) As Boolean
    If IsError(v) Then Exit Function
    If IsEmpty(v) Or IsNull(v) Then
        IsBlankValue = True
    ElseIf VarType(v) = vbString Then
        IsBlankValue = (Len(Trim$(v)) = 0)
    End If
End Function

Public Function IsNumberValue(ByVal v As Variant) As Boolean
    If IsError(v) Then Exit Function
    Select Case VarType(v)
    Case vbDouble, vbSingle, vbInteger, vbLong, vbCurrency, vbDecimal, vbByte
        IsNumberValue = True
    End Select
End Function

Public Function Str0(ByVal v As Variant) As String
    If IsError(v) Or IsNull(v) Or IsEmpty(v) Then
        Str0 = ""
    Else
        Str0 = CStr(v)
    End If
End Function

' Ghi chuoi vao o bang Value/Value2 thi Excel tu doan kieu theo locale ("1.1" -> so/ngay, "=..." -> cong thuc).
' Them dau nhay de o luon la VAN BAN dung nhu chuoi goc (dau nhay khong nam trong gia tri o).
Public Function SafeCellText(ByVal s As String) As String
    If Len(s) > 0 Then
        SafeCellText = "'" & s
    Else
        SafeCellText = ""
    End If
End Function

' Sap xep tang dan mang khoa chuoi, hoan vi mang gia tri di kem (quicksort, so sanh nhi phan).
Public Sub SortByKeys(ByRef keys() As String, ByRef payload() As Long, ByVal lo As Long, ByVal hi As Long)
    Dim i As Long, j As Long, pivot As String, tk As String, tp As Long
    If lo >= hi Then Exit Sub
    i = lo
    j = hi
    pivot = keys((lo + hi) \ 2)
    Do While i <= j
        Do While keys(i) < pivot
            i = i + 1
        Loop
        Do While keys(j) > pivot
            j = j - 1
        Loop
        If i <= j Then
            tk = keys(i): keys(i) = keys(j): keys(j) = tk
            tp = payload(i): payload(i) = payload(j): payload(j) = tp
            i = i + 1
            j = j - 1
        End If
    Loop
    If lo < j Then SortByKeys keys, payload, lo, j
    If i < hi Then SortByKeys keys, payload, i, hi
End Sub

Public Function PadNum(ByVal s As String, ByVal width As Long) As String
    Dim d As Double
    If TryParseInvariant(s, d) Then
        PadNum = Right$(String$(width, "0") & CStr(CLng(d)), width)
    Else
        PadNum = s
    End If
End Function
