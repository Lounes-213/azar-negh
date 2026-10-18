import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ItemType, ListingDetail, MetaResponse } from "../../shared/types";
import { Alert, Button, Dialog, Field, Input, Spinner, Textarea, useToast } from "../components/ui";
import { CustomSelect } from "../components/CustomSelect";
import { Icon } from "../components/Icons";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatPrice } from "../lib/format";

interface ImageItem {
  id: string;
  url: string;
  attached: boolean;
}

const CONDITION_OPTIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"] as const;

export function Sell() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  useDocumentTitle(editing ? "Modifier l'annonce" : t("sell.new"));

  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const existing = useAsync(
    () => (editing ? api<{ listing: ListingDetail }>(`/listings/${id}`) : Promise.resolve(null)),
    [id],
  );
  const quota = useAsync(
    () =>
      !editing && user
        ? api<{ current: number; max: number; canCreate: boolean }>("/account/listing-quota")
        : Promise.resolve(null),
    [editing, user?.id],
  );

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Delete listing state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [itemType, setItemType] = useState<ItemType>("PRODUCT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("1");
  const [wilayaId, setWilayaId] = useState(String(user?.wilayaId ?? 16));
  const [priceDa, setPriceDa] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [condition, setCondition] = useState<string>("GOOD");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhonePublic, setContactPhonePublic] = useState(true);
  const [contactWhatsapp, setContactWhatsapp] = useState(Boolean(user?.whatsappPublic));

  useEffect(() => {
    if (!existing.data || loaded) return;
    const { listing } = existing.data;
    setItemType(listing.itemType ?? "PRODUCT");
    setTitle(listing.title);
    setDescription(listing.description);
    setCategoryId(String(listing.category.id));
    setWilayaId(String(listing.wilaya.id));
    setPriceDa(String(listing.priceDa));
    setNegotiable(listing.negotiable);
    setCondition(listing.condition);
    setContactPhone(listing.contactPhone ?? "");
    setContactPhonePublic(listing.contactPhonePublic);
    setContactWhatsapp(listing.contactWhatsapp);
    setImages(listing.images.map((image) => ({ ...image, attached: true })));
    setLoaded(true);
  }, [existing.data, loaded]);

  const [aiBusy, setAiBusy] = useState(false);
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);

  const handleAiAutoFill = async () => {
    const hasImage = images.length > 0;
    const hasTitle = Boolean(title.trim());

    if (!hasImage && !hasTitle) {
      push(
        lang === "ar"
          ? "💡 يرجى إضافة صورة للمنتج أو كتابة كلمة في العنوان لتفعيل عصا الذكاء الاصطناعي."
          : "💡 Ajoutez une photo ou écrivez quelques mots dans le titre pour activer la baguette magique IA.",
        "default",
      );
      document.getElementById("sell-title")?.focus();
      return;
    }

    setAiBusy(true);
    try {
      const res = await api<{
        title: string;
        categoryId: number;
        condition: string;
        description: string;
        suggestedPriceDa?: number | null;
      }>("/ai/assist", {
        method: "POST",
        body: JSON.stringify({
          action: "auto_fill",
          imageId: images[0]?.id,
          title: title.trim() || undefined,
          itemType,
          lang: lang === "ar" ? "ar" : "fr",
        }),
      });

      if (res.title && (!editing || !title.trim())) setTitle(res.title);
      if (res.categoryId) setCategoryId(String(res.categoryId));
      if (res.condition && itemType !== "SERVICE") setCondition(res.condition);
      if (res.description) setDescription(res.description);
      if (res.suggestedPriceDa && !editing) {
        setSuggestedPrice(res.suggestedPriceDa);
        if (!priceDa) setPriceDa(String(res.suggestedPriceDa));
      }
      push(
        lang === "ar"
          ? "✨ تم استخراج وتعبئة بيانات الإعلان بنجاح بواسطة عصا الذكاء الاصطناعي !"
          : "✨ Informations remplies avec succès par la baguette magique IA !",
        "success",
      );
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const options: { id: number; label: string; depth: number }[] = [];
    for (const category of meta.data?.categories ?? []) {
      options.push({
        id: category.id,
        label: lang === "ar" ? category.nameAr : category.nameFr,
        depth: 0,
      });
      for (const child of category.children ?? []) {
        options.push({
          id: child.id,
          label: lang === "ar" ? child.nameAr : child.nameFr,
          depth: 1,
        });
      }
    }
    return options;
  }, [meta.data, lang]);

  const categorySelectOptions = useMemo(
    () =>
      categoryOptions.map((option) => ({
        value: option.id,
        label: option.depth > 0 ? `— ${option.label}` : option.label,
      })),
    [categoryOptions],
  );

  const wilayaSelectOptions = useMemo(
    () =>
      (meta.data?.wilayas ?? []).map((item) => ({
        value: item.id,
        label: `${item.id.toString().padStart(2, "0")} — ${lang === "ar" ? item.nameAr : item.nameFr}`,
        sublabel: lang === "ar" ? item.nameFr : item.nameAr,
      })),
    [meta.data, lang],
  );

  const conditionSelectOptions = useMemo(
    () =>
      CONDITION_OPTIONS.map((item) => ({
        value: item,
        label: t(`cond.${item}`),
      })),
    [t],
  );

  const handleAiGenerate = async () => {
    if (!title.trim()) {
      push(
        lang === "ar"
          ? "💡 يرجى كتابة عنوان الإعلان أولاً لتتمكن عصا الذكاء الاصطناعي من صياغة الوصف."
          : "💡 Veuillez d'abord renseigner le titre pour que la baguette IA puisse rédiger la description.",
        "default",
      );
      document.getElementById("sell-title")?.focus();
      return;
    }
    setAiBusy(true);
    try {
      const activeCat = meta.data?.categories.find((c) => String(c.id) === categoryId);
      const activeWil = meta.data?.wilayas.find((w) => String(w.id) === wilayaId);
      const res = await api<{ text: string }>("/ai/assist", {
        method: "POST",
        body: JSON.stringify({
          action: "generate",
          title: title.trim(),
          categoryName: activeCat ? (lang === "ar" ? activeCat.nameAr : activeCat.nameFr) : undefined,
          wilayaName: activeWil ? (lang === "ar" ? activeWil.nameAr : activeWil.nameFr) : undefined,
          priceDa: Number(priceDa) || undefined,
          condition: t(`cond.${condition}`),
          itemType,
          lang: lang === "ar" ? "ar" : "fr",
        }),
      });
      if (res.text) {
        const trimmed = res.text.length > 120 ? res.text.slice(0, 117).trim() + "..." : res.text.trim();
        setDescription(trimmed);
        push(
          lang === "ar"
            ? "✨ تم صياغة الوصف بنجاح بواسطة عصا الذكاء الاصطناعي (أقل من 120 حرف) !"
            : "✨ Description rédigée avec succès par la baguette IA (max 120 car.) !",
          "success",
        );
      }
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const handleAiImprove = async () => {
    if (!description.trim() || description.trim().length < 8) {
      push(
        lang === "ar" ? "اكتب مسودة نص لتحسينها." : "Saisissez un texte à améliorer.",
        "error",
      );
      return;
    }
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>("/ai/assist", {
        method: "POST",
        body: JSON.stringify({
          action: "improve",
          text: description.trim(),
          lang: lang === "ar" ? "ar" : "fr",
        }),
      });
      if (res.text) {
        setDescription(res.text);
        push(
          lang === "ar" ? "تم تحسين وتنسيق الوصف !" : "Description améliorée et corrigée !",
          "success",
        );
      }
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const handleAiTranslate = async () => {
    if (!description.trim() || description.trim().length < 4) return;
    setAiBusy(true);
    try {
      const isArabic = /[\u0600-\u06FF]/.test(description);
      const targetLang = isArabic ? "fr" : "ar";
      const res = await api<{ text: string }>("/ai/assist", {
        method: "POST",
        body: JSON.stringify({
          action: "translate",
          text: description.trim(),
          targetLang,
        }),
      });
      if (res.text) {
        setDescription(res.text);
        push(
          targetLang === "ar" ? "تمت الترجمة إلى العربية !" : "Traduit en français !",
          "success",
        );
      }
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setAiBusy(false);
    }
  };

  if (editing && existing.loading) return <Spinner />;
  if (editing && existing.data && !existing.data.listing.isOwner) {
    return (
      <div className="container page">
        <Alert tone="danger">Cette annonce ne vous appartient pas.</Alert>
      </div>
    );
  }

  const editingListing = existing.data?.listing;
  const notEditable =
    editingListing && !["DRAFT", "REJECTED", "APPROVED"].includes(editingListing.status);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxImages = meta.data?.maxImages ?? 3;
    if (images.length + files.length > maxImages) {
      setError(lang === "ar" ? "3 صور كحد أقصى لكل إعلان." : `${maxImages} photos maximum par annonce.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded: ImageItem[] = [];
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Format non pris en charge : utilisez JPEG, PNG ou WebP.");
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Chaque image doit faire moins de 5 Mo.");
        }
        const body = new FormData();
        body.append("file", file);
        const data = await api<{ image: { id: string; url: string } }>("/images", {
          method: "POST",
          body,
        });
        uploaded.push({ id: data.image.id, url: data.image.url, attached: false });
      }
      setImages((current) => [...current, ...uploaded]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (image: ImageItem) => {
    setImages((current) => current.filter((item) => item.id !== image.id));
    if (!image.attached) {
      try {
        await api(`/images/${image.id}`, { method: "DELETE" });
      } catch {
        // Abandoned uploads are garbage-collected after 24h.
      }
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (title.trim().length < 8) next.title = "Titre trop court (8 caractères minimum).";
    if (description.trim().length < 20)
      next.description = "Description trop courte (20 caractères minimum).";
    if (!priceDa || Number(priceDa) < 0) next.priceDa = "Indiquez un prix valide.";
    if (itemType === "PRODUCT" && images.length === 0) {
      next.images =
        lang === "ar"
          ? "يجب إضافة صورة واحدة على الأقل للمنتج (إلزامية)."
          : "Au moins une photo est obligatoire pour un produit physique.";
    }
    if (images.length > 3) {
      next.images = lang === "ar" ? "3 صور كحد أقصى لكل إعلان." : "3 photos maximum par annonce.";
    }
    setFields(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim(),
    categoryId: Number(categoryId),
    wilayaId: Number(wilayaId),
    priceDa: Number(priceDa || 0),
    negotiable,
    condition: itemType === "SERVICE" ? "NEW" : condition,
    itemType,
    contactPhone: contactPhone.trim() || null,
    contactPhonePublic,
    contactWhatsapp,
    imageIds: images.map((image) => image.id),
  });

  const save = async (submit: boolean) => {
    if (!validate()) {
      if (images.length === 0 && title.trim().length >= 8 && description.trim().length >= 20) {
        setStep(2);
      } else {
        setStep(1);
      }
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      let listingId = id;
      let status: string;
      if (!listingId) {
        const data = await api<{ listing: ListingDetail }>("/listings", {
          method: "POST",
          body: buildPayload(),
        });
        listingId = data.listing.id;
        status = data.listing.status;
      } else {
        const data = await api<{ listing: ListingDetail }>(`/listings/${listingId}`, {
          method: "PATCH",
          body: buildPayload(),
        });
        status = data.listing.status;
      }

      if (submit) {
        if (images.length === 0) {
          setError("Ajoutez au moins une photo avant de soumettre.");
          setStep(2);
          setBusy(false);
          return;
        }
        if (status === "DRAFT" || status === "REJECTED" || status === "ARCHIVED") {
          await api(`/listings/${listingId}/submit`, { method: "POST" });
        }
        push(
          lang === "ar"
            ? "تم إرسال الإعلان للمراجعة بنجاح."
            : "Annonce soumise à la modération.",
          "success",
        );
        navigate(`/annonces/${listingId}`);
      } else {
        push(
          lang === "ar"
            ? "تم حفظ مسودة الإعلان بنجاح."
            : "Brouillon enregistré.",
          "success",
        );
        navigate("/compte/annonces?status=DRAFT");
      }
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      push(msg, "error");
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteListing = async () => {
    if (!id) return;
    setDeleteBusy(true);
    try {
      await api(`/listings/${id}`, { method: "DELETE" });
      push(lang === "ar" ? "تم حذف الإعلان بنجاح." : "Annonce supprimée avec succès.", "success");
      navigate("/compte/annonces");
    } catch (err) {
      push(errorMessage(err), "error");
      setDeleteBusy(false);
    }
  };

  const previewPrice = Number(priceDa || 0);

  if (!editing && quota.data && !quota.data.canCreate) {
    return (
      <div className="container page page-sell page-enter" style={{ maxWidth: 620, margin: "24px auto" }}>
        <div
          className="quota-limit-card panel"
          style={{
            textAlign: "center",
            padding: "clamp(28px, 5vw, 44px) 24px",
            borderRadius: "var(--radius-xl)",
            background: "var(--surface)",
            border: "1.5px solid rgba(245, 158, 11, 0.35)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "22px",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 20px",
              boxShadow: "0 6px 18px rgba(217, 119, 6, 0.35)",
              fontSize: "1.6rem",
              fontWeight: 900,
              letterSpacing: -1,
            }}
          >
            6/6
          </div>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: 12 }}>
            {lang === "ar"
              ? "لقد وصلت إلى الحد الأقصى الحالي (6 إعلانات)"
              : "Limite de 6 annonces atteinte"}
          </h2>
          <p
            style={{
              color: "var(--ink-muted)",
              fontSize: "0.96rem",
              lineHeight: 1.6,
              margin: "0 auto 24px",
              maxWidth: 500,
            }}
          >
            {lang === "ar"
              ? "يتيح تطبيق أزار نغ حالياً إمكانية نشر حتى 6 إعلانات مجاناً لكل مستخدم. سنقوم قريباً بتطوير التطبيق وإضافة باقات ورعاة (Sponsors) لتمكينك من نشر عدد أكبر من الإعلانات ! يمكنك إدارة أو حذف أحد إعلاناتك السابقة لإضافة إعلان جديد."
              : "Azar Neɣ permet actuellement de publier jusqu'à 6 articles gratuitement par utilisateur. Nous développons prochainement l'application avec des sponsors et des packs pros pour vous permettre de publier encore plus d'articles ! Vous pouvez gérer ou archiver une annonce existante pour en publier une nouvelle."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/compte/annonces"
              className="btn btn-primary"
              style={{ padding: "12px 24px", fontWeight: 700 }}
            >
              <Icon name="list" size={16} />
              <span>{lang === "ar" ? "إدارة إعلاناتي (6)" : "Gérer mes annonces (6)"}</span>
            </Link>
            <Link
              to="/"
              className="btn btn-secondary"
              style={{ padding: "12px 24px" }}
            >
              <span>{lang === "ar" ? "العودة للرئيسية" : "Retour à l'accueil"}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page page-sell">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>{editing ? (lang === "ar" ? "تعديل الإعلان" : "Modifier l'annonce") : t("sell.new")}</h1>
          <p>{t("sell.publishNote")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.3)" }}
            >
              <Icon name="trash" size={15} />
              <span>{lang === "ar" ? "حذف الإعلان" : "Supprimer"}</span>
            </Button>
          ) : null}
          <Link to="/compte/annonces" className="btn btn-ghost btn-sm">
            <Icon name="arrow-left" size={16} /> {t("common.back")}
          </Link>
        </div>
      </div>

      {notEditable ? (
        <Alert tone="warning">
          Cette annonce est au statut « {t(`status.${editingListing!.status}`)} » et ne peut plus
          être modifiée. Archivez-la ou remettez-la en ligne depuis votre espace vendeur.
        </Alert>
      ) : null}

      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="wizard" style={{ paddingBottom: "calc(var(--tabbar-height, 68px) + 36px)" }}>
        <div>
          <div
            className="steps"
            aria-label="Étapes"
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              width: "100%",
            }}
          >
            {[1, 2, 3].map((index) => (
              <button
                key={index}
                type="button"
                className={`step ${step === index ? "active" : step > index ? "done" : ""}`}
                onClick={() => setStep(index)}
                aria-current={step === index ? "step" : undefined}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  padding: "9px 8px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-pill)",
                }}
              >
                <b>{step > index ? <Icon name="check" size={12} /> : index}</b>
                <span>{t(`sell.step${index}`)}</span>
              </button>
            ))}
          </div>

          {step === 1 ? (
            <div className="panel stack">
              {editing ? (
                <div style={{ marginBottom: 12 }}>
                  <Alert tone="info">
                    {lang === "ar"
                      ? "🔒 لحماية مصداقية الأسعار المعتمدة على منصة أزار نغ، فإن عنوان الإعلان وسعره مقفلان ولا يمكن تعديلهما."
                      : "🔒 Par souci de crédibilité des prix réels sur Azar Neɣ, le titre et le prix de l'annonce sont verrouillés après publication."}
                  </Alert>
                </div>
              ) : null}

              <div>
                <label className="field-label" style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
                  {lang === "ar" ? "نوع العرض" : "Type d'offre"} <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${itemType === "PRODUCT" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setItemType("PRODUCT")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 8px",
                      borderRadius: "var(--radius-md)",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                    }}
                  >
                    <span>{lang === "ar" ? "منتج مادي" : "Produit physique"}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${itemType === "SERVICE" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setItemType("SERVICE")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 8px",
                      borderRadius: "var(--radius-md)",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                    }}
                  >
                    <span>{lang === "ar" ? "خدمة" : "Service"}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${itemType === "DIGITAL" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setItemType("DIGITAL")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 8px",
                      borderRadius: "var(--radius-md)",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                    }}
                  >
                    <span>{lang === "ar" ? "منتج رقمي" : "Numérique"}</span>
                  </button>
                </div>
              </div>

              {/* Photo Upload & AI Magic Wand Section (3assa al IA) */}
              <div
                style={{
                  padding: "16px",
                  background: "var(--surface-muted)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px dashed var(--line)",
                  marginTop: 4,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "var(--ink)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="image" size={17} style={{ color: "var(--brand-600)" }} />
                      <span>{lang === "ar" ? "صور الإعلان (1 إلى 3 صور)" : "Photos de l'annonce (1 à 3 photos)"}</span>
                      {itemType === "PRODUCT" ? <span style={{ color: "var(--danger)" }}>*</span> : null}
                    </div>
                    <p className="small muted" style={{ margin: "2px 0 0" }}>
                      {itemType === "PRODUCT"
                        ? (lang === "ar"
                            ? "أول صورة ستكون الغلاف الرئيسي للإعلان (حتى 3 صور)."
                            : "La 1ère photo sera la couverture principale de votre annonce (jusqu'à 3 photos).")
                        : (lang === "ar"
                            ? "أضف صوراً توضيحية لخدمتك (اختياري، حتى 3 صور)."
                            : "Ajoutez des photos illustrant votre service (facultatif, max 3 photos).")}
                    </p>
                  </div>
                </div>

                {/* Thumbnails + Upload Slot */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {images.map((image) => (
                    <div
                      key={image.id}
                      style={{
                        position: "relative",
                        width: 80,
                        height: 80,
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border: "2px solid var(--brand-500)",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                      }}
                    >
                      <img
                        src={image.url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(image)}
                        style={{
                          position: "absolute",
                          top: 3,
                          right: 3,
                          background: "rgba(0,0,0,0.65)",
                          color: "#fff",
                          border: 0,
                          borderRadius: "50%",
                          width: 22,
                          height: 22,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                        title={lang === "ar" ? "حذف الصورة" : "Supprimer"}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}

                  {images.length < 3 ? (
                    <label
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: "var(--radius-md)",
                        border: "2px dashed var(--brand-300)",
                        background: "var(--surface)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        cursor: uploading ? "wait" : "pointer",
                        color: "var(--brand-700)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={uploading}
                        style={{ display: "none" }}
                        onChange={(e) => {
                          void uploadFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      {uploading ? (
                        <Spinner />
                      ) : (
                        <>
                          <Icon name="plus" size={20} />
                          <span>{lang === "ar" ? "إضافة صورة" : "Ajouter"}</span>
                        </>
                      )}
                    </label>
                  ) : null}
                </div>

                {itemType === "PRODUCT" && images.length === 0 ? (
                  <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                    {lang === "ar"
                      ? "💡 حمّل صورة واحدة على الأقل لتفعيل عصا الذكاء الاصطناعي (تتعرف على المنتج وتملأ الاسم، الفئة، الحالة، والوصف تلقائياً)!"
                      : "💡 Téléversez au moins 1 photo pour activer la baguette IA (analyse le produit et pré-remplit le titre, catégorie, état et description) !"}
                  </div>
                ) : null}
              </div>

              <Field
                label={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                    <span>{lang === "ar" ? "عنوان الإعلان" : "Titre de l'annonce"} <span style={{ color: "var(--danger)" }}>*</span></span>
                    {!editing ? (
                      <button
                        type="button"
                        onClick={handleAiAutoFill}
                        disabled={aiBusy}
                        className="btn btn-xs"
                        style={{
                          background: "rgba(16, 185, 129, 0.12)",
                          color: "var(--brand-700)",
                          border: "1px solid var(--brand-300)",
                          borderRadius: "var(--radius-pill)",
                          padding: "2px 10px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: aiBusy ? "wait" : "pointer",
                        }}
                      >
                        {aiBusy ? <Spinner /> : <Icon name="sparkles" size={13} style={{ color: "var(--brand-600)" }} />}
                        <span>{lang === "ar" ? "عصا الذكاء الاصطناعي ✨" : "Baguette Magique ✨"}</span>
                      </button>
                    ) : null}
                  </div>
                }
                htmlFor="sell-title"
                error={fields.title}
                required
                hint={
                  editing
                    ? lang === "ar"
                      ? "🔒 لا يمكن تعديل العنوان بعد النشر لضمان مصداقية الأسعار."
                      : "🔒 Verrouillé après publication pour garantir l'intégrité de nos prix vérifiés."
                    : lang === "ar"
                      ? "من 8 إلى 100 حرف. كن دقيقاً في الوصف أو استعن بعصا الذكاء الاصطناعي."
                      : "8 à 100 caractères. Soyez précis ou utilisez la baguette magique IA."
                }
              >
                <Input
                  id="sell-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={100}
                  disabled={editing}
                  placeholder={
                    itemType === "SERVICE"
                      ? "Ex. Réparation smartphones et tablettes à domicile"
                      : "Ex. iPhone 13 Pro 256 Go — très bon état"
                  }
                />
              </Field>

              <div className="form-grid">
                <Field
                  label={t("common.category")}
                  htmlFor="sell-category"
                  error={fields.categoryId}
                  required
                >
                  <CustomSelect
                    id="sell-category"
                    value={categoryId}
                    onChange={setCategoryId}
                    options={categorySelectOptions}
                  />
                </Field>
                <Field
                  label={t("common.wilaya")}
                  htmlFor="sell-wilaya"
                  error={fields.wilayaId}
                  required
                >
                  <CustomSelect
                    id="sell-wilaya"
                    value={wilayaId}
                    onChange={setWilayaId}
                    options={wilayaSelectOptions}
                    searchable
                    searchPlaceholder={
                      lang === "ar" ? "ابحث عن الولاية..." : "Rechercher wilaya..."
                    }
                  />
                </Field>
                <Field
                  label={
                    itemType === "SERVICE"
                      ? lang === "ar"
                        ? "تعريفة الخدمة (دج) أو ابتداءً من"
                        : "Tarif indicatif / À partir de (DA)"
                      : `${t("common.price")} (DA)`
                  }
                  htmlFor="sell-price"
                  error={fields.priceDa}
                  required
                  hint={
                    editing
                      ? lang === "ar"
                        ? "🔒 السعر مقفل لحماية مصداقية المنصة. لتعديل السعر يرجى التواصل مع الإدارة."
                        : "🔒 Prix verrouillé pour protéger la crédibilité de la plateforme."
                      : lang === "ar"
                        ? "⚠️ يجب إدخال السعر الحقيقي الفعلي. الأسعار الوهمية أو غير الواقعية تُرفض من طرف الإدارة."
                        : "⚠️ Prix réel vérifié requis. Tout prix trompeur ou fictif sera rejeté par l'admin."
                  }
                >
                  <Input
                    id="sell-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1_000_000_000}
                    value={priceDa}
                    onChange={(event) => setPriceDa(event.target.value)}
                    disabled={editing}
                    placeholder="0"
                  />
                </Field>
                {itemType !== "SERVICE" ? (
                  <Field label={t("common.condition")} htmlFor="sell-condition" required>
                    <CustomSelect
                      id="sell-condition"
                      value={condition}
                      onChange={setCondition}
                      options={conditionSelectOptions}
                    />
                  </Field>
                ) : null}
              </div>

              {suggestedPrice && !editing ? (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid var(--brand-300)",
                    fontSize: "0.88rem",
                    color: "var(--brand-800)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: "1.1rem" }}>💡</span>
                  <span>
                    {lang === "ar"
                      ? `تقدير مقترح من الذكاء الاصطناعي: ~${formatPrice(suggestedPrice)} دج. يرجى إدخال سعرك الحقيقي الفعلي في حقل السعر.`
                      : `Estimation suggérée par l'IA : ~${formatPrice(suggestedPrice)} DA. Saisissez votre prix de vente réel vérifié.`}
                  </span>
                </div>
              ) : null}

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={negotiable}
                  onChange={(event) => setNegotiable(event.target.checked)}
                />
                <span>Prix négociable</span>
              </label>

              {/* Description Field with AI Assistant Toolbar */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  <label
                    htmlFor="sell-description"
                    className="field-label"
                    style={{ margin: 0, fontWeight: 600 }}
                  >
                    {t("listing.description")} <span style={{ color: "var(--danger)" }}>*</span>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={handleAiGenerate}
                      disabled={aiBusy}
                      title={
                        lang === "ar"
                          ? "توليد وصف تلقائي جذاب ومختصر بحد أقصى 120 حرف"
                          : "Rédiger automatiquement une description concise (120 caractères max)"
                      }
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "var(--radius-pill)",
                        padding: "6px 14px",
                        fontSize: "0.84rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 32,
                        fontWeight: 700,
                        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
                        cursor: aiBusy ? "wait" : "pointer",
                      }}
                    >
                      {aiBusy ? (
                        <Spinner />
                      ) : (
                        <span style={{ fontSize: "1rem" }}>✨</span>
                      )}
                      <span>
                        {aiBusy
                          ? (lang === "ar" ? "جاري الصياغة..." : "Rédaction...")
                          : (lang === "ar" ? "عصا الذكاء الاصطناعي (120 حرف)" : "Baguette IA (120 car.)")}
                      </span>
                    </button>

                    {description.trim().length > 6 ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={handleAiImprove}
                          disabled={aiBusy}
                          title={
                            lang === "ar"
                              ? "تحسين وتنسيق الوصف"
                              : "Corriger l'orthographe et améliorer la mise en page"
                          }
                          style={{
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-pill)",
                            padding: "3px 8px",
                            fontSize: "0.8rem",
                            height: 30,
                          }}
                        >
                          {lang === "ar" ? "تحسين النص" : "Améliorer"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={handleAiTranslate}
                          disabled={aiBusy}
                          title={
                            lang === "ar"
                              ? "ترجمة النص (فرنسية ⇄ عربية)"
                              : "Traduire en Français / Arabe"
                          }
                          style={{
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-pill)",
                            padding: "3px 8px",
                            fontSize: "0.8rem",
                            height: 30,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Icon name="globe" size={13} />
                          <span>{lang === "ar" ? "ترجمة" : "Traduire"}</span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <Textarea
                  id="sell-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 120))}
                  maxLength={120}
                  placeholder={
                    lang === "ar"
                      ? "اكتب وصفاً مختصراً وجذاباً (120 حرف كحد أقصى) أو استخدم عصا الذكاء الاصطناعي..."
                      : "Description claire et concise (120 caractères max) ou utilisez la baguette IA..."
                  }
                  aria-invalid={Boolean(fields.description)}
                  style={{ minHeight: 90 }}
                />
                <div
                  className="hint mt-1"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className="small muted">
                    {lang === "ar"
                      ? "الوصف مختصر ومباشر (120 حرف كحد أقصى)."
                      : "Description concise (120 caractères max)."}
                  </span>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: description.length >= 115 ? 700 : 500,
                      color: description.length >= 120 ? "var(--brand-700)" : "inherit",
                    }}
                  >
                    {description.length}/120
                  </span>
                </div>
                {fields.description ? (
                  <div className="error-text mt-1">{fields.description}</div>
                ) : null}
              </div>

              <div className="divider" />
              <h2 style={{ fontSize: "var(--text-md)" }}>Préférences de contact</h2>
              <Field
                label="Numéro affiché sur cette annonce"
                htmlFor="sell-phone"
                error={fields.contactPhone}
                hint="Laissez vide pour utiliser le numéro de votre profil."
              >
                <Input
                  id="sell-phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder={user?.phone ?? "0551 23 45 67"}
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={contactPhonePublic}
                  onChange={(event) => setContactPhonePublic(event.target.checked)}
                />
                <span>Afficher un numéro de téléphone aux acheteurs</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={contactWhatsapp}
                  onChange={(event) => setContactWhatsapp(event.target.checked)}
                />
                <span>Proposer un contact WhatsApp</span>
              </label>

              <div className="sell-actions">
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  className="sell-primary-btn"
                >
                  {t("common.next")} <Icon name="arrow-right" size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => save(false)}
                  loading={busy}
                  className="sell-secondary-btn"
                >
                  {t("sell.draft")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="panel stack">
              <div>
                <h2 style={{ fontSize: "var(--text-md)" }}>{t("sell.images")}</h2>
                <p className="small muted">
                  {lang === "ar"
                    ? "3 صور كحد أقصى • 5 ميغابايت لكل صورة • صورة واحدة على الأقل إلزامية."
                    : "3 photos maximum • 5 Mo max par photo • 1 photo obligatoire."}
                </p>
              </div>

              {fields.images ? (
                <Alert tone="danger">{fields.images}</Alert>
              ) : null}

              <div className="upload-grid">
                {images.map((image) => (
                  <div key={image.id} className="upload-tile">
                    <img src={image.url} alt="" />
                    <button
                      type="button"
                      className="remove"
                      onClick={() => removeImage(image)}
                      aria-label="Retirer cette photo"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                {images.length < 3 ? (
                  <label className="upload-add">
                    {uploading ? <span className="spinner" /> : <Icon name="camera" size={22} />}
                    <span>{uploading ? (lang === "ar" ? "جار الرفع…" : "Envoi…") : t("sell.addImages")}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => {
                        void uploadFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>

              {images.length === 0 ? (
                <Alert tone="warning">
                  {lang === "ar"
                    ? "يجب إضافة صورة واحدة على الأقل لإمكانية نشر الإعلان."
                    : "Au moins une photo est obligatoire pour soumettre l'annonce."}
                </Alert>
              ) : null}

              <div className="sell-actions">
                <Button
                  type="button"
                  onClick={() => {
                    if (images.length === 0) {
                      setError(lang === "ar" ? "يجب إضافة صورة واحدة على الأقل للمتابعة." : "Au moins une photo est obligatoire pour continuer.");
                      return;
                    }
                    setError(null);
                    setStep(3);
                  }}
                  className="sell-primary-btn"
                >
                  {t("common.next")} <Icon name="arrow-right" size={16} />
                </Button>
                <div className="sell-sub-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep(1)}
                    style={{ flex: 1, height: 42, justifyContent: "center" }}
                  >
                    <Icon name="arrow-left" size={16} /> {t("common.back")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => save(false)}
                    loading={busy}
                    style={{ flex: 1, height: 42, justifyContent: "center" }}
                  >
                    {t("sell.draft")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="panel stack">
              <h2 style={{ fontSize: "var(--text-md)" }}>{t("sell.step3")}</h2>
              <p className="small muted">
                Vérifiez l'aperçu ci-contre. Une fois soumise, l'annonce sera examinée par un
                modérateur avant publication.
              </p>

              <dl className="stack" style={{ gap: 10 }}>
                <div className="row-between">
                  <dt className="small muted">Titre</dt>
                  <dd className="small strong" style={{ margin: 0, textAlign: "end" }}>
                    {title || "—"}
                  </dd>
                </div>
                <div className="row-between">
                  <dt className="small muted">{t("common.price")}</dt>
                  <dd className="small strong" style={{ margin: 0 }}>
                    {formatPrice(previewPrice, lang)}
                  </dd>
                </div>
                <div className="row-between">
                  <dt className="small muted">{t("common.category")}</dt>
                  <dd className="small" style={{ margin: 0 }}>
                    {categoryOptions.find((option) => option.id === Number(categoryId))?.label ??
                      "—"}
                  </dd>
                </div>
                <div className="row-between">
                  <dt className="small muted">{t("common.wilaya")}</dt>
                  <dd className="small" style={{ margin: 0 }}>
                    {meta.data?.wilayas.find((item) => item.id === Number(wilayaId))?.nameFr ?? "—"}
                  </dd>
                </div>
                <div className="row-between">
                  <dt className="small muted">{t("common.condition")}</dt>
                  <dd className="small" style={{ margin: 0 }}>
                    {t(`cond.${condition}`)}
                  </dd>
                </div>
                <div className="row-between">
                  <dt className="small muted">{t("sell.images")}</dt>
                  <dd className="small" style={{ margin: 0 }}>
                    {images.length}
                  </dd>
                </div>
              </dl>

              <div className="sell-actions">
                <Button
                  type="button"
                  onClick={() => save(true)}
                  loading={busy}
                  disabled={notEditable}
                  className="sell-primary-btn"
                >
                  <Icon name="send" size={16} /> {t("sell.publish")}
                </Button>
                <div className="sell-sub-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep(2)}
                    style={{ flex: 1, height: 42, justifyContent: "center" }}
                  >
                    <Icon name="arrow-left" size={16} /> {t("common.back")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => save(false)}
                    loading={busy}
                    style={{ flex: 1, height: 42, justifyContent: "center" }}
                  >
                    {t("sell.draft")}
                  </Button>
                </div>
              </div>
              <p className="small muted">{t("sell.publishNote")}</p>
            </div>
          ) : null}
        </div>

        <aside className={`preview-card ${step !== 3 ? "preview-card-mobile-hide" : ""}`} aria-label="Aperçu de l'annonce">
          <div className="listing-media">
            {images[0] ? (
              <img src={images[0].url} alt="" />
            ) : (
              <div className="placeholder">
                <Icon name="image" size={30} />
              </div>
            )}
          </div>
          <div className="listing-body">
            <span className="price">{formatPrice(previewPrice, lang)}</span>
            <span className="listing-title">{title || "Titre de votre annonce"}</span>
            <div className="listing-meta">
              <span>
                <Icon name="map-pin" size={13} />{" "}
                {meta.data?.wilayas.find((item) => item.id === Number(wilayaId))?.nameFr ??
                  "Algérie"}
              </span>
              <span>{t(`cond.${condition}`)}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Confirmation Dialog for Listing Deletion */}
      <Dialog
        open={confirmDelete}
        onClose={() => !deleteBusy && setConfirmDelete(false)}
        title={lang === "ar" ? "حذف الإعلان نهائياً" : "Supprimer l'annonce"}
      >
        <div className="stack" style={{ gap: 14 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            {lang === "ar"
              ? "هل أنت متأكد من رغبتك في حذف هذا الإعلان نهائياً؟ سيتم حذف جميع الصور والبيانات المرتبطة به ولا يمكن استرجاعها."
              : "Êtes-vous sûr de vouloir supprimer définitivement cette annonce ? Cette action est irréversible et toutes les photos seront effacées."}
          </p>
          <div className="dialog-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteBusy}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleDeleteListing}
              loading={deleteBusy}
              style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
            >
              <Icon name="trash" size={15} />
              <span>{lang === "ar" ? "تأكيد الحذف" : "Supprimer définitivement"}</span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
