Attribute VB_Name = "modGolden"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

' Golden cases (tests/golden_cases.json). Null = gia tri null trong JSON.
Public Function GoldenIds() As Variant
    GoldenIds = Array("G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G09", "G10", "G11", "G12", "G13", "G14", "G15", "G16")
End Function

Public Function GoldenName(ByVal id As String) As String
    Select Case id
    Case "G01": GoldenName = U("Quy \u0111\u1ED5i 100 m\u00B3")
    Case "G02": GoldenName = U("VL v\u1EADt l\u00FD")
    Case "G03": GoldenName = U("NC")
    Case "G04": GoldenName = U("M\u00E1y")
    Case "G05": GoldenName = U("VL kh\u00E1c 2% VL ch\u00EDnh")
    Case "G06": GoldenName = U("T\u1ED5ng tr\u1EF1c ti\u1EBFp")
    Case "G07": GoldenName = U("H\u1EC7 s\u1ED1 NC ri\u00EAng 1,1")
    Case "G08": GoldenName = U("\u0110\u1ED5i t\u1EA5n sang kg trong c\u00F9ng v\u1EADt li\u1EC7u")
    Case "G09": GoldenName = U("Thi\u1EBFu gi\u00E1")
    Case "G10": GoldenName = U("M\u1EABu s\u1ED1 b\u1EB1ng 0")
    Case "G11": GoldenName = U("V\u00F2ng tham chi\u1EBFu ph\u1EA7n tr\u0103m")
    Case "G12": GoldenName = U("D\u1EEF li\u1EC7u DEMO")
    Case "G13": GoldenName = U("\u0110\u1ED5i tr\u1EA1ng th\u00E1i \u0111\u1EA5t thi\u1EBFu c\u0103n c\u1EE9")
    Case "G14": GoldenName = U("Excel ROUND gi\u1EA3 \u0111\u1ECBnh 0 ch\u1EEF s\u1ED1")
    Case "G15": GoldenName = U("\u0110\u00E3 g\u1ED3m v\u1EADn chuy\u1EC3n")
    Case "G16": GoldenName = U("Th\u01B0 vi\u1EC7n thay \u0111\u1ED5i")
    End Select
End Function

Public Function Golden(ByVal path As String) As Variant
    Select Case path
    Case "G01.input.q": Golden = "250"
    Case "G01.input.conversion": Golden = "1"
    Case "G01.input.norm_basis": Golden = "100"
    Case "G01.expected.norm_count": Golden = "2.5"
    Case "G02.input.norm_count": Golden = "2.5"
    Case "G02.input.consumption": Golden = "10"
    Case "G02.input.price": Golden = "20000"
    Case "G02.expected.quantity": Golden = "25"
    Case "G02.expected.cost": Golden = "500000"
    Case "G03.input.norm_count": Golden = "2.5"
    Case "G03.input.consumption": Golden = "2"
    Case "G03.input.price": Golden = "400000"
    Case "G03.expected.quantity": Golden = "5"
    Case "G03.expected.cost": Golden = "2000000"
    Case "G04.input.norm_count": Golden = "2.5"
    Case "G04.input.consumption": Golden = "1"
    Case "G04.input.price": Golden = "1000000"
    Case "G04.expected.quantity": Golden = "2.5"
    Case "G04.expected.cost": Golden = "2500000"
    Case "G05.input.base": Golden = "500000"
    Case "G05.input.percent": Golden = "2"
    Case "G05.expected.cost": Golden = "10000"
    Case "G06.input.costs": Golden = "500000;2000000;2500000;10000"
    Case "G06.expected.sum": Golden = "5010000"
    Case "G07.input.norm_count": Golden = "2.5"
    Case "G07.input.consumption": Golden = "2"
    Case "G07.input.factor": Golden = "1.1"
    Case "G07.input.price": Golden = "400000"
    Case "G07.expected.quantity": Golden = "5.5"
    Case "G07.expected.cost": Golden = "2200000"
    Case "G07.expected.other_groups_unchanged": Golden = "true"
    Case "G08.input.q": Golden = "1.2"
    Case "G08.input.conversion": Golden = "1000"
    Case "G08.input.norm_basis": Golden = "1"
    Case "G08.expected.norm_count": Golden = "1200"
    Case "G09.input.price": Golden = Null
    Case "G09.expected.error": Golden = "MISSING_PRICE"
    Case "G09.expected.official_export": Golden = "false"
    Case "G10.input.norm_basis": Golden = "0"
    Case "G10.expected.error": Golden = "INVALID_NORM_BASIS"
    Case "G11.input.line_id": Golden = "L4"
    Case "G11.input.basis_ref": Golden = "L4"
    Case "G11.expected.error": Golden = "CIRCULAR_BASIS"
    Case "G12.input.is_demo": Golden = "true"
    Case "G12.expected.official_export": Golden = "false"
    Case "G12.expected.draft_allowed": Golden = "true"
    Case "G13.input.from": Golden = "m3_nguyen_tho"
    Case "G13.input.to": Golden = "m3_dam_chat"
    Case "G13.input.conversion": Golden = Null
    Case "G13.expected.error": Golden = "MISSING_PHYSICAL_CONVERSION"
    Case "G14.input.number": Golden = "2.5"
    Case "G14.input.places": Golden = "0"
    Case "G14.expected.result": Golden = "3"
    Case "G15.input.quoted_price": Golden = "110000"
    Case "G15.input.includes_transport": Golden = "true"
    Case "G15.input.additional_transport": Golden = "10000"
    Case "G15.expected.effective_price": Golden = "110000"
    Case "G15.expected.warning": Golden = "DUPLICATE_TRANSPORT"
    Case "G16.input.project_catalog": Golden = "v1"
    Case "G16.input.installed_catalog": Golden = "v2"
    Case "G16.expected.project_catalog": Golden = "v1"
    Case "G16.expected.auto_update": Golden = "false"
    Case "demo.expected.norm_count": Golden = "2.5"
    Case "demo.expected.VL_main": Golden = "500000"
    Case "demo.expected.NC": Golden = "2000000"
    Case "demo.expected.M": Golden = "2500000"
    Case "demo.expected.VL_other": Golden = "10000"
    Case "demo.expected.direct_cost": Golden = "5010000"
    Case "demo.project_quantity": Golden = "250"
    Case "demo.norm_id": Golden = "DEMO|D01|1|DEMO.001|base"
    Case "demo.price.DEMO.VL1": Golden = "20000"
    Case "demo.price.DEMO.NC1": Golden = "400000"
    Case "demo.price.DEMO.M1": Golden = "1000000"
    Case Else: Err.Raise vbObjectError + 701, "Golden", "Khong co " & path
    End Select
End Function
