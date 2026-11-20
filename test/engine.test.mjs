import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,LEVELS} from '../dist/engine.mjs';
function running(){const g=new Game();g.running=true;return g;}
test('all six levels start every faction with exactly one tile and 20 troops',()=>{
  for(const l of LEVELS){const g=new Game(l);assert.equal(g.cells.length,l.w*l.h);for(const s of g.stats()){assert.equal(s.land,1);assert.equal(s.army,20);}assert.equal(new Set(g.spawns).size,g.ai+1);}
  for(let ai=1;ai<=7;ai++){const g=new Game({w:10,h:8,ai});assert.equal(g.stats().length,ai+1);assert.ok(g.stats().every(s=>s.land===1&&s.army===20));}
});
test('click attack captures neutral, leaves a garrison, and supports friendly transfer',()=>{
  const g=running(),from=g.spawns[0],to=g.neighbors(from)[0];
  const a=g.attack(from,to,0,.5);assert.equal(a.ok,true);assert.equal(a.amount,10);assert.equal(g.cells[to].owner,0);assert.equal(g.cells[to].army,10);assert.equal(g.cells[from].army,10);
  g.attack(to,from,0,1);assert.equal(g.cells[to].army,1);assert.equal(g.cells[from].army,19);
  assert.equal(g.attack(to,from,0,1).ok,false);
});
test('enemy combat handles capture, failed attack, and equal troop counts',()=>{
  for(const defenders of [4,10,15]){const g=running(),from=g.spawns[0],to=g.neighbors(from)[0];g.cells[to].owner=1;g.cells[to].army=defenders;const result=g.attack(from,to,0,.5);assert.equal(result.captured,defenders<10);assert.equal(g.cells[to].owner,defenders<10?0:1);assert.equal(g.cells[to].army,Math.abs(defenders-10));}
});
test('only orthogonal neighbors may be attacked; paused and unstarted games reject moves',()=>{
  const g=running(),from=g.spawns[0];assert.equal(g.attack(from,from+g.w+1,0).ok,false);assert.equal(g.attack(from,g.spawns[1],0).ok,false);assert.equal(g.attack(from,from+1,1).ok,false);assert.ok(!g.neighbors(9).includes(10));
  g.paused=true;const state=JSON.stringify(g.cells);assert.equal(g.attack(from,from+1,0).ok,false);g.update(.25);assert.equal(JSON.stringify(g.cells),state);assert.equal(g.time,0);
  g.paused=false;g.running=false;assert.equal(g.attack(from,from+1,0).ok,false);
});
test('growth is equal for every faction; captured capitals grow as ordinary tiles',()=>{
  const g=running();g.aiMove=()=>null;g.waitTurn();for(const id of g.spawns)assert.equal(g.cells[id].army,23);
  const captured=g.spawns[1];g.cells[captured].owner=0;const before=g.cells[captured].army;g.waitTurn();assert.equal(g.cells[captured].army,before+1);
  g.cells[captured].army=1200;g.waitTurn();assert.equal(g.cells[captured].army,1200);
});
test('victory requires every tile including neutral land',()=>{
  const g=running();g.cells.forEach(c=>{c.owner=0;c.army=4;});g.cells[0].owner=-1;g.cells[0].army=0;g.checkWinner();assert.equal(g.winner,null);
  g.attack(1,0,0,1);assert.equal(g.winner,0);assert.equal(g.running,false);
  assert.equal(g.attack(1,2,0).ok,false);
});
test('AI expands, fights and routes reinforcements without illegal moves or resurrection',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=new Game({w:10,h:8,ai:3,difficulty});g.running=true;
    for(let i=0;i<240&&g.winner===null;i++){
      g.aiMove(0);g.waitTurn();
      assert.ok(g.cells.every(c=>c.army>=0&&Number.isInteger(c.army)&&c.owner>=-1&&c.owner<=3));
    }
    assert.ok(g.cells.filter(c=>c.owner>=0).length>20);
    g.cells.forEach(c=>{if(c.owner===2)c.owner=1;});assert.equal(g.aiMove(2),null);
  }
});
test('thinking for ten minutes never grants AI actions or troop growth on any difficulty',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=new Game({ai:7,difficulty});g.running=true;const before=JSON.stringify(g.cells);
    for(let i=0;i<2400;i++)g.update(.25);
    assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,0);assert.equal(g.time,600);
  }
});
test('one player action grants each of seven computers at most one action at every difficulty',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=new Game({w:18,h:12,ai:7,difficulty});g.running=true;const calls=[],move=g.aiMove.bind(g);
    g.aiMove=id=>{calls.push(id);return move(id);};
    const result=g.playTurn(g.spawns[0],g.spawns[0]+1,.5);assert.equal(result.ok,true);assert.equal(g.turn,1);
    assert.deepEqual([...calls].sort((a,b)=>a-b),[1,2,3,4,5,6,7]);assert.ok(result.actions.length<=8);
    assert.doesNotThrow(()=>JSON.stringify(result));calls.length=0;g.waitTurn();assert.equal(g.turn,2);assert.equal(calls.length,7);
  }
});
test('invalid moves and pauses do not consume turns or let the AI act',()=>{
  const g=running(),before=JSON.stringify(g.cells);assert.equal(g.playTurn(g.spawns[0],g.spawns[0]+g.w+1).ok,false);
  assert.equal(g.turn,0);assert.equal(JSON.stringify(g.cells),before);
  g.cells[g.spawns[0]].army=1;assert.equal(g.playTurn(g.spawns[0],g.spawns[0]+1).ok,false);assert.equal(g.turn,0);
  g.paused=true;assert.equal(g.waitTurn().ok,false);assert.equal(g.turn,0);
});
test('fast and slow players get the exact same battle from the same decisions',()=>{
  const fast=running(),slow=running();
  for(let turn=0;turn<20;turn++){
    for(let i=0;i<120;i++)slow.update(.25);
    fast.waitTurn();slow.waitTurn();assert.deepEqual(fast.cells,slow.cells);assert.equal(fast.turn,slow.turn);
  }
});
test('combat losses stay deducted on both player and AI capitals; fighting suppresses growth symmetrically',()=>{
  for(const owner of [0,1])for(const ratio of [.5,1]){
    const g=running();g.aiMove=()=>null;
    Object.assign(g.cells[11],{owner,army:4,capital:owner});
    Object.assign(g.cells[12],{owner:1-owner,army:100,capital:1-owner});
    const result=g.attack(11,12,owner,ratio);g.finishTurn([result],{defer:true});
    const sent=ratio===.5?2:3;
    assert.equal(g.cells[11].army,4-sent);assert.equal(g.cells[12].army,100-sent);
    while(g.resolving)g.stepTurn();
    assert.equal(g.cells[11].army,4-sent);assert.equal(g.cells[12].army,100-sent);
    g.waitTurn();assert.equal(g.cells[12].army,103-sent);
  }
});
test('AI reinforcements pay their actual source and remain distinct from damage and growth',()=>{
  const g=running();Object.assign(g.cells[11],{army:4,capital:-1});
  Object.assign(g.cells[12],{owner:1,army:100,capital:1});Object.assign(g.cells[13],{owner:1,army:6});
  g.aiMove=owner=>g.attack(13,12,owner,1);
  const result=g.playTurn(11,12,.5,{defer:true});
  assert.equal(g.cells[12].army,98);assert.equal(result.toBefore,100);assert.equal(result.toAfter,98);
  assert.equal(g.waitTurn().ok,false);assert.equal(g.playTurn(11,12).ok,false);
  const ai=g.stepTurn();assert.equal(ai.action.kind,'reinforce');assert.equal(ai.action.amount,5);
  assert.equal(g.cells[13].army,1);assert.equal(g.cells[12].army,103);
  const growth=g.stepTurn();assert.equal(growth.kind,'growth');assert.ok(!growth.changes.some(c=>c.id===12));
  assert.equal(g.cells[12].army,103);assert.equal(g.resolving,false);
});
test('staged turns pause safely, cannot double-submit, and produce the same final result as synchronous turns',()=>{
  const immediate=running(),staged=running();
  immediate.playTurn(11,12);staged.playTurn(11,12,.5,{defer:true});
  assert.equal(staged.resolving,true);staged.paused=true;assert.equal(staged.stepTurn(),null);assert.equal(staged.turn,1);
  staged.paused=false;while(staged.resolving)staged.stepTurn();
  assert.deepEqual(staged.cells,immediate.cells);assert.equal(staged.turn,immediate.turn);
});
test('zero computers, eight local humans, and AI-only games share equal one-tile starts',()=>{
  for(const [humans,ai] of [[1,0],[2,0],[8,0],[0,8],[0,1],[3,5]]){
    const g=new Game({humans,ai});assert.equal(g.players,humans+ai);assert.equal(g.stats().length,humans+ai);
    assert.ok(g.stats().every(s=>s.land===1&&s.army===20));assert.equal(g.stats().filter(s=>s.human).length,humans);
    assert.equal(g.currentHuman,humans?0:null);
  }
  for(const options of [{humans:0,ai:0},{humans:8,ai:1},{humans:-1,ai:2},{humans:1,ai:-1},{humans:1.5,ai:1}])assert.throws(()=>new Game(options));
});
test('a solo human with no AI does not win until the full map is occupied',()=>{
  const g=new Game({ai:0});g.running=true;assert.equal(g.winner,null);
  assert.equal(g.playTurn(11,12).ok,true);assert.equal(g.turn,1);assert.equal(g.currentHuman,0);
  assert.equal(g.cells[11].army,13);assert.equal(g.cells[12].army,11);assert.equal(g.winner,null);
  assert.equal(g.waitTurn().ok,true);assert.equal(g.turn,2);assert.equal(g.currentHuman,0);
});
test('two local humans control different factions and grow only after both act',()=>{
  const g=new Game({humans:2,ai:0});g.running=true;
  g.playTurn(11,12);assert.equal(g.currentHuman,1);assert.equal(g.turn,1);assert.equal(g.resolving,false);
  assert.equal(g.cells[11].army,10);assert.equal(g.cells[g.spawns[1]].army,20);
  assert.equal(g.playTurn(11,21).ok,false);assert.equal(g.currentHuman,1);
  const p2=g.spawns[1],target=g.neighbors(p2).find(id=>g.cells[id].owner===-1);
  g.playTurn(p2,target);assert.equal(g.currentHuman,0);assert.equal(g.turn,1);assert.equal(g.cells[target].owner,1);
  assert.equal(g.cells[11].army,13);assert.equal(g.cells[p2].army,13);
});
test('computers act once per full human round and their ids start after all humans',()=>{
  const g=new Game({humans:3,ai:2});g.running=true;const calls=[];g.aiMove=id=>{calls.push(id);return null;};
  g.waitTurn();assert.equal(g.currentHuman,1);assert.deepEqual(calls,[]);
  g.waitTurn();assert.equal(g.currentHuman,2);assert.deepEqual(calls,[]);
  g.waitTurn();assert.equal(g.currentHuman,0);assert.deepEqual(calls,[3,4]);assert.equal(g.turn,1);
  assert.ok(g.stats().every(s=>s.army===23));
});
test('eliminated human players are skipped while other local humans can still play',()=>{
  const g=new Game({humans:3,ai:0});g.running=true;
  Object.assign(g.cells[g.spawns[1]],{owner:-1,army:0,capital:-1});
  Object.assign(g.cells[11],{owner:0,army:30});Object.assign(g.cells[12],{owner:1,army:1,capital:1});
  g.playTurn(11,12);assert.deepEqual(g.aliveHumans(),[0,2]);assert.equal(g.currentHuman,2);
  g.waitTurn();assert.equal(g.currentHuman,0);assert.equal(g.winner,null);
});
test('AI-only rounds include faction zero and do not grant human control',()=>{
  const g=new Game({humans:0,ai:3});g.running=true;const calls=[],move=g.aiMove.bind(g);
  g.aiMove=id=>{calls.push(id);return move(id);};
  assert.equal(g.playTurn(g.spawns[0],g.spawns[0]+1).ok,false);
  g.waitTurn();assert.deepEqual(calls,[0,1,2]);assert.equal(g.currentHuman,null);assert.equal(g.turn,1);
  assert.equal(g.moves,0);assert.ok(g.stats().every(s=>!s.human));
});
