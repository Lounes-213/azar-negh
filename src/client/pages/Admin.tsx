import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type {
  AdminStats,
  AdminUser,
  AuditEntry,
  Category,
  ListingStatus,
  Paginated,
  Role,
} from "../../shared/types";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatDate, formatDateTime, formatPrice } from "../lib/format";

const SECTIONS = [
  { key: "stats", label: "Vue d'ensemble", icon: "bar-chart" as const },
  { key: "users", label: "Utilisateurs", icon: "users" as const },
  { key: "categories", label: "Catégories", icon: "folder" as const },
  { key: "listings", label: "Annonces", icon: "list" as const },
  { key: "ai", label: "Intelligence Artificielle & Clés", icon: "cpu" as const },
  { key: "audit", label: "Journal d'audit", icon: "file-text" as const },
];

const STATUSES: ListingStatus[] = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "SOLD", "ARCHIVED"];

function Overview() {
  const state = useAsync(() => api<{ stats: AdminStats }>("/admin/stats"), []);
  if (state.loading) return <Spinner />;
  if (!state.data) return <Alert tone="danger">{errorMessage(state.error)}</Alert>;
  const { stats } = state.data;
  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat-card">
          <span>Utilisateurs</span>
          <strong>{stats.users.total}</strong>
          <small className="muted">{stats.users.suspended} suspendu(s)</small>
        </div>
        <div className="stat-card">
          <span>Annonces publiées</span>
          <strong>{stats.listings.APPROVED}</strong>
          <small className="muted">{stats.listings.SOLD} vendue(s)</small>
        </div>
        <div className="stat-card">
          <span>En modération</span>
          <strong>{stats.listings.PENDING}</strong>
          <small className="muted">
            {stats.pendingOldest
              ? `Plus ancienne : ${formatDate(stats.pendingOldest)}`
              : "File vide"}
          </small>
        </div>
        <div className="stat-card">
          <span>Signalements ouverts</span>
          <strong>{stats.reports.open}</strong>
          <small className="muted">{stats.users.moderators} membre(s) du staff</small>
        </div>
      </div>

      <div className="trust-grid">
        <Link to="/mod" className="card" style={{ padding: 20 }}>
          <span className="category-icon">
            <Icon name="shield" size={22} />
          </span>
          <h3 className="mt-3" style={{ fontSize: "var(--text-md)" }}>
            File de modération
          </h3>
          <p className="small muted mt-1">{stats.listings.PENDING} annonce(s) en attente.</p>
        </Link>
        <Link to="/admin/users" className="card" style={{ padding: 20 }}>
          <span className="category-icon">
            <Icon name="users" size={22} />
          </span>
          <h3 className="mt-3" style={{ fontSize: "var(--text-md)" }}>
            Gestion des rôles
          </h3>
          <p className="small muted mt-1">Promouvoir un modérateur, suspendre un compte.</p>
        </Link>
        <Link to="/admin/audit" className="card" style={{ padding: 20 }}>
          <span className="category-icon">
            <Icon name="file-text" size={22} />
          </span>
          <h3 className="mt-3" style={{ fontSize: "var(--text-md)" }}>
            Journal d'audit
          </h3>
          <p className="small muted mt-1">Toutes les actions sensibles sont tracées.</p>
        </Link>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Statut</th>
              <th>Annonces</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((status) => (
              <tr key={status}>
                <td>
                  <Badge>{status}</Badge>
                </td>
                <td>{stats.listings[status] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const { push } = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState(user.status);
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === "ADMIN";
  const dirty = !isAdmin && (role !== user.role || status !== user.status);

  const save = async () => {
    if (isAdmin) return;
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}`, { method: "PATCH", body: { role, status } });
      push("Utilisateur mis à jour.", "success");
      onSaved();
    } catch (error) {
      push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        <div className="strong">{user.displayName ?? "—"}</div>
        <div className="small muted" style={{ overflowWrap: "anywhere" }}>
          {user.email}
        </div>
      </td>
      <td>
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          aria-label="Rôle"
          style={{ minWidth: 130 }}
          disabled={isAdmin}
          title={isAdmin ? "Les droits d'un administrateur ne peuvent pas être modifiés" : undefined}
        >
          <option value="USER">USER</option>
          <option value="MODERATOR">MODERATOR</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
      </td>
      <td>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as "ACTIVE" | "SUSPENDED")}
          aria-label="Statut"
          style={{ minWidth: 130 }}
          disabled={isAdmin}
          title={isAdmin ? "Le compte d'un administrateur ne peut pas être suspendu" : undefined}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
        </Select>
      </td>
      <td>{user.listingsCount}</td>
      <td className="small muted">{formatDate(user.createdAt)}</td>
      <td>
        <Button
          size="sm"
          variant={dirty ? "primary" : "ghost"}
          disabled={!dirty || isAdmin}
          loading={busy}
          onClick={save}
        >
          Enregistrer
        </Button>
      </td>
    </tr>
  );
}

function UsersSection() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(
    () =>
      api<{ users: Paginated<AdminUser> }>(
        `/admin/users?page=${page}&perPage=20${search ? `&q=${encodeURIComponent(search)}` : ""}${role ? `&role=${role}` : ""}`,
      ),
    [page, search, role],
  );

  return (
    <div className="stack">
      <form
        className="row wrap"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Rechercher un e-mail ou un nom…"
          aria-label="Rechercher un utilisateur"
          style={{ maxWidth: 320 }}
        />
        <Select
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrer par rôle"
          style={{ maxWidth: 180 }}
        >
          <option value="">Tous les rôles</option>
          <option value="USER">USER</option>
          <option value="MODERATOR">MODERATOR</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
      </form>

      {state.loading ? (
        <Spinner />
      ) : !state.data || state.data.users.items.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aucun utilisateur"
          text="Aucun compte ne correspond à cette recherche."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Annonces</th>
                  <th>Inscrit le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.users.items.map((user) => (
                  <UserRow key={user.id} user={user} onSaved={state.reload} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={state.data.users.page}
            totalPages={state.data.users.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}

const emptyCategory = {
  slug: "",
  nameFr: "",
  nameAr: "",
  parentId: "",
  icon: "tag",
  sortOrder: "100",
  isActive: true,
};

function CategoriesSection() {
  const { push } = useToast();
  const state = useAsync(() => api<{ categories: Category[] }>("/admin/categories"), []);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyCategory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyCategory);
      setEditingId(null);
      setError(null);
    }
  }, [open]);

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setForm({
      slug: category.slug,
      nameFr: category.nameFr,
      nameAr: category.nameAr,
      parentId: category.parentId ? String(category.parentId) : "",
      icon: category.icon,
      sortOrder: String(category.sortOrder),
      isActive: category.isActive,
    });
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      slug: form.slug.trim(),
      nameFr: form.nameFr.trim(),
      nameAr: form.nameAr.trim(),
      parentId: form.parentId ? Number(form.parentId) : null,
      icon: form.icon.trim() || "tag",
      sortOrder: Number(form.sortOrder || 100),
      isActive: form.isActive,
    };
    try {
      if (editingId) {
        await api(`/admin/categories/${editingId}`, { method: "PATCH", body });
      } else {
        await api("/admin/categories", { method: "POST", body });
      }
      push(editingId ? "Catégorie mise à jour." : "Catégorie créée.", "success");
      setOpen(false);
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const parents = (state.data?.categories ?? []).filter((category) => !category.parentId);

  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted">
          Les catégories inactives sont masquées du catalogue public mais restent visibles ici.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={15} /> Nouvelle catégorie
        </Button>
      </div>

      {state.loading ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nom (FR)</th>
                <th>Nom (AR)</th>
                <th>Slug</th>
                <th>Parent</th>
                <th>Annonces</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(state.data?.categories ?? []).map((category) => (
                <tr key={category.id}>
                  <td className="strong">
                    {category.parentId ? <span className="muted">— </span> : null}
                    {category.nameFr}
                  </td>
                  <td dir="rtl">{category.nameAr}</td>
                  <td className="small muted">{category.slug}</td>
                  <td className="small muted">
                    {category.parentId
                      ? (parents.find((item) => item.id === category.parentId)?.nameFr ??
                        category.parentId)
                      : "—"}
                  </td>
                  <td>{category.listingCount ?? 0}</td>
                  <td>
                    <Badge tone={category.isActive ? "badge-success" : "badge"}>
                      {category.isActive ? "Oui" : "Non"}
                    </Badge>
                  </td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(category)}>
                      <Icon name="edit" size={14} /> Modifier
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Modifier la catégorie" : "Nouvelle catégorie"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="category-form" loading={busy}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={save} className="stack">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="form-grid">
            <Field label="Nom (français)" htmlFor="cat-fr" required>
              <Input
                id="cat-fr"
                value={form.nameFr}
                onChange={(event) => setForm({ ...form, nameFr: event.target.value })}
                required
              />
            </Field>
            <Field label="Nom (arabe)" htmlFor="cat-ar" required>
              <Input
                id="cat-ar"
                dir="rtl"
                value={form.nameAr}
                onChange={(event) => setForm({ ...form, nameAr: event.target.value })}
                required
              />
            </Field>
            <Field label="Slug" htmlFor="cat-slug" required hint="minuscules, chiffres et tirets">
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
                required
              />
            </Field>
            <Field label="Catégorie parente" htmlFor="cat-parent">
              <Select
                id="cat-parent"
                value={form.parentId}
                onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              >
                <option value="">Aucune (niveau 1)</option>
                {parents
                  .filter((category) => category.id !== editingId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameFr}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Icône" htmlFor="cat-icon" hint="cpu, smartphone, car, home, tag…">
              <Input
                id="cat-icon"
                value={form.icon}
                onChange={(event) => setForm({ ...form, icon: event.target.value })}
              />
            </Field>
            <Field label="Ordre" htmlFor="cat-order">
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </Field>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            <span>Catégorie active (visible publiquement)</span>
          </label>
        </form>
      </Dialog>
    </div>
  );
}

function ListingsSection() {
  const { push } = useToast();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(
    () =>
      api<{
        listings: Paginated<{
          id: string;
          title: string;
          status: ListingStatus;
          priceDa: number;
          createdAt: string;
          sellerEmail: string;
          sellerName: string | null;
          images: number;
        }>;
      }>(
        `/admin/listings?page=${page}&perPage=20${status ? `&status=${status}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
    [page, status, search],
  );

  const archive = async (id: string) => {
    try {
      await api(`/admin/listings/${id}/action`, { method: "POST", body: { action: "ARCHIVE" } });
      push("Annonce archivée.", "success");
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    }
  };

  return (
    <div className="stack">
      <form
        className="row wrap"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Rechercher une annonce…"
          aria-label="Rechercher une annonce"
          style={{ maxWidth: 320 }}
        />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrer par statut"
          style={{ maxWidth: 190 }}
        >
          <option value="">Tous les statuts</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>

      {state.loading ? (
        <Spinner />
      ) : !state.data || state.data.listings.items.length === 0 ? (
        <EmptyState
          icon="list"
          title="Aucune annonce"
          text="Aucune annonce ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Annonce</th>
                  <th>Vendeur</th>
                  <th>Statut</th>
                  <th>Prix</th>
                  <th>Créée</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.listings.items.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <Link to={`/annonces/${listing.id}`} className="strong">
                        {listing.title}
                      </Link>
                      <div className="small muted">{listing.images} photo(s)</div>
                    </td>
                    <td>
                      <div className="small">{listing.sellerName ?? "—"}</div>
                      <div className="small muted" style={{ overflowWrap: "anywhere" }}>
                        {listing.sellerEmail}
                      </div>
                    </td>
                    <td>
                      <Badge>{listing.status}</Badge>
                    </td>
                    <td className="nowrap">{formatPrice(listing.priceDa)}</td>
                    <td className="small muted">{formatDate(listing.createdAt)}</td>
                    <td className="actions">
                      <Link to={`/annonces/${listing.id}`} className="btn btn-ghost btn-sm">
                        Voir
                      </Link>
                      {listing.status !== "ARCHIVED" ? (
                        <Button size="sm" variant="ghost" onClick={() => archive(listing.id)}>
                          Archiver
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={state.data.listings.page}
            totalPages={state.data.listings.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function AuditSection() {
  const [page, setPage] = useState(1);
  const state = useAsync(
    () => api<{ entries: Paginated<AuditEntry> }>(`/admin/audit?page=${page}&perPage=30`),
    [page],
  );

  if (state.loading) return <Spinner />;
  if (!state.data) return <Alert tone="danger">{errorMessage(state.error)}</Alert>;

  return (
    <div className="stack">
      <p className="small muted">
        Journal en lecture seule. Les données sensibles (mots de passe, jetons, adresses IP) n'y
        sont jamais enregistrées en clair.
      </p>
      {state.data.entries.items.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="Journal vide"
          text="Les actions d'administration apparaîtront ici."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Acteur</th>
                  <th>Action</th>
                  <th>Entité</th>
                </tr>
              </thead>
              <tbody>
                {state.data.entries.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="small nowrap">{formatDateTime(entry.createdAt)}</td>
                    <td className="small">{entry.actorEmail ?? "—"}</td>
                    <td className="small strong">{entry.action}</td>
                    <td className="small muted">
                      {entry.entityType ?? "—"}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}…` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={state.data.entries.page}
            totalPages={state.data.entries.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function AiSection() {
  const { push } = useToast();
  const state = useAsync(() => api<{ configs: any[] }>("/admin/ai-config"), []);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [modelName, setModelName] = useState("gemini-3.8-flash");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; text?: string; latencyMs?: number; error?: string } | null>(null);

  const configs = state.data?.configs ?? [];
  const totalKeys = configs.reduce((acc, c) => acc + (c.isActive ? (c.keysCount || 0) : 0), 0);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSubmitting(true);
    try {
      await api("/admin/ai-config/keys", {
        method: "POST",
        body: JSON.stringify({
          provider,
          modelName,
          key: apiKey.trim(),
        }),
      });
      push("Clé(s) IA ajoutée(s) avec succès au pool d'équilibrage !", "success");
      setApiKey("");
      setAddModalOpen(false);
      state.reload();
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (configId: string, index: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette clé API ?")) return;
    try {
      await api(`/admin/ai-config/${configId}/keys/${index}`, { method: "DELETE" });
      push("Clé supprimée.", "success");
      state.reload();
    } catch (err) {
      push(errorMessage(err), "error");
    }
  };

  const handleToggleActive = async (configId: string) => {
    try {
      await api(`/admin/ai-config/${configId}/toggle`, { method: "PATCH" });
      push("Statut de la configuration mis à jour.", "success");
      state.reload();
    } catch (err) {
      push(errorMessage(err), "error");
    }
  };

  const handleTestKey = async (prov: string, model: string, keyMaskedOrRaw: string) => {
    setTestingKey(keyMaskedOrRaw);
    setTestResult(null);
    try {
      const res = await api<{ success: boolean; text?: string; latencyMs?: number; error?: string }>(
        "/admin/ai-config/test",
        {
          method: "POST",
          body: JSON.stringify({
            provider: prov,
            modelName: model,
            apiKey: keyMaskedOrRaw,
            prompt: "Test rapide de connexion Azar Negh",
          }),
        },
      );
      setTestResult(res);
      if (res.success) {
        push(`Test réussi (${res.latencyMs}ms) : Réponse reçue`, "success");
      }
    } catch (err) {
      setTestResult({ success: false, error: errorMessage(err) });
      push(errorMessage(err), "error");
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <div className="stack">
      {/* Top Header Row with prominent + Ajouter button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Intelligence Artificielle & Clés API</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Gestion centralisée des modèles et des clés API pour AzarBot et la Baguette Magique.
          </p>
        </div>

        {/* PROMINENT + BUTTON (ALWAYS VISIBLE) */}
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setTestResult(null);
            setAddModalOpen(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            padding: "10px 18px",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
          }}
        >
          <Icon name="plus" size={16} />
          <span>Ajouter une clé IA</span>
        </Button>
      </div>

      {/* Load Balancing & Distribution Card */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 95, 70, 0.05) 100%)",
          border: "1.5px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--brand-500)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                boxShadow: "0 3px 10px rgba(16, 185, 129, 0.35)",
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: "1.05rem" }}>Répartition de charge uniforme (Load Balancing)</strong>
                <Badge tone="success">100% Actif</Badge>
              </div>
              <p className="small muted" style={{ margin: "2px 0 0", maxWidth: "60ch" }}>
                Les requêtes de tous les utilisateurs sont automatiquement divisées et alternées uniformément sur l'ensemble des <strong>{totalKeys} clés actives</strong>. Aucune clé ne subit de surcharge, éliminant les erreurs de quota 429.
              </p>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <span style={{ fontSize: "1.7rem", fontWeight: 800, color: "var(--brand-700)" }}>
              {totalKeys}
            </span>
            <div className="small muted">Clé(s) active(s)</div>
          </div>
        </div>
      </div>

      {state.loading ? (
        <Spinner />
      ) : configs.length === 0 ? (
        <EmptyState
          icon="cpu"
          title="Aucune clé personnalisée configurée"
          text="Le système utilise actuellement les clés de secours haute disponibilité par défaut. Cliquez sur le bouton ci-dessus pour ajouter vos propres clés Gemini ou OpenAI."
          action={
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Icon name="plus" size={15} /> Ajouter une clé
            </Button>
          }
        />
      ) : (
        <div className="stack">
          {configs.map((config) => (
            <div
              key={config.id}
              className="card"
              style={{
                padding: "20px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                      {String(config.provider).toUpperCase()} · {config.modelName}
                    </h3>
                    <Badge tone={config.isActive ? "success" : ""}>
                      {config.isActive ? "Actif" : "Désactivé"}
                    </Badge>
                  </div>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>
                    Dernière mise à jour : {formatDateTime(config.updatedAt)}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setProvider(config.provider);
                      setModelName(config.modelName);
                      setAddModalOpen(true);
                    }}
                    style={{ fontSize: "0.82rem", padding: "6px 12px" }}
                  >
                    <Icon name="plus" size={13} /> Ajouter une clé
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleToggleActive(config.id)}
                    style={{ fontSize: "0.82rem", padding: "6px 12px" }}
                  >
                    {config.isActive ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: "0.9rem", color: "var(--ink-muted)", marginBottom: 8 }}>
                  Clés configurées ({config.keysMasked?.length || 0}) :
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(config.keysMasked || []).map((maskedKey: string, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--surface)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--line)",
                        fontSize: "0.88rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, color: "var(--brand-700)" }}>#{idx + 1}</span>
                        <code style={{ background: "transparent", padding: 0 }}>{maskedKey}</code>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleTestKey(config.provider, config.modelName, maskedKey)}
                          disabled={testingKey === maskedKey}
                          style={{ fontSize: "0.78rem", padding: "3px 8px", height: 26 }}
                        >
                          {testingKey === maskedKey ? "Test en cours..." : "Tester"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleDeleteKey(config.id, idx)}
                          style={{ fontSize: "0.78rem", padding: "3px 8px", height: 26, color: "var(--danger)" }}
                        >
                          <Icon name="trash" size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal to add a new AI key */}
      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Ajouter une ou plusieurs clés IA"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, width: "100%" }}>
            <Button type="button" variant="ghost" onClick={() => setAddModalOpen(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="add-ai-key-form"
              variant="primary"
              disabled={submitting || !apiKey.trim()}
            >
              {submitting ? "Ajout en cours..." : "Enregistrer et activer"}
            </Button>
          </div>
        }
      >
        <form id="add-ai-key-form" onSubmit={handleAddKey} className="stack">
          <Field label="Fournisseur d'IA" htmlFor="ai-provider" required>
            <Select
              id="ai-provider"
              value={provider}
              onChange={(e) => {
                const val = e.target.value;
                setProvider(val);
                if (val === "gemini") setModelName("gemini-3.8-flash");
                else if (val === "openai") setModelName("gpt-4o-mini");
                else if (val === "claude") setModelName("claude-3-5-sonnet-20241022");
                else if (val === "groq") setModelName("llama-3.3-70b-versatile");
                else if (val === "deepseek") setModelName("deepseek-chat");
              }}
            >
              <option value="gemini">Google Gemini (Recommandé - Rapide & Polyvalent)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="claude">Anthropic Claude</option>
              <option value="groq">Groq (Ultra Rapide)</option>
              <option value="deepseek">DeepSeek</option>
            </Select>
          </Field>

          <Field label="Modèle" htmlFor="ai-model" required hint="ex: gemini-3.8-flash, gemini-3.5-flash-lite, gpt-4o-mini">
            <Input
              id="ai-model"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              required
            />
          </Field>

          <Field
            label="Clé(s) API"
            htmlFor="ai-key"
            required
            hint="Collez votre clé API. Pour en ajouter plusieurs d'un coup, séparez-les par des retours à la ligne ou virgules."
          >
            <textarea
              id="ai-key"
              className="input"
              rows={3}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... ou sk-..."
              required
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </Field>

          {apiKey.trim() ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Button
                type="button"
                variant="secondary"
                disabled={testingKey === "modal"}
                onClick={async () => {
                  const firstKey = apiKey.split(/[\n,;]+/)[0]?.trim();
                  if (!firstKey) return;
                  setTestingKey("modal");
                  setTestResult(null);
                  try {
                    const res = await api<{ success: boolean; text?: string; latencyMs?: number; error?: string }>(
                      "/admin/ai-config/test",
                      {
                        method: "POST",
                        body: JSON.stringify({
                          provider,
                          modelName,
                          apiKey: firstKey,
                          prompt: "Test rapide de validation",
                        }),
                      },
                    );
                    setTestResult(res);
                  } catch (err) {
                    setTestResult({ success: false, error: errorMessage(err) });
                  } finally {
                    setTestingKey(null);
                  }
                }}
                style={{ fontSize: "0.82rem" }}
              >
                {testingKey === "modal" ? "Test en direct..." : "Tester la clé avant d'enregistrer"}
              </Button>

              {testResult ? (
                testResult.success ? (
                  <span style={{ color: "var(--brand-700)", fontWeight: 600, fontSize: "0.85rem" }}>
                    ✓ Clé valide ({testResult.latencyMs}ms)
                  </span>
                ) : (
                  <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.85rem" }}>
                    ✗ Échec : {testResult.error}
                  </span>
                )
              ) : null}
            </div>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}

export function Admin() {
  const { section = "stats" } = useParams();
  const { t } = useI18n();
  useDocumentTitle(t("admin.title"));

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{t("admin.title")}</h1>
          <p>Gestion des comptes, du catalogue et de la traçabilité.</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {SECTIONS.map((item) => (
          <Link
            key={item.key}
            to={item.key === "stats" ? "/admin" : `/admin/${item.key}`}
            className={`tab ${section === item.key ? "active" : ""}`}
            role="tab"
            aria-selected={section === item.key}
            style={{ textDecoration: "none" }}
          >
            <Icon name={item.icon} size={15} /> {item.label}
          </Link>
        ))}
      </div>

      {section === "stats" ? <Overview /> : null}
      {section === "users" ? <UsersSection /> : null}
      {section === "categories" ? <CategoriesSection /> : null}
      {section === "listings" ? <ListingsSection /> : null}
      {section === "ai" ? <AiSection /> : null}
      {section === "audit" ? <AuditSection /> : null}
      {!["stats", "users", "categories", "listings", "ai", "audit"].includes(section) ? (
        <EmptyState icon="alert" title="Section inconnue" />
      ) : null}
    </div>
  );
}
