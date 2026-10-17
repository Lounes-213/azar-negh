import { useI18n } from "../lib/i18n";
import { useDocumentTitle } from "../lib/hooks";
import { Icon } from "../components/Icons";
import { Link } from "react-router";

export function Privacy() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  useDocumentTitle(isAr ? "سياسة الخصوصية — أزار نغ" : "Politique de confidentialité — Azar Neɣ");

  return (
    <div className="container page" style={{ maxWidth: 880 }}>
      <div className="panel" style={{ padding: "clamp(1.25rem, 3vw, 2.5rem)" }}>
        <div className="row mb-4" style={{ gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-md)",
              background: "var(--brand-50)",
              color: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="shield" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)", margin: 0, fontWeight: 700 }}>
              {isAr ? "سياسة الخصوصية وحماية البيانات" : "Politique de Confidentialité"}
            </h1>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {isAr ? "احترام خصوصيتكم هو أولويتنا • منصة أزار نغ (Azar Neɣ)" : "Protection de vos données personnelles • Plateforme Azar Neɣ"}
            </p>
          </div>
        </div>

        <div className="stack" style={{ gap: 24, lineHeight: 1.7, color: "var(--ink-soft)" }}>
          {isAr ? (
            <>
              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  1. البيانات التي نجمعها
                </h2>
                <p>
                  نحن نجمع فقط المعلومات الضرورية لتشغيل حسابكم وتسهيل التواصل التجاري المحلي:
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li><strong>معلومات الدخول عبر Google :</strong> الاسم الكامل، البريد الإلكتروني، والصورة الشخصية الأصلية لحسابكم.</li>
                  <li><strong>معلومات الملف التجاري :</strong> رقم الهاتف (اختياري للعرض العام)، الولاية والبلدية، اسم المتجر وساعات العمل.</li>
                  <li><strong>صور الإعلانات :</strong> الصور والوثائق المرفوعة طواعية لعرض السلع والخدمات.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  2. استخدام البيانات وحمايتها
                </h2>
                <p>
                  تُستخدم بياناتكم حصرياً لتمكينكم من نشر إعلاناتكم، وإدارة متجركم الشخصي، والتواصل مع الزبائن المحليين. نحن <strong>لا نقوم أبداً ببيع أو تأجير</strong> بياناتكم الشخصية لأي طرف ثالث أو لشركات الإعلانات التتبعية.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  3. التخزين الذكي والتنظيف الفوري (Cloudflare R2)
                </h2>
                <p>
                  حرصاً على حماية بياناتكم وتحسين أداء التطبيق، نعتمد سياسة الحذف الفوري:
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li>عند قيامك بتغيير صورتك الشخصية، يتم حذف الصورة القديمة فوراً وبشكل دائم من خوادم التخزين السحابي المحمي (R2).</li>
                  <li>عند حذف إعلان أو تعديل صوره، يتم تطهير جميع الملفات المرتبطة به دون ترك أي نسخ متبقية في السحابة.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  4. ملفات تعريف الارتباط والأمان
                </h2>
                <p>
                  تعتمد المنصة على ملفات تعريف ارتباط مشفرة ومؤمنة (HttpOnly Cookies) مخصصة فقط للحفاظ على جلستكم المتصلة وتوفير حماية ضد هجمات تزوير الطلبات (CSRF). لا نستخدم ملفات تعريف ارتباط خارجية لأغراض التتبع الإعلاني.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  5. حقوقكم في التحكم بالبيانات
                </h2>
                <p>
                  يحق لكم في أي وقت تعديل بيانات ملفكم الشخصي، رقم هاتفكم، صورتكم الشخصية، أو إخفاء رقم الهاتف عن العامة بنقرة واحدة من صفحة «حسابي». كما يمكنكم طلب حذف الحساب نهائياً عبر التواصل مع إدارة المنصة.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  1. Données collectées
                </h2>
                <p>
                  Dans le cadre de l'utilisation de nos services, nous collectons les données strictement nécessaires au bon fonctionnement de vos annonces et de votre boutique :
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li><strong>Authentification Google :</strong> nom complet, adresse e-mail et photo de profil publique importée lors de la première connexion.</li>
                  <li><strong>Informations de contact & commerce :</strong> numéro de téléphone (que vous pouvez choisir de masquer ou rendre public), wilaya, commune, nom commercial et horaires.</li>
                  <li><strong>Médias :</strong> photographies de vos produits et services téléversées volontairement.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  2. Utilisation et non-divulgation
                </h2>
                <p>
                  Vos données ne sont utilisées que pour vous authentifier, afficher vos annonces et permettre aux acheteurs de proximité de vous contacter directement. <strong>Nous ne vendons, ne louons et ne cédons aucune donnée personnelle</strong> à des courtiers en données ou régies publicitaires tierces.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  3. Gestion responsable du stockage Cloudflare R2
                </h2>
                <p>
                  Nous appliquons une politique stricte d'éviction des données obsolètes :
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li>Lorsque vous modifiez ou supprimez votre photo de profil, l'ancien fichier stocké sur notre infrastructure Cloudflare R2 est instantanément et définitivement supprimé.</li>
                  <li>La suppression ou la mise à jour des images d'une annonce entraîne la purge systématique des anciens visuels de notre compartiment de stockage cloud.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  4. Cookies et intégrité de session
                </h2>
                <p>
                  Notre application utilise exclusivement des cookies de session chiffrés sécurisés (`HttpOnly`, `SameSite`), indispensables pour garantir l'intégrité de vos transactions et vous prémunir contre les attaques de type CSRF. Aucun traceur publicitaire invasif n'est déployé.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  5. Vos droits d'accès, de rectification et d'oubli
                </h2>
                <p>
                  Conformément aux principes de protection de la vie privée, vous disposez à tout moment d'un droit d'accès, de modification et d'effacement de vos données personnelles directement depuis la page « Mon compte ». Pour toute question complémentaire, notre équipe d'assistance reste à votre disposition.
                </p>
              </section>
            </>
          )}

          <div className="pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <Link to="/" className="btn btn-secondary">
              {isAr ? "العودة إلى الصفحة الرئيسية" : "Retour à l'accueil"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
