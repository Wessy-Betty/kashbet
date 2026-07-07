import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Modal, FormGroup, FormGrid, SearchableSelect } from "@/components/ui";
import { useAppStore } from "@/store/appStore";
import {
  useAddTransaction,
  useCategories,
  useAccounts,
} from "@/hooks/useFinance";
import { todayISO } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  transaction_date: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["income", "expense", "transfer"]),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  product_name: z.string().optional(),
  classification: z.enum(["need", "want", "investment", "transfer"]),
  payment_method: z.string().min(1),
  account_id: z.string().optional(),
  transaction_cost: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Subcategories keyed by the EXACT category name as stored in the database
// (transaction_categories.name). Keeping these in sync is what makes the
// subcategory dropdown populate — a mismatched key shows an empty list.
const SUBCATS: Record<string, string[]> = {
  "Rent & Housing": ["Rent", "Home Improvements", "Furnishings", "Maintenance/Repair", "Cleaning", "Lawn/Garden", "Moving", "Other"],
  Groceries: ["Fresh Produce", "Meat & Fish", "Dairy & Eggs", "Pantry Staples", "Grains & Legumes", "Spices & Condiments", "Spreads & Sauces", "Beverages", "Bakery & Bread", "Snacks & Sweets", "Other"],
  "Household Shopping": [
    "Cleaning & Laundry",
    "Dishwashing",
    "Air Freshener & Home",
    "Oral Care",
    "Bath & Body",
    "Deodorant & Fragrance",
    "Skincare",
    "Hair Care",
    "Feminine Care",
    "Hand Wash & Sanitizer",
    "Paper & Disposables",
    "Other Household",
  ],
  Utilities: ["Electricity (KPLC)", "Water Bill", "Internet/Wi-Fi", "Airtime", "Gas/LPG", "Waste/Trash", "Other"],
  Transport: ["Matatu/Bus", "Uber/Bolt", "Fuel", "Parking", "Boda Boda", "Flight", "Train", "Other"],
  "Health & Medical": ["Pharmacy", "Hospital/Clinic", "Dental", "Optician", "Gym/Fitness", "Emergency", "Other"],
  Education: ["School Fees", "Books/Stationery", "Online Course", "Training", "Other"],
  "Clothing & Personal": ["Clothes", "Shoes", "Accessories", "Grooming/Salon", "Other"],
  Dining: ["Restaurant", "Fast Food", "Café", "Takeout/Delivery", "Bar/Pub", "Street Food", "Other"],
  Entertainment: ["Cinema", "Events/Concert", "Hobbies", "Games", "Streaming", "Other"],
  Travel: ["Transport", "Accommodation", "Food", "Activities", "Other"],
  Subscriptions: ["Netflix", "Spotify", "Amazon Prime", "YouTube Premium", "Software/Apps", "Gym Membership", "Other"],
  "Debt Payment": ["Loan Repayment", "Credit Card", "Informal Loan", "HELB", "Other"],
  "Loans & Lending": ["Loan Given", "Repayment Received", "Loan Taken", "Repayment Made"],
  "Family Support": ["Mum", "Dad", "Braiso", "Granty", "Kelly", "Shirleen", "Other Family"],
  "Emergency Fund": ["Contribution", "Withdrawal", "Other"],
  Investment: ["MMF Deposit", "Sacco Contribution", "NSE Stocks", "Fixed Deposit", "Withdrawal", "Other"],
  "Salary / Wages": ["Salary", "Bonus", "Overtime", "Commission", "Other"],
  Income: ["Freelance", "Business", "Rental", "Gift Received", "Refund", "Other"],
  Other: ["Miscellaneous"],
};

// Optional product catalog, keyed by subcategory name. Drawn from the user's
// monthly shopping sheet. The Product field suggests these but also accepts
// free-typed entries for anything not listed.
const PRODUCTS: Record<string, string[]> = {
  // ── House Shopping ──
  "Cleaning & Laundry": ["Powder detergent", "Bar soap", "Fabric softener", "Toilet cleaner", "Scouring powder", "Bleach", "Multipurpose cleaner", "Disinfectant"],
  Dishwashing: ["Dish washing liquid", "Dish washing paste", "Steel wool", "Dishwashing scrub"],
  "Air Freshener & Home": ["Air freshener spray", "Air freshener gel", "Mothballs", "Matchbox/lighter"],
  "Oral Care": ["Toothpaste", "Toothbrush", "Mouth wash", "Dental floss"],
  "Bath & Body": ["Bathing soap", "Shower gel", "Body scrub", "Body lotion", "Hand cream", "Vaseline jelly", "Glycerin"],
  "Deodorant & Fragrance": ["Roll on", "Antiperspirant deo spray", "Perfume"],
  Skincare: ["Face wash", "Face cream", "Sunscreen", "Face scrub", "Face mask"],
  "Hair Care": ["Hair treatment", "Hair spray", "Shampoo", "Conditioner"],
  "Feminine Care": ["Sanitary towels", "Panty liners"],
  "Hand Wash & Sanitizer": ["Hand wash", "Hand sanitizer"],
  "Paper & Disposables": ["Tissue", "Facial tissues", "Wipes", "Serviettes", "Cling film", "Foil", "Baking paper", "Shopping bags"],
  // ── Groceries ──
  "Fresh Produce": ["Tomatoes", "Onions", "Kales", "Avocado", "Veges", "Ginger", "Garlic", "Fruit"],
  "Meat & Fish": ["Chicken", "Smokies/sausage", "Beef", "Fish", "Soup bone"],
  "Dairy & Eggs": ["Milk", "Yoghurt", "Eggs", "Cheese", "Butter"],
  "Pantry Staples": ["Cooking oil", "Maize meal", "All purpose flour", "Self rising flour", "Porridge flour", "Sugar", "Salt", "Vinegar", "Bicarbonate soda", "Coconut cream"],
  "Grains & Legumes": ["Rice", "Pasta", "Indomie", "Green grams", "Golden grams", "Beans", "Oats", "Weetabix"],
  "Spices & Condiments": ["Royco cube", "Mchuzi mix", "Chicken masala", "Fish masala", "Chips masala", "Curry powder", "Pilau mix", "Hot chilli", "Food colour", "Dessicated coconut"],
  "Spreads & Sauces": ["Jam", "Peanut butter", "Margarine", "Honey", "Tomato sauce", "Chilli sauce", "Choma sauce", "Soy sauce", "Tomato paste", "Tomato puree"],
  Beverages: ["Flavored tea", "Tea leaves/bags", "Drinking chocolate", "Milo", "Coffee", "Soda/juice"],
  "Bakery & Bread": ["Bread", "Biscuits", "Cake"],
  "Snacks & Sweets": ["Crisps", "Sweets", "Toffee", "Gum", "Small juice/snack"],
};

// Categories that only make sense for income transactions. Used purely to
// reorder the dropdown — nothing is hidden ("show all, just reorder").
const INCOME_CATS = ["Income", "Salary / Wages"];

const SYSTEM_CATS = [
  { id: "housing", name: "Rent & Housing", classification: "need" },
  { id: "groceries", name: "Groceries", classification: "need" },
  { id: "household", name: "Household Shopping", classification: "need" },
  { id: "utilities", name: "Utilities", classification: "need" },
  { id: "transport", name: "Transport", classification: "need" },
  { id: "health", name: "Health & Medical", classification: "need" },
  { id: "education", name: "Education", classification: "need" },
  { id: "clothing", name: "Clothing & Personal", classification: "want" },
  { id: "dining", name: "Dining", classification: "want" },
  { id: "entertainment", name: "Entertainment", classification: "want" },
  { id: "travel", name: "Travel", classification: "want" },
  { id: "subscriptions", name: "Subscriptions", classification: "want" },
  { id: "debt", name: "Debt Payment", classification: "need" },
  { id: "loans", name: "Loans & Lending", classification: "transfer" },
  { id: "family", name: "Family Support", classification: "transfer" },
  { id: "emergency", name: "Emergency Fund", classification: "need" },
  { id: "investment", name: "Investment", classification: "investment" },
  { id: "salary", name: "Salary / Wages", classification: "transfer" },
  { id: "income", name: "Income", classification: "transfer" },
  { id: "other", name: "Other", classification: "need" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  /** When set, the modal edits this transaction instead of creating a new one */
  editTx?: import("@/types/finance").Transaction | null;
}

const LAST_ACCOUNT_KEY = "kashbet-last-account";
const LAST_METHOD_KEY = "kashbet-last-method";

export function AddTransactionModal({ open, onClose, defaultDate, editTx }: Props) {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: dbCategories } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const addTx = useAddTransaction();
  const isEdit = !!editTx;

  const categories = dbCategories?.length ? dbCategories : SYSTEM_CATS;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_date: defaultDate ?? todayISO(),
      type: "expense",
      classification: "need",
      payment_method: "M-Pesa",
    },
  });

  const watchedCat = watch("category_id");
  const watchedType = watch("type");
  const watchedSubcat = watch("subcategory_id");
  const subcats =
    SUBCATS[categories.find((c) => c.id === watchedCat)?.name ?? ""] ?? [];
  const products = PRODUCTS[watchedSubcat ?? ""] ?? [];

  // Reorder (never hide) categories by the selected transaction type:
  //  • Income  → income categories float to the top
  //  • Expense/Transfer → income categories sink to the bottom
  const orderedCategories = [...categories].sort((a, b) => {
    const aIncome = INCOME_CATS.includes(a.name) ? 1 : 0;
    const bIncome = INCOME_CATS.includes(b.name) ? 1 : 0;
    if (aIncome !== bIncome) {
      return watchedType === "income" ? bIncome - aIncome : aIncome - bIncome;
    }
    return 0; // preserve existing (sort_order) sequence otherwise
  });

  const accountLabel = watchedType === "income" ? "Received into" : "Paid from";

  // Prefill: edit mode loads the transaction; add mode applies last-used defaults
  useEffect(() => {
    if (!open) return;
    if (editTx) {
      const catId =
        editTx.category_id ??
        categories.find((c) => c.name === editTx.category_name)?.id ??
        "";
      reset({
        transaction_date: editTx.transaction_date,
        amount: String(Math.abs(editTx.amount)),
        description: editTx.description,
        type: editTx.type,
        category_id: catId,
        subcategory_id: editTx.subcategory_name ?? "",
        product_name: editTx.product_name ?? "",
        classification: editTx.classification ?? "need",
        payment_method: editTx.payment_method ?? "M-Pesa",
        account_id: editTx.account_id ?? "",
        transaction_cost: editTx.transaction_cost ? String(editTx.transaction_cost) : "",
        notes: editTx.notes ?? "",
      });
    } else {
      // Remember-last-used: most entries repeat the same account & method
      const lastAccount = localStorage.getItem(LAST_ACCOUNT_KEY) ?? "";
      const lastMethod = localStorage.getItem(LAST_METHOD_KEY) ?? "M-Pesa";
      if (lastAccount && accounts.some((a) => a.id === lastAccount)) {
        setValue("account_id", lastAccount);
      }
      setValue("payment_method", lastMethod);
      if (defaultDate) setValue("transaction_date", defaultDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTx, defaultDate]);

  async function onSubmit(values: FormValues) {
    if (!user) {
      toast.error("You must be logged in to add transactions");
      return;
    }

    try {
      // Duplicate guard (new entries only): same description + amount within ±3 days
      if (!isEdit) {
        const signedAmount =
          values.type === "expense"
            ? -Math.abs(parseFloat(values.amount))
            : Math.abs(parseFloat(values.amount));
        const d = new Date(values.transaction_date);
        const lo = new Date(d); lo.setDate(d.getDate() - 3);
        const hi = new Date(d); hi.setDate(d.getDate() + 3);
        const { data: dupes } = await supabase
          .from("transactions")
          .select("id")
          .eq("description", values.description)
          .eq("amount", signedAmount)
          .gte("transaction_date", lo.toISOString().split("T")[0])
          .lte("transaction_date", hi.toISOString().split("T")[0])
          .limit(1);
        if (dupes && dupes.length > 0) {
          const proceed = window.confirm(
            `A transaction "${values.description}" with the same amount already exists within 3 days of this date. Save anyway?`
          );
          if (!proceed) return;
        }
      }

      // Edit = delete the old row + insert the replacement. The balance triggers
      // only handle INSERT and DELETE, so this keeps account balances correct
      // without needing a DB migration for UPDATE handling.
      if (isEdit && editTx) {
        const { error: delErr } = await supabase
          .from("transactions")
          .delete()
          .eq("id", editTx.id);
        if (delErr) throw new Error(delErr.message);
      }

      try {
        await addTx.mutateAsync({
          user_id: user.id,
          amount:
            values.type === "expense"
              ? -Math.abs(parseFloat(values.amount))
              : Math.abs(parseFloat(values.amount)),
          description: values.description,
          transaction_date: values.transaction_date,
          type: values.type,
          category_id: values.category_id,
          subcategory_label: values.subcategory_id || undefined,
          product_name: values.product_name || undefined,
          classification: values.classification,
          payment_method: values.payment_method,
          account_id: values.account_id || undefined,
          transaction_cost: values.transaction_cost ? parseFloat(values.transaction_cost) : 0,
          notes: values.notes,
        });
      } catch (insertErr) {
        // Edit deletes the original first — if the replacement insert fails
        // (e.g. insufficient-funds trigger), restore the original so no data is lost.
        if (isEdit && editTx) {
          await supabase.from("transactions").insert({
            user_id: user.id,
            amount: editTx.amount,
            type: editTx.type,
            description: editTx.description,
            transaction_date: editTx.transaction_date,
            classification: editTx.classification ?? null,
            payment_method: editTx.payment_method ?? null,
            category_id: editTx.category_id ?? null,
            account_id: editTx.account_id ?? null,
            subcategory_label: editTx.subcategory_name ?? null,
            product_name: editTx.product_name ?? null,
            transaction_cost: editTx.transaction_cost ?? 0,
            notes: editTx.notes ?? null,
          });
        }
        throw insertErr;
      }

      // Remember choices for next time
      if (values.account_id) localStorage.setItem(LAST_ACCOUNT_KEY, values.account_id);
      if (values.payment_method) localStorage.setItem(LAST_METHOD_KEY, values.payment_method);

      const onTransactionsPage = location.pathname.startsWith("/transactions");
      toast.success(
        (t) => (
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isEdit ? "Transaction updated" : "Transaction saved"}
            {!onTransactionsPage && (
              <button
                onClick={() => { toast.dismiss(t.id); navigate("/transactions"); }}
                style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
              >
                View
              </button>
            )}
          </span>
        ),
        { duration: 4000 }
      );
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save transaction");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Transaction" : "Add Transaction"}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormGrid>
          <FormGroup label="Date">
            <input
              className="form-input"
              type="date"
              {...register("transaction_date")}
            />
          </FormGroup>
          <FormGroup label="Amount (KSh)">
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              {...register("amount")}
            />
          </FormGroup>
        </FormGrid>

        <FormGrid cols={1}>
          <FormGroup label="Description">
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Naivas groceries"
              {...register("description")}
            />
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup label="Transaction Type">
            <select className="form-select" {...register("type")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </FormGroup>
          <FormGroup label="Classification">
            <select className="form-select" {...register("classification")}>
              <option value="need">Need</option>
              <option value="want">Want</option>
              <option value="investment">Investment</option>
              <option value="transfer">Transfer</option>
            </select>
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup label="Category">
            <SearchableSelect
              value={watchedCat ?? ""}
              onChange={(v) => { setValue("category_id", v, { shouldValidate: true }); setValue("subcategory_id", ""); }}
              options={orderedCategories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Search category…"
            />
          </FormGroup>
          <FormGroup label="Subcategory">
            <SearchableSelect
              value={watchedSubcat ?? ""}
              onChange={(v) => { setValue("subcategory_id", v, { shouldValidate: true }); setValue("product_name", ""); }}
              options={subcats.map((s) => ({ value: s, label: s }))}
              placeholder={subcats.length === 0 ? "Select category first" : "Search subcategory…"}
              disabled={subcats.length === 0}
            />
          </FormGroup>
        </FormGrid>

        <FormGrid cols={1}>
          <FormGroup label="Product (optional)">
            <SearchableSelect
              value={watch("product_name") ?? ""}
              onChange={(v) => setValue("product_name", v, { shouldValidate: true })}
              options={products.map((p) => ({ value: p, label: p }))}
              placeholder={watchedSubcat ? "Search or add a product…" : "Choose a subcategory first (or type any product)"}
              allowCustom
            />
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup label={accountLabel}>
            <select className="form-select" {...register("account_id")}>
              <option value="">— Not linked —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.balance != null ? `· KSh ${Number(a.balance).toLocaleString()}` : ""}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Payment Method">
            <select className="form-select" {...register("payment_method")}>
              <option>M-Pesa</option>
              <option>Airtel Money</option>
              <option>Cash</option>
              <option>Equity Card</option>
              <option>KCB Card</option>
              <option>Co-op Card</option>
              <option>NCBA Card</option>
              <option>Stanbic Card</option>
              <option>Bank Transfer</option>
              <option>Other</option>
            </select>
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup label="Transaction Cost / M-Pesa Fee (KSh)">
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              placeholder="0"
              {...register("transaction_cost")}
            />
          </FormGroup>
        </FormGrid>

        <FormGrid cols={1}>
          <FormGroup label="Notes (optional)">
            <input
              className="form-input"
              type="text"
              placeholder="Any additional notes..."
              {...register("notes")}
            />
          </FormGroup>
        </FormGrid>

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            className="btn-primary btn"
            type="submit"
            disabled={addTx.isPending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {addTx.isPending ? "Saving…" : isEdit ? "Save Changes" : "Save Transaction"}
          </button>
          <button className="btn-ghost btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
