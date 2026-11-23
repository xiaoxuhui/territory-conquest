import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SECESSION_GRACE} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];return g;}
function born(){
  const g=running({humans:0,ai:3});
  g.relations[1][0]=2;Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}))});
  g.resolveSecessions();g.turn=SECESSION_GRACE;return g;
}
test('hostile takeovers accumulate unrest and found a new country for humans and computers',()=>{
  for(const humans of [0,1,2]){
    const g=running({humans,ai:2-humans});Object.assign(g.cells[12],{owner:0,army:1});g.relations[0][1]=2;g.relations[1][0]=2;
    for(let i=0;i<4;i++){
      const owner=1-g.cells[12].owner,source=owner===0?11:13;Object.assign(g.cells[source],{owner,army:100});g.cells[12].army=1;
      const r=g.attack(source,12,owner,.5);assert.equal(r.captured,true);assert.equal(r.hostileAttack,true);assert.equal(g.unrest(g.cells[12]),i+1);
      g.waitTurn();if(humans===2)g.waitTurn();
    }
    assert.equal(g.secessions,1);assert.equal(g.cells[12].owner,2);assert.deepEqual(g.factions[2].participants,[0,1]);
  }
});
test('original countries accumulate neutral captures and hostile counterattacks alike',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1});g.relations[0][1]=1;g.relations[1][0]=1;
  assert.equal(g.attack(11,12,0,.5).captured,true);assert.equal(g.attitude(1,0),2);
  Object.assign(g.cells[13],{owner:1,army:100});g.cells[12].army=1;
  assert.equal(g.attack(13,12,1,.5).captured,true);assert.equal(g.unrest(g.cells[12]),2);
});
test('a hostile takeover reaches the fourth event and causes secession at round end',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1,unrestEvents:Array.from({length:3},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
  g.relations[0][1]=2;assert.equal(g.playTurn(11,12,.5).ok,true);assert.equal(g.secessions,1);assert.equal(g.cells[12].owner,2);
});
test('repeated wartime withdrawals cause internal secession without inheriting the war opponents',()=>{
  const g=running({ai:2});g.relations[0][1]=2;Object.assign(g.cells[12],{owner:0,army:10});
  for(let i=0;i<4;i++){g.cells[11].army=20;assert.equal(g.playTurn(11,12,1).ok,true);}
  assert.equal(g.secessions,1);assert.equal(g.cells[11].owner,3);assert.equal(g.factions[3].cause,'drain');
  assert.deepEqual(g.factions[3].participants,[0,1]);assert.equal(g.attitude(3,0),2);assert.equal(g.attitude(3,1),1);assert.equal(g.attitude(3,2),1);assert.deepEqual(g.factions[3].homelandEnemies,[]);
});
test('withdrawal threshold is inclusive at 75 percent and three troops, and limited to once per round',()=>{
  for(const [army,ratio,expected] of [[4,.75,1],[3,1,0],[100,.74,0],[100,.75,1],[100,.5,0]]){
    const g=running();g.relations[0][1]=2;Object.assign(g.cells[12],{owner:0,army:10});g.cells[11].army=army;
    g.attack(11,12,0,ratio);assert.equal(g.unrest(g.cells[11]),expected);
    g.cells[11].army=100;g.attack(11,12,0,1);g.cells[11].army=100;g.attack(11,12,0,1);assert.equal(g.unrest(g.cells[11]),1);
  }
});
test('all birth participants are remembered, including victims beyond the current owner and homeland',()=>{
  const g=running({ai:3});Object.assign(g.cells[12],{owner:0,homeland:1,army:10,unrestEvents:[0,1,2,3].map(actor=>({turn:0,kind:'capture',actor,victim:2}))});
  g.resolveSecessions();assert.deepEqual(g.factions[4].participants,[0,1,2,3]);assert.equal(g.attitude(4,1),0);
  assert.equal(g.isPersistentRelation(4,1),true);assert.equal(g.isPersistentRelation(4,3),true);for(const id of [0,2]){assert.equal(g.isPersistentRelation(4,id),false);assert.equal(g.attitude(4,id),1);}assert.deepEqual(g.factions[4].homelandEnemies,[3]);
});
test('founding attitudes are permanent under global changes without forcing symmetric reverse directions',()=>{
 const g=born();g.resolveDiplomacy=Game.prototype.resolveDiplomacy;
 Object.assign(g.cells[11],{owner:0,army:1000});Object.assign(g.cells[13],{owner:1,army:1000});Object.assign(g.cells[22],{owner:2,army:1000});
 let draws=0;g.rng=()=>draws++%2===0?0:.99;g.turn++;g.resolveDiplomacy();
 assert.equal(g.relationLevel(3,0),4);assert.equal(g.isPermanentRelation(3,0),true);assert.equal(g.relationLevel(3,1),0);assert.equal(g.relationLevel(0,3),1);
 draws=0;g.rng=()=>draws++%2===0?.99:0;g.turn++;g.resolveDiplomacy();assert.equal(g.relationLevel(3,0),4);assert.equal(g.relationLevel(3,1),0);assert.equal(g.attitude(3,2),1);
});
test('only the new country attacking a founding enemy receives the attack exemption',()=>{
 const g=born();Object.assign(g.cells[11],{owner:0,army:100});g.relations[0][3]=2;g.cells[12].army=1;
 assert.equal(g.attack(11,12,0,1).captured,true);assert.equal(g.unrest(g.cells[12]),1);assert.equal(g.unrest(g.cells[11]),1);
 Object.assign(g.cells[13],{owner:3,army:100});g.cells[12].army=1;assert.equal(g.attack(13,12,3,1).captured,true);assert.equal(g.unrest(g.cells[12]),1);assert.equal(g.unrest(g.cells[13]),0);
});
test('a new country hostile to a third nation accumulates both capture and withdrawal unrest',()=>{
 const g=born();g.relations[3][2]=2;g.relations[2][3]=2;Object.assign(g.cells[22],{owner:2,army:1});g.cells[12].army=100;
 assert.equal(g.attack(12,22,3,1).captured,true);assert.equal(g.unrest(g.cells[12]),1);assert.equal(g.unrest(g.cells[22]),1);
 Object.assign(g.cells[21],{owner:2,army:100});g.cells[22].army=1;assert.equal(g.attack(21,22,2,1).captured,true);assert.equal(g.unrest(g.cells[22]),2);assert.equal(g.unrest(g.cells[21]),1);
});
test('friendly logistics do not inherit exemptions from any foreign war',()=>{
 const g=born();g.relations[0][3]=2;g.relations[0][2]=2;Object.assign(g.cells[10],{owner:0,army:10});Object.assign(g.cells[11],{owner:0,army:100});
 g.attack(11,10,0,1);assert.equal(g.unrest(g.cells[11]),1);assert.deepEqual(g.cells[11].unrestEvents[0].enemies,[2,3]);
});
