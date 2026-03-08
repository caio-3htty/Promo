-- Seed de demonstracao para ambiente de teste
-- Executar apos aplicar migrations e com usuarios ja criados no Auth.

INSERT INTO public.obras (id, tenant_id, name, description, address, status)
VALUES
  ('8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101', '11111111-1111-1111-1111-111111111111', 'Obra Residencial Alpha', 'Condominio vertical', 'Sao Paulo - SP', 'ativa'),
  ('8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f102', '11111111-1111-1111-1111-111111111111', 'Obra Comercial Beta', 'Centro empresarial', 'Campinas - SP', 'ativa'),
  ('8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f103', '11111111-1111-1111-1111-111111111111', 'Obra Industrial Gama', 'Galpao logistico', 'Sorocaba - SP', 'ativa')
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  status = EXCLUDED.status;

INSERT INTO public.fornecedores (id, tenant_id, nome, cnpj, contatos, entrega_propria, deleted_at)
VALUES
  ('f44f2912-57aa-4df0-a8d6-2153a9d36001', '11111111-1111-1111-1111-111111111111', 'Cimento Forte LTDA', '12345678000190', 'comercial@cimentoforte.com', true, null),
  ('f44f2912-57aa-4df0-a8d6-2153a9d36002', '11111111-1111-1111-1111-111111111111', 'Aco Sul Distribuidora', '22345678000190', 'vendas@acosul.com.br', false, null),
  ('f44f2912-57aa-4df0-a8d6-2153a9d36003', '11111111-1111-1111-1111-111111111111', 'HidroMax Materiais', '32345678000190', 'contato@hidromax.com.br', true, null)
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nome = EXCLUDED.nome,
  cnpj = EXCLUDED.cnpj,
  contatos = EXCLUDED.contatos,
  entrega_propria = EXCLUDED.entrega_propria,
  deleted_at = EXCLUDED.deleted_at;

INSERT INTO public.materiais (id, tenant_id, nome, unidade, tempo_producao_padrao, estoque_minimo, deleted_at)
VALUES
  ('e11a1ebd-58d8-4309-b6bb-b8d6d28d7001', '11111111-1111-1111-1111-111111111111', 'Cimento CP-II', 'saco', 2, 100, null),
  ('e11a1ebd-58d8-4309-b6bb-b8d6d28d7002', '11111111-1111-1111-1111-111111111111', 'Vergalhao CA-50 10mm', 'barra', 4, 80, null),
  ('e11a1ebd-58d8-4309-b6bb-b8d6d28d7003', '11111111-1111-1111-1111-111111111111', 'Tubo PVC 100mm', 'un', 3, 40, null)
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nome = EXCLUDED.nome,
  unidade = EXCLUDED.unidade,
  tempo_producao_padrao = EXCLUDED.tempo_producao_padrao,
  estoque_minimo = EXCLUDED.estoque_minimo,
  deleted_at = EXCLUDED.deleted_at;

INSERT INTO public.material_fornecedor (id, tenant_id, material_id, fornecedor_id, preco_atual, pedido_minimo, lead_time_dias, validade_preco, deleted_at)
VALUES
  ('d12c2f0e-8b7a-4f2f-a57a-b4f53cc9d001', '11111111-1111-1111-1111-111111111111', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7001', 'f44f2912-57aa-4df0-a8d6-2153a9d36001', 38.90, 50, 3, CURRENT_DATE + INTERVAL '30 days', null),
  ('d12c2f0e-8b7a-4f2f-a57a-b4f53cc9d002', '11111111-1111-1111-1111-111111111111', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7002', 'f44f2912-57aa-4df0-a8d6-2153a9d36002', 79.50, 30, 5, CURRENT_DATE + INTERVAL '30 days', null),
  ('d12c2f0e-8b7a-4f2f-a57a-b4f53cc9d003', '11111111-1111-1111-1111-111111111111', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7003', 'f44f2912-57aa-4df0-a8d6-2153a9d36003', 61.20, 20, 4, CURRENT_DATE + INTERVAL '30 days', null)
ON CONFLICT (material_id, fornecedor_id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  preco_atual = EXCLUDED.preco_atual,
  pedido_minimo = EXCLUDED.pedido_minimo,
  lead_time_dias = EXCLUDED.lead_time_dias,
  validade_preco = EXCLUDED.validade_preco,
  deleted_at = EXCLUDED.deleted_at;

DO $$
DECLARE
  v_users uuid[];
  v_master_type_id uuid;
BEGIN
  SELECT array_agg(user_id ORDER BY created_at ASC)
  INTO v_users
  FROM public.profiles;

  IF coalesce(array_length(v_users, 1), 0) >= 1 THEN
    SELECT id INTO v_master_type_id
    FROM public.user_types
    WHERE lower(name) = 'master'
    LIMIT 1;

    UPDATE public.profiles
    SET
      is_active = true,
      user_type_id = v_master_type_id
    WHERE user_id = v_users[1];

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_users[1], 'master')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

    INSERT INTO public.user_obras (user_id, obra_id)
    VALUES
      (v_users[1], '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101'),
      (v_users[1], '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f102')
    ON CONFLICT (user_id, obra_id) DO NOTHING;
  END IF;
END
$$;

INSERT INTO public.pedidos_compra (
  id,
  tenant_id,
  obra_id,
  material_id,
  fornecedor_id,
  quantidade,
  preco_unit,
  total,
  status,
  codigo_compra,
  deleted_at
)
VALUES
  ('c33d89a4-6c90-4a95-a70b-69ef1d9b0001', '11111111-1111-1111-1111-111111111111', '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7001', 'f44f2912-57aa-4df0-a8d6-2153a9d36001', 120, 38.90, 4668.00, 'pendente', null, null),
  ('c33d89a4-6c90-4a95-a70b-69ef1d9b0002', '11111111-1111-1111-1111-111111111111', '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7002', 'f44f2912-57aa-4df0-a8d6-2153a9d36002', 60, 79.50, 4770.00, 'aprovado', 'PC-2026-0002', null),
  ('c33d89a4-6c90-4a95-a70b-69ef1d9b0003', '11111111-1111-1111-1111-111111111111', '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101', 'e11a1ebd-58d8-4309-b6bb-b8d6d28d7003', 'f44f2912-57aa-4df0-a8d6-2153a9d36003', 40, 61.20, 2448.00, 'enviado', 'PC-2026-0003', null)
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  status = EXCLUDED.status,
  codigo_compra = EXCLUDED.codigo_compra,
  quantidade = EXCLUDED.quantidade,
  preco_unit = EXCLUDED.preco_unit,
  total = EXCLUDED.total,
  deleted_at = EXCLUDED.deleted_at;
