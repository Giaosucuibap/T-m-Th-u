Attribute VB_Name = "modUnitsData"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

' Bang don vi sinh tu scripts/ta/units.py. alias=chuan ; chuan=dai_luong:he_so_ve_goc
Public Function UnitAliasData() As String
    Dim s As String
    s = "ca=ca;cm=cm;cong=cong;c\u00F4ng=cong;dm3=dm3;g=g;ha=ha;kg=kg;khoi=m3;km=km;l=l;lit=l;l\u00EDt=l;m=m;m2=m2;m3=m3;m3_dam_chat=m3_dam_chat;m3_nguyen_tho=m3_nguyen_tho;m3_roi=m3_roi;md"
    s = s & "=m;mm=mm;m\u00B2=m2;m\u00B3=m3;t=t;tan=t;t\u1EA5n=t"
    UnitAliasData = s
End Function

Public Function UnitDimensionData() As String
    Dim s As String
    s = "ca=machine_shift:1;cm=length:0.01;cong=labour:1;dm3=volume:0.001;g=mass:0.001;ha=area:10000;kg=mass:1;km=length:1000;l=volume:0.001;m=length:1;m2=area:1;m3=volume:1;mm=length:0.001"
    s = s & ";t=mass:1000"
    UnitDimensionData = s
End Function

Public Function StatefulUnits() As String
    StatefulUnits = ";m3_dam_chat;m3_nguyen_tho;m3_roi;"
End Function
