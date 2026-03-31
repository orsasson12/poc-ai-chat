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

  let bubble: HTMLDivElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let isOpen = false;
  let config: { name: string; widgetColor: string; greeting: string } | null = null;

  async function fetchConfig() {
    try {
      const res = await fetch(`${baseUrl}/api/widget/${assistantId}/config`);
      if (!res.ok) return;
      config = await res.json();
    } catch {
      // Silent failure
    }
  }

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
      transition: "transform 0.2s ease",
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

  function openChat() {
    if (!iframe) {
      const isLeft = customPosition === "bottom-left";
      iframe = document.createElement("iframe");
      iframe.src = `${baseUrl}/chat/${assistantId}?session=${sessionId}`;
      iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
      iframe.setAttribute("title", config?.name || "Chat Assistant");

      Object.assign(iframe.style, {
        position: "fixed",
        bottom: "88px",
        [isLeft ? "left" : "right"]: "20px",
        width: "380px",
        height: "520px",
        border: "none",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        zIndex: "999999",
        transition: "opacity 0.2s ease",
        opacity: "0",
      });

      document.body.appendChild(iframe);
      requestAnimationFrame(() => { if (iframe) iframe.style.opacity = "1"; });
    } else {
      iframe.style.display = "block";
      requestAnimationFrame(() => { if (iframe) iframe.style.opacity = "1"; });
    }

    isOpen = true;
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
    if (bubble) {
      bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';
      bubble.setAttribute("aria-label", "Open chat");
    }
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== baseUrl) return;
    if (event.data?.type === "bizassist:close") closeChat();
    if (event.data?.type === "bizassist:resize" && iframe) {
      const { width, height } = event.data;
      if (width) iframe.style.width = `${width}px`;
      if (height) iframe.style.height = `${height}px`;
    }
  });

  fetchConfig().then(createBubble);
})();
