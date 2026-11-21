import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,ATTITUDES,NEUTRAL_ATTACK_CHANCE} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;return g;}
function flip(g){const owner=1-g.cells[12].owner,source=owner===0?11:13;g.relations[owner][1-owner]=2;Object.assign(g.cells[source],{owner,army:100});g.cells[12].army=1;assert.equal(g.attack(source,12,owner,1).captured,true);}
test('attacked country alone changes from peace to neutral to hostile, including unsuccessful attacks',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1000});
  g.relations[0][1]=0;g.relations[1][0]=0;
  assert.equal(ATTITUDES[g.attitude(0,1)],'和平');assert.equal(g.attitude(1,0),0);
  assert.equal(g.declareWar(1).ok,true);assert.equal(g.attitude(1,0),0);
  assert.equal(g.attack(11,12,0,.5).captured,false);assert.equal(g.attitude(1,0),1);assert.equal(g.attitude(0,1),2);
  g.attack(11,12,0,.5);assert.equal(g.attitude(1,0),2);assert.equal(g.attitude(0,1),2);
  g.attack(11,12,0,.5);assert.equal(g.attitude(1,0),2);assert.equal(g.attitude(0,1),2);
  const events=g.events.filter(e=>e.kind==='diplomacy'&&e.text.includes('遭到进攻'));assert.equal(events.length,2);assert.match(events[0].text,/中立 → 敌对/);
});
test('counterattacks update their own direction and leave the other direction intact',()=>{
  const g=running();g.relations[1][0]=0;Object.assign(g.cells[12],{owner:1,army:1000});g.declareWar(1);g.attack(11,12,0,.5);
  assert.equal(g.canAttack(1,0),true);assert.equal(g.attack(12,11,1,.01).ok,true);assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),1);
});
test('neutral expansion, friendly transfers, invalid moves, insufficient armies and pause do not change attitudes',()=>{
  const g=running(),before=JSON.stringify(g.relations);g.attack(11,12,0,.5);g.attack(12,11,0,1);
  assert.equal(JSON.stringify(g.relations),before);assert.equal(g.attack(11,20,0,1).ok,false);
  Object.assign(g.cells[12],{owner:1,army:100});g.cells[11].army=1;assert.equal(g.attack(11,12,0,1).ok,false);
  g.cells[11].army=20;g.paused=true;assert.equal(g.attack(11,12,0,.5).ok,false);assert.equal(JSON.stringify(g.relations),before);
});
test('withdrawal secession is hostile to its parent while the parent can remain peaceful',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:10});for(let i=0;i<4;i++)g.playTurn(11,12,1);
  assert.equal(g.factions[2].cause,'drain');assert.equal(g.factions[2].origin,0);assert.equal(g.attitude(2,0),2);assert.equal(g.attitude(0,2),1);
  for(let i=0;i<12;i++)g.waitTurn();assert.equal(g.attitude(2,0),2);assert.equal(g.attitude(0,2),1);
});
test('war secession remembers the original homeland even under hostile occupation and excludes reconquest from enemies',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:1});for(let i=0;i<5;i++)flip(g);
  assert.equal(g.cells[12].owner,1);assert.equal(g.cells[12].homeland,0);
  const result=g.resolveSecessions()[0];assert.equal(result.oldOwner,1);assert.equal(result.homeland,0);assert.equal(result.cause,'war');
  assert.equal(g.attitude(2,0),0);assert.equal(g.attitude(2,1),2);assert.equal(g.attitude(0,2),1);assert.equal(g.attitude(1,2),1);
  assert.match(g.events.find(e=>e.kind==='diplomacy'&&e.owner===2).text,/原属国青岚保持和平，敌视进攻者赤焰/);
});
test('new countries expand the full directed matrix without erasing existing relations or affecting another game',()=>{
  const g=running({ai:7});g.relations[1][0]=0;g.declareWar(1);Object.assign(g.cells[12],{owner:1,army:100});g.attack(11,12,0,.5);
  g.cells[40].owner=0;g.cells[40].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'drain',actor:0}));g.resolveSecessions();
  assert.equal(g.players,9);assert.equal(g.relations.length,9);assert.ok(g.relations.every(row=>row.length===9));assert.equal(g.attitude(1,0),1);
  assert.equal(g.attitude(8,0),2);assert.equal(g.attitude(0,8),1);assert.equal(g.attitude(8,8),0);
  const fresh=new Game();assert.equal(fresh.attitude(1,0),1);assert.equal(fresh.relations.length,2);
});
test('computer target scoring prefers an otherwise equal hostile country over a peaceful country',()=>{
  const g=new Game({w:6,h:4,humans:0,ai:3});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:0,army:1,capital:-1}));Object.assign(g.cells[7],{army:100});
  Object.assign(g.cells[6],{owner:1,army:2});Object.assign(g.cells[8],{owner:2,army:2});g.relations[0][2]=2;
  const action=g.aiMove(0);assert.equal(action.toId,8);assert.equal(action.oldOwner,2);assert.equal(action.captured,true);
});
test('peaceful attacks are rejected for humans and computers without spending troops or a turn',()=>{
  const g=new Game({w:4,h:4,humans:0,ai:2});g.running=true;
  g.relations[0][1]=0;g.relations[1][0]=0;
  g.cells.forEach(c=>Object.assign(c,{owner:1,army:1,capital:-1}));Object.assign(g.cells[5],{owner:0,army:100});
  const before=JSON.stringify(g.cells);assert.equal(g.attack(5,6,0,1).ok,false);assert.equal(g.aiMove(0),null);
  assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,0);assert.equal(g.attitude(1,0),0);
  const human=running();human.relations[0][1]=0;Object.assign(human.cells[12],{owner:1,army:1});assert.equal(human.playTurn(11,12).ok,false);assert.equal(human.turn,0);assert.equal(human.cells[11].army,20);
});
test('neutral computers without initiative wait but a peaceful victim may retaliate after the first hit',()=>{
  const g=running({humans:0,ai:2});Object.assign(g.cells[11],{owner:0,army:20});Object.assign(g.cells[12],{owner:1,army:1000});g.relations[0][1]=1;
  assert.equal(g.attack(11,12,0,.5).ok,false);assert.equal(g.canAttack(0,1),false);
  g.relations[0][1]=0;g.relations[1][0]=2;assert.equal(g.attack(12,11,1,.001).ok,true);
  assert.equal(g.attitude(0,1),1);assert.equal(g.attackedBy[0][1],true);assert.equal(g.canAttack(0,1),true);
  assert.equal(g.attack(11,12,0,.5).ok,true);assert.equal(g.attitude(0,1),1);
});
test('war declaration consumes one action, changes only the declaring player and rejects repeats or inactive control',()=>{
  const g=running({humans:2,ai:0});assert.equal(g.declareWar(1).ok,true);assert.equal(g.turn,1);assert.equal(g.currentHuman,1);
  assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),1);assert.equal(g.attackedBy[1][0],false);
  assert.equal(g.declareWar(1).ok,false);g.waitTurn();assert.equal(g.declareWar(1).ok,false);assert.equal(g.turn,1);
  for(const target of [-1,0,99])assert.equal(g.declareWar(target).ok,false);
  const paused=running();paused.paused=true;assert.equal(paused.declareWar(1).ok,false);assert.equal(paused.attitude(0,1),1);assert.equal(paused.turn,0);
});
test('hostile computer attacks its enemy before expanding into neighboring empty land',()=>{
  const g=new Game({w:6,h:4,humans:0,ai:3});g.running=true;g.cells.forEach(c=>Object.assign(c,{owner:0,army:1,capital:-1}));
  Object.assign(g.cells[7],{army:100});Object.assign(g.cells[6],{owner:1,army:1});Object.assign(g.cells[8],{owner:2,army:1});Object.assign(g.cells[1],{owner:-1,army:0});
  g.relations[0][2]=2;g.aiPlans[0]={rally:7,target:1,age:0};
  const result=g.aiMove(0);assert.equal(result.toId,8);assert.equal(result.captured,true);assert.equal(g.cells[1].owner,-1);assert.equal(g.cells[6].owner,1);
});
test('all-peace computer games expand and then coexist without starting unauthorized wars',()=>{
  const g=new Game({w:6,h:4,humans:0,ai:2,observerMode:'step'});g.running=true;
  g.relations[0][1]=0;g.relations[1][0]=0;
  for(let i=0;i<120;i++)g.waitTurn();assert.equal(g.winner,null);assert.equal(g.secessions,0);assert.ok(g.stats().slice(0,2).every(s=>s.land>1));
  assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),0);assert.equal(g.events.some(e=>e.kind==='battle'),false);
});
test('all starting countries are neutral in each direction and players can decide neutral attacks manually',()=>{
  const g=new Game({ai:7});for(let a=0;a<8;a++)for(let b=0;b<8;b++)assert.equal(g.attitude(a,b),a===b?0:1);
  const human=running();Object.assign(human.cells[12],{owner:1,army:100});assert.equal(human.playTurn(11,12).ok,true);assert.equal(human.attitude(1,0),2);assert.equal(human.attitude(0,1),1);
});
test('neutral computer initiative has an exact ten-percent boundary and cannot reroll within one round',()=>{
  assert.equal(NEUTRAL_ATTACK_CHANCE,.1);
  for(const [value,expected] of [[0,true],[.099999,true],[.1,false],[.999,false]]){
    const g=new Game({humans:0,ai:2});g.turn=1;let draws=0;g.rng=()=>{draws++;return value;};
    g.prepareNeutralInitiative(0);assert.equal(g.canAttack(0,1),expected);assert.equal(draws,1);
    for(let i=0;i<20;i++){g.prepareNeutralInitiative(0);g.canAttack(0,1);}assert.equal(draws,1);
    g.turn++;assert.equal(g.canAttack(0,1),false);g.prepareNeutralInitiative(0);assert.equal(draws,2);assert.equal(g.canAttack(0,1),expected);
    g.relations[0][1]=0;assert.equal(g.canAttack(0,1),false);
  }
});
test('neutral initiative controls actual AI attacks while retaliation and hostility need no chance roll',()=>{
  for(const [value,expected] of [[.05,true],[.5,false]]){
    const g=new Game({w:4,h:4,humans:0,ai:2});g.running=true;g.rng=()=>value;
    g.cells.forEach(c=>Object.assign(c,{owner:1,army:1,capital:-1}));Object.assign(g.cells[5],{owner:0,army:100});
    const result=g.aiMove(0);assert.equal(!!result?.captured,expected);
  }
  const g=new Game({humans:0,ai:2});g.relations[0][1]=1;g.attackedBy[0][1]=true;assert.equal(g.canAttack(0,1),true);
  g.attackedBy[0][1]=false;g.relations[0][1]=2;assert.equal(g.canAttack(0,1),true);
});
