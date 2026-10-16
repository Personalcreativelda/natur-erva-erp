-- ====================================================================
-- SEED_ROLE_PERMISSIONS.sql — corrige regressão de acesso (roles a perder o menu)
--
-- Contexto: a app sempre dependeu de um mapa de permissões fixo no FRONTEND
-- (ROLE_PERMISSION_MAP em usePermissions.ts) como a fonte real de acesso —
-- a tabela role_permissions na BD nunca foi totalmente preenchida para os
-- roles antigos (VENDEDOR, GESTOR_VENDAS, GERENTE, STAFF, etc. só tinham
-- 'admin.access' gravado). Depois de uma correção que passou a tratar a BD
-- como autoritativa (para permitir que restrições feitas em Roles &
-- Permissões realmente tenham efeito), esses roles perderam acesso a tudo
-- o resto porque a BD estava incompleta.
--
-- Esta migration preenche role_permissions para bater certo com o que o
-- frontend sempre assumiu, para cada role.
-- Run: cd backend && node run-migration.js ../sql/migrations/SEED_ROLE_PERMISSIONS.sql
-- ====================================================================

-- Permissões que faltavam na tabela (referenciadas pelo frontend mas nunca inseridas)
INSERT INTO permissions (name, display_name, category) VALUES
  ('dashboard.view',        'Ver Dashboard',                 'dashboard'),
  ('analytics.view',        'Ver Estatísticas',              'dashboard'),
  ('sales.view',            'Ver Vendas',                     'sales'),
  ('sales.view.own',        'Ver Apenas as Próprias Vendas',  'sales'),
  ('sales.view.all',        'Ver Todas as Vendas',            'sales'),
  ('sales.create',          'Criar Vendas',                   'sales'),
  ('sales.edit',            'Editar Vendas',                  'sales'),
  ('sales.discount',        'Aplicar Descontos',              'sales'),
  ('sales.reports',         'Ver Relatórios de Vendas',       'sales'),
  ('orders.update_status',  'Atualizar Estado de Encomendas', 'orders'),
  ('media.view',            'Ver Media',                      'media'),
  ('media.upload',          'Carregar Media',                 'media'),
  ('media.delete',          'Apagar Media',                   'media'),
  ('messaging.view',        'Ver Mensagens',                  'messaging'),
  ('helpdesk.view',         'Ver Central de Ajuda',           'helpdesk'),
  ('subscriptions.view',    'Ver Assinaturas',                'subscriptions'),
  ('documents.view',        'Ver Documentos',                 'documents'),
  ('purchases.view',        'Ver Compras',                    'purchases'),
  ('purchases.create',      'Criar Compras',                  'purchases'),
  ('stock.movements.view',  'Ver Movimentos de Stock',        'stock'),
  ('stock.adjust',          'Ajustar Stock',                  'stock'),
  ('stock.audit',           'Auditar Stock',                  'stock'),
  ('projects.view',         'Ver Projectos',                  'projects'),
  ('timesheets.view',       'Ver Planilha de Horas',          'timesheets')
ON CONFLICT (name) DO NOTHING;

-- GESTOR_BLOG
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'GESTOR_BLOG' AND p.name = ANY(ARRAY['admin.access','dashboard.view','media.view','media.upload','media.delete','messaging.view'])
ON CONFLICT DO NOTHING;

-- GESTOR_VENDAS
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'GESTOR_VENDAS' AND p.name = ANY(ARRAY['admin.access','dashboard.view','sales.view','sales.view.all','sales.create','sales.edit',
  'sales.discount','sales.reports','customers.view','customers.create','customers.edit',
  'orders.view','orders.create','orders.edit','orders.update_status',
  'helpdesk.view','subscriptions.view','messaging.view','documents.view'])
ON CONFLICT DO NOTHING;

-- VENDEDOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'VENDEDOR' AND p.name = ANY(ARRAY['admin.access','dashboard.view','sales.view','sales.view.own','sales.create',
  'orders.view','orders.create','customers.view','timesheets.view','messaging.view'])
ON CONFLICT DO NOTHING;

-- LOGISTICA
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'LOGISTICA' AND p.name = ANY(ARRAY['admin.access','dashboard.view','logistics.manage','orders.view','orders.edit','orders.update_status','messaging.view'])
ON CONFLICT DO NOTHING;

-- AFILIADO
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'AFILIADO' AND p.name = ANY(ARRAY['admin.access','dashboard.view','messaging.view'])
ON CONFLICT DO NOTHING;

-- GERENTE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'GERENTE' AND p.name = ANY(ARRAY['admin.access','dashboard.view','analytics.view','sales.view','sales.view.all','sales.create','sales.edit',
  'products.view','products.create','products.edit','purchases.view','purchases.create',
  'stock.view','stock.movements.view','orders.view','orders.edit','orders.update_status',
  'customers.view','customers.create','customers.edit','media.view','media.upload','users.view',
  'finance.view','hr.view','projects.view','helpdesk.view','timesheets.view','messaging.view',
  'subscriptions.view','documents.view'])
ON CONFLICT DO NOTHING;

-- CONTABILISTA
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'CONTABILISTA' AND p.name = ANY(ARRAY['admin.access','dashboard.view','analytics.view','finance.view','finance.manage',
  'purchases.view','orders.view','messaging.view','documents.view'])
ON CONFLICT DO NOTHING;

-- GESTOR_STOCK
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'GESTOR_STOCK' AND p.name = ANY(ARRAY['admin.access','dashboard.view','products.view','products.create','products.edit',
  'purchases.view','purchases.create','stock.view','stock.adjust','stock.audit','stock.movements.view','messaging.view'])
ON CONFLICT DO NOTHING;

-- STAFF
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'STAFF' AND p.name = ANY(ARRAY['admin.access','dashboard.view','sales.view','sales.view.own','orders.view','customers.view',
  'projects.view','helpdesk.view','timesheets.view','messaging.view','documents.view'])
ON CONFLICT DO NOTHING;

-- CLINICA (reforça o que já tinha, incluindo customers.view/messaging.view em falta)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'CLINICA' AND p.name = ANY(ARRAY['admin.access','dashboard.view','clinic.view','clinic.manage','customers.view','messaging.view'])
ON CONFLICT DO NOTHING;

SELECT '✅ Permissões dos roles sincronizadas com o mapa da aplicação' AS status;
