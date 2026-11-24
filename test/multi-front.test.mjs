import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';

function board({humans=1,ai=1,multiFront=true,...options}={}){
  const g=new Game({w:8,h:6,humans,ai,multiFront,observerMode:'step',...options});
  g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1,terrain:'land'}));
  for(const [id,owner] of [[9,0],[33,0],[46,1]])Object.assign(g.cells[id],{owner,army:20,capital:id===33?-1:owner});
  g.running=true;g.rng=()=>.99;g.resolveDiplomacy=()=>[];g.resolveSecessions=()=>[];
  g.relations.forEach((row,a)=>row.forEach((_,b)=>row[b]=a===b?0:2));
  return g;
}

test('multi-front is optional and rejects invalid options',()=>{
  assert.equal(new Game().multiFront,false);
  assert.throws(()=>new Game({multiFront:'on'}));
  const g=board({multiFront:false});g.aiMove=()=>null;
  assert.equal(g.playTurn(9,10).ok,true);assert.equal(g.turn,1);assert.equal(g.roundState,null);
});

test('a human attacks from two old tiles in one round without intermediate growth',()=>{
  const g=board();g.aiMove=()=>null;
  assert.equal(g.playTurn(9,10,.5,{defer:true}).ok,true);
  assert.equal(g.currentHuman,0);assert.equal(g.turn,1);assert.equal(g.resolving,false);assert.equal(g.cells[33].army,20);
  assert.equal(g.playTurn(33,34,.5,{defer:true}).ok,true);assert.equal(g.resolving,true);
  let growth=0;while(g.resolving){if(g.stepTurn()?.kind==='growth')growth++;}
  assert.equal(growth,1);assert.equal(g.turn,1);assert.equal(g.currentHuman,0);
  assert.equal(g.cells[9].army,13);assert.equal(g.cells[33].army,11);
});

test('newly captured tiles and already used sources are locked with no troop changes',()=>{
  const g=board();g.playTurn(9,10,.5,{defer:true});const before=JSON.stringify(g.cells);
  assert.match(g.playTurn(10,11).reason,/下一轮/);assert.match(g.playTurn(9,17).reason,/已经出兵/);
  assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,1);
  g.aiMove=()=>null;g.waitTurn();assert.equal(g.canUseSource(10,0),true);
  assert.equal(g.playTurn(10,11,.5,{defer:true}).ok,true);
});

test('internal reinforcement costs the country step and ends its remaining actions',()=>{
  const g=board();Object.assign(g.cells[10],{owner:0,army:1});Object.assign(g.cells[17],{owner:0,army:20});
  assert.equal(g.playTurn(9,10,1,{defer:true}).kind,'reinforce');
  assert.equal(g.cells[10].army,20);assert.equal(g.cells[9].army,1);
  assert.equal(g.resolving,true);assert.equal(g.currentHuman,null);
  assert.equal(g.playTurn(10,11,.5,{defer:true}).ok,false);
  assert.equal(g.playTurn(33,34,.5,{defer:true}).ok,false);
});

test('external combat is free even when capture fails, but the source cannot act twice',()=>{
  const g=board();Object.assign(g.cells[10],{owner:1,army:100});
  const attack=g.playTurn(9,10,.5,{defer:true});assert.equal(attack.ok,true);assert.equal(attack.captured,false);
  assert.equal(g.resolving,false);assert.equal(g.currentHuman,0);assert.equal(g.freeFrontAction(attack),true);
  assert.equal(g.playTurn(9,17).ok,false);assert.equal(g.playTurn(33,34,.5,{defer:true}).ok,true);
});

test('an external attack can be followed by one paid internal transfer before passing to the next human',()=>{
  const g=board({humans:2,ai:0});Object.assign(g.cells[34],{owner:0,army:3});
  assert.equal(g.playTurn(9,10,.5,{defer:true}).ok,true);assert.equal(g.currentHuman,0);
  const transfer=g.playTurn(33,34,.5,{defer:true});assert.equal(transfer.kind,'reinforce');assert.equal(g.freeFrontAction(transfer),false);
  assert.equal(g.currentHuman,1);assert.equal(g.resolving,false);assert.equal(g.cells[34].army,13);assert.equal(g.cells[9].army,10);
});

test('computer internal transfers spend its step even with other sources ready',()=>{
  const g=board({humans:0,ai:2});Object.assign(g.cells[10],{owner:0,army:2});
  const move=g.aiMove.bind(g);g.aiMove=owner=>owner===0?g.attack(9,10,0,.5):move(owner);
  const actions=g.waitTurn().actions.filter(a=>a.owner===0);
  assert.equal(actions.length,1);assert.equal(actions[0].kind,'reinforce');assert.equal(g.cells[33].army,21);assert.equal(g.turn,1);
});

test('a recaptured round-start tile cannot attack during the same round',()=>{
  const g=board();Object.assign(g.cells[10],{owner:1,army:100});Object.assign(g.cells[17],{owner:0,army:300});
  g.beginRound();assert.equal(g.attack(10,9,1,1).captured,true);
  assert.equal(g.attack(17,9,0,1).captured,true);
  assert.equal(g.roundState.startOwners[9],0);assert.match(g.attack(9,1,0,1).reason,/收复/);
});

test('computers use multiple old sources without chaining through newly captured land',()=>{
  const g=board({humans:0,ai:2});const start=g.cells.map(c=>c.owner);
  const result=g.waitTurn();const a=result.actions.filter(a=>a.owner===0);
  assert.equal(a.length,2);assert.deepEqual(new Set(a.map(a=>a.fromId)),new Set([9,33]));
  for(const action of result.actions)assert.equal(start[action.fromId],action.owner);
  assert.equal(g.stats()[0].land,4);assert.equal(g.turn,1);assert.equal(g.roundState,null);
});

test('local humans finish their separate actions before computers and one growth phase',()=>{
  const g=board({humans:2,ai:0});g.playTurn(9,10,.5,{defer:true});assert.equal(g.currentHuman,0);
  g.waitTurn({defer:true});assert.equal(g.currentHuman,1);assert.equal(g.turn,1);
  assert.equal(g.playTurn(46,45,.5,{defer:true}).ok,true);assert.equal(g.resolving,true);
  assert.equal(g.stepTurn().kind,'growth');assert.equal(g.resolving,false);assert.equal(g.currentHuman,0);assert.equal(g.turn,1);
});

test('sea failure consumes neither the source nor the multi-front round',()=>{
  const g=board();g.cells[10].terrain='sea';let draws=0;g.rng=()=>{draws++;return .99;};
  assert.equal(g.playTurn(9,10).seaFailed,true);assert.equal(g.turn,0);assert.equal(g.roundState,null);
  assert.equal(g.playTurn(9,1,.5,{defer:true}).ok,true);assert.equal(g.turn,1);
  g.cells[34].terrain='sea';assert.equal(g.playTurn(33,34).seaFailed,true);assert.equal(draws,1);
  assert.equal(g.canUseSource(33,0),true);assert.equal(g.playTurn(33,25,.5,{defer:true}).ok,true);
});

test('live changes wait for the next full round and cannot bypass a new tile lock',()=>{
  const g=board();g.aiMove=()=>null;g.playTurn(9,10,.5,{defer:true});const before=JSON.stringify(g.cells);
  g.setMultiFront(false);assert.equal(g.multiFront,true);assert.equal(g.pendingMultiFront,false);
  assert.equal(JSON.stringify(g.cells),before);assert.equal(g.playTurn(10,11).ok,false);
  g.waitTurn();assert.equal(g.multiFront,false);assert.equal(g.pendingMultiFront,null);
  g.playTurn(9,1,.5,{defer:true});g.setMultiFront(true);assert.equal(g.multiFront,false);
  while(g.resolving)g.stepTurn();assert.equal(g.multiFront,true);assert.equal(g.turn,2);
  g.setMultiFront(false);assert.equal(g.multiFront,false);assert.equal(g.turn,2);
});

test('capital construction ends the country action rather than allowing repeated administration',()=>{
  const g=board();g.aiMove=()=>null;g.playTurn(9,10,.5,{defer:true});
  assert.equal(g.buildCapital(33,{defer:true}).ok,true);assert.equal(g.resolving,true);
  while(g.resolving)g.stepTurn();assert.equal(g.capitals(0).length,2);assert.equal(g.turn,1);
});

test('peaceful paid support shares source locks and AI marches wait on newly captured heads',()=>{
  const g=board({humans:0,ai:2});g.relations[0][1]=0;Object.assign(g.cells[10],{owner:1,army:10});
  assert.equal(g.supportNeighbor(9,10,0,2).ok,true);assert.match(g.supportNeighbor(9,10,0,2).reason,/已经出兵/);
  g.aiMarches[0]={target:1,kind:'support',head:33};assert.equal(g.advanceMarch(0).ok,true);
  const head=g.aiMarches[0].head;assert.equal(g.cells[head].owner,0);assert.equal(g.advanceMarch(0),null);assert.equal(g.aiMarches[0].head,head);
});
