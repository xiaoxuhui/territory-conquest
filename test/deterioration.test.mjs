import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,DIPLOMACY_WORSEN_CHANCE} from '../dist/engine.js';
function touching(){const g=new Game();g.running=true;g.turn=1;Object.assign(g.cells[12],{owner:1,army:10});return g;}
test('one-percent deterioration lowers peace to neutral and neutral to hostile in only the selected direction',()=>{
  assert.equal(DIPLOMACY_WORSEN_CHANCE,.01);
  for(const [before,after] of [[0,1],[1,2],[2,2]])for(const [roll,from,to] of [[.015,0,1],[.025,1,0]]){
    const g=touching();g.relations[from][to]=before;g.relations[to][from]=0;g.rng=()=>roll;
    const changes=g.resolveDiplomacy();assert.equal(g.attitude(from,to),after);assert.equal(g.attitude(to,from),0);assert.equal(changes.length,before===2?0:1);
    if(changes.length){assert.equal(changes[0].kind,'worsen');assert.equal(changes[0].from,from);assert.match(g.events[0].text,/关系恶化/);}
  }
});
test('exact boundaries give improvement and each directed deterioration their own disjoint one percent',()=>{
  for(const [roll,ab,ba] of [[0,0,0],[.009999,0,0],[.01,2,1],[.019999,2,1],[.02,1,2],[.029999,1,2],[.03,1,1],[.999,1,1]]){
    const g=touching();g.rng=()=>roll;const changes=g.resolveDiplomacy();assert.equal(g.attitude(0,1),ab);assert.equal(g.attitude(1,0),ba);assert.ok(changes.length<=1);
  }
});
test('peaceful pairs can deteriorate, hostility is capped, and one round cannot apply twice',()=>{
  const g=touching();g.relations[0][1]=0;g.relations[1][0]=0;g.rng=()=>.015;
  g.resolveDiplomacy();assert.equal(g.attitude(0,1),1);assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.attitude(0,1),1);
  g.turn++;g.resolveDiplomacy();assert.equal(g.attitude(0,1),2);g.turn++;assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.attitude(0,1),2);
});
test('distant asymmetric relations freeze for any improvement or worsening outcome',()=>{
  for(const roll of [0,.015,.025]){
    const g=new Game();g.running=true;g.turn=1;g.relations[0][1]=0;g.relations[1][0]=2;let draws=0;g.rng=()=>{draws++;return roll;};
    for(let i=0;i<50;i++){g.resolveDiplomacy();g.turn++;}assert.equal(g.attitude(0,1),0);assert.equal(g.attitude(1,0),2);assert.equal(draws,0);
  }
});
test('paused and completed games do not deteriorate and contact resumes the original attitude',()=>{
  const g=touching();g.relations[0][1]=0;g.rng=()=>.015;g.paused=true;assert.deepEqual(g.resolveDiplomacy(),[]);assert.equal(g.attitude(0,1),0);
  g.paused=false;g.running=false;assert.deepEqual(g.resolveDiplomacy(),[]);g.running=true;g.resolveDiplomacy();assert.equal(g.attitude(0,1),1);
});
