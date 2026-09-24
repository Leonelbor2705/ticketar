// middleware/auth.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  next();
};

// Admin global = sin event_id (solo el usuario seedeado por ADMIN_USERNAME/ADMIN_PASSWORD
// en Railway). Cualquier otro admin o vendedor queda atado a un evento específico.
const isGlobalAdmin = (user) => user?.role === 'admin' && (user.event_id === null || user.event_id === undefined);

// true si el usuario puede operar sobre ese event_id: admin global (cualquiera),
// o admin/vendedor cuyo event_id coincide.
const canAccessEvent = (user, eventId) =>
  isGlobalAdmin(user) || String(user?.event_id) === String(eventId);

module.exports = { auth, adminOnly, isGlobalAdmin, canAccessEvent };
