INSERT OR IGNORE INTO users (id, email, name) VALUES ('demo-user', 'demo@proofpack.dev', 'Demo User');
INSERT OR IGNORE INTO organizations (id, name, owner_user_id) VALUES ('demo-org', 'Demo Roasters', 'demo-user');
INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role) VALUES ('demo-member', 'demo-org', 'demo-user', 'owner');
INSERT OR IGNORE INTO proof_packs (
  id, organization_id, title, status, commodity, product_name, quantity, batch_number,
  production_country, export_country, destination_country, buyer_company, buyer_contact,
  buyer_email, buyer_country, supplier_company, supplier_contact, supplier_email,
  supplier_country, supplier_declaration_confirmed, risk_level, risk_notes, reviewer_notes,
  share_token, supplier_token
) VALUES (
  'demo-pack', 'demo-org', 'Demo coffee batch', 'in_review', 'coffee', 'Washed arabica green coffee',
  '1,200 kg', 'LOT-COF-2026-01', 'Colombia', 'Colombia', 'Germany', 'North Star Roasters',
  'Mira Klein', 'buyer@example.com', 'Germany', 'Andes Cooperative', 'Luis Ramos',
  'supplier@example.com', 'Colombia', 1, 'medium', 'Country and supplier notes require final review.',
  'Confirm latest land-use evidence before buyer share.', 'demo-share-token', 'demo-supplier-token'
);
INSERT OR IGNORE INTO plots (id, proof_pack_id, plot_name, producer_name, latitude, longitude, area_size, notes)
VALUES ('demo-plot', 'demo-pack', 'Finca La Palma', 'Ana Torres', 4.710989, -74.072092, '3.4 ha', 'Coordinates supplied by cooperative.');
INSERT OR IGNORE INTO activity_events (id, organization_id, proof_pack_id, actor_user_id, event_type, message)
VALUES ('demo-event', 'demo-org', 'demo-pack', 'demo-user', 'proof_pack.seeded', 'Seeded demo proof pack');
