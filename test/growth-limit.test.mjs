import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function founded(parentLand=2,options={}){
  const g=new Game({humans:0,ai:3,...options});g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
  g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));
  for(let i=0;i<parentLand;i++)Object.assign(g.cells[40+i],{owner:0,army:10});
  Object.assign(g.cells[50],{owner:1,army:10});Object.assign(g.cells[60],{owner:2,army:10});
  for(const [id,army,count] of [[22,10,4],[21,7,2]])Object.assign(g.cells[id],{owner:0,homeland:1,army,unrestEvents:Array.from({length:count},()=>({turn:0,kind:'capture',actor:0,victim:1}))});
  g.resolveSecessions();return g;
}
test('equal or smaller new countries retain founding growth and compare with the actual parent',()=>{
  for(const parentLand of [2,3]){
    const g=founded(parentLand);assert.equal(g.factions[3].parent,0);assert.equal(g.factions[3].origin,1);
    assert.equal(g.factions[3].growthLimited,undefined);assert.equal(g.growthAmount(g.cells[22]),300);assert.equal(g.growthAmount(g.cells[21]),70);
    assert.equal(g.stats()[1].land,1); // The historical homeland is smaller but is not the parent being compared.
  }
});
test('a country already larger at founding immediately switches ordinary growth to one and capital growth to three',()=>{
  const g=founded(1);assert.equal(g.factions[3].growthLimited,true);assert.equal(g.cells[22].army,100);assert.equal(g.cells[21].army,70);
  g.waitTurn();assert.equal(g.cells[22].army,103);assert.equal(g.cells[21].army,71);assert.equal(g.cells[22].birthArmy,100);
});
test('capturing empty land crosses the strict threshold immediately, including all later ordinary land',()=>{
  const g=founded();assert.equal(g.attack(22,23,3,.5).captured,true);assert.equal(g.factions[3].growthLimited,true);
  assert.equal(g.growthAmount(g.cells[22]),3);assert.equal(g.growthAmount(g.cells[21]),1);assert.equal(g.growthAmount(g.cells[23]),1);
  g.waitTurn();assert.equal(g.cells[22].army,53);assert.equal(g.cells[21].army,71);assert.equal(g.cells[23].army,51);
});
test('parent losses elsewhere trigger the same rule before the next growth settlement',()=>{
  const g=founded();g.cells[40].owner=2;
  g.waitTurn();assert.equal(g.factions[3].growthLimited,true);assert.equal(g.cells[22].army,103);
});
test('the switch is permanent after territorial reversal and logs only once',()=>{
  const g=founded(1);g.cells[21].owner=0;for(const id of [41,42,43])g.cells[id].owner=0;
  assert.deepEqual(g.resolveGrowthLimits(),[]);assert.equal(g.growthAmount(g.cells[22]),3);
  g.waitTurn();assert.equal(g.cells[22].army,103);assert.equal(g.events.filter(e=>e.text.includes('增兵永久改为')).length,1);
});
test('an eliminated parent counts as zero and does not reduce a large standing army',()=>{
  const g=founded();g.cells[40].owner=2;g.cells[41].owner=2;g.cells[22].army=1500;
  g.waitTurn();assert.equal(g.factions[3].growthLimited,true);assert.equal(g.cells[22].army,1503);assert.equal(g.growthAmount(g.cells[40]),1);
});
test('new capitals retain three times the ordinary rate, and initial countries keep ordinary growth',()=>{
  const g=founded(1);assert.equal(g.constructCapital(21,3).ok,true);assert.equal(g.growthAmount(g.cells[21]),3);
  Object.assign(g.cells[40],{capital:0});assert.equal(g.growthAmount(g.cells[40]),3);assert.equal(g.growthAmount(g.cells[50]),1);
});
test('continue mode retains founding growth when a country exceeds the target at birth',()=>{
  const g=founded(1,{growthMode:'continue'});assert.equal(g.factions[3].growthLimited,true);assert.equal(g.flatGrowth(3),false);
  g.waitTurn();assert.equal(g.cells[22].army,400);assert.equal(g.cells[21].army,140);
  assert.match(g.events.find(e=>e.text.includes('领土 2 格')).text,/到目标持续/);
});
test('continue mode keeps capital and ordinary multipliers after crossing the target through conquest',()=>{
  const g=founded(2,{growthMode:'continue'});g.attack(22,23,3,.5);assert.equal(g.flatGrowth(3),false);
  g.waitTurn();assert.equal(g.cells[22].army,350);assert.equal(g.cells[21].army,140);assert.equal(g.cells[23].army,150);
});
test('live rule changes preserve armies, turn and pause and restore the original fixed bases',()=>{
  const g=founded(1);g.paused=true;const armies=g.cells.map(c=>c.army),turn=g.turn;
  g.setGrowthMode('continue');assert.equal(g.growthAmount(g.cells[22]),300);assert.equal(g.growthAmount(g.cells[21]),70);
  assert.deepEqual(g.cells.map(c=>c.army),armies);assert.equal(g.turn,turn);assert.equal(g.paused,true);
  g.setGrowthMode('one');assert.equal(g.growthAmount(g.cells[22]),3);assert.equal(g.growthAmount(g.cells[21]),1);
  g.setGrowthMode('continue');assert.equal(g.cells[22].birthArmy,100);assert.equal(g.growthAmount(g.cells[22]),300);
});
test('switching to one remembers a target reached during continue mode despite later territorial losses',()=>{
  const g=founded(1,{growthMode:'continue'});g.cells[21].owner=0;g.setGrowthMode('one');
  assert.equal(g.stats()[3].land,1);assert.equal(g.stats()[0].land,2);assert.equal(g.growthAmount(g.cells[22]),3);
  assert.equal(g.growthAmount(g.cells[40]),1);
});
test('invalid rule choices are rejected without changing the current setting or game state',()=>{
  assert.throws(()=>new Game({growthMode:'invalid'}),/到目标/);
  const g=founded(1),before=JSON.stringify(g);assert.throws(()=>g.setGrowthMode('invalid'),/到目标/);assert.equal(JSON.stringify(g),before);
});
test('newly conquered ordinary land uses founding capital base, and a new capital triples that base',()=>{
  const g=founded(2,{growthMode:'continue'});g.attack(22,23,3,.5);
  assert.equal(g.cells[23].birthArmy,undefined);assert.equal(g.factions[3].birthArmy,100);assert.equal(g.growthAmount(g.cells[23]),100);
  assert.equal(g.constructCapital(23,3).ok,true);assert.equal(g.growthAmount(g.cells[23]),300);
  g.waitTurn();assert.equal(g.cells[23].army,350);
  g.setGrowthMode('one');assert.equal(g.growthAmount(g.cells[22]),3);assert.equal(g.growthAmount(g.cells[23]),3);assert.equal(g.growthAmount(g.cells[21]),1);
  g.setGrowthMode('continue');assert.equal(g.growthAmount(g.cells[23]),300);assert.equal(g.cells[23].army,350);
});
test('inherited ordinary growth continues beyond 999 instead of stopping at the original-country cap',()=>{
  const g=founded(2,{growthMode:'continue'});g.attack(22,23,3,.5);g.cells[23].army=1200;
  g.waitTurn();assert.equal(g.cells[23].army,1300);assert.equal(g.growthCap(g.cells[23]),99900);
});
