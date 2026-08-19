/* FantaAsta2.0 — Player Intelligence Engine alpha 3.1
   Feed locale sincronizzato da GitHub Actions. Il browser NON esegue scraping:
   scarica soltanto player-intelligence.json e usa una cache locale sicura. */
(function(){
  const STORAGE_KEY="fa2_player_intelligence_cache";
  const CHECK_KEY="fa2_player_intelligence_last_check";
  const SCHEMA=1;
  const FEED_URL="./player-intelligence.json";
  const AUTO_CHECK_MINUTES=360; // 6 ore
  let feed=loadCached();

  function normalizeName(name){
    return String(name||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
  }
  function tokenKey(name){
    return String(name||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean).sort().join("|");
  }
  function emptyFeed(){return {schema:SCHEMA,generatedAt:"",sourceName:"API-Football / API-Sports",players:{},meta:{players:0,seasonsLoaded:[],sources:{apiFootball:"pending",fbref:"disabled-captcha"}}}}
  function validFeed(x){return !!x&&x.schema===SCHEMA&&x.players&&typeof x.players==="object"}
  function loadCached(){
    try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");return validFeed(x)?x:emptyFeed()}catch{return emptyFeed()}
  }
  function saveCached(x){feed=x;localStorage.setItem(STORAGE_KEY,JSON.stringify(x));return x}
  function ageMinutes(){
    const t=Date.parse(feed?.generatedAt||"");
    return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):Infinity;
  }
  function lastCheckMinutes(){
    const t=Number(localStorage.getItem(CHECK_KEY)||0);
    return t?Math.max(0,(Date.now()-t)/60000):Infinity;
  }
  function status(){
    const age=ageMinutes(),count=Number(feed?.meta?.players||Object.keys(feed?.players||{}).length||0);
    if(!count)return {label:"NON CARICATO",className:"missing",ageMinutes:age,count};
    if(age<=36*60)return {label:"AGGIORNATO",className:"fresh",ageMinutes:age,count};
    if(age<=7*24*60)return {label:"DATI RECENTI",className:"cached",ageMinutes:age,count};
    return {label:"DATI DATATI",className:"stale",ageMinutes:age,count};
  }
  function buildTokenIndex(){
    const idx=new Map();
    Object.values(feed?.players||{}).forEach(x=>{
      const keys=[x?.tokenKey,...(x?.aliasTokenKeys||[]),...(x?.aliases||[]).map(tokenKey)].filter(Boolean);
      keys.forEach(k=>{if(!idx.has(k))idx.set(k,x)});
    });
    return idx;
  }
  function get(player){
    if(!player)return null;
    const key=normalizeName(player.name||player);
    let out=feed?.players?.[key]||null;
    if(out)return out;
    const rawName=player.name||player;
    const tk=tokenKey(rawName);
    if(tk){const byToken=buildTokenIndex().get(tk);if(byToken)return byToken}
    // Fallback prudente: cognome univoco nel feed. Utile quando il Listone abbrevia il nome.
    const tokens=String(rawName||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
    const surname=tokens[tokens.length-1];
    if(surname&&surname.length>=4){
      const matches=Object.values(feed?.players||{}).filter(x=>(x?.aliases||[x?.name]).some(a=>{const ts=String(a||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);return ts.includes(surname)}));
      if(matches.length===1)return matches[0];
    }
    return null;
  }
  function score(player){return Number(get(player)?.score||0)||0}
  function reliability(player){return Number(get(player)?.reliability||0)||0}
  function trend(player){return Number(get(player)?.trend||0)||0}
  async function refresh({manual=false}={}){
    localStorage.setItem(CHECK_KEY,String(Date.now()));
    try{
      const sep=FEED_URL.includes("?")?"&":"?";
      const response=await fetch(`${FEED_URL}${sep}ts=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!validFeed(data))throw new Error("feed non valido");
      const count=Number(data?.meta?.players||Object.keys(data.players||{}).length||0);
      const previousCount=Number(feed?.meta?.players||Object.keys(feed?.players||{}).length||0);
      // Non sovrascrivere una cache buona con un feed evidentemente incompleto.
      if(count<80 && previousCount>=80)throw new Error(`feed incompleto (${count} giocatori)`);
      saveCached(data);
      window.dispatchEvent(new CustomEvent("fa2:player-intelligence-updated",{detail:{manual,count,generatedAt:data.generatedAt}}));
      return {ok:true,data,count};
    }catch(error){
      window.dispatchEvent(new CustomEvent("fa2:player-intelligence-error",{detail:{manual,error:String(error?.message||error)}}));
      return {ok:false,error:String(error?.message||error),data:feed};
    }
  }
  function maybeRefresh(){if(lastCheckMinutes()>=AUTO_CHECK_MINUTES||!Number(feed?.meta?.players||0))return refresh({manual:false});return Promise.resolve({ok:true,data:feed,cached:true})}
  function formatAge(){
    const m=ageMinutes();
    if(!Number.isFinite(m))return "mai";
    if(m<60)return `${Math.max(0,Math.round(m))} min fa`;
    if(m<1440)return `${Math.round(m/60)} h fa`;
    return `${Math.round(m/1440)} gg fa`;
  }
  function generatedLabel(){
    const d=new Date(feed?.generatedAt||"");
    if(Number.isNaN(d.getTime()))return "—";
    return d.toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }

  window.FA2PlayerIntelligence={SCHEMA,STORAGE_KEY,FEED_URL,getFeed:()=>feed,get,score,reliability,trend,status,ageMinutes,formatAge,generatedLabel,refresh,maybeRefresh,normalizeName,tokenKey};
})();
