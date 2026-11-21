import {Game,LEVELS,UNREST_LIMIT,ATTITUDES} from './engine.js';
const $=id=>document.getElementById(id);
const formatTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let wins=[];
try{const saved=JSON.parse(localStorage.getItem('territory-wins')||'[]');if(Array.isArray(saved))wins=saved.filter(n=>Number.isInteger(n)&&n>=0&&n<6);}catch{}
let config={mode:'campaign',level:0,difficulty:'normal',humans:1,ai:3,w:14,h:10,observerMode:'continuous',observerSpeed:1};
let game,selected=null,hovered=null,ratio=.5,sound=false,spectating=false,resultShown=false,pausedByHelp=false,pendingReset=null,resetWasPaused=false,toastTimer,audioCtx;
let tiles=[],factionEls=[],lastLog='',lastFrame=performance.now(),renderTimer=0,resolutionAt=0,lastBattle=null,lastController=0,playbackTime=0;
const flashes=new Map();
function factionColumn(f,id){
  const el=document.createElement('div');el.className='faction-column';el.dataset.factionId=id;el.setAttribute('role','listitem');el.style.setProperty('--faction',f.color);
  el.innerHTML=`<div class="faction-bar-track"><div class="faction-bar"><strong class="faction-bar-value">1</strong></div></div><span class="faction-bar-name">${f.name}</span><span class="faction-bar-controller">${game.isHuman(id)?'P'+(id+1):f.rebel?'新国 · 电脑':'电脑'}</span>`;return el;
}
function currentOptions(){const l=LEVELS[config.level];return {w:config.mode==='campaign'?l.w:config.w,h:config.mode==='campaign'?l.h:config.h,humans:config.mode==='campaign'?1:config.humans,ai:config.mode==='campaign'?l.ai:config.ai,difficulty:config.difficulty,observerMode:config.observerMode,seed:20261121+config.level*71+(config.mode==='custom'?31:0)};}
function setupGame(){
  game=new Game(currentOptions());selected=null;hovered=null;spectating=game.humans===0;lastController=game.currentHuman;resultShown=false;flashes.clear();lastLog='';lastBattle=null;resolutionAt=0;playbackTime=0;
  $('diplomacyFrom').replaceChildren();
  $('resultDialog').close();$('pauseOverlay').hidden=true;
  const l=LEVELS[config.level];
  $('mapTitle').innerHTML=config.mode==='campaign'?`${l.name}<span>${String(config.level+1).padStart(2,'0')}</span>`:'自由征途<span>∞</span>';
  $('mapSubtitle').textContent=config.mode==='campaign'?l.subtitle:'选择你的对手，书写你的版图';
  $('modeLabel').textContent=config.mode==='campaign'?'关卡挑战':'自定义对战';
  $('mapInfo').textContent=`${game.w} × ${game.h} 平原`;$('factionInfo').textContent=`${game.humans} 人类 · ${game.ai} 电脑`;
  $('board').style.setProperty('--cols',game.w);$('board').style.setProperty('--rows',game.h);
  $('colCoords').style.setProperty('--cols',game.w);$('rowCoords').style.setProperty('--rows',game.h);
  $('colCoords').innerHTML=Array.from({length:game.w},(_,x)=>`<span>${String.fromCharCode(65+x)}</span>`).join('');
  $('rowCoords').innerHTML=Array.from({length:game.h},(_,y)=>`<span>${String(y+1).padStart(2,'0')}</span>`).join('');
  const frag=document.createDocumentFragment();tiles=game.cells.map(c=>{
    const el=document.createElement('button');el.className='cell';el.dataset.id=c.id;el.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight');
    el.style.setProperty('--tile',`hsl(${86+(c.id*13%15)} ${17+c.id%7}% ${17+c.id*7%4}%)`);
    el.addEventListener('click',()=>clickTile(c.id));el.addEventListener('mouseenter',()=>{hovered=c.id;renderIntel();});el.addEventListener('mouseleave',()=>{hovered=null;renderIntel();});el.addEventListener('focus',()=>{hovered=c.id;renderIntel();});el.addEventListener('blur',()=>{hovered=null;renderIntel();});
    frag.append(el);return el;
  });$('board').replaceChildren(frag);
  factionEls=game.factions.map(factionColumn);$('factionList').replaceChildren(...factionEls);renderSettings();render();
}
function renderSettings(){
  $('campaignTab').classList.toggle('active',config.mode==='campaign');$('campaignTab').setAttribute('aria-selected',config.mode==='campaign');
  $('customTab').classList.toggle('active',config.mode==='custom');$('customTab').setAttribute('aria-selected',config.mode==='custom');
  $('campaignSettings').hidden=config.mode!=='campaign';$('customSettings').hidden=config.mode!=='custom';
  $('completedLabel').textContent=`${wins.length} / 6 完成`;
  $('levelList').innerHTML=LEVELS.map((l,i)=>`<button class="level ${config.level===i?'active':''}" data-level="${i}" aria-pressed="${config.level===i}"><span class="level-num">${String(i+1).padStart(2,'0')}</span><span><span class="level-title">${l.name}</span><span class="level-details">${l.w} × ${l.h} · ${l.ai} 位电脑</span></span>${wins.includes(i)?'<span class="level-check" aria-label="已通关">✓</span>':''}</button>`).join('');
  document.querySelectorAll('[data-diff]').forEach(el=>{el.classList.toggle('active',el.dataset.diff===config.difficulty);el.setAttribute('aria-pressed',el.dataset.diff===config.difficulty);});
  const copy={easy:['基础扩张','电脑优先扩张并简单集结，较少判断反击风险。'],normal:['集中推进','先补齐空地，再集结兵力，从能守住的突破口推进。'],hard:['稳健进攻','更谨慎估算反击风险，持续向突破口集结兵力。']}[config.difficulty];
  $('difficultyTag').textContent=copy[0];$('difficultyDesc').textContent=copy[1];
  $('humanCount').textContent=config.humans;$('aiCount').textContent=config.ai;
  const total=config.humans+config.ai;
  $('minusAI').disabled=config.ai===0||total===1;$('plusAI').disabled=total>=8;
  $('minusHuman').disabled=config.humans===0||total===1;$('plusHuman').disabled=total>=8;
  $('playerSetupNote').textContent=`${config.humans} 位人类 + ${config.ai} 位电脑，共 ${total}/8 个阵营。${config.humans===0?(config.observerMode==='step'?'走一步停一步，每次点击推进一回合。':'一直走，开始后自动连续运行。'):config.ai===0?(config.humans===1?'单人练习，全程手动操作。':'全程由你手动轮流控制各位玩家。'):'人类依次行动，再结算电脑回合。'}`;
  $('mapSize').value=`${config.w},${config.h}`;
  $('difficulty').querySelectorAll('button').forEach(b=>b.disabled=game.ai===0);
  if(game.ai===0){$('difficultyTag').textContent='无电脑';$('difficultyDesc').textContent='当前没有电脑对手，难度设置不影响人类玩家。';}
  else if(game.humans===0)$('difficultyDesc').textContent=game.observerMode==='step'?'电脑先扩张、再集结推进；每次结算一回合，然后停下。':'电脑先扩张、再集结推进，每轮各行动一次，可随时暂停。';
}
function requestReset(fn){
  if(game.running&&game.winner===null&&!resultShown){resetWasPaused=game.paused;game.paused=true;pendingReset=fn;$('confirmDialog').showModal();render();}
  else{fn();setupGame();}
}
function cancelReset(){pendingReset=null;$('confirmDialog').close();game.paused=resetWasPaused;renderSettings();render();}
function start(){game.running=true;game.paused=false;game.addEvent(game.humans===0?(game.observerMode==='step'?'单步观战开始。点击「推进一回合」，结算后停下。':'自动对战开始。电脑将连续行动，可随时暂停。'):game.humans>1?'人类玩家依次行动；全部行动后，电脑各行动一次，再统一增兵。':'轮到你了。你行动一次，各电脑最多行动一次。');tone(370);render();}
function togglePause(){if(!game.running)return;game.paused=!game.paused;render();}
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function tone(freq=500){if(!sound)return;try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);}catch{}}
function clickTile(id){
  if(game.winner!==null||spectating){selected=id;render();return;}
  if(game.resolving){toast('正在显示本回合行动，结算结束后轮到你');return;}
  if(game.paused){toast('战局已暂停，继续战斗后即可出兵');return;}
  if(!game.running){if(game.cells[id].owner===lastController){selected=id;render();}toast('点击「开始征战」，开启你的征途');return;}
  if(id===selected){selected=null;render();return;}
  const cell=game.cells[id];
  if(selected!==null&&game.cells[selected].owner===lastController&&game.neighbors(selected).includes(id)){
    const result=game.playTurn(selected,id,ratio,{defer:true});
    if(!result.ok){toast(result.reason);return;}
    flashActions(result.actions);
    lastBattle={action:result,reinforced:0,grew:0};resolutionAt=playbackTime+550;
    tone(result.captured?680:300);
    if(cell.owner===lastController)selected=id;
    else if(result.amount>0)toast(`派出 ${result.amount}，守军 ${result.toBefore} → ${result.toAfter}；未攻占`);
    if(result.captured&&result.oldOwner===-1&&game.captures===1)game.addEvent('首块领土已占领！领土越多，兵力增长越快。','system',0);
    if(selected!==null&&game.cells[selected].owner!==lastController)selected=null;
    checkResult();render();return;
  }
  if(cell.owner===lastController){selected=id;render();}
  else toast(selected===null?`当前由${game.factions[lastController].name}玩家行动，请选择该阵营领土`:'只能进攻上下左右相邻的格子');
}
function coord(id){return `${String.fromCharCode(65+id%game.w)}${Math.floor(id/game.w)+1}`;}
function flashActions(actions){for(const a of actions||[])if(a.ok)flashes.set(a.toId,{until:performance.now()+350,captured:a.captured});}
function waitTurn(){if(game.continuous)return;const result=game.waitTurn({defer:true});if(!result.ok)return;lastBattle=null;resolutionAt=playbackTime+180;flashActions(result.actions);if(selected!==null&&game.cells[selected].owner!==lastController)selected=null;checkResult();render();}
function moveCapital(){
  if(selected===null)return;
  const result=game.moveCapital(selected,{defer:true,fromId:Number($('capitalSource').value)});if(!result.ok){toast(result.reason);return;}
  lastBattle=null;resolutionAt=playbackTime+350;flashActions(result.actions);
  toast(`首都已迁至 ${coord(result.toId)}`);checkResult();render();
}
function buildCapital(){
  if(selected===null)return;
  const result=game.buildCapital(selected,{defer:true});if(!result.ok){toast(result.reason);return;}
  lastBattle=null;resolutionAt=playbackTime+350;flashActions(result.actions);
  toast(`已在 ${coord(result.toId)} 建设新首都`);checkResult();render();
}
function declareWar(target){
  const result=game.declareWar(target,{defer:true});if(!result.ok){toast(result.reason);return;}
  lastBattle=null;resolutionAt=playbackTime+350;
  toast(`已对${game.factions[target].name}宣战，消耗一次行动`);checkResult();render();
}
function advanceResolution(now){
  if(!game.resolving||game.paused||now<resolutionAt)return;
  const phase=game.stepTurn();if(!phase)return;
  if(phase.action?.ok){
    flashActions([phase.action]);
    if(lastBattle&&phase.action.toId===lastBattle.action.toId&&['reinforce','support'].includes(phase.action.kind))lastBattle.reinforced+=phase.action.amount;
  }
  if(lastBattle&&phase.kind==='growth')lastBattle.grew=phase.changes.find(c=>c.id===lastBattle.action.toId)?.amount||0;
  if(phase.secessions?.length){
    lastBattle=null;for(const country of phase.secessions)for(const id of country.cells)flashes.set(id,{until:performance.now()+700,captured:true});
    toast(`${phase.secessions.map(c=>game.factions[c.owner].name).join('、')}因地区动荡宣布独立`);
  }
  resolutionAt=now+(phase.action?.ok?420:100);
  checkResult();render();
}
function renderBattleResult(){
  $('combatResult').hidden=!lastBattle;if(!lastBattle)return;
  const {action:a,reinforced,grew}=lastBattle;
  $('combatResult').textContent=a.kind==='reinforce'
    ? `己方增援 ${coord(a.toId)}：${a.toBefore} + ${a.amount} = ${a.toAfter}`
    : `${game.factions[a.owner].name}派出 ${a.amount} · 守军 ${a.toBefore} − ${Math.min(a.amount,a.toBefore)} = ${Math.max(0,a.toBefore-a.amount)}${a.captured?` · 已攻占，驻军 ${a.toAfter}`:' · 未攻占'}${reinforced?` · 随后增援 +${reinforced}`:''}${grew?` · 回合增兵 +${grew}`:''}${a.oldOwner>=0?' · 交战格本回合不自动增兵':''}`;
}
function render(){
  if(game.currentHuman!==null&&game.currentHuman!==lastController){lastController=game.currentHuman;selected=null;hovered=null;$('diplomacyFrom').value=String(lastController);}
  const faction=lastController!==null?game.factions[lastController]:null;
  $('factionInfo').textContent=`${game.humans} 人类 · ${game.ai} 电脑${game.secessions?` · ${game.secessions} 个新国`:''}`;
  const observationName=game.observerMode==='step'?'走一步停一步':'一直走';
  $('observerControls').hidden=!game.automatic;
  document.querySelectorAll('[data-observer-mode]').forEach(b=>{const active=b.dataset.observerMode===game.observerMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);b.disabled=game.winner!==null;});
  document.querySelectorAll('[data-observer-speed]').forEach(b=>{const active=+b.dataset.observerSpeed===config.observerSpeed;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);b.disabled=game.winner!==null;});
  $('observerModeNote').textContent=game.observerMode==='step'?`当前 ${config.observerSpeed}×：只加快回合内动画，每次仍只走一回合。切换模式时会完成当前回合。`:`当前 ${config.observerSpeed}×：加快电脑行动和回合间隔，可随时调速或暂停。`;
  document.documentElement.style.setProperty('--accent',faction?.color||game.factions[0].color);
  $('currentPlayer').textContent=game.humans===0?`纯电脑观战 · ${observationName} · ${config.observerSpeed}×`:spectating&&game.automatic?`电脑观战 · ${observationName} · ${config.observerSpeed}×`:`当前控制：玩家 ${lastController+1} · ${faction.name}${game.humans>1?'（同机轮流）':''}${game.ai===0?' · 全程手动':''}`;
  if(lastController!==null&&!game.automatic&&game.capitalLost[lastController])$('currentPlayer').textContent+=' · 首都已失守，可建设新首都';
  $('currentPlayer').style.setProperty('--player-color',faction?.color||game.factions[0].color);
  $('yourLandLabel').textContent=faction?`${faction.name}领土`:'阵营领土';
  $('yourLandSquare').style.background=faction?`rgba(${faction.rgb},.3)`:'#46523a';$('yourLandSquare').style.borderColor=faction?.color||'#72846b';
  const neighbors=selected!==null&&game.cells[selected]?.owner===lastController&&game.running&&!game.paused&&!game.resolving&&!spectating?game.neighbors(selected).filter(id=>game.canAttack(lastController,game.cells[id].owner)):[];
  $('board').setAttribute('aria-busy',game.resolving);
  const now=performance.now();
  game.cells.forEach((c,i)=>{
    const el=tiles[i],f=c.owner>=0?game.factions[c.owner]:null,flash=flashes.get(i);
    const unrest=game.unrest(c);
    const cls=`cell ${f?'owned':'empty'} ${game.isCapital(c)?'capital':''} ${unrest>=2?'unstable':''} ${i===selected?'selected':''} ${neighbors.includes(i)?'reachable':''} ${game.w>=16?'small':''} ${flash&&flash.until>now?(flash.captured?'flash':'attacked'):''}`;
    if(el.className!==cls)el.className=cls;
    const label=`${coord(i)}，${f?(c.owner===lastController?'你的领土':f.name+'领土')+'，'+c.army+' 兵力'+(game.isCapital(c)?'，首都':'')+`，动荡 ${unrest}/${UNREST_LIMIT}`:'未占领'}`;
    el.title=label;
    if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
    el.setAttribute('aria-pressed',i===selected);
    el.style.setProperty('--faction',f?.color||'#aac56f');
    const html=f?`${game.isCapital(c)?'<svg class="cell-flag"><use href="#i-flag"/></svg>':''}<span>${c.army>9999?Math.floor(c.army/1000)+'k':c.army}</span><span class="cell-faction">${f.symbol}</span>`:'';
    if(el.innerHTML!==html)el.innerHTML=html;
  });
  $('timer').textContent=formatTime(game.time);
  $('turnLabel').textContent=`第 ${game.turn} 回合`;
  $('waitBtn').hidden=!game.running||game.continuous;$('waitBtn').disabled=game.paused||game.resolving;
  $('waitBtn').textContent=game.automatic?'推进一回合':'蓄兵一回合';
  const capitals=lastController===null?[]:game.capitals(lastController),hasCapital=capitals.length>0;
  const capitalSource=$('capitalSource'),previousSource=capitalSource.value;
  const sourceOptions=capitals.map(c=>`<option value="${c.id}">迁出 ${coord(c.id)}</option>`).join('');
  if(capitalSource.innerHTML!==sourceOptions){capitalSource.innerHTML=sourceOptions;if(capitals.some(c=>String(c.id)===previousSource))capitalSource.value=previousSource;}
  capitalSource.hidden=!game.running||game.automatic||spectating||capitals.length<2;
  capitalSource.disabled=game.paused||game.resolving;
  $('moveCapitalBtn').hidden=!game.running||game.automatic||spectating||!hasCapital;
  $('buildCapitalBtn').hidden=!game.running||game.automatic||spectating;
  $('buildCapitalBtn').textContent=`建设首都 ${capitals.length}/2`;
  const capitalTarget=selected===null?null:game.cells[selected];
  const capitalLost=game.currentHuman!==null&&game.capitalLost[game.currentHuman];
  $('moveCapitalBtn').disabled=game.paused||game.resolving||capitalLost||!capitalTarget||capitalTarget.owner!==game.currentHuman||game.isCapital(capitalTarget);
  $('moveCapitalBtn').title=capitalLost?'当前没有首都，请先建设新首都':'选中己方普通领土后迁都，消耗本次行动';
  $('buildCapitalBtn').disabled=game.paused||game.resolving||!capitalTarget||capitalTarget.owner!==game.currentHuman||game.isCapital(capitalTarget)||capitals.length>=2;
  $('buildCapitalBtn').title=capitals.length>=2?'已有两座首都，可以选择一座迁都':'选中己方普通领土建设，消耗一次行动';
  const ended=game.winner!==null;
  $('gameState').textContent=ended?'战斗结束':game.paused?'战局暂停':game.resolving?'回合结算中':game.running?(game.automatic?(game.continuous?'自动对战中':'等待下一步'):game.humans>1?`${faction.name}的回合`:'轮到你了'):'准备就绪';
  $('gameState').classList.toggle('running',game.running&&!game.paused);
  $('pauseBtn').disabled=!game.running;$('pauseBtn').setAttribute('aria-label',game.paused?'继续游戏':'暂停游戏');$('pauseBtn').innerHTML=`<svg><use href="#i-${game.paused?'play':'pause'}"/></svg>`;
  $('pauseOverlay').hidden=!game.paused||!game.running||$('helpDialog').open||$('confirmDialog').open||$('resultDialog').open;
  $('startBtn').hidden=game.running||game.time>0||ended;$('troopControl').hidden=!game.running||spectating||game.automatic;
  $('startBtn').innerHTML=`<svg><use href="#i-cross"/></svg>${game.humans===0?'开始观战':'开始征战'}`;
  if(ended){$('hintTitle').textContent=game.isHuman(game.winner)?(game.humans===1?'全境归你，征途完成！':`玩家 ${game.winner+1} · ${game.factions[game.winner].name}获胜`):`${game.factions[game.winner].name}统一了全境`;$('hintText').textContent='选择新关卡，或者点击重开再战一局。';}
  else if(game.paused){$('hintTitle').textContent='战局已暂停';$('hintText').textContent='点击继续，或按空格键返回战斗。';}
  else if(game.resolving){$('hintTitle').textContent='正在结算本回合';$('hintText').textContent='先显示战斗扣兵，再显示电脑行动和增兵。';}
  else if(game.automatic){$('hintTitle').textContent=game.observerMode==='step'?'走一步停一步':game.running?'自动运行中':'纯电脑自动对战';$('hintText').textContent=game.observerMode==='step'?(game.running?'点击「推进一回合」或按 E，完成一轮后停下。':'点击「开始观战」后，可逐回合推进电脑对战。'):game.running?'电脑会自行出兵和增兵，无需点击，可随时暂停。':'点击「开始观战」后，电脑会自动连续对战。';}
  else if(!game.running){$('hintTitle').textContent=game.humans===0?'观看电脑之间的领土争夺':'从你的第一块领土开始';$('hintText').textContent=game.humans>1?'各位玩家在同一台设备上轮流操作。':'回合制对战，你思考时电脑不动。';}
  else if(selected!==null&&game.cells[selected].owner===lastController){const c=game.cells[selected];$('hintTitle').textContent=`${coord(selected)} 已选中 · 可派出 ${game.sent(c,ratio)} 兵力`;$('hintText').textContent='出兵才推进回合；可以慢慢思考，不必抢点。';}
  else{$('hintTitle').textContent=game.humans>1?`轮到玩家 ${lastController+1} · ${faction.name}`:'轮到你了，慢慢规划';$('hintText').textContent='选中己方领土出兵，或蓄兵一回合。';}
  const stats=game.stats(),mine=lastController===null?stats.reduce((a,b)=>a.land>=b.land?a:b):stats[lastController],total=game.cells.length;
  $('occupationLabel').textContent=lastController===null?'领先阵营占领率':`${faction.name}占领率`;
  const chartMax=Math.max(2,...stats.map(s=>s.land));
  while(factionEls.length<stats.length){const id=factionEls.length;factionEls.push(factionColumn(game.factions[id],id));}
  $('factionList').style.setProperty('--faction-count',stats.length);
  stats.forEach((s,id)=>{const column=factionEls[id];column.dataset.land=s.land;column.classList.toggle('dead',s.land===0);column.classList.toggle('current-faction',id===game.currentHuman);column.querySelector('.faction-bar').style.height=`${s.land/chartMax*100}%`;column.querySelector('.faction-bar-value').textContent=s.land;column.querySelector('.faction-bar-controller').textContent=s.land?(s.human?'P'+(id+1):s.rebel?'新国 · 电脑':'电脑'):'出局';column.title=`${s.name}：${s.land} 格领土，${s.army} 总兵力`;column.setAttribute('aria-label',column.title);});
  const ranked=[...stats].sort((a,b)=>a.land-b.land||a.id-b.id);
  const ordered=ranked.map(s=>factionEls[s.id]);
  if(ordered.some((el,i)=>$('factionList').children[i]!==el))$('factionList').replaceChildren(...ordered);
  $('aliveCount').textContent=`${stats.filter(s=>s.land).length} 方存活`;
  $('occupation').innerHTML=`${(mine.land/total*100).toFixed(1)}<small>%</small>`;$('occupationBar').style.width=`${mine.land/total*100}%`;
  const neutral=total-stats.reduce((s,f)=>s+f.land,0);$('neutralCount').textContent=`${neutral} 格`;
  $('territoryShare').innerHTML=stats.filter(s=>s.land).map(s=>`<i style="width:${s.land/total*100}%;background:${s.color}"></i>`).join('')+`<i style="width:${neutral/total*100}%;background:#46523a"></i>`;
  const logKey=game.events.map(e=>e.text+e.time).join('|');
  if(logKey!==lastLog){lastLog=logKey;$('battleLog').innerHTML=game.events.slice(0,5).map(e=>`<div class="log-item" ${e.owner>=0?`style="border-color:${game.factions[e.owner].color}66"`:''}><time>${formatTime(e.time)}</time><p>${e.text}</p></div>`).join('');}
  renderDiplomacy(stats);renderIntel();renderBattleResult();
}
function renderDiplomacy(stats=game.stats()){
  const select=$('diplomacyFrom'),alive=stats.filter(s=>s.land),previous=select.value;
  const options=alive.map(s=>`<option value="${s.id}">${s.name}${s.human?' · 玩家 '+(s.id+1):''}</option>`).join('');
  if(select.innerHTML!==options){select.innerHTML=options;select.value=alive.some(s=>String(s.id)===previous)?previous:String(game.currentHuman??alive[0]?.id??0);}
  const from=Number(select.value),nation=game.factions[from];
  const rows=alive.filter(s=>s.id!==from).map(s=>{
    const contact=game.sharesBorder(from,s.id);
    return `<div class="diplomacy-row" data-relation-target="${s.id}" data-contact="${contact}"><strong style="color:${s.color}">${s.name}</strong><span>${nation.name}对${s.name}<b class="attitude attitude-${game.attitude(from,s.id)}" data-direction="out">${ATTITUDES[game.attitude(from,s.id)]}</b></span><span>${s.name}对${nation.name}<b class="attitude attitude-${game.attitude(s.id,from)}" data-direction="in">${ATTITUDES[game.attitude(s.id,from)]}</b></span><p class="diplomacy-note">${contact?'已接触 · 按外交规则变化':'距离较远 · 保持当前态度，不随机变化'}</p>${contact&&game.isHuman(from)&&from===lastController&&game.attitude(from,s.id)!==2?`<button class="secondary declare-war-btn" data-declare-war="${s.id}" ${!game.running||game.paused||game.resolving||game.currentHuman!==from||spectating?'disabled':''}>对${s.name}宣战 · 一次行动</button>`:''}</div>`;
  }).join('')||'<p class="diplomacy-empty">当前没有其他存活国家。</p>';
  if($('diplomacyList').innerHTML!==rows)$('diplomacyList').innerHTML=rows;
  $('diplomacyOrigin').textContent=nation.rebel?`因战乱独立，原属国：${game.factions[nation.origin].name}`:'初始国家，各方向态度独立变化。';
}
function renderIntel(){
  const id=hovered??selected;if(id===null){$('tileIntel').innerHTML='<div class="intel-placeholder">◇</div><p>选择一块领土<br><span>查看兵力与进攻信息</span></p>';return;}
  const c=game.cells[id],f=c.owner>=0?game.factions[c.owner]:null;
  let note=c.owner===-1?'未占领 · 没有守军':game.isCapital(c)?'首都 · 每轮 +3 兵力':'普通领土 · 每轮 +1 兵力';
  if(selected!==null&&selected!==id&&game.cells[selected].owner===lastController&&game.neighbors(selected).includes(id)){
    const sent=game.sent(game.cells[selected],ratio);note=c.owner===lastController?`调兵：可增援 ${sent} 兵力`:sent>c.army?`可攻占 · 出兵后剩余 ${sent-c.army}`:`守军 ${c.army} · 可出兵 ${sent}`;
    if(!game.canAttack(lastController,c.owner))note=game.attitude(lastController,c.owner)===0?'和平国家 · 宣战后才能进攻':'中立国家 · 仅能反击或先宣战';
  }
  if(c.owner>=0)note+=game.turn<c.stableUntil?` · 新国稳定期 ${c.stableUntil-game.turn} 回合`:` · 动荡 ${game.unrest(c)}/${UNREST_LIMIT}${game.unrest(c)>=2?'，注意分裂风险':''}`;
  if(c.owner>=0&&lastController!==null&&c.owner!==lastController)note+=` · 对${game.factions[lastController].name}${ATTITUDES[game.attitude(c.owner,lastController)]}，反向${ATTITUDES[game.attitude(lastController,c.owner)]}`;
  $('tileIntel').innerHTML=`<div class="tile-preview" style="${f?`color:${f.color};border-color:${f.color}77;background:rgba(${f.rgb},.15)`:'background:#2e3d27;border-color:#596d48;color:#a3b68c'}">${c.owner>=0?c.army:'◇'}</div><div class="tile-detail"><div class="coordinate">${coord(id)}<span>${f?f.symbol:''}</span></div><strong>${f?(c.owner===lastController?'你的领土':f.name+'阵营'):'未占领的土地'}</strong><p class="intel-note">${note}</p></div>`;
}
function checkResult(){
  if(resultShown||game.resolving)return;
  const lost=game.humans>0&&game.aliveHumans().length===0;
  if(game.winner===null&&(!lost||spectating))return;
  resultShown=true;const won=game.isHuman(game.winner);
  if(won&&config.mode==='campaign'&&!wins.includes(config.level)){wins.push(config.level);try{localStorage.setItem('territory-wins',JSON.stringify(wins));}catch{}renderSettings();}
  if(game.winner===null)game.paused=true;
  $('resultEyebrow').textContent=won?'TERRITORY CONQUERED':game.winner!==null?'BATTLE COMPLETE':'THE NEXT EXPEDITION AWAITS';
  $('resultTitle').textContent=won?(game.humans===1?'全境归你':`玩家 ${game.winner+1} · ${game.factions[game.winner].name}获胜`):game.winner!==null?`${game.factions[game.winner].name}赢得胜利`:'暂别这一片疆土';
  $('resultDesc').textContent=won?'从一格领土，到整片大陆。这一战，你做到了。':game.winner!==null?'全图已被统一。再出发，下一场胜利或许属于你。':'你的领土已全部失守。调整策略，再出发。';
  $('resultStats').innerHTML=`<div><strong>${game.turn}</strong><span>征战回合</span></div><div><strong>${game.captures}</strong><span>累计攻占</span></div><div><strong>${game.moves}</strong><span>出兵次数</span></div>`;
  $('nextBtn').hidden=!won||config.mode!=='campaign'||config.level===LEVELS.length-1;$('watchBtn').hidden=game.winner!==null;
  $('resultDialog').showModal();tone(won?880:220);
}
$('startBtn').onclick=start;$('pauseBtn').onclick=togglePause;$('resumeBtn').onclick=togglePause;
$('restartBtn').onclick=()=>requestReset(()=>{});
$('waitBtn').onclick=waitTurn;
$('moveCapitalBtn').onclick=moveCapital;
$('buildCapitalBtn').onclick=buildCapital;
$('diplomacyFrom').onchange=()=>renderDiplomacy();
$('diplomacyList').onclick=e=>{const button=e.target.closest('[data-declare-war]');if(button&&!button.disabled)declareWar(Number(button.dataset.declareWar));};
$('observerModes').onclick=e=>{const mode=e.target.dataset.observerMode;if(!mode||!game.automatic||game.winner!==null)return;config.observerMode=mode;game.setObserverMode(mode);renderSettings();render();};
$('observerSpeeds').onclick=e=>{const speed=Number(e.target.dataset.observerSpeed);if(!game.automatic||game.winner!==null||![1,2,4,8].includes(speed))return;config.observerSpeed=speed;render();};
$('levelList').onclick=e=>{const b=e.target.closest('[data-level]');if(b&&+b.dataset.level!==config.level)requestReset(()=>config.level=+b.dataset.level);};
$('campaignTab').onclick=()=>{if(config.mode!=='campaign')requestReset(()=>config.mode='campaign');};
$('customTab').onclick=()=>{if(config.mode!=='custom')requestReset(()=>config.mode='custom');};
$('difficulty').onclick=e=>{const diff=e.target.dataset.diff;if(diff&&diff!==config.difficulty)requestReset(()=>config.difficulty=diff);};
$('minusAI').onclick=()=>{if(config.ai>0&&config.humans+config.ai>1)requestReset(()=>config.ai--);};
$('plusAI').onclick=()=>{if(config.humans+config.ai<8)requestReset(()=>config.ai++);};
$('minusHuman').onclick=()=>{if(config.humans>0&&config.humans+config.ai>1)requestReset(()=>config.humans--);};
$('plusHuman').onclick=()=>{if(config.humans+config.ai<8)requestReset(()=>config.humans++);};
$('mapSize').onchange=e=>{const [w,h]=e.target.value.split(',').map(Number);requestReset(()=>{config.w=w;config.h=h;});};
$('troopControl').onclick=e=>{if(e.target.dataset.ratio){ratio=+e.target.dataset.ratio;document.querySelectorAll('[data-ratio]').forEach(b=>{b.classList.toggle('active',+b.dataset.ratio===ratio);b.setAttribute('aria-pressed',+b.dataset.ratio===ratio);});render();}};
$('helpBtn').onclick=()=>{pausedByHelp=game.running&&!game.paused;if(pausedByHelp)game.paused=true;$('helpDialog').showModal();render();};
$('helpDialog').addEventListener('close',()=>{if(pausedByHelp)game.paused=false;pausedByHelp=false;render();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('cancelReset').onclick=cancelReset;$('confirmDialog').addEventListener('cancel',e=>{e.preventDefault();cancelReset();});
$('confirmReset').onclick=()=>{const fn=pendingReset;pendingReset=null;$('confirmDialog').close();if(fn){fn();setupGame();}};
$('replayBtn').onclick=setupGame;
$('nextBtn').onclick=()=>{if(config.level<LEVELS.length-1){config.level++;setupGame();}};
$('watchBtn').onclick=()=>{spectating=true;resultShown=false;game.paused=false;$('resultDialog').close();selected=null;render();};
$('soundBtn').onclick=()=>{sound=!sound;$('soundBtn').classList.toggle('muted',!sound);$('soundBtn').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('soundBtn').setAttribute('aria-pressed',sound);tone();toast(sound?'音效已开启':'音效已关闭');};
$('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口暂不支持全屏，请使用浏览器全屏功能');}};
$('mobileSetup').onclick=()=>{const open=$('setup').classList.toggle('mobile-open');$('mobileSetup').setAttribute('aria-expanded',open);if(open)$('setup').scrollIntoView({behavior:'smooth',block:'start'});};
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(game.running)togglePause();else if(game.time===0)start();}
  if(e.key.toLowerCase()==='e'&&game.running&&!game.continuous){e.preventDefault();waitTurn();}
  if(e.key==='Escape'){selected=null;render();}
  if(e.key.startsWith('Arrow')&&selected!==null&&game.running&&!game.paused&&!spectating){
    e.preventDefault();const x=selected%game.w,y=Math.floor(selected/game.w);let to=null;
    if(e.key==='ArrowLeft'&&x>0)to=selected-1;if(e.key==='ArrowRight'&&x<game.w-1)to=selected+1;if(e.key==='ArrowUp'&&y>0)to=selected-game.w;if(e.key==='ArrowDown'&&y<game.h-1)to=selected+game.w;
    if(to!==null)clickTile(to);
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.running&&!game.paused){game.paused=true;render();}});
setupGame();
function frame(now){
  const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  // One shared playback clock scales both round scheduling and action display.
  // Human turns always use real time, even after an accelerated observation.
  const rate=game.automatic?config.observerSpeed:1;
  const elapsed=dt*rate;
  if(game.running&&!game.paused&&game.winner===null)playbackTime+=elapsed*1000;
  let remaining=elapsed;
  while(remaining>0){const step=Math.min(.25,remaining);game.update(step);remaining-=step;}
  advanceResolution(playbackTime);
  if(selected!==null&&game.running&&!spectating&&game.cells[selected].owner!==game.currentHuman&&!game.resolving)selected=null;
  checkResult();renderTimer+=dt;
  if(renderTimer>.1){render();renderTimer=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
