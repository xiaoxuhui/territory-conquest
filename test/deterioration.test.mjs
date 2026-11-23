import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,RELATION_LEVELS,combinedDiplomacyChance,DIPLOMACY_IMPROVE_CHANCE,DIPLOMACY_WORSEN_CHANCE} from '../dist/engine.js';
function board(options={}){const g=new Game({w:6,h:4,humans:1,ai:1,...options});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));for(const [owner,id] of [0,1,5,18].slice(0,g.players).entries())Object.assign(g.cells[id],{owner,army:20});if(g.players>2)for(const id of [6,7])Object.assign(g.cells[id],{owner:2,army:20});g.running=true;g.turn=1;g.aiMove=()=>null;roll(g,.99,.99);return g;}
function roll(g,up,down){let draws=0;g.rng=()=>[up,down][draws++%2];return ()=>draws;}
function close(a,b){assert.ok(Math.abs(a-b)<1e-12);}

test('global downward movement has a one-percent base and shifts every directed rank by exactly one',()=>{
 assert.equal(DIPLOMACY_WORSEN_CHANCE,.01);const g=board({ai:2}),pairs=[[0,1],[0,2],[1,0],[1,2],[2,0],[2,1]],levels=[0,1,2,3,4,2];
 pairs.forEach(([a,b],i)=>g.setRelationLevel(a,b,levels[i]));roll(g,.99,0);const result=g.resolveDiplomacy();assert.equal(result[0].kind,'global-down');pairs.forEach(([a,b],i)=>assert.equal(g.relationLevel(a,b),Math.min(4,levels[i]+1)));
});
test('persistent peace falls to ordinary peace and can then change normally',()=>{
 const g=board();g.setRelationLevel(0,1,0);roll(g,.99,0);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),1);assert.equal(g.isPersistentRelation(0,1),false);
 g.turn++;g.resolveDiplomacy();assert.equal(g.attitude(0,1),1);assert.equal(g.relationLevel(0,1),2);
});
test('ordinary hostility falls to persistent hostility and the bottom rank is capped',()=>{
 const g=board();g.setRelationLevel(0,1,3);g.setRelationLevel(1,0,4);roll(g,.99,0);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),4);assert.equal(g.relationLevel(1,0),4);assert.equal(g.isPersistentHostile(0,1),true);
});
test('global worsening keeps the exact one-percent boundary and runs only once per round',()=>{
 for(const [value,rank] of [[.009999,3],[.01,2]]){const g=board(),draws=roll(g,.99,value);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),rank);for(let i=0;i<5;i++)g.resolveDiplomacy();assert.equal(draws(),2);}
});
