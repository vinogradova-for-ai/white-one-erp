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
  // Гант показывает ФАКТ: активная по статусу фаза дотянута до «сегодня».
  // lagDays — на сколько дней она отстала от плана (длина дотяжки);
  // план в БД при этом не менялся. См. lib/gantt-fact.
  lagDays?: number;
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
  // Регион производства: "ru" (Россия) | "cn" (Китай) | "tyak" (Тяк, отдельно).
  // Правило: если в имени фабрики встречается «тяк» (нечувств. к регистру) — "tyak";
  // иначе по country: «Россия» → "ru", «Китай» → "cn"; всё прочее — null.
  productionRegion?: "ru" | "cn" | "tyak" | null;
  ownerId?: string | null;
  ownerName?: string | null;
  launchMonth?: number | null; // YYYYMM
  category?: string | null;
  rawStatus?: string;
  // Производные риски строки (агрегат по барам)
  hasOverdue: boolean;
  hasNearlyDue: boolean;
  // Нелогичный порядок фаз в БД (например, qcDate < readyAtFactoryDate).
  // Правило: фазы строго последовательны Разработка → Производство → ОТК → Доставка,
  // даты должны идти неубывающе. Если найдено нарушение — показываем значок ⚠️.
  hasDateOrderIssue?: boolean;
  dateOrderIssueText?: string;
  isPaused?: boolean;
  // Опаздывает N дней: план прибытия прошёл, факта нет. 0/undefined — не опаздывает.
  // Подсветка в тултипе/подзаголовке без смены статуса заказа (аудит п.6).
  lateDays?: number;
  thumbnails?: GanttThumbnail[];
  bars: GanttBarV2[];
};

export type FilterValue = string[]; // мульти-выбор

export type GanttFilters = {
  brand: FilterValue;
  phase: FilterValue;       // preparation | production | qc | shipping | packaging | development
  ownerId: FilterValue;
  factoryId: FilterValue;
  productionRegion: FilterValue; // ru | cn | tyak
  launchMonth: FilterValue; // YYYYMM
  status: FilterValue;
  category: FilterValue;
  search: string;
  // Преднастроенные пресеты-флажки
  burning: boolean;     // только горящие
  overdue: boolean;     // только просроченные
  thisWeek: boolean;    // только с активностью на этой неделе
  dateIssue: boolean;   // только заказы с нарушенным порядком фаз
  myOnly: string | null; // userId или null
  hideDone: boolean;    // скрыть завершённые (заказ приехал на склад и дальше)
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
  productionRegions: FilterOption[];
  launchMonths: FilterOption[];
  statuses: FilterOption[];
  categories: FilterOption[];
};
