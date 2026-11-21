import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;return g;}
test('unseen countries stay neutral for a hundred rounds even with every probability forced to succeed',()=>{
  const g=running();let draws=0;g.rng=()=>{draws++;return 0;};
  for(let i=0;i<100;i++)g.waitTurn();assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);assert.equal(draws,0);
  assert.equal(g.events.some(e=>e.kind==='diplomacy-improve'),false);
});
test('stale unknown attitudes, retaliation memories and marching targets are reset without a random trial',()=>{
  const g=running();g.turn=1;g.relations[0][1]=2;g.relations[1][0]=0;g.attackedBy[0][1]=true;g.aiMarches[0]={head:11,target:1,kind:'attack'};
  assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);assert.equal(g.canAttack(0,1),false);g.rng=()=>{throw Error('Unknown countries must not roll');};
  assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.relations[0][1],1);assert.equal(g.relations[1][0],1);assert.equal(g.attackedBy[0][1],false);assert.equal(g.aiMarches[0],null);
});
test('diagonal land and contacts through a third country do not count as meeting',()=>{
  const g=running({ai:2});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));
  Object.assign(g.cells[11],{owner:0,army:10});Object.assign(g.cells[22],{owner:1,army:10});assert.equal(g.sharesBorder(0,1),false);
  g.cells[22].owner=-1;Object.assign(g.cells[13],{owner:1,army:10});Object.assign(g.cells[12],{owner:2,army:10});
  assert.equal(g.sharesBorder(0,2),true);assert.equal(g.sharesBorder(1,2),true);assert.equal(g.sharesBorder(0,1),false);
  g.relations[0][1]=2;g.relations[1][0]=0;assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);
});
test('any owned island touching the other country establishes contact for the whole faction',()=>{
  const g=running();Object.assign(g.cells[55],{owner:0,army:10});Object.assign(g.cells[56],{owner:1,army:10});
  assert.equal(g.sharesBorder(0,1),true);g.relations[0][1]=1;g.relations[1][0]=2;g.turn=1;g.rng=()=>0;
  assert.equal(g.resolveDiplomacy().length,1);assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);
});
test('actual capture that removes the last contact immediately resets both directions to neutral',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1});g.relations[0][1]=2;g.relations[1][0]=2;g.attackedBy[1][0]=true;
  assert.equal(g.sharesBorder(0,1),true);assert.equal(g.attack(11,12,0,1).captured,true);assert.equal(g.sharesBorder(0,1),false);
  assert.equal(g.relations[0][1],1);assert.equal(g.relations[1][0],1);assert.equal(g.attackedBy[1][0],false);
});
test('contact enables the original directed reactions and probability rules while unseen war declarations are invalid',()=>{
  const g=running();assert.equal(g.declareWar(1).ok,false);assert.equal(g.turn,0);Object.assign(g.cells[12],{owner:1,army:100});
  assert.equal(g.declareWar(1,{defer:true}).ok,true);assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),1);assert.equal(g.turn,1);
  g.rng=()=>.5;while(g.resolving)g.stepTurn();assert.equal(g.attack(11,12,0,.5).ok,true);assert.equal(g.attitude(1,0),2);
});
test('recontact begins neutral and cannot restore hidden old peace or hostility',()=>{
  const g=running();g.relations[0][1]=0;g.relations[1][0]=2;g.syncUnseenRelations();Object.assign(g.cells[12],{owner:1,army:10});
  assert.equal(g.sharesBorder(0,1),true);assert.equal(g.attitude(0,1),1);assert.equal(g.attitude(1,0),1);
});
