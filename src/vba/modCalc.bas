Attribute VB_Name = "modCalc"
' Ham tinh thuan (khong doc workbook) dung cho TA_SelfTest va kiem tra. Tien trong ho so
' LUON la cong thuc Excel; cac ham nay chi de doi chieu voi golden cases.
Option Explicit

' Giong ROUND cua Excel (lam tron nua ra xa so 0), khac VBA Round (lam tron ngan hang).
Public Function ExcelRound(ByVal x As Double, ByVal digits As Long) As Double
    ExcelRound = Application.WorksheetFunction.Round(x, digits)
End Function

Public Function NormCount(ByVal qty As Variant, ByVal conversion As Variant, ByVal basis As Variant, _
                          ByRef errCode As String) As Double
    errCode = ""
    If Not IsNumberValue(basis) Then
        errCode = "INVALID_NORM_BASIS"
    ElseIf CDbl(basis) <= 0 Then
        errCode = "INVALID_NORM_BASIS"
    ElseIf Not IsNumberValue(qty) Then
        errCode = "MISSING_QUANTITY"
    ElseIf Not IsNumberValue(conversion) Then
        errCode = "MISSING_CONVERSION"
    ElseIf CDbl(conversion) <= 0 Then
        errCode = "INVALID_CONVERSION"
    Else
        NormCount = CDbl(qty) * CDbl(conversion) / CDbl(basis)
    End If
End Function

Public Function LineCost(ByVal quantity As Double, ByVal price As Variant, ByVal digits As Long, _
                         ByRef errCode As String) As Double
    errCode = ""
    If Not IsNumberValue(price) Then
        errCode = "MISSING_PRICE"
    Else
        LineCost = ExcelRound(quantity * CDbl(price), digits)
    End If
End Function

' amount = 2 nghia la 2% (chia 100 tuong minh).
Public Function PercentAmount(ByVal baseAmount As Double, ByVal percent As Double, ByVal digits As Long) As Double
    PercentAmount = ExcelRound(baseAmount * percent / 100#, digits)
End Function

' Kiem tra co so cua dong %: tra ve ma loi hoac "".
' lineIds/kinds/groups: cac dong cung cong tac. basisRef: mot line_id hoac token nhom VL/NC/M.
Public Function PercentBasisError(ByVal ownId As String, ByVal basisRef As String, ByVal lineIds As Variant, _
                                  ByVal kinds As Variant, ByVal groups As Variant) As String
    Dim i As Long, found As Boolean
    If Len(basisRef) = 0 Then
        PercentBasisError = "PERCENT_WITHOUT_BASIS"
    ElseIf InStr(1, basisRef, ";") > 0 Then
        PercentBasisError = "UNSUPPORTED_MULTI_BASIS"
    ElseIf basisRef = ownId Then
        PercentBasisError = "CIRCULAR_BASIS"
    ElseIf basisRef = "VL" Or basisRef = "NC" Or basisRef = "M" Then
        For i = LBound(lineIds) To UBound(lineIds)
            If groups(i) = basisRef And kinds(i) = "quantity" Then found = True
        Next i
        If Not found Then PercentBasisError = "BASIS_NOT_FOUND"
    Else
        PercentBasisError = "BASIS_NOT_FOUND"
        For i = LBound(lineIds) To UBound(lineIds)
            If lineIds(i) = basisRef Then
                If kinds(i) = "quantity" Then
                    PercentBasisError = ""
                Else
                    PercentBasisError = "PERCENT_ON_PERCENT_UNSUPPORTED"
                End If
                Exit For
            End If
        Next i
    End If
End Function

' Gia ap dung: includesTransport = yes | no | n/a. Tra ve gia; errCode/warning neu co.
Public Function EffectivePrice(ByVal quoted As Variant, ByVal includesTransport As String, ByVal transport As Variant, _
                               ByVal handling As Variant, ByVal zeroReason As String, ByVal reviewer As String, _
                               ByVal digits As Long, ByRef errCode As String, ByRef warning As String) As Double
    Dim h As Double
    errCode = ""
    warning = ""
    If Not IsNumberValue(quoted) Then
        errCode = "MISSING_PRICE"
        Exit Function
    End If
    If CDbl(quoted) = 0 And (Len(zeroReason) = 0 Or Len(reviewer) = 0) Then
        errCode = "ZERO_PRICE_UNAPPROVED"
        Exit Function
    End If
    If IsNumberValue(handling) Then h = CDbl(handling)
    Select Case includesTransport
    Case "no"
        If Not IsNumberValue(transport) Then
            errCode = "MISSING_TRANSPORT"
        Else
            EffectivePrice = ExcelRound(CDbl(quoted) + CDbl(transport) + h, digits)
        End If
    Case "yes", "n/a"
        If IsNumberValue(transport) Then
            If CDbl(transport) <> 0 Then warning = "DUPLICATE_TRANSPORT"
        End If
        EffectivePrice = ExcelRound(CDbl(quoted) + h, digits)
    Case Else
        errCode = "MISSING_TRANSPORT_FLAG"
    End Select
End Function

Public Function OfficialExportAllowed(ByVal hasDemo As Boolean, ByVal allVerified As Boolean, _
                                      ByVal missingPrices As Long, ByVal profileApproved As Boolean, _
                                      ByVal openErrors As Long) As Boolean
    OfficialExportAllowed = Not hasDemo And allVerified And missingPrices = 0 And profileApproved And openErrors = 0
End Function

' Cong trinh giu bo da chot; cap nhat chi qua thao tac xem khac biet va xac nhan.
Public Function AutoUpdateCatalog(ByVal projectCatalog As String, ByVal installedCatalog As String) As Boolean
    AutoUpdateCatalog = False
End Function
