import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,LEVELS} from '../dist/engine.js';
// Combat fixtures explicitly begin at war; default peaceful behavior is tested separately.
function warGame(options){const g=new Game(options);g.relations.forEach((row,id)=>row.forEach((_,other)=>{row[other]=id===other?0:2;}));return g;}
function running(){const g=warGame();g.running=true;return g;}
test('all six levels start every faction with exactly one tile and 20 troops',()=>{
  for(const l of LEVELS){const g=warGame(l);assert.equal(g.cells.length,l.w*l.h);for(const s of g.stats()){assert.equal(s.land,1);assert.equal(s.army,20);}assert.equal(new Set(g.spawns).size,g.ai+1);}
  for(let ai=1;ai<=7;ai++){const g=warGame({w:10,h:8,ai});assert.equal(g.stats().length,ai+1);assert.ok(g.stats().every(s=>s.land===1&&s.army===20));}
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
    const g=warGame({w:10,h:8,ai:3,difficulty});g.running=true;
    for(let i=0;i<240&&g.winner===null;i++){
      g.aiMove(0);g.waitTurn();
      assert.ok(g.cells.every(c=>c.army>=0&&Number.isInteger(c.army)&&c.owner>=-1&&c.owner<g.players));
    }
    assert.ok(g.cells.filter(c=>c.owner>=0).length>20);
    g.cells.forEach(c=>{if(c.owner===2)c.owner=1;});assert.equal(g.aiMove(2),null);
  }
});
test('thinking for ten minutes never grants AI actions or troop growth on any difficulty',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=warGame({ai:7,difficulty});g.running=true;const before=JSON.stringify(g.cells);
    for(let i=0;i<2400;i++)g.update(.25);
    assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,0);assert.equal(g.time,600);
  }
});
test('one player action grants each of seven computers at most one action at every difficulty',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=warGame({w:18,h:12,ai:7,difficulty});g.running=true;const calls=[],move=g.aiMove.bind(g);
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
    const g=warGame({humans,ai});assert.equal(g.players,humans+ai);assert.equal(g.stats().length,humans+ai);
    assert.ok(g.stats().every(s=>s.land===1&&s.army===20));assert.equal(g.stats().filter(s=>s.human).length,humans);
    assert.equal(g.currentHuman,humans?0:null);
  }
  for(const options of [{humans:0,ai:0},{humans:8,ai:1},{humans:-1,ai:2},{humans:1,ai:-1},{humans:1.5,ai:1}])assert.throws(()=>warGame(options));
});
test('a solo human with no AI does not win until the full map is occupied',()=>{
  const g=warGame({ai:0});g.running=true;assert.equal(g.winner,null);
  assert.equal(g.playTurn(11,12).ok,true);assert.equal(g.turn,1);assert.equal(g.currentHuman,0);
  assert.equal(g.cells[11].army,13);assert.equal(g.cells[12].army,11);assert.equal(g.winner,null);
  assert.equal(g.waitTurn().ok,true);assert.equal(g.turn,2);assert.equal(g.currentHuman,0);
});
test('two local humans control different factions and grow only after both act',()=>{
  const g=warGame({humans:2,ai:0});g.running=true;
  g.playTurn(11,12);assert.equal(g.currentHuman,1);assert.equal(g.turn,1);assert.equal(g.resolving,false);
  assert.equal(g.cells[11].army,10);assert.equal(g.cells[g.spawns[1]].army,20);
  assert.equal(g.playTurn(11,21).ok,false);assert.equal(g.currentHuman,1);
  const p2=g.spawns[1],target=g.neighbors(p2).find(id=>g.cells[id].owner===-1);
  g.playTurn(p2,target);assert.equal(g.currentHuman,0);assert.equal(g.turn,1);assert.equal(g.cells[target].owner,1);
  assert.equal(g.cells[11].army,13);assert.equal(g.cells[p2].army,13);
});
test('computers act once per full human round and their ids start after all humans',()=>{
  const g=warGame({humans:3,ai:2});g.running=true;const calls=[];g.aiMove=id=>{calls.push(id);return null;};
  g.waitTurn();assert.equal(g.currentHuman,1);assert.deepEqual(calls,[]);
  g.waitTurn();assert.equal(g.currentHuman,2);assert.deepEqual(calls,[]);
  g.waitTurn();assert.equal(g.currentHuman,0);assert.deepEqual(calls,[3,4]);assert.equal(g.turn,1);
  assert.ok(g.stats().every(s=>s.army===23));
});
test('eliminated human players are skipped while other local humans can still play',()=>{
  const g=warGame({humans:3,ai:0});g.running=true;
  Object.assign(g.cells[g.spawns[1]],{owner:-1,army:0,capital:-1});
  Object.assign(g.cells[11],{owner:0,army:30});Object.assign(g.cells[12],{owner:1,army:1,capital:1});
  g.playTurn(11,12);assert.deepEqual(g.aliveHumans(),[0,2]);assert.equal(g.currentHuman,2);
  g.waitTurn();assert.equal(g.currentHuman,0);assert.equal(g.winner,null);
});
test('AI-only rounds include faction zero and do not grant human control',()=>{
  const g=warGame({humans:0,ai:3});g.running=true;const calls=[],move=g.aiMove.bind(g);
  g.aiMove=id=>{calls.push(id);return move(id);};
  assert.equal(g.playTurn(g.spawns[0],g.spawns[0]+1).ok,false);
  g.waitTurn();assert.deepEqual(calls,[0,1,2]);assert.equal(g.currentHuman,null);assert.equal(g.turn,1);
  assert.equal(g.moves,0);assert.ok(g.stats().every(s=>!s.human));
});
test('zero-human games schedule automatic rounds only after starting and resolve one action per AI',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=warGame({humans:0,ai:3,difficulty});const calls=[],move=g.aiMove.bind(g);
    g.aiMove=id=>{calls.push(id);return move(id);};
    for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,0);assert.equal(g.resolving,false);
    g.running=true;for(let i=0;i<4;i++)g.update(.25);assert.equal(g.turn,1);assert.equal(g.resolving,true);
    for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,1);assert.deepEqual(calls,[]);
    while(g.resolving)g.stepTurn();assert.deepEqual(calls,[0,1,2]);assert.ok(g.stats().every(s=>s.land===2));
    for(let i=0;i<4;i++)g.update(.25);assert.equal(g.turn,2);
  }
});
test('automatic games freeze while paused and resume without catch-up turns',()=>{
  const g=warGame({humans:0,ai:2});g.running=true;g.paused=true;
  const before=JSON.stringify(g.cells);for(let i=0;i<400;i++)g.update(.25);assert.equal(g.turn,0);assert.equal(g.time,0);
  g.paused=false;for(let i=0;i<4;i++)g.update(.25);assert.equal(g.turn,1);g.paused=true;
  for(let i=0;i<400;i++)g.update(.25);assert.equal(g.stepTurn(),null);assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,1);
  g.paused=false;while(g.resolving)g.stepTurn();assert.equal(g.turn,1);
});
test('zero-computer games remain entirely manual with either one or multiple humans',()=>{
  for(const humans of [1,2,8]){
    const g=warGame({humans,ai:0});g.running=true;assert.equal(g.automatic,false);
    const before=JSON.stringify(g.cells);for(let i=0;i<2400;i++)g.update(.25);assert.equal(JSON.stringify(g.cells),before);assert.equal(g.turn,0);
    g.playTurn(g.spawns[0],g.spawns[0]+1);const after=JSON.stringify(g.cells),turn=g.turn;
    for(let i=0;i<2400;i++)g.update(.25);assert.equal(JSON.stringify(g.cells),after);assert.equal(g.turn,turn);
  }
});
test('a complete automatic solo-AI game reaches conquest and stops advancing after victory',()=>{
  const g=warGame({w:4,h:4,humans:0,ai:1});g.running=true;
  for(let i=0;i<4000&&g.winner===null;i++){g.update(.25);while(g.resolving)g.stepTurn();}
  assert.equal(g.winner,0);assert.equal(g.running,false);assert.ok(g.cells.every(c=>c.owner===0));
  const turn=g.turn,before=JSON.stringify(g.cells);for(let i=0;i<40;i++)g.update(.25);
  assert.equal(g.turn,turn);assert.equal(JSON.stringify(g.cells),before);
});
test('automatic observation starts only after the final human is eliminated',()=>{
  const g=warGame({humans:2,ai:1});g.running=true;
  g.cells.forEach(c=>{if(c.owner===0)c.owner=2;});assert.equal(g.automatic,false);
  g.cells.forEach(c=>{if(c.owner===1)c.owner=2;});assert.equal(g.automatic,true);
  for(let i=0;i<4;i++)g.update(.25);assert.equal(g.turn,1);assert.equal(g.resolving,true);
});
test('step observation waits indefinitely and advances exactly one full computer round per command',()=>{
  const g=warGame({humans:0,ai:3,observerMode:'step'});g.running=true;
  const before=JSON.stringify(g.cells);for(let i=0;i<2400;i++)g.update(.25);
  assert.equal(g.automatic,true);assert.equal(g.continuous,false);assert.equal(g.turn,0);assert.equal(JSON.stringify(g.cells),before);
  g.waitTurn({defer:true});assert.equal(g.turn,1);assert.equal(g.resolving,true);
  assert.equal(g.waitTurn().ok,false);while(g.resolving)g.stepTurn();assert.ok(g.stats().every(s=>s.land===2));
  const after=JSON.stringify(g.cells);for(let i=0;i<2400;i++)g.update(.25);
  assert.equal(g.turn,1);assert.equal(JSON.stringify(g.cells),after);
});
test('switching a continuous computer game to step finishes its current round and stops',()=>{
  const g=warGame({humans:0,ai:3});g.running=true;
  for(let i=0;i<4;i++)g.update(.25);g.stepTurn();const round=g.turn;
  g.setObserverMode('step');assert.equal(g.resolving,true);while(g.resolving)g.stepTurn();
  const after=JSON.stringify(g.cells);for(let i=0;i<40;i++)g.update(.25);
  assert.equal(g.turn,round);assert.equal(JSON.stringify(g.cells),after);assert.ok(g.stats().every(s=>s.land===2));
  g.setObserverMode('continuous');assert.equal(g.turn,round);assert.equal(JSON.stringify(g.cells),after);
  for(let i=0;i<4;i++)g.update(.25);assert.equal(g.turn,round+1);
});
test('observation switches reset timing, respect pause and never automate live human players',()=>{
  const g=warGame({humans:0,ai:1});g.running=true;g.update(.25);g.update(.25);
  g.setObserverMode('step');g.setObserverMode('continuous');assert.equal(g.automaticElapsed,0);
  g.paused=true;for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,0);
  g.setObserverMode('step');g.paused=false;for(let i=0;i<20;i++)g.update(.25);assert.equal(g.turn,0);
  assert.throws(()=>g.setObserverMode('invalid'));assert.throws(()=>warGame({observerMode:'invalid'}));
  for(const ai of [0,2])for(const mode of ['step','continuous']){
    const human=warGame({humans:1,ai,observerMode:mode});human.running=true;
    for(let i=0;i<100;i++)human.update(.25);assert.equal(human.turn,0);assert.equal(human.continuous,false);
  }
});
test('AI claims the final neutral tile instead of endlessly shuffling interior armies',()=>{
  const g=warGame({humans:0,ai:1});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:0,army:999,capital:-1}));
  Object.assign(g.cells[79],{owner:-1,army:0});
  const action=g.aiMove(0);assert.equal(action.toId,79);assert.equal(action.captured,true);assert.equal(g.winner,0);
});
test('AI expands into a reachable blank beside a nonaggressive neutral country',()=>{
  const g=warGame({w:6,h:6,humans:0,ai:2});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:1,army:50,capital:-1}));
  Object.assign(g.cells[7],{owner:0,army:100});Object.assign(g.cells[8],{owner:-1,army:0});g.cells[6].army=1;g.relations[0][1]=1;
  const action=g.aiMove(0);assert.equal(action.toId,8);assert.equal(action.oldOwner,-1);assert.equal(action.amount,50);
});
test('AI routes an interior army toward one rally point without sending it back',()=>{
  const g=warGame({w:5,h:4,humans:0,ai:2});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:1,army:1000,capital:-1}));
  for(const id of [10,11,12,13])Object.assign(g.cells[id],{owner:0,army:1});g.cells[10].army=100;g.cells[13].army=4;g.cells[14].army=50;
  g.aiPlans[0]={rally:13,target:14,age:0};
  for(const [from,to] of [[10,11],[11,12],[12,13]]){
    const action=g.aiMove(0);assert.equal(action.kind,'reinforce');assert.equal(action.fromId,from);assert.equal(action.toId,to);assert.equal(g.aiPlans[0].target,14);
  }
});
test('AI waits for enough support to survive a counterattack and uses half when sufficient',()=>{
  const g=warGame({w:4,h:4,humans:0,ai:2});g.running=true;
  g.cells.forEach(c=>Object.assign(c,{owner:0,army:1,capital:-1}));
  Object.assign(g.cells[13],{owner:0,army:4});Object.assign(g.cells[14],{owner:1,army:5});Object.assign(g.cells[15],{owner:1,army:3});
  g.aiPlans[0]={rally:13,target:14,age:0};assert.equal(g.aiMove(0),null);assert.equal(g.cells[14].army,5);
  g.cells[13].army=40;const action=g.aiMove(0);assert.equal(action.amount,20);assert.equal(action.captured,true);assert.equal(g.cells[13].army,20);assert.equal(g.cells[14].army,15);
});
test('four computers can finish the reproduced three-way stalemate on all map sizes',()=>{
  for(const [w,h,seed,difficulty] of [[10,8,20261152,'normal'],[14,10,20261152,'normal'],[18,12,20261152,'normal'],[18,12,2,'normal'],[18,12,7,'hard']]){
    const g=warGame({w,h,seed,difficulty,humans:0,ai:4});g.running=true;
    // This scenario keeps all new states at war. Hostile-front priority now
    // finishes the largest reproduced normal seed in 11833 rounds.
    while(g.winner===null&&g.turn<12000){g.relations.forEach((row,id)=>row.forEach((_,other)=>{row[other]=id===other?0:2;}));g.waitTurn();}
    assert.notEqual(g.winner,null,`${w}x${h}, seed ${seed}, ${difficulty}`);
    assert.ok(g.cells.every(c=>c.owner===g.winner));assert.equal(g.running,false);
  }
});
test('moving a capital consumes one human action, keeps armies in place and moves the growth bonus',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[12],{owner:0,army:7});
  const result=g.moveCapital(12,{defer:true});assert.equal(result.ok,true);assert.equal(g.turn,1);
  assert.equal(g.cells[11].capital,-1);assert.equal(g.cells[12].capital,0);
  assert.equal(g.cells[11].army,20);assert.equal(g.cells[12].army,7);assert.equal(g.moveCapital(11).ok,false);
  while(g.resolving)g.stepTurn();assert.equal(g.cells[11].army,21);assert.equal(g.cells[12].army,10);
  assert.equal(g.cells.filter(c=>c.capital===0).length,1);
});
test('capital migration rejects neutral, enemy, current capital, paused and unstarted moves without spending a turn',()=>{
  const g=running();
  for(const id of [12,g.spawns[1],g.spawns[0],-1])assert.equal(g.moveCapital(id).ok,false);
  assert.equal(g.turn,0);Object.assign(g.cells[12],{owner:0,army:5});g.paused=true;assert.equal(g.moveCapital(12).ok,false);
  g.paused=false;g.running=false;assert.equal(g.moveCapital(12).ok,false);assert.equal(g.turn,0);
});
test('recapturing a destroyed capital does not restore it without an explicit construction action',()=>{
  const g=warGame({humans:2,ai:0});g.running=true;
  Object.assign(g.cells[10],{owner:1,army:10});g.cells[11].army=1;Object.assign(g.cells[12],{owner:0,army:100});
  assert.equal(g.attack(10,11,1,1).captured,true);assert.equal(g.capitalLost[0],true);assert.equal(g.cells[11].capital,-1);
  assert.equal(g.attack(12,11,0,1).captured,true);assert.equal(g.isCapital(g.cells[11]),false);
  assert.equal(g.relocateCapital(11,0).ok,false);assert.equal(g.relocateCapital(12,0).ok,false);
  const before=g.cells[11].army;g.waitTurn();g.waitTurn();assert.equal(g.cells[11].army,before+1);
  assert.equal(g.capitalLost[0],true);assert.equal(g.cells.filter(c=>c.capital===0).length,0);assert.equal(g.winner,null);
});
test('capturing the old site after migration does not destroy the new capital, but capturing the moved capital does',()=>{
  const g=running();Object.assign(g.cells[12],{owner:0,army:5});Object.assign(g.cells[13],{owner:0,army:5});
  assert.equal(g.relocateCapital(12,0).ok,true);Object.assign(g.cells[10],{owner:1,army:20});
  g.attack(10,11,1,1);assert.equal(g.capitalLost[0],false);assert.equal(g.isCapital(g.cells[12]),true);
  Object.assign(g.cells[22],{owner:1,army:50});g.attack(22,12,1,1);
  assert.equal(g.capitalLost[0],true);assert.equal(g.cells[12].capital,-1);assert.equal(g.relocateCapital(13,0).ok,false);
});
test('failed and equal-strength attacks do not destroy a capital',()=>{
  const g=running();Object.assign(g.cells[10],{owner:1,army:21});g.attack(10,11,1,1);
  assert.equal(g.cells[11].owner,0);assert.equal(g.cells[11].army,0);assert.equal(g.capitalLost[0],false);assert.equal(g.isCapital(g.cells[11]),true);
});
test('each human moves only their own capital and hands the action to the next player',()=>{
  const g=warGame({humans:2,ai:0});g.running=true;Object.assign(g.cells[12],{owner:0,army:4});
  assert.equal(g.moveCapital(12).ok,true);assert.equal(g.currentHuman,1);assert.equal(g.moveCapital(11).ok,false);
  const second=g.spawns[1],target=g.neighbors(second).find(id=>g.cells[id].owner===-1);Object.assign(g.cells[target],{owner:1,army:4});
  assert.equal(g.moveCapital(target).ok,true);assert.equal(g.currentHuman,0);assert.equal(g.cells[second].capital,-1);assert.equal(g.cells[target].capital,1);
});
test('computers rebuild a captured capital using their one action and do not restore the old site passively',()=>{
  const g=running(),capital=g.spawns[1];g.cells[capital].army=1;
  const attacker=g.neighbors(capital)[0],spare=g.neighbors(capital).find(id=>id!==attacker);
  Object.assign(g.cells[attacker],{owner:0,army:20});Object.assign(g.cells[spare],{owner:1,army:20});
  g.attack(attacker,capital,0,1);assert.equal(g.capitalLost[1],true);assert.equal(g.cells.some(c=>c.capital===1),false);
  const land=g.stats()[1].land,result=g.waitTurn();assert.equal(result.actions.length,1);assert.equal(result.actions[0].kind,'capital-build');assert.equal(result.actions[0].owner,1);
  assert.equal(g.stats()[1].land,land);assert.equal(g.capitalLost[1],false);assert.equal(g.cells.filter(c=>c.capital===1).length,1);assert.equal(g.cells[capital].capital,-1);
});
test('building a new capital consumes a turn without moving troops and restores its growth bonus',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[10],{owner:1,army:20});g.cells[11].army=1;Object.assign(g.cells[12],{owner:0,army:10});
  g.attack(10,11,1,1);assert.equal(g.capitalLost[0],true);
  const result=g.buildCapital(12,{defer:true});assert.equal(result.ok,true);assert.equal(result.kind,'capital-build');assert.equal(g.turn,1);assert.equal(g.cells[12].army,10);
  assert.equal(g.isCapital(g.cells[12]),true);assert.equal(g.capitalLost[0],false);assert.equal(g.buildCapital(12).ok,false);
  while(g.resolving)g.stepTurn();assert.equal(g.cells[12].army,13);assert.equal(g.cells.filter(c=>c.capital===0).length,1);
  Object.assign(g.cells[13],{owner:0,army:5});assert.equal(g.moveCapital(13).ok,true);assert.equal(g.cells[12].capital,-1);assert.equal(g.isCapital(g.cells[13]),true);
});
test('construction cannot duplicate a capital or use neutral or enemy territory',()=>{
  const g=running();assert.equal(g.buildCapital(g.spawns[0]).ok,false);assert.equal(g.turn,0);
  Object.assign(g.cells[10],{owner:1,army:20});g.cells[11].army=1;Object.assign(g.cells[12],{owner:0,army:10});g.attack(10,11,1,1);
  for(const id of [11,13,-1])assert.equal(g.buildCapital(id).ok,false);
  assert.equal(g.capitalLost[0],true);assert.equal(g.turn,0);
  g.paused=true;assert.equal(g.buildCapital(12).ok,false);g.paused=false;g.running=false;assert.equal(g.buildCapital(12).ok,false);assert.equal(g.turn,0);
});
test('a recaptured old site is ordinary until the player explicitly builds a new capital there',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[10],{owner:1,army:10});g.cells[11].army=1;Object.assign(g.cells[12],{owner:0,army:100});
  g.attack(10,11,1,1);g.attack(12,11,0,1);assert.equal(g.isCapital(g.cells[11]),false);assert.equal(g.capitalLost[0],true);
  assert.equal(g.buildCapital(11).ok,true);assert.equal(g.isCapital(g.cells[11]),true);assert.equal(g.capitalLost[0],false);assert.equal(g.cells.filter(c=>c.capital===0).length,1);
});
test('a second capital preserves the first, grows independently and spends exactly one action',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[12],{owner:0,army:10});Object.assign(g.cells[13],{owner:0,army:5});
  assert.equal(g.buildCapital(12,{defer:true}).ok,true);assert.equal(g.turn,1);assert.equal(g.cells[11].army,20);assert.equal(g.cells[12].army,10);
  assert.deepEqual(g.capitals(0).map(c=>c.id),[11,12]);assert.equal(g.buildCapital(13).ok,false);
  while(g.resolving)g.stepTurn();assert.equal(g.cells[11].army,23);assert.equal(g.cells[12].army,13);assert.equal(g.cells[13].army,6);
  assert.equal(g.buildCapital(13).ok,false);assert.equal(g.buildCapital(12).ok,false);assert.equal(g.turn,1);
});
test('losing one capital leaves the other active and recapture requires explicit rebuilding',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[12],{owner:0,army:100});g.buildCapital(12);
  Object.assign(g.cells[10],{owner:1,army:10});g.cells[11].army=1;assert.equal(g.attack(10,11,1,1).captured,true);
  assert.equal(g.capitalLost[0],false);assert.equal(g.isCapital(g.cells[12]),true);assert.equal(g.capitals(0).length,1);
  assert.equal(g.attack(12,11,0,1).captured,true);assert.equal(g.isCapital(g.cells[11]),false);
  const before=g.cells[12].army;g.waitTurn();assert.equal(g.cells[12].army,before+3);
  assert.equal(g.buildCapital(11).ok,true);assert.deepEqual(g.capitals(0).map(c=>c.id),[11,12]);
  Object.assign(g.cells[10],{owner:1,army:100});g.cells[11].army=1;g.attack(10,11,1,1);
  Object.assign(g.cells[22],{owner:1,army:100});g.cells[12].army=1;g.attack(22,12,1,1);
  assert.equal(g.capitalLost[0],true);assert.equal(g.capitals(0).length,0);
});
test('migration moves only the chosen capital and rejects invalid source cities',()=>{
  const g=running();g.aiMove=()=>null;Object.assign(g.cells[12],{owner:0,army:10});Object.assign(g.cells[13],{owner:0,army:8});g.buildCapital(12);
  const turn=g.turn;for(const fromId of [-1,13,g.spawns[1]])assert.equal(g.moveCapital(13,{fromId}).ok,false);assert.equal(g.turn,turn);
  assert.equal(g.moveCapital(13,{fromId:12,defer:true}).ok,true);assert.equal(g.turn,turn+1);
  assert.deepEqual(g.capitals(0).map(c=>c.id),[11,13]);assert.equal(g.cells[12].army,13);assert.equal(g.cells[13].army,9);
});
test('a second capital hands control to the next human without an extra action',()=>{
  const g=warGame({humans:2,ai:0});g.running=true;Object.assign(g.cells[12],{owner:0,army:10});
  assert.equal(g.buildCapital(12).ok,true);assert.equal(g.currentHuman,1);assert.equal(g.capitals(0).length,2);
  assert.equal(g.buildCapital(13).ok,false);assert.equal(g.currentHuman,1);g.waitTurn();assert.equal(g.currentHuman,0);assert.equal(g.turn,1);
});
test('computer construction of a second capital uses its one action and preserves land',()=>{
  const g=warGame({w:6,h:4});g.running=true;g.cells.forEach(c=>Object.assign(c,{owner:1,army:10,capital:-1}));
  Object.assign(g.cells[23],{owner:0,capital:0});g.cells[7].capital=1;
  const land=g.stats()[1].land,result=g.waitTurn();assert.equal(result.actions.length,1);assert.equal(result.actions[0].kind,'capital-build');
  assert.equal(g.stats()[1].land,land);assert.equal(g.capitals(1).length,2);assert.equal(g.isCapital(g.cells[7]),true);
  const turn=g.turn;assert.equal(g.constructCapital(8,1).ok,false);assert.equal(g.turn,turn);
});
