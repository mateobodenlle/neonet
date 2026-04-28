import type { Category } from "@/lib/types";

const labels: Record<Category, string> = {
  "cliente-potencial": "Prospect",
  cliente: "Cliente",
  inversor: "Inversor",
  partner: "Partner",
  talento: "Talento",
  amigo: "Amigo",
  otro: "Otro",
};

export function CategoryBadge({ category }: { category: Category }) {
  return <span className="text-[12px] text-muted-foreground">{labels[category]}</span>;
}
