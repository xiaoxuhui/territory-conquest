import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function born(mode='repeat',direction='out'){
 const g=new Game({humans:0,ai:4,observerMode:'step',secessionMode:mode});g.running=true;g.aiMove=()=>null;
 g.relations[direction==='out'?1:2][direction==='out'?2:1]=2;
 Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});
 assert.equal(g.resolveSecessions()[0].owner,4);g.turn=g.cells[12].stableUntil;
 for(const [owner,id]of [[0,11],[1,13],[2,22],[3,2]])Object.assign(g.cells[id],{owner,army:20});return g;
}
test('native founding peace and the single war opponent remain permanent under all global events',()=>{
 const g=born(),snapshot={...g.factions[4].permanentRelations};assert.deepEqual(snapshot,{0:2,1:0});
 for(let i=0;i<100;i++)for(const [up,down]of [[0,.99],[.99,0],[0,0]]){
  let n=0;g.rng=()=>[up,down][n++%2];g.turn++;g.resolveDiplomacy();assert.equal(g.relationLevel(4,1),0);assert.equal(g.relationLevel(4,0),4);assert.ok(g.lastGlobalDiplomacy.changes.every(e=>e.from!==4||!Object.hasOwn(snapshot,e.to)));
 }
 for(const target of [0,1])for(let level=0;level<5;level++)g.setRelationLevel(4,target,level);assert.deepEqual(g.factions[4].permanentRelations,snapshot);
});
test('founding peace resists attacks and declarations while reverse directions remain independent',()=>{
 const g=born();g.reactToAttack(1,4);assert.equal(g.attitude(4,1),0);assert.equal(g.attackedBy[4][1],true);g.currentHuman=4;assert.equal(g.declareWar(1).ok,false);g.setRelationLevel(1,4,3);assert.equal(g.attitude(1,4),2);assert.equal(g.attitude(4,1),0);
});
test('the homeland other enemies are not inherited in either direction or either mode',()=>{
 for(const direction of ['out','in'])for(const mode of ['repeat','protected']){
  const g=born(mode,direction);assert.equal(g.attitude(4,2),1);assert.equal(g.isPermanentRelation(4,2),false);assert.equal(g.secessionExempt(4,2),false);assert.deepEqual(g.factions[4].homelandEnemies,[0]);assert.equal(g.factions[4].warOpponent,0);
  assert.equal(g.secessionExempt(4,0),true);assert.equal(g.secessionExempt(0,4),false);assert.equal(g.secessionExempt(4,1),true);
  g.cells[12].army=200;g.cells[11].army=1;assert.equal(g.attack(12,11,4,1).secessionExempt,true);assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.unrest(g.cells[11]),0);
  Object.assign(g.cells[21],{owner:0,army:200});g.relations[0][4]=2;g.cells[11].army=1;assert.equal(g.attack(21,11,0,1).secessionExempt,false);assert.equal(g.unrest(g.cells[21]),1);assert.equal(g.unrest(g.cells[11]),1);
 }
});
test('unrelated later enemies and all rule switches preserve the single causal opponent',()=>{
 const g=born();g.relations[1][3]=2;g.relations[4][3]=2;Object.assign(g.cells[13],{owner:4,army:10});g.cells[12].army=200;g.attack(12,13,4,1);assert.deepEqual(g.cells[12].unrestEvents[0].enemies,[0,3]);
 for(const mode of ['protected','repeat']){g.setSecessionMode(mode);assert.equal(g.secessionExempt(4,3),false);assert.equal(g.secessionExempt(4,0),true);}assert.equal(new Game().factions[0].permanentRelations,undefined);
});
test('even an unrelated permanent hostility cannot obtain causal-war immunity',()=>{
 for(const mode of ['repeat','protected']){const g=born(mode);g.factions[4].permanentRelations[3]=2;assert.equal(g.attitude(4,3),2);assert.equal(g.secessionExempt(4,3),false);Object.assign(g.cells[22],{owner:3,army:1});g.cells[12].army=20017;const result=g.attack(12,22,4,1);assert.equal(result.amount,20016);assert.equal(result.secessionExempt,false);assert.equal(g.unrest(g.cells[12]),1);assert.equal(g.unrest(g.cells[22]),1);}
});
test('ordinary and persistent hostility never add opponents to the causal record',()=>{
 for(const mode of ['repeat','protected'])for(const level of [3,4]){const g=born(mode);g.setRelationLevel(4,3,level);g.relations[1][3]=2;assert.equal(g.secessionExempt(4,3),false);assert.deepEqual(g.factions[4].homelandEnemies,[0]);}
});
test('internal withdrawal conflict has no extra opponent even when the homeland has many enemies',()=>{
 for(const mode of ['repeat','protected']){
  const g=new Game({humans:0,ai:4,secessionMode:mode,observerMode:'step'});g.running=true;for(const id of [1,2,3]){g.relations[0][id]=2;g.relations[id][0]=2;}
  Object.assign(g.cells[12],{owner:0,homeland:0,army:20,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'drain',actor:0,hostile:true,enemies:[1,2,3]}))});const [birth]=g.resolveSecessions();assert.equal(birth.cause,'drain');assert.equal(birth.warOpponent,null);assert.deepEqual(g.factions[4].homelandEnemies,[]);assert.deepEqual(g.factions[4].permanentRelations,{0:2});assert.equal(g.secessionExempt(4,0),true);
  for(const id of [1,2,3]){assert.equal(g.attitude(4,id),1);assert.equal(g.isPermanentRelation(4,id),false);assert.equal(g.secessionExempt(4,id),false);}
 }
});
test('the final causal capture determines the only opponent instead of pooling neighboring histories',()=>{
 const g=new Game({ai:3});g.running=true;Object.assign(g.cells[12],{owner:1,homeland:1,army:20,unrestEvents:[{turn:0,kind:'capture',actor:2,victim:1},{turn:0,kind:'capture',actor:1,victim:2},{turn:0,kind:'capture',actor:0,victim:1},{turn:0,kind:'capture',actor:1,victim:0}]});const [birth]=g.resolveSecessions();assert.equal(birth.warOpponent,0);assert.deepEqual(g.factions[4].homelandEnemies,[0]);assert.equal(g.attitude(4,1),0);assert.equal(g.attitude(4,0),2);assert.equal(g.attitude(4,2),1);
});
