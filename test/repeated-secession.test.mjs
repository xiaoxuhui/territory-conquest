import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SECESSION_GRACE} from '../dist/engine.js';
function born(){
 const g=new Game({humans:0,ai:3,observerMode:'step'});g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
 g.relations[1][0]=2;Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});
 g.resolveSecessions();Object.assign(g.cells[60],{owner:2,army:20});return g;
}
function splitByWar(g,enemy){
 const owner=g.cells[12].owner;g.turn=g.cells[12].stableUntil;Object.assign(g.cells[11],{owner:enemy,army:200});Object.assign(g.cells[13],{owner,army:200});g.relations[enemy][owner]=2;
 for(let i=0;i<4;i++){
  const attacker=g.cells[12].owner===owner?enemy:owner,source=attacker===owner?13:11;g.cells[source].army=200;g.cells[12].army=1;
  assert.equal(g.attack(source,12,attacker,.5).captured,true);g.waitTurn();
 }
 return g.cells[12].owner;
}
test('a country born from war cannot split again through war with its original founding participant',()=>{
 const g=born();assert.equal(g.cells[12].owner,3);const next=splitByWar(g,0);
 assert.equal(next,3);assert.equal(g.secessions,1);assert.equal(g.factions[3].parent,0);assert.equal(g.factions[3].rebel,true);
 assert.equal(g.unrest(g.cells[12]),2);
});
test('a second-generation country can split into a third generation through hostile troop withdrawals',()=>{
 const g=born(),second=splitByWar(g,2);assert.equal(second,4);g.turn=g.cells[12].stableUntil;Object.assign(g.cells[13],{owner:4,army:10});g.relations[4][1]=2;
 for(let i=0;i<4;i++){g.cells[12].army=200;assert.equal(g.attack(12,13,4,1).ok,true);g.waitTurn();}
 assert.equal(g.cells[12].owner,5);assert.equal(g.secessions,3);assert.equal(g.factions[5].parent,4);assert.equal(g.factions[5].cause,'drain');assert.equal(g.players,6);assert.equal(g.relations.length,6);assert.ok(g.relations.every(row=>row.length===6));
});
test('the original twelve-round stability grace remains, then normal withdrawal unrest can cause another split',()=>{
 const g=born();Object.assign(g.cells[13],{owner:3,army:10});g.relations[3][2]=2;
 for(let i=0;i<4;i++){g.cells[12].army=200;g.attack(12,13,3,1);g.waitTurn();assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.secessions,1);}
 g.turn=SECESSION_GRACE;
 for(let i=0;i<4;i++){g.cells[12].army=200;g.attack(12,13,3,1);g.waitTurn();}
 assert.equal(g.cells[12].owner,4);assert.equal(g.factions[4].parent,3);assert.equal(g.factions[4].cause,'drain');
});
test('a new-country takeover preserves the captured land previous unrest instead of clearing it',()=>{
 const g=born();g.turn=SECESSION_GRACE;g.relations[3][2]=2;g.cells[12].army=200;
 Object.assign(g.cells[22],{owner:2,army:1,unrestEvents:Array.from({length:3},()=>({turn:g.turn,kind:'capture',actor:0,victim:2}))});
 assert.equal(g.attack(12,22,3,1).captured,true);assert.equal(g.unrest(g.cells[22]),4);
 const result=g.resolveSecessions();assert.equal(result.length,1);assert.equal(result[0].oldOwner,3);assert.equal(g.cells[22].owner,4);
 assert.equal(result[0].armyChanges[0].after,result[0].armyChanges[0].before*10);
});
test('war against a third country can also cause a new country to split',()=>{
 const g=born();g.turn=SECESSION_GRACE;Object.assign(g.cells[22],{owner:3,homeland:3,army:1});g.relations[3][2]=2;g.relations[2][3]=2;
 for(let i=0;i<4;i++){
  const owner=g.cells[22].owner===3?2:3,source=owner===3?12:21;Object.assign(g.cells[source],{owner,army:200});g.cells[22].army=1;g.attack(source,22,owner,.5);g.waitTurn();
 }
 assert.equal(g.cells[22].owner,4);assert.equal(g.factions[4].parent,3);assert.equal(g.secessions,2);
});
