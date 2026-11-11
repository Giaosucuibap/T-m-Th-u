import test from 'node:test';
import assert from 'node:assert/strict';
import {explainDiscount, PRICE_BASIS_SOURCE} from '../GiaoSuCuiBap/lib/provenance.js';
import {normalizeKqlcntRecord} from '../GiaoSuCuiBap/lib/kqlcnt.js';

const source='https://muasamcong.mpi.gov.vn/';
const explain=(basis,final)=>explainDiscount(basis,final,PRICE_BASIS_SOURCE.PACKAGE,source);

test('414 absent or nonnumeric prices never manufacture a saving percentage or a formula',()=>{
  const missing=[null,undefined,'',' \t\n ',false,true,NaN,Infinity,-Infinity,[],[0],{},Symbol('missing')];
  for(const value of missing)for(const pair of [[3e9,value],[value,2.8e9]]){
    const result=explain(...pair);
    assert.equal(result.rate,null,String(value));assert.equal(result.formula,null,String(value));
    assert.match(result.note,/Thiếu/);assert.equal(result.basisSource,PRICE_BASIS_SOURCE.PACKAGE);assert.equal(result.sourceUrl,source);
  }
});

test('414 a published numeric zero stays distinct from a missing price',()=>{
  for(const value of [0,'0',' 0 ']){
    const result=explain(3e9,value);assert.equal(result.rate,100);assert.match(result.formula,/− 0\)/);assert.equal(result.note,'');
  }
  for(const value of [0,'0'])assert.equal(explain(value,0).rate,null,'zero basis cannot be a denominator');
  assert.equal(explain(3e9,3e9).rate,0);assert.equal(explain('3000000000','2700000000').rate,10);
});

test('414 normalized e-GP result prices and discount explanation agree when an award price is missing',()=>{
  for(const bidWinningPrice of [null,undefined,'',' ',false,true,[]]){
    const row=normalizeKqlcntRecord({notifyNo:'IB2600000001',bidPrice:3e9,bidWinningPrice});
    assert.equal(row.winningPrice,null);assert.equal(row.savedAmount,null);assert.equal(row.discountRate,null);
    assert.equal(row.discount.rate,null);assert.equal(row.discount.formula,null);assert.match(row.discount.note,/Thiếu/);
  }
});

test('414 normalized e-GP result preserves an explicitly published zero award value',()=>{
  for(const bidWinningPrice of [0,'0',[0]]){
    const row=normalizeKqlcntRecord({notifyNo:'IB2600000001',bidPrice:3e9,bidWinningPrice});
    assert.equal(row.winningPrice,0);assert.equal(row.savedAmount,3e9);assert.equal(row.discountRate,100);
    assert.equal(row.discount.rate,100);assert.match(row.discount.formula,/− 0\)/);
  }
});
