import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const base='https://liondapp.1ion.top',output=resolve('artifacts/delivery-20261006/site-live');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [name,width,height,language] of [['desktop',1440,1000,'en'],['mobile',393,852,'en'],['mobile-zh',393,852,'zh']]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(language=>localStorage.setItem('liondapp-language',language),language);
    const response=await page.goto(base);assert.equal(response.status(),200);
    await page.locator('.catalog-card').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:resolve(output,name+'-home.png'),fullPage:true});
    await page.locator('#catalog-query').fill('Lionance');await page.locator('#catalog-search button').click();
    await page.waitForResponse(r=>r.url().includes('/api/catalog?q=Lionance')&&r.status()===200);
    await page.getByRole('heading',{name:'Lionance',exact:true}).waitFor();
    await page.locator('#tester-count').fill('100');await page.locator('#tester-reward').fill('10');
    assert.equal(await page.locator('#total-deposit').textContent(),'1,100 SKR');
    for(const path of ['/terms/','/privacy/','/community/','/support/']) {
      const response=await page.goto(base+path);assert.equal(response.status(),200);
      assert.equal(await page.locator('h1:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    assert.deepEqual(errors,[]);await context.close();
    console.log(name+': deployed HTML/CSP/assets, catalog binding/search, estimate and legal pages passed');
  }
  const request=await browser.newContext();
  assert.equal((await request.request.get(base+'/api/admin/users')).status(),404);
  assert.equal((await request.request.post(base+'/api/catalog',{data:{q:'example'}})).status(),405);
  const health=await (await request.request.get('https://api.liondapp.1ion.top/health')).json();
  assert.equal(health.bountyPaymentMode,'disabled');assert.equal(health.mainnetPaymentsEnabled,false);assert.equal(health.donationsEnabled,false);
  const config=await (await request.request.get('https://api.liondapp.1ion.top/v1/campaigns/config')).json();
  assert.equal(config.feeRecipient,'ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW');
  assert.equal((await request.request.get('https://liondapp-admin.pages.dev/api/admin/testing-reviews')).status(),401);
  console.log('Production gates, read-only site proxy and anonymous admin protection passed');await request.close();
}finally {await browser.close();}
