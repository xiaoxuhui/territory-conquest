import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;return g;}

test('distance freezes all five relation levels in both directions despite certain global bonuses',()=>{
 for(const [up,down] of [[0,.99],[.99,0],[0,0]])for(let a=0;a<5;a++)for(let b=0;b<5;b++){
  const g=running();g.turn=1;g.setRelationLevel(0,1,a);g.setRelationLevel(1,0,b);
  g.globalPeaceLevel=100;g.globalHostilityLevel=100;let draw=0;g.rng=()=>[up,down][draw++%2];
  const relations=JSON.stringify(g.relations),factions=JSON.stringify(g.factions);
  for(let turn=1;turn<=3;turn++){g.turn=turn;g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),a);assert.equal(g.relationLevel(1,0),b);assert.deepEqual(g.lastGlobalDiplomacy.changes,[]);}
  assert.equal(JSON.stringify(g.relations),relations);
  for(const [i,f] of JSON.parse(factions).entries()){
   assert.deepEqual(g.factions[i].fixedRelations,f.fixedRelations);assert.deepEqual(g.factions[i].persistentPeace,f.persistentPeace);
  }
 }
});

test('losing contact freezes current attitudes and recontact resumes from those exact levels',()=>{
 const g=running({initialSpawns:[11,12]});g.turn=1;g.setRelationLevel(0,1,4);g.setRelationLevel(1,0,2);
 let draw=0;g.rng=()=>draw++%2===0?0:.99;g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),3);assert.equal(g.relationLevel(1,0),1);
 Object.assign(g.cells[12],{owner:-1,army:0});Object.assign(g.cells[68],{owner:1,army:20});
 g.turn++;g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),3);assert.equal(g.relationLevel(1,0),1);
 Object.assign(g.cells[12],{owner:1,army:20});g.turn++;g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),2);assert.equal(g.relationLevel(1,0),0);
});

test('mutually peaceful neighboring countries cannot change relations with a distant third country',()=>{
 const g=running({ai:2,initialSpawns:[11,12,68]});g.turn=1;g.setRelationLevel(0,1,1);g.setRelationLevel(1,0,1);g.setRelationLevel(0,2,4);g.setRelationLevel(2,0,0);
 let draw=0;g.rng=()=>draw++%2===0?0:.99;g.resolveDiplomacy();assert.equal(g.globalPeaceLevel,2);assert.equal(g.relationLevel(0,1),0);assert.equal(g.relationLevel(1,0),0);assert.equal(g.relationLevel(0,2),4);assert.equal(g.relationLevel(2,0),0);assert.equal(g.relationLevel(1,2),2);assert.equal(g.relationLevel(2,1),2);
 assert.ok(g.lastGlobalDiplomacy.changes.every(({from,to})=>g.sharesBorder(from,to)));
});
test('global changes never affect unseen countries, even after a hundred successful global events',()=>{
 const g=running();let draws=0;g.rng=()=>draws++%2===0?0:.99;
 for(let i=0;i<100;i++)g.waitTurn();assert.equal(g.relationLevel(0,1),2);assert.equal(g.relationLevel(1,0),2);assert.equal(draws,200);assert.equal(g.sharesBorder(0,1),false);
});
test('distant global improvement preserves asymmetric attitudes, attack memories and pending march metadata',()=>{
 const g=running();g.turn=1;g.relations[0][1]=2;g.relations[1][0]=0;g.attackedBy[0][1]=true;g.aiMarches[0]={head:11,target:1,kind:'attack'};
 let draws=0;g.rng=()=>draws++%2===0?0:.99;g.resolveDiplomacy();assert.equal(g.attitude(0,1),2);assert.equal(g.relationLevel(1,0),1);assert.equal(g.attackedBy[0][1],true);assert.equal(g.aiMarches[0].target,1);
});
test('diagonal land and contacts through a third country do not count as meeting',()=>{
  const g=running({ai:2});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));
  Object.assign(g.cells[11],{owner:0,army:10});Object.assign(g.cells[22],{owner:1,army:10});assert.equal(g.sharesBorder(0,1),false);
  g.cells[22].owner=-1;Object.assign(g.cells[13],{owner:1,army:10});Object.assign(g.cells[12],{owner:2,army:10});
  assert.equal(g.sharesBorder(0,2),true);assert.equal(g.sharesBorder(1,2),true);assert.equal(g.sharesBorder(0,1),false);
  g.relations[0][1]=2;g.relations[1][0]=0;assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),0);
});
test('any owned island touching the other country establishes contact for the whole faction',()=>{
  const g=running();Object.assign(g.cells[55],{owner:0,army:10});Object.assign(g.cells[56],{owner:1,army:10});
  assert.equal(g.sharesBorder(0,1),true);g.relations[0][1]=1;g.relations[1][0]=2;g.turn=1;let draws=0;g.rng=()=>draws++%2===0?0:.99;
  assert.equal(g.resolveDiplomacy().length,1);assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),1);
});
test('actual capture that removes the last contact preserves current hostility in both directions',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1});g.relations[0][1]=2;g.relations[1][0]=2;g.attackedBy[1][0]=true;
  assert.equal(g.sharesBorder(0,1),true);assert.equal(g.attack(11,12,0,1).captured,true);assert.equal(g.sharesBorder(0,1),false);
  assert.equal(g.relations[0][1],2);assert.equal(g.relations[1][0],2);assert.equal(g.attackedBy[1][0],true);
});
test('contact enables the original directed reactions and probability rules while unseen war declarations are invalid',()=>{
  const g=running();assert.equal(g.declareWar(1).ok,false);assert.equal(g.turn,0);Object.assign(g.cells[12],{owner:1,army:100});
  assert.equal(g.declareWar(1,{defer:true}).ok,true);assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),1);assert.equal(g.turn,1);
  g.rng=()=>.5;while(g.resolving)g.stepTurn();assert.equal(g.attack(11,12,0,.5).ok,true);assert.equal(g.attitude(1,0),2);
});
test('recontact resumes from the preserved distinct peace and hostility',()=>{
  const g=running();g.relations[0][1]=0;g.relations[1][0]=2;g.turn=1;g.rng=()=>.99;g.resolveDiplomacy();Object.assign(g.cells[12],{owner:1,army:10});
  assert.equal(g.sharesBorder(0,1),true);assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),2);
});
