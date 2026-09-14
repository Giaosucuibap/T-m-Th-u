import test from 'node:test';
import assert from 'node:assert/strict';
import {provinceCodesByName,wardNamesForProvince} from '../lib/areas.js';
const provinces=[
 {name:'Tỉnh Lâm Đồng',code:'68',fold:'tinh lam dong'},
 {name:'Tỉnh Lâm Đồng',code:'703',fold:'tinh lam dong'},
 {name:'Tỉnh Thanh Hóa',code:'38',fold:'tinh thanh hoa'},
 {name:'Thành phố Hà Nội',code:'01',fold:'thanh pho ha noi'},
 {name:'Thành phố Hồ Chí Minh',code:'79',fold:'thanh pho ho chi minh'}
];
test('province selection preserves every exact current/legacy name without broadening fragments',()=>{
 for(const query of ['Lâm Đồng','Tỉnh Lâm Đồng','lam dong'])assert.deepEqual(provinceCodesByName(provinces,query),['68','703']);
 for(const query of ['Thanh','Thành phố','Tỉnh','Lâm','Hà','null'])assert.deepEqual(provinceCodesByName(provinces,query),[]);
 assert.deepEqual(provinceCodesByName(provinces,'Thanh Hóa'),['38']);
 assert.deepEqual(provinceCodesByName(provinces,'TP Hà Nội'),['01']);
 assert.deepEqual(provinceCodesByName(provinces,'01'),['01']);
});
test('ward suggestion merges only wards of the exact selected province and legacy codes',()=>{
 const areas={provinces,wardsByProvince:{68:[{name:'Xã A',fold:'xa a'}],703:[{name:'Xã B',fold:'xa b'}],38:[{name:'Xã C',fold:'xa c'}]}};
 assert.deepEqual(wardNamesForProvince(areas,'Lâm Đồng'),['Xã A','Xã B']);
 assert.deepEqual(wardNamesForProvince(areas,'Thanh'),[]);
});
