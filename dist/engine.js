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
export function seededRandom(seed) { return () => { let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296; }; }
export class Game {
  constructor({w=10,h=8,humans=1,ai=1,difficulty='normal',seed=1}={}) {
    const players=humans+ai;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<4||h<4||!Number.isInteger(humans)||humans<0||!Number.isInteger(ai)||ai<0||players<1||players>8||players>(w-2)*(h-2)) throw new Error('人类与电脑合计需为 1–8 位，且地图必须能容纳所有玩家');
    this.w=w;this.h=h;this.humans=humans;this.ai=ai;this.players=players;this.currentHuman=humans?0:null;this.difficulty=difficulty;this.rng=seededRandom(seed);
    this.cells=Array.from({length:w*h},(_,id)=>({id,owner:-1,army:0,capital:-1}));
    this.time=0;this.turn=0;this.running=false;this.paused=false;this.winner=null;this.events=[];this.moves=0;this.captures=0;this.pendingTurn=null;this.roundState=null;this.automaticElapsed=0;
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
    places.forEach((id,owner)=>Object.assign(this.cells[id],{owner,army:20,capital:owner}));
    this.addEvent('所有阵营已就位，从一格开始。','system');
  }
  neighbors(id){const x=id%this.w,y=Math.floor(id/this.w);return [x>0?id-1:-1,x<this.w-1?id+1:-1,y>0?id-this.w:-1,y<this.h-1?id+this.w:-1].filter(i=>i>=0);}
  isHuman(owner){return Number.isInteger(owner)&&owner>=0&&owner<this.humans;}
  aliveHumans(){return Array.from({length:this.humans},(_,id)=>id).filter(id=>this.cells.some(c=>c.owner===id));}
  get automatic(){return this.aliveHumans().length===0;}
  stats(){return FACTIONS.slice(0,this.players).map((f,id)=>{const cells=this.cells.filter(c=>c.owner===id);return {...f,id,human:this.isHuman(id),land:cells.length,army:cells.reduce((s,c)=>s+c.army,0)};});}
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
    const kind=oldOwner===owner?'reinforce':'attack';
    const location=`${String.fromCharCode(65+toId%this.w)}${Math.floor(toId/this.w)+1}`;
    if(kind==='reinforce')this.addEvent(`${FACTIONS[owner].name}增援 ${location}：${toBefore} + ${amount} = ${to.army}`,'reinforce',owner);
    else if(oldOwner>=0)this.addEvent(`${FACTIONS[owner].name}出兵 ${amount} 进攻 ${location}：守军 ${toBefore} − ${Math.min(amount,toBefore)} = ${Math.max(0,toBefore-amount)}`,'battle',owner);
    if(this.isHuman(owner)){this.moves++;if(captured)this.captures++;}
    if(captured&&oldOwner>=0){
      this.addEvent(`${FACTIONS[owner].name}攻占了${FACTIONS[oldOwner].name}的领土`,'battle',owner);
      if(!this.cells.some(c=>c.owner===oldOwner))this.addEvent(`${FACTIONS[oldOwner].name}失去全部领土，已出局`,'eliminated',oldOwner);
    }
    this.checkWinner();
    return {ok:true,amount,captured,oldOwner,owner,toId,fromId,kind,fromBefore,fromAfter:from.army,toBefore,toAfter:to.army};
  }
  checkWinner(){const owner=this.cells[0].owner;if(owner>=0&&this.cells.every(c=>c.owner===owner)){this.winner=owner;this.running=false;this.addEvent(`${FACTIONS[owner].name}占领全图，获得胜利！`,'victory',owner);}}
  get resolving(){return this.pendingTurn!==null;}
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
        const before=c.army;c.army=Math.min(999,c.army+(c.capital===c.owner?3:1));
        changes.push({id:c.id,owner:c.owner,before,after:c.army,amount:c.army-before});
      }
    });
    this.pendingTurn=null;this.roundState=null;this.currentHuman=this.aliveHumans()[0]??null;
    this.checkWinner();return {kind:'growth',changes};
  }
  update(dt){
    if(!this.running||this.paused||this.winner!==null)return [];
    dt=Math.max(0,Math.min(dt,0.25));this.time+=dt;
    // Human-controlled games, including zero-computer games, remain manual.
    // An observer-only game schedules its own rounds and uses the same staged
    // resolution as a human turn, preserving action counts and combat rules.
    if(!this.automatic){this.automaticElapsed=0;return [];}
    if(this.resolving)return [];
    this.automaticElapsed+=dt;
    if(this.automaticElapsed>=0.8){this.automaticElapsed=0;this.waitTurn({defer:true});}
    return [];
  }
  aiMove(owner){
    const owned=this.cells.filter(c=>c.owner===owner);if(!owned.length)return null;
    const options=[];
    for(const c of owned){
      if(c.army<2)continue;
      for(const n of this.neighbors(c.id)){
        const t=this.cells[n];if(t.owner===owner)continue;
        if(c.army-1>t.army){
          const empty=t.owner===-1;
          const ratio=empty?0.5:1;
          const open=this.neighbors(n).filter(i=>this.cells[i].owner!==owner).length;
          let score=empty?3+open*0.4:5+(c.army-t.army)*0.025;
          if(t.capital===t.owner&&t.owner>=0)score+=2;
          if(this.difficulty==='easy')score=this.rng()*10;
          else score+=this.rng()*(this.difficulty==='hard'?0.5:2);
          options.push({from:c.id,to:n,ratio,score});
        }
      }
    }
    // Interior armies travel toward the frontier; frontier allies reinforce a stronger attack.
    const dist=new Map(),queue=[];
    owned.forEach(c=>{if(this.neighbors(c.id).some(n=>this.cells[n].owner!==owner)){dist.set(c.id,0);queue.push(c.id);}});
    for(let q=0;q<queue.length;q++){const id=queue[q];for(const n of this.neighbors(id))if(this.cells[n].owner===owner&&!dist.has(n)){dist.set(n,dist.get(id)+1);queue.push(n);}}
    if(this.difficulty!=='easy'||!options.length){
      for(const c of owned){
        if(c.army<4)continue;
        const d=dist.get(c.id);
        const destinations=this.neighbors(c.id).filter(n=>this.cells[n].owner===owner&&((dist.get(n)<d)||(d===0&&dist.get(n)===0&&this.cells[n].army>c.army)));
        if(!destinations.length)continue;
        destinations.sort((a,b)=>dist.get(a)-dist.get(b)||this.cells[b].army-this.cells[a].army);
        options.push({from:c.id,to:destinations[0],ratio:1,score:(options.length?1:4)+Math.min(5,c.army/12)+(d>0?1:0)});
      }
    }
    options.sort((a,b)=>b.score-a.score);
    if(!options.length)return null;
    const move=options[0];return this.attack(move.from,move.to,owner,move.ratio);
  }
}
