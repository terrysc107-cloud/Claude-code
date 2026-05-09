// ─── Supabase / Database Types ───────────────────────────────────────────────

export interface NetWorthSnapshot {
  id: string;
  snapshot_date: string;
  gross_assets: number;
  total_debt: number;
  net_worth: number;
  client_id: string;
}

export interface Goal {
  id: string;
  client_id: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  target_date: string;
  layer: string;
  status: string;
}

export interface Property {
  id: string;
  client_id: string;
  address: string;
  monthly_rent: number | null;
  vacancy_status: string;
  current_value: number;
  debt_balance: number;
}

export interface AiInsight {
  id: string;
  client_id: string;
  session_date: string;
  insight_type: string;
  topic: string;
  insight: string;
  tags: string[] | null;
}

export interface IncomeStream {
  id: string;
  client_id: string;
  stream_name: string;
  current_annual: number;
  projected_year3: number;
  projected_year5: number;
}

export interface ContextStoreEntry {
  context_key: string;
  context_value: string;
  client_id: string;
}

// ─── Transaction Types ───────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  date: string;
  merchant_name: string | null;
  name: string;
  amount: number;
  category_primary: string | null;
  payment_channel: string | null;
  pending: boolean;
  account_id: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
  percentage: number;
  momChange: number | null;
}

export interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
  category: string | null;
}

export interface MonthlyPLData {
  income: number;
  spending: number;
  net: number;
  savingsRate: number;
  incomeByCategory: CategorySummary[];
  spendingByCategory: CategorySummary[];
  topMerchants: MerchantSummary[];
}

export interface RecurringItem {
  merchant: string;
  months: string[];
  averageAmount: number;
  annualCost: number;
  category: string | null;
  frequency: number;
}

export interface CashFlowMonth {
  month: string;
  income: number;
  spending: number;
  net: number;
  savingsRate: number;
}

// ─── Dashboard Types ─────────────────────────────────────────────────────────

export interface CommandBarData {
  netWorth: number;
  netWorthTarget: number;
  monthlyCashFlow: number;
  cashFlowTarget: number;
  vacancyBleed: number;
  vacantProperties: Property[];
  nextDeadline: GoalDeadline | null;
}

export interface GoalDeadline {
  name: string;
  daysUntil: number;
  targetDate: string;
}

export interface PropertyWithCashFlow extends Property {
  netCashFlow: number;
}

// ─── API Request/Response Types ───────────────────────────────────────────────

export interface QuarterlyReportRequest {
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  year: number;
}

export interface QuarterlyReportResponse {
  report: string;
  quarter: string;
  year: number;
  generatedAt: string;
}

export interface AskNorthStarRequest {
  question: string;
}

export interface AskNorthStarResponse {
  answer: string;
  sources: string[];
}

export interface RecurringSpendResponse {
  items: RecurringItem[];
  generatedAt: string;
}

// ─── Chart Data Types ─────────────────────────────────────────────────────────

export interface BarChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface AreaChartDataPoint {
  year: string;
  ats: number;
  clarix: number;
  consulting: number;
  realEstate: number;
  w2: number;
  portfolio: number;
  total: number;
}

export interface NetWorthChartPoint {
  date: string;
  netWorth: number;
  grossAssets: number;
  totalDebt: number;
}
