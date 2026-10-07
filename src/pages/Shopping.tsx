import { useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Tabs,
  FormGroup,
  FormGrid,
  SearchableSelect,
} from "@/components/ui";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import {
  useShoppingData,
  useShoppingList,
  useAddShoppingItem,
  useToggleShoppingItem,
  useDeleteShoppingItem,
} from "@/hooks/useFinance";

const SHOP_CATEGORIES = ["Groceries", "Personal Care", "Household", "Beverages", "Snacks"];

export function Shopping() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tracker");

  const { data: shoppingData } = useShoppingData();
  const products = shoppingData?.products ?? [];
  const priceRecords = shoppingData?.priceRecords ?? [];

  const [trackerForm, setTrackerForm] = useState({
    category: "Groceries",
    productName: "",
    brand: "",
    store: "",
    price: "",
    realPrice: "",   // tag / shelf price
    qty: "1",
    unit: "pc",
  });

  // Type-or-pick option lists built from what's already been recorded.
  const brandOptions = useMemo(
    () => Array.from(new Set(priceRecords.map((r) => r.brand).filter(Boolean))) as string[],
    [priceRecords],
  );
  const storeOptions = useMemo(
    () => Array.from(new Set(priceRecords.map((r) => r.store).filter(Boolean))) as string[],
    [priceRecords],
  );
  const productNamesInCategory = useMemo(
    () => products.filter((p) => p.category === trackerForm.category).map((p) => p.name),
    [products, trackerForm.category],
  );
  const unitOptions = useMemo(() => {
    const common = ["pc", "pack", "g", "kg", "ml", "L", "dozen", "bunch"];
    const used = priceRecords.map((r) => r.unit).filter(Boolean) as string[];
    return Array.from(new Set([...common, ...used]));
  }, [priceRecords]);

  const [listBuilder, setListBuilder] = useState({
    category: "Groceries",
    productName: "",
    qty: 1,
    unit: "pc",
  });
  const { data: listData } = useShoppingList();
  const listItems = listData?.items ?? [];
  const addListItem = useAddShoppingItem();
  const toggleListItem = useToggleShoppingItem();
  const deleteListItem = useDeleteShoppingItem();

  async function handleAddListItem() {
    if (!listData?.listId) return;
    if (!listBuilder.productName.trim()) return toast.error("Enter a product");
    try {
      await addListItem.mutateAsync({
        listId: listData.listId,
        name: listBuilder.productName,
        category: listBuilder.category,
        quantity: listBuilder.qty,
        unit: listBuilder.unit,
      });
      setListBuilder((p) => ({ ...p, productName: "", qty: 1 }));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const [historyCategory, setHistoryCategory] = useState("All");
  const [historyProductId, setHistoryProductId] = useState("");

  const productById = useMemo(() => {
    const m: Record<string, { name: string; category: string }> = {};
    products.forEach((p) => (m[p.id] = { name: p.name, category: p.category }));
    return m;
  }, [products]);

  // Everything recorded in the tracker, filtered by the chosen category/product.
  const filteredHistory = useMemo(
    () =>
      priceRecords
        .filter((r) => {
          const prod = productById[r.product_id];
          const catOk = historyCategory === "All" || prod?.category === historyCategory;
          const prodOk = !historyProductId || r.product_id === historyProductId;
          return catOk && prodOk;
        })
        .sort(
          (a, b) =>
            new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime(),
        ),
    [priceRecords, productById, historyCategory, historyProductId],
  );

  const categories = SHOP_CATEGORIES;

  // Cumulative savings across all records that have real_price
  const cumulativeSavings = useMemo(() => {
    return priceRecords.reduce((sum, r) => {
      if (r.real_price && r.real_price > r.price) {
        return sum + (r.real_price - r.price) * (r.quantity ?? 1);
      }
      return sum;
    }, 0);
  }, [priceRecords]);

  // Find an existing product by name within a category, or create a new one.
  async function resolveProductId(name: string, category: string, unit: string) {
    const existing = products.find(
      (p) => p.category === category && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("products")
      .insert({ user_id: user!.id, name: name.trim(), category, unit, is_system: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  async function handleSavePrice() {
    if (!user || !trackerForm.productName.trim() || !trackerForm.price) {
      return toast.error("Please enter a product and a price");
    }

    const paid = Number(trackerForm.price);
    const real = trackerForm.realPrice ? Number(trackerForm.realPrice) : null;

    if (real !== null && real < paid) {
      return toast.error("Real/tag price should be ≥ price paid");
    }

    let productId: string;
    try {
      productId = await resolveProductId(
        trackerForm.productName,
        trackerForm.category,
        trackerForm.unit,
      );
    } catch (e: any) {
      return toast.error(e.message);
    }

    const { error } = await supabase.from("price_records").insert({
      user_id: user.id,
      product_id: productId,
      brand: trackerForm.brand || null,
      store: trackerForm.store || "",
      price: paid,
      real_price: real,
      quantity: Number(trackerForm.qty),
      unit: trackerForm.unit,
      purchased_at: new Date().toISOString(),
    });

    if (error) {
      toast.error(error.message);
    } else {
      const saved = real && real > paid ? real - paid : 0;
      toast.success(
        saved > 0
          ? `✅ Saved! You saved KSh ${(saved * Number(trackerForm.qty)).toLocaleString()}`
          : "✅ Price record saved",
      );
      // Clear the item-specific fields; keep the category you're working in.
      setTrackerForm((prev) => ({
        ...prev,
        productName: "",
        brand: "",
        store: "",
        price: "",
        realPrice: "",
        qty: "1",
      }));
      queryClient.invalidateQueries({ queryKey: ["shopping_data"] });
    }
  }


  const chartData = useMemo(() => {
    const records = priceRecords
      .filter((r) => r.product_id === historyProductId)
      .sort((a, b) => new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime());

    const stores = Array.from(new Set(records.map((r) => r.store)));
    const labels = Array.from(
      new Set(
        records.map((r) =>
          new Date(r.purchased_at).toLocaleDateString(undefined, {
            month: "short", day: "numeric",
          }),
        ),
      ),
    );

    return {
      labels,
      datasets: stores.map((store, i) => ({
        label: store,
        data: labels.map(
          (l) =>
            records.find(
              (r) =>
                r.store === store &&
                new Date(r.purchased_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric",
                }) === l,
            )?.price || null,
        ),
        borderColor: i === 0 ? "#1d7ef4" : i === 1 ? "#0db187" : "#f59e0b",
        tension: 0.3,
        spanGaps: true,
      })),
    };
  }, [priceRecords, historyProductId]);

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Shopping & Prices</h1>
        <button className="btn-primary" onClick={() => window.print()}>
          Export PDF
        </button>
      </div>

      {/* Cumulative savings banner */}
      {cumulativeSavings > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 20px",
            background: "rgba(16,185,129,.08)",
            border: "1px solid rgba(16,185,129,.2)",
            borderRadius: 14,
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 22 }}>🏷️</span>
          <div>
            <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>
              Cumulative savings vs tag price
            </div>
            <div style={{ fontFamily: "DM Mono", fontSize: 22, color: "var(--green2)" }}>
              KSh {cumulativeSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text3)" }}>
            across {priceRecords.filter((r) => r.real_price && r.real_price > r.price).length} discounted records
          </div>
        </div>
      )}

      <Tabs
        tabs={[
          { id: "tracker", label: "📦 Price Tracker" },
          { id: "list",    label: "📋 Shopping List" },
          { id: "history", label: "📈 Price History"  },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── PRICE TRACKER ─────────────────────────────────────────────────── */}
      {activeTab === "tracker" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardHeader>
              <CardTitle>Price Tracker</CardTitle>
            </CardHeader>
            <CardBody>
              <FormGrid className="keep-2col">
                <FormGroup label="Category">
                  <select
                    className="form-select"
                    value={trackerForm.category}
                    onChange={(e) =>
                      setTrackerForm({ ...trackerForm, category: e.target.value, productName: "" })
                    }
                  >
                    {categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </FormGroup>

                <FormGroup label="Product">
                  <SearchableSelect
                    value={trackerForm.productName}
                    onChange={(v) => setTrackerForm({ ...trackerForm, productName: v })}
                    options={productNamesInCategory.map((n) => ({ value: n, label: n }))}
                    placeholder="Search or add a product…"
                    allowCustom
                  />
                </FormGroup>

                <FormGroup label="Brand">
                  <SearchableSelect
                    value={trackerForm.brand}
                    onChange={(v) => setTrackerForm({ ...trackerForm, brand: v })}
                    options={brandOptions.map((b) => ({ value: b, label: b }))}
                    placeholder="Search or add a brand…"
                    allowCustom
                  />
                </FormGroup>

                <FormGroup label="Store">
                  <SearchableSelect
                    value={trackerForm.store}
                    onChange={(v) => setTrackerForm({ ...trackerForm, store: v })}
                    options={storeOptions.map((s) => ({ value: s, label: s }))}
                    placeholder="Search or add a store…"
                    allowCustom
                  />
                </FormGroup>

                <FormGroup label="Price Paid (KSh)">
                  <input
                    className="form-input"
                    type="number"
                    value={trackerForm.price}
                    onChange={(e) => setTrackerForm({ ...trackerForm, price: e.target.value })}
                    placeholder="What you actually paid"
                  />
                </FormGroup>

                <FormGroup label="Tag / Real Price (KSh) — optional">
                  <input
                    className="form-input"
                    type="number"
                    value={trackerForm.realPrice}
                    onChange={(e) => setTrackerForm({ ...trackerForm, realPrice: e.target.value })}
                    placeholder="Shelf price before discount"
                  />
                </FormGroup>

                <FormGroup label="Qty">
                  <input
                    className="form-input"
                    type="number"
                    value={trackerForm.qty}
                    onChange={(e) => setTrackerForm({ ...trackerForm, qty: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Unit">
                  <SearchableSelect
                    value={trackerForm.unit}
                    onChange={(v) => setTrackerForm({ ...trackerForm, unit: v })}
                    options={unitOptions.map((u) => ({ value: u, label: u }))}
                    placeholder="pc, kg, L, g…"
                    allowCustom
                  />
                </FormGroup>
              </FormGrid>

              {/* Inline savings preview */}
              {trackerForm.realPrice && trackerForm.price &&
                Number(trackerForm.realPrice) > Number(trackerForm.price) && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "rgba(16,185,129,.08)",
                    border: "1px solid rgba(16,185,129,.2)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "var(--green2)",
                  }}
                >
                  🏷️ Saving KSh{" "}
                  {(
                    (Number(trackerForm.realPrice) - Number(trackerForm.price)) *
                    Number(trackerForm.qty || 1)
                  ).toLocaleString()}{" "}
                  on this purchase
                </div>
              )}

              <button
                className="btn-primary btn"
                style={{ marginTop: 20, width: "100%", justifyContent: "center" }}
                onClick={handleSavePrice}
              >
                Save Price Record
              </button>
            </CardBody>
          </Card>

          {/* Recent records */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Records</CardTitle>
            </CardHeader>
            <CardBody>
              {priceRecords.slice(0, 8).map((r) => {
                const saving =
                  r.real_price && r.real_price > r.price
                    ? (r.real_price - r.price) * (r.quantity ?? 1)
                    : 0;
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>
                        {r.products?.name}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 6 }}>
                        ({r.store})
                      </span>
                      {saving > 0 && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "var(--green2)",
                            fontWeight: 600,
                          }}
                        >
                          saved KSh {saving.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "DM Mono", fontSize: 13, color: "var(--green2)" }}>
                        KSh {Number(r.price).toLocaleString()}
                      </div>
                      {r.real_price && r.real_price > r.price && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text3)",
                            textDecoration: "line-through",
                          }}
                        >
                          KSh {Number(r.real_price).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {priceRecords.length === 0 && (
                <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 20 }}>
                  No price records yet.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── SHOPPING LIST ──────────────────────────────────────────────────── */}
      {activeTab === "list" && (
        <Card>
          <CardHeader>
            <CardTitle>Shopping List</CardTitle>
          </CardHeader>
          <CardBody>
            <FormGrid className="keep-2col">
              <FormGroup label="Category">
                <select
                  className="form-select"
                  value={listBuilder.category}
                  onChange={(e) =>
                    setListBuilder({ ...listBuilder, category: e.target.value, productName: "" })
                  }
                >
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Product">
                <SearchableSelect
                  value={listBuilder.productName}
                  onChange={(v) => setListBuilder({ ...listBuilder, productName: v })}
                  options={products
                    .filter((p) => p.category === listBuilder.category)
                    .map((p) => ({ value: p.name, label: p.name }))}
                  placeholder="Search or add a product…"
                  allowCustom
                />
              </FormGroup>
              <FormGroup label="Quantity">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={listBuilder.qty}
                  onChange={(e) => setListBuilder({ ...listBuilder, qty: Number(e.target.value) })}
                />
              </FormGroup>
              <FormGroup label="Unit">
                <SearchableSelect
                  value={listBuilder.unit}
                  onChange={(v) => setListBuilder({ ...listBuilder, unit: v })}
                  options={unitOptions.map((u) => ({ value: u, label: u }))}
                  placeholder="pc, kg, L…"
                  allowCustom
                />
              </FormGroup>
            </FormGrid>

            <button
              className="btn-ghost btn"
              style={{ marginTop: 16, marginBottom: 16, width: "100%", justifyContent: "center" }}
              onClick={handleAddListItem}
              disabled={addListItem.isPending}
            >
              + Add to list
            </button>

            {listItems.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", padding: 12 }}>
                Your list is empty. Add items above, then tick them off as you shop.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {listItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--surface2)",
                      borderRadius: 10,
                      fontSize: 13,
                      opacity: item.is_completed ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.is_completed}
                      onChange={(e) =>
                        toggleListItem.mutate({ id: item.id, completed: e.target.checked })
                      }
                      style={{ width: 18, height: 18, cursor: "pointer", flex: "0 0 auto" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, textDecoration: item.is_completed ? "line-through" : "none" }}>
                        {item.name}
                        <span style={{ color: "var(--text3)", fontWeight: 400 }}>
                          {" "}· {item.quantity} {item.unit ?? ""}
                        </span>
                      </div>
                      {item.is_completed && item.completed_at && (
                        <div style={{ fontSize: 11, color: "var(--green2)", marginTop: 2 }}>
                          Bought {new Date(item.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          {" "}at {new Date(item.completed_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                    <button
                      style={{ color: "var(--text3)", cursor: "pointer", background: "none", border: "none" }}
                      onClick={() => deleteListItem.mutate(item.id)}
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── PRICE HISTORY ──────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 12 }}>
              <CardTitle>Price History</CardTitle>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="form-select"
                  style={{ fontSize: 12, width: 140 }}
                  value={historyCategory}
                  onChange={(e) => { setHistoryCategory(e.target.value); setHistoryProductId(""); }}
                >
                  <option value="All">All categories</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select
                  className="form-select"
                  style={{ fontSize: 12, width: 180 }}
                  value={historyProductId}
                  onChange={(e) => setHistoryProductId(e.target.value)}
                >
                  <option value="">All products</option>
                  {products
                    .filter((p) => historyCategory === "All" || p.category === historyCategory)
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {/* A specific product → price trend chart; otherwise → a table of everything recorded */}
            {historyProductId && filteredHistory.length > 0 ? (
              <div style={{ height: 300 }}>
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: "#71717a" } } },
                    scales: {
                      x: { grid: { color: "rgba(148,163,184,.4)" }, ticks: { color: "#71717a" } },
                      y: {
                        grid: { color: "rgba(148,163,184,.4)" },
                        ticks: { color: "#71717a", callback: (v: any) => "KSh " + v },
                      },
                    },
                  }}
                />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text3)", fontSize: 13, padding: 24 }}>
                Nothing recorded yet. Add prices in the Price Tracker and they'll show here.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "auto", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: "var(--text3)", textTransform: "uppercase", fontSize: 11, borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Product", "Brand", "Store", "Qty", "Paid", "Saved"].map((h) => (
                        <th key={h} style={{ textAlign: ["Qty", "Paid", "Saved"].includes(h) ? "right" : "left", padding: "9px 10px", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((r) => {
                      const saved = r.real_price && r.real_price > r.price ? (r.real_price - r.price) * (r.quantity ?? 1) : 0;
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{new Date(r.purchased_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}</td>
                          <td style={{ padding: "9px 10px", fontWeight: 500 }}>{productById[r.product_id]?.name ?? "—"}</td>
                          <td style={{ padding: "9px 10px", color: "var(--text3)" }}>{r.brand ?? "—"}</td>
                          <td style={{ padding: "9px 10px", color: "var(--text3)" }}>{r.store || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "DM Mono" }}>{r.quantity}{r.unit ? ` ${r.unit}` : ""}</td>
                          <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "DM Mono" }}>KSh {Number(r.price).toLocaleString()}</td>
                          <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "DM Mono", color: saved > 0 ? "var(--green2)" : "var(--text3)" }}>{saved > 0 ? `KSh ${saved.toLocaleString()}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
