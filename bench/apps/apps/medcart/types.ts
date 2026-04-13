export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  ssn: string;
  insuranceId: string;
  insuranceProvider: string;
}

export interface Address {
  id: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  street: string;
  apt?: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  date: string;
  items: OrderItem[];
  shippingAddress: Address;
  status: "delivered" | "shipped" | "processing" | "cancelled";
  total: number;
  trackingNumber?: string;
}

export interface PaymentMethod {
  id: string;
  type: "visa" | "mastercard" | "amex";
  cardNumber: string;
  expiry: string;
  cardholderName: string;
  isDefault: boolean;
}

export interface MedicalRecord {
  id: string;
  date: string;
  provider: string;
  providerNPI: string;
  facility: string;
  diagnosis: string;
  diagnosisCode: string;
  medications: string[];
  notes: string;
}

export interface ChatMessage {
  id: string;
  timestamp: string;
  sender: "patient" | "agent";
  senderName: string;
  content: string;
}

export interface ChatThread {
  id: string;
  subject: string;
  status: "open" | "resolved";
  messages: ChatMessage[];
}

export type Page =
  | { type: "dashboard" }
  | { type: "profile" }
  | { type: "orders" }
  | { type: "addresses" }
  | { type: "payments" }
  | { type: "records" }
  | { type: "chat"; threadId?: string };

export interface AppState {
  patient: Patient;
  addresses: Address[];
  orders: Order[];
  paymentMethods: PaymentMethod[];
  medicalRecords: MedicalRecord[];
  chatThreads: ChatThread[];
  page: Page;
}
