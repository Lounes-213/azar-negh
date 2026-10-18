import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "./Icons";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { getLocalUserPersona } from "../lib/persona";

export interface BotProductCard {
  id: string;
  title: string;
  priceDa: number;
  originalPriceDa?: number | null;
  wilayaName: string;
  condition: string;
  itemType: string;
  imageUrl: string | null;
}

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: number;
  imagePreview?: string;
  products?: BotProductCard[];
}

const CHAT_STORAGE_KEY = "azar_bot_chat_history_v2";

/**
 * Fast client-side image downscaling for Gemini Vision AI.
 * Downscales images to max 850px dimension and compresses to JPEG 0.82.
 * Drops upload payload size from 4-5MB down to ~70KB, making mobile upload 10x faster
 * and Gemini Vision inference 3x faster!
 */
async function compressImageForVision(file: File): Promise<{
  base64: string;
  previewUrl: string;
  mimeType: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const rawResult = reader.result as string;
      const img = new Image();
      img.onerror = () => {
        // Fallback to uncompressed if browser image decode fails
        const base64Data = rawResult.split(",")[1] || "";
        resolve({
          base64: base64Data,
          previewUrl: rawResult,
          mimeType: file.type || "image/jpeg",
        });
      };
      img.onload = () => {
        try {
          const MAX_DIM = 850;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            const base64Data = rawResult.split(",")[1] || "";
            resolve({
              base64: base64Data,
              previewUrl: rawResult,
              mimeType: file.type || "image/jpeg",
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
          const base64 = compressedDataUrl.split(",")[1] || "";
          resolve({
            base64,
            previewUrl: compressedDataUrl,
            mimeType: "image/jpeg",
          });
        } catch {
          const base64Data = rawResult.split(",")[1] || "";
          resolve({
            base64: base64Data,
            previewUrl: rawResult,
            mimeType: file.type || "image/jpeg",
          });
        }
      };
      img.src = rawResult;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Parses inline markdown:
 * - **bold text** -> green highlight (<strong className="azarbot-highlight">)
 * - [Link Label](/url) -> clickable product chip with modal close
 * - `code` -> inline code
 */
function renderInlineMarkdown(text: string, onNavigate?: () => void): React.ReactNode[] {
  // Regex matches **bold**, [link](url) with optional whitespace, and `code`
  const tokenRegex = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\s*\(([^)\s]+)\)|`([^`]+)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold text** -> styled in vibrant green brand color
      nodes.push(
        <strong key={`b_${match.index}`} className="azarbot-highlight">
          {match[2]}
        </strong>,
      );
    } else if (match[3] && match[4]) {
      // [Link Label](/url) -> product chip that closes chat and navigates to listing
      const label = match[3];
      const url = match[4];
      nodes.push(
        <Link
          key={`l_${match.index}`}
          to={url}
          className="azarbot-product-chip"
          onClick={onNavigate}
        >
          <Icon name="tag" size={12} />
          <span>{label}</span>
        </Link>,
      );
    } else if (match[5]) {
      // `code`
      nodes.push(
        <code key={`c_${match.index}`} className="azarbot-inline-code">
          {match[5]}
        </code>,
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Renders full markdown with support for:
 * - Comparison Tables (| col1 | col2 |) with smooth horizontal scrolling
 * - Bullet lists (- item or * item)
 * - Green bold highlights (**text**)
 * - Product link chips
 */
function renderRichContent(content: string, onNavigate?: () => void): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Check if line is start of a Markdown Table: line begins and ends with |
    const nextLine = lines[i + 1] ?? "";
    if (line.trim().startsWith("|") && line.trim().endsWith("|") && i + 1 < lines.length && nextLine.includes("---")) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const curLine = lines[i] ?? "";
        if (curLine.trim().startsWith("|") && curLine.trim().endsWith("|")) {
          tableLines.push(curLine.trim());
          i++;
        } else {
          break;
        }
      }

      if (tableLines.length >= 2 && tableLines[0]) {
        const headerRow = tableLines[0]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());

        // Skip separator row (tableLines[1])
        const dataRows = tableLines.slice(2).map((r) =>
          r
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim()),
        );

        elements.push(
          <div key={`table_${i}`} className="azarbot-table-wrap" tabIndex={0} aria-label="Tableau de comparaison">
            <table className="azarbot-table">
              <thead>
                <tr>
                  {headerRow.map((h, hIdx) => (
                    <th key={hIdx}>{renderInlineMarkdown(h, onNavigate)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{renderInlineMarkdown(cell, onNavigate)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    // Bullet points: lines starting with "- " or "* "
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const curLine = lines[i] ?? "";
        if (curLine.trim().startsWith("- ") || curLine.trim().startsWith("* ")) {
          listItems.push(curLine.trim().slice(2).trim());
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`list_${i}`} className="azarbot-list">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item, onNavigate)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Normal text line
    if (line.trim().length > 0) {
      elements.push(
        <p key={`p_${i}`} className="azarbot-paragraph">
          {renderInlineMarkdown(line, onNavigate)}
        </p>,
      );
    } else {
      // Empty line spacer
      elements.push(<div key={`sp_${i}`} className="azarbot-spacer" />);
    }

    i++;
  }

  return <>{elements}</>;
}

export function AzarBotWidget() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const isAr = lang === "ar";

  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasPromptedGreeting, setHasPromptedGreeting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search by image state
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    base64: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasOpenedRef = useRef(false);

  const closeChat = () => {
    setIsOpen(false);
    setIsFullscreen(false);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  // Smooth automatic collapse after 3.8s and on scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsCollapsed(true);
    }, 3800);

    const onScroll = () => {
      setIsCollapsed(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Load chat history from client localStorage (zero DB writes)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        setMessages(JSON.parse(raw));
      } else {
        // Clean default welcoming message with bold green hints
        const initial: Message = {
          id: "welcome",
          role: "model",
          content: isAr
            ? `مرحباً بك${user ? ` **${user.displayName || ""}**` : ""}! أنا **آزار شات**، مساعدك الذكي للتسوق في الجزائر.\nاسألني عن أي منتج، قارن بين **الأسعار والمواصفات**، أو ارفع **صورة لأي سلعة** للبحث عنها فوراً!`
            : `Bonjour${user ? ` **${user.displayName || ""}**` : ""} ! Je suis **Azar Chat**, votre assistant shopping intelligent.\nPosez-moi vos questions, comparez les **prix et caractéristiques**, ou téléversez la **photo d'un produit** pour le retrouver immédiatement !`,
          createdAt: Date.now(),
        };
        setMessages([initial]);
      }
    } catch {
      // Fallback
    }
  }, [isAr, user]);

  // Save chat history locally whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      } catch {
        // Quota fallback
      }
    }
  }, [messages]);

  // Scroll to bottom: Instant on open (no animation from top), smooth only on new incoming messages
  useEffect(() => {
    if (isOpen) {
      if (!hasOpenedRef.current) {
        hasOpenedRef.current = true;
        // Instantly position scroll at the bottom
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
      } else {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTo({
            top: chatBodyRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    } else {
      hasOpenedRef.current = false;
    }
  }, [messages, isOpen, loading]);

  // Immediate layout effect & animation frame to ensure the opened modal displays from bottom immediately
  useLayoutEffect(() => {
    if (isOpen && chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  const clearChat = () => {
    const resetMsg: Message = {
      id: "reset",
      role: "model",
      content: isAr
        ? "تم مسح المحادثة. يمكنك سؤالي أو إرسال **صورة لأي منتج** للبحث عنه."
        : "Discussion effacée. Posez une question ou envoyez une **photo d'un produit** pour le chercher.",
      createdAt: Date.now(),
    };
    setMessages([resetMsg]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const copyToClipboard = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict 5MB limit check
    if (file.size > 5 * 1024 * 1024) {
      alert(
        isAr
          ? "حجم الصورة كبير جداً! الحد الأقصى المسموح به هو 5 ميغابايت."
          : "L'image est trop volumineuse ! La taille maximale est de 5 Mo.",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setIsCompressing(true);
      const compressed = await compressImageForVision(file);
      setSelectedImage({
        file,
        base64: compressed.base64,
        mimeType: compressed.mimeType,
        previewUrl: compressed.previewUrl,
      });
    } catch (err) {
      console.error("Image processing error:", err);
    } finally {
      setIsCompressing(false);
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if ((!text && !selectedImage) || loading || isCompressing) return;

    const currentImage = selectedImage;
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text || (isAr ? "ابحث لي عن هذا المنتج في المنصة" : "Trouvez-moi ce produit sur la plateforme"),
      createdAt: Date.now(),
      imagePreview: currentImage ? currentImage.previewUrl : undefined,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const persona = getLocalUserPersona();
      const payload: any = {
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        userPersona: persona,
        lang: isAr ? "ar" : "fr",
      };

      if (currentImage) {
        payload.image = {
          mimeType: currentImage.mimeType,
          data: currentImage.base64,
        };
      }

      const res = await api<{ reply: string; products?: BotProductCard[] }>("/ai/chat", {
        method: "POST",
        body: payload,
        signal: controller.signal,
      });

      const botMsg: Message = {
        id: `m_${Date.now()}`,
        role: "model",
        content: res.reply || (isAr ? "عذراً، لم أستطع العثور على نتيجة." : "Désolé, aucune réponse trouvée."),
        createdAt: Date.now(),
        products: res.products && res.products.length > 0 ? res.products.slice(0, 3) : undefined,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        // User aborted request manually via Stop button
        return;
      }
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: "model",
        content: errorMessage(err),
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const quickPrompts = isAr
    ? ["أفضل الهواتف اليوم", "قارن بين العروض", "نصائح فحص السلعة", "سيارات بأفضل سعر"]
    : ["Meilleurs smartphones", "Comparer les offres", "Conseils d'achat", "Voitures bon prix"];

  return (
    <div className={`azarbot-widget-container ${isAr ? "is-rtl" : ""}`}>
      {/* Floating Animated Mascot Button */}
      {!isOpen ? (
        <button
          type="button"
          className={`azarbot-launcher-btn ${isCollapsed ? "is-collapsed" : ""}`}
          onClick={() => {
            setIsOpen(true);
            setHasPromptedGreeting(true);
          }}
          onMouseEnter={() => setIsCollapsed(false)}
          onMouseLeave={() => setIsCollapsed(true)}
          aria-label={isAr ? "فتح آزار شات" : "Ouvrir Azar Chat"}
          title={isAr ? "آزار شات — مساعد التسوق الذكي" : "Azar Chat — Assistant Shopping IA"}
        >
          <div className="azarbot-robot-avatar">
            <svg viewBox="0 0 48 48" width="34" height="34" fill="none">
              <circle cx="24" cy="6" r="3.5" fill="#10b981" />
              <line x1="24" y1="9" x2="24" y2="15" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
              <rect x="8" y="15" width="32" height="25" rx="8" fill="#10b981" />
              <rect x="12" y="19" width="24" height="15" rx="4" fill="#064e3b" />
              <circle cx="18" cy="26" r="3" fill="#6ee7b7" className="robot-eye" />
              <circle cx="30" cy="26" r="3" fill="#6ee7b7" className="robot-eye" />
              <path d="M21 31c1 1 5 1 6 0" stroke="#a7f3d0" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="4" y="23" width="4" height="7" rx="2" fill="#059669" />
              <rect x="40" y="23" width="4" height="7" rx="2" fill="#059669" />
            </svg>
            <span className="azarbot-online-badge" />
          </div>

          <span className="azarbot-launcher-label">
            {isAr ? (
              <span>
                آزار <span style={{ color: "#34d399", fontWeight: 800 }}>شات</span>
              </span>
            ) : (
              <span>
                Azar <span style={{ color: "#34d399", fontWeight: 800 }}>Chat</span>
              </span>
            )}
          </span>

          {!hasPromptedGreeting && !isCollapsed ? (
            <div className="azarbot-greeting-pill">
              {isAr ? "خصك سلعة؟ راني هنا" : "Besoin d'aide ?"}
            </div>
          ) : null}
        </button>
      ) : null}

      {/* Spacious Floating Chat Modal Panel */}
      {isOpen ? (
        <div
          className={`azarbot-panel ${isFullscreen ? "is-fullscreen" : ""}`}
          role="dialog"
          aria-labelledby="azarbot-title"
        >
          {/* Header with clean logo, full screen toggle and X close button */}
          <div className="azarbot-header">
            <div className="azarbot-header-info">
              <div className="azarbot-header-avatar">
                <svg viewBox="0 0 48 48" width="26" height="26" fill="none">
                  <circle cx="24" cy="6" r="3" fill="#10b981" />
                  <line x1="24" y1="9" x2="24" y2="15" stroke="#10b981" strokeWidth="2" />
                  <rect x="9" y="15" width="30" height="24" rx="7" fill="#10b981" />
                  <rect x="13" y="19" width="22" height="14" rx="3.5" fill="#064e3b" />
                  <circle cx="19" cy="25" r="2.5" fill="#6ee7b7" />
                  <circle cx="29" cy="25" r="2.5" fill="#6ee7b7" />
                </svg>
                <span className="azarbot-header-status" />
              </div>
              <div>
                <h3 id="azarbot-title" className="azarbot-header-name">
                  {isAr ? (
                    <span>
                      آزار <span style={{ color: "#10b981", fontWeight: 800 }}>شات</span>
                    </span>
                  ) : (
                    <span>
                      Azar <span style={{ color: "#10b981", fontWeight: 800 }}>Chat</span>
                    </span>
                  )}
                </h3>
                <small className="azarbot-header-desc">
                  {isAr ? "مساعد التسوق والبحث بالصور" : "Assistant shopping & recherche par image"}
                </small>
              </div>
            </div>

            <div className="azarbot-header-actions">
              <button
                type="button"
                className="azarbot-icon-btn"
                onClick={clearChat}
                title={isAr ? "مسح المحادثة" : "Effacer la conversation"}
                aria-label="Effacer"
              >
                <Icon name="trash" size={16} />
              </button>
              <button
                type="button"
                className="azarbot-icon-btn"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title={isFullscreen ? (isAr ? "استعادة الحجم" : "Réduire") : (isAr ? "تكبير الشاشة بالكامل" : "Plein écran")}
                aria-label="Plein écran"
              >
                <Icon name={isFullscreen ? "minimize" : "maximize"} size={16} />
              </button>
              <button
                type="button"
                className="azarbot-icon-btn close-btn"
                onClick={closeChat}
                title={isAr ? "إغلاق" : "Fermer"}
                aria-label="Fermer"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="azarbot-body" ref={chatBodyRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`azarbot-message-row ${msg.role === "user" ? "user-row" : "bot-row"}`}>
                <div className={`azarbot-bubble ${msg.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                  {/* User uploaded image preview inside chat */}
                  {msg.imagePreview ? (
                    <div className="azarbot-msg-image-wrap">
                      <img src={msg.imagePreview} alt="User upload" className="azarbot-msg-image" />
                    </div>
                  ) : null}

                  <div className="azarbot-bubble-content">
                    {renderRichContent(msg.content, closeChat)}
                  </div>

                  {/* Attached Rich Product Cards (Max 3) - Click navigates to product and closes bot */}
                  {msg.products && msg.products.length > 0 ? (
                    <div className="azarbot-products-grid">
                      <div className="azarbot-products-label">
                        <Icon name="tag" size={12} />
                        <span>{isAr ? "عروض مطابقة في المنصة:" : "Offres correspondantes :"}</span>
                      </div>
                      {msg.products.slice(0, 3).map((prod) => (
                        <Link
                          key={prod.id}
                          to={`/annonces/${prod.id}`}
                          className="azarbot-product-card"
                          title={prod.title}
                          onClick={closeChat}
                        >
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.title} className="azarbot-card-thumb" />
                          ) : (
                            <div className="azarbot-card-thumb-placeholder">
                              <Icon name="tag" size={20} />
                            </div>
                          )}

                          <div className="azarbot-card-body">
                            <h4 className="azarbot-card-title">{prod.title}</h4>
                            <div className="azarbot-card-price-row">
                              <span className="azarbot-card-price">{prod.priceDa.toLocaleString()} DA</span>
                              {prod.originalPriceDa && prod.originalPriceDa > prod.priceDa ? (
                                <span className="azarbot-card-old-price">
                                  {prod.originalPriceDa.toLocaleString()} DA
                                </span>
                              ) : null}
                            </div>
                            <div className="azarbot-card-meta">
                              <span className="azarbot-card-badge">{prod.wilayaName}</span>
                              <span className="azarbot-card-badge">{prod.condition}</span>
                            </div>
                          </div>

                          <span className="azarbot-card-action">
                            <Icon name={isAr ? "chevron-left" : "chevron-right"} size={16} />
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {/* Bot utilities: Copy advice text */}
                  {msg.role === "model" && msg.content ? (
                    <div className="azarbot-msg-actions">
                      <button
                        type="button"
                        className="azarbot-msg-copy-btn"
                        onClick={() => copyToClipboard(msg.id, msg.content)}
                        title={isAr ? "نسخ النص" : "Copier le texte"}
                      >
                        {copiedId === msg.id ? (
                          <span className="copied-text">{isAr ? "تم النسخ ✓" : "Copié ✓"}</span>
                        ) : (
                          <Icon name="edit" size={12} />
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="azarbot-message-row bot-row">
                <div className="azarbot-bubble bot-bubble loading-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="loading-hint">
                    {selectedImage
                      ? isAr
                        ? "جاري تحليل الصورة والبحث عن المنتجات..."
                        : "Analyse de l'image en cours..."
                      : isAr
                      ? "جاري التفكير والبحث..."
                      : "Recherche en cours..."}
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions pills */}
          <div className="azarbot-quick-pills">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="azarbot-quick-pill"
                onClick={() => sendMessage(prompt)}
                disabled={loading || isCompressing}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Image Upload Preview Bar before sending */}
          {selectedImage ? (
            <div className="azarbot-image-preview-bar">
              <img src={selectedImage.previewUrl} alt="Preview" className="azarbot-image-preview-thumb" />
              <div className="azarbot-image-preview-info">
                <span className="azarbot-image-preview-name">{selectedImage.file.name}</span>
                <span className="azarbot-image-preview-hint">
                  {isAr ? "صورة مجهزة للبحث السريع (Vision AI)" : "Image optimisée pour la recherche"}
                </span>
              </div>
              <button
                type="button"
                className="azarbot-remove-image-btn"
                onClick={removeSelectedImage}
                title={isAr ? "إلغاء الصورة" : "Supprimer"}
                aria-label="Supprimer l'image"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : null}

          {/* Input Box with Camera button, Stop button and Send (>) button */}
          <form
            className="azarbot-footer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            {/* Hidden native file input for camera/image upload (max 5MB) */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleImageSelect}
            />

            {/* Photo / Camera search button */}
            <button
              type="button"
              className={`azarbot-image-btn ${selectedImage ? "has-image" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              title={isAr ? "ابحث بصورة من هاتفك (تحليل سريع)" : "Chercher par image"}
              aria-label="Téléverser une image"
              disabled={loading || isCompressing}
            >
              <Icon name="camera" size={18} />
            </button>

            <input
              ref={inputRef}
              type="text"
              className="azarbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isCompressing
                  ? isAr
                    ? "جاري تجهيز الصورة..."
                    : "Traitement de l'image..."
                  : selectedImage
                  ? isAr
                    ? "أضف ملاحظة أو اضغط إرسال للبحث..."
                    : "Ajoutez un mot ou envoyez..."
                  : isAr
                  ? "اسأل عن منتج أو ارفع صورة..."
                  : "Posez une question ou envoyez une photo..."
              }
              maxLength={400}
              autoFocus={false}
              disabled={loading}
            />

            {/* Stop button while loading, or > send button */}
            {loading ? (
              <button
                type="button"
                className="azarbot-stop-btn"
                onClick={stopGeneration}
                title={isAr ? "إيقاف الرد" : "Arrêter la génération"}
                aria-label="Arrêter"
              >
                <Icon name="square" size={12} filled />
                <span>{isAr ? "إيقاف" : "Stop"}</span>
              </button>
            ) : (
              <button
                type="submit"
                className="azarbot-send-btn"
                disabled={(!input.trim() && !selectedImage) || isCompressing}
                aria-label="Envoyer"
                title={isAr ? "إرسال" : "Envoyer"}
              >
                <Icon name={isAr ? "chevron-left" : "chevron-right"} size={18} />
              </button>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
}
