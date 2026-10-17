import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "./Icons";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { getLocalUserPersona } from "../lib/persona";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: number;
}

const CHAT_STORAGE_KEY = "azar_bot_chat_history_v1";

function renderMarkdownWithLinks(text: string) {
  // Matches markdown links like [Titre de l'annonce](/annonces/123)
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1] || "";
    const url = match[2] || "/";
    parts.push(
      <Link key={match.index} to={url} className="azarbot-product-chip">
        <Icon name="tag" size={13} />
        <span>{label}</span>
      </Link>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function AzarBotWidget() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const isAr = lang === "ar";

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasPromptedGreeting, setHasPromptedGreeting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        // Clean default welcoming message without emojis
        const initial: Message = {
          id: "welcome",
          role: "model",
          content: isAr
            ? `مرحباً بك${user ? ` ${user.displayName || ""}` : ""}! أنا آزار بوت، مساعدك الذكي للتسوق في الجزائر.\nاسألني عن أي منتج، قارن الأسعار، أو اطلب توصية ذكية تناسب ميزانيتك وولايتك.`
            : `Bonjour${user ? ` ${user.displayName || ""}` : ""} ! Je suis Azar Bot, votre assistant shopping intelligent.\nPosez-moi vos questions, trouvez les meilleurs prix ou demandez une recommandation personnalisée !`,
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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const clearChat = () => {
    const resetMsg: Message = {
      id: "reset",
      role: "model",
      content: isAr ? "تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟" : "Discussion effacée. Que puis-je chercher pour vous ?",
      createdAt: Date.now(),
    };
    setMessages([resetMsg]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const persona = getLocalUserPersona();
      const payload = {
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        userPersona: persona,
        lang: isAr ? "ar" : "fr",
      };

      // Direct object payload (api helper handles JSON.stringify without double-encoding)
      const res = await api<{ reply: string }>("/ai/chat", {
        method: "POST",
        body: payload,
      });

      const botMsg: Message = {
        id: `m_${Date.now()}`,
        role: "model",
        content: res.reply || (isAr ? "عذراً، لم أستطع العثور على نتيجة." : "Désolé, aucune réponse trouvée."),
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: "model",
        content: errorMessage(err),
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = isAr
    ? ["أفضل الهواتف", "سيارات بأفضل سعر", "نصائح الشراء الآمن"]
    : ["Meilleurs smartphones", "Voitures bon prix", "Conseils d'achat"];

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
          aria-label="Ouvrir l'assistant Azar Bot"
          title="Azar Bot — Assistant Shopping"
        >
          <div className="azarbot-robot-avatar">
            <svg viewBox="0 0 48 48" width="34" height="34" fill="none">
              {/* Antenna */}
              <circle cx="24" cy="6" r="3.5" fill="#10b981" />
              <line x1="24" y1="9" x2="24" y2="15" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
              {/* Head */}
              <rect x="8" y="15" width="32" height="25" rx="8" fill="#10b981" />
              {/* Screen Face */}
              <rect x="12" y="19" width="24" height="15" rx="4" fill="#064e3b" />
              {/* Glowing Eyes */}
              <circle cx="18" cy="26" r="3" fill="#6ee7b7" className="robot-eye" />
              <circle cx="30" cy="26" r="3" fill="#6ee7b7" className="robot-eye" />
              {/* Smile */}
              <path d="M21 31c1 1 5 1 6 0" stroke="#a7f3d0" strokeWidth="1.8" strokeLinecap="round" />
              {/* Ears */}
              <rect x="4" y="23" width="4" height="7" rx="2" fill="#059669" />
              <rect x="40" y="23" width="4" height="7" rx="2" fill="#059669" />
            </svg>
            <span className="azarbot-online-badge" />
          </div>

          <span className="azarbot-launcher-label">
            <span>Azar Bot</span>
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
        <div className="azarbot-panel" role="dialog" aria-labelledby="azarbot-title">
          {/* Header with clean logo and X close button */}
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
                  Azar Bot
                </h3>
                <small className="azarbot-header-desc">
                  {isAr ? "مساعد التسوق الذكي" : "Assistant shopping intelligent"}
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
                className="azarbot-icon-btn close-btn"
                onClick={() => setIsOpen(false)}
                title={isAr ? "إغلاق" : "Fermer"}
                aria-label="Fermer"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
          </div>

          {/* Messages Feed (No repeating robot icons on bubbles) */}
          <div className="azarbot-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`azarbot-message-row ${msg.role === "user" ? "user-row" : "bot-row"}`}>
                <div className={`azarbot-bubble ${msg.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                  <div className="azarbot-bubble-content">
                    {renderMarkdownWithLinks(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="azarbot-message-row bot-row">
                <div className="azarbot-bubble bot-bubble loading-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
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
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box (NO autoFocus so mobile keyboard doesn't pop up immediately) */}
          <form
            className="azarbot-footer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="azarbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAr ? "اسأل آزار عن سلعة، سعر، أو ولاية..." : "Posez une question sur un produit..."}
              maxLength={400}
              autoFocus={false}
            />
            <button
              type="submit"
              className="azarbot-send-btn"
              disabled={!input.trim() || loading}
              aria-label="Envoyer"
            >
              <Icon name="arrow-right" size={16} />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
