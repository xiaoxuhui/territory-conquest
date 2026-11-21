import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,MARCH_CHANCE,MARCH_MAX_ARMY} from '../dist/engine.js';
function fixture(attitude=2,ai=2){
  const g=new Game({w:6,h:4,humans:0,ai});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));
  Object.assign(g.cells[7],{owner:0,army:20,capital:0});Object.assign(g.cells[10],{owner:1,army:20,capital:1});
  g.relations[0][1]=attitude;g.relations[1][0]=0;g.running=true;g.rng=()=>0;g.resolveDiplomacy=()=>[];
  const aiMove=g.aiMove.bind(g);g.aiMove=id=>id===0?aiMove(id):null;return g;
}
function round(g){g.waitTurn({defer:true});const actions=[];while(g.resolving){const phase=g.stepTurn();if(phase?.action?.ok)actions.push(phase.action);}return actions;}
test('a hostile small territory advances one neighboring tile per round and attacks only upon arrival',()=>{
  const g=fixture(),initial=g.cells[10].army;
  let actions=round(g);assert.equal(actions.length,1);assert.equal(actions[0].fromId,7);assert.equal(actions[0].toId,8);assert.equal(actions[0].amount,2);assert.equal(g.aiMarches[0].head,8);assert.equal(g.cells[9].owner,-1);assert.equal(g.cells[10].army,initial+3);
  actions=round(g);assert.equal(actions.length,1);assert.equal(actions[0].fromId,8);assert.equal(actions[0].toId,9);assert.equal(g.aiMarches[0].head,9);assert.equal(g.cells[10].army,initial+6);
  actions=round(g);assert.equal(actions.length,1);assert.equal(actions[0].fromId,9);assert.equal(actions[0].toId,10);assert.equal(actions[0].hostileAttack,true);assert.equal(actions[0].toAfter,actions[0].toBefore-actions[0].amount);assert.equal(g.aiMarches[0],null);
  for(const action of actions)assert.ok(g.neighbors(action.fromId).includes(action.toId));assert.equal(g.unrest(g.cells[10]),0);assert.equal(g.players,2);
});
test('peaceful reinforcements march to the border, add paid troops and preserve recipient ownership and relations',()=>{
  const g=fixture(0);round(g);round(g);const actions=round(g),support=actions[0];
  assert.equal(support.kind,'support');assert.equal(support.fromId,9);assert.equal(support.toId,10);assert.equal(support.amount,1);assert.equal(support.fromAfter,support.fromBefore-support.amount);assert.equal(support.toAfter,support.toBefore+support.amount);
  assert.equal(g.cells[10].owner,1);assert.equal(g.cells[10].capital,1);assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),0);assert.equal(g.aiMarches[0],null);assert.equal(g.unrest(g.cells[9]),0);
});
test('march initiation has a one-percent boundary and never rerolls within one round',()=>{
  assert.equal(MARCH_CHANCE,.01);
  for(const [value,allowed] of [[.009999,true],[.01,false],[.5,false]]){
    const g=fixture();let draws=0;g.rng=()=>{draws++;return value;};const owned=g.cells.filter(c=>c.owner===0);
    const result=g.tryStartMarch(0,owned);assert.equal(!!result,allowed);assert.equal(draws,1);
    assert.equal(g.tryStartMarch(0,owned),null);assert.equal(draws,1);
  }
});
test('small marching forces are capped at five, leave a garrison and cannot start without enough troops',()=>{
  assert.equal(MARCH_MAX_ARMY,5);const g=fixture();g.cells[7].army=200;
  const action=g.tryStartMarch(0,[g.cells[7]]);assert.equal(action.amount,5);assert.equal(g.cells[7].army,195);assert.equal(g.cells[8].army,5);
  const weak=fixture();weak.cells[7].army=1;assert.equal(weak.tryStartMarch(0,[weak.cells[7]]),null);assert.equal(weak.aiMarches[0],null);
});
test('hostile nations already sharing a border use ordinary neighboring attacks instead of starting a distant march',()=>{
  const g=fixture();Object.assign(g.cells[9],{owner:0,army:100});assert.equal(g.sharesBorder(0,1),true);
  assert.equal(g.tryStartMarch(0,g.cells.filter(c=>c.owner===0)),null);assert.equal(g.aiMarches[0],null);
  const action=g.aiMove(0);assert.equal(action.toId,10);assert.equal(action.fromId,9);assert.equal(action.captured,true);
});
test('a marching unit cannot cross unrelated countries and cancels if its head or diplomacy is lost',()=>{
  const blocked=fixture(2,3);for(const id of [3,9,15,21])Object.assign(blocked.cells[id],{owner:2,army:20});
  assert.equal(blocked.marchPath(0,1,7),null);assert.equal(blocked.tryStartMarch(0,[blocked.cells[7]]),null);assert.equal(blocked.cells[10].army,20);
  for(const change of ['owner','diplomacy']){
    const g=fixture();g.tryStartMarch(0,[g.cells[7]]);if(change==='owner')g.cells[8].owner=1;else g.relations[0][1]=1;
    const before=JSON.stringify(g.cells);assert.equal(g.advanceMarch(0),null);assert.equal(g.aiMarches[0],null);assert.equal(JSON.stringify(g.cells),before);
  }
});
test('peaceful support requires adjacent recipient territory and valid paid troop counts',()=>{
  const g=fixture(0);Object.assign(g.cells[8],{owner:1,army:10});
  for(const [to,amount] of [[10,2],[8,6],[8,0],[8,1.5]])assert.equal(g.supportNeighbor(7,to,0,amount).ok,false);
  g.paused=true;assert.equal(g.supportNeighbor(7,8,0,2).ok,false);g.paused=false;
  g.relations[0][1]=2;assert.equal(g.supportNeighbor(7,8,0,2).ok,false);g.relations[0][1]=0;
  assert.equal(g.supportNeighbor(7,8,0,2).ok,true);assert.equal(g.cells[7].army,18);assert.equal(g.cells[8].army,12);assert.equal(g.cells[8].owner,1);
});
test('pause freezes an active march and adjacent enemy fronts stop peaceful aid missions',()=>{
  const g=fixture(0,3);g.tryStartMarch(0,[g.cells[7]]);const before=JSON.stringify(g.cells);g.paused=true;
  assert.equal(g.aiMove(0),null);assert.equal(g.waitTurn().ok,false);assert.equal(JSON.stringify(g.cells),before);g.paused=false;
  Object.assign(g.cells[6],{owner:2,army:1});g.relations[0][2]=2;const action=g.aiMove(0);assert.equal(g.aiMarches[0],null);assert.equal(action.toId,6);
});
