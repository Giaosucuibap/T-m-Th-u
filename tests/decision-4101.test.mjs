import test from 'node:test';
import assert from 'node:assert/strict';
import {dataConfidence,riskSignals} from '../lib/decision.js';

test('empty or literal null fields never earn completeness points',()=>{
 assert.equal(dataConfidence({}).value,0);
 assert.equal(dataConfidence({notifyNo:'null',bidNo:'undefined',bidName:'NaN',price:'null',closeDate:'null',location:'undefined',investorName:'null'}).value,0);
});
test('actual plan code exempts a plan from a tender closing date',()=>{
 assert.equal(dataConfidence({bidNo:'PL2600000001'}).value,34);
});
test('malformed price and date do not count as available source fields',()=>{
 assert.equal(dataConfidence({price:'abc',closeDate:'abc'}).value,0);
 assert.equal(dataConfidence({price:2609041591.923}).value,16);
});
test('a closed tender does not produce an imminent submission warning',()=>{
 const signals=riskSignals({notifyNo:'IB2600000001',closeDate:'2020-01-01T00:00:00Z',price:3e9});
 assert.equal(signals.some(s=>s.code==='DEADLINE'),false);
});
