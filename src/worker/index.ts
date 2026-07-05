import { clearSessionCookie, isResponse, json, requireSession, secureToken, sessionCookie } from "./auth/session";
import { addActivity, ensurePackAccess, getDocuments, getPlots, getRecentActivity, listProofPacks } from "./db/queries";
import type { DocumentRow, PlotRow, ProofPackRow } from "./db/types";
import { computeReadiness } from "./routes/score";
import { storeUpload } from "./storage/files";
import { documentMetaSchema, loginSchema, plotSchema, proofPackCreateSchema, proofPackPatchSchema, supplierUpdateSchema } from "./validation/schemas";

interface ZipExportMessage {
  proofPackId: string;
  requestedByUserId: string | null;
}

const apiPrefix = "/api/";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith(apiPrefix) || url.pathname.startsWith("/supplier/")) {
        return await route(request, env, ctx, url);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.log(JSON.stringify({ level: "error", message, path: url.pathname }));
      return json({ error: message }, 500);
    }
  },
  async queue(batch: MessageBatch<ZipExportMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      console.log(JSON.stringify({ level: "info", event: "zip_export_placeholder", proofPackId: message.body.proofPackId }));
      message.ack();
    }
    await Promise.resolve(env);
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const method = request.method;
  const path = url.pathname;

  if (method === "POST" && path === "/api/auth/login") return login(request, env);
  if (method === "POST" && path === "/api/auth/logout") return logout();
  if (method === "GET" && path === "/api/share-data") return shareData(url, env);
  if (method === "GET" && path.startsWith("/api/share/")) return shareData(new URL(`/api/share-data?token=${path.split("/").pop() ?? ""}`, url), env);
  if (method === "GET" && path.startsWith("/api/supplier/")) return supplierData(path, env);
  if (method === "POST" && path.startsWith("/supplier/") && path.endsWith("/update")) return supplierUpdate(request, path, env);
  if (method === "POST" && path.startsWith("/supplier/") && path.endsWith("/upload")) return supplierUpload(request, path, env);

  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  if (method === "GET" && path === "/api/me") {
    const packs = await listProofPacks(env, session.organization.id);
    const activity = await getRecentActivity(env, session.organization.id);
    return json({ user: session.user, organization: session.organization, stats: buildStats(packs), activity });
  }

  if (method === "GET" && path === "/api/proof-packs") {
    const packs = await Promise.all(
      (await listProofPacks(env, session.organization.id)).map(async (pack) => enrichPack(env, pack)),
    );
    return json({ proofPacks: packs });
  }

  if (method === "POST" && path === "/api/proof-packs") {
    const input = proofPackCreateSchema.parse(await request.json());
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO proof_packs (id, organization_id, title, commodity, share_token, supplier_token) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, session.organization.id, input.title, input.commodity, secureToken(), secureToken())
      .run();
    await addActivity(env, session.organization.id, id, session.user.id, "proof_pack.created", `Created ${input.title}`);
    const pack = await ensurePackAccess(env, id, session.user.id);
    return json({ proofPack: pack ? await enrichPack(env, pack) : null }, 201);
  }

  const proofPackMatch = path.match(/^\/api\/proof-packs\/([^/]+)$/);
  if (proofPackMatch && method === "GET") {
    const pack = await ensurePackAccess(env, proofPackMatch[1], session.user.id);
    return pack ? json({ proofPack: await enrichPack(env, pack) }) : json({ error: "Not found" }, 404);
  }
  if (proofPackMatch && method === "PATCH") return patchPack(request, env, session.user.id, proofPackMatch[1]);
  if (proofPackMatch && method === "DELETE") return deletePack(env, session.user.id, proofPackMatch[1]);

  const plotCreateMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/plots$/);
  if (plotCreateMatch && method === "POST") return createPlot(request, env, session.user.id, plotCreateMatch[1]);

  const documentCreateMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/documents$/);
  if (documentCreateMatch && method === "POST") return uploadDocument(request, env, session.user.id, documentCreateMatch[1]);

  const shareMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/generate-share-link$/);
  if (shareMatch && method === "POST") return generateToken(env, session.user.id, shareMatch[1], "share_token");

  const supplierMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/generate-supplier-link$/);
  if (supplierMatch && method === "POST") return generateToken(env, session.user.id, supplierMatch[1], "supplier_token");

  const exportMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/export$/);
  if (exportMatch && method === "GET") return exportPack(env, session.user.id, exportMatch[1]);

  const plotMatch = path.match(/^\/api\/plots\/([^/]+)$/);
  if (plotMatch && method === "PATCH") return patchPlot(request, env, session.user.id, plotMatch[1]);
  if (plotMatch && method === "DELETE") return deleteByChild(env, session.user.id, plotMatch[1], "plots");

  const documentMatch = path.match(/^\/api\/documents\/([^/]+)$/);
  if (documentMatch && method === "DELETE") return deleteByChild(env, session.user.id, documentMatch[1], "documents");

  if (method === "POST" && path.endsWith("/queue-zip-export")) {
    const packId = path.split("/")[3] ?? "";
    const pack = await ensurePackAccess(env, packId, session.user.id);
    if (!pack) return json({ error: "Not found" }, 404);
    // TODO: Replace with a ZIP assembly Worker that streams R2 objects into an archive.
    ctx.waitUntil(env.ZIP_EXPORT_QUEUE.send({ proofPackId: pack.id, requestedByUserId: session.user.id }));
    return json({ queued: true });
  }

  return json({ error: "Not found" }, 404);
}

async function login(request: Request, env: Env): Promise<Response> {
  const input = loginSchema.parse(await request.json());
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const email = input.email.toLowerCase();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)`).bind(userId, email, input.name ?? (email === "demo@proofpack.dev" ? "Demo User" : null)),
    env.DB.prepare(`UPDATE users SET name = COALESCE(?, name) WHERE email = ?`).bind(input.name ?? null, email),
  ]);
  const user = await env.DB.prepare(`SELECT id, email, name, created_at FROM users WHERE email = ?`).bind(email).first<{ id: string; email: string; name: string | null; created_at: string }>();
  if (!user) return json({ error: "Could not create user" }, 500);
  const existingOrg = await env.DB.prepare(
    `SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organization_members.user_id = ? LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: string }>();
  if (!existingOrg) {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, owner_user_id) VALUES (?, ?, ?)`).bind(
        organizationId,
        input.organizationName ?? (email === "demo@proofpack.dev" ? "Demo Roasters" : `${email.split("@")[0]}'s organization`),
        user.id,
      ),
      env.DB.prepare(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')`).bind(crypto.randomUUID(), organizationId, user.id),
    ]);
  }
  const sessionId = secureToken();
  const ttl = Number.parseInt(env.SESSION_TTL_SECONDS, 10) || 604800;
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`)
    .bind(sessionId, user.id, `+${ttl} seconds`)
    .run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(sessionId, ttl) });
}

function logout(): Response {
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function enrichPack(env: Env, pack: ProofPackRow) {
  const [plots, documents] = await Promise.all([getPlots(env, pack.id), getDocuments(env, pack.id)]);
  return { ...pack, plots, documents, readiness: computeReadiness(pack, plots, documents) };
}

function buildStats(packs: ProofPackRow[]) {
  const byStatus = { draft: 0, waiting_for_supplier: 0, in_review: 0, buyer_ready: 0, archived: 0 };
  for (const pack of packs) byStatus[pack.status] += 1;
  return { total: packs.length, byStatus };
}

async function patchPack(request: Request, env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const input = proofPackPatchSchema.parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return json({ proofPack: await enrichPack(env, pack) });
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
  await env.DB.prepare(`UPDATE proof_packs SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, proofPackId).run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "proof_pack.updated", "Updated proof pack details");
  const updated = await ensurePackAccess(env, proofPackId, userId);
  return updated ? json({ proofPack: await enrichPack(env, updated) }) : json({ error: "Not found" }, 404);
}

async function deletePack(env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  await env.DB.prepare(`DELETE FROM proof_packs WHERE id = ?`).bind(proofPackId).run();
  return json({ ok: true });
}

async function createPlot(request: Request, env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const input = plotSchema.parse(await request.json());
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO plots (id, proof_pack_id, plot_name, producer_name, latitude, longitude, area_size, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, proofPackId, input.plot_name, input.producer_name, input.latitude, input.longitude, input.area_size ?? null, input.notes ?? null)
    .run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "plot.created", `Added plot ${input.plot_name}`);
  return json({ plots: await getPlots(env, proofPackId) }, 201);
}

async function patchPlot(request: Request, env: Env, userId: string, plotId: string): Promise<Response> {
  const plot = await getAccessibleChild<PlotRow>(env, userId, plotId, "plots");
  if (!plot) return json({ error: "Not found" }, 404);
  const input = plotSchema.partial().parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length > 0) {
    await env.DB.prepare(`UPDATE plots SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => value), plotId).run();
  }
  return json({ plots: await getPlots(env, plot.proof_pack_id) });
}

async function uploadDocument(request: Request, env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "File is required" }, 400);
  const meta = documentMetaSchema.parse({ document_type: form.get("document_type"), notes: form.get("notes") });
  const stored = await storeUpload(env, proofPackId, file);
  await env.DB.prepare(
    `INSERT INTO documents (id, proof_pack_id, uploaded_by_user_id, document_type, original_filename, r2_key, content_type, size_bytes, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), proofPackId, userId, meta.document_type, stored.filename, stored.key, stored.contentType, stored.size, meta.notes ?? null)
    .run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "document.uploaded", `Uploaded ${stored.filename}`);
  return json({ documents: await getDocuments(env, proofPackId) }, 201);
}

async function generateToken(env: Env, userId: string, proofPackId: string, field: "share_token" | "supplier_token"): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const token = secureToken();
  await env.DB.prepare(`UPDATE proof_packs SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(token, proofPackId).run();
  const path = field === "share_token" ? "share" : "supplier";
  return json({ token, url: `${env.APP_URL}/${path}/${token}` });
}

async function shareData(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE share_token = ?`).bind(token).first<ProofPackRow>();
  return pack ? json({ proofPack: await enrichPack(env, pack), disclaimer: "Prepared by EUDR ProofPack - not a legal certification." }) : json({ error: "Share link not found" }, 404);
}

async function supplierData(path: string, env: Env): Promise<Response> {
  const token = path.split("/").pop() ?? "";
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Supplier link not found" }, 404);
  const { buyer_email, share_token, organization_id, ...supplierSafePack } = pack;
  await Promise.resolve({ buyer_email, share_token, organization_id });
  return json({ proofPack: supplierSafePack, plots: await getPlots(env, pack.id), documents: await getDocuments(env, pack.id) });
}

async function supplierUpdate(request: Request, path: string, env: Env): Promise<Response> {
  const token = path.split("/")[2] ?? "";
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Supplier link not found" }, 404);
  const input = supplierUpdateSchema.parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length > 0) {
    const values = entries.map(([, value]) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
    await env.DB.prepare(`UPDATE proof_packs SET ${entries.map(([key]) => `${key} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...values, pack.id)
      .run();
  }
  await addActivity(env, pack.organization_id, pack.id, null, "supplier.updated", "Supplier updated assigned fields");
  const updated = await env.DB.prepare(`SELECT * FROM proof_packs WHERE id = ?`).bind(pack.id).first<ProofPackRow>();
  return updated ? json({ proofPack: await enrichPack(env, updated) }) : json({ error: "Not found" }, 404);
}

async function supplierUpload(request: Request, path: string, env: Env): Promise<Response> {
  const token = path.split("/")[2] ?? "";
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Supplier link not found" }, 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "File is required" }, 400);
  const meta = documentMetaSchema.parse({ document_type: form.get("document_type"), notes: form.get("notes") });
  const stored = await storeUpload(env, pack.id, file);
  await env.DB.prepare(
    `INSERT INTO documents (id, proof_pack_id, document_type, original_filename, r2_key, content_type, size_bytes, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), pack.id, meta.document_type, stored.filename, stored.key, stored.contentType, stored.size, meta.notes ?? null)
    .run();
  await addActivity(env, pack.organization_id, pack.id, null, "supplier.document_uploaded", `Supplier uploaded ${stored.filename}`);
  return json({ documents: await getDocuments(env, pack.id) }, 201);
}

async function exportPack(env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const enriched = await enrichPack(env, pack);
  const body = JSON.stringify({ proofPack: enriched, disclaimer: "EUDR readiness support only. Not legal advice or official certification." }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pack.title.replace(/[^\w-]+/g, "-")}-proof-pack.json"`,
    },
  });
}

async function getAccessibleChild<T extends { proof_pack_id: string }>(env: Env, userId: string, childId: string, table: "plots" | "documents"): Promise<T | null> {
  return env.DB.prepare(
    `SELECT ${table}.* FROM ${table}
     JOIN proof_packs ON proof_packs.id = ${table}.proof_pack_id
     JOIN organization_members ON organization_members.organization_id = proof_packs.organization_id
     WHERE ${table}.id = ? AND organization_members.user_id = ?`,
  )
    .bind(childId, userId)
    .first<T>();
}

async function deleteByChild(env: Env, userId: string, childId: string, table: "plots" | "documents"): Promise<Response> {
  const child = await getAccessibleChild<PlotRow | DocumentRow>(env, userId, childId, table);
  if (!child) return json({ error: "Not found" }, 404);
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(childId).run();
  return json({ ok: true });
}
