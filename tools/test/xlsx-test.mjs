import {buildXlsx} from '../../lib/xlsx.js';
import fs from 'node:fs';

const CTRL = String.fromCharCode(7) + String.fromCharCode(1);
const rows = [
  {name:'Gói thầu số 01: Thi công xây lắp kênh mương N1 & N2 <thử> "dấu nháy"', code:'IB2600455310-00', price:12500000000, pct:2.76, url:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?x=1', d:'01/09/2026'},
  {name:'Gói có ký tự điều khiển:' + CTRL + ' xong', code:'BP2600643669', price:null, pct:null, url:'', d:''},
  {name:'Sửa chữa nâng cấp hồ chứa Đạ Tẻh', code:'IB2600455999-01', price:987654321, pct:15.5, url:'https://muasamcong.mpi.gov.vn/a', d:'02/09/2026'}
];
const cols = [
  {header:'Tên gói thầu',key:'name',type:'text'},
  {header:'Mã',key:'code',type:'text'},
  {header:'Giá gói thầu',key:'price',type:'money'},
  {header:'Giảm giá',key:'pct',type:'percent'},
  {header:'Link e-GP',key:'url',type:'url'},
  {header:'Ngày',key:'d',type:'text'}
];

const b1 = buildXlsx({sheetName:'Gói thầu', columns:cols, rows});
fs.writeFileSync('/tmp/t1.xlsx', b1);
const b2 = buildXlsx({sheets:[{sheetName:'Trang/1:*[a]',columns:cols,rows},{sheetName:'Rỗng',columns:cols,rows:[]}]});
fs.writeFileSync('/tmp/t2.xlsx', b2);
console.log('t1', b1.length, 'bytes; t2', b2.length, 'bytes');
