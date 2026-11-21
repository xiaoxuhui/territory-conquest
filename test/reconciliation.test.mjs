import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,DIPLOMACY_IMPROVE_CHANCE,SECESSION_ARMY_MULTIPLIER} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.turn=1;g.rng=()=>0;g.aiMove=()=>null;return g;}
test('unequal attitudes reconcile toward the friendlier side for every direction and level',()=>{
  for(const [ab,ba] of [[0,1],[1,0],[0,2],[2,0],[1,2],[2,1]]){
    const g=running();g.relations[0][1]=ab;g.relations[1][0]=ba;const changes=g.resolveDiplomacy();
    assert.equal(changes.length,1);assert.equal(g.attitude(0,1),Math.min(ab,ba));assert.equal(g.attitude(1,0),Math.min(ab,ba));
    assert.equal(changes[0].beforeAB,ab);assert.equal(changes[0].beforeBA,ba);
  }
});
test('equal hostility rises to neutral, equal neutrality rises to peace, and peace is capped',()=>{
  const g=running();g.relations[0][1]=2;g.relations[1][0]=2;
  assert.equal(g.resolveDiplomacy().length,1);assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);
  assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.attitude(0,1),1);
  g.turn++;g.resolveDiplomacy();assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),0);
  g.turn++;assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.attitude(0,1),0);assert.equal(g.canAttack(0,1),false);
});
test('each unordered pair receives one ten-percent trial per round with no rerolls or extra rise',()=>{
  assert.equal(DIPLOMACY_IMPROVE_CHANCE,.1);
  for(const [value,expected] of [[.099999,0],[.1,1],[.999,1]]){
    const g=running();let draws=0;g.rng=()=>{draws++;return value;};g.resolveDiplomacy();assert.equal(g.attitude(0,1),expected);assert.equal(draws,1);
    for(let i=0;i<10;i++)g.resolveDiplomacy();assert.equal(draws,1);
  }
  const g=running({ai:2});let draws=0;g.rng=()=>{draws++;return .5;};g.resolveDiplomacy();assert.equal(draws,3);
  assert.equal(g.attitude(0,0),0);assert.equal(g.attitude(1,1),0);
});
test('pause, thinking, unstarted games, game over and eliminated countries do not receive reconciliation trials',()=>{
  const g=running({ai:2});g.cells.forEach(c=>{if(c.owner===2)c.owner=-1;});let draws=0;g.rng=()=>{draws++;return 0;};
  g.paused=true;assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(draws,0);
  g.paused=false;g.running=false;assert.deepEqual(g.resolveDiplomacy(),[]);g.running=true;
  g.winner=0;assert.deepEqual(g.resolveDiplomacy(),[]);g.winner=null;
  g.turn=0;assert.deepEqual(g.resolveDiplomacy(),[]);g.turn=1;
  for(let i=0;i<10;i++)g.update(.25);assert.equal(draws,0);g.resolveDiplomacy();assert.equal(draws,1);
  assert.equal(g.attitude(0,2),1);assert.equal(g.attitude(2,0),1);
});
test('multiplayer settles diplomacy once only after every human action, and staged turns match synchronous ones',()=>{
  const g=running({humans:2,ai:0});g.turn=0;g.waitTurn();assert.equal(g.currentHuman,1);assert.equal(g.attitude(0,1),1);
  g.waitTurn({defer:true});assert.equal(g.attitude(0,1),1);const phase=g.stepTurn();assert.equal(phase.diplomacy.length,1);assert.equal(g.attitude(0,1),0);
  const sync=running({humans:2,ai:0});sync.turn=0;sync.waitTurn();sync.waitTurn();assert.deepEqual(sync.relations,g.relations);
});
test('tenfold founding uses each joining tile own army once, including values over the normal growth cap',()=>{
  assert.equal(SECESSION_ARMY_MULTIPLIER,10);const g=running();
  for(const [id,army,events] of [[22,7,4],[21,120,2],[23,0,2]])Object.assign(g.cells[id],{owner:0,army,unrestEvents:Array.from({length:events},()=>({turn:1,kind:'capture'}))});
  const initial=g.cells[g.spawns[1]].army,result=g.resolveSecessions();assert.equal(result.length,1);
  assert.deepEqual(result[0].armyChanges,[{id:22,before:7,after:70},{id:21,before:120,after:1200},{id:23,before:0,after:0}]);
  assert.equal(g.cells[21].army,1200);assert.equal(g.cells[g.spawns[1]].army,initial);assert.deepEqual(g.resolveSecessions(),[]);assert.equal(g.cells[21].army,1200);
});
test('a new country keeps its founding attitude for that round and participates in reconciliation next round',()=>{
  const g=running();g.turn=0;Object.assign(g.cells[12],{owner:0,army:10});g.cells[11].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'drain',actor:0}));
  g.waitTurn();assert.equal(g.attitude(2,0),2);assert.equal(g.attitude(0,2),1);assert.equal(g.cells[11].army,230);
  g.waitTurn();assert.equal(g.attitude(2,0),1);assert.equal(g.attitude(0,2),1);assert.equal(g.cells[11].army,233);
});
