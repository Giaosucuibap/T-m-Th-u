Attribute VB_Name = "modCostRules"
' Kiem tra va sap xep quy tac chi phi thanh do thi khong chu trinh (giong engine.order_cost_rules).
' Chi ho tro: percentage_on_basis, sum, fixed. Khong evaluate chuoi cong thuc tuy y.
Option Explicit

Private mIds() As String
Private mTypes() As String
Private mRefs() As String
Private mState() As Long
Private mOrder() As Long
Private mOrderN As Long
Private mIndex As Object

Public Function IsBuiltinBase(ByVal s As String) As Boolean
    IsBuiltinBase = (s = "VL" Or s = "NC" Or s = "M" Or s = "T")
End Function

Public Function IsSupportedRuleType(ByVal s As String) As Boolean
    IsSupportedRuleType = (s = "percentage_on_basis" Or s = "sum" Or s = "fixed")
End Function

' data: mang Value2 cua tblCostRules (co the Empty). cm: ColMap cua bang.
' Tra ve mang 1..n chi so dong theo thu tu tinh (Empty neu khong co quy tac). errMsg <> "" neu loi.
Public Function OrderRules(ByVal data As Variant, ByVal cm As Object, ByRef errMsg As String) As Variant
    Dim n As Long, i As Long, r As Long, refs As Variant, j As Long, rows() As Long, out() As Long
    errMsg = ""
    If IsEmpty(data) Then Exit Function
    Set mIndex = CreateObject("Scripting.Dictionary")
    ReDim mIds(1 To UBound(data, 1))
    ReDim mTypes(1 To UBound(data, 1))
    ReDim mRefs(1 To UBound(data, 1))
    ReDim rows(1 To UBound(data, 1))
    For r = 1 To UBound(data, 1)
        If Len(Trim$(Str0(data(r, cm("rule_id"))))) > 0 Then
            n = n + 1
            mIds(n) = Trim$(Str0(data(r, cm("rule_id"))))
            mTypes(n) = Trim$(Str0(data(r, cm("rule_type"))))
            mRefs(n) = Trim$(Str0(data(r, cm("base_refs"))))
            rows(n) = r
            If mIndex.Exists(mIds(n)) Or IsBuiltinBase(mIds(n)) Then
                errMsg = "DUPLICATE_RULE " & mIds(n)
                Exit Function
            End If
            If Not IsSupportedRuleType(mTypes(n)) Then
                errMsg = "UNSUPPORTED_RULE_TYPE " & mIds(n) & " (" & mTypes(n) & ")"
                Exit Function
            End If
            mIndex.Add mIds(n), n
        End If
    Next r
    If n = 0 Then Exit Function
    For i = 1 To n
        If mTypes(i) <> "fixed" And Len(mRefs(i)) = 0 Then
            errMsg = "UNKNOWN_BASE " & mIds(i)
            Exit Function
        End If
        If Len(mRefs(i)) > 0 Then
            refs = Split(mRefs(i), ";")
            For j = LBound(refs) To UBound(refs)
                If Len(refs(j)) > 0 Then
                    If Not mIndex.Exists(CStr(refs(j))) And Not IsBuiltinBase(CStr(refs(j))) Then
                        errMsg = "UNKNOWN_BASE " & mIds(i) & " -> " & refs(j)
                        Exit Function
                    End If
                End If
            Next j
        End If
    Next i
    ReDim mState(1 To n)
    ReDim mOrder(1 To n)
    mOrderN = 0
    For i = 1 To n
        Visit i, mIds(i), errMsg
        If Len(errMsg) > 0 Then Exit Function
    Next i
    ReDim out(1 To n)
    For i = 1 To n
        out(i) = rows(mOrder(i))
    Next i
    OrderRules = out
End Function

Private Sub Visit(ByVal i As Long, ByVal path As String, ByRef errMsg As String)
    Dim refs As Variant, j As Long
    If mState(i) = 2 Then Exit Sub
    If mState(i) = 1 Then
        errMsg = "CIRCULAR_RULE " & path
        Exit Sub
    End If
    mState(i) = 1
    If Len(mRefs(i)) > 0 Then
        refs = Split(mRefs(i), ";")
        For j = LBound(refs) To UBound(refs)
            If mIndex.Exists(CStr(refs(j))) Then
                Visit mIndex(CStr(refs(j))), path & " -> " & refs(j), errMsg
                If Len(errMsg) > 0 Then Exit Sub
            End If
        Next j
    End If
    mState(i) = 2
    mOrderN = mOrderN + 1
    mOrder(mOrderN) = i
End Sub
