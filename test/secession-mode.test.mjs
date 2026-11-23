import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SECESSION_GRACE} from '../dist/engine.js';
function born(mode='repeat'){
 const g=new Game({humans:0,ai:3,secessionMode:mode});g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
 g.relations[1][0]=2;Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});g.resolveSecessions();g.turn=SECESSION_GRACE;
 Object.assign(g.cells[60],{owner:2,army:20});return g;
}
test('repeat is the default rule but a founding-participant war still cannot cause another split',()=>{
 const g=born();assert.equal(g.secessionMode,'repeat');g.cells[12].army=200;
 Object.assign(g.cells[22],{owner:0,army:1,unrestEvents:Array.from({length:3},()=>({turn:g.turn,kind:'capture',actor:0,victim:1}))});
 const action=g.attack(12,22,3,1);assert.equal(action.secessionExempt,true);assert.equal(g.unrest(g.cells[22]),3);assert.equal(g.resolveSecessions().length,0);
});
test('protected mode restores the previous capture and hostile-withdrawal exemptions for founding wars',()=>{
 const g=born('protected');g.cells[12].army=200;
 Object.assign(g.cells[22],{owner:0,army:1,unrestEvents:Array.from({length:3},()=>({turn:g.turn,kind:'capture',actor:0,victim:1}))});
 const action=g.attack(12,22,3,1);assert.equal(action.captured,true);assert.equal(action.secessionExempt,true);assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.unrest(g.cells[22]),3);assert.equal(g.resolveSecessions().length,0);
});
test('neither rule option exempts ordinary hostility to unrelated third countries',()=>{
 const g=born('protected');g.relations[3][2]=2;Object.assign(g.cells[22],{owner:2,army:1});g.cells[12].army=200;
 assert.equal(g.attack(12,22,3,1).secessionExempt,false);assert.equal(g.unrest(g.cells[22]),1);assert.equal(g.unrest(g.cells[12]),1);
 Object.assign(g.cells[10],{owner:1,army:1});g.cells[11].army=200;g.relations[0][1]=2;const action=g.attack(11,10,0,1);assert.equal(action.secessionExempt,false);assert.equal(g.unrest(g.cells[10]),1);assert.equal(g.unrest(g.cells[11]),1);
});
test('live rule switches preserve armies, ownership, unrest, turn and pause state',()=>{
 const g=born();g.cells[12].unrestEvents=[{turn:g.turn,kind:'capture',actor:0,victim:3}];g.paused=true;
 const before=JSON.stringify(g.cells),turn=g.turn;g.setSecessionMode('protected');assert.equal(g.secessionMode,'protected');assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,turn);assert.equal(g.paused,true);
 g.setSecessionMode('repeat');assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,turn);assert.equal(g.paused,true);
});
test('switching back to repeat never removes founding-war protection',()=>{
 const g=born('protected');g.setSecessionMode('repeat');Object.assign(g.cells[22],{owner:0,army:1});g.cells[12].army=200;
 assert.equal(g.attack(12,22,3,1).secessionExempt,true);assert.equal(g.unrest(g.cells[22]),0);assert.equal(g.unrest(g.cells[12]),0);
});
test('even protected mode cannot exempt friendly logistics by looking at unrelated foreign wars',()=>{
 const g=born('protected');Object.assign(g.cells[10],{owner:0,army:10});g.cells[11].army=200;g.relations[0][3]=2;
 g.attack(11,10,0,1);assert.equal(g.unrest(g.cells[11]),1);
 g.turn++;g.cells[11].army=200;g.relations[0][2]=2;g.attack(11,10,0,1);assert.equal(g.unrest(g.cells[11]),2);assert.deepEqual(g.cells[11].unrestEvents[1].enemies,[2,3]);
});
test('both rule choices retain the founding-tile stability period',()=>{
 for(const mode of ['repeat','protected']){const g=born(mode);g.turn=0;Object.assign(g.cells[13],{owner:3,army:10});g.cells[12].army=200;g.attack(12,13,3,1);assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.cells[12].stableUntil,SECESSION_GRACE);}
});
test('invalid modes are rejected without changing existing game state',()=>{
 assert.throws(()=>new Game({secessionMode:'invalid'}),/再次分裂/);const g=born(),before=JSON.stringify(g);assert.throws(()=>g.setSecessionMode('invalid'),/再次分裂/);assert.equal(JSON.stringify(g),before);assert.equal(new Game().secessionMode,'repeat');
});
