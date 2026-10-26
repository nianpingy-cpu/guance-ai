export type SignalCategory = 'consumer' | 'competitor' | 'industry';
export type SignalPriority = 'high' | 'medium' | 'low';
export type SignalStatus = 'verified' | 'pending' | 'disputed' | 'duplicate';
export type PlanCode = 'A' | 'B';
export type DecisionStatus = 'approved' | 'pending' | 'hold';

export interface Company {
  id: string;
  name: string;
  brand: string;
  industry: string;
  region: string;
  stage: string;
  product: string;
  productSpec: string;
  goal: string;
  budgetCents: number;
  campaignStart: string;
  campaignEnd: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  name: string;
  platform: string;
  kind: SignalCategory;
  publishedAt: string;
  url?: string;
  note: string;
  simulated: boolean;
  collectedAt?: string;
  taskId?: string;
  contentHash?: string;
  rawContent?: string;
  origin?: 'manual' | 'public-web' | 'rss' | 'official' | 'demo';
}

export interface Signal {
  id: string;
  title: string;
  summary: string;
  quote: string;
  sourceId: string;
  platform: string;
  category: SignalCategory;
  priority: SignalPriority;
  status: SignalStatus;
  relevance: 1 | 2 | 3 | 4 | 5;
  impact: string;
  tags: string[];
  capturedAt: string;
  note: string;
  duplicateOf?: string;
  conflictGroup?: string;
  verifiedAt?: string;
}

export interface InsightTheme {
  id: string;
  rank: number;
  title: string;
  summary: string;
  mentionCount: number;
  direction: string;
  confidence: 'high' | 'medium' | 'low';
  claimType: '观测事实' | '分析推断';
  evidenceSignalIds: string[];
  opportunity: string;
  caveat: string;
}

export interface OpportunityCard {
  id: string;
  title: string;
  fact: string;
  opportunity: string;
  verify: string;
  evidenceSignalIds: string[];
  tone: 'positive' | 'neutral' | 'caution';
}

export interface PlanChannel {
  channel: string;
  budgetCents: number;
  role: string;
}

export interface Plan {
  analysisId?: string;
  id: string;
  code: PlanCode;
  name: string;
  shortName: string;
  positioning: string;
  audience: string;
  platforms: string[];
  formats: string[];
  timing: string;
  coreMessage: string;
  rationale: string;
  constraints: string[];
  uncertainties: string[];
  channels: PlanChannel[];
  evidenceThemeIds: string[];
  updatedAt: string;
}

export interface ApprovalSnapshot {
  id: string;
  planId: string;
  planCode: PlanCode;
  approvedAt: string;
  reason: string;
  plan: Plan;
  companyBudgetCents: number;
  fingerprint: string;
  evidenceSignalIds: string[];
  evidence: Array<{
    id: string;
    priority: SignalPriority;
    status: SignalStatus;
    relevance: number;
    content?: string;
  }>;
  note: string;
}

export interface ReviewChannelActual {
  channel: string;
  actualSpendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
}

export interface Review {
  id: string;
  approvalId: string;
  planId?: string;
  dataKind: 'simulated' | 'manual';
  note: string;
  observations: string;
  possibleReasons: string;
  unconfirmed: string;
  updatedAt: string;
  channels: ReviewChannelActual[];
  suggestions: Array<{
    id: string;
    title: string;
    detail: string;
    linkedSignalIds: string[];
  }>;
}

export interface FeedbackTask {
  id: string;
  title: string;
  detail: string;
  trigger: string;
  createdAt: string;
  status: 'open' | 'done';
  linkedSignalIds: string[];
  source: 'review' | 'manual';
}

export interface DecisionState {
  status: DecisionStatus;
  planId: string | null;
  holdReason?: string;
  updatedAt: string;
}

export interface AppData {
  analyses?: Array<{ id: string; provider: string; model: string; promptVersion: string; evidenceSignalIds: string[]; evidenceDigest: string; createdAt: string; result: { themes: InsightTheme[]; plans: Plan[] } }>;
  mode?: 'demo' | 'real';
  schemaVersion: number;
  company: Company;
  sources: Source[];
  signals: Signal[];
  themes: InsightTheme[];
  opportunities: OpportunityCard[];
  plans: Plan[];
  approvals: ApprovalSnapshot[];
  reviews: Review[];
  feedbackTasks: FeedbackTask[];
  decision: DecisionState;
  activePlanId: string;
}

export interface SignalFilters {
  query: string;
  platform: string;
  category: 'all' | SignalCategory;
  priority: 'all' | SignalPriority;
  status: 'all' | SignalStatus;
  range: 'all' | '7d' | '14d' | '30d';
  date?: string;
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  issues: ImportIssue[];
  importedIds: string[];
}

export interface ReviewMetrics {
  plannedCents: number;
  actualSpendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  ctr: number | null;
  cpcCents: number | null;
  costPerLeadCents: number | null;
  clickToLeadRate: number | null;
}

export interface ChannelMetrics {
  channel: string;
  plannedCents: number;
  actualSpendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  ctr: number | null;
  cpcCents: number | null;
  costPerLeadCents: number | null;
}

export type ApprovalHealth =
  | { state: 'none' }
  | { state: 'valid'; approval: ApprovalSnapshot }
  | { state: 'needs-reconfirm'; approval: ApprovalSnapshot; reasons: string[] }
  | { state: 'hold'; reason: string };
