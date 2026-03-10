import { useState, useEffect, useRef, useCallback } from "react";

const CATEGORIES = {
  WORLD:    { label: "World",      color: "#e05c2a", bg: "rgba(224,92,42,0.13)"   },
  TECH:     { label: "Technology", color: "#3b9eff", bg: "rgba(59,158,255,0.13)"  },
  POLITICS: { label: "Politics",   color: "#c084fc", bg: "rgba(192,132,252,0.13)" },
  BUSINESS: { label: "Business",   color: "#34d399", bg: "rgba(52,211,153,0.13)"  },
};

const URGENCY = {
  BREAKING:   { label: "BREAKING",   color: "#ff3b3b" },
  DEVELOPING: { label: "DEVELOPING", color: "#f59e0b" },
  LIVE:       { label: "LIVE",       color: "#3b9eff" },
  STANDARD:   { label: null,         color: null      },
};

const REGIONS = ["North America","Europe","Asia-Pacific","Middle East","Africa","Latin America","Global"];
const POST_INTERVALS = [
  { label: "Every 1 hour",  ms: 3600000  },
  { label: "Every 2 hours", ms: 7200000  },
  { label: "Every 4 hours", ms: 14400000 },
  { label: "Every 6 hours", ms: 21600000 },
];
const URGENCY_WEIGHTS   = [0.1, 0.2, 0.15, 0.55];
const FETCH_INTERVAL_MS = 14000;

function genId() { return Math.random().toString(36).substr(2, 9); }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  return Math.floor(m / 60) + "h ago";
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  let line = "", cy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxW && i > 0) {
      ctx.fillText(line.trim(), x, cy);
      line = words[i] + " ";
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, cy);
  return cy;
}

function drawCard(canvas, item) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const cat = CATEGORIES[item.category];
  const urg = URGENCY[item.urgencyKey];

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0d1a"); bg.addColorStop(1, "#060610");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.025)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  const bar = ctx.createLinearGradient(0,0,0,H);
  bar.addColorStop(0, cat.color); bar.addColorStop(1, cat.color+"55");
  ctx.fillStyle = bar; ctx.fillRect(0, 0, 10, H);

  const glow = ctx.createLinearGradient(0,0,W,0);
  glow.addColorStop(0, cat.color+"88"); glow.addColorStop(0.5, cat.color+"22"); glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(10, 0, W-10, 4);

  ctx.fillStyle = cat.color+"33";
  ctx.beginPath(); ctx.moveTo(W-200,0); ctx.lineTo(W,0); ctx.lineTo(W,200); ctx.closePath(); ctx.fill();

  ctx.font = "bold 32px Georgia,serif"; ctx.fillStyle = "#fff";
  ctx.fillText("GLOBAL WIRE", 60, 90);
  ctx.font = "bold 13px Courier New,monospace"; ctx.fillStyle = "#e05c2a";
  ctx.fillText("LIVE EVENTS MONITOR", 62, 116);

  ctx.font = "bold 15px Courier New,monospace";
  const cTxt = cat.label.toUpperCase();
  const cW = ctx.measureText(cTxt).width + 28;
  ctx.fillStyle = cat.bg; ctx.fillRect(W-cW-70, 62, cW, 32);
  ctx.fillStyle = cat.color; ctx.fillText(cTxt, W-cW-56, 83);

  if (urg.label) {
    const uW = ctx.measureText(urg.label).width + 28;
    const uX = W-cW-70-uW-14;
    ctx.strokeStyle = urg.color; ctx.lineWidth = 2;
    ctx.strokeRect(uX, 62, uW, 32);
    ctx.fillStyle = urg.color; ctx.fillText(urg.label, uX+14, 83);
  }

  ctx.strokeStyle = "#22223a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60,150); ctx.lineTo(W-60,150); ctx.stroke();
  ctx.font = "14px Courier New,monospace"; ctx.fillStyle = "#444466";
  ctx.fillText(item.region.toUpperCase(), 60, 180);

  ctx.font = "bold 62px Georgia,serif"; ctx.fillStyle = "#fff";
  let hy = wrapText(ctx, item.headline, 60, 280, W-120, 78);
  ctx.font = "26px Georgia,serif"; ctx.fillStyle = "#7777aa";
  hy = wrapText(ctx, item.summary, 60, hy+60, W-120, 38) + 38;

  ctx.strokeStyle = "#22223a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60,H-130); ctx.lineTo(W-60,H-130); ctx.stroke();

  ctx.fillStyle = cat.color;
  ctx.beginPath(); ctx.arc(60, H-80, 5, 0, Math.PI*2); ctx.fill();
  ctx.font = "bold 22px Courier New,monospace"; ctx.fillStyle = "#666688";
  ctx.fillText(item.source, 80, H-72);
  ctx.font = "18px Courier New,monospace"; ctx.fillStyle = "#333355";
  ctx.fillText(new Date(item.timestamp).toUTCString(), 80, H-44);
  ctx.textAlign = "right";
  ctx.fillText("#GlobalWire #BreakingNews #"+cat.label, W-60, H-44);
  ctx.textAlign = "left";
}

async function fetchHeadline(usedTitles) {
  const catKeys  = Object.keys(CATEGORIES);
  const category = catKeys[Math.floor(Math.random() * catKeys.length)];
  const urgKeys  = Object.keys(URGENCY);
  let r = Math.random(), urgencyKey = "STANDARD";
  for (let i = 0; i < urgKeys.length; i++) {
    r -= URGENCY_WEIGHTS[i];
    if (r <= 0) { urgencyKey = urgKeys[i]; break; }
  }
  const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const avoid  = usedTitles.slice(-5).join(" | ");

  const prompt =
    "You are a world news wire editor. Generate one realistic global news headline.\n" +
    "Category: " + CATEGORIES[category].label + " | Region: " + region +
    " | Urgency: " + (URGENCY[urgencyKey].label || "Standard") + "\n" +
    "Rules: 10 to 18 words, no surrounding quotes, specific real-sounding entities and numbers.\n" +
    "Do NOT repeat these: " + avoid + "\n" +
    "Also write a 1-sentence summary (20-35 words) and pick a source from: Reuters, AFP, Bloomberg, AP News, Al Jazeera, Nikkei, The Guardian.\n" +
    'Reply ONLY with valid JSON, no markdown: {"headline":"...","summary":"...","source":"..."}';

  const res = await fetch("/api/generate-headline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:    "claude-sonnet-4-20250514",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(function() { return {}; });
    throw new Error(err.error || "API error " + res.status);
  }

  const data   = await res.json();
  const raw    = data.content.map(function(b) { return b.text || ""; }).join("").trim();
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

  return {
    id: genId(), headline: parsed.headline, summary: parsed.summary,
    source: parsed.source, category: category, urgencyKey: urgencyKey,
    region: region, timestamp: Date.now(), isNew: true,
  };
}

async function uploadToCloudinary(cloudName, uploadPreset, dataUri) {
  const form = new FormData();
  form.append("file",          dataUri);
  form.append("upload_preset", uploadPreset);
  form.append("folder",        "globalwire");
  form.append("public_id",     "gw_" + Date.now());
  let res;
  try {
    res = await fetch("https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload", {
      method: "POST", body: form,
    });
  } catch (e) {
    throw new Error("Cannot reach Cloudinary: " + e.message);
  }
  const data = await res.json();
  if (data.error) {
    if (data.error.message.includes("preset")) throw new Error("Upload preset not found or not set to Unsigned.");
    throw new Error("Cloudinary: " + data.error.message);
  }
  if (!res.ok) throw new Error("Cloudinary HTTP " + res.status);
  return data.secure_url;
}

async function postToInstagram(igAccountId, igToken, imageUrl, caption) {
  const base = "https://graph.facebook.com/v21.0";
  const r1 = await fetch(base + "/" + igAccountId + "/media", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption: caption, access_token: igToken }),
  });
  const d1 = await r1.json();
  if (d1.error) throw new Error("IG container: " + d1.error.message);
  await new Promise(function(resolve) { setTimeout(resolve, 6000); });
  const r2 = await fetch(base + "/" + igAccountId + "/media_publish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: d1.id, access_token: igToken }),
  });
  const d2 = await r2.json();
  if (d2.error) throw new Error("IG publish: " + d2.error.message);
  return d2.id;
}

function PulseDot({ color }) {
  return (
    <span style={{ position:"relative", display:"inline-flex", width:9, height:9, alignItems:"center", justifyContent:"center" }}>
      <span style={{ position:"absolute", width:"100%", height:"100%", borderRadius:"50%", background:color, opacity:0.4, animation:"ping 1.5s ease infinite" }} />
      <span style={{ width:6, height:6, borderRadius:"50%", background:color, display:"block" }} />
    </span>
  );
}

function Field({ label, type, value, onChange, placeholder, hint }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block", fontSize:10, color:"#333350", fontFamily:"monospace", marginBottom:7, letterSpacing:"0.08em" }}>{label}</label>
      <input
        type={type || "text"} value={value} placeholder={placeholder}
        onChange={function(e) { onChange(e.target.value); }}
        onFocus={function() { setFocused(true); }}
        onBlur={function()  { setFocused(false); }}
        style={{ width:"100%", padding:"11px 14px", background:"#08080f", border:"1px solid "+(focused?"#e05c2a55":"#181828"), borderRadius:6, color:"#ccc", fontSize:13, fontFamily:"monospace", outline:"none" }}
      />
      {hint && <p style={{ fontSize:11, color:"#2a2a48", marginTop:6, fontFamily:"monospace" }}>{hint}</p>}
    </div>
  );
}

function StepDot({ n, label, active, done }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
      <div style={{ width:28, height:28, borderRadius:"50%", border:"2px solid "+(done?"#34d399":active?"#e05c2a":"#1e1e30"), background:done?"#34d39922":active?"#e05c2a22":"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontFamily:"monospace", color:done?"#34d399":active?"#e05c2a":"#333350", fontWeight:700, flexShrink:0 }}>
        {done ? "v" : n}
      </div>
      <span style={{ fontSize:11, fontFamily:"monospace", color:done?"#34d399":active?"#e05c2a":"#2a2a48", whiteSpace:"nowrap" }}>{label}</span>
    </div>
  );
}

function HowTo({ title, rows }) {
  return (
    <div style={{ background:"#080812", border:"1px solid #111128", borderRadius:8, padding:18, marginBottom:20 }}>
      <div style={{ fontSize:11, color:"#e05c2a", fontFamily:"monospace", fontWeight:700, letterSpacing:"0.08em", marginBottom:12 }}>{title}</div>
      {rows.map(function(row) {
        return (
          <div key={row.n} style={{ display:"flex", gap:10, marginBottom:9, alignItems:"flex-start" }}>
            <span style={{ minWidth:22, height:22, borderRadius:"50%", background:"#151530", color:"#e05c2a", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", flexShrink:0 }}>{row.n}</span>
            <span style={{ fontSize:12, color:"#555575", lineHeight:1.5 }}>
              {row.text}
              {row.link && <a href={row.href} target="_blank" rel="noreferrer" style={{ color:"#3b9eff", textDecoration:"none" }}> {row.link}</a>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STEP_LABELS = ["Anthropic Key", "Cloudinary", "Instagram", "Settings"];

function Wizard({ onComplete }) {
  const [step,    setStep]    = useState(0);
  const [aKey,    setAKey]    = useState("");
  const [cName,   setCName]   = useState("");
  const [cPreset, setCPreset] = useState("");
  const [igId,    setIgId]    = useState("");
  const [igToken, setIgToken] = useState("");
  const [tags,    setTags]    = useState("#GlobalWire #BreakingNews #WorldNews");
  const [ivIdx,   setIvIdx]   = useState(1);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  async function next() {
    setErr(""); setBusy(true);
    try {
      if (step === 0) {
        if (!aKey.trim().startsWith("sk-ant-")) throw new Error("Key must start with sk-ant-");
        const r = await fetch("/api/generate-headline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:10, messages:[{ role:"user", content:"hi" }] }),
        });
        if (r.status === 500) {
          const d = await r.json();
          throw new Error(d.error || "Server error");
        }
      }
      if (step === 1) {
        if (!cName.trim()) throw new Error("Cloud Name is required");
        if (cName.includes(" ")) throw new Error("Cloud Name must not contain spaces");
        if (!cPreset.trim()) throw new Error("Upload Preset is required");
        if (cPreset.includes(" ")) throw new Error("Upload Preset must not contain spaces");
      }
      if (step === 2) {
        if (!igId.trim() || !igToken.trim()) throw new Error("Both fields are required");
        const r = await fetch("https://graph.facebook.com/v21.0/" + igId.trim() + "?fields=name,username&access_token=" + igToken.trim());
        const d = await r.json();
        if (d.error) throw new Error("Instagram: " + d.error.message);
      }
      if (step === 3) {
        onComplete({ cloudName:cName.trim(), uploadPreset:cPreset.trim(), igAccountId:igId.trim(), igToken:igToken.trim(), hashtags:tags, postIntervalMs:POST_INTERVALS[ivIdx].ms });
        return;
      }
      setStep(function(s) { return s + 1; });
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const titles = ["Enter your Anthropic API Key","Set up Cloudinary (Free Image Hosting)","Connect Instagram","Posting Settings"];
  const descs  = [
    "Powers AI headline generation. Your key is stored securely on the server.",
    "Cloudinary hosts your image cards so Instagram can fetch them. 100% free.",
    "Connect your Instagram Business account.",
    "Choose how often to auto-post.",
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#06060c", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:560, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <h1 style={{ fontSize:26, fontWeight:700, color:"#fff", fontFamily:"Georgia,serif" }}>GLOBAL WIRE</h1>
          <p style={{ fontSize:11, color:"#e05c2a", fontFamily:"monospace", letterSpacing:"0.1em", marginTop:4 }}>INSTAGRAM AUTO-POSTER SETUP</p>
        </div>

        <div style={{ display:"flex", gap:6, marginBottom:28, background:"#0a0a14", padding:"14px 18px", borderRadius:8, border:"1px solid #111122" }}>
          {STEP_LABELS.map(function(lbl, i) { return <StepDot key={lbl} n={i+1} label={lbl} active={step===i} done={step>i} />; })}
        </div>

        <div style={{ background:"#0a0a14", border:"1px solid #161628", borderRadius:12, padding:28 }}>
          <h2 style={{ fontSize:15, color:"#fff", fontWeight:600, marginBottom:6 }}>{titles[step]}</h2>
          <p style={{ fontSize:12, color:"#444460", lineHeight:1.6, marginBottom:20 }}>{descs[step]}</p>

          {step === 0 && (
            <div>
              <HowTo title="HOW TO GET YOUR ANTHROPIC KEY" rows={[
                { n:"1", text:"Go to", link:"console.anthropic.com", href:"https://console.anthropic.com" },
                { n:"2", text:"Sign up for a free account" },
                { n:"3", text:"Click API Keys then Create Key" },
                { n:"4", text:"Copy the key (starts with sk-ant-) and paste below" },
              ]} />
              <Field label="ANTHROPIC API KEY" type="password" value={aKey} onChange={setAKey} placeholder="sk-ant-api03-..." hint="Stored only in Vercel — never exposed in the browser" />
            </div>
          )}

          {step === 1 && (
            <div>
              <HowTo title="HOW TO SET UP CLOUDINARY (FREE)" rows={[
                { n:"1", text:"Go to", link:"cloudinary.com", href:"https://cloudinary.com" },
                { n:"2", text:"Sign up free — no credit card needed" },
                { n:"3", text:"Copy your Cloud Name from the dashboard top-left" },
                { n:"4", text:"Go to Settings > Upload > Add upload preset — set Signing Mode to Unsigned — Save" },
                { n:"5", text:"Copy the preset name and paste both fields below" },
              ]} />
              <Field label="CLOUDINARY CLOUD NAME" value={cName} onChange={setCName} placeholder="my-cloud-name" hint="Top-left of your Cloudinary dashboard" />
              <Field label="UPLOAD PRESET NAME"    value={cPreset} onChange={setCPreset} placeholder="globalwire_preset" hint="Must be set to Unsigned in Settings > Upload" />
              <div style={{ background:"#0a1a0a", border:"1px solid #34d39933", borderRadius:6, padding:"12px 14px" }}>
                <p style={{ fontSize:11, color:"#34d399", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>NO LIVE TEST HERE</p>
                <p style={{ fontSize:11, color:"#3a5a3a", fontFamily:"monospace", lineHeight:1.6 }}>Credentials verified on your first real post. Just make sure preset is set to Unsigned.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <HowTo title="HOW TO GET INSTAGRAM CREDENTIALS" rows={[
                { n:"1", text:"Switch to Business: Profile > Settings > Account > Switch to Professional > Business" },
                { n:"2", text:"Go to", link:"developers.facebook.com", href:"https://developers.facebook.com" },
                { n:"3", text:"Create App > Business type > add Instagram Graph API product" },
                { n:"4", text:"Graph API Explorer > generate token with instagram_basic + instagram_content_publish permissions" },
                { n:"5", text:"Run GET /me?fields=id,username to get your numeric Instagram User ID" },
              ]} />
              <Field label="INSTAGRAM BUSINESS ACCOUNT ID" value={igId}    onChange={setIgId}    placeholder="17841400000000000" hint="Your numeric Instagram User ID" />
              <Field label="INSTAGRAM ACCESS TOKEN" type="password" value={igToken} onChange={setIgToken} placeholder="EAAxxxx..." hint="Long-lived token from Graph API Explorer" />
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:10, color:"#333350", fontFamily:"monospace", marginBottom:10, letterSpacing:"0.08em" }}>POST INTERVAL</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {POST_INTERVALS.map(function(p, i) {
                    return (
                      <button key={i} onClick={function() { setIvIdx(i); }} style={{ background:ivIdx===i?"#e05c2a22":"transparent", border:"1px solid "+(ivIdx===i?"#e05c2a66":"#1a1a2e"), color:ivIdx===i?"#e05c2a":"#444460", padding:"8px 14px", borderRadius:5, cursor:"pointer", fontSize:12, fontFamily:"monospace" }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize:11, color:"#2a2a40", marginTop:8, fontFamily:"monospace" }}>Instagram allows max 25 posts per day</p>
              </div>
              <Field label="HASHTAGS" value={tags} onChange={setTags} placeholder="#GlobalWire" hint="Added to every Instagram caption" />
              <div style={{ background:"#080812", border:"1px solid #0d0d22", borderRadius:8, padding:16 }}>
                <div style={{ fontSize:11, color:"#34d399", fontFamily:"monospace", fontWeight:700, marginBottom:8 }}>YOU ARE ALMOST READY</div>
                <div style={{ fontSize:12, color:"#444460", lineHeight:1.7 }}>
                  {POST_INTERVALS[ivIdx].label} the app will generate a headline, draw a 1080x1080 image card, upload to Cloudinary, and post to Instagram automatically.
                </div>
              </div>
            </div>
          )}

          {err && (
            <div style={{ background:"#160808", border:"1px solid #ff3b3b33", color:"#ff6060", padding:"11px 14px", borderRadius:6, fontSize:12, fontFamily:"monospace", marginTop:14 }}>
              {err}
            </div>
          )}

          <button onClick={next} disabled={busy} style={{ width:"100%", padding:13, background:busy?"#111120":"linear-gradient(135deg,#e05c2a,#c04a1e)", border:"none", borderRadius:6, color:busy?"#444":"#fff", fontSize:13, fontWeight:700, letterSpacing:"0.08em", fontFamily:"monospace", cursor:busy?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginTop:18 }}>
            {busy ? <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>◌</span> : null}
            {busy ? "VERIFYING..." : step===3 ? "LAUNCH GLOBAL WIRE" : "CONTINUE"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewsCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered,  setHovered]  = useState(false);
  const cat = CATEGORIES[item.category];
  const urg = URGENCY[item.urgencyKey];
  const brk = item.urgencyKey === "BREAKING";
  return (
    <div onClick={function() { setExpanded(function(e) { return !e; }); }} onMouseEnter={function() { setHovered(true); }} onMouseLeave={function() { setHovered(false); }}
      style={{ background:hovered?(brk?"#1f0c0c":"#131318"):(brk?"#1a0a0a":"#0e0e13"), border:"1px solid "+(hovered?cat.color+"44":brk?"#ff3b3b33":"#16162a"), borderLeft:"3px solid "+cat.color, borderRadius:7, padding:"14px 17px", cursor:"pointer", animation:item.isNew?"slideIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards":"none", opacity:item.isNew?0:1, transition:"background 0.2s,border-color 0.2s", position:"relative", overflow:"hidden" }}>
      {brk && <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,#ff3b3b,transparent)" }} />}
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8, flexWrap:"wrap" }}>
        {urg.label && (
          <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.12em", color:urg.color, border:"1px solid "+urg.color, padding:"2px 7px", borderRadius:2, display:"flex", alignItems:"center", gap:5, fontFamily:"monospace" }}>
            <PulseDot color={urg.color} />{urg.label}
          </span>
        )}
        <span style={{ fontSize:10, fontWeight:600, color:cat.color, background:cat.bg, padding:"2px 9px", borderRadius:20, fontFamily:"monospace" }}>{cat.label.toUpperCase()}</span>
        <span style={{ fontSize:10, color:"#2a2a48", marginLeft:"auto", fontFamily:"monospace" }}>{item.region}</span>
      </div>
      <p style={{ margin:"0 0 8px", fontSize:15, fontWeight:600, lineHeight:1.5, color:brk?"#fff":"#d5d5e8", fontFamily:"Georgia,serif" }}>{item.headline}</p>
      {expanded && <p style={{ margin:"0 0 8px", fontSize:12.5, color:"#6666aa", lineHeight:1.65, animation:"fadeIn 0.2s ease" }}>{item.summary}</p>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11, color:"#333355", fontFamily:"monospace" }}>{item.source}</span>
        <span style={{ color:"#1c1c2e" }}>·</span>
        <span style={{ fontSize:11, color:"#28284a", fontFamily:"monospace" }}>{timeAgo(item.timestamp)}</span>
        {item.igPostId && <span style={{ fontSize:10, color:"#34d39966", fontFamily:"monospace" }}>✓ Posted</span>}
        <span style={{ marginLeft:"auto", fontSize:10, color:hovered?"#40406a":"#222238" }}>{expanded?"▲":"▼"}</span>
      </div>
    </div>
  );
}

function Ticker({ items }) {
  if (!items.length) return null;
  const text = items.slice(0,10).map(function(i) { return CATEGORIES[i.category].label.toUpperCase()+": "+i.headline; }).join("   ◆   ");
  return (
    <div style={{ borderTop:"1px solid #0f0f20", background:"#07070d", padding:"7px 0", overflow:"hidden", flexShrink:0 }}>
      <div style={{ display:"flex", whiteSpace:"nowrap", animation:"ticker 40s linear infinite", fontSize:11, fontFamily:"monospace", color:"#333355" }}>
        <span style={{ paddingRight:"5rem" }}>{text}</span>
        <span style={{ paddingRight:"5rem" }}>{text}</span>
      </div>
    </div>
  );
}

function IgPanel({ log, nextPostIn, autoPosting, onToggle, postsToday, intervalMs }) {
  const [open, setOpen] = useState(true);
  const pct = Math.max(0, Math.min(100, (1 - nextPostIn / (intervalMs/60000)) * 100));
  return (
    <div style={{ background:"#08080f", border:"1px solid #111124", borderRadius:8, overflow:"hidden", marginBottom:14 }}>
      <div onClick={function() { setOpen(function(o) { return !o; }); }} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", cursor:"pointer", borderBottom:open?"1px solid #0d0d20":"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16 }}>📸</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#fff", fontFamily:"monospace" }}>INSTAGRAM AUTO-POSTER</span>
          {autoPosting && <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#34d399", fontFamily:"monospace" }}><PulseDot color="#34d399" /> ACTIVE</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:11, color:"#333350", fontFamily:"monospace" }}>{postsToday}/25 today</span>
          <button onClick={function(e) { e.stopPropagation(); onToggle(); }} style={{ background:autoPosting?"#180808":"#081808", border:"1px solid "+(autoPosting?"#ff3b3b55":"#34d39955"), color:autoPosting?"#ff3b3b":"#34d399", padding:"5px 14px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"monospace", fontWeight:700 }}>
            {autoPosting?"STOP":"START"}
          </button>
          <span style={{ color:"#333350", fontSize:12 }}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding:"12px 16px" }}>
          {autoPosting && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <div style={{ flex:1, height:3, background:"#111122", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"#34d399", width:pct+"%", transition:"width 1s" }} />
              </div>
              <span style={{ fontSize:10, color:"#34d399", fontFamily:"monospace", whiteSpace:"nowrap" }}>next in ~{Math.ceil(nextPostIn)}m</span>
            </div>
          )}
          <div style={{ maxHeight:140, overflowY:"auto" }}>
            {log.length === 0 && <p style={{ fontSize:11, color:"#222238", fontFamily:"monospace", textAlign:"center", padding:"20px 0" }}>No posts yet. Press START to begin.</p>}
            {log.slice().reverse().map(function(entry, i) {
              return (
                <div key={i} style={{ display:"flex", gap:10, padding:"6px 0", borderBottom:"1px solid #0c0c1e", alignItems:"flex-start" }}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{entry.ok?"✅":"❌"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:11, color:entry.ok?"#aaaacc":"#ff6060", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.headline}</p>
                    <p style={{ fontSize:10, color:"#2a2a48", fontFamily:"monospace", marginTop:2 }}>{entry.ok?"Posted to Instagram":"Error: "+entry.error} · {timeAgo(entry.ts)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Monitor({ config, onLogout }) {
  const [items,      setItems]      = useState([]);
  const [filter,     setFilter]     = useState(null);
  const [feedOn,     setFeedOn]     = useState(false);
  const [fetching,   setFetching]   = useState(false);
  const [feedErr,    setFeedErr]    = useState(null);
  const [updates,    setUpdates]    = useState(0);
  const [nextFeedIn, setNextFeedIn] = useState(0);
  const [autoPost,   setAutoPost]   = useState(false);
  const [igLog,      setIgLog]      = useState([]);
  const [postsToday, setPostsToday] = useState(0);
  const [nextPostIn, setNextPostIn] = useState(0);

  const feedIv = useRef(null), feedCd = useRef(null);
  const postIv = useRef(null), postCd = useRef(null);
  const canvas  = useRef(null);
  const used    = useRef([]);
  const itemsR  = useRef([]);

  useEffect(function() { itemsR.current = items; }, [items]);

  const addItem = useCallback(function(item) {
    used.current.push(item.headline);
    setItems(function(prev) {
      const next = [item].concat(prev).slice(0, 80);
      setTimeout(function() {
        setItems(function(cur) { return cur.map(function(i) { return i.id===item.id ? Object.assign({},i,{isNew:false}) : i; }); });
      }, 450);
      return next;
    });
    setUpdates(function(u) { return u+1; });
  }, []);

  const doFetch = useCallback(async function() {
    setFetching(true); setFeedErr(null);
    try { addItem(await fetchHeadline(used.current)); }
    catch(e) { setFeedErr(e.message); }
    finally   { setFetching(false); }
  }, [addItem]);

  const startFeed = useCallback(async function() {
    setFeedOn(true);
    await doFetch();
    setNextFeedIn(FETCH_INTERVAL_MS/1000);
    feedIv.current = setInterval(doFetch, FETCH_INTERVAL_MS);
    feedCd.current = setInterval(function() { setNextFeedIn(function(n) { return n<=1?FETCH_INTERVAL_MS/1000:n-1; }); }, 1000);
  }, [doFetch]);

  const stopFeed = useCallback(function() {
    setFeedOn(false); clearInterval(feedIv.current); clearInterval(feedCd.current);
  }, []);

  const doPost = useCallback(async function() {
    if (postsToday >= 25) { setIgLog(function(l) { return l.concat([{ok:false,error:"Daily limit (25/day)",headline:"—",ts:Date.now()}]); }); return; }
    const latest = itemsR.current[0];
    if (!latest) return;
    try {
      drawCard(canvas.current, latest);
      const uri  = canvas.current.toDataURL("image/jpeg", 0.92);
      const url  = await uploadToCloudinary(config.cloudName, config.uploadPreset, uri);
      const cap  = latest.headline+"\n\n"+latest.summary+"\n\nSource: "+latest.source+"\n\n"+config.hashtags;
      const igId = await postToInstagram(config.igAccountId, config.igToken, url, cap);
      setItems(function(cur) { return cur.map(function(i) { return i.id===latest.id?Object.assign({},i,{igPostId:igId}):i; }); });
      setPostsToday(function(p) { return p+1; });
      setIgLog(function(l) { return l.concat([{ok:true,headline:latest.headline,ts:Date.now()}]); });
    } catch(e) {
      setIgLog(function(l) { return l.concat([{ok:false,error:e.message,headline:latest.headline,ts:Date.now()}]); });
    }
  }, [config, postsToday]);

  const startPost = useCallback(async function() {
    setAutoPost(true);
    await doPost();
    const mins = config.postIntervalMs/60000;
    setNextPostIn(mins);
    postIv.current = setInterval(doPost, config.postIntervalMs);
    postCd.current = setInterval(function() { setNextPostIn(function(n) { return n<=(1/60)?mins:n-(1/60); }); }, 1000);
  }, [doPost, config.postIntervalMs]);

  const stopPost = useCallback(function() {
    setAutoPost(false); clearInterval(postIv.current); clearInterval(postCd.current);
  }, []);

  useEffect(function() {
    return function() { clearInterval(feedIv.current); clearInterval(feedCd.current); clearInterval(postIv.current); clearInterval(postCd.current); };
  }, []);

  const filtered = filter ? items.filter(function(i) { return i.category===filter; }) : items;
  const breaking = items.filter(function(i) { return i.urgencyKey==="BREAKING"; }).length;
  const counts   = {};
  Object.keys(CATEGORIES).forEach(function(k) { counts[k] = items.filter(function(i) { return i.category===k; }).length; });

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#06060c", overflow:"hidden" }}>
      <canvas ref={canvas} style={{ display:"none" }} />

      <div style={{ background:"#07070f", borderBottom:"1px solid #0f0f20", padding:"0 20px", flexShrink:0 }}>
        <div style={{ maxWidth:920, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 0 10px", gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", border:"2px solid "+(feedOn?"#e05c2a":"#222238"), display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ width:9, height:9, borderRadius:"50%", background:feedOn?"#e05c2a":"#1e1e30" }} />
              </div>
              <div>
                <div style={{ fontSize:20, fontWeight:700, color:"#fff", fontFamily:"Georgia,serif", lineHeight:1 }}>GLOBAL WIRE</div>
                <div style={{ fontSize:9, color:"#252545", fontFamily:"monospace", letterSpacing:"0.1em", marginTop:2 }}>INSTAGRAM AUTO-POSTER</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {feedOn && (
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:9, color:"#3b9eff", fontFamily:"monospace", display:"flex", alignItems:"center", gap:4 }}><PulseDot color="#3b9eff" /> LIVE</div>
                  <div style={{ fontSize:9, color:"#222240", fontFamily:"monospace" }}>next in {nextFeedIn}s</div>
                </div>
              )}
              <button onClick={feedOn?stopFeed:startFeed} style={{ background:feedOn?"#180808":"#081808", border:"1px solid "+(feedOn?"#ff3b3b55":"#34d39955"), color:feedOn?"#ff3b3b":"#34d399", padding:"7px 16px", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"monospace", display:"flex", alignItems:"center", gap:7 }}>
                {fetching&&!feedOn?<span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>◌</span>:null}
                {feedOn?"STOP FEED":"START FEED"}
              </button>
              <button onClick={onLogout} style={{ background:"transparent", border:"1px solid #181828", color:"#2a2a48", padding:"7px 12px", borderRadius:4, cursor:"pointer", fontSize:12 }}>⚙</button>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderTop:"1px solid #0c0c1e" }}>
            <div style={{ display:"flex", gap:20 }}>
              {[{l:"EVENTS",v:items.length,c:"#fff"},{l:"BREAKING",v:breaking,c:"#ff3b3b"},{l:"IG POSTS",v:postsToday,c:"#c084fc"},{l:"UPDATES",v:updates,c:"#fff"}].map(function(s) {
                return (
                  <div key={s.l}>
                    <div style={{ fontSize:16, fontWeight:700, color:s.c, fontFamily:"monospace", lineHeight:1 }}>{s.v}</div>
                    <div style={{ fontSize:8, color:"#222240", letterSpacing:"0.1em", marginTop:2 }}>{s.l}</div>
                  </div>
                );
              })}
            </div>
            {fetching&&feedOn&&<div style={{ fontSize:9, color:"#333355", fontFamily:"monospace" }}>◌ FETCHING</div>}
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px" }}>
        <div style={{ maxWidth:920, margin:"0 auto" }}>
          <IgPanel log={igLog} nextPostIn={nextPostIn} autoPosting={autoPost} onToggle={autoPost?stopPost:startPost} postsToday={postsToday} intervalMs={config.postIntervalMs} />

          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
            <button onClick={function() { setFilter(null); }} style={{ background:filter===null?"#1e1e2e":"transparent", border:"1px solid "+(filter===null?"#3a3a5a":"#14142a"), color:filter===null?"#fff":"#2a2a48", padding:"5px 13px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>ALL · {items.length}</button>
            {Object.keys(CATEGORIES).map(function(k) {
              const cat = CATEGORIES[k];
              return (
                <button key={k} onClick={function() { setFilter(k); }} style={{ background:filter===k?cat.bg:"transparent", border:"1px solid "+(filter===k?cat.color+"66":"#14142a"), color:filter===k?cat.color:"#2a2a48", padding:"5px 13px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>
                  {cat.label.toUpperCase()} · {counts[k]||0}
                </button>
              );
            })}
          </div>

          {feedErr && <div style={{ background:"#160808", border:"1px solid #ff3b3b33", color:"#ff6060", padding:"11px 15px", borderRadius:6, fontSize:11, fontFamily:"monospace", marginBottom:12 }}>{feedErr}</div>}

          {!feedOn && items.length===0 && (
            <div style={{ textAlign:"center", padding:"80px 20px" }}>
              <div style={{ fontSize:52, marginBottom:14, color:"#111122" }}>◉</div>
              <div style={{ fontSize:17, fontFamily:"Georgia,serif", color:"#1e1e35", marginBottom:8 }}>Feed is offline</div>
              <div style={{ fontSize:11, fontFamily:"monospace", color:"#161630" }}>Press START FEED, then START in the Instagram panel above</div>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {filtered.map(function(item) { return <NewsCard key={item.id} item={item} />; })}
          </div>
        </div>
      </div>
      <Ticker items={items} />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;background:#06060c}
        @keyframes slideIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes ping{75%,100%{transform:scale(2.2);opacity:0}}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#07070e}
        ::-webkit-scrollbar-thumb{background:#1a1a2e;border-radius:2px}
        input::placeholder{color:#1e1e35}
      `}</style>
      {config
        ? <Monitor config={config} onLogout={function() { setConfig(null); }} />
        : <Wizard onComplete={setConfig} />}
    </>
  );
}
