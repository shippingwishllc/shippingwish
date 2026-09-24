export interface FreightLoad {
  id: string;
  load_number?: string;
  origin?: string;
  pickup_location?: string;
  destination?: string;
  delivery_location?: string;
  miles?: number | string;
  rate: number;
  rpm?: number | string;
  equipment_type?: string;
  equipment?: string;
  weight?: string | number;
  commodity?: string;
  pickup_date?: string;
  delivery_date?: string;
  broker_name?: string;
  broker_mc?: string;
  broker_phone?: string;
  broker_email?: string;
  days_to_pay?: string | number;
  credit_score?: string;
  bond_status?: string;
  is_live_broker_post?: boolean;
  status?: 'active' | 'covered' | 'new' | string;
  is_covered?: boolean;
  covered_at?: number | null;
}

export interface UserSession {
  id: number;
  name: string;
  email: string;
  role: 'carrier' | 'broker' | 'super_admin' | 'admin' | string;
  company_name?: string;
  weekly_plan?: string;
  mc_number?: string;
  phone?: string;
}

export interface SearchFilter {
  origin: string;
  destination: string;
  equipment: string;
}

export interface PostFreightForm {
  origin: string;
  destination: string;
  equipment: string;
  rate: number;
  miles: number;
  weight: number;
  commodity: string;
  pickupDate: string;
  brokerName: string;
  brokerMc: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}
