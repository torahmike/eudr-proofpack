import { ZodError } from "zod";
import { createAndSendVerification, shouldRequireVerifiedEmail, verificationDto, verifyEmailToken } from "./auth/emailVerification";
import { clearOAuthStateCookie, completeGoogleOAuth, oauthProviders, startGoogleOAuth } from "./auth/oauth";
import { clearSessionCookie, isResponse, json, requireSession, secureToken, securityHeaders, sessionCookie, withSecurityHeaders } from "./auth/session";
import { addActivity, checkRateLimit, ensurePackAccess, getDocuments, getPackRole, getPlots, getRecentActivity, listProofPacks, revokeSession } from "./db/queries";
import type { DocumentRow, MemberRole, PlotRow, ProofPackRow, UserRow } from "./db/types";
import { computeReadiness } from "./routes/score";
import { storeUpload } from "./storage/files";
import { buildProofPackZip } from "./export/zip";
import { documentMetaSchema, loginSchema, plotSchema, proofPackCreateSchema, proofPackPatchSchema, supplierUpdateSchema, verifyEmailSchema } from "./validation/schemas";

interface ZipExportMessage {
  proofPackId: string;
  requestedByUserId: string | null;
}

interface PasswordHash {
  hash: string;
  salt: string;
}

const apiPrefix = "/api/";
const mutatingMethods = new Set(["POST", "PATCH", "DELETE", "PUT"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith(apiPrefix) || url.pathname.startsWith("/supplier/")) {
        return await route(request, env, ctx, url);
      }
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.log(JSON.stringify({ level: "error", message, path: url.pathname }));
      if (error instanceof ZodError) return json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
      return json({ error: "Internal server error" }, 500);
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
  if (mutatingMethods.has(method) && !isAllowedOrigin(request, env)) return json({ error: "Invalid request origin" }, 403);

  if (method === "GET" && path === "/api/auth/oauth/providers") return json({ providers: oauthProviders(env) });
  if (method === "GET" && path === "/api/auth/oauth/google/start") return startGoogleOAuth(request, env);
  if (method === "GET" && path === "/api/auth/oauth/google/callback") return googleOAuthCallback(request, env);
  if (method === "POST" && path === "/api/auth/login") return login(request, env, ctx);
  if (method === "POST" && path === "/api/auth/verify-email") return verifyEmail(request, env);
  if (method === "POST" && path === "/api/auth/logout") {
    const session = await requireSession(request, env);
    if (!isResponse(session)) await revokeSession(env, session.sessionId);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }
  if (method === "GET" && path === "/api/share-data") return shareData(request, url, env);
  if (method === "GET" && path.startsWith("/api/share/")) return shareData(request, new URL(`/api/share-data?token=${path.split("/").pop() ?? ""}`, url), env);
  if (method === "GET" && path.startsWith("/api/supplier/")) return supplierData(request, path, env);
  if (method === "POST" && path.startsWith("/supplier/") && path.endsWith("/update")) return supplierUpdate(request, path, env);
  if (method === "POST" && path.startsWith("/supplier/") && path.endsWith("/upload")) return supplierUpload(request, path, env);

  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  if (method === "POST" && path === "/api/auth/resend-verification") return resendVerification(request, env, session.user);

  if (shouldRequireVerifiedEmail(env) && !session.user.email_verified_at && path !== "/api/me") return json({ error: "Email verification required" }, 403);

  if (method === "GET" && path === "/api/me") {
    const packs = await listProofPacks(env, session.organization.id);
    const activity = await getRecentActivity(env, session.organization.id);
    return json({ user: userDto(session.user), verification: verificationDto(session.user), organization: session.organization, membership: session.membership, stats: buildStats(packs), activity });
  }

  if (method === "GET" && path === "/api/proof-packs") {
    const packs = await Promise.all((await listProofPacks(env, session.organization.id)).map(async (pack) => enrichPack(env, pack)));
    return json({ proofPacks: packs });
  }

  if (method === "POST" && path === "/api/proof-packs") {
    if (!canWrite(session.membership.role)) return json({ error: "Insufficient permissions" }, 403);
    const input = proofPackCreateSchema.parse(await request.json());
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO proof_packs (id, organization_id, title, commodity, share_token, supplier_token) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, session.organization.id, input.title, input.commodity, secureToken(), secureToken()).run();
    await addActivity(env, session.organization.id, id, session.user.id, "proof_pack.created", `Created ${input.title}`, request);
    const pack = await ensurePackAccess(env, id, session.user.id);
    return json({ proofPack: pack ? await enrichPack(env, pack) : null }, 201);
  }

  const proofPackMatch = path.match(/^\/api\/proof-packs\/([^/]+)$/);
  if (proofPackMatch && method === "GET") {
    const pack = await ensurePackAccess(env, proofPackMatch[1], session.user.id);
    return pack ? json({ proofPack: await enrichPack(env, pack) }) : json({ error: "Not found" }, 404);
  }
  if (proofPackMatch && method === "PATCH") return patchPack(request, env, session.user.id, session.membership.role, proofPackMatch[1]);
  if (proofPackMatch && method === "DELETE") return deletePack(request, env, session.user.id, session.membership.role, proofPackMatch[1]);

  const plotCreateMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/plots$/);
  if (plotCreateMatch && method === "POST") return createPlot(request, env, session.user.id, session.membership.role, plotCreateMatch[1]);

  const documentCreateMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/documents$/);
  if (documentCreateMatch && method === "POST") return uploadDocument(request, env, session.user.id, session.membership.role, documentCreateMatch[1]);

  const shareMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/generate-share-link$/);
  if (shareMatch && method === "POST") return generateToken(request, env, session.user.id, session.membership.role, shareMatch[1], "share_token");

  const supplierMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/generate-supplier-link$/);
  if (supplierMatch && method === "POST") return generateToken(request, env, session.user.id, session.membership.role, supplierMatch[1], "supplier_token");

  const exportMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/export$/);
  if (exportMatch && method === "GET") return exportPack(request, env, session.user.id, exportMatch[1]);

  const zipExportMatch = path.match(/^\/api\/proof-packs\/([^/]+)\/zip-export$/);
  if (zipExportMatch && method === "GET") return exportZipPack(request, env, session.user.id, zipExportMatch[1]);

  const plotMatch = path.match(/^\/api\/plots\/([^/]+)$/);
  if (plotMatch && method === "PATCH") return patchPlot(request, env, session.user.id, session.membership.role, plotMatch[1]);
  if (plotMatch && method === "DELETE") return deleteByChild(request, env, session.user.id, session.membership.role, plotMatch[1], "plots");

  const documentMatch = path.match(/^\/api\/documents\/([^/]+)$/);
  if (documentMatch && method === "DELETE") return deleteByChild(request, env, session.user.id, session.membership.role, documentMatch[1], "documents");

  if (method === "POST" && path.endsWith("/queue-zip-export")) {
    if (!canWrite(session.membership.role)) return json({ error: "Insufficient permissions" }, 403);
    const packId = path.split("/")[3] ?? "";
    const pack = await ensurePackAccess(env, packId, session.user.id);
    if (!pack) return json({ error: "Not found" }, 404);
    await addActivity(env, pack.organization_id, pack.id, session.user.id, "export.zip_ready", "Prepared ZIP export URL", request);
    await Promise.resolve(ctx);
    return json({ queued: false, url: `${env.APP_URL}/api/proof-packs/${pack.id}/zip-export` });
  }

  return json({ error: "Not found" }, 404);
}

async function googleOAuthCallback(request: Request, env: Env): Promise<Response> {
  const userOrResponse = await completeGoogleOAuth(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;
  const sessionId = secureToken();
  const ttl = Number.parseInt(env.SESSION_TTL_SECONDS, 10) || 604800;
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, datetime('now', ?), ?, ?)`).bind(sessionId, userOrResponse.id, `+${ttl} seconds`, request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent")).run();
  const headers = new Headers({ Location: "/app" });
  headers.append("Set-Cookie", sessionCookie(sessionId, ttl));
  headers.append("Set-Cookie", clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
}

async function login(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const identity = `${request.headers.get("CF-Connecting-IP") ?? "unknown"}:${request.headers.get("User-Agent") ?? "unknown"}`;
  if (!(await checkRateLimit(env, "auth.login", identity, 10, 900))) return json({ error: "Too many login attempts" }, 429);

  const input = loginSchema.parse(await request.json());
  const email = input.email.toLowerCase();
  const existing = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<UserRow>();

  let user = existing;
  if (existing?.password_hash && existing.password_salt) {
    if (!(await verifyPassword(input.password, existing.password_salt, existing.password_hash))) return json({ error: "Invalid email or password" }, 401);
  } else if (existing) {
    const password = await hashPassword(input.password);
    await env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, password_updated_at = CURRENT_TIMESTAMP, name = COALESCE(?, name) WHERE id = ?`).bind(password.hash, password.salt, input.name ?? null, existing.id).run();
    user = { ...existing, password_hash: password.hash, password_salt: password.salt, password_updated_at: new Date().toISOString(), name: input.name ?? existing.name };
  } else {
    const password = await hashPassword(input.password);
    const userId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, name, password_hash, password_salt, password_updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).bind(userId, email, input.name ?? null, password.hash, password.salt),
      env.DB.prepare(`INSERT INTO organizations (id, name, owner_user_id) VALUES (?, ?, ?)`).bind(organizationId, input.organizationName ?? `${email.split("@")[0]}'s organization`, userId),
      env.DB.prepare(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')`).bind(crypto.randomUUID(), organizationId, userId),
    ]);
    user = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first<UserRow>();
  }
  if (!user) return json({ error: "Could not create user" }, 500);

  const sessionId = secureToken();
  const ttl = Number.parseInt(env.SESSION_TTL_SECONDS, 10) || 604800;
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, datetime('now', ?), ?, ?)`).bind(sessionId, user.id, `+${ttl} seconds`, request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent")).run();
  const verification = user.email_verified_at ? verificationDto(user) : await createAndSendVerification(env, user, request);
  await Promise.resolve(ctx);
  return json({ ok: true, verification }, 200, { "Set-Cookie": sessionCookie(sessionId, ttl) });
}

async function verifyEmail(request: Request, env: Env): Promise<Response> {
  const input = verifyEmailSchema.parse(await request.json());
  const user = await verifyEmailToken(env, input.token);
  return user ? json({ ok: true, verification: verificationDto(user) }) : json({ error: "Invalid or expired verification token" }, 400);
}

async function resendVerification(request: Request, env: Env, user: UserRow): Promise<Response> {
  if (!(await checkRateLimit(env, "auth.verify_email", user.id, 5, 3600))) return json({ error: "Too many verification emails" }, 429);
  const result = await createAndSendVerification(env, user, request);
  return json({ verification: result });
}

async function enrichPack(env: Env, pack: ProofPackRow) {
  const [plots, documents] = await Promise.all([getPlots(env, pack.id), getDocuments(env, pack.id)]);
  return { ...pack, documents: documents.map(documentDto), plots, readiness: computeReadiness(pack, plots, documents) };
}

function buildStats(packs: ProofPackRow[]) {
  const byStatus = { draft: 0, waiting_for_supplier: 0, in_review: 0, buyer_ready: 0, archived: 0 };
  for (const pack of packs) byStatus[pack.status] += 1;
  return { total: packs.length, byStatus };
}

async function patchPack(request: Request, env: Env, userId: string, role: MemberRole, proofPackId: string): Promise<Response> {
  if (!canWrite(role)) return json({ error: "Insufficient permissions" }, 403);
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const input = proofPackPatchSchema.parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return json({ proofPack: await enrichPack(env, pack) });
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
  await env.DB.prepare(`UPDATE proof_packs SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, proofPackId).run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "proof_pack.updated", "Updated proof pack details", request);
  const updated = await ensurePackAccess(env, proofPackId, userId);
  return updated ? json({ proofPack: await enrichPack(env, updated) }) : json({ error: "Not found" }, 404);
}

async function deletePack(request: Request, env: Env, userId: string, role: MemberRole, proofPackId: string): Promise<Response> {
  if (!canAdmin(role)) return json({ error: "Insufficient permissions" }, 403);
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  await deletePackDocuments(env, proofPackId);
  await env.DB.prepare(`DELETE FROM proof_packs WHERE id = ?`).bind(proofPackId).run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "proof_pack.deleted", "Deleted proof pack and associated files", request);
  return json({ ok: true });
}

async function createPlot(request: Request, env: Env, userId: string, role: MemberRole, proofPackId: string): Promise<Response> {
  if (!canWrite(role)) return json({ error: "Insufficient permissions" }, 403);
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const input = plotSchema.parse(await request.json());
  await env.DB.prepare(`INSERT INTO plots (id, proof_pack_id, plot_name, producer_name, latitude, longitude, area_size, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), proofPackId, input.plot_name, input.producer_name, input.latitude, input.longitude, input.area_size ?? null, input.notes ?? null).run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "plot.created", `Added plot ${input.plot_name}`, request);
  return json({ plots: await getPlots(env, proofPackId) }, 201);
}

async function patchPlot(request: Request, env: Env, userId: string, role: MemberRole, plotId: string): Promise<Response> {
  if (!canWrite(role)) return json({ error: "Insufficient permissions" }, 403);
  const plot = await getAccessibleChild<PlotRow>(env, userId, plotId, "plots");
  if (!plot) return json({ error: "Not found" }, 404);
  const input = plotSchema.partial().parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length > 0) await env.DB.prepare(`UPDATE plots SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => value), plotId).run();
  return json({ plots: await getPlots(env, plot.proof_pack_id) });
}

async function uploadDocument(request: Request, env: Env, userId: string, role: MemberRole, proofPackId: string): Promise<Response> {
  if (!canWrite(role)) return json({ error: "Insufficient permissions" }, 403);
  if (!(await checkRateLimit(env, "document.upload", request.headers.get("CF-Connecting-IP") ?? userId, 30, 3600))) return json({ error: "Too many uploads" }, 429);
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "File is required" }, 400);
  const meta = documentMetaSchema.parse({ document_type: form.get("document_type"), notes: form.get("notes") });
  const stored = await storeUpload(env, proofPackId, file);
  await env.DB.prepare(`INSERT INTO documents (id, proof_pack_id, uploaded_by_user_id, document_type, original_filename, r2_key, content_type, size_bytes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), proofPackId, userId, meta.document_type, stored.filename, stored.key, stored.contentType, stored.size, meta.notes ?? null).run();
  await addActivity(env, pack.organization_id, proofPackId, userId, "document.uploaded", `Uploaded ${stored.filename}`, request);
  return json({ documents: (await getDocuments(env, proofPackId)).map(documentDto) }, 201);
}

async function generateToken(request: Request, env: Env, userId: string, role: MemberRole, proofPackId: string, field: "share_token" | "supplier_token"): Promise<Response> {
  if (!canAdmin(role)) return json({ error: "Insufficient permissions" }, 403);
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const token = secureToken();
  await env.DB.prepare(`UPDATE proof_packs SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(token, proofPackId).run();
  const path = field === "share_token" ? "share" : "supplier";
  await addActivity(env, pack.organization_id, proofPackId, userId, `${path}.token_rotated`, `Generated ${path} token`, request);
  return json({ token, url: `${env.APP_URL}/${path}/${token}` });
}

async function shareData(request: Request, url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  if (!(await checkRateLimit(env, "share.read", request.headers.get("CF-Connecting-IP") ?? "unknown", 120, 3600))) return json({ error: "Too many requests" }, 429);
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE share_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Share link not found" }, 404);
  return json({ proofPack: await publicPackDto(env, pack, "buyer"), disclaimer: "Prepared by EUDR ProofPack - not a legal certification." });
}

async function supplierData(request: Request, path: string, env: Env): Promise<Response> {
  const token = path.split("/").pop() ?? "";
  if (!(await checkRateLimit(env, "supplier.read", request.headers.get("CF-Connecting-IP") ?? "unknown", 120, 3600))) return json({ error: "Too many requests" }, 429);
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  return pack ? json({ proofPack: await publicPackDto(env, pack, "supplier") }) : json({ error: "Supplier link not found" }, 404);
}

async function supplierUpdate(request: Request, path: string, env: Env): Promise<Response> {
  const token = path.split("/")[2] ?? "";
  if (!(await checkRateLimit(env, "supplier.update", request.headers.get("CF-Connecting-IP") ?? token, 30, 3600))) return json({ error: "Too many requests" }, 429);
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Supplier link not found" }, 404);
  const input = supplierUpdateSchema.parse(await request.json());
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length > 0) {
    const values = entries.map(([, value]) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
    await env.DB.prepare(`UPDATE proof_packs SET ${entries.map(([key]) => `${key} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, pack.id).run();
  }
  await addActivity(env, pack.organization_id, pack.id, null, "supplier.updated", "Supplier updated assigned fields", request);
  const updated = await env.DB.prepare(`SELECT * FROM proof_packs WHERE id = ?`).bind(pack.id).first<ProofPackRow>();
  return updated ? json({ proofPack: await publicPackDto(env, updated, "supplier") }) : json({ error: "Not found" }, 404);
}

async function supplierUpload(request: Request, path: string, env: Env): Promise<Response> {
  const token = path.split("/")[2] ?? "";
  if (!(await checkRateLimit(env, "supplier.upload", request.headers.get("CF-Connecting-IP") ?? token, 20, 3600))) return json({ error: "Too many uploads" }, 429);
  const pack = await env.DB.prepare(`SELECT * FROM proof_packs WHERE supplier_token = ?`).bind(token).first<ProofPackRow>();
  if (!pack) return json({ error: "Supplier link not found" }, 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "File is required" }, 400);
  const meta = documentMetaSchema.parse({ document_type: form.get("document_type"), notes: form.get("notes") });
  const stored = await storeUpload(env, pack.id, file);
  await env.DB.prepare(`INSERT INTO documents (id, proof_pack_id, document_type, original_filename, r2_key, content_type, size_bytes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), pack.id, meta.document_type, stored.filename, stored.key, stored.contentType, stored.size, meta.notes ?? null).run();
  await addActivity(env, pack.organization_id, pack.id, null, "supplier.document_uploaded", `Supplier uploaded ${stored.filename}`, request);
  return json({ documents: (await getDocuments(env, pack.id)).map(documentDto) }, 201);
}

async function exportPack(request: Request, env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  await addActivity(env, pack.organization_id, pack.id, userId, "proof_pack.exported", "Downloaded proof pack summary", request);
  const body = JSON.stringify({ proofPack: await publicPackDto(env, pack, "buyer"), disclaimer: "EUDR readiness support only. Not legal advice or official certification." }, null, 2);
  return new Response(body, { headers: { ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${pack.title.replace(/[^\w-]+/g, "-")}-proof-pack.json"` } });
}

async function getAccessibleChild<T extends { proof_pack_id: string }>(env: Env, userId: string, childId: string, table: "plots" | "documents"): Promise<T | null> {
  return env.DB.prepare(`SELECT ${table}.* FROM ${table} JOIN proof_packs ON proof_packs.id = ${table}.proof_pack_id JOIN organization_members ON organization_members.organization_id = proof_packs.organization_id WHERE ${table}.id = ? AND organization_members.user_id = ?`).bind(childId, userId).first<T>();
}

async function deleteByChild(request: Request, env: Env, userId: string, role: MemberRole, childId: string, table: "plots" | "documents"): Promise<Response> {
  if (!canWrite(role)) return json({ error: "Insufficient permissions" }, 403);
  const child = await getAccessibleChild<PlotRow | DocumentRow>(env, userId, childId, table);
  if (!child) return json({ error: "Not found" }, 404);
  const pack = await ensurePackAccess(env, child.proof_pack_id, userId);
  if (table === "documents" && "r2_key" in child) await env.PROOF_PACK_FILES.delete(child.r2_key);
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(childId).run();
  if (pack) await addActivity(env, pack.organization_id, pack.id, userId, `${table}.deleted`, `Deleted ${table.slice(0, -1)}`, request);
  return json({ ok: true });
}

async function deletePackDocuments(env: Env, proofPackId: string): Promise<void> {
  const documents = await getDocuments(env, proofPackId);
  await Promise.all(documents.map((document) => env.PROOF_PACK_FILES.delete(document.r2_key)));
}

async function publicPackDto(env: Env, pack: ProofPackRow, audience: "buyer" | "supplier") {
  const [plots, documents] = await Promise.all([getPlots(env, pack.id), getDocuments(env, pack.id)]);
  const readiness = computeReadiness(pack, plots, documents);
  const common = {
    id: pack.id,
    title: pack.title,
    status: pack.status,
    commodity: pack.commodity,
    product_name: pack.product_name,
    hs_code: pack.hs_code,
    quantity: pack.quantity,
    batch_number: pack.batch_number,
    production_country: pack.production_country,
    export_country: pack.export_country,
    destination_country: pack.destination_country,
    production_date_start: pack.production_date_start,
    production_date_end: pack.production_date_end,
    supplier_company: pack.supplier_company,
    supplier_contact: pack.supplier_contact,
    supplier_email: pack.supplier_email,
    supplier_country: pack.supplier_country,
    supplier_declaration_confirmed: pack.supplier_declaration_confirmed,
    created_at: pack.created_at,
    updated_at: pack.updated_at,
    readiness,
  };
  if (audience === "supplier") {
    return { ...common, open_questions: pack.open_questions, supplier_risk_notes: pack.supplier_risk_notes, documents: documents.map(documentDto) };
  }
  return {
    ...common,
    buyer_company: pack.buyer_company,
    buyer_contact: pack.buyer_contact,
    buyer_email: pack.buyer_email,
    buyer_country: pack.buyer_country,
    eori_number: pack.eori_number,
    internal_reference: pack.internal_reference,
    risk_level: pack.risk_level,
    risk_notes: pack.risk_notes,
    reviewer_notes: pack.reviewer_notes,
    country_risk_notes: pack.country_risk_notes,
    supplier_risk_notes: pack.supplier_risk_notes,
    geolocation_completeness: pack.geolocation_completeness,
    missing_documents: pack.missing_documents,
    open_questions: pack.open_questions,
    plots,
    documents: documents.map(documentDto),
  };
}

function documentDto(document: DocumentRow) {
  return {
    id: document.id,
    proof_pack_id: document.proof_pack_id,
    uploaded_by_user_id: document.uploaded_by_user_id,
    document_type: document.document_type,
    original_filename: document.original_filename,
    content_type: document.content_type,
    size_bytes: document.size_bytes,
    notes: document.notes,
    created_at: document.created_at,
  };
}

async function exportZipPack(request: Request, env: Env, userId: string, proofPackId: string): Promise<Response> {
  const pack = await ensurePackAccess(env, proofPackId, userId);
  if (!pack) return json({ error: "Not found" }, 404);
  const archive = await buildProofPackZip(env, pack);
  await addActivity(env, pack.organization_id, pack.id, userId, "proof_pack.zip_exported", `Downloaded ZIP export${archive.skippedFiles.length ? " with missing files" : ""}`, request);
  const body = archive.bytes.buffer.slice(archive.bytes.byteOffset, archive.bytes.byteOffset + archive.bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { ...securityHeaders(), "Content-Type": "application/zip", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${archive.filename}"` } });
}

function userDto(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name, email_verified_at: user.email_verified_at, created_at: user.created_at };
}

function canWrite(role: MemberRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

function canAdmin(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === env.APP_URL;
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);
  const hash = await derivePassword(password, salt);
  return { hash, salt };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actualHash = await derivePassword(password, salt);
  return timingSafeEqual(actualHash, expectedHash);
}

async function derivePassword(password: string, salt: string): Promise<string> {
  const material = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}






