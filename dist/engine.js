export const FACTIONS = [
  {name:'青岚',color:'#51ddc0',rgb:'81,221,192',symbol:'◆'},
  {name:'赤焰',color:'#f7817d',rgb:'247,129,125',symbol:'▲'},
  {name:'金砂',color:'#eac477',rgb:'234,196,119',symbol:'●'},
  {name:'紫宸',color:'#ad9af1',rgb:'173,154,241',symbol:'✦'},
  {name:'苍蓝',color:'#79b3ef',rgb:'121,179,239',symbol:'■'},
  {name:'桃夭',color:'#e99ec9',rgb:'233,158,201',symbol:'♥'},
  {name:'橙光',color:'#eca269',rgb:'236,162,105',symbol:'⬟'},
  {name:'月白',color:'#c9d5de',rgb:'201,213,222',symbol:'✚'}
];
export const LEVELS = [
  {name:'初始之地',subtitle:'一场属于你的征途',w:10,h:8,ai:1},
  {name:'三方角逐',subtitle:'在交错的边界中突围',w:12,h:9,ai:2},
  {name:'四境纷争',subtitle:'步步为营，逐一击破',w:14,h:10,ai:3},
  {name:'群雄并起',subtitle:'守住后方，打开局面',w:16,h:11,ai:4},
  {name:'烽火大陆',subtitle:'五路强敌，寸土必争',w:18,h:12,ai:5},
  {name:'天下归一',subtitle:'征服最后一片疆土',w:20,h:13,ai:7}
];
export const UNREST_LIMIT=4,UNREST_WINDOW=8,SECESSION_GRACE=12;
function newCountry(id,number){
  const hue=(id*137.508)%360,s=.58,l=.65,a=s*Math.min(l,1-l);
  const rgb=[0,8,4].map(n=>{const k=(n+hue/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));});
  return {name:`新国${number}`,color:'#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join(''),rgb:rgb.join(','),symbol:'✧',rebel:true};
}
export function seededRandom(seed) { return () => { let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296; }; }
export class Game {
  constructor({w=10,h=8,humans=1,ai=1,difficulty='normal',seed=1,observerMode='continuous'}={}) {
    const players=humans+ai;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<4||h<4||!Number.isInteger(humans)||humans<0||!Number.isInteger(ai)||ai<0||players<1||players>8||players>(w-2)*(h-2)) throw new Error('人类与电脑合计需为 1–8 位，且地图必须能容纳所有玩家');
    this.w=w;this.h=h;this.humans=humans;this.ai=ai;this.players=players;this.currentHuman=humans?0:null;this.difficulty=difficulty;this.rng=seededRandom(seed);
    this.factions=FACTIONS.slice(0,players);this.secessions=0;
    this.cells=Array.from({length:w*h},(_,id)=>({id,owner:-1,army:0,capital:-1,unrestEvents:[],stableUntil:0}));this.capitalLost=Array(players).fill(false);
    this.time=0;this.turn=0;this.running=false;this.paused=false;this.winner=null;this.events=[];this.moves=0;this.captures=0;this.pendingTurn=null;this.roundState=null;this.automaticElapsed=0;this.setObserverMode(observerMode);
    const places=[this.w+1];
    while(places.length<players) {
      let best=-1,score=-1;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
        const id=y*w+x;if(places.includes(id))continue;
        const d=Math.min(...places.map(p=>Math.abs(p%w-x)+Math.abs(Math.floor(p/w)-y))) + this.rng()*0.25;
        if(d>score){score=d;best=id;}
      }
      places.push(best);
    }
    this.spawns=places;
    this.aiPlans=Array(players).fill(null);this.aiAnchors=[...places];
    places.forEach((id,owner)=>Object.assign(this.cells[id],{owner,army:20,capital:owner}));
    this.addEvent('所有阵营已就位，从一格开始。','system');
  }
  neighbors(id){const x=id%this.w,y=Math.floor(id/this.w);return [x>0?id-1:-1,x<this.w-1?id+1:-1,y>0?id-this.w:-1,y<this.h-1?id+this.w:-1].filter(i=>i>=0);}
  isHuman(owner){return Number.isInteger(owner)&&owner>=0&&owner<this.humans;}
  isCapital(cell){return !!cell&&cell.owner>=0&&cell.capital===cell.owner;}
  capitals(owner){return this.cells.filter(c=>c.owner===owner&&this.isCapital(c));}
  aliveHumans(){return Array.from({length:this.humans},(_,id)=>id).filter(id=>this.cells.some(c=>c.owner===id));}
  get automatic(){return this.aliveHumans().length===0;}
  get continuous(){return this.automatic&&this.observerMode==='continuous';}
  setObserverMode(mode){
    if(!['step','continuous'].includes(mode))throw new Error('请选择单步或连续观战模式');
    this.observerMode=mode;this.automaticElapsed=0;
  }
  stats(){return this.factions.map((f,id)=>{const cells=this.cells.filter(c=>c.owner===id);return {...f,id,human:this.isHuman(id),land:cells.length,army:cells.reduce((s,c)=>s+c.army,0)};});}
  unrest(cell){return cell&&this.turn>=cell.stableUntil?cell.unrestEvents.filter(e=>this.turn-e.turn<UNREST_WINDOW).length:0;}
  recordUnrest(cell,kind){
    if(this.turn<cell.stableUntil)return;
    cell.unrestEvents=cell.unrestEvents.filter(e=>this.turn-e.turn<UNREST_WINDOW);
    const turn=this.roundState?this.turn:this.turn+1;
    if(kind==='drain'&&cell.unrestEvents.some(e=>e.kind===kind&&e.turn===turn))return;
    cell.unrestEvents.push({turn,kind});
  }
  resolveSecessions(){
    if(!this.running||this.paused||this.winner!==null)return [];
    const countries=[];
    for(const center of this.cells){
      if(center.owner<0||this.unrest(center)<UNREST_LIMIT)continue;
      const oldOwner=center.owner,region=[center];
      // Only neighboring restless land joins; calm or foreign tiles stay put.
      for(let q=0;q<region.length&&region.length<3;q++)for(const id of this.neighbors(region[q].id)){
        const c=this.cells[id];if(region.length<3&&c.owner===oldOwner&&this.unrest(c)>=2&&!region.includes(c))region.push(c);
      }
      const owner=this.players++;this.ai++;this.factions.push(newCountry(owner,++this.secessions));
      this.capitalLost.push(false);this.aiPlans.push(null);this.aiAnchors.push(center.id);this.spawns.push(center.id);
      for(const c of region){c.owner=owner;c.capital=-1;c.unrestEvents=[];c.stableUntil=this.turn+SECESSION_GRACE;}
      center.capital=owner;this.capitalLost[oldOwner]=this.capitals(oldOwner).length===0;this.aiPlans[oldOwner]=null;
      const location=`${String.fromCharCode(65+center.id%this.w)}${Math.floor(center.id/this.w)+1}`;
      this.addEvent(`${location}一带因反复易手或抽调驻军发生分裂，脱离${this.factions[oldOwner].name}，成立${this.factions[owner].name}（${region.length} 格，电脑控制）`,'secession',owner);
      if(!this.cells.some(c=>c.owner===oldOwner))this.addEvent(`${this.factions[oldOwner].name}失去全部领土，已出局`,'eliminated',oldOwner);
      countries.push({owner,oldOwner,capital:center.id,cells:region.map(c=>c.id)});
    }
    return countries;
  }
  addEvent(text,kind='system',owner=-1){this.events.unshift({text,kind,owner,time:this.time});this.events=this.events.slice(0,30);}
  sent(from,ratio=0.5){return Math.max(0,Math.min(from.army-1,Math.floor(from.army*Math.min(1,Math.max(0,ratio)))));}
  attack(fromId,toId,owner,ratio=0.5){
    if(!this.running||this.paused||this.winner!==null)return {ok:false,reason:'战斗尚未进行'};
    const from=this.cells[fromId],to=this.cells[toId];
    if(!from||!to||from.owner!==owner||!this.neighbors(fromId).includes(toId))return {ok:false,reason:'只能向上下左右相邻的领土出兵'};
    const amount=this.sent(from,ratio);
    if(amount<1)return {ok:false,reason:'兵力不足，至少留守 1 名士兵'};
    const oldOwner=to.owner,fromBefore=from.army,toBefore=to.army;from.army-=amount;
    let captured=false;
    if(to.owner===owner)to.army+=amount;
    else if(amount>to.army){to.army=amount-to.army;to.owner=owner;captured=true;}
    else to.army-=amount;
    if(captured&&oldOwner>=0&&to.capital===oldOwner){
      to.capital=-1;this.capitalLost[oldOwner]=this.capitals(oldOwner).length===0;
      this.addEvent(`${this.factions[oldOwner].name}首都被攻占，原首都失效`,'capital-lost',oldOwner);
    }
    const kind=oldOwner===owner?'reinforce':'attack';
    if(captured&&oldOwner>=0)this.recordUnrest(to,'capture');
    if(kind==='reinforce'&&amount>=3&&amount/fromBefore>=.75)this.recordUnrest(from,'drain');
    const location=`${String.fromCharCode(65+toId%this.w)}${Math.floor(toId/this.w)+1}`;
    if(kind==='reinforce')this.addEvent(`${this.factions[owner].name}增援 ${location}：${toBefore} + ${amount} = ${to.army}`,'reinforce',owner);
    else if(oldOwner>=0)this.addEvent(`${this.factions[owner].name}出兵 ${amount} 进攻 ${location}：守军 ${toBefore} − ${Math.min(amount,toBefore)} = ${Math.max(0,toBefore-amount)}`,'battle',owner);
    if(this.isHuman(owner)){this.moves++;if(captured)this.captures++;}
    if(captured&&oldOwner>=0){
      this.addEvent(`${this.factions[owner].name}攻占了${this.factions[oldOwner].name}的领土`,'battle',owner);
      if(!this.cells.some(c=>c.owner===oldOwner))this.addEvent(`${this.factions[oldOwner].name}失去全部领土，已出局`,'eliminated',oldOwner);
    }
    this.checkWinner();
    return {ok:true,amount,captured,oldOwner,owner,toId,fromId,kind,fromBefore,fromAfter:from.army,toBefore,toAfter:to.army};
  }
  checkWinner(){const owner=this.cells[0].owner;if(owner>=0&&this.cells.every(c=>c.owner===owner)){this.winner=owner;this.running=false;this.addEvent(`${this.factions[owner].name}占领全图，获得胜利！`,'victory',owner);}}
  get resolving(){return this.pendingTurn!==null;}
  constructCapital(toId,owner){
    if(!this.running||this.paused||this.winner!==null)return {ok:false,reason:'当前不能建设首都'};
    const target=this.cells[toId];
    if(!target||target.owner!==owner)return {ok:false,reason:'首都只能建设在己方领土'};
    if(this.isCapital(target))return {ok:false,reason:'这里已经是首都，请选择己方普通领土'};
    if(this.capitals(owner).length>=2)return {ok:false,reason:'已有两座首都，请使用迁都'};
    this.capitalLost[owner]=false;target.capital=owner;this.aiPlans[owner]=null;
    const location=`${String.fromCharCode(65+toId%this.w)}${Math.floor(toId/this.w)+1}`;
    this.addEvent(`${this.factions[owner].name}在 ${location} 建设了新首都`,'capital-build',owner);
    return {ok:true,kind:'capital-build',owner,oldOwner:owner,fromId:-1,toId,amount:0,captured:false};
  }
  buildCapital(toId,options={}){
    if(this.resolving)return {ok:false,reason:'当前回合正在结算'};
    if(this.currentHuman===null)return {ok:false,reason:'当前没有轮到人类玩家'};
    const result=this.constructCapital(toId,this.currentHuman);
    if(result.ok)result.actions=this.finishTurn([{...result}],options);
    return result;
  }
  relocateCapital(toId,owner,sourceId){
    if(!this.running||this.paused||this.winner!==null)return {ok:false,reason:'当前不能迁都'};
    if(this.capitalLost[owner])return {ok:false,reason:'当前没有首都，请先建设新首都'};
    const target=this.cells[toId];
    if(!target||target.owner!==owner)return {ok:false,reason:'首都只能迁到己方领土'};
    if(this.isCapital(target))return {ok:false,reason:'这里已经是你的首都'};
    const previous=sourceId===undefined?this.capitals(owner)[0]:this.cells[sourceId];
    if(!previous||previous.owner!==owner||!this.isCapital(previous))return {ok:false,reason:'请选择要迁移的己方首都'};
    const fromId=previous.id;
    previous.capital=-1;target.capital=owner;
    this.aiPlans[owner]=null;
    const location=`${String.fromCharCode(65+toId%this.w)}${Math.floor(toId/this.w)+1}`;
    this.addEvent(`${this.factions[owner].name}迁都至 ${location}`,'capital',owner);
    return {ok:true,kind:'capital',owner,oldOwner:owner,fromId,toId,amount:0,captured:false};
  }
  moveCapital(toId,options={}){
    if(this.resolving)return {ok:false,reason:'当前回合正在结算'};
    if(this.currentHuman===null)return {ok:false,reason:'当前没有轮到人类玩家'};
    const result=this.relocateCapital(toId,this.currentHuman,options.fromId);
    if(result.ok)result.actions=this.finishTurn([{...result}],options);
    return result;
  }
  playTurn(fromId,toId,ratio=0.5,options={}){
    if(this.resolving)return {ok:false,reason:'当前回合正在结算'};
    if(this.currentHuman===null)return {ok:false,reason:'当前没有轮到人类玩家'};
    const result=this.attack(fromId,toId,this.currentHuman,ratio);
    if(result.ok)result.actions=this.finishTurn([{...result}],options);
    return result;
  }
  waitTurn(options={}){
    if(!this.running||this.paused||this.winner!==null)return {ok:false,reason:'战斗尚未进行'};
    if(this.resolving)return {ok:false,reason:'当前回合正在结算'};
    return {ok:true,actions:this.finishTurn([],options)};
  }
  finishTurn(actions,{defer=false}={}){
    if(!this.roundState){this.turn++;this.roundState={actions:[],contested:new Set(),actedHumans:new Set()};}
    const round=this.roundState;
    round.actions.push(...actions);actions.forEach(a=>this.recordCombat(a));
    if(this.currentHuman!==null)round.actedHumans.add(this.currentHuman);
    if(this.winner!==null)return actions;
    // Each local human gets one action before any computer or growth phase.
    const nextHuman=this.aliveHumans().find(id=>!round.actedHumans.has(id));
    if(nextHuman!==undefined){this.currentHuman=nextHuman;return actions;}
    this.currentHuman=null;
    this.pendingTurn={actions:round.actions,index:0,contested:round.contested};
    if(!defer)while(this.resolving)this.stepTurn();
    return this.pendingTurn?actions:round.actions;
  }
  recordCombat(action){
    if(action?.ok&&action.oldOwner>=0&&action.oldOwner!==action.owner){
      this.roundState.contested.add(action.fromId);this.roundState.contested.add(action.toId);
    }
  }
  stepTurn(){
    const pending=this.pendingTurn;
    if(!pending||this.paused)return null;
    if(this.winner!==null){this.pendingTurn=null;return null;}
    if(pending.index<this.ai){
      // Rotate initiative; each computer still receives just one action.
      const owner=this.humans+(this.turn-1+pending.index++)%this.ai;
      const action=this.aiMove(owner);
      if(action?.ok){pending.actions.push(action);this.recordCombat(action);}
      if(this.winner!==null)this.pendingTurn=null;
      return {kind:'action',owner,action};
    }
    const changes=[];
    this.cells.forEach(c=>{
      // Fighting suppresses passive growth for both sides, including capitals.
      // Friendly reinforcements remain valid and are separate, recorded actions.
      if(c.owner>=0&&c.army<999&&!pending.contested.has(c.id)){
        const before=c.army;c.army=Math.min(999,c.army+(this.isCapital(c)?3:1));
        changes.push({id:c.id,owner:c.owner,before,after:c.army,amount:c.army-before});
      }
    });
    const secessions=this.resolveSecessions();
    this.pendingTurn=null;this.roundState=null;this.currentHuman=this.aliveHumans()[0]??null;
    this.checkWinner();return {kind:'growth',changes,secessions};
  }
  update(dt){
    if(!this.running||this.paused||this.winner!==null)return [];
    dt=Math.max(0,Math.min(dt,0.25));this.time+=dt;
    // Human-controlled games, including zero-computer games, remain manual.
    // An observer-only game schedules its own rounds and uses the same staged
    // resolution as a human turn, preserving action counts and combat rules.
    if(!this.continuous){this.automaticElapsed=0;return [];}
    if(this.resolving)return [];
    this.automaticElapsed+=dt;
    if(this.automaticElapsed>=0.8){this.automaticElapsed=0;this.waitTurn({defer:true});}
    return [];
  }
  aiMove(owner){
    if(!this.running||this.paused||this.winner!==null)return null;
    const owned=this.cells.filter(c=>c.owner===owner);if(!owned.length)return null;
    if(this.capitalLost[owner]){
      // Rebuilding is this round's action, not a passive restoration on recapture.
      const site=[...owned].sort((a,b)=>(Math.min(b.army,999)-this.aiThreat(b.id,owner)*4)-(Math.min(a.army,999)-this.aiThreat(a.id,owner)*4))[0];
      return this.constructCapital(site.id,owner);
    }
    const counts=Array(this.players).fill(0);this.cells.forEach(c=>{if(c.owner>=0)counts[c.owner]++;});
    const fronts=[];
    for(const c of owned){
      for(const n of this.neighbors(c.id)){
        if(this.cells[n].owner!==owner)fronts.push({rally:c.id,target:n});
      }
    }
    if(!fronts.length)return null;
    const neutral=fronts.filter(f=>this.cells[f.target].owner===-1);
    if(!neutral.length&&this.capitals(owner).length===1&&owned.length>=4){
      const site=owned.filter(c=>!this.isCapital(c)&&!this.neighbors(c.id).some(id=>this.cells[id].owner>=0&&this.cells[id].owner!==owner))
        .sort((a,b)=>b.army-a.army)[0];
      if(site)return this.constructCapital(site.id,owner);
    }
    let plan=this.aiPlans[owner];
    const invalid=!plan||this.cells[plan.rally].owner!==owner||this.cells[plan.target].owner===owner;
    const expansionAvailable=neutral.length&&(!plan||this.cells[plan.target].owner!==-1);
    if(invalid||expansionAvailable||plan.age>=Math.max(128,this.cells.length)){
      const candidates=neutral.length?neutral:fronts;
      let best=null,bestScore=-Infinity;
      for(const f of candidates){
        const from=this.cells[f.rally],to=this.cells[f.target];
        const adjacent=this.neighbors(to.id),threat=this.aiThreat(to.id,owner);
        let score;
        if(to.owner===-1){
          // Complete reachable expansion, including the final isolated blank.
          score=(from.army>=2?100:0)+adjacent.filter(n=>this.cells[n].owner===-1).length*3+Math.min(from.army,30)*.1;
        }else{
          const required=to.army+threat+2;
          score=100+(from.army-1>=required?80:0)+(from.id===this.aiAnchors[owner]?60:0)
            +30/Math.max(1,counts[to.owner])+(this.isCapital(to)?8:0)
            -Math.log1p(required)*8+Math.log1p(from.army)*6;
        }
        score+=this.rng()*(this.difficulty==='easy'?16:this.difficulty==='hard'?1:4);
        if(score>bestScore){bestScore=score;best=f;}
      }
      plan={...best,age:0};this.aiPlans[owner]=plan;
    }
    plan.age++;
    // Keep the target, but use a substantially stronger adjacent launch tile.
    for(const n of this.neighbors(plan.target))if(this.cells[n].owner===owner&&this.cells[n].army>this.cells[plan.rally].army*1.5+4)plan.rally=n;
    const from=this.cells[plan.rally],to=this.cells[plan.target];
    const safety=this.difficulty==='easy'?.6:this.difficulty==='hard'?1.1:1;
    const reserve=to.owner===-1?0:Math.max(1,Math.ceil(this.aiThreat(to.id,owner)*safety));
    const required=to.army+reserve+1;
    let ratio=null;
    if(to.owner===-1&&this.sent(from,.5)>0)ratio=.5;
    else if(this.sent(from,.5)>=required)ratio=.5;
    else if(this.sent(from,1)>=required)ratio=1;
    if(ratio!==null){
      const result=this.attack(from.id,to.id,owner,ratio);
      if(result.ok&&result.captured){this.aiAnchors[owner]=to.id;this.aiPlans[owner]=null;}
      return result;
    }
    // Rally on one front. Every transfer strictly reduces distance to that
    // rally, so interior armies cannot circulate between unrelated borders.
    const dist=new Int16Array(this.cells.length).fill(-1),queue=[plan.rally];dist[plan.rally]=0;
    for(let q=0;q<queue.length;q++)for(const n of this.neighbors(queue[q]))if(this.cells[n].owner===owner&&dist[n]===-1){dist[n]=dist[queue[q]]+1;queue.push(n);}
    let transfer=null,transferScore=-Infinity;
    for(const c of owned){
      if(c.id===plan.rally||c.army<4||dist[c.id]<1)continue;
      const next=this.neighbors(c.id).filter(n=>this.cells[n].owner===owner&&dist[n]===dist[c.id]-1)
        .sort((a,b)=>this.cells[b].army-this.cells[a].army)[0];
      if(next===undefined)continue;
      const danger=this.aiThreat(c.id,owner);
      const sendRatio=danger>0&&c.army-this.sent(c,.5)>danger?.5:1;
      const amount=this.sent(c,sendRatio),score=amount/(dist[c.id]+.75);
      if(score>transferScore){transferScore=score;transfer={from:c.id,to:next,ratio:sendRatio};}
    }
    return transfer?this.attack(transfer.from,transfer.to,owner,transfer.ratio):null;
  }
  aiThreat(id,owner){
    let threat=0;
    for(const n of this.neighbors(id)){
      const c=this.cells[n];if(c.owner>=0&&c.owner!==owner)threat=Math.max(threat,c.army-1);
    }
    return threat;
  }
}
