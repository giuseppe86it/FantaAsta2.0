/* FantaAsta2.0 — Regulation Engine alpha 2
   Sorgente unica delle regole usate dal nuovo Strategy Engine.
   Migra automaticamente il profilo alpha 1. */
(function(){
  const STORAGE_KEY="fa2_regulation_v2";
  const LEGACY_KEY="fa2_regulation_v1";
  const SCHEMA=2;
  const clone=v=>JSON.parse(JSON.stringify(v));

  const CURRENT_PRESET={
    schema:SCHEMA,
    id:"mia-lega",
    name:"La mia lega",
    season:"2026/27",
    availability:"single",
    gameMode:"mantra",
    budget:{initial:2500,minBid:1,minResidualPerSlot:1},
    roster:{total:25,goalkeepers:3,movement:22,clubLimit:5},
    underRules:[
      {id:"u23",enabled:true,maxAge:23,birthYearFrom:2003,min:2,label:"U23"},
      {id:"u21",enabled:true,maxAge:21,birthYearFrom:2005,min:1,label:"U21"}
    ],
    bench:{size:12,minGoalkeepers:1,movement:"variable"},
    formation:{timeoutMinutes:5,hidden:false,missingLineup:"previous"},
    switchMode:"plus",
    scoring:{
      source:"fantacalcio",
      bonuses:{goal:3,goalAgainst:-1,penaltyScored:3,penaltyMissed:-3,penaltySaved:3,yellow:-0.5,red:-1,assistStandard:1,assistSoft:1,assistGold:1,ownGoal:-2,equalizer:0,winner:0,cleanSheet:1,playerOfMatch:0.5},
      goalThreshold:{firstGoal:66,mode:"fixed",step:6},
      limitWin:{enabled:false,delta:0},
      limitDraw:{enabled:false,delta:0},
      autoGoal:{enabled:false,threshold:0},
      bookedNoVote:true
    },
    modifiers:{
      dFactor:{enabled:true,includeGoalkeeper:true,applyTo:"own",preset:"recommended",bands:[
        {lt:6,value:0},{gte:6,lt:6.25,value:1},{gte:6.25,lt:6.5,value:2},{gte:6.5,lt:6.75,value:3},{gte:6.75,lt:7,value:4.5},{gte:7,value:6}
      ]},
      performance:{enabled:false},
      fairplay:{enabled:true,bonus:0.5},
      captain:{enabled:false,bands:[]}
    },
    auction:{phases:["POR","DIF","CEN","ATT"],singleAvailability:true}
  };

  function mergeDeep(base,patch){
    if(Array.isArray(base))return Array.isArray(patch)?clone(patch):clone(base);
    if(!base||typeof base!=="object")return patch===undefined?base:patch;
    const out={...base};
    if(patch&&typeof patch==="object")Object.keys(patch).forEach(k=>{
      const bv=base[k],pv=patch[k];
      out[k]=(bv&&typeof bv==="object"&&!Array.isArray(bv)&&pv&&typeof pv==="object"&&!Array.isArray(pv))?mergeDeep(bv,pv):clone(pv);
    });
    return out;
  }
  const num=(v,d=0,min=-Infinity,max=Infinity)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Number(v):d));
  function normalize(raw){
    const r=mergeDeep(CURRENT_PRESET,raw||{});
    r.schema=SCHEMA;
    r.availability=r.availability==="multiple"?"multiple":"single";
    r.gameMode=r.gameMode==="classic"?"classic":"mantra";
    r.switchMode=["off","switch","plus"].includes(r.switchMode)?r.switchMode:"plus";
    r.budget.initial=num(r.budget.initial,2500,1,100000);
    r.budget.minBid=num(r.budget.minBid,1,1,1000);
    r.budget.minResidualPerSlot=num(r.budget.minResidualPerSlot,1,0,1000);
    r.roster.total=Math.round(num(r.roster.total,25,1,100));
    r.roster.goalkeepers=Math.round(num(r.roster.goalkeepers,3,1,r.roster.total));
    r.roster.movement=Math.max(0,r.roster.total-r.roster.goalkeepers);
    r.roster.clubLimit=Math.round(num(r.roster.clubLimit,5,0,99));
    r.underRules=(r.underRules||[]).map(x=>({
      ...x,
      id:String(x.id||"under"),label:String(x.label||"UNDER"),enabled:x.enabled!==false,
      maxAge:Math.round(num(x.maxAge,23,16,30)),birthYearFrom:Math.round(num(x.birthYearFrom,2003,1900,2100)),min:Math.round(num(x.min,0,0,r.roster.total))
    }));
    r.bench.size=Math.round(num(r.bench.size,12,0,50));
    r.bench.minGoalkeepers=Math.round(num(r.bench.minGoalkeepers,1,0,10));
    r.formation.timeoutMinutes=Math.round(num(r.formation.timeoutMinutes,5,0,120));
    r.formation.hidden=!!r.formation.hidden;
    r.scoring.goalThreshold.firstGoal=num(r.scoring.goalThreshold.firstGoal,66,0,200);
    r.scoring.goalThreshold.step=num(r.scoring.goalThreshold.step,6,.5,50);
    r.scoring.bookedNoVote=!!r.scoring.bookedNoVote;
    r.modifiers.dFactor.enabled=!!r.modifiers.dFactor.enabled;
    r.modifiers.dFactor.includeGoalkeeper=!!r.modifiers.dFactor.includeGoalkeeper;
    r.modifiers.performance.enabled=!!r.modifiers.performance.enabled;
    r.modifiers.fairplay.enabled=!!r.modifiers.fairplay.enabled;
    r.modifiers.fairplay.bonus=num(r.modifiers.fairplay.bonus,.5,-10,10);
    r.modifiers.captain.enabled=!!r.modifiers.captain.enabled;
    r.auction.singleAvailability=r.availability==="single";
    return r;
  }
  function rawStored(){
    let raw=null;
    try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")}catch{}
    if(raw)return raw;
    try{raw=JSON.parse(localStorage.getItem(LEGACY_KEY)||"null")}catch{}
    return raw;
  }
  function load(){return normalize(rawStored()||CURRENT_PRESET)}
  function save(reg){
    const normalized=normalize(reg);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("fa2:regulation-changed",{detail:normalized}));
    return normalized;
  }
  function reset(){localStorage.removeItem(STORAGE_KEY);return save(CURRENT_PRESET)}
  function enabledUnder(reg=load()){return (reg.underRules||[]).filter(x=>x.enabled&&x.min>0)}
  function underRule(reg,id){return (reg?.underRules||[]).find(x=>x.id===id)||null}
  function summary(reg=load()){
    return {
      budget:reg.budget.initial,
      roster:`${reg.roster.total} · ${reg.roster.goalkeepers} POR`,
      availability:reg.availability==="single"?"Singola":"Multipla",
      mode:String(reg.gameMode||"").toUpperCase(),
      under:enabledUnder(reg).map(x=>`${x.label} ${x.min}`).join(" · ")||"Nessun vincolo",
      clubLimit:reg.roster.clubLimit||"—",
      switchMode:reg.switchMode,
      modifiers:[reg.modifiers.dFactor.enabled?"D Factor":null,reg.modifiers.fairplay.enabled?"Fairplay":null,reg.modifiers.captain.enabled?"Capitano":null].filter(Boolean).join(" · ")||"Nessuno"
    };
  }
  window.FA2Regulation={SCHEMA,STORAGE_KEY,LEGACY_KEY,CURRENT_PRESET:clone(CURRENT_PRESET),load,save,reset,normalize,enabledUnder,underRule,summary};
})();
