import { Component, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { SplashScreen } from "./components/SplashScreen";
import { useAuth } from "./lib/auth";
import type { Role } from "../shared/types";
import { Home } from "./pages/Home";
import { Search } from "./pages/Search";
import { ListingDetail } from "./pages/ListingDetail";
import { Seller } from "./pages/Seller";
import { Login } from "./pages/Login";
import { Account } from "./pages/Account";
import { MyListings } from "./pages/MyListings";
import { Favorites } from "./pages/Favorites";
import { Notifications } from "./pages/Notifications";
import { Sell } from "./pages/Sell";
import { Moderation } from "./pages/Moderation";
import { ModerationDetail } from "./pages/ModerationDetail";
import { Reports } from "./pages/Reports";
import { Admin } from "./pages/Admin";
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";
import { NotFound } from "./pages/NotFound";
import { SecretAdminPortal } from "./admin-portal/App";

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <NotFound />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI error:", error.message);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container page">
          <div className="empty" style={{ maxWidth: 620, margin: "0 auto" }}>
            <h3>Quelque chose s'est mal passé</h3>
            <p>Rechargez la page pour réessayer. Si le problème persiste, contactez le support.</p>
            <button type="button" className="btn mt-4" onClick={() => window.location.reload()}>
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ErrorBoundary>
      {showSplash ? <SplashScreen onFinish={() => setShowSplash(false)} /> : null}
      <Routes>
        <Route path="azar-secret-control-77x" element={<SecretAdminPortal />} />
        <Route path="azar-secret-control-77x/*" element={<SecretAdminPortal />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="annonces" element={<Search mode="all" />} />
          <Route path="categories/:slug" element={<Search mode="category" />} />
          <Route path="wilayas/:slug" element={<Search mode="wilaya" />} />
          <Route path="annonces/:id" element={<ListingDetail />} />
          <Route path="vendeurs/:id" element={<Seller />} />
          <Route path="boutique/:id" element={<Seller />} />
          <Route path="connexion" element={<Login />} />
          <Route path="conditions" element={<Terms />} />
          <Route path="confidentialite" element={<Privacy />} />
          <Route
            path="compte"
            element={
              <Protected>
                <Account />
              </Protected>
            }
          />
          <Route
            path="compte/annonces"
            element={
              <Protected>
                <MyListings />
              </Protected>
            }
          />
          <Route
            path="compte/favoris"
            element={
              <Protected>
                <Favorites />
              </Protected>
            }
          />
          <Route
            path="compte/notifications"
            element={
              <Protected>
                <Notifications />
              </Protected>
            }
          />
          <Route
            path="vendre"
            element={
              <Protected>
                <Sell />
              </Protected>
            }
          />
          <Route
            path="vendre/:id"
            element={
              <Protected>
                <Sell />
              </Protected>
            }
          />
          <Route
            path="mod"
            element={
              <Protected roles={["MODERATOR", "ADMIN"]}>
                <Moderation />
              </Protected>
            }
          />
          <Route
            path="mod/annonces/:id"
            element={
              <Protected roles={["MODERATOR", "ADMIN"]}>
                <ModerationDetail />
              </Protected>
            }
          />
          <Route
            path="mod/signalements"
            element={
              <Protected roles={["MODERATOR", "ADMIN"]}>
                <Reports />
              </Protected>
            }
          />
          <Route
            path="admin"
            element={
              <Protected roles={["ADMIN"]}>
                <Admin />
              </Protected>
            }
          />
          <Route
            path="admin/:section"
            element={
              <Protected roles={["ADMIN"]}>
                <Admin />
              </Protected>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
