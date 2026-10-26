import type {
  ImportIssue,
  ImportResult,
  Signal,
  SignalCategory,
  SignalPriority,
  SignalStatus,
  Source,
} from '@/types/domain';

type RawRow = Record<string, unknown>;

const CATEGORY_MAP: Record<string, SignalCategory> = {
  消费者: 'consumer',
  消费者反馈: 'consumer',
  consumer: 'consumer',
  竞品: 'competitor',
  竞品动态: 'competitor',
  competitor: 'competitor',
  行业: 'industry',
  行业动态: 'industry',
  industry: 'industry',
};

const PRIORITY_MAP: Record<string, SignalPriority> = {
  高: 'high',
  重要: 'high',
  high: 'high',
  中: 'medium',
  medium: 'medium',
  低: 'low',
  low: 'low',
};

const STATUS_MAP: Record<string, SignalStatus> = {
  已核实: 'verified',
  verified: 'verified',
  待核实: 'pending',
  pending: 'pending',
  有争议: 'disputed',
  disputed: 'disputed',
  重复: 'duplicate',
  duplicate: 'duplicate',
};

const HEADER_ALIASES: Record<string, string[]> = {
  title: ['标题', 'title', '情报标题'],
  platform: ['来源平台', '平台', 'platform'],
  category: ['类别', '分类', 'category'],
  priority: ['优先级', '重要性', 'priority'],
  status: ['状态', '处理状态', 'status'],
  publishedAt: ['发布日期', '日期', '发布时间', 'publishedAt', 'date'],
  summary: ['摘要', '简要摘要', 'summary'],
  quote: ['原文引用', '原文', '引用', 'quote'],
  sourceName: ['来源名称', 'sourceName', 'source'],
  sourceId: ['来源ID', 'sourceId'],
  url: ['来源链接', '链接', 'url'],
  relevance: ['相关性', 'relevance'],
  impact: ['影响', '可能影响', 'impact'],
  tags: ['标签', 'tags'],
  note: ['备注', 'note'],
};

function pick(row: RawRow, field: keyof typeof HEADER_ALIASES): string {
  for (const alias of HEADER_ALIASES[field]) {
    if (row[alias] !== undefined && row[alias] !== null) return String(row[alias]).trim();
  }
  return '';
}

/** Small RFC-4180-ish parser for the import template (quoted commas supported). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function rowsFromCsv(text: string): RawRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const headers = table[0].map((header) => header.trim());
  return table.slice(1).map((cells) => {
    const row: RawRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function rowsFromJson(text: string): RawRow[] {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as RawRow[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { signals?: unknown }).signals)) {
    return (parsed as { signals: RawRow[] }).signals;
  }
  throw new Error('JSON 需为数组，或包含 signals 数组的对象');
}


export interface ParseSignalImportArgs {
  content: string;
  filename: string;
  prefix: string;
  existingSignals: Signal[];
  existingSources: Source[];
}

/** Validates imported rows and returns only valid signals plus any generated sources. */
export function parseSignalImport({
  content,
  filename,
  prefix,
  existingSignals,
  existingSources,
}: ParseSignalImportArgs): ImportResult & { signals: Signal[]; sources: Source[] } {
  const issues: ImportIssue[] = [];
  const imported: Signal[] = [];
  const generatedSources: Source[] = [];
  const sources = [...existingSources];
  const seen = new Set(existingSignals.map((signal) => `${signal.title}__${signal.platform}`));

  let rows: RawRow[] = [];
  try {
    rows = filename.toLowerCase().endsWith('.json') ? rowsFromJson(content) : rowsFromCsv(content);
    if (rows.length === 0) throw new Error('没有可导入的数据行');
  } catch (error) {
    return {
      successCount: 0,
      failedCount: 0,
      issues: [{ row: 0, message: error instanceof Error ? error.message : '文件无法解析' }],
      importedIds: [],
      signals: [],
      sources: [],
    };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const title = pick(row, 'title');
    const platform = pick(row, 'platform');
    const category = CATEGORY_MAP[pick(row, 'category')];
    const priority = PRIORITY_MAP[pick(row, 'priority')] ?? 'medium';
    const status = STATUS_MAP[pick(row, 'status')] ?? 'pending';
    const publishedAt = pick(row, 'publishedAt');
    const summary = pick(row, 'summary');
    const quote = pick(row, 'quote') || summary;
    const sourceName = pick(row, 'sourceName') || `导入来源 · ${platform || '未知平台'}`;
    const sourceIdRaw = pick(row, 'sourceId');
    const url = pick(row, 'url');
    const relevanceRaw = pick(row, 'relevance');
    const relevanceNumber = relevanceRaw ? Number(relevanceRaw) : 3;

    if (!title) return issues.push({ row: rowNumber, message: '缺少标题' });
    if (!platform) return issues.push({ row: rowNumber, message: '缺少来源平台' });
    if (!category) return issues.push({ row: rowNumber, message: '类别须为消费者/竞品/行业' });
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      return issues.push({ row: rowNumber, message: '发布日期为空或格式无效（建议 YYYY-MM-DD）' });
    }
    if (!summary) return issues.push({ row: rowNumber, message: '缺少摘要' });
    if (!Number.isFinite(relevanceNumber) || relevanceNumber < 1 || relevanceNumber > 5) {
      return issues.push({ row: rowNumber, message: '相关性须为 1–5' });
    }
    const key = `${title}__${platform}`;
    if (seen.has(key)) return issues.push({ row: rowNumber, message: '文件内存在同标题同平台的重复记录' });

    let source =
      (sourceIdRaw && sources.find((item) => item.id === sourceIdRaw)) ||
      sources.find((item) => item.name === sourceName && item.platform === platform);

    if (!source) {
      source = {
        id: `${prefix}-SRC-${generatedSources.length + 1}`,
        name: sourceName,
        platform,
        kind: category,
        publishedAt,
        url: url || undefined,
        note: `由 ${filename} 导入的演示来源；导入后请人工核对。`,
        simulated: true,
      };
      sources.push(source);
      generatedSources.push(source);
    }

    seen.add(key);
    imported.push({
      id: `${prefix}-SIG-${index + 1}`,
      title,
      summary,
      quote,
      sourceId: source.id,
      platform,
      category,
      priority,
      status,
      relevance: Math.round(relevanceNumber) as Signal['relevance'],
      impact: pick(row, 'impact') || '待人工判断对当前营销任务的影响。',
      tags: pick(row, 'tags')
        .split(/[|；;、]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      capturedAt: new Date(publishedAt).toISOString(),
      note: pick(row, 'note') || '导入记录，尚未人工备注。',
      verifiedAt: status === 'verified' ? new Date().toISOString() : undefined,
    });
  });

  return {
    successCount: imported.length,
    failedCount: issues.length,
    issues,
    importedIds: imported.map((signal) => signal.id),
    signals: imported,
    sources: generatedSources,
  };
}

export const signalCsvTemplate = [
  '标题,来源平台,类别,优先级,状态,发布日期,摘要,原文引用,来源名称,来源链接,相关性,影响,标签',
  '示例：礼盒手提袋缺失被多次提及,小红书,消费者,高,待核实,2026-10-28,多条笔记提到送礼时缺少手提袋影响体面感,“盒子不错，但没有手提袋，送人不太方便。”,小红书伴手礼话题摘录,,5,可能影响礼盒作为礼品的完成度,包装|送礼',
].join('\n');
