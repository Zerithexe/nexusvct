import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const db = new Database(process.env.DB_FILE || path.join(__dirname, "nexus.sqlite"));

app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(express.static(__dirname));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    pick TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, match_id)
  );
`);

const TEAMS = [
  ["1","Team Liquid","TL","EMEA"],["2","Paper Rex","PRX","Pacific"],["3","TYLOO GAMING","TYL","China"],["4","G2 Esports","G2","Americas"],
  ["5","NONGSHIM REDFORCE","NS","Pacific"],["6","NRG","NRG","Americas"],["7","Karmine Corp","KC","EMEA"],["8","Xi Lai Gaming","XLG","China"],
  ["9","Global Esports","GE","Pacific"],["10","Team Vitality","VIT","EMEA"],["11","LOUD","LOUD","Americas"],["12","EDWARD Gaming","EDG","China"],
  ["13","100 Thieves","100T","Americas"],["14","T1","T1","Pacific"],["15","JD GAMING","JDG","China"],["16","FUT Esports","FUT","EMEA"]
].map(([id,name,code,region])=>({id,name,code,region}));

const MATCHES = [
  ["m1","2026-09-24T09:00:00+03:00","GROUPS","BO3","Team Liquid","TL","Paper Rex","PRX"],
  ["m2","2026-09-24T12:00:00+03:00","GROUPS","BO3","TYLOO GAMING","TYL","G2 Esports","G2"],
  ["m3","2026-09-25T09:00:00+03:00","GROUPS","BO3","NONGSHIM REDFORCE","NS","NRG","NRG"],
  ["m4","2026-09-25T12:00:00+03:00","GROUPS","BO3","Karmine Corp","KC","Xi Lai Gaming","XLG"],
  ["m5","2026-09-26T09:00:00+03:00","GROUPS","BO3","Global Esports","GE","Team Vitality","VIT"],
  ["m6","2026-09-26T12:00:00+03:00","GROUPS","BO3","LOUD","LOUD","EDWARD Gaming","EDG"],
  ["m7","2026-09-27T09:00:00+03:00","GROUPS","BO3","100 Thieves","100T","T1","T1"],
  ["m8","2026-09-27T12:00:00+03:00","GROUPS","BO3","JD GAMING","JDG","FUT Esports","FUT"]
].map(([id,date,stage,bo,home,homeCode,away,awayCode])=>({id,date,stage,bo,home,homeCode,away,awayCode,status:"upcoming"}));

const NEWS = [
  {date:"16 EYLÜL 2026",title:"Champions Shanghai Açılış Günü",desc:"Resmî VCT haber merkezindeki turnuva açılış duyurusu.",url:"https://valorantesports.com/tr-TR/news"},
  {date:"11 EYLÜL 2026",title:"Champions Shanghai: Bilmeniz Gereken Her Şey",desc:"Turnuva rehberi, format ve program bilgileri.",url:"https://valorantesports.com/tr-TR/news"},
  {date:"11 EYLÜL 2026",title:"Champions Shanghai Pick’Ems",desc:"Resmî Pick’Ems duyurusu.",url:"https://valorantesports.com/tr-TR/news"},
  {date:"09 EYLÜL 2026",title:"Final hafta sonu canlı seyirci bilgileri",desc:"Final hafta sonu için resmî seyirci duyurusu.",url:"https://valorantesports.com/tr-TR/news"},
  {date:"08 EYLÜL 2026",title:"VCT 2027 Açık Elemeler",desc:"Yeni sezon elemelerine dair ilk resmî bilgiler.",url:"https://valorantesports.com/tr-TR/news"}
];

function hashToken(token){ return crypto.createHash("sha256").update(token).digest("hex"); }
function newToken(){ return crypto.randomBytes(32).toString("hex"); }

function createSession(userId, remember=false){
  const token = newToken();
  const expiresMs = remember ? 1000*60*60*24*30 : 1000*60*60*12;
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .run(hashToken(token),userId,Date.now()+expiresMs);
  return { token, expiresMs };
}

function currentUser(req){
  const token=req.cookies.nexus_session;
  if(!token) return null;
  const row=db.prepare(`
    SELECT u.id,u.name,u.email,u.points,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?
  `).get(hashToken(token),Date.now());
  return row || null;
}

function publicUser(row){
  if(!row) return null;
  const rank = db.prepare("SELECT COUNT(*)+1 AS rank FROM users WHERE points> ?").get(row.points).rank;
  return {id:row.id,name:row.name,email:row.email,points:row.points,rank};
}

function setSessionCookie(res,token,maxAge){
  res.cookie("nexus_session",token,{
    httpOnly:true,
    sameSite:"lax",
    secure:process.env.NODE_ENV==="production",
    maxAge,
    path:"/"
  });
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"nexus-vct"}));

app.get("/api/matches",(req,res)=>res.json(MATCHES));
app.get("/api/teams",(req,res)=>res.json(TEAMS));
app.get("/api/news",(req,res)=>res.json(NEWS));

app.get("/api/me",(req,res)=>{
  const u=currentUser(req);
  res.json({user:publicUser(u)});
});

app.post("/api/auth/register",async(req,res)=>{
  const {name,email,password,remember=false}=req.body || {};
  if(!name || !email || !password) return res.status(400).json({error:"Ad, e-posta ve şifre gerekli."});
  if(String(password).length<8) return res.status(400).json({error:"Şifre en az 8 karakter olmalı."});
  const cleanEmail=String(email).trim().toLowerCase();
  try{
    const hash=await bcrypt.hash(String(password),12);
    const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(String(name).trim().slice(0,24),cleanEmail,hash);
    const u=db.prepare("SELECT id,name,email,points FROM users WHERE id=?").get(info.lastInsertRowid);
    const s=createSession(u.id,Boolean(remember));
    setSessionCookie(res,s.token,s.expiresMs);
    res.json({user:publicUser(u)});
  }catch{
    res.status(409).json({error:"Bu e-posta zaten kayıtlı olabilir."});
  }
});

app.post("/api/auth/login",async(req,res)=>{
  const {email,password,remember=false}=req.body || {};
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").trim().toLowerCase());
  if(!u) return res.status(401).json({error:"E-posta veya şifre hatalı."});
  const ok=await bcrypt.compare(String(password||""),u.password_hash);
  if(!ok) return res.status(401).json({error:"E-posta veya şifre hatalı."});
  const s=createSession(u.id,Boolean(remember));
  setSessionCookie(res,s.token,s.expiresMs);
  res.json({user:publicUser(u)});
});

app.post("/api/auth/logout",(req,res)=>{
  const token=req.cookies.nexus_session;
  if(token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
  res.clearCookie("nexus_session",{path:"/"});
  res.json({ok:true});
});

app.post("/api/predictions",(req,res)=>{
  const u=currentUser(req);
  if(!u) return res.status(401).json({error:"Tahmin kaydetmek için giriş yap."});
  const {matchId,pick}=req.body || {};
  const match=MATCHES.find(x=>x.id===matchId);
  if(!match) return res.status(404).json({error:"Maç bulunamadı."});
  if(new Date(match.date)<=new Date()) return res.status(400).json({error:"Başlamış maç için tahmin yapılamaz."});
  const exists=db.prepare("SELECT id FROM predictions WHERE user_id=? AND match_id=?").get(u.id,matchId);
  if(exists) return res.status(409).json({error:"Bu maç için tahminini daha önce kilitledin."});
  if(![match.home,match.away].includes(pick)) return res.status(400).json({error:"Geçersiz seçim."});

  // Puan, tahmin başına değil; sonuç işleme job'ı doğru tahminleri turnuva verisi geldikten sonra hesaplayacak.
  db.prepare("INSERT INTO predictions(user_id,match_id,pick) VALUES(?,?,?)").run(u.id,matchId,pick);
  const fresh=db.prepare("SELECT id,name,email,points FROM users WHERE id=?").get(u.id);
  res.json({ok:true,user:publicUser(fresh)});
});

app.get("/api/live",(req,res)=>{
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache,no-transform");
  res.setHeader("Connection","keep-alive");
  res.flushHeaders?.();

  // Demo: gerçek provider yoksa canlı event yayınlamaz; kullanıcı arayüzündeki demo modu çalışır.
  const heartbeat=setInterval(()=>res.write(`event: ping\ndata: {"t":${Date.now()}}\n\n`),15000);
  req.on("close",()=>clearInterval(heartbeat));
});

app.post("/api/admin/live-event",(req,res)=>{
  const secret=req.headers["x-admin-secret"];
  if(!process.env.ADMIN_SECRET || secret!==process.env.ADMIN_SECRET) return res.status(403).json({error:"Yetkisiz."});
  // Buraya lisanslı canlı veri sağlayıcısından gelen standardize event gönderilebilir.
  // Örnek body: { matchId, homeScore, awayScore, map, status, startedAt }
  res.json({ok:true});
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"));
});

app.listen(PORT,()=>console.log(`NEXUS VCT → http://localhost:${PORT}`));
