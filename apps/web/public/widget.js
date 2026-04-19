/**
 * BizAssist Widget — Vanilla JS embed script.
 * WCAG 2.1 AA compliant.
 *
 * Usage: <script src="https://app.bizassist.ai/widget.js" data-assistant-id="xxx" async></script>
 *
 * Accessibility features:
 * - Semantic HTML with proper ARIA roles, labels, and landmarks
 * - ARIA live regions for dynamic content (streaming responses, status changes)
 * - Focus trap when widget is open, focus restored on close
 * - Full keyboard navigation: Escape to close, Enter to send, Tab order
 * - prefers-reduced-motion: disables all animations
 * - prefers-color-scheme: respects system dark mode
 * - Minimum 44x44px touch targets
 * - 4.5:1 contrast ratio enforcement
 * - 200% text zoom support
 * - Screen reader announcements for all state changes
 */
(function () {
  "use strict";

  // ---- Config ----
  var script = document.currentScript;
  if (!script) return;

  var assistantId = script.getAttribute("data-assistant-id");
  if (!assistantId) return;

  var origin = script.src.replace(/\/widget\.js.*$/, "");
  var STORAGE_PREFIX = "ba_";
  var VISITOR_KEY = STORAGE_PREFIX + "vid";
  var DISMISS_KEY = STORAGE_PREFIX + "dismiss_" + assistantId;
  var RETURN_KEY = STORAGE_PREFIX + "return_" + assistantId;

  // ---- Cookieless mode ----
  // The embedder can opt into cookieless mode via data-cookieless="true" on the
  // script tag. This is the authoritative signal because it's available at load
  // time, before we can fetch the tenant config. Cookieless mode replaces
  // localStorage with sessionStorage (tab-scoped, cleared on close).
  //
  // Additionally, the host site can broadcast consent state via window.postMessage
  // (type "bizassist.consent") — a subsequent "granted" signal promotes storage
  // back to localStorage for future sessions, but NEVER before consent is given.
  var cookielessAttr = (script.getAttribute("data-cookieless") || "").toLowerCase();
  var cookieless = cookielessAttr === "true" || cookielessAttr === "1";

  var store = {
    get: function (key) {
      try {
        return cookieless ? sessionStorage.getItem(key) : localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set: function (key, value) {
      try {
        if (cookieless) sessionStorage.setItem(key, value);
        else localStorage.setItem(key, value);
      } catch (e) { /* storage disabled — silently degrade */ }
    },
    remove: function (key) {
      try {
        if (cookieless) sessionStorage.removeItem(key);
        else localStorage.removeItem(key);
      } catch (e) { /* noop */ }
    },
  };

  // Listen for consent updates from the host page.
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data !== "object") return;
    if (ev.data.type !== "bizassist.consent") return;
    // "denied" forces cookieless mode for this session.
    if (ev.data.state === "denied") {
      cookieless = true;
    }
  });

  // ---- Visitor identity ----
  var visitorId = store.get(VISITOR_KEY);
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store.set(VISITOR_KEY, visitorId);
  }

  var isReturnVisitor = !!store.get(RETURN_KEY);
  store.set(RETURN_KEY, Date.now().toString());

  // When the visitor dismissed the proactive popup, the old behaviour was to
  // return from the IIFE entirely, which also hid the bubble — so the chat
  // became unreachable for 24 hours. We now suppress only the proactive popup
  // via this flag, leaving the bubble (and the chat itself) fully available.
  var proactiveSuppressedForSession = false;
  var dismissedAt = store.get(DISMISS_KEY);
  if (dismissedAt) {
    var dismissedMs = parseInt(dismissedAt, 10);
    if (Date.now() - dismissedMs < 24 * 60 * 60 * 1000) {
      proactiveSuppressedForSession = true;
    } else {
      store.remove(DISMISS_KEY);
    }
  }

  // ---- Motion preference ----
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Behavior tracking state ----
  var state = {
    timeOnPage: 0,
    scrollDepth: 0,
    exitIntentFired: false,
    iframeLoaded: false,
    widgetOpen: false,
    proactiveShown: false,
    currentProactiveRuleId: null, // the rule powering the currently-shown proactive bubble
    focusedBeforeOpen: null,      // tracks element that had focus before widget opened
  };

  // ---- Device detection ----
  function getDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  // ---- Behavior signals ----
  function getSignals() {
    return {
      pageUrl: location.href,
      pageTitle: document.title,
      referrer: document.referrer,
      timeOnPageSeconds: state.timeOnPage,
      scrollDepthPercent: state.scrollDepth,
      isExitIntent: state.exitIntentFired,
      isReturnVisitor: isReturnVisitor,
      visitorId: visitorId,
      device: getDevice(),
      language: navigator.language || "en",
    };
  }

  // ---- Time on page tracker ----
  var timeInterval = setInterval(function () {
    state.timeOnPage++;
    checkEngagement();
  }, 1000);

  // ---- Scroll depth tracker (debounced) ----
  var scrollTimeout = null;
  function onScroll() {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function () {
      scrollTimeout = null;
      var docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      var winHeight = window.innerHeight;
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var depth = Math.round(((scrollTop + winHeight) / docHeight) * 100);
      if (depth > state.scrollDepth) {
        state.scrollDepth = depth;
        checkEngagement();
      }
    }, 200);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---- Exit intent detector (desktop only) ----
  function onMouseLeave(e) {
    if (e.clientY <= 0 && !state.exitIntentFired) {
      state.exitIntentFired = true;
      checkEngagement();
    }
  }
  if (getDevice() === "desktop") {
    document.addEventListener("mouseleave", onMouseLeave);
  }

  // ---- Engagement check ----
  // ---- Frequency-cap bookkeeping (session-local) ----
  //
  // The widget enforces per-session caps + cool-downs itself using
  // sessionStorage so we don't need a DB round-trip per visitor tick. Lifetime
  // (maxPerVisitor) caps are still enforced server-side via lead_events.
  //
  // Shape in sessionStorage under key "ba_rule_state":
  //   { [ruleId]: { fires: number, lastFiredAt: number /* ms epoch */,
  //                 dismissedAt: number | null,
  //                 maxPerSession: number, cooldownSeconds: number } }
  var RULE_STATE_KEY = "ba_rule_state_" + assistantId;

  function loadRuleState() {
    try {
      var raw = sessionStorage.getItem(RULE_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveRuleState(s) {
    try { sessionStorage.setItem(RULE_STATE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
  }

  function computeSuppressedRuleIds() {
    var state = loadRuleState();
    var now = Date.now();
    var out = [];
    for (var id in state) {
      if (!Object.prototype.hasOwnProperty.call(state, id)) continue;
      var r = state[id];
      // Per-session cap exhausted?
      if (r.maxPerSession > 0 && r.fires >= r.maxPerSession) {
        out.push(id);
        continue;
      }
      // In cool-down window since last fire or dismissal?
      if (r.cooldownSeconds > 0) {
        var lastEvent = Math.max(r.lastFiredAt || 0, r.dismissedAt || 0);
        if (lastEvent > 0 && now - lastEvent < r.cooldownSeconds * 1000) {
          out.push(id);
        }
      }
    }
    return out;
  }

  function recordRuleFired(ruleId, caps) {
    var state = loadRuleState();
    var existing = state[ruleId] || { fires: 0, lastFiredAt: 0, dismissedAt: null };
    state[ruleId] = {
      fires: existing.fires + 1,
      lastFiredAt: Date.now(),
      dismissedAt: existing.dismissedAt,
      maxPerSession: caps && caps.maxPerSession ? caps.maxPerSession : 0,
      cooldownSeconds: caps && caps.cooldownSeconds ? caps.cooldownSeconds : 0,
    };
    saveRuleState(state);
  }

  function recordRuleDismissed(ruleId) {
    var state = loadRuleState();
    if (!state[ruleId]) return;
    state[ruleId].dismissedAt = Date.now();
    saveRuleState(state);
  }

  var engageDebounce = null;
  var lastEngageFetchAt = 0;
  var engageDisabled = false;
  var ENGAGE_MIN_INTERVAL_MS = 15000;
  function checkEngagement() {
    if (engageDisabled || proactiveSuppressedForSession || state.proactiveShown || state.widgetOpen) return;
    if (Date.now() - lastEngageFetchAt < ENGAGE_MIN_INTERVAL_MS) return;
    if (engageDebounce) clearTimeout(engageDebounce);
    engageDebounce = setTimeout(fetchEngagement, 500);
  }

  function fetchEngagement() {
    if (engageDisabled || proactiveSuppressedForSession || state.proactiveShown || state.widgetOpen) return;
    lastEngageFetchAt = Date.now();
    var body = getSignals();
    body.suppressedRuleIds = computeSuppressedRuleIds();
    fetch(origin + "/api/widget/" + assistantId + "/engage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.engage && data.message && data.ruleId) {
          state.proactiveShown = true;
          recordRuleFired(data.ruleId, {
            maxPerSession: data.maxPerSession,
            cooldownSeconds: data.cooldownSeconds,
          });
          showProactiveMessage(data.message, data.ruleId, {
            image: data.messageImage || null,
            cta: data.messageCta || null,
            buttons: data.messageButtons || [],
            questions: data.qualifyingQuestions || [],
          });
        } else if (data && data.noRules) {
          engageDisabled = true;
        }
      })
      .catch(function () {});
  }

  // ---- UI Elements ----
  var bubble, iframe, container, proactiveBubble, liveRegion;

  // ---- Styles (WCAG compliant) ----
  function createStyles() {
    var style = document.createElement("style");
    var transition = prefersReducedMotion ? "none" : "transform .2s ease";
    var animation = prefersReducedMotion ? "none" : "ba-slide-in .3s ease";

    style.textContent = [
      // Bubble: 56x56 meets 44x44 minimum touch target (WCAG 2.5.5)
      ".ba-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;z-index:999998;transition:" + transition + ";border:none;padding:0}",
      // Focus indicator: 2px solid outline with offset (WCAG 2.4.7)
      ".ba-bubble:focus-visible{outline:3px solid #005fcc;outline-offset:3px}",
      ".ba-bubble:hover{transform:" + (prefersReducedMotion ? "none" : "scale(1.1)") + "}",
      ".ba-bubble svg{width:24px;height:24px;fill:white}",
      // Container with role=dialog
      ".ba-container{position:fixed;bottom:88px;right:20px;width:380px;height:600px;max-height:calc(100vh - 100px);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:999999;display:none;background:white}",
      ".ba-container iframe{width:100%;height:100%;border:none}",
      // Proactive bubble
      ".ba-proactive{position:fixed;bottom:84px;right:20px;max-width:280px;padding:12px 16px;border-radius:12px 12px 4px 12px;background:white;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:999997;font:14px/1.4 system-ui,sans-serif;color:#1a1a1a;cursor:pointer;animation:" + animation + "}",
      // Close button: 44x44 touch target
      ".ba-proactive-close{position:absolute;top:0;right:0;background:none;border:none;cursor:pointer;font-size:18px;color:#666;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}",
      ".ba-proactive-close:focus-visible{outline:3px solid #005fcc;outline-offset:-2px;border-radius:4px}",
      ".ba-proactive-close:hover{color:#1a1a1a}",
      // Rich-proactive card components
      ".ba-proactive-img{display:block;width:calc(100% + 32px);margin:-12px -16px 10px -16px;max-height:120px;object-fit:cover;border-radius:12px 12px 0 0}",
      ".ba-proactive-open{background:none;border:none;cursor:pointer;padding:0;margin:0;font:inherit;color:inherit;text-align:left;display:block;width:100%}",
      ".ba-proactive-open:focus-visible{outline:3px solid #005fcc;outline-offset:2px;border-radius:4px}",
      ".ba-proactive-actions{margin-top:10px;display:flex;flex-direction:column;gap:6px}",
      ".ba-proactive-cta{display:inline-block;padding:8px 14px;background:#1a1a1a;color:white;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;text-align:center;min-height:36px;box-sizing:border-box}",
      ".ba-proactive-cta:hover{background:#000}",
      ".ba-proactive-cta:focus-visible{outline:3px solid #005fcc;outline-offset:2px}",
      ".ba-proactive-btns{display:flex;flex-wrap:wrap;gap:6px}",
      ".ba-proactive-btn{display:inline-block;padding:6px 12px;background:#f3f4f6;color:#1a1a1a;border-radius:8px;text-decoration:none;font-size:12px;font-weight:500;min-height:32px;box-sizing:border-box}",
      ".ba-proactive-btn:hover{background:#e5e7eb}",
      ".ba-proactive-btn-primary{background:#1a1a1a;color:white}",
      ".ba-proactive-btn-primary:hover{background:#000}",
      ".ba-proactive-btn:focus-visible{outline:3px solid #005fcc;outline-offset:2px}",
      // Qualifying-question chips: vertical stack, full-width, left-aligned.
      ".ba-proactive-questions{margin-top:10px;display:flex;flex-direction:column;gap:6px}",
      ".ba-proactive-question{display:block;width:100%;padding:8px 12px;background:#f3f4f6;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:8px;font:inherit;font-size:13px;text-align:left;cursor:pointer;min-height:36px;box-sizing:border-box;transition:background .15s ease}",
      ".ba-proactive-question:hover{background:#e5e7eb}",
      ".ba-proactive-question:focus-visible{outline:3px solid #005fcc;outline-offset:2px}",
      // Screen reader only utility
      ".ba-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
      // Live region (hidden but announced)
      ".ba-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}",
      // Animation
      "@keyframes ba-slide-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      // Launcher CTA — pulse mode (radiating ring via ::after)
      ".ba-bubble--pulse{position:relative}",
      ".ba-bubble--pulse::after{content:\"\";position:absolute;inset:-4px;border-radius:50%;background:var(--ba-accent,rgba(0,0,0,0));animation:ba-pulse var(--ba-interval,8s) ease-out infinite;pointer-events:none;z-index:-1}",
      "@keyframes ba-pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}",
      // Launcher CTA — bounce mode
      ".ba-bubble--bounce{animation:ba-bounce-loop var(--ba-interval,8s) ease-in-out infinite}",
      "@keyframes ba-bounce-loop{0%,85%,100%{transform:translateY(0)}90%{transform:translateY(-6px)}95%{transform:translateY(0)}}",
      // Launcher CTA — attention-flash (one-shot on load, 3 iterations)
      ".ba-bubble--flash{position:relative;animation:ba-bounce-loop 1.5s ease-in-out 3}",
      ".ba-bubble--flash::after{content:\"\";position:absolute;inset:-4px;border-radius:50%;background:var(--ba-accent,rgba(0,0,0,0));animation:ba-pulse 1.5s ease-out 3;pointer-events:none;z-index:-1}",
      // Pause all launcher animation while the proactive popup is visible
      ".ba-bubble[data-proactive-open=\"true\"].ba-bubble--pulse::after,.ba-bubble[data-proactive-open=\"true\"].ba-bubble--bounce,.ba-bubble[data-proactive-open=\"true\"].ba-bubble--flash,.ba-bubble[data-proactive-open=\"true\"].ba-bubble--flash::after{animation-play-state:paused}",
      // Mobile: full screen
      // Mobile: bottom-sheet with margin on both sides so the host page is
      // still partially visible and the bubble stays reachable below.
      "@media(max-width:480px){.ba-container{width:auto;left:12px;right:12px;bottom:88px;height:calc(100vh - 108px);max-height:calc(100vh - 108px);border-radius:16px}}",
      // Reduced motion — cancels all bubble + launcher CTA animation
      "@media(prefers-reduced-motion:reduce){.ba-bubble,.ba-proactive,.ba-proactive-close{transition:none;animation:none}.ba-bubble:hover{transform:none}.ba-bubble--pulse::after,.ba-bubble--flash::after{animation:none}}",
    ].join("\n");
    document.head.appendChild(style);
  }

  // ---- ARIA Live Region (screen reader announcements) ----
  function createLiveRegion() {
    liveRegion = document.createElement("div");
    liveRegion.className = "ba-live";
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    document.body.appendChild(liveRegion);
  }

  function announce(text) {
    if (!liveRegion) return;
    // Clear then set after a tick so screen readers re-announce
    liveRegion.textContent = "";
    setTimeout(function () { liveRegion.textContent = text; }, 100);
  }

  // ---- Bubble (trigger button) ----
  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return "rgba(0,0,0," + alpha + ")";
    var clean = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    if (clean.length !== 6) return "rgba(0,0,0," + alpha + ")";
    var r = parseInt(clean.slice(0, 2), 16);
    var g = parseInt(clean.slice(2, 4), 16);
    var b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(0,0,0," + alpha + ")";
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function createBubble(config) {
    var color = (config && config.widgetColor) || "#2563eb";
    var mode = (config && config.launcherAnimation) || "none";
    var interval = (config && config.launcherAnimationIntervalSec) || 8;
    var accent = (config && config.launcherAccentColor) || hexToRgba(color, 0.4);

    var animClass = {
      pulse: "ba-bubble--pulse",
      bounce: "ba-bubble--bounce",
      attention_flash: "ba-bubble--flash",
    }[mode] || "";

    bubble = document.createElement("button");
    bubble.className = animClass ? "ba-bubble " + animClass : "ba-bubble";
    bubble.type = "button";
    bubble.style.backgroundColor = color;
    bubble.style.setProperty("--ba-accent", accent);
    bubble.style.setProperty("--ba-interval", interval + "s");
    bubble.dataset.proactiveOpen = "false";
    bubble.setAttribute("aria-label", "Open chat assistant");
    bubble.setAttribute("aria-haspopup", "dialog");
    bubble.setAttribute("aria-expanded", "false");
    bubble.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    bubble.addEventListener("click", toggleWidget);
    document.body.appendChild(bubble);
  }

  // ---- Container (dialog) ----
  function createContainer() {
    container = document.createElement("div");
    container.className = "ba-container";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", "Chat assistant");
    container.setAttribute("aria-modal", "true");
    document.body.appendChild(container);
  }

  // ---- Iframe ----
  // `extras` (optional): { autoSend: string, engagementRuleId: string } — when
  // the visitor clicks a qualifying-question chip in the proactive bubble, we
  // pre-load the iframe with the clicked text in the query string so the chat
  // page can auto-send it on mount. Ignored on subsequent opens (iframe is
  // already loaded; postMessage is used instead).
  function loadIframe(extras) {
    if (state.iframeLoaded) return;
    state.iframeLoaded = true;

    var src = origin + "/chat/" + assistantId + "?embed=true&visitorId=" + encodeURIComponent(visitorId);
    if (extras && extras.autoSend) {
      src += "&autoSend=" + encodeURIComponent(extras.autoSend);
    }
    if (extras && extras.engagementRuleId) {
      src += "&engagementRuleId=" + encodeURIComponent(extras.engagementRuleId);
    }
    iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.setAttribute("title", "Chat assistant conversation");
    iframe.setAttribute("allow", "microphone");
    // Allow iframe content to be accessible
    iframe.setAttribute("tabindex", "0");
    container.appendChild(iframe);

    window.addEventListener("message", onIframeMessage);
  }

  // ---- Focus management (WCAG 2.4.3, 2.4.7) ----

  function openWidget() {
    // Save current focus to restore later
    state.focusedBeforeOpen = document.activeElement;

    loadIframe();
    container.style.display = "block";
    state.widgetOpen = true;
    bubble.setAttribute("aria-expanded", "true");
    hideProactiveMessage();

    // Move focus into the iframe after a brief delay for load
    setTimeout(function () {
      if (iframe) iframe.focus();
    }, 100);

    // Add focus trap and Escape handler
    document.addEventListener("keydown", onWidgetKeydown);

    // Send signals to iframe
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "ba:signals", payload: getSignals() }, origin);
    }

    announce("Chat assistant opened");
  }

  function closeWidget() {
    container.style.display = "none";
    state.widgetOpen = false;
    bubble.setAttribute("aria-expanded", "false");

    document.removeEventListener("keydown", onWidgetKeydown);

    // Restore focus to the element that triggered the open (WCAG 2.4.3)
    if (state.focusedBeforeOpen && typeof state.focusedBeforeOpen.focus === "function") {
      state.focusedBeforeOpen.focus();
    } else {
      bubble.focus();
    }
    state.focusedBeforeOpen = null;

    announce("Chat assistant closed");
  }

  function toggleWidget() {
    if (state.widgetOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  // ---- Focus trap (WCAG 2.4.3 — focus order within modal) ----
  function onWidgetKeydown(e) {
    // Escape closes the widget
    if (e.key === "Escape") {
      e.preventDefault();
      closeWidget();
      return;
    }

    // Tab trapping: keep focus within the container
    if (e.key === "Tab") {
      // The iframe handles its own internal tab order.
      // We trap focus between the iframe and the container boundaries.
      var focusable = container.querySelectorAll('iframe, button, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ---- Proactive message (accessible) ----
  //
  // `rich` is optional; when supplied, the bubble renders as a card with an
  // image, a primary CTA, and up to 3 action buttons. The plain-text path is
  // preserved for rules that don't configure rich content.
  //
  // Shape: { image: string|null, cta: { label, url }|null, buttons: [{ id, label, url, style }] }
  function showProactiveMessage(message, ruleId, rich) {
    if (proactiveBubble) return;
    state.currentProactiveRuleId = ruleId;

    proactiveBubble = document.createElement("div");
    proactiveBubble.className = "ba-proactive";
    proactiveBubble.setAttribute("role", "alertdialog");
    proactiveBubble.setAttribute("aria-label", "Chat assistant message");

    // Close button (always present)
    var closeBtn = document.createElement("button");
    closeBtn.className = "ba-proactive-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Dismiss chat message");
    closeBtn.innerHTML = "&#215;";
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      dismissProactive();
    });
    proactiveBubble.appendChild(closeBtn);

    // Optional header image
    if (rich && rich.image) {
      var img = document.createElement("img");
      img.className = "ba-proactive-img";
      img.src = rich.image;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.setAttribute("loading", "lazy");
      proactiveBubble.appendChild(img);
    }

    // Clickable message body — opens the chat widget on click
    var openBtn = document.createElement("button");
    openBtn.className = "ba-proactive-open";
    openBtn.type = "button";
    openBtn.setAttribute("aria-label", "Open chat to respond: " + message);

    var messageSpan = document.createElement("span");
    messageSpan.id = "ba-proactive-msg";
    messageSpan.textContent = message;
    openBtn.appendChild(messageSpan);

    proactiveBubble.setAttribute("aria-describedby", "ba-proactive-msg");
    openBtn.addEventListener("click", function () {
      hideProactiveMessage();
      openWidget();
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "ba:proactive_engage",
          payload: { message: message, ruleId: ruleId, signals: getSignals() },
        }, origin);
      }
    });
    proactiveBubble.appendChild(openBtn);

    // Helper to record an engagement event when a CTA/button is clicked.
    function trackEngagement() {
      fetch(origin + "/api/widget/" + assistantId + "/engage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: ruleId, event: "engagement", visitorId: visitorId }),
      }).catch(function () {});
    }

    // Rich action row — CTA link + up to 3 buttons
    var hasActions = rich && (rich.cta || (rich.buttons && rich.buttons.length > 0));
    if (hasActions) {
      var actionsRow = document.createElement("div");
      actionsRow.className = "ba-proactive-actions";

      if (rich.cta && rich.cta.label && rich.cta.url) {
        var ctaLink = document.createElement("a");
        ctaLink.className = "ba-proactive-cta";
        ctaLink.href = rich.cta.url;
        ctaLink.target = "_blank";
        ctaLink.rel = "noopener noreferrer";
        ctaLink.textContent = rich.cta.label;
        ctaLink.addEventListener("click", function (e) {
          e.stopPropagation();
          trackEngagement();
        });
        actionsRow.appendChild(ctaLink);
      }

      if (rich.buttons && rich.buttons.length > 0) {
        var btnGroup = document.createElement("div");
        btnGroup.className = "ba-proactive-btns";
        var maxButtons = Math.min(rich.buttons.length, 3);
        for (var i = 0; i < maxButtons; i++) {
          var b = rich.buttons[i];
          if (!b || !b.label || !b.url) continue;
          var link = document.createElement("a");
          link.className = "ba-proactive-btn" + (b.style === "primary" ? " ba-proactive-btn-primary" : "");
          link.href = b.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = b.label;
          (function (captured) {
            link.addEventListener("click", function (e) {
              e.stopPropagation();
              trackEngagement();
              // Let the navigation proceed; tracking is fire-and-forget.
            });
          })(b);
          btnGroup.appendChild(link);
        }
        actionsRow.appendChild(btnGroup);
      }

      proactiveBubble.appendChild(actionsRow);
    }

    // Qualifying-question chips — clicking one opens the chat and sends that
    // text as the visitor's first message.
    var questions = rich && rich.questions ? rich.questions : [];
    if (questions.length > 0) {
      var qList = document.createElement("div");
      qList.className = "ba-proactive-questions";
      qList.setAttribute("role", "group");
      qList.setAttribute("aria-label", "Suggested questions");

      var maxQuestions = Math.min(questions.length, 5);
      for (var qi = 0; qi < maxQuestions; qi++) {
        var qText = questions[qi];
        if (!qText || typeof qText !== "string") continue;
        var qBtn = document.createElement("button");
        qBtn.className = "ba-proactive-question";
        qBtn.type = "button";
        qBtn.textContent = qText;
        (function (captured) {
          qBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            handleQuestionClick(captured, ruleId);
          });
        })(qText);
        qList.appendChild(qBtn);
      }
      proactiveBubble.appendChild(qList);
    }

    document.body.appendChild(proactiveBubble);

    // Pause the launcher CTA animation so it doesn't fight with the popup.
    if (bubble) bubble.dataset.proactiveOpen = "true";

    // Announce to screen readers
    announce("Chat assistant says: " + message);

    // Track impression
    fetch(origin + "/api/widget/" + assistantId + "/engage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId: ruleId, event: "impression", visitorId: visitorId }),
    }).catch(function () {});
  }

  function hideProactiveMessage() {
    if (proactiveBubble) {
      proactiveBubble.remove();
      proactiveBubble = null;
    }
    if (bubble) bubble.dataset.proactiveOpen = "false";
  }

  // Visitor clicked a qualifying-question chip in the proactive bubble:
  // open the chat, inject the clicked text as the first user message, and
  // record the engagement against the rule.
  function handleQuestionClick(questionText, ruleId) {
    fetch(origin + "/api/widget/" + assistantId + "/engage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId: ruleId, event: "engagement", visitorId: visitorId }),
    }).catch(function () {});

    var wasLoaded = state.iframeLoaded;
    hideProactiveMessage();

    // First open: pre-load iframe with query params so the chat page can read
    // them on mount. openWidget() will no-op its internal loadIframe() call
    // because state.iframeLoaded is already true.
    if (!wasLoaded) {
      loadIframe({ autoSend: questionText, engagementRuleId: ruleId });
    }
    openWidget();

    // Re-open: iframe is already mounted and its URL params were consumed on
    // first mount, so hand the click off via postMessage instead.
    if (wasLoaded && iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "ba:proactive_engage",
        payload: {
          ruleId: ruleId,
          autoSendMessage: questionText,
          signals: getSignals(),
        },
      }, origin);
    }
  }

  function dismissProactive() {
    hideProactiveMessage();
    store.set(DISMISS_KEY, Date.now().toString());
    // Record against the specific rule so cool-down suppresses it on the next tick.
    if (state.currentProactiveRuleId) {
      recordRuleDismissed(state.currentProactiveRuleId);
      // Also tell the server so the lead_events audit trail captures dismissal.
      fetch(origin + "/api/widget/" + assistantId + "/engage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: state.currentProactiveRuleId,
          event: "dismiss",
          visitorId: visitorId,
        }),
      }).catch(function () {});
      state.currentProactiveRuleId = null;
    }
    // Allow a new rule to fire once cool-down clears.
    state.proactiveShown = false;
    announce("Chat message dismissed");
    bubble.focus();
  }

  // ---- PostMessage protocol ----
  function onIframeMessage(e) {
    if (e.origin !== origin) return;
    var msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "ba:request_signals":
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: "ba:signals", payload: getSignals() }, origin);
        }
        break;

      case "ba:close_widget":
        closeWidget();
        break;

      case "ba:announce":
        // Iframe requests a screen reader announcement on the parent page
        if (msg.payload && msg.payload.text) {
          announce(msg.payload.text);
        }
        break;

      case "ba:lead_captured":
        if (msg.payload && msg.payload.ruleId) {
          fetch(origin + "/api/widget/" + assistantId + "/engage", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruleId: msg.payload.ruleId, event: "lead", visitorId: visitorId }),
          }).catch(function () {});
        }
        break;

      case "ba:page_view":
        fetch(origin + "/api/widget/" + assistantId + "/engage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "page_view", visitorId: visitorId, pageUrl: location.href, pageTitle: document.title }),
        }).catch(function () {});
        break;

      case "ba:resize":
        if (msg.payload && msg.payload.height) {
          container.style.height = msg.payload.height + "px";
        }
        break;
    }
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Init ----
  function init() {
    fetch(origin + "/api/widget/" + assistantId + "/config")
      .then(function (res) { return res.json(); })
      .then(function (config) {
        if (!config.isActive) return;

        createStyles();
        createLiveRegion();
        createBubble(config);
        createContainer();

        if (config.widgetPosition === "bottom-left") {
          bubble.style.right = "auto";
          bubble.style.left = "20px";
          container.style.right = "auto";
          container.style.left = "20px";
        }

        // Track page view
        fetch(origin + "/api/widget/" + assistantId + "/engage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "page_view", visitorId: visitorId, pageUrl: location.href, pageTitle: document.title }),
        }).catch(function () {});
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("beforeunload", function () {
    clearInterval(timeInterval);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("mouseleave", onMouseLeave);
  });
})();
