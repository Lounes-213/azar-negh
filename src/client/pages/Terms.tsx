import { useI18n } from "../lib/i18n";
import { useDocumentTitle } from "../lib/hooks";
import { Icon } from "../components/Icons";
import { Link } from "react-router";

export function Terms() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  useDocumentTitle(isAr ? "شروط الاستخدام — أزار نغ" : "Conditions d'utilisation — Azar Neɣ");

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
            <Icon name="file" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)", margin: 0, fontWeight: 700 }}>
              {isAr ? "شروط الاستخدام" : "Conditions Générales d'Utilisation"}
            </h1>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {isAr ? "آخر تحديث : أكتوبر 2026 • منصة أزار نغ (Azar Neɣ)" : "Dernière mise à jour : Octobre 2026 • Plateforme Azar Neɣ"}
            </p>
          </div>
        </div>

        <div className="stack" style={{ gap: 24, lineHeight: 1.7, color: "var(--ink-soft)" }}>
          {isAr ? (
            <>
              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  1. طبيعة المنصة والهدف منها
                </h2>
                <p>
                  منصة <strong>أزار نغ (Azar Neɣ)</strong> هي فضاء إلكتروني محلي وسيط يهدف إلى تسهيل التواصل والتبادل التجاري المباشر بين المشترين والبائعين المحليين. المنصة تقدم خدمات عرض الإعلانات والمتاجر، ولا تتدخل في عمليات الدفع أو استلام المنتجات أو الاتفاقيات المباشرة بين الأطراف.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  2. التسجيل والاتصال عبر حساب Google
                </h2>
                <p>
                  يتم الدخول إلى المنصة بطريقة آمنة وسريعة عبر حساب Google المعتمد. يلتزم المستخدم بتقديم معلومات حقيقية وصحيحة (مثل الاسم، رقم الهاتف والولاية) عند استكمال ملفه الشخصي، ويتحمل المسؤولية القانونية الكاملة عن كافة الأنشطة الصادرة من حسابه.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  3. قواعد نشر الإعلانات والمتاجر
                </h2>
                <p>
                  يلتزم المعلن باحترام القوانين السارية في الجمهورية الجزائرية الديمقراطية الشعبية، ويمتنع عن:
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li>نشر منتجات أو خدمات ممنوعة، مقلدة أو تنتهك حقوق الملكية الفكرية.</li>
                  <li>استخدام صور مضللة، احتيالية أو مسيئة للآداب العامة.</li>
                  <li>تكرار نفس الإعلان عدة مرات لتجنب إرباك نتائج البحث المحلية.</li>
                  <li>تقديم أسعار وهمية أو معلومات اتصال خاطئة.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  4. المعاملات والتسليم المباشر
                </h2>
                <p>
                  نظراً للطابع المحلي للمنصة، ننصح دائماً بالمعاينة الشخصية للمنتجات وإتمام المعاملات في أماكن عامة وآمنة قبل الدفع. إدارة المنصة لا تتحمل أي مسؤولية عن أي نزاع مالي أو تجاري بين البائع والمشتري.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  5. الإشراف، الإبلاغ وإدارة التخزين السحابي
                </h2>
                <p>
                  يحق لفريق الإشراف مراجعة أي إعلان وتعديله أو حذفه فورا إذا تبينت مخالفته لهذه الشروط. عند قيام المستخدم بتحديث صوره الشخصية أو حذف إعلاناته، يتم حذف الوسائط فوراً ونهائياً من خوادم التخزين السحابي المحمي حفاظاً على النظافة البيئية والموارد الرقمية.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  6. تعديل الشروط وحل النزاعات
                </h2>
                <p>
                  تحتفظ إدارة المنصة بحق تحديث شروط الاستخدام دورياً لمواكبة التطورات التقنية والتنظيمية. استمرار استخدامكم للمنصة بعد أي تعديل يُعتبر موافقة صريحة على البنود المعدلة.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  1. Objet et présentation de la plateforme
                </h2>
                <p>
                  La plateforme <strong>Azar Neɣ</strong> est un service numérique de proximité dédié à la mise en relation directe entre acheteurs et vendeurs locaux. Elle permet aux particuliers et commerçants de publier des annonces et de valoriser leurs commerces de quartier en toute simplicité. Azar Neɣ n'intervient pas comme partie prenante dans les transactions financières directes ni dans la livraison physique des biens.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  2. Accès et Authentification Google
                </h2>
                <p>
                  L'accès aux fonctionnalités avancées (publication d'annonces, création de vitrine commerçante, gestion des favoris) s'effectue via une authentification sécurisée avec votre compte Google. Vous vous engagez à renseigner des coordonnées exactes (nom, numéro de téléphone joignable, wilaya et commune) et à préserver la sécurité de vos accès.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  3. Règles de publication des annonces
                </h2>
                <p>
                  Chaque annonceur est légalement responsable des contenus et photographies qu'il met en ligne. Sont strictement prohibés :
                </p>
                <ul style={{ paddingInlineStart: 24, marginTop: 8 }}>
                  <li>La commercialisation de biens interdits par la législation algérienne ou issus d'activités illégales.</li>
                  <li>Les contrefaçons, les produits défectueux non signalés ou les tentatives d'escroquerie.</li>
                  <li>La diffusion de contenus trompeurs, haineux, diffamatoires ou contraires aux bonnes mœurs.</li>
                  <li>Le spam ou la republication abusive d'annonces similaires.</li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  4. Transactions et bon sens de proximité
                </h2>
                <p>
                  Privilégiez les rencontres en lieu public de proximité pour examiner le produit avant tout échange de fonds. Ne versez jamais d'acompte à distance sans garantie préalable.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  5. Modération et gestion stricte des médias
                </h2>
                <p>
                  L'équipe de modération se réserve le droit de retirer toute annonce ou de suspendre un compte ne respectant pas ces directives. Dans le cadre de notre engagement pour une gestion responsable des ressources, toute suppression d'annonce ou modification de photo de profil entraîne le déréférencement et la purge immédiate des fichiers associés de nos serveurs sécurisés.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", marginBottom: 8 }}>
                  6. Évolution des conditions
                </h2>
                <p>
                  Les présentes conditions d'utilisation peuvent être modifiées à tout moment pour intégrer de nouvelles fonctionnalités ou se conformer aux exigences légales. L'utilisation continue du service vaut acceptation sans réserve des dispositions en vigueur.
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
