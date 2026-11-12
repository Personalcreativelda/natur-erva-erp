/**
 * Gráficos do Dashboard, num ficheiro à parte para serem carregados sob demanda (React.lazy):
 * o recharts (~100 KB gzip) deixa de bloquear a primeira pintura do Dashboard.
 */
import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartThemeConfig } from '../../utils/chartTheme';

interface SalesEvolutionChartProps {
  data: { name: string; vendas: number }[];
  showAllTicks: boolean;
  theme: ChartThemeConfig;
}

export const SalesEvolutionChart: React.FC<SalesEvolutionChartProps> = ({ data, showAllTicks, theme }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid.stroke} strokeOpacity={theme.grid.strokeOpacity} />
      <XAxis
        dataKey="name"
        axisLine={false}
        tickLine={false}
        tick={{ fill: theme.tick.fill, fontSize: 10 }}
        interval={showAllTicks ? 0 : 'preserveStartEnd'}
        minTickGap={12}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fill: theme.tick.fill, fontSize: 10 }}
        tickFormatter={(v: number) => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
      />
      <Tooltip
        contentStyle={theme.tooltip.contentStyle}
        labelStyle={theme.tooltip.labelStyle}
        formatter={(value: number) => [value.toLocaleString('pt-PT', { minimumFractionDigits: 2 }) + ' MT', 'Vendas']}
      />
      <Line
        type="monotone"
        dataKey="vendas"
        stroke="var(--brand-600)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, fill: 'var(--brand-600)' }}
      />
    </LineChart>
  </ResponsiveContainer>
);

interface PeriodBarChartProps {
  data: { name: string; [key: string]: string | number }[];
  dataKey: string;
  fill: string;
  label: string;
  formatValue: (value: number) => string;
  theme: ChartThemeConfig;
}

export const PeriodBarChart: React.FC<PeriodBarChartProps> = ({ data, dataKey, fill, label, formatValue, theme }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid.stroke} strokeOpacity={theme.grid.strokeOpacity} />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme.tick.fill, fontSize: 10 }} className="text-[10px] sm:text-xs" />
      <YAxis axisLine={false} tickLine={false} tick={{ fill: theme.tick.fill, fontSize: 10 }} className="text-[10px] sm:text-xs" />
      <Tooltip cursor={theme.tooltip.cursor} contentStyle={theme.tooltip.contentStyle} formatter={(value: number) => [formatValue(value), label]} labelStyle={theme.tooltip.labelStyle} />
      <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);
