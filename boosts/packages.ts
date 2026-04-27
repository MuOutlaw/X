// Shared boost package definitions — used by both backend and frontend
export type BoostPackage = {
  id: string;
  name: string;
  nameAr: string;
  descriptionAr: string;
  durationDays: number;
  priceSAR: number;        // price in Saudi Riyals
  pricecents: number;      // price in halalas (cents) for payment processing
  currency: string;
  badge: string;           // emoji badge shown on listing
  highlight: string;       // CSS color hint
  popular?: boolean;
};

export const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: "featured_7d",
    name: "Featured 7 Days",
    nameAr: "إعلان مميّز — ٧ أيام",
    descriptionAr: "يظهر إعلانك في قسم الإعلانات المميّزة على الصفحة الرئيسية والسوق لمدة ٧ أيام",
    durationDays: 7,
    priceSAR: 49,
    pricecents: 4900,
    currency: "sar",
    badge: "⭐",
    highlight: "amber",
  },
  {
    id: "featured_14d",
    name: "Featured 14 Days",
    nameAr: "إعلان مميّز — ١٤ يوماً",
    descriptionAr: "يظهر إعلانك في قسم الإعلانات المميّزة على الصفحة الرئيسية والسوق لمدة ١٤ يوماً",
    durationDays: 14,
    priceSAR: 89,
    pricecents: 8900,
    currency: "sar",
    badge: "⭐",
    highlight: "amber",
    popular: true,
  },
  {
    id: "top_3d",
    name: "Top of Search 3 Days",
    nameAr: "أعلى نتائج البحث — ٣ أيام",
    descriptionAr: "يظهر إعلانك في أعلى قائمة نتائج البحث والفئة لمدة ٣ أيام",
    durationDays: 3,
    priceSAR: 29,
    pricecents: 2900,
    currency: "sar",
    badge: "🔝",
    highlight: "blue",
  },
  {
    id: "bundle_30d",
    name: "Power Bundle 30 Days",
    nameAr: "حزمة القوة — ٣٠ يوماً",
    descriptionAr: "تميّز + أعلى النتائج + شارة مميّزة لمدة ٣٠ يوماً كاملة — أفضل قيمة",
    durationDays: 30,
    priceSAR: 199,
    pricecents: 19900,
    currency: "sar",
    badge: "🚀",
    highlight: "primary",
  },
];

export function getPackageById(id: string): BoostPackage | undefined {
  return BOOST_PACKAGES.find((p) => p.id === id);
}
