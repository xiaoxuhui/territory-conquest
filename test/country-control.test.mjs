import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function game(options={}){const g=new Game({humans:0,ai:4,observerMode:'step',...options});g.running=true;g.resolveDiplomacy=()=>[];return g;}
test('taking a non-prefix country preserves the world and waits for manual input',()=>{
 const g=game({observerMode:'continuous'}),cells=JSON.stringify(g.cells),relations=JSON.stringify(g.relations),turn=g.turn;g.paused=true;
 assert.equal(g.setHumanControl(3).ok,true);assert.equal(g.isHuman(3),true);assert.equal(g.isHuman(0),false);assert.equal(g.currentHuman,3);assert.equal(g.humans,1);assert.equal(g.ai,3);assert.equal(g.paused,true);assert.equal(g.turn,turn);assert.equal(JSON.stringify(g.cells),cells);assert.equal(JSON.stringify(g.relations),relations);
 g.paused=false;for(let i=0;i<100;i++)g.update(.25);assert.equal(g.turn,turn);assert.equal(JSON.stringify(g.cells),cells);
});
test('a manually controlled country acts once and every other computer acts once, with stable country ids',()=>{
 const g=game(),calls=[];g.setHumanControl(2);g.aiMove=owner=>{calls.push(owner);return null;};const source=g.spawns[2],target=g.neighbors(source).find(id=>g.cells[id].owner<0);
 assert.equal(g.playTurn(source,target).ok,true);assert.equal(g.cells[target].owner,2);assert.deepEqual(calls.sort(),[0,1,3]);assert.equal(g.currentHuman,2);assert.equal(g.turn,1);
});
test('taking a new country keeps existing human players and completes their round before computers',()=>{
 const g=game({humans:1,ai:3}),calls=[];g.aiMove=owner=>{calls.push(owner);return null;};g.setHumanControl(3);assert.equal(g.currentHuman,3);
 g.waitTurn();assert.equal(g.currentHuman,0);assert.equal(g.turn,1);assert.deepEqual(calls,[]);g.waitTurn();assert.deepEqual(calls.sort(),[1,2]);assert.equal(g.turn,1);assert.equal(g.currentHuman,0);assert.equal(g.humans,2);
});
test('mid-round takeover is queued so the country cannot act as both computer and player in that round',()=>{
 const g=game({ai:3}),calls=[];g.aiMove=owner=>{calls.push(owner);return null;};g.waitTurn({defer:true});g.stepTurn();const result=g.setHumanControl(1);assert.equal(result.queued,true);assert.equal(g.isHuman(1),false);
 while(g.resolving)g.stepTurn();assert.deepEqual(calls,[0,1,2]);assert.equal(g.isHuman(1),true);assert.equal(g.currentHuman,1);assert.equal(g.turn,1);assert.equal(g.pendingHumanControl,null);
 calls.length=0;g.waitTurn();assert.deepEqual(calls.sort(),[0,2]);assert.equal(g.turn,2);
});
test('release does not add a second action mid-round and restores automatic play when no humans remain',()=>{
 const g=game({humans:1,ai:2,observerMode:'continuous'}),calls=[];g.aiMove=owner=>{calls.push(owner);return null;};g.waitTurn({defer:true});assert.equal(g.setHumanControl(0,false).queued,true);while(g.resolving)g.stepTurn();assert.deepEqual(calls,[1,2]);assert.equal(g.humans,0);assert.equal(g.ai,3);assert.equal(g.automatic,true);assert.equal(g.currentHuman,null);
 calls.length=0;g.waitTurn();assert.deepEqual(calls.sort(),[0,1,2]);
});
test('a native secession country can be controlled without changing ancestry or permanent diplomacy',()=>{
 const g=game({ai:3});g.aiMove=()=>null;Object.assign(g.cells[12],{owner:0,homeland:1,army:20,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});g.resolveSecessions();const before=JSON.stringify(g.factions[3]),cells=JSON.stringify(g.cells);
 assert.equal(g.setHumanControl(3).ok,true);assert.equal(g.currentHuman,3);assert.equal(g.factions[3].rebel,true);assert.equal(JSON.stringify(g.factions[3]),before);assert.equal(JSON.stringify(g.cells),cells);assert.equal(g.ai,3);assert.equal(g.humans,1);assert.equal(g.setHumanControl(3,false).ok,true);assert.equal(g.isHuman(3),false);
});
test('new countries created at round end join the next computer roster, not the round just finished',()=>{
 const g=game({ai:2}),calls=[];g.setHumanControl(1);g.aiMove=owner=>{calls.push(owner);return null;};Object.assign(g.cells[12],{owner:0,homeland:0,army:20,unrestEvents:Array.from({length:4},()=>({turn:1,kind:'capture',actor:1,victim:0}))});g.waitTurn();assert.deepEqual(calls,[0]);assert.equal(g.players,3);calls.length=0;g.waitTurn();assert.deepEqual(calls.sort(),[0,2]);
});
test('invalid, eliminated and ended targets cannot mutate control state',()=>{
 const g=game();for(const id of [-1,4,1.5])assert.equal(g.setHumanControl(id).ok,false);assert.equal(g.humans,0);assert.equal(g.setHumanControl(1,'yes').ok,false);g.cells.forEach(c=>{if(c.owner===1)c.owner=-1;});assert.equal(g.setHumanControl(1).ok,false);g.winner=0;assert.equal(g.setHumanControl(0).ok,false);assert.equal(g.controlRevision,0);
});
test('queued takeover cancels if the target dies or the match ends before the round finishes',()=>{
 const g=game();g.aiMove=()=>null;g.waitTurn({defer:true});g.setHumanControl(3);g.cells.forEach(c=>{if(c.owner===3)c.owner=-1;});while(g.resolving)g.stepTurn();assert.equal(g.pendingHumanControl,null);assert.equal(g.humans,0);assert.equal(g.controlRevision,0);assert.match(g.events[0].text,/目标国家已出局/);
 const ended=game();ended.waitTurn({defer:true});ended.setHumanControl(3);ended.cells.forEach(c=>c.owner=0);ended.checkWinner();assert.equal(ended.winner,0);assert.equal(ended.pendingHumanControl,null);assert.equal(ended.humans,0);
});
