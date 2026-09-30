Attribute VB_Name = "modApp"
' Trang thai Excel, hop thoai Unicode, cai dat nguoi dung, nhat ky loi.
' Moi lenh cong khai: BeginOp -> ... -> EndOp; khi loi goi ReportError (tu khoi phuc trang thai).
Option Explicit

Public Const ERR_BASE As Long = vbObjectError + 512
Public Const ERR_NOT_PROJECT As Long = ERR_BASE + 1
Public Const ERR_SCHEMA As Long = ERR_BASE + 2
Public Const ERR_NOT_FOUND As Long = ERR_BASE + 3
Public Const ERR_BLOCKED As Long = ERR_BASE + 4
Public Const ERR_INPUT As Long = ERR_BASE + 5
Public Const ERR_CATALOG As Long = ERR_BASE + 6
Public Const ERR_RULES As Long = ERR_BASE + 7
Public Const ERR_CANCEL As Long = ERR_BASE + 8

#If VBA7 Then
Private Declare PtrSafe Function MessageBoxW Lib "user32" (ByVal hWnd As LongPtr, ByVal lpText As LongPtr, _
    ByVal lpCaption As LongPtr, ByVal uType As Long) As Long
#Else
Private Declare Function MessageBoxW Lib "user32" (ByVal hWnd As Long, ByVal lpText As Long, _
    ByVal lpCaption As Long, ByVal uType As Long) As Long
#End If

Private mDepth As Long
Private mScreen As Boolean
Private mEvents As Boolean
Private mCalc As Long
Private mCalcSaved As Boolean
Private mOpName As String

' ---------------------------------------------------------------- trang thai Excel

Public Sub BeginOp(ByVal opName As String)
    If mDepth = 0 Then
        mOpName = opName
        mScreen = Application.ScreenUpdating
        mEvents = Application.EnableEvents
        mCalcSaved = False
        On Error Resume Next
        mCalc = Application.Calculation
        If Err.Number = 0 Then mCalcSaved = True
        Err.Clear
        On Error GoTo 0
        Application.ScreenUpdating = False
        Application.EnableEvents = False
        If mCalcSaved Then
            On Error Resume Next
            Application.Calculation = xlCalculationManual
            On Error GoTo 0
        End If
    End If
    mDepth = mDepth + 1
End Sub

Public Sub EndOp()
    If mDepth > 0 Then mDepth = mDepth - 1
    If mDepth = 0 Then RestoreState
End Sub

' Dung trong khoi xu ly loi: tra trang thai ve nhu truoc lenh, du dang long bao nhieu cap.
Public Sub AbortOp()
    mDepth = 0
    RestoreState
End Sub

Private Sub RestoreState()
    On Error Resume Next
    If mCalcSaved Then Application.Calculation = mCalc
    Application.EnableEvents = mEvents
    Application.ScreenUpdating = mScreen
    Application.StatusBar = False
    Application.Cursor = xlDefault
    On Error GoTo 0
End Sub

Public Function CurrentOpName() As String
    CurrentOpName = mOpName
End Function

' ---------------------------------------------------------------- hop thoai Unicode

' MsgBox cua VBA doi chuoi sang ANSI nen hong tieng Viet; dung MessageBoxW.
Public Function MsgU(ByVal msgText As String, Optional ByVal buttons As Long = 0) As Long
    Dim caption As String
    caption = TR("app.name")
    MsgU = MessageBoxW(Application.hWnd, StrPtr(msgText), StrPtr(caption), buttons)
End Function

' Application.InputBox (hop thoai cua Excel) hien thi duoc Unicode. Tra ve False neu nguoi dung huy.
Public Function AskText(ByVal prompt As String, ByRef cancelled As Boolean, _
                        Optional ByVal defaultValue As String = "") As String
    Dim v As Variant
    v = Application.InputBox(prompt, TR("app.name"), defaultValue, Type:=2)
    If VarType(v) = vbBoolean Then
        cancelled = True
        AskText = ""
    Else
        cancelled = False
        AskText = CStr(v)
    End If
End Function

Public Sub ReportError(ByVal errNum As Long, ByVal errDesc As String, ByVal opName As String)
    AbortOp
    LogError errNum, errDesc, opName
    If errNum = ERR_CANCEL Then
        Application.StatusBar = False
        Exit Sub
    End If
    MsgU Fmt(TR("msg.error"), ErrLabel(errNum), errDesc, opName), vbExclamation
End Sub

Private Function ErrLabel(ByVal errNum As Long) As String
    If errNum > ERR_BASE And errNum < ERR_BASE + 100 Then
        ErrLabel = "TA-" & CStr(errNum - ERR_BASE)
    Else
        ErrLabel = CStr(errNum)
    End If
End Function

' ---------------------------------------------------------------- cai dat nguoi dung (UTF-16)

Private Function SettingsFolder() As String
    Dim sh As Object, baseDir As String
    On Error Resume Next
    Set sh = CreateObject("WScript.Shell")
    baseDir = sh.SpecialFolders("AppData")
    On Error GoTo 0
    If Len(baseDir) = 0 Then baseDir = Application.UserLibraryPath
    If Right$(baseDir, 1) = "\" Then baseDir = Left$(baseDir, Len(baseDir) - 1)
    SettingsFolder = baseDir & "\TA_Estimate"
End Function

Private Function SettingsFile() As String
    SettingsFile = SettingsFolder() & "\settings.txt"
End Function

Public Function GetSettingU(ByVal key As String, Optional ByVal defaultValue As String = "") As String
    Dim fso As Object, ts As Object, ln As String, p As Long
    GetSettingU = defaultValue
    On Error GoTo Done
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FileExists(SettingsFile()) Then Exit Function
    Set ts = fso.OpenTextFile(SettingsFile(), 1, False, -1)
    Do While Not ts.AtEndOfStream
        ln = ts.ReadLine
        p = InStr(1, ln, "=")
        If p > 1 Then
            If Left$(ln, p - 1) = key Then GetSettingU = Mid$(ln, p + 1)
        End If
    Loop
    ts.Close
Done:
End Function

Public Sub SaveSettingU(ByVal key As String, ByVal value As String)
    Dim fso As Object, ts As Object, ln As String, p As Long, lines As Collection, i As Long, found As Boolean
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set lines = New Collection
    If Not fso.FolderExists(SettingsFolder()) Then fso.CreateFolder SettingsFolder()
    If fso.FileExists(SettingsFile()) Then
        Set ts = fso.OpenTextFile(SettingsFile(), 1, False, -1)
        Do While Not ts.AtEndOfStream
            ln = ts.ReadLine
            p = InStr(1, ln, "=")
            If p > 1 Then
                If Left$(ln, p - 1) = key Then
                    ln = key & "=" & value
                    found = True
                End If
            End If
            lines.Add ln
        Loop
        ts.Close
    End If
    If Not found Then lines.Add key & "=" & value
    Set ts = fso.CreateTextFile(SettingsFile(), True, True)
    For i = 1 To lines.Count
        ts.WriteLine lines(i)
    Next i
    ts.Close
End Sub

' ---------------------------------------------------------------- nhat ky loi

Public Sub LogError(ByVal errNum As Long, ByVal errDesc As String, ByVal opName As String)
    Dim fso As Object, ts As Object
    On Error GoTo Done
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(SettingsFolder()) Then fso.CreateFolder SettingsFolder()
    Set ts = fso.OpenTextFile(SettingsFolder() & "\errors.log", 8, True, -1)
    ts.WriteLine Format$(Now, "yyyy-mm-dd hh:nn:ss") & vbTab & opName & vbTab & CStr(errNum) & vbTab & errDesc & _
        vbTab & ActiveWorkbookName()
    ts.Close
Done:
End Sub

Private Function ActiveWorkbookName() As String
    On Error Resume Next
    ActiveWorkbookName = ActiveWorkbook.Name
End Function
