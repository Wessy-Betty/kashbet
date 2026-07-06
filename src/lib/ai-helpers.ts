import { Transaction, BudgetPlan } from "@/types/finance";

export function generateFinancialContext(
  transactions: Transaction[], 
  budget: BudgetPlan[],
  monthName: string
) {
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const topCategories = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      const cat = t.category_name || 'Other';
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
      return acc;
    }, {} as Record<string, number>);

  return `
    Current Month: ${monthName} 2026
    Total Income: KSh ${totalIncome.toLocaleString()}
    Total Expenses: KSh ${totalExpense.toLocaleString()}
    Top Spending: ${Object.entries(topCategories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `${cat}: KSh ${amt.toLocaleString()}`)
      .join(', ')}
    Budget Adherence: ${budget.length > 0 ? 'Budget tracks ' + budget.length + ' categories.' : 'No budget set yet.'}
  `.trim();
}