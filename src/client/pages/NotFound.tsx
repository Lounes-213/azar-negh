import { Link } from "react-router";
import { Icon } from "../components/Icons";
import { useI18n } from "../lib/i18n";
import { useDocumentTitle } from "../lib/hooks";

export function NotFound() {
  const { t } = useI18n();
  useDocumentTitle(t("error.notFound"));
  return (
    <div className="container page">
      <div className="empty" style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="icon-wrap">
          <Icon name="alert" size={26} />
        </div>
        <h3>{t("error.notFound")}</h3>
        <p>{t("error.notFoundText")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link to="/" className="btn">
            {t("nav.home")}
          </Link>
          <Link to="/annonces" className="btn btn-secondary">
            {t("nav.browse")}
          </Link>
        </div>
      </div>
    </div>
  );
}
