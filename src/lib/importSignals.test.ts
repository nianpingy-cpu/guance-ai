import { describe, expect, it } from 'vitest';
import { parseCsv, parseSignalImport } from '@/lib/importSignals';
import { createDemoData } from '@/data/demo';

describe('CSV parser', () => {
  it('supports quoted commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"1,200","say ""hi"""\n');
    expect(rows[1][0]).toBe('1,200');
    expect(rows[1][1]).toBe('say "hi"');
  });
});

describe('signal import validation', () => {
  const demo = createDemoData();

  it('imports valid CSV rows and creates a source when needed', () => {
    const csv = [
      '标题,来源平台,类别,优先级,状态,发布日期,摘要,原文引用,来源名称,相关性',
      '新记录一,小红书,消费者,高,待核实,2026-10-30,消费者提到礼盒手提袋,原话一,新来源A,5',
      '新记录二,抖音,竞品,中,已核实,2026-10-29,竞品上线新套餐,原话二,新来源B,4',
    ].join('\n');
    const result = parseSignalImport({
      content: csv,
      filename: 'signals.csv',
      prefix: 'TEST',
      existingSignals: demo.signals,
      existingSources: demo.sources,
    });
    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.signals[0].platform).toBe('小红书');
    expect(result.signals[1].status).toBe('verified');
    expect(result.sources.length).toBe(2);
    expect(result.signals.every((signal) => signal.sourceId.startsWith('TEST-SRC'))).toBe(true);
  });

  it('reports per-row validation errors and keeps valid rows', () => {
    const csv = [
      '标题,来源平台,类别,发布日期,摘要,相关性',
      '有效行,小红书,消费者,2026-10-30,有效摘要,3',
      '缺类别,小红书,,2026-10-30,摘要,3',
      '坏日期,抖音,竞品,不是日期,摘要,3',
      '缺摘要,抖音,竞品,2026-10-30,,3',
      '坏相关性,抖音,竞品,2026-10-30,摘要,9',
    ].join('\n');
    const result = parseSignalImport({
      content: csv,
      filename: 'signals.csv',
      prefix: 'TEST2',
      existingSignals: demo.signals,
      existingSources: demo.sources,
    });
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(4);
    expect(result.issues.map((issue) => issue.row)).toEqual([2, 3, 4, 5]);
  });

  it('imports JSON arrays and rejects duplicate title/platform pairs in one file', () => {
    const json = JSON.stringify([
      {
        标题: '重复标题',
        来源平台: '小红书',
        类别: '消费者',
        发布日期: '2026-10-30',
        摘要: '摘要',
      },
      {
        标题: '重复标题',
        来源平台: '小红书',
        类别: '消费者',
        发布日期: '2026-10-30',
        摘要: '摘要',
      },
    ]);
    const result = parseSignalImport({
      content: json,
      filename: 'signals.json',
      prefix: 'TEST3',
      existingSignals: demo.signals,
      existingSources: demo.sources,
    });
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.issues[0].message).toContain('重复');
  });

  it('returns a parse issue for malformed JSON', () => {
    const result = parseSignalImport({
      content: '{ bad',
      filename: 'signals.json',
      prefix: 'TEST4',
      existingSignals: demo.signals,
      existingSources: demo.sources,
    });
    expect(result.successCount).toBe(0);
    expect(result.issues[0].row).toBe(0);
  });
});
