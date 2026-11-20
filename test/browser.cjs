const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const bridge=createRequire('D:/soft/turbowarp-codex-bridge/package.json');
const {chromium}=createRequire(bridge.resolve('@playwright/mcp/package.json'))('playwright');
const root=path.resolve(__dirname,'../dist'),out=path.resolve(__dirname,'../qa');fs.mkdirSync(out,{recursive:true});
const errors=[],checks=[];let browser;
(async()=>{try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'zh-CN'});
  await context.route('http://territory.test/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.join(root,pathname==='/'?'index.html':pathname);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    let body=fs.readFileSync(file);
    if(pathname==='/app.mjs')body=Buffer.from(body.toString()+`\nglobalThis.__qa={get game(){return game},render,checkResult};`);
    await route.fulfill({status:200,body,contentType:({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://territory.test/');await p.waitForSelector('.cell');
  assert.equal(await p.locator('.cell').count(),80);assert.equal(await p.locator('.owned').count(),2);assert.equal(await p.locator('#timer').innerText(),'00:00');
  await p.screenshot({path:path.join(out,'desktop-ready.png'),fullPage:true});checks.push('equal starting positions and desktop layout');
  await p.locator('#startBtn').click();await p.locator('.cell[data-id="11"]').click();assert.equal(await p.locator('.reachable').count(),4);await p.locator('.cell[data-id="12"]').click();assert.equal(await p.locator('.cell[data-id="12"]').getAttribute('aria-pressed'),'true');assert.match(await p.locator('.cell[data-id="12"]').getAttribute('aria-label'),/你的领土/);
  await p.locator('[data-ratio="1"]').click();await p.locator('.cell[data-id="13"]').click();assert.match(await p.locator('.cell[data-id="13"]').getAttribute('aria-label'),/你的领土/);checks.push('mouse selection, adjacent capture, auto-selection and full deployment');
  await p.locator('#pauseBtn').click();const time=await p.locator('#timer').innerText();await p.waitForTimeout(1100);assert.equal(await p.locator('#timer').innerText(),time);assert.equal(await p.locator('#pauseOverlay').isVisible(),true);await p.locator('#resumeBtn').click();await p.locator('#helpBtn').click();assert.equal(await p.locator('#helpDialog').isVisible(),true);assert.equal(await p.evaluate(()=>__qa.game.paused),true);await p.locator('#helpDialog [data-close]').last().click();await p.waitForFunction(()=>!__qa.game.paused);checks.push('pause, resume, help auto-pause');
  await p.locator('#speedBtn').click();assert.equal(await p.locator('#speedBtn').innerText(),'2×');await p.waitForFunction(()=>__qa.game.stats()[1].land>1);checks.push('AI independently expands');
  await p.locator('#customTab').click();await p.locator('#cancelReset').click();assert.equal(await p.locator('#campaignTab').getAttribute('aria-selected'),'true');await p.locator('#customTab').click();await p.locator('#confirmReset').click();assert.equal(await p.locator('.cell').count(),140);await p.locator('#plusAI').click();await p.locator('#plusAI').click();await p.locator('#plusAI').click();await p.locator('#plusAI').click();assert.equal(await p.locator('#aiCount').innerText(),'7');assert.equal(await p.locator('.owned').count(),8);await p.locator('#mapSize').selectOption('18,12');assert.equal(await p.locator('.cell').count(),216);await p.locator('[data-diff="hard"]').click();assert.equal(await p.evaluate(()=>__qa.game.difficulty),'hard');checks.push('custom maps, seven opponents, hard difficulty, reset confirmation');
  await p.locator('#startBtn').click();await p.waitForTimeout(1400);await p.locator('#pauseBtn').click();await p.screenshot({path:path.join(out,'desktop-custom.png'),fullPage:true});
  await p.locator('#restartBtn').click();await p.locator('#confirmReset').click();await p.locator('#campaignTab').click();await p.locator('[data-level="5"]').click();assert.equal(await p.locator('.cell').count(),260);assert.equal(await p.locator('.owned').count(),8);checks.push('sixth level, all eight factions');
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile-large.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.locator('#mobileSetup').click();assert.equal(await p.locator('#setup').isVisible(),true);await p.locator('[data-level="0"]').click();await p.locator('#mobileSetup').scrollIntoViewIfNeeded();await p.locator('#mobileSetup').click();await p.screenshot({path:path.join(out,'mobile-ready.png'),fullPage:true});checks.push('mobile layout and mobile settings');
  await p.setViewportSize({width:1440,height:1050});await p.locator('#startBtn').click();
  // A bounded endgame fixture: victory must still be triggered through the normal cell UI.
  await p.evaluate(()=>{const g=__qa.game;g.aiTimers.fill(1e6);g.cells.forEach(c=>{c.owner=0;c.army=50;});g.cells[0].owner=-1;g.cells[0].army=0;g.paused=false;__qa.render();});
  await p.locator('.cell[data-id="1"]').click();await p.locator('.cell[data-id="0"]').click();await p.waitForSelector('#resultDialog[open]');assert.equal(await p.locator('#resultTitle').innerText(),'全境归你');assert.match(await p.locator('#completedLabel').innerText(),/1 \/ 6/);await p.screenshot({path:path.join(out,'victory.png')});await p.locator('#nextBtn').click();assert.equal(await p.locator('.cell').count(),108);checks.push('full-map victory, persistent completion and next level');
  await p.locator('#startBtn').click();await p.evaluate(()=>{__qa.game.cells.forEach(c=>{if(c.owner===0)c.owner=1;});__qa.checkResult();__qa.render();});assert.match(await p.locator('#resultTitle').innerText(),/暂别/);await p.locator('#watchBtn').click();assert.equal(await p.evaluate(()=>__qa.game.paused),false);assert.equal(await p.locator('#gameState').innerText(),'观战中');
  await p.evaluate(()=>{__qa.game.cells.forEach(c=>{c.owner=1;c.army=5;});__qa.game.checkWinner();__qa.checkResult();__qa.render();});assert.match(await p.locator('#resultTitle').innerText(),/赢得胜利/);checks.push('defeat, spectating, AI full-map victory');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
