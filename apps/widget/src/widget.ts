(function () {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (!currentScript) return;

  const assistantId = currentScript.getAttribute("data-assistant-id");
  if (!assistantId) {
    console.warn("[BizAssist] Missing data-assistant-id attribute");
    return;
  }

  const customColor = currentScript.getAttribute("data-color");
  const customPosition = currentScript.getAttribute("data-position") || "bottom-right";

  const SESSION_KEY = `bizassist_session_${assistantId}`;
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  const scriptSrc = currentScript.src;
  const baseUrl = scriptSrc ? new URL(scriptSrc).origin : "https://app.bizassist.ai";

  // Mobile breakpoint — anything <= this width gets a full-screen overlay
  // instead of the floating 380×520 panel. 480px matches the threshold
  // already used inside chat-window.tsx for keyboard-aware sizing.
  const MOBILE_MAX_WIDTH = 480;
  const isMobileViewport = () =>
    typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;

  let bubble: HTMLDivElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let isOpen = false;
  let config: { name: string; widgetColor: string; greeting: string } | null = null;

  // When the chat opens on mobile we lock body scroll so the page beneath
  // doesn't peek through / scroll under the user's finger. We restore the
  // original values on close.
  const savedBodyStyles: { overflow?: string; position?: string; top?: string; width?: string } = {};
  let savedScrollY = 0;

  function lockBodyScroll() {
    savedScrollY = window.scrollY;
    savedBodyStyles.overflow = document.body.style.overflow;
    savedBodyStyles.position = document.body.style.position;
    savedBodyStyles.top = document.body.style.top;
    savedBodyStyles.width = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = "100%";
  }

  function unlockBodyScroll() {
    document.body.style.overflow = savedBodyStyles.overflow ?? "";
    document.body.style.position = savedBodyStyles.position ?? "";
    document.body.style.top = savedBodyStyles.top ?? "";
    document.body.style.width = savedBodyStyles.width ?? "";
    window.scrollTo(0, savedScrollY);
  }

  function reportError(err: unknown, stage: string) {
    try {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const payload = JSON.stringify({
        assistantId,
        message: message.slice(0, 500),
        stack: stack?.slice(0, 4000),
        url: location.href.slice(0, 500),
        userAgent: navigator.userAgent.slice(0, 300),
        context: { stage },
      });
      const endpoint = `${baseUrl}/api/widget/error`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(endpoint, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch {
      // Telemetry must never throw.
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch(`${baseUrl}/api/widget/${assistantId}/config`);
      if (!res.ok) {
        reportError(new Error(`Widget config fetch returned ${res.status}`), "fetch_config");
        return;
      }
      config = await res.json();
    } catch (err) {
      reportError(err, "fetch_config");
    }
  }

  window.addEventListener("error", (e) => {
    if (e.error) reportError(e.error, "window_error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, "unhandled_rejection");
  });

  function createBubble() {
    bubble = document.createElement("div");
    const color = customColor || config?.widgetColor || "#2563eb";
    const isLeft = customPosition === "bottom-left";

    Object.assign(bubble.style, {
      position: "fixed",
      bottom: "20px",
      [isLeft ? "left" : "right"]: "20px",
      width: "56px",
      height: "56px",
      borderRadius: "50%",
      backgroundColor: color,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: "999998",
      transition: "transform 0.2s ease, opacity 0.2s ease",
    });

    bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';

    bubble.addEventListener("mouseenter", () => { if (bubble) bubble.style.transform = "scale(1.1)"; });
    bubble.addEventListener("mouseleave", () => { if (bubble) bubble.style.transform = "scale(1)"; });
    bubble.addEventListener("click", toggleChat);
    bubble.setAttribute("aria-label", "Open chat");
    bubble.setAttribute("role", "button");
    bubble.setAttribute("tabindex", "0");
    bubble.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleChat(); }
    });

    document.body.appendChild(bubble);
  }

  function toggleChat() { isOpen ? closeChat() : openChat(); }

  // Apply size/position styles to the iframe based on whether we're on mobile
  // (full-screen overlay) or desktop (anchored 380×520 panel). Called both on
  // first open and whenever the viewport changes (resize / orientation /
  // soft-keyboard show-hide via visualViewport).
  function applyIframeLayout() {
    if (!iframe) return;
    const isLeft = customPosition === "bottom-left";
    const mobile = isMobileViewport();

    if (mobile) {
      // Full-screen overlay. Use visualViewport.height when available so the
      // iframe shrinks when the soft keyboard opens, instead of the textarea
      // sliding under it. Falls back to 100dvh, then 100vh.
      const vv = window.visualViewport;
      const h = vv ? `${Math.round(vv.height)}px` : "100dvh";
      Object.assign(iframe.style, {
        position: "fixed",
        inset: "0 0 auto 0",
        top: "0",
        left: "0",
        right: "0",
        bottom: "auto",
        width: "100vw",
        height: h,
        maxHeight: h,
        borderRadius: "0",
        boxShadow: "none",
      });
      // Hide the bubble while the chat fills the screen — the in-iframe
      // header has its own close button (chat-window.tsx renders an X when
      // isEmbedded is true), and the bubble would just overlap it.
      if (bubble) bubble.style.display = "none";
    } else {
      // Desktop / tablet floating panel.
      Object.assign(iframe.style, {
        position: "fixed",
        top: "auto",
        bottom: "88px",
        left: isLeft ? "20px" : "auto",
        right: isLeft ? "auto" : "20px",
        width: "380px",
        height: "520px",
        maxHeight: "calc(100dvh - 108px)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      });
      if (bubble) bubble.style.display = "flex";
    }
  }

  // Re-apply layout when the viewport changes — covers desktop→mobile via
  // dev-tools resize, real device rotation, and the soft keyboard
  // appearing/disappearing on iOS/Android.
  function attachViewportListeners() {
    const handler = () => { if (isOpen) applyIframeLayout(); };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", () => setTimeout(handler, 200));
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handler);
      window.visualViewport.addEventListener("scroll", handler);
    }
  }
  attachViewportListeners();

  function openChat() {
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.src = `${baseUrl}/chat/${assistantId}?session=${sessionId}`;
      iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
      iframe.setAttribute("title", config?.name || "Chat Assistant");
      // Allow the page inside to read safe-area-inset-* (notch/home indicator).
      iframe.setAttribute("allow", "clipboard-write");

      Object.assign(iframe.style, {
        border: "none",
        zIndex: "999999",
        transition: "opacity 0.2s ease",
        opacity: "0",
        // Ensures the iframe itself never overflows horizontally on mobile.
        maxWidth: "100vw",
      });

      document.body.appendChild(iframe);
      applyIframeLayout();
      requestAnimationFrame(() => { if (iframe) iframe.style.opacity = "1"; });
    } else {
      iframe.style.display = "block";
      applyIframeLayout();
      requestAnimationFrame(() => { if (iframe) iframe.style.opacity = "1"; });
    }

    isOpen = true;
    if (isMobileViewport()) lockBodyScroll();

    if (bubble) {
      bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      bubble.setAttribute("aria-label", "Close chat");
    }
  }

  function closeChat() {
    if (iframe) {
      iframe.style.opacity = "0";
      setTimeout(() => { if (iframe) iframe.style.display = "none"; }, 200);
    }
    isOpen = false;
    unlockBodyScroll();
    if (bubble) {
      bubble.style.display = "flex";
      bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';
      bubble.setAttribute("aria-label", "Open chat");
    }
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== baseUrl) return;
    if (event.data?.type === "bizassist:close") closeChat();
    // Chat-window.tsx posts this when the user taps the X in its header.
    if (event.data?.type === "ba:close_widget") closeChat();
    if (event.data?.type === "bizassist:resize" && iframe) {
      // Resize requests from the embedded page only apply on desktop —
      // on mobile we always full-screen, ignoring custom sizes.
      if (!isMobileViewport()) {
        const { width, height } = event.data;
        if (width) iframe.style.width = `${width}px`;
        if (height) iframe.style.height = `${height}px`;
      }
    }
  });

  fetchConfig().then(createBubble);
})();
