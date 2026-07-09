import React from 'react';
import { PieChart, Pie, Cell } from 'recharts';

export default function ScoreDonut({ data }) {
  const colors = ['#6366F1', '#22D3EE', '#8B5CF6'];

  return (
    <PieChart width={240} height={240}>
      <Pie
        data={data}
        innerRadius={70}
        outerRadius={100}
        dataKey="value"
      >
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i]} />
        ))}
      </Pie>
    </PieChart>
  );
}
