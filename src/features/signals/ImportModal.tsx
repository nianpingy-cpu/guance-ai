import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileJson, FileSpreadsheet, Upload } from 'lucide-react';
import type { ImportIssue } from '@/types/domain';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { parseSignalImport, signalCsvTemplate } from '@/lib/importSignals';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/ui/Form';
import { Tag } from '@/components/ui/Tag';
import { formatNumber } from '@/lib/format';

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function ImportModal() {
  const open = useUiStore((state) => state.importModalOpen);
  const close = useUiStore((state) => state.closeImportModal);
  const signals = useAppStore((state) => state.signals);
  const sources = useAppStore((state) => state.sources);
  const applyImport = useAppStore((state) => state.applyImport);
  const [filename, setFilename] = useState('');
  const [parseState, setParseState] = useState<{
    status: 'idle' | 'error' | 'ready';
    message: string;
    successCount: number;
    failedCount: number;
    issues: ImportIssue[];
    payload?: ReturnType<typeof parseSignalImport>;
  }>({ status: 'idle', message: '', successCount: 0, failedCount: 0, issues: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFilename('');
      setParseState({ status: 'idle', message: '', successCount: 0, failedCount: 0, issues: [] });
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  const readFile = async (file: File) => {
    setFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseSignalImport({
        simulated: useAppStore.getState().mode !== 'real',
        content: text,
        filename: file.name,
        prefix: `IMP-${Date.now()}`,
        existingSignals: signals,
        existingSources: sources,
      });
      setParseState({
        status: 'ready',
        message: '',
        successCount: parsed.successCount,
        failedCount: parsed.failedCount,
        issues: parsed.issues,
        payload: parsed,
      });
    } catch {
      setParseState({
        status: 'error',
        message: '文件读取失败，请确认是 UTF-8 编码的 CSV 或 JSON。',
        successCount: 0,
        failedCount: 0,
        issues: [],
      });
    }
  };

  const importNow = () => {
    if (!parseState.payload || parseState.successCount === 0) return;
    applyImport(parseState.payload, filename);
    toast(
      `已导入 ${parseState.successCount} 条市场情报`,
      parseState.failedCount > 0
        ? `${parseState.failedCount} 行未通过校验；工作台统计已同步更新。`
        : '工作台统计与来源分布已同步更新。',
      parseState.failedCount > 0 ? 'warning' : 'success',
    );
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="导入市场情报"
      description="支持本地 CSV 或 JSON 情报；先预览校验结果，再确认入库。演示项目与业务项目分别标记来源。"
      size="lg"
      footer={
        <>
          <Button onClick={close}>取消</Button>
          <Button
            variant="primary"
            icon={<Upload size={14} />}
            onClick={importNow}
            disabled={parseState.status !== 'ready' || parseState.successCount === 0}
          >
            确认导入{parseState.successCount > 0 ? ` ${parseState.successCount} 条` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[13px] border border-line bg-[#fbfcfd] p-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-data" />
              <p className="text-[12px] font-bold text-ink">CSV</p>
              <Tag tone="outline">UTF-8</Tag>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-muted">
              必填：标题、来源平台、类别、发布日期、摘要。可选：优先级、状态、原文引用、来源名称、相关性、影响。
            </p>
            <Button
              size="sm"
              className="mt-3"
              icon={<Download size={13} />}
              onClick={() => download(signalCsvTemplate, '观策AI-情报导入模板.csv', 'text/csv;charset=utf-8')}
            >
              下载 CSV 模板
            </Button>
          </div>
          <div className="rounded-[13px] border border-line bg-[#fbfcfd] p-4">
            <div className="flex items-center gap-2">
              <FileJson size={16} className="text-data" />
              <p className="text-[12px] font-bold text-ink">JSON</p>
              <Tag tone="outline">数组</Tag>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-muted">
              可直接传数组，或使用 <code className="rounded bg-white px-1 text-[12px]">{'{ "signals": [...] }'}</code>。
              字段名支持中文（标题 / 来源平台 / 类别 / 优先级 / 状态）。
            </p>
            <p className="mt-3 text-[12px] text-faint">导入后会自动记录一条“核对导入文件”的任务。</p>
          </div>
        </div>

        <div
          className="rounded-[14px] border border-dashed border-[#c9d4e1] bg-white px-5 py-6 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
        >
          <Upload size={20} className="mx-auto text-brand" />
          <p className="mt-2 text-[13px] font-bold text-ink">选择文件或拖入此处</p>
          <p className="mt-1 text-[11px] text-muted">支持 .csv 与 .json，单次演示建议不超过 100 行。</p>
          <input
            ref={inputRef}
            id="signal-import"
            type="file"
            accept=".csv,.json,application/json,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <label htmlFor="signal-import" className="btn btn-secondary btn-sm mt-3 cursor-pointer">
            浏览本地文件
          </label>
          {filename ? <p className="mt-2 text-[12px] text-faint">已选择：{filename}</p> : null}
        </div>

        {parseState.status === 'error' ? <InfoBanner tone="danger">{parseState.message}</InfoBanner> : null}

        {parseState.status === 'ready' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={parseState.successCount > 0 ? 'mint' : 'danger'}>
                <CheckCircle2 size={11} /> 成功 {formatNumber(parseState.successCount)} 条
              </Tag>
              <Tag tone={parseState.failedCount > 0 ? 'warning' : 'neutral'}>
                失败 {formatNumber(parseState.failedCount)} 条
              </Tag>
              <span className="text-[11px] text-muted">校验通过后才会写入当前演示数据。</span>
            </div>
            {parseState.issues.length > 0 ? (
              <div className="max-h-[170px] overflow-y-auto rounded-[12px] border border-[#f0dfbd] bg-[#fdfaf2] p-3 scrollbar-thin">
                <p className="text-[11px] font-bold text-[#7b5718]">未导入的行</p>
                <ul className="mt-1.5 space-y-1">
                  {parseState.issues.slice(0, 12).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`} className="text-[11px] leading-5 text-[#7b5718]">
                      第 {issue.row} 行：{issue.message}
                    </li>
                  ))}
                </ul>
                {parseState.issues.length > 12 ? (
                  <p className="mt-1 text-[12px] text-[#7b5718]">另有 {parseState.issues.length - 12} 条问题未显示。</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-[12px] bg-[#f8fafb] px-3.5 py-2.5">
          <p className="text-[12px] leading-5 text-muted">
            导入数据默认标记为演示来源，不会伪装为真实平台统计。真实采集、授权与去重策略不在本版本范围内。
          </p>
        </div>
      </div>
    </Modal>
  );
}
