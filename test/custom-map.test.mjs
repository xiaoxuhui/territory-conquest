import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
test('hand-painted maps preserve every land and sea tile and place capitals only on painted land',()=>{
  const terrainMap=Array(100).fill('sea');for(const id of [0,9,90,99])terrainMap[id]='land';
  const g=new Game({w:10,h:10,humans:1,ai:3,ocean:true,terrainMap});
  assert.deepEqual(g.cells.map(c=>c.terrain),terrainMap);assert.deepEqual([...g.spawns].sort((a,b)=>a-b),[0,9,90,99]);
  assert.ok(g.stats().every(s=>s.land===1&&s.army===20));assert.ok(g.spawns.every(id=>g.isCapital(g.cells[id])));
  terrainMap[0]='sea';assert.equal(g.cells[0].terrain,'land');
});
test('a custom map with a single land island starts there without repainting its sea neighbors',()=>{
  const terrainMap=Array(100).fill('sea');terrainMap[55]='land';const g=new Game({w:10,h:10,ai:0,terrainMap});
  assert.deepEqual(g.spawns,[55]);assert.ok(g.neighbors(55).every(id=>g.cells[id].terrain==='sea'));assert.equal(g.cells.filter(c=>c.terrain==='land').length,1);
  g.running=true;g.rng=()=>0;assert.equal(g.playTurn(55,56).ok,true);assert.equal(g.cells[56].owner,0);
});
test('64 countries can start on 64 chosen land cells including the edge of a custom map',()=>{
  const terrainMap=Array(100).fill('sea');for(let id=0;id<64;id++)terrainMap[id]='land';
  const g=new Game({w:10,h:10,humans:0,ai:64,terrainMap});assert.equal(new Set(g.spawns).size,64);assert.ok(g.spawns.every(id=>id<64));
});
test('missing, sparse, unknown and insufficient terrain maps are rejected before a game starts',()=>{
  for(const terrainMap of [[],Array(100),Array(100).fill('mountain'),'land',Array(100).fill('sea')])assert.throws(()=>new Game({w:10,h:10,ai:0,terrainMap}));
  const terrainMap=Array(100).fill('sea');terrainMap[0]='land';assert.throws(()=>new Game({w:10,h:10,humans:1,ai:1,terrainMap}),/陆地格数不足/);
});
test('all editor sizes support reproducible painted maps and equal starting positions',()=>{
  for(const size of [10,30,100]){
    const terrainMap=Array.from({length:size*size},(_,id)=>id%size<size/2?'land':'sea');
    const options={w:size,h:size,humans:2,ai:6,terrainMap,seed:12},a=new Game(options),b=new Game(options);
    assert.deepEqual(a.spawns,b.spawns);assert.deepEqual(a.cells.map(c=>c.terrain),terrainMap);assert.ok(a.stats().every(s=>s.land===1&&s.army===20));
  }
});
