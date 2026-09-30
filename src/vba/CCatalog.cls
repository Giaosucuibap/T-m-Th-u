VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CCatalog"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
' Thu vien dinh muc da phat hanh, nap mot lan vao bo nho (mang Value2 + chi muc).
' Du lieu bat bien: lop nay khong ghi gi vao file catalog.
Option Explicit

Private mLoaded As Boolean
Private mPath As String
Private mRelease As String
Private mIsDemo As Boolean
Private mLoadMs As Double

Private mNorms As Variant
Private mLines As Variant
Private mNotes As Variant
Private mRes As Variant
Private mDocs As Variant
Private mNormRows As Long
Private mLineRows As Long
Private mNoteRows As Long
Private mResRows As Long

Private mNC As Object      ' ten cot -> chi so (norms)
Private mLC As Object      ' lines
Private mTC As Object      ' notes
Private mRC As Object      ' resources
Private mNormIdx As Object ' norm_id -> dong
Private mLinesByNorm As Object ' norm_id -> Collection dong
Private mResIdx As Object  ' resource_id -> dong
Private mFoldAll() As String
Private mFoldCode() As String

Public Property Get IsLoaded() As Boolean
    IsLoaded = mLoaded
End Property

Public Property Get Path() As String
    Path = mPath
End Property

Public Property Get ReleaseId() As String
    ReleaseId = mRelease
End Property

Public Property Get IsDemo() As Boolean
    IsDemo = mIsDemo
End Property

Public Property Get NormCount() As Long
    NormCount = mNormRows
End Property

Public Property Get LineCount() As Long
    LineCount = mLineRows
End Property

Public Property Get NoteCount() As Long
    NoteCount = mNoteRows
End Property

Public Property Get LoadMs() As Double
    LoadMs = mLoadMs
End Property

' ---------------------------------------------------------------- nap

' Mo file chi doc, tat macro cua file do trong luc mo, doc bang, dong lai khong luu.
Public Sub LoadFromFile(ByVal filePath As String)
    Dim wb As Workbook, secSaved As Long, t0 As Double
    Dim tables As Object, names As Variant, i As Long, lo As ListObject, wasOpen As Boolean
    t0 = Timer
    Set tables = CreateObject("Scripting.Dictionary")
    secSaved = Application.AutomationSecurity
    BeginOp "LoadCatalog"
    On Error GoTo Fail
    Set wb = OpenWorkbookByPath(filePath)
    If wb Is Nothing Then
        Application.AutomationSecurity = 3 ' msoAutomationSecurityForceDisable
        Set wb = Workbooks.Open(Filename:=filePath, UpdateLinks:=0, ReadOnly:=True, AddToMru:=False, _
                                IgnoreReadOnlyRecommended:=True, Notify:=False)
        Application.AutomationSecurity = secSaved
        wasOpen = False
    Else
        wasOpen = True  ' nguoi dung dang mo san: chi doc, khong dong cua so cua ho
    End If
    names = CatalogTableNames()
    For i = LBound(names) To UBound(names)
        Set lo = FindTable(wb, CStr(names(i)))
        If lo Is Nothing Then Err.Raise ERR_CATALOG, "CCatalog.LoadFromFile", Fmt(TR("msg.catalog_invalid"), names(i))
        tables.Add CStr(names(i)), lo.Range.Value2
    Next i
    If Not wasOpen Then wb.Close SaveChanges:=False
    Set wb = Nothing
    LoadFromArrays tables("tblCatManifest"), tables("tblCatDocuments"), tables("tblCatNorms"), _
                   tables("tblCatResources"), tables("tblCatLines"), tables("tblCatNotes")
    mPath = filePath
    mLoadMs = (Timer - t0) * 1000#
    EndOp
    Exit Sub
Fail:
    Dim n As Long, d As String
    n = Err.Number
    d = Err.Description
    Application.AutomationSecurity = secSaved
    If Not wb Is Nothing And Not wasOpen Then wb.Close SaveChanges:=False
    EndOp
    Err.Raise n, "CCatalog.LoadFromFile", d
End Sub

Private Function OpenWorkbookByPath(ByVal filePath As String) As Workbook
    Dim w As Workbook
    For Each w In Application.Workbooks
        If StrComp(w.FullName, filePath, vbTextCompare) = 0 Then
            Set OpenWorkbookByPath = w
            Exit Function
        End If
    Next w
End Function

' Moi tham so la mang 2 chieu co dong tieu de o dong 1 (nhu Range.Value2 cua ca bang).
Public Sub LoadFromArrays(ByVal manifest As Variant, ByVal docs As Variant, ByVal norms As Variant, _
                          ByVal res As Variant, ByVal lines As Variant, ByVal notes As Variant)
    Dim i As Long, key As String, col As Collection, mc As Object
    mLoaded = False
    Set mc = HeaderMap(manifest, "tblCatManifest")
    Set mNC = HeaderMap(norms, "tblCatNorms")
    Set mLC = HeaderMap(lines, "tblCatLines")
    Set mTC = HeaderMap(notes, "tblCatNotes")
    Set mRC = HeaderMap(res, "tblCatResources")
    mNorms = norms
    mLines = lines
    mNotes = notes
    mRes = res
    mDocs = docs
    mNormRows = DataRows(norms, mNC("norm_id"))
    mLineRows = DataRows(lines, mLC("norm_id"))
    mNoteRows = DataRows(notes, mTC("note_id"))
    mResRows = DataRows(res, mRC("resource_id"))

    mRelease = ""
    mIsDemo = False
    For i = 2 To UBound(manifest, 1)
        Select Case Str0(manifest(i, mc("key")))
        Case "catalog_release_id": mRelease = Str0(manifest(i, mc("value")))
        Case "is_demo": mIsDemo = TruthValue(manifest(i, mc("value")))
        End Select
    Next i
    If Len(mRelease) = 0 Then Err.Raise ERR_CATALOG, "CCatalog", Fmt(TR("msg.catalog_invalid"), "catalog_release_id")

    Set mNormIdx = CreateObject("Scripting.Dictionary")
    Set mLinesByNorm = CreateObject("Scripting.Dictionary")
    Set mResIdx = CreateObject("Scripting.Dictionary")
    ReDim mFoldAll(1 To IIf(mNormRows > 0, mNormRows, 1))
    ReDim mFoldCode(1 To IIf(mNormRows > 0, mNormRows, 1))
    For i = 1 To mNormRows
        key = Str0(mNorms(i + 1, mNC("norm_id")))
        If mNormIdx.Exists(key) Then Err.Raise ERR_CATALOG, "CCatalog", "Duplicate norm_id " & key
        mNormIdx.Add key, i
        mFoldCode(i) = FoldVi(Str0(mNorms(i + 1, mNC("code"))))
        mFoldAll(i) = FoldVi(Str0(mNorms(i + 1, mNC("code"))) & " " & Str0(mNorms(i + 1, mNC("name"))) & " " & _
                             Str0(mNorms(i + 1, mNC("group_name"))))
    Next i
    For i = 1 To mLineRows
        key = Str0(mLines(i + 1, mLC("norm_id")))
        If Not mLinesByNorm.Exists(key) Then
            Set col = New Collection
            mLinesByNorm.Add key, col
        End If
        mLinesByNorm(key).Add i
    Next i
    For i = 1 To mResRows
        key = Str0(mRes(i + 1, mRC("resource_id")))
        If Not mResIdx.Exists(key) Then mResIdx.Add key, i
    Next i
    mPath = ""
    mLoaded = True
End Sub

Private Function HeaderMap(ByVal arr As Variant, ByVal tableName As String) As Object
    Dim d As Object, j As Long, cols As Variant, i As Long
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    For j = 1 To UBound(arr, 2)
        If Not d.Exists(Str0(arr(1, j))) Then d.Add Str0(arr(1, j)), j
    Next j
    cols = CatalogColumns(tableName)
    For i = LBound(cols) To UBound(cols)
        If Not d.Exists(cols(i)) Then Err.Raise ERR_CATALOG, "CCatalog", Fmt(TR("msg.catalog_invalid"), tableName & "." & cols(i))
    Next i
    Set HeaderMap = d
End Function

' So dong du lieu (bo dong trong o cot khoa - bang chi co 1 dong rong cua Excel).
Private Function DataRows(ByVal arr As Variant, ByVal keyCol As Long) As Long
    Dim n As Long
    n = UBound(arr, 1) - 1
    Do While n > 0
        If Not IsBlankValue(arr(n + 1, keyCol)) Then Exit Do
        n = n - 1
    Loop
    DataRows = n
End Function

Private Function TruthValue(ByVal v As Variant) As Boolean
    If VarType(v) = vbBoolean Then
        TruthValue = v
    Else
        TruthValue = (LCase$(Str0(v)) = "true" Or Str0(v) = "1")
    End If
End Function

' ---------------------------------------------------------------- truy xuat

Public Function FindNormRow(ByVal normId As String) As Long
    If mNormIdx Is Nothing Then Exit Function
    If mNormIdx.Exists(normId) Then FindNormRow = mNormIdx(normId)
End Function

Public Function NormValue(ByVal row As Long, ByVal colName As String) As Variant
    NormValue = mNorms(row + 1, mNC(colName))
End Function

Public Function NormIsDemo(ByVal row As Long) As Boolean
    NormIsDemo = TruthValue(NormValue(row, "is_demo"))
End Function

Public Function LineRows(ByVal normId As String) As Collection
    If mLinesByNorm.Exists(normId) Then
        Set LineRows = mLinesByNorm(normId)
    Else
        Set LineRows = New Collection
    End If
End Function

Public Function LineValue(ByVal row As Long, ByVal colName As String) As Variant
    LineValue = mLines(row + 1, mLC(colName))
End Function

Public Function ResourceValue(ByVal resourceId As String, ByVal colName As String) As Variant
    If mResIdx.Exists(resourceId) Then
        ResourceValue = mRes(mResIdx(resourceId) + 1, mRC(colName))
    Else
        ResourceValue = ""
    End If
End Function

Public Function NoteValue(ByVal row As Long, ByVal colName As String) As Variant
    NoteValue = mNotes(row + 1, mTC(colName))
End Function

' Ghi chu ap dung cho mot ma: van ban -> chuong -> nhom -> ma; trong moi cap theo 'order'.
Public Function NoteRowsFor(ByVal normRow As Long) As Collection
    Dim out As New Collection, keys() As String, rows() As Long, n As Long, i As Long
    Dim scope As String, sk As String, rank As Long, target As String
    If mNoteRows = 0 Then
        Set NoteRowsFor = out
        Exit Function
    End If
    ReDim keys(1 To mNoteRows)
    ReDim rows(1 To mNoteRows)
    For i = 1 To mNoteRows
        scope = Str0(NoteValue(i, "scope"))
        sk = Str0(NoteValue(i, "scope_key"))
        rank = -1
        Select Case scope
        Case "document": target = Str0(NormValue(normRow, "document_id")): rank = 0
        Case "chapter": target = Str0(NormValue(normRow, "chapter")): rank = 1
        Case "group": target = Str0(NormValue(normRow, "group_name")): rank = 2
        Case "norm": target = Str0(NormValue(normRow, "norm_id")): rank = 3
        End Select
        If rank >= 0 And sk = target And Len(sk) > 0 Then
            n = n + 1
            keys(n) = CStr(rank) & "|" & PadNum(Str0(NoteValue(i, "order")), 6)
            rows(n) = i
        End If
    Next i
    If n > 1 Then SortByKeys keys, rows, 1, n
    For i = 1 To n
        out.Add rows(i)
    Next i
    Set NoteRowsFor = out
End Function

Public Function Namespaces() As Collection
    Dim out As New Collection, seen As Object, i As Long, ns As String
    Set seen = CreateObject("Scripting.Dictionary")
    For i = 1 To mNormRows
        ns = Str0(NormValue(i, "namespace"))
        If Not seen.Exists(ns) Then
            seen.Add ns, True
            out.Add ns
        End If
    Next i
    Set Namespaces = out
End Function

' ---------------------------------------------------------------- tim kiem

' Xep hang: 0 = trung ma, 1 = tien to ma, 2 = moi tu khoa co trong ma/ten/nhom, 3 = khong nhap tu khoa.
' Ket qua: mang 1..n cac dong (hoac Empty). Ma cung chuoi khac bo/revision deu xuat hien.
Public Function Search(ByVal query As String, ByVal nsFilter As String, ByVal statusFilter As String, _
                       ByVal maxResults As Long, ByRef elapsedMs As Double) As Variant
    Dim q As String, tokens() As String, nTok As Long, i As Long, j As Long, rank As Long
    Dim keys() As String, rows() As Long, n As Long, ok As Boolean, t0 As Double, out() As Long
    t0 = Timer
    q = FoldVi(query)
    If Len(q) > 0 Then
        tokens = Split(q, " ")
        nTok = UBound(tokens) + 1
    End If
    If mNormRows = 0 Then Exit Function
    ReDim keys(1 To mNormRows)
    ReDim rows(1 To mNormRows)
    For i = 1 To mNormRows
        If Len(nsFilter) > 0 Then
            If Str0(NormValue(i, "namespace")) <> nsFilter Then GoTo NextNorm
        End If
        If Len(statusFilter) > 0 Then
            If Str0(NormValue(i, "status")) <> statusFilter Then GoTo NextNorm
        End If
        If nTok = 0 Then
            rank = 3
        ElseIf q = mFoldCode(i) Then
            rank = 0
        ElseIf Left$(mFoldCode(i), Len(q)) = q Then
            rank = 1
        Else
            ok = True
            For j = 0 To nTok - 1
                If InStr(1, mFoldAll(i), tokens(j), vbBinaryCompare) = 0 Then
                    ok = False
                    Exit For
                End If
            Next j
            If Not ok Then GoTo NextNorm
            rank = 2
        End If
        n = n + 1
        keys(n) = CStr(rank) & "|" & LCase$(Str0(NormValue(i, "code"))) & "|" & _
                  Str0(NormValue(i, "namespace")) & "|" & PadNum(Str0(NormValue(i, "revision")), 6)
        rows(n) = i
NextNorm:
    Next i
    If n > 1 Then SortByKeys keys, rows, 1, n
    If n > maxResults And maxResults > 0 Then n = maxResults
    elapsedMs = (Timer - t0) * 1000#
    If n = 0 Then Exit Function
    ReDim out(1 To n)
    For i = 1 To n
        out(i) = rows(i)
    Next i
    Search = out
End Function

' ---------------------------------------------------------------- mo ta chi tiet cho form

Public Function DetailText(ByVal row As Long) As String
    Dim s As String, lr As Variant, nr As Variant, g As Variant, st As String, nid As String
    nid = Str0(NormValue(row, "norm_id"))
    s = Str0(NormValue(row, "code")) & " - " & Str0(NormValue(row, "name")) & vbCrLf
    If NormIsDemo(row) Then s = s & TR("frm.detail.demo") & vbCrLf
    If Str0(NormValue(row, "status")) <> "verified" Then s = s & TR("frm.detail.review") & vbCrLf
    s = s & Fmt(TR("frm.detail.unit"), NormValue(row, "source_unit_text"), NormValue(row, "norm_basis_qty"), _
                NormValue(row, "base_unit")) & vbCrLf
    s = s & Fmt(TR("frm.detail.source"), NormValue(row, "namespace"), NormValue(row, "document_id"), _
                NormValue(row, "revision"), NormValue(row, "status")) & vbCrLf
    If Len(Str0(NormValue(row, "conditions"))) > 0 Then
        s = s & Fmt(TR("frm.detail.conditions"), NormValue(row, "conditions")) & vbCrLf
    End If
    s = s & vbCrLf & TR("frm.detail.lines") & vbCrLf
    For Each lr In LineRows(nid)
        If Str0(LineValue(lr, "amount_kind")) = "percent" Then
            s = s & "  " & Str0(LineValue(lr, "group")) & "  " & Str0(LineValue(lr, "line_id")) & "  " & _
                Fmt(TR("frm.detail.percent"), LineValue(lr, "amount_text"), LineValue(lr, "basis_ref")) & vbCrLf
        Else
            s = s & "  " & Str0(LineValue(lr, "group")) & "  " & Str0(LineValue(lr, "line_id")) & "  " & _
                Str0(ResourceValue(Str0(LineValue(lr, "resource_id")), "name")) & ": " & _
                Str0(LineValue(lr, "amount_text")) & " " & Str0(ResourceValue(Str0(LineValue(lr, "resource_id")), "unit")) & vbCrLf
        End If
    Next lr
    For Each g In Array("vl_status|VL", "nc_status|NC", "m_status|M")
        st = Str0(NormValue(row, Split(g, "|")(0)))
        If st = "none_verified" Then
            s = s & "  " & Fmt(TR("frm.detail.none_verified"), Split(g, "|")(1)) & vbCrLf
        ElseIf st <> "present" Then
            s = s & "  " & Fmt(TR("frm.detail.unknown"), Split(g, "|")(1)) & vbCrLf
        End If
    Next g
    s = s & vbCrLf & TR("frm.detail.notes") & vbCrLf
    For Each nr In NoteRowsFor(row)
        s = s & "  [" & Str0(NoteValue(nr, "scope")) & "] " & Str0(NoteValue(nr, "text")) & vbCrLf
    Next nr
    DetailText = s
End Function
