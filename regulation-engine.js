/* FantaAsta2.0 — Regulation Engine alpha 1
   Unica sorgente di verità per le regole della lega. */
(function(){
  const STORAGE_KEY="fa2_regulation_v1";
  const SCHEMA=1;

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

  const clone=v=>JSON.parse(JSON.stringify(v));
  function mergeDeep(base,patch){
    if(Array.isArray(base))return Array.isArray(patch)?clone(patch):clone(base);
    if(!base||typeof base!=="object")return patch===undefined?base:patch;
    const out={...base};
    if(patch&&typeof patch==="object")Object.keys(patch).forEach(k=>{
      out[k]=(base[k]&&typeof base[k]==="object"&&!Array.isArray(base[k]))?mergeDeep(base[k],patch[k]):clone(patch[k]);
    });
    return out;
  }
  function normalize(raw){
    const r=mergeDeep(CURRENT_PRESET,raw||{});
    r.schema=SCHEMA;
    r.budget.initial=Math.max(1,Number(r.budget.initial)||2500);
    r.roster.total=Math.max(1,Number(r.roster.total)||25);
    r.roster.goalkeepers=Math.max(1,Number(r.roster.goalkeepers)||3);
    r.roster.movement=Math.max(0,r.roster.total-r.roster.goalkeepers);
    r.roster.clubLimit=Math.max(0,Number(r.roster.clubLimit)||0);
    r.underRules=(r.underRules||[]).map(x=>({...x,min:Math.max(0,Number(x.min)||0),enabled:x.enabled!==false}));
    return r;
  }
  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"))}catch{return clone(CURRENT_PRESET)}
  }
  function save(reg){
    const normalized=normalize(reg);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("fa2:regulation-changed",{detail:normalized}));
    return normalized;
  }
  function reset(){localStorage.removeItem(STORAGE_KEY);return save(CURRENT_PRESET)}
  function enabledUnder(reg=load()){return (reg.underRules||[]).filter(x=>x.enabled&&x.min>0)}
  function summary(reg=load()){
    return {
      budget:reg.budget.initial,
      roster:`${reg.roster.total} · ${reg.roster.goalkeepers} POR`,
      availability:reg.availability==="single"?"Singola":"Multipla",
      mode:String(reg.gameMode||"").toUpperCase(),
      under:enabledUnder(reg).map(x=>`${x.label} ${x.min}`).join(" · ")||"Nessun vincolo",
      clubLimit:reg.roster.clubLimit||"—",
      switchMode:reg.switchMode
    };
  }
  window.FA2Regulation={SCHEMA,STORAGE_KEY,CURRENT_PRESET:clone(CURRENT_PRESET),load,save,reset,normalize,enabledUnder,summary};
})();
