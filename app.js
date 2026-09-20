const API = (window.APP_CONFIG?.apiBase || '').replace(/\/$/, '');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let state = {
  user: null,
  matches: [],
  teams: [],
  predictions: [],
  theme: localStorage.getItem('nexus-theme') || 'dark',
  authMode: 'login',
  live: null,
  demoLive: false,
};

const fallbackMatches = [
  { id:'m1', date:'2026-09-24T09:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'Team Liquid', homeCode:'TL', away:'Paper Rex', awayCode:'PRX', status:'upcoming' },
  { id:'m2', date:'2026-09-24T12:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'TYLOO GAMING', homeCode:'TYL', away:'G2 Esports', awayCode:'G2', status:'upcoming' },
  { id:'m3', date:'2026-09-25T09:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'NONGSHIM REDFORCE', homeCode:'NS', away:'NRG', awayCode:'NRG', status:'upcoming' },
  { id:'m4', date:'2026-09-25T12:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'Karmine Corp', homeCode:'KC', away:'Xi Lai Gaming', awayCode:'XLG', status:'upcoming' },
  { id:'m5', date:'2026-09-26T09:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'Global Esports', homeCode:'GE', away:'Team Vitality', awayCode:'VIT', status:'upcoming' },
  { id:'m6', date:'2026-09-26T12:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'LOUD', homeCode:'LOUD', away:'EDWARD Gaming', awayCode:'EDG', status:'upcoming' },
  { id:'m7', date:'2026-09-27T09:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'100 Thieves', homeCode:'100T', away:'T1', awayCode:'T1', status:'upcoming' },
  { id:'m8', date:'2026-09-27T12:00:00+03:00', stage:'GROUPS', bo:'BO3', home:'JD GAMING', homeCode:'JDG', away:'FUT Esports', awayCode:'FUT', status:'upcoming' }
];

const fallbackTeams = [
  ['Team Liquid','TL','EMEA'],['Paper Rex','PRX','Pacific'],['TYLOO GAMING','TYL','China'],['G2 Esports','G2','Americas'],
  ['NONGSHIM REDFORCE','NS','Pacific'],['NRG','NRG','Americas'],['Karmine Corp','KC','EMEA'],['Xi Lai Gaming','XLG','China'],
  ['Global Esports','GE','Pacific'],['Team Vitality','VIT','EMEA'],['LOUD','LOUD','Americas'],['EDWARD Gaming','EDG','China'],
  ['100 Thieves','100T','Americas'],['T1','T1','Pacific'],['JD GAMING','JDG','China'],['FUT Esports','FUT','EMEA']
].map((x,i)=>({id:String(i+1),name:x[0],code:x[1],region:x[2]}));

const fallbackPlayers = [
  ['Kadrolar','API','Resmî/harici veri kaynağı bağlandığında oyuncular'],
  ['ve koçlar','AUTO','otomatik güncellenecek.'],
  ['anında','SYNC','transferler ve değişiklikler burada görünür.']
].map((x,i)=>({id:i,name:x[0],handle:x[1],role:x[2]}));

const fallbackNews = [
  {date:'16 EYLÜL 2026',title:'Champions Shanghai Açılış Günü',desc:'Riot’un resmî haber merkezinde Champions Shanghai açılışına dair güncel bilgiler yayımlandı.',url:'https://valorantesports.com/tr-TR/news'},
  {date:'11 EYLÜL 2026',title:'Champions Shanghai: Bilmeniz Gereken Her Şey',desc:'Turnuva öncesi format, takımlar, takvim ve izleme bilgileri için resmî rehber.',url:'https://valorantesports.com/tr-TR/news'},
  {date:'11 EYLÜL 2026',title:'Champions Shanghai Pick’Ems',desc:'Topluluk tahmin deneyimi için Riot’un Pick’Ems duyurusu.',url:'https://valorantesports.com/tr-TR/news'},
  {date:'09 EYLÜL 2026',title:'Final hafta sonu canlı seyirci bilgileri',desc:'Champions Shanghai final hafta sonu için etkinlik ve seyirci duyuruları.',url:'https://valorantesports.com/tr-TR/news'},
  {date:'08 EYLÜL 2026',title:'VCT 2027 Açık Elemeler',desc:'Yeni sezon açık elemeleri için ilk bilgiler.',url:'https://valorantesports.com/tr-TR/news'},
  {date:'04 HAZİRAN 2026',title:'Masters London: Watch & Earn',desc:'Canlı maçları izlemeye bağlı resmi ödül programına dair duyuru.',url:'https://valorantesports.com/tr-TR/news'}
];

document.addEventListener('DOMContentLoaded', init);

async function init(){
  applyTheme();
  bindUI();
  await loadPublicData();
  await refreshMe();
  setupLiveStream();
}

function bindUI(){
  $('#themeBtn').addEventListener('click',()=>{
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('nexus-theme',state.theme);
    applyTheme();
  });

  $('#loginBtn').addEventListener('click',()=>openAuth('login'));
  $('#registerBtn').addEventListener('click',()=>openAuth('register'));
  $('#profileBtn').addEventListener('click',logout);
  $$('[data-close-modal]').forEach(el=>el.addEventListener('click',closeAuth));

  $$('.auth-tab').forEach(btn=>btn.addEventListener('click',()=>openAuth(btn.dataset.authTab)));
  $('#authForm').addEventListener('submit',submitAuth);

  $('#teamSearch').addEventListener('input',e=>renderTeams(e.target.value));
  $$('.filter').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.filter').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
    renderMatches(btn.dataset.filter);
  }));
  $('#demoLiveBtn').addEventListener('click',()=>{
    state.demoLive = !state.demoLive;
    $('#demoLiveBtn').textContent = state.demoLive ? 'Demo canlıyı kapat' : 'Demo canlı modu';
    renderLive();
  });
}

function applyTheme(){ document.body.classList.toggle('light',state.theme==='light'); }

async function loadPublicData(){
  try{
    const [m,t] = await Promise.all([
      fetch(`${API}/api/matches`).then(r=>r.ok?r.json():Promise.reject()),
      fetch(`${API}/api/teams`).then(r=>r.ok?r.json():Promise.reject())
    ]);
    state.matches = m;
    state.teams = t;
  }catch{
    state.matches = fallbackMatches;
    state.teams = fallbackTeams;
  }
  renderMatches('all');
  renderTeams('');
  renderPlayers();
  renderPredictions();
  renderNews();
  renderLeaderboard();
  updateCountdownHero();
}

async function refreshMe(){
  try{
    const r = await fetch(`${API}/api/me`,{credentials:'include'});
    if(!r.ok) return;
    const data = await r.json();
    if(data.user) setUser(data.user);
  }catch{}
}

function setUser(user){
  state.user = user;
  $('#loginBtn').classList.add('hidden');
  $('#registerBtn').classList.add('hidden');
  $('#profileBtn').classList.remove('hidden');
  $('#profileName').textContent = user.name;
  $('#profileAvatar').textContent = initials(user.name);
  $('#pointsValue').textContent = user.points ?? 0;
  $('#rankValue').textContent = user.rank ?? '—';
}
function clearUser(){
  state.user = null;
  $('#loginBtn').classList.remove('hidden');
  $('#registerBtn').classList.remove('hidden');
  $('#profileBtn').classList.add('hidden');
  $('#pointsValue').textContent = '0';
  $('#rankValue').textContent = '—';
}

function openAuth(mode){
  state.authMode = mode;
  $('#authModal').classList.remove('hidden');
  $$('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.authTab===mode));
  $('#authTitle').textContent = mode==='login' ? 'NEXUS’a hoş geldin' : 'Hesabını oluştur';
  $('#authSubtitle').textContent = mode==='login' ? 'Tahminlerini kaydetmek ve puanlarını takip etmek için giriş yap.' : 'Kullanıcı adını oluştur, tahminlerini ve profilini tek yerde tut.';
  $('#nameField').classList.toggle('hidden',mode==='login');
  $('#authSubmit').textContent = mode==='login' ? 'Giriş Yap' : 'Kayıt Ol';
  $('#authMessage').textContent = '';
}
function closeAuth(){ $('#authModal').classList.add('hidden'); }

async function submitAuth(e){
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const mode = state.authMode;
  const payload = {email:f.get('email'),password:f.get('password'),remember:$('#rememberMe').checked};
  if(mode==='register') payload.name=f.get('name');
  const url = mode==='login' ? '/api/auth/login' : '/api/auth/register';
  const msg = $('#authMessage');
  msg.textContent = 'İşleniyor…';
  try{
    const r = await fetch(`${API}${url}`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error||'İşlem başarısız.');
    setUser(data.user);
    closeAuth();
    toast(mode==='login'?'Giriş yapıldı.':'Hesap oluşturuldu.');
  }catch(err){ msg.textContent = err.message; }
}

async function logout(){
  try{ await fetch(`${API}/api/auth/logout`,{method:'POST',credentials:'include'}); }catch{}
  clearUser(); toast('Çıkış yapıldı.');
}

function renderMatches(filter='all'){
  const now = Date.now();
  let rows = [...state.matches];
  if(filter==='today'){
    const day = new Date().toISOString().slice(0,10);
    rows = rows.filter(m=>m.date.slice(0,10)===day);
  }else if(filter==='upcoming'){
    rows = rows.filter(m=>new Date(m.date).getTime()>=now);
  }
  const el = $('#matchGrid');
  if(!rows.length){el.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">—</div><h3>Bu filtrede maç yok</h3><p>Başka bir filtre seç veya turnuva gününü bekle.</p></div>';return;}
  el.innerHTML = rows.map(matchCard).join('');
}
function matchCard(m){
  const d = new Date(m.date);
  return `<article class="match-card">
    <div class="match-top"><span class="stage">${m.stage||'CHAMPIONS'} • ${m.bo||'BO3'}</span><span class="date-chip">${formatDate(d)}</span></div>
    <div class="match-main">
      <div class="match-team"><div class="match-logo">${escapeHtml(m.homeCode||abbr(m.home))}</div>${escapeHtml(m.home)}</div>
      <div class="vs">VS</div>
      <div class="match-team"><div class="match-logo">${escapeHtml(m.awayCode||abbr(m.away))}</div>${escapeHtml(m.away)}</div>
    </div>
    <div class="match-bottom"><span>${d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',hour12:false})} TSİ</span><b>${d.getTime()>Date.now()?'YAKLAŞIYOR':'SONUÇ / CANLI'}</b></div>
  </article>`;
}

function renderTeams(query=''){
  const q=query.toLowerCase().trim();
  const rows = state.teams.filter(t=>`${t.name} ${t.code} ${t.region}`.toLowerCase().includes(q));
  $('#teamGrid').innerHTML = rows.map(t=>`<article class="team-card">
    <div class="team-logo-small">${escapeHtml(t.code)}</div>
    <div class="team-meta"><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.region||'VCT')}</span></div>
  </article>`).join('');
}

function renderPlayers(){
  $('#playerGrid').innerHTML = fallbackPlayers.map(p=>`<article class="player-card"><div class="player-photo">${escapeHtml(p.handle)}</div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.role)}</span></article>`).join('');
}

function renderPredictions(){
  const next = state.matches.filter(m=>new Date(m.date)>new Date()).slice(0,4);
  $('#predictionList').innerHTML = next.map(m=>`<article class="prediction-card" data-match-id="${m.id}">
    <div class="prediction-top"><strong>${escapeHtml(m.home)} <span style="color:var(--muted)">vs</span> ${escapeHtml(m.away)}</strong><span class="mini-tag">+100 PUAN</span></div>
    <div class="prediction-options">
      <button class="pick-btn" data-pick="${escapeHtml(m.home)}">${escapeHtml(m.home)}</button>
      <button class="pick-btn" data-pick="${escapeHtml(m.away)}">${escapeHtml(m.away)}</button>
    </div>
  </article>`).join('') || '<div class="empty-state"><p>Yaklaşan maç bulunamadı.</p></div>';

  $$('.pick-btn').forEach(btn=>btn.addEventListener('click',async ()=>{
    if(!state.user){ openAuth('login'); toast('Tahmin yapmak için giriş yapmalısın.'); return; }
    const card = btn.closest('.prediction-card');
    $$('.pick-btn',card).forEach(x=>x.classList.remove('selected')); btn.classList.add('selected');
    const matchId = card.dataset.matchId;
    try{
      const r = await fetch(`${API}/api/predictions`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({matchId,pick:btn.dataset.pick})});
      const data = await r.json();
      if(!r.ok) throw new Error(data.error||'Tahmin kaydedilemedi.');
      setUser({...state.user,...data.user});
      toast('Tahmin kilitlendi. +100 puan, sonuç doğruysa puan hesaplanır.');
    }catch(e){ toast(e.message); }
  }));
}

function renderLeaderboard(){
  const users = [
    ['1','AstraMain','1850'],['2','JettDiff','1730'],['3','VCTNerd','1680'],['4','RazeRunner','1490'],['5','MapControl','1410']
  ];
  $('#leaderboard').innerHTML = users.map(x=>`<div class="leader-row"><span class="leader-rank">${x[0]}</span><span><b>${x[1]}</b><small>community</small></span><strong>${x[2]}</strong></div>`).join('');
}

function renderNews(){
  $('#newsGrid').innerHTML = fallbackNews.map((n,i)=>`<a class="news-card" href="${n.url}" target="_blank" rel="noopener">
    <div class="news-art"><span>${String(i+1).padStart(2,'0')}</span></div>
    <div class="news-body"><span class="news-date">${n.date}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.desc)}</p></div>
  </a>`).join('');
}

function setupLiveStream(){
  const target = `${API}/api/live`;
  if(!API){ $('#liveConn').textContent='demo'; return; }
  try{
    const es = new EventSource(target,{withCredentials:true});
    es.onopen=()=>$('#liveConn').textContent='bağlı';
    es.onmessage=e=>{
      try{ state.live=JSON.parse(e.data); renderLive(); }catch{}
    };
    es.onerror=()=>$('#liveConn').textContent='yeniden deneniyor';
  }catch{}
}

function renderLive(){
  if(state.demoLive){
    const m = state.matches[0] || fallbackMatches[0];
    const live = { ...m, status:'live', homeScore:Math.floor((Date.now()/25000)%13), awayScore:Math.floor((Date.now()/33000)%13), map:'Haven', startedAt:Date.now()-8*60*1000 };
    state.live = live;
  }
  const m = state.live;
  if(!m){$('#liveEmpty').classList.remove('hidden');$('#liveMatchCard').classList.add('hidden');return;}
  $('#liveEmpty').classList.add('hidden'); $('#liveMatchCard').classList.remove('hidden');
  $('#liveMatchCard').innerHTML = `<div class="live-head"><div><div class="live-title">● LIVE SCORE</div><h3>${escapeHtml(m.home)} vs ${escapeHtml(m.away)}</h3></div><div class="live-timer">yayında • ${formatDuration((Date.now()-(m.startedAt||Date.now()))/1000)}</div></div>
    <div class="live-score-grid">
      <div class="team-side"><div class="team-logo">${escapeHtml(m.homeCode||abbr(m.home))}</div><h3>${escapeHtml(m.home)}</h3><small>${escapeHtml(m.regionHome||'')}</small></div>
      <div class="big-score"><div class="score-numbers"><span>${m.homeScore??0}</span><span class="divider">:</span><span>${m.awayScore??0}</span></div><div class="map-line">${escapeHtml(m.map||'MAP 1')}</div><a class="watch-now" href="https://www.youtube.com/@valorantesports" target="_blank" rel="noopener">▶ İzle</a></div>
      <div class="team-side"><div class="team-logo">${escapeHtml(m.awayCode||abbr(m.away))}</div><h3>${escapeHtml(m.away)}</h3><small>${escapeHtml(m.regionAway||'')}</small></div>
    </div>`;
}

setInterval(()=>{ if(state.demoLive){ renderLive(); } updateCountdownHero(); },1000);

function updateCountdownHero(){
  const next=state.matches.find(m=>new Date(m.date)>new Date());
  if(!next) return;
  const el = $('.f2 small');
  if(el) el.textContent = `${formatCountdown(new Date(next.date)-Date.now())}`;
}
function formatCountdown(ms){
  if(ms<=0) return 'şimdi';
  const d=Math.floor(ms/86400000); ms%=86400000;
  const h=Math.floor(ms/3600000); ms%=3600000;
  const m=Math.floor(ms/60000);
  if(d>0) return `${d}g ${h}s • başlangıca`;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} • başlangıca`;
}
function formatDuration(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function formatDate(d){ return d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short'}).toUpperCase(); }
function abbr(x){return String(x).replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase()}
function initials(x){return String(x).split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase()}
function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2400)}
