function memoryAdStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as engine from "../app/game-engine.ts";
import { createSaveCoordinator } from "../app/save-coordinator.ts";
import { requestEconomyReward, attemptEconomyInterstitial } from "../app/economy-ads.ts";
import { createAdPolicy } from "../app/ad-policy.ts";
const game = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).name.replace("-vk-game", "");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function arrow(name) {
 let found;
 function walk(n) {
  if (name !== "tick" && ts.isVariableDeclaration(n) && n.name.getText(source) === name) found = ts.isCallExpression(n.initializer) ? n.initializer.arguments[0] : n.initializer;
  if (name === "fightStep" && ts.isVariableDeclaration(n) && n.name.getText(source) === "step" && n.initializer?.getText(source).includes("tickFight")) found = n.initializer;
  if (name === "tick" && ts.isCallExpression(n) && ["window.setInterval","setInterval"].includes(n.expression.getText(source)) && n.arguments[0].getText(source).includes("commitSave")) found = n.arguments[0];
  if (name === "resumeClock" && ts.isCallExpression(n) && n.expression.getText(source) === "useEffect" && n.arguments[0].getText(source).includes("incomePauseRef.current = true")) found = n.arguments[0];
  if (ts.isVariableDeclaration(n) && n.name.getText(source) === "DAILY_QUESTS" && name === "quests") found = n.initializer;
  ts.forEachChild(n, walk);
 } walk(source); assert.ok(found, `actual production ${name}`); return found;
}
function invoke(name, scope, ...args) {
 const code = ts.transpileModule(`const fn = ${arrow(name).getText(source)};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const fn = Function(...Object.keys(scope), `${code}\nreturn fn;`)(...Object.values(scope));
 return name === "quests" ? fn : fn(...args);
}
function store(initial = engine.createDefaultSave()) {
 let raw = engine.serializeSave(initial); let tail = Promise.resolve(); const adStorage=memoryAdStorage();
 return { adStorage, read:()=>raw, write:value=>{raw=value;return true;}, parse:()=>engine.migrateSave(raw),
  withLock:run=>{const promise=tail.then(run);tail=promise.catch(()=>{});return promise;}, flush:async()=>{for(let i=0;i<4;i++){await tail;await Promise.resolve();}} };
}
function fixture(shared = store(), options={}) {
 const initial=shared.parse(); const state=structuredClone(initial); const saveRef={current:state}; const events=[]; const sdk=[]; const timers=new Map();let uid=1;const noop=()=>{};
 const coord=createSaveCoordinator({read:shared.read,write:shared.write,parse:value=>engine.migrateSave(value)??engine.createDefaultSave(),serialize:engine.serializeSave,withLock:shared.withLock});coord.initialize(shared.read(),initial);
 const policy=createAdPolicy({storageKey:"continued",storage:shared.adStorage,locks:null,settle:async()=>{}});
 const scope={...engine,...state,saveRef,paused:false,phase:"idle",started:true,hydrated:true,catchPopup:null,craftPopup:null,interstitialBusy:false,rewardBusy:false,
  resetPendingRef:{current:false},castPendingRef:{current:false},fishingGenerationRef:{current:0},incomePauseRef:{current:false},
  getAdPolicy:()=>policy,requestEconomyReward,attemptEconomyInterstitial,
  vkReady:true,adAvailable:true,bridgeRef:{current:{send:async method=>{if(method!=="VKWebAppShowNativeAds")return {};sdk.push(method);return options.send?await options.send(method):{result:true};}}},
  REWARD_DAILY_LIMIT:8,REWARD_COOLDOWN_MS:180000,REWARD_BAIT:8,AD_COINS:40,BOOST_MINUTES:3,BOOST_MULT:2,
  playSound:noop,playTone:noop,haptic:noop,trackEvent:noop,addFloater:noop,checkRewardAvailability:async()=>{},
  castRaf:{current:null},fightRaf:{current:null},biteTimeout:{current:null},pendingCatchRef:{current:null},holdingRef:{current:false},castDir:{current:1},fightRef:{current:engine.createFightState?.(state.upgrades)},
  window:{setTimeout:fn=>{const id=uid++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),cancelAnimationFrame:noop},
  maybeShowInterstitial:async boundary=>{events.push(boundary);return false;},
 };
 const adopt=next=>{Object.assign(state,next);saveRef.current=state;};
 for(const key of ["Save","Ingots","Coal","Upgrades","Crafted","Sound","Stats","Daily","Rewards","Boost","NowTick","Now","Message","CraftPopup","TapStreak","Heat","FloatText","FloatCrit","Hit","CritHit","Sparking","TutorialStep","TutorialDone","AdBusy","RewardBusy","Keepnet","Coins","Bait","TapPulse","Started","OfflineBanner","Tab","Fight","Holding","CastPos","Phase","CatchPopup","LastResult","Splash"]){const k=key[0].toLowerCase()+key.slice(1);scope[`set${key}`]=value=>{if(key==="Save"){adopt(value);return;}state[k]=typeof value==="function"?value(state[k]):value;};}
 scope.setMessage=v=>events.push(v);scope.showToast=v=>events.push(v);
 scope.applySave=adopt;
 scope.synchronizeSave=()=>{const external=coord.refresh();if(external){if(game==="omut"&&(external.stats.casts<state.stats.casts||external.nextFishUid<state.nextFishUid))scope.cancelFishing();adopt(external);}return state;};
 scope.getSaveCoordinator=()=>coord;scope.readStoredValue=shared.read;scope.SAVE_KEY="continued-save";scope.VK_SAVE_KEY="continued_cloud";
 scope.commitSave=transform=>invoke("commitSave",scope,transform);
 if(game!=="lavka")scope.DAILY_QUESTS=invoke("quests",scope);
 if(game==="omut")scope.cancelFishing=()=>invoke("cancelFishing",scope);
 const run=(name,...args)=>invoke(name,{...scope,phase:state.phase??scope.phase,castPos:state.castPos??0.5},...args);
 return {state,scope,shared,coord,events,sdk,timers,policy,run,seed:async transform=>{await scope.commitSave(transform);},reload:()=>shared.parse(),async flush(){await shared.flush();}};
}
const sale=game==="lavka"?"onSell":game==="gorn"?"onTap":"sellAll";
function resource(save){return game==="gorn"?save.ingots:save.coins;}
for(const response of [true,false])test(`${game}: SDK completion and a queued external write preserve credit/quota (${response})`,async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});let release;
 const shared=store();const f=fixture(shared,{send:()=>new Promise(resolve=>release=resolve)}),other=fixture(shared);
 const pending=f.run(game==="lavka"?"watchReward":"watchRewardAd",game==="gorn"?"ingots":"coins");await new Promise(setImmediate);
 await other.seed(current=>({...current,[game==="gorn"?"ingots":"coins"]:400}));
 release({result:response});await pending;await f.flush();const saved=f.reload();
 assert.equal(resource(saved),game==="gorn"&&response?500:game==="lavka"&&response?440:400);
 assert.equal(saved.rewards.count,response?1:0);if(game==="omut")assert.equal(saved.bait.worm,response?28:20);
});
test(`${game}: reset rebases on another tab's quota then stale snapshot cannot resurrect progress`,async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const shared=store(),a=fixture(shared),b=fixture(shared);const old=structuredClone(a.state);
 const write=b.seed(cur=>({...cur,[game==="gorn"?"ingots":"coins"]:700,rewards:{...cur.rewards,count:8,lastRewardAt:Date.now()-180001}}));
 const reset=a.run("resetProgress");await Promise.all([write,reset]);await b.coord.persist(old);const save=shared.parse();
 assert.equal(resource(save),game==="omut"?80:0);assert.equal(save.rewards.count,8);
 await b.run(game==="lavka"?"watchReward":"watchRewardAd",game==="gorn"?"ingots":"coins");assert.equal(b.sdk.length,0);
});
test(`${game}: reset is declined while actual SDK reward remains pending`,async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});let release;const f=fixture(store(),{send:()=>new Promise(resolve=>release=resolve)});
 const ad=f.run(game==="lavka"?"watchReward":"watchRewardAd",game==="gorn"?"ingots":"coins");await new Promise(setImmediate);
 await f.run("resetProgress");assert.equal(f.state.started,undefined);release({result:true});await ad;assert.equal(f.reload().rewards.count,1);
});
if(game!=="omut"){
 test(`${game}: delayed actual timer credits 15 seconds once across two active tabs`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.upgrades[game==="gorn"?"apprentice":"clerk"]=1;const shared=store(initial),a=fixture(shared),b=fixture(shared);
  t.mock.timers.tick(15000);a.run("tick");b.run("tick");await a.flush();assert.equal(resource(shared.parse()),15);
  const previous=shared.parse().lastAutoTickAt;assert.equal(previous,Date.now());
  a.run("tick");await a.flush();assert.equal(resource(shared.parse()),15);
 });
 test(`${game}: continuous fast taps do not suppress passive income`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.upgrades[game==="gorn"?"apprentice":"clerk"]=1;const f=fixture(store(initial));
  const oldRandom=Math.random;Math.random=()=>0.9;try{for(let i=0;i<10;i++){t.mock.timers.tick(100);await f.run(sale);}}finally{Math.random=oldRandom;}
  const before=resource(f.reload());f.run("tick");await f.flush();assert.equal(resource(f.reload()),before+1);
 });
 test(`${game}: resume excludes 90-second paused/ad interval from active catchup`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.upgrades[game==="gorn"?"apprentice":"clerk"]=1;const f=fixture(store(initial));
  f.scope.rewardBusy=true;f.run("resumeClock");t.mock.timers.tick(90000);f.scope.rewardBusy=false;f.run("resumeClock");await f.flush();f.run("tick");await f.flush();assert.equal(resource(f.reload()),0);
  t.mock.timers.tick(1000);f.run("tick");await f.flush();assert.equal(resource(f.reload()),1);
 });
 test(`${game}: timer applies boosted/base rates around exact expiry and bounds multi-day delay`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.upgrades[game==="gorn"?"apprentice":"clerk"]=1;
  initial.boost=game==="gorn"?{multiplier:2,expiresAt:Date.now()+6000}:{multiplier:2,until:Date.now()+6000};const f=fixture(store(initial));
  t.mock.timers.tick(10000);f.run("tick");await f.flush();assert.equal(resource(f.reload()),15,"seconds1..5 boosted,6..10 baseline");
  t.mock.timers.tick(10*86400000);f.run("tick");await f.flush();assert.equal(resource(f.reload()),15+(game==="gorn"?14400:28800));
 });
 test(`${game}: actual tap/tick cannot exceed spendable stock cap or lose value at reload`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const cap=game==="gorn"?engine.INGOT_CAP:engine.COIN_CAP;const initial=engine.createDefaultSave();initial[game==="gorn"?"ingots":"coins"]=cap-1;initial.upgrades[game==="gorn"?"hammer":"counter"]=5;initial.upgrades[game==="gorn"?"apprentice":"clerk"]=5;
  const f=fixture(store(initial));await f.run(sale);t.mock.timers.tick(15000);f.run("tick");await f.flush();assert.equal(resource(f.state),cap);assert.equal(resource(f.reload()),cap);
 });
 test(`${game}: simultaneous actual sales/taps rebase rather than discard the second valid action`,async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const shared=store(),a=fixture(shared),b=fixture(shared);const old=Math.random;Math.random=()=>0.9;
  try{await Promise.all([a.run(sale),b.run(sale)]);}finally{Math.random=old;}
  assert.equal(resource(shared.parse()),2);assert.equal(game==="gorn"?shared.parse().stats.taps:shared.parse().stats.totalTaps,2);
 });
}
if(game==="gorn"){
 test("gorn: all twelve recipes reached via actual taps/craft from starter save without resource injection",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();const old=Math.random;Math.random=()=>0.9;
  try{for(const recipe of engine.RECIPE_CATALOG){while(f.reload().stats.taps<recipe.unlockTaps||f.reload().ingots<recipe.cost)await f.run("onTap");await f.run("craft",recipe.id);assert.equal(f.reload().crafted[recipe.id],1);}}finally{Math.random=old;}
  assert.deepEqual(engine.recipeProgress(f.reload().crafted),{done:12,total:12});assert.ok(f.reload().stats.taps>=1200);
 });
 test("gorn: four first upgrades need daily coal; actual daily quests rollover over five fake UTC days",async t=>{
  t.mock.timers.enable({apis:["Date"],now:Date.UTC(2026,9,11,12)});const f=fixture();const old=Math.random;Math.random=()=>0.9;
  try{for(let day=0;day<5;day++){for(let craft=0;craft<2;craft++){while(f.reload().ingots<40)await f.run("onTap");await f.run("craft","knife");}await f.run("claimQuest","craft");const coal=f.reload().coal;await f.run("claimQuest","craft");assert.equal(f.reload().coal,coal);if(day<4)t.mock.timers.tick(86400000);}
   assert.equal(f.reload().coal,12);for(const key of Object.keys(engine.UPGRADE_DATA)){while(f.reload().ingots<engine.getUpgradeIngotCost(key,0))await f.run("onTap");await f.run("buyUpgrade",key);assert.equal(f.reload().upgrades[key],1);}
  }finally{Math.random=old;}
  assert.equal(f.reload().coal,0);
 });
}
if(game==="lavka")test("lavka: all goods unlock from earned starter money and timed passive callbacks, all first upgrade kinds persist",async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();for(let i=0;i<15;i++)await f.run("onSell");await f.run("onUpgrade","counter");while(f.reload().coins<40)await f.run("onSell");await f.run("onUpgrade","clerk");
 for(const key of ["stock","sign"]){while(f.reload().coins<engine.upgradeCost(key,0)){t.mock.timers.tick(60000);f.run("tick");await f.flush();}await f.run("onUpgrade",key);}
 while(f.reload().stats.totalEarned<100000){t.mock.timers.tick(3600000);f.run("tick");await f.flush();}
 assert.equal(f.reload().goodsUnlocked,8);assert.deepEqual(f.reload().upgrades,{counter:1,clerk:1,stock:1,sign:1});
});
if(game==="omut"){
 test("omut: two simultaneous sales credit the same fish only once and respect migration cap",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();const fish=engine.rollCatch("backwater",initial.upgrades,"worm","perfect",1,()=>0.3);initial.keepnet=[fish];initial.coins=engine.COIN_CAP-1;
  const shared=store(initial),a=fixture(shared),b=fixture(shared);await Promise.all([a.run("sellOne",1),b.run("sellAll")]);const saved=shared.parse();assert.equal(saved.coins,engine.COIN_CAP);assert.equal(saved.keepnet.length,0);assert.equal(saved.daily.sell,1);
 });
 test("omut: actual miss/escape/retry consume bait, reserve fish uid, persist counters and reset cancels pending bite",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();f.state.phase="casting";f.state.castPos=0;await f.run("lockCast");assert.equal(f.reload().bait.worm,19);assert.equal(f.reload().stats.casts,1);assert.equal(f.state.phase,"idle");
  f.state.phase="casting";f.state.castPos=0.5;await f.run("lockCast");assert.equal(f.reload().bait.worm,18);assert.ok(f.scope.pendingCatchRef.current);await f.run("finishEscape");assert.equal(f.reload().stats.escapes,1);assert.equal(f.state.phase,"idle");
  f.state.phase="casting";await f.run("lockCast");await f.run("resetProgress");for(const cb of f.timers.values())cb();assert.equal(f.state.phase,"idle");assert.equal(f.reload().bait.worm,20);assert.equal(f.reload().stats.casts,0);
 });
 test("omut: full-net concurrent catch cannot give false album/stats credit",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const shared=store(),a=fixture(shared),b=fixture(shared);a.state.phase="casting";a.state.castPos=0.5;await a.run("lockCast");const fish=a.scope.pendingCatchRef.current;
  await b.seed(cur=>({...cur,keepnet:Array.from({length:8},(_,i)=>engine.rollCatch("backwater",cur.upgrades,"worm","perfect",i+100,()=>0.3))}));await a.run("finishCatch",fish);assert.equal(shared.parse().stats.catches,0);assert.equal(shared.parse().keepnet.length,8);assert.deepEqual(shared.parse().album,{});assert.equal(a.state.catchPopup,undefined);
 });
 test("omut: another tab's reset invalidates captured fish even before storage event delivery",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const shared=store(),a=fixture(shared),b=fixture(shared);a.state.phase="casting";a.state.castPos=0.5;await a.run("lockCast");const fish=a.scope.pendingCatchRef.current;await b.run("resetProgress");await a.run("finishCatch",fish);assert.equal(shared.parse().stats.catches,0);assert.equal(shared.parse().keepnet.length,0);assert.equal(a.scope.pendingCatchRef.current,null);
 });
 test("omut: starter exhaustion recovers one worm with actual action, each paid bait and first gear are gated",async t=>{
  t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();for(const id of Object.keys(engine.BAIT_DATA)){await f.seed(cur=>({...cur,selectedBait:id}));while(f.reload().bait[id]>0){f.state.phase="casting";f.state.castPos=0;await f.run("lockCast");}}
  assert.equal(f.reload().stats.casts,27);await f.run("purchaseBait","worm");await f.run("purchaseBait","worm");await f.run("purchaseBait","worm");assert.equal(f.reload().coins,5);await f.seed(cur=>({...cur,selectedBait:"worm"}));for(let i=0;i<15;i++){f.state.phase="casting";await f.run("lockCast");}
  await f.run("recoverBait");assert.equal(f.reload().bait.worm,1);await f.run("recoverBait");assert.equal(f.reload().bait.worm,1);
 });
 test("omut: 35 actual cast/catch/sale handlers unlock all waters and daily pearls over fake UTC days",async t=>{
  t.mock.timers.enable({apis:["Date"],now:Date.UTC(2026,9,11,12)});const f=fixture();for(let i=0;i<35;i++){
   if(!f.reload().bait.worm)await f.run("purchaseBait","worm");f.state.phase="casting";f.state.castPos=0.5;await f.run("lockCast");await f.run("finishCatch",f.scope.pendingCatchRef.current);f.state.catchPopup=null;await f.run("sellAll");
   if(i%4===3){await f.run("claimQuest","catch");if(i<15)t.mock.timers.tick(86400000);}
  }
  assert.deepEqual(engine.getUnlockedLocations(f.reload().stats.catches),["backwater","lake","night"]);assert.ok(f.reload().pearls>=9);
  for(const key of Object.keys(engine.UPGRADE_DATA)){await f.run("buyUpgrade",key);assert.equal(f.reload().upgrades[key],1);}
 });
}

test(`${game}: two actual reward handlers at quota seven open one SDK and preserve daily cap`,async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.rewards.count=7;initial.rewards.lastRewardAt=Date.now()-180001;const shared=store(initial);let release;
 const send=()=>new Promise(resolve=>release=resolve);const a=fixture(shared,{send}),b=fixture(shared,{send});const name=game==="lavka"?"watchReward":"watchRewardAd",kind=game==="gorn"?"ingots":"coins";
 const pending=[a.run(name,kind),b.run(name,kind)];await new Promise(setImmediate);assert.equal(a.sdk.length+b.sdk.length,1);release({result:true});await Promise.all(pending);assert.equal(shared.parse().rewards.count,8);
 t.mock.timers.tick(180001);await a.run(name,kind);await b.run(name,kind);assert.equal(a.sdk.length+b.sdk.length,1);
});

test("omut: full coin stock declines actual sale without deleting fish or daily sale credit",async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const initial=engine.createDefaultSave();initial.coins=engine.COIN_CAP;initial.keepnet=[engine.rollCatch("backwater",initial.upgrades,"worm","perfect",1,()=>0.3)];const f=fixture(store(initial));await f.run("sellOne",1);await f.run("sellAll");assert.equal(f.reload().coins,engine.COIN_CAP);assert.equal(f.reload().keepnet.length,1);assert.equal(f.reload().daily.sell,0);assert.deepEqual(f.events,[]);
});

for(const controlled of [true,false]) test(`omut: actual fight-frame callback reaches ${controlled?"catch":"escape"} and can retry`,async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();f.state.phase="casting";f.state.castPos=0.5;await f.run("lockCast");const bite=f.timers.get(f.scope.biteTimeout.current);bite();f.scope.fightRef.current=f.state.fight;
 f.scope.last=0;f.scope.window.requestAnimationFrame=()=>1;f.scope.finishCatch=fish=>f.run("finishCatch",fish);f.scope.finishEscape=()=>f.run("finishEscape");
 const code=ts.transpileModule(`const step=${arrow("fightStep").getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;const frame=Function(...Object.keys(f.scope),`${code}\nreturn step;`)(...Object.values(f.scope));
 for(let i=1;i<=250&&f.state.phase==="fighting";i++){f.scope.holdingRef.current=controlled&&f.scope.fightRef.current.tension>0.52;frame(i*16.67);await f.flush();}
 assert.equal(f.state.phase,"idle");assert.equal(f.reload().stats.catches,controlled?1:0);assert.equal(f.reload().stats.escapes,controlled?0:1);assert.equal(f.reload().bait.worm,19);
 f.state.catchPopup=null;f.run("startCast");assert.equal(f.state.phase,"casting");
});
test("omut: all four paid bait kinds use coins earned by cast/catch/sale and persist",async t=>{
 t.mock.timers.enable({apis:["Date"],now:1800000000000});const f=fixture();for(const id of Object.keys(engine.BAIT_DATA)){
  while(f.reload().coins<engine.BAIT_DATA[id].cost*5){if(!f.reload().bait.worm)await f.run("purchaseBait","worm");f.state.phase="casting";f.state.castPos=0.5;await f.run("lockCast");await f.run("finishCatch",f.scope.pendingCatchRef.current);f.state.catchPopup=null;await f.run("sellAll");}
  const before=f.reload();await f.run("purchaseBait",id);assert.equal(f.reload().bait[id],before.bait[id]+5);assert.equal(before.coins-f.reload().coins,engine.BAIT_DATA[id].cost*5);
 }
});
