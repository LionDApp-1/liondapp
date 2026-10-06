import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('apps/site'), output = resolve('artifacts/delivery-20261006/site');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+'/')){res.writeHead(404).end();return;}
  try {res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'}).end(await readFile(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [name,width,height,language] of [['desktop',1440,1000,'en'],['mobile',393,852,'en'],['mobile-zh',393,852,'zh'],['narrow',320,740,'en']]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(language=>localStorage.setItem('liondapp-language',language),language);
    let queries=[];
    await page.route('**/api/catalog?*',route=>{
      const q=new URL(route.request().url()).searchParams.get('q');queries.push(q);
      return route.fulfill({status:q==='offline'?503:200,contentType:'application/json',body:JSON.stringify({items:q==='empty'?[]:[{package:'app.example',name:q==='unsafe'?'<img src=x onerror=alert(1)>':'Example dApp',subtitle:'A useful dApp',subtitleZh:'一款实用应用',category:'Tools',categoryZh:'工具'}]})});
    });
    await page.route('**/api/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:true,bountyPaymentMode:'disabled'})}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('.catalog-card').waitFor();
    assert.equal(await page.locator('.catalog-card img').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    assert.equal(await page.locator('html').getAttribute('lang'),language==='zh'?'zh-CN':'en');
    assert.equal(await page.locator('#total-deposit').textContent(),'1,100 SKR');
    await page.screenshot({path:resolve(output,`${name}-home.png`),fullPage:true});
    await page.locator('#tester-count').fill('3');await page.locator('#tester-reward').fill('0.000001');
    assert.equal(await page.locator('#platform-fee').textContent(),'0.000003 SKR');
    assert.equal(await page.locator('#total-deposit').textContent(),'0.000006 SKR');
    await page.locator('#tester-reward').fill('0.0000001');
    assert.equal(await page.locator('#total-deposit').textContent(),'—');
    await page.locator('#tester-reward').fill('10');
    await page.locator('#catalog-query').fill('unsafe');await page.locator('#catalog-search button').click();
    await page.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true}).waitFor();assert.equal(await page.locator('.catalog-card img').count(),0);
    await page.locator('#catalog-query').fill('empty');await page.locator('#catalog-search button').click();
    await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.includes('No matching')||document.querySelector('#catalog-status').textContent.includes('未找到'));
    await page.locator('#catalog-query').fill('offline');await page.locator('#catalog-search button').click();
    await page.locator('#catalog-retry').waitFor({state:'visible'});
    await page.locator('#catalog-query').fill('Lionance');await page.locator('#catalog-retry').click();await page.locator('.catalog-card').waitFor();
    assert.equal(queries.at(-1),'Lionance');
    await page.locator('[data-language-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('lang'),language==='zh'?'en':'zh-CN');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    for(const path of ['/terms/','/privacy/','/community/','/support/']) {
      await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
      assert.equal(await page.locator('h1:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    }
    assert.deepEqual(errors,[]);await context.close();
    console.log(`${name}: layout, locale, amounts, catalog/retry, injection and legal pages passed`);
  }
} finally {await browser.close();server.close();}
