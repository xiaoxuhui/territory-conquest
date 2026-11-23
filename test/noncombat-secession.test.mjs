import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function born(){
 const g=new Game({humans:0,ai:3,observerMode:'step',secessionMode:'repeat'});g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
 g.relations[1][0]=2;Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});
 g.resolveSecessions();g.turn=g.cells[12].stableUntil;
 Object.assign(g.cells[13],{owner:3,army:10});return g;
}
test('new country with no homeland or founding enemies alive still accumulates four friendly withdrawals and splits',()=>{
 const g=born(),permanent={...g.factions[3].permanentRelations};
 for(const c of g.cells)if(c.owner===0||c.owner===1)Object.assign(c,{owner:-1,army:0,capital:-1});
 assert.deepEqual(g.unrestEnemies(3),[]);
 for(let i=0;i<4;i++){
  g.cells[12].army=200;const r=g.attack(12,13,3,1);assert.equal(r.secessionExempt,false);assert.equal(g.unrest(g.cells[12]),i+1);assert.equal(g.cells[12].unrestEvents[i].nonCombat,true);g.waitTurn();
 }
 assert.equal(g.cells[12].owner,4);assert.equal(g.factions[4].parent,3);assert.equal(g.factions[4].cause,'drain');assert.deepEqual(g.factions[3].permanentRelations,permanent);
});
test('protected enemies alive elsewhere cannot immunize a new country friendly transfer or empty-land expansion',()=>{
 for(const targetOwner of [3,-1]){const g=born();g.cells[13].owner=targetOwner;g.cells[12].army=200;assert.equal(g.attack(12,13,3,1).secessionExempt,false);assert.equal(g.unrest(g.cells[12]),1);}
});
test('noncombat withdrawal keeps threshold, once per round, stability grace and unrest expiry',()=>{
 const g=born();g.turn=0;g.cells[12].army=200;g.attack(12,13,3,1);assert.equal(g.unrest(g.cells[12]),0);
 g.turn=g.cells[12].stableUntil;
 for(const [army,ratio] of [[200,.5],[3,1]]){g.cells[12].army=army;g.attack(12,13,3,ratio);assert.equal(g.unrest(g.cells[12]),0);}
 g.cells[12].army=4;g.attack(12,13,3,.75);assert.equal(g.unrest(g.cells[12]),1);
 g.cells[12].army=200;g.attack(12,13,3,1);assert.equal(g.unrest(g.cells[12]),1);
 g.turn+=9;assert.equal(g.unrest(g.cells[12]),0);
});
test('actual protected attack stays exempt while an unrelated opponent attack and later logistics count',()=>{
 const g=born();g.cells[12].army=200;Object.assign(g.cells[22],{owner:0,army:1});assert.equal(g.attack(12,22,3,1).secessionExempt,true);assert.equal(g.unrest(g.cells[12]),0);
 g.turn++;Object.assign(g.cells[21],{owner:2,army:1});g.relations[3][2]=2;g.cells[22].army=200;assert.equal(g.attack(22,21,3,1).secessionExempt,false);assert.equal(g.unrest(g.cells[22]),1);assert.equal(g.unrest(g.cells[21]),1);
});
