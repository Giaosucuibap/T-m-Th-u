Attribute VB_Name = "modUnits"
' Quy doi don vi chi trong cung dai luong va cung trang thai vat ly (giong scripts/ta/units.py).
Option Explicit

Private mAlias As Object
Private mDim As Object
Private mFactor As Object

Private Sub EnsureLoaded()
    Dim parts As Variant, i As Long, kv As Variant, df As Variant
    If Not mAlias Is Nothing Then Exit Sub
    Set mAlias = CreateObject("Scripting.Dictionary")
    Set mDim = CreateObject("Scripting.Dictionary")
    Set mFactor = CreateObject("Scripting.Dictionary")
    parts = Split(UnitAliasData(), ";")
    For i = LBound(parts) To UBound(parts)
        kv = Split(parts(i), "=")
        mAlias(LCase$(U(CStr(kv(0))))) = CStr(kv(1))
    Next i
    parts = Split(UnitDimensionData(), ";")
    For i = LBound(parts) To UBound(parts)
        kv = Split(parts(i), "=")
        df = Split(kv(1), ":")
        mDim(CStr(kv(0))) = CStr(df(0))
        mFactor(CStr(kv(0))) = Val(df(1))
    Next i
End Sub

' Tra ve ma don vi chuan, hoac "" neu khong co trong danh muc.
Public Function NormalizeUnit(ByVal unitText As String) As String
    Dim k As String
    EnsureLoaded
    k = LCase$(Trim$(unitText))
    If mAlias.Exists(k) Then NormalizeUnit = mAlias(k)
End Function

Public Function IsStatefulUnit(ByVal code As String) As Boolean
    IsStatefulUnit = (InStr(1, StatefulUnits(), ";" & code & ";") > 0)
End Function

' Ket qua: errCode = "" neu hop le; factor la he so chuan; method = identity | table | manual.
' hasBasis: nguoi lap da ghi can cu doi don vi (bat buoc khi doi trang thai vat ly).
Public Sub ResolveConversion(ByVal fromUnit As String, ByVal toUnit As String, ByVal hasBasis As Boolean, _
                             ByVal entered As Double, ByRef factor As Double, ByRef method As String, _
                             ByRef errCode As String)
    Dim a As String, b As String
    EnsureLoaded
    errCode = ""
    method = ""
    factor = 0
    a = NormalizeUnit(fromUnit)
    b = NormalizeUnit(toUnit)
    If Len(a) = 0 Or Len(b) = 0 Then
        errCode = "UNKNOWN_UNIT"
        Exit Sub
    End If
    If a = b Then
        factor = 1
        method = "identity"
        Exit Sub
    End If
    If IsStatefulUnit(a) Or IsStatefulUnit(b) Then
        If Not hasBasis Then
            errCode = "MISSING_PHYSICAL_CONVERSION"
        ElseIf entered <= 0 Then
            errCode = "INVALID_CONVERSION"
        Else
            factor = entered
            method = "manual"
        End If
        Exit Sub
    End If
    If Not mDim.Exists(a) Or Not mDim.Exists(b) Then
        errCode = "UNKNOWN_UNIT"
        Exit Sub
    End If
    If mDim(a) <> mDim(b) Then
        errCode = "UNIT_DIMENSION_MISMATCH"
        Exit Sub
    End If
    factor = mFactor(a) / mFactor(b)
    method = "table"
End Sub

Public Function SameNumber(ByVal x As Double, ByVal y As Double) As Boolean
    SameNumber = (Abs(x - y) <= 0.000000001 * (1 + Abs(x) + Abs(y)))
End Function
