// js/app.js — TicketAR SPA Logic
'use strict';

// ══════════════════════════════════════════
// SISTEMA DE ROLES Y PERMISOS
// admin      → sin event_id = global (leonelbor); con event_id = gestiona SOLO ese evento
// vendedor   → siempre atado a un evento: solo sus órdenes y validar QR de ese evento
// ══════════════════════════════════════════
const PERMISOS = {
  admin:    ['dashboard','events','orders','scanner','users','payments'],
  vendedor: ['orders','scanner']
};

const MENU_ITEMS = [
  { id:'dashboard', label:'Dashboard',        icon:'📊', section:'Principal' },
  { id:'events',    label:'Eventos',           icon:'🎪', section:'Principal' },
  { id:'orders',    label:'Órdenes de compra', icon:'🎟️', section:'Principal' },
  { id:'scanner',   label:'Validar QR',        icon:'📷', section:'Operación' },
  { id:'users',     label:'Usuarios',          icon:'👥', section:'Configuración' },
  { id:'payments',  label:'Pagos / MP',        icon:'💳', section:'Configuración' },
];

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let state = {
  events: [],
  currentEvent: null,
  cart: {},
  currentAdmin: null,
  adminSection: 'dashboard',
  filters: { q: '', city: '', range: 'all' }
};


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
  catch(e) {
    console.error('Error cargando eventos:', e);
    state.events = [];
    document.getElementById('events-grid').innerHTML = '<div class="loading-events">No se pudieron cargar los eventos. Intentá recargar la página.</div>';
  }
  populateCityFilter(state.events);
  renderEvents(state.events);
  updateHeroStats();
}

function populateCityFilter(events) {
  const sel = document.getElementById('filter-city');
  if (!sel) return;
  const cities = [...new Set(events.map(e=>e.city).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las ciudades</option>' + cities.map(c=>`<option value="${c}">${c}</option>`).join('');
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
  if (!events.length) { grid.innerHTML='<div class="loading-events">No hay eventos que coincidan con tu búsqueda</div>'; return; }
  grid.innerHTML = events.map(e=>{
    const act=(e.stages||[]).filter(s=>s.active);
    const min=act.length?Math.min(...act.map(s=>s.price)):0;
    const first=act[0]||(e.stages||[])[0];
    const ts=(e.stages||[]).reduce((s,st)=>s+(st.sold||0),0);
    const tq=(e.stages||[]).reduce((s,st)=>s+(st.quantity||0),0);
    const pct=tq?Math.round(ts/tq*100):0;
    const avail=tq-ts;
    const soldOut = tq>0 && avail<=0;
    const lowStock = !soldOut && tq>0 && avail<=Math.max(10,tq*0.05);
    const img = e.image_url
      ? `<div class="event-img event-img-photo"><img src="${e.image_url}" alt="${e.title}" loading="lazy" decoding="async"></div>`
      : `<div class="event-img">${e.emoji||'🎪'}</div>`;
    return `<div class="event-card" onclick="openEvent(${e.id})">
      ${img}
      ${soldOut?'<span class="stock-flag stock-sold">Agotado</span>':lowStock?'<span class="stock-flag stock-low">Últimas entradas</span>':''}
      <div class="event-body">
        <span class="stage-badge ${getStageBadge(first?.name)}">${first?.name||'General'}</span>
        <h3>${e.title}</h3>
        <div class="event-meta">📅 ${formatDate(e.date)} · ⏰ ${e.time}<br>📍 ${e.venue}, ${e.city}</div>
        <div class="event-price"><span class="from-label">desde</span>$${min.toLocaleString('es-AR')}</div>
        <div class="progress-wrap">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-label">${pct}% vendido · ${avail} disponibles</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

let _filterDebounce;
function onFilterChange() {
  clearTimeout(_filterDebounce);
  _filterDebounce = setTimeout(applyFilters, 200);
}

function setDateFilter(range) {
  state.filters.range = range;
  document.querySelectorAll('.date-pill').forEach(p=>p.classList.toggle('active', p.dataset.range===range));
  applyFilters();
}

function inDateRange(dateStr, range) {
  if (range==='all' || !dateStr) return true;
  const d = new Date(dateStr+'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  if (range==='today') return d.getTime()===now.getTime();
  if (range==='weekend') {
    const day = now.getDay();
    const satOffset = (6-day+7)%7, sunOffset = (7-day)%7 || 7;
    const sat = new Date(now); sat.setDate(now.getDate()+satOffset);
    const sun = new Date(now); sun.setDate(now.getDate()+sunOffset);
    return d>=now && d>=sat && d<=sun;
  }
  if (range==='month') {
    const end = new Date(now); end.setDate(now.getDate()+30);
    return d>=now && d<=end;
  }
  return true;
}

function applyFilters() {
  const q = (document.getElementById('search-events')?.value||'').toLowerCase().trim();
  const city = document.getElementById('filter-city')?.value||'';
  state.filters.q = q; state.filters.city = city;
  const filtered = state.events.filter(e => {
    if (q && !(e.title+e.venue+e.city+(e.description||'')).toLowerCase().includes(q)) return false;
    if (city && e.city !== city) return false;
    if (!inDateRange(e.date, state.filters.range)) return false;
    return true;
  });
  renderEvents(filtered);
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
  catch(e){ console.error('Error cargando evento:', e); state.currentEvent=null; }
  if(!state.currentEvent) return alert('No se pudo cargar el evento');
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
  renderCongregacionField();
  showPage('checkout'); selectPay('mp');
}

// ══════════════════════════════════════════
// CAMPO "CONGREGACIÓN" — solo para eventos que lo requieren (ej. Congreso de Hombres)
// ══════════════════════════════════════════
let _congregaciones = null;
let _congregacionSelected = '';

function eventNeedsCongregacion(ev) {
  return !!ev?.title?.toLowerCase().includes('congreso de hombres');
}

async function renderCongregacionField() {
  const wrap = document.getElementById('c-congregacion-wrap');
  _congregacionSelected = '';
  if (!eventNeedsCongregacion(state.currentEvent)) { wrap.classList.add('hidden'); wrap.innerHTML=''; return; }

  if (!_congregaciones) {
    try {
      const res = await fetch('data/congregaciones.json');
      _congregaciones = await res.json();
    } catch(e) {
      console.error('Error cargando congregaciones:', e);
      _congregaciones = [];
    }
  }

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <label>Congregación *</label>
    <div class="combo-wrap">
      <input id="c-congregacion-input" type="text" autocomplete="off" placeholder="Buscá tu congregación...">
      <div id="c-congregacion-list" class="combo-list hidden"></div>
    </div>`;

  const input = document.getElementById('c-congregacion-input');
  const list = document.getElementById('c-congregacion-list');

  const renderList = (items) => {
    list.innerHTML = items.length
      ? items.map(c=>`<div class="combo-item" data-val="${c.replace(/"/g,'&quot;')}">${c}</div>`).join('')
      : '<div class="combo-empty">Sin resultados</div>';
    list.classList.remove('hidden');
  };

  input.addEventListener('focus', () => renderList(_congregaciones));
  input.addEventListener('input', () => {
    _congregacionSelected = '';
    const q = input.value.toLowerCase().trim();
    renderList(q ? _congregaciones.filter(c=>c.toLowerCase().includes(q)) : _congregaciones);
  });
  list.addEventListener('click', (ev) => {
    const item = ev.target.closest('.combo-item');
    if (!item) return;
    _congregacionSelected = item.dataset.val;
    input.value = _congregacionSelected;
    list.classList.add('hidden');
  });
}

// Un solo listener global (no uno por cada vez que se abre el checkout) para cerrar el combo al clickear afuera
document.addEventListener('click', (ev) => {
  const wrap = document.getElementById('c-congregacion-wrap');
  const list = document.getElementById('c-congregacion-list');
  if (wrap && list && !wrap.contains(ev.target)) list.classList.add('hidden');
});

let _selectedPay='mp';
function selectPay(m) {
  _selectedPay=m;
  ['mp','transfer'].forEach(x=>{
    document.getElementById('pm-'+x)?.classList.toggle('selected',x===m);
    document.getElementById('pd-'+x)?.classList.toggle('hidden',x!==m);
  });
}

// El pago con tarjeta NUNCA se procesa en este frontend: siempre se redirige
// al checkout de Mercado Pago, que valida la tarjeta y tokeniza los datos.
// Construir un formulario propio de número de tarjeta sería una violación de PCI-DSS.
async function submitOrder() {
  const nombre=document.getElementById('c-nombre').value.trim();
  const apellido=document.getElementById('c-apellido').value.trim();
  const email=document.getElementById('c-email').value.trim();
  const tel=document.getElementById('c-tel').value.trim();
  if(!nombre||!apellido||!email){alert('Completá nombre, apellido y email');return;}
  if(!email.match(/^[^@]+@[^@]+\.[^@]+$/)){alert('Email inválido');return;}
  if(eventNeedsCongregacion(state.currentEvent) && !_congregacionSelected){alert('Seleccioná tu congregación de la lista');return;}
  const items=Object.values(state.cart).filter(i=>i.qty>0);
  if(!items.length) return;
  const btn=document.getElementById('btn-pay'); btn.disabled=true; btn.textContent='Procesando...';
  try {
    const order=await API.createOrder({event_id:state.currentEvent.id,buyer_name:nombre,buyer_lastname:apellido,
      buyer_email:email,buyer_phone:tel||null,congregacion:_congregacionSelected||null,payment_method:_selectedPay,
      items:items.map(i=>({stage_id:i.stageId,qty:i.qty}))});

    if(_selectedPay==='transfer') {
      showPendingOrder(order,email);
      return;
    }

    // Mercado Pago: redirige al checkout real. Ahí se valida la tarjeta,
    // nunca acá. El comprador vuelve a /success?order=... ya sea que haya
    // pagado o no; en esa pantalla se chequea el estado real contra el backend.
    const pref=await API.getMPPreference(order.order_id);
    if(pref.demo) {
      alert('Mercado Pago no está configurado en este servidor (falta MP_ACCESS_TOKEN). La orden quedó creada como pendiente de pago, pero no se puede cobrar todavía.');
      showPendingOrder(order,email);
      return;
    }
    window.location.href=pref.init_point;
  } catch(e){alert('Error: '+e.message); btn.disabled=false; btn.textContent='Confirmar y pagar';}
}

function showPendingOrder(order,email) {
  showPage('success');
  document.getElementById('success-subtitle').textContent=`Orden ${order.order_id} · Pago pendiente de confirmación`;
  document.getElementById('generated-tickets').innerHTML=`
    <div class="alert alert-info">
      Tu orden <strong>${order.order_id}</strong> quedó registrada. Las entradas se emiten recién cuando se confirme el pago —
      te las enviamos a <strong>${email}</strong> apenas se acredite. Si elegiste transferencia, mandá el comprobante a
      pagos@ticketar.com con el número de orden.
    </div>`;
}

// Vuelta desde Mercado Pago: /success?order=ORD-XXXX[&pending=1|&error=1]
async function checkReturnFromPayment() {
  const params=new URLSearchParams(window.location.search);
  const orderId=params.get('order');
  if(!orderId) return;
  showPage('success');
  document.getElementById('success-subtitle').textContent='Verificando el pago...';
  try {
    const order=await API.getOrder(orderId);
    if(order.payment_status==='paid') {
      renderSuccessTickets(order,{nombre:order.buyer_name,apellido:order.buyer_lastname,email:order.buyer_email});
      document.getElementById('success-subtitle').textContent=`Orden ${order.id} · Entradas enviadas a ${order.buyer_email}`;
    } else {
      showPendingOrder({order_id:order.id},order.buyer_email);
    }
  } catch(e) {
    document.getElementById('success-subtitle').textContent='No pudimos verificar la orden. Si ya pagaste, revisá tu email.';
  }
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
    console.error('Error de login:', e);
    errEl.textContent = e.message || 'Usuario o contraseña incorrectos';
    errEl.classList.remove('hidden');
  }
}

function doLogout() {
  state.currentAdmin=null; API.setToken(null);
  document.getElementById('admin-user-pill').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  document.getElementById('mobile-logout-link')?.classList.add('hidden');
  document.getElementById('admin-nav-link').style.display='';
  showPage('home');
}

// ── BUILD SIDEBAR CON PERMISOS ──
function buildAdminUI() {
  const u=state.currentAdmin;
  document.getElementById('admin-user-pill').textContent=u.name;
  document.getElementById('admin-user-pill').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
  document.getElementById('mobile-logout-link')?.classList.remove('hidden');
  document.getElementById('admin-nav-link').style.display='none';
  const roleBadge = u.role==='admin' ? (u.event_id ? '⚙️ Admin de evento' : '🔐 Admin general') : '🏷️ Vendedor';
  document.getElementById('sidebar-user').innerHTML=`<strong>${u.name}</strong><br><span style="font-size:.72rem;opacity:.7">${roleBadge}</span>`;

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
  ({dashboard:renderDashboard,events:renderAdminEvents,orders:renderAdminOrders,scanner:renderScanner,users:renderAdminUsers,payments:renderPaymentsConfig})[s]?.(main);
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
    console.error('Error cargando dashboard:', e);
    c.innerHTML=`<div class="admin-page-title">Dashboard</div>
      <div class="alert alert-danger">No se pudo cargar el dashboard: ${e.message||'error de conexión'}. ${e.message&&e.message.toLowerCase().includes('token')?'Tu sesión expiró, salí y volvé a entrar.':'Intentá recargar la página.'}</div>`;
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
  try{events=await API.getAllEvents();}catch(e){
    console.error('Error cargando eventos:', e);
    c.innerHTML=`<div class="admin-page-title">Gestión de Eventos</div><div class="alert alert-danger">No se pudieron cargar los eventos: ${e.message||'error de conexión'}</div>`;
    return;
  }
  const canEdit=can('events');
  const global=isGlobalAdminUser();
  window._events=events;
  c.innerHTML=`<div class="admin-header-row">
    <div class="admin-page-title" style="margin:0">Gestión de Eventos</div>
    ${global?`<button class="btn btn-primary" onclick="showCreateEventModal()">+ Nuevo Evento</button>`:''}
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
          ${canEdit?`<button class="btn btn-secondary btn-sm" onclick="showEditEventModal(${e.id})">Editar</button>`:''}
          <button class="btn btn-secondary btn-sm" onclick="showStagesModal(${e.id})">Etapas</button>
          ${canEdit?(e.active?`<button class="btn btn-danger btn-sm" onclick="deactivateEvent(${e.id})">Desactivar</button>`:`<button class="btn btn-success btn-sm" onclick="reactivateEvent(${e.id})">Activar</button>`):''}
        </div></td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin eventos</td></tr>'}
    </tbody></table></div></div>`;
}

function showCreateEventModal() {
  console.log('[TicketAR] Abriendo modal de nuevo evento');
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Nuevo Evento</div>
    <div id="ne-error" class="alert alert-danger hidden"></div>
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
      <button class="btn btn-primary" id="ne-submit-btn" onclick="submitNewEvent()">Crear Evento</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

function showNeError(msg) {
  const el = document.getElementById('ne-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView({block:'nearest'}); }
  else alert(msg);
}

async function submitNewEvent() {
  console.log('[TicketAR] submitNewEvent() click registrado');
  const btn = document.getElementById('ne-submit-btn');
  const errEl = document.getElementById('ne-error');
  if (errEl) errEl.classList.add('hidden');
  try {
    const title=document.getElementById('ne-title')?.value.trim();
    const date=document.getElementById('ne-date')?.value;
    const venue=document.getElementById('ne-venue')?.value.trim();
    const city=document.getElementById('ne-city')?.value.trim();
    const sName=document.getElementById('ne-sname')?.value.trim();
    const sPrice=parseFloat(document.getElementById('ne-sprice')?.value);
    const sQty=parseInt(document.getElementById('ne-sqty')?.value);
    console.log('[TicketAR] Datos del formulario:', {title,date,venue,city,sName,sPrice,sQty});
    if(!title||!date||!venue||!city||!sName||!sPrice||!sQty) return showNeError('Completá todos los campos obligatorios (*), incluyendo Título y Fecha arriba del todo.');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    await API.createEvent({title,date,time:document.getElementById('ne-time').value,venue,city,emoji:document.getElementById('ne-emoji').value||'🎪',description:document.getElementById('ne-desc').value,stages:[{name:sName,price:sPrice,quantity:sQty}]});
    console.log('[TicketAR] Evento creado OK');
    closeModal();
    await renderAdminEvents(document.getElementById('admin-main'));
  }catch(e){
    console.error('[TicketAR] Error creando evento:', e);
    showNeError('Error: ' + (e.message || JSON.stringify(e) || 'Error desconocido al crear evento'));
    if (btn) { btn.disabled = false; btn.textContent = 'Crear Evento'; }
  }
}

async function showStagesModal(evId) {
  let events=[]; try{events=await API.getAllEvents();}catch(e){console.error('Error cargando eventos:',e); return alert('No se pudieron cargar las etapas: '+(e.message||'error de conexión'));}
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
  try{
    await API.updateStage(evId,stId,{active:newActive});
  }catch(e){
    console.error('Error actualizando etapa:', e);
    return alert('Error: ' + (e.message || 'no se pudo actualizar la etapa'));
  }
  showStagesModal(evId);
}
async function addStageToEvent(evId) {
  const name=document.getElementById('ns-name').value.trim();
  const price=parseFloat(document.getElementById('ns-price').value);
  const qty=parseInt(document.getElementById('ns-qty').value);
  if(!name||!price||!qty) return alert('Completá todos los campos');
  try{
    await API.addStage(evId,{name,price,quantity:qty});
  }catch(e){
    console.error('Error agregando etapa:', e);
    return alert('Error: ' + (e.message || 'no se pudo agregar la etapa'));
  }
  showStagesModal(evId);
}
async function deactivateEvent(id) {
  if(!confirm('¿Desactivar este evento?')) return;
  try{
    await API.deleteEvent(id);
    await renderAdminEvents(document.getElementById('admin-main'));
    alert('Evento desactivado');
  }catch(e){
    console.error('Error desactivando evento:', e);
    alert('Error al desactivar: ' + (e.message || 'Intenta de nuevo'));
  }
}

async function reactivateEvent(id) {
  try{
    await API.updateEvent(id, {active:1});
    await renderAdminEvents(document.getElementById('admin-main'));
  }catch(e){
    console.error('Error activando evento:', e);
    alert('Error al activar: ' + (e.message || 'Intenta de nuevo'));
  }
}

function showEditEventModal(id) {
  const ev = (window._events||[]).find(e=>e.id===id);
  if (!ev) return alert('No se encontró el evento');
  console.log('[TicketAR] Abriendo modal de edición de evento', id);
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Editar Evento</div>
    <div id="ee-error" class="alert alert-danger hidden"></div>
    <div class="form-group"><label>Título *</label><input id="ee-title" type="text" value="${ev.title||''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Fecha *</label><input id="ee-date" type="date" value="${ev.date||''}"></div>
      <div class="form-group"><label>Hora *</label><input id="ee-time" type="time" value="${ev.time||'20:00'}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Lugar *</label><input id="ee-venue" value="${ev.venue||''}"></div>
      <div class="form-group"><label>Ciudad *</label><input id="ee-city" value="${ev.city||''}"></div>
    </div>
    <div class="form-group"><label>Descripción</label><textarea id="ee-desc">${ev.description||''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Emoji</label><input id="ee-emoji" type="text" value="${ev.emoji||'🎪'}" style="width:70px"></div>
      <div class="form-group"><label>Estado</label><select id="ee-active">
        <option value="1" ${ev.active?'selected':''}>Activo</option>
        <option value="0" ${!ev.active?'selected':''}>Inactivo</option>
      </select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="ee-submit-btn" onclick="submitEditEvent(${id})">Guardar cambios</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

async function submitEditEvent(id) {
  const btn = document.getElementById('ee-submit-btn');
  const errEl = document.getElementById('ee-error');
  if (errEl) errEl.classList.add('hidden');
  try {
    const title=document.getElementById('ee-title')?.value.trim();
    const date=document.getElementById('ee-date')?.value;
    const venue=document.getElementById('ee-venue')?.value.trim();
    const city=document.getElementById('ee-city')?.value.trim();
    if(!title||!date||!venue||!city) { if(errEl){errEl.textContent='Completá todos los campos obligatorios (*)';errEl.classList.remove('hidden');} return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    await API.updateEvent(id, {
      title, date, venue, city,
      time: document.getElementById('ee-time').value,
      emoji: document.getElementById('ee-emoji').value || '🎪',
      description: document.getElementById('ee-desc').value,
      active: parseInt(document.getElementById('ee-active').value)
    });
    closeModal();
    await renderAdminEvents(document.getElementById('admin-main'));
  } catch(e) {
    console.error('[TicketAR] Error editando evento:', e);
    if (errEl) { errEl.textContent = 'Error: ' + (e.message||'no se pudo guardar'); errEl.classList.remove('hidden'); }
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

// ══════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════
async function renderAdminOrders(c) {
  const canRegister = can('orders');
  c.innerHTML=`<div class="admin-header-row">
    <div class="admin-page-title" style="margin:0">Órdenes de Compra</div>
    ${canRegister?`<button class="btn btn-primary" onclick="showManualOrderModal()">+ Inscripción manual</button>`:''}
  </div>
    <div class="table-card">
      <div class="table-toolbar"><h3>Todas las órdenes</h3>
        <input class="search-input" placeholder="Buscar..." style="width:220px" oninput="filterOrders(this.value)">
      </div>
      <div id="orders-wrap" style="overflow-x:auto"><div style="padding:2rem;text-align:center;color:var(--gray-400)">Cargando...</div></div>
    </div>`;
  let orders=[];
  try{const r=await API.getOrders({limit:200});orders=r.orders||[];}catch(e){
    console.error('Error cargando órdenes:', e);
    document.getElementById('orders-wrap').innerHTML=`<div class="alert alert-danger">No se pudieron cargar las órdenes: ${e.message||'error de conexión'}</div>`;
    return;
  }
  window._orders=orders; paintOrders(orders);
}

function paintOrders(orders) {
  const cc=can('orders');
  document.getElementById('orders-wrap').innerHTML=`
    <table class="tbl" id="orders-tbl">
      <thead><tr><th>Orden</th><th>Comprador</th><th>Email</th><th>Evento</th><th>Congregación</th><th>Total</th><th>Método</th><th>Estado</th><th>Fecha</th>${cc?'<th></th>':''}</tr></thead>
      <tbody>${orders.map(o=>`<tr data-s="${(o.id+o.buyer_name+(o.buyer_lastname||'')+(o.buyer_email||'')+(o.event_title||'')+(o.congregacion||'')).toLowerCase()}">
        <td style="font-family:'DM Mono',monospace;font-size:.78rem">${o.id}</td>
        <td>${o.buyer_name} ${o.buyer_lastname||''}</td>
        <td style="font-size:.78rem">${o.buyer_email||''}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem">${o.event_title||''}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem">${o.congregacion||'—'}</td>
        <td><strong>$${(o.total||0).toLocaleString('es-AR')}</strong></td>
        <td style="font-size:.8rem">${{mp:'MP QR',card:'Tarjeta',transfer:'Transf.',manual:'Manual'}[o.payment_method]||'—'}</td>
        <td><span class="badge badge-${o.payment_status}">${{paid:'Pagado',pending:'Pendiente',failed:'Fallido'}[o.payment_status]||o.payment_status}</span></td>
        <td style="font-size:.78rem;color:var(--gray-600)">${(o.created_at||'').split('T')[0]}</td>
        ${cc?`<td>${o.payment_status==='pending'?`<button class="btn btn-success btn-sm" onclick="confirmPago('${o.id}')">✓ Confirmar</button>`:''}</td>`:''}
      </tr>`).join('')||`<tr><td colspan="${cc?10:9}" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin órdenes</td></tr>`}
      </tbody></table>`;
}

function filterOrders(q) {
  document.querySelectorAll('#orders-tbl tbody tr[data-s]').forEach(tr=>{tr.style.display=tr.dataset.s.includes(q.toLowerCase())?'':'none';});
}

// ══════════════════════════════════════════
// INSCRIPCIÓN MANUAL — admin/vendedor registran una venta en persona (efectivo, etc.)
// ══════════════════════════════════════════
let _moCongregacionSelected = '';

async function showManualOrderModal() {
  let events=[];
  try{ events = await API.getAllEvents(); }
  catch(e){ console.error('Error cargando eventos:', e); return alert('No se pudieron cargar los eventos: '+(e.message||'error de conexión')); }
  const activeEvents = events.filter(e=>e.active);
  if(!activeEvents.length) return alert('No hay eventos activos para inscribir');
  window._moEvents = activeEvents;
  _moCongregacionSelected = '';

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">Inscripción manual</div>
    <div id="mo-error" class="alert alert-danger hidden"></div>
    <p style="font-size:.85rem;color:var(--gray-600);margin-bottom:1rem">Para ventas en persona (efectivo, etc.) — la orden queda registrada como pagada al instante.</p>
    <div class="form-group"><label>Evento *</label>
      <select id="mo-event" onchange="onManualOrderEventChange()">
        ${activeEvents.map(e=>`<option value="${e.id}">${e.emoji||''} ${e.title}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Etapa *</label><select id="mo-stage"></select></div>
      <div class="form-group"><label>Cantidad *</label><input id="mo-qty" type="number" min="1" value="1"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nombre *</label><input id="mo-nombre" placeholder="Juan"></div>
      <div class="form-group"><label>Apellido *</label><input id="mo-apellido" placeholder="García"></div>
    </div>
    <div class="form-group"><label>Email *</label><input id="mo-email" type="email" placeholder="juan@email.com"></div>
    <div class="form-group"><label>Teléfono</label><input id="mo-tel" type="tel"></div>
    <div id="mo-congregacion-wrap" class="hidden"></div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="mo-submit-btn" onclick="submitManualOrder()">Registrar inscripción</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
  onManualOrderEventChange();
}

function onManualOrderEventChange() {
  const evId = parseInt(document.getElementById('mo-event').value);
  const ev = (window._moEvents||[]).find(e=>e.id===evId);
  const stageSel = document.getElementById('mo-stage');
  const stages = (ev?.stages||[]).filter(s=>s.active && (s.quantity-s.sold)>0);
  stageSel.innerHTML = stages.length
    ? stages.map(s=>`<option value="${s.id}">${s.name} — $${(s.price||0).toLocaleString('es-AR')} (${s.quantity-s.sold} disp.)</option>`).join('')
    : '<option value="">Sin etapas con stock disponible</option>';
  renderManualOrderCongregacion(ev);
}

async function renderManualOrderCongregacion(ev) {
  const wrap = document.getElementById('mo-congregacion-wrap');
  _moCongregacionSelected = '';
  if (!eventNeedsCongregacion(ev)) { wrap.classList.add('hidden'); wrap.innerHTML=''; return; }

  if (!_congregaciones) {
    try { const res = await fetch('data/congregaciones.json'); _congregaciones = await res.json(); }
    catch(e){ console.error('Error cargando congregaciones:', e); _congregaciones=[]; }
  }

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <label>Congregación *</label>
    <div class="combo-wrap">
      <input id="mo-congregacion-input" type="text" autocomplete="off" placeholder="Buscá la congregación...">
      <div id="mo-congregacion-list" class="combo-list hidden"></div>
    </div>`;

  const input = document.getElementById('mo-congregacion-input');
  const list = document.getElementById('mo-congregacion-list');
  const renderList = (items) => {
    list.innerHTML = items.length
      ? items.map(x=>`<div class="combo-item" data-val="${x.replace(/"/g,'&quot;')}">${x}</div>`).join('')
      : '<div class="combo-empty">Sin resultados</div>';
    list.classList.remove('hidden');
  };
  input.addEventListener('focus', ()=>renderList(_congregaciones));
  input.addEventListener('input', ()=>{
    _moCongregacionSelected='';
    const q = input.value.toLowerCase().trim();
    renderList(q ? _congregaciones.filter(x=>x.toLowerCase().includes(q)) : _congregaciones);
  });
  list.addEventListener('click', (ev2)=>{
    const item = ev2.target.closest('.combo-item'); if(!item) return;
    _moCongregacionSelected = item.dataset.val;
    input.value = _moCongregacionSelected;
    list.classList.add('hidden');
  });
}

async function submitManualOrder() {
  const errEl = document.getElementById('mo-error');
  if(errEl) errEl.classList.add('hidden');
  const btn = document.getElementById('mo-submit-btn');
  try {
    const eventId = parseInt(document.getElementById('mo-event').value);
    const stageId = parseInt(document.getElementById('mo-stage').value);
    const qty = parseInt(document.getElementById('mo-qty').value);
    const nombre = document.getElementById('mo-nombre').value.trim();
    const apellido = document.getElementById('mo-apellido').value.trim();
    const email = document.getElementById('mo-email').value.trim();
    const tel = document.getElementById('mo-tel').value.trim();
    const ev = (window._moEvents||[]).find(e=>e.id===eventId);

    if(!eventId||!stageId||!qty||qty<1) return showModalError(errEl,'Completá evento, etapa y cantidad');
    if(!nombre||!apellido||!email) return showModalError(errEl,'Completá nombre, apellido y email');
    if(!email.match(/^[^@]+@[^@]+\.[^@]+$/)) return showModalError(errEl,'Email inválido');
    if(eventNeedsCongregacion(ev) && !_moCongregacionSelected) return showModalError(errEl,'Seleccioná la congregación de la lista');

    if(btn){btn.disabled=true;btn.textContent='Registrando...';}
    const order = await API.createManualOrder({
      event_id: eventId, buyer_name: nombre, buyer_lastname: apellido,
      buyer_email: email, buyer_phone: tel||null, congregacion: _moCongregacionSelected||null,
      items: [{stage_id: stageId, qty}]
    });
    closeModal();
    alert(`Inscripción registrada: orden ${order.order_id} (${order.tickets.length} entrada/s)`);
    await renderAdminOrders(document.getElementById('admin-main'));
  } catch(e) {
    console.error('Error en inscripción manual:', e);
    showModalError(errEl, 'Error: '+(e.message||'no se pudo registrar'));
    if(btn){btn.disabled=false;btn.textContent='Registrar inscripción';}
  }
}

function showModalError(errEl, msg) {
  if(errEl){ errEl.textContent = msg; errEl.classList.remove('hidden'); }
  else alert(msg);
}
async function confirmPago(id) {
  if(!confirm(`¿Confirmar pago de la orden ${id}?`)) return;
  try{
    await API.confirmOrder(id);
  }catch(e){
    console.error('Error confirmando pago:', e);
    return alert('Error: ' + (e.message || 'no se pudo confirmar el pago'));
  }
  const o=(window._orders||[]).find(x=>x.id===id); if(o) o.payment_status='paid';
  paintOrders(window._orders||[]);
}

// ══════════════════════════════════════════
// SCANNER
// ══════════════════════════════════════════
function renderScanner(c) {
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
      console.error('Error validando ticket:', e);
      res.innerHTML=`<div class="scan-result scan-err">❌ Error de conexión — no se pudo validar (${e.message||'reintentá'})</div>`;
    }
    document.getElementById('scan-input').value=''; document.getElementById('scan-input').focus();
  };
}

// ══════════════════════════════════════════
// USERS
// ══════════════════════════════════════════
function isGlobalAdminUser() {
  return state.currentAdmin?.role==='admin' && !state.currentAdmin?.event_id;
}

async function renderAdminUsers(c) {
  const global = isGlobalAdminUser();
  let users=[];
  try{users=await API.getUsers();}catch(e){
    console.error('Error cargando usuarios:', e);
    c.innerHTML=`<div class="admin-page-title">Gestión de Usuarios</div><div class="alert alert-danger">No se pudieron cargar los usuarios: ${e.message||'error de conexión'}</div>`;
    return;
  }
  window._users=users;
  c.innerHTML=`<div class="admin-header-row">
    <div class="admin-page-title" style="margin:0">Gestión de Usuarios</div>
    <button class="btn btn-primary" onclick="showCreateUserModal()">+ Nuevo Usuario</button>
  </div>
  <div class="table-card"><div style="overflow-x:auto"><table class="tbl">
    <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Evento</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>${users.map(u=>`<tr>
      <td><strong>${u.username}</strong></td><td>${u.name}</td>
      <td style="font-size:.82rem">${u.email||'–'}</td>
      <td><span class="badge badge-${u.role}">${{admin:'⚙️ Admin',vendedor:'🏷️ Vendedor'}[u.role]||u.role}</span></td>
      <td style="font-size:.82rem">${u.event_title || (u.role==='admin'&&!u.event_id?'<em>Global</em>':'—')}</td>
      <td><span class="badge ${u.active?'badge-active':'badge-inactive'}">${u.active?'Activo':'Inactivo'}</span></td>
      <td><div style="display:flex;gap:.4rem">
        ${(global || u.role==='vendedor')?`<button class="btn btn-secondary btn-sm" onclick="showEditUserModal(${u.id})">Editar</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})"
          ${u.id===state.currentAdmin?.id?'disabled title="No podés eliminarte"':''}>Eliminar</button>
      </div></td>
    </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400)">Sin usuarios</td></tr>'}
    </tbody></table></div></div>`;
}

async function showCreateUserModal() {
  const global = isGlobalAdminUser();
  let eventOptions = '';
  if (global) {
    let events=[];
    try{ events = (await API.getAllEvents()).filter(e=>e.active); }
    catch(e){ console.error('Error cargando eventos:', e); return alert('No se pudieron cargar los eventos: '+(e.message||'error de conexión')); }
    window._nuEvents = events;
    eventOptions = events.map(e=>`<option value="${e.id}">${e.emoji||''} ${e.title}</option>`).join('');
  }
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Nuevo Usuario</div>
    <div id="nu-error" class="alert alert-danger hidden"></div>
    <div class="form-group"><label>Nombre completo *</label><input id="nu-name" placeholder="Juan García"></div>
    <div class="form-row">
      <div class="form-group"><label>Usuario *</label><input id="nu-user" placeholder="jgarcia"></div>
      <div class="form-group"><label>Contraseña *</label><input id="nu-pass" type="password" placeholder="••••••••"></div>
    </div>
    <div class="form-group"><label>Email</label><input id="nu-email" type="email" placeholder="juan@email.com"></div>
    ${global?`<div class="form-group"><label>Rol *</label><select id="nu-role">
      <option value="vendedor">🏷️ Vendedor — Órdenes y QR de su evento</option>
      <option value="admin">⚙️ Admin — Gestiona un evento completo</option>
    </select></div>
    <div class="form-group"><label>Evento *</label><select id="nu-event">${eventOptions}</select></div>`
    :`<p style="font-size:.85rem;color:var(--gray-600);margin-bottom:1rem">Se va a crear como <strong>vendedor</strong> de tu evento (${state.currentAdmin?.event_title||'el tuyo'}).</p>`}
    <div class="modal-footer">
      <button class="btn btn-primary" id="nu-submit-btn" onclick="createUser()">Crear</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

function showEditUserModal(id) {
  const u=(window._users||[]).find(x=>x.id===id)||{};
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-title">Editar: ${u.username}</div>
    <div id="eu-error" class="alert alert-danger hidden"></div>
    <div class="form-group"><label>Nombre</label><input id="eu-name" value="${u.name||''}"></div>
    <div class="form-group"><label>Email</label><input id="eu-email" type="email" value="${u.email||''}"></div>
    <div class="form-group"><label>Nueva contraseña <small style="color:var(--gray-400)">(vacío = no cambia)</small></label><input id="eu-pass" type="password"></div>
    <div class="form-group"><label>Estado</label><select id="eu-active">
      <option value="1" ${u.active?'selected':''}>Activo</option>
      <option value="0" ${!u.active?'selected':''}>Inactivo</option>
    </select></div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="eu-submit-btn" onclick="updateUser(${id})">Guardar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>`;
  openModal();
}

async function updateUser(id) {
  const errEl = document.getElementById('eu-error');
  if(errEl) errEl.classList.add('hidden');
  const name=document.getElementById('eu-name').value.trim();
  const email=document.getElementById('eu-email').value.trim();
  const pass=document.getElementById('eu-pass').value;
  const active=parseInt(document.getElementById('eu-active').value);
  try{
    await API.updateUser(id,{name,email,active,...(pass?{password:pass}:{})});
  }catch(e){
    console.error('Error actualizando usuario:', e);
    return showModalError(errEl, 'Error: ' + (e.message || 'no se pudo actualizar el usuario'));
  }
  closeModal(); renderAdminUsers(document.getElementById('admin-main'));
}

async function createUser() {
  const errEl = document.getElementById('nu-error');
  if(errEl) errEl.classList.add('hidden');
  const name=document.getElementById('nu-name').value.trim();
  const username=document.getElementById('nu-user').value.trim();
  const password=document.getElementById('nu-pass').value;
  const email=document.getElementById('nu-email').value.trim();
  const global = isGlobalAdminUser();
  const role = global ? document.getElementById('nu-role').value : 'vendedor';
  const event_id = global ? parseInt(document.getElementById('nu-event').value) : undefined;
  if(!name||!username||!password) return showModalError(errEl,'Nombre, usuario y contraseña son obligatorios');
  if(global && !event_id) return showModalError(errEl,'Elegí a qué evento pertenece');
  try{
    await API.createUser({name,username,password,email,role,...(event_id?{event_id}:{})});
  }catch(e){
    console.error('Error creando usuario:', e);
    return showModalError(errEl, 'Error: ' + (e.message || 'no se pudo crear el usuario'));
  }
  closeModal(); renderAdminUsers(document.getElementById('admin-main')); alert('Usuario creado');
}

async function deleteUser(id) {
  if(id===state.currentAdmin?.id) return alert('No podés eliminarte a vos mismo');
  if(!confirm('¿Eliminar este usuario?')) return;
  try{
    await API.deleteUser(id);
  }catch(e){
    console.error('Error eliminando usuario:', e);
    return alert('Error: ' + (e.message || 'no se pudo eliminar el usuario'));
  }
  renderAdminUsers(document.getElementById('admin-main'));
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
  checkReturnFromPayment();
  const token=API.getToken();
  if(token){API.me().then(user=>{if(user){state.currentAdmin=user;buildAdminUI();}}).catch(()=>API.setToken(null));}
});
