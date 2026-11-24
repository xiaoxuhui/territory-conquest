import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function board({peaceSupport=true,worldMode='flat',wall='none'}={}){
 const g=new Game({w:7,h:5,humans:0,ai:4,observerMode:'step',peaceSupport,worldMode});g.running=true;g.resolveDiplomacy=()=>[];g.rng=()=>.99;
 g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1,terrain:'land',unrestEvents:[],stableUntil:0}));
 for(const [owner,id,army]of [[0,15,100],[1,19,100],[2,18,6],[3,0,10]])Object.assign(g.cells[id],{owner,army,capital:owner});
 g.relations[0][1]=0;g.relations[1][0]=2;g.relations[0][2]=0;g.relations[2][0]=0;g.relations[0][3]=0;g.relations[3][0]=0;g.relations[2][1]=2;g.relations[1][2]=0;
 for(const id of wall==='full'?[3,10,17,24,31]:wall==='single'?[17]:[])Object.assign(g.cells[id],{owner:3,army:1});return g;
}
function trigger(g){const r=g.attack(18,19,2,.5);assert.equal(r.ok,true);assert.equal(r.captured,false);return r;}
test('optional rule defaults off and directed peace alone grants support when enabled',()=>{
 assert.equal(new Game().peaceSupport,false);const off=board({peaceSupport:false});trigger(off);assert.deepEqual(off.activeDefenseOrders(0),[]);assert.equal(off.canAttack(0,2),false);
 const g=board();trigger(g);assert.deepEqual(g.activeDefenseOrders(0).map(o=>[o.beneficiary,o.enemy]),[[1,2]]);assert.equal(g.attitude(1,0),2);
});
test('supporters move one adjacent tile per action and attack the aggressor without changing either relation',()=>{
 const g=board();trigger(g);const before=g.stats().reduce((sum,c)=>sum+c.army,0),actions=[];
 for(let i=0;i<4&&g.cells[18].owner===2;i++){g.turn++;const a=g.aiMove(0);assert.ok(a?.ok);assert.ok(g.neighbors(a.fromId).includes(a.toId));actions.push(a);}
 assert.equal(g.cells[18].owner,0);assert.equal(actions.length,3);assert.equal(actions.at(-1).peaceSupport,true);assert.equal(actions.at(-1).defenseFor,1);assert.equal(g.attitude(0,2),0);assert.equal(g.attitude(2,0),0);assert.equal(g.stats().reduce((sum,c)=>sum+c.army,0),before-6);
});
test('a peaceful blocker is bypassed whenever another route exists',()=>{
 const g=board({wall:'single'});trigger(g);assert.equal(g.defenseBlockade(0,1).blocked,false);assert.equal(g.peaceSupportContext(0,3),null);const dArmy=g.cells[17].army;
 for(let i=0;i<12&&g.cells[18].owner===2;i++){g.turn++;const a=g.aiMove(0);assert.ok(a?.ok);assert.notEqual(a.oldOwner,3);}
 assert.equal(g.cells[18].owner,0);assert.equal(g.cells[17].owner,3);assert.equal(g.cells[17].army,dArmy);assert.equal(g.attitude(0,3),0);assert.equal(g.attitude(3,0),0);
});
test('only a complete peaceful barrier permits support attacks on a peaceful blocking country',()=>{
 const g=board({wall:'full'});trigger(g);const blockade=g.defenseBlockade(0,1);assert.equal(blockade.blocked,true);assert.equal(blockade.blockers.has(3),true);assert.equal(g.peaceSupportContext(0,3).breakingBlockade,true);
 const before=g.stats().reduce((sum,c)=>sum+c.army,0);let breakthrough;
 for(let i=0;i<4&&!breakthrough;i++){g.turn++;const a=g.aiMove(0);if(a?.oldOwner===3)breakthrough=a;}
 assert.ok(breakthrough?.captured);assert.equal(breakthrough.peaceSupport,true);assert.equal(breakthrough.breakingBlockade,true);assert.equal(g.attitude(0,3),0);assert.equal(g.attitude(3,0),0);assert.equal(g.stats().reduce((sum,c)=>sum+c.army,0),before-2);
});
test('earth routes and a second friendly island prevent false full-blockade exceptions',()=>{
 const earth=board({wall:'full',worldMode:'earth'});trigger(earth);assert.equal(earth.defenseBlockade(0,1).blocked,false);assert.equal(earth.peaceSupportContext(0,3),null);
 const island=board({wall:'full'});Object.assign(island.cells[20],{owner:0,army:1});trigger(island);assert.equal(island.defenseBlockade(0,1).blocked,false);assert.equal(island.peaceSupportContext(0,3),null);
});
test('invalid attacks and failed sea attempts do not trigger support or consume extra troops',()=>{
 const g=board();g.cells[18].army=1;assert.equal(g.attack(18,19,2,1).ok,false);assert.deepEqual(g.activeDefenseOrders(0),[]);g.cells[18].army=6;trigger(g);
 Object.assign(g.cells[17],{owner:0,army:100});g.cells[18].terrain='sea';let draws=0;g.rng=()=>{draws++;return .9;};const cells=JSON.stringify(g.cells),relations=JSON.stringify(g.relations);assert.equal(g.attack(17,18,0,1).seaFailed,true);assert.equal(g.attack(17,18,0,1).seaFailed,true);assert.equal(draws,1);assert.equal(JSON.stringify(g.cells),cells);assert.equal(JSON.stringify(g.relations),relations);
});
test('live disabling preserves world state, clears orders and restores ordinary peaceful attack restrictions',()=>{
 const g=board();trigger(g);Object.assign(g.cells[17],{owner:0,army:100});assert.equal(g.canAttack(0,2),true);const cells=JSON.stringify(g.cells),relations=JSON.stringify(g.relations),turn=g.turn;g.paused=true;g.setPeaceSupport(false);assert.equal(g.paused,true);assert.equal(JSON.stringify(g.cells),cells);assert.equal(JSON.stringify(g.relations),relations);assert.equal(g.turn,turn);assert.deepEqual(g.activeDefenseOrders(0),[]);assert.equal(g.canAttack(0,2),false);g.setPeaceSupport(true);assert.deepEqual(g.activeDefenseOrders(0),[]);
});
test('orders cancel when A is no longer peaceful to B or either party disappears',()=>{
 for(const reason of ['peace','beneficiary','enemy']){const g=board();trigger(g);if(reason==='peace')g.relations[0][1]=1;else g.cells.forEach(c=>{if(c.owner===(reason==='beneficiary'?1:2))c.owner=-1;});assert.deepEqual(g.activeDefenseOrders(0),[]);assert.equal(g.peaceSupportContext(0,2),null);}
});
test('human takeover uses support permissions manually without an automatic extra action',()=>{
 const g=board();trigger(g);Object.assign(g.cells[17],{owner:0,army:100});g.setHumanControl(0);const calls=[];g.aiMove=owner=>{calls.push(owner);return null;};const r=g.playTurn(17,18,.5);assert.equal(r.ok,true);assert.equal(r.peaceSupport,true);assert.equal(g.turn,1);assert.ok(calls.every(owner=>owner!==0));assert.equal(g.attitude(0,2),0);assert.equal(g.attitude(2,0),0);
});
test('permanent peace survives a valid support attack and ordinary non-support attacks still lower defender attitude',()=>{
 const g=board({wall:'full'});g.factions[0].permanentRelations={3:0};g.factions[3].permanentRelations={0:0};trigger(g);Object.assign(g.cells[16],{owner:0,army:100});const r=g.attack(16,17,0,.5);assert.equal(r.peaceSupport,true);assert.equal(g.isPermanentRelation(0,3),true);assert.equal(g.isPermanentRelation(3,0),true);assert.equal(g.attitude(0,3),0);assert.equal(g.attitude(3,0),0);
 const ordinary=board({peaceSupport:false});trigger(ordinary);assert.equal(ordinary.attitude(1,2),1);
});
test('support never attacks its beneficiary, never duplicates per-beneficiary orders, and preserves one AI action per round',()=>{
 const g=board();trigger(g);trigger(g);assert.equal(g.activeDefenseOrders(0).length,1);assert.equal(g.peaceSupportContext(0,1),null);const calls=[],move=g.aiMove.bind(g);g.aiMove=owner=>{calls.push(owner);return owner===0?move(owner):null;};g.waitTurn();assert.deepEqual(calls,[0,1,2,3]);assert.equal(g.turn,1);
});
