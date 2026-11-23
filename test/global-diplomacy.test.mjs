import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function board(ai=1){const g=new Game({w:6,h:4,humans:1,ai});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));Object.assign(g.cells[0],{owner:0,army:20});Object.assign(g.cells[1],{owner:1,army:20});g.running=true;g.turn=1;g.aiMove=()=>null;return g;}
function rolls(g,up,down){let count=0;g.rng=()=>[up,down][count++%2];return ()=>count;}
test('global up and down are two independent trials and can produce either, neither, or cancellation',()=>{
 for(const [up,down,kind,rank] of [[0,.99,'global-up',1],[.99,0,'global-down',3],[0,0,'global-cancel',2],[.99,.99,'none',2]]){
  const g=board(),count=rolls(g,up,down);g.resolveDiplomacy();assert.equal(g.lastGlobalDiplomacy.kind,kind);assert.equal(g.relationLevel(0,1),rank);assert.equal(g.relationLevel(1,0),rank);assert.equal(count(),2);
 }
});
test('global events affect only living countries and never alter self-relations',()=>{
 const g=board(2);rolls(g,0,.99);const result=g.resolveDiplomacy()[0];assert.equal(result.changes.length,2);assert.equal(g.relationLevel(0,1),1);assert.equal(g.relationLevel(0,2),2);assert.equal(g.attitude(0,0),0);assert.equal(g.attitude(1,1),0);
});
test('probabilities above a combined hundred percent remain independent without being normalized or clipped',()=>{
 const g=board();g.globalPeaceLevel=150;g.globalHostilityLevel=150;const p=g.globalDiplomacyChances();assert.ok(p.up+p.down>1);assert.equal(p.up,p.down);rolls(g,p.up/2,(1+p.down)/2);g.resolveDiplomacy();assert.equal(g.lastGlobalDiplomacy.kind,'global-up');
});
test('at near certainty simultaneous events cancel at the extremes instead of causing order-dependent clamping',()=>{
 const g=board();g.setRelationLevel(0,1,0);g.setRelationLevel(1,0,4);g.globalPeaceLevel=1e6;g.globalHostilityLevel=1e6;rolls(g,.999999,.999999);g.resolveDiplomacy();assert.equal(g.lastGlobalDiplomacy.kind,'global-cancel');assert.equal(g.relationLevel(0,1),0);assert.equal(g.relationLevel(1,0),4);
});
test('unstarted, paused and ended games receive no global random trials',()=>{
 for(const state of ['unstarted','paused','winner']){const g=board(),count=rolls(g,0,0);if(state==='unstarted')g.running=false;if(state==='paused')g.paused=true;if(state==='winner')g.winner=0;assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(count(),0);assert.equal(g.globalPeaceLevel,0);}
 const solo=new Game({ai:0});solo.running=true;solo.turn=1;const count=rolls(solo,0,0);assert.deepEqual(solo.resolveDiplomacy(),[]);assert.equal(count(),0);
});
test('64-country global updates change only the 224 bordering directions and preserve all distant pairs',()=>{
 const initialSpawns=Array.from({length:64},(_,i)=>Math.floor(i/8)*100+i%8);
 const g=new Game({w:100,h:100,humans:0,ai:64,observerMode:'step',initialSpawns});g.running=true;g.aiMove=()=>null;const count=rolls(g,0,.99);g.waitTurn();assert.equal(g.lastGlobalDiplomacy.kind,'global-up');assert.equal(g.lastGlobalDiplomacy.changes.length,224);assert.equal(g.relationLevel(0,63),2);assert.equal(g.relationLevel(63,0),2);assert.equal(count(),2);assert.ok(g.stats().every(s=>s.land===1&&s.army===23));
});
test('global downgrade releases persistent peace so a human can subsequently declare war',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});g.setRelationLevel(0,1,0);rolls(g,.99,0);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),1);assert.equal(g.declareWar(1,{defer:true}).ok,true);assert.equal(g.attitude(0,1),2);
});
test('a global change preserves ownership, armies, capital positions and founding participant records',()=>{
 const g=board();g.factions[0].participants=[1];g.setRelationLevel(0,1,4);const cells=JSON.stringify(g.cells),spawns=[...g.spawns];rolls(g,0,.99);g.resolveDiplomacy();assert.equal(JSON.stringify(g.cells),cells);assert.deepEqual(g.spawns,spawns);assert.deepEqual(g.factions[0].participants,[1]);assert.equal(g.players,2);assert.equal(g.winner,null);
});
