import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium }=createRequire(import.meta.url)('playwright');

const root=resolve('apps/admin');
const output=resolve(process.env.LIONDAPP_VERIFICATION_OUTPUT || 'artifacts/delivery-20261006/admin');
await mkdir(output,{recursive:true});
const server=createServer(async(request,response)=>{
  const path=resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+'/')){response.writeHead(404).end();return;}
  try {
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream';
    response.writeHead(200,{'content-type':type}).end(await readFile(path));
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [name,width,height,language] of [['desktop',1440,900,'en'],['mobile',390,844,'en'],['mobile-zh',390,844,'zh']]) {
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    const errors=[];let resolved=false;let resolution;
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(language=>localStorage.setItem('liondapp-admin-language',language),language);
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      let body={items:[]};
      if(path==='/api/admin/auth/status')body={authenticated:true,username:'qa-operator'};
      if(path==='/api/admin/testing-reviews')body={paymentMode:'simulation',items:resolved?[]:[{id:'result',campaign_id:'campaign',revision:3,status:'disputed',title:'Test the daily interaction on Seeker',app_name:'Lionance',app_version:'1.0',tester_skr:'tester.skr',funding_state:'simulated',requirements:'Complete a daily interaction on Seeker. Describe confirmation, loading and retry behavior. Both positive and negative feedback qualify.',body:'The flow opened quickly and the confirmation was clear. I tested connection loss and found that the retry message could be more specific.',review_reason:'The retry behavior needs more detail.',appeal_reason:'The report includes the retry steps and observed result.',evidence_url:''}]};
      if(path==='/api/admin/testing-entries/result/resolve') {
        resolution=route.request().postDataJSON();resolved=true;body={status:'approved',revision:4};
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/#testing`);
    const approve=language==='zh'?'通过成果':'Approve result';
    await page.getByRole('button',{name:approve,exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    await page.screenshot({path:resolve(output,`${name}-dispute.png`),fullPage:true});
    await page.getByRole('button',{name:approve,exact:true}).click();
    await page.locator('#confirm-action').click();
    assert.equal(resolution,undefined);
    await page.locator('#confirm-note').fill('Verified that the report satisfies the published criteria.');
    await page.locator('#confirm-action').click();
    await page.locator('#confirm-dialog').waitFor({state:'hidden'});
    assert.equal(resolution.approve,true);assert.equal(resolution.revision,3);
    assert.deepEqual(errors,[]);
    console.log(`${name}: layout, required reason and dispute resolution passed`);
    await context.close();
  }
}finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
