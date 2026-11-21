import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,FACTIONS,UNREST_LIMIT,UNREST_WINDOW,SECESSION_GRACE} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.relations.forEach((row,id)=>row.forEach((_,other)=>{row[other]=id===other?0:2;}));g.running=true;g.aiMove=()=>null;return g;}
function flip(g){
  const target=g.cells[12],owner=1-target.owner,source=g.cells[owner===0?11:13];
  Object.assign(source,{owner,army:100});target.army=1;
  assert.equal(g.attack(source.id,12,owner,1).captured,true);
}
test('four recent hostile takeovers form a country at round end with no extra army or same-round action',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:1});const calls=[];g.aiMove=id=>{calls.push(id);return null;};
  for(let i=0;i<UNREST_LIMIT-1;i++){flip(g);g.waitTurn();assert.equal(g.players,2);}
  flip(g);assert.equal(g.unrest(g.cells[12]),4);assert.equal(g.players,2);const army=g.cells[12].army;
  calls.length=0;g.waitTurn();assert.deepEqual(calls,[1]);assert.equal(g.players,3);assert.equal(g.ai,2);assert.equal(g.cells[12].owner,2);
  assert.equal(g.cells[12].army,army+1);assert.equal(g.isCapital(g.cells[12]),true);assert.equal(g.stats()[2].rebel,true);assert.equal(g.unrest(g.cells[12]),0);
  assert.equal(g.aiPlans[2],null);assert.equal(g.aiAnchors[2],12);assert.match(g.events.find(e=>e.kind==='secession').text,/成立新国1/);
  calls.length=0;g.waitTurn();assert.deepEqual([...calls].sort(),[1,2]);
});
test('repeated large friendly troop withdrawals cause secession but half transfers and attacks do not',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:10});
  for(let i=0;i<4;i++)assert.equal(g.playTurn(11,12,1).ok,true);
  assert.equal(g.secessions,1);assert.equal(g.cells[11].owner,2);assert.equal(g.cells[11].army,4);assert.equal(g.capitalLost[0],true);assert.equal(g.cells[12].owner,0);
  const safe=running();Object.assign(safe.cells[12],{owner:0,army:10});
  for(let i=0;i<8;i++){safe.cells[11].army=100;safe.playTurn(11,12,.5);}
  assert.equal(safe.unrest(safe.cells[11]),0);assert.equal(safe.secessions,0);
  safe.cells[10].owner=1;safe.cells[10].army=1000;safe.cells[11].army=20;safe.attack(11,10,0,1);
  assert.equal(safe.unrest(safe.cells[11]),0);assert.equal(safe.unrest(safe.cells[10]),0);
});
test('unrest expires after quiet rounds and does not advance from real-time thinking or pause',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:1});
  for(let i=0;i<3;i++){flip(g);g.waitTurn();}assert.equal(g.unrest(g.cells[12]),3);
  for(let i=0;i<40;i++)g.update(.25);assert.equal(g.unrest(g.cells[12]),3);assert.equal(g.secessions,0);
  g.paused=true;for(let i=0;i<10;i++)g.waitTurn();assert.equal(g.unrest(g.cells[12]),3);g.paused=false;
  for(let i=0;i<UNREST_WINDOW;i++)g.waitTurn();assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.secessions,0);
});
test('one small country contains only connected restless land and preserves its total troops',()=>{
  const g=running();
  for(const [id,count] of [[22,4],[21,2],[23,2],[32,2],[20,0]])Object.assign(g.cells[id],{owner:0,army:10,unrestEvents:Array.from({length:count},()=>({turn:0,kind:'capture'}))});
  Object.assign(g.cells[12],{owner:1,army:12,unrestEvents:[{turn:0,kind:'capture'},{turn:0,kind:'capture'}]});
  const total=g.stats().reduce((sum,s)=>sum+s.army,0),result=g.resolveSecessions();assert.equal(result.length,1);assert.equal(result[0].cells.length,3);
  assert.equal(g.cells[12].owner,1);assert.equal(g.cells[20].owner,0);assert.equal(g.cells[32].owner,0);assert.equal(g.stats().reduce((sum,s)=>sum+s.army,0),total);
  assert.equal(g.capitals(2).length,1);for(const id of result[0].cells)assert.equal(g.cells[id].stableUntil,SECESSION_GRACE);
});
test('new countries have a stability grace period and can later split under the same rules',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture'}))});g.resolveSecessions();
  for(let i=0;i<4;i++)g.recordUnrest(g.cells[12],'capture');assert.equal(g.unrest(g.cells[12]),0);assert.equal(g.resolveSecessions().length,0);
  g.turn=SECESSION_GRACE;for(let i=0;i<4;i++)g.recordUnrest(g.cells[12],'capture');assert.equal(g.resolveSecessions().length,1);assert.equal(g.cells[12].owner,3);
});
test('splitting a capital preserves the other capital and supports new countries beyond the eight initial slots',()=>{
  const g=running({ai:7});Object.assign(g.cells[12],{owner:0,army:10});g.constructCapital(12,0);
  g.cells[11].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'capture'}));g.resolveSecessions();
  assert.equal(g.players,9);assert.equal(g.ai,8);assert.equal(g.cells[11].owner,8);assert.equal(g.capitalLost[0],false);assert.equal(g.isCapital(g.cells[12]),true);
  assert.equal(g.factions[8].name,'新国1');assert.match(g.factions[8].color,/^#[a-f\d]{6}$/);assert.equal(g.stats()[8].land,1);
  assert.equal(FACTIONS.length,8);const fresh=new Game();assert.equal(fresh.factions.length,2);assert.equal(fresh.secessions,0);
});
test('secession skips a human who loses their last territory and registers the new computer for observation',()=>{
  const g=running();g.cells[11].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'capture'}));g.waitTurn();
  assert.equal(g.currentHuman,null);assert.equal(g.automatic,true);assert.equal(g.cells[11].owner,2);assert.equal(g.winner,null);
});
test('neutral capture, failed attacks and invalid actions create no unrest or new countries',()=>{
  const g=running();g.attack(11,12,0,.5);assert.equal(g.unrest(g.cells[12]),0);
  const state=JSON.stringify(g.cells);assert.equal(g.attack(11,20,0,1).ok,false);assert.equal(JSON.stringify(g.cells),state);
  g.paused=true;assert.deepEqual(g.resolveSecessions(),[]);assert.equal(g.secessions,0);
});
