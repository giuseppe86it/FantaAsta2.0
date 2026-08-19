/* FantaAsta2.0 — Strategy Engine alpha 1
   Mono modulo, doppio modulo, AUTO Listone. */
(function(){
  const STORAGE_KEY="fa2_strategy_v1";
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
  const DEFAULT_PROFILE={schema:1,mode:"mono",primary:"433",secondary:"4231",autoTopN:2,lastGeneratedAt:0};
  const ROLE_MACRO={Por:"POR",Dd:"DIF",Ds:"DIF",Dc:"DIF",B:"DIF",E:"CEN",M:"CEN",C:"CEN",W:"ATT",T:"ATT",A:"ATT",Pc:"ATT"};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function loadProfile(){try{return {...DEFAULT_PROFILE,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}}catch{return clone(DEFAULT_PROFILE)}}
  function saveProfile(p){const x={...DEFAULT_PROFILE,...p};localStorage.setItem(STORAGE_KEY,JSON.stringify(x));return x}
  function moduleById(id){return MODULES.find(x=>x.id===id)||MODULES.find(x=>x.id==="433")}
  function roleTokens(p){return String(p?.role||"").split("/").filter(Boolean)}
  function compatible(p,roles){const t=roleTokens(p);return roles.some(r=>t.includes(r))}
  function quality(p){
    const fvm=Math.max(0,Number(p?.fvm)||0), max=Math.max(0,Number(p?.maxPrice||p?.marketMax)||0);
    const starter=Number(p?.starterProbability??p?.starterProb??0);
    return fvm*1.0+Math.min(max,400)*0.08+(starter>0?starter*0.25:0)+(p?.strategic?8:0);
  }
  function isAvailable(p,ctx){return !ctx?.isAssigned||!ctx.isAssigned(p)}
  function slotMarket(players,roles,ctx){
    const pool=(players||[]).filter(p=>isAvailable(p,ctx)&&compatible(p,roles)).sort((a,b)=>quality(b)-quality(a));
    const top=pool.slice(0,10);
    const q=top.length?top.reduce((s,p)=>s+quality(p),0)/top.length:0;
    const scarcity=Math.max(0,1-Math.min(pool.length,30)/30);
    return {count:pool.length,quality:q,scarcity,top:pool.slice(0,3)};
  }
  function moduleScore(module,players,reg,ctx){
    const slotRows=module.slots.slice(1).map(roles=>slotMarket(players,roles,ctx));
    const coverage=slotRows.reduce((s,r)=>s+Math.min(1,r.count/8),0)/slotRows.length;
    const q=slotRows.reduce((s,r)=>s+Math.min(100,r.quality/2.4),0)/slotRows.length;
    const scarcityRisk=slotRows.reduce((s,r)=>s+r.scarcity,0)/slotRows.length;
    const flexibility=module.slots.slice(1).reduce((s,r)=>s+(r.length>1?1:0),0)/(module.slots.length-1);
    const score=Math.round(Math.max(0,Math.min(100,coverage*42+q*0.42+flexibility*12-scarcityRisk*8)));
    const critical=module.slots.slice(1).map((roles,i)=>({roles,row:slotRows[i]})).sort((a,b)=>b.row.scarcity-a.row.scarcity).slice(0,4);
    return {module,score,coverage:Math.round(coverage*100),quality:Math.round(q),flexibility:Math.round(flexibility*100),scarcityRisk:Math.round(scarcityRisk*100),critical};
  }
  function rankModules(players,reg,ctx){return MODULES.map(m=>moduleScore(m,players,reg,ctx)).sort((a,b)=>b.score-a.score)}
  function macroWeights(module,players,reg,ctx){
    const base={POR:0.08,DIF:0.20,CEN:0.27,ATT:0.45};
    const slotCount={POR:0,DIF:0,CEN:0,ATT:0};
    module.slots.forEach((roles,i)=>{
      if(i===0){slotCount.POR++;return}
      const macros=[...new Set(roles.map(r=>ROLE_MACRO[r]).filter(Boolean))];
      macros.forEach(m=>slotCount[m]+=1/macros.length);
    });
    const total=Object.values(slotCount).reduce((a,b)=>a+b,0)||11;
    const structural={};Object.keys(base).forEach(k=>structural[k]=slotCount[k]/total);
    const mixed={};Object.keys(base).forEach(k=>mixed[k]=base[k]*0.55+structural[k]*0.45);
    const sum=Object.values(mixed).reduce((a,b)=>a+b,0)||1;
    Object.keys(mixed).forEach(k=>mixed[k]/=sum);
    const budget=Number(reg?.budget?.initial)||2500;
    return Object.fromEntries(Object.entries(mixed).map(([k,v])=>[k,{pct:Math.round(v*100),credits:Math.round(v*budget)}]));
  }
  function bridgeRoles(a,b){
    const A=a.slots.slice(1).flat(),B=b.slots.slice(1).flat();
    const all=[...new Set(A.concat(B))];
    return all.map(role=>({role,a:A.filter(x=>x===role).length,b:B.filter(x=>x===role).length})).filter(x=>x.a&&x.b).sort((x,y)=>(y.a+y.b)-(x.a+x.b));
  }
  function build(profile,players,reg,ctx){
    const p={...DEFAULT_PROFILE,...profile,lastGeneratedAt:Date.now()};
    if(p.mode==="auto"){
      const ranked=rankModules(players,reg,ctx);p.primary=ranked[0]?.module.id||"433";p.secondary=ranked[1]?.module.id||"4231";
      return {profile:saveProfile(p),mode:"auto",ranked,primary:ranked[0],secondary:ranked[1],budget:macroWeights(ranked[0].module,players,reg,ctx)};
    }
    const primary=moduleScore(moduleById(p.primary),players,reg,ctx);
    const secondary=p.mode==="dual"?moduleScore(moduleById(p.secondary),players,reg,ctx):null;
    return {profile:saveProfile(p),mode:p.mode,primary,secondary,budget:macroWeights(primary.module,players,reg,ctx),bridges:secondary?bridgeRoles(primary.module,secondary.module):[]};
  }
  window.FA2Strategy={STORAGE_KEY,MODULES,DEFAULT_PROFILE:clone(DEFAULT_PROFILE),loadProfile,saveProfile,moduleById,rankModules,moduleScore,build,macroWeights};
})();
