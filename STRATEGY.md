# Peak Rider — rasional desain

## Bukti yang dipakai

Dev window 24 jam: 1.222 koin, 35 graduation. Semua baseline rugi: hold-cash 0,
sniper −0,49 SOL (terbaik), reversion −4,02 SOL, momentum −9,39 SOL (pyramid
ke posisi kalah), equal-weight −0,019 SOL tapi gagal guardrail (cuma 5 koin).

Analisis fitur offline: filter early-breadth (≥5 distinct non-creator buyer
+ net inflow ≥1 SOL + creator belum jual) memprediksi peak ≥2x dengan hit
rate ~60% (vs base rate 25,5%). Tapi semua varian TP/SL dan trailing-stop
yang diuji offline masih net-negatif setelah fee — karena analisis offline
mengabaikan latensi 2 slot, self-impact, dan cap 1% real reserve.

## Desain final (DEFAULT_PARAMS)

- Entry sekali per koin, diputus **tepat di umur 10 slot** sejak CreateEvent,
  lolos semua filter: ≥5 distinct non-creator buyer, net inflow ≥1,0 SOL,
  creator belum jual, harga vs create ≤**1,6x**, real SOL ≥0,3 SOL.
  Tape di-prune ke 50 slot terakhir.
- Size: satu buy 0,2 SOL per koin, dibatasi 1% real reserve dan kas bebas
  dikurangi tx fee. Tidak ada pyramid/add.
- Exit (dicek tiap batch, exit dulu sebelum entry): trailing stop 25% dari
  nilai tutup tertinggi sejak entry; hard stop **15%** dari cost; jual segera
  saat creator sell; max hold 600 slot. Nilai tutup dihitung
  `tokens*vq/(vt+tokens)*(1-0,0125) - txFee`, pakai marks bila ada, else curve.
  Buy slippage **10000 bps** (buy yang ditolak karena harga bergerak saat
  latensi justru membuang runner tercepat); sell 10000 bps.
- Guardrail: trade utama 0,2 SOL (>>0,01 SOL) jadi 20-koin guardrail
  terpenuhi dari trade biasa; probe 0,02 SOL (maks 1 bersamaan) hanya sebagai
  asuransi pacing (target 25 koin / 240 fills per 14.400 dtk block time),
  mengikuti pola pacing momentum.
- Deterministik: tanpa jam, tanpa random, tanpa network/env; iterasi hanya
  Map insertion-order dari stream batch. Buy yang gagal (seeded failed tx
  2%) tidak dihitung sebagai entry — koin boleh dicoba lagi selama masih
  dalam jendela umur.

## Kenapa angka ini (bukan tebakan)

- v1 (umur 3–10, cap 2,5x, slip 1500, SL 20%): **−1,75 SOL** di dev
  (334 trip, 64 win, DD 22,5%). Sweep trail × SL × slip: semua sel
  −1,57…−1,90 — parameter exit bukan tuasnya.
- Tuasnya adalah **cap harga entry**: sweep maxPriceMult × minAge
  menemukan plateau positif di (cap 1,6–1,8, umur 10): +0,22…+0,48 SOL.
  Membeli koin yang sudah lari >2x lalu dump ke lantai adalah sumber
  kerugian terbesar v1 (trip terburuk −0,10 SOL); cap 1,6x memotongnya
  (trip terburuk −0,03 SOL).
- Jendela umur: [10,10] (+0,48) > [10,11] (+0,44) > [10,12] (+0,37) —
  makin selektif makin baik; umur 12+ (probe saja) −0,12.
- Exit params datar: trail 0,2–0,4 / SL 0,15–0,2 / hold 600–1500 semua
  +0,40…+0,48 — dipilih titik tengah plateau (0,25 / 0,15 / 600).
- minRqSol dan stakeSol tidak berpengaruh (buy selalu terikat cap 1%
  real reserve) — dibiarkan di default.

## Hasil verifikasi (26 Nov 2026, koordinator)

Local sim (`tools/backtest.ts`, engine port kit) — final params:
**net +0,489 SOL, fills 285, coins 65, trips 143, wins 18, max DD 2,2%,
rejected 0, failed 8; tanpa failed-tx +0,482; di 2x fee +0,350.**
Determinisme: 2x run identik byte-per-angka. Sweep mean atas 4 fail key:
+0,482 (worst +0,476). Guardrail: 65 koin ≥ 20, DD 2,2% ≤ 50%.

**Kelemahan jujur (baca sebelum submit):**
- Profit terkonsentrasi: trip terbaik +0,584 SOL; tanpa trip itu net
  −0,102 (exBest), tanpa 2 terbaik −0,193. Bot ini menangkap 1 runner
  besar per window + banyak kerugian kecil (median trip −0,004 SOL).
  Di final window yang tidak punya runner sebesar itu, net bisa negatif.
- Semua angka in-sample dev window (2–3 Nov 2026). Final window adalah
  data baru house — risiko overfitting nyata, terutama pada band entry
  1,6x/umur 10 yang dipilih dari sweep. Stress test (grade-local --stress)
  adalah ukuran ketahanannya — lihat hasil di bawah.

## Status grade-local / stress (26 Nov 2026, koordinator)

`grade-local --driver process` (grader asli, 2 eksekusi):
**net +0,476 SOL (return +4,8%), 90% interval −0,265…+1,624 SOL.
287 fills, 66 koin, 144 round trip, win rate 11,1%, max DD 2,3%,
0 rejected, 7 failed. Fee kurva 0,108 + tx 0,031 SOL; di 2x fee net
+0,332 SOL. Guardrail lolos (66 koin ≥ 0,01 SOL/round trip).
L1 regrade reproduced byte for byte (deterministik).**
3 koin terbaik bikin 91% gain; tanpa mereka net −0,27 SOL.
(Local sim: +0,489 — selisih hanya seed fail-draw.)

`grade-local --stress 20` (20 copy dev window yang dibangun ulang):
**median −0,137 SOL, p10 −0,247 SOL, p90 −0,001 SOL; 18/20 copy ≤ 0;
dev rank 20 dari 21 (skor dev di atas SEMUA copy). Dua warning resmi
menyala: "dev score is above 90% of the rebuilt copies" dan
"half or more of the rebuilt copies lost money".**
Artinya: skor dev +0,48 bersandar berat pada koin-koin spesifik window
ini (terutama 1 trip +0,584 SOL). Di window final (data baru) hasil
tipikal adalah rugi kecil (−0,14 median stress), dengan upside bila
ada runner sebesar itu lagi. Ini BUKAN janji profit — ini tiket lotre
dengan ekspektasi mendekati impas dan ekor kanan gemuk.
