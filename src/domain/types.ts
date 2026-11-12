// Все денежные суммы — целые числа в копейках. Проценты — в базисных пунктах (10000 = 100%).
export type Kop = number;
export type Bps = number;
export type ISODate = string; // YYYY-MM-DD

export interface Client {
  id: string;
  name: string;
  phone?: string;
  telegram?: string;
  email?: string;
  comment?: string;
  createdAt: ISODate;
  updatedAt: string;
}

export type ProductionStatus = 'new' | 'pending' | 'in_production' | 'ready' | 'handed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface OrderMaterial {
  materialId: string;
  qtyPerUnit: number; // расход на 1 изделие
}
export interface ConsumedMaterial {
  materialId: string;
  qty: number; // уже списано со склада по этому заказу
}

export interface Order {
  id: string;
  number: string;
  clientId: string;
  title: string;
  description?: string;
  qty: number;
  size?: string;
  custom?: string;
  unitPrice: Kop;
  unitCost: Kop;
  costMode: 'auto' | 'manual';
  extraCost: Kop;
  createdAt: ISODate;
  dueDate?: ISODate;
  status: ProductionStatus;
  materials: OrderMaterial[];
  consumed: ConsumedMaterial[];
  updatedAt: string;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: Kop; // средневзвешенная цена за единицу
  minQty: number;
  archived?: boolean;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  materialId: string;
  date: ISODate;
  qty: number;
  unitCost: Kop;
  total: Kop;
  txId?: string;
  note?: string;
}

export type TxType =
  | 'income' // оплата от клиента
  | 'refund' // возврат денег клиенту
  | 'expense' // расход, оплачен из кассы бизнеса
  | 'capital' // вклад в капитал
  | 'advance' // личный аванс партнёра (расход + долг бизнеса)
  | 'advance_repay' // возврат аванса партнёру
  | 'capital_return' // возврат капитала партнёру
  | 'profit_accrual' // начисление прибыли (без движения денег)
  | 'profit_payout' // выплата прибыли
  | 'other';

export interface Transaction {
  id: string;
  type: TxType;
  amount: Kop; // всегда > 0
  date: ISODate;
  category?: string;
  description?: string;
  orderId?: string;
  partnerId?: string;
  distributionId?: string;
  direction?: 'in' | 'out'; // только для type='other'
  voided?: boolean;
  createdAt: string;
}

export interface Partner {
  id: string;
  name: string;
  joinedAt: ISODate;
  archived?: boolean;
  note?: string;
  updatedAt: string;
}

export type DistMode = 'capital' | 'equal' | 'fixed' | 'custom';

export interface DistributionRow {
  partnerId: string;
  partnerName: string; // снимок на момент проведения
  bps: Bps;
  amount: Kop;
}
export interface Distribution {
  id: string;
  createdAt: string;
  date: ISODate;
  mode: DistMode;
  reserve: Kop; // снимок
  netProfit: Kop; // снимок
  alreadyDistributed: Kop; // снимок
  total: Kop;
  rows: DistributionRow[];
  status: 'active' | 'cancelled';
  cancelledAt?: string;
  cancelReason?: string;
  note?: string;
}

export interface LogEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
}

export type CapitalReturnMode = 'none' | 'schedule' | 'from_cash' | 'custom';
export interface ScheduledReturn {
  id: string;
  partnerId: string;
  date: ISODate;
  amount: Kop;
  done?: boolean;
}

export interface Settings {
  id: 'main';
  businessName: string;
  logo?: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  animations: boolean;
  reserve: Kop;
  distributionMode: DistMode;
  fixedBps: Record<string, Bps>;
  capitalReturnMode: CapitalReturnMode;
  capitalSchedule: ScheduledReturn[];
  incomeCategories: string[];
  expenseCategories: string[];
  orderCounter: number;
  lastBackupAt?: string;
}

export interface Data {
  clients: Client[];
  orders: Order[];
  materials: Material[];
  purchases: Purchase[];
  transactions: Transaction[];
  partners: Partner[];
  distributions: Distribution[];
  log: LogEntry[];
  settings: Settings;
}

export type StoreName = Exclude<keyof Data, 'settings'> | 'settings';
export const COLLECTIONS = ['clients', 'orders', 'materials', 'purchases', 'transactions', 'partners', 'distributions', 'log'] as const;

export interface Batch {
  put: Partial<Record<StoreName, any[]>>;
  del: Partial<Record<StoreName, string[]>>;
}

export const DEFAULT_EXPENSE_CATEGORIES = ['Материалы', 'Оборудование', 'Доставка', 'Упаковка', 'Реклама', 'Комиссии', 'Аренда', 'Прочее'];
export const DEFAULT_INCOME_CATEGORIES = ['Оплата заказа', 'Прочий доход'];

export function defaultSettings(): Settings {
  return {
    id: 'main',
    businessName: 'NFC Визитки',
    currency: '₽',
    theme: 'light',
    density: 'comfortable',
    animations: true,
    reserve: 0,
    distributionMode: 'capital',
    fixedBps: {},
    capitalReturnMode: 'none',
    capitalSchedule: [],
    incomeCategories: [...DEFAULT_INCOME_CATEGORIES],
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
    orderCounter: 1,
  };
}
export function emptyData(): Data {
  return { clients: [], orders: [], materials: [], purchases: [], transactions: [], partners: [], distributions: [], log: [], settings: defaultSettings() };
}

export const PRODUCTION_LABELS: Record<ProductionStatus, string> = {
  new: 'Новый', pending: 'Ожидает подтверждения', in_production: 'В производстве', ready: 'Готов', handed: 'Передан клиенту', cancelled: 'Отменён',
};
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачен', partial: 'Частично оплачен', paid: 'Оплачен полностью', refunded: 'Возвращён',
};
export const TX_LABELS: Record<TxType, string> = {
  income: 'Доход', refund: 'Возврат клиенту', expense: 'Расход', capital: 'Вложение в бизнес', advance: 'Личный аванс партнёра',
  advance_repay: 'Возврат аванса партнёру', capital_return: 'Возврат капитала', profit_accrual: 'Начисление прибыли',
  profit_payout: 'Выплата прибыли', other: 'Прочая операция',
};
export const MODE_LABELS: Record<DistMode, string> = {
  capital: 'По вложениям', equal: 'Поровну', fixed: 'Фиксированные доли', custom: 'Индивидуальные проценты',
};
