# Peak Rider — Iteration Log (scratch copy, learning only — NO submit)

Baseline v1 = submitted entry (commit 2853860): dev +0,476 SOL, stress 20 copy
median −0,14 SOL, p10 −0,25, p90 0,00, 18/20 copy rugi, top 3 koin = 91%.
Gate: median stress ≥ 0. Max 3 ronde, satu perubahan per ronde.

## Ronde 1 — Sizing koreksi (commit ac6b7bc)

- **Diubah (SATU-SATUNYA):** `stakeSol` 0,2 → 0,05 SOL/koin. Entry/exit tidak berubah.
- **Kenapa:** Fase 1 v2 — v1 0,2 SOL = 2% modal, 4x aturan maks 0,5%/koin.
- **Catatan:** harness cap posisi terbuka = 5 (bukan 10), jadi maksimal
  ter-deploy 5 × 0,05 = 0,25 SOL = 2,5% modal. Cap 10 posisi tidak mengikat.
- **Backtest lokal (dev):** net +0,2976 SOL (v1 +0,4893), 143 trip, 18 win,
  dd 1,73% (v1 2,19%). Sama persis dengan pengukuran Fase 1 v2 (stake 0,05).
- **Grade-local (commit ac6b7bc):** dev net +0,2851 SOL (+2,85%),
  interval 90% −0,247…+1,109; top 3 = 90% (v1 91%), tanpa mereka −0,24
  (v1 −0,27); fee 0,096 kurva + 0,031 tx; 2x fee → +0,155.
  Stress 20: **median −0,14, p10 −0,20, p90 −0,03; 18/20 rugi**; dev di atas
  20/20. result_sha256 cd6e52ae…
- **Verdict: GATE GAGAL (median −0,14 < 0).** Sizing saja TIDAK menggeser
  distribusi stress (v1 median juga −0,14; p10 −0,25→−0,20, p90 0,00→−0,03).
- **Diagnosis:** bleed-nya per-trip (fee + adverse kecil di koin tipikal),
  bukan ukuran stake. Strategi rugi −0,24 di 62 koin non-outlier; potong stake
  mengecilkan gain DAN rugi, dan % return membaik (price impact lebih kecil),
  jadi distribusi stress hampir tidak bergerak. Perbaikan harus memotong
  JUMLAH trip marginal yang rugi → Ronde 2: selektivitas entry.
- **Pelajaran proses:** grade-local pertama dijalankan SEBELUM commit dan
  malah menilai commit v1 (result_sha256 3b5e6290, identik v1) — grade-local
  menilai HEAD secara default. Commit dulu baru grade (atau pakai --worktree).

## Ronde 2 — Selektivitas entry: minBuyers 5 → 8 (SEDANG JALAN)

- **Dipilih dari data Ronde 1:** sweep entry (27 kombinasi) — minNetSol TIDAK
  berpengaruh (1/2/3 SOL hasil identik, filter tidak pernah mengikat);
  maxPriceMult 1,4/1,3 semuanya negatif (1,6 terbaik); minBuyers 8 puncak.
- **Sweep minBuyers (dev, mean 4 fail key):** 6 → +0,313 (exBest −0,106);
  7 → +0,314 (exBest −0,104); **8 → +0,327 (exBest −0,092)**; 9 → +0,292
  (exBest −0,127); 10 → −0,111 (exBest −0,170, jurang — winner ikut terpotong).
  Baseline minBuyers 5: +0,291 (exBest −0,128). Jadi 8 memotong 6 trip
  (145→139) dan 2 win (18→16) tapi net NAIK +0,036 — trip yang dipotong
  adalah net loser.
- **Diubah (SATU-SATUNYA):** `minBuyers` 5 → 8. stakeSol tetap 0,05.
- **Backtest lokal (dev):** net +0,3333 SOL (R1 +0,2976), 137 trip, 16 win,
  dd 1,61% (R1 1,73%). Sweep (mean 4 fail key): +0,327, exBest −0,092.
- **Grade-local (commit 705167c):** dev net +0,3208 SOL (+3,21%),
  interval 90% −0,204…+1,148; top 3 = 91% (R1 90%), tanpa mereka −0,20
  (R1 −0,24); fee 0,089 kurva + 0,030 tx; 2x fee → +0,199.
  Stress 20: **median −0,13, p10 −0,17, p90 −0,01; 18/20 rugi**; dev di atas
  20/20. result_sha256 6ca8fbec…
- **Verdict: GATE GAGAL (median −0,13 < 0).** Perbaikan hanya +0,01 vs R1.
  Distribusi mengetat (p10 −0,20→−0,17, p90 −0,03→−0,01; 2 copy positif
  vs 1 di R1) tapi median bandel: copy tipikal (tanpa outlier) tetap rugi
  ~0,13 karena bleed koin tipikal masih −0,20 di dev window. Untuk median ≥ 0,
  koin tipikal harus impas/untung — butuh perbaikan ~+0,20 di dev non-outlier.
- **Ronde 3 (terakhir):** exit lebih ketat (satu-satunya tuas tersisa) —
  sweep trailPct × stopLossPct dulu, pilih yang exBest-nya tertinggi.

## Ronde 3 — Matikan guardrail probe: maxProbes 1 → 0 (SEDANG JALAN)

- **Exit ternyata MATI (sweep-bukti):** trailPct 0,05–0,25, stopLossPct
  0,07–0,15, maxHoldSlots 15–600 — SEMUA identik. Koin nyaris tidak bergerak
  (drift ~1%), jadi tidak ada parameter exit yang mengikat; exit didominasi
  creator-dump. minNetSol + minRqSol juga mati; umur entry 10 slot optimal
  (20/30 dan window lebar semuanya lebih buruk).
- **Temuan:** probe guardrail (beli 0,02 SOL di mint APAPUN tanpa filter,
  jual langsung) = pure fee drag. ~117 probe round trip merugikan ~0,114 SOL.
- **Sweep maxProbes:** 1 → dev mean +0,327, exBest −0,092, 275 fill / 60 koin
  / 139 trip / 16 win; **0 → dev mean +0,441, exBest +0,022 (POSITIF,
  pertama kali), 41 fill / 21 koin / 22 trip / 8 win.**
- **Diubah (SATU-SATUNYA):** `maxProbes` 1 → 0. stakeSol 0,05, minBuyers 8 tetap.
- **Risiko dicatat:** guardrail min_distinct_mints = 20; dev memberi 21 koin
  (hanya 1 di atas garis). min_fills = 0, aman. Perhatikan di stress copy.
- **Backtest lokal (dev):** net +0,4456 SOL (R2 +0,3333), 20 trip, 8 win,
  dd 1,18% (R2 1,61%). **Koin = 20 — TEPAT di garis guardrail
  min_distinct_mints = 20.** Sweep (mean 4 fail key): +0,441, exBest +0,022.
- **Grade-local (commit 5d86c89):** dev net +0,4387 SOL (+4,39%),
  interval 90% −0,089…+1,261; top 3 = 92% (R2 91%), tanpa mereka −0,09
  (R2 −0,20); fee 0,032 kurva + 0,0045 tx (anjlok — jauh lebih sedikit trade);
  2x fee → +0,397.
  Stress 20: **median −0,02, p10 −0,08, p90 +0,09; 12/20 rugi, 8/20 untung**;
  dev di atas 20/20. result_sha256 c189930b…
- **Verdict AKHIR: GATE GAGAL — median −0,02 < 0, selisih 0,02 SOL.**
  Tapi ini perbaikan besar: median −0,14 → −0,02; p10 −0,25 → −0,08;
  p90 0,00 → +0,09; copy untung 1 → 8; copy rugi 18 → 12.
  Dev net +0,285 (R1) → +0,321 (R2) → +0,439 (R3).
  3 ronde habis. JANGAN dipaksa lolos — tidak ada ronde ke-4.

## Diagnosis akhir (setelah 3 ronde)

- **Akar masalah v1:** bukan sizing, bukan selektivitas entry semata, tapi
  **probe guardrail** — ~117 round trip 0,02 SOL di mint acak (tanpa filter),
  masing-masing rugi fee ~2,9%, total drag ~0,114 SOL. Mematikannya adalah
  perbaikan terbesar (median −0,13 → −0,02).
- **Struktur strategi:** lotre — masuk umur 10 slot, keluar saat creator dump
  (dalam ~15 slot, drift harga ~1%). Koin tipikal nyaris tidak bergerak;
  edge hanya dari 3 outlier (92% gain). Fee 2,5%/round trip adalah biaya
  tetap tiap tiket lotre.
- **Risiko untuk submit ulang (jika user memutuskan):** koin = 20, TEPAT di
  garis min_distinct_mints = 20. Di window final (data lain), koin bisa
  < 20 dan guardrail GAGAL → skor 0. Ini risiko nyata yang harus
  dipertimbangkan sebelum submit ulang. Entry yang sudah di-submit (v1)
  TIDAK disentuh selama iterasi ini.
