import pool from '../db.js';

const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'];

// Precisa de correr depois de authMiddleware (usa req.user).
export const requirePermission = (permissionName) => async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    if (user.isSuperAdmin || FULL_ACCESS_ROLES.includes(user.role) ||
        (user.roles || []).some((r) => FULL_ACCESS_ROLES.includes(r))) {
      return next();
    }

    const { rows } = await pool.query(
      `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1 AND p.name = $2
       LIMIT 1`,
      [user.id, permissionName]
    );

    if (!rows.length) {
      return res.status(403).json({ error: 'Sem permissão para aceder a este recurso' });
    }
    next();
  } catch (err) {
    console.error('[requirePermission]', err);
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};
