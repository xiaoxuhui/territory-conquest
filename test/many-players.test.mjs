import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,FACTIONS,MAX_PLAYERS,playerLimit} from '../dist/engine.js';
test('all supported custom maps can start 64 distinct countries with equal armies and capitals',()=>{
  assert.equal(MAX_PLAYERS,64);
  for(const size of [10,30,100]){
    const g=new Game({w:size,h:size,humans:0,ai:64}),stats=g.stats();
    assert.equal(g.players,64);assert.equal(stats.length,64);assert.equal(new Set(g.spawns).size,64);
    assert.ok(stats.every(s=>s.land===1&&s.army===20&&!s.rebel));
    assert.equal(new Set(stats.map(s=>s.name)).size,64);assert.equal(new Set(stats.map(s=>s.color)).size,64);
    for(let id=0;id<64;id++){assert.equal(g.capitals(id).length,1);assert.equal(g.relations[id].length,64);assert.equal(g.attitude(id,id),0);}
  }
  assert.equal(FACTIONS.length,8);assert.equal(new Game().factions.length,2);
});
test('32 humans finish their actions before 32 computers act exactly once and joint growth happens',()=>{
  const g=new Game({w:10,h:10,humans:32,ai:32});g.running=true;const calls=[];g.aiMove=owner=>{calls.push(owner);return null;};
  for(let owner=0;owner<31;owner++){assert.equal(g.currentHuman,owner);g.waitTurn();assert.equal(calls.length,0);assert.equal(g.cells[g.spawns[0]].army,20);}
  assert.equal(g.currentHuman,31);g.waitTurn();assert.equal(new Set(calls).size,32);assert.ok(calls.every(owner=>owner>=32&&owner<64));
  assert.equal(g.turn,1);assert.equal(g.currentHuman,0);assert.ok(g.stats().every(s=>s.army===23));
});
test('64-computer step games settle one round and remain stopped without input',()=>{
  const g=new Game({w:10,h:10,humans:0,ai:64,observerMode:'step'});g.running=true;const calls=[];g.aiMove=owner=>{calls.push(owner);return null;};
  g.waitTurn();assert.equal(g.turn,1);assert.equal(new Set(calls).size,64);assert.equal(g.currentHuman,null);
  for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,1);assert.equal(calls.length,64);
});
test('64 humans and zero computers remain manual and use all their own factions',()=>{
  const g=new Game({w:10,h:10,humans:64,ai:0});g.running=true;
  assert.equal(g.automatic,false);assert.ok(g.stats().every(s=>s.human));
  for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,0);assert.equal(g.currentHuman,0);
});
test('map capacity and 64-player total are enforced for both human and computer settings',()=>{
  assert.equal(playerLimit(4,4),4);assert.equal(playerLimit(10,10),64);assert.equal(playerLimit(100,100),64);
  assert.throws(()=>new Game({w:4,h:4,humans:0,ai:5}));
  for(const [humans,ai] of [[65,0],[0,65],[32,33]])assert.throws(()=>new Game({w:100,h:100,humans,ai}));
  assert.equal(new Game({w:4,h:4,humans:4,ai:0}).players,4);
});
test('secession can still create a 65th country after a maximum-size start',()=>{
  const g=new Game({w:10,h:10,humans:0,ai:64});g.running=true;g.aiMove=()=>null;
  Object.assign(g.cells[22],{owner:0,homeland:0,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
  const births=g.resolveSecessions();assert.equal(births.length,1);assert.equal(g.players,65);assert.equal(g.factions[64].name,'新国1');assert.equal(g.factions[64].rebel,true);
  assert.equal(g.relations.length,65);assert.ok(g.relations.every(row=>row.length===65));g.waitTurn();assert.equal(g.turn,1);
});
test('64 computers can complete a real action round on a 100x100 map with legal armies and owners',()=>{
  const g=new Game({w:100,h:100,humans:0,ai:64,observerMode:'step'});g.running=true;
  g.waitTurn();assert.equal(g.turn,1);assert.ok(g.cells.every(c=>Number.isInteger(c.army)&&c.army>=0&&c.owner>=-1&&c.owner<g.players));
  assert.equal(g.stats().length,g.players);assert.ok(g.stats().every(s=>s.land>0));
});
