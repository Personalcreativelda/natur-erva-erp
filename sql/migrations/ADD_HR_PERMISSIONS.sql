-- ====================================================================
-- ADD_HR_PERMISSIONS.sql — permissões hr.view/hr.manage (faltavam na BD)
-- Necessário para o backend poder aplicar requirePermission() nas rotas
-- novas de Metas & Bónus sem quebrar o acesso de quem já usa o RH.
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_HR_PERMISSIONS.sql
-- ====================================================================

INSERT INTO permissions (name, display_name, category) VALUES
  ('hr.view',   'Ver Recursos Humanos',   'hr'),
  ('hr.manage', 'Gerir Recursos Humanos', 'hr')
ON CONFLICT (name) DO NOTHING;

-- SUPER_ADMIN e ADMIN já têm acesso total via bypass no middleware,
-- mas o grant explícito também aqui não faz mal e mantém a tabela coerente.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('SUPER_ADMIN', 'ADMIN') AND p.name IN ('hr.view', 'hr.manage')
ON CONFLICT DO NOTHING;

-- GERENTE já via hr.view no mapa do frontend (usePermissions.ts) — replicar na BD
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'GERENTE' AND p.name = 'hr.view'
ON CONFLICT DO NOTHING;

SELECT '✅ Permissões hr.view/hr.manage criadas e atribuídas' AS status;
