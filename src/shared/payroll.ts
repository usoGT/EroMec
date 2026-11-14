// Maaş (bordro) hesap kuralları — puantaj ve bordro ekranı aynı fonksiyonu kullanır.
//
//  Ücretli gün   : puantajda İŞARETLENEN günlerin toplamı (ay 30 da çekse 31 de çekse ay hesabı yapılmaz).
//                  Her fırçanın "ücretli gün değeri" vardır: tam gün = 1, yarım gün = 0,5, sayılmaz = 0
//                  (varsayılan: 8 Çalıştı, İ, T, H = 1; 4 Yarım gün = 0,5; Üİ, R, 0 Devamsız = 0). Boş gün sayılmaz.
//  Günlük ücret  : aylık maaş ÷ 30
//  Normal maaş   : günlük ücret × ücretli gün
//  Mesai parası  : o ayın mesai kayıtlarının toplamı (Mesailer bölümü)
//  Toplam        : normal maaş + mesai parası
//  Asgari        : günlük asgari ücret (Ayarlar) × ücretli gün — resmi / bankaya yatan kısım (toplamı geçemez)
//  Elden         : toplam − asgari
import type { AttendanceStatus, StatusMap } from './attendance';

export interface PayInput {
  cells: Record<string, AttendanceStatus>;
  statuses: StatusMap;
  monthlySalaryKurus: number;
  overtimeKurus: number;
  dailyMinWageKurus: number;
}

export interface PayResult {
  /** Ücretli gün × 2 (yarım günler tam sayı kalsın diye) */
  paidHalfDays: number;
  paidDays: number;
  dailyWageKurus: number;
  normalKurus: number;
  overtimeKurus: number;
  totalKurus: number;
  officialKurus: number; // asgari (resmi) kısım
  cashKurus: number; // elden
}

export function computePay(p: PayInput): PayResult {
  let half = 0;
  for (const st of Object.values(p.cells)) half += p.statuses[st]?.paidHalf ?? 0;
  const normalKurus = Math.round((p.monthlySalaryKurus * half) / 60);
  const totalKurus = normalKurus + p.overtimeKurus;
  const officialKurus = Math.min(totalKurus, Math.round((p.dailyMinWageKurus * half) / 2));
  return {
    paidHalfDays: half,
    paidDays: half / 2,
    dailyWageKurus: Math.round(p.monthlySalaryKurus / 30),
    normalKurus,
    overtimeKurus: p.overtimeKurus,
    totalKurus,
    officialKurus,
    cashKurus: totalKurus - officialKurus,
  };
}
