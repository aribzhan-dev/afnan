export interface Variant {
  id: string;
  label: string;
  price: number;
  stock: number;
}
export interface Product {
  kind: 'product' | 'service';
  version?: number;
  id: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  unit: string;
  step: number;
  image: string;
  discount_enabled: boolean;
  discount_percent: number;
  featured: boolean;
  active: boolean;
  specs: Record<string, string>;
  variants: Variant[];
}
export interface Dictionary {
  id: string;
  name: string;
  symbol?: string;
  kind?: 'sale' | 'spec';
}
export interface Settings {
  name: string;
  phone: string;
  address: string;
  hours: string;
  about: string;
  delivery_note: string;
  map_url: string;
  demo: boolean;
}
export interface Catalog {
  products: Product[];
  categories: Dictionary[];
  units: Dictionary[];
  settings: Settings;
}
export interface CartItem {
  product_id: string;
  variant_id: string;
  quantity: number;
}
export interface OrderItem extends CartItem {
  kind?: 'product' | 'service';
  name: string;
  variant_label: string;
  unit: string;
  unit_price: number;
  total: number;
}
export type OrderStatus = 'new' | 'confirmed' | 'completed' | 'cancelled';
export interface Order {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  delivery: string;
  comment: string;
  total: number;
  created_at: string;
  completed_at: string | null;
  status: OrderStatus;
  items: OrderItem[];
  whatsapp_url: string;
  notifications: { channel: string; status: string; attempts: number; error: string }[];
}
export interface Analytics {
  revenue: number;
  orders: number;
  active: number;
  quantities: Record<string, number>;
  top: { id: string; name: string; quantity: number; unit: string; revenue: number }[];
  series: { date: string; value: number }[];
}
export interface OrderResult {
  id: string;
  total: number;
  whatsapp_url: string;
}
