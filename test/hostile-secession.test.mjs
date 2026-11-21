import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
function running(options={}){const g=new Game(options);g.running=true;g.aiMove=()=>null;g.resolveDiplomacy=()=>[];return g;}
test('repeated hostile captures cause no unrest or secession for either player or computer',()=>{
  for(const humans of [0,1,2]){
    const g=running({humans,ai:2-humans});Object.assign(g.cells[12],{owner:0,army:1});g.relations[0][1]=2;g.relations[1][0]=2;
    for(let i=0;i<12;i++){
      const owner=1-g.cells[12].owner,source=owner===0?11:13;Object.assign(g.cells[source],{owner,army:100});g.cells[12].army=1;
      const result=g.attack(source,12,owner,1);assert.equal(result.captured,true);assert.equal(result.hostileAttack,true);assert.equal(g.unrest(g.cells[12]),0);
      g.waitTurn();if(humans===2)g.waitTurn();assert.equal(g.secessions,0);assert.equal(g.players,2);
    }
  }
});
test('only the attacker outgoing attitude decides exemption, before the defender reacts',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1});g.relations[0][1]=1;g.relations[1][0]=1;
  const result=g.attack(11,12,0,1);assert.equal(result.captured,true);assert.equal(result.hostileAttack,false);assert.equal(g.attitude(1,0),2);assert.equal(g.unrest(g.cells[12]),1);
  Object.assign(g.cells[13],{owner:1,army:100});g.cells[12].army=1;
  const counter=g.attack(13,12,1,1);assert.equal(counter.hostileAttack,true);assert.equal(counter.captured,true);assert.equal(g.unrest(g.cells[12]),1);
});
test('hostile capture does not push three existing events over the split threshold',()=>{
  const g=running();Object.assign(g.cells[12],{owner:1,army:1,unrestEvents:Array.from({length:3},()=>({turn:0,kind:'capture',actor:1,victim:0}))});
  g.relations[0][1]=2;assert.equal(g.playTurn(11,12,1).ok,true);assert.equal(g.unrest(g.cells[12]),3);assert.equal(g.secessions,0);
});
test('repeated rear-area troop withdrawals during hostility do not cause secession',()=>{
  const g=running();g.relations[0][1]=2;g.relations[1][0]=2;Object.assign(g.cells[12],{owner:0,army:10});
  for(let i=0;i<20;i++)assert.equal(g.playTurn(11,12,1).ok,true);
  assert.equal(g.secessions,0);assert.equal(g.cells[11].owner,0);assert.equal(g.unrest(g.cells[11]),0);assert.equal(g.players,2);
});
test('new-country hostile offensives obey the same exemption',()=>{
  const g=running();g.cells[11].homeland=1;g.cells[11].unrestEvents=Array.from({length:4},()=>({turn:0,kind:'capture',actor:0,victim:1}));Object.assign(g.cells[12],{owner:0,army:1});g.resolveSecessions();
  g.cells[11].army=100;assert.equal(g.attitude(2,0),2);const result=g.attack(11,12,2,1);
  assert.equal(result.captured,true);assert.equal(result.hostileAttack,true);assert.equal(g.unrest(g.cells[12]),0);
});
