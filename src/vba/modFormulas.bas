Attribute VB_Name = "modFormulas"
' TU DONG SINH boi scripts/gen_vba.py - KHONG SUA TAY. Sua file JSON nguon roi chay lai.
Option Explicit

' Cong thuc Excel chuan cho cot kind=formula (khoa: bang.cot) va cac mau tong hop.
Public Function FormulaFor(ByVal key As String) As String
    Dim s As String
    Select Case key
    Case "tblItems.norm_unit_text"
        s = "=INDEX(tblSnapshotNorms[source_unit_text],MATCH(tblItems[[#This Row],[snapshot_id]],tblSnapshotNorms[snapshot_id],0))"
    Case "tblItems.norm_basis_qty"
        s = "=IF(ISNUMBER(INDEX(tblSnapshotNorms[norm_basis_qty],MATCH(tblItems[[#This Row],[snapshot_id]],tblSnapshotNorms[snapshot_id],0))),INDEX(tblSnapshotNorms[norm_basis_qty],MATCH(tblIte"
        s = s & "ms[[#This Row],[snapshot_id]],tblSnapshotNorms[snapshot_id],0)),NA())"
    Case "tblItems.norm_count"
        s = "=IF(AND(ISNUMBER(tblItems[[#This Row],[input_quantity]]),ISNUMBER(tblItems[[#This Row],[unit_conversion]]),ISNUMBER(tblItems[[#This Row],[norm_basis_qty]])),IF(AND(tblItems[[#This "
        s = s & "Row],[norm_basis_qty]]>0,tblItems[[#This Row],[unit_conversion]]>0),tblItems[[#This Row],[input_quantity]]*tblItems[[#This Row],[unit_conversion]]/tblItems[[#This Row],[norm_basis_"
        s = s & "qty]],NA()),NA())"
    Case "tblItems.cost_VL"
        s = "=SUMIFS(tblAnalysis[cost],tblAnalysis[item_id],tblItems[[#This Row],[item_id]],tblAnalysis[group],""VL"")"
    Case "tblItems.cost_NC"
        s = "=SUMIFS(tblAnalysis[cost],tblAnalysis[item_id],tblItems[[#This Row],[item_id]],tblAnalysis[group],""NC"")"
    Case "tblItems.cost_M"
        s = "=SUMIFS(tblAnalysis[cost],tblAnalysis[item_id],tblItems[[#This Row],[item_id]],tblAnalysis[group],""M"")"
    Case "tblItems.direct_cost"
        s = "=tblItems[[#This Row],[cost_VL]]+tblItems[[#This Row],[cost_NC]]+tblItems[[#This Row],[cost_M]]"
    Case "tblItems.unit_price"
        s = "=IF(AND(ISNUMBER(tblItems[[#This Row],[direct_cost]]),ISNUMBER(tblItems[[#This Row],[input_quantity]])),IF(tblItems[[#This Row],[input_quantity]]>0,tblItems[[#This Row],[direct_cos"
        s = s & "t]]/tblItems[[#This Row],[input_quantity]],""""),NA())"
    Case "tblItems.status"
        s = "=IF(INDEX(tblSnapshotNorms[is_demo],MATCH(tblItems[[#This Row],[snapshot_id]],tblSnapshotNorms[snapshot_id],0))=TRUE,""demo"",INDEX(tblSnapshotNorms[status],MATCH(tblItems[[#This Row"
        s = s & "],[snapshot_id]],tblSnapshotNorms[snapshot_id],0)))"
    Case "tblAnalysis.item_code"
        s = "=INDEX(tblItems[code],MATCH(tblAnalysis[[#This Row],[item_id]],tblItems[item_id],0))"
    Case "tblAnalysis.original_amount"
        s = "=IF(ISNUMBER(INDEX(tblSnapshotLines[amount],MATCH(tblAnalysis[[#This Row],[snapshot_line_id]],tblSnapshotLines[snapshot_line_id],0))),INDEX(tblSnapshotLines[amount],MATCH(tblAnalys"
        s = s & "is[[#This Row],[snapshot_line_id]],tblSnapshotLines[snapshot_line_id],0)),NA())"
    Case "tblAnalysis.effective_amount"
        s = "=IF(ISNUMBER(tblAnalysis[[#This Row],[adjustment_factor]]),tblAnalysis[[#This Row],[original_amount]]*tblAnalysis[[#This Row],[adjustment_factor]],NA())"
    Case "tblAnalysis.norm_count"
        s = "=INDEX(tblItems[norm_count],MATCH(tblAnalysis[[#This Row],[item_id]],tblItems[item_id],0))"
    Case "tblAnalysis.total_quantity"
        s = "=IF(tblAnalysis[[#This Row],[amount_kind]]=""quantity"",tblAnalysis[[#This Row],[norm_count]]*tblAnalysis[[#This Row],[effective_amount]],"""")"
    Case "tblAnalysis.price"
        s = "=IF(tblAnalysis[[#This Row],[amount_kind]]=""quantity"",IF(ISNUMBER(INDEX(tblPrices[effective_price],MATCH(tblAnalysis[[#This Row],[price_id]],tblPrices[price_id],0))),INDEX(tblPrice"
        s = s & "s[effective_price],MATCH(tblAnalysis[[#This Row],[price_id]],tblPrices[price_id],0)),NA()),"""")"
    Case "tblAnalysis.qty_cost"
        s = "=IF(tblAnalysis[[#This Row],[amount_kind]]=""quantity"",ROUND(tblAnalysis[[#This Row],[total_quantity]]*tblAnalysis[[#This Row],[price]],TA_RoundCost),"""")"
    Case "tblAnalysis.cost"
        s = "=IF(tblAnalysis[[#This Row],[amount_kind]]=""quantity"",tblAnalysis[[#This Row],[qty_cost]],IF(tblAnalysis[[#This Row],[amount_kind]]=""percent"",IF(COUNTIFS(tblAnalysis[item_id],tblAn"
        s = s & "alysis[[#This Row],[item_id]],tblAnalysis[snapshot_line_id],tblAnalysis[[#This Row],[basis_ref]],tblAnalysis[amount_kind],""quantity"")+COUNTIFS(tblAnalysis[item_id],tblAnalysis[[#Th"
        s = s & "is Row],[item_id]],tblAnalysis[group],tblAnalysis[[#This Row],[basis_ref]],tblAnalysis[amount_kind],""quantity"")=0,NA(),ROUND(tblAnalysis[[#This Row],[effective_amount]]/100*(SUMIFS"
        s = s & "(tblAnalysis[qty_cost],tblAnalysis[item_id],tblAnalysis[[#This Row],[item_id]],tblAnalysis[snapshot_line_id],tblAnalysis[[#This Row],[basis_ref]])+SUMIFS(tblAnalysis[qty_cost],tblA"
        s = s & "nalysis[item_id],tblAnalysis[[#This Row],[item_id]],tblAnalysis[group],tblAnalysis[[#This Row],[basis_ref]])),TA_RoundCost)),NA()))"
    Case "tblResourceSummary.quantity"
        s = "=SUMIFS(tblAnalysis[total_quantity],tblAnalysis[resource_id],tblResourceSummary[[#This Row],[resource_id]],tblAnalysis[price_id],tblResourceSummary[[#This Row],[price_id]])"
    Case "tblResourceSummary.price"
        s = "=IF(ISNUMBER(INDEX(tblPrices[effective_price],MATCH(tblResourceSummary[[#This Row],[price_id]],tblPrices[price_id],0))),INDEX(tblPrices[effective_price],MATCH(tblResourceSummary[[#"
        s = s & "This Row],[price_id]],tblPrices[price_id],0)),NA())"
    Case "tblResourceSummary.cost"
        s = "=SUMIFS(tblAnalysis[qty_cost],tblAnalysis[resource_id],tblResourceSummary[[#This Row],[resource_id]],tblAnalysis[price_id],tblResourceSummary[[#This Row],[price_id]])"
    Case "tblPrices.effective_price"
        s = "=IF(NOT(ISNUMBER(tblPrices[[#This Row],[quoted_price]])),NA(),IF(AND(tblPrices[[#This Row],[quoted_price]]=0,OR(tblPrices[[#This Row],[zero_reason]]="""",tblPrices[[#This Row],[revie"
        s = s & "wer]]="""")),NA(),IF(tblPrices[[#This Row],[includes_transport]]=""no"",IF(ISNUMBER(tblPrices[[#This Row],[transport]]),ROUND(tblPrices[[#This Row],[quoted_price]]+tblPrices[[#This Row"
        s = s & "],[transport]]+N(tblPrices[[#This Row],[handling]]),TA_RoundPrice),NA()),IF(OR(tblPrices[[#This Row],[includes_transport]]=""yes"",tblPrices[[#This Row],[includes_transport]]=""n/a""),"
        s = s & "ROUND(tblPrices[[#This Row],[quoted_price]]+N(tblPrices[[#This Row],[handling]]),TA_RoundPrice),NA()))))"
    Case "tblPrices.status"
        s = "=IF(ISNUMBER(tblPrices[[#This Row],[effective_price]]),""ok"",""missing"")"
    Case "summary.group_sum"
        s = "=SUMIFS(tblAnalysis[cost],tblAnalysis[group],""{GROUP}"")"
    Case "summary.rule_rate"
        s = "=IF(ISNUMBER(INDEX(tblCostRules[rate],MATCH(""{RULE}"",tblCostRules[rule_id],0))),INDEX(tblCostRules[rate],MATCH(""{RULE}"",tblCostRules[rule_id],0)),NA())"
    Case "summary.rule_fixed"
        s = "=IF(ISNUMBER(INDEX(tblCostRules[fixed_amount],MATCH(""{RULE}"",tblCostRules[rule_id],0))),INDEX(tblCostRules[fixed_amount],MATCH(""{RULE}"",tblCostRules[rule_id],0)),NA())"
    Case "banner.project_name"
        s = "=INDEX(tblProject[value],MATCH(""project_name"",tblProject[key],0))&"""""
    Case "banner.error_lines"
        s = "=SUMPRODUCT(--ISERROR(tblAnalysis[cost]))"
    Case "banner.demo_norms"
        s = "=COUNTIF(tblSnapshotNorms[is_demo],TRUE)"
    Case "banner.draft_direct"
        s = "=SUMIF(tblAnalysis[cost],""<9.99E+307"")"
    Case Else
        Err.Raise vbObjectError + 700, "FormulaFor", "Khong co cong thuc cho khoa " & key
    End Select
    FormulaFor = s
End Function

Public Function HasFormula(ByVal key As String) As Boolean
    Select Case key
    Case "tblItems.norm_unit_text", "tblItems.norm_basis_qty", "tblItems.norm_count", "tblItems.cost_VL", "tblItems.cost_NC", "tblItems.cost_M", "tblItems.direct_cost", "tblItems.unit_price", "tblItems.status", "tblAnalysis.item_code", "tblAnalysis.original_amount", "tblAnalysis.effective_amount", "tblAnalysis.norm_count", "tblAnalysis.total_quantity", "tblAnalysis.price", "tblAnalysis.qty_cost", "tblAnalysis.cost", "tblResourceSummary.quantity", "tblResourceSummary.price", "tblResourceSummary.cost", "tblPrices.effective_price", "tblPrices.status", "summary.group_sum", "summary.rule_rate", "summary.rule_fixed", "banner.project_name", "banner.error_lines", "banner.demo_norms", "banner.draft_direct"
        HasFormula = True
    End Select
End Function
