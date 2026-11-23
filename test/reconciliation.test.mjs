import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,RELATION_LEVELS,combinedDiplomacyChance,DIPLOMACY_IMPROVE_CHANCE,DIPLOMACY_WORSEN_CHANCE} from '../dist/engine.js';
function board(options={}){const g=new Game({w:6,h:4,humans:1,ai:1,...options});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));for(const [owner,id] of [0,1,5,18].slice(0,g.players).entries())Object.assign(g.cells[id],{owner,army:20});if(g.players>2)for(const id of [6,7])Object.assign(g.cells[id],{owner:2,army:20});g.running=true;g.turn=1;g.aiMove=()=>null;roll(g,.99,.99);return g;}
function roll(g,up,down){let draws=0;g.rng=()=>[up,down][draws++%2];return ()=>draws;}
function close(a,b){assert.ok(Math.abs(a-b)<1e-12);}

import {SECESSION_ARMY_MULTIPLIER} from '../dist/engine.js';

test('global upward movement has a one-percent base and moves through all five ranks',()=>{
 assert.equal(DIPLOMACY_IMPROVE_CHANCE,.01);assert.deepEqual(RELATION_LEVELS,['持久和平','和平','中立','敌对','持久敌对']);
 const g=board({ai:2}),pairs=[[0,1],[0,2],[1,0],[1,2],[2,0],[2,1]],levels=[0,1,2,3,4,2];pairs.forEach(([a,b],i)=>g.setRelationLevel(a,b,levels[i]));roll(g,0,.99);g.resolveDiplomacy();pairs.forEach(([a,b],i)=>assert.equal(g.relationLevel(a,b),Math.max(0,levels[i]-1)));
});
test('global improvement does not jump to the friendlier reverse direction',()=>{
 const g=board();g.setRelationLevel(0,1,4);g.setRelationLevel(1,0,0);roll(g,0,.99);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),3);assert.equal(g.relationLevel(1,0),0);
});
test('global upward movement retains the exact one-percent boundary',()=>{
 for(const [value,rank] of [[.009999,1],[.01,2]]){const g=board();roll(g,value,.99);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),rank);}
});
test('multiplayer settles global diplomacy after the final human, with synchronous and staged turns matching',()=>{
 const make=()=>{const g=new Game({humans:2,ai:0,initialSpawns:[11,12]});g.running=true;roll(g,0,.99);return g;};const g=make();g.waitTurn();assert.equal(g.currentHuman,1);assert.equal(g.lastGlobalDiplomacy,null);
 g.waitTurn({defer:true});const phase=g.stepTurn();assert.equal(phase.diplomacy[0].kind,'global-up');assert.equal(g.attitude(0,1),0);
 const sync=make();sync.waitTurn();sync.waitTurn();assert.deepEqual(sync.relations,g.relations);
});
test('tenfold founding uses each joining tile own army once, including values over the normal growth cap',()=>{
  assert.equal(SECESSION_ARMY_MULTIPLIER,10);const g=board();
  for(const [id,army,events] of [[22,7,4],[21,120,2],[23,0,2]])Object.assign(g.cells[id],{owner:0,army,unrestEvents:Array.from({length:events},()=>({turn:1,kind:'capture'}))});
  const initial=g.cells[g.spawns[1]].army,result=g.resolveSecessions();assert.equal(result.length,1);
  assert.deepEqual(result[0].armyChanges,[{id:22,before:7,after:70},{id:21,before:120,after:1200},{id:23,before:0,after:0}]);
  assert.equal(g.cells[21].army,1200);assert.equal(g.cells[g.spawns[1]].army,initial);assert.deepEqual(g.resolveSecessions(),[]);assert.equal(g.cells[21].army,1200);
});
