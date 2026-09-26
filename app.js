/* Thiện Tâm An — blog app. Dữ liệu lưu trên Supabase (xem config.js). */
(function(){
const CATS={all:"Tất cả",trip:"Chuyến thiện nguyện",tyh:"Dưỡng sinh Tâm Y Pháp",news:"Tin nhóm"};
const ROLES={writer:"Người viết",admin:"Quản trị"};
const MONTHS=["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
const LOTUS='<svg class="lotus" viewBox="0 0 100 70" aria-hidden="true"><g fill="none" stroke="#F6DFA4" stroke-width="1.6" stroke-linejoin="round"><path d="M50 6C40 22 40 44 50 60C60 44 60 22 50 6Z" fill="rgba(247,217,227,.35)"/><path d="M50 60C38 52 28 38 28 22C38 26 46 40 50 60Z" fill="rgba(247,217,227,.25)"/><path d="M50 60C62 52 72 38 72 22C62 26 54 40 50 60Z" fill="rgba(247,217,227,.25)"/><path d="M50 60C34 58 18 48 12 36C26 36 40 46 50 60Z"/><path d="M50 60C66 58 82 48 88 36C74 36 60 46 50 60Z"/><path d="M20 64Q50 70 80 64"/></g></svg>';
const FIELDS=["title","cat","date","place","highlight","excerpt","body","cover"];

const S={posts:[],drafts:[],loaded:false,filter:"all",q:"",view:"list",open:null,
  email:null,role:null,members:[],ed:null,dirty:false,confirm:null,busy:false,loginMsg:null};
const canWrite=()=>!!S.role, isAdmin=()=>S.role==="admin";
const app=document.getElementById("app");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
const fmtDate=d=>{if(!d)return"";const [y,m,dd]=String(d).slice(0,10).split("-");return dd&&m&&y?`${+dd}/${+m}/${y}`:d};
const catOf=p=>CATS[p.cat]&&p.cat!=="all"?p.cat:"news";
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const hhmm=()=>new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)});
const LS={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const errText=x=>{const m=(x&&(x.message||x.code)||"")+"";
  if(/row-level security|permission|42501|JWT/i.test(m))return "Tài khoản của bạn chưa có quyền làm việc này. Hãy nhờ quản trị thêm email của bạn vào danh sách người viết.";
  if(/Failed to fetch|NetworkError|network/i.test(m))return "Mất kết nối mạng. Hãy kiểm tra mạng rồi thử lại.";
  return "Chưa lưu được: "+m;};

/* ---------- Supabase ---------- */
const CFG=window.TTA_CONFIG||{};
const configured=CFG.SUPABASE_URL&&CFG.SUPABASE_KEY&&!/DAN_/.test(CFG.SUPABASE_URL+CFG.SUPABASE_KEY);
const sb=configured&&window.supabase?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY,{auth:{flowType:"implicit",detectSessionInUrl:true,persistSession:true}}):null;
const ok=r=>{if(r.error)throw r.error;return r.data};
const api={
  async posts(){return ok(await sb.from("posts").select("*").order("date",{ascending:false,nullsFirst:false}))},
  async save(row){return ok(await sb.from("posts").upsert(row).select().single())},
  async setStatus(id,status){return ok(await sb.from("posts").update({status,updated_at:new Date().toISOString()}).eq("id",id).select().single())},
  async remove(id){const d=ok(await sb.from("posts").delete().eq("id",id).select());if(!d||!d.length)throw{message:"permission: không xoá được bài này"};},
  async myRole(email){const d=ok(await sb.from("members").select("role").eq("email",email.toLowerCase()).maybeSingle());return d?d.role:null},
  async members(){return ok(await sb.from("members").select("*").order("created_at",{ascending:true}))},
  async addMember(email,role){return ok(await sb.from("members").upsert({email:email.toLowerCase(),role}).select().single())},
  async removeMember(email){const d=ok(await sb.from("members").delete().eq("email",email).select());if(!d||!d.length)throw{message:"permission"}},
  async signIn(email){ok(await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}}))},
  async signInPw(email,password){ok(await sb.auth.signInWithPassword({email,password}))},
  async changePw(password){ok(await sb.auth.updateUser({password}))},
  async createAccount(email,password){
    const tmp=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:"tta-tao-tk"}});
    const r=await tmp.auth.signUp({email,password});
    if(r.error)throw r.error;
    const u=r.data&&r.data.user;
    if(u&&Array.isArray(u.identities)&&u.identities.length===0)return "exists";
    if(!r.data.session)return "confirm";
    try{await tmp.auth.signOut()}catch(e){}
    return "created";
  },
  async signOut(){await sb.auth.signOut()}
};

async function loadPosts(){
  const rows=await api.posts();
  S.posts=rows.filter(r=>r.status==="published");
  S.drafts=rows.filter(r=>r.status!=="published");
}

/* ---------- Text rendering ---------- */
function coverHTML(p){
  if(p.cover) return `<div class="cover" style="background-image:url('${esc(p.cover)}')" role="img" aria-label="${esc(p.title)}"></div>`;
  return `<div class="cover gen-${catOf(p)}">${LOTUS}</div>`;
}
const catChip=p=>{const c=catOf(p);return `<span class="cat ${c}">${CATS[c]}</span>`};
const metaLine=p=>`<div class="meta">${catChip(p)}${p.date?`<span>${fmtDate(p.date)}</span>`:""}${p.place?`<span>${esc(p.place)}</span>`:""}</div>`;
function prose(txt){
  const lines=String(txt||"").replace(/\r/g,"").split("\n");let out="",para=[],list=[];
  const fp=()=>{if(para.length){out+=`<p>${para.map(inline).join("<br>")}</p>`;para=[]}};
  const fl=()=>{if(list.length){out+=`<ul>${list.map(l=>`<li>${inline(l)}</li>`).join("")}</ul>`;list=[]}};
  for(const raw of lines){const l=raw.trim();
    if(!l){fp();fl();continue}
    if(l.startsWith("## ")){fp();fl();out+=`<h3>${inline(l.slice(3))}</h3>`;continue}
    if(l.startsWith("> ")){fp();fl();out+=`<blockquote>${inline(l.slice(2))}</blockquote>`;continue}
    if(/^[-•]\s/.test(l)){fp();list.push(l.replace(/^[-•]\s/,""));continue}
    fl();para.push(l);
  }
  fp();fl();return out;
}

/* ---------- Routing ---------- */
function setHash(h){try{history.replaceState(null,"",h?"#"+h:location.pathname+location.search)}catch(e){}}
function go(view,arg,force){
  if(!force&&S.view==="edit"&&S.dirty){showLeaveGuard(()=>go(view,arg,true));return}
  if((view==="edit"||view==="members")&&!canWrite()){view="login"}
  if(view==="pw"&&!S.email)view="login";
  if(view==="members"&&!isAdmin())view="kho";
  S.view=view;S.confirm=null;
  if(view==="post"){S.open=arg;setHash("p-"+arg)}
  else if(view==="edit"){setupEditor(arg);setHash(arg&&arg.id?"sua-"+arg.id:"viet")}
  else if(["kho","login","members","pw"].includes(view))setHash({kho:"kho",login:"dang-nhap",members:"thanh-vien",pw:"doi-mat-khau"}[view]);
  else setHash("");
  render();window.scrollTo({top:0});
}
function render(){
  renderAccount();renderTabs();
  if(!sb){app.innerHTML=`<div class="status">Trang chưa được kết nối với kho dữ liệu.<br>Hãy điền SUPABASE_URL và SUPABASE_KEY trong tệp <b>config.js</b> (xem HUONG-DAN).</div>`;return}
  if(S.view==="login")return renderLogin();
  if(S.view==="pw")return renderPw();
  if(!S.loaded){app.innerHTML=`<div class="status">Đang tải bài viết…</div>`;return}
  if(S.view==="post")renderPost();
  else if(S.view==="kho")renderKho();
  else if(S.view==="edit")renderEditor();
  else if(S.view==="members")renderMembers();
  else renderList();
}

/* ---------- Header account bar ---------- */
function renderAccount(){
  const el=document.getElementById("acct");
  if(!S.email){el.innerHTML="";return}
  el.innerHTML=`<div class="acct-in">
    <span class="who">${esc(S.email)} · <b>${canWrite()?ROLES[S.role]:"Chưa có quyền viết"}</b></span>
    ${canWrite()?`<button class="btn btn-gold btn-sm" id="aNew">+ Viết bài mới</button>`:""}
    ${isAdmin()?`<button class="btn btn-onwine btn-sm" id="aMem">Thành viên</button>`:""}
    <button class="btn btn-onwine btn-sm" id="aPw">Đổi mật khẩu</button>
    <button class="btn btn-onwine btn-sm" id="aOut">Đăng xuất</button></div>`;
  el.querySelector("#aPw").onclick=()=>go("pw");
  const n=el.querySelector("#aNew");if(n)n.onclick=()=>go("edit",null);
  const m=el.querySelector("#aMem");if(m)m.onclick=()=>go("members");
  el.querySelector("#aOut").onclick=async()=>{if(S.view==="edit"&&S.dirty)return showLeaveGuard(doSignOut);doSignOut()};
}
async function doSignOut(){S.dirty=false;await api.signOut();}

/* ---------- Tabs ---------- */
function renderTabs(){
  const counts={all:S.posts.length,trip:0,tyh:0,news:0};S.posts.forEach(p=>counts[catOf(p)]++);
  const el=document.getElementById("tabs");
  const act=k=>S.view==="list"&&S.filter===k;
  el.innerHTML=Object.keys(CATS).filter(k=>k!=="news"||counts.news).map(k=>`<button class="tab" data-f="${k}" aria-pressed="${act(k)}">${CATS[k]}<span class="n">${S.loaded?counts[k]:""}</span></button>`).join("")+
    `<button class="tab" data-v="kho" aria-pressed="${S.view==="kho"}">Kho bài viết${canWrite()&&S.drafts.length?`<span class="n">· ${S.drafts.length} nháp</span>`:""}</button>`+
    (S.view==="list"?`<input class="search" id="q" type="search" placeholder="Tìm bài viết…" aria-label="Tìm bài viết" value="${esc(S.q)}">`:"");
  el.querySelectorAll(".tab[data-f]").forEach(b=>b.onclick=()=>{S.filter=b.dataset.f;go("list")});
  el.querySelector('[data-v="kho"]').onclick=()=>go("kho");
  const q=el.querySelector("#q");if(q)q.oninput=()=>{S.q=q.value;renderList()};
}

/* ---------- Home ---------- */
function visible(){
  const q=S.q.trim().toLowerCase();
  return S.posts.filter(p=>(S.filter==="all"||catOf(p)===S.filter)&&(!q||[p.title,p.excerpt,p.place,p.body].join(" ").toLowerCase().includes(q)));
}
function renderList(){
  const list=visible();
  if(!S.posts.length){app.innerHTML=`<div class="status">Chưa có bài viết nào được đăng.${canWrite()?`<br><br><button class="btn btn-gold" id="first">+ Viết bài đầu tiên</button>`:""}</div>`;const f=document.getElementById("first");if(f)f.onclick=()=>go("edit",null);return}
  if(!list.length){app.innerHTML=`<div class="status">Không tìm thấy bài viết phù hợp.</div>`;return}
  const [f,...rest]=list;
  app.innerHTML=`
    <article class="feature" data-id="${esc(f.id)}" tabindex="0">
      ${coverHTML(f)}
      <div class="txt">${metaLine(f)}<h2>${esc(f.title)}</h2><p class="ex">${esc(f.excerpt)}</p>${f.highlight?`<div class="hl" style="border:0;padding:0">${esc(f.highlight)}</div>`:""}<span class="readmore">Đọc tiếp →</span></div>
    </article>
    ${rest.length?`<div class="sec-h"><h3>${S.filter==="all"?"Bài viết gần đây":CATS[S.filter]}</h3><span class="rule"></span></div>
    <div class="grid">${rest.map(p=>`
      <article class="card" data-id="${esc(p.id)}" tabindex="0">
        ${coverHTML(p)}
        <div class="txt">${metaLine(p)}<h4>${esc(p.title)}</h4><p class="ex">${esc(p.excerpt)}</p>${p.highlight?`<div class="hl">${esc(p.highlight)}</div>`:""}</div>
      </article>`).join("")}</div>`:""}`;
  app.querySelectorAll("[data-id]").forEach(el=>{const g=()=>go("post",el.dataset.id);el.onclick=g;el.onkeydown=e=>{if(e.key==="Enter")g()}});
}

/* ---------- Post ---------- */
function articleHTML(p){
  const c=catOf(p),facts=[];
  if(p.date)facts.push(["Ngày",fmtDate(p.date)]);
  if(p.place)facts.push([c==="tyh"?"Chủ đề":"Địa điểm",p.place]);
  if(p.highlight)facts.push([c==="tyh"?"Ghi nhớ":"Kết quả",p.highlight]);
  return `${metaLine(p)}<h2>${esc(p.title||"(Chưa có tiêu đề)")}</h2>
    ${facts.length?`<div class="facts">${facts.map(([k,v])=>`<div class="fact"><b>${k}</b>${esc(v)}</div>`).join("")}</div>`:""}
    ${coverHTML(p)}
    <div class="prose">${p.excerpt?`<p class="lede">${esc(p.excerpt)}</p>`:""}${prose(p.body)}</div>`;
}
function renderPost(){
  const p=S.posts.find(x=>x.id===S.open);
  if(!p){app.innerHTML=`<div class="status">Bài viết này không còn hoặc chưa được đăng.<br><br><button class="btn btn-ghost" id="bk">← Về trang chủ</button></div>`;document.getElementById("bk").onclick=()=>go("list");return}
  document.title=p.title+" · Thiện Tâm An";
  app.innerHTML=`<article class="article"><button class="back" id="back">← Quay lại</button>${articleHTML(p)}
    <div class="share"><button class="btn btn-ghost btn-sm" id="copy">Sao chép link bài viết</button><span class="ok" id="copyMsg"></span></div>
    ${canWrite()?`<div class="admin-row" id="adminRow"></div>`:""}</article>`;
  document.getElementById("back").onclick=()=>go("list");
  document.getElementById("copy").onclick=async()=>{const m=document.getElementById("copyMsg");try{await navigator.clipboard.writeText(location.href);m.textContent="Đã sao chép."}catch(e){m.textContent=location.href}};
  if(canWrite())adminRow(p);
}
function adminRow(p){
  const row=document.getElementById("adminRow");
  if(S.confirm===p.id){
    row.innerHTML=`<div class="confirm">Xoá vĩnh viễn bài “${esc(p.title)}”? <button class="btn btn-danger btn-sm" id="yes">Xoá</button><button class="btn btn-ghost btn-sm" id="no">Huỷ</button><span class="err" id="rowErr"></span></div>`;
    row.querySelector("#no").onclick=()=>{S.confirm=null;adminRow(p)};
    row.querySelector("#yes").onclick=()=>removePost(p,row.querySelector("#rowErr"),()=>go("list"));
    return;
  }
  row.innerHTML=`<button class="btn btn-wine btn-sm" id="edit">Sửa bài</button><button class="btn btn-ghost btn-sm" id="unpub">Chuyển về nháp</button><button class="btn btn-danger btn-sm" id="del">Xoá bài</button><span class="err" id="rowErr"></span>`;
  row.querySelector("#edit").onclick=()=>go("edit",{id:p.id});
  row.querySelector("#del").onclick=()=>{S.confirm=p.id;adminRow(p)};
  row.querySelector("#unpub").onclick=()=>setStatus(p,"draft",row.querySelector("#rowErr"),()=>go("kho"));
}

/* ---------- Store ops ---------- */
async function setStatus(p,status,errEl,done){
  if(S.busy)return;S.busy=true;
  try{await api.setStatus(p.id,status);await loadPosts();S.busy=false;done?done():render()}
  catch(x){S.busy=false;if(errEl)errEl.textContent=errText(x)}
}
async function removePost(p,errEl,done){
  if(S.busy)return;S.busy=true;
  try{await api.remove(p.id);await loadPosts();S.confirm=null;S.busy=false;done?done():render()}
  catch(x){S.busy=false;if(errEl)errEl.textContent=/permission/i.test(x.message||"")?"Chỉ tác giả của bài hoặc quản trị mới xoá được bài này.":errText(x)}
}

/* ---------- Archive ---------- */
function rowHTML(p,kind){
  const acts=!canWrite()?"":kind==="draft"
    ?`<button class="btn btn-wine btn-sm" data-a="edit">Viết tiếp</button><button class="btn btn-ghost btn-sm" data-a="pub">Đăng</button><button class="btn btn-danger btn-sm" data-a="del">Xoá</button>`
    :`<button class="btn btn-ghost btn-sm" data-a="edit">Sửa</button><button class="btn btn-ghost btn-sm" data-a="unpub">Về nháp</button><button class="btn btn-danger btn-sm" data-a="del">Xoá</button>`;
  const [y,m,d]=String(p.date||"").split("-");
  return `<li class="row" data-id="${esc(p.id)}" data-k="${kind}">
    <span class="d">${d?`${d}/${m}`:"—"}</span>
    <div class="t"><a data-a="open">${esc(p.title||"(Chưa có tiêu đề)")}</a>
      <div class="sub">${catChip(p)}${p.place?`<span>${esc(p.place)}</span>`:""}${kind==="draft"?`<span class="pill draft">Nháp</span>`:""}${canWrite()&&p.author_email?`<span>${esc(p.author_email)}</span>`:""}${kind==="draft"&&p.updated_at?`<span>Sửa lần cuối ${new Date(p.updated_at).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>`:""}</div></div>
    <div class="acts">${acts}</div>
    ${S.confirm===p.id?`<div class="confirm">Xoá vĩnh viễn “${esc(p.title||"bài này")}”? <button class="btn btn-danger btn-sm" data-a="yes">Xoá</button><button class="btn btn-ghost btn-sm" data-a="no">Huỷ</button></div>`:""}
    <span class="err"></span>
  </li>`;
}
function renderKho(){
  const byYear={};
  S.posts.forEach(p=>{const [y,m]=String(p.date||"").split("-");const Y=y||"Chưa ghi ngày";(byYear[Y]=byYear[Y]||{});const M=m?+m:0;(byYear[Y][M]=byYear[Y][M]||[]).push(p)});
  const years=Object.keys(byYear).sort((a,b)=>b.localeCompare(a));
  const c={trip:0,tyh:0,news:0};S.posts.forEach(p=>c[catOf(p)]++);
  app.innerHTML=`
    <div class="kho-head"><div><h2>Kho bài viết</h2><p>Tất cả bài đã đăng, xếp theo năm và tháng.</p></div>
      <div class="kho-stats"><span class="kho-stat"><b>${S.posts.length}</b>bài đã đăng</span><span class="kho-stat"><b>${c.trip}</b>chuyến đi</span><span class="kho-stat"><b>${c.tyh}</b>dưỡng sinh</span>${canWrite()?`<span class="kho-stat"><b>${S.drafts.length}</b>bản nháp</span>`:""}</div></div>
    ${canWrite()?`<section class="kho-block drafts"><div class="year" style="font-size:1.4rem">Bản nháp <span class="rule"></span><button class="btn btn-gold btn-sm" id="kNew">+ Viết bài mới</button></div>
      <p class="hint" style="margin:0 0 6px">Chỉ người viết và quản trị nhìn thấy mục này.</p>
      ${S.drafts.length?`<ul class="rows">${[...S.drafts].sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))).map(p=>rowHTML(p,"draft")).join("")}</ul>`:`<div class="empty">Chưa có bản nháp nào.</div>`}</section>`:""}
    ${years.length?years.map(Y=>`<section class="kho-block"><div class="year">${esc(Y)}<span class="rule"></span></div>
      ${Object.keys(byYear[Y]).map(Number).sort((a,b)=>b-a).map(M=>`<div class="month">${M?MONTHS[M-1]:"Không rõ tháng"} · ${byYear[Y][M].length} bài</div><ul class="rows">${byYear[Y][M].map(p=>rowHTML(p,"post")).join("")}</ul>`).join("")}
    </section>`).join(""):`<div class="empty">Chưa có bài nào được đăng.</div>`}`;
  const kn=document.getElementById("kNew");if(kn)kn.onclick=()=>go("edit",null);
  app.querySelectorAll(".row").forEach(li=>{
    const id=li.dataset.id,kind=li.dataset.k;
    const p=(kind==="draft"?S.drafts:S.posts).find(x=>x.id===id);if(!p)return;
    const err=li.querySelector(".err");
    li.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
      const a=b.dataset.a;
      if(a==="open")return kind==="draft"?go("edit",{id}):go("post",id);
      if(a==="edit")return go("edit",{id});
      if(a==="pub"){if(!p.title){err.textContent="Bản nháp cần có tiêu đề trước khi đăng.";return}return setStatus(p,"published",err)}
      if(a==="unpub")return setStatus(p,"draft",err);
      if(a==="del"){S.confirm=id;return renderKho()}
      if(a==="no"){S.confirm=null;return renderKho()}
      if(a==="yes")return removePost(p,err);
    });
  });
}

/* ---------- Login ---------- */
function renderLogin(){
  if(canWrite()){go("kho",null,true);return}
  const m=S.loginMsg||{},mode=S.loginMode||"pw";
  app.innerHTML=`<div class="login">
    <h2>Dành cho người viết</h2>
    ${S.email?`<p>Bạn đang đăng nhập bằng <b>${esc(S.email)}</b>, nhưng tài khoản này chưa có quyền viết bài. Hãy nhờ quản trị thêm email của bạn ở trang Thành viên, rồi tải lại trang.</p><button class="btn btn-ghost" id="lOut">Đăng xuất</button>`
    :mode==="pw"?`<p>Đăng nhập bằng tài khoản quản trị đã tạo cho bạn.</p>
    <form id="lf" class="login-form">
      <label class="field">Email<input id="lEmail" type="email" required autocomplete="username" placeholder="ban@gmail.com" value="${esc(m.email||"")}"></label>
      <label class="field">Mật khẩu<input id="lPw" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-gold" id="lBtn" type="submit">Đăng nhập</button></form>
    <p class="${m.err?"err":"ok"}" id="lMsg">${m.text?esc(m.text):""}</p>
    <p class="hint">Quên mật khẩu? Nhờ quản trị đặt lại, hoặc <a href="#" id="lMagic">đăng nhập bằng link gửi qua email</a>.</p>`
    :`<p>Nhập email của bạn, chúng tôi gửi một đường link đăng nhập vào hộp thư.</p>
    <form id="lf" class="login-form"><label class="field">Email<input id="lEmail" type="email" required autocomplete="email" value="${esc(m.email||"")}"></label>
      <button class="btn btn-gold" id="lBtn" type="submit">Gửi link đăng nhập</button></form>
    <p class="${m.err?"err":"ok"}" id="lMsg">${m.text?esc(m.text):""}</p>
    <p class="hint"><a href="#" id="lPwMode">← Đăng nhập bằng mật khẩu</a></p>`}
    <p class="hint">Người đọc không cần đăng nhập. Mọi bài đã đăng đều xem được tự do.</p>
    <button class="back" id="lBack">← Về trang chủ</button></div>`;
  document.getElementById("lBack").onclick=()=>go("list");
  const o=document.getElementById("lOut");if(o)o.onclick=()=>doSignOut();
  const mg=document.getElementById("lMagic");if(mg)mg.onclick=e=>{e.preventDefault();S.loginMode="link";S.loginMsg={email:document.getElementById("lEmail").value};renderLogin()};
  const pm=document.getElementById("lPwMode");if(pm)pm.onclick=e=>{e.preventDefault();S.loginMode="pw";S.loginMsg=null;renderLogin()};
  const f=document.getElementById("lf");if(!f)return;
  f.onsubmit=async e=>{e.preventDefault();const email=document.getElementById("lEmail").value.trim();const b=document.getElementById("lBtn");b.disabled=true;
    if(mode==="pw"){b.textContent="Đang đăng nhập…";
      try{await api.signInPw(email,document.getElementById("lPw").value);S.loginMsg=null;return}
      catch(x){S.loginMsg={email,err:true,text:/invalid login|credentials/i.test(x.message||"")?"Email hoặc mật khẩu không đúng.":/confirm/i.test(x.message||"")?"Tài khoản chưa được xác nhận. Hãy nhờ quản trị kiểm tra.":"Không đăng nhập được: "+(x.message||"")}}
    }else{b.textContent="Đang gửi…";
      try{await api.signIn(email);S.loginMsg={email,text:`Đã gửi link tới ${email}. Hãy mở email (kể cả mục Spam) và bấm link trên chính thiết bị này.`}}
      catch(x){S.loginMsg={email,err:true,text:/rate|security purposes/i.test(x.message||"")?"Bạn vừa yêu cầu quá nhiều lần. Hãy đợi vài phút rồi thử lại.":"Không gửi được link: "+(x.message||"")}}
    }
    renderLogin()};
}
function renderPw(){
  app.innerHTML=`<div class="login"><h2>Đổi mật khẩu</h2><p>Tài khoản: <b>${esc(S.email)}</b></p>
    <form id="pf" class="login-form">
      <label class="field">Mật khẩu mới (ít nhất 6 ký tự)<input id="p1" type="password" minlength="6" required autocomplete="new-password"></label>
      <label class="field">Nhập lại mật khẩu mới<input id="p2" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="btn btn-gold" id="pBtn" type="submit">Lưu mật khẩu mới</button></form>
    <p id="pMsg"></p><button class="back" id="pBack">← Quay lại</button></div>`;
  document.getElementById("pBack").onclick=()=>go(canWrite()?"kho":"list");
  document.getElementById("pf").onsubmit=async e=>{e.preventDefault();const a=document.getElementById("p1").value,b=document.getElementById("p2").value,m=document.getElementById("pMsg");
    if(a!==b){m.className="err";m.textContent="Hai mật khẩu chưa khớp nhau.";return}
    try{await api.changePw(a);m.className="ok";m.textContent="Đã đổi mật khẩu. Lần sau hãy đăng nhập bằng mật khẩu mới.";e.target.reset()}
    catch(x){m.className="err";m.textContent=/different|same/i.test(x.message||"")?"Mật khẩu mới phải khác mật khẩu cũ.":/weak|at least/i.test(x.message||"")?"Mật khẩu quá ngắn hoặc quá đơn giản.":"Chưa đổi được: "+(x.message||"")}};
}

/* ---------- Members (admin) ---------- */
async function renderMembers(){
  app.innerHTML=`<div class="members"><div class="kho-head"><div><h2>Thành viên</h2><p>Người đọc không cần tài khoản. Chỉ những email dưới đây mới đăng nhập để viết bài được.</p></div></div>
    <div class="w-panel" style="margin-bottom:22px"><h5>Thêm người cùng viết</h5>
      <form id="mf" class="mem-form"><label class="field" style="flex:2 1 220px">Email<input id="mEmail" type="email" required placeholder="thanhvien@gmail.com" autocomplete="off"></label>
      <label class="field" style="flex:1 1 180px">Mật khẩu ban đầu<span style="display:flex;gap:6px"><input id="mPw" type="text" minlength="6" autocomplete="off" placeholder="ít nhất 6 ký tự"><button type="button" class="btn btn-ghost btn-sm" id="mGen">Tạo</button></span></label>
      <label class="field" style="flex:1 1 150px">Vai trò<select id="mRole"><option value="writer">Người viết</option><option value="admin">Quản trị</option></select></label>
      <button class="btn btn-gold" id="mBtn" type="submit" style="align-self:flex-end">Tạo tài khoản</button></form>
      <p class="hint">Để trống mật khẩu nếu người đó đã có tài khoản, chỉ cần cấp quyền.</p>
      <div id="mDone"></div>
      <p class="hint"><b>Người viết</b>: viết bài, lưu nháp, đăng và sửa bài; chỉ xoá được bài của mình. <b>Quản trị</b>: làm được mọi việc, kể cả thêm/bớt thành viên.</p>
      <span class="err" id="mErr"></span></div>
    <ul class="rows" id="mList"><li class="empty">Đang tải…</li></ul></div>`;
  document.getElementById("mGen").onclick=()=>{const c="abcdefghjkmnpqrstuvwxyz23456789";let p="";const r=crypto.getRandomValues(new Uint32Array(10));r.forEach(n=>p+=c[n%c.length]);document.getElementById("mPw").value=p};
  document.getElementById("mf").onsubmit=async e=>{e.preventDefault();
    const em=document.getElementById("mEmail").value.trim().toLowerCase(),pw=document.getElementById("mPw").value,r=document.getElementById("mRole").value,err=document.getElementById("mErr"),done=document.getElementById("mDone"),btn=document.getElementById("mBtn");
    err.textContent="";done.innerHTML="";
    if(pw&&pw.length<6){err.textContent="Mật khẩu cần ít nhất 6 ký tự.";return}
    btn.disabled=true;btn.textContent="Đang tạo…";
    let note="";
    try{
      if(pw){const res=await api.createAccount(em,pw);
        if(res==="exists")note=`Email này đã có tài khoản từ trước nên mật khẩu không đổi. Người đó đăng nhập bằng mật khẩu cũ (hoặc link qua email).`;
        else if(res==="confirm")note=`Tài khoản đã tạo nhưng Supabase đang bắt xác nhận email. Hãy tắt "Confirm email" (xem hướng dẫn), hoặc vào Supabase > Authentication > Users để xác nhận thủ công.`;}
      await api.addMember(em,r);
      S.members=await api.members();drawMembers();e.target.reset();
      const msg=pw&&!note?`Trang web: ${location.origin+location.pathname}\nEmail: ${em}\nMật khẩu: ${pw}\n(Vào mục "Dành cho người viết" ở cuối trang để đăng nhập, rồi bấm "Đổi mật khẩu".)`:"";
      done.innerHTML=`<div class="banner" style="flex-direction:column;align-items:flex-start">${pw&&!note?`<b>Đã tạo tài khoản ${esc(ROLES[r])} cho ${esc(em)}.</b> Gửi thông tin sau cho họ:<pre class="cred">${esc(msg)}</pre><button type="button" class="btn btn-wine btn-sm" id="mCopy">Sao chép</button>`:`<b>Đã cấp quyền ${esc(ROLES[r])} cho ${esc(em)}.</b>${note?`<span>${esc(note)}</span>`:""}`}</div>`;
      const cp=document.getElementById("mCopy");if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(msg);cp.textContent="Đã sao chép"}catch(x){}};
    }catch(x){err.textContent=/signups? not allowed|disabled/i.test(x.message||"")?"Supabase đang tắt đăng ký tài khoản mới. Hãy bật lại (xem hướng dẫn).":/password/i.test(x.message||"")?"Mật khẩu chưa đạt yêu cầu: "+x.message:errText(x)}
    btn.disabled=false;btn.textContent="Tạo tài khoản"};
  try{S.members=await api.members()}catch(x){document.getElementById("mList").innerHTML=`<li class="err">${esc(errText(x))}</li>`;return}
  drawMembers();
}
function drawMembers(){
  const ul=document.getElementById("mList");if(!ul)return;
  ul.innerHTML=S.members.map(m=>{const me=m.email===S.email;return `<li class="row mem" data-e="${esc(m.email)}">
    <span class="d">${m.role==="admin"?"★":"✎"}</span>
    <div class="t"><a style="cursor:default">${esc(m.email)}</a><div class="sub"><span class="pill ${m.role==="admin"?"pub":"new"}">${ROLES[m.role]}</span>${me?"<span>(bạn)</span>":""}</div></div>
    <div class="acts">${me?"":`<select data-a="role" aria-label="Đổi vai trò">${Object.keys(ROLES).map(k=>`<option value="${k}" ${m.role===k?"selected":""}>${ROLES[k]}</option>`).join("")}</select><button class="btn btn-danger btn-sm" data-a="del">Gỡ</button>`}</div>
    ${S.confirm===m.email?`<div class="confirm">Gỡ quyền viết của ${esc(m.email)}? Bài họ đã viết vẫn được giữ. <button class="btn btn-danger btn-sm" data-a="yes">Gỡ</button><button class="btn btn-ghost btn-sm" data-a="no">Huỷ</button></div>`:""}
    <span class="err"></span></li>`}).join("")||`<li class="empty">Chưa có thành viên.</li>`;
  ul.querySelectorAll(".mem").forEach(li=>{const em=li.dataset.e,err=li.querySelector(".err");
    li.querySelectorAll("[data-a]").forEach(b=>{const a=b.dataset.a;
      if(a==="role")b.onchange=async()=>{try{await api.addMember(em,b.value);S.members=await api.members();drawMembers()}catch(x){err.textContent=errText(x)}};
      else b.onclick=async()=>{
        if(a==="del"){S.confirm=em;return drawMembers()}
        if(a==="no"){S.confirm=null;return drawMembers()}
        if(a==="yes"){try{await api.removeMember(em);S.confirm=null;S.members=await api.members();drawMembers()}catch(x){err.textContent=errText(x)}}
      }});
  });
}

/* ---------- Writer ---------- */
function setupEditor(arg){
  let data={title:"",cat:S.filter!=="all"?S.filter:"trip",date:today(),place:"",highlight:"",excerpt:"",body:"",cover:""},id=null,status=null,src=null;
  if(arg&&arg.id){src=[...S.posts,...S.drafts].find(x=>x.id===arg.id);if(src){id=src.id;status=src.status;FIELDS.forEach(k=>data[k]=src[k]??data[k])}}
  if(!id)id=uuid();
  const key="tta:bk:"+(status?id:"new");const bk=LS.get(key);
  const restore=bk&&bk.data&&FIELDS.some(k=>(bk.data[k]||"")!==(data[k]||""))?bk:null;
  S.ed={id,status,src,data,key,restore,mode:"write",msg:"",msgKind:"",leave:null};S.dirty=false;
}
function stateLabel(){const e=S.ed;return e.status==="published"?`<span class="pill pub">Đã đăng</span>`:e.status?`<span class="pill draft">Bản nháp</span>`:`<span class="pill new">Bài mới</span>`}
function renderEditor(){
  const e=S.ed;if(!e)return go("list");const d=e.data;
  const words=(d.body||"").trim().split(/\s+/).filter(Boolean).length;
  app.innerHTML=`<div class="writer">
    <div class="w-top"><button class="back" id="wBack" style="margin:0">← Rời trình soạn thảo</button>${stateLabel()}<span class="state" id="wState">${S.dirty?"Có thay đổi chưa lưu":e.msg&&e.msgKind==="ok"?esc(e.msg):""}</span></div>
    ${e.leave?`<div class="banner">Bạn có thay đổi chưa lưu. Rời đi sẽ mất các thay đổi này (bản sao tạm vẫn được giữ trên máy bạn). <button class="btn btn-danger btn-sm" id="lvYes">Rời đi</button><button class="btn btn-ghost btn-sm" id="lvNo">Ở lại</button></div>`:""}
    ${e.restore?`<div class="banner">Có bản đang viết dở lưu trên máy này (${new Date(e.restore.t).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}). <button class="btn btn-wine btn-sm" id="rsYes">Khôi phục</button><button class="btn btn-ghost btn-sm" id="rsNo">Bỏ qua</button></div>`:""}
    <div class="w-main">
      <input class="w-title" id="f-title" placeholder="Tiêu đề bài viết" value="${esc(d.title)}" aria-label="Tiêu đề">
      <textarea class="w-ex" id="f-excerpt" placeholder="Tóm tắt ngắn: một-hai câu hiện trên thẻ bài viết" aria-label="Tóm tắt">${esc(d.excerpt)}</textarea>
      <div class="w-box">
        <div class="w-bar">
          <button class="tool" data-ins="## "><b>H</b> Tiêu đề nhỏ</button>
          <button class="tool" data-ins="- ">• Danh sách</button>
          <button class="tool" data-ins="> ">❝ Trích dẫn</button>
          <button class="tool" data-wrap="**"><b>B</b> Đậm</button>
          <div class="mode"><button id="mW" aria-pressed="${e.mode==="write"}">Soạn</button><button id="mP" aria-pressed="${e.mode==="prev"}">Xem trước</button></div>
        </div>
        ${e.mode==="write"
          ?`<textarea class="w-body" id="f-body" placeholder="Kể lại chuyến đi, chia sẻ bài tập… Để trống một dòng giữa các đoạn." aria-label="Nội dung">${esc(d.body)}</textarea>`
          :`<div class="w-prev article">${articleHTML(d)}</div>`}
        <div class="w-foot"><span id="wc">${words} chữ</span><span>“## ” tiêu đề nhỏ · “- ” danh sách · “> ” trích dẫn · **đậm**</span></div>
      </div>
    </div>
    <aside class="w-side">
      <div class="w-panel">
        <h5>Đăng bài</h5>
        <div class="w-actions">
          ${e.status==="published"
            ?`<button class="btn btn-gold" id="aPub">Cập nhật bài đã đăng</button><button class="btn btn-ghost" id="aDraft">Chuyển về nháp</button>`
            :`<button class="btn btn-gold" id="aPub">Đăng bài</button><button class="btn btn-ghost" id="aDraft">Lưu nháp</button>`}
        </div>
        <span class="${e.msgKind==="err"?"err":"ok"}" id="wMsg">${e.msgKind==="err"?esc(e.msg):""}</span>
      </div>
      <div class="w-panel">
        <h5>Thông tin bài</h5>
        <label class="field">Chuyên mục<select id="f-cat">${["trip","tyh","news"].map(k=>`<option value="${k}" ${d.cat===k?"selected":""}>${CATS[k]}</option>`).join("")}</select></label>
        <label class="field">Ngày diễn ra<input id="f-date" type="date" value="${esc(d.date||"")}"></label>
        <label class="field">${d.cat==="tyh"?"Chủ đề":"Địa điểm"}<input id="f-place" value="${esc(d.place)}" placeholder="${d.cat==="tyh"?"VD: Hơi thở, Giấc ngủ":"VD: Xã Tà Xùa, Sơn La"}"></label>
        <label class="field">${d.cat==="tyh"?"Ghi nhớ":"Kết quả"}<input id="f-highlight" value="${esc(d.highlight)}" placeholder="${d.cat==="tyh"?"VD: 10 phút mỗi sáng":"VD: 150 phần quà"}"></label>
      </div>
      <div class="w-panel">
        <h5>Ảnh bìa</h5>
        <div class="prev-img" id="f-prev" style="${d.cover?`background-image:url('${esc(d.cover)}')`:""}">${d.cover?"":"Chưa có ảnh: bài sẽ dùng hình hoa sen mặc định"}</div>
        <input id="f-img" type="file" accept="image/*" aria-label="Chọn ảnh bìa">
        ${d.cover?`<button class="btn btn-ghost btn-sm" id="f-rm">Bỏ ảnh</button>`:""}
        <span class="hint">Ảnh tự thu nhỏ để lưu cùng bài.</span>
      </div>
    </aside>
  </div>`;
  bindEditor();
}
let bkTimer=null;
function markDirty(){S.dirty=true;S.ed.msg="";const st=document.getElementById("wState");if(st)st.textContent="Có thay đổi chưa lưu";
  clearTimeout(bkTimer);bkTimer=setTimeout(()=>LS.set(S.ed.key,{t:Date.now(),data:S.ed.data}),600)}
function bindEditor(){
  const e=S.ed,d=e.data,$=s=>app.querySelector(s);
  ["title","excerpt","body","place","highlight","date"].forEach(k=>{const el=$("#f-"+k);if(el)el.oninput=()=>{d[k]=el.value;markDirty();if(k==="body")$("#wc").textContent=el.value.trim().split(/\s+/).filter(Boolean).length+" chữ"}});
  $("#f-cat").onchange=ev=>{d.cat=ev.target.value;markDirty();renderEditor()};
  $("#wBack").onclick=()=>e.status==="published"?go("post",e.id):go("kho");
  $("#mW").onclick=()=>{e.mode="write";renderEditor()};
  $("#mP").onclick=()=>{e.mode="prev";renderEditor()};
  app.querySelectorAll("[data-ins]").forEach(b=>b.onclick=()=>{if(e.mode!=="write"){e.mode="write";renderEditor()}insertPrefix(b.dataset.ins)});
  app.querySelectorAll("[data-wrap]").forEach(b=>b.onclick=()=>{if(e.mode!=="write"){e.mode="write";renderEditor()}wrapSel(b.dataset.wrap)});
  const rs=$("#rsYes");if(rs){rs.onclick=()=>{Object.assign(d,e.restore.data);e.restore=null;S.dirty=true;renderEditor()};$("#rsNo").onclick=()=>{LS.del(e.key);e.restore=null;renderEditor()}}
  const lv=$("#lvYes");if(lv){lv.onclick=()=>{const f=e.leave;e.leave=null;S.dirty=false;f()};$("#lvNo").onclick=()=>{e.leave=null;renderEditor()}}
  const rm=$("#f-rm");if(rm)rm.onclick=()=>{d.cover="";markDirty();renderEditor()};
  $("#f-img").onchange=async ev=>{const f=ev.target.files[0];if(!f)return;const pv=$("#f-prev");pv.textContent="Đang xử lý ảnh…";
    try{d.cover=await shrink(f);markDirty();renderEditor()}catch(x){pv.textContent="Không đọc được ảnh này, hãy thử ảnh khác."}};
  $("#aPub").onclick=()=>saveAs("published");
  $("#aDraft").onclick=()=>saveAs("draft");
}
function insertPrefix(pre){
  const ta=app.querySelector("#f-body");if(!ta)return;
  const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf("\n",s-1)+1;
  const le=v.indexOf("\n",s);const line=v.slice(ls,le<0?v.length:le);
  let nv,pos;
  if(line.startsWith(pre)){nv=v.slice(0,ls)+line.slice(pre.length)+v.slice(ls+line.length);pos=Math.max(ls,s-pre.length)}
  else{nv=v.slice(0,ls)+pre+v.slice(ls);pos=s+pre.length}
  ta.value=nv;ta.focus();ta.setSelectionRange(pos,pos);S.ed.data.body=nv;markDirty();
}
function wrapSel(w){
  const ta=app.querySelector("#f-body");if(!ta)return;
  const v=ta.value,a=ta.selectionStart,b=ta.selectionEnd,sel=v.slice(a,b)||"chữ đậm";
  const nv=v.slice(0,a)+w+sel+w+v.slice(b);ta.value=nv;ta.focus();ta.setSelectionRange(a+w.length,a+w.length+sel.length);S.ed.data.body=nv;markDirty();
}
function showLeaveGuard(fn){if(!S.ed)return fn();S.ed.leave=fn;S.view="edit";renderEditor();window.scrollTo({top:0})}
function shrink(file){
  return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{let max=1400,q=.8,out;
      const draw=()=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q)};
      out=draw();while(out.length>200000&&max>500){max-=200;q=Math.max(.6,q-.05);out=draw()}
      URL.revokeObjectURL(url);res(out)};
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("bad image"))};img.src=url;});
}
async function saveAs(status){
  const e=S.ed,d=e.data,msg=app.querySelector("#wMsg");
  if(S.busy)return;
  if(status==="published"){
    if(!d.title.trim()){msg.className="err";msg.textContent="Hãy nhập tiêu đề trước khi đăng.";app.querySelector("#f-title").focus();return}
    if(!d.body.trim()&&!d.excerpt.trim()){msg.className="err";msg.textContent="Bài viết chưa có nội dung.";return}
  }
  S.busy=true;app.querySelectorAll(".w-actions .btn").forEach(b=>b.disabled=true);msg.className="ok";msg.textContent="Đang lưu…";
  const row={id:e.id,status,updated_at:new Date().toISOString()};
  FIELDS.forEach(k=>row[k]=typeof d[k]==="string"&&k!=="body"?d[k].trim():d[k]);
  if(!row.date)row.date=null;
  if(!e.src)row.author_email=S.email;
  try{
    await api.save(row);
    LS.del(e.key);LS.del("tta:bk:new");S.dirty=false;S.busy=false;
    await loadPosts();
    if(status==="published"){go("post",e.id,true);return}
    e.status="draft";e.src=S.drafts.find(x=>x.id===e.id)||e.src||{};e.key="tta:bk:"+e.id;e.msg="Đã lưu nháp lúc "+hhmm();e.msgKind="ok";renderTabs();renderEditor();
  }catch(x){S.busy=false;e.msg=errText(x);e.msgKind="err";app.querySelectorAll(".w-actions .btn").forEach(b=>b.disabled=false);msg.className="err";msg.textContent=e.msg}
}
window.addEventListener("beforeunload",ev=>{if(S.view==="edit"&&S.dirty){ev.preventDefault();ev.returnValue=""}});
document.getElementById("writerLink").onclick=e=>{e.preventDefault();go(canWrite()?"kho":"login")};

/* ---------- Boot ---------- */
async function refreshAuth(session){
  S.email=session&&session.user&&session.user.email?session.user.email.toLowerCase():null;
  S.role=null;
  if(S.email){try{S.role=await api.myRole(S.email)}catch(x){S.role=null}}
}
async function boot(){
  if(!sb){render();return}
  const h=(location.hash||"").replace(/^#/,"");
  const authHash=/access_token|error_description|type=/.test(h);
  const {data}=await sb.auth.getSession();
  await refreshAuth(data.session);
  try{await loadPosts()}catch(x){app.innerHTML=`<div class="status">Không tải được bài viết. ${esc(errText(x))}</div>`;return}
  S.loaded=true;
  let init=["list"];
  if(authHash)init=canWrite()?["kho"]:["login"];
  else if(h==="kho")init=["kho"];else if(h==="dang-nhap")init=["login"];else if(h==="thanh-vien")init=["members"];else if(h==="doi-mat-khau")init=["pw"];
  else if(h==="viet")init=["edit",null];else if(h.startsWith("sua-"))init=["edit",{id:h.slice(4)}];else if(h.startsWith("p-"))init=["post",h.slice(2)];
  go(init[0],init[1],true);
  sb.auth.onAuthStateChange((ev,session)=>{
    const em=session&&session.user?session.user.email.toLowerCase():null;
    if(em===S.email&&ev!=="SIGNED_OUT")return;
    setTimeout(async()=>{await refreshAuth(session);try{await loadPosts()}catch(x){}
      if(ev==="SIGNED_OUT"){S.ed=null;go("list",null,true)}else go(canWrite()?"kho":"login",null,true)},0);
  });
}
boot();
})();
