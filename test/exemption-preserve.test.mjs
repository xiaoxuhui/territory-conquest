import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function born(mode){
 const g=new Game({humans:0,ai:3,secessionMode:mode,observerMode:'step'});g.running=true;g.aiMove=()=>null;
 Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});g.resolveSecessions();g.turn=g.cells[12].stableUntil;return g;
}
test('exempt capture preserves three unrelated events, and the next nonexempt capture can still trigger secession',()=>{
 for(const mode of ['repeat','protected']){
  const g=born(mode);g.cells[12].army=20017;const events=Array.from({length:3},()=>({turn:g.turn,kind:'capture',actor:2,victim:0}));
  Object.assign(g.cells[22],{owner:0,army:1,unrestEvents:events});const r=g.attack(12,22,3,1);assert.equal(r.secessionExempt,true);assert.equal(r.amount,20016);assert.deepEqual(g.cells[22].unrestEvents,events);assert.equal(g.unrest(g.cells[22]),3);assert.equal(g.unrest(g.cells[12]),0);
  g.turn++;Object.assign(g.cells[21],{owner:2,army:20017});g.relations[2][3]=2;g.cells[22].army=1;assert.equal(g.attack(21,22,2,1).secessionExempt,false);assert.equal(g.unrest(g.cells[22]),4);
  const [next]=g.resolveSecessions();assert.equal(next.oldOwner,2);assert.equal(g.cells[22].owner,4);assert.equal(g.secessions,2);
 }
});
test('exemption never erases an already reached threshold from other causes',()=>{
 const g=born('repeat');g.cells[12].army=20017;Object.assign(g.cells[22],{owner:0,army:1,unrestEvents:Array.from({length:4},()=>({turn:g.turn,kind:'capture',actor:2,victim:0}))});assert.equal(g.attack(12,22,3,1).secessionExempt,true);assert.equal(g.unrest(g.cells[22]),4);assert.equal(g.resolveSecessions().length,1);
});
test('old broad enemy arrays and ordinary or permanent hostility cannot change the canonical causal opponent',()=>{
 const g=born('repeat');g.factions[3].homelandEnemies=[0,1,2];g.factions[3].permanentRelations[2]=2;assert.equal(g.secessionExempt(3,2),false);assert.equal(g.secessionExempt(3,0),true);
 g.factions[3].cause='drain';g.factions[3].warOpponent=2;assert.equal(g.secessionExempt(3,2),false);assert.equal(g.secessionExempt(3,1),true);
});
