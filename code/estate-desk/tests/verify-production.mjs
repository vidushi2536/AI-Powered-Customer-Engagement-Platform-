// Deterministic, synthetic-only verification of the saved production worker.
// Run inside the hardened Linux Docker worker, with this project as cwd.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {access, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {resolve, join, relative, isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.platform,'linux','This runner must execute in Docker, never on Windows.');
await access('/.dockerenv');
const root=process.cwd(), output=resolve('artifacts/production-verification');
const runtime='/runtime/estate-desk-verification', statePath=join(runtime,'state');
await mkdir(output,{recursive:true});
// This exact runner-owned directory contains disposable synthetic state only.
await rm(runtime,{recursive:true,force:true});await mkdir(runtime,{recursive:true});
for(const name of ['tmp','home','cache','npm-cache','config']) await mkdir(join(runtime,name),{recursive:true});
Object.assign(process.env,{CI:'1',GOMAXPROCS:'2',RAYON_NUM_THREADS:'2',TOKIO_WORKER_THREADS:'2',UV_THREADPOOL_SIZE:'2',NODE_OPTIONS:'--max-old-space-size=1024',TMPDIR:join(runtime,'tmp'),TMP:join(runtime,'tmp'),TEMP:join(runtime,'tmp'),HOME:join(runtime,'home'),XDG_CACHE_HOME:join(runtime,'cache'),XDG_CONFIG_HOME:join(runtime,'config'),WRANGLER_SEND_METRICS:'false',CLOUDFLARE_SEND_METRICS:'false',npm_config_cache:join(runtime,'npm-cache'),npm_config_jobs:'2',npm_config_maxsockets:'4',npm_config_fetch_retries:'1',npm_config_fetch_retry_mintimeout:'1000',npm_config_fetch_retry_maxtimeout:'5000',npm_config_fetch_timeout:'45000'});
// Preserve the trusted worker proxy; never copy host credentials into child env.
if(process.env.HTTPS_PROXY||process.env.https_proxy) process.env.npm_config_https_proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
if(process.env.HTTP_PROXY||process.env.http_proxy) process.env.npm_config_proxy=process.env.HTTP_PROXY||process.env.http_proxy;
const deadline=Date.now()+14*60*1000;
const report={startedAt:new Date().toISOString(),scope:'Saved production SSR worker, disposable local D1, synthetic-only data. No deployment or live messaging.',rebuild:false,gates:[],commands:[],browserErrors:[],screenshots:[],externalRequests:[],limitations:['Google OAuth and actual WhatsApp/OpenClaw connections are not exercised.','Completed manager workspaces are synthetic D1 fixtures; they do not demonstrate a real WhatsApp onboarding connection.','Passing tests do not establish real-world AI efficacy.']};
report.fontResources=[];report.limitations.push('Google Fonts are intentionally omitted in this offline browser verification. Screenshots use the application CSS fallback fonts; branded webfont fidelity is not verified.');
const expectedFontURL=value=>{try{return ['fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(value).hostname);}catch{return false;}};
let server, miniflare, browser, context, page, active='setup', expectedNetworkFailure=false;
let runtimeLog='';
function recordRuntime(message){runtimeLog=(runtimeLog+new Date().toISOString()+' '+String(message)+'\n').slice(-32000);}
async function resources(){const result={node:process.memoryUsage(),pid:process.pid};for(const file of ['/sys/fs/cgroup/memory.current','/sys/fs/cgroup/memory.peak','/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory.events','/sys/fs/cgroup/pids.current','/sys/fs/cgroup/pids.max'])try{result[file]=String(await readFile(file,'utf8')).trim();}catch{}result.processes=[];for(const pid of (await readdir('/proc')).filter(x=>/^\d+$/.test(x))){try{const status=await readFile(`/proc/${pid}/status`,'utf8');result.processes.push({pid:Number(pid),name:status.match(/^Name:\s*(.*)/m)?.[1],ppid:status.match(/^PPid:\s*(.*)/m)?.[1],rss:status.match(/^VmRSS:\s*(.*)/m)?.[1],threads:status.match(/^Threads:\s*(.*)/m)?.[1]});}catch{}}return result;}
const managed=new Set();
const log=message=>console.log(`[verification] ${message}`);
const hash=value=>createHash('sha256').update(value).digest('hex');
const remaining=()=>Math.max(1,deadline-Date.now());
const exists=async file=>access(file).then(()=>true,()=>false);
const watchdog=setTimeout(()=>{report.deadlineExceeded=true;void browser?.close().catch(()=>{});void miniflare?.dispose().catch(()=>{});for(const child of [...managed])void stop(child);},remaining());
async function save(){await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
async function stop(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const done=once(child,'close').catch(()=>{});
  try{process.kill(-child.pid,'SIGTERM');}catch{}
  let ended=false;await Promise.race([done.then(()=>{ended=true;}),delay(4000)]);
  if(!ended){try{process.kill(-child.pid,'SIGKILL');}catch{}await done;}
  managed.delete(child);
}
async function command(name,args,{timeout=90000,allowFailure=false}={}){
  log(name);const begin=Date.now(), file=join(output,`${name}.log`);
  const stream=createWriteStream(file);const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],detached:true});managed.add(child);
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
  let timedOut=false, spawnError;
  child.on('error',error=>{spawnError=error;});
  const timer=setTimeout(()=>{timedOut=true;void stop(child);},Math.min(timeout,remaining()));
  const [code,signal]=await once(child,'close');clearTimeout(timer);managed.delete(child);stream.end();await once(stream,'close');
  const result={name,args,exitCode:code,signal,timedOut,elapsedMs:Date.now()-begin,log:relative(root,file),...(spawnError?{spawnError:String(spawnError)}:{})};report.commands.push(result);await save();
  if(!allowFailure)assert.ok(code===0&&!timedOut&&!spawnError,`${name} failed: ${JSON.stringify(result)}`);
  return result;
}
async function gate(name,fn,{fatal=false}={}){
  active=name;log(name);const begin=Date.now(),startErrors=report.browserErrors.length;
  try{assert.ok(remaining()>1,'Verification deadline reached');const detail=await fn();assert.equal(report.browserErrors.length,startErrors,'Unexpected browser runtime/network error');report.gates.push({name,status:'passed',elapsedMs:Date.now()-begin,detail});}
  catch(error){const failure={name,status:'failed',elapsedMs:Date.now()-begin,error:error.stack||String(error),runtimeLogTail:runtimeLog.slice(-6000),resources:await resources()};if(page){try{const filename=`failure-${report.gates.length}.png`;await page.screenshot({path:join(output,filename),fullPage:true,timeout:12000});failure.screenshot=filename;}catch{}}report.gates.push(failure);log(JSON.stringify({failedGate:failure}));await save();if(fatal)throw error;}
  await save();
}
const port=Number(process.env.ESTATE_VERIFY_PORT||3000);
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
const base=`http://127.0.0.1:${port}`, syncSecret='synthetic-verification-only-not-a-live-secret';
const tokens={a:'synthetic-manager-a-local-only',b:'synthetic-manager-b-local-only',empty:'synthetic-empty-local-only'};
const owners={a:'+12025550100',b:'+12025550200',empty:'+12025550300'};
const buyer='+12025550101', optedOut='+12025550103';
const headers=key=>({'Content-Type':'application/json',Origin:base,...(key?{Cookie:`estate_session=${tokens[key]||key}`}:{})});
async function api(path,{method='GET',body,key,expected=200,extraHeaders={}}={}){
  assert.ok(remaining()>1,'Verification deadline reached');
  const response=await fetch(base+path,{method,headers:{...headers(key),...extraHeaders},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(12000)});
  const raw=await response.text();let value;try{value=JSON.parse(raw);}catch{value=raw;}
  assert.equal(response.status,expected,`${method} ${path}: ${raw.slice(0,1500)}`);
  return {response,value};
}
const workspace=async key=>(await api('/api/workspace',{key})).value;
const action=async(body,key='a',expected=200)=>(await api('/api/workspace',{method:'POST',key,body,expected})).value;
async function event(id,direction,text,{phone=buyer,expected=200,key='a'}={}){
  return api('/api/whatsapp/events',{method:'POST',expected,body:{id,direction,text,channelId:'whatsapp',accountId:'synthetic-only',ownerPhone:owners[key],contactPhone:phone,timestamp:new Date().toISOString()},extraHeaders:{Authorization:`Bearer ${syncSecret}`}});
}
async function selectSession(key){await context.clearCookies();if(key)await context.addCookies([{name:'estate_session',value:tokens[key],url:base,httpOnly:true,sameSite:'Lax'}]);}
async function go(path,selector='.manager-shell'){
  assert.ok(remaining()>1,'Verification deadline reached');
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:25000});assert.equal(response.status(),200,path);await page.locator(selector).waitFor({timeout:20000});await page.evaluate(()=>document.fonts.ready);return response;
}
async function screenshot(name){
  assert.ok(remaining()>1,'Verification deadline reached');
  const filename=`${name}.png`;await page.screenshot({path:join(output,filename),fullPage:true,timeout:15000});
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,title:document.title,headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent.trim())}));
  report.screenshots.push({file:filename,url:page.url(),...metrics});assert.ok(metrics.pageWidth<=metrics.width+1,`Horizontal page overflow: ${JSON.stringify(metrics)}`);return metrics;
}

try{
  await gate('Saved baseline source and bundle audited; changed source requires fresh build',async()=>{
    const manifest=JSON.parse(await readFile('artifacts/stage1-20261030/transfer-manifest.json','utf8'));assert.ok(Array.isArray(manifest.files));
    const included=manifest.files.filter(f=>/^(app\/|lib\/|db\/|drizzle\/|data\/|public\/|components\/|hooks\/|dist\/)/.test(f.path)||/^(package(-lock)?\.json|tsconfig\.json|vite\.config\.ts|next\.config\.ts)$/.test(f.path));
    assert.ok(included.some(f=>f.path==='dist/server/index.js'));assert.ok(included.some(f=>f.path==='app/workspace-app.tsx'));
    const differences=[];
    for(const file of included){const target=resolve(root,file.path);assert.ok(target.startsWith(root+'/')&&!isAbsolute(file.path));try{const data=await readFile(target);if(hash(data)!==file.sha256)differences.push(file.path);}catch{differences.push(file.path);}}
    report.requiresRebuild=differences.length>0;report.rebuild=report.requiresRebuild;report.baselineAudit={manifestGeneratedAt:manifest.generatedAt,verifiedFiles:included.length,differences,originalManifestUnchanged:true};
    return {...report.baselineAudit,requiresRebuild:report.requiresRebuild,method:report.requiresRebuild?'Baseline differences recorded; fresh production build required before runtime checks':'SHA256 source plus complete saved dist match the same successful build manifest; no rebuild needed'};
  },{fatal:true});
  await gate('Locked dependency installation, at most two attempts',async()=>{
    const npmCandidates=[process.env.ESTATE_NPM_CLI,'/usr/local/lib/node_modules/npm/bin/npm-cli.js','/usr/share/nodejs/npm/bin/npm-cli.js'].filter(Boolean);let npm;
    for(const candidate of npmCandidates)if(await exists(candidate)){npm=candidate;break;}assert.ok(npm,'npm CLI entrypoint not found; supply ESTATE_NPM_CLI');
    let result;for(let attempt=1;attempt<=2;attempt++){result=await command(`npm-ci-attempt-${attempt}`,[npm,'ci','--no-audit','--no-fund','--prefer-offline','--foreground-scripts'],{timeout:210000,allowFailure:true});if(result.exitCode===0&&!result.timedOut)break;if(remaining()<180000)break;}
    await rm(join(runtime,'npm-cache'),{recursive:true,force:true});assert.equal(result.exitCode,0,'Locked dependency installation failed');assert.equal(result.timedOut,false);return {attempts:report.commands.filter(c=>c.name.startsWith('npm-ci')).length,cacheRemoved:true};
  },{fatal:true});
  if(report.requiresRebuild)await gate('Fresh production build for changed application source',async()=>{
    const result=await command('production-build',['node_modules/vinext/dist/cli.js','build'],{timeout:240000});
    const sourceHashes={};for(const file of ['app/workspace-app.tsx','app/landing.tsx'])sourceHashes[file]=hash(await readFile(file));
    report.freshBuild={completedAt:new Date().toISOString(),exitCode:result.exitCode,sourceHashes,serverBundleSHA256:hash(await readFile('dist/server/index.js')),originalStage1ManifestRewritten:false};
    await writeFile(join(output,'fresh-build.json'),JSON.stringify(report.freshBuild,null,2));return report.freshBuild;
  },{fatal:true});
  await gate('TypeScript',async()=>command('typecheck',['node_modules/typescript/lib/tsc.js','--noEmit','--incremental','false'],{timeout:90000}));
  await gate('Domain unit tests',async()=>{
    const result=await command('domain',[ '--experimental-strip-types','--test','--test-concurrency=1','tests/domain.test.ts'],{timeout:60000});const contents=await readFile(join(output,'domain.log'),'utf8');assert.match(contents,/# tests 13\b/);assert.match(contents,/# pass 13\b/);return result;
  });
  const configPath=join(runtime,'wrangler.json');
  await gate('Disposable D1 migrations and explicitly synthetic fixtures',async()=>{
    const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));assert.ok(config.d1_databases?.some(db=>db.binding==='DB'));
    // Absolute local paths preserve the exact saved worker/assets; all secrets absent.
    config.main=resolve('dist/server',config.main);config.assets={...config.assets,directory:resolve('dist/server',config.assets.directory)};config.vars={WHATSAPP_SYNC_SECRET:syncSecret};config.dev={...config.dev,ip:'127.0.0.1',enable_containers:false};
    config.name='estate-desk-synthetic-verification';delete config.build;delete config.observability;
    for(const name of ['services','r2_buckets','kv_namespaces','queues','hyperdrive','ai','ai_search','ai_search_namespaces','workflows','secrets_store_secrets','send_email','mtls_certificates','pipelines','vpc_services','vpc_networks'])delete config[name];
    await writeFile(configPath,JSON.stringify(config,null,2));
    const {Miniflare,Log,LogLevel,Response:MFResponse}=await import('miniflare');
    class CapturedLog extends Log{logWithLevel(level,message){if(level<=LogLevel.INFO)recordRuntime(message);}logReady(message){recordRuntime(message);}}
    // Vinext's saved chunks contain computed import() specifiers. Register the
    // complete saved module graph explicitly so Miniflare does not attempt to
    // statically infer those targets or reject a valid production bundle.
    const moduleRoot=resolve('dist/server'), moduleFiles=[];
    async function listModules(directory){
      for(const entry of await readdir(directory,{withFileTypes:true})){
        const path=join(directory,entry.name);assert.ok(!entry.isSymbolicLink(),'Saved module graph must not contain links');
        if(entry.isDirectory())await listModules(path);else if(entry.isFile())moduleFiles.push(path);
      }
    }
    await listModules(moduleRoot);
    moduleFiles.sort((a,b)=>a===config.main?-1:b===config.main?1:a.localeCompare(b));
    assert.equal(moduleFiles[0],config.main,'The saved main worker must be the first explicit module');
    const modules=[];
    for(const path of moduleFiles){
      const data=await readFile(path);
      if(/\.(?:m?js)$/.test(path))modules.push({type:'ESModule',path,contents:data.toString('utf8')});
      else if(/\.json$/.test(path))modules.push({type:'CommonJS',path,contents:'module.exports = '+JSON.stringify(JSON.parse(data.toString('utf8')))+';'});
      else if(/\.wasm$/.test(path))modules.push({type:'CompiledWasm',path,contents:new Uint8Array(data)});
      else if(/\.(?:css|txt|html|map)$/.test(path)||path===join(moduleRoot,'BUILD_ID'))modules.push({type:'Text',path,contents:data.toString('utf8')});
      else modules.push({type:'Data',path,contents:new Uint8Array(data)});
    }
    report.explicitModules={count:modules.length,entrypoint:relative(moduleRoot,modules[0].path),types:modules.reduce((all,module)=>{all[module.type]=(all[module.type]||0)+1;return all;},{})};
    miniflare=new Miniflare({name:config.name,host:'127.0.0.1',port,modules,modulesRoot:moduleRoot,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:config.vars,d1Databases:{DB:config.d1_databases.find(db=>db.binding==='DB').database_id},d1Persist:statePath,assets:{directory:config.assets.directory,binding:'ASSETS',routerConfig:{has_user_worker:true}},cf:false,log:new CapturedLog(LogLevel.INFO),outboundService:async request=>{report.externalRequests.push({gate:active,url:request.url,blocked:true,source:'worker'});return new MFResponse('External services disabled during synthetic verification',{status:503});}});
    await miniflare.ready;
    const domain=await readFile('lib/domain.ts','utf8');const dataset=domain.match(/DATASET_VERSION\s*=\s*'([^']+)'/)?.[1];assert.ok(dataset);
    const at=new Date().toISOString(),future=new Date(Date.now()+7*86400000).toISOString();
    const property={id:'SYNTH-001',society:'Synthetic Riverside Residence',location:'Synthetic Sector 107, Gurugram',bedrooms:2,sqft:1100,bathrooms:2,balconies:1,priceLakhs:80,areaType:'Apartment',source:'Your CSV',availability:'Synthetic verification only',image:'/images/interior-warm.jpg'};
    function fixture(key){const empty=key==='empty';const contacts=empty?[]:[{phone:buyer,name:key==='b'?'Synthetic Tenant B Buyer':'Synthetic Ready Client',consent:'inbound-only',addedAt:at},{phone:optedOut,name:'Synthetic Opted Out',consent:'opted-out',addedAt:at}];return {ownerPhone:owners[key],onboardingComplete:true,contacts,leads:contacts.map(c=>({phone:c.phone,name:c.name,status:c.consent==='opted-out'?'Opted out':'Viewing proposed',requirements:c.consent==='opted-out'?{}:{budget:90,bedrooms:2,timeline:'This month'},messages:[],interestedId:c.consent==='opted-out'?null:'SYNTH-001',meeting:c.consent==='opted-out'?null:{propertyId:'SYNTH-001',date:future,note:'Synthetic proposal, not a real booking',status:'proposed'},blocked:0,updatedAt:at})),phone:owners[key],phoneMode:'demo',crm:true,agentEnabled:false,requirements:{},messages:[],properties:empty?[]:[{...property,...(key==='b'?{location:'Synthetic Tenant B Private Listing'}:{})}],datasetVersion:dataset,status:'New',interestedId:null,meeting:null,blocked:0,updatedAt:at,note:'Synthetic verification fixture, no live contacts or services.',whatsapp:{accountId:'unlinked',senderPhone:null,lastEventAt:null,connected:false,provider:'openclaw',status:'disconnected'}};}
    const quote=value=>`'${String(value).replaceAll("'","''")}'`;
    let sql='';for(const filename of (await readdir('drizzle')).filter(f=>/^\d+.*\.sql$/.test(f)).sort())sql+='\n'+await readFile(join('drizzle',filename),'utf8');
    for(const key of ['a','b','empty']){const id=`synthetic-${key}`,data=fixture(key);sql+=`\nINSERT INTO workspaces(id,state,revision,updated_at) VALUES(${quote(id)},${quote(JSON.stringify(data))},0,${quote(at)});\nINSERT INTO phone_owners(phone,workspace_id,verified,updated_at) VALUES(${quote(owners[key])},${quote(id)},0,${quote(at)});\nINSERT INTO app_sessions(token_hash,workspace_id,expires,created_at) VALUES(${quote(hash(tokens[key]))},${quote(id)},${Date.now()+86400000},${quote(at)});`;for(const c of data.contacts)sql+=`\nINSERT INTO workspace_contacts(phone,workspace_id,name,consent,created_at) VALUES(${quote(c.phone)},${quote(id)},${quote(c.name)},${quote(c.consent)},${quote(at)});`;}
    const sqlPath=join(runtime,'synthetic-schema.sql');await writeFile(sqlPath,sql);
    const db=await miniflare.getD1Database('DB');const statements=sql.replaceAll('--> statement-breakpoint','').split(';').map(s=>s.trim()).filter(Boolean);await db.batch(statements.map(statement=>db.prepare(statement)));return {statePath,syntheticWorkspaces:3,realSessionChecks:true,allIntegrationsDisconnected:true,migrationStatements:statements.length,runtime:'Direct Miniflare, no dev proxy or filesystem watchers'};
  },{fatal:true});
  await gate('Saved SSR worker starts and becomes ready',async()=>{
    assert.ok(miniflare,'Direct production runtime missing');await miniflare.ready;
    const end=Date.now()+Math.min(75000,remaining());let last;
    while(Date.now()<end){try{const r=await fetch(base+'/api/auth',{signal:AbortSignal.timeout(2000)});last=r.status;if(r.status===200&&JSON.parse(await r.text()).authenticated===false)return {base,endpoint:'/api/auth',status:200,runtime:'Direct Miniflare',resources:await resources()};}catch(error){last=String(error);}await delay(750);}
    throw new Error(`SSR readiness timeout: ${last}`);
  },{fatal:true});
  await gate('Real auth endpoint, cookie attributes, invalid token and origin rejection',async()=>{
    await api('/api/workspace',{expected:401});await api('/api/workspace',{key:'invalid',expected:401});await api('/api/workspace',{method:'POST',body:{action:'agent',enabled:false},expected:401});
    await api('/api/auth',{method:'POST',body:{action:'send',phone:'+12025550110'},extraHeaders:{Origin:'https://untrusted.invalid'},expected:403});
    const send=await api('/api/auth',{method:'POST',body:{action:'send',phone:'+12025550110'}});assert.equal(send.value.mode,'demo');
    await api('/api/auth',{method:'POST',body:{action:'verify',phone:'+12025550110',code:'000000'},expected:400});
    const verified=await api('/api/auth',{method:'POST',body:{action:'verify',phone:'+12025550110',code:'123456'}});const cookie=verified.response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);const token=decodeURIComponent(cookie.match(/estate_session=([^;]+)/)[1]);tokens.onboarding=token;
    assert.equal((await api('/api/auth',{key:'onboarding'})).value.authenticated,true);
    await api('/api/auth',{method:'DELETE',key:'onboarding'});assert.equal((await api('/api/auth',{key:'onboarding'})).value.authenticated,false);
    // Re-authenticate using a new challenge; prior challenge was consumed.
    await api('/api/auth',{method:'POST',body:{action:'send',phone:'+12025550110'}});const again=await api('/api/auth',{method:'POST',body:{action:'verify',phone:'+12025550110',code:'123456'}});tokens.onboarding=decodeURIComponent(again.response.headers.get('set-cookie').match(/estate_session=([^;]+)/)[1]);
    return {demoOnly:true,cookieHttpOnly:true,logoutInvalidatesSession:true};
  });
  await gate('Tenant isolation, consent, validation and legitimate manager mutations',async()=>{
    const a=await workspace('a'),b=await workspace('b');assert.equal(a.state.contacts[0].phone,b.state.contacts[0].phone);assert.notEqual(a.state.properties[0].location,b.state.properties[0].location);assert.ok(!JSON.stringify(a).includes('Tenant B Private'));
    await action({action:'addContacts',consentConfirmed:false,contacts:[{phone:'+12025550104',name:'Synthetic denied'}]},'a',400);
    await action({action:'addContacts',consentConfirmed:true,contacts:[{phone:'bad',name:'Synthetic invalid'}]},'a',400);
    await action({action:'addProperties',properties:[{location:'Synthetic bad',bedrooms:2,sqft:0,priceLakhs:80}]},'a',400);
    await api('/api/workspace',{method:'POST',key:'a',body:{action:'agent',enabled:true},extraHeaders:{Origin:'https://untrusted.invalid'},expected:400});
    await action({action:'note',note:'Synthetic tenant A private note'});assert.ok(!(await workspace('b')).state.note.includes('tenant A'));
    await action({action:'chat',text:'This must not become a message'},'a',400);
    await api('/api/whatsapp/cloud/test',{method:'POST',key:'a',body:{phone:buyer,text:'Synthetic disabled test'},expected:410});
    return {sharedBuyerDoesNotShareTenantState:true,consentRequired:true,invalidValuesRejected:true,webChatDisabled:true};
  });
  await gate('Local synthetic event consent lifecycle, deduplication and grounded meetings',async()=>{
    await action({action:'agent',enabled:true});assert.equal((await workspace('a')).state.agentEnabled,true,'Synthetic event lifecycle requires an enabled local property agent');
    await event('synthetic-cold','sent','Synthetic no-cold-outreach',{expected:403});await event('synthetic-inbound','received','I need a 2 BHK under 90 lakh in sector 107 this month.');const duplicate=await event('synthetic-inbound','received','Duplicate test');assert.equal(duplicate.value.duplicate,true);
    await event('synthetic-outbound','sent','Synthetic local reply only.');await event('synthetic-stop','received','STOP');assert.equal((await workspace('a')).state.contacts.find(c=>c.phone===buyer).consent,'opted-out');await event('synthetic-blocked','sent','Blocked reply',{expected:403});await event('synthetic-start','received','START');
    await event('synthetic-unknown','received','Synthetic unknown contact',{phone:'+12025550999',expected:403});
    await action({action:'meeting',phone:optedOut,propertyId:'SYNTH-001',date:new Date(Date.now()+86400000).toISOString()},'a',400);await action({action:'meeting',phone:buyer,propertyId:'not-in-catalog',date:new Date(Date.now()+86400000).toISOString()},'a',400);await action({action:'meeting',phone:buyer,propertyId:'SYNTH-001',date:'2020-01-01T00:00:00Z'},'a',400);
    await action({action:'meeting',phone:buyer,propertyId:'SYNTH-001',date:new Date(Date.now()+7*86400000).toISOString(),note:'Synthetic proposal only'});assert.equal((await workspace('a')).state.leads.find(l=>l.phone===buyer).meeting.status,'proposed');
    assert.equal((await workspace('b')).state.messages.length,0);return {outboundNetworkMessaging:false,syntheticHttpOnly:true,stopBlocksSent:true,duplicateIgnored:true,meetingCatalogAndConsentValidated:true};
  });
  await gate('Authenticated SSE snapshot and static CSV downloads',async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
    try{const response=await fetch(base+'/api/workspace/stream',{headers:headers('a'),signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);reader=response.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/"insights"/);}finally{await reader?.cancel();controller.abort();clearTimeout(timer);}
    for(const path of ['/crm-template.csv','/property-template.csv']){const r=await fetch(base+path,{signal:AbortSignal.timeout(8000)});assert.equal(r.status,200);assert.match(await r.text(),/phone|location/);}return {sseSnapshot:true,readerCancelled:true};
  });
  await gate('One sequential Chromium browser starts',async()=>{
    const {chromium}=await import('/opt/browser/node_modules/playwright/index.mjs');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run']});context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(12000);
    await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:','about:'].includes(url.protocol))return route.continue();if(expectedFontURL(url.href)){report.fontResources.push({url:url.href,gate:active,intentionallyOmitted:true,fallbackFonts:true});if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* External webfonts intentionally omitted in offline verification; application fallback font stack applies. */'});return route.abort();}report.externalRequests.push({url:url.href,gate:active,blocked:true});return route.abort();});
    page.on('pageerror',error=>report.browserErrors.push({gate:active,type:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error'&&!expectedNetworkFailure&&!expectedFontURL(message.location().url))report.browserErrors.push({gate:active,type:'console',message:message.text(),location:message.location()});});page.on('response',response=>{if(response.status()>=400&&!expectedNetworkFailure&&!expectedFontURL(response.url()))report.browserErrors.push({gate:active,type:'http',status:response.status(),url:response.url()});});
    return {browserCount:1,contextCount:1,pageCount:1,externalBrowserRequestsBlocked:true};
  },{fatal:true});
  for(const width of [1440,390]){
    await gate(`Actual landing at ${width}px`,async()=>{
      await page.setViewportSize({width,height:width===1440?1000:844});await selectSession(null);await go('/','.landing-shell');await screenshot(`landing-${width}`);
    });
    await gate(`Actual onboarding at ${width}px`,async()=>{
      assert.ok(tokens.onboarding,'Real local auth gate did not produce onboarding session');await selectSession('onboarding');await go('/onboarding','.setup-shell');await screenshot(`onboarding-${width}`);
    });
    for(const section of ['dashboard','clients','properties','meetings'])await gate(`Actual ${section} at ${width}px`,async()=>{await selectSession('a');await go('/'+section);assert.equal(new URL(page.url()).pathname,'/'+section);return screenshot(`${section}-${width}`);});
    await gate(`Legacy route redirects at ${width}px`,async()=>{
      await selectSession('a');
      for(const [old,current] of [['leads','clients'],['viewings','meetings'],['trends','properties']]){await go('/'+old);assert.equal(new URL(page.url()).pathname,'/'+current);}
      return {redirects:3};
    });
  }
  await gate('Actual workspace link navigation without optional prefetch',async()=>{
    await selectSession('a');await go('/dashboard');
    await page.getByRole('button',{name:'Open Estate Desk navigation',exact:true}).click();const navigation=page.getByRole('dialog',{name:'Estate Desk navigation',exact:true});await navigation.waitFor();
    await navigation.locator('a[href="/clients"]').click();await page.waitForURL(base+'/clients');await page.locator('.manager-shell').waitFor();await navigation.waitFor({state:'hidden'});
    assert.equal(new URL(page.url()).pathname,'/clients');return {actualClientNavigation:true,errorsStillStrict:true};
  });
  await gate('Browser client add/search/detail and property add/search',async()=>{
    await page.setViewportSize({width:1440,height:1000});await selectSession('a');await go('/clients');
    await page.getByRole('button',{name:'Add leads',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByPlaceholder('Client name').fill('Synthetic UI Client');await dialog.getByPlaceholder('+91 77559 71789').fill('+12025550104');const submit=dialog.getByRole('button',{name:'Add client',exact:true});assert.equal(await submit.isDisabled(),true);await dialog.getByRole('checkbox').check();
    const added=page.waitForResponse(r=>r.url()===base+'/api/workspace'&&r.request().method()==='POST');await submit.click();assert.equal((await added).status(),200);await dialog.waitFor({state:'hidden'});assert.ok((await workspace('a')).state.contacts.some(c=>c.name==='Synthetic UI Client'));assert.ok(!(await workspace('b')).state.contacts.some(c=>c.name==='Synthetic UI Client'));
    await page.getByRole('textbox',{name:'Search leads and clients',exact:true}).fill('Synthetic UI Client');
    // Current component selects a unique search result immediately; otherwise open its actual lead-card button.
    if(await page.getByRole('button',{name:'Open Synthetic UI Client',exact:true}).count())await page.getByRole('button',{name:'Open Synthetic UI Client',exact:true}).click();
    await page.locator('.client-action-panel').getByRole('heading',{name:'Synthetic UI Client',exact:true}).waitFor();await screenshot('client-detail-desktop');
    await go('/properties');await page.getByRole('button',{name:'Add properties',exact:true}).first().click();const propertyDialog=page.getByRole('dialog');await propertyDialog.getByPlaceholder('Sector 57, Gurugram').fill('Synthetic UI Sector 58');await propertyDialog.getByLabel('Bedrooms',{exact:true}).fill('3');await propertyDialog.getByLabel('Area (sq ft)',{exact:true}).fill('1500');await propertyDialog.getByLabel('Price (₹ lakh)',{exact:true}).fill('120');const propertyAdded=page.waitForResponse(r=>r.url()===base+'/api/workspace'&&r.request().method()==='POST');await propertyDialog.getByRole('button',{name:'Add property',exact:true}).click();assert.equal((await propertyAdded).status(),200);await propertyDialog.waitFor({state:'hidden'});await page.getByRole('textbox',{name:'Search property information'}).fill('Synthetic UI Sector 58');await page.locator('.property-intelligence-card').filter({hasText:'Synthetic UI Sector 58'}).waitFor();assert.equal(await page.locator('.property-intelligence-card').count(),1);await screenshot('property-search-desktop');
    return {clientCreatedThroughUI:true,consentCheckboxRequired:true,tenantBUnchanged:true,clientDetailOpened:true,propertyCreatedThroughUI:true,propertySearch:true};
  });
  await gate('Browser schedules proposed meeting, confirms and persists status',async()=>{
    await selectSession('a');await go('/meetings');const form=page.locator('form.scheduler-card');const options=await form.getByRole('combobox',{name:/^Buyer(?:\s|$)/}).locator('option').allTextContents();assert.ok(options.length>1,'Expected actual eligible buyer options');assert.match(options.join(' '),/Synthetic UI Client/);assert.ok(!options.some(o=>o.includes('Synthetic Opted Out')));await form.getByRole('combobox',{name:/^Buyer(?:\s|$)/}).selectOption('+12025550104');await form.getByRole('combobox',{name:/^Verified property(?:\s|$)/}).selectOption('SYNTH-001');const future=new Date(Date.now()+8*86400000).toISOString().slice(0,16);await form.getByLabel('Date and time',{exact:true}).fill(future);await form.getByLabel('Visit note',{exact:true}).fill('Synthetic browser proposal only');
    const proposed=page.waitForResponse(r=>r.url()===base+'/api/workspace'&&r.request().method()==='POST');await form.getByRole('button',{name:'Propose viewing',exact:true}).click();assert.equal((await proposed).status(),200);const card=page.locator('.viewing-list>article').filter({hasText:'Synthetic UI Client'});await card.locator('.viewing-label.proposed').waitFor();
    const changed=page.waitForResponse(r=>r.url()===base+'/api/workspace'&&r.request().method()==='POST');await card.getByRole('button',{name:'Confirmed',exact:true}).click();assert.equal((await changed).status(),200);await card.locator('.viewing-label.confirmed').waitFor();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.manager-shell').waitFor();await page.locator('.viewing-list>article').filter({hasText:'Synthetic UI Client'}).locator('.viewing-label.confirmed').waitFor();await screenshot('meeting-confirmed-desktop');
    assert.equal((await workspace('a')).state.leads.find(l=>l.phone==='+12025550104').meeting.status,'confirmed');return {proposalIsDistinctFromConfirmation:true,statusPersists:true,optedOutExcluded:true};
  });
  await gate('Actual empty manager states',async()=>{
    await selectSession('empty');for(const section of ['clients','properties','meetings']){await go('/'+section);if(section==='meetings')await page.getByRole('heading',{name:'No property visits yet',exact:true}).waitFor();await screenshot(`empty-${section}-desktop`);}return {fixture:'Separate empty synthetic tenant',routes:3};
  });
  await gate('Actual loading, recoverable error and retry behavior',async()=>{
    await selectSession('a');let release;const hold=new Promise(r=>{release=r;});let injected=true;
    await page.route('**/api/workspace/stream',route=>route.abort());await page.route('**/api/workspace',async route=>{if(injected){await hold;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic verification temporary failure'})});}return route.continue();});
    expectedNetworkFailure=true;
    try{await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});await page.getByText('Preparing your workspace…',{exact:true}).waitFor();await screenshot('loading-desktop');release();await page.getByText('Synthetic verification temporary failure',{exact:true}).waitFor();await screenshot('recoverable-error-desktop');injected=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.manager-shell').waitFor();}
    finally{release();await page.unroute('**/api/workspace');await page.unroute('**/api/workspace/stream');expectedNetworkFailure=false;}
    return {failureInjected:true,realAppErrorUI:true,retryLoadsActualAPI:true};
  });
}catch(error){report.fatalError=error.stack||String(error);}
finally{
  clearTimeout(watchdog);
  report.beforeCleanup=await resources();
  // Close one page/context/browser before terminating the one production server.
  try{await page?.close();await context?.close();await browser?.close();report.browserCleanup='closed';}catch(error){report.browserCleanup=String(error);}
  try{await miniflare?.dispose();report.runtimeCleanup='disposed';}catch(error){report.runtimeCleanup=String(error);}
  for(const child of [...managed])await stop(child);
  if(server?.verificationLog&&!server.verificationLog.closed){server.verificationLog.end();await once(server.verificationLog,'close').catch(()=>{});}
  await writeFile(join(output,'production-server.log'),runtimeLog);report.runtimeLogTail=runtimeLog.slice(-6000);report.afterCleanup=await resources();
  report.finishedAt=new Date().toISOString();report.passed=!report.fatalError&&!report.deadlineExceeded&&report.gates.every(g=>g.status==='passed')&&report.browserErrors.length===0&&report.externalRequests.length===0;report.cleanup={managedChildrenRemaining:managed.size,serverExitCode:server?.exitCode,serverSignal:server?.signalCode};await save();
}
// Failed worker outputs are intentionally discarded by the bridge; retain the
// actual assertions in command output as well as the on-disk evidence report.
log(JSON.stringify({passed:report.passed,gates:report.gates,fatalError:report.fatalError,browserErrors:report.browserErrors,externalRequests:report.externalRequests,fontResources:report.fontResources,limitations:report.limitations,screenshots:report.screenshots,runtimeLogTail:report.runtimeLogTail,beforeCleanup:report.beforeCleanup,afterCleanup:report.afterCleanup,cleanup:report.cleanup,report:relative(root,join(output,'report.json'))}));
if(!report.passed)process.exitCode=1;
