import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,playerLimit} from '../dist/engine.js';
function board(worldMode='earth',options={}){
  const g=new Game({w:6,h:4,humans:1,ai:1,worldMode,...options});g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];
  g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));Object.assign(g.cells[0],{owner:0,army:100,capital:0});return g;
}
test('earth mode wraps all four sides to the same row or column, including index zero',()=>{
  const g=board();assert.deepEqual(g.neighbors(0),[5,1,18,6]);assert.equal(g.neighborAt(5,1,0),0);assert.equal(g.neighborAt(18,0,1),0);
  assert.equal(g.neighborAt(6,-1,0),11);assert.equal(g.neighborAt(2,0,-1),20);assert.equal(g.neighborAt(20,0,1),2);
  for(const c of g.cells){const neighbors=g.neighbors(c.id);assert.equal(new Set(neighbors).size,4);assert.ok(neighbors.every(id=>id>=0&&id<g.cells.length&&g.neighbors(id).includes(c.id)));}
});
test('flat mode treats the outside as walls and never joins adjacent rows accidentally',()=>{
  const g=board('flat');assert.deepEqual(g.neighbors(0),[1,6]);assert.equal(g.neighborAt(5,1,0),null);assert.equal(g.neighborAt(18,0,1),null);
  assert.equal(g.neighbors(5).includes(6),false);assert.equal(g.neighbors(0).includes(18),false);
  assert.equal(g.neighborAt(-1,1,0),null);assert.equal(g.neighborAt(24,-1,0),null);assert.equal(g.neighborAt(0,1,1),null);
});
test('cross-edge attacks and paid friendly transfers work in earth mode and remain invalid in flat mode',()=>{
  for(const [from,to] of [[0,5],[5,0],[0,18],[18,0]])for(const friendly of [false,true]){
    const g=board();g.cells[0].owner=-1;Object.assign(g.cells[from],{owner:0,army:20});Object.assign(g.cells[to],{owner:friendly?0:-1,army:friendly?7:0});
    const r=g.attack(from,to,0,.5);assert.equal(r.ok,true);assert.equal(g.cells[from].army,10);assert.equal(g.cells[to].army,friendly?17:10);assert.equal(g.cells[to].owner,0);
    const flat=board('flat');Object.assign(flat.cells[from],{owner:0,army:20});const state=JSON.stringify(flat.cells);assert.equal(flat.attack(from,to,0,.5).ok,false);assert.equal(JSON.stringify(flat.cells),state);
  }
});
test('opposite edges allow influence and global shifts only on earth, while flat mode preserves distant relations',()=>{
 for(const mode of ['flat','earth']){
 const g=board(mode);Object.assign(g.cells[5],{owner:1,army:1000});g.relations[0][1]=0;g.relations[1][0]=0;assert.equal(g.sharesBorder(0,1),mode==='earth');
 g.turn=1;let draws=0;g.rng=()=>draws++%2===0?0:.99;g.resolveDiplomacy=Game.prototype.resolveDiplomacy;const events=g.resolveDiplomacy();assert.equal(events.length,1);assert.equal(g.relationLevel(0,1),mode==='earth'?0:1);assert.equal(g.globalPeaceLevel,mode==='earth'?2:0);
 }
});
test('AI identifies a hostile front on the opposite edge and captures it with normal combat',()=>{
  const g=board('earth',{humans:0,ai:2});g.aiMove=Game.prototype.aiMove;Object.assign(g.cells[5],{owner:1,army:1});g.relations[0][1]=2;
  const r=g.aiMove(0);assert.equal(r.fromId,0);assert.equal(r.toId,5);assert.equal(r.captured,true);assert.equal(g.cells[5].owner,0);
});
test('marching chooses a one-step route through connected edges and sea failure still blocks it',()=>{
  const g=board();Object.assign(g.cells[5],{owner:1,army:1});assert.deepEqual(g.marchPath(0,1,0),[0,5]);
  g.cells[5].terrain='sea';g.seaAttempts[0]={round:g.seaRound(),allowed:false};assert.equal(g.marchPath(0,1,0),null);
  const flat=board('flat');Object.assign(flat.cells[5],{owner:1,army:1});assert.equal(flat.marchPath(0,1,0).length,6);
});
test('secession regions can join across earth edges while planar regions remain separate',()=>{
  for(const mode of ['earth','flat']){
    const g=board(mode);for(const [id,count] of [[0,4],[5,2]])Object.assign(g.cells[id],{owner:0,homeland:0,army:10,unrestEvents:Array.from({length:count},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
    const result=g.resolveSecessions();assert.equal(result.length,1);assert.deepEqual(result[0].cells,mode==='earth'?[0,5]:[0]);
  }
});
test('cross-edge sea conquest retains the ten-percent trial and failed retries cannot switch edges',()=>{
  const g=board();g.cells[5].terrain='sea';g.cells[18].terrain='sea';let draws=0;g.rng=()=>{draws++;return .9;};
  assert.equal(g.playTurn(0,5).seaFailed,true);assert.equal(g.playTurn(0,18).seaFailed,true);assert.equal(draws,1);assert.equal(g.turn,0);
  assert.equal(g.playTurn(0,6).ok,true);g.rng=()=>0;assert.equal(g.playTurn(0,18).captured,true);assert.equal(g.cells[18].owner,0);
});
test('earth starts use all map cells fairly and preserve painted terrain and the default planar mode',()=>{
  assert.equal(new Game().worldMode,'flat');assert.equal(playerLimit(4,4,'earth'),16);assert.equal(playerLimit(4,4,'flat'),4);
  const g=new Game({w:4,h:4,humans:0,ai:16,worldMode:'earth'});assert.equal(new Set(g.spawns).size,16);assert.ok(g.stats().every(s=>s.land===1&&s.army===20));
  const terrainMap=Array(100).fill('sea');terrainMap[0]='land';terrainMap[99]='land';const map=new Game({w:10,h:10,humans:0,ai:2,worldMode:'earth',terrainMap});assert.deepEqual(map.cells.map(c=>c.terrain),terrainMap);
  assert.throws(()=>new Game({worldMode:'invalid'}),/地球式/);
});
