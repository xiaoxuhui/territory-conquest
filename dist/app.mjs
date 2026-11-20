import {Game,FACTIONS,LEVELS} from './engine.mjs';
const $=id=>document.getElementById(id);
const formatTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let wins=[];
try{const saved=JSON.parse(localStorage.getItem('territory-wins')||'[]');if(Array.isArray(saved))wins=saved.filter(n=>Number.isInteger(n)&&n>=0&&n<6);}catch{}
let config={mode:'campaign',level:0,difficulty:'normal',ai:3,w:14,h:10};
let game,selected=null,hovered=null,ratio=.5,speed=1,sound=false,spectating=false,resultShown=false,pausedByHelp=false,pendingReset=null,resetWasPaused=false,toastTimer,audioCtx;
let tiles=[],factionEls=[],lastLog='',lastFrame=performance.now(),renderTimer=0;
const flashes=new Map();
function currentOptions(){const l=LEVELS[config.level];return {w:config.mode==='campaign'?l.w:config.w,h:config.mode==='campaign'?l.h:config.h,ai:config.mode==='campaign'?l.ai:config.ai,difficulty:config.difficulty,seed:20261121+config.level*71+(config.mode==='custom'?31:0)};}
function setupGame(){
  game=new Game(currentOptions());selected=null;hovered=null;spectating=false;resultShown=false;flashes.clear();lastLog='';
  $('resultDialog').close();$('pauseOverlay').hidden=true;
  const l=LEVELS[config.level];
  $('mapTitle').innerHTML=config.mode==='campaign'?`${l.name}<span>${String(config.level+1).padStart(2,'0')}</span>`:'自由征途<span>∞</span>';
  $('mapSubtitle').textContent=config.mode==='campaign'?l.subtitle:'选择你的对手，书写你的版图';
  $('modeLabel').textContent=config.mode==='campaign'?'关卡挑战':'自定义对战';
  $('mapInfo').textContent=`${game.w} × ${game.h} 平原`;$('factionInfo').textContent=`${game.ai+1} 个阵营`;
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
  factionEls=FACTIONS.slice(0,game.ai+1).map((f,id)=>{
    const el=document.createElement('div');el.className='faction-row';el.style.setProperty('--faction',f.color);
    el.innerHTML=`<span class="faction-name"><span class="faction-symbol">${f.symbol}</span>${f.name}${id===0?'<span class="faction-you">你</span>':''}</span><span class="faction-numbers"><strong>1</strong><i>/</i><span>20</span></span>`;return el;
  });$('factionList').replaceChildren(...factionEls);renderSettings();render();
}
function renderSettings(){
  $('campaignTab').classList.toggle('active',config.mode==='campaign');$('campaignTab').setAttribute('aria-selected',config.mode==='campaign');
  $('customTab').classList.toggle('active',config.mode==='custom');$('customTab').setAttribute('aria-selected',config.mode==='custom');
  $('campaignSettings').hidden=config.mode!=='campaign';$('customSettings').hidden=config.mode!=='custom';
  $('completedLabel').textContent=`${wins.length} / 6 完成`;
  $('levelList').innerHTML=LEVELS.map((l,i)=>`<button class="level ${config.level===i?'active':''}" data-level="${i}" aria-pressed="${config.level===i}"><span class="level-num">${String(i+1).padStart(2,'0')}</span><span><span class="level-title">${l.name}</span><span class="level-details">${l.w} × ${l.h} · ${l.ai} 位电脑</span></span>${wins.includes(i)?'<span class="level-check" aria-label="已通关">✓</span>':''}</button>`).join('');
  document.querySelectorAll('[data-diff]').forEach(el=>{el.classList.toggle('active',el.dataset.diff===config.difficulty);el.setAttribute('aria-pressed',el.dataset.diff===config.difficulty);});
  const copy={easy:['从容练习','电脑行动较慢，适合熟悉扩张与进攻。'],normal:['均衡决策','电脑会扩张、集结兵力，并寻找进攻机会。'],hard:['快速博弈','电脑行动更快，擅长集中兵力争夺前线。']}[config.difficulty];
  $('difficultyTag').textContent=copy[0];$('difficultyDesc').textContent=copy[1];
  $('aiCount').textContent=config.ai;$('minusAI').disabled=config.ai<=1;$('plusAI').disabled=config.ai>=7;$('mapSize').value=`${config.w},${config.h}`;
}
function requestReset(fn){
  if(game.time>0&&game.winner===null&&!resultShown){resetWasPaused=game.paused;game.paused=true;pendingReset=fn;$('confirmDialog').showModal();render();}
  else{fn();setupGame();}
}
function cancelReset(){pendingReset=null;$('confirmDialog').close();game.paused=resetWasPaused;renderSettings();render();}
function start(){game.running=true;game.paused=false;game.addEvent('战斗开始！选中青绿色领土，向相邻格子出兵。');tone(370);render();}
function togglePause(){if(!game.running)return;game.paused=!game.paused;render();}
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function tone(freq=500){if(!sound)return;try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);}catch{}}
function clickTile(id){
  if(game.winner!==null||spectating){selected=id;render();return;}
  if(game.paused){toast('战局已暂停，继续战斗后即可出兵');return;}
  if(!game.running){if(game.cells[id].owner===0){selected=id;render();}toast('点击「开始征战」，开启你的征途');return;}
  if(id===selected){selected=null;render();return;}
  const cell=game.cells[id];
  if(selected!==null&&game.cells[selected].owner===0&&game.neighbors(selected).includes(id)){
    const result=game.attack(selected,id,0,ratio);
    if(!result.ok){toast(result.reason);return;}
    flashes.set(id,{until:performance.now()+350,captured:result.captured});
    tone(result.captured?680:300);
    if(cell.owner===0)selected=id;
    else if(result.amount>0)toast(`消耗敌方 ${result.amount} 兵力，等待增援后再进攻`);
    if(result.captured&&result.oldOwner===-1&&game.captures===1)game.addEvent('首块领土已占领！领土越多，兵力增长越快。','system',0);
    checkResult();render();return;
  }
  if(cell.owner===0){selected=id;render();}
  else toast(selected===null?'先点击一块青绿色己方领土':'只能进攻上下左右相邻的格子');
}
function coord(id){return `${String.fromCharCode(65+id%game.w)}${Math.floor(id/game.w)+1}`;}
function render(){
  const neighbors=selected!==null&&game.cells[selected]?.owner===0&&game.running&&!game.paused&&!spectating?game.neighbors(selected):[];
  const now=performance.now();
  game.cells.forEach((c,i)=>{
    const el=tiles[i],f=c.owner>=0?FACTIONS[c.owner]:null,flash=flashes.get(i);
    const cls=`cell ${f?'owned':'empty'} ${c.capital===c.owner&&f?'capital':''} ${i===selected?'selected':''} ${neighbors.includes(i)?'reachable':''} ${game.w>=16?'small':''} ${flash&&flash.until>now?(flash.captured?'flash':'attacked'):''}`;
    if(el.className!==cls)el.className=cls;
    const label=`${coord(i)}，${f?(c.owner===0?'你的领土':f.name+'领土')+'，'+c.army+' 兵力':'未占领'}`;
    if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
    el.setAttribute('aria-pressed',i===selected);
    el.style.setProperty('--faction',f?.color||'#aac56f');
    const html=f?`${c.capital===c.owner?'<svg class="cell-flag"><use href="#i-flag"/></svg>':''}<span>${c.army>9999?Math.floor(c.army/1000)+'k':c.army}</span><span class="cell-faction">${f.symbol}</span>`:'';
    if(el.innerHTML!==html)el.innerHTML=html;
  });
  $('timer').textContent=formatTime(game.time);
  const ended=game.winner!==null;
  $('gameState').textContent=ended?'战斗结束':spectating?'观战中':game.paused?'战局暂停':game.running?'交战中':'准备就绪';
  $('gameState').classList.toggle('running',game.running&&!game.paused);
  $('pauseBtn').disabled=!game.running;$('pauseBtn').setAttribute('aria-label',game.paused?'继续游戏':'暂停游戏');$('pauseBtn').innerHTML=`<svg><use href="#i-${game.paused?'play':'pause'}"/></svg>`;
  $('pauseOverlay').hidden=!game.paused||!game.running||$('helpDialog').open||$('confirmDialog').open||$('resultDialog').open;
  $('startBtn').hidden=game.running||game.time>0||ended;$('troopControl').hidden=!game.running||spectating;
  if(ended){$('hintTitle').textContent=game.winner===0?'全境归你，征途完成！':`${FACTIONS[game.winner].name}统一了全境`;$('hintText').textContent='选择新关卡，或者点击重开再战一局。';}
  else if(spectating){$('hintTitle').textContent='观战模式';$('hintText').textContent='剩余阵营继续争夺，直到一方占领全图。';}
  else if(!game.running){$('hintTitle').textContent='从你的第一块领土开始';$('hintText').textContent='准备好后开始战斗，青绿色领土属于你。';}
  else if(game.paused){$('hintTitle').textContent='战局已暂停';$('hintText').textContent='点击继续，或按空格键返回战斗。';}
  else if(selected!==null&&game.cells[selected].owner===0){const c=game.cells[selected];$('hintTitle').textContent=`${coord(selected)} 已选中 · 可派出 ${game.sent(c,ratio)} 兵力`;$('hintText').textContent='点击高亮的相邻格子出兵；再次点击已选格取消。';}
  else{$('hintTitle').textContent='选择领土，继续扩张';$('hintText').textContent='点击一块青绿色领土，再点相邻格子出兵。';}
  const stats=game.stats(),mine=stats[0],total=game.cells.length;
  stats.forEach((s,id)=>{const row=factionEls[id];row.classList.toggle('dead',s.land===0);row.querySelector('.faction-numbers strong').textContent=s.land;row.querySelector('.faction-numbers>span').textContent=s.land?s.army:'出局';});
  $('aliveCount').textContent=`${stats.filter(s=>s.land).length} 方存活`;
  $('occupation').innerHTML=`${(mine.land/total*100).toFixed(1)}<small>%</small>`;$('occupationBar').style.width=`${mine.land/total*100}%`;
  const neutral=total-stats.reduce((s,f)=>s+f.land,0);$('neutralCount').textContent=`${neutral} 格`;
  $('territoryShare').innerHTML=stats.filter(s=>s.land).map(s=>`<i style="width:${s.land/total*100}%;background:${s.color}"></i>`).join('')+`<i style="width:${neutral/total*100}%;background:#46523a"></i>`;
  const logKey=game.events.map(e=>e.text+e.time).join('|');
  if(logKey!==lastLog){lastLog=logKey;$('battleLog').innerHTML=game.events.slice(0,5).map(e=>`<div class="log-item" ${e.owner>=0?`style="border-color:${FACTIONS[e.owner].color}66"`:''}><time>${formatTime(e.time)}</time><p>${e.text}</p></div>`).join('');}
  renderIntel();
}
function renderIntel(){
  const id=hovered??selected;if(id===null){$('tileIntel').innerHTML='<div class="intel-placeholder">◇</div><p>选择一块领土<br><span>查看兵力与进攻信息</span></p>';return;}
  const c=game.cells[id],f=c.owner>=0?FACTIONS[c.owner]:null;
  let note=c.owner===-1?'未占领 · 没有守军':c.capital===c.owner?'初始据点 · 每轮 +3 兵力':'普通领土 · 每轮 +1 兵力';
  if(selected!==null&&selected!==id&&game.cells[selected].owner===0&&game.neighbors(selected).includes(id)){
    const sent=game.sent(game.cells[selected],ratio);note=c.owner===0?`调兵：可增援 ${sent} 兵力`:sent>c.army?`可攻占 · 出兵后剩余 ${sent-c.army}`:`守军 ${c.army} · 可出兵 ${sent}`;
  }
  $('tileIntel').innerHTML=`<div class="tile-preview" style="${f?`color:${f.color};border-color:${f.color}77;background:rgba(${f.rgb},.15)`:'background:#2e3d27;border-color:#596d48;color:#a3b68c'}">${c.owner>=0?c.army:'◇'}</div><div class="tile-detail"><div class="coordinate">${coord(id)}<span>${f?f.symbol:''}</span></div><strong>${f?(c.owner===0?'你的领土':f.name+'阵营'):'未占领的土地'}</strong><p class="intel-note">${note}</p></div>`;
}
function checkResult(){
  if(resultShown)return;
  const lost=!game.cells.some(c=>c.owner===0);
  if(game.winner===null&&(!lost||spectating))return;
  resultShown=true;const won=game.winner===0;
  if(won&&config.mode==='campaign'&&!wins.includes(config.level)){wins.push(config.level);try{localStorage.setItem('territory-wins',JSON.stringify(wins));}catch{}renderSettings();}
  if(game.winner===null)game.paused=true;
  $('resultEyebrow').textContent=won?'TERRITORY CONQUERED':game.winner!==null?'BATTLE COMPLETE':'THE NEXT EXPEDITION AWAITS';
  $('resultTitle').textContent=won?'全境归你':game.winner!==null?`${FACTIONS[game.winner].name}赢得胜利`:'暂别这一片疆土';
  $('resultDesc').textContent=won?'从一格领土，到整片大陆。这一战，你做到了。':game.winner!==null?'全图已被统一。再出发，下一场胜利或许属于你。':'你的领土已全部失守。调整策略，再出发。';
  $('resultStats').innerHTML=`<div><strong>${formatTime(game.time)}</strong><span>征战时间</span></div><div><strong>${game.captures}</strong><span>累计攻占</span></div><div><strong>${game.moves}</strong><span>出兵次数</span></div>`;
  $('nextBtn').hidden=!won||config.mode!=='campaign'||config.level===LEVELS.length-1;$('watchBtn').hidden=game.winner!==null;
  $('resultDialog').showModal();tone(won?880:220);
}
$('startBtn').onclick=start;$('pauseBtn').onclick=togglePause;$('resumeBtn').onclick=togglePause;
$('restartBtn').onclick=()=>requestReset(()=>{});
$('speedBtn').onclick=()=>{speed=speed===1?2:1;$('speedBtn').textContent=`${speed}×`;$('speedBtn').setAttribute('aria-label',`当前 ${speed} 倍速，点击切换`);};
$('levelList').onclick=e=>{const b=e.target.closest('[data-level]');if(b&&+b.dataset.level!==config.level)requestReset(()=>config.level=+b.dataset.level);};
$('campaignTab').onclick=()=>{if(config.mode!=='campaign')requestReset(()=>config.mode='campaign');};
$('customTab').onclick=()=>{if(config.mode!=='custom')requestReset(()=>config.mode='custom');};
$('difficulty').onclick=e=>{const diff=e.target.dataset.diff;if(diff&&diff!==config.difficulty)requestReset(()=>config.difficulty=diff);};
$('minusAI').onclick=()=>{if(config.ai>1)requestReset(()=>config.ai--);};
$('plusAI').onclick=()=>{if(config.ai<7)requestReset(()=>config.ai++);};
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
  for(let i=0;i<speed;i++)for(const a of game.update(dt))if(a?.ok)flashes.set(a.toId,{until:now+300,captured:a.captured});
  if(selected!==null&&game.running&&!spectating&&game.cells[selected].owner!==0)selected=null;
  checkResult();renderTimer+=dt;
  if(renderTimer>.1){render();renderTimer=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
