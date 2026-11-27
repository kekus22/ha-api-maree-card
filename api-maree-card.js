/*
 * API Marée Card — carte Lovelace pour l'intégration « API Marée » (api-maree.fr).
 * https://github.com/kekus22/ha-api-maree-card
 * Licence MIT.
 */

const CARD_VERSION = "0.1.0";
const CARD_TYPE = "api-maree-card";

const I18N = {
  fr: {
    rising: "Montante",
    falling: "Descendante",
    high: "Pleine mer",
    low: "Basse mer",
    high_short: "PM",
    low_short: "BM",
    coef: "Coef.",
    now: "Maintenant",
    next_high: "Prochaine PM",
    next_low: "Prochaine BM",
    no_data: "Aucune donnée de marée pour cette entité.",
    no_entity: "Entité introuvable :",
    today: "Aujourd'hui",
    tomorrow: "Demain",
    warning: "Coefficients non officiels — ne pas utiliser pour la navigation.",
    editor: {
      entity: "Entité « Hauteur d'eau » (intégration API Marée)",
      title: "Titre (facultatif)",
      mode: "Affichage",
      mode_chart: "Courbe",
      mode_full: "Courbe + tableau des prochains jours",
      window: "Fenêtre de la courbe",
      window_rolling: "Glissante (centrée sur maintenant)",
      window_day: "Journée en cours (00 h – 24 h)",
      hours: "Durée de la courbe glissante (heures)",
      days: "Nombre de jours du tableau",
      show_sun: "Afficher le jour et la nuit",
      show_attribution: "Afficher la source des données",
    },
  },
  en: {
    rising: "Rising",
    falling: "Falling",
    high: "High tide",
    low: "Low tide",
    high_short: "HW",
    low_short: "LW",
    coef: "Coef.",
    now: "Now",
    next_high: "Next HW",
    next_low: "Next LW",
    no_data: "No tide data for this entity.",
    no_entity: "Entity not found:",
    today: "Today",
    tomorrow: "Tomorrow",
    warning: "Unofficial coefficients — not for navigation.",
    editor: {
      entity: "“Water level” entity (API Marée integration)",
      title: "Title (optional)",
      mode: "Display",
      mode_chart: "Chart",
      mode_full: "Chart + upcoming days table",
      window: "Chart window",
      window_rolling: "Rolling (centred on now)",
      window_day: "Current day (00:00 – 24:00)",
      hours: "Rolling window length (hours)",
      days: "Number of days in the table",
      show_sun: "Show day and night",
      show_attribution: "Show data source",
    },
  },
};

const DEFAULTS = {
  mode: "chart",
  window: "rolling",
  hours: 24,
  days: 7,
  show_sun: true,
  show_attribution: true,
};

function lang(hass) {
  const l = (hass && (hass.locale?.language || hass.language)) || "fr";
  return l.startsWith("fr") ? "fr" : I18N[l.slice(0, 2)] ? l.slice(0, 2) : "en";
}

function t(hass, key) {
  const dict = I18N[lang(hass)];
  return key.split(".").reduce((o, k) => (o ? o[k] : undefined), dict) ?? key;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- Fuseau horaire ---------- */

function timeZone(hass) {
  if (hass?.locale?.time_zone === "local") return undefined;
  return hass?.config?.time_zone || undefined;
}

function fmtTime(hass, date) {
  return new Intl.DateTimeFormat(hass?.locale?.language || "fr", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone(hass),
  }).format(date);
}

function fmtHour(hass, date) {
  const parts = new Intl.DateTimeFormat("fr", {
    hour: "2-digit",
    hour12: false,
    timeZone: timeZone(hass),
  }).format(date);
  return `${parseInt(parts, 10)}h`;
}

function dayKey(hass, date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timeZone(hass),
  }).format(date);
}

function fmtDay(hass, date) {
  return new Intl.DateTimeFormat(hass?.locale?.language || "fr", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timeZone(hass),
  }).format(date);
}

function tzOffsetMs(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, parseInt(p.value, 10)])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function localMidnight(hass, date) {
  const [y, m, d] = dayKey(hass, date).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const tz = timeZone(hass);
  if (!tz) return new Date(y, m - 1, d);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

/* ---------- Données ---------- */

function parseData(attrs) {
  if (!attrs || !Array.isArray(attrs.extrema)) return null;
  const extrema = attrs.extrema
    .map((e) => ({ type: e.type, time: new Date(e.time), height: e.height, coef: e.coef }))
    .sort((a, b) => a.time - b.time);
  const curveStart = attrs.curve_start ? new Date(attrs.curve_start).getTime() : null;
  const stepMs = (attrs.curve_step || 10) * 60000;
  const curve = Array.isArray(attrs.curve) ? attrs.curve : [];
  const sun = (attrs.sun || []).map((s) => ({
    date: s.date,
    sunrise: s.sunrise ? new Date(s.sunrise) : null,
    sunset: s.sunset ? new Date(s.sunset) : null,
  }));
  return { extrema, curveStart, stepMs, curve, sun, attribution: attrs.data_attribution, site: attrs.site_name };
}

function heightAt(data, ts) {
  const { curve, curveStart, stepMs, extrema } = data;
  if (curveStart !== null && curve.length >= 2) {
    const offset = (ts - curveStart) / stepMs;
    if (offset >= 0 && offset <= curve.length - 1) {
      const i = Math.floor(offset);
      if (i >= curve.length - 1) return curve[curve.length - 1];
      return curve[i] + (curve[i + 1] - curve[i]) * (offset - i);
    }
  }
  // Repli : interpolation sinusoïdale entre les extrema encadrants.
  let prev = null;
  let next = null;
  for (const e of extrema) {
    if (e.time.getTime() <= ts) prev = e;
    else {
      next = e;
      break;
    }
  }
  if (!prev || !next) return null;
  const ratio = (ts - prev.time) / (next.time - prev.time);
  return prev.height + ((next.height - prev.height) * (1 - Math.cos(Math.PI * ratio))) / 2;
}

function fmtNum(hass, value, digits) {
  return new Intl.NumberFormat(hass?.locale?.language || "fr", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function coefClass(coef) {
  if (coef == null) return "";
  if (coef >= 95) return "c-xl";
  if (coef >= 70) return "c-l";
  if (coef >= 45) return "c-m";
  return "c-s";
}

/** Ne conserve que le texte et les liens http(s) de l'attribution HTML fournie par l'API. */
function safeAttribution(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (node) =>
    Array.from(node.childNodes)
      .map((child) => {
        if (child.nodeType === Node.TEXT_NODE) return esc(child.textContent);
        if (child.nodeType !== Node.ELEMENT_NODE) return "";
        const inner = walk(child);
        if (child.tagName === "A") {
          const href = child.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)) {
            return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
          }
        }
        return inner;
      })
      .join("");
  return walk(doc.body.firstChild);
}

/* ---------- Carte ---------- */

class ApiMareeCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("api-maree-card-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find(
      (id) => id.startsWith("sensor.") && Array.isArray(hass.states[id].attributes?.curve)
    );
    return { entity: entity || "", mode: "full" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("entity est obligatoire / entity is required");
    }
    this._config = { ...DEFAULTS, ...config };
    this._lastKey = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config?.entity];
    const key = st ? `${st.last_updated}|${hass.locale?.language}|${Math.floor(Date.now() / 60000)}` : "missing";
    if (key !== this._lastKey) {
      this._lastKey = key;
      this._render();
    }
  }

  connectedCallback() {
    if (!this._resizeObserver && "ResizeObserver" in window) {
      this._resizeObserver = new ResizeObserver((entries) => {
        // Largeur de la carte moins le padding de ha-card (2 × 16 px) plus la marge du graphique.
        const chart = (entries[0]?.contentRect?.width || 0) - 24;
        if (chart > 0 && Math.abs(chart - (this._width || 0)) > 4) {
          this._width = chart;
          this._render();
        }
      });
    }
    this._resizeObserver?.observe(this);
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
  }

  getCardSize() {
    return this._config?.mode === "full" ? 7 : 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: this._config?.mode === "full" ? 7 : 4, min_rows: 3 };
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const hass = this._hass;
    if (!hass) {
      this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card></ha-card>`;
      return;
    }
    const st = hass.states[this._config.entity];
    if (!st) {
      this._renderMessage(`${t(hass, "no_entity")} ${esc(this._config.entity)}`);
      return;
    }
    const data = parseData(st.attributes);
    if (!data || !data.extrema.length) {
      this._renderMessage(t(hass, "no_data"));
      return;
    }

    const now = Date.now();
    const next = data.extrema.find((e) => e.time.getTime() > now);
    const nextHigh = data.extrema.find((e) => e.type === "high" && e.time.getTime() > now);
    const nextLow = data.extrema.find((e) => e.type === "low" && e.time.getTime() > now);
    const rising = next ? next.type === "high" : null;
    const height = heightAt(data, now);
    const title = this._config.title || data.site || st.attributes.friendly_name;

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="header">
          <div class="title">${esc(title)}</div>
          ${nextHigh?.coef != null ? `<span class="coef ${coefClass(nextHigh.coef)}" title="${esc(t(hass, "coef"))}">${nextHigh.coef}</span>` : ""}
        </div>
        <div class="summary">
          <div class="now">
            <span class="height">${height != null ? fmtNum(hass, height, 2) : "–"}<small> m</small></span>
            ${rising != null ? `<span class="trend ${rising ? "up" : "down"}">${rising ? "▲" : "▼"} ${esc(t(hass, rising ? "rising" : "falling"))}</span>` : ""}
          </div>
          <div class="nexts">
            ${this._nextBlock(nextHigh, "next_high")}
            ${this._nextBlock(nextLow, "next_low")}
          </div>
        </div>
        ${this._chart(data, now)}
        ${this._config.mode === "full" ? this._table(data, now) : ""}
        ${this._config.show_attribution ? `<div class="attribution">${safeAttribution(data.attribution) || "Données : api-maree.fr (CC BY 4.0)"}<br>${esc(t(hass, "warning"))}</div>` : ""}
      </ha-card>`;
    this._bindTooltip(data);
  }

  _renderMessage(msg) {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card><div class="message">${msg}</div></ha-card>`;
  }

  _nextBlock(ext, labelKey) {
    if (!ext) return "";
    const hass = this._hass;
    return `<div class="next ${ext.type}">
      <span class="label">${esc(t(hass, labelKey))}</span>
      <span class="value">${esc(fmtTime(hass, ext.time))}</span>
      <span class="sub">${fmtNum(hass, ext.height, 2)} m</span>
    </div>`;
  }

  _window(now) {
    if (this._config.window === "day") {
      const start = localMidnight(this._hass, new Date(now)).getTime();
      return [start, start + 24 * 3600000];
    }
    const hours = Math.max(6, Math.min(48, Number(this._config.hours) || 24));
    const start = now - (hours / 4) * 3600000;
    return [start, start + hours * 3600000];
  }

  _chart(data, now) {
    const hass = this._hass;
    const [start, end] = this._window(now);
    const W = Math.max(280, Math.round(this._width || 600));
    const H = 190;
    const pad = { l: 30, r: 10, t: 26, b: 22 };
    const step = 10 * 60000;
    const points = [];
    for (let ts = start; ts <= end; ts += step) {
      const h = heightAt(data, ts);
      if (h != null) points.push([ts, h]);
    }
    if (points.length < 2) return "";

    const inWindow = data.extrema.filter((e) => e.time >= start && e.time <= end);
    const heights = points.map((p) => p[1]).concat(inWindow.map((e) => e.height));
    let minH = Math.floor(Math.min(...heights));
    let maxH = Math.ceil(Math.max(...heights));
    if (maxH - minH < 1) maxH = minH + 1;

    const x = (ts) => pad.l + ((ts - start) / (end - start)) * (W - pad.l - pad.r);
    const y = (h) => pad.t + (1 - (h - minH) / (maxH - minH)) * (H - pad.t - pad.b);
    this._scale = { start, end, W, H, pad, x, y };

    const line = points.map(([ts, h], i) => `${i ? "L" : "M"}${x(ts).toFixed(1)},${y(h).toFixed(1)}`).join("");
    const area = `${line}L${x(points[points.length - 1][0]).toFixed(1)},${H - pad.b}L${x(points[0][0]).toFixed(1)},${H - pad.b}Z`;

    // Nuit
    let night = "";
    if (this._config.show_sun && data.sun.length) {
      const intervals = [];
      const sun = data.sun.filter((s) => s.sunrise && s.sunset);
      for (let i = 0; i < sun.length; i++) {
        const prevSet = i > 0 ? sun[i - 1].sunset.getTime() : sun[i].sunrise.getTime() - 16 * 3600000;
        intervals.push([prevSet, sun[i].sunrise.getTime()]);
      }
      if (sun.length) {
        const last = sun[sun.length - 1].sunset.getTime();
        intervals.push([last, last + 16 * 3600000]);
      }
      night = intervals
        .map(([a, b]) => [Math.max(a, start), Math.min(b, end)])
        .filter(([a, b]) => b > a)
        .map(([a, b]) => `<rect class="night" x="${x(a).toFixed(1)}" y="${pad.t - 4}" width="${(x(b) - x(a)).toFixed(1)}" height="${H - pad.b - pad.t + 4}"/>`)
        .join("");
    }

    // Grille horizontale
    const yStep = maxH - minH > 6 ? 2 : 1;
    let grid = "";
    for (let h = minH; h <= maxH; h += yStep) {
      grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(h).toFixed(1)}" y2="${y(h).toFixed(1)}"/>
        <text class="axis" x="${pad.l - 5}" y="${(y(h) + 3).toFixed(1)}" text-anchor="end">${h}</text>`;
    }

    // Graduations horaires (toutes les 3 h, ou 6 h au-delà de 24 h)
    const hours = (end - start) / 3600000;
    const tickH = hours > 30 ? 6 : 3;
    let ticks = "";
    const firstTick = Math.ceil(start / 3600000) * 3600000;
    for (let ts = firstTick; ts <= end; ts += 3600000) {
      const hourNum = parseInt(fmtHour(hass, new Date(ts)), 10);
      if (hourNum % tickH !== 0) continue;
      ticks += `<line class="tick" x1="${x(ts).toFixed(1)}" x2="${x(ts).toFixed(1)}" y1="${H - pad.b}" y2="${H - pad.b + 4}"/>
        <text class="axis" x="${x(ts).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtHour(hass, new Date(ts))}</text>`;
    }

    // Extrema
    const marks = inWindow
      .map((e) => {
        const ex = x(e.time.getTime());
        const ey = y(e.height);
        const ty = ey - 8;
        const anchor = ex < pad.l + 30 ? "start" : ex > W - pad.r - 30 ? "end" : "middle";
        const label = `${fmtTime(hass, e.time)} · ${fmtNum(hass, e.height, 1)} m${e.coef != null ? ` · ${e.coef}` : ""}`;
        return `<circle class="ext ${e.type}" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5"/>
          <text class="ext-label" x="${ex.toFixed(1)}" y="${Math.max(10, Math.min(H - pad.b - 2, ty)).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>`;
      })
      .join("");

    // Maintenant
    let nowMark = "";
    if (now >= start && now <= end) {
      const h = heightAt(data, now);
      nowMark = `<line class="now-line" x1="${x(now).toFixed(1)}" x2="${x(now).toFixed(1)}" y1="${pad.t - 4}" y2="${H - pad.b}"/>
        ${h != null ? `<circle class="now-dot" cx="${x(now).toFixed(1)}" cy="${y(h).toFixed(1)}" r="5"/>` : ""}`;
    }

    return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t(hass, "high"))} / ${esc(t(hass, "low"))}">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style="stop-color: var(--_water); stop-opacity: 0.55"/>
            <stop offset="100%" style="stop-color: var(--_water); stop-opacity: 0.08"/>
          </linearGradient>
        </defs>
        ${night}${grid}
        <path class="area" d="${area}" fill="url(#water)"/>
        <path class="line" d="${line}"/>
        ${ticks}${nowMark}${marks}
        <line class="cursor" x1="0" x2="0" y1="${pad.t - 4}" y2="${H - pad.b}" visibility="hidden"/>
        <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}"/>
      </svg>
      <div class="tooltip" hidden></div>
    </div>`;
  }

  _bindTooltip(data) {
    const svg = this.shadowRoot.querySelector(".chart svg");
    const tip = this.shadowRoot.querySelector(".tooltip");
    const cursor = this.shadowRoot.querySelector(".cursor");
    if (!svg || !tip || !this._scale) return;
    const { start, end, W, pad } = this._scale;
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const ts = start + ((px - pad.l) / (W - pad.l - pad.r)) * (end - start);
      if (ts < start || ts > end) return;
      const h = heightAt(data, ts);
      if (h == null) return;
      cursor.setAttribute("x1", px.toFixed(1));
      cursor.setAttribute("x2", px.toFixed(1));
      cursor.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.textContent = `${fmtTime(this._hass, new Date(ts))} · ${fmtNum(this._hass, h, 2)} m`;
      const left = Math.min(Math.max(ev.clientX - rect.left, 40), rect.width - 40);
      tip.style.left = `${left}px`;
    };
    const leave = () => {
      tip.hidden = true;
      cursor.setAttribute("visibility", "hidden");
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", leave);
  }

  _table(data, now) {
    const hass = this._hass;
    const days = Math.max(1, Math.min(7, Number(this._config.days) || 7));
    const todayKey = dayKey(hass, new Date(now));
    const tomorrowKey = dayKey(hass, new Date(now + 24 * 3600000));
    const groups = new Map();
    for (const e of data.extrema) {
      const k = dayKey(hass, e.time);
      if (k < todayKey) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const rows = Array.from(groups.entries())
      .slice(0, days)
      .map(([k, list]) => {
        const label = k === todayKey ? t(hass, "today") : k === tomorrowKey ? t(hass, "tomorrow") : fmtDay(hass, list[0].time);
        const coefs = list.filter((e) => e.coef != null).map((e) => `<span class="coef small ${coefClass(e.coef)}">${e.coef}</span>`).join("");
        const cells = list
          .map(
            (e) => `<span class="tide ${e.type} ${e.time.getTime() < now ? "past" : ""}">
              <b>${esc(t(hass, e.type === "high" ? "high_short" : "low_short"))}</b> ${esc(fmtTime(hass, e.time))}
              <small>${fmtNum(hass, e.height, 1)} m</small></span>`
          )
          .join("");
        return `<div class="row"><div class="day">${esc(label)}</div><div class="tides">${cells}</div><div class="coefs">${coefs}</div></div>`;
      })
      .join("");
    return `<div class="table">${rows}</div>`;
  }
}

const STYLES = `
  :host {
    display: block;
    /* Variables internes : surchargeables par un thème via --api-maree-*-color. */
    --_water: var(--api-maree-water-color, var(--info-color, #039be5));
    --_high: var(--api-maree-high-color, var(--_water));
    --_low: var(--api-maree-low-color, var(--warning-color, #ff9800));
  }
  ha-card { display: block; padding: 16px; overflow: hidden; container-type: inline-size; }
  .message { color: var(--secondary-text-color); }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { font-size: 1.2em; font-weight: 500; color: var(--primary-text-color); }
  .coef { display: inline-block; min-width: 2.2em; text-align: center; padding: 2px 8px; border-radius: 12px;
    font-weight: 600; color: #fff; background: var(--secondary-text-color); }
  .coef.small { padding: 0 6px; font-size: 0.8em; min-width: 1.8em; margin-left: 4px; }
  .coef.c-s { background: #5c8bd6; }
  .coef.c-m { background: #43a047; }
  .coef.c-l { background: #fb8c00; }
  .coef.c-xl { background: #e53935; }
  .summary { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 8px 0 4px; }
  .now { display: flex; flex-direction: column; }
  .height { font-size: 2.2em; font-weight: 400; line-height: 1.1; color: var(--primary-text-color); }
  .height small { font-size: 0.45em; color: var(--secondary-text-color); }
  .trend { font-size: 0.9em; color: var(--secondary-text-color); }
  .trend.up { color: var(--_high); }
  .trend.down { color: var(--_low); }
  .nexts { display: flex; gap: 16px; }
  .next { display: flex; flex-direction: column; align-items: flex-end; }
  .next .label { font-size: 0.75em; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); }
  .next .value { font-size: 1.25em; font-weight: 500; color: var(--primary-text-color); }
  .next.high .value { color: var(--_high); }
  .next.low .value { color: var(--_low); }
  .next .sub { font-size: 0.8em; color: var(--secondary-text-color); }
  .chart { position: relative; margin: 4px -4px 0; }
  svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
  .night { fill: var(--primary-text-color); opacity: 0.06; }
  .grid { stroke: var(--divider-color, rgba(127,127,127,.2)); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .tick { stroke: var(--secondary-text-color); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .axis { fill: var(--secondary-text-color); font-size: 10px; }
  .line { fill: none; stroke: var(--_water); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .ext { stroke: var(--card-background-color, #fff); stroke-width: 1.5; }
  .ext.high { fill: var(--_high); }
  .ext.low { fill: var(--_low); }
  .ext-label { fill: var(--primary-text-color); font-size: 10px; font-weight: 500; paint-order: stroke;
    stroke: var(--card-background-color, #fff); stroke-width: 3px; stroke-linejoin: round; }
  .now-line { stroke: var(--primary-color); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
  .now-dot { fill: var(--primary-color); stroke: var(--card-background-color, #fff); stroke-width: 2; }
  .cursor { stroke: var(--secondary-text-color); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .hit { fill: transparent; cursor: crosshair; }
  .tooltip { position: absolute; top: 0; transform: translateX(-50%); pointer-events: none; white-space: nowrap;
    background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 1px solid var(--divider-color);
    border-radius: 6px; padding: 2px 8px; font-size: 0.8em; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .table { margin-top: 12px; border-top: 1px solid var(--divider-color); }
  .row { display: grid; grid-template-columns: 6.5em 1fr auto; align-items: center; gap: 8px;
    padding: 6px 0; border-bottom: 1px solid var(--divider-color); font-size: 0.9em; }
  .day { color: var(--secondary-text-color); text-transform: capitalize; }
  .tides { gap: 2px 14px; color: var(--primary-text-color); }
  .tide b { font-weight: 600; font-size: 0.85em; }
  .tide.high b { color: var(--_high); }
  .tide.low b { color: var(--_low); }
  .tide small { color: var(--secondary-text-color); }
  .tide.past { opacity: 0.45; }
  .coefs { white-space: nowrap; }
  .attribution { margin-top: 10px; font-size: 0.7em; line-height: 1.35; color: var(--secondary-text-color); }
  .attribution a { color: inherit; }
  .tides { display: grid; grid-template-columns: repeat(4, max-content); }
  @container (max-width: 520px) {
    .tides { grid-template-columns: repeat(2, max-content); }
  }
  @container (max-width: 340px) {
    .row { grid-template-columns: 1fr auto; }
    .tides { grid-column: 1 / -1; grid-row: 2; }
  }
`;

/* ---------- Éditeur visuel ---------- */

class ApiMareeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _schema() {
    const hass = this._hass;
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { filter: { integration: "api_maree", domain: "sensor", device_class: "distance" } } },
      },
      { name: "title", selector: { text: {} } },
      {
        name: "mode",
        selector: {
          select: {
            mode: "list",
            options: [
              { value: "chart", label: t(hass, "editor.mode_chart") },
              { value: "full", label: t(hass, "editor.mode_full") },
            ],
          },
        },
      },
      {
        name: "window",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "rolling", label: t(hass, "editor.window_rolling") },
              { value: "day", label: t(hass, "editor.window_day") },
            ],
          },
        },
      },
      ...(this._config.window === "rolling"
        ? [{ name: "hours", selector: { number: { min: 12, max: 48, step: 6, mode: "slider" } } }]
        : []),
      ...(this._config.mode === "full"
        ? [{ name: "days", selector: { number: { min: 1, max: 7, step: 1, mode: "slider" } } }]
        : []),
      { name: "show_sun", selector: { boolean: {} } },
      { name: "show_attribution", selector: { boolean: {} } },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => t(this._hass, `editor.${s.name}`);
      this._form.addEventListener("value-changed", (ev) => {
        this._config = { ...this._config, ...ev.detail.value };
        this._form.schema = this._schema();
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this._schema();
  }
}

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, ApiMareeCard);
if (!customElements.get(`${CARD_TYPE}-editor`)) customElements.define(`${CARD_TYPE}-editor`, ApiMareeCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: "API Marée",
    description: "Courbe de marée, prochaines pleines et basses mers, coefficients (api-maree.fr).",
    preview: true,
    documentationURL: "https://github.com/kekus22/ha-api-maree-card",
  });
}

console.info(`%c API-MAREE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#039be5;font-weight:700", "color:#039be5");
