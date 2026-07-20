import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Box,
  Building2,
  Check,
  ClipboardList,
  FileArchive,
  FileText,
  Globe2,
  Layers3,
  Link as LinkIcon,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  PackagePlus,
  ShieldCheck,
  Send,
  Sprout,
  Upload,
  X,
} from "lucide-react";
import "./styles.css";

type Status = "draft" | "waiting_for_supplier" | "in_review" | "buyer_ready" | "archived";
type RiskLevel = "low" | "medium" | "high" | "unknown";

interface Plot {
  id: string;
  plot_name: string;
  producer_name: string;
  latitude: number;
  longitude: number;
  area_size: string | null;
  notes: string | null;
}

interface ProofDocument {
  id: string;
  document_type: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

interface Readiness {
  percentage: number;
  missingItems: string[];
  suggestedNextAction: string;
}

interface ProofPack {
  id: string;
  title: string;
  status: Status;
  commodity: string;
  product_name: string;
  hs_code: string | null;
  quantity: string;
  batch_number: string;
  production_country: string;
  export_country: string;
  destination_country: string;
  production_date_start: string | null;
  production_date_end: string | null;
  buyer_company: string;
  buyer_contact: string;
  buyer_email: string;
  buyer_country: string;
  eori_number: string | null;
  internal_reference: string | null;
  supplier_company: string;
  supplier_contact: string;
  supplier_email: string;
  supplier_country: string;
  supplier_declaration_confirmed: number | boolean;
  risk_level: RiskLevel;
  risk_notes: string | null;
  reviewer_notes: string | null;
  country_risk_notes: string | null;
  supplier_risk_notes: string | null;
  geolocation_completeness: string | null;
  missing_documents: string | null;
  open_questions: string | null;
  share_token: string | null;
  supplier_token: string | null;
  created_at: string;
  updated_at: string;
  plots: Plot[];
  documents: ProofDocument[];
  readiness: Readiness;
}

interface MeResponse {
  user: { email: string; name: string | null; email_verified_at?: string | null };
  verification: { emailVerified: boolean; emailVerifiedAt: string | null };
  organization: { name: string };
  stats: { total: number; byStatus: Record<Status, number> };
  activity: { id: string; message: string; event_type: string; created_at: string }[];
  billing: {
    plan: { id: string; name: string; priceMonthlyEur: number | null };
    usage: { activeProofPacks: number; totalProofPacks: number; members: number };
    extraProofPackAllowance: number;
    effectiveLimits: { activeProofPacks: number | null; members: number | null };
    canCreateProofPack: boolean;
    canAddMember: boolean;
  };
}

const commodities = ["coffee", "cocoa", "wood", "rubber", "soy", "palm_oil", "cattle", "other"];
const statuses: Status[] = ["draft", "waiting_for_supplier", "in_review", "buyer_ready", "archived"];
const docTypes = [
  ["supplier_declaration", "Supplier declaration"],
  ["land_use_evidence", "Land-use evidence"],
  ["harvest_records", "Harvest or production records"],
  ["chain_of_custody", "Chain of custody"],
  ["transport_docs", "Transport docs"],
  ["certification", "Certification"],
  ["other", "Other supporting file"],
];

function App() {
  const path = window.location.pathname;
  let page: React.ReactNode;
  if (path.startsWith("/share/")) page = <SharePage token={path.split("/")[2] ?? ""} />;
  else if (path.startsWith("/supplier/")) page = <SupplierPortal token={path.split("/")[2] ?? ""} />;
  else if (path === "/login") page = <LoginPage />;
  else if (path === "/verify-email") page = <VerifyEmailPage />;
  else if (path === "/pricing") page = <LandingPage pricingOnly />;
  else if (path.startsWith("/app")) page = <Dashboard />;
  else page = <LandingPage />;
  return <>{page}<FeedbackWidget /></>;
}

function LandingPage({ pricingOnly = false }: { pricingOnly?: boolean }) {
  const tiers = [
    {
      name: "Starter",
      price: "\u20ac49",
      description: "For small importers and exporters preparing their first EUDR evidence packs.",
      features: ["1 user", "5 active proof packs", "Supplier upload links", "Basic ZIP/PDF export"],
      highlighted: false,
    },
    {
      name: "Growth",
      price: "\u20ac149",
      description: "For recurring shipments and teams that need a repeatable supplier evidence workflow.",
      features: ["3-5 users", "25 active proof packs", "Supplier portal", "Audit trail and branded exports"],
      highlighted: true,
    },
    {
      name: "Consultant",
      price: "\u20ac399",
      description: "For compliance consultants, brokers, and operators managing multiple clients.",
      features: ["15 users", "100+ proof packs", "Multi-client workspace", "Bulk CSV import and priority support"],
      highlighted: false,
    },
  ];
  return (
    <main className="min-h-screen bg-flax text-ink">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <a className="flex items-center gap-2 font-semibold" href="/">
          <ShieldCheck className="h-6 w-6 text-leaf" /> EUDR ProofPack
        </a>
        <div className="flex items-center gap-3 text-sm">
          <a href="/pricing" className="hidden text-ink/70 sm:inline">Pricing</a>
          <a href="/login" className="rounded-md border border-ink/15 px-3 py-2">Log in</a>
        </div>
      </nav>
      {!pricingOnly && (
        <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-leaf shadow-sm">
              <Sprout className="h-4 w-4" /> Due-diligence support for regulated commodities
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-normal sm:text-6xl">Create buyer-ready EUDR evidence packs in minutes</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
              Collect geolocation, supplier declarations, product records, and due-diligence documents in one shareable packet for importers and suppliers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login" className="inline-flex items-center gap-2 rounded-md bg-leaf px-5 py-3 font-medium text-white shadow-soft">
                Create free proof pack <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#how" className="inline-flex items-center rounded-md border border-ink/15 px-5 py-3 font-medium">How it works</a>
            </div>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-ink/60">Proof Pack Summary</span>
              <span className="rounded-full bg-moss/15 px-3 py-1 text-xs font-semibold text-leaf">78% ready</span>
            </div>
            <div className="space-y-3">
              {["Supplier declaration", "Plot coordinates", "Land-use evidence", "Risk notes"].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-steel/70 p-3">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-leaf" /> {item}</span>
                  <span className={index === 3 ? "text-clay" : "text-leaf"}>{index === 3 ? "Review" : "Ready"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["coffee", "cocoa", "wood", "rubber", "soy", "cattle", "palm oil"].map((item) => (
            <div key={item} className="rounded-lg border border-ink/10 bg-white p-4">
              <Layers3 className="mb-3 h-5 w-5 text-clay" />
              <h3 className="font-semibold capitalize">{item}</h3>
              <p className="mt-1 text-sm text-ink/65">Evidence packet workflows for common EUDR readiness records.</p>
            </div>
          ))}
        </div>
      </section>
      <section id="how" className="bg-white py-14">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 md:grid-cols-3">
          {["Collect", "Verify", "Export/share"].map((step, index) => (
            <div key={step} className="border-l-4 border-leaf bg-flax p-5">
              <span className="text-sm font-semibold text-clay">0{index + 1}</span>
              <h2 className="mt-2 text-xl font-semibold">{step}</h2>
              <p className="mt-2 text-ink/65">Guide importers and suppliers from missing fields to buyer-ready documentation.</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-clay">EUR launch pricing</p>
            <h2 className="mt-2 text-3xl font-semibold">EUDR compliance without an ESG platform rollout</h2>
            <p className="mt-3 max-w-2xl text-ink/65">
              Start self-serve, invite suppliers, and export buyer-ready evidence bundles without waiting for an enterprise implementation.
            </p>
          </div>
          <a href="/login" className="inline-flex items-center gap-2 rounded-md bg-leaf px-5 py-3 font-medium text-white shadow-soft">
            Start with Growth <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.name} className={`rounded-lg border bg-white p-5 ${tier.highlighted ? "border-leaf shadow-soft" : "border-ink/10"}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                {tier.highlighted && <span className="rounded-full bg-leaf/10 px-3 py-1 text-xs font-semibold text-leaf">Best fit</span>}
              </div>
              <p className="mt-4 text-4xl font-semibold">{tier.price}<span className="text-base font-medium text-ink/55">/mo</span></p>
              <p className="mt-3 min-h-[3.5rem] text-sm leading-6 text-ink/65">{tier.description}</p>
              <ul className="mt-5 space-y-3 text-sm">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <h3 className="font-semibold">Pay-as-you-go</h3>
            <p className="mt-2 text-sm text-ink/65">For one-off needs and seasonal EUDR work.</p>
            <p className="mt-4 text-2xl font-semibold">&euro;99<span className="text-sm font-medium text-ink/55"> single proof pack</span></p>
            <p className="mt-2 text-sm text-ink/65">Extra active proof packs are &euro;25 each.</p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <h3 className="font-semibold">Enterprise</h3>
            <p className="mt-2 text-sm text-ink/65">For SSO, API access, custom retention, dedicated onboarding, and future ERP or TRACES workflows.</p>
            <p className="mt-4 text-2xl font-semibold">From &euro;1,000<span className="text-sm font-medium text-ink/55">/mo</span></p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-flax p-5">
            <h3 className="font-semibold">Launch positioning</h3>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              Built for SMEs, suppliers, and consultants who need audit-ready evidence packs before they need a full ESG operating system.
            </p>
          </div>
        </div>
      </section>
      <section className="bg-ink py-10 text-white">
        <div className="mx-auto max-w-7xl px-5">
          <h2 className="text-2xl font-semibold">Compliance disclaimer</h2>
          <p className="mt-2 max-w-3xl text-white/75">
            EUDR ProofPack supports evidence collection and documentation readiness. It is not legal advice, not official certification, and does not guarantee compliance.
          </p>
        </div>
      </section>
    </main>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleOAuth, setGoogleOAuth] = useState(false);
  useEffect(() => {
    const errorParam = new URLSearchParams(window.location.search).get("oauth_error");
    if (errorParam) setError(errorParam);
    void api<{ providers: { google: boolean } }>("/api/auth/oauth/providers")
      .then((data) => setGoogleOAuth(data.providers.google))
      .catch(() => setGoogleOAuth(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      window.location.href = "/app";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-flax px-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <ShieldCheck className="h-8 w-8 text-leaf" />
        <h1 className="mt-4 text-2xl font-semibold">Sign in to EUDR ProofPack</h1>
        <p className="mt-2 text-sm text-ink/65">Enter an email and a 12+ character password. New emails create an account; existing emails must use their password.</p>
        {googleOAuth && (
          <a href="/api/auth/oauth/google/start" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 px-4 py-3 font-medium text-ink">
            <ShieldCheck className="h-4 w-4 text-leaf" /> Continue with Google
          </a>
        )}
        {googleOAuth && <div className="mt-4 flex items-center gap-3 text-xs text-ink/45"><span className="h-px flex-1 bg-ink/10" /><span>or</span><span className="h-px flex-1 bg-ink/10" /></div>}
        <label className="mt-5 block text-sm font-medium">Email</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3" type="email" />
        <label className="mt-4 block text-sm font-medium">Password</label>
        <input value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3" type="password" minLength={12} autoComplete="current-password" />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 font-medium text-white" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Continue
        </button>
      </form>
    </main>
  );
}

function VerifyEmailPage() {
  const [message, setMessage] = useState("Verifying your email...");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setMessage("Verification token is missing.");
      return;
    }
    void api<{ ok: boolean }>("/api/auth/verify-email", { method: "POST", body: { token } })
      .then(() => {
        setOk(true);
        setMessage("Email verified. You can return to your workspace.");
      })
      .catch((caught) => setMessage(caught instanceof Error ? caught.message : "Could not verify email"));
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-flax px-5 text-ink">
      <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        {ok ? <BadgeCheck className="h-8 w-8 text-leaf" /> : <ShieldCheck className="h-8 w-8 text-leaf" />}
        <h1 className="mt-4 text-2xl font-semibold">Email verification</h1>
        <p className="mt-2 text-sm text-ink/65">{message}</p>
        <a href="/app" className="mt-5 inline-flex rounded-md bg-leaf px-4 py-3 text-white">Go to workspace</a>
      </div>
    </main>
  );
}
function Dashboard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [packs, setPacks] = useState<ProofPack[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [meData, packData] = await Promise.all([
        api<MeResponse>("/api/me"),
        api<{ proofPacks: ProofPack[] }>("/api/proof-packs"),
      ]);
      setMe(meData);
      setActionMessage("");
      setPacks(packData.proofPacks);
      setSelectedId((current) => current ?? packData.proofPacks[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = packs.find((pack) => pack.id === selectedId) ?? null;

  async function createPack() {
    if (me && !me.billing.canCreateProofPack) {
      setActionMessage(`Your ${me.billing.plan.name} plan has reached its active proof pack limit.`);
      return;
    }
    const title = window.prompt("Proof pack title", "Coffee batch evidence pack");
    if (!title) return;
    try {
      const data = await api<{ proofPack: ProofPack }>("/api/proof-packs", { method: "POST", body: { title, commodity: "coffee" } });
      setPacks((current) => [data.proofPack, ...current]);
      setSelectedId(data.proofPack.id);
      await load();
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Could not create proof pack");
    }
  }

  async function resendVerification() {
    try {
      const data = await api<{ verification: { message: string; verificationUrl?: string } }>("/api/auth/resend-verification", { method: "POST" });
      setVerificationMessage(data.verification.verificationUrl ? `${data.verification.message}: ${data.verification.verificationUrl}` : data.verification.message);
    } catch (caught) {
      setVerificationMessage(caught instanceof Error ? caught.message : "Could not resend verification email");
    }
  }

  if (loading) return <Shell><LoadingState /></Shell>;
  if (error) return <Shell><ErrorState message={error} /></Shell>;

  return (
    <Shell>
      {me && !me.verification.emailVerified && (
        <div className="mb-5 rounded-md border border-clay/30 bg-clay/10 p-4 text-sm text-ink/75">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span><AlertTriangle className="mr-2 inline h-4 w-4 text-clay" /> Verify your email to unlock stricter production enforcement when enabled.</span>
            <button onClick={resendVerification} className="rounded-md border border-ink/15 px-3 py-2">Resend verification</button>
          </div>
          {verificationMessage && <p className="mt-2 break-all text-ink/65">{verificationMessage}</p>}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside>
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <p className="text-sm text-ink/55">{me?.organization.name}</p>
            <h1 className="mt-1 text-2xl font-semibold">Evidence workspace</h1>
            {me && <PlanUsage billing={me.billing} />}
            <button onClick={createPack} disabled={Boolean(me && !me.billing.canCreateProofPack)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 text-white disabled:cursor-not-allowed disabled:bg-ink/30">
              <PackagePlus className="h-4 w-4" /> {me && !me.billing.canCreateProofPack ? "Limit reached" : "New proof pack"}
            </button>
            {actionMessage && <p className="mt-3 text-sm text-clay">{actionMessage}</p>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={<FileArchive />} label="Total" value={me?.stats.total ?? 0} />
            <Metric icon={<BadgeCheck />} label="Buyer ready" value={me?.stats.byStatus.buyer_ready ?? 0} />
          </div>
          <div className="mt-4 space-y-3">
            {packs.length === 0 ? <EmptyState /> : packs.map((pack) => (
              <button key={pack.id} onClick={() => setSelectedId(pack.id)} className={`w-full rounded-lg border p-4 text-left ${selectedId === pack.id ? "border-leaf bg-white shadow-soft" : "border-ink/10 bg-white/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{pack.title}</h3>
                    <p className="mt-1 text-sm text-ink/60">{commodityLabel(pack.commodity)} · {pack.product_name || "Product pending"}</p>
                  </div>
                  <StatusBadge status={pack.status} />
                </div>
                <Progress value={pack.readiness.percentage} />
              </button>
            ))}
          </div>
        </aside>
        <section>
          {selected ? <PackEditor pack={selected} onChanged={load} /> : <EmptyState />}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-flax text-ink">
      <div className="grid min-h-screen lg:grid-cols-[230px_1fr]">
        <aside className="border-r border-ink/10 bg-white p-5">
          <a className="flex items-center gap-2 font-semibold" href="/"><ShieldCheck className="h-6 w-6 text-leaf" /> ProofPack</a>
          <nav className="mt-8 space-y-2 text-sm">
            <a className="flex items-center gap-2 rounded-md bg-flax px-3 py-2" href="/app"><BarChart3 className="h-4 w-4" /> Dashboard</a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-ink/65" href="/"><Globe2 className="h-4 w-4" /> Landing</a>
          </nav>
        </aside>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function PackEditor({ pack, onChanged }: { pack: ProofPack; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState("buyer");
  const [saving, setSaving] = useState(false);
  const shareUrl = pack.share_token ? `${window.location.origin}/share/${pack.share_token}` : "";
  const supplierUrl = pack.supplier_token ? `${window.location.origin}/supplier/${pack.supplier_token}` : "";

  async function patch(fields: Partial<ProofPack>) {
    setSaving(true);
    await api(`/api/proof-packs/${pack.id}`, { method: "PATCH", body: fields });
    await onChanged();
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-ink/10 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><h2 className="text-2xl font-semibold">{pack.title}</h2><StatusBadge status={pack.status} /></div>
            <p className="mt-2 text-ink/65">{pack.readiness.suggestedNextAction}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => patch({ status: "buyer_ready" })} className="rounded-md border border-ink/15 px-3 py-2 text-sm">Mark buyer ready</button>
            <a href={`/api/proof-packs/${pack.id}/export`} className="rounded-md bg-ink px-3 py-2 text-sm text-white">Download JSON</a>
            <a href={`/api/proof-packs/${pack.id}/zip-export`} className="rounded-md bg-leaf px-3 py-2 text-sm text-white">Download ZIP</a>
          </div>
        </div>
        <Progress value={pack.readiness.percentage} />
        {pack.readiness.missingItems.length > 0 && (
          <div className="mt-4 rounded-md bg-clay/10 p-3 text-sm text-ink/75">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-clay" /> {pack.readiness.missingItems.join(", ")}
          </div>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {["buyer", "product", "supplier", "plots", "documents", "risk", "share"].map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-2 text-sm capitalize ${tab === item ? "bg-leaf text-white" : "bg-white text-ink/70"}`}>{item}</button>
        ))}
      </div>
      {tab === "buyer" && <FieldGrid fields={[
        ["buyer_company", "Company name"], ["buyer_contact", "Contact person"], ["buyer_email", "Email"], ["buyer_country", "Country"], ["eori_number", "EORI number"], ["internal_reference", "Internal reference"],
      ]} pack={pack} onSave={patch} saving={saving} />}
      {tab === "product" && <FieldGrid fields={[
        ["product_name", "Product name"], ["hs_code", "HS code"], ["quantity", "Quantity"], ["batch_number", "Batch or lot"], ["production_country", "Production country"], ["export_country", "Export country"], ["destination_country", "Import destination"], ["production_date_start", "Production start"], ["production_date_end", "Production end"],
      ]} pack={pack} onSave={patch} saving={saving} extra={<SelectField label="Commodity" value={pack.commodity} options={commodities} onChange={(value) => patch({ commodity: value })} />} />}
      {tab === "supplier" && <SupplierFields pack={pack} onSave={patch} saving={saving} />}
      {tab === "plots" && <PlotsPanel pack={pack} onChanged={onChanged} />}
      {tab === "documents" && <DocumentsPanel pack={pack} onChanged={onChanged} />}
      {tab === "risk" && <RiskPanel pack={pack} onSave={patch} saving={saving} />}
      {tab === "share" && <SharePanel pack={pack} shareUrl={shareUrl} supplierUrl={supplierUrl} onChanged={onChanged} />}
    </div>
  );
}

function FieldGrid({ fields, pack, onSave, saving, extra }: { fields: [keyof ProofPack, string][]; pack: ProofPack; onSave: (fields: Partial<ProofPack>) => Promise<void>; saving: boolean; extra?: React.ReactNode }) {
  const [draft, setDraft] = useState<Partial<ProofPack>>({});
  useEffect(() => setDraft({}), [pack.id]);
  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {extra}
        {fields.map(([key, label]) => <TextField key={key} label={label} value={String(draft[key] ?? pack[key] ?? "")} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />)}
      </div>
      <SaveButton saving={saving} onClick={() => onSave(draft)} />
    </Panel>
  );
}

function SupplierFields({ pack, onSave, saving }: { pack: ProofPack; onSave: (fields: Partial<ProofPack>) => Promise<void>; saving: boolean }) {
  const [draft, setDraft] = useState<Partial<ProofPack>>({});
  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {(["supplier_company", "supplier_contact", "supplier_email", "supplier_country"] as const).map((key) => (
          <TextField key={key} label={labelize(key)} value={String(draft[key] ?? pack[key] ?? "")} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
        ))}
        <label className="flex items-center gap-3 rounded-md border border-ink/10 p-3">
          <input type="checkbox" checked={Boolean(draft.supplier_declaration_confirmed ?? pack.supplier_declaration_confirmed)} onChange={(event) => setDraft((current) => ({ ...current, supplier_declaration_confirmed: event.target.checked }))} />
          Supplier declaration confirmed
        </label>
      </div>
      <SaveButton saving={saving} onClick={() => onSave(draft)} />
    </Panel>
  );
}

function PlotsPanel({ pack, onChanged }: { pack: ProofPack; onChanged: () => Promise<void> }) {
  const [plot, setPlot] = useState({ plot_name: "", producer_name: "", latitude: "", longitude: "", area_size: "", notes: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api(`/api/proof-packs/${pack.id}/plots`, { method: "POST", body: plot });
    setPlot({ plot_name: "", producer_name: "", latitude: "", longitude: "", area_size: "", notes: "" });
    await onChanged();
  }
  return (
    <Panel>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {Object.keys(plot).map((key) => <TextField key={key} label={labelize(key)} value={plot[key as keyof typeof plot]} onChange={(value) => setPlot((current) => ({ ...current, [key]: value }))} />)}
        <button className="rounded-md bg-leaf px-4 py-3 text-white md:self-end">Add plot</button>
      </form>
      <div className="mt-5 overflow-hidden rounded-md border border-ink/10">
        <div className="grid grid-cols-4 bg-flax p-3 text-sm font-medium"><span>Plot</span><span>Producer</span><span>Latitude</span><span>Longitude</span></div>
        {pack.plots.map((item) => <div key={item.id} className="grid grid-cols-4 border-t border-ink/10 p-3 text-sm"><span>{item.plot_name}</span><span>{item.producer_name}</span><span>{item.latitude}</span><span>{item.longitude}</span></div>)}
      </div>
      <div className="mt-4 rounded-md border border-dashed border-ink/20 p-4 text-sm text-ink/60">
        <MapPin className="mr-2 inline h-4 w-4" /> Map preview placeholder. Coordinates are validated server-side; polygon and GeoJSON map support is on the roadmap.
      </div>
    </Panel>
  );
}

function DocumentsPanel({ pack, onChanged }: { pack: ProofPack; onChanged: () => Promise<void> }) {
  const [type, setType] = useState("supplier_declaration");
  const [notes, setNotes] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("document_type", type);
    form.set("notes", notes);
    await uploadForm(`/api/proof-packs/${pack.id}/documents`, form);
    event.currentTarget.reset();
    await onChanged();
  }
  return (
    <Panel>
      <form onSubmit={upload} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <SelectField label="Document type" value={type} options={docTypes.map(([value]) => value)} onChange={setType} />
        <TextField label="Notes" value={notes} onChange={setNotes} />
        <label className="block text-sm font-medium">File<input name="file" type="file" className="mt-2 block w-full text-sm" required /></label>
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 text-white md:col-span-3"><Upload className="h-4 w-4" /> Upload</button>
      </form>
      <div className="mt-5 space-y-2">
        {pack.documents.map((document) => (
          <div key={document.id} className="flex items-center justify-between rounded-md border border-ink/10 p-3 text-sm">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-leaf" /> {document.original_filename}</span>
            <span>{labelize(document.document_type)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RiskPanel({ pack, onSave, saving }: { pack: ProofPack; onSave: (fields: Partial<ProofPack>) => Promise<void>; saving: boolean }) {
  const [draft, setDraft] = useState<Partial<ProofPack>>({});
  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Risk level" value={String(draft.risk_level ?? pack.risk_level)} options={["unknown", "low", "medium", "high"]} onChange={(value) => setDraft((current) => ({ ...current, risk_level: value as RiskLevel }))} />
        {(["country_risk_notes", "supplier_risk_notes", "geolocation_completeness", "missing_documents", "open_questions", "reviewer_notes", "risk_notes"] as const).map((key) => (
          <TextField key={key} label={labelize(key)} value={String(draft[key] ?? pack[key] ?? "")} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
        ))}
      </div>
      <SaveButton saving={saving} onClick={() => onSave(draft)} />
    </Panel>
  );
}

function SharePanel({ pack, shareUrl, supplierUrl, onChanged }: { pack: ProofPack; shareUrl: string; supplierUrl: string; onChanged: () => Promise<void> }) {
  async function make(path: string) {
    await api(path, { method: "POST" });
    await onChanged();
  }
  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <LinkBox title="Buyer share URL" url={shareUrl} onGenerate={() => make(`/api/proof-packs/${pack.id}/generate-share-link`)} />
        <LinkBox title="Supplier upload URL" url={supplierUrl} onGenerate={() => make(`/api/proof-packs/${pack.id}/generate-supplier-link`)} />
      </div>
      <div className="mt-5 rounded-md bg-flax p-4 text-sm text-ink/65">Prepared by EUDR ProofPack - not a legal certification.</div>
    </Panel>
  );
}

function SharePage({ token }: { token: string }) {
  const { data, error } = useLoad<{ proofPack: ProofPack; disclaimer: string }>(`/api/share/${token}`);
  if (error) return <PublicFrame><ErrorState message={error} /></PublicFrame>;
  if (!data) return <PublicFrame><LoadingState /></PublicFrame>;
  return <PublicFrame><Summary pack={data.proofPack} disclaimer={data.disclaimer} /></PublicFrame>;
}

function SupplierPortal({ token }: { token: string }) {
  const { data, error, reload } = useLoad<{ proofPack: ProofPack; plots: Plot[]; documents: ProofDocument[] }>(`/api/supplier/${token}`);
  const [draft, setDraft] = useState<Partial<ProofPack>>({});
  if (error) return <PublicFrame><ErrorState message={error} /></PublicFrame>;
  if (!data) return <PublicFrame><LoadingState /></PublicFrame>;
  async function save() {
    await api(`/supplier/${token}/update`, { method: "POST", body: draft });
    await reload();
  }
  return (
    <PublicFrame>
      <Panel>
        <h1 className="text-2xl font-semibold">Supplier portal</h1>
        <p className="mt-2 text-ink/65">Update only the assigned supplier fields for {data.proofPack.title}.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {(["supplier_company", "supplier_contact", "supplier_email", "supplier_country", "supplier_risk_notes", "open_questions"] as const).map((key) => (
            <TextField key={key} label={labelize(key)} value={String(draft[key] ?? data.proofPack[key] ?? "")} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
          ))}
          <label className="flex items-center gap-3 rounded-md border border-ink/10 p-3"><input type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, supplier_declaration_confirmed: event.target.checked }))} /> Supplier declaration confirmed</label>
        </div>
        <button onClick={save} className="mt-5 rounded-md bg-leaf px-4 py-3 text-white">Save supplier details</button>
      </Panel>
      <SupplierDocuments token={token} documents={data.documents} onChanged={reload} />
    </PublicFrame>
  );
}

function SupplierDocuments({ token, documents, onChanged }: { token: string; documents: ProofDocument[]; onChanged: () => Promise<void> }) {
  const [type, setType] = useState("supplier_declaration");
  const [notes, setNotes] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("document_type", type);
    form.set("notes", notes);
    await uploadForm(`/supplier/${token}/upload`, form);
    event.currentTarget.reset();
    await onChanged();
  }
  return (
    <Panel>
      <h2 className="text-xl font-semibold">Upload missing documents</h2>
      <form onSubmit={upload} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <SelectField label="Document type" value={type} options={docTypes.map(([value]) => value)} onChange={setType} />
        <TextField label="Notes" value={notes} onChange={setNotes} />
        <label className="block text-sm font-medium">File<input name="file" type="file" className="mt-2 block w-full text-sm" required /></label>
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 text-white md:col-span-3"><Upload className="h-4 w-4" /> Upload</button>
      </form>
      <div className="mt-5 space-y-2">
        {documents.map((document) => <div key={document.id} className="rounded-md border border-ink/10 p-3 text-sm">{document.original_filename}</div>)}
      </div>
    </Panel>
  );
}
function Summary({ pack, disclaimer }: { pack: ProofPack; disclaimer: string }) {
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap justify-between gap-3">
          <div><h1 className="text-3xl font-semibold">{pack.title}</h1><p className="mt-2 text-ink/65">{disclaimer}</p></div>
          <button onClick={() => window.print()} className="rounded-md bg-ink px-4 py-3 text-white">Download summary</button>
        </div>
        <Progress value={pack.readiness.percentage} />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <SummaryBlock title="Buyer/importer" rows={[["Company", pack.buyer_company], ["Contact", pack.buyer_contact], ["Email", pack.buyer_email], ["Country", pack.buyer_country]]} />
        <SummaryBlock title="Supplier" rows={[["Company", pack.supplier_company], ["Contact", pack.supplier_contact], ["Email", pack.supplier_email], ["Country", pack.supplier_country]]} />
        <SummaryBlock title="Product/batch" rows={[["Commodity", commodityLabel(pack.commodity)], ["Product", pack.product_name], ["Quantity", pack.quantity], ["Batch", pack.batch_number]]} />
        <SummaryBlock title="Risk notes" rows={[["Risk level", pack.risk_level], ["Country", pack.country_risk_notes ?? ""], ["Reviewer", pack.reviewer_notes ?? ""]]} />
      </div>
      <Panel><h2 className="text-xl font-semibold">Plot coordinates</h2>{pack.plots.map((plot) => <p key={plot.id} className="mt-2 text-sm">{plot.plot_name}: {plot.latitude}, {plot.longitude}</p>)}</Panel>
      <Panel><h2 className="text-xl font-semibold">Document checklist</h2>{pack.documents.map((doc) => <p key={doc.id} className="mt-2 text-sm">{labelize(doc.document_type)}: {doc.original_filename}</p>)}<button className="mt-4 rounded-md border border-ink/15 px-3 py-2 text-sm">Request missing info</button></Panel>
    </div>
  );
}

function SummaryBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return <Panel><h2 className="text-xl font-semibold">{title}</h2><dl className="mt-4 space-y-2">{rows.map(([key, value]) => <div key={key} className="flex justify-between gap-4 text-sm"><dt className="text-ink/55">{key}</dt><dd className="text-right font-medium">{value || "Missing"}</dd></div>)}</dl></Panel>;
}

function PublicFrame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-flax px-5 py-8 text-ink"><div className="mx-auto max-w-5xl">{children}</div></main>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 font-normal" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3 font-normal">{options.map((option) => <option key={option} value={option}>{commodityLabel(option)}</option>)}</select></label>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">{children}</section>;
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-3 text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</button>;
}

function LinkBox({ title, url, onGenerate }: { title: string; url: string; onGenerate: () => void }) {
  return <div className="rounded-md border border-ink/10 p-4"><h3 className="font-semibold">{title}</h3>{url ? <a className="mt-2 flex items-center gap-2 break-all text-sm text-leaf" href={url}><LinkIcon className="h-4 w-4" /> {url}</a> : <p className="mt-2 text-sm text-ink/55">No token generated yet.</p>}<button onClick={onGenerate} className="mt-4 rounded-md border border-ink/15 px-3 py-2 text-sm">Generate link</button></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-lg border border-ink/10 bg-white p-4"><span className="block h-5 w-5 text-leaf">{icon}</span><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-sm text-ink/55">{label}</p></div>;
}
function PlanUsage({ billing }: { billing: MeResponse["billing"] }) {
  const proofPackLimit = billing.effectiveLimits.activeProofPacks === null ? "Unlimited" : billing.effectiveLimits.activeProofPacks;
  const memberLimit = billing.effectiveLimits.members === null ? "Unlimited" : billing.effectiveLimits.members;
  const price = billing.plan.priceMonthlyEur === null ? "Custom" : `\u20ac${billing.plan.priceMonthlyEur}/mo`;
  return (
    <div className="mt-4 rounded-md border border-ink/10 bg-flax p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{billing.plan.name}</span>
        <span className="text-ink/60">{price}</span>
      </div>
      <p className="mt-2 text-ink/65">{billing.usage.activeProofPacks} / {proofPackLimit} active proof packs</p>
      <p className="mt-1 text-ink/65">{billing.usage.members} / {memberLimit} users</p>
      {billing.extraProofPackAllowance > 0 && <p className="mt-1 text-leaf">Includes {billing.extraProofPackAllowance} extra proof packs</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className="rounded-full bg-leaf/10 px-2.5 py-1 text-xs font-semibold text-leaf">{labelize(status)}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="mt-4"><div className="flex justify-between text-xs text-ink/60"><span>Readiness</span><span>{value}%</span></div><div className="mt-2 h-2 rounded-full bg-steel"><div className="h-2 rounded-full bg-leaf" style={{ width: `${value}%` }} /></div></div>;
}

function LoadingState() {
  return <div className="grid min-h-[280px] place-items-center rounded-lg bg-white"><Loader2 className="h-7 w-7 animate-spin text-leaf" /></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">{message}</div>;
}

function EmptyState() {
  return <div className="rounded-lg border border-dashed border-ink/20 bg-white p-8 text-center text-ink/60"><Box className="mx-auto mb-3 h-8 w-8" /> No proof packs yet.</div>;
}

function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      await api("/api/feedback", { method: "POST", body: { category, message, email: email || undefined, path: window.location.pathname } });
      setMessage("");
      setEmail("");
      setStatus("Thanks - got it.");
      window.setTimeout(() => setOpen(false), 900);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Could not send feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {open && (
        <form onSubmit={submit} className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-ink/10 bg-white p-4 text-ink shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Send feedback</h2>
              <p className="mt-1 text-sm text-ink/60">Tell us what is confusing, broken, or missing.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-ink/10 p-2 text-ink/60" aria-label="Close feedback form">
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium">Type
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-2 font-normal">
              <option value="idea">Idea</option>
              <option value="bug">Bug</option>
              <option value="confusing">Confusing</option>
              <option value="praise">Praise</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium">Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-md border border-ink/15 px-3 py-3 font-normal" maxLength={2000} required />
          </label>
          <label className="mt-3 block text-sm font-medium">Email <span className="font-normal text-ink/45">optional</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-md border border-ink/15 px-3 py-2 font-normal" type="email" maxLength={320} />
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink/60">{status}</p>
            <button className="inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-2 font-medium text-white disabled:bg-ink/30" disabled={submitting || message.trim().length < 3}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
          </div>
        </form>
      )}
      <button onClick={() => setOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 font-medium text-white shadow-soft" aria-expanded={open}>
        <MessageSquare className="h-4 w-4" /> Feedback
      </button>
    </div>
  );
}
function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  async function reload() {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load");
    }
  }
  useEffect(() => {
    void reload();
  }, [path]);
  return { data, error, reload };
}

async function uploadForm(path: string, form: FormData): Promise<void> {
  const response = await fetch(path, { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Upload failed");
}

async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: options.body instanceof FormData ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = (await response.json()) as unknown;
  if (!response.ok) {
    const errorMessage = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Request failed";
    throw new Error(errorMessage);
  }
  return data as T;
}

function commodityLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelize(value: string) {
  return commodityLabel(value);
}

createRoot(document.getElementById("root")!).render(<App />);

