/* Singify songs.js: everything about how songs are fetched, cleaned and de-duplicated.
   Edit this file for song/search fixes; index.html does not need to change.
   Loaded as a classic script before the main app script, so it shares its globals (api, dec, pic, C, pool, search ...). */
function norm(s){
 const im=Array.isArray(s.image)?(s.image[s.image.length-1]||{}).url:s.image;
 const dl=Array.isArray(s.downloadUrl)?s.downloadUrl.filter(d=>d&&d.url&&!/_12\.(mp4|m4a)$/i.test(d.url)):null; /* _12 = 12kbps stub/preview, never a full song */
 const u=dl?(dl[dl.length-1]||{}).url:(s.media_url||s.url);
 const al=s.album&&typeof s.album==='object'?s.album.name:s.album;
 const o={id:String(s.id),title:dec(s.name||s.song||s.title),artist:dec(s.artists&&s.artists.primary?s.artists.primary.map(a=>a.name).join(', '):(s.primary_artists||s.singers||'')),alb:dec(al),img:(im||'').replace(/150x150|50x50/,'500x500'),url:u,dur:+s.duration||0,pc:+s.playCount||0,rd:String(s.releaseDate||s.release_date||'').slice(0,10),yr:+s.year||0,lang:String(s.language||'').toLowerCase(),ar:(s.artists&&s.artists.primary||[]).slice(0,2).map(a=>({id:String(a.id),n:dec(a.name),img:pic(a)})),pa:(s.artists&&s.artists.primary||[]).map(a=>({id:String(a.id),n:dec(a.name),img:pic(a),r:String(a.role||'')}))};
 C[o.id]=o;return o}
/* ---------- duplicates: the same song is uploaded in many compilations (different id + cover) ---------- */
const VER=/remix|lo-?fi|slowed|reverb|sped|live|unplugged|acoustic|reprise|cover|version|mix|instrumental|mashup|karaoke|club|dj|edit|jhankar|cinematic|extended|female|male|duet|rap|unwind/i;
const COMP=/\b(hits?|best of|top|mix|dance|party|songs?|forever|vibes|love|romance|romantic|romanc\w*|20\d\d|playlist|collection|jukebox|unlimited|reloaded|diaries|essentials|chartbusters?|trending|special|favou?rites?|retro|melod(y|ies)|era|years|workout|chill|lofi|beats|soulful|couple|monsoon|wedding|next on repeat|world music|fit|dhamaka|starters|mood|moods|night|nights|club|bollywood|hindi|punjabi|evergreen|golden|classics?|magic|memories|feelings?|heartbeat|midnight|cafe|road trip|hot)\b/gi;
function tkey(s){let t=String(s.title||'').toLowerCase();
 t=t.replace(/[\(\[]([^\)\]]*)[\)\]]/g,(m,x)=>VER.test(x)?' '+x+' ':' ');
 t=t.replace(/\s[-–]\s*(from|title track|original|film version|motion picture).*$/i,'');
 const v=(t.match(VER)||[]).map(x=>x.toLowerCase()).sort().join('+');
 return t.replace(/[^a-z0-9ऀ-ॿ]+/g,'')+'|'+v}
const aset=s=>String(s.artist||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
function sameSong(a,b){if(tkey(a)!==tkey(b))return false;
 if(a.dur&&b.dur)return Math.abs(a.dur-b.dur)<=4;
 const x=aset(a),y=aset(b);return x.some(n=>y.includes(n))}
function songScore(s){const m=(String(s.alb||'').match(COMP)||[]).length,al=String(s.alb||'').toLowerCase().replace(/[^a-z0-9]/g,''),tt=String(s.title||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 /* an album that has the song's own name in it (e.g. film title track) is most likely the original */
 return (s.url?1e12:0)-m*1e9+(al&&tt&&al!==tt&&tt.includes(al)?5e8:0)+(+s.pc||0)}
function dedupe(list){const out=[];(list||[]).forEach(s=>{if(!s||!s.url)return;const i=out.findIndex(o=>sameSong(o,s));if(i<0)out.push(s);else if(songScore(s)>songScore(out[i]))out[i]=s});return out}
function searchNet(q){return(async()=>{
 const rs=j=>{const r=(j.data&&j.data.results)||j.data||j.results||j;return Array.isArray(r)?r:[]},seen={},out=[],add=l=>l.forEach(x=>{if(!seen[x.id]){seen[x.id]=1;out.push(x)}});
 for(const [p,k] of [['/api/search/songs',{query:q,limit:30}],['/result/',{query:q,lyrics:'false'}]]){
  try{const j=await api(p,k),r=rs(j);
   if(r.length){add(r.map(norm));
    if(p==='/api/search/songs'&&out.length<20){const m=await Promise.all([1,2].map(pg=>api(p,{query:q,limit:30,page:pg}).then(rs).catch(()=>[])));m.forEach(l=>add(l.map(norm)))}
    return dedupe(out)}
   LE=p+' -> '+JSON.stringify(j).slice(0,100)}catch(e){LE=p+' -> '+e.message}}
 return[]})()}
async function entNet(type,id,name){
 try{
  if(type==='artist'){if(!id){const j=await api('/api/search/artists',{query:name,limit:1});const f=((j.data&&j.data.results)||[])[0];id=f&&f.id}
   if(id){const pg=async n=>{try{const j=await api('/api/artists/'+id+'/songs',{page:n,sortBy:'popularity',sortOrder:'desc'});return((j.data&&j.data.songs)||[]).map(norm)}catch(e){return[]}},f=await pg(0);
   if(f.length){const rest=await pool(Array.from({length:11},(_,i)=>()=>pg(i+1))),seen={},all=[...f,...rest.flat()].filter(s=>!seen[s.id]&&(seen[s.id]=1));
    if(all.length<100){const k=(name||'').toLowerCase(),more=await pool([1,2,3,4,5].map(p=>()=>api('/api/search/songs',{query:name,limit:30,page:p}).then(j=>((j.data&&j.data.results)||[]).map(norm)).catch(()=>[])));
     more.flat().forEach(s=>{if(s.url&&!seen[s.id]&&s.artist.toLowerCase().includes(k)){seen[s.id]=1;all.push(s)}})}
    return dedupe(all)}}}
  else if(id){const j=await api('/api/'+(type==='album'?'albums':'playlists'),{id,limit:50}),r=(j.data&&j.data.songs)||[];if(r.length)return r.map(norm)}
 }catch(e){}
 return search(name)}


/* ---------- smarter search: ranking, spelling tolerance, more pages ---------- */
const nzq=t=>String(t||'').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g,' ').trim();
/* rough "sounds like" key: podin and pudina, pyar and pyaar end up close to each other */
function pkey(t){return nzq(t).replace(/ph/g,'f').replace(/w/g,'v').replace(/z/g,'j').replace(/y/g,'i').replace(/h/g,'').replace(/o/g,'u').replace(/e/g,'i').replace(/(.)\1+/g,'$1')}
function rankSongs(list,q){const n=nzq(q);if(!list||list.length<2||!n)return list||[];const pk=pkey(q),
 cl=t=>nzq(String(t||'').replace(/[\(\[][^\)\]]*[\)\]]/g,' ').replace(/\s[-\u2013]\s*(from|title track|original|film version|motion picture).*$/i,'')),
 tier=s=>{const t=cl(s.title),pt=pkey(t),ar=nzq(s.artist),al=nzq(s.alb);
  if(t===n)return 0;                       /* the song is called exactly this */
  if(t.startsWith(n))return 1;             /* the title starts with it */
  if((' '+t).includes(' '+n))return 2;     /* a word of the title starts with it */
  if(t.includes(n))return 3;
  if(pk&&pt.includes(pk))return pt.startsWith(pk)?3.5:4; /* spelled a bit differently */
  if(ar.includes(n)||al.includes(n))return 5;
  return 6},
 pop=s=>((typeof PC!=='undefined'&&PC&&PC[s.id])||0)*1e7+(+s.pc||0);
 const rows=list.map((s,i)=>{const t=tier(s),p=pop(s);
  /* a very popular song that is only spelled differently (Pudina for podin) goes right after the exact matches */
  return{s,t:(t===3.5||t===4)&&p>=1e5?0.5:t,p,i,k:cl(s.title)}}).sort((a,b)=>a.t-b.t||b.p-a.p||a.i-b.i);
 /* the same title many times (different artists): 3 stay up, the rest follow after the close matches, nothing is removed */
 const cnt={},keep=[],over=[];rows.forEach(r=>{if(r.t<=4){cnt[r.k]=(cnt[r.k]||0)+1;(cnt[r.k]>3?over:keep).push(r)}else keep.push(r)});
 const near=keep.filter(r=>r.t<=4),far=keep.filter(r=>r.t>4);
 return near.concat(over,far).map(r=>r.s)}
function qVariants(q){const s=nzq(q),o=[],add=v=>{if(v&&v!==s&&!o.includes(v))o.push(v)};
 add(s.replace(/o/g,'u'));add(s.replace(/u/g,'o'));add(s.replace(/e/g,'i'));add(s.replace(/i/g,'e'));add(s.replace(/(.)\1+/g,'$1'));add(s.replace(/w/g,'v'));return o.slice(0,3)}
/* few results that really match the typed word -> also look up the likely spellings (podin -> pudin -> Pudina) */
async function widenSongs(list,q){try{const pk=pkey(q);if(pk.replace(/ /g,'').length<3)return list;
 if(list.filter(s=>pkey(s.title).includes(pk)).length>=8)return list;
 const vs=qVariants(q);if(!vs.length)return list;
 const rs=j=>{const r=(j.data&&j.data.results)||j.data||j.results||j;return Array.isArray(r)?r:[]};
 const res=await Promise.all(vs.map(v=>api('/api/search/songs',{query:v,limit:30}).then(rs).catch(()=>[])));
 const seen=new Set(list.map(x=>x.id)),out=list.slice();
 res.forEach(l=>l.map(norm).forEach(x=>{if(x.url&&!seen.has(x.id)){seen.add(x.id);out.push(x)}}));
 return dedupe(out)}catch(e){return list}}
/* more results for "Show more" / scrolling: next pages first, then a few related searches; done = really nothing left */
async function fetchMoreSongs(R){if(!R||R.done)return;
 const rs=j=>{const r=(j.data&&j.data.results)||j.data||j.results||j;return Array.isArray(r)?r:[]},
  take=l=>{const have=new Set(R.songs.map(x=>x.id));return rankSongs(dedupe(l.map(norm)).filter(x=>!have.has(x.id)&&!R.songs.some(o=>sameSong(o,x))),R.q)};
 try{
  if(!R.pgEnd){
   for(let k=0;k<3&&!R.pgEnd;k++){R.pg=(R.pg||0)+1;const r=rs(await api('/api/search/songs',{query:R.q,limit:30,page:R.pg}));
    if(!r.length||R.pg>=15)R.pgEnd=1;
    const f=take(r);if(f.length){R.songs=R.songs.concat(f);R.dry=0;return}}
   if((R.dry=(R.dry||0)+1)>=2)R.pgEnd=1}
  if(R.pgEnd&&!R.rel){R.rel=1;
   const qs=[R.q+' song',R.q+' hindi song'].concat(qVariants(R.q)).slice(0,4),
    res=await Promise.all(qs.map(v=>api('/api/search/songs',{query:v,limit:30}).then(rs).catch(()=>[]))),f=take([].concat(...res));
   if(f.length){R.songs=R.songs.concat(f);return}}
  if(R.pgEnd&&R.rel)R.done=1
 }catch(e){R.done=1}}
async function ensureMore(R,need){for(let i=0;i<6&&R.songs.length<need&&!R.done;i++)await fetchMoreSongs(R)}

/* CDN links expire: fetch a fresh stream link for a song by its id */
async function resolveTrackUrls(s){try{const j=await api('/api/songs',{ids:s.id}),raw=Array.isArray(j.data)?j.data[0]:((j.data&&j.data.results&&j.data.results[0])||j.data),f=raw&&raw.id?norm(raw):null;return f&&f.url?f:null}catch(e){return null}}
/* songs similar to a given song (used when the queue runs out) */
async function suggestNet(s){try{const j=await api('/api/songs/'+encodeURIComponent(s.id)+'/suggestions',{limit:15}),raw=Array.isArray(j.data)?j.data:((j.data&&j.data.results)||[]);return dedupe(raw.map(norm))}catch(e){return[]}}

/* =====================================================================
   SMART MUSIC SYSTEM: similar-songs queue, Daily Mood, weekly trending.
   Everything below uses globals of the main app at call time (Q, qi, A, hist, liked, ST, FU, DB ...).
   ===================================================================== */
let SES=new Set(),SMQ=null,SMB=0,CNT={id:'',acc:0,done:0};

/* ---------- similar-songs queue ---------- */
/* Tap a song from search / home / trending / recently played -> similar songs follow.
   Playlists, albums, artist pages, Liked Songs, downloads and Daily Mood keep their own list as it is. */
function smartCtx(ctx){
 if(/^(pl|liked|dls)/.test(ctx))return false;
 if(ctx==='list')return !/^#\/(ent|daily)\b/.test(location.hash);
 return true}
function smartPlay(ctx,list,i){
 const s=list&&list[i];
 if(!s||!smartCtx(ctx))return play(list,i);
 play([s],0);SMQ=Q;smartFill(s,false)}
async function smartFill(seed,more){
 try{
  const q0=Q,base=q0.map(x=>x.id),avoid=new Set([...SES,...(hist||[]).slice(0,40).map(x=>x.id)]),max=more?15:25;
  const first=await suggestNet(seed);
  const hop=await Promise.all(first.slice(0,3).map(x=>suggestNet(x)));
  const cand=dedupe(first.concat(...hop));
  const pick=useLang=>{const have=new Set(base),cnt={},out=[];
   for(const x of cand){
    if(have.has(x.id)||avoid.has(x.id)||q0.some(o=>sameSong(o,x)))continue;
    if(useLang&&seed.lang&&x.lang&&x.lang!==seed.lang)continue; /* English stays with English */
    const a=(x.ar&&x.ar[0]&&x.ar[0].id)||x.artist;
    if((cnt[a]=(cnt[a]||0)+1)>3)continue; /* same artist not again and again */
    have.add(x.id);out.push(x);if(out.length>=max)break}
   return out};
  let out=pick(true);
  if(out.length<5){const ids=new Set(out.map(x=>x.id));out=out.concat(pick(false).filter(x=>!ids.has(x.id))).slice(0,max)} /* too few of the same language: fill up with the rest */
  if(Q!==q0||SMQ!==q0)return; /* user already moved to another list */
  out.forEach(x=>q0.push(x));
  try{qpRender()}catch(e){}
 }catch(e){}}

/* ---------- Daily Mood: 50 songs a day from what the user listens to ---------- */
const dKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};
function seedShuffle(a,seed){let h=0;for(const c of String(seed))h=(h*31+c.charCodeAt(0))>>>0;
 const r=()=>{h=(h*1664525+1013904223)>>>0;return h/4294967296},b=(a||[]).slice();
 for(let i=b.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
async function dailyMood(){
 const k=dKey(),c=ls('sg_dm',null);
 if(c&&c.d===k&&c.l&&c.l.length>=20){c.l.forEach(s=>C[s.id]=s);return c.l}
 const prev=new Set((c&&c.ids)||[]),heard=new Set((hist||[]).slice(0,60).map(x=>x.id));
 const hp=(hist||[]).filter(x=>(PC[x.id]||0)>0),hs=hp.length>=3?hp:(hist||[]);const seeds=[];hs.slice(0,12).forEach(s=>seeds.push(s));seedShuffle(liked||[],k).slice(0,4).forEach(s=>seeds.push(s));
 const uniq=[];seeds.forEach(s=>{if(s&&s.id&&!uniq.some(u=>u.id===s.id))uniq.push(s)});
 let pool=[];
 const res=await Promise.all(seedShuffle(uniq,k).slice(0,7).map(s=>suggestNet(s)));
 res.forEach(l=>pool.push(...l));
 const arts=Object.entries((typeof ST!=='undefined'&&ST&&ST.art)||{}).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
 for(const a of arts){try{pool.push(...(await search(a)).slice(0,12))}catch(e){}}
 if(pool.length<30){try{pool.push(...(await search(ARTISTS[Math.floor(Math.random()*ARTISTS.length)])))}catch(e){}}
 pool=dedupe(pool);
 const fresh=pool.filter(x=>!heard.has(x.id)&&!prev.has(x.id)),old=pool.filter(x=>heard.has(x.id)&&!prev.has(x.id));
 const cnt={},out=[],add=x=>{const a=(x.ar&&x.ar[0]&&x.ar[0].id)||x.artist;if((cnt[a]=(cnt[a]||0)+1)>4)return;if(out.some(o=>o.id===x.id||sameSong(o,x)))return;out.push(x)};
 seedShuffle(fresh,k).forEach(x=>{if(out.length<50)add(x)}); /* mostly new songs in the user's taste */
 seedShuffle(old,k).forEach(x=>{if(out.length<50)add(x)});  /* then a few songs the user already likes */
 const list=seedShuffle(out,k+'x').slice(0,50);
 if(list.length>=10){try{localStorage.setItem('sg_dm',JSON.stringify({d:k,l:list.map(slimS),ids:list.map(x=>x.id)}))}catch(e){}}
 return list}

/* ---------- weekly trending: total minutes played in Singify, #1 changes every Monday 00:00 IST ---------- */
let TRK={id:'',acc:0,last:0,s:null,b:0},TRD=[],TAPI=[],TRM={},TRL=0,TRW=0,TRS='';
let SOFF=0;
const weekIdx=()=>Math.floor((Date.now()+SOFF+19800000-345600000)/604800000); /* weeks start Monday 00:00 IST, server clock */
function flushMin(force){
 const t=TRK;if(!t.s||t.acc<(force?3:60))return;
 const secs=Math.min(90,Math.round(t.acc));t.acc=0;
 if(!FU||!DB)return;
 const s=t.s,id=String(s.id).replace(/[.#$\[\]\/]/g,'_');
 try{DB.ref('trendw/'+weekIdx()+'/'+id).transaction(c=>({s:((c&&c.s)||0)+secs,t:String(s.title||'').slice(0,150),a:String(s.artist||'').slice(0,200),i:String(s.img||'').slice(0,400)})).catch(()=>{})}catch(e){}}
function trkTick(){
 if(!TRK.b){TRK.b=1;try{A.addEventListener('pause',()=>flushMin(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)flushMin(true)})}catch(e){}}
 const s=Q[qi];if(!s||A.paused)return;
 if(TRK.id!==s.id){flushMin(true);TRK.id=s.id;TRK.s=s;TRK.acc=0;TRK.last=A.currentTime;SES.add(s.id);CNT={id:s.id,acc:0,done:0};return}
 const c=A.currentTime,d=c-TRK.last;
 if(d>0&&d<2)TRK.acc+=d; /* only real listening time counts */
 /* a play counts only after half of the song was really played (seeking forward adds nothing) */
 if(CNT.id===s.id){if(CNT.done&&c<TRK.last-5){CNT.done=0;CNT.acc=0}
  if(d>0&&d<2)CNT.acc+=d;
  const du=(isFinite(A.duration)&&A.duration)||+s.dur||180;
  if(!CNT.done&&CNT.acc>=du*0.5){CNT.done=1;try{countPlay(s)}catch(e){}}}
 TRK.last=c;if(!FU)TRK.acc=0;
 flushMin(false);
 if(SMQ===Q&&!SMB&&Q.length-qi<=3){SMB=1;smartFill(Q[Q.length-1],true).finally(()=>{SMB=0})} /* refill before the queue ends */}
function trendMerge(T){return TRD.concat((T||[]).filter(x=>!TRD.some(y=>y.id===x.id))).slice(0,10)}
function trendUI(){
 const l=$('#tl');if(l)l.style.display=TRD.length?'':'none';
 const sig=TRD.map(x=>x.id+':'+x.tn).join();
 if($('#hero')&&TRD.length&&sig!==TRS){TRS=sig;heroFill(trendMerge(TAPI))}}
async function trendLoad(){
 if(!DB)return;
 try{
  try{SOFF=(await DB.ref('.info/serverTimeOffset').once('value')).val()||0}catch(e){}
  const wk=weekIdx(),rd=async w=>{const sn=await DB.ref('trendw/'+w).orderByChild('s').limitToLast(10).once('value'),rows=[];sn.forEach(c=>{const v=c.val();if(v&&v.s)rows.push({id:c.key,s:v.s})});return rows.sort((x,y)=>y.s-x.s)};
  let rows=await rd(wk-1);if(!rows.length)rows=await rd(wk); /* last full week; first week: this week so far */
  const need=rows.filter(r=>!TRM[r.id]).map(r=>r.id);
  if(need.length){try{const j=await api('/api/songs',{ids:need.join(',')}),raw=Array.isArray(j.data)?j.data:((j.data&&j.data.results)||[]);raw.forEach(x=>{const z=norm(x);if(z.url)TRM[z.id]=z})}catch(e){}}
  TRD=rows.map(r=>TRM[r.id]?Object.assign({},TRM[r.id],{tn:Math.max(1,Math.round(r.s/60))}):null).filter(Boolean);
  trendUI()
 }catch(e){}}
function trendListen(){
 if(TRL)return;
 if(!DB){if(TRW++<10)setTimeout(trendListen,1500);return}
 TRL=1;trendLoad();setInterval(trendLoad,600000)}
async function trendList(){trendListen();for(let i=0;i<24&&!TRD.length;i++)await new Promise(r=>setTimeout(r,250));return TRD}
/* =====================================================================
   NEW RELEASES (home list of 8 + its own page) and "Show more" in search.
   Kept here so index.html stays small. Uses globals of the main app at call time.
   ===================================================================== */
const NRK=4,NRAGE=210*864e5,NR={l:[],old:[],done:0,qi:NRK,busy:0};
const NRQ=()=>{const y=new Date().getFullYear();return['new hindi songs '+y,'latest bollywood songs '+y,'new punjabi songs '+y,'new songs '+y,'new hindi love songs '+y,'new haryanvi songs '+y,'new english songs '+y,'hindi '+y,y+' songs','new release '+y,'bollywood new songs '+y,'new south hindi dubbed songs '+y]};
/* release date of a song as a number; only the year known -> middle of that year; nothing known -> 0 */
const nrDate=s=>{const d=Date.parse(s.rd||'');if(d)return d;const y=+s.yr||0;return y?Date.parse(y+'-07-01'):0};
/* recent songs (newest first) go in; songs of unknown date follow; old songs wait in NR.old */
function nrAdd(l){const have=new Set(NR.l.map(x=>x.id)),now=Date.now(),items=[];
 (l||[]).forEach(x=>{if(x&&x.url&&x.img&&!have.has(x.id)&&!items.some(o=>o.id===x.id||sameSong(o,x))&&!NR.l.some(o=>sameSong(o,x)))items.push(x)});
 const rec=[],unk=[];items.forEach(x=>{const d=nrDate(x);if(!d)unk.push(x);else if(now-d<=NRAGE)rec.push(x);else NR.old.push(x)});
 rec.sort((a,b)=>nrDate(b)-nrDate(a));NR.l=NR.l.concat(rec,unk);return rec.length+unk.length}
async function nrMore(){const q=NRQ();let n=0;while(!n&&NR.qi<q.length){try{n=nrAdd(await search(q[NR.qi++]))}catch(e){}}if(!n)NR.done=1;return n}
async function nrFirst(){const q=NRQ();NR.l=[];NR.old=[];NR.qi=NRK;NR.done=0;
 try{const r=await Promise.all([plSongs('New Releases',/new releases|latest releases|fresh hits/i)].concat(q.slice(0,NRK).map(x=>search(x))));nrAdd(dedupe([].concat(...r)))}catch(e){}
 if(NR.l.length<16){NR.old.sort((a,b)=>nrDate(b)-nrDate(a));NR.l=NR.l.concat(NR.old.splice(0,16-NR.l.length))} /* too few new ones: fill up with the newest of the older */
 return NR.l.slice()}
function nrPaint(){const e=$('#trend');if(!e||!NR.l.length)return;lists.trend=NR.l.slice(0,8);e.innerHTML=songRows(lists.trend,'trend')}
/* home: the 8 songs (from cache or fresh) */
function nrHome(d,e){
 if(Array.isArray(d.nr)&&d.nr.length&&!NR.l.length){NR.l=d.nr.slice();NR.qi=NRK}
 if(NR.l.length)nrPaint();
 else e.innerHTML=Array.isArray(d.nr)||!(d.trend||[]).length?`<div class="msg" style="grid-column:1/-1">Could not load songs.${why()}<br><button class="btn tp" id="hretry" style="margin-top:12px">Try again</button></div>`:skel(6)}
/* nearest scrolling parent of an element (for the "load more" watcher) */
const scAnc=el=>{let p=el&&el.parentElement;while(p&&p!==document.body&&p!==document.documentElement){if(/(auto|scroll)/.test(getComputedStyle(p).overflowY))return p;p=p.parentElement}return null};
/* New Releases page: 20 songs first, more load by themselves while scrolling (faster scrolling -> bigger steps) */
let NRV={n:0,busy:0},NVIO=null;
async function nrvGrow(k){if(NRV.busy)return;NRV.busy=1;try{
 if(!NR.l.length){try{await nrFirst()}catch(e){}}
 while(NRV.n+k>NR.l.length&&!NR.done){if(!await nrMore())break}
 if(!$('#nrl'))return;
 const from=NRV.n;NRV.n=Math.min(NR.l.length,NRV.n+k);const e=$('#nrl');
 if(NRV.n>from){lists.nrv=NR.l.slice(0,NRV.n);if(!from)e.innerHTML='';e.insertAdjacentHTML('beforeend',songRows(lists.nrv,'nrv',from))}
 const x=$('#nrp');if(x){const rest=NRV.n<NR.l.length||!NR.done;x.innerHTML=rest?'<div class="sms"></div>':(NRV.n?'':'<div class="msg">Could not load songs.</div>');if(NVIO){NVIO.disconnect();NVIO=null}
  if(rest){const t=x.firstChild;NVIO=new IntersectionObserver(es=>{if(es.some(z=>z.isIntersecting)){const ck=Date.now()-(window.NVS||0)<1200?20:10;window.NVS=Date.now();nrvGrow(ck)}},{root:scAnc(t),rootMargin:'0px 0px 700px 0px'});NVIO.observe(t)}}
 }catch(e){}finally{NRV.busy=0}}
function newRelV(){NRV.n=0;main.innerHTML=`<div class="pg"><h1 style="margin-bottom:12px">New Releases</h1><div class="tbl" id="nrl">${skel(8)}</div><div id="nrp"></div></div>`;nrvGrow(20)}

/* ---------- search: "Show more" button, then results load by themselves while scrolling ---------- */
const moreS=R=>(R.sn<R.songs.length||(!R.done&&R.songs.length>=20))?(R.auto?'<div class="sms" id="sms"></div>':'<div class="smw"><button class="btn tp" data-sm="1">Show more</button></div>'):'';
let SIO=null,SLB=0,LST=0;
function armS(){if(SIO){SIO.disconnect();SIO=null}const t=$('#sms');if(!t||STAB!=='songs')return;
 SIO=new IntersectionObserver(es=>{if(es.some(x=>x.isIntersecting))loadMoreS()},{root:scAnc(t),rootMargin:'0px 0px 700px 0px'});SIO.observe(t)}
async function loadMoreS(){const R=SRR;if(SLB||!R)return;SLB=1;
 try{const ck=Date.now()-LST<1200?20:10;LST=Date.now();await ensureMore(R,R.sn+ck);
  const from=R.sn;R.sn=Math.min(R.songs.length,R.sn+ck);const tb=$('#stbl');
  if(tb&&R.sn>from)tb.insertAdjacentHTML('beforeend',songRows(R.songs.slice(0,R.sn),'sr',from));
  const t=$('#sms');if(t){if(R.sn<R.songs.length||(!R.done&&R.songs.length>=20)){if(SIO){SIO.unobserve(t);SIO.observe(t)}}else{t.remove();if(SIO){SIO.disconnect();SIO=null}}}
 }catch(e){}finally{SLB=0}}
document.addEventListener('click',async e=>{
 const m=e.target.closest('[data-sm]');if(!m)return;const R=SRR;if(!R)return;
 const all=m.dataset.sm==='all';R.auto=1;if(all)STAB='songs';
 await ensureMore(R,R.sn+10);
 R.sn=Math.min(R.songs.length,R.sn+10);drawS();if(all){const c=$('#col');if(c)c.scrollTop=0;main.scrollTop=0}},true);