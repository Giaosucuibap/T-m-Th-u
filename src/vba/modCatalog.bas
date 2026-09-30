Attribute VB_Name = "modCatalog"
' Giu thu vien dang nap cho phien Excel; tu nap lai tu duong dan da luu neu co.
Option Explicit

Private mCatalog As CCatalog

Public Function CurrentCatalog(Optional ByVal autoLoad As Boolean = True) As CCatalog
    Dim p As String, fso As Object
    If mCatalog Is Nothing Then Set mCatalog = New CCatalog
    If Not mCatalog.IsLoaded And autoLoad Then
        p = GetSettingU("catalog_path")
        If Len(p) > 0 Then
            Set fso = CreateObject("Scripting.FileSystemObject")
            If fso.FileExists(p) Then mCatalog.LoadFromFile p
        End If
    End If
    Set CurrentCatalog = mCatalog
End Function

' Bat buoc co thu vien: neu chua nap thi hoi duong dan.
Public Function RequireCatalog() As CCatalog
    Dim cat As CCatalog
    Set cat = CurrentCatalog(True)
    If Not cat.IsLoaded Then
        PickAndLoadCatalog
        Set cat = CurrentCatalog(False)
        If Not cat.IsLoaded Then Err.Raise ERR_CANCEL, "RequireCatalog", TR("msg.catalog_not_loaded")
    End If
    Set RequireCatalog = cat
End Function

Public Sub PickAndLoadCatalog()
    Dim f As Variant, cat As CCatalog
    f = Application.GetOpenFilename("Excel (*.xlsx),*.xlsx", 1, TR("msg.catalog_pick"))
    If VarType(f) = vbBoolean Then Exit Sub
    Set cat = New CCatalog
    cat.LoadFromFile CStr(f)
    Set mCatalog = cat
    SaveSettingU "catalog_path", CStr(f)
End Sub

' Dung cho TA_SelfTest: thay thu vien tam thoi, tra lai thu vien cu sau khi thu.
Public Function SwapCatalog(ByVal cat As CCatalog) As CCatalog
    Set SwapCatalog = mCatalog
    Set mCatalog = cat
End Function

Public Function CatalogSummaryText(ByVal cat As CCatalog) As String
    Dim s As String
    s = Fmt(TR("msg.catalog_loaded"), cat.ReleaseId, cat.NormCount, cat.LineCount, cat.NoteCount, Round(cat.LoadMs, 0))
    If cat.IsDemo Then s = s & TR("msg.catalog_is_demo")
    CatalogSummaryText = s
End Function
