Attribute VB_Name = "modTests"
' TA_SelfTest: chay golden cases + kich ban tich hop tren Excel THAT, ghi ket qua va cau hinh may
' vao workbook moi (bang chung nghiem thu). Ky vong lay tu tests/golden_cases.json (modGolden),
' khong tinh lai bang chinh cong thuc dang kiem.
Option Explicit

Private mRows As Collection
Private mPass As Long
Private mFail As Long

Private Sub Check(ByVal testName As String, ByVal expected As Variant, ByVal actual As Variant)
    Dim ok As Boolean
    If IsError(expected) Or IsError(actual) Then
        If IsError(expected) And IsError(actual) Then ok = (CLng(expected) = CLng(actual))
    ElseIf IsNumberValue(expected) And IsNumberValue(actual) Then
        ok = (Abs(CDbl(expected) - CDbl(actual)) <= 0.0000001 * (1 + Abs(CDbl(expected))))
    Else
        ok = (ToText(expected) = ToText(actual))
    End If
    If ok Then mPass = mPass + 1 Else mFail = mFail + 1
    mRows.Add Array(testName, ToText(expected), ToText(actual), IIf(ok, "PASS", "FAIL"))
End Sub

Private Function G(ByVal path As String) As Double
    G = Val(Golden(path))
End Function

Public Sub TA_SelfTest()
    Dim saved As CCatalog, t0 As Double
    On Error GoTo EH
    t0 = Timer
    Set mRows = New Collection
    mPass = 0
    mFail = 0
    BeginOp "TA_SelfTest"
    RunUnitTests
    RunIntegration
    WriteResults (Timer - t0)
    EndOp
    MsgU Fmt(TR("msg.selftest_done"), mPass, mFail), IIf(mFail = 0, vbInformation, vbExclamation)
    Exit Sub
EH:
    Dim n As Long, d As String
    n = Err.Number
    d = Err.Description
    On Error Resume Next
    If Not mRows Is Nothing Then
        mRows.Add Array("EXCEPTION", "", CStr(n) & " " & d, "FAIL")
        mFail = mFail + 1
        WriteResults (Timer - t0)
    End If
    On Error GoTo 0
    ReportError n, d, "TA_SelfTest"
End Sub

' ---------------------------------------------------------------- golden cases (ham thuan)

Private Sub RunUnitTests()
    Dim e As String, nc As Double, q As Double, f As Double, m As String, w As String, costs As Variant, s As Double, i As Long

    nc = NormCount(G("G01.input.q"), G("G01.input.conversion"), G("G01.input.norm_basis"), e)
    Check "G01 " & GoldenName("G01"), G("G01.expected.norm_count"), nc

    q = G("G02.input.norm_count") * G("G02.input.consumption")
    Check "G02 quantity", G("G02.expected.quantity"), q
    Check "G02 cost", G("G02.expected.cost"), LineCost(q, G("G02.input.price"), 0, e)
    q = G("G03.input.norm_count") * G("G03.input.consumption")
    Check "G03 quantity", G("G03.expected.quantity"), q
    Check "G03 cost", G("G03.expected.cost"), LineCost(q, G("G03.input.price"), 0, e)
    q = G("G04.input.norm_count") * G("G04.input.consumption")
    Check "G04 quantity", G("G04.expected.quantity"), q
    Check "G04 cost", G("G04.expected.cost"), LineCost(q, G("G04.input.price"), 0, e)

    Check "G05 " & GoldenName("G05"), G("G05.expected.cost"), PercentAmount(G("G05.input.base"), G("G05.input.percent"), 0)

    costs = Split(Golden("G06.input.costs"), ";")
    For i = LBound(costs) To UBound(costs)
        s = s + Val(costs(i))
    Next i
    Check "G06 " & GoldenName("G06"), G("G06.expected.sum"), s

    q = G("G07.input.norm_count") * G("G07.input.consumption") * G("G07.input.factor")
    Check "G07 quantity", G("G07.expected.quantity"), q
    Check "G07 cost", G("G07.expected.cost"), LineCost(q, G("G07.input.price"), 0, e)

    ResolveConversion "t", "kg", False, 0, f, m, e
    Check "G08 t->kg factor", G("G08.input.conversion"), f
    Check "G08 norm_count", G("G08.expected.norm_count"), NormCount(G("G08.input.q"), f, G("G08.input.norm_basis"), e)

    LineCost 25, Golden("G09.input.price"), 0, e
    Check "G09 " & GoldenName("G09"), Golden("G09.expected.error"), e
    Check "G09 official_export", Golden("G09.expected.official_export"), LCase$(CStr(OfficialExportAllowed(False, True, 1, True, 0)))

    NormCount 250, 1, G("G10.input.norm_basis"), e
    Check "G10 " & GoldenName("G10"), Golden("G10.expected.error"), e

    Check "G11 " & GoldenName("G11"), Golden("G11.expected.error"), _
        PercentBasisError("L4", Golden("G11.input.basis_ref"), Array("L1", "L4"), Array("quantity", "percent"), Array("VL", "VL"))

    Check "G12 official_export", Golden("G12.expected.official_export"), LCase$(CStr(OfficialExportAllowed(True, True, 0, True, 0)))
    Check "G12 draft_allowed", Golden("G12.expected.draft_allowed"), "true"

    ResolveConversion Golden("G13.input.from"), Golden("G13.input.to"), False, 0, f, m, e
    Check "G13 " & GoldenName("G13"), Golden("G13.expected.error"), e

    Check "G14 Excel ROUND(2.5,0)", G("G14.expected.result"), ExcelRound(G("G14.input.number"), 0)
    Check "G14 VBA Round khac Excel (ghi nhan)", 2, Round(2.5, 0)

    f = EffectivePrice(G("G15.input.quoted_price"), "yes", G("G15.input.additional_transport"), Empty, "", "", 0, e, w)
    Check "G15 effective_price", G("G15.expected.effective_price"), f
    Check "G15 warning", Golden("G15.expected.warning"), w

    Check "G16 auto_update", Golden("G16.expected.auto_update"), _
        LCase$(CStr(AutoUpdateCatalog(Golden("G16.input.project_catalog"), Golden("G16.input.installed_catalog"))))

    ' Chuoi tieng Viet va so doc lap locale
    Check "FoldVi khoan phut", "khoan phut vua", FoldVi(U("Khoan ph\u1EE5t v\u1EEFa"))
    Check "FoldVi be tong", "be tong", FoldVi(U("B\u00EA t\u00F4ng"))
    Check "FoldVi dap dat", "dap dat", FoldVi(U("\u0110\u1EAEP \u0110\u1EA4T"))
    Check "FoldVi m3", "100 m3", FoldVi(U("100 m\u00B3"))
    Check "Parse 1.250 = 1.25 (khong doan)", 1.25, ParseOrText("1.250")
    Check "Parse 1,250 bi tu choi", "INVALID", ParseOrText("1,250")
    Check "Parse -2.5", -2.5, ParseOrText("-2.5")
End Sub

Private Function ParseOrText(ByVal s As String) As Variant
    Dim d As Double
    If TryParseInvariant(s, d) Then
        ParseOrText = d
    Else
        ParseOrText = "INVALID"
    End If
End Function

' ---------------------------------------------------------------- tich hop tren workbook that

Private Function DemoCatalog() As CCatalog
    Dim cat As New CCatalog
    cat.LoadFromArrays DemoCatalogTable("tblCatManifest"), DemoCatalogTable("tblCatDocuments"), _
                       DemoCatalogTable("tblCatNorms"), DemoCatalogTable("tblCatResources"), _
                       DemoCatalogTable("tblCatLines"), DemoCatalogTable("tblCatNotes")
    Set DemoCatalog = cat
End Function

Private Sub RunIntegration()
    Dim cat As CCatalog, wb As Workbook, wb2 As Workbook, it1 As String, it2 As String, it3 As String, it4 As String
    Dim missing As String, rulesErr As String, rows As Variant, ms As Double, vlExpected As Double, e As String
    Dim checks As Collection, nB As Long, nE As Long, nW As Long, blocked As Boolean

    Set cat = DemoCatalog()
    Check "Catalog DEMO so ma", 7, cat.NormCount
    rows = cat.Search("DEMO.001", "", "", 50, ms)
    Check "Tim DEMO.001: 3 ma (2 revision + 1 bo khac)", 3, CountRank0(cat, rows, "DEMO.001")
    rows = cat.Search("khoan phut", "", "", 50, ms)
    Check "Tim 'khoan phut' khong dau", "DEMO.010", FirstCode(cat, rows)
    rows = cat.Search(U("b\u00EA t\u00F4ng"), "", "", 50, ms)
    Check "Tim 'be tong' co dau", "DEMO.020", FirstCode(cat, rows)
    rows = cat.Search("xyz khong ton tai", "", "", 50, ms)
    Check "Tim khong co ket qua", True, IsEmpty(rows)

    Set wb = Workbooks.Add(xlWBATWorksheet)
    BuildProjectStructure wb
    Check "Cau truc dung hop dong", True, SchemaOk(wb, missing)
    Set wb2 = Workbooks.Add(xlWBATWorksheet)
    wb2.Activate

    it1 = InsertNorm(wb, cat, Golden("demo.norm_id"), G("demo.project_quantity"), "", 1#, "", "HM1", False)
    it2 = InsertNorm(wb, cat, Golden("demo.norm_id"), G("demo.project_quantity"), "", 1#, "", "HM1", False)
    Check "Ghi dung workbook (workbook khac khong bi dong vao)", 0, _
          Application.WorksheetFunction.CountA(wb2.Worksheets(1).UsedRange)
    ApplyFactor wb, it2, "NC", G("G07.input.factor"), "TA_SelfTest G07", "G07"
    SetDemoPrice wb, "P.DEMO.VL1", G("demo.price.DEMO.VL1"), "yes"
    SetDemoPrice wb, "P.DEMO.NC1", G("demo.price.DEMO.NC1"), "n/a"
    SetDemoPrice wb, "P.DEMO.M1", G("demo.price.DEMO.M1"), "n/a"
    RefreshResourceSummary wb
    RefreshSummary wb, rulesErr
    Application.CalculateFull

    vlExpected = G("demo.expected.VL_main") + G("demo.expected.VL_other")
    Check "IT1 so don vi DM 250/100", G("demo.expected.norm_count"), ItemValue(wb, it1, "norm_count")
    Check "IT1 VL", vlExpected, ItemValue(wb, it1, "cost_VL")
    Check "IT1 NC", G("demo.expected.NC"), ItemValue(wb, it1, "cost_NC")
    Check "IT1 M", G("demo.expected.M"), ItemValue(wb, it1, "cost_M")
    Check "IT1 chi phi truc tiep 5.010.000", G("demo.expected.direct_cost"), ItemValue(wb, it1, "direct_cost")
    Check "IT2 NC he so 1.1 (G07)", G("G07.expected.cost"), ItemValue(wb, it2, "cost_NC")
    Check "IT2 VL khong doi", vlExpected, ItemValue(wb, it2, "cost_VL")
    Check "IT1 NC khong bi lan he so", G("demo.expected.NC"), ItemValue(wb, it1, "cost_NC")
    Check "TONG_HOP T", G("demo.expected.direct_cost") * 2 - G("demo.expected.NC") + G("G07.expected.cost"), _
          SummaryValue(wb, "T")

    SortTable GetTable(wb, "tblAnalysis"), "resource_id", xlDescending
    SortTable GetTable(wb, "tblItems"), "item_id", xlDescending
    Application.CalculateFull
    Check "Sau khi sap xep: IT1 van 5.010.000", G("demo.expected.direct_cost"), ItemValue(wb, it1, "direct_cost")
    Check "Sau khi sap xep: IT2 NC", G("G07.expected.cost"), ItemValue(wb, it2, "cost_NC")

    ' Thieu gia -> #N/A lan len tong, khong thanh 0
    SetDemoPrice wb, "P.DEMO.VL1", Empty, "yes"
    Application.CalculateFull
    Check "Thieu gia: VL = #N/A", CVErr(xlErrNA), ItemValue(wb, it1, "cost_VL")
    Check "Thieu gia: NC van tinh", G("demo.expected.NC"), ItemValue(wb, it1, "cost_NC")
    Check "Thieu gia: T = #N/A", CVErr(xlErrNA), SummaryValue(wb, "T")
    Set checks = ValidateProject(wb, nB, nE, nW)
    Check "Kiem tra bao MISSING_PRICE cho IT1", True, HasCheck(checks, "MISSING_PRICE", it1)
    Check "Kiem tra bao DEMO_DATA", True, HasCheck(checks, "DEMO_DATA", it1)
    Check "Khong bao FORMULA_ERROR thua", False, HasCheck(checks, "FORMULA_ERROR", "")
    SetDemoPrice wb, "P.DEMO.VL1", G("demo.price.DEMO.VL1"), "yes"

    ' Doi don vi: tan -> kg hop le; dat nguyen tho -> dam chat khong co can cu bi chan
    it3 = InsertNorm(wb, cat, "DEMO|D01|1|DEMO.030|base", 1.2, "t", 1000#, U("\u0110\u1ED5i t\u1EA5n sang kg"), "HM2", False)
    it4 = InsertNorm(wb, cat, "DEMO|D01|1|DEMO.040|base", 300#, "m3_nguyen_tho", 1#, "", "HM2", False)
    Application.CalculateFull
    Check "1,2 t -> 1200 kg (G08)", G("G08.expected.norm_count"), ItemValue(wb, it3, "norm_count")
    Set checks = ValidateProject(wb, nB, nE, nW)
    Check "Khong bao sai he so t->kg", False, HasCheck(checks, "CONVERSION_CONFLICT", it3)
    Check "Chan doi trang thai dat (G13)", True, HasCheck(checks, "MISSING_PHYSICAL_CONVERSION", it4)
    Check "File cong trinh tu chua (khong link/UDF/macro)", 0, SelfContainedProblems(wb).Count

    ' Ma can kiem bi chan khi khong cho phep ban nhap
    blocked = False
    On Error Resume Next
    InsertNorm wb, cat, "DEMO|D01|1|DEMO.010|base", 10#, "", 1#, "", "", False
    blocked = (Err.Number = ERR_BLOCKED)
    Err.Clear
    On Error GoTo 0
    Check "Ma needs_review bi chan chen", True, blocked

    wb.Close SaveChanges:=False
    wb2.Close SaveChanges:=False
End Sub

Private Function CountRank0(ByVal cat As CCatalog, ByVal rows As Variant, ByVal code As String) As Long
    Dim i As Long
    If IsEmpty(rows) Then Exit Function
    For i = 1 To UBound(rows)
        If Str0(cat.NormValue(rows(i), "code")) = code Then CountRank0 = CountRank0 + 1
    Next i
End Function

Private Function FirstCode(ByVal cat As CCatalog, ByVal rows As Variant) As String
    If IsEmpty(rows) Then Exit Function
    FirstCode = Str0(cat.NormValue(rows(1), "code"))
End Function

Private Sub SetDemoPrice(ByVal wb As Workbook, ByVal priceId As String, ByVal quoted As Variant, ByVal flag As String)
    Dim lo As ListObject, r As Long
    Set lo = GetTable(wb, "tblPrices")
    r = FindRow(lo, "price_id", priceId)
    If r = 0 Then Err.Raise ERR_NOT_FOUND, "SetDemoPrice", priceId
    lo.DataBodyRange.Cells(r, ColIdx(lo, "quoted_price")).Value2 = quoted
    lo.DataBodyRange.Cells(r, ColIdx(lo, "tax_basis")).Value2 = "pre_vat"
    lo.DataBodyRange.Cells(r, ColIdx(lo, "includes_transport")).Value2 = flag
    lo.DataBodyRange.Cells(r, ColIdx(lo, "source_ref")).Value2 = "TA_SelfTest DEMO"
End Sub

Private Function ItemValue(ByVal wb As Workbook, ByVal itemId As String, ByVal colName As String) As Variant
    Dim lo As ListObject, r As Long
    Set lo = GetTable(wb, "tblItems")
    r = FindRow(lo, "item_id", itemId)
    If r = 0 Then
        ItemValue = "(khong thay " & itemId & ")"
    Else
        ItemValue = lo.DataBodyRange.Cells(r, ColIdx(lo, colName)).Value2
    End If
End Function

Private Function SummaryValue(ByVal wb As Workbook, ByVal costId As String) As Variant
    Dim lo As ListObject, r As Long
    Set lo = GetTable(wb, "tblSummary")
    r = FindRow(lo, "cost_id", costId)
    If r > 0 Then SummaryValue = lo.DataBodyRange.Cells(r, ColIdx(lo, "amount")).Value2
End Function

Private Function HasCheck(ByVal checks As Collection, ByVal code As String, ByVal itemId As String) As Boolean
    Dim c As Variant
    For Each c In checks
        If c(1) = code And (Len(itemId) = 0 Or c(2) = itemId) Then
            HasCheck = True
            Exit Function
        End If
    Next c
End Function

Private Sub SortTable(ByVal lo As ListObject, ByVal colName As String, ByVal sortOrder As Long)
    With lo.Sort
        .SortFields.Clear
        .SortFields.Add Key:=lo.ListColumns(colName).DataBodyRange, SortOn:=xlSortOnValues, Order:=sortOrder
        .Header = xlYes
        .Apply
    End With
End Sub

' ---------------------------------------------------------------- bao cao

Private Sub WriteResults(ByVal seconds As Double)
    Dim wb As Workbook, ws As Worksheet, r As Long, row As Variant, info As Variant, i As Long
    Set wb = Workbooks.Add(xlWBATWorksheet)
    Set ws = wb.Worksheets(1)
    ws.Name = "SelfTest"
    info = Array( _
        Array("TA Estimate code", TA_CODE_VERSION & " / schema " & TA_SCHEMA_VERSION), _
        Array("Thoi diem", NowText()), _
        Array("Excel", Application.Version & " build " & Application.Build), _
        Array("He dieu hanh", Application.OperatingSystem), _
        Array("VBA", Bitness()), _
        Array("Dau thap phan / phan cach nghin / phan cach danh sach", _
              Application.International(xlDecimalSeparator) & " / " & Application.International(xlThousandsSeparator) & _
              " / " & Application.International(xlListSeparator)), _
        Array("Thoi gian chay (giay)", InvariantNum(Round(seconds, 2))), _
        Array("Ket qua", CStr(mPass) & " PASS / " & CStr(mFail) & " FAIL"))
    For i = LBound(info) To UBound(info)
        ws.Cells(i + 1, 1).Value2 = info(i)(0)
        ws.Cells(i + 1, 2).Value2 = SafeCellText(CStr(info(i)(1)))
    Next i
    r = UBound(info) + 3
    ws.Cells(r, 1).Resize(1, 4).Value2 = Array("Kiem tra", "Ky vong", "Thuc te", "Ket qua")
    ws.Cells(r, 1).Resize(1, 4).Font.Bold = True
    For Each row In mRows
        r = r + 1
        ws.Cells(r, 1).Value2 = SafeCellText(CStr(row(0)))
        ws.Cells(r, 2).Value2 = SafeCellText(CStr(row(1)))
        ws.Cells(r, 3).Value2 = SafeCellText(CStr(row(2)))
        ws.Cells(r, 4).Value2 = row(3)
        If row(3) = "FAIL" Then ws.Cells(r, 4).Font.Color = RGB(192, 0, 0)
    Next row
    ws.Columns("A:D").AutoFit
    wb.Activate
End Sub

Private Function Bitness() As String
    #If Win64 Then
        Bitness = "64-bit"
    #Else
        Bitness = "32-bit"
    #End If
End Function

' ---------------------------------------------------------------- do hieu nang (tuy chon)

' Do thoi gian tao N cong tac DEMO trong workbook moi. Muc tieu ke hoach: 500 cong tac <= 15 giay.
Public Sub TA_PerfTest()
    Dim cat As CCatalog, wb As Workbook, i As Long, t0 As Double, tIns As Double, tCalc As Double, n As Long
    Dim cancelled As Boolean, s As String, d As Double
    On Error GoTo EH
    s = AskText("N (so cong tac):", cancelled, "500")
    If cancelled Then Exit Sub
    If Not TryParseInvariant(s, d) Then Exit Sub
    n = CLng(d)
    Set cat = DemoCatalog()
    BeginOp "TA_PerfTest"
    Set wb = Workbooks.Add(xlWBATWorksheet)
    BuildProjectStructure wb
    t0 = Timer
    For i = 1 To n
        InsertNorm wb, cat, Golden("demo.norm_id"), 100#, "", 1#, "", "PERF", False
        If i Mod 50 = 0 Then Application.StatusBar = "TA_PerfTest " & i & "/" & n
    Next i
    RefreshResourceSummary wb
    tIns = Timer - t0
    t0 = Timer
    Application.CalculateFull
    tCalc = Timer - t0
    EndOp
    MsgU "N = " & n & vbLf & "Chen: " & InvariantNum(Round(tIns, 2)) & " s" & vbLf & _
         "Tinh lai: " & InvariantNum(Round(tCalc, 2)) & " s" & vbLf & "Excel " & Application.Version & " " & Bitness(), vbInformation
    Exit Sub
EH:
    ReportError Err.Number, Err.Description, "TA_PerfTest"
End Sub
