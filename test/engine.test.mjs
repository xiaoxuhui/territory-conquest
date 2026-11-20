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
  const g=running();g.aiTimers.fill(100);for(let i=0;i<7;i++)g.update(.25);for(const id of g.spawns)assert.equal(g.cells[id].army,23);
  const captured=g.spawns[1];g.cells[captured].owner=0;const before=g.cells[captured].army;for(let i=0;i<7;i++)g.update(.25);assert.equal(g.cells[captured].army,before+1);
  g.cells[captured].army=1200;for(let i=0;i<7;i++)g.update(.25);assert.equal(g.cells[captured].army,1200);
});
test('victory requires every tile including neutral land',()=>{
  const g=running();g.cells.forEach(c=>{c.owner=0;c.army=4;});g.cells[0].owner=-1;g.cells[0].army=0;g.checkWinner();assert.equal(g.winner,null);
  g.attack(1,0,0,1);assert.equal(g.winner,0);assert.equal(g.running,false);
  assert.equal(g.attack(1,2,0).ok,false);
});
test('AI expands, fights and routes reinforcements without illegal moves or resurrection',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const g=new Game({w:10,h:8,ai:3,difficulty});g.running=true;
    for(let i=0;i<2400&&g.winner===null;i++){
      g.update(.1);if(i%10===0)g.aiMove(0);
      assert.ok(g.cells.every(c=>c.army>=0&&Number.isInteger(c.army)&&c.owner>=-1&&c.owner<=3));
    }
    assert.ok(g.cells.filter(c=>c.owner>=0).length>20);
    g.cells.forEach(c=>{if(c.owner===2)c.owner=1;});assert.equal(g.aiMove(2),null);
  }
});
