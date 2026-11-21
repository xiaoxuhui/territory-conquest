import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,columnLabel} from '../dist/engine.js';
test('10x10, 30x30 and 100x100 maps give eight factions equal one-tile starts and legal turns',()=>{
  for(const size of [10,30,100]){
    const g=new Game({w:size,h:size,humans:1,ai:7});g.running=true;
    assert.equal(g.cells.length,size*size);assert.equal(new Set(g.spawns).size,8);assert.ok(g.stats().every(s=>s.land===1&&s.army===20));
    assert.equal(g.playTurn(size+1,size+2,.5).ok,true);assert.equal(g.turn,1);assert.equal(g.cells[size+2].owner,0);
    assert.equal(g.neighbors(size-1).includes(size),false);assert.ok(g.cells.every(c=>Number.isFinite(c.army)&&c.army>=0));
  }
});
test('large map columns continue past Z through AA and CV without punctuation',()=>{
  for(const [index,label] of [[0,'A'],[25,'Z'],[26,'AA'],[29,'AD'],[51,'AZ'],[52,'BA'],[99,'CV']])assert.equal(columnLabel(index),label);
  const g=new Game({w:100,h:100,ai:0});g.running=true;Object.assign(g.cells[9898],{owner:0,army:20});g.attack(9898,9899,0,1);
  g.constructCapital(9899,0);assert.match(g.events[0].text,/CV99/);
});
