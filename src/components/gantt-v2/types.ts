// Типы данных для графика Ганта v2.
// Расширяют старые GanttRow/GanttBar дополнительными полями для фильтров и KPI.

export type GanttGroup = "development" | "orders" | "packaging";

export type BarState = "done" | "active" | "future";

export type GanttBarV2 = {
  key: string;
  title: string;
  color: string;
  start: string;
  end: string;
  owner?: string;
  // Состояния:
  //   done   — фаза завершена (есть фактическая дата, статус продвинулся дальше)
  //   active — текущая фаза в работе
  //   future — впереди, не начата
  state: BarState;
  // Производные риски (рассчитываются на сервере):
  overdue?: boolean;     // end < today и не done
  nearlyDue?: boolean;   // end ≤ today+5 и не done и не overdue
  // Поля для drag — пишутся в БД на orderId через endField/startField
  orderId?: string;
  endField?: string;
  startField?: string;
};

export type GanttThumbnail = {
  photoUrl: string | null;
  colorName: string | null;
};

export type GanttRowV2 = {
  group: GanttGroup;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  // Поля для фильтрации
  brand?: "WHITE_ONE" | "SERDCEBIENIE" | null;
  factoryId?: string | null;
  factoryName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  launchMonth?: number | null; // YYYYMM
  category?: string | null;
  rawStatus?: string;
  // Производные риски строки (агрегат по барам)
  hasOverdue: boolean;
  hasNearlyDue: boolean;
  isPaused?: boolean;
  thumbnails?: GanttThumbnail[];
  bars: GanttBarV2[];
};

export type FilterValue = string[]; // мульти-выбор

export type GanttFilters = {
  brand: FilterValue;
  phase: FilterValue;       // preparation | production | qc | shipping | packaging | development
  ownerId: FilterValue;
  factoryId: FilterValue;
  launchMonth: FilterValue; // YYYYMM
  status: FilterValue;
  category: FilterValue;
  search: string;
  // Преднастроенные пресеты-флажки
  burning: boolean;     // только горящие
  overdue: boolean;     // только просроченные
  thisWeek: boolean;    // только с активностью на этой неделе
  myOnly: string | null; // userId или null
};

export type GanttGrouping =
  | "none"
  | "brand"
  | "factory"
  | "owner"
  | "launchMonth"
  | "phase"
  | "category"
  | "type"; // тип данных: development/orders/packaging

export type GanttSort =
  | "deadline"      // ближайший финиш цикла наверху
  | "launchMonth"   // дата запуска
  | "urgency"       // горящие → просроченные → дедлайн
  | "title";        // алфавит

export type GanttViewType = "gantt" | "list";

export type GanttDensity = "compact" | "normal" | "spacious";

export type GanttZoom = "1w" | "1m" | "3m" | "6m" | "1y" | "auto";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
  color?: string;
};

export type GanttFilterOptions = {
  brands: FilterOption[];
  phases: FilterOption[];
  owners: FilterOption[];
  factories: FilterOption[];
  launchMonths: FilterOption[];
  statuses: FilterOption[];
  categories: FilterOption[];
};
