import type { Unit } from '@fifoflow/shared';

type UnitValue = Unit | '' | null | undefined;
type NumberValue = number | string | null | undefined;

export interface InventoryUnitEconomicsInput {
  baseUnit: UnitValue;
  orderUnit: UnitValue;
  orderUnitPrice: NumberValue;
  qtyPerUnit: NumberValue;
  innerUnit: UnitValue;
  itemSizeValue: NumberValue;
  itemSizeUnit: UnitValue;
}

export interface InventoryUnitEconomicsModel {
  trackedUnit: Unit | null;
  purchaseUnit: Unit | null;
  eachUnit: Unit | null;
  measurableUnit: Unit | null;
  purchasePrice: number | null;
  unitsPerPurchase: number | null;
  measurablePerEach: number | null;
  perEachCost: number | null;
  perMeasureCost: number | null;
  measurablePerPurchase: number | null;
  packLine: string | null;
  eachLine: string | null;
  purchaseMeasureLine: string | null;
  costLine: string | null;
  recipeSupportLine: string;
  warnings: string[];
}

function parseNumber(value: NumberValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUnit(value: UnitValue): Unit | null {
  return value ? value : null;
}

function formatAmount(value: number | null, digits = 2): string {
  if (value == null) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(value: number | null, digits = 2): string {
  if (value == null) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function deriveInventoryUnitEconomics(input: InventoryUnitEconomicsInput): InventoryUnitEconomicsModel {
  const trackedUnit = normalizeUnit(input.baseUnit);
  const purchaseUnit = normalizeUnit(input.orderUnit);
  const innerUnit = normalizeUnit(input.innerUnit);
  const measurableUnit = normalizeUnit(input.itemSizeUnit);
  const purchasePrice = parseNumber(input.orderUnitPrice);
  const unitsPerPurchase = parseNumber(input.qtyPerUnit);
  const measurablePerEach = parseNumber(input.itemSizeValue);
  const eachUnit = innerUnit ?? trackedUnit;
  const perEachCost = purchasePrice != null && unitsPerPurchase != null && unitsPerPurchase > 0
    ? purchasePrice / unitsPerPurchase
    : null;
  const perMeasureCost = perEachCost != null && measurablePerEach != null && measurablePerEach > 0
    ? perEachCost / measurablePerEach
    : null;
  const measurablePerPurchase = unitsPerPurchase != null && unitsPerPurchase > 0 && measurablePerEach != null && measurablePerEach > 0
    ? unitsPerPurchase * measurablePerEach
    : null;

  const packLine = purchaseUnit && unitsPerPurchase != null && unitsPerPurchase > 0 && eachUnit
    ? `1 ${purchaseUnit} = ${formatAmount(unitsPerPurchase, unitsPerPurchase % 1 === 0 ? 0 : 2)} ${eachUnit}`
    : null;
  const eachLine = eachUnit && measurablePerEach != null && measurablePerEach > 0 && measurableUnit
    ? `1 ${eachUnit} = ${formatAmount(measurablePerEach, measurablePerEach % 1 === 0 ? 0 : 2)} ${measurableUnit}`
    : null;
  const purchaseMeasureLine = purchaseUnit && measurablePerPurchase != null && measurablePerPurchase > 0 && measurableUnit
    ? `1 ${purchaseUnit} = ${formatAmount(measurablePerPurchase, measurablePerPurchase % 1 === 0 ? 0 : 2)} ${measurableUnit}`
    : null;

  const costParts = [
    purchaseUnit && purchasePrice != null ? `${formatCurrency(purchasePrice)} / ${purchaseUnit}` : null,
    eachUnit && perEachCost != null ? `${formatCurrency(perEachCost)} / ${eachUnit}` : null,
    measurableUnit && perMeasureCost != null ? `${formatCurrency(perMeasureCost, 4)} / ${measurableUnit}` : null,
  ].filter((value): value is string => value !== null);

  const warnings: string[] = [];
  if (purchaseUnit && (unitsPerPurchase == null || unitsPerPurchase <= 0)) {
    warnings.push('Add how many counted units come in each purchase unit so pack cost can roll down cleanly.');
  }
  if (unitsPerPurchase != null && unitsPerPurchase > 0 && !eachUnit) {
    warnings.push('Choose the counted unit inside the purchase pack so operators know what one unit means on the shelf.');
  }
  if ((measurablePerEach != null && measurablePerEach > 0) !== Boolean(measurableUnit)) {
    warnings.push('Measurable size needs both a numeric amount and a unit such as ml, L, oz, or fl oz.');
  }
  if (trackedUnit && measurableUnit && trackedUnit === measurableUnit && eachUnit && eachUnit !== trackedUnit) {
    warnings.push('Track packaged items in the unit you physically count, then define measurable content per counted unit. That keeps bottle-to-ml math explainable.');
  }

  const recipeSupportLine = measurablePerEach != null && measurablePerEach > 0 && measurableUnit && eachUnit
    ? `Recipes and usage can consume ${measurableUnit}; FIFOFlow can roll that usage back to ${eachUnit}${purchaseUnit ? ` and up to ${purchaseUnit}` : ''}.`
    : trackedUnit
      ? `Without measurable content, recipe usage is limited to ${trackedUnit} and directly compatible units.`
      : 'Set a tracking unit first, then define measurable content if recipes need smaller units.';

  return {
    trackedUnit,
    purchaseUnit,
    eachUnit,
    measurableUnit,
    purchasePrice,
    unitsPerPurchase,
    measurablePerEach,
    perEachCost,
    perMeasureCost,
    measurablePerPurchase,
    packLine,
    eachLine,
    purchaseMeasureLine,
    costLine: costParts.length > 0 ? costParts.join(' • ') : null,
    recipeSupportLine,
    warnings,
  };
}

export function InventoryUnitEconomicsSummary({
  input,
  compact = false,
}: {
  input: InventoryUnitEconomicsInput;
  compact?: boolean;
}) {
  const model = deriveInventoryUnitEconomics(input);

  return (
    <div className={`rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] ${compact ? 'px-4 py-4' : 'px-5 py-5'}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Unit Economics</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">
            Define purchase math once so receiving, counting, recipes, and usage all read from the same unit chain.
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          Best practice: track what operators physically count
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'xl:grid-cols-4 md:grid-cols-2'}`}>
        <EconomicsCard
          label="Purchase Pack"
          value={model.packLine ?? 'Set purchase unit and pack quantity'}
          tone={model.packLine ? 'default' : 'amber'}
        />
        <EconomicsCard
          label="Counted Unit"
          value={model.eachLine ?? (model.eachUnit ? `Track inventory in ${model.eachUnit}` : 'Choose the shelf-counted unit')}
          tone={model.eachLine || model.eachUnit ? 'default' : 'amber'}
        />
        <EconomicsCard
          label="Derived Cost"
          value={model.costLine ?? 'Add case price and pack quantity'}
          tone={model.costLine ? 'default' : 'amber'}
        />
        <EconomicsCard
          label="Recipe / Usage Pull"
          value={model.purchaseMeasureLine ?? model.recipeSupportLine}
          tone={model.measurablePerEach && model.measurableUnit ? 'blue' : 'default'}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operator Guidance</div>
        <div className="mt-2 text-sm leading-6 text-slate-700">
          {model.trackedUnit
            ? `Track inventory in ${model.trackedUnit}. For example: a 6-bottle case of wine should usually track in bottles, purchase by case, and define 750 ml per bottle.`
            : 'Start with the unit your team actually counts on the shelf, then layer purchase and measurable conversions on top.'}
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-600">
          {model.recipeSupportLine}
        </div>
        {model.warnings.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            {model.warnings.map((warning) => (
              <li key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EconomicsCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'amber' | 'blue';
}) {
  const className = tone === 'amber'
    ? 'border-amber-200 bg-amber-50/70'
    : tone === 'blue'
      ? 'border-sky-200 bg-sky-50/70'
      : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{value}</div>
    </div>
  );
}
