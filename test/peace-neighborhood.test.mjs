import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,RELATION_LEVELS,combinedDiplomacyChance,DIPLOMACY_IMPROVE_CHANCE,DIPLOMACY_WORSEN_CHANCE} from '../dist/engine.js';
function board(options={}){const g=new Game({w:6,h:4,humans:1,ai:1,...options});g.cells.forEach(c=>Object.assign(c,{owner:-1,army:0,capital:-1}));for(const [owner,id] of [0,23,5,18].slice(0,g.players).entries())Object.assign(g.cells[id],{owner,army:20});g.running=true;g.turn=1;g.aiMove=()=>null;roll(g,.99,.99);return g;}
function roll(g,up,down){let draws=0;g.rng=()=>[up,down][draws++%2];return ()=>draws;}
function close(a,b){assert.ok(Math.abs(a-b)<1e-12);}

function square(){const g=board({ai:3});g.cells.forEach(c=>c.owner=-1);for(const [owner,id] of [0,1,6,7].entries())Object.assign(g.cells[id],{owner,army:20});return g;}
function connect(g,a,b,attitude){g.relations[a][b]=attitude;g.relations[b][a]=attitude;}
test('one-percent bonuses combine by probability union rather than adding percentage points',()=>{
 for(const [level,p] of [[0,.01],[1,.0199],[2,.029701],[3,.03940399]])close(combinedDiplomacyChance(level),p);assert.notEqual(combinedDiplomacyChance(1),.02);assert.equal(combinedDiplomacyChance(1e6),1);
});
test('one mutually peaceful neighborhood contributes once for the whole game, never once per round',()=>{
 const g=square();connect(g,0,1,0);connect(g,0,2,0);g.resolveNeighborhoodInfluence();assert.deepEqual(g.lastDiplomacyInfluence.peaceful,[0]);assert.equal(g.globalPeaceLevel,1);close(g.globalDiplomacyChances().up,.0199);close(g.globalDiplomacyChances().down,.01);
 g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,1);for(let i=0;i<100;i++){g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,1);assert.deepEqual(g.lastDiplomacyInfluence.peaceful,[]);}close(g.globalDiplomacyChances().up,.0199);assert.equal(g.factions[0].peaceLevel,1);assert.equal(g.isPersistentRelation(0,1),false);
});
test('one mutually hostile neighborhood adds a global downward bonus only once for the whole game',()=>{
 const g=square();connect(g,0,1,2);connect(g,0,2,2);g.resolveNeighborhoodInfluence();assert.deepEqual(g.lastDiplomacyInfluence.hostile,[0]);close(g.globalDiplomacyChances().down,.0199);close(g.globalDiplomacyChances().up,.01);
 for(let i=0;i<100;i++){g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalHostilityLevel,1);assert.deepEqual(g.lastDiplomacyInfluence.hostile,[]);}assert.equal(g.factions[0].hostilityLevel,1);
});

test('a single friendly or hostile neighbor never qualifies a country when another neighbor fails either direction',()=>{
 for(const attitude of [0,2])for(const direction of ['out','in']){
  const g=square();connect(g,0,1,attitude);connect(g,0,2,attitude);
  g.relations[direction==='out'?0:2][direction==='out'?2:0]=1;
  g.resolveNeighborhoodInfluence();assert.equal(g.factions[0].peaceNeighborhood,false);assert.equal(g.factions[0].hostileNeighborhood,false);assert.equal(g.factions[0].peaceLevel,undefined);assert.equal(g.factions[0].hostilityLevel,undefined);
 }
});

test('losing and regaining conditions or all contact never grants the same country another bonus',()=>{
 for(const attitude of [0,2]){
  const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});connect(g,0,1,attitude);g.resolveNeighborhoodInfluence();
  const key=attitude===0?'globalPeaceLevel':'globalHostilityLevel';assert.equal(g[key],2);
  connect(g,0,1,1);g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g[key],2);
  connect(g,0,1,attitude);g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g[key],2);
  g.cells[1].owner=-1;Object.assign(g.cells[23],{owner:1,army:20});g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g[key],2);
  g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g[key],2);
 }
});

test('each country can contribute to peace and hostility once independently, while both earned bonuses remain',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});
 for(const attitude of [0,2,0,2,0,2]){connect(g,0,1,attitude);g.resolveNeighborhoodInfluence();g.turn++;}
 assert.equal(g.globalPeaceLevel,2);assert.equal(g.globalHostilityLevel,2);close(g.globalDiplomacyChances().up,.029701);close(g.globalDiplomacyChances().down,.029701);
 for(const country of g.factions){assert.equal(country.peaceLevel,1);assert.equal(country.hostilityLevel,1);}
});

test('elimination retains the earned bonus and newly founded countries have their own one-time contribution',()=>{
 const g=square();connect(g,0,1,0);connect(g,0,2,0);g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,1);
 Object.assign(g.cells[7],{homeland:3,unrestEvents:Array.from({length:4},()=>({turn:1,kind:'capture',actor:3,victim:3}))});
 const [birth]=g.resolveSecessions();assert.equal(birth.owner,4);assert.equal(g.factions[4].peaceLevel,undefined);
 for(const id of [1,2]){g.setRelationLevel(4,id,1);g.setRelationLevel(id,4,1);}g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,4);assert.equal(g.factions[4].peaceLevel,1);assert.equal(g.factions[0].peaceLevel,1);
 g.cells[7].owner=1;g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,4);assert.equal(g.factions[4].peaceLevel,1);
 g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,4);
});
test('two qualifying countries each contribute a separate independent one-percent bonus',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});connect(g,0,1,0);g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,2);close(g.globalDiplomacyChances().up,.029701);assert.equal(g.factions[0].peaceLevel,1);assert.equal(g.factions[1].peaceLevel,1);
});
test('one-way peace or hostility does not meet the mutual-neighbor condition',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});g.relations[0][1]=0;g.relations[1][0]=2;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,0);assert.equal(g.globalHostilityLevel,0);assert.equal(g.isPersistentRelation(0,1),false);
});
test('isolated and eliminated countries contribute nothing, while opposite earth edges count as neighbors',()=>{
 const isolated=board({ai:2});isolated.resolveNeighborhoodInfluence();assert.equal(isolated.globalPeaceLevel,0);assert.equal(isolated.globalHostilityLevel,0);
 for(const worldMode of ['flat','earth']){const g=board({worldMode});g.cells[23].owner=-1;Object.assign(g.cells[5],{owner:1,army:20});connect(g,0,1,0);g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,worldMode==='earth'?2:0);}
});
test('influence uses the pre-event snapshot and is not automatically granted by a new global improvement',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});roll(g,0,.99);g.resolveDiplomacy();assert.equal(g.globalPeaceLevel,0);assert.equal(g.relationLevel(0,1),1);g.turn++;roll(g,.99,.99);g.resolveDiplomacy();assert.equal(g.globalPeaceLevel,2);
});
test('loss of qualifying neighbors stops new bonuses but retains prior global accumulation',()=>{
 const g=board();g.cells[23].owner=-1;Object.assign(g.cells[1],{owner:1,army:20});connect(g,0,1,0);g.resolveNeighborhoodInfluence();g.relations[0][1]=1;g.turn++;g.resolveNeighborhoodInfluence();assert.equal(g.globalPeaceLevel,2);assert.equal(g.factions[0].peaceNeighborhood,false);close(g.globalDiplomacyChances().up,.029701);
});
test('pause, thinking and repeated resolution do not add bonuses or consume global rolls',()=>{
 const g=square();connect(g,0,1,0);connect(g,0,2,0);const draws=roll(g,.99,.99);g.paused=true;g.resolveDiplomacy();assert.equal(draws(),0);assert.equal(g.globalPeaceLevel,0);g.paused=false;g.resolveDiplomacy();for(let i=0;i<6;i++){g.resolveDiplomacy();g.resolveNeighborhoodInfluence();g.update(.1);}assert.equal(g.globalPeaceLevel,1);assert.equal(draws(),2);
});
test('global probability and country contribution state do not leak into a fresh game',()=>{
 const g=square();connect(g,0,1,0);connect(g,0,2,0);g.resolveNeighborhoodInfluence();const fresh=new Game();assert.equal(fresh.globalPeaceLevel,0);assert.equal(fresh.factions[0].peaceLevel,undefined);
});
