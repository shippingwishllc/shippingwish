export interface LiveLoadCard {
  id: string;
  miles: number;
  rpm: number;
  pay: number;
  origin: string;
  destination: string;
  equipment: string;
  note: string;
}

export interface KpiMetric {
  icon: string;
  label: string;
  val: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  trucks: string;
  price: number;
  period: string;
  trial: string;
  featured?: boolean;
  badge?: string;
  features: string[];
  ctaUrl: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}
