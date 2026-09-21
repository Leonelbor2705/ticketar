// js/app.js — TicketAR SPA Logic
'use strict';

// ══════════════════════════════════════════
// SISTEMA DE ROLES Y PERMISOS
// superadmin → todo, incluyendo asignar roles
// admin      → eventos, órdenes, usuarios (sin superadmins)
// vendedor   → solo órdenes y validar QR
// ══════════════════════════════════════════
const PERMISOS = {
  superadmin: ['dashboard','events','orders','scanner','users','payments','roles'],
  admin:      ['dashboard','events','orders','scanner','users'],
  vendedor:   ['orders','scanner']
};

const MENU_ITEMS = [
  { id:'dashboard', label:'Dashboard',        icon:'📊', section:'Principal' },
  { id:'events',    label:'Eventos',           icon:'🎪', section:'Principal' },
  { id:'orders',    label:'Órdenes de compra', icon:'🎟️', section:'Principal' },
  { id:'scanner',   label:'Validar QR',        icon:'📷', section:'Operación' },
  { id:'users',     label:'Usuarios',          icon:'👥', section:'Configuración' },
  { id:'payments',  label:'Pagos / MP',        icon:'💳', section:'Configuración' },
  { id:'roles',     label:'Permisos y Roles',  icon:'🔐', section:'Configuración' },
];

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let state = {
  events: [],
  currentEvent: null,
  cart: {},
  currentAdmin: null,
  adminSection: 'dashboard'
};

// Demo users con 3 roles
let DEMO_USERS = [
  { id:1, username:'admin',    password:'admin123', role:'superadmin', name:'Super Administrador', email:'super@ticketar.com', active:1 },
  { id:2, username:'gerente',  password:'ger123',   role:'admin',      name:'Gerente Eventos',     email:'gerente@ticketar.com', active:1 },
  { id:3, username:'vendedor', password:'vend123',  role:'vendedor',   name:'Carlos Sánchez',      email:'carlos@ticketar.com', active:1 },
];

const DEMO_EVENTS = [
  { id:1, emoji:'🎵', title:'Festival de Música Electrónica', date:'2025-08-14', time:'22:00',
    venue:'Centro Cultural Konex', city:'Buenos Aires', active:1,
    description:'La noche más esperada del año con los mejores DJs nacionales e internacionales.',
    stages:[{id:1,name:'Early Bird',price:3500,quantity:100,sold:87,active:1},
            {id:2,name:'Preventa',price:5500,quantity:200,sold:142,active:1},
            {id:3,name:'General',price:7500,quantity:300,sold:0,active:0}] },
  { id:2, emoji:'🎭', title:'Obra: La Gaviota', date:'2025-07-22', time:'20:30',
    venue:'Teatro San Martín', city:'CABA', active:1,
    description:'Clásico de Chéjov interpretado por el elenco del Teatro San Martín.',
    stages:[{id:4,name:'Preventa',price:4000,quantity:80,sold:60,active:1},
            {id:5,name:'General',price:6000,quantity:120,sold:30,active:1}] },
  { id:3, emoji:'🏋️', title:'Expo Fitness 2025', date:'2025-09-05', time:'10:00',
    venue:'La Rural', city:'Palermo', active:1,
    description:'El evento de fitness y bienestar más grande de Argentina.',
    stages:[{id:6,name:'Early Bird',price:1200,quantity:500,sold:499,active:1},
            {id:7,name:'General',price:2500,quantity:1000,sold:200,active:1},
            {id:8,name:'VIP',price:8000,quantity:50,sold:10,active:1}] }
];

const DEMO_ORDERS = [
  {id:'ORD-DEMO01',event_title:'Festival de Música Electrónica',buyer_name:'María',buyer_lastname:'González',buyer_email:'maria@email.com',total:7000,payment_status:'paid',payment_method:'mp',created_at:'2025-04-10'},
  {id:'ORD-DEMO02',event_title:'Obra: La Gaviota',buyer_name:'Roberto',buyer_lastname:'Pérez',buyer_email:'rob@email.com',total:12000,payment_status:'paid',payment_method:'card',created_at:'2025-04-11'},
  {id:'ORD-DEMO03',event_title:'Expo Fitness 2025',buyer_name:'Laura',buyer_lastname:'Martín',buyer_email:'lau@email.com',total:10500,payment_status:'pending',payment_method:'transfer',created_at:'2025-04-12'}
];

function can(accion) {
  if (!state.currentAdmin) return false;
  return (PERMISOS[state.currentAdmin.role] || []).includes(accion);
}

// ══════════════════════════════════════════
// PAGES — FIX: solo .active es visible
// ══════════════════════════════════════════
function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const el = document.getElementById('page-' + p);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMenu() { document.getElementById('mobile-menu')?.classList.toggle('hidden'); }

// ══════════════════════════════════════════
// HOME
// ══════════════════════════════════════════
async function loadEvents() {
  try { state.events = await API.getEvents(); }
  catch(e) { state.events = DEMO_EVENTS; }
  renderEvents(state.events);
  updateHeroStats();
}

function updateHeroStats() {
  const ts = state.events.reduce((s,e)=>s+(e.stages||[]).reduce((a,st)=>a+(st.sold||0),0),0);
  animCount('stat-events', state.events.length);
  animCount('stat-tickets', ts);
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur=0, step=Math.max(1,Math.ceil(target/30));
  const t = setInterval(()=>{ cur=Math.min(cur+step,target); el.textContent=cur.toLocaleString('es-AR'); if(cur>=target) clearInterval(t); },40);
}

function renderEvents(events) {
  const grid = document.getElementById('events-grid');
  if (!events.length) { grid.innerHTML='<div class="loading-events">No hay eventos disponibles</div>'; return; }
  grid.innerHTML = events.map(e=>{
    const act=(e.stages||[]).filter(s=>s.active);
    const min=act.length?Math.min(...act.map(s=>s.price)):0;
    const first=act[0]||(e.stages||[])[0];
    const ts=(e.stages||[]).reduce((s,st)=>s+(st.sold||0),0);
    const tq=(e.stages||[]).reduce((s,st)=>s+(st.quantity||0),0);
    const pct=tq?Math.round(ts/tq*100):0;
    return `<div class="event-card" onclick="openEvent(${e.id})">
      <div class="event-img">${e.emoji||'🎪'}</div>
      <div class="event-body">
        <span class="stage-badge ${getStageBadge(first?.name)}">${first?.name||'General'}</span>
        <h3>${e.title}</h3>
        <div class="event-meta">📅 ${formatDate(e.date)} · ⏰ ${e.time}<br>📍 ${e.venue}, ${e.city}</div>
        <div class="event-price"><span class="from-label">desde</span>$${min.toLocaleString('es-AR')}</div>
        <div class="progress-wrap">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-label">${pct}% vendido · ${tq-ts} disponibles</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterEvents(q) {
  renderEvents(q ? state.events.filter(e=>(e.title+e.venue+e.city+e.description).toLowerCase().includes(q.toLowerCase())) : state.events);
}

function getStageBadge(name='') {
  const n=name.toLowerCase();
  if(n.includes('early')||n.includes('eb')) return 'badge-eb';
  if(n.includes('preventa')||n.includes('pre')) return 'badge-preventa';
  if(n.includes('vip')) return 'badge-vip';
  return 'badge-general';
}

// ══════════════════════════════════════════
// EVENT DETAIL
// ══════════════════════════════════════════
async function openEvent(id) {
  state.cart={};
  try { state.currentEvent=await API.getEvent(id); }
  catch(e){ state.currentEvent=[...state.events,...DEMO_EVENTS].find(ev=>ev.id===id); }
  if(!state.currentEvent) return;
  renderEventDetail();
  showPage('event');
}

function renderEventDetail() {
  const e=state.currentEvent;
  document.getElementById('event-detail-main').innerHTML=`
    <div class="event-emoji">${e.emoji||'🎪'}</div>
    <h1>${e.title}</h1>
    <div class="event-detail-meta">📅 ${formatDate(e.date)} · ⏰ ${e.time}<br>📍 ${e.venue}, ${e.city}</div>
    <p class="event-desc">${e.description||''}</p>`;
  document.getElementById('stages-list').innerHTML=(e.stages||[]).map(s=>{
    const avail=(s.quantity||0)-(s.sold||0);
    const pct=s.quantity?Math.round(s.sold/s.quantity*100):0;
    const soldOut=avail<=0||!s.active;
    return `<div class="stage-item ${soldOut?'sold-out':''}" id="si-${s.id}">
      <div class="stage-item-top">
        <div>
          <div class="stage-name">${s.name} ${soldOut?`<span style="color:var(--red);font-size:.75rem">${avail<=0?'AGOTADA':'INACTIVA'}</span>`:''}</div>
          <div class="stage-avail">${avail} disponibles</div>
          <div class="progress-bar-bg" style="width:100px;margin-top:4px">
            <div class="progress-bar-fill" style="width:${pct}%;background:var(--${pct>80?'red':'blue'})"></div>
          </div>
        </div>
        <div class="stage-price">$${(s.price||0).toLocaleString('es-AR')}</div>
      </div>
      ${!soldOut?`<div class="qty-control">
        <button class="qty-btn" onclick="changeQty(${s.id},${s.price},'${s.name}',-1,${avail})">−</button>
        <span class="qty-val" id="qv-${s.id}">0</span>
        <button class="qty-btn" onclick="changeQty(${s.id},${s.price},'${s.name}',1,${avail})">+</button>
      </div>`:`<div style="font-size:.8rem;color:var(--gray-400);margin-top:.4rem">No disponible</div>`}
    </div>`;
  }).join('');
  updateSelectionSummary();
}

function changeQty(stageId,price,name,delta,avail) {
  if(!state.cart[stageId]) state.cart[stageId]={qty:0,price,name,stageId};
  const item=state.cart[stageId];
  item.qty=Math.max(0,Math.min(item.qty+delta,Math.min(avail,10)));
  const el=document.getElementById('qv-'+stageId); if(el) el.textContent=item.qty;
  document.getElementById('si-'+stageId)?.classList.toggle('selected',item.qty>0);
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const items=Object.values(state.cart).filter(i=>i.qty>0);
  const total=items.reduce((s,i)=>s+i.qty*i.price,0);
  const sumEl=document.getElementById('selection-summary');
  const btn=document.getElementById('btn-checkout');
  if(items.length&&total>0) {
    sumEl.classList.remove('hidden');
    sumEl.innerHTML=`<div class="selection-summary">
      ${items.map(i=>`<div class="sel-line"><span>${i.qty}× ${i.name}</span><span>$${(i.qty*i.price).toLocaleString('es-AR')}</span></div>`).join('')}
      <div class="sel-total"><span>Total</span><span>$${total.toLocaleString('es-AR')}</span></div>
    </div>`;
    btn.disabled=false;
  } else { sumEl.classList.add('hidden'); btn.disabled=true; }
}

// ══════════════════════════════════════════
// CHECKOUT
// ══════════════════════════════════════════
function goToCheckout() {
  const items=Object.values(state.cart).filter(i=>i.qty>0);
  const total=items.reduce((s,i)=>s+i.qty*i.price,0);
  const e=state.currentEvent;
  document.getElementById('summary-event-name').textContent=`${e.emoji} ${e.title}`;
  document.getElementById('summary-lines').innerHTML=items.map(i=>
    `<div class="summary-line"><span>${i.qty}× ${i.name}</span><span>$${(i.qty*i.price).toLocaleString('es-AR')}</span></div>`).join('');
  document.getElementById('summary-total-val').textContent='$'+total.toLocaleString('es-AR');
  showPage('checkout'); selectPay('mp'); generateMPQR(total);
}

let _selectedPay='mp';
function selectPay(m) {
  _selectedPay=m;
  ['mp','card','transfer'].forEach(x=>{
    document.getElementById('pm-'+x)?.classList.toggle('selected',x===m);
    document.getElementById('pd-'+x)?.classList.toggle('hidden',x!==m);
  });
}

function generateMPQR(total) {
  const el=document.getElementById('mp-qr-canvas'); if(!el) return; el.innerHTML='';
  try { new QRCode(el,{text:`TICKETAR|MP|${total}|${Date.now()}`,width:180,height:180,correctLevel:QRCode.CorrectLevel.H}); }catch(e){}
}

function fmtCard(el) {
  const v=el.value.replace(/\D/g,'').substring(0,16);
  el.value=v.replace(/(.{4})/g,'$1 ').trim();
}

async function submitOrder() {
  const nombre=document.getElementById('c-nombre').value.trim();
  const apellido=document.getElementById('c-apellido').value.trim();
  const email=document.getElementById('c-email').value.trim();
  const tel=document.getElementById('c-tel').value.trim();
  if(!nombre||!apellido||!email){alert('Completá nombre, apellido y email');return;}
  if(!email.match(/^[^@]+@[^@]+\.[^@]+$/)){alert('Email inválido');return;}
  const items=Object.values(state.cart).filter(i=>i.qty>0);
  if(!items.length) return;
  const btn=document.getElementById('btn-pay'); btn.disabled=true; btn.textContent='Procesando...';
  try {
    let order;
    try {
      order=await API.createOrder({event_id:state.currentEvent.id,buyer_name:nombre,buyer_lastname:apellido,
        buyer_email:email,buyer_phone:tel||null,payment_method:_selectedPay,
        items:items.map(i=>({stage_id:i.stageId,qty:i.qty}))});
    } catch(e) {
      const orderId='ORD-'+Math.random().toString(36).substring(2,10).toUpperCase();
      const tickets=[];
      items.forEach(item=>{ for(let i=0;i<item.qty;i++) tickets.push({code:'TK-'+Math.random().toString(36).substring(2,8).toUpperCase(),stage:item.name,price:item.price,buyer_name:nombre,buyer_lastname:apellido,event_title:state.currentEvent.title,event_date:state.currentEvent.date,event_venue:state.currentEvent.venue,qr_data:null}); });
      order={order_id:orderId,total:items.reduce((s,i)=>s+i.qty*i.price,0),tickets};
    }
    renderSuccessTickets(order,{nombre,apellido,email});
    showPage('success');
    document.getElementById('success-subtitle').textContent=`Orden ${order.order_id||order.id} · Entradas enviadas a ${email}`;
  } catch(e){alert('Error: '+e.message);}
  finally{btn.disabled=false;btn.textContent='Confirmar y pagar';}
}

function renderSuccessTickets(order,buyer) {
  const container=document.getElementById('generated-tickets');
  const tickets=order.tickets||[];
  container.innerHTML=tickets.map((t,idx)=>`
    <div class="ticket-card" id="tcard-${idx}">
      <div class="ticket-card-top">
        <div class="t-event">${t.event_title||state.currentEvent?.title}</div>
        <div class="t-meta">📅 ${formatDate(t.event_date||state.currentEvent?.date)} · 📍 ${t.event_venue||state.currentEvent?.venue}</div>
        <span class="t-stage">${t.stage||t.stage_name}</span>
      </div>
      <div class="ticket-separator"><div class="ticket-hole"></div><div class="ticket-dashes"></div><div class="ticket-hole"></div></div>
      <div class="ticket-card-bottom">
        <div class="ticket-details">
          <div class="t-field"><span class="lbl">Titular</span><span class="val">${t.buyer_name||buyer.nombre} ${t.buyer_lastname||buyer.apellido}</span></div>
          <div class="t-field"><span class="lbl">Código</span><span class="val t-code">${t.code}</span></div>
          <div class="t-field"><span class="lbl">Tipo</span><span class="val">${t.stage||t.stage_name}</span></div>
          <div class="t-field"><span class="lbl">Precio</span><span class="val">$${(t.price||0).toLocaleString('es-AR')}</span></div>
        </div>
        <div class="ticket-qr" id="tqr-${idx}">
          ${t.qr_data?`<img src="${t.qr_data}" alt="QR" style="width:100px;height:100px;border-radius:8px">`:''}
        </div>
      </div>
    </div>`).join('');
  tickets.forEach((t,idx)=>{
    if(!t.qr_data){const el=document.getElementById('tqr-'+idx);
      if(el&&typeof QRCode!=='undefined') setTimeout(()=>{try{new QRCode(el,{text:JSON.stringify({code:t.code,buyer:`${t.buyer_name||buyer.nombre} ${t.buyer_lastname||buyer.apellido}`,event:t.event_title,stage:t.stage}),width:100,height:100,correctLevel:QRCode.CorrectLevel.H});}catch(e){}},idx*100);}
  });
}

function printTickets() { window.print(); }

// ══════════════════════════════════════════
// ADMIN AUTH
// ══════════════════════════════════════════
function goToAdmin() {
  if(state.currentAdmin){showPage('admin');adminSection(state.adminSection||'dashboard');}
  else showPage('admin-login');
}

async function doLogin() {
  const u=document.getElementById('login-u').value;
  const p=document.getElementById('login-p').value;
  const errEl=document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const res=await API.login(u,p); API.setToken(res.token); state.currentAdmin=res.user;
    buildAdminUI(); showPage('admin'); adminSection('dashboard');
  } catch(e) {
    const found=DEMO_USERS.find(x=>x.username===u&&x.password===p&&x.active);
    if(found){
      state.currentAdmin={id:found.id,username:found.username,name:found.name,role:found.role,email:found.email};
      API.setToken('DEMO_TOKEN'); buildAdminUI(); showPage('admin'); adminSection('dashboard');
    } else { errEl.textContent='Usuario o contraseña incorrectos'; errEl.classList.remove('hidden'); }
  }
}

function doLogout() {
  state.currentAdmin=null; API.setToken(null);
  document.getElementById('admin-user-pill').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  document.getElementById('admin-nav-link').style.display='';
  showPage('home');
}

// ── BUILD SIDEBAR CON PERMISOS ──
function buildAdminUI() {
  const u=state.currentAdmin;
  document.getElementById('admin-user-pill').textContent=u.name;
  document.getElementById('admin-user-pill').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
  document.getElementById('admin-nav-link').style.display='none';
  const roleBadge={superadmin:'🔐 Superadmin',admin:'⚙️ Admin',vendedor:'🏷️ Vendedor'};
  document.getElementById('sidebar-user').innerHTML=`<strong>${u.name}</strong><br><span style="font-size:.72rem;opacity:.7">${roleBadge[u.role]||u.role}</span>`;

  const perms=PERMISOS[u.role]||[];
  let html='', currentSection='';
  MENU_ITEMS.forEach(item=>{
    if(!perms.includes(item.id)) return;
    if(item.section!==currentSection){html+=`<div class="sidebar-section-label">${item.section}</div>`;currentSection=item.section;}
    html+=`<a class="sidebar-item" id="si-${item.id}" onclick="adminSection('${item.id}')"><span class="si-icon">${item.icon}</span> ${item.label}</a>`;
  });
  document.getElementById('sidebar-nav').innerHTML=html;
}

function adminSection(s) {
  if(!can(s)){s=(PERMISOS[state.currentAdmin?.role]||[])[0]||'orders';}
  state.adminSection=s;
  document.querySelectorAll('.sidebar-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('si-'+s)?.classList.add('active');
  const main=document.getElementById('admin-main');
  ({dashboard:renderDashboard,events:renderAdminEvents,orders:renderAdminOrders,scanner:renderScanner,users:renderAdminUsers,payments:renderPaymentsConfig,roles:renderRolesPanel})[s]?.(main);
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function renderDashboard(c) {
  c.innerHTML=`<div class="admin-page-title">Dashboard</div><div class="stats-grid"><div class="stat-card"><div class="stat-label">Cargando...</div><div class="stat-value">–</div></div></div>`;
  try {
    const data=await API.getPaymentDashboard(); const s=data.stats;
    c.innerHTML=`<div class="admin-page-title">Dashboard</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Ingresos Totales</div><div class="stat-value">$${(s.total_revenue||0).toLocaleString('es-AR')}</div><div class="stat-sub">Pagos confirmados</div></div>
        <div class="stat-card red"><div class="stat-label">Hoy</div><div class="stat-value">$${(s.today_revenue||0).toLocaleString('es-AR')}</div></div>
        <div class="stat-card green"><div class="stat-label">Entradas Vendidas</div><div class="stat-value">${s.total_tickets||0}</div></div>
        <div class="stat-card gray"><div class="stat-label">Pendientes</div><div class="stat-value">${s.pending_orders||0}</div></div>
      </div>${buildOrdersTable(data.recentOrders||[])}`;
  } catch(e) {
    const rev=DEMO_ORDERS.filter(o=>o.payment_status==='paid').reduce((s,o)=>s+o.total,0);
    c.innerHTML=`<div class="admin-page-title">Dashboard</div>
      <div class="alert alert-info" style="margin-bottom:1rem">Modo demo — levantá el backend para datos reales</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Ingresos</div><div class="stat-value">$${rev.toLocaleString('es-AR')}</div></div>
        <div class="stat-card red"><div class="stat-label">Eventos</div><div class="stat-value">${DEMO_EVENTS.length}</div></div>
        <div class="stat-card green"><div class="stat-label">Pagadas</div><div class="stat-value">${DEMO_ORDERS.filter(o=>o.payment_status==='paid').length}</div></div>
        <div class="stat-card gray"><div class="stat-label">Pendientes</div><div class="stat-value">${DEMO_ORDERS.filter(o=>o.payment_status==='pending').length}</div></div>
      </div>${buildOrdersTable(DEMO_ORDERS)}`;
  }
}

function buildOrdersTable(orders) {
  return `<div class="table-card"><div class="table-toolbar"><h3>Últimas órdenes</h3></div>
    <div style="overflow-x:auto"><table class="tbl">
    <thead><tr><th>Orden</th><th>Comprador</th><th>Evento</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
    <tbody>${(orders||[]).map(o=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:.78rem">${o.id}</td>
      <td>${o.buyer_name} ${o.buyer_lastname||''}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.event_title||''}</td>
      <td><strong>$${(o.total||0).toLocaleString('es-AR')}</strong></td>
      <td><span class="badge badge-${o.payment_status}">${{paid:'Pagado',pending:'Pendiente',failed:'Fallido'}[o.payment_status]||o.payment_status}</span></td>
      <td style="font-size:.78rem;color:var(--gray-600)">${(o.created_at||'').split('T')[0]}</td>
    </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin órdenes</td></tr>'}
    </tbody></table></div></div>`;
}

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════
async function renderAdminEvents(c) {
  let events=[];
  try{events=await API.getAllEvents();}catch(e){events=DEMO_EVENTS;}
  const canEdit=can('events');
  c.innerHTML=`<div class="admin-header-row">
    <div class="admin-page-title" style="margin:0">Gestión de Eventos</div>
    ${canEdit?`<button class="btn btn-primary" onclick="showCreateEventModal()">+ Nuevo Evento</button>`:''}
  </div>
  <div class="table-card"><div style="overflow-x:auto"><table class="tbl">
    <thead><tr><th>Evento</th><th>Fecha</th><th>Etapas</th><th>Vendido</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>${events.map(e=>{
      const ts=(e.stages||[]).reduce((s,st)=>s+(st.sold||0),0);
      const tq=(e.stages||[]).reduce((s,st)=>s+(st.quantity||0),0);
      const pct=tq?Math.round(ts/tq*100):0;
      return `<tr>
        <td><strong>${e.emoji||'🎪'} ${e.title}</strong><br><span style="font-size:.78rem;color:var(--gray-400)">${e.venue}</span></td>
        <td>${formatDate(e.date)}</td>
        <td>${(e.stages||[]).map(s=>`<span class="badge ${s.active?'badge-active':'badge-inactive'}" style="margin:.1rem">${s.name}</span>`).join('')}</td>
        <td><span style="font-size:.85rem;font-weight:600">${ts}/${tq}</span>
          <div class="progress-bar-bg" style="width:80px;margin-top:4px"><div class="progress-bar-fill" style="width:${pct}%"></div></div></td>
        <td><span class="badge ${e.active?'badge-active':'badge-inactive'}">${e.active?'Activo':'Inactivo'}</span></td>
        <td><div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="showStagesModal(${e.id})">Etapas</button>
          ${canEdit?`<button class="btn btn-danger btn-sm" onclick="deactivateEvent(${e.id})">Desactivar</button>`:''}
        </div></td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin eventos</td></tr>'}
    </tbody></table></div></div>`;
}

function showCreateEventModal() {
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Nuevo Evento</div>
    <div class="form-group"><label>Título *</label><input id="ne-title" type="text" placeholder="Nombre del evento"></div>
    <div class="form-row">
      <div class="form-group"><label>Fecha *</label><input id="ne-date" type="date"></div>
      <div class="form-group"><label>Hora *</label><input id="ne-time" type="time" value="20:00"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Lugar *</label><input id="ne-venue" placeholder="Teatro, estadio..."></div>
      <div class="form-group"><label>Ciudad *</label><input id="ne-city" placeholder="Buenos Aires"></div>
    </div>
    <div class="form-group"><label>Descripción</label><textarea id="ne-desc" placeholder="Descripción..."></textarea></div>
    <div class="form-group"><label>Emoji</label><input id="ne-emoji" type="text" placeholder="🎵" style="width:70px"></div>
    <hr style="margin:1rem 0;border-color:var(--gray-200)">
    <h3 style="color:var(--blue);font-size:1rem;margin-bottom:.8rem">Primera etapa de venta</h3>
    <div class="form-row">
      <div class="form-group"><label>Nombre *</label><input id="ne-sname" value="Early Bird"></div>
      <div class="form-group"><label>Precio *</label><input id="ne-sprice" type="number" placeholder="5000"></div>
    </div>
    <div class="form-group"><label>Cantidad disponible *</label><input id="ne-sqty" type="number" placeholder="100"></div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="createEvent()">Crear Evento</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

async function createEvent() {
  const title=document.getElementById('ne-title').value.trim();
  const date=document.getElementById('ne-date').value;
  const venue=document.getElementById('ne-venue').value.trim();
  const city=document.getElementById('ne-city').value.trim();
  const sName=document.getElementById('ne-sname').value.trim();
  const sPrice=parseFloat(document.getElementById('ne-sprice').value);
  const sQty=parseInt(document.getElementById('ne-sqty').value);
  if(!title||!date||!venue||!city||!sName||!sPrice||!sQty) return alert('Completá todos los campos (*)');
  try{await API.createEvent({title,date,time:document.getElementById('ne-time').value,venue,city,emoji:document.getElementById('ne-emoji').value||'🎪',description:document.getElementById('ne-desc').value,stages:[{name:sName,price:sPrice,quantity:sQty}]});}
  catch(e){DEMO_EVENTS.push({id:DEMO_EVENTS.length+100,title,date,time:document.getElementById('ne-time').value,venue,city,emoji:document.getElementById('ne-emoji').value||'🎪',description:document.getElementById('ne-desc').value,active:1,stages:[{id:Date.now(),name:sName,price:sPrice,quantity:sQty,sold:0,active:1}]});state.events=DEMO_EVENTS;renderEvents(state.events);}
  closeModal(); renderAdminEvents(document.getElementById('admin-main')); alert('Evento creado');
}

async function showStagesModal(evId) {
  let events=[]; try{events=await API.getAllEvents();}catch(e){events=DEMO_EVENTS;}
  const ev=events.find(e=>e.id===evId); if(!ev) return;
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">${ev.emoji} ${ev.title} — Etapas</div>
    <div style="overflow-x:auto;margin-bottom:1.5rem"><table class="tbl">
      <thead><tr><th>Etapa</th><th>Precio</th><th>Total</th><th>Vendido</th><th>Disponible</th><th>Estado</th><th></th></tr></thead>
      <tbody>${(ev.stages||[]).map(s=>`<tr>
        <td><strong>${s.name}</strong></td><td>$${(s.price||0).toLocaleString('es-AR')}</td>
        <td>${s.quantity}</td><td>${s.sold||0}</td><td>${(s.quantity||0)-(s.sold||0)}</td>
        <td><span class="badge ${s.active?'badge-active':'badge-inactive'}">${s.active?'Activa':'Inactiva'}</span></td>
        <td><button class="btn btn-sm ${s.active?'btn-danger':'btn-success'}" onclick="toggleStage(${evId},${s.id},${s.active?0:1})">${s.active?'Desactivar':'Activar'}</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <hr style="border-color:var(--gray-200);margin-bottom:1rem">
    <h3 style="font-size:1rem;color:var(--blue);margin-bottom:.8rem">Agregar etapa</h3>
    <div class="form-row">
      <div class="form-group"><label>Nombre</label><input id="ns-name" placeholder="General"></div>
      <div class="form-group"><label>Precio</label><input id="ns-price" type="number" placeholder="8000"></div>
    </div>
    <div class="form-group"><label>Cantidad</label><input id="ns-qty" type="number" placeholder="200"></div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="addStageToEvent(${evId})">Agregar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
    </div>`;
  openModal();
}

async function toggleStage(evId,stId,newActive) {
  try{await API.updateStage(evId,stId,{active:newActive});}catch(e){const ev=DEMO_EVENTS.find(e=>e.id===evId);const st=ev?.stages.find(s=>s.id===stId);if(st) st.active=newActive;}
  showStagesModal(evId);
}
async function addStageToEvent(evId) {
  const name=document.getElementById('ns-name').value.trim();
  const price=parseFloat(document.getElementById('ns-price').value);
  const qty=parseInt(document.getElementById('ns-qty').value);
  if(!name||!price||!qty) return alert('Completá todos los campos');
  try{await API.addStage(evId,{name,price,quantity:qty});}catch(e){const ev=DEMO_EVENTS.find(e=>e.id===evId);if(ev) ev.stages.push({id:Date.now(),name,price,quantity:qty,sold:0,active:1});}
  showStagesModal(evId);
}
async function deactivateEvent(id) {
  if(!confirm('¿Desactivar este evento?')) return;
  try{await API.deleteEvent(id);}catch(e){const ev=DEMO_EVENTS.find(e=>e.id===id);if(ev) ev.active=0;}
  renderAdminEvents(document.getElementById('admin-main'));
}

// ══════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════
async function renderAdminOrders(c) {
  c.innerHTML=`<div class="admin-page-title">Órdenes de Compra</div>
    <div class="table-card">
      <div class="table-toolbar"><h3>Todas las órdenes</h3>
        <input class="search-input" placeholder="Buscar..." style="width:220px" oninput="filterOrders(this.value)">
      </div>
      <div id="orders-wrap" style="overflow-x:auto"><div style="padding:2rem;text-align:center;color:var(--gray-400)">Cargando...</div></div>
    </div>`;
  let orders=[];
  try{const r=await API.getOrders({limit:200});orders=r.orders||[];}catch(e){orders=DEMO_ORDERS;}
  window._orders=orders; paintOrders(orders);
}

function paintOrders(orders) {
  const cc=can('orders');
  document.getElementById('orders-wrap').innerHTML=`
    <table class="tbl" id="orders-tbl">
      <thead><tr><th>Orden</th><th>Comprador</th><th>Email</th><th>Evento</th><th>Total</th><th>Método</th><th>Estado</th><th>Fecha</th>${cc?'<th></th>':''}</tr></thead>
      <tbody>${orders.map(o=>`<tr data-s="${(o.id+o.buyer_name+(o.buyer_lastname||'')+(o.buyer_email||'')+(o.event_title||'')).toLowerCase()}">
        <td style="font-family:'DM Mono',monospace;font-size:.78rem">${o.id}</td>
        <td>${o.buyer_name} ${o.buyer_lastname||''}</td>
        <td style="font-size:.78rem">${o.buyer_email||''}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem">${o.event_title||''}</td>
        <td><strong>$${(o.total||0).toLocaleString('es-AR')}</strong></td>
        <td style="font-size:.8rem">${{mp:'MP QR',card:'Tarjeta',transfer:'Transf.'}[o.payment_method]||'—'}</td>
        <td><span class="badge badge-${o.payment_status}">${{paid:'Pagado',pending:'Pendiente',failed:'Fallido'}[o.payment_status]||o.payment_status}</span></td>
        <td style="font-size:.78rem;color:var(--gray-600)">${(o.created_at||'').split('T')[0]}</td>
        ${cc?`<td>${o.payment_status==='pending'?`<button class="btn btn-success btn-sm" onclick="confirmPago('${o.id}')">✓ Confirmar</button>`:''}</td>`:''}
      </tr>`).join('')||`<tr><td colspan="${cc?9:8}" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin órdenes</td></tr>`}
      </tbody></table>`;
}

function filterOrders(q) {
  document.querySelectorAll('#orders-tbl tbody tr[data-s]').forEach(tr=>{tr.style.display=tr.dataset.s.includes(q.toLowerCase())?'':'none';});
}
async function confirmPago(id) {
  if(!confirm(`¿Confirmar pago de la orden ${id}?`)) return;
  try{await API.confirmOrder(id);}catch(e){}
  const o=(window._orders||[]).find(x=>x.id===id); if(o) o.payment_status='paid';
  paintOrders(window._orders||[]);
}

// ══════════════════════════════════════════
// SCANNER
// ══════════════════════════════════════════
function renderScanner(c) {
  const used=new Set();
  c.innerHTML=`<div class="admin-page-title">Validar Entradas — Control de Acceso</div>
    <div class="scanner-card">
      <h2>Escaneo de QR</h2>
      <p>Ingresá el código manualmente o conectá un lector QR USB</p>
      <input class="scanner-input" id="scan-input" type="text" placeholder="TK-XXXXXX"
             maxlength="20" oninput="this.value=this.value.toUpperCase()"
             onkeydown="if(event.key==='Enter') doValidate()">
      <button class="btn btn-primary btn-block" onclick="doValidate()" style="margin-top:.5rem">✓ Validar</button>
      <div id="scan-result"></div>
      <div class="scanner-hint"><p>Tip: lector USB envía Enter automáticamente</p></div>
    </div>`;
  window.doValidate=async function(){
    const code=document.getElementById('scan-input').value.trim(); if(!code) return;
    const res=document.getElementById('scan-result');
    try{
      const data=await API.validateTicket(code);
      if(data.valid) res.innerHTML=`<div class="scan-result scan-ok">✅ VÁLIDA<div class="scan-detail"><strong>${data.ticket.buyer}</strong><br>${data.ticket.event} · ${data.ticket.stage}</div></div>`;
      else if(data.already_used) res.innerHTML=`<div class="scan-result scan-used">⚠️ YA UTILIZADA<div class="scan-detail">${data.ticket?.buyer||''}</div></div>`;
      else res.innerHTML=`<div class="scan-result scan-err">❌ ${data.reason||'Inválida'}</div>`;
    }catch(e){
      if(used.has(code)) res.innerHTML=`<div class="scan-result scan-used">⚠️ YA UTILIZADA en esta sesión</div>`;
      else if(code.startsWith('TK-')){used.add(code);res.innerHTML=`<div class="scan-result scan-ok">✅ VÁLIDA (Demo)<div class="scan-detail">Código: <strong>${code}</strong></div></div>`;}
      else res.innerHTML=`<div class="scan-result scan-err">❌ Código no encontrado</div>`;
    }
    document.getElementById('scan-input').value=''; document.getElementById('scan-input').focus();
  };
}

// ══════════════════════════════════════════
// USERS
// ══════════════════════════════════════════
async function renderAdminUsers(c) {
  const isSA=state.currentAdmin?.role==='superadmin';
  const isA=state.currentAdmin?.role==='admin';
  let users=[];
  try{users=await API.getUsers();}catch(e){users=DEMO_USERS.filter(u=>u.active);}
  const visible=isSA?users:users.filter(u=>u.role!=='superadmin');
  c.innerHTML=`<div class="admin-header-row">
    <div class="admin-page-title" style="margin:0">Gestión de Usuarios</div>
    ${(isSA||isA)?`<button class="btn btn-primary" onclick="showCreateUserModal()">+ Nuevo Usuario</button>`:''}
  </div>
  <div class="table-card"><div style="overflow-x:auto"><table class="tbl">
    <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>${visible.map(u=>`<tr>
      <td><strong>${u.username}</strong></td><td>${u.name}</td>
      <td style="font-size:.82rem">${u.email||'–'}</td>
      <td><span class="badge badge-${u.role}">${{superadmin:'🔐 Superadmin',admin:'⚙️ Admin',vendedor:'🏷️ Vendedor'}[u.role]||u.role}</span></td>
      <td><span class="badge ${u.active?'badge-active':'badge-inactive'}">${u.active?'Activo':'Inactivo'}</span></td>
      <td><div style="display:flex;gap:.4rem">
        ${isSA?`<button class="btn btn-secondary btn-sm" onclick="showEditUserModal(${u.id})">Editar</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})"
          ${u.id===state.currentAdmin?.id?'disabled title="No podés eliminarte"':''}>Eliminar</button>
      </div></td>
    </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin usuarios</td></tr>'}
    </tbody></table></div></div>`;
}

function showCreateUserModal() {
  const isSA=state.currentAdmin?.role==='superadmin';
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Nuevo Usuario</div>
    <div class="form-group"><label>Nombre completo *</label><input id="nu-name" placeholder="Juan García"></div>
    <div class="form-row">
      <div class="form-group"><label>Usuario *</label><input id="nu-user" placeholder="jgarcia"></div>
      <div class="form-group"><label>Contraseña *</label><input id="nu-pass" type="password" placeholder="••••••••"></div>
    </div>
    <div class="form-group"><label>Email</label><input id="nu-email" type="email" placeholder="juan@email.com"></div>
    <div class="form-group"><label>Rol *</label><select id="nu-role">
      <option value="vendedor">🏷️ Vendedor — Solo órdenes y QR</option>
      <option value="admin">⚙️ Admin — Eventos, órdenes, usuarios</option>
      ${isSA?'<option value="superadmin">🔐 Superadmin — Acceso total</option>':''}
    </select></div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="createUser()">Crear</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

function showEditUserModal(id) {
  const u=DEMO_USERS.find(x=>x.id===id)||{};
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Editar: ${u.username}</div>
    <div class="form-group"><label>Nombre</label><input id="eu-name" value="${u.name||''}"></div>
    <div class="form-group"><label>Email</label><input id="eu-email" type="email" value="${u.email||''}"></div>
    <div class="form-group"><label>Nueva contraseña <small style="color:var(--gray-400)">(vacío = no cambia)</small></label><input id="eu-pass" type="password"></div>
    <div class="form-group"><label>Rol</label><select id="eu-role">
      <option value="vendedor" ${u.role==='vendedor'?'selected':''}>🏷️ Vendedor</option>
      <option value="admin" ${u.role==='admin'?'selected':''}>⚙️ Admin</option>
      <option value="superadmin" ${u.role==='superadmin'?'selected':''}>🔐 Superadmin</option>
    </select></div>
    <div class="form-group"><label>Estado</label><select id="eu-active">
      <option value="1" ${u.active?'selected':''}>Activo</option>
      <option value="0" ${!u.active?'selected':''}>Inactivo</option>
    </select></div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="updateUser(${id})">Guardar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

async function updateUser(id) {
  const name=document.getElementById('eu-name').value.trim();
  const email=document.getElementById('eu-email').value.trim();
  const pass=document.getElementById('eu-pass').value;
  const role=document.getElementById('eu-role').value;
  const active=parseInt(document.getElementById('eu-active').value);
  try{await API.updateUser(id,{name,email,role,active,...(pass?{password:pass}:{})});}
  catch(e){const u=DEMO_USERS.find(x=>x.id===id);if(u){u.name=name;u.email=email;u.role=role;u.active=active;if(pass)u.password=pass;}}
  closeModal(); renderAdminUsers(document.getElementById('admin-main'));
}

async function createUser() {
  const name=document.getElementById('nu-name').value.trim();
  const username=document.getElementById('nu-user').value.trim();
  const password=document.getElementById('nu-pass').value;
  const email=document.getElementById('nu-email').value.trim();
  const role=document.getElementById('nu-role').value;
  if(!name||!username||!password) return alert('Nombre, usuario y contraseña son obligatorios');
  try{await API.createUser({name,username,password,email,role});}
  catch(e){if(DEMO_USERS.find(u=>u.username===username)) return alert('Ese usuario ya existe');DEMO_USERS.push({id:DEMO_USERS.length+1,username,password,name,email,role,active:1});}
  closeModal(); renderAdminUsers(document.getElementById('admin-main')); alert('Usuario creado');
}

async function deleteUser(id) {
  if(id===state.currentAdmin?.id) return alert('No podés eliminarte a vos mismo');
  if(!confirm('¿Eliminar este usuario?')) return;
  try{await API.deleteUser(id);}catch(e){const u=DEMO_USERS.find(x=>x.id===id);if(u) u.active=0;}
  renderAdminUsers(document.getElementById('admin-main'));
}

// ══════════════════════════════════════════
// ROLES PANEL
// ══════════════════════════════════════════
function renderRolesPanel(c) {
  const rolesInfo=[
    {role:'superadmin',icon:'🔐',label:'Superadmin',color:'var(--blue)',
     desc:'Acceso total. Puede asignar y modificar roles de cualquier usuario.',
     perms:['Dashboard y estadísticas','Gestión de eventos y etapas de precios','Ver y confirmar todas las órdenes','Validar entradas en la puerta (QR)','Crear/editar/desactivar usuarios','Configurar Mercado Pago','Gestionar roles y permisos']},
    {role:'admin',icon:'⚙️',label:'Admin',color:'var(--blue-light)',
     desc:'Administrador operativo. Gestiona eventos y usuarios vendedores.',
     perms:['Dashboard y estadísticas','Gestión de eventos y etapas de precios','Ver y confirmar todas las órdenes','Validar entradas en la puerta (QR)','Crear/editar usuarios vendedores']},
    {role:'vendedor',icon:'🏷️',label:'Vendedor',color:'var(--gray-600)',
     desc:'Operador de venta. Acceso mínimo para el día del evento.',
     perms:['Ver órdenes de compra','Validar entradas en la puerta (QR)']}
  ];
  c.innerHTML=`<div class="admin-page-title">Permisos y Roles</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;margin-bottom:2rem">
      ${rolesInfo.map(r=>`<div style="background:var(--white);border-radius:var(--radius-lg);box-shadow:var(--shadow);overflow:hidden;border-top:4px solid ${r.color}">
        <div style="padding:1.5rem">
          <div style="font-size:2rem;margin-bottom:.5rem">${r.icon}</div>
          <h3 style="font-size:1.05rem;color:var(--blue);margin-bottom:.4rem">${r.label}</h3>
          <p style="font-size:.82rem;color:var(--gray-600);margin-bottom:1rem">${r.desc}</p>
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);margin-bottom:.4rem">Puede hacer:</div>
          <ul style="list-style:none;padding:0">${r.perms.map(p=>`<li style="font-size:.8rem;color:var(--gray-800);padding:.2rem 0;display:flex;align-items:flex-start;gap:.4rem"><span style="color:var(--success);margin-top:.1rem">✓</span>${p}</li>`).join('')}</ul>
        </div>
      </div>`).join('')}
    </div>
    <div class="table-card">
      <div class="table-toolbar"><h3>Asignar rol a usuario</h3></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol actual</th><th>Nuevo rol</th><th></th></tr></thead>
        <tbody>${DEMO_USERS.filter(u=>u.active).map(u=>`<tr>
          <td><strong>${u.username}</strong></td><td>${u.name}</td>
          <td><span class="badge badge-${u.role}">${{superadmin:'🔐 Superadmin',admin:'⚙️ Admin',vendedor:'🏷️ Vendedor'}[u.role]||u.role}</span></td>
          <td><select id="rs-${u.id}" style="padding:6px 10px;border:1.5px solid var(--gray-200);border-radius:7px;font-size:.85rem;font-family:'Figtree',sans-serif">
            <option value="vendedor" ${u.role==='vendedor'?'selected':''}>🏷️ Vendedor</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>⚙️ Admin</option>
            <option value="superadmin" ${u.role==='superadmin'?'selected':''}>🔐 Superadmin</option>
          </select></td>
          <td><button class="btn btn-blue btn-sm" onclick="assignRole(${u.id})"
            ${u.id===state.currentAdmin?.id?'disabled title="No podés cambiarte a vos mismo"':''}>Asignar</button></td>
        </tr>`).join('')}
        </tbody></table></div>
    </div>`;
}

async function assignRole(userId) {
  const newRole=document.getElementById('rs-'+userId).value;
  const u=DEMO_USERS.find(x=>x.id===userId); if(!u) return;
  const rLabel={superadmin:'Superadmin',admin:'Admin',vendedor:'Vendedor'};
  if(!confirm(`¿Cambiar el rol de "${u.name}" a ${rLabel[newRole]}?`)) return;
  try{await API.updateUser(userId,{role:newRole});}catch(e){u.role=newRole;}
  renderRolesPanel(document.getElementById('admin-main'));
  alert(`✅ Rol actualizado: ${u.name} → ${rLabel[newRole]}`);
}

// ══════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════
function renderPaymentsConfig(c) {
  c.innerHTML=`<div class="admin-page-title">Configuración de Pagos</div>
    <div class="config-card">
      <h3>🔵 Mercado Pago</h3>
      <div class="info-box"><strong>Pasos para activar pagos reales:</strong>
        <ol><li>Creá tu app en <strong>mercadopago.com/developers</strong></li>
          <li>Copiá el <strong>Access Token</strong> de producción</li>
          <li>Pegalo en el archivo <code>.env</code> del servidor</li>
          <li>Configurá el webhook en el panel de MP</li>
          <li>Reiniciá el servidor</li></ol>
      </div>
      <div class="form-group"><label>URL del Webhook</label>
        <input type="text" value="${window.location.origin}/api/payments/mp/webhook" readonly
               style="background:var(--gray-100);color:var(--gray-600);font-family:'DM Mono',monospace;font-size:.82rem"></div>
    </div>
    <div class="config-card">
      <h3>💳 Métodos aceptados</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem">
        ${['Visa crédito','Mastercard','American Express','Naranja X','Cabal','Visa débito','Maestro','Cuenta MP','Mercado Crédito','Rapipago','Pago Fácil'].map(m=>`<div style="background:var(--blue-pale);border-radius:8px;padding:.5rem .8rem;font-size:.8rem;font-weight:600;color:var(--blue)">✓ ${m}</div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function openModal() { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal(ev) { if(!ev||ev.target.id==='modal-overlay') document.getElementById('modal-overlay').classList.add('hidden'); }

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
function formatDate(d) {
  if(!d) return '';
  const [y,m,day]=d.split('-');
  return `${parseInt(day)} ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(m)-1]} ${y}`;
}

// ══════════════════════════════════════════
// INIT — Solo home visible al cargar
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  loadEvents();
  const token=API.getToken();
  if(token&&token!=='DEMO_TOKEN'){API.me().then(user=>{if(user){state.currentAdmin=user;buildAdminUI();}}).catch(()=>API.setToken(null));}
});
