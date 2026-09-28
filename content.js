(() => {
  const WEATHER_CODES = {
    0: ["Sunny", "☀️"],
    1: ["Sunny", "☀️"],
    2: ["Cloudy", "⛅"],
    3: ["Cloudy", "☁️"],
    45: ["Foggy", "🌫️"],
    48: ["Foggy", "🌫️"],
    51: ["Raining", "🌧️"],
    53: ["Raining", "🌧️"],
    55: ["Raining", "🌧️"],
    56: ["Raining", "🌧️"],
    57: ["Raining", "🌧️"],
    61: ["Raining", "🌧️"],
    63: ["Raining", "🌧️"],
    65: ["Raining", "🌧️"],
    66: ["Raining", "🌧️"],
    67: ["Raining", "🌧️"],
    71: ["Snowing", "❄️"],
    73: ["Snowing", "❄️"],
    75: ["Snowing", "❄️"],
    77: ["Snowing", "❄️"],
    80: ["Raining", "🌧️"],
    81: ["Raining", "🌧️"],
    82: ["Raining", "🌧️"],
    85: ["Snowing", "❄️"],
    86: ["Snowing", "❄️"],
    95: ["Stormy", "⛈️"],
    96: ["Stormy", "⛈️"],
    99: ["Stormy", "⛈️"],
  };

  const WINDY_THRESHOLD = 30;
  const WIND_EXEMPT_CODES = new Set([
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86,
    95, 96, 99,
  ]);

  const CACHE = new Map();
  let popup = null;
  let icon = null;
  let debounceTimer = null;
  let requestToken = 0;
  let pendingText = "";
  let pendingRect = null;

  // ---------- UI helpers ----------

  function ensurePopup() {
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "sah-weather-popup";
      document.body.appendChild(popup);
    }
    return popup;
  }

  function ensureIcon() {
    if (!icon) {
      icon = document.createElement("button");
      icon.id = "sah-weather-icon";
      icon.type = "button";
      icon.textContent = "⛅";
      icon.title = "Get weather";
      // Prevent mousedown from clearing the page/input selection before click fires.
      icon.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pendingText && pendingRect) {
          hideIcon();
          lookup(pendingText, pendingRect);
        }
      });
      document.body.appendChild(icon);
    }
    return icon;
  }

  function hideIcon() {
    if (icon) icon.classList.remove("sah-visible");
  }

  function showIconAt(rect, text) {
    const el = ensureIcon();
    pendingText = text;
    pendingRect = rect;
    const top = window.scrollY + rect.top - 14;
    const left = window.scrollX + rect.right + 6;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.classList.add("sah-visible");
  }

  function hidePopup() {
    if (popup) popup.classList.remove("sah-visible");
  }

  function positionPopup(rect) {
    const el = ensurePopup();
    const top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - 270;
    if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function showLoading(rect, text) {
    const el = ensurePopup();
    el.innerHTML = `<div class="sah-loading">Looking up weather for "${escapeHtml(text)}"…</div>`;
    positionPopup(rect);
    requestAnimationFrame(() => el.classList.add("sah-visible"));
  }

  function showResult(rect, data) {
    const el = ensurePopup();
    let [desc, icon2] = WEATHER_CODES[data.code] || ["Unknown", "🌡️"];
    if (data.wind >= WINDY_THRESHOLD && !WIND_EXEMPT_CODES.has(data.code)) {
      desc = "Windy";
      icon2 = "💨";
    }
    el.innerHTML = `
      <div class="sah-row">
        <div class="sah-icon">${icon2}</div>
        <div>
          <div class="sah-city">${escapeHtml(data.name)}</div>
          <div class="sah-desc">${desc}</div>
        </div>
        <div class="sah-temp">${Math.round(data.temp)}°${data.unit}</div>
      </div>
      <div class="sah-meta">Wind ${Math.round(data.wind)} km/h · Sah Weather Lookup</div>
    `;
    positionPopup(rect);
    requestAnimationFrame(() => el.classList.add("sah-visible"));
  }

  function showError(rect, text) {
    const el = ensurePopup();
    el.innerHTML = `<div class="sah-loading">No weather found for "${escapeHtml(text)}"</div>`;
    positionPopup(rect);
    requestAnimationFrame(() => el.classList.add("sah-visible"));
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function looksLikePlaceName(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return false;
    return true;
  }

  // ---------- Weather lookup ----------

  async function geocode(text) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      text
    )}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("geocode failed");
    const json = await res.json();
    if (!json.results || !json.results.length) return null;
    const r = json.results[0];
    return {
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    };
  }

  async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather failed");
    const json = await res.json();
    return {
      temp: json.current.temperature_2m,
      code: json.current.weather_code,
      wind: json.current.wind_speed_10m,
      unit: "F",
    };
  }

  async function lookup(text, rect) {
    const key = text.trim().toLowerCase();
    const myToken = ++requestToken;

    if (CACHE.has(key)) {
      const cached = CACHE.get(key);
      if (cached === null) showError(rect, text);
      else showResult(rect, cached);
      return;
    }

    showLoading(rect, text);

    try {
      const place = await geocode(text.trim());
      if (myToken !== requestToken) return;
      if (!place) {
        CACHE.set(key, null);
        showError(rect, text);
        return;
      }
      const weather = await fetchWeather(place.lat, place.lon);
      if (myToken !== requestToken) return;
      const data = { name: place.name, ...weather };
      CACHE.set(key, data);
      showResult(rect, data);
    } catch (e) {
      if (myToken !== requestToken) return;
      CACHE.set(key, null);
      showError(rect, text);
    }
  }

  // ---------- Selection detection ----------
  // window.getSelection() only sees normal page/contenteditable selections.
  // Selections made *inside* <input>/<textarea> elements (e.g. a "City"
  // field in a web form) live on the element itself (selectionStart/End),
  // so we check both.

  function getCurrentSelection() {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
      typeof active.selectionStart === "number" &&
      active.selectionStart !== active.selectionEnd
    ) {
      const text = active.value
        .substring(active.selectionStart, active.selectionEnd)
        .trim();
      const rect = active.getBoundingClientRect();
      // Anchor near the field's edge since we can't get exact caret coords.
      return {
        text,
        rect: {
          top: rect.top,
          bottom: rect.top,
          left: rect.right - 4,
          right: rect.right,
        },
      };
    }

    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width !== 0 || rect.height !== 0)) {
        return { text, rect };
      }
    }
    return null;
  }

  function evaluateSelection() {
    const info = getCurrentSelection();
    if (!info || !looksLikePlaceName(info.text)) {
      hideIcon();
      return;
    }
    showIconAt(info.rect, info.text);
  }

  function scheduleEvaluate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(evaluateSelection, 250);
  }

  document.addEventListener("selectionchange", scheduleEvaluate);
  document.addEventListener("mouseup", (e) => {
    if (icon && icon.contains(e.target)) return;
    if (popup && popup.contains(e.target)) return;
    scheduleEvaluate();
  });
  // Selecting text with keyboard (Shift+Arrow) inside inputs.
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") scheduleEvaluate();
  });

  document.addEventListener("mousedown", (e) => {
    if (icon && icon.contains(e.target)) return;
    if (popup && !popup.contains(e.target)) hidePopup();
    if (icon && !icon.contains(e.target)) hideIcon();
  });

  document.addEventListener(
    "scroll",
    () => {
      hidePopup();
      hideIcon();
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hidePopup();
      hideIcon();
    }
  });

  // ---------- Right-click context menu fallback ----------
  // Works on pages that don't suppress the native context menu.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "SAH_WEATHER_LOOKUP") return;
    const text = (msg.text || "").trim();
    const rect = pendingRect || {
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
      left: window.innerWidth / 2,
      right: window.innerWidth / 2,
    };
    if (!looksLikePlaceName(text)) {
      showError(rect, text || "(selection)");
      return;
    }
    lookup(text, rect);
  });

  document.addEventListener(
    "contextmenu",
    (e) => {
      pendingRect = {
        top: e.clientY,
        bottom: e.clientY + 4,
        left: e.clientX,
        right: e.clientX + 4,
      };
    },
    true
  );
})();
