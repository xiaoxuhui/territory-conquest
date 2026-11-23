import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,RELATION_LEVELS,combinedDiplomacyChance,DIPLOMACY_IMPROVE_CHANCE,DIPLOMACY_WORSEN_CHANCE} from '../dist/engine.js';
function board(options={}){const g=new Game({w:6,h:4,humans:1,ai:1,...options});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));for(const [owner,id] of [0,1,5,18].slice(0,g.players).entries())Object.assign(g.cells[id],{owner,army:20});if(g.players>2)for(const id of [6,7])Object.assign(g.cells[id],{owner:2,army:20});g.running=true;g.turn=1;g.aiMove=()=>null;roll(g,.99,.99);return g;}
function roll(g,up,down){let draws=0;g.rng=()=>[up,down][draws++%2];return ()=>draws;}
function close(a,b){assert.ok(Math.abs(a-b)<1e-12);}

test('global improvement releases persistent hostility as ordinary hostility for both directions',()=>{
 const g=board();g.setRelationLevel(0,1,4);g.setRelationLevel(1,0,4);roll(g,0,.99);g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),3);assert.equal(g.relationLevel(1,0),3);assert.equal(g.isPersistentRelation(0,1),false);
});
test('subsequent global upward events move ordinary hostility through neutral, peace and persistent peace',()=>{
 const g=board();g.setRelationLevel(0,1,4);roll(g,0,.99);for(const rank of [3,2,1,0]){g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),rank);g.turn++;}
 assert.equal(g.isPeaceTreaty(0,1),true);
});
test('simultaneous global hits cancel without stripping either persistent status',()=>{
 const g=board();g.setRelationLevel(0,1,4);g.setRelationLevel(1,0,0);const before=JSON.stringify(g.cells);roll(g,0,0);const result=g.resolveDiplomacy();assert.equal(result[0].kind,'global-cancel');assert.equal(g.relationLevel(0,1),4);assert.equal(g.relationLevel(1,0),0);assert.equal(JSON.stringify(g.cells),before);
});
test('global changes invalidate plans while founding records persist after hostility unlocks',()=>{
 const g=board();g.factions[0].rebel=true;g.factions[0].participants=[1];g.setRelationLevel(0,1,4);g.aiPlans[0]={target:1};g.aiPlans[1]={target:0};roll(g,0,.99);g.resolveDiplomacy();assert.equal(g.aiPlans[0],null);assert.equal(g.aiPlans[1],null);g.turn++;g.resolveDiplomacy();assert.equal(g.relationLevel(0,1),2);assert.deepEqual(g.factions[0].participants,[1]);
});
test('ordinary reactions do not release persistent states ahead of a global change',()=>{
 const g=board();Object.assign(g.cells[1],{owner:1,army:20});g.setRelationLevel(0,1,0);g.reactToAttack(1,0);assert.equal(g.relationLevel(0,1),0);g.setRelationLevel(0,1,4);g.reactToAttack(1,0);assert.equal(g.relationLevel(0,1),4);
});
