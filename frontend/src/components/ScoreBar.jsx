import { BarChart, Bar, XAxis, Tooltip } from "recharts";

export default function ScoreBar({ data }) {
  return (
    <BarChart width={400} height={250} data={data}>
      <XAxis dataKey="name" />
      <Tooltip />
      <Bar dataKey="value" fill="#6366F1" />
    </BarChart>
  );
}
