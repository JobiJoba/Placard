// src/web/shims/react.ts
var bridge = globalThis.__PLACARD_PLUGIN__;
if (!bridge?.React) {
  throw new Error("Placard plugin host bridge missing (React). Rebuild/redeploy the web app.");
}
var R = bridge.React;
var {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useId,
  useLayoutEffect,
  createElement,
  Fragment,
  Children,
  cloneElement,
  isValidElement,
  createContext,
  useContext,
  useReducer,
  memo,
  forwardRef,
  StrictMode
} = R;

// src/web/shims/react-router.ts
var bridge2 = globalThis.__PLACARD_PLUGIN__;
if (!bridge2?.Link) {
  throw new Error("Placard plugin host bridge missing (Link). Rebuild/redeploy the web app.");
}
var Link = bridge2.Link;

// src/web/shims/jsx-runtime.ts
var bridge3 = globalThis.__PLACARD_PLUGIN__;
if (!bridge3?.jsxRuntime) {
  throw new Error("Placard plugin host bridge missing (jsx-runtime). Rebuild/redeploy the web app.");
}
var { jsx, jsxs, Fragment: Fragment2 } = bridge3.jsxRuntime;

// src/web/PickPage.tsx
var radiusOptions = [1, 2, 5, 10, 25];
var SPIN_MS = 1400;
var SPIN_NAMES = ["A change of scenery", "Your next favorite", "Somewhere worth going", "A little adventure"];
var API = "/api/m/places.pick";
var categoryLabel = (c) => c.replaceAll("_", " ");
async function apiJson(path, init) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers ?? {} },
    ...init
  });
  const text = await response.text();
  const body = text === "" ? void 0 : JSON.parse(text);
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return body;
}
function mapsGoogle(place) {
  const q = place.googlePlaceId ? `api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(place.googlePlaceId)}` : `api=1&query=${place.location.lat},${place.location.lng}`;
  return `https://www.google.com/maps/search/?${q}`;
}
function PickPage() {
  const [lists, setLists] = useState(null);
  const [tags, setTags] = useState(null);
  const [placeCategories, setPlaceCategories] = useState(null);
  const [categoryError, setCategoryError] = useState(null);
  const [category, setCategory] = useState("");
  const [poolSource, setPoolSource] = useState("all");
  const [listId, setListId] = useState("");
  const [tagName, setTagName] = useState("");
  const [openTonight, setOpenTonight] = useState(true);
  const [nearMe, setNearMe] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [near, setNear] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [avoidRecent, setAvoidRecent] = useState(true);
  const [avoidRecentDays, setAvoidRecentDays] = useState("14");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const validDays = /^\d+$/.test(avoidRecentDays) && Number(avoidRecentDays) >= 1 && Number(avoidRecentDays) <= 365;
  async function saveDefaults() {
    setSaving(true);
    setPreferenceMessage("");
    try {
      await apiJson(`${API}/preferences`, { method: "PUT", body: JSON.stringify({ avoidRecent, avoidRecentDays: Number(avoidRecentDays) }) });
      setPreferenceMessage("Your defaults are saved.");
    } catch (error) {
      setPreferenceMessage(error instanceof Error ? error.message : "Could not save defaults");
    } finally {
      setSaving(false);
    }
  }
  const [previewCount, setPreviewCount] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [spinLabel, setSpinLabel] = useState("");
  const [result, setResult] = useState(null);
  const [spinError, setSpinError] = useState(null);
  useEffect(() => {
    void apiJson(`${API}/preferences`).then((value) => {
      setAvoidRecent(value.avoidRecent);
      setAvoidRecentDays(String(value.avoidRecentDays));
      setPreferencesLoaded(true);
    }).catch(() => {
      setPreferenceMessage("Could not load defaults. Using 14 days.");
      setPreferencesLoaded(true);
    });
    void apiJson(`${API}/meta`).then((value) => setPlaceCategories(value.categories)).catch((error) => setCategoryError(error instanceof Error ? error.message : "Could not load place types"));
    void apiJson("/api/lists").then(setLists).catch(() => setLists([]));
    void apiJson("/api/tags").then(setTags).catch(() => setTags([]));
  }, []);
  useEffect(() => {
    if (!nearMe) {
      setNear(null);
      setGeoError(null);
      return;
    }
    let cancelled = false;
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setGeoLoading(false);
        setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (cancelled) return;
        setGeoLoading(false);
        setNear(null);
        setGeoError(err.message || "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 12e3 }
    );
    return () => {
      cancelled = true;
    };
  }, [nearMe]);
  const request = useMemo(() => {
    if (!preferencesLoaded || !validDays) return null;
    if (poolSource === "list" && !listId) return null;
    if (poolSource === "tag" && !tagName) return null;
    if (nearMe && !near) return null;
    return {
      avoidRecent,
      avoidRecentDays: Number(avoidRecentDays),
      ...category ? { category } : {},
      open: openTonight ? "tonight" : void 0,
      list: poolSource === "list" ? listId : void 0,
      tag: poolSource === "tag" ? tagName : void 0,
      ...nearMe && near ? { near, radiusKm } : {}
    };
  }, [preferencesLoaded, validDays, avoidRecentDays, avoidRecent, category, listId, near, nearMe, openTonight, poolSource, radiusKm, tagName]);
  useEffect(() => {
    if (!request) {
      setPreviewCount(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewError(null);
    setPreviewCount(null);
    void apiJson(`${API}/preview`, {
      method: "POST",
      body: JSON.stringify(request)
    }).then(
      (preview) => {
        if (!cancelled) setPreviewCount(preview.count);
      },
      (cause) => {
        if (!cancelled) {
          setPreviewCount(null);
          setPreviewError(cause instanceof Error ? cause.message : "Preview failed");
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [request]);
  const choose = useCallback(() => {
    if (!request || spinning) return;
    setSpinError(null);
    setResult(null);
    setSpinning(true);
    let tick = 0;
    const timer = window.setInterval(() => {
      setSpinLabel(SPIN_NAMES[tick % SPIN_NAMES.length] ?? "");
      tick += 1;
    }, 90);
    const started = Date.now();
    void apiJson(`${API}/spin`, {
      method: "POST",
      body: JSON.stringify(request)
    }).then(async (outcome) => {
      const wait = Math.max(0, SPIN_MS - (Date.now() - started));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      window.clearInterval(timer);
      setSpinLabel(outcome.place.name);
      setResult(outcome.place);
      setPreviewCount((n) => n == null ? n : Math.max(0, n - (avoidRecent ? 1 : 0)));
      setSpinning(false);
    }).catch((cause) => {
      window.clearInterval(timer);
      setSpinning(false);
      setSpinLabel("");
      setSpinError(cause instanceof Error ? cause.message : "Spin failed");
    });
  }, [avoidRecent, request, spinning]);
  const poolLabel = category ? `All ${categoryLabel(category)}s` : "All places";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "pick-page",
      children: [
        /* @__PURE__ */ jsx("style", { children: `
.pick-page{max-width:1040px;margin:0 auto;display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1.2fr);gap:24px;color:var(--foreground,var(--parchment-ink,#1a1612))}
.pick-page>header{grid-column:1/-1;padding:12px 0 20px;border-bottom:1px solid var(--crate-edge,#3a322c)}
.pick-page>section{grid-column:1;grid-row:2/4}.pick-page>.pick-result{grid-column:2;grid-row:2;align-self:start}
.pick-page button,.pick-page select,.pick-page input[type=number]{min-height:44px}.pick-page button:disabled{opacity:.5;cursor:not-allowed}.pick-page :focus-visible{outline:2px solid var(--action,#e8a54b);outline-offset:4px}
.pick-page input[type=checkbox]{accent-color:var(--action,#e8a54b);width:18px;height:18px}.pick-page .pick-result{box-shadow:0 16px 48px #0002}.pick-page .pick-result img{width:100%;max-height:260px;object-fit:cover;border-radius:12px}
@media(max-width:720px){.pick-page{grid-template-columns:minmax(0,1fr)}.pick-page>section,.pick-page>.pick-result{grid-column:1;grid-row:auto}}
      ` }),
        /* @__PURE__ */ jsxs("header", { children: [
          /* @__PURE__ */ jsx(
            "p",
            {
              style: { fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 },
              children: "FROM YOUR SAVED PLACES"
            }
          ),
          /* @__PURE__ */ jsx(
            "h1",
            {
              style: {
                fontSize: 36,
                margin: "8px 0",
                letterSpacing: "0.04em",
                textTransform: "uppercase"
              },
              children: "Where to next?"
            }
          ),
          /* @__PURE__ */ jsx("p", { style: { fontSize: 14, opacity: 0.7 }, children: "Good places. Fewer decisions. Set the mood and let Pick choose." })
        ] }),
        /* @__PURE__ */ jsxs(
          "section",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: 20,
              border: "1px solid var(--crate-edge, #3a322c)",
              borderRadius: 20,
              background: "var(--crate, #2a2420)",
              color: "var(--parchment, #f3ebe1)"
            },
            children: [
              /* @__PURE__ */ jsx("h2", { style: { margin: 0, fontSize: 20 }, children: "Make it your kind of place" }),
              /* @__PURE__ */ jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }, children: [
                "Type",
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: category,
                    onChange: (e) => setCategory(e.target.value),
                    disabled: placeCategories === null,
                    style: selectStyle,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "", children: "Any type" }),
                      (placeCategories ?? []).map((c) => /* @__PURE__ */ jsx("option", { value: c, children: categoryLabel(c) }, c))
                    ]
                  }
                )
              ] }),
              categoryError && /* @__PURE__ */ jsx("p", { role: "alert", children: categoryError }),
              /* @__PURE__ */ jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }, children: [
                "Pool",
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: poolSource,
                    onChange: (e) => setPoolSource(e.target.value),
                    style: selectStyle,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "all", children: poolLabel }),
                      /* @__PURE__ */ jsx("option", { value: "list", children: "A list" }),
                      /* @__PURE__ */ jsx("option", { value: "tag", children: "A tag" })
                    ]
                  }
                )
              ] }),
              poolSource === "list" && /* @__PURE__ */ jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }, children: [
                "List",
                /* @__PURE__ */ jsxs("select", { value: listId, onChange: (e) => setListId(e.target.value), style: selectStyle, children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: lists ? "Choose a list" : "Loading\u2026" }),
                  (lists ?? []).map((list) => /* @__PURE__ */ jsx("option", { value: list.id, children: list.name }, list.id))
                ] })
              ] }),
              poolSource === "tag" && /* @__PURE__ */ jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }, children: [
                "Tag",
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: tagName,
                    onChange: (e) => setTagName(e.target.value),
                    style: selectStyle,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "", children: tags ? "Choose a tag" : "Loading\u2026" }),
                      (tags ?? []).map((tag) => /* @__PURE__ */ jsx("option", { value: tag.name, children: tag.name }, tag.name))
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 }, children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: openTonight,
                    onChange: (e) => setOpenTonight(e.target.checked)
                  }
                ),
                "Open tonight"
              ] }),
              /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 }, children: [
                /* @__PURE__ */ jsx("input", { type: "checkbox", checked: nearMe, onChange: (e) => setNearMe(e.target.checked) }),
                "Near me"
              ] }),
              nearMe && /* @__PURE__ */ jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }, children: [
                "Radius",
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: String(radiusKm),
                    onChange: (e) => setRadiusKm(Number(e.target.value)),
                    style: selectStyle,
                    children: radiusOptions.map((km) => /* @__PURE__ */ jsxs("option", { value: km, children: [
                      km,
                      " km"
                    ] }, km))
                  }
                ),
                geoLoading && /* @__PURE__ */ jsx("span", { style: { fontSize: 12, opacity: 0.7 }, children: "Getting your location\u2026" }),
                geoError && /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#f87171" }, children: geoError })
              ] }),
              /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 }, children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: avoidRecent,
                    disabled: !preferencesLoaded || saving,
                    onChange: (e) => setAvoidRecent(e.target.checked)
                  }
                ),
                "Avoid recent picks"
              ] }),
              /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: 8 }, children: [
                "Days before picking a place again",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: "1",
                    max: "365",
                    step: "1",
                    value: avoidRecentDays,
                    disabled: !preferencesLoaded || saving,
                    onChange: (event) => {
                      setAvoidRecentDays(event.target.value);
                      setPreferenceMessage("");
                    },
                    style: selectStyle,
                    "aria-invalid": !validDays
                  }
                )
              ] }),
              !validDays && /* @__PURE__ */ jsx("p", { role: "alert", children: "Enter a whole number from 1 to 365." }),
              /* @__PURE__ */ jsx("button", { type: "button", style: linkBtnOutline, disabled: !preferencesLoaded || !validDays || saving, onClick: () => void saveDefaults(), children: saving ? "Saving\u2026" : "Save as my defaults" }),
              /* @__PURE__ */ jsx("small", { role: "status", children: preferenceMessage || "Save the recent-pick switch and days for your next visit." }),
              /* @__PURE__ */ jsxs(
                "div",
                {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    borderTop: "1px solid var(--crate-edge, #3a322c)",
                    paddingTop: 16
                  },
                  children: [
                    /* @__PURE__ */ jsx("p", { style: { margin: 0, fontSize: 14, opacity: 0.75 }, children: previewError ? "Couldn't count the pool" : previewCount == null ? nearMe && !near ? "Waiting for location\u2026" : "\u2026" : previewCount === 0 ? "Nothing in the pool" : `${previewCount} in the pool` }),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        disabled: !request || spinning || previewCount == null || previewCount === 0,
                        onClick: choose,
                        style: {
                          padding: "10px 18px",
                          borderRadius: 20,
                          border: "none",
                          background: "var(--action, #e8a54b)",
                          color: "var(--action-fg, #1a1612)",
                          fontWeight: 600,
                          cursor: !request || spinning || previewCount === 0 ? "not-allowed" : "pointer",
                          opacity: !request || spinning || previewCount === 0 ? 0.5 : 1
                        },
                        children: spinning ? "Choosing\u2026" : "Choose for me"
                      }
                    )
                  ]
                }
              )
            ]
          }
        ),
        (previewError || spinError) && /* @__PURE__ */ jsx("p", { style: { color: "#b91c1c", fontSize: 14 }, children: previewError ?? spinError }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "pick-result",
            style: {
              minHeight: 300,
              borderRadius: 20,
              border: "1px solid var(--crate-edge, #3a322c)",
              background: "var(--crate-raised, #342c26)",
              color: "var(--parchment, #f3ebe1)",
              overflow: "hidden"
            },
            "aria-live": "polite",
            children: spinning ? /* @__PURE__ */ jsx("div", { style: { minHeight: 300, display: "grid", placeItems: "center", textAlign: "center" }, children: /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { style: { fontSize: 28, margin: 0, textTransform: "uppercase" }, children: spinLabel || "\u2026" }),
              /* @__PURE__ */ jsx(
                "p",
                {
                  style: {
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: 0.7
                  },
                  children: "Spinning"
                }
              )
            ] }) }) : result ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16, padding: 24 }, children: [
              result.coverThumbUrl && /* @__PURE__ */ jsx("img", { src: result.coverThumbUrl, alt: "" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx(
                  "p",
                  {
                    style: {
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.7
                    },
                    children: "YOUR NEXT STOP"
                  }
                ),
                /* @__PURE__ */ jsx("h2", { style: { margin: "4px 0", fontSize: 24, textTransform: "uppercase" }, children: result.name }),
                result.address && /* @__PURE__ */ jsx("p", { style: { margin: 0, fontSize: 14, opacity: 0.75 }, children: result.address }),
                /* @__PURE__ */ jsx("p", { style: { margin: "6px 0 0", fontSize: 12, opacity: 0.6 }, children: result.category })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [
                /* @__PURE__ */ jsx(Link, { to: `/places/${result.id}`, style: linkBtn, children: "Open place" }),
                /* @__PURE__ */ jsx("a", { href: mapsGoogle(result), target: "_blank", rel: "noreferrer", style: linkBtnOutline, children: "Maps" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    disabled: !request || spinning || previewCount == null || previewCount <= 0,
                    onClick: choose,
                    style: linkBtnOutline,
                    children: "Spin again"
                  }
                )
              ] })
            ] }) : /* @__PURE__ */ jsx(
              "div",
              {
                style: {
                  minHeight: 300,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  padding: 24
                },
                children: /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("p", { style: { fontSize: 20, textTransform: "uppercase", margin: 0 }, children: "Leave room for a surprise" }),
                  /* @__PURE__ */ jsx("p", { style: { fontSize: 14, opacity: 0.7 }, children: "Your next stop is already in your library. Let\u2019s find it." })
                ] })
              }
            )
          }
        )
      ]
    }
  );
}
var selectStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--crate-edge, #3a322c)",
  background: "var(--crate-raised, #342c26)",
  color: "inherit"
};
var linkBtn = {
  display: "inline-block",
  padding: "6px 12px",
  borderRadius: 6,
  background: "var(--action, #e8a54b)",
  color: "var(--action-fg, #1a1612)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600
};
var linkBtnOutline = {
  display: "inline-block",
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--crate-edge, #3a322c)",
  background: "transparent",
  color: "inherit",
  textDecoration: "none",
  fontSize: 13,
  cursor: "pointer"
};
export {
  PickPage
};
