// js/api.js — Cliente API para TicketAR
const API = (() => {
  const BASE = '/api';
  let _token = localStorage.getItem('ticketar_token') || null;

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (_token) h['Authorization'] = 'Bearer ' + _token;
    return h;
  };

  const req = async (method, path, body) => {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  };

  return {
    setToken(t) { _token = t; if (t) localStorage.setItem('ticketar_token', t); else localStorage.removeItem('ticketar_token'); },
    getToken() { return _token; },

    // Auth
    login: (u, p) => req('POST', '/auth/login', { username: u, password: p }),
    me: () => req('GET', '/auth/me'),
    getUsers: () => req('GET', '/auth/users'),
    createUser: (d) => req('POST', '/auth/users', d),
    updateUser: (id, d) => req('PUT', `/auth/users/${id}`, d),
    deleteUser: (id) => req('DELETE', `/auth/users/${id}`),

    // Events
    getEvents: () => req('GET', '/events'),
    getAllEvents: () => req('GET', '/events/all'),
    getEvent: (id) => req('GET', `/events/${id}`),
    createEvent: (d) => req('POST', '/events', d),
    updateEvent: (id, d) => req('PUT', `/events/${id}`, d),
    deleteEvent: (id) => req('DELETE', `/events/${id}`),
    addStage: (evId, d) => req('POST', `/events/${evId}/stages`, d),
    updateStage: (evId, stId, d) => req('PUT', `/events/${evId}/stages/${stId}`, d),

    // Orders
    createOrder: (d) => req('POST', '/orders', d),
    createManualOrder: (d) => req('POST', '/orders/manual', d),
    getOrders: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req('GET', '/orders' + (q ? '?' + q : ''));
    },
    getOrder: (id) => req('GET', `/orders/${id}`),
    confirmOrder: (id) => req('POST', `/orders/${id}/confirm`),
    updateOrder: (id, d) => req('PUT', `/orders/${id}`, d),

    // Tickets
    validateTicket: (code) => req('POST', '/tickets/validate', { code }),

    // Payments
    getMPPreference: (orderId) => req('POST', '/payments/mp/preference', { order_id: orderId }),
    getPaymentDashboard: (period) => req('GET', '/payments/dashboard' + (period ? '?period=' + period : '')),

    // Descarga un archivo (.xlsx) autenticado: fetch no puede usar un <a href> plano
    // porque el token va en el header Authorization, no en una cookie.
    async downloadOrdersExport(period) {
      const res = await fetch(BASE + '/orders/export' + (period ? '?period=' + period : ''), { headers: headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ventas-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    },
  };
})();
