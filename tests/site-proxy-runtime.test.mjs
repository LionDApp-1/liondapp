import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['apps/site/functions/api/[[path]].ts'],bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
const invoke=(path,fetch,method='GET')=>module.exports.onRequest({request:new Request('https://website.test'+path,{method,headers:{authorization:'Bearer private',cookie:'session=private'}}),env:{LIONDAPP_API:{fetch}}});
test('site proxy never reaches private API paths or accepts writes',async()=>{
  let calls=0;const upstream=async()=>{calls++;throw Error('must not fetch');};
  for(const path of ['/api/admin/users','/api/v1/me','/api/catalog/extra','/api/status/extra'])assert.equal((await invoke(path,upstream)).status,404);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await invoke('/api/catalog',upstream,method)).status,405);
  assert.equal((await invoke('/api/catalog?q='+ 'x'.repeat(101),upstream)).status,400);assert.equal(calls,0);
});
test('public catalog queries are bounded and credentials and metadata secrets are stripped',async()=>{
  const response=await invoke('/api/catalog?q=A%26limit%3D1000',async(...args)=>{
    assert.equal(args.length,1);const url=new URL(args[0]);assert.equal(url.hostname,'liondapp-api.internal');assert.equal(url.searchParams.get('limit'),'12');assert.equal(url.searchParams.get('q'),'A&limit=1000');
    return Response.json({items:Array.from({length:15},(_,i)=>({android_package:'app.'+i,display_name:'App '+i,subtitle:'Useful',wallet:'private',secret:'private',publisher_website:'javascript:alert(1)'}))});
  });
  const data=await response.json();assert.equal(data.items.length,12);assert.equal(data.items[0].wallet,undefined);assert.equal(data.items[0].publisher_website,undefined);
  assert.match(response.headers.get('cache-control'),/max-age=60/);
});
test('site availability never exposes upstream diagnostics and fails closed on outage',async()=>{
  const response=await invoke('/api/status',async()=>Response.json({bountyPaymentMode:'disabled',rpcUrl:'credential',internal:'private'}));
  const body=await response.json();assert.equal(body.available,true);assert.equal(body.bountyPaymentMode,'disabled');assert.equal(body.rpcUrl,undefined);
  const failed=await invoke('/api/status',async()=>new Response('private diagnostic',{status:500}));assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'service_unavailable'});assert.equal(failed.headers.get('cache-control'),'no-store');
});
