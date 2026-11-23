import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function founded(){
  const g=new Game();g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
  for(const id of [10,13,14])Object.assign(g.cells[id],{owner:0,army:1});
  for(const [id,army,count] of [[22,10,4],[21,7,2],[23,0,2]])Object.assign(g.cells[id],{owner:0,homeland:0,army,unrestEvents:Array.from({length:count},()=>({kind:'capture',turn:0,actor:1,victim:0}))});
  g.resolveSecessions();return g;
}
test('each founding tile fixes its own post-tenfold army as its growth base',()=>{
  const g=founded();assert.equal(g.cells[22].birthArmy,100);assert.equal(g.cells[21].birthArmy,70);assert.equal(g.cells[23].birthArmy,0);
  assert.equal(g.growthAmount(g.cells[22]),300);assert.equal(g.growthAmount(g.cells[21]),70);assert.equal(g.growthAmount(g.cells[23]),0);
  g.waitTurn();assert.equal(g.cells[22].army,400);assert.equal(g.cells[21].army,140);assert.equal(g.cells[23].army,0);
  g.waitTurn();assert.equal(g.cells[22].army,700);assert.equal(g.cells[21].army,210);assert.equal(g.cells[22].birthArmy,100);
});
test('losses and paid transfers never change the fixed founding base',()=>{
  const g=founded();g.attack(22,21,2,1);assert.equal(g.cells[22].army,1);assert.equal(g.cells[21].army,169);
  assert.equal(g.cells[22].birthArmy,100);assert.equal(g.cells[21].birthArmy,70);
  g.waitTurn();assert.equal(g.cells[22].army,301);assert.equal(g.cells[21].army,239);
});
test('relocating and building capitals use the destination tile base and restore the old tile ordinary rate',()=>{
  const g=founded();assert.equal(g.relocateCapital(21,2,22).ok,true);
  assert.equal(g.growthAmount(g.cells[22]),100);assert.equal(g.growthAmount(g.cells[21]),210);
  assert.equal(g.constructCapital(22,2).ok,true);assert.equal(g.growthAmount(g.cells[22]),300);
  g.waitTurn();assert.equal(g.cells[22].army,400);assert.equal(g.cells[21].army,280);
});
test('capturing a founding capital keeps the tile base but clears its capital multiplier',()=>{
  const g=founded();Object.assign(g.cells[12],{owner:1,army:1000});g.relations[1][2]=2;
  assert.equal(g.attack(12,22,1,1).captured,true);assert.equal(g.isCapital(g.cells[22]),false);assert.equal(g.cells[22].birthArmy,100);
  assert.equal(g.growthAmount(g.cells[22]),100);
  g.waitTurn();assert.equal(g.cells[22].army,999); // 899 survivors + ordinary growth of 100.
});
test('combat still suppresses both founding capital and ordinary growth for the fighting round',()=>{
  const g=founded();Object.assign(g.cells[12],{owner:0,army:10});g.relations[0][2]=2;
  const result=g.playTurn(12,22,1);assert.equal(result.ok,true);assert.equal(g.cells[22].army,91);
  assert.equal(g.cells[21].army,140);assert.equal(g.cells[22].birthArmy,100);
});
test('founding growth works above 999, uses a scaled cap and never reduces an over-cap army',()=>{
  const g=founded();g.cells[22].army=1200;g.waitTurn();assert.equal(g.cells[22].army,1500);
  const cap=g.growthCap(g.cells[22]);assert.equal(cap,99900);g.cells[22].army=cap-1;g.waitTurn();assert.equal(g.cells[22].army,cap);
  g.cells[22].army=cap+100;g.waitTurn();assert.equal(g.cells[22].army,cap+100);
});
test('new-country ordinary land inherits its founding base while initial countries keep their original growth',()=>{
  const g=founded();Object.assign(g.cells[20],{owner:2,army:10});
  assert.equal(g.growthAmount(g.cells[20]),100);assert.equal(g.growthAmount(g.cells[11]),3);
  g.waitTurn();assert.equal(g.cells[20].army,110);assert.equal(g.cells[11].army,23);
});
test('founding is applied after growth and the first boosted growth occurs on the next round',()=>{
  const g=new Game();g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
  Object.assign(g.cells[22],{owner:0,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
  g.waitTurn();assert.equal(g.cells[22].army,110);assert.equal(g.cells[22].birthArmy,110);
  g.waitTurn();assert.equal(g.cells[22].army,440);
});
