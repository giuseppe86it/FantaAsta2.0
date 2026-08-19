/* FantaAsta2.0 — Strategy Engine alpha 3
   Strategy Score con normalizzazione PER SLOT + Player Intelligence storico:
   qualità, titolarità LIVE, performance, profondità, costo, flessibilità,
   regolamento e scarsità reale. */
(function(){
  const STORAGE_KEY="fa2_strategy_v2";
  const LEGACY_KEY="fa2_strategy_v1";
  const MODULES=[
    {id:"343",name:"3-4-3",slots:[["Por"],["Dc"],["Dc"],["Dc","B"],["E"],["M","C"],["C"],["E"],["W","A"],["A","Pc"],["W","A"]]},
    {id:"3412",name:"3-4-1-2",slots:[["Por"],["Dc"],["Dc"],["Dc","B"],["E"],["M","C"],["C"],["E"],["T"],["A","Pc"],["A","Pc"]]},
    {id:"3421",name:"3-4-2-1",slots:[["Por"],["Dc"],["Dc"],["Dc","B"],["M"],["M","C"],["E","W"],["E"],["T"],["T","A"],["A","Pc"]]},
    {id:"352",name:"3-5-2",slots:[["Por"],["Dc"],["Dc"],["Dc","B"],["E","W"],["M","C"],["M"],["C"],["E"],["A","Pc"],["A","Pc"]]},
    {id:"3511",name:"3-5-1-1",slots:[["Por"],["Dc"],["Dc"],["Dc","B"],["E","W"],["M"],["M"],["C"],["E","W"],["T","A"],["A","Pc"]]},
    {id:"433",name:"4-3-3",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M","C"],["M"],["C"],["W","A"],["A","Pc"],["W","A"]]},
    {id:"4312",name:"4-3-1-2",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M","C"],["M"],["C"],["T"],["T","A","Pc"],["A","Pc"]]},
    {id:"442",name:"4-4-2",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M","C"],["C"],["E","W"],["E"],["A","Pc"],["A","Pc"]]},
    {id:"4141",name:"4-1-4-1",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M"],["C","T"],["T"],["E","W"],["W"],["A","Pc"]]},
    {id:"4411",name:"4-4-1-1",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M"],["C"],["E","W"],["E","W"],["T","A"],["A","Pc"]]},
    {id:"4231",name:"4-2-3-1",slots:[["Por"],["Dd"],["Dc"],["Dc"],["Ds"],["M"],["M","C"],["W","T"],["T"],["W","A"],["A","Pc"]]}
  ];
  const DEFAULT_PROFILE={schema:2,mode:"mono",scope:"full",primary:"433",secondary:"4231",autoTopN:2,lastGeneratedAt:0};
  const ROLE_MACRO={Por:"POR",Dd:"DIF",Ds:"DIF",Dc:"DIF",B:"DIF",E:"CEN",M:"CEN",C:"CEN",W:"ATT",T:"ATT",A:"ATT",Pc:"ATT"};
  const D_FACTOR_ROLES=new Set(["Dc","B","Dd","Ds","E","M"]);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
  const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  const round=v=>Math.round(Number(v)||0);

  function loadProfile(){
    let raw={};
    try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_KEY)||"{}")||{}}catch{}
    return {...DEFAULT_PROFILE,...raw,schema:2};
  }
  function saveProfile(p){const x={...DEFAULT_PROFILE,...p,schema:2};localStorage.setItem(STORAGE_KEY,JSON.stringify(x));return x}
  function moduleById(id){return MODULES.find(x=>x.id===id)||MODULES.find(x=>x.id==="433")}
  function roleTokens(p){return String(p?.role||"").split("/").filter(Boolean)}
  function compatible(p,roles){const t=roleTokens(p);return roles.some(r=>t.includes(r))}
  function isAvailable(p,ctx){return (!ctx?.isAssigned||!ctx.isAssigned(p))&&(!ctx?.isEligible||ctx.isEligible(p))}
  function starterProb(p,ctx){
    if(ctx?.starterProbability){const x=ctx.starterProbability(p);return clamp(typeof x==="object"?x?.prob:x)}
    return clamp(p?.starterProbability??p?.starterProb??45);
  }
  function basePrice(p,ctx){
    if(ctx?.playerQuality)return Math.max(0,Number(ctx.playerQuality(p))||0);
    return Math.max(0,Number(p?.maxPrice||p?.marketMax||Math.round(Number(p?.fvm||0)*2.5))||0);
  }
  function playerIsUnder(p,rule,ctx){
    if(ctx?.isUnder)return !!ctx.isUnder(p,rule);
    const y=Number(p?.birthYear||String(p?.birthDate||"").slice(0,4)||0);
    if(rule?.birthYearFrom&&y)return y>=Number(rule.birthYearFrom);
    if(rule?.id==="u21")return !!p?.u21;
    if(rule?.id==="u23")return !!p?.u23||!!p?.u21;
    return false;
  }
  function environment(players,reg,ctx){
    const available=(players||[]).filter(p=>isAvailable(p,ctx));
    const maxFvm=Math.max(1,...available.map(p=>Number(p?.fvm)||0));
    const maxPrice=Math.max(1,...available.map(p=>basePrice(p,ctx)));
    const underRules=(reg?.underRules||[]).filter(x=>x.enabled&&Number(x.min)>0);
    return {available,maxFvm,maxPrice,underRules,reg,ctx};
  }
  function playerMetrics(p,env,norm=null){
    const fvm=Math.max(0,Number(p?.fvm)||0),price=basePrice(p,env.ctx),starter=starterProb(p,env.ctx),roles=roleTokens(p);
    // La qualità deve essere relativa ALLO SLOT, non al miglior giocatore assoluto del Listone.
    const maxFvm=Math.max(1,Number(norm?.maxFvm)||env.maxFvm);
    const maxPrice=Math.max(1,Number(norm?.maxPrice)||env.maxPrice);
    const fvmScore=clamp(100*Math.sqrt(fvm/maxFvm));
    const pricePower=clamp(100*Math.sqrt(price/maxPrice));
    const flex=clamp((roles.length-1)*32+(roles.length>=3?8:0));
    const underMatches=env.underRules.filter(r=>playerIsUnder(p,r,env.ctx)).length;
    const youth=env.underRules.length?100*underMatches/env.underRules.length:50;
    const piRaw=env.ctx?.playerIntelligence?env.ctx.playerIntelligence(p):null;
    const pi=typeof piRaw==="object"?piRaw:null;
    const historyScore=clamp(Number(pi?.score||0));
    const historyReliability=clamp(Number(pi?.reliability||0));
    const baseIntelligence=clamp(fvmScore*.44+pricePower*.18+starter*.25+flex*.08+youth*.05);
    // Lo storico pesa fino al 34%, modulato dall'affidabilità/minuti disponibili.
    // In assenza di feed storico il comportamento resta identico all'alpha 2.2.
    const historyWeight=historyScore>0?(.16+.18*(historyReliability/100)):0;
    const intelligence=clamp(baseIntelligence*(1-historyWeight)+historyScore*historyWeight);
    const efficiency=clamp(68+(intelligence-pricePower)*.48);
    return {intelligence,baseIntelligence,historyScore,historyReliability,starter,flex,youth,fvmScore,pricePower,efficiency,price,fvm};
  }
  function slotCandidatePool(roles,env){
    const pool=env.available.filter(p=>compatible(p,roles));
    const maxFvm=Math.max(1,...pool.map(p=>Number(p?.fvm)||0));
    const maxPrice=Math.max(1,...pool.map(p=>basePrice(p,env.ctx)));
    return pool.map(p=>({p,m:playerMetrics(p,env,{maxFvm,maxPrice})}))
      .sort((a,b)=>b.m.intelligence-a.m.intelligence||b.m.starter-a.m.starter||b.m.fvm-a.m.fvm);
  }
  function slotKey(roles){return roles.slice().sort().join("/")}
  function demandFor(module,roles){const key=slotKey(roles);return module.slots.filter(x=>slotKey(x)===key).length}
  function slotMarket(module,roles,env){
    const demand=Math.max(1,demandFor(module,roles));
    const candidates=slotCandidatePool(roles,env);
    const sample=candidates.slice(0,Math.max(8,demand*7));
    // "Forte" è relativo al mercato dello specifico slot.
    // Soglia dinamica: evita sia 0 Por forti sia decine di falsi top in slot profondi.
    const topScore=candidates[0]?.m.intelligence||0;
    const strongThreshold=Math.max(56,topScore*.72);
    const strong=candidates.filter(x=>x.m.intelligence>=strongThreshold&&x.m.starter>=45);
    const effectiveSupply=candidates.slice(0,30).reduce((s,x)=>s+clamp((x.m.intelligence-34)/54,0,1)*(0.55+x.m.starter/220),0);
    const targetSupply=demand*7.2;
    let scarcity=clamp((1-Math.min(1,effectiveSupply/targetSupply))*100);
    if(candidates.length<demand*6)scarcity=Math.max(scarcity,clamp((1-candidates.length/(demand*6))*100));
    const depth=clamp(100-scarcity*.72+(Math.min(strong.length,demand*8)/(demand*8))*28);
    return {
      roles:roles.slice(),key:slotKey(roles),demand,count:candidates.length,strongCount:strong.length,
      quality:round(avg(sample.map(x=>x.m.intelligence))),starter:round(avg(sample.map(x=>x.m.starter))),
      history:round(avg(sample.filter(x=>x.m.historyScore>0).map(x=>x.m.historyScore))),
      historyCoverage:round(sample.length?sample.filter(x=>x.m.historyScore>0).length/sample.length*100:0),
      depth:round(depth),scarcity:round(scarcity),efficiency:round(avg(sample.map(x=>x.m.efficiency))),
      flexibility:round(avg(sample.map(x=>x.m.flex))),
      top:candidates.slice(0,3).map(x=>({id:x.p.id,name:x.p.name,club:x.p.club,role:x.p.role,score:round(x.m.intelligence),history:round(x.m.historyScore),starter:round(x.m.starter),price:round(x.m.price)}))
    };
  }
  function analyseSlots(module,env){
    const cache=new Map();
    return module.slots.map(roles=>{
      const key=slotKey(roles);
      if(!cache.has(key))cache.set(key,slotMarket(module,roles,env));
      return {...cache.get(key),roles:roles.slice()};
    });
  }
  function bestXI(module,slotRows,env){
    const slots=module.slots.map((roles,i)=>({i,roles,row:slotRows[i]})).sort((a,b)=>b.row.scarcity-a.row.scarcity||a.row.count-b.row.count);
    const used=new Set(),selected=[];
    for(const s of slots){
      const pool=slotCandidatePool(s.roles,env).filter(x=>!used.has(String(x.p.id)));
      const pick=pool[0];
      if(pick){used.add(String(pick.p.id));selected.push({slot:s.i,roles:s.roles,p:pick.p,m:pick.m})}
    }
    selected.sort((a,b)=>a.slot-b.slot);
    return selected;
  }
  function regulationFit(module,selected,env){
    const reg=env.reg||{},rules=env.underRules;
    const selectedPlayers=selected.map(x=>x.p);
    const underHealth=rules.length?avg(rules.map(rule=>{
      const pool=env.available.filter(p=>compatibleAnyModule(p,module)&&playerIsUnder(p,rule,env.ctx));
      const target=Math.max(1,Number(rule.min)||0)*8;
      return clamp(pool.length/target*100);
    })):75;
    const moduleFlex=avg(module.slots.slice(1).map(x=>x.length>1?100:0));
    const selectedFlex=avg(selected.map(x=>x.m.flex));
    let switchFit=65;
    if(reg.switchMode==="plus")switchFit=clamp(55+moduleFlex*.23+selectedFlex*.22);
    else if(reg.switchMode==="switch")switchFit=clamp(58+selectedFlex*.18);
    else switchFit=65;
    let dFit=70;
    if(reg?.modifiers?.dFactor?.enabled){
      const defenders=selected.filter(x=>x.roles.some(r=>D_FACTOR_ROLES.has(r)));
      dFit=clamp(45+defenders.length*5+avg(defenders.map(x=>x.m.intelligence))*.22+(reg.modifiers.dFactor.includeGoalkeeper?3:0));
    }
    return round(underHealth*.40+switchFit*.30+dFit*.30);
  }
  function compatibleAnyModule(p,module){return module.slots.some(r=>compatible(p,r))}
  function moduleFlexibility(module,selected,reg){
    const structural=avg(module.slots.slice(1).map(r=>r.length>1?100:0));
    const playerFlex=avg(selected.map(x=>x.m.flex));
    const boost=reg?.switchMode==="plus"?8:reg?.switchMode==="switch"?3:0;
    return round(clamp(structural*.43+playerFlex*.57+boost));
  }
  function costScore(selected,reg){
    const budget=Math.max(1,Number(reg?.budget?.initial)||2500);
    const xiCost=selected.reduce((s,x)=>s+x.m.price,0);
    const ratio=xiCost/budget;
    const efficiency=avg(selected.map(x=>x.m.efficiency));
    const pressure=ratio<=.48?95:ratio<=.65?88:ratio<=.82?76:ratio<=1?60:Math.max(25,60-(ratio-1)*80);
    return {score:round(clamp(pressure*.55+efficiency*.45)),xiCost:round(xiCost),ratio};
  }
  function moduleScore(module,players,reg,ctx){
    const env=environment(players,reg,ctx),slotRows=analyseSlots(module,env),selected=bestXI(module,slotRows,env);
    const coverage=round(selected.length/module.slots.length*100);
    const qualityXI=round(avg(selected.map(x=>x.m.intelligence)));
    const starterXI=round(avg(selected.map(x=>x.m.starter)));
    const historyRows=selected.filter(x=>x.m.historyScore>0);
    const history=round(avg(historyRows.map(x=>x.m.historyScore)));
    const historyCoverage=round(selected.length?historyRows.length/selected.length*100:0);
    const depth=round(avg(slotRows.map(x=>x.depth)));
    const avgScarcity=avg(slotRows.map(x=>x.scarcity)),maxScarcity=Math.max(0,...slotRows.map(x=>x.scarcity));
    const scarcityRisk=round(avgScarcity*.62+maxScarcity*.38);
    const flexibility=moduleFlexibility(module,selected,reg);
    const cost=costScore(selected,reg);
    const regulation=regulationFit(module,selected,env);
    const scarcityHealth=100-scarcityRisk;
    // Quando Player Intelligence è disponibile, una quota del punteggio modulo premia
    // la qualità storica del Best XI senza rendere inutili FVM/titolarità/mercato.
    const historyEffective=historyCoverage?history:qualityXI;
    const historyWeight=historyCoverage>=55?.10:historyCoverage>=25?.06:0;
    let score=qualityXI*(.25-historyWeight*.45)+starterXI*.17+depth*.14+cost.score*.12+flexibility*.10+regulation*.10+scarcityHealth*.12+historyEffective*historyWeight;
    score*=coverage/100;
    score=round(clamp(score));
    const uniqueCritical=new Map();
    slotRows.forEach(r=>{const prev=uniqueCritical.get(r.key);if(!prev||r.scarcity>prev.scarcity)uniqueCritical.set(r.key,r)});
    const critical=[...uniqueCritical.values()].sort((a,b)=>b.scarcity-a.scarcity||a.strongCount-b.strongCount).slice(0,4);
    const explanation=explainModule({module,score,coverage,qualityXI,starterXI,history,historyCoverage,depth,scarcityRisk,flexibility,cost,regulation,critical});
    return {module,score,coverage,quality:qualityXI,starter:starterXI,history,historyCoverage,depth,flexibility,scarcityRisk,cost:cost.score,xiCost:cost.xiCost,regulation,critical,selected:selected.map(x=>({slot:x.slot,name:x.p.name,club:x.p.club,role:x.p.role,score:round(x.m.intelligence),history:round(x.m.historyScore),starter:round(x.m.starter)})),explanation};
  }
  function explainModule(x){
    const strengths=[],warnings=[];
    if(x.starter>=72)strengths.push(`XI potenziale molto titolare (${x.starter}%)`);else if(x.starter<58)warnings.push(`Titolarità media da proteggere (${x.starter}%)`);
    if(x.depth>=76)strengths.push(`Buona profondità del mercato (${x.depth}/100)`);else if(x.depth<58)warnings.push(`Alternative poco profonde (${x.depth}/100)`);
    if(x.historyCoverage>=55&&x.history>=70)strengths.push(`Storico performante sul Best XI (${x.history}/100 · copertura ${x.historyCoverage}%)`);
    else if(x.historyCoverage>=55&&x.history<55)warnings.push(`Rendimento storico debole sul Best XI (${x.history}/100)`);
    if(x.flexibility>=55)strengths.push(`Flessibilità Mantra alta (${x.flexibility}/100)`);
    if(x.cost.score>=76)strengths.push(`Costo teorico sostenibile (${x.cost.score}/100)`);else if(x.cost.score<55)warnings.push(`Costruzione potenzialmente costosa (${x.cost.score}/100)`);
    if(x.scarcityRisk>=35)warnings.push(`Scarsità significativa (${x.scarcityRisk}/100)`);
    x.critical.filter(r=>r.scarcity>=18||r.strongCount<r.demand*6).slice(0,2).forEach(r=>warnings.push(`${r.roles.join("/")}: ${r.strongCount} profili forti, rischio ${r.scarcity}%`));
    if(!strengths.length)strengths.push("Struttura equilibrata senza un vantaggio dominante");
    if(!warnings.length)warnings.push("Nessuna criticità grave: monitorare comunque i prezzi reali");
    return {strengths,warnings,priority:x.critical.slice(0,3).map(r=>r.roles.join("/"))};
  }
  function rankModules(players,reg,ctx){return MODULES.map(m=>moduleScore(m,players,reg,ctx)).sort((a,b)=>b.score-a.score||a.scarcityRisk-b.scarcityRisk||b.starter-a.starter)}
  function moduleSimilarity(a,b){
    const tokens=m=>m.slots.slice(1).map(r=>slotKey(r));
    const A=tokens(a),B=tokens(b),used=new Set();let matches=0;
    A.forEach(x=>{const idx=B.findIndex((y,i)=>!used.has(i)&&(y===x||y.split("/").some(r=>x.split("/").includes(r))));if(idx>=0){used.add(idx);matches++}});
    return round(matches/Math.max(A.length,B.length)*100);
  }
  function bestAutoPair(ranked){
    const top=ranked.slice(0,6);let best=null;
    for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++){
      const synergy=moduleSimilarity(top[i].module,top[j].module);
      const score=round(top[i].score*.45+top[j].score*.35+synergy*.20);
      if(!best||score>best.score)best={primary:top[i],secondary:top[j],synergy,score};
    }
    return best||{primary:top[0],secondary:top[1],synergy:0,score:top[0]?.score||0};
  }
  function macroWeights(moduleResult,reg){
    const module=moduleResult.module,base={POR:.08,DIF:.20,CEN:.27,ATT:.45},struct={POR:0,DIF:0,CEN:0,ATT:0},risk={POR:0,DIF:0,CEN:0,ATT:0},counts={POR:0,DIF:0,CEN:0,ATT:0};
    module.slots.forEach((roles,i)=>{
      const macros=[...new Set(roles.map(r=>ROLE_MACRO[r]).filter(Boolean))];
      macros.forEach(m=>{struct[m]+=1/macros.length;counts[m]++});
      const row=moduleResult.critical?.find(x=>x.key===slotKey(roles));
      if(row)macros.forEach(m=>risk[m]+=row.scarcity/macros.length);
    });
    const total=Object.values(struct).reduce((a,b)=>a+b,0)||11,mix={};
    Object.keys(base).forEach(k=>{
      const structural=struct[k]/total,scarcityBoost=(risk[k]/Math.max(1,counts[k]))/100;
      mix[k]=base[k]*.52+structural*.38+scarcityBoost*.10;
    });
    const sum=Object.values(mix).reduce((a,b)=>a+b,0)||1,budget=Math.max(1,Number(reg?.budget?.initial)||2500);
    const entries=Object.entries(mix).map(([k,v])=>[k,v/sum]);
    const out={};let credits=0;
    entries.forEach(([k,v],i)=>{const c=i===entries.length-1?budget-credits:Math.round(v*budget);credits+=c;out[k]={pct:round(v*100),credits:c}});
    return out;
  }
  function bridgeRoles(a,b){
    const A=a.slots.slice(1).flat(),B=b.slots.slice(1).flat(),all=[...new Set(A.concat(B))];
    return all.map(role=>({role,a:A.filter(x=>x===role).length,b:B.filter(x=>x===role).length})).filter(x=>x.a&&x.b).sort((x,y)=>(y.a+y.b)-(x.a+x.b));
  }
  function build(profile,players,reg,ctx){
    const p={...DEFAULT_PROFILE,...profile,lastGeneratedAt:Date.now(),schema:2};
    if(p.mode==="auto"){
      const ranked=rankModules(players,reg,ctx),pair=bestAutoPair(ranked);
      p.primary=pair.primary?.module.id||"433";p.secondary=pair.secondary?.module.id||"4231";
      return {profile:saveProfile(p),mode:"auto",ranked,primary:pair.primary,secondary:pair.secondary,pairScore:pair.score,synergy:pair.synergy,budget:macroWeights(pair.primary,reg),bridges:pair.secondary?bridgeRoles(pair.primary.module,pair.secondary.module):[]};
    }
    const primary=moduleScore(moduleById(p.primary),players,reg,ctx),secondary=p.mode==="dual"?moduleScore(moduleById(p.secondary),players,reg,ctx):null;
    const synergy=secondary?moduleSimilarity(primary.module,secondary.module):0;
    const pairScore=secondary?round(primary.score*.50+secondary.score*.34+synergy*.16):primary.score;
    return {profile:saveProfile(p),mode:p.mode,primary,secondary,pairScore,synergy,budget:macroWeights(primary,reg),bridges:secondary?bridgeRoles(primary.module,secondary.module):[]};
  }
  window.FA2Strategy={STORAGE_KEY,LEGACY_KEY,MODULES,DEFAULT_PROFILE:clone(DEFAULT_PROFILE),loadProfile,saveProfile,moduleById,rankModules,moduleScore,build,macroWeights,moduleSimilarity};
})();
