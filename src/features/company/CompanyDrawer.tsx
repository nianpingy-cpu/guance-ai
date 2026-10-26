import { useEffect, useState } from 'react';
import { Save, TriangleAlert } from 'lucide-react';
import type { Company } from '@/types/domain';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { totalPlanCents } from '@/lib/calculations';
import { formatCny, parseYuanToCents } from '@/lib/format';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Tag } from '@/components/ui/Tag';

type FormState = Omit<Company, 'id' | 'budgetCents' | 'updatedAt'> & { budgetYuan: string };

function toForm(company: Company): FormState {
  return {
    name: company.name,
    brand: company.brand,
    industry: company.industry,
    region: company.region,
    stage: company.stage,
    product: company.product,
    productSpec: company.productSpec,
    goal: company.goal,
    campaignStart: company.campaignStart,
    campaignEnd: company.campaignEnd,
    budgetYuan: (company.budgetCents / 100).toFixed(0),
  };
}

export function CompanyDrawer() {
  const open = useUiStore((state) => state.companyDrawerOpen);
  const close = useUiStore((state) => state.closeCompanyDrawer);
  const company = useAppStore((state) => state.company);
  const plans = useAppStore((state) => state.plans);
  const updateCompany = useAppStore((state) => state.updateCompany);
  const [form, setForm] = useState<FormState>(() => toForm(company));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toForm(company));
      setErrors({});
    }
  }, [open, company]);

  const set = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const parsedBudget = parseYuanToCents(form.budgetYuan);
  const budgetCents = parsedBudget.ok ? parsedBudget.cents : null;
  const overPlans =
    budgetCents === null
      ? []
      : plans
          .filter((plan) => totalPlanCents(plan) > budgetCents)
          .map((plan) => ({ code: plan.code, total: totalPlanCents(plan) }));

  const save = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = '请填写企业名称';
    if (!form.brand.trim()) nextErrors.brand = '请填写品牌名';
    if (!form.industry.trim()) nextErrors.industry = '请填写行业与品类';
    if (!form.goal.trim()) nextErrors.goal = '请填写本轮营销目标';
    if (!form.product.trim()) nextErrors.product = '请填写产品名称';
    if (!parsedBudget.ok) nextErrors.budgetYuan = parsedBudget.message;
    else if (parsedBudget.cents <= 0) nextErrors.budgetYuan = '预算上限须大于 0 元';
    if (!form.campaignStart || Number.isNaN(Date.parse(form.campaignStart))) {
      nextErrors.campaignStart = '请选择有效开始日期';
    }
    if (!form.campaignEnd || Number.isNaN(Date.parse(form.campaignEnd))) {
      nextErrors.campaignEnd = '请选择有效结束日期';
    }
    if (
      form.campaignStart &&
      form.campaignEnd &&
      Date.parse(form.campaignStart) > Date.parse(form.campaignEnd)
    ) {
      nextErrors.campaignEnd = '结束日期不能早于开始日期';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsedBudget.ok) return;

    const result = updateCompany({
      name: form.name.trim(),
      brand: form.brand.trim(),
      industry: form.industry.trim(),
      region: form.region.trim(),
      stage: form.stage.trim(),
      product: form.product.trim(),
      productSpec: form.productSpec.trim(),
      goal: form.goal.trim(),
      budgetCents: parsedBudget.cents,
      campaignStart: form.campaignStart,
      campaignEnd: form.campaignEnd,
    });
    if (!result.ok) {
      setErrors({ form: result.message });
      return;
    }
    toast(
      '企业资料已保存',
      overPlans.length > 0
        ? `预算上限已更新；方案 ${overPlans.map((plan) => plan.code).join('、')} 当前超出上限，确认前需调整。`
        : '预算上限与相关页面数据已同步更新。',
      overPlans.length > 0 ? 'warning' : 'success',
    );
    close();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      eyebrow="企业档案 · 工作台内编辑"
      title="编辑企业资料"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-faint">修改保存在本机，并影响当前项目的预算校验与审批状态。</p>
          <div className="flex shrink-0 gap-2">
            <Button onClick={close}>取消</Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={save}>
              保存资料
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Tag tone="brand">单一演示企业</Tag>
          <span className="text-[11px] text-muted">首版不提供企业切换或多租户</span>
        </div>

        {errors.form ? <InfoBanner tone="danger">{errors.form}</InfoBanner> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="企业名称" htmlFor="company-name" error={errors.name} className="sm:col-span-2">
            <input
              id="company-name"
              className="input"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </Field>
          <Field label="品牌名" htmlFor="company-brand" error={errors.brand}>
            <input
              id="company-brand"
              className="input"
              value={form.brand}
              onChange={(event) => set('brand', event.target.value)}
            />
          </Field>
          <Field label="行业 / 品类" htmlFor="company-industry" error={errors.industry}>
            <input
              id="company-industry"
              className="input"
              value={form.industry}
              onChange={(event) => set('industry', event.target.value)}
            />
          </Field>
          <Field label="地域" htmlFor="company-region">
            <input
              id="company-region"
              className="input"
              value={form.region}
              onChange={(event) => set('region', event.target.value)}
            />
          </Field>
          <Field label="发展阶段" htmlFor="company-stage">
            <input
              id="company-stage"
              className="input"
              value={form.stage}
              onChange={(event) => set('stage', event.target.value)}
            />
          </Field>
          <Field label="产品名称" htmlFor="company-product" error={errors.product} className="sm:col-span-2">
            <input
              id="company-product"
              className="input"
              value={form.product}
              onChange={(event) => set('product', event.target.value)}
            />
          </Field>
          <Field label="规格 / 说明" htmlFor="company-spec" className="sm:col-span-2">
            <input
              id="company-spec"
              className="input"
              value={form.productSpec}
              onChange={(event) => set('productSpec', event.target.value)}
            />
          </Field>
          <Field
            label="本轮营销目标"
            htmlFor="company-goal"
            error={errors.goal}
            hint="目标会显示在工作台，并作为复盘解释的上下文。"
            className="sm:col-span-2"
          >
            <textarea
              id="company-goal"
              className="textarea"
              rows={2}
              value={form.goal}
              onChange={(event) => set('goal', event.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-[14px] border border-line bg-[#fbfcfd] p-4">
          <p className="text-[12px] font-bold text-ink">预算与周期</p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted">
            预算上限用于约束方案总预算；修改后，已审批方案会提示需要重新确认。
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="预算上限（元）" htmlFor="company-budget" error={errors.budgetYuan}>
              <input
                id="company-budget"
                className="input input-number"
                inputMode="decimal"
                value={form.budgetYuan}
                onChange={(event) => set('budgetYuan', event.target.value)}
              />
            </Field>
            <Field label="开始日期" htmlFor="company-start" error={errors.campaignStart}>
              <input
                id="company-start"
                type="date"
                className="input"
                value={form.campaignStart}
                onChange={(event) => set('campaignStart', event.target.value)}
              />
            </Field>
            <Field label="结束日期" htmlFor="company-end" error={errors.campaignEnd}>
              <input
                id="company-end"
                type="date"
                className="input"
                value={form.campaignEnd}
                onChange={(event) => set('campaignEnd', event.target.value)}
              />
            </Field>
          </div>
          {budgetCents !== null ? (
            <p className="mt-2 text-[11px] text-muted">
              当前上限：<span className="tabular font-semibold text-ink">{formatCny(budgetCents)}</span>
            </p>
          ) : null}
        </div>

        {overPlans.length > 0 ? (
          <InfoBanner
            tone="warning"
            title="新预算低于已有方案合计"
            action={
              <Tag tone="warning">
                <TriangleAlert size={11} /> 待调整
              </Tag>
            }
          >
            方案{' '}
            {overPlans.map((plan) => (
              <span key={plan.code} className="font-semibold">
                {plan.code}（{formatCny(plan.total)}）
              </span>
            ))}{' '}
            超出新上限。保存后仍可进入策略页按比例调整或修改渠道预算，但超限时不能确认方案。
          </InfoBanner>
        ) : null}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">任务边界</p>
          <p className="text-[11px] leading-5 text-muted">
            演示项目使用模拟资料，业务项目请填写自己的信息。模型连接与数据来源在设置中管理；实际投放由用户在广告平台完成。
          </p>
        </div>
      </div>
    </Drawer>
  );
}
