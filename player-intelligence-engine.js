/* FantaAsta2.0 — Player Identity Resolver A4.1
   Feed locale sincronizzato da GitHub Actions. Il browser NON esegue scraping:
   scarica soltanto player-intelligence.json e usa una cache locale sicura.

   Ordine di risoluzione identità:
   1. alias esplicito verificato;
   2. nome o alias normalizzato esatto;
   3. token esatti;
   4. cognome + contesto (iniziali, squadra e reparto);
   5. refuso di una lettera, solo con contesto univoco.

   I casi ambigui non vengono mai associati automaticamente. */
(function(){
  const STORAGE_KEY="fa2_player_intelligence_cache";
  const CHECK_KEY="fa2_player_intelligence_last_check";
  const SCHEMA=1;
  const RESOLVER_VERSION="A4.1";
  const FEED_URL="./player-intelligence.json";
  const AUTO_CHECK_MINUTES=360; // 6 ore
  const TEAM_NAMES={
    ATA:["atalanta"],BOL:["bologna"],CAG:["cagliari"],COM:["como"],FIO:["fiorentina"],
    FRO:["frosinone"],GEN:["genoa"],INT:["inter"],JUV:["juventus"],LAZ:["lazio"],
    LEC:["lecce"],MIL:["milan","ac milan"],MON:["monza"],NAP:["napoli"],PAR:["parma"],
    ROM:["roma","as roma"],SAS:["sassuolo"],TOR:["torino"],UDI:["udinese"],VEN:["venezia"]
  };
  // Casi Fantacalcio abbreviati già verificati contro l'identità del feed.
  // Il valore è la chiave stabile del record, non un nome cercato in modo fuzzy.
  const EXPLICIT_ALIASES=Object.freeze({
    edersonds:"ederson",
    martinezjo:"josepmartinez",
    martinezl:"lautaromartinez",
    traorehj:"htraore"
  });
  const PARTICLES=new Set(["da","de","del","della","di","do","dos","du","la","le","van","von"]);
  const METHOD_LABELS=Object.freeze({
    explicit:"ALIAS VERIFICATO",
    primary:"NOME ESATTO",
    alias:"ALIAS ESATTO",
    token:"TOKEN ESATTI",
    family_team_initial:"COGNOME + SQUADRA + INIZIALI",
    family_team:"COGNOME + SQUADRA",
    family_initial:"COGNOME + INIZIALI",
    family_unique:"COGNOME UNIVOCO",
    fuzzy_context:"SIMILITUDINE VERIFICATA"
  });

  let feed=loadCached();
  let indexes=null;
  let lookupCache=new Map();
  let indexedPlayersRef=null;

  function foldText(value){
    return String(value||"")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[đð]/gi,"d").replace(/[ł]/gi,"l").replace(/[ø]/gi,"o")
      .replace(/[ß]/g,"ss").replace(/[æ]/gi,"ae").replace(/[œ]/gi,"oe");
  }
  function wordTokens(value){
    return foldText(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
  }
  function normalizeName(name){return wordTokens(name).join("")}
  function tokenKey(name){return wordTokens(name).sort().join("|")}
  function emptyFeed(){return {schema:SCHEMA,generatedAt:"",sourceName:"API-Football / API-Sports",players:{},meta:{players:0,seasonsLoaded:[],sources:{apiFootball:"pending",fbref:"disabled-captcha"}}}}
  function validFeed(x){return !!x&&x.schema===SCHEMA&&x.players&&typeof x.players==="object"}
  function loadCached(){
    try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");return validFeed(x)?x:emptyFeed()}catch{return emptyFeed()}
  }
  function resetIndexes(){indexes=null;lookupCache=new Map();indexedPlayersRef=null}
  function saveCached(x){
    feed=x;resetIndexes();
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(x))}catch(error){
      console.warn("Player Intelligence cache locale non salvata:",error);
    }
    return x
  }
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
  function addCandidate(map,key,value){
    if(!key)return;
    const rows=map.get(key)||[];
    if(!rows.includes(value))rows.push(value);
    map.set(key,rows);
  }
  function primaryFamily(name){
    const tokens=wordTokens(name);
    return tokens[tokens.length-1]||"";
  }
  function deletionKeys(value){
    const out=new Set([value]);
    for(let i=0;i<value.length;i++)out.add(value.slice(0,i)+value.slice(i+1));
    return out;
  }
  function addQualifier(set,value){
    const v=normalizeName(value);
    if(!v||PARTICLES.has(v))return;
    for(let i=1;i<=Math.min(4,v.length);i++)set.add(v.slice(0,i));
  }
  function candidateQualifiers(record,family){
    const out=new Set(),primary=wordTokens(record?.name);
    if(primary.length>1)addQualifier(out,primary[0]);
    (record?.aliases||[]).forEach(alias=>{
      const tokens=wordTokens(alias),familyAt=tokens.indexOf(family);
      if(familyAt>0){
        const given=tokens.slice(0,familyAt);
        if(given.length&&!PARTICLES.has(given[0])){
          addQualifier(out,given[0]);
          const initials=given.filter(x=>!PARTICLES.has(x)).map(x=>x[0]).join("");
          addQualifier(out,initials);
        }
      }
    });
    return out;
  }
  function ensureIndexes(){
    const players=feed?.players||{};
    if(indexedPlayersRef===players&&indexes)return;
    indexes={primary:new Map(),alias:new Map(),token:new Map(),family:new Map(),deletion:new Map(),byKey:new Map(),meta:new Map()};
    Object.entries(players).forEach(([objectKey,record])=>{
      const stableKey=String(record?.key||objectKey||"");
      if(stableKey)indexes.byKey.set(stableKey,record);
      addCandidate(indexes.primary,normalizeName(record?.name),record);
      const aliases=[record?.name,...(record?.aliases||[])].filter(Boolean);
      aliases.forEach(alias=>{
        addCandidate(indexes.alias,normalizeName(alias),record);
        addCandidate(indexes.token,tokenKey(alias),record);
      });
      const family=primaryFamily(record?.name);
      if(family&&family.length>=3){
        addCandidate(indexes.family,family,record);
        if(family.length>=6)deletionKeys(family).forEach(key=>addCandidate(indexes.deletion,key,record));
      }
      indexes.meta.set(record,{family,qualifiers:candidateQualifiers(record,family)});
    });
    indexedPlayersRef=players;
    lookupCache=new Map();
  }

  function playerIdentity(player){
    const rawName=String(player?.name||player||"").trim(),tokens=wordTokens(rawName);
    const dotted=/\./.test(rawName);
    let family=tokens[tokens.length-1]||"",qualifier="",givenHint="";
    if(dotted&&tokens.length>1){
      const trailing=[];
      while(tokens.length-trailing.length>1){
        const token=tokens[tokens.length-1-trailing.length];
        if(token.length>3)break;
        trailing.unshift(token);
      }
      if(trailing.length){
        const familyTokens=tokens.slice(0,tokens.length-trailing.length);
        family=familyTokens[familyTokens.length-1]||family;
        qualifier=trailing.join("");
      }
    }else if(tokens.length>1){
      givenHint=tokens[0];
    }
    return {rawName,normalized:normalizeName(rawName),token:tokenKey(rawName),family,qualifier,givenHint};
  }
  function roleTokens(player){return String(player?.role||"").split("/").map(x=>x.trim()).filter(Boolean)}
  function compatibleGroups(player){
    const reparto=String(player?.reparto||"").toUpperCase(),roles=roleTokens(player),out=new Set();
    if(reparto==="POR"||roles.includes("Por")){out.add("GK");return out}
    if(reparto==="DIF"){
      out.add("DIF");
      if(roles.some(x=>["E","W"].includes(x)))out.add("CEN");
      return out;
    }
    if(reparto==="CEN"){
      out.add("CEN");
      if(roles.some(x=>["E","W"].includes(x)))out.add("DIF");
      if(roles.some(x=>["W","T","A"].includes(x)))out.add("ATT");
      return out;
    }
    if(reparto==="ATT"){
      out.add("ATT");
      if(roles.some(x=>["W","T","A"].includes(x)))out.add("CEN");
      return out;
    }
    return out;
  }
  function roleCompatible(player,record){
    const group=String(record?.positionGroup||"").toUpperCase(),allowed=compatibleGroups(player);
    return !group||!allowed.size||allowed.has(group);
  }
  function playerTeamNames(player){
    const code=String(player?.club||"").toUpperCase(),out=new Set();
    (TEAM_NAMES[code]||[]).forEach(x=>out.add(normalizeName(x)));
    if(player?.clubName)out.add(normalizeName(player.clubName));
    if(!TEAM_NAMES[code]&&player?.club)out.add(normalizeName(player.club));
    return out;
  }
  function recordTeamNames(record){
    const values=[record?.team,record?.latest?.team,...(record?.seasons||[]).map(x=>x?.team)].filter(Boolean),out=new Set();
    values.forEach(value=>String(value).split(/[\/,]/).forEach(x=>{const key=normalizeName(x);if(key)out.add(key)}));
    return out;
  }
  function teamMatches(player,record){
    const expected=playerTeamNames(player),actual=recordTeamNames(record);
    if(!expected.size||!actual.size)return false;
    for(const name of expected)if(actual.has(name))return true;
    return false;
  }
  function qualifierMatches(identity,record){
    const hint=identity.qualifier||identity.givenHint;
    if(!hint)return null;
    const meta=indexes.meta.get(record),qualifiers=meta?.qualifiers||new Set();
    if(!qualifiers.size)return null;
    return qualifiers.has(hint);
  }
  function uniqueRows(rows){return [...new Set(rows||[])]}
  function candidateSummary(rows){
    return uniqueRows(rows).slice(0,3).map(x=>({name:x?.name||"",team:x?.team||"",positionGroup:x?.positionGroup||""}));
  }
  function matched(record,method,confidence){
    return {data:record,matched:true,status:"matched",method,methodLabel:METHOD_LABELS[method]||method,confidence,ambiguous:false,candidateCount:1,candidates:[]};
  }
  function unresolved(status,rows=[],reason=""){
    const candidates=candidateSummary(rows);
    return {data:null,matched:false,status,method:"",methodLabel:"",confidence:0,ambiguous:status==="ambiguous",reason,candidateCount:candidates.length,candidates};
  }
  function resolveExactStage(rows,player,identity,method,confidence){
    const all=uniqueRows(rows),compatible=all.filter(x=>roleCompatible(player,x));
    if(!compatible.length)return {match:null,issue:all.length?unresolved("ambiguous",all,"reparto_non_compatibile"):null};
    if(compatible.length===1)return {match:matched(compatible[0],method,confidence),issue:null};
    const withQualifier=identity.qualifier||identity.givenHint?compatible.filter(x=>qualifierMatches(identity,x)===true):compatible;
    const pool=withQualifier.length?withQualifier:compatible;
    const byTeam=pool.filter(x=>teamMatches(player,x));
    if(byTeam.length===1)return {match:matched(byTeam[0],method,Math.min(99,confidence)),issue:null};
    if(pool.length===1)return {match:matched(pool[0],method,Math.min(98,confidence)),issue:null};
    return {match:null,issue:unresolved("ambiguous",pool,"piu_identita_esatte")};
  }
  function resolveFamilyStage(rows,player,identity,{fuzzy=false}={}){
    const all=uniqueRows(rows),compatible=all.filter(x=>roleCompatible(player,x));
    if(!compatible.length)return {match:null,issue:all.length?unresolved("ambiguous",all,"reparto_non_compatibile"):null};
    const hasHint=!!(identity.qualifier||identity.givenHint);
    const qualified=hasHint?compatible.filter(x=>qualifierMatches(identity,x)===true):compatible;
    if(hasHint&&!qualified.length)return {match:null,issue:unresolved("ambiguous",compatible,"iniziali_non_coincidenti")};
    const pool=qualified,byTeam=pool.filter(x=>teamMatches(player,x));
    let record=null,method="",confidence=0;
    if(byTeam.length===1){
      record=byTeam[0];method=hasHint?"family_team_initial":"family_team";confidence=hasHint?96:92;
    }else if(pool.length===1){
      record=pool[0];method=hasHint?"family_initial":"family_unique";confidence=hasHint?92:87;
    }
    if(!record)return {match:null,issue:unresolved("ambiguous",pool,"contesto_non_univoco")};
    if(fuzzy){
      // Un refuso viene accettato soltanto con una prova contestuale aggiuntiva.
      if(!teamMatches(player,record)&&!hasHint)return {match:null,issue:unresolved("ambiguous",pool,"fuzzy_senza_contesto")};
      method="fuzzy_context";confidence=Math.min(84,confidence);
    }
    return {match:matched(record,method,confidence),issue:null};
  }
  function editDistanceAtMostOne(a,b){
    if(a===b)return true;
    if(Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,diffs=0;
    while(i<a.length&&j<b.length){
      if(a[i]===b[j]){i++;j++;continue}
      if(++diffs>1)return false;
      if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
    }
    return diffs+(i<a.length||j<b.length?1:0)<=1;
  }
  function fuzzyFamilyRows(family){
    if(!family||family.length<6)return [];
    const candidates=[];
    deletionKeys(family).forEach(key=>(indexes.deletion.get(key)||[]).forEach(x=>candidates.push(x)));
    return uniqueRows(candidates).filter(x=>editDistanceAtMostOne(family,indexes.meta.get(x)?.family||""));
  }
  function cacheKey(player,identity){
    if(typeof player==="string")return `${identity.normalized}|||`;
    return [identity.normalized,String(player?.club||""),String(player?.reparto||""),String(player?.role||"")].join("|");
  }
  function resolve(player){
    if(!player)return unresolved("missing",[],"giocatore_assente");
    ensureIndexes();
    const identity=playerIdentity(player),key=cacheKey(player,identity);
    if(lookupCache.has(key))return lookupCache.get(key);
    let issue=null;
    const remember=result=>{lookupCache.set(key,result);return result};
    const explicitKey=EXPLICIT_ALIASES[identity.normalized],explicit=explicitKey?indexes.byKey.get(explicitKey):null;
    if(explicit&&roleCompatible(player,explicit))return remember(matched(explicit,"explicit",100));
    const stages=[
      [indexes.primary.get(identity.normalized),"primary",100],
      [indexes.alias.get(identity.normalized),"alias",98],
      [indexes.token.get(identity.token),"token",96]
    ];
    for(const [rows,method,confidence] of stages){
      if(!rows?.length)continue;
      const result=resolveExactStage(rows,player,identity,method,confidence);
      if(result.match)return remember(result.match);
      issue=result.issue||issue;
    }
    const familyRows=indexes.family.get(identity.family)||[];
    if(familyRows.length){
      const result=resolveFamilyStage(familyRows,player,identity);
      if(result.match)return remember(result.match);
      issue=result.issue||issue;
    }else{
      const fuzzyRows=fuzzyFamilyRows(identity.family);
      if(fuzzyRows.length){
        const result=resolveFamilyStage(fuzzyRows,player,identity,{fuzzy:true});
        if(result.match)return remember(result.match);
        issue=result.issue||issue;
      }
    }
    return remember(issue||unresolved("missing",[],"storico_non_presente"));
  }
  function get(player){return resolve(player).data}
  function prime(players=[]){ensureIndexes();(players||[]).forEach(p=>resolve(p));return lookupCache.size}
  function diagnostics(players=[]){
    const result={resolverVersion:RESOLVER_VERSION,total:0,matched:0,unmatched:0,ambiguous:0,missing:0,candidateCases:0,coverage:0,resolutionRate:0,methods:{}};
    (players||[]).forEach(player=>{
      result.total++;
      const identity=resolve(player);
      if(identity.matched){result.matched++;result.methods[identity.method]=(result.methods[identity.method]||0)+1}
      else{result.unmatched++;if(identity.ambiguous)result.ambiguous++;else result.missing++}
    });
    result.coverage=result.total?Math.round(result.matched/result.total*1000)/10:0;
    result.candidateCases=result.matched+result.ambiguous;
    result.resolutionRate=result.candidateCases?Math.round(result.matched/result.candidateCases*1000)/10:0;
    return result;
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

  window.FA2PlayerIntelligence={SCHEMA,RESOLVER_VERSION,STORAGE_KEY,FEED_URL,getFeed:()=>feed,get,resolve,diagnostics,score,reliability,trend,status,ageMinutes,formatAge,generatedLabel,refresh,maybeRefresh,normalizeName,tokenKey,prime,methodLabel:method=>METHOD_LABELS[method]||method};
})();
