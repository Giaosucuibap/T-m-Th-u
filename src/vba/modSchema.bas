Attribute VB_Name = "modSchema"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

Public Const TA_SCHEMA_VERSION As String = "1.1"
Public Const TA_CODE_VERSION As String = "0.1.0"

Public Function SheetNames() As Variant
    SheetNames = Array("TONG_HOP", "THONG_TIN", "TIEN_LUONG", "CHIET_TINH", "TONG_HOP_VT", "GIA_DAU_VAO", "QUY_TAC_CP", "KIEM_TRA", "DM_SNAPSHOT", "NHAT_KY")
End Function

Public Function TableNames() As Variant
    TableNames = Array("tblSummary", "tblProject", "tblItems", "tblAnalysis", "tblResourceSummary", "tblPrices", "tblCostRules", "tblChecks", "tblSnapshotNorms", "tblSnapshotLines", "tblSnapshotNotes", "tblAudit")
End Function

Public Function SheetTitle(ByVal sheetName As String) As String
    Select Case sheetName
    Case "TONG_HOP": SheetTitle = U("B\u1EA2NG T\u1ED4NG H\u1EE2P CHI PH\u00CD")
    Case "THONG_TIN": SheetTitle = U("TH\u00D4NG TIN C\u00D4NG TR\u00CCNH V\u00C0 QUY \u01AF\u1EDAC")
    Case "TIEN_LUONG": SheetTitle = U("TI\u00CAN L\u01AF\u1EE2NG V\u00C0 D\u1EF0 TO\u00C1N CHI TI\u1EBET")
    Case "CHIET_TINH": SheetTitle = U("CHI\u1EBET T\u00CDNH HAO PH\u00CD THEO T\u1EEANG C\u00D4NG T\u00C1C")
    Case "TONG_HOP_VT": SheetTitle = U("T\u1ED4NG H\u1EE2P V\u1EACT LI\u1EC6U \u2013 NH\u00C2N C\u00D4NG \u2013 M\u00C1Y")
    Case "GIA_DAU_VAO": SheetTitle = U("GI\u00C1 \u0110\u1EA6U V\u00C0O (GI\u00C1 HI\u1EC6N TR\u01AF\u1EDCNG, NH\u00C2N C\u00D4NG, CA M\u00C1Y)")
    Case "QUY_TAC_CP": SheetTitle = U("QUY T\u1EAEC T\u00CDNH C\u00C1C KHO\u1EA2N CHI PH\u00CD")
    Case "KIEM_TRA": SheetTitle = U("K\u1EBET QU\u1EA2 KI\u1EC2M TRA (CH\u1EC8 L\u00C0 B\u00C1O C\u00C1O \u2013 KH\u00D4NG D\u00D9NG \u0110\u1EC2 T\u00CDNH)")
    Case "DM_SNAPSHOT": SheetTitle = U("B\u1EA2N SAO \u0110\u1ECANH M\u1EE8C \u0110\u00C3 D\u00D9NG TRONG C\u00D4NG TR\u00CCNH (KH\u00D4NG S\u1EECA TAY)")
    Case "NHAT_KY": SheetTitle = U("NH\u1EACT K\u00DD THAY \u0110\u1ED4I")
    End Select
End Function

Public Function SheetHeaderRow(ByVal sheetName As String) As Long
    Select Case sheetName
    Case "TONG_HOP": SheetHeaderRow = 8
    Case "THONG_TIN": SheetHeaderRow = 4
    Case "TIEN_LUONG": SheetHeaderRow = 4
    Case "CHIET_TINH": SheetHeaderRow = 4
    Case "TONG_HOP_VT": SheetHeaderRow = 4
    Case "GIA_DAU_VAO": SheetHeaderRow = 4
    Case "QUY_TAC_CP": SheetHeaderRow = 4
    Case "KIEM_TRA": SheetHeaderRow = 4
    Case "DM_SNAPSHOT": SheetHeaderRow = 4
    Case "NHAT_KY": SheetHeaderRow = 4
    End Select
End Function

Public Function TableSheet(ByVal tableName As String) As String
    Select Case tableName
    Case "tblSummary": TableSheet = "TONG_HOP"
    Case "tblProject": TableSheet = "THONG_TIN"
    Case "tblItems": TableSheet = "TIEN_LUONG"
    Case "tblAnalysis": TableSheet = "CHIET_TINH"
    Case "tblResourceSummary": TableSheet = "TONG_HOP_VT"
    Case "tblPrices": TableSheet = "GIA_DAU_VAO"
    Case "tblCostRules": TableSheet = "QUY_TAC_CP"
    Case "tblChecks": TableSheet = "KIEM_TRA"
    Case "tblSnapshotNorms": TableSheet = "DM_SNAPSHOT"
    Case "tblSnapshotLines": TableSheet = "DM_SNAPSHOT"
    Case "tblSnapshotNotes": TableSheet = "DM_SNAPSHOT"
    Case "tblAudit": TableSheet = "NHAT_KY"
    End Select
End Function

Public Function TableFirstCol(ByVal tableName As String) As Long
    Select Case tableName
    Case "tblSummary": TableFirstCol = 1
    Case "tblProject": TableFirstCol = 1
    Case "tblItems": TableFirstCol = 1
    Case "tblAnalysis": TableFirstCol = 1
    Case "tblResourceSummary": TableFirstCol = 1
    Case "tblPrices": TableFirstCol = 1
    Case "tblCostRules": TableFirstCol = 1
    Case "tblChecks": TableFirstCol = 1
    Case "tblSnapshotNorms": TableFirstCol = 1
    Case "tblSnapshotLines": TableFirstCol = 21
    Case "tblSnapshotNotes": TableFirstCol = 35
    Case "tblAudit": TableFirstCol = 1
    End Select
End Function

' Moi phan tu: ten|kind|format|width|caption (caption da escape \uXXXX).
Public Function TableColumnSpecs(ByVal tableName As String) As Variant
    Select Case tableName
    Case "tblSummary"
        TableColumnSpecs = Array( _
            "cost_id|key||10|K\u00FD hi\u1EC7u", _
            "item_group|value||10|Ph\u1EA1m vi", _
            "cost_label|value||42|Kho\u1EA3n m\u1EE5c chi ph\u00ED", _
            "basis|value||16|C\u01A1 s\u1EDF t\u00EDnh", _
            "rate|formula|rate|10|T\u1EF7 l\u1EC7 (%)", _
            "amount|formula|money|20|Th\u00E0nh ti\u1EC1n", _
            "source_ref|value||30|C\u0103n c\u1EE9", _
            "status|value||14|Tr\u1EA1ng th\u00E1i")
    Case "tblProject"
        TableColumnSpecs = Array( _
            "key|key||24|Kh\u00F3a", _
            "label|value||36|N\u1ED9i dung", _
            "value|input||40|Gi\u00E1 tr\u1ECB", _
            "source_ref|input||40|C\u0103n c\u1EE9 / ghi ch\u00FA")
    Case "tblItems"
        TableColumnSpecs = Array( _
            "item_id|key||9|M\u00E3 d\u00F2ng", _
            "group_id|input||12|H\u1EA1ng m\u1EE5c", _
            "code|value||12|M\u00E3 hi\u1EC7u \u0110M", _
            "description|input||40|N\u1ED9i dung c\u00F4ng t\u00E1c", _
            "norm_unit_text|formula||10|\u0110\u01A1n v\u1ECB \u0110M", _
            "input_unit|input||9|\u0110\u01A1n v\u1ECB nh\u1EADp", _
            "input_quantity|input|qty|12|Kh\u1ED1i l\u01B0\u1EE3ng", _
            "unit_conversion|input|qty|10|H\u1EC7 s\u1ED1 \u0111\u1ED5i \u0110V", _
            "conversion_basis|input||18|C\u0103n c\u1EE9 \u0111\u1ED5i \u0110V", _
            "norm_basis_qty|formula|qty|9|Quy m\u00F4 \u0110M", _
            "norm_count|formula|qty|11|S\u1ED1 \u0111\u01A1n v\u1ECB \u0110M", _
            "cost_VL|formula|money|15|Th\u00E0nh ti\u1EC1n VL", _
            "cost_NC|formula|money|15|Th\u00E0nh ti\u1EC1n NC", _
            "cost_M|formula|money|15|Th\u00E0nh ti\u1EC1n M", _
            "direct_cost|formula|money|16|Chi ph\u00ED tr\u1EF1c ti\u1EBFp", _
            "unit_price|formula|money|14|\u0110\u01A1n gi\u00E1 TK", _
            "quantity_note|input||28|Di\u1EC5n gi\u1EA3i kh\u1ED1i l\u01B0\u1EE3ng", _
            "status|formula||12|Tr\u1EA1ng th\u00E1i m\u00E3", _
            "norm_id|value||26|Kh\u00F3a \u0111\u1ECBnh m\u1EE9c", _
            "snapshot_id|value||10|Snapshot")
    Case "tblAnalysis"
        TableColumnSpecs = Array( _
            "analysis_id|key||11|M\u00E3 d\u00F2ng CT", _
            "item_id|value||9|M\u00E3 d\u00F2ng TL", _
            "item_code|formula||12|M\u00E3 hi\u1EC7u \u0110M", _
            "snapshot_line_id|value||13|D\u00F2ng hao ph\u00ED", _
            "resource_id|value||12|M\u00E3 t\u00E0i nguy\u00EAn", _
            "resource_spec|value||30|T\u00EAn / quy c\u00E1ch", _
            "group|value||6|Nh\u00F3m", _
            "amount_kind|value||9|Lo\u1EA1i", _
            "resource_unit|value||7|\u0110\u01A1n v\u1ECB", _
            "original_amount|formula|amount|11|Hao ph\u00ED g\u1ED1c", _
            "adjustment_factor|input|amount|10|H\u1EC7 s\u1ED1 \u0111i\u1EC1u ch\u1EC9nh", _
            "effective_amount|formula|amount|11|Hao ph\u00ED \u00E1p d\u1EE5ng", _
            "norm_count|formula|qty|11|S\u1ED1 \u0111\u01A1n v\u1ECB \u0110M", _
            "total_quantity|formula|qty|13|L\u01B0\u1EE3ng t\u00E0i nguy\u00EAn", _
            "price_id|input||14|M\u00E3 gi\u00E1", _
            "price|formula|money|13|Gi\u00E1 \u00E1p d\u1EE5ng", _
            "basis_ref|value||14|C\u01A1 s\u1EDF % (d\u00F2ng/nh\u00F3m)", _
            "qty_cost|formula|money|14|Ti\u1EC1n theo l\u01B0\u1EE3ng", _
            "cost|formula|money|14|Th\u00E0nh ti\u1EC1n", _
            "status|value||12|Tr\u1EA1ng th\u00E1i d\u00F2ng")
    Case "tblResourceSummary"
        TableColumnSpecs = Array( _
            "resource_price_key|key||26|Kh\u00F3a t\u00E0i nguy\u00EAn\u2013gi\u00E1", _
            "resource_id|value||12|M\u00E3 t\u00E0i nguy\u00EAn", _
            "group|value||6|Nh\u00F3m", _
            "spec|value||32|T\u00EAn / quy c\u00E1ch", _
            "unit|value||8|\u0110\u01A1n v\u1ECB", _
            "price_id|value||14|M\u00E3 gi\u00E1", _
            "quantity|formula|qty|14|T\u1ED5ng l\u01B0\u1EE3ng", _
            "price|formula|money|14|Gi\u00E1 \u00E1p d\u1EE5ng", _
            "cost|formula|money|16|Th\u00E0nh ti\u1EC1n")
    Case "tblPrices"
        TableColumnSpecs = Array( _
            "price_id|key||14|M\u00E3 gi\u00E1", _
            "resource_id|value||12|M\u00E3 t\u00E0i nguy\u00EAn", _
            "group|value||6|Nh\u00F3m", _
            "spec|value||30|T\u00EAn / quy c\u00E1ch", _
            "unit|value||7|\u0110\u01A1n v\u1ECB", _
            "locality|input||12|\u0110\u1ECBa b\u00E0n", _
            "price_date|input||10|K\u1EF3 gi\u00E1", _
            "source_ref|input||24|Ngu\u1ED3n gi\u00E1", _
            "quoted_price|input|money|13|Gi\u00E1 g\u1ED1c", _
            "tax_basis|input||11|Thu\u1EBF (pre_vat/incl_vat)", _
            "includes_transport|input||11|\u0110\u00E3 g\u1ED3m VC? (yes/no/n/a)", _
            "transport|input|money|12|C\u01B0\u1EDBc v\u1EADn chuy\u1EC3n", _
            "handling|input|money|11|B\u1ED1c x\u1EBFp", _
            "effective_price|formula|money|13|Gi\u00E1 \u00E1p d\u1EE5ng", _
            "zero_reason|input||16|L\u00FD do gi\u00E1 0", _
            "reviewer|input||14|Ng\u01B0\u1EDDi x\u00E1c nh\u1EADn", _
            "status|formula||10|Tr\u1EA1ng th\u00E1i")
    Case "tblCostRules"
        TableColumnSpecs = Array( _
            "rule_id|input||9|K\u00FD hi\u1EC7u", _
            "profile_id|input||14|B\u1ED9 quy t\u1EAFc", _
            "label|input||36|T\u00EAn kho\u1EA3n", _
            "rule_type|input||20|Lo\u1EA1i (percentage_on_basis/sum/fixed)", _
            "base_refs|input||14|C\u01A1 s\u1EDF (VD: T;C)", _
            "rate|input|rate|10|T\u1EF7 l\u1EC7 (%)", _
            "fixed_amount|input|money|14|Gi\u00E1 tr\u1ECB c\u1ED1 \u0111\u1ECBnh", _
            "rounding_stage|input||13|L\u00E0m tr\u00F2n (round_cost/none)", _
            "source_ref|input||30|C\u0103n c\u1EE9", _
            "reviewer|input||14|Ng\u01B0\u1EDDi ki\u1EC3m", _
            "status|input||14|Tr\u1EA1ng th\u00E1i (draft/approved/demo)")
    Case "tblChecks"
        TableColumnSpecs = Array( _
            "check_id|key||7|STT", _
            "severity|value||10|M\u1EE9c", _
            "error_code|value||26|M\u00E3 l\u1ED7i", _
            "item_id|value||10|M\u00E3 d\u00F2ng", _
            "location|value||22|V\u1ECB tr\u00ED", _
            "message|value||60|M\u00F4 t\u1EA3", _
            "resolution|value||40|C\u00E1ch x\u1EED l\u00FD", _
            "status|value||10|Tr\u1EA1ng th\u00E1i")
    Case "tblSnapshotNorms"
        TableColumnSpecs = Array( _
            "snapshot_id|key||10|Snapshot", _
            "norm_id|value||26|Kh\u00F3a \u0111\u1ECBnh m\u1EE9c", _
            "catalog_release_id|value||11|B\u1ED9 ph\u00E1t h\u00E0nh", _
            "namespace|value||9|B\u1ED9 ngu\u1ED3n", _
            "document_id|value||18|V\u0103n b\u1EA3n", _
            "catalog_revision|value||8|Revision", _
            "code|value||11|M\u00E3 hi\u1EC7u", _
            "description|value||36|T\u00EAn c\u00F4ng t\u00E1c", _
            "source_unit_text|value||10|\u0110\u01A1n v\u1ECB ngu\u1ED3n", _
            "base_unit|value||10|\u0110\u01A1n v\u1ECB c\u01A1 s\u1EDF", _
            "norm_basis_qty|value|qty|9|Quy m\u00F4 \u0110M", _
            "vl_status|value||12|Nh\u00F3m VL", _
            "nc_status|value||12|Nh\u00F3m NC", _
            "m_status|value||12|Nh\u00F3m M", _
            "conditions|value||30|\u0110i\u1EC1u ki\u1EC7n \u00E1p d\u1EE5ng", _
            "source_ref|value||24|Ngu\u1ED3n (t\u1EC7p/trang/b\u1EA3ng)", _
            "status|value||12|Tr\u1EA1ng th\u00E1i ki\u1EC3m", _
            "is_demo|value||7|DEMO?", _
            "pinned_at|value||18|Th\u1EDDi \u0111i\u1EC3m ch\u1ED1t")
    Case "tblSnapshotLines"
        TableColumnSpecs = Array( _
            "snapshot_line_id|key||13|D\u00F2ng hao ph\u00ED", _
            "snapshot_id|value||10|Snapshot", _
            "local_line_id|value||8|D\u00F2ng g\u1ED1c", _
            "resource_id|value||12|M\u00E3 t\u00E0i nguy\u00EAn", _
            "resource_name|value||28|T\u00EAn t\u00E0i nguy\u00EAn", _
            "resource_unit|value||7|\u0110\u01A1n v\u1ECB", _
            "group|value||6|Nh\u00F3m", _
            "amount_kind|value||9|Lo\u1EA1i", _
            "amount|value|amount|10|Hao ph\u00ED", _
            "amount_text|value||9|Chu\u1ED7i g\u1ED1c", _
            "basis_ref|value||13|C\u01A1 s\u1EDF %", _
            "status|value||11|Tr\u1EA1ng th\u00E1i", _
            "source_ref|value||20|Ngu\u1ED3n")
    Case "tblSnapshotNotes"
        TableColumnSpecs = Array( _
            "note_id|key||12|M\u00E3 ghi ch\u00FA", _
            "snapshot_id|value||10|Snapshot", _
            "scope|value||10|Ph\u1EA1m vi", _
            "text|value||60|N\u1ED9i dung thuy\u1EBFt minh", _
            "source_ref|value||20|Ngu\u1ED3n")
    Case "tblAudit"
        TableColumnSpecs = Array( _
            "event_id|key||8|STT", _
            "timestamp|value||19|Th\u1EDDi \u0111i\u1EC3m", _
            "user|value||16|Ng\u01B0\u1EDDi th\u1EF1c hi\u1EC7n", _
            "action|value||16|Thao t\u00E1c", _
            "item_id|value||10|M\u00E3 d\u00F2ng", _
            "field|value||16|Tr\u01B0\u1EDDng", _
            "before|value||16|Tr\u01B0\u1EDBc", _
            "after|value||16|Sau", _
            "reason|value||30|L\u00FD do", _
            "source_ref|value||24|C\u0103n c\u1EE9")
    End Select
End Function

Public Function TableColumns(ByVal tableName As String) As Variant
    Dim specs As Variant, out() As String, i As Long
    specs = TableColumnSpecs(tableName)
    ReDim out(LBound(specs) To UBound(specs))
    For i = LBound(specs) To UBound(specs)
        out(i) = Split(specs(i), "|")(0)
    Next i
    TableColumns = out
End Function

' Khoa THONG_TIN: key|label(escaped)|gia tri mac dinh|kieu (s/n)
Public Function ProjectKeySpecs() As Variant
    ProjectKeySpecs = Array( _
        "schema_version|Phi\u00EAn b\u1EA3n c\u1EA5u tr\u00FAc file|1.1|s", _
        "code_version|Phi\u00EAn b\u1EA3n add-in \u0111\u00E3 t\u1EA1o file|0.1.0|s", _
        "project_name|T\u00EAn c\u00F4ng tr\u00ECnh||s", _
        "project_item|H\u1EA1ng m\u1EE5c||s", _
        "owner|Ch\u1EE7 \u0111\u1EA7u t\u01B0||s", _
        "locality|\u0110\u1ECBa b\u00E0n x\u00E2y d\u1EF1ng||s", _
        "price_period|Th\u1EDDi \u0111i\u1EC3m l\u1EADp gi\u00E1||s", _
        "catalog_release_id|B\u1ED9 \u0111\u1ECBnh m\u1EE9c \u0111\u00E3 ch\u1ED1t cho c\u00F4ng tr\u00ECnh||s", _
        "cost_rule_profile_id|B\u1ED9 quy t\u1EAFc chi ph\u00ED \u00E1p d\u1EE5ng||s", _
        "round_cost_digits|S\u1ED1 ch\u1EEF s\u1ED1 th\u1EADp ph\u00E2n l\u00E0m tr\u00F2n th\u00E0nh ti\u1EC1n|0|n", _
        "round_price_digits|S\u1ED1 ch\u1EEF s\u1ED1 th\u1EADp ph\u00E2n l\u00E0m tr\u00F2n gi\u00E1 \u00E1p d\u1EE5ng|0|n", _
        "currency|\u0110\u01A1n v\u1ECB ti\u1EC1n|VND|s", _
        "prepared_by|Ng\u01B0\u1EDDi l\u1EADp||s", _
        "doc_status|Tr\u1EA1ng th\u00E1i h\u1ED3 s\u01A1 (draft/issued)|draft|s")
End Function

Public Function DefinedNameSpecs() As Variant
    DefinedNameSpecs = Array( _
        "TA_RoundCost|INDEX(tblProject[value],MATCH(""round_cost_digits"",tblProject[key],0))", _
        "TA_RoundPrice|INDEX(tblProject[value],MATCH(""round_price_digits"",tblProject[key],0))")
End Function

Public Function ListValues(ByVal listName As String) As String
    Select Case listName
    Case "tax_basis": ListValues = "pre_vat,incl_vat"
    Case "includes_transport": ListValues = "yes,no,n/a"
    Case "rule_type": ListValues = "percentage_on_basis,sum,fixed"
    Case "rounding_stage": ListValues = "round_cost,none"
    Case "rule_status": ListValues = "draft,approved,demo"
    End Select
End Function

Public Function CatalogTableNames() As Variant
    CatalogTableNames = Array("tblCatManifest", "tblCatDocuments", "tblCatNorms", "tblCatResources", "tblCatLines", "tblCatNotes")
End Function

Public Function CatalogColumns(ByVal tableName As String) As Variant
    Select Case tableName
    Case "tblCatManifest": CatalogColumns = Array("key", "value")
    Case "tblCatDocuments": CatalogColumns = Array("document_id", "namespace", "doc_number", "authority", "issue_date", "effective_from", "effective_to", "source_url", "source_file", "source_sha256")
    Case "tblCatNorms": CatalogColumns = Array("norm_id", "namespace", "document_id", "revision", "code", "variant_id", "appendix", "chapter", "group_name", "name", "base_unit", "source_unit_text", "norm_basis_qty", "status", "is_demo", "vl_status", "nc_status", "m_status", "conditions", "source_ref")
    Case "tblCatResources": CatalogColumns = Array("resource_id", "namespace", "group", "name", "spec", "unit")
    Case "tblCatLines": CatalogColumns = Array("norm_id", "line_id", "resource_id", "group", "amount_kind", "amount", "amount_text", "basis_ref", "status", "source_ref")
    Case "tblCatNotes": CatalogColumns = Array("note_id", "scope", "scope_key", "order", "text", "source_ref")
    End Select
End Function
