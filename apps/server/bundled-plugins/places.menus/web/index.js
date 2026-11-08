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

// src/web/shims/jsx-runtime.ts
var bridge2 = globalThis.__PLACARD_PLUGIN__;
if (!bridge2?.jsxRuntime) {
  throw new Error("Placard plugin host bridge missing (jsx-runtime). Rebuild/redeploy the web app.");
}
var { jsx, jsxs, Fragment: Fragment2 } = bridge2.jsxRuntime;

// src/web/MenuSection.tsx
var styles = `
.pm{border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-top:24px;display:grid;gap:16px}.pm *{box-sizing:border-box}.pm header,.pm .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pm header h2{flex:1;font-size:1.2rem;font-weight:600}.pm button{min-height:44px;padding:8px 12px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:6px;background:transparent;color:inherit;cursor:pointer}.pm button:disabled{opacity:.45;cursor:default}.pm button[aria-pressed=true]{background:color-mix(in srgb,currentColor 14%,transparent)}.pm label{display:grid;gap:4px;font-size:.875rem;flex:1;min-width:130px}.pm input,.pm textarea{width:100%;min-height:44px;padding:8px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:4px;background:transparent;color:inherit}.pm form,.pm fieldset{display:grid;gap:12px;min-width:0}.pm fieldset{border:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:12px;border-radius:6px}.pm legend{padding:0 6px}.pm .item{padding:12px 0;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}.pm .item-title{display:flex;justify-content:space-between;gap:16px;font-weight:500}.pm small,.pm .muted{opacity:.7}.pm [role=alert]{color:#c65b45}.pm a{text-decoration:underline}.pm h3{font-weight:600;margin:16px 0 8px}.pm .item p{white-space:pre-wrap}.pm .row.variant{align-items:flex-end}.pm .item-image{display:block;width:180px;max-width:100%;height:130px;object-fit:cover;border-radius:6px;margin:8px 0}.pm input[type=file]{min-width:0}.pm .actions{display:flex;gap:8px;flex-wrap:wrap}
`;
async function call(operation, input) {
  const response = await fetch(`/api/m/places.menus/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not save menu");
  return data;
}
function menuInput(menu) {
  const { id, placeId, revision, updatedAt, ...input } = menu;
  return input;
}
function move(items, index, delta) {
  const next = [...items];
  const to = index + delta;
  if (to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
function Order({
  index,
  length,
  change
}) {
  return /* @__PURE__ */ jsxs(Fragment2, { children: [
    /* @__PURE__ */ jsx("button", { type: "button", "aria-label": "Move up", disabled: index === 0, onClick: () => change(-1), children: "\u2191" }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        "aria-label": "Move down",
        disabled: index === length - 1,
        onClick: () => change(1),
        children: "\u2193"
      }
    )
  ] });
}
function Field({
  label,
  value,
  change,
  required = false
}) {
  return /* @__PURE__ */ jsxs("label", { children: [
    label,
    /* @__PURE__ */ jsx(
      "input",
      {
        required,
        value: value ?? "",
        onChange: (event) => change(event.target.value)
      }
    )
  ] });
}
function imageUrl(placeId, imageId) {
  return `/api/m/places.menus/images/${placeId}/${imageId}`;
}
function ItemImage({
  placeId,
  item,
  change,
  setBusy
}) {
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  async function upload(file) {
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG or WebP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is too large (max 5 MB)");
      return;
    }
    setUploading(true);
    setBusy(true);
    try {
      const response = await fetch(`/api/m/places.menus/images/${placeId}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not upload image");
      change(data.imageId);
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : "Could not upload image");
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("label", { children: [
      item.imageId ? "Replace item image" : "Item image",
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          onChange: (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx("small", { children: "JPEG, PNG or WebP, up to 5 MB. Save the menu to keep your changes." }),
    uploading && /* @__PURE__ */ jsx("p", { role: "status", children: "Uploading image\u2026" }),
    error && /* @__PURE__ */ jsx("p", { role: "alert", children: error }),
    item.imageId && /* @__PURE__ */ jsxs(Fragment2, { children: [
      /* @__PURE__ */ jsx(
        "img",
        {
          className: "item-image",
          src: imageUrl(placeId, item.imageId),
          alt: item.name || "Item image preview"
        }
      ),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => change(void 0), children: "Remove image" })
    ] })
  ] });
}
var optional = (value) => value || void 0;
function MenuSection({ placeId, category, isOwner }) {
  const [menus, setMenus] = useState(null);
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    let current = true;
    setMenus(null);
    setDraft(null);
    setError(null);
    setActive(null);
    call("get_menus", { placeId }).then((value) => {
      if (current) setMenus(value);
    }).catch((error2) => {
      if (current) setError(error2.message);
    });
    return () => {
      current = false;
    };
  }, [placeId]);
  async function mutate(operation, input) {
    const fingerprint = JSON.stringify({ operation, input });
    const requestId = pending?.fingerprint === fingerprint ? pending.requestId : crypto.randomUUID();
    setPending({ fingerprint, requestId });
    setBusy(true);
    setError(null);
    try {
      const result = await call(operation, { ...input, requestId });
      const next = await call("get_menus", { placeId });
      setMenus(next);
      setActive(result.id ?? null);
      setDraft(null);
      setConfirmDelete(false);
      setPending(null);
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  const selected = menus?.find((menu) => menu.id === active) ?? menus?.[0];
  if (menus?.length === 0 && !["restaurant", "cafe", "bar"].includes(category)) return null;
  function create() {
    setDraft({
      id: crypto.randomUUID(),
      placeId,
      name: "",
      revision: 0,
      updatedAt: "",
      sortOrder: menus?.length ?? 0,
      sections: []
    });
    setError(null);
  }
  function updateSection(index, section) {
    if (draft)
      setDraft({
        ...draft,
        sections: draft.sections.map((old, i) => i === index ? section : old)
      });
  }
  function save(menu) {
    return mutate("save_menu", {
      placeId,
      ...menu.revision ? { menuId: menu.id, expectedRevision: menu.revision } : {},
      menu: menuInput(menu)
    });
  }
  return /* @__PURE__ */ jsxs("section", { className: "pm", "aria-label": "Menus", children: [
    /* @__PURE__ */ jsx("style", { children: styles }),
    /* @__PURE__ */ jsxs("header", { children: [
      /* @__PURE__ */ jsx("h2", { children: "Menus" }),
      isOwner && !draft && /* @__PURE__ */ jsx("button", { onClick: create, disabled: busy, children: "+ Add menu" })
    ] }),
    error && /* @__PURE__ */ jsxs("p", { role: "alert", children: [
      error,
      " ",
      /* @__PURE__ */ jsx(
        "button",
        {
          disabled: busy,
          onClick: () => {
            void call("get_menus", { placeId }).then((value) => {
              setMenus(value);
              setDraft(null);
              setError(null);
            }).catch((e) => setError(e.message));
          },
          children: "Reload menus"
        }
      )
    ] }),
    !menus && !error && /* @__PURE__ */ jsx("p", { role: "status", children: "Loading menus\u2026" }),
    menus?.length === 0 && !draft && /* @__PURE__ */ jsx("p", { className: "muted", children: "No menu yet. Add one manually or ask your connected AI assistant to import one through MCP." }),
    !draft && /* @__PURE__ */ jsxs(Fragment2, { children: [
      /* @__PURE__ */ jsx("div", { className: "row", "aria-label": "Choose menu", children: menus?.map((menu) => /* @__PURE__ */ jsx(
        "button",
        {
          "aria-pressed": selected?.id === menu.id,
          onClick: () => {
            setActive(menu.id);
            setConfirmDelete(false);
          },
          children: menu.name
        },
        menu.id
      )) }),
      selected && /* @__PURE__ */ jsxs(Fragment2, { children: [
        selected.notes && /* @__PURE__ */ jsx("p", { children: selected.notes }),
        selected.sections.map((section) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { children: section.name }),
          section.notes && /* @__PURE__ */ jsx("p", { children: section.notes }),
          section.items.map((item) => /* @__PURE__ */ jsxs("div", { className: "item", children: [
            /* @__PURE__ */ jsxs("div", { className: "item-title", children: [
              /* @__PURE__ */ jsx("span", { children: item.name }),
              /* @__PURE__ */ jsx("span", { children: item.price ? `${item.price} ${selected.currency ?? ""}` : "" })
            ] }),
            item.imageId && /* @__PURE__ */ jsx(
              "img",
              {
                className: "item-image",
                src: imageUrl(placeId, item.imageId),
                alt: item.name,
                loading: "lazy"
              }
            ),
            item.description && /* @__PURE__ */ jsx("p", { children: item.description }),
            item.variants.map((variant, i) => /* @__PURE__ */ jsxs("p", { children: [
              variant.name,
              ": ",
              variant.price,
              " ",
              selected.currency
            ] }, i)),
            item.dietaryLabels.length > 0 && /* @__PURE__ */ jsx("small", { children: item.dietaryLabels.join(" \xB7 ") }),
            item.notes && /* @__PURE__ */ jsx("p", { children: /* @__PURE__ */ jsx("small", { children: item.notes }) })
          ] }, item.id))
        ] }, section.id)),
        /* @__PURE__ */ jsxs("small", { children: [
          "Updated ",
          new Date(selected.updatedAt).toLocaleDateString(),
          selected.sourceUrl && /* @__PURE__ */ jsxs(Fragment2, { children: [
            " ",
            "\xB7",
            " ",
            /* @__PURE__ */ jsx("a", { href: selected.sourceUrl, target: "_blank", rel: "noopener noreferrer", children: "View source" })
          ] })
        ] }),
        isOwner && /* @__PURE__ */ jsxs("div", { className: "actions", children: [
          /* @__PURE__ */ jsx("button", { disabled: busy, onClick: () => setDraft(structuredClone(selected)), children: "Edit menu" }),
          /* @__PURE__ */ jsx(
            Order,
            {
              index: menus.indexOf(selected),
              length: menus.length,
              change: (delta) => {
                const index = menus.indexOf(selected) + delta;
                void save({ ...selected, sortOrder: index });
              }
            }
          ),
          /* @__PURE__ */ jsx("button", { disabled: busy, onClick: () => setConfirmDelete(true), children: "Delete menu" }),
          confirmDelete && /* @__PURE__ */ jsxs(Fragment2, { children: [
            /* @__PURE__ */ jsxs("span", { children: [
              "Delete ",
              selected.name,
              "?"
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                disabled: busy,
                onClick: () => void mutate("delete_menu", {
                  placeId,
                  menuId: selected.id,
                  expectedRevision: selected.revision
                }),
                children: "Confirm delete"
              }
            ),
            /* @__PURE__ */ jsx("button", { onClick: () => setConfirmDelete(false), children: "Keep menu" })
          ] })
        ] })
      ] })
    ] }),
    draft && /* @__PURE__ */ jsx(
      "form",
      {
        onSubmit: (event) => {
          event.preventDefault();
          void save(draft);
        },
        children: /* @__PURE__ */ jsxs("fieldset", { disabled: busy, children: [
          /* @__PURE__ */ jsx("legend", { children: draft.revision ? "Edit menu" : "New menu" }),
          /* @__PURE__ */ jsxs("div", { className: "row", children: [
            /* @__PURE__ */ jsx(
              Field,
              {
                label: "Menu name",
                required: true,
                value: draft.name,
                change: (name) => setDraft({ ...draft, name })
              }
            ),
            /* @__PURE__ */ jsx(
              Field,
              {
                label: "Currency (e.g. EUR)",
                value: draft.currency,
                change: (currency) => setDraft({ ...draft, currency: optional(currency.toUpperCase()) })
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            Field,
            {
              label: "Source URL",
              value: draft.sourceUrl,
              change: (sourceUrl) => setDraft({ ...draft, sourceUrl: optional(sourceUrl) })
            }
          ),
          /* @__PURE__ */ jsx(
            Field,
            {
              label: "Menu notes",
              value: draft.notes,
              change: (notes) => setDraft({ ...draft, notes: optional(notes) })
            }
          ),
          draft.sections.map((section, sectionIndex) => /* @__PURE__ */ jsxs("fieldset", { children: [
            /* @__PURE__ */ jsxs("legend", { children: [
              "Section ",
              sectionIndex + 1
            ] }),
            /* @__PURE__ */ jsx(
              Field,
              {
                label: "Section name",
                required: true,
                value: section.name,
                change: (name) => updateSection(sectionIndex, { ...section, name })
              }
            ),
            /* @__PURE__ */ jsx(
              Field,
              {
                label: "Section notes",
                value: section.notes,
                change: (notes) => updateSection(sectionIndex, { ...section, notes: optional(notes) })
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "actions", children: [
              /* @__PURE__ */ jsx(
                Order,
                {
                  index: sectionIndex,
                  length: draft.sections.length,
                  change: (delta) => setDraft({ ...draft, sections: move(draft.sections, sectionIndex, delta) })
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => setDraft({
                    ...draft,
                    sections: draft.sections.filter((_, i) => i !== sectionIndex)
                  }),
                  children: "Remove section"
                }
              )
            ] }),
            section.items.map((item, itemIndex) => {
              const change = (patch) => updateSection(sectionIndex, {
                ...section,
                items: section.items.map(
                  (old, i) => i === itemIndex ? { ...old, ...patch } : old
                )
              });
              return /* @__PURE__ */ jsxs("fieldset", { children: [
                /* @__PURE__ */ jsxs("legend", { children: [
                  "Item ",
                  itemIndex + 1
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "row", children: [
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Item name",
                      required: true,
                      value: item.name,
                      change: (name) => change({ name })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Price",
                      value: item.price,
                      change: (price) => change({ price: optional(price) })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx(
                  ItemImage,
                  {
                    placeId,
                    item,
                    setBusy,
                    change: (imageId) => setDraft(
                      (current) => current && {
                        ...current,
                        sections: current.sections.map(
                          (entry) => entry.id !== section.id ? entry : {
                            ...entry,
                            items: entry.items.map(
                              (old) => old.id !== item.id ? old : { ...old, imageId }
                            )
                          }
                        )
                      }
                    )
                  }
                ),
                /* @__PURE__ */ jsx(
                  Field,
                  {
                    label: "Description",
                    value: item.description,
                    change: (description) => change({ description: optional(description) })
                  }
                ),
                /* @__PURE__ */ jsx(
                  Field,
                  {
                    label: "Item notes",
                    value: item.notes,
                    change: (notes) => change({ notes: optional(notes) })
                  }
                ),
                /* @__PURE__ */ jsx(
                  Field,
                  {
                    label: "Dietary labels (comma separated, only if stated)",
                    value: item.dietaryLabels.join(", "),
                    change: (value) => change({
                      dietaryLabels: value ? value.split(",").map((v) => v.trim()) : []
                    })
                  }
                ),
                item.variants.map((variant, vi) => /* @__PURE__ */ jsxs("div", { className: "row variant", children: [
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Variant name",
                      required: true,
                      value: variant.name,
                      change: (name) => change({
                        variants: item.variants.map(
                          (v, i) => i === vi ? { ...v, name } : v
                        )
                      })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Variant price",
                      required: true,
                      value: variant.price,
                      change: (price) => change({
                        variants: item.variants.map(
                          (v, i) => i === vi ? { ...v, price } : v
                        )
                      })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => change({ variants: item.variants.filter((_, i) => i !== vi) }),
                      children: "Remove variant"
                    }
                  )
                ] }, vi)),
                /* @__PURE__ */ jsxs("div", { className: "actions", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => change({ variants: [...item.variants, { name: "", price: "" }] }),
                      children: "Add variant"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Order,
                    {
                      index: itemIndex,
                      length: section.items.length,
                      change: (delta) => updateSection(sectionIndex, {
                        ...section,
                        items: move(section.items, itemIndex, delta)
                      })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => updateSection(sectionIndex, {
                        ...section,
                        items: section.items.filter((_, i) => i !== itemIndex)
                      }),
                      children: "Remove item"
                    }
                  )
                ] })
              ] }, item.id);
            }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => updateSection(sectionIndex, {
                  ...section,
                  items: [
                    ...section.items,
                    { id: crypto.randomUUID(), name: "", variants: [], dietaryLabels: [] }
                  ]
                }),
                children: "Add item"
              }
            )
          ] }, section.id)),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setDraft({
                ...draft,
                sections: [...draft.sections, { id: crypto.randomUUID(), name: "", items: [] }]
              }),
              children: "Add section"
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "actions", children: [
            /* @__PURE__ */ jsx("button", { type: "submit", children: busy ? "Saving\u2026" : "Save menu" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  setDraft(null);
                  setError(null);
                },
                children: "Cancel"
              }
            )
          ] })
        ] })
      }
    )
  ] });
}
export {
  MenuSection
};
