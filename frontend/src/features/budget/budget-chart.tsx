// Donut of the budget split. Decorative: the table next to it lists every amount.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { inr } from "@/lib/format";
import { usePlan } from "@/state/planner";
import { CHART_COLORS } from "./chart-colors";

export default function BudgetChart() {
  const { plan } = usePlan();
  const data = plan.budget_lines.map((line) => ({ name: line.label, value: line.amount_inr }));
  return (
    <div className="h-56" aria-hidden="true">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" paddingAngle={1} stroke="var(--card)" isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.name} fill={CHART_COLORS[i % 9]} />)}
          </Pie>
          <Tooltip formatter={(value) => inr(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
