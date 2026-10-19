import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router";
import { Icon } from "./Icons";
import { Avatar } from "./ui";
import { Logo } from "./Logo";
import { SearchSuggestions } from "./SearchSuggestions";
import { AzarBotWidget } from "./AzarBotWidget";
import { LocationModal } from "./LocationModal";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useRealtime } from "../lib/realtime";

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? "active" : ""}`;
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : "";
}

function getGreeting(user: { displayName?: string | null } | null, lang: string): string {
  const hour = new Date().getHours();
  const isEvening = hour >= 18 || hour < 5;
  const firstName = (user?.displayName ?? "").trim().split(/\s+/)[0] || "";

  if (lang === "ar") {
    const timeGreeting = isEvening ? "مساء الخير" : "صباح الخير";
    return firstName ? `${timeGreeting}، ${firstName}` : `${timeGreeting} 👋`;
  }

  const timeGreeting = isEvening ? "Bonsoir" : "Bonjour";
  return firstName ? `${timeGreeting}, ${firstName}` : `${timeGreeting} 👋`;
}

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const scrollPositions = new Map<string, number>();

function saveScroll(key: string, pathname: string, y: number) {
  scrollPositions.set(key, y);
  scrollPositions.set(pathname, y);
  try {
    sessionStorage.setItem(`azar:scroll:${pathname}`, String(y));
  } catch {
    // ignore
  }
}

function getSavedScroll(key: string, pathname: string): number {
  if (scrollPositions.has(key)) return scrollPositions.get(key)!;
  if (scrollPositions.has(pathname)) return scrollPositions.get(pathname)!;
  try {
    const val = sessionStorage.getItem(`azar:scroll:${pathname}`);
    if (val !== null) return parseInt(val, 10);
  } catch {
    // ignore
  }
  return 0;
}

function SmartScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    const handleScroll = () => {
      saveScroll(location.key, location.pathname, window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      saveScroll(location.key, location.pathname, window.scrollY);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [location.key, location.pathname]);

  useEffect(() => {
    if (navType === "POP") {
      const savedY = getSavedScroll(location.key, location.pathname);
      window.scrollTo({ top: savedY, left: 0, behavior: "instant" as ScrollBehavior });
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, left: 0, behavior: "instant" as ScrollBehavior });
      });
      const timer = setTimeout(() => {
        window.scrollTo({ top: savedY, left: 0, behavior: "instant" as ScrollBehavior });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location.key, location.pathname, navType]);

  return null;
}

export function Layout() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { unread, connected } = useRealtime();
  const [term, setTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // The account menu is keyed to the route it was opened on, so navigating
  // closes it without an effect (no cascading render on every navigation).
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuOpen = menuOpenFor === location.pathname;
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    const handleOpenLoc = () => setLocationOpen(true);
    window.addEventListener("azar:open-location", handleOpenLoc);
    return () => window.removeEventListener("azar:open-location", handleOpenLoc);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpenFor(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    setMenuOpenFor(null);
    navigate("/");
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    navigate(`/annonces${params.toString() ? `?${params}` : ""}`);
  };

  const isStaff = user && (user.role === "MODERATOR" || user.role === "ADMIN");

  return (
    <div className="shell">
      <SmartScrollRestoration />
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>

      <aside className="sidebar" aria-label="Navigation principale">
        <Link to="/" className="sidebar-brand" aria-label="Azar Neɣ, accueil">
          <Logo height={30} />
        </Link>

        <nav className="side-nav">
          <NavLink to="/" end className={navClass}>
            <Icon name="home" size={20} /> {t("nav.home")}
          </NavLink>
          <NavLink to="/annonces" className={navClass}>
            <Icon name="search" size={20} /> {t("nav.browse")}
          </NavLink>
          <NavLink to="/vendre" className={navClass}>
            <Icon name="plus" size={20} /> {t("nav.sell")}
          </NavLink>
          <NavLink to="/compte/favoris" className={navClass}>
            <Icon name="heart" size={20} /> {t("nav.favorites")}
          </NavLink>
          <NavLink to="/compte/notifications" className={navClass}>
            <Icon name="bell" size={20} /> {t("nav.notifications")}
            {unread > 0 ? <span className="nav-badge">{unread > 9 ? "9+" : unread}</span> : null}
          </NavLink>
          {isStaff ? (
            <NavLink to="/mod" className={navClass}>
              <Icon name="shield" size={20} /> {t("nav.moderation")}
            </NavLink>
          ) : null}
        </nav>

        <div className="sidebar-cta">
          {user ? (
            <div className="sidebar-user" ref={menuRef}>
              <button
                type="button"
                className="sidebar-user-btn"
                onClick={() => setMenuOpenFor(menuOpen ? null : location.pathname)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <Avatar name={user.displayName ?? user.email} imageUrl={user.avatarUrl} />
                <span className="truncate">
                  <strong>{user.displayName ?? "Mon compte"}</strong>
                  <small className="muted">{connected ? "En direct" : "Hors ligne"}</small>
                </span>
                <Icon name="chevron-down" size={16} />
              </button>
              {menuOpen ? (
                <div className="dropdown side-dropdown" role="menu">
                  <div className="dropdown-header">
                    <div className="strong">{user.displayName ?? "Mon compte"}</div>
                    <div className="small muted" style={{ overflowWrap: "anywhere" }}>
                      {user.email}
                    </div>
                  </div>
                  <Link to="/compte" className="dropdown-item" role="menuitem">
                    <Icon name="user" size={17} /> {t("account.profile")}
                  </Link>
                  <Link to="/compte/annonces" className="dropdown-item" role="menuitem">
                    <Icon name="list" size={17} /> {t("account.myListings")}
                  </Link>
                  <Link to="/compte/favoris" className="dropdown-item" role="menuitem">
                    <Icon name="heart" size={17} /> {t("account.favorites")}
                  </Link>
                  <Link to="/compte/notifications" className="dropdown-item" role="menuitem">
                    <Icon name="bell" size={17} /> {t("nav.notifications")}
                    {unread > 0 ? (
                      <span className="badge badge-danger" style={{ marginInlineStart: "auto" }}>
                        {unread}
                      </span>
                    ) : null}
                  </Link>
                  {isStaff ? (
                    <Link to="/mod" className="dropdown-item" role="menuitem">
                      <Icon name="shield" size={17} /> {t("nav.moderation")}
                    </Link>
                  ) : null}
                  <div className="divider" style={{ margin: "4px 0" }} />
                  <button
                    type="button"
                    className="dropdown-item danger"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <Icon name="logout" size={17} /> {t("nav.logout")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link to="/connexion" className="btn btn-block">
                <Icon name="logout" size={17} /> {t("nav.login")}
              </Link>
              <Link to="/connexion?mode=register" className="btn btn-ghost btn-block">
                {t("nav.register")}
              </Link>
            </>
          )}

          <button
            type="button"
            className="lang-switch"
            onClick={() => setLang(lang === "fr" ? "ar" : "fr")}
            aria-label={lang === "fr" ? "Basculer en arabe" : "Passer au français"}
          >
            <Icon name="globe" size={17} />
            {lang === "fr" ? "العربية" : "Français"}
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <Link to="/" className="topbar-brand" aria-label="Azar Neɣ, accueil">
            <Logo variant="mark" height={34} />
          </Link>

          <div className="mobile-greeting">
            <span className="mobile-greeting-stack">
              <strong className="mobile-greeting-salute">{getGreeting(user, lang)}</strong>
              <small
                className="mobile-greeting-brand"
                dir="ltr"
                style={{
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span>Aẓar</span>
                <span className="brand-negh">Negh</span>
              </small>
            </span>
          </div>

          <div className={`topbar-search-wrap ${location.pathname.startsWith("/vendre") ? "mobile-hide-on-sell" : ""}`}>
            <form className="topbar-search" onSubmit={submitSearch} role="search">
              <Icon name="search" size={18} />
              <label className="sr-only" htmlFor="global-search">
                {t("common.search")}
              </label>
              <input
                id="global-search"
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t("home.searchPlaceholder")}
                maxLength={80}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-sm">
                {t("common.search")}
              </button>
            </form>
            <SearchSuggestions
              query={term}
              isOpen={showSuggestions}
              onClose={() => setShowSuggestions(false)}
              onSelectQuery={(q) => setTerm(q)}
            />
          </div>

          <div className="topbar-actions">
            <Link
              to="/compte/notifications"
              className="mobile-bell"
              aria-label={t("nav.notifications")}
            >
              <Icon name="bell" size={21} />
              {unread > 0 ? <span className="dot">{unread > 9 ? "9+" : unread}</span> : null}
            </Link>
            {user ? (
              <Link to="/compte" className="topbar-avatar" aria-label={t("nav.account")}>
                <Avatar name={user.displayName ?? user.email} imageUrl={user.avatarUrl} />
              </Link>
            ) : (
              <Link to="/connexion" className="btn btn-sm topbar-login">
                {t("nav.login")}
              </Link>
            )}
          </div>
        </header>

        <main id="main" className="shell-content">
          <Outlet />
          <AzarBotWidget />
        </main>

        <footer className="footer">
          <div className="container">
            <div className="footer-grid">
              <div>
                <Logo dark={false} height={28} />
                <p className="small muted mt-3" style={{ maxWidth: "34ch" }}>
                  {t("footer.disclaimer")}
                </p>
              </div>
              <div>
                <h4>{t("footer.browse")}</h4>
                <Link to="/annonces">{t("nav.browse")}</Link>
                <br />
                <Link to="/annonces?sort=price_asc">Petits prix</Link>
                <br />
                <Link to="/vendre">{t("footer.sell")}</Link>
              </div>
              <div>
                <h4>{t("footer.legal")}</h4>
                <Link to="/annonces?condition=NEW">Produits neufs</Link>
                <br />
                <span className="small muted">Aucun paiement en ligne</span>
                <br />
                <span className="small muted">Annonces modérées</span>
              </div>
              <div>
                <h4>Langue</h4>
                <button type="button" className="btn-link" onClick={() => setLang("fr")}>
                  Français
                </button>
                <br />
                <button type="button" className="btn-link" onClick={() => setLang("ar")}>
                  العربية
                </button>
              </div>
            </div>
            <div className="footer-bottom">
              <span>
                © {new Date().getFullYear()} Azar <span className="brand-negh">Negh</span>. {t("footer.rights")}
              </span>
              <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                <Link to="/conditions" className="muted" style={{ fontSize: "12px" }}>
                  {lang === "ar" ? "شروط الاستخدام" : "Conditions"}
                </Link>
                <Link to="/confidentialite" className="muted" style={{ fontSize: "12px" }}>
                  {lang === "ar" ? "سياسة الخصوصية" : "Confidentialité"}
                </Link>
                <span>DZD · Azar <span className="brand-negh">Negh</span></span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      <nav className="tabbar" aria-label="Navigation mobile">
        <NavLink to="/" end className={tabClass}>
          <Icon name="home" size={22} />
          <span>{t("nav.home")}</span>
        </NavLink>
        <NavLink to="/annonces" className={tabClass}>
          <Icon name="grid" size={22} />
          <span>{t("nav.browse")}</span>
        </NavLink>
        <NavLink to="/vendre" className={`${tabClass} tab-sell`.trim()}>
          <span className="tab-icon">
            <Icon name="plus" size={22} />
          </span>
          <span>{t("nav.sell")}</span>
        </NavLink>
        <NavLink to="/compte/favoris" className={tabClass}>
          <Icon name="heart" size={22} />
          <span>{t("nav.favorites")}</span>
        </NavLink>
        <NavLink to="/compte" className={tabClass}>
          <Icon name="user" size={22} />
          <span>{t("nav.account")}</span>
        </NavLink>
      </nav>

      <LocationModal open={locationOpen} onClose={() => setLocationOpen(false)} />
    </div>
  );
}
