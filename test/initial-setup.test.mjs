import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
test('all selected starting capitals are respected while every country still starts with one tile and 20 troops',()=>{
  const g=new Game({w:10,h:10,humans:1,ai:3,terrainMap:Array(100).fill('land'),initialSpawns:[0,9,90,99]});
  assert.deepEqual(g.spawns,[0,9,90,99]);assert.ok(g.stats().every(s=>s.land===1&&s.army===20));
  for(let owner=0;owner<4;owner++){assert.equal(g.cells[g.spawns[owner]].owner,owner);assert.equal(g.cells[g.spawns[owner]].capital,owner);}
});
test('automatic countries never take a later country reserved starting cell',()=>{
  const g=new Game({w:10,h:10,humans:0,ai:4,initialSpawns:[null,null,11,null]});
  assert.equal(g.spawns[2],11);assert.equal(new Set(g.spawns).size,4);assert.ok(g.spawns.filter((_,id)=>id!==2).every(id=>id!==11));
});
test('initial relations are directional, ordinary and independent from the input matrix',()=>{
  const initialRelations=[[0,2,0],[1,0,2],[2,1,0]],g=new Game({ai:2,initialRelations});
  assert.equal(g.attitude(0,1),2);assert.equal(g.attitude(1,0),1);assert.equal(g.attitude(0,2),0);assert.equal(g.attitude(2,0),2);
  assert.equal(g.isPersistentRelation(0,1),false);assert.equal(g.isPersistentRelation(0,2),false);initialRelations[0][1]=0;assert.equal(g.attitude(0,1),2);
  assert.equal(new Game().attitude(0,1),1);
});
test('adding and removing countries preserves the saved active countries and supplies defaults for extra countries',()=>{
  const saved={initialSpawns:[0,99],initialRelations:[[0,2],[0,0]]};
  const more=new Game({w:10,h:10,ai:3,...saved});assert.equal(more.spawns[0],0);assert.equal(more.spawns[1],99);assert.equal(new Set(more.spawns).size,4);
  assert.equal(more.attitude(0,1),2);assert.equal(more.attitude(1,0),0);assert.equal(more.attitude(2,3),1);
  const fewer=new Game({w:10,h:10,ai:0,...saved});assert.deepEqual(fewer.spawns,[0]);assert.equal(fewer.players,1);
});
test('sea, duplicate, out-of-range and malformed capital settings are rejected',()=>{
  const terrainMap=Array(100).fill('land');terrainMap[0]='sea';
  for(const initialSpawns of [[0,1],[1,1],[-1,2],[100,2],[1.5,2],'invalid'])assert.throws(()=>new Game({w:10,h:10,terrainMap,initialSpawns}));
});
test('invalid and self-hostile diplomacy settings are rejected',()=>{
  for(const initialRelations of [[[0,3],[1,0]],[[2,1],[1,0]],[[0,'敌对'],[1,0]],[null],Array(2),'invalid'])assert.throws(()=>new Game({initialRelations}));
});
test('64-country presets support edge capitals, a full relation matrix and both boundary modes',()=>{
  const initialSpawns=Array.from({length:64},(_,id)=>id),initialRelations=Array.from({length:64},(_,from)=>Array.from({length:64},(_,to)=>from===to?0:2));
  for(const worldMode of ['flat','earth']){
    const g=new Game({w:10,h:10,humans:0,ai:64,worldMode,terrainMap:Array(100).fill('land'),initialSpawns,initialRelations});
    assert.deepEqual(g.spawns,initialSpawns);assert.equal(g.attitude(0,63),2);assert.equal(g.attitude(63,0),2);assert.ok(g.stats().every(s=>s.army===20));
  }
});
test('old terrain-only maps keep automatic neutral starts and configured hostile AI can act immediately',()=>{
  const old=new Game({w:10,h:10,terrainMap:Array(100).fill('land')});assert.equal(old.attitude(0,1),1);assert.equal(new Set(old.spawns).size,2);
  const g=new Game({w:10,h:10,humans:0,ai:2,terrainMap:Array(100).fill('land'),initialSpawns:[11,12],initialRelations:[[0,2],[1,0]]});
  g.running=true;g.rng=()=>.5;g.cells[11].army=100;g.cells[12].army=1;
  const action=g.aiMove(0);assert.equal(action.toId,12);assert.equal(action.captured,true);
});
