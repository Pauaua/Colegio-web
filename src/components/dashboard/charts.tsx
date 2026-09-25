"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/*
 * Gráficos de una sola serie: un único tono (--chart-mark, periwinkle de la paleta
 * un paso más oscuro para llegar a 3:1 sobre la tarjeta). Sin leyenda: el título
 * de la tarjeta nombra la serie. Textos con tokens de texto, nunca con el color de la marca.
 */

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

type TooltipProps = {
  active?: boolean;
  payload?: readonly { value?: unknown; payload?: unknown }[];
  labelFor: (p: Record<string, unknown>) => string;
};

function ChartTooltip({ active, payload, labelFor }: TooltipProps) {
  const item = payload?.[0];
  if (!active || !item) return null;
  const count = Number(item.value ?? 0);
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-soft">
      <p className="font-semibold">{labelFor(item.payload as Record<string, unknown>)}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{count}</span> documento
        {count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function DocumentsByTypeChart({ data }: { data: { name: string; count: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tick={AXIS_TICK}
            interval={0}
            tickFormatter={(value: string) => (value.length > 12 ? `${value.slice(0, 11)}…` : value)}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => (
              <ChartTooltip active={active} payload={payload} labelFor={(p) => String(p.name)} />
            )}
          />
          <Bar dataKey="count" fill="var(--chart-mark)" radius={[4, 4, 0, 0]} maxBarSize={24}>
            <LabelList
              dataKey="count"
              position="top"
              fill="var(--foreground)"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UploadsByMonthChart({
  data,
}: {
  data: { label: string; fullLabel: string; count: number }[];
}) {
  const last = data.at(-1);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tick={AXIS_TICK}
            interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                labelFor={(p) => {
                  const label = String(p.fullLabel);
                  return label.charAt(0).toUpperCase() + label.slice(1);
                }}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-mark)"
            strokeWidth={2}
            fill="var(--chart-mark)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 5, fill: "var(--chart-mark)", stroke: "var(--card)", strokeWidth: 2 }}
          >
            {/* Solo se rotula el último mes; el resto va en el tooltip y en la tabla. */}
            <LabelList
              dataKey="count"
              position="top"
              fill="var(--foreground)"
              fontSize={12}
              fontWeight={600}
              content={(props) => {
                const { x, y, index } = props as { x?: number; y?: number; index?: number };
                if (index !== data.length - 1 || x === undefined || y === undefined || !last) return null;
                return (
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {last.count}
                  </text>
                );
              }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
