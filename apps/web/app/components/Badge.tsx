const colors: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-orange-100 text-orange-700",
  cold: "bg-blue-100 text-blue-600",
  running: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-600",
  done: "bg-gray-200 text-gray-500",
  handoff: "bg-purple-100 text-purple-700",
  new: "bg-gray-100 text-gray-600",
  engaged: "bg-sky-100 text-sky-700",
  qualified: "bg-teal-100 text-teal-700",
};

export default function Badge({ label }: { label: string }) {
  const cls = colors[label] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
