Attribute VB_Name = "modDevBuild"
' CHI DUNG KHI BUILD tren may phat trien. Can bat "Trust access to the VBA project object model".
' Tao frmSearch bang control MSForms chuan (khong OCX) va chen ma tu modFormCode.
' scripts/build_addin.ps1 xoa module nay va modFormCode khoi ban phat hanh sau khi tao form.
Option Explicit

Public Sub TA_Dev_BuildForms()
    Dim vbp As Object, comp As Object, c As Object
    Set vbp = ThisWorkbook.VBProject
    On Error Resume Next
    Set comp = vbp.VBComponents("frmSearch")
    On Error GoTo 0
    If Not comp Is Nothing Then vbp.VBComponents.Remove comp
    Set comp = vbp.VBComponents.Add(3) ' vbext_ct_MSForm
    comp.Name = "frmSearch"
    comp.Properties("Caption") = "TA Estimate"
    comp.Properties("Width") = 632
    comp.Properties("Height") = 430

    AddCtl comp, "Forms.Label.1", "lblQuery", 8, 6, 330, 14
    Set c = AddCtl(comp, "Forms.TextBox.1", "txtQuery", 8, 22, 330, 18)
    c.TabIndex = 0
    Set c = AddCtl(comp, "Forms.CommandButton.1", "cmdSearch", 344, 21, 60, 20)
    c.Default = True
    AddCtl comp, "Forms.Label.1", "lblNs", 412, 6, 90, 14
    Set c = AddCtl(comp, "Forms.ComboBox.1", "cboNs", 412, 22, 90, 18)
    c.Style = 2 ' fmStyleDropDownList
    AddCtl comp, "Forms.Label.1", "lblStatus", 510, 6, 100, 14
    Set c = AddCtl(comp, "Forms.ComboBox.1", "cboStatus", 510, 22, 100, 18)
    c.Style = 2
    AddCtl comp, "Forms.ListBox.1", "lstResults", 8, 46, 610, 150
    AddCtl comp, "Forms.Label.1", "lblCount", 8, 199, 400, 14
    Set c = AddCtl(comp, "Forms.TextBox.1", "txtDetail", 8, 215, 610, 130)
    c.MultiLine = True
    c.WordWrap = True
    c.ScrollBars = 2 ' fmScrollBarsVertical
    c.Locked = True
    AddCtl comp, "Forms.CheckBox.1", "chkReview", 8, 350, 330, 16
    AddCtl comp, "Forms.Label.1", "lblQty", 8, 374, 60, 14
    AddCtl comp, "Forms.TextBox.1", "txtQty", 70, 371, 80, 18
    AddCtl comp, "Forms.Label.1", "lblGroup", 162, 374, 60, 14
    AddCtl comp, "Forms.TextBox.1", "txtGroup", 224, 371, 80, 18
    AddCtl comp, "Forms.CommandButton.1", "cmdInsert", 400, 369, 130, 22
    AddCtl comp, "Forms.CommandButton.1", "cmdClose", 538, 369, 80, 22

    With comp.CodeModule
        If .CountOfLines > 0 Then .DeleteLines 1, .CountOfLines
        .AddFromString FrmSearchCode()
    End With
End Sub

Private Function AddCtl(ByVal comp As Object, ByVal progId As String, ByVal ctlName As String, _
                        ByVal x As Single, ByVal y As Single, ByVal w As Single, ByVal h As Single) As Object
    Dim c As Object
    Set c = comp.Designer.Controls.Add(progId)
    c.Name = ctlName
    c.Left = x
    c.Top = y
    c.Width = w
    c.Height = h
    Set AddCtl = c
End Function
