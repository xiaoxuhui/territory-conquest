import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,ATTITUDES} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;return g;}
function flip(g){const owner=1-g.cells[12].owner,source=owner===0?11:13;Object.assign(g.cells[source],{owner,army:100});g.cells[12].army=1;assert.equal(g.attack(source,12,owner,1).captured,true);}
test('attacked country alone changes from peace to neutral to hostile, including unsuccessful attacks',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1000});
  assert.equal(ATTITUDES[g.attitude(0,1)],'和平');assert.equal(g.attitude(1,0),0);
  assert.equal(g.attack(11,12,0,.5).captured,false);assert.equal(g.attitude(1,0),1);assert.equal(g.attitude(0,1),0);
  g.attack(11,12,0,.5);assert.equal(g.attitude(1,0),2);assert.equal(g.attitude(0,1),0);
  g.attack(11,12,0,.5);assert.equal(g.attitude(1,0),2);assert.equal(g.attitude(0,1),0);
  const events=g.events.filter(e=>e.kind==='diplomacy');assert.equal(events.length,2);assert.match(events[0].text,/中立 → 敌对/);
});
test('counterattacks update their own direction and leave the other direction intact',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1000});g.attack(11,12,0,.5);
  g.attack(12,11,1,.01);assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);
});
test('neutral expansion, friendly transfers, invalid moves, insufficient armies and pause do not change attitudes',()=>{
  const g=running(),before=JSON.stringify(g.relations);g.attack(11,12,0,.5);g.attack(12,11,0,1);
  assert.equal(JSON.stringify(g.relations),before);assert.equal(g.attack(11,20,0,1).ok,false);
  Object.assign(g.cells[12],{owner:1,army:100});g.cells[11].army=1;assert.equal(g.attack(11,12,0,1).ok,false);
  g.cells[11].army=20;g.paused=true;assert.equal(g.attack(11,12,0,.5).ok,false);assert.equal(JSON.stringify(g.relations),before);
});
test('withdrawal secession is hostile to its parent while the parent can remain peaceful',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:10});for(let i=0;i<4;i++)g.playTurn(11,12,1);
  assert.equal(g.factions[2].cause,'drain');assert.equal(g.factions[2].origin,0);assert.equal(g.attitude(2,0),2);assert.equal(g.attitude(0,2),0);
  for(let i=0;i<12;i++)g.waitTurn();assert.equal(g.attitude(2,0),2);assert.equal(g.attitude(0,2),0);
});
test('war secession remembers the original homeland even under hostile occupation and excludes reconquest from enemies',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:1});for(let i=0;i<5;i++)flip(g);
  assert.equal(g.cells[12].owner,1);assert.equal(g.cells[12].homeland,0);
  const result=g.resolveSecessions()[0];assert.equal(result.oldOwner,1);assert.equal(result.homeland,0);assert.equal(result.cause,'war');
  assert.equal(g.attitude(2,0),0);assert.equal(g.attitude(2,1),2);assert.equal(g.attitude(0,2),0);assert.equal(g.attitude(1,2),0);
  assert.match(g.events.find(e=>e.kind==='diplomacy'&&e.owner===2).text,/原属国青岚保持和平，敌视进攻者赤焰/);
});
test('new countries expand the full directed matrix without erasing existing relations or affecting another game',()=>{
  const g=running({ai:7});Object.assign(g.cells[12],{owner:1,army:100});g.attack(11,12,0,.5);
  g.cells[40].owner=0;g.cells[40].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'drain',actor:0}));g.resolveSecessions();
  assert.equal(g.players,9);assert.equal(g.relations.length,9);assert.ok(g.relations.every(row=>row.length===9));assert.equal(g.attitude(1,0),1);
  assert.equal(g.attitude(8,0),2);assert.equal(g.attitude(0,8),0);assert.equal(g.attitude(8,8),0);
  const fresh=new Game();assert.equal(fresh.attitude(1,0),0);assert.equal(fresh.relations.length,2);
});
test('computer target scoring prefers an otherwise equal hostile country over a peaceful country',()=>{
  const g=new Game({w:6,h:4,humans:0,ai:3});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:0,army:1,capital:-1}));Object.assign(g.cells[7],{army:100});
  Object.assign(g.cells[6],{owner:1,army:2});Object.assign(g.cells[8],{owner:2,army:2});g.relations[0][2]=2;
  const action=g.aiMove(0);assert.equal(action.toId,8);assert.equal(action.oldOwner,2);assert.equal(action.captured,true);
});
