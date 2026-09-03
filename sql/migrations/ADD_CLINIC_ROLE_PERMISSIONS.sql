-- ====================================================================
-- ADD_CLINIC_ROLE_PERMISSIONS.sql — Role "Equipa Clínica" + permissões clinic.*
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_CLINIC_ROLE_PERMISSIONS.sql
-- Pré-requisito: CREATE_PERMISSIONS_SYSTEM.sql já aplicado (tabelas roles/permissions/role_permissions)
-- ====================================================================

-- Role novo
INSERT INTO roles (name, display_name, description, level, is_system_role) VALUES
  ('CLINICA', 'Equipa Clínica', 'Acesso ao módulo de gestão clínica (fichas, agenda, protocolos)', 5, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Permissões novas
INSERT INTO permissions (name, display_name, category) VALUES
  ('clinic.view',   'Ver Módulo Clínica',   'clinic'),
  ('clinic.manage', 'Gerir Módulo Clínica', 'clinic')
ON CONFLICT (name) DO NOTHING;

-- CLINICA: acesso à área admin + ver/gerir o módulo
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'CLINICA' AND p.name IN ('clinic.view', 'clinic.manage', 'admin.access')
ON CONFLICT DO NOTHING;

-- SUPER_ADMIN e ADMIN também recebem as permissões (o backend valida contra a BD,
-- não só o mapa hardcoded do frontend, por isso é preciso este grant explícito)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('SUPER_ADMIN', 'ADMIN') AND p.name IN ('clinic.view', 'clinic.manage')
ON CONFLICT DO NOTHING;

SELECT '✅ Role CLINICA e permissões clinic.view/clinic.manage criadas' AS status;
