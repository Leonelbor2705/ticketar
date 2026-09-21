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
    getOrders: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req('GET', '/orders' + (q ? '?' + q : ''));
    },
    getOrder: (id) => req('GET', `/orders/${id}`),
    confirmOrder: (id) => req('POST', `/orders/${id}/confirm`),

    // Tickets
    validateTicket: (code) => req('POST', '/tickets/validate', { code }),

    // Payments
    getMPPreference: (orderId) => req('POST', '/payments/mp/preference', { order_id: orderId }),
    getPaymentDashboard: () => req('GET', '/payments/dashboard'),
  };
})();
