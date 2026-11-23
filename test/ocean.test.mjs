import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SEA_ENTRY_CHANCE} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];g.cells[12].terrain='sea';return g;}
test('sea entry has an exact ten-percent boundary and pays troops only on a successful entry',()=>{
  assert.equal(SEA_ENTRY_CHANCE,.1);
  for(const [roll,allowed] of [[0,true],[.099999,true],[.1,false],[.999,false]]){
    const g=running();let draws=0;g.rng=()=>{draws++;return roll;};const result=g.playTurn(11,12,.5);
    assert.equal(result.ok,allowed);assert.equal(draws,1);assert.equal(g.cells[12].owner,allowed?0:-1);assert.equal(g.turn,allowed?1:0);
    assert.equal(g.cells[11].army,allowed?13:20);assert.equal(g.cells[12].army,allowed?11:0);
  }
});
test('failed entry preserves troops, diplomacy, control and the action, but blocks every other sea attempt that round',()=>{
  const g=running();g.cells[10].terrain='sea';Object.assign(g.cells[21],{owner:0,army:20});g.cells[22].terrain='sea';
  const cells=JSON.stringify(g.cells),relations=JSON.stringify(g.relations);let draws=0;g.rng=()=>{draws++;return .9;};
  assert.equal(g.playTurn(11,12).seaFailed,true);assert.equal(g.playTurn(11,10).seaFailed,true);assert.equal(g.playTurn(21,22).seaFailed,true);
  assert.equal(draws,1);assert.equal(JSON.stringify(g.cells),cells);assert.equal(JSON.stringify(g.relations),relations);
  assert.equal(g.currentHuman,0);assert.equal(g.resolving,false);assert.equal(g.turn,0);assert.equal(g.moves,0);
  assert.equal(g.playTurn(21,31).ok,true);assert.equal(g.turn,1);assert.equal(g.cells[31].owner,0);
});
test('a new complete round resets a failed attempt and thinking, pause and rendering queries cannot reroll it',()=>{
  const g=running();let draws=0;g.rng=()=>{draws++;return .9;};g.playTurn(11,12);
  for(let i=0;i<10;i++){g.update(.25);g.seaBlocked(0,g.cells[12]);g.playTurn(11,12);}assert.equal(draws,1);
  g.paused=true;g.waitTurn();g.playTurn(11,12);assert.equal(draws,1);g.paused=false;
  g.waitTurn();g.rng=()=>{draws++;return 0;};assert.equal(g.playTurn(11,12).ok,true);assert.equal(draws,2);
});
test('each local human has an independent sea trial, shared across their own sources and aligned to the same round',()=>{
  const g=running({humans:2,ai:0});Object.assign(g.cells[13],{owner:1,army:20});let draws=0;g.rng=()=>++draws===1?.9:0;
  assert.equal(g.playTurn(11,12).seaFailed,true);assert.equal(g.playTurn(11,21).ok,true);assert.equal(g.currentHuman,1);assert.equal(g.turn,1);
  assert.equal(g.playTurn(13,12).ok,true);assert.equal(g.currentHuman,0);assert.equal(g.turn,1);assert.equal(draws,2);
  g.cells[10].terrain='sea';assert.equal(g.playTurn(11,10).ok,true);assert.equal(draws,3);
});
test('invalid, insufficient, paused and diplomatically forbidden attacks never use the sea trial',()=>{
  const g=running();let draws=0;g.rng=()=>{draws++;return .9;};
  assert.equal(g.attack(11,22,0).ok,false);g.cells[11].army=1;assert.equal(g.attack(11,12,0).ok,false);
  g.cells[11].army=20;g.paused=true;assert.equal(g.attack(11,12,0).ok,false);g.paused=false;
  Object.assign(g.cells[12],{owner:1,army:1});g.relations[0][1]=0;assert.equal(g.attack(11,12,0).ok,false);assert.equal(draws,0);
  g.relations[0][1]=2;assert.equal(g.attack(11,12,0).seaFailed,true);assert.equal(draws,1);assert.equal(g.attitude(1,0),1);
});
test('owned sea transfers and sea-to-land attacks need no new entry trial after a foreign-sea failure',()=>{
  const g=running();Object.assign(g.cells[10],{owner:0,army:10,terrain:'sea'});let draws=0;g.rng=()=>{draws++;return .9;};
  g.attack(11,12,0);assert.equal(g.attack(11,10,0,.5).ok,true);assert.equal(g.attack(10,20,0,.5).ok,true);assert.equal(draws,1);
});
test('entering an enemy sea successfully still resolves normal combat rather than granting a free capture',()=>{
  for(const defenders of [4,10,15]){
    const g=running();Object.assign(g.cells[12],{owner:1,army:defenders});g.relations[0][1]=2;g.rng=()=>0;
    const r=g.attack(11,12,0,.5);assert.equal(r.ok,true);assert.equal(r.seaEntry,true);assert.equal(r.captured,defenders<10);
    assert.equal(g.cells[12].army,Math.abs(defenders-10));assert.equal(g.cells[11].army,10);assert.equal(g.attitude(1,0),2);
  }
});
test('AI sea failure falls back to one legal land action without paying for the failed attack',()=>{
  const g=new Game({humans:0,ai:1,observerMode:'step'});g.running=true;g.cells[12].terrain='sea';g.cells[11].army=100;
  g.aiPlans[0]={rally:11,target:12,age:0};g.rng=()=>.9;
  const result=g.waitTurn();assert.equal(result.actions.length,1);assert.equal(g.cells[result.actions[0].toId].terrain,'land');
  assert.equal(g.cells[12].owner,-1);assert.equal(g.cells[11].army,53);assert.equal(g.seaAttemptFailed(0),false);
  assert.deepEqual(g.seaAttempts[0],{round:1,allowed:false});assert.equal(g.events.filter(e=>e.kind==='sea-entry').length,1);
});
test('an AI surrounded only by foreign sea waits after one failure and retries only next round',()=>{
  const g=new Game({humans:0,ai:1,observerMode:'step'});g.running=true;g.neighbors(11).forEach(id=>g.cells[id].terrain='sea');g.rng=()=>.9;
  assert.equal(g.waitTurn().actions.length,0);assert.equal(g.events.filter(e=>e.kind==='sea-entry').length,1);
  assert.equal(g.waitTurn().actions.length,0);assert.equal(g.events.filter(e=>e.kind==='sea-entry').length,2);assert.equal(g.cells[11].army,26);
});
test('sea participates in ordinary growth and remains required for full-map victory',()=>{
  const g=running({ai:0});g.cells.forEach(c=>Object.assign(c,{owner:0,army:20}));Object.assign(g.cells[12],{owner:-1,army:0,terrain:'sea'});
  g.checkWinner();assert.equal(g.winner,null);g.rng=()=>.9;assert.equal(g.playTurn(11,12).seaFailed,true);assert.equal(g.winner,null);
  g.waitTurn();g.rng=()=>0;assert.equal(g.playTurn(11,12).captured,true);assert.equal(g.winner,0);
});
test('land-sea maps are deterministic and every starting capital has land and a land neighbor',()=>{
  for(const size of [10,30,100])for(const ai of [2,64]){
    const g=new Game({w:size,h:size,humans:0,ai,ocean:true,seed:42});
    assert.ok(g.cells.some(c=>c.terrain==='sea'));assert.ok(g.cells.some(c=>c.terrain==='land'));
    for(const id of g.spawns){assert.equal(g.cells[id].terrain,'land');assert.ok(g.neighbors(id).some(n=>g.cells[n].terrain==='land'));}
  }
  const a=new Game({ocean:true,seed:14}),b=new Game({ocean:true,seed:14}),land=new Game({seed:14});
  assert.deepEqual(a.cells.map(c=>c.terrain),b.cells.map(c=>c.terrain));assert.deepEqual(a.spawns,land.spawns);
});
test('a newly founded country has an independent sea trial despite its parent failure',()=>{
  const g=running();g.rng=()=>.9;g.playTurn(11,12);
  Object.assign(g.cells[22],{owner:0,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
  g.resolveSecessions();g.cells[23].terrain='sea';g.rng=()=>0;
  assert.equal(g.attack(22,23,2,.5).ok,true);assert.equal(g.seaAttemptFailed(0),true);assert.equal(g.cells[23].owner,2);
});
test('64 computers on an ocean map can settle a real full round with legal armies',()=>{
  const g=new Game({w:100,h:100,humans:0,ai:64,ocean:true,observerMode:'step'});g.running=true;
  g.waitTurn();assert.equal(g.turn,1);assert.ok(g.cells.every(c=>Number.isInteger(c.army)&&c.army>=0&&c.owner>=-1&&c.owner<g.players));
});
