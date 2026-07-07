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
} from "@/components/ui";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useShoppingData } from "@/hooks/useFinance";

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
    productId: "",
    brand: "Elianto",
    store: "Naivas",
    price: "",
    realPrice: "",   // tag / shelf price
    qty: "1",
    unit: "L",
  });

  const [listBuilder, setListBuilder] = useState({
    category: "Groceries",
    productId: "",
    qty: 1,
  });
  const [shoppingList, setShoppingList] = useState<any[]>([]);

  const [historyCategory, setHistoryCategory] = useState("Groceries");
  const [historyProductId, setHistoryProductId] = useState("");

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

  async function handleSavePrice() {
    if (!user || !trackerForm.productId || !trackerForm.price) {
      return toast.error("Please select a product and enter a price");
    }

    const paid = Number(trackerForm.price);
    const real = trackerForm.realPrice ? Number(trackerForm.realPrice) : null;

    if (real !== null && real < paid) {
      return toast.error("Real/tag price should be ≥ price paid");
    }

    const { error } = await supabase.from("price_records").insert({
      user_id: user.id,
      product_id: trackerForm.productId,
      brand: trackerForm.brand,
      store: trackerForm.store,
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
      setTrackerForm((prev) => ({ ...prev, price: "", realPrice: "" }));
      queryClient.invalidateQueries({ queryKey: ["shopping_data"] });
    }
  }

  function addItemToList() {
    const product = products.find((p) => p.id === listBuilder.productId);
    if (!product) return toast.error("Please select a product");

    const latestPriceRecord = priceRecords.find((r) => r.product_id === product.id);
    const unitPrice = latestPriceRecord ? latestPriceRecord.price : 0;

    setShoppingList([
      ...shoppingList,
      {
        id: Math.random().toString(36).substr(2, 9),
        name: product.name,
        qty: listBuilder.qty,
        unitPrice,
        totalEst: unitPrice * listBuilder.qty,
      },
    ]);
    toast.success(`${product.name} added to list`);
  }

  const estimatedTotal = useMemo(
    () => shoppingList.reduce((sum, item) => sum + item.totalEst, 0),
    [shoppingList],
  );

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
        borderColor: i === 0 ? "#3b82f6" : i === 1 ? "#10b981" : "#f59e0b",
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
                      setTrackerForm({ ...trackerForm, category: e.target.value, productId: "" })
                    }
                  >
                    {categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </FormGroup>

                <FormGroup label="Product">
                  <select
                    className="form-select"
                    value={trackerForm.productId}
                    onChange={(e) =>
                      setTrackerForm({ ...trackerForm, productId: e.target.value })
                    }
                  >
                    <option value="">Choose product…</option>
                    {products
                      .filter((p) => p.category === trackerForm.category)
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </FormGroup>

                <FormGroup label="Brand">
                  <select
                    className="form-select"
                    value={trackerForm.brand}
                    onChange={(e) => setTrackerForm({ ...trackerForm, brand: e.target.value })}
                  >
                    <option>Elianto</option>
                    <option>Golden Fry</option>
                    <option>Fresh Fri</option>
                    <option>Ariel</option>
                  </select>
                </FormGroup>

                <FormGroup label="Store">
                  <select
                    className="form-select"
                    value={trackerForm.store}
                    onChange={(e) => setTrackerForm({ ...trackerForm, store: e.target.value })}
                  >
                    <option>Naivas</option>
                    <option>Carrefour</option>
                    <option>QuickMart</option>
                    <option>Chandarana</option>
                  </select>
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
                  <select
                    className="form-select"
                    value={trackerForm.unit}
                    onChange={(e) => setTrackerForm({ ...trackerForm, unit: e.target.value })}
                  >
                    <option>kg</option>
                    <option>L</option>
                    <option>pc</option>
                    <option>pack</option>
                  </select>
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
            <CardTitle>Shopping List Builder</CardTitle>
          </CardHeader>
          <CardBody>
            <FormGrid className="keep-2col">
              <FormGroup label="Category">
                <select
                  className="form-select"
                  value={listBuilder.category}
                  onChange={(e) =>
                    setListBuilder({ ...listBuilder, category: e.target.value, productId: "" })
                  }
                >
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Product">
                <select
                  className="form-select"
                  value={listBuilder.productId}
                  onChange={(e) => setListBuilder({ ...listBuilder, productId: e.target.value })}
                >
                  <option value="">Select product…</option>
                  {products
                    .filter((p) => p.category === listBuilder.category)
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Quantity">
                <input
                  className="form-input"
                  type="number"
                  value={listBuilder.qty}
                  onChange={(e) => setListBuilder({ ...listBuilder, qty: Number(e.target.value) })}
                />
              </FormGroup>
            </FormGrid>

            <button
              className="btn-ghost btn"
              style={{ marginTop: 16, marginBottom: 16, width: "100%", justifyContent: "center" }}
              onClick={addItemToList}
            >
              + Add to List
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shoppingList.map((item) => (
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
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
                  <span style={{ color: "var(--text3)" }}>× {item.qty}</span>
                  <span style={{ fontFamily: "DM Mono", color: "var(--green2)" }}>
                    KSh {item.totalEst.toLocaleString()}
                  </span>
                  <button
                    style={{ color: "var(--text3)", cursor: "pointer", background: "none", border: "none" }}
                    onClick={() => setShoppingList(shoppingList.filter((i) => i.id !== item.id))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {shoppingList.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Estimated Total
                </span>
                <span style={{ fontFamily: "DM Mono", fontSize: 22, color: "var(--green2)" }}>
                  KSh {estimatedTotal.toLocaleString()}
                </span>
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
                  style={{ fontSize: 12, width: 130 }}
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value)}
                >
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select
                  className="form-select"
                  style={{ fontSize: 12, width: 180 }}
                  value={historyProductId}
                  onChange={(e) => setHistoryProductId(e.target.value)}
                >
                  <option value="">Select product…</option>
                  {products
                    .filter((p) => p.category === historyCategory)
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div style={{ height: 300 }}>
              {priceRecords.filter((r) => r.product_id === historyProductId).length > 0 ? (
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: "#506a8a" } } },
                    scales: {
                      x: { grid: { color: "rgba(30,48,80,.4)" }, ticks: { color: "#506a8a" } },
                      y: {
                        grid: { color: "rgba(30,48,80,.4)" },
                        ticks: { color: "#506a8a", callback: (v: any) => "KSh " + v },
                      },
                    },
                  }}
                />
              ) : (
                <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
                  Select a product category and name to view price trends.
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
