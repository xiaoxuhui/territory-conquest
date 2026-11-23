import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,formatArmy} from '../dist/engine.js';
test('only map cells use one digit while other army labels retain three significant digits',()=>{
 assert.equal(formatArmy(123456789,'map'),'1e8');assert.equal(formatArmy(123456789),'1.23×10⁸');assert.equal(formatArmy(123456789,'compact'),'1.23e8');assert.equal(formatArmy(5e12,'map'),'5e12');assert.equal(formatArmy(5e12),'5×10¹²');assert.equal(formatArmy(9.99e9,'map'),'1e10');assert.equal(formatArmy(9999,'map'),'9999');assert.equal(formatArmy(0),'0');
 for(const value of [10000,123456,999999,5e12,8.76e99,1e100])assert.match(formatArmy(value,'map'),/^[1-9]e\d+$/);
 assert.equal(formatArmy(123456,'map').length,3);assert.equal(formatArmy(5e12,'map').length,4);
});
test('formatting never changes large battle arithmetic or sorting values',()=>{
 const g=new Game();g.running=true;g.cells[11].army=5e12+5;Object.assign(g.cells[12],{owner:1,army:5e12+4});g.relations[0][1]=2;
 const r=g.attack(11,12,0,1);assert.equal(r.amount,5e12+4);assert.equal(g.cells[11].army,1);assert.equal(g.cells[12].army,0);assert.equal(r.captured,false);assert.equal(g.cells[12].owner,1);assert.match(g.events.find(e=>e.kind==='battle').text,/5×10¹²/);
});
