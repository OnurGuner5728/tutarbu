# Statik Sabit Envanteri (Otomatik)

Tarama kökü: `src/engine, src/metrics, src/services`  
Toplam şüpheli literal: **927**  
Etkilenen dosya: **33**  

> Bu rapor heuristic'tir. `MATH_OK` listesindeki literal'ler (0,1,2,0.5,100,90,60,45,30,15 vs.) dahil edilmez.
> Yine de bazı satırlar matematiksel kural olabilir (örn. `/2`, `+0.5` smoothing).
> Her satır insan tarafından şu üç kategoriye ayrılmalıdır:
>  - **MATH**: matematiksel kural (kalır)
>  - **DERIVABLE**: lig/veri istatistiğinden türetilebilir (dinamikleştirilmeli)
>  - **STATIC**: elle yazılmış davranışsal sabit (öğrenilmeli veya kaldırılmalı)

## Sıkça Görülen Literal Değerler

| Literal | Geçiş Sayısı |
|---|---|
| `3` | 132 |
| `5` | 79 |
| `4` | 75 |
| `50` | 66 |
| `10` | 56 |
| `20` | 42 |
| `-1.0` | 40 |
| `11` | 27 |
| `1000` | 23 |
| `0.01` | 22 |
| `2.5` | 18 |
| `3600` | 18 |
| `0.50` | 14 |
| `25` | 13 |
| `1.5` | 12 |
| `8` | 11 |
| `95` | 11 |
| `75` | 10 |
| `6` | 10 |
| `7` | 9 |
| `0.1` | 8 |
| `40` | 8 |
| `9` | 7 |
| `80` | 6 |
| `0.05` | 6 |
| `86400` | 5 |
| `0.3` | 5 |
| `2.0` | 5 |
| `0.15` | 5 |
| `0.001` | 4 |

## Dosya Bazlı Detay

### `src\engine\prediction-generator.js` — 101 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 33 | `5` | `const EDGE_DB_TTL = 5 * 60 * 1000; // 5 dakika` |  |
| 33 | `1000` | `const EDGE_DB_TTL = 5 * 60 * 1000; // 5 dakika` |  |
| 68 | `11` | `if (!p.substitute) { if (sc >= 11) return { ...p, substitute: true }; sc++; }` |  |
| 75 | `11` | `if (!p.substitute) { if (sc >= 11) return { ...p, substitute: true }; sc++; }` |  |
| 90 | `3` | `.filter(k => /^M\d{3}[a-z]?$/i.test(k))` |  |
| 133 | `1000` | `runs: baseline._ablationRuns \|\| 1000,` |  |
| 153 | `1000` | `? new Date(event.startTimestamp * 1000).toISOString() : '',` |  |
| 154 | `6` | `isLive: event?.status?.type === 'inprogress' \|\| (event?.status?.code >= 6 && event?.status?.code <` |  |
| 154 | `40` | `isLive: event?.status?.type === 'inprogress' \|\| (event?.status?.code >= 6 && event?.status?.code <` |  |
| 227 | `3` | `const _pHW = prediction.homeWinProbability ?? simDist.homeWin ?? (100 / 3);` |  |
| 228 | `3` | `const _pDW = prediction.drawProbability ?? simDist.draw ?? (100 / 3);` |  |
| 229 | `3` | `const _pAW = prediction.awayWinProbability ?? simDist.awayWin ?? (100 / 3);` |  |
| 230 | `3` | `const _sHW = simDist.homeWin ?? prediction.homeWinProbability ?? (100 / 3);` |  |
| 231 | `3` | `const _sDW = simDist.draw ?? prediction.drawProbability ?? (100 / 3);` |  |
| 232 | `3` | `const _sAW = simDist.awayWin ?? prediction.awayWinProbability ?? (100 / 3);` |  |
| 260 | `3` | `: [1 / 3, 1 / 3, 1 / 3];` |  |
| 260 | `3` | `: [1 / 3, 1 / 3, 1 / 3];` |  |
| 260 | `3` | `: [1 / 3, 1 / 3, 1 / 3];` |  |
| 312 | `0.05` | `if (_ldT != null && _ldT > 0 && Math.abs(_ldT - 1) > 0.05) {` |  |
| 325 | `3` | `const _DOMINANCE = 2 / 3;` |  |
| 375 | `10` | `? Math.max(1, _lgCVForEdge * 10)  // CV=0.3 → 3; CV=0.5 → 5; CV=1.0 → 10` |  |
| 376 | `3` | `: 3;` |  |
| 384 | `0.10` | `? Math.min(0.10, Math.max(0.02, _lgCVForEdge * 0.10))` |  |
| 384 | `0.02` | `? Math.min(0.10, Math.max(0.02, _lgCVForEdge * 0.10))` |  |
| 384 | `0.10` | `? Math.min(0.10, Math.max(0.02, _lgCVForEdge * 0.10))` |  |
| 385 | `0.05` | `: 0.05;` |  |
| 416 | `3` | `? (100 / 3) + (_lgDrawRate * 100) // ligin beraberlik oranı arttıkça eşik artar` |  |
| 417 | `3` | `: (cv != null ? (100 / 3) + cv * (100 / 3) : 50); // cv varsa ondan, yoksa %50` |  |
| 417 | `3` | `: (cv != null ? (100 / 3) + cv * (100 / 3) : 50); // cv varsa ondan, yoksa %50` |  |
| 417 | `50` | `: (cv != null ? (100 / 3) + cv * (100 / 3) : 50); // cv varsa ondan, yoksa %50` |  |
| 423 | `3` | `? (100 / 3) * (1 + 1 / _compIdx) // compIndex=3 → 44.4, compIndex=5 → 40` |  |
| 424 | `3` | `: (_lgDrawRate != null ? (100 / 3) + (_lgDrawRate * 200) : (100 / 3) * 2); // drawRate=0.25 → 83.3` |  |
| 424 | `200` | `: (_lgDrawRate != null ? (100 / 3) + (_lgDrawRate * 200) : (100 / 3) * 2); // drawRate=0.25 → 83.3` |  |
| 424 | `3` | `: (_lgDrawRate != null ? (100 / 3) + (_lgDrawRate * 200) : (100 / 3) * 2); // drawRate=0.25 → 83.3` |  |
| 450 | `5` | `.slice(0, 5)` |  |
| 543 | `2.5` | `.filter(([score]) => { const [h, a] = score.split('-').map(Number); return h + a > 2.5; })` |  |
| 559 | `0.2` | `if (_lfOver25 != null && _lfRel_ou > 0.2) {` |  |
| 560 | `20` | `_ou25Sources.push({ val: _lfOver25 * 100, w: _lfRel_ou * 20 });` |  |
| 562 | `3` | `if (homeScoreProfile?.over25Rate != null && (homeScoreProfile.n \|\| 0) >= 3) {` |  |
| 565 | `3` | `if (awayScoreProfile?.over25Rate != null && (awayScoreProfile.n \|\| 0) >= 3) {` |  |
| 584 | `2.5` | `? poissonExceed(baseline.leagueAvgGoals * 2, 2.5)` |  |
| 610 | `0.2` | `if (_lfBTTS != null && _lfRel_ou > 0.2) {` |  |
| 611 | `20` | `_bttsSources.push({ val: _lfBTTS * 100, w: _lfRel_ou * 20 });` |  |
| 613 | `3` | `if (homeScoreProfile?.bttsRate != null && (homeScoreProfile.n \|\| 0) >= 3) {` |  |
| 616 | `3` | `if (awayScoreProfile?.bttsRate != null && (awayScoreProfile.n \|\| 0) >= 3) {` |  |
| 626 | `3` | `if (_teamN >= 3) _bttsSources.push({ val: _bttsTeamSignal, w: _teamN * 0.5 });` |  |
| 719 | `50` | `if (total <= 0) return { homeScoresFirst: 50, awayScoresFirst: 50 };` |  |
| 719 | `50` | `if (total <= 0) return { homeScoresFirst: 50, awayScoresFirst: 50 };` |  |
| 1009 | `1000` | `startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',` |  |
| 1028 | `1000` | `startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',` |  |
| 1034 | `1000` | `startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',` |  |
| 1059 | `0.05` | `const _seEdge = Math.sqrt(0.05 / Math.max(lgData.n, 1)); // standard error` |  |
| 1060 | `1.5` | `if (lgData.edge > 1.5 * _seEdge && lgData.n >= 5) {` |  |
| 1060 | `5` | `if (lgData.edge > 1.5 * _seEdge && lgData.n >= 5) {` |  |
| 1062 | `50` | `const penalty = Math.min(50, Math.round(lgData.edge * 500));` |  |
| 1062 | `500` | `const penalty = Math.min(50, Math.round(lgData.edge * 500));` |  |
| 1063 | `10` | `report.result.confidence = Math.max(10, report.result.confidence - penalty);` |  |
| 1067 | `-1.5` | `} else if (lgData.edge < -1.5 * _seEdge && lgData.n >= 5) {` |  |
| 1067 | `5` | `} else if (lgData.edge < -1.5 * _seEdge && lgData.n >= 5) {` |  |
| 1069 | `25` | `const boost = Math.min(25, Math.round(Math.abs(lgData.edge) * 300));` |  |
| 1069 | `300` | `const boost = Math.min(25, Math.round(Math.abs(lgData.edge) * 300));` |  |
| 1071 | `95` | `report.result.confidence = Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB \|\| 95, report.result.co` |  |
| 1086 | `0.50` | `if (tData.accBTTS > 0.50 && tData.n >= 2 && report.goals.btts > 50) {` |  |
| 1086 | `50` | `if (tData.accBTTS > 0.50 && tData.n >= 2 && report.goals.btts > 50) {` |  |
| 1087 | `0.50` | `const m = 1.0 + (tData.accBTTS - 0.50);` |  |
| 1089 | `0.80` | `if (tData.accBTTS >= 0.80) edgeMeta.premiumBTTS = true;` |  |
| 1091 | `0.50` | `} else if (tData.accBTTS < 0.50 && tData.n >= 2 && report.goals.btts > 50) {` |  |
| 1091 | `50` | `} else if (tData.accBTTS < 0.50 && tData.n >= 2 && report.goals.btts > 50) {` |  |
| 1092 | `0.50` | `const m = 0.50 + tData.accBTTS;` |  |
| 1098 | `0.1` | `if (tData.xgRatio && Math.abs(tData.xgRatio - 1.0) > 0.1 && tData.n >= 2) {` |  |
| 1111 | `20` | `report.goals.btts = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB \|\| 95, report.goa` |  |
| 1111 | `95` | `report.goals.btts = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB \|\| 95, report.goa` |  |
| 1119 | `20` | `report.goals.over25 = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB \|\| 95, report.g` |  |
| 1119 | `95` | `report.goals.over25 = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB \|\| 95, report.g` |  |
| 1225 | `6` | `topCases: (_learned.debugTopCases \|\| []).slice(0, 6),` |  |
| 1234 | `1000` | `: Math.floor(Date.now() / 1000);` |  |
| 1338 | `7` | `const MAX_GOALS = 7;` |  |
| 1356 | `1e-8` | `if (prob > 1e-8) {` |  |
| 1372 | `0.999` | `if (totalProb > 0 && totalProb < 0.999) {` |  |
| 1390 | `5` | `const topHTScores = sortedHT.slice(0, 5).map(([k, v]) => ({ score: k, prob: round2(v * 100) }));` |  |

_(+21 kayıt kısaltıldı)_

### `src\metrics\advanced-derived.js` — 90 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 58 | `0.01` | `const hConf = Math.max(0.01, getConfidence(hRaw));` |  |
| 59 | `0.01` | `const aConf = Math.max(0.01, getConfidence(aRaw));` |  |
| 125 | `1000` | `const EPS = (leagueAvgGoals > 0) ? leagueAvgGoals / 1000 : 0.001;` |  |
| 125 | `0.001` | `const EPS = (leagueAvgGoals > 0) ? leagueAvgGoals / 1000 : 0.001;` |  |
| 178 | `0.2` | `const psiFactor = psiFrag > 0 ? 1.0 / Math.max(psiFrag, 0.2) : 1.0; // invert: 0.4 kırılganlık → 2.5` |  |
| 217 | `20` | `? leagueAvgGoals * (allMetrics.leagueTeamCount ?? 20) * (1.0 + (den / (vol + den)))` |  |
| 218 | `20` | `: (leagueAvgGoals != null ? leagueAvgGoals * (allMetrics.leagueTeamCount ?? 20) : null);` |  |
| 282 | `5` | `const xgW = Math.min(5, matchCount \|\| 5);` |  |
| 282 | `5` | `const xgW = Math.min(5, matchCount \|\| 5);` |  |
| 288 | `20` | `const specW = Math.max(1, Math.floor((matchCount \|\| 20) / 2));` |  |
| 361 | `0.85` | `? clamp(_cv * _densW, _cv * _cv * 0.5, _cv * 0.85) // alt: CV²/2, üst: 0.85×CV` |  |
| 384 | `0.15` | `const cvEstimate = clamp(spread / (leagueAvgGoals * 2), 0.15, 0.55);` |  |
| 384 | `0.55` | `const cvEstimate = clamp(spread / (leagueAvgGoals * 2), 0.15, 0.55);` |  |
| 390 | `0.18` | `return leagueAvgGoals * clamp(Math.abs(leagueAvgGoals - dynM001) / leagueAvgGoals, 0.18, 0.50);` |  |
| 390 | `0.50` | `return leagueAvgGoals * clamp(Math.abs(leagueAvgGoals - dynM001) / leagueAvgGoals, 0.18, 0.50);` |  |
| 401 | `3` | `? Math.max(leagueAvgGoals + _volForMax * 3, leagueAvgGoals * _lambdaCeilMult)` |  |
| 403 | `3` | `? leagueAvgGoals + _volForMax * 3` |  |
| 564 | `0.3` | `if (_lfRel_B > 0.3 && leagueFingerprint.leagueAvgGoals != null && leagueFingerprint.leagueAvgGoals >` |  |
| 575 | `3` | `referenceReliability = (matchScoreProfile.n \|\| 0) / ((matchScoreProfile.n \|\| 0) + 3);` |  |
| 579 | `0.35` | `referenceReliability = 0.35; // standings veri her zaman mevcut ama tek referans olarak zayıf` |  |
| 590 | `0.20` | `const _tol = (_cv != null && _cv > 0) ? Math.min(0.20, _cv * 0.5) : 0.05;` |  |
| 590 | `0.05` | `const _tol = (_cv != null && _cv > 0) ? Math.min(0.20, _cv * 0.5) : 0.05;` |  |
| 635 | `2.0` | `const normAvg = clamp(vals.reduce((a, b) => a + b, 0) / vals.length, 0.5, 2.0);` |  |
| 636 | `50` | `return normAvg * 50;` |  |
| 641 | `50` | `const M157_home = homeUnits.SAVUNMA_DIRENCI * 50;` |  |
| 642 | `50` | `const M157_away = awayUnits.SAVUNMA_DIRENCI * 50;` |  |
| 643 | `50` | `const M158_home = homeUnits.FORM_KISA * 50;` |  |
| 644 | `50` | `const M158_away = awayUnits.FORM_KISA * 50;` |  |
| 645 | `50` | `const M159_home = homeUnits.KADRO_DERINLIGI * 50;` |  |
| 646 | `50` | `const M159_away = awayUnits.KADRO_DERINLIGI * 50;` |  |
| 647 | `50` | `const M160_home = homeUnits.GK_REFLEKS * 50;` |  |
| 648 | `50` | `const M160_away = awayUnits.GK_REFLEKS * 50;` |  |
| 651 | `50` | `const M161 = homeUnits.HAKEM_DINAMIKLERI * 50;` |  |
| 654 | `50` | `const M162 = homeUnits.H2H_DOMINASYON * 50;` |  |
| 657 | `50` | `const M163 = homeUnits.TURNUVA_BASKISI * 50;` |  |
| 660 | `50` | `const M164_home = homeUnits.MOMENTUM_AKIŞI * 50;` |  |
| 661 | `50` | `const M164_away = awayUnits.MOMENTUM_AKIŞI * 50;` |  |
| 664 | `50` | `const M165_home = homeUnits.GOL_IHTIYACI * 50;` |  |
| 665 | `50` | `const M165_away = awayUnits.GOL_IHTIYACI * 50;` |  |
| 670 | `0.01` | `vals.reduce((prod, v) => prod * Math.max(v, 0.01), 1),` |  |
| 681 | `50` | `) * 50;` |  |
| 690 | `50` | `) * 50;` |  |
| 713 | `-0.10` | `if (leagueAvgGoals == null \|\| leagueAvgGoals <= 0) return -0.10;` |  |
| 721 | `0.25` | `?? ((allMetrics.leagueDrawTendency ?? 1.0) * 0.25);` |  |
| 724 | `7` | `for (let k = 0; k <= 7; k++) {` |  |
| 731 | `0.001` | `const raw = denom > 0.001 ? -(D_obs - D_poiss) / denom : -0.10; // denom ≈ 0 → hesaplama anlamsız, e` |  |
| 731 | `-0.10` | `const raw = denom > 0.001 ? -(D_obs - D_poiss) / denom : -0.10; // denom ≈ 0 → hesaplama anlamsız, e` |  |
| 733 | `-0.20` | `return Math.max(-0.20, Math.min(0.00, raw));` |  |
| 733 | `0.00` | `return Math.max(-0.20, Math.min(0.00, raw));` |  |
| 747 | `0.3` | `if (leagueFingerprint?.reliability > 0.3` |  |
| 762 | `0.50` | `const dispSignal = Math.min(0.50, (overdispersion - 1.0) / overdispersion);` |  |
| 763 | `0.50` | `const relFactor = _lfRel > 0 ? _lfRel : (_cv != null ? Math.min(0.50, _cv) : 0);` |  |
| 764 | `0.10` | `return Math.max(0.10, Math.min(0.45, dispSignal * relFactor * 2.5)); // Backtest: daha geniş skor ye` |  |
| 764 | `0.45` | `return Math.max(0.10, Math.min(0.45, dispSignal * relFactor * 2.5)); // Backtest: daha geniş skor ye` |  |
| 764 | `2.5` | `return Math.max(0.10, Math.min(0.45, dispSignal * relFactor * 2.5)); // Backtest: daha geniş skor ye` |  |
| 777 | `0.50` | `const _cvBoost = _cv != null ? Math.min(0.50, _cv * 1.2) : 0.30;` |  |
| 777 | `1.2` | `const _cvBoost = _cv != null ? Math.min(0.50, _cv * 1.2) : 0.30;` |  |
| 777 | `0.30` | `const _cvBoost = _cv != null ? Math.min(0.50, _cv * 1.2) : 0.30;` |  |
| 779 | `0.05` | `const _pwLower = Math.max(0.05, _nWeight * 0.15);` |  |
| 779 | `0.15` | `const _pwLower = Math.max(0.05, _nWeight * 0.15);` |  |
| 780 | `0.60` | `const _pwUpper = Math.min(0.60, 0.30 + _nWeight * 0.30);` |  |
| 780 | `0.30` | `const _pwUpper = Math.min(0.60, 0.30 + _nWeight * 0.30);` |  |
| 780 | `0.30` | `const _pwUpper = Math.min(0.60, 0.30 + _nWeight * 0.30);` |  |
| 794 | `0.01` | `if (homeScoreProfile && homeScoreProfile.stdScored > 0.01 && homeScoreProfile.n >= 5) {` |  |
| 794 | `5` | `if (homeScoreProfile && homeScoreProfile.stdScored > 0.01 && homeScoreProfile.n >= 5) {` |  |
| 796 | `2.5` | `if (deviation > 2.5) {` |  |
| 803 | `0.01` | `if (awayScoreProfile && awayScoreProfile.stdScored > 0.01 && awayScoreProfile.n >= 5) {` |  |
| 803 | `5` | `if (awayScoreProfile && awayScoreProfile.stdScored > 0.01 && awayScoreProfile.n >= 5) {` |  |
| 805 | `2.5` | `if (deviation > 2.5) {` |  |
| 841 | `1.5` | `if (total > 1.5) _over15 += sp.prob;` |  |
| 842 | `2.5` | `if (total > 2.5) _over25 += sp.prob;` |  |
| 843 | `3.5` | `if (total > 3.5) _over35 += sp.prob;` |  |
| 890 | `0.01` | `const _bttsDiv = Math.abs(P_btts_raw - bttsOddsProb) / Math.max(P_btts_raw, bttsOddsProb, 0.01);` |  |
| 891 | `0.1` | `const _bttsOddsRel = Math.max(0.1, 1 - _bttsDiv); // min 0.1 güven korunur` |  |
| 898 | `0.01` | `const divergence = Math.abs(P_btts_raw - E_btts) / Math.max(P_btts_raw, E_btts, 0.01);` |  |
| 921 | `0.01` | `const divergence = Math.abs(P_over25_raw - E_ou25) / Math.max(P_over25_raw, E_ou25, 0.01);` |  |
| 934 | `10` | `const matchSampleRatio = Math.min(1.0, Math.min(homeMatchCount, awayMatchCount) / 10);` |  |
| 935 | `168` | `const metricFillingRatio = (allMetricIds?.size \|\| allMetricIds?.length \|\| 0) / 168;` |  |
| 939 | `40` | `(40 * matchSampleRatio) + (60 * metricFillingRatio),` |  |
| 940 | `10` | `10,` |  |

_(+10 kayıt kısaltıldı)_

### `src\engine\match-simulator.js` — 89 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 27 | `3` | `{ id: 'M011', weight: 3, sign: 1 }, { id: 'M012', weight: 2, sign: 1 },` |  |
| 32 | `3` | `{ id: 'M015', weight: 3, sign: 1 }, { id: 'M017', weight: 2, sign: 1 },` |  |
| 33 | `3` | `{ id: 'M021', weight: 3, sign: 1 }, { id: 'M070', weight: 3, sign: 1 },` |  |
| 33 | `3` | `{ id: 'M021', weight: 3, sign: 1 }, { id: 'M070', weight: 3, sign: 1 },` |  |
| 37 | `3` | `{ id: 'M013', weight: 3, sign: 1 }, { id: 'M014', weight: 3, sign: 1 },` |  |
| 37 | `3` | `{ id: 'M013', weight: 3, sign: 1 }, { id: 'M014', weight: 3, sign: 1 },` |  |
| 54 | `3` | `{ id: 'M026', weight: 3, sign: -1 }, { id: 'M028', weight: 3, sign: 1 },` |  |
| 54 | `3` | `{ id: 'M026', weight: 3, sign: -1 }, { id: 'M028', weight: 3, sign: 1 },` |  |
| 62 | `3` | `{ id: 'M096', weight: 3, sign: 1 }, { id: 'M098', weight: 3, sign: 1 },` |  |
| 62 | `3` | `{ id: 'M096', weight: 3, sign: 1 }, { id: 'M098', weight: 3, sign: 1 },` |  |
| 72 | `4` | `{ id: 'M064', weight: 4, sign: 1 }, { id: 'M165', weight: 3, sign: 1 },` |  |
| 72 | `3` | `{ id: 'M064', weight: 4, sign: 1 }, { id: 'M165', weight: 3, sign: 1 },` |  |
| 77 | `4` | `{ id: 'M065', weight: 4, sign: 1 }, { id: 'M043', weight: 2, sign: 1 },` |  |
| 81 | `3` | `{ id: 'M042', weight: 3, sign: 1 }, { id: 'M041', weight: 2, sign: 1 },` |  |
| 86 | `3` | `{ id: 'M040', weight: 3, sign: -1 }` |  |
| 89 | `3` | `{ id: 'M146', weight: 3, sign: 1 }, { id: 'M149', weight: 2, sign: 1 },` |  |
| 96 | `3` | `{ id: 'M046', weight: 3, sign: 1 }, { id: 'M049', weight: 2, sign: 1 },` |  |
| 100 | `3` | `{ id: 'M047', weight: 3, sign: 1 }, { id: 'M048', weight: 2, sign: 1 },` |  |
| 104 | `3` | `{ id: 'M062', weight: 3, sign: 1 }, { id: 'M031', weight: 2, sign: -1 },` |  |
| 112 | `3` | `{ id: 'M139', weight: 2, sign: 1 }, { id: 'M140', weight: 3, sign: 1 }` |  |
| 115 | `3` | `{ id: 'M141', weight: 3, sign: 1 }, { id: 'M170', weight: 3, sign: 1 }` |  |
| 115 | `3` | `{ id: 'M141', weight: 3, sign: 1 }, { id: 'M170', weight: 3, sign: 1 }` |  |
| 118 | `4` | `{ id: 'M171', weight: 4, sign: 1 },` |  |
| 119 | `3` | `{ id: 'M172', weight: 3, sign: 1 },` |  |
| 126 | `3` | `{ id: 'M025', weight: 3, sign: 1 }, { id: 'M150', weight: 3, sign: 1 },` |  |
| 126 | `3` | `{ id: 'M025', weight: 3, sign: 1 }, { id: 'M150', weight: 3, sign: 1 },` |  |
| 139 | `3` | `{ id: 'M119', weight: 2, sign: 1 }, { id: 'M122', weight: 3, sign: 1 }` |  |
| 142 | `3` | `{ id: 'M111', weight: 2, sign: 1 }, { id: 'M118b', weight: 3, sign: 1 },` |  |
| 444 | `2.0` | `if (sign === -1) normalized = 2.0 - normalized;` |  |
| 483 | `11` | `if (count >= 11) break;` |  |
| 493 | `11` | `if (count >= 11) break;` |  |
| 501 | `1000` | `const EPS = (baseline?.leagueAvgGoals \|\| 1) / 1000;` |  |
| 588 | `0.15` | `const _gkRatioSpan = (_lgCV_sim != null && _lgCV_sim > 0) ? _lgCV_sim : 0.15;` |  |
| 589 | `0.01` | `if (_refCSR != null && _refCSR > 0.01) {` |  |
| 737 | `0.01` | `const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;` |  |
| 737 | `0.01` | `const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;` |  |
| 751 | `1000` | `const _sdEPS = (baseline.leagueAvgGoals \|\| 1) / 1000;` |  |
| 758 | `2.0` | `: (DYN_LIMITS?.POWER?.MAX != null ? DYN_LIMITS.POWER.MAX + (1.0 - (DYN_LIMITS?.POWER?.MIN ?? 1.0)) :` |  |
| 870 | `1000` | `const _sddEPS = (baseline.leagueAvgGoals \|\| 1) / 1000;` |  |
| 942 | `20` | `const _fatTeamN = leagueTeamCount ?? 20; // null koruması — bölücüde kullanılıyor` |  |
| 975 | `20` | `const earlyPhaseRatio = minute / (earlyBase \|\| 20);` |  |
| 979 | `75` | `const latePhaseAmplifier = Math.max(1.0, Math.pow(minute / (lateBase \|\| 75), urgencyExcess + 1.0))` |  |
| 1022 | `4` | `: _pRange / (4 * _mRange))` |  |
| 1034 | `22` | `?? (_earlyFraction != null && _earlyFraction > 0 ? Math.round(_matchMins * _earlyFraction) : Math.ro` |  |
| 1035 | `5` | `const lateBase = dynamicTimeWindows?.LATE_GAME_START ?? Math.round(_matchMins * 5 / 6); // ~75 for 9` |  |
| 1035 | `6` | `const lateBase = dynamicTimeWindows?.LATE_GAME_START ?? Math.round(_matchMins * 5 / 6); // ~75 for 9` |  |
| 1055 | `95` | `for (let minute = 1; minute <= 95; minute++) {` |  |
| 1062 | `46` | `if (minute === 46) {` |  |
| 1100 | `3` | `const _minSigma = _lgPace * 3;` |  |
| 1109 | `4` | `+ _hSigma * (state.home.territory - 0.5) * 4` |  |
| 1110 | `3` | `+ _hSigma * state.home.tacticalStance * 3` |  |
| 1113 | `4` | `+ _aSigma * (state.away.territory - 0.5) * 4` |  |
| 1114 | `3` | `+ _aSigma * state.away.tacticalStance * 3` |  |
| 1119 | `50` | `const _normalizedBase = _rawPossSum > 0 ? (_hMatchPoss / _rawPossSum) * 100 : 50;` |  |
| 1133 | `2.0` | `? baseline.normMaxRatio + (1.0 - baseline.normMinRatio) : 2.0;` |  |
| 1140 | `95` | `const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);` |  |
| 1144 | `95` | `const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);` |  |
| 1152 | `95` | `const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);` |  |
| 1161 | `95` | `const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);` |  |
| 1194 | `3` | `const _velCapThreshold = Math.max(3, Math.ceil((baseline.leagueAvgGoals ?? 2.5) * 2));` |  |
| 1194 | `2.5` | `const _velCapThreshold = Math.max(3, Math.ceil((baseline.leagueAvgGoals ?? 2.5) * 2));` |  |
| 1197 | `2.5` | `? 1.0 / (1.0 + _velExcess / Math.max(baseline.leagueAvgGoals ?? 2.5, 1))` |  |
| 1214 | `76` | `} else if (minute >= 76 && _ltR != null) {` |  |
| 1215 | `0.33` | `timeWindowMult = clamp(1.0 + (_ltR - 0.33) * _twSens, 1.0 - _twSens, 1.0 + _twSens);` |  |
| 1243 | `0.99` | `const rawGkAdj = (defGKSave != null && _baseGKSave != null && _baseGKSave < 0.99)` |  |
| 1244 | `0.01` | `? (1 - defGKSave) / Math.max(1 - _baseGKSave, 0.01)` |  |
| 1246 | `0.01` | `const gkAdj = Math.sqrt(Math.max(rawGkAdj, 0.01));` |  |
| 1262 | `0.1` | `0.1 // minimum 0.1 gol/maç — sıfıra bölme koruması` |  |
| 1269 | `0.1` | `0.1` |  |
| 1308 | `0.15` | `const _gkRatio = (baseline.leagueAvgGoals ?? 1) / ((baseline.shotsPerMin ?? 0.15) * 90); // gol/şut ` |  |
| 1381 | `5` | `const _yMax = _lgYellow * 5;` |  |
| 1382 | `5` | `const _rMax = _lgRed * 5;` |  |
| 1450 | `46` | `const comfortOffset = Math.max(0, (1.0 - moraleDeficit - urgencyExcess) * (lateBase - 46));` |  |
| 1451 | `46` | `const subStartMinute = 46 + comfortOffset;` |  |
| 1456 | `95` | `const remainingMinutes = Math.max(1, 95 - minute + 1);` |  |
| 1551 | `3` | `const _fpHSigma = _fpLgScale * 3 + Math.abs(_fpH - _fpLgAvg) * _fpLgScale * 2;` |  |
| 1552 | `3` | `const _fpASigma = _fpLgScale * 3 + Math.abs(_fpA - _fpLgAvg) * _fpLgScale * 2;` |  |
| 1554 | `4` | `const _fpHMatch = _fpH + _fpHSigma * (homeUnits.TOPLA_OYNAMA - 1.0) * 4;` |  |
| 1555 | `4` | `const _fpAMatch = _fpA + _fpASigma * (awayUnits.TOPLA_OYNAMA - 1.0) * 4;` |  |
| 1558 | `50` | `_fpSum > 0 ? (_fpHMatch / _fpSum) * 100 : 50,` |  |

_(+9 kayıt kısaltıldı)_

### `src\metrics\contextual.js` — 79 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 65 | `9` | `const isMatchGoals = mId === 9 \|\| mId === 11 \|\| mName.includes('over/under') \|\| mName.includes` |  |
| 65 | `11` | `const isMatchGoals = mId === 9 \|\| mId === 11 \|\| mName.includes('over/under') \|\| mName.includes` |  |
| 79 | `17` | `if (mId === 17 \|\| mName.includes('asian handicap') \|\| mName.includes('asian')) {` |  |
| 95 | `4` | `if (mId === 4 \|\| mName.includes('draw no bet') \|\| mName.includes('dnb')) {` |  |
| 107 | `29` | `const isBTTS = mId === 29 \|\| mId === 28 \|\|` |  |
| 107 | `28` | `const isBTTS = mId === 29 \|\| mId === 28 \|\|` |  |
| 126 | `50` | `let M135 = 50, M136 = null, M137 = 50;` |  |
| 126 | `50` | `let M135 = 50, M136 = null, M137 = 50;` |  |
| 144 | `80000` | `const M138 = (capacity != null && capacity > 0) ? Math.min(capacity / 80000, 1) : null;` |  |
| 157 | `20` | `M139 = Math.min((finishedMgrEv.length / 20) * 100, 100);` |  |
| 176 | `4` | `const totalRounds = teamCount >= 4 ? (teamCount - 1) * 2 : null;` |  |
| 196 | `4` | `if (standingsRows.length >= 4) {` |  |
| 267 | `50` | `if (!row \|\| thresholds.length === 0) return { val: 50, gap: null };` |  |
| 300 | `1.15` | `const baseIntensity = isCup ? 1.15 : 1.05;` |  |
| 300 | `1.05` | `const baseIntensity = isCup ? 1.15 : 1.05;` |  |
| 301 | `250` | `const importanceBoost = Math.max(M172, M173) / 250; // max ~0.4` |  |
| 302 | `0.15` | `const legBoost = roundInfo?.leg === 2 ? 0.15 : 0;` |  |
| 307 | `0.8` | `let _m170Min = 0.8, _m170Max = 1.8;` |  |
| 307 | `1.8` | `let _m170Min = 0.8, _m170Max = 1.8;` |  |
| 308 | `4` | `if (_m170Rows.length >= 4) {` |  |
| 327 | `3` | `if (parts.length < 3 \|\| parts.some(isNaN)) return null;` |  |
| 367 | `8` | `if (_ctxRows.length >= 8) {` |  |
| 379 | `1.5` | `const formScore = (FWD_diff * _fwdW + MID_diff * 1.5 - DF_diff * _dfW) / 3.5;` |  |
| 379 | `3.5` | `const formScore = (FWD_diff * _fwdW + MID_diff * 1.5 - DF_diff * _dfW) / 3.5;` |  |
| 386 | `10` | `statScore = (passDiff * 0.5) + (ratingDiff * 10);` |  |
| 390 | `5` | `const rawScore = formScore * 5 + statScore;` |  |
| 392 | `50` | `M068 = clamp(50 + rawScore, 0, 100);` |  |
| 398 | `10` | `const statScore = (passDiff * 0.5) + (ratingDiff * 10);` |  |
| 399 | `50` | `M068 = clamp(50 + statScore, 0, 100);` |  |
| 428 | `8` | `const consistencyScore = Math.max(0, 100 - gdVariance * 8);` |  |
| 528 | `1.001` | `if (W > 1.001) {` |  |
| 533 | `4` | `const disc = Math.sqrt(z * z + 4 * (1 - z) * qi * qi);` |  |
| 554 | `5` | `M176 = clamp(+(midDiff / 5 * 50 + 50).toFixed(2), 0, 100);` |  |
| 554 | `50` | `M176 = clamp(+(midDiff / 5 * 50 + 50).toFixed(2), 0, 100);` |  |
| 554 | `50` | `M176 = clamp(+(midDiff / 5 * 50 + 50).toFixed(2), 0, 100);` |  |
| 568 | `5` | `for (const rm of recentDetails.slice(0, 5)) {` |  |
| 630 | `14` | `const ppdaScore = clamp((14 - homePress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 630 | `10` | `const ppdaScore = clamp((14 - homePress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 630 | `50` | `const ppdaScore = clamp((14 - homePress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 630 | `50` | `const ppdaScore = clamp((14 - homePress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 639 | `14` | `const ppdaScore = clamp((14 - awayPress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 639 | `10` | `const ppdaScore = clamp((14 - awayPress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 639 | `50` | `const ppdaScore = clamp((14 - awayPress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 639 | `50` | `const ppdaScore = clamp((14 - awayPress.avgPPDA) / 10 * 50 + 50, 0, 100);` |  |
| 669 | `50` | `M179_home = +(clamp((60 - homePress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 669 | `50` | `M179_home = +(clamp((60 - homePress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 669 | `10` | `M179_home = +(clamp((60 - homePress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 672 | `50` | `M179_away = +(clamp((60 - awayPress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 672 | `50` | `M179_away = +(clamp((60 - awayPress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 672 | `10` | `M179_away = +(clamp((60 - awayPress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);` |  |
| 682 | `4` | `const totalRoundsCalc = teamCount >= 4 ? (teamCount - 1) * 2 : null;` |  |
| 697 | `4` | `? +σ((safetyBoundaryPts - homePoints) / (matchesLeftCalc + 1)).toFixed(4) : null;` |  |
| 701 | `4` | `? +σ((safetyBoundaryPts - awayPoints) / (matchesLeftCalc + 1)).toFixed(4) : null;` |  |
| 704 | `0.40` | `const topN = Math.ceil(rows.length * 0.40);` |  |
| 709 | `4` | `? +σ((leaderPts - homePoints) / (matchesLeftCalc + 1)).toFixed(4) : null;` |  |
| 714 | `4` | `? +σ((leaderPts - awayPoints) / (matchesLeftCalc + 1)).toFixed(4) : null;` |  |
| 722 | `4` | `const M184 = +(1 / (1 + homeGapAbove + homeGapBelow)).toFixed(4);` |  |
| 729 | `4` | `const M185 = +(1 / (1 + awayGapAbove + awayGapBelow)).toFixed(4);` |  |
| 741 | `1e-10` | `return Math.exp(-lam + k * Math.log(Math.max(lam, 1e-10)) - logFact);` |  |
| 746 | `8` | `for (let h = 0; h <= 8; h++) {` |  |
| 747 | `8` | `for (let a = 0; a <= 8; a++) {` |  |
| 753 | `3` | `return pW * 3 + pD;` |  |
| 767 | `4` | `? +(homeActualPPG - homeExpPPG).toFixed(4) : null;` |  |
| 769 | `4` | `? +(awayActualPPG - awayExpPPG).toFixed(4) : null;` |  |
| 777 | `0.001` | `const pc = Math.max(0.001, Math.min(0.999, p / 100));` |  |
| 777 | `0.999` | `const pc = Math.max(0.001, Math.min(0.999, p / 100));` |  |
| 785 | `1.001` | `if (Wo > 1.001) {` |  |
| 787 | `4` | `const shinO = (wi) => { const qi=wi/Wo; if(zo>=1)return qi; const d=Math.sqrt(zo*zo+4*(1-zo)*qi*qi);` |  |
| 796 | `4` | `? +(_logit(M131) - _logit(M131_openShin)).toFixed(4) : null; // Home market move` |  |
| 798 | `4` | `? +(_logit(M133) - _logit(M133_openShin)).toFixed(4) : null; // Away market move` |  |
| 820 | `80` | `homeHasTarget: M172 > 80,` |  |
| 821 | `80` | `awayHasTarget: M173 > 80,` |  |
| 871 | `3` | `homeExpPPG: homeExpPPG != null ? +homeExpPPG.toFixed(3) : null,` |  |
| 872 | `3` | `awayExpPPG: awayExpPPG != null ? +awayExpPPG.toFixed(3) : null,` |  |
| 873 | `3` | `homeActualPPG: homeActualPPG != null ? +homeActualPPG.toFixed(3) : null,` |  |
| 874 | `3` | `awayActualPPG: awayActualPPG != null ? +awayActualPPG.toFixed(3) : null,` |  |
| 911 | `5` | `.slice(0, 5);` |  |
| 915 | `86400` | `totalDays += Math.abs(finished[i].startTimestamp - finished[i + 1].startTimestamp) / 86400;` |  |
| 999 | `1000` | `time: parseInt(e.timestamp) * 1000, // ms` |  |

### `src\engine\league-averages.js` — 73 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 31 | `4` | `const hasStandings = standingsRows.length >= 4;` |  |
| 54 | `4` | `if (rows.length < 4) return null;` |  |
| 99 | `999` | `let firstGoalMinute = 999;` |  |
| 115 | `3` | `else if (min <= 60) goalsByPeriod[3]++;` |  |
| 116 | `75` | `else if (min <= 75) goalsByPeriod[4]++;` |  |
| 116 | `4` | `else if (min <= 75) goalsByPeriod[4]++;` |  |
| 117 | `5` | `else goalsByPeriod[5]++;` |  |
| 203 | `20` | `if (x > 20 \|\| (shot.draw?.start?.y != null && shot.draw.start.y > 20)) {` |  |
| 203 | `20` | `if (x > 20 \|\| (shot.draw?.start?.y != null && shot.draw.start.y > 20)) {` |  |
| 257 | `10` | `if (totalGoalIncidents >= 10) {` |  |
| 261 | `3` | `set('M008', (goalsByPeriod[3] / totalGoalIncidents) * 100, 'incidents 46-60dk');` |  |
| 262 | `4` | `set('M009', (goalsByPeriod[4] / totalGoalIncidents) * 100, 'incidents 61-75dk');` |  |
| 263 | `5` | `set('M010', (goalsByPeriod[5] / totalGoalIncidents) * 100, 'incidents 76-90dk');` |  |
| 267 | `5` | `if (htLeadTotal >= 5) {` |  |
| 271 | `5` | `if (htDrawTotal >= 5) {` |  |
| 348 | `10` | `} else if (leagueGoalsPerGame != null && totalGoalIncidents > 10 && penGoalCount > 0) {` |  |
| 377 | `10` | `if (totalGoalIncidents > 10 && cornerGoalCount > 0) {` |  |
| 390 | `5` | `if (cShots >= 5) {` |  |
| 445 | `10` | `if (totalGoalIncidents >= 10) {` |  |
| 545 | `3` | `const formPct = (ppg / 3) * 100;` |  |
| 607 | `5` | `if (finished.length < 5) return null;` |  |
| 608 | `5` | `const last5 = finished.slice(0, 5);` |  |
| 609 | `5` | `const prev5 = finished.slice(5, 10);` |  |
| 609 | `10` | `const prev5 = finished.slice(5, 10);` |  |
| 629 | `4` | `if (!rows \|\| rows.length < 4) return null;` |  |
| 648 | `4` | `if (!rows \|\| rows.length < 4) return null;` |  |
| 700 | `5` | `if (firstGoalMatches >= 5) {` |  |
| 705 | `5` | `if (totalMatchesWithGoals >= 5) {` |  |
| 710 | `5` | `if (totalMatchesWithGoals >= 5) {` |  |
| 719 | `5` | `if (starterRatings.length >= 5) {` |  |
| 724 | `3` | `if (subRatings.length >= 3) {` |  |
| 827 | `7` | `const refBench = homeBenchCount > 0 ? homeBenchCount : awayBenchCount > 0 ? awayBenchCount : 7;` |  |
| 828 | `11` | `const homeMatchdaySz = 11 + (homeBenchCount > 0 ? homeBenchCount : refBench);` |  |
| 829 | `11` | `const awayMatchdaySz = 11 + (awayBenchCount > 0 ? awayBenchCount : refBench);` |  |
| 886 | `20` | `const refSquadSize = Math.max(20, Math.max(homeSquadSize, awaySquadSize));` |  |
| 1019 | `10` | `if (count > 0) return ((rAvg / count) - seasonRating) * 10;` |  |
| 1030 | `10` | `const allEvents = [...homeLastEvents.slice(0, 10), ...awayLastEvents.slice(0, 10)];` |  |
| 1030 | `10` | `const allEvents = [...homeLastEvents.slice(0, 10), ...awayLastEvents.slice(0, 10)];` |  |
| 1059 | `0.1` | `if (shot.xg != null && shot.xg < 0.1) luckyGoals++;` |  |
| 1096 | `0.35` | `const sotPG = avgs.M014 ?? avgs.M013 * (avgs.M011 != null ? avgs.M011 / 100 : 0.35);` |  |
| 1143 | `3` | `gkAttrSum += (attrs.attacking + attrs.defending + attrs.technical) / 3;` |  |
| 1183 | `10` | `set('M108', Math.min(100, Math.max(0, avgGkR * 10)), 'recentDetails GK rating×10');` |  |
| 1203 | `3` | `if (avgs.M109 != null && avgs.M110 != null) set('M117', avgs.M109 + avgs.M110 * 3, 'derived M109+M11` |  |
| 1217 | `2.5` | `if (hs + as > 2.5) h2hO25++;` |  |
| 1229 | `10` | `set('M122', avgGD * 10 + 50, 'h2h avg goals × 10 + 50');` |  |
| 1229 | `50` | `set('M122', avgGD * 10 + 50, 'h2h avg goals × 10 + 50');` |  |
| 1267 | `4` | `if (homeStandingsRows.length >= 4) {` |  |
| 1277 | `4` | `if (awayStandingsRows.length >= 4) {` |  |
| 1303 | `10` | `const competitiveness = ptsStdVal != null && ptsStdVal > 0 ? Math.min(1, 10 / ptsStdVal) : null;` |  |
| 1399 | `5` | `for (let k = 0; k <= 5; k++) {` |  |
| 1406 | `0.001` | `const drawTendency = poissonDrawRef > 0.001` |  |
| 1450 | `5` | `for (const ev of events.slice(0, 5)) {` |  |
| 1453 | `3` | `if (isHome ? hs > as : as > hs) totalPts += 3;` |  |
| 1460 | `3` | `if (matchCount146 > 0) set('M146', (totalPts / (matchCount146 * 3)) * 100, 'lastEvents points ratio%` |  |
| 1465 | `10` | `for (const m of allRecentMatches.slice(0, 10)) {` |  |
| 1471 | `2.5` | `if (cnt > 0) set('M147', (totalG / cnt / (leagueGoalsPerGame \|\| 2.5)) * 50, 'recent goals ratio × ` |  |
| 1471 | `50` | `if (cnt > 0) set('M147', (totalG / cnt / (leagueGoalsPerGame \|\| 2.5)) * 50, 'recent goals ratio × ` |  |
| 1512 | `50` | `set('M150', avgPoss ?? 50, avgPoss ? 'seasonStats possession' : 'NEUTRAL_SYMMETRY: possession is inh` |  |
| 1516 | `50` | `set('M151', 50, 'NEUTRAL_SYMMETRY: H2H başlangıç dengesizlik = 0');` |  |
| 1539 | `5` | `const contribRatio = (goalTotal >= 5) ? contribTotal / goalTotal : null;` |  |
| 1556 | `50` | `const compositeBase = (leagueGoalsPerGame / leagueGoalsPerGame) * 50; // = 50, ama veri bazlı: avg/a` |  |
| 1565 | `50` | `set('M168', (leagueGoalsPerGame / leagueGoalsPerGame) * 50, 'derived league avg ratio × 50');` |  |
| 1580 | `4` | `if (homeStandingsRows.length >= 4 && awayStandingsRows.length >= 4) {` |  |
| 1580 | `4` | `if (homeStandingsRows.length >= 4 && awayStandingsRows.length >= 4) {` |  |
| 1594 | `75` | `{ end: 60, pct: avgs.M008 }, { end: 75, pct: avgs.M009 }, { end: 90, pct: avgs.M010 },` |  |
| 1596 | `20` | `let earlyEnd = 20, criticalMoment = 60, lateStart = 75;` |  |
| 1596 | `75` | `let earlyEnd = 20, criticalMoment = 60, lateStart = 75;` |  |
| 1599 | `25` | `if (cumPct >= 25 && earlyEnd === 20) earlyEnd = band.end;` |  |
| 1599 | `20` | `if (cumPct >= 25 && earlyEnd === 20) earlyEnd = band.end;` |  |
| 1600 | `50` | `if (cumPct >= 50 && criticalMoment === 60) criticalMoment = band.end;` |  |
| 1601 | `75` | `if (cumPct >= 75 && lateStart === 75) lateStart = band.end;` |  |
| 1601 | `75` | `if (cumPct >= 75 && lateStart === 75) lateStart = band.end;` |  |
| 1618 | `8` | `if (standingsRows.length >= 8) {` |  |

### `src\engine\player-rating-utils.js` — 69 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 6 | `3` | `* 3 Boyutlu Organik Model:` |  |
| 51 | `35` | `if (goals > 0) { statScore += Math.min(30, (goals / matches) * 35); statWeight++; }` |  |
| 52 | `20` | `if (xG > 0) { statScore += Math.min(15, (xG / matches) * 20); statWeight++; }` |  |
| 53 | `10` | `if (shots > 0) { statScore += Math.min(10, (goals / shots) * 35); statWeight++; }` |  |
| 53 | `35` | `if (shots > 0) { statScore += Math.min(10, (goals / shots) * 35); statWeight++; }` |  |
| 54 | `10` | `if (assists > 0) { statScore += Math.min(10, (assists / matches) * 15); statWeight++; }` |  |
| 55 | `5` | `if (dribPct > 0) { statScore += Math.min(5, dribPct / 15); statWeight++; }` |  |
| 56 | `5` | `if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }` |  |
| 61 | `20` | `statScore += Math.min(20, ((keyPasses + assists) / matches) * 12); statWeight++;` |  |
| 61 | `12` | `statScore += Math.min(20, ((keyPasses + assists) / matches) * 12); statWeight++;` |  |
| 63 | `20` | `if (gpa > 0) { statScore += Math.min(15, gpa * 20); statWeight++; }` |  |
| 64 | `10` | `if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }` |  |
| 64 | `70` | `if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }` |  |
| 65 | `10` | `if (dribPct > 0) { statScore += Math.min(10, dribPct / 8); statWeight++; }` |  |
| 65 | `8` | `if (dribPct > 0) { statScore += Math.min(10, dribPct / 8); statWeight++; }` |  |
| 67 | `10` | `statScore += Math.min(10, ((tackles + intercept) / matches) * 4); statWeight++;` |  |
| 67 | `4` | `statScore += Math.min(10, ((tackles + intercept) / matches) * 4); statWeight++;` |  |
| 69 | `5` | `if (xG > 0) { statScore += Math.min(5, (xG / matches) * 15); statWeight++; }` |  |
| 73 | `6` | `if (tackles > 0) { statScore += Math.min(15, (tackles / matches) * 6); statWeight++; }` |  |
| 74 | `8` | `if (intercept > 0) { statScore += Math.min(15, (intercept / matches) * 8); statWeight++; }` |  |
| 75 | `10` | `if (clearance > 0) { statScore += Math.min(10, (clearance / matches) * 3); statWeight++; }` |  |
| 75 | `3` | `if (clearance > 0) { statScore += Math.min(10, (clearance / matches) * 3); statWeight++; }` |  |
| 76 | `10` | `if (aerialPct > 0) { statScore += Math.min(10, aerialPct / 8); statWeight++; }` |  |
| 76 | `8` | `if (aerialPct > 0) { statScore += Math.min(10, aerialPct / 8); statWeight++; }` |  |
| 77 | `10` | `if (cleanSh > 0) { statScore += Math.min(10, (cleanSh / matches) * 20); statWeight++; }` |  |
| 77 | `20` | `if (cleanSh > 0) { statScore += Math.min(10, (cleanSh / matches) * 20); statWeight++; }` |  |
| 78 | `8` | `if (passAcc > 0) { statScore += Math.min(8, (passAcc - 75) / 2); statWeight++; }` |  |
| 78 | `75` | `if (passAcc > 0) { statScore += Math.min(8, (passAcc - 75) / 2); statWeight++; }` |  |
| 79 | `7` | `if (gpa > 0) { statScore += Math.min(7, gpa * 25); statWeight++; }` |  |
| 79 | `25` | `if (gpa > 0) { statScore += Math.min(7, gpa * 25); statWeight++; }` |  |
| 83 | `25` | `if (savesPct > 0) { statScore += Math.min(25, (savesPct - 60) / 1.2); statWeight++; }` |  |
| 83 | `1.2` | `if (savesPct > 0) { statScore += Math.min(25, (savesPct - 60) / 1.2); statWeight++; }` |  |
| 84 | `5` | `if (saves > 0) { statScore += Math.min(15, (saves / matches) * 5); statWeight++; }` |  |
| 85 | `20` | `if (cleanSh > 0) { statScore += Math.min(20, (cleanSh / matches) * 45); statWeight++; }` |  |
| 86 | `5` | `if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }` |  |
| 90 | `20` | `if (gpa > 0) { statScore += Math.min(20, gpa * 25); statWeight++; }` |  |
| 90 | `25` | `if (gpa > 0) { statScore += Math.min(20, gpa * 25); statWeight++; }` |  |
| 91 | `10` | `if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }` |  |
| 91 | `70` | `if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }` |  |
| 95 | `75` | `if (minsPerM > 75) statScore += 3;` |  |
| 95 | `3` | `if (minsPerM > 75) statScore += 3;` |  |
| 103 | `3` | `* G=0, D=1, M=2, F=3 sıralaması ile.` |  |
| 104 | `3` | `* @returns {number} 0-3 arası mesafe` |  |
| 108 | `3` | `const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };` |  |
| 127 | `3` | `* @param {number} distance - Mevki mesafesi (0-3)` |  |
| 137 | `-25` | `if (evalPos === 'G' && nativePos !== 'G') return -25;` |  |
| 140 | `-20` | `if (nativePos === 'G' && evalPos !== 'G') return -20;` |  |
| 142 | `-3` | `if (distance === 1) return -3;   // D↔M veya M↔F: yakın mevki, ufak ceza` |  |
| 143 | `-8` | `if (distance === 2) return -8;   // D↔F: iki kademe, önemli ceza` |  |
| 144 | `-15` | `return -15;                       // Diğer uzak kombinasyonlar` |  |
| 156 | `40` | `* @returns {number} 40-99 arası rating` |  |
| 156 | `99` | `* @returns {number} 40-99 arası rating` |  |
| 159 | `55` | `if (!playerData) return 55;` |  |
| 185 | `10` | `const ratingBase = apiRating * 10;` |  |
| 186 | `3` | `const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);` |  |
| 186 | `0.7` | `const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);` |  |
| 187 | `0.6` | `baseScore = ratingBase * 0.6 + (60 + normalizedStatScore) * 0.4;` |  |
| 187 | `0.4` | `baseScore = ratingBase * 0.6 + (60 + normalizedStatScore) * 0.4;` |  |
| 190 | `10` | `baseScore = apiRating * 10;` |  |
| 193 | `3` | `const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);` |  |
| 193 | `0.7` | `const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);` |  |
| 197 | `58` | `baseScore = 58;` |  |
| 205 | `1000000` | `mvBonus = Math.min(15, Math.log10(mv / 1000000 + 1) * 7.5);` |  |
| 205 | `7.5` | `mvBonus = Math.min(15, Math.log10(mv / 1000000 + 1) * 7.5);` |  |
| 212 | `25` | `if (matches > 25)      consistencyBonus = 3;` |  |
| 212 | `3` | `if (matches > 25)      consistencyBonus = 3;` |  |
| 214 | `5` | `else if (matches > 5)  consistencyBonus = 1;` |  |
| 230 | `99` | `return Math.min(99, Math.max(40, Math.round(finalScore)));` |  |
| 230 | `40` | `return Math.min(99, Math.max(40, Math.round(finalScore)));` |  |

### `src\engine\event-impact.js` — 51 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 13 | `0.01` | `const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;` |  |
| 13 | `0.01` | `const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;` |  |
| 35 | `35` | `* Ör: ligde possession 35-70% arasında değişiyorsa spread=0.35 → güçlü etki.` |  |
| 35 | `70` | `* Ör: ligde possession 35-70% arasında değişiyorsa spread=0.35 → güçlü etki.` |  |
| 35 | `0.35` | `* Ör: ligde possession 35-70% arasında değişiyorsa spread=0.35 → güçlü etki.` |  |
| 127 | `4` | `case 'shot_off_target': return lgShots != null ? r(lgShots * 4) : null;` |  |
| 137 | `3` | `case 'throw_in':        return lgFouls != null ? r(lgFouls * 3) : null;` |  |
| 139 | `5` | `case 'goal_kick':       return lgShots != null ? r(lgShots * 5) : null;` |  |
| 227 | `-1.0` | `goal:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 227 | `-1.0` | `goal:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 227 | `-1.0` | `goal:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 227 | `-1.0` | `goal:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 228 | `-1.0` | `penalty_scored:  { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 228 | `-1.0` | `penalty_scored:  { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 228 | `-1.0` | `penalty_scored:  { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 228 | `-1.0` | `penalty_scored:  { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale: -1.0,  act` |  |
| 229 | `-1.0` | `shot_on_target:  { actorMom: +1.0,  reactorMom: -1.0,  actorMorale: +1.0,  reactorMorale:  0,    act` |  |
| 230 | `-1.0` | `shot_blocked:    { actorMom: -1.0,  reactorMom: +1.0,  actorMorale:  0,    reactorMorale: +1.0,  act` |  |
| 230 | `-1.0` | `shot_blocked:    { actorMom: -1.0,  reactorMom: +1.0,  actorMorale:  0,    reactorMorale: +1.0,  act` |  |
| 231 | `-1.0` | `shot_off_target: { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale:  0,    act` |  |
| 231 | `-1.0` | `shot_off_target: { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale:  0,    act` |  |
| 231 | `-1.0` | `shot_off_target: { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale:  0,    act` |  |
| 232 | `-1.0` | `big_save:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 232 | `-1.0` | `big_save:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 232 | `-1.0` | `big_save:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 232 | `-1.0` | `big_save:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 235 | `-1.0` | `foul:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale:  0,    reactorMorale:  0,    act` |  |
| 235 | `-1.0` | `foul:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale:  0,    reactorMorale:  0,    act` |  |
| 235 | `-1.0` | `foul:            { actorMom: +1.0,  reactorMom: -1.0,  actorMorale:  0,    reactorMorale:  0,    act` |  |
| 236 | `-1.0` | `yellow_card:     { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 236 | `-1.0` | `yellow_card:     { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 236 | `-1.0` | `yellow_card:     { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 236 | `-1.0` | `yellow_card:     { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 237 | `-1.0` | `red_card:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 237 | `-1.0` | `red_card:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 237 | `-1.0` | `red_card:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 237 | `-1.0` | `red_card:        { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 238 | `-1.0` | `penalty_missed:  { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 238 | `-1.0` | `penalty_missed:  { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 238 | `-1.0` | `penalty_missed:  { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 238 | `-1.0` | `penalty_missed:  { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +1.0,  act` |  |
| 240 | `-1.0` | `offside:         { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale:  0,    act` |  |
| 240 | `-1.0` | `offside:         { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale:  0,    act` |  |
| 241 | `-1.0` | `goal_kick:       { actorMom:  0,    reactorMom: +1.0,  actorMorale:  0,    reactorMorale:  0,    act` |  |
| 259 | `8` | `* Dönüş değeri: Her olay için 8 boyutlu yön vektörü.` |  |
| 333 | `-1.0` | `shot_off_target: { actorMom: -1.0,       reactorMom: +_t,        actorMorale: -_t * _t,   reactorMor` |  |
| 343 | `-1.0` | `yellow_card:     { actorMom: -_t,        reactorMom: +_t * _t,   actorMorale: -1.0,       reactorMor` |  |
| 345 | `-1.0` | `red_card:        { actorMom: -_m,        reactorMom: +_m,        actorMorale: -1.0,       reactorMor` |  |
| 347 | `-1.0` | `penalty_missed:  { actorMom: -1.0,       reactorMom: +1.0,       actorMorale: -_m,        reactorMor` |  |
| 395 | `0.01` | `const _timeAmp = (Math.abs(_macRatio - 1.0) < 0.01)` |  |
| 435 | `5` | `as.recentActions = as.recentActions.filter(m => m >= minute - 5);` |  |

### `src\engine\lineup-impact.js` — 42 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 97 | `5` | `{ key: 'goals', weight: 5 },            // M011+M012+M016+M018+M020: 5 metrikte pay` |  |
| 117 | `5` | `{ key: 'keyPasses', weight: 5 },         // M017(×2) + M070(×3): çift katkı` |  |
| 118 | `3` | `{ key: 'assists', weight: 3 },            // M070(×3): doğrudan yaratıcılık` |  |
| 119 | `3` | `{ key: 'expectedGoals', weight: 3 },      // M015(×3) + M072(×2): xG bileşeni` |  |
| 133 | `4` | `{ key: 'goals', weight: 4 },             // M001(×2) + M002(×2): gol ortalaması çift` |  |
| 134 | `3` | `{ key: 'totalShots', weight: 3 },         // M013(×3): şut hacmi doğrudan` |  |
| 135 | `3` | `{ key: 'shotsOnTarget', weight: 3 },      // M014(×3): isabetli şut doğrudan` |  |
| 147 | `4` | `{ key: 'aerialDuelsWon', weight: 4 },    // M036(×2) + M076(×2): çift kaynak` |  |
| 160 | `3` | `{ key: 'penaltyWon', weight: 3 },         // Penaltı kazanma → duran top fırsat` |  |
| 174 | `3` | `{ key: 'cleanSheets', weight: 3 },       // M028(×3): clean sheet doğrudan` |  |
| 224 | `4` | `{ key: 'goals', weight: 4 },             // M063(×2): geç gol eğilimi + M065 comeback` |  |
| 239 | `6` | `{ key: 'accuratePasses', weight: 6 },     // M025(×3) + M150(×3): çift kaynak` |  |
| 240 | `3` | `{ key: 'totalPasses', weight: 3 },         // M150(×3): pas hacmi → top kontrolü` |  |
| 241 | `3` | `{ key: 'accurateFinalThirdPasses', weight: 3 }, // Son bölge pası` |  |
| 257 | `4` | `{ key: 'keyPasses', weight: 4 },          // M152(×2) + M154(×2): çift katkı` |  |
| 274 | `3` | `{ key: 'possessionWonAttThird', weight: 3 },     // Hücum bölgesinde top kazanma → pressing` |  |
| 300 | `11` | `.slice(0, 11);` |  |
| 346 | `0.50` | `*   - Modifiye'de bölge boşaldıysa → ratio = normMinRatio veya 0.50 (ciddi düşüş)` |  |
| 352 | `0.50` | `* @param {number} [floorRatio=0.50] - Bölge tamamen boşaldığında minimum oran` |  |
| 355 | `0.50` | `function computeZoneQualityRatios(origPlayers, modPlayers, calcRating, floorRatio = 0.50) {` |  |
| 383 | `12` | `* BLOCK_STAT_MAP'teki 12 blok için, orijinal lineup oyuncularının bireysel` |  |
| 394 | `0.3` | `*     → goals (median ~0.3/maç) → threshold ~10` |  |
| 394 | `10` | `*     → goals (median ~0.3/maç) → threshold ~10` |  |
| 395 | `330` | `*     → totalPasses (median ~30/maç) → threshold ~330` |  |
| 397 | `0.40` | `*     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60` |  |
| 397 | `5` | `*     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60` |  |
| 397 | `0.55` | `*     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60` |  |
| 397 | `6` | `*     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60` |  |
| 397 | `0.60` | `*     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60` |  |
| 399 | `0.65` | `* Sonuç: { BITIRICILIK: { zones: ['F','M','D'], weights: {F:0.65, M:0.30, D:0.05} }, ... }` |  |
| 399 | `0.30` | `* Sonuç: { BITIRICILIK: { zones: ['F','M','D'], weights: {F:0.65, M:0.30, D:0.05} }, ... }` |  |
| 399 | `0.05` | `* Sonuç: { BITIRICILIK: { zones: ['F','M','D'], weights: {F:0.65, M:0.30, D:0.05} }, ... }` |  |
| 409 | `11` | `.slice(0, 11);` |  |
| 435 | `3` | `const CONFIDENCE_FACTOR = 3;` |  |
| 450 | `5` | `const adaptiveThreshold = Math.max(5, Math.min(500,` |  |
| 450 | `500` | `const adaptiveThreshold = Math.max(5, Math.min(500,` |  |
| 500 | `0.25` | `const uniformWeight = 0.25; // 4 bölge → 1/4` |  |
| 508 | `0.25` | `const uw = uniformZones.length > 0 ? 1 / uniformZones.length : 0.25;` |  |
| 544 | `0.01` | `.filter(([_, w]) => w > 0.01)` |  |
| 579 | `0.25` | `const uw = zones.length > 0 ? 1 / zones.length : 0.25;` |  |
| 614 | `1.08` | `* @param {object} units - Behavioral unit değerleri { BITIRICILIK: 1.08, GK_REFLEKS: 0.95, ... }` |  |
| 614 | `0.95` | `* @param {object} units - Behavioral unit değerleri { BITIRICILIK: 1.08, GK_REFLEKS: 0.95, ... }` |  |

### `src\metrics\player-performance.js` — 33 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 238 | `10` | `if (rating != null && rating > 0) vals.push(rating * 10); // 0-100 normalize` |  |
| 239 | `20` | `if (ps.tackles != null) vals.push(Math.min(100, (ps.tackles / apps) * 20)); // tackles/match normali` |  |
| 240 | `25` | `if (ps.interceptions != null) vals.push(Math.min(100, (ps.interceptions / apps) * 25));` |  |
| 284 | `8.0` | `const ratingScore = rating > 8.0 ? (rating - 8.0) * 25 : 0;  // 8.1→2.5, 9.0→25, 10→50` |  |
| 284 | `8.0` | `const ratingScore = rating > 8.0 ? (rating - 8.0) * 25 : 0;  // 8.1→2.5, 9.0→25, 10→50` |  |
| 284 | `25` | `const ratingScore = rating > 8.0 ? (rating - 8.0) * 25 : 0;  // 8.1→2.5, 9.0→25, 10→50` |  |
| 286 | `8` | `const _lgGoalThreshold = _dynAvg.M001 != null ? Math.round(_dynAvg.M001 * 8) : 10;` |  |
| 286 | `10` | `const _lgGoalThreshold = _dynAvg.M001 != null ? Math.round(_dynAvg.M001 * 8) : 10;` |  |
| 287 | `25` | `const _goalScaleMult = _lgGoalThreshold > 0 ? 25 / _lgGoalThreshold : 2.5;` |  |
| 287 | `2.5` | `const _goalScaleMult = _lgGoalThreshold > 0 ? 25 / _lgGoalThreshold : 2.5;` |  |
| 288 | `50` | `const goalScore = goals > _lgGoalThreshold ? Math.min(50, (goals - _lgGoalThreshold) * _goalScaleMul` |  |
| 289 | `20` | `const assistScore = Math.min(20, assists * 2);` |  |
| 354 | `2.0` | `const POSITION_CRITICALITY = { G: 2.0, D: 1.2, M: 1.0, F: 1.3 };` |  |
| 354 | `1.2` | `const POSITION_CRITICALITY = { G: 2.0, D: 1.2, M: 1.0, F: 1.3 };` |  |
| 354 | `1.3` | `const POSITION_CRITICALITY = { G: 2.0, D: 1.2, M: 1.0, F: 1.3 };` |  |
| 409 | `5` | `const benchDepthScore = Math.min(100, (availableSubCount / 5) * 100);` |  |
| 609 | `20` | `for (const ev of lastEvents.slice(0, 20)) {` |  |
| 624 | `20` | `for (const ev of lastEvents.slice(0, 20)) {` |  |
| 649 | `0.1` | `if (shot.xg != null && shot.xg < 0.1) luckyGoalsCount++;` |  |
| 658 | `11` | `const starters = (lineupSide?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 680 | `86400` | `const DAY = 86400;` |  |
| 682 | `7` | `const last7 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 7 * DAY).length;` |  |
| 683 | `14` | `const last14 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 14 * DAY).length;` |  |
| 684 | `21` | `const last21 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 21 * DAY).length;` |  |
| 686 | `20` | `const densityScore = Math.min(100, (last7 * 20 + last14 * 10 + last21 * 5));` |  |
| 686 | `10` | `const densityScore = Math.min(100, (last7 * 20 + last14 * 10 + last21 * 5));` |  |
| 686 | `5` | `const densityScore = Math.min(100, (last7 * 20 + last14 * 10 + last21 * 5));` |  |
| 690 | `5` | `for (const rm of recentDetails.slice(0, 5)) {` |  |
| 710 | `20` | `const kmLoad = Math.min(100, Math.max(0, (avgKm - 100) / 20 * 100));` |  |
| 712 | `140` | `? Math.min(100, Math.max(0, (avgSprints - 140) / 40 * 100)) : null;` |  |
| 712 | `40` | `? Math.min(100, Math.max(0, (avgSprints - 140) / 40 * 100)) : null;` |  |
| 768 | `66` | `for (let i = 66; i <= 95; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |
| 768 | `95` | `for (let i = 66; i <= 95; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |

### `src\services\match-db.js` — 30 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 7 | `20` | `* Bağımlılık: better-sqlite3 (Node 20 prebuilt binary)` |  |
| 38 | `48` | `TEAM          : 48 * 3600,   // 48 saat — takım profili nadiren değişir` |  |
| 38 | `3600` | `TEAM          : 48 * 3600,   // 48 saat — takım profili nadiren değişir` |  |
| 39 | `12` | `TEAM_EVENTS   : 12 * 3600,   // 12 saat — son maçlar günde 1-2 kez güncellenir` |  |
| 39 | `3600` | `TEAM_EVENTS   : 12 * 3600,   // 12 saat — son maçlar günde 1-2 kez güncellenir` |  |
| 40 | `6` | `STANDINGS     : 6  * 3600,   // 6 saat — maç günü değişebilir` |  |
| 40 | `3600` | `STANDINGS     : 6  * 3600,   // 6 saat — maç günü değişebilir` |  |
| 41 | `12` | `TEAM_SEASON   : 12 * 3600,   // 12 saat — sezon istatistikleri yavaş değişir` |  |
| 41 | `3600` | `TEAM_SEASON   : 12 * 3600,   // 12 saat — sezon istatistikleri yavaş değişir` |  |
| 42 | `24` | `PLAYER        : 24 * 3600,   // 24 saat — oyuncu bilgileri nadiren güncellenir` |  |
| 42 | `3600` | `PLAYER        : 24 * 3600,   // 24 saat — oyuncu bilgileri nadiren güncellenir` |  |
| 43 | `24` | `REFEREE       : 24 * 3600,   // 24 saat — hakem verileri stabil` |  |
| 43 | `3600` | `REFEREE       : 24 * 3600,   // 24 saat — hakem verileri stabil` |  |
| 44 | `48` | `MANAGER       : 48 * 3600,   // 48 saat — menajer nadiren değişir` |  |
| 44 | `3600` | `MANAGER       : 48 * 3600,   // 48 saat — menajer nadiren değişir` |  |
| 45 | `3` | `WEATHER_FUTURE: 3  * 3600,   // 3 saat — hava durumu sık güncellenir` |  |
| 45 | `3600` | `WEATHER_FUTURE: 3  * 3600,   // 3 saat — hava durumu sık güncellenir` |  |
| 46 | `7` | `H2H           : 7 * 24 * 3600, // 7 gün — H2H geçmiş nadiren değişir` |  |
| 46 | `24` | `H2H           : 7 * 24 * 3600, // 7 gün — H2H geçmiş nadiren değişir` |  |
| 46 | `3600` | `H2H           : 7 * 24 * 3600, // 7 gün — H2H geçmiş nadiren değişir` |  |
| 47 | `3600` | `LINEUPS       : 2  * 3600,   // 2 saat — maç öncesi sık değişir` |  |
| 56 | `1000` | `return (now() - fetchedAt) > ttlSeconds * 1000;` |  |
| 474 | `1024` | `dbSizeMB: (dbSizeBytes / 1024 / 1024).toFixed(2),` |  |
| 474 | `1024` | `dbSizeMB: (dbSizeBytes / 1024 / 1024).toFixed(2),` |  |
| 477 | `3600` | `standings_hours : TTL.STANDINGS / 3600,` |  |
| 478 | `3600` | `player_hours    : TTL.PLAYER / 3600,` |  |
| 479 | `3600` | `referee_hours   : TTL.REFEREE / 3600,` |  |
| 480 | `3600` | `manager_hours   : TTL.MANAGER / 3600,` |  |
| 481 | `3600` | `team_hours      : TTL.TEAM / 3600,` |  |
| 482 | `3600` | `team_events_hours: TTL.TEAM_EVENTS / 3600,` |  |

### `src\services\playwright-client.js` — 26 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 3 | `403` | `* Bypasses Cloudflare/Fastly 403 blocks by executing fetches` |  |
| 19 | `3600` | `standings: 3600,` |  |
| 21 | `3600` | `playerStats: 3600, // 1 saat cache — aynı oyuncu farklı maçlarda yeniden çekilmez` |  |
| 22 | `600` | `teamLastEvents: 600,` |  |
| 23 | `300` | `eventDetail: 300,` |  |
| 25 | `86400` | `refereeStats: 86400,` |  |
| 26 | `86400` | `managerStats: 86400,` |  |
| 27 | `1800` | `h2h: 1800,` |  |
| 28 | `600` | `odds: 600,` |  |
| 29 | `900` | `default: 900,` |  |
| 52 | `1000` | `expiresAt: Date.now() + ttl * 1000,` |  |
| 68 | `1000` | `}, 30 * 60 * 1000).unref();` |  |
| 93 | `5000` | `await page.waitForTimeout(5000);` |  |
| 120 | `5000` | `await page.waitForTimeout(5000);` |  |
| 160 | `1500` | `const RATE_LIMIT_MS = 1500; // Her istek arası minimum bekleme — garantili, block yok` |  |
| 175 | `30000` | `const EVALUATE_TIMEOUT_MS = 30000;` |  |
| 195 | `404` | `if (response.status === 404) return { status: 404, data: null };` |  |
| 195 | `404` | `if (response.status === 404) return { status: 404, data: null };` |  |
| 198 | `200` | `return { status: 200, data: json };` |  |
| 200 | `500` | `return { status: 500, error: e.message };` |  |
| 210 | `200` | `if (data.status === 200) return data.data;` |  |
| 211 | `404` | `if (data.status === 404) return null; // No data exists for this endpoint` |  |
| 227 | `4` | `const MAX_RETRIES = 4;` |  |
| 240 | `5000` | `const backoff = Math.min(5000 * Math.pow(2, attempt) + Math.random() * 2000, 30000);` |  |
| 240 | `2000` | `const backoff = Math.min(5000 * Math.pow(2, attempt) + Math.random() * 2000, 30000);` |  |
| 240 | `30000` | `const backoff = Math.min(5000 * Math.pow(2, attempt) + Math.random() * 2000, 30000);` |  |

### `src\engine\metric-calculator.js` — 24 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 3 | `168` | `* Tüm 168 metriği tek bir çağrıda hesaplar.` |  |
| 26 | `1.5` | `* @param {object} flatMetrics - { M001: 1.5, M002: 0.8, ... }` |  |
| 26 | `0.8` | `* @param {object} flatMetrics - { M001: 1.5, M002: 0.8, ... }` |  |
| 45 | `9` | `if (!/^M[0-9]{3}/i.test(key)) continue;` |  |
| 45 | `3` | `if (!/^M[0-9]{3}/i.test(key)) continue;` |  |
| 52 | `9` | `if (!/^M[0-9]{3}/i.test(id)) { wrapped[id] = val; continue; }` |  |
| 52 | `3` | `if (!/^M[0-9]{3}/i.test(id)) { wrapped[id] = val; continue; }` |  |
| 69 | `168` | `* Tüm 168 metriği hesaplar.` |  |
| 121 | `5` | `M171: 5 - contextual.M171, // Agg Deficit (mapped with pedestal of 5)` |  |
| 141 | `5` | `M171: 5 + contextual.M171, // Agg Deficit for away` |  |
| 177 | `0.3` | `? Math.min(1.0, _seasonProgress / 0.3)` |  |
| 208 | `9` | `].filter(k => /^M[0-9]{3}[a-z]?$/i.test(k)));` |  |
| 208 | `3` | `].filter(k => /^M[0-9]{3}[a-z]?$/i.test(k)));` |  |
| 253 | `20` | `extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, 'home', 20) ??` |  |
| 254 | `20` | `extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, null, 20);` |  |
| 256 | `20` | `extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, 'away', 20) ??` |  |
| 257 | `20` | `extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, null, 20);` |  |
| 259 | `10` | `const matchScoreProfile = extractMatchScoreProfile(data.h2hEvents, data.homeTeamId, data.awayTeamId,` |  |
| 323 | `1000` | `const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);` |  |
| 338 | `5` | `form: { ...homeForm, M170: contextual.M170, M171: 5 - contextual.M171, M172: contextual.M172, M174: ` |  |
| 359 | `5` | `form: { ...awayForm, M170: contextual.M170, M171: 5 + contextual.M171, M172: contextual.M173, M174: ` |  |
| 427 | `9` | `const metricRegex = /^M[0-9]{3}[a-z]?$/i;` |  |
| 427 | `3` | `const metricRegex = /^M[0-9]{3}[a-z]?$/i;` |  |
| 444 | `4` | `if (rows.length < 4) return null; // Yeterli veri yok, fallback kullanılmaz` |  |

### `src\services\weather-service.js` — 24 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 4 | `10` | `* API key gerektirmez, rate limit: 10,000 istek/gün.` |  |
| 19 | `23` | `* @param {number} matchHour - Maç saati (0-23)` |  |
| 25 | `20` | `const hour = matchHour ?? 20; // varsayılan akşam maçı` |  |
| 29 | `5000` | `const req = https.get(url, { timeout: 5000 }, (res) => {` |  |
| 87 | `22` | `if (t >= 15 && t <= 22) {` |  |
| 90 | `40` | `metrics.M170 = Math.max(40, 100 - (15 - t) * 4); // soğukta düşüş` |  |
| 90 | `4` | `metrics.M170 = Math.max(40, 100 - (15 - t) * 4); // soğukta düşüş` |  |
| 92 | `22` | `metrics.M170 = Math.max(30, 100 - (t - 22) * 5); // sıcakta daha hızlı düşüş` |  |
| 92 | `5` | `metrics.M170 = Math.max(30, 100 - (t - 22) * 5); // sıcakta daha hızlı düşüş` |  |
| 100 | `0.1` | `if (p <= 0.1) {` |  |
| 103 | `80` | `metrics.M171 = 80; // hafif yağmur` |  |
| 104 | `5` | `} else if (p <= 5) {` |  |
| 107 | `25` | `metrics.M171 = Math.max(25, 60 - (p - 5) * 5); // ağır yağmur` |  |
| 107 | `5` | `metrics.M171 = Math.max(25, 60 - (p - 5) * 5); // ağır yağmur` |  |
| 107 | `5` | `metrics.M171 = Math.max(25, 60 - (p - 5) * 5); // ağır yağmur` |  |
| 118 | `55` | `metrics.M172 = Math.max(55, 100 - (w - 15) * 3);` |  |
| 118 | `3` | `metrics.M172 = Math.max(55, 100 - (w - 15) * 3);` |  |
| 120 | `55` | `metrics.M172 = Math.max(30, 55 - (w - 30) * 2);` |  |
| 128 | `40` | `if (h >= 40 && h <= 60) {` |  |
| 131 | `50` | `metrics.M173 = Math.max(50, 100 - (h - 60) * 1.5);` |  |
| 131 | `1.5` | `metrics.M173 = Math.max(50, 100 - (h - 60) * 1.5);` |  |
| 133 | `40` | `metrics.M173 = Math.max(60, 100 - (40 - h) * 1.5);` |  |
| 133 | `1.5` | `metrics.M173 = Math.max(60, 100 - (40 - h) * 1.5);` |  |
| 141 | `3` | `[metrics.M171, 3], // yağış en önemli` |  |

### `src\engine\dynamic-baseline.js` — 23 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 25 | `0.50` | `POSSESSION: 0.50, // Matematiksel simetri — tanım gereği değiştirilemez` |  |
| 34 | `4` | `if (!Array.isArray(rows) \|\| rows.length < 4) return null;` |  |
| 46 | `4` | `if (rows.length < 4) return null;` |  |
| 193 | `0.50` | `POSSESSION: 0.50,  // Matematiksel simetri — tanım gereği değiştirilemez` |  |
| 197 | `80` | `const matchMinutes = data.match?.tournament?.category?.name?.includes('Youth') ? 80 : 90;` |  |
| 268 | `4` | `const _lgAvgMatches = (Array.isArray(_rows) && _rows.length >= 4)` |  |
| 397 | `86400` | `return Math.round((currentTS - finished[0].startTimestamp) / 86400);` |  |
| 413 | `4` | `const _seasonDays = _lgTeamCount >= 4` |  |
| 414 | `7` | `? (_lgTeamCount - 1) * 2 * 7  // N takımlı lig: (N-1)*2 hafta` |  |
| 415 | `7` | `: (_lgMatchesPerTeam != null ? _lgMatchesPerTeam * 7 : null); // kupa/CL: maç başı ~7 gün varsayımı` |  |
| 421 | `4` | `if (!Array.isArray(_lgRows) \|\| _lgRows.length < 4 \|\| _standingsGoals == null \|\| _standingsGoal` |  |
| 425 | `4` | `if (gpms.length < 4) return null;` |  |
| 473 | `4` | `if (Array.isArray(rows) && rows.length >= 4) {` |  |
| 546 | `4` | `if (!Array.isArray(rows) \|\| rows.length < 4) { traces.push('leagueCompetitiveness: null (NO_DATA)'` |  |
| 548 | `4` | `if (points.length < 4) { traces.push('leagueCompetitiveness: null (INSUFFICIENT)'); return null; }` |  |
| 563 | `4` | `if (!Array.isArray(rows) \|\| rows.length < 4) { traces.push('leagueDrawTendency: null (NO_DATA)'); ` |  |
| 580 | `4` | `if (!Array.isArray(_lgRows) \|\| _lgRows.length < 4) return null;` |  |
| 584 | `4` | `if (gpms.length < 4) return null;` |  |
| 612 | `0.7` | `: _filledCount >= _totalCritical * 0.7 ? 'PARTIAL'` |  |
| 640 | `1.5` | `: (avgFouls != null ? (avgFouls * 1.5) / 90 : null); // proxy: faul×1.5 ≈ taç` |  |
| 646 | `4` | `if (!Array.isArray(rows) \|\| rows.length < 4) return null;` |  |
| 659 | `4` | `if (!Array.isArray(rows) \|\| rows.length < 4) return null;` |  |
| 685 | `0.3` | `? Math.min(1.0, seasonProgress / 0.3)` |  |

### `src\metrics\team-form.js` — 23 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 18 | `20` | `const last20 = finishedEvents.slice(0, 20);` |  |
| 19 | `10` | `const last10 = finishedEvents.slice(0, 10);` |  |
| 20 | `5` | `const last5 = finishedEvents.slice(0, 5);` |  |
| 43 | `3` | `if (r === 'W') points += 3;` |  |
| 51 | `3` | `const formScore = formString.split('').reduce((s, c) => s + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);` |  |
| 52 | `3` | `const maxScore = formString.length * 3;` |  |
| 60 | `3` | `const M046raw = fp5.valid > 0 ? (fp5.points / (fp5.valid * 3)) * 100 : null;` |  |
| 70 | `3` | `const M047 = fp10.valid > 0 ? (fp10.points / (fp10.valid * 3)) * 100 : null;` |  |
| 71 | `3` | `const M048 = fp20.valid > 0 ? (fp20.points / (fp20.valid * 3)) * 100 : null;` |  |
| 138 | `10` | `const M050streak = Math.min(M050raw, 10) * 10; // 0-100` |  |
| 138 | `10` | `const M050streak = Math.min(M050raw, 10) * 10; // 0-100` |  |
| 139 | `6` | `const M050rating = Math.min(Math.max((avgRating - 6) / (9 - 6), 0), 1) * 100; // 0-100` |  |
| 139 | `9` | `const M050rating = Math.min(Math.max((avgRating - 6) / (9 - 6), 0), 1) * 100; // 0-100` |  |
| 139 | `6` | `const M050rating = Math.min(Math.max((avgRating - 6) / (9 - 6), 0), 1) * 100; // 0-100` |  |
| 147 | `10` | `M050 = Math.min(M050raw, 10) * 10; // normalize to 0-100` |  |
| 147 | `10` | `M050 = Math.min(M050raw, 10) * 10; // normalize to 0-100` |  |
| 151 | `5` | `const first5Goals = getGoals(last5.slice(0, 5), teamId, true);` |  |
| 152 | `5` | `const prev5 = finishedEvents.slice(5, 10);` |  |
| 152 | `10` | `const prev5 = finishedEvents.slice(5, 10);` |  |
| 173 | `1.5` | `return Math.pow(norm, 1.5) * 100;` |  |
| 202 | `2.5` | `if (total > 2.5) over25++;` |  |
| 305 | `46` | `for (let i = 46; i <= 65; i++) {` |  |
| 305 | `65` | `for (let i = 46; i <= 65; i++) {` |  |

### `src\services\data-fetcher.js` — 21 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 304 | `5` | `fetchRecentMatchDetails(mergeAndSortEvents(homeLastEvents0, homeLastEvents1), 5),` |  |
| 305 | `5` | `fetchRecentMatchDetails(mergeAndSortEvents(awayLastEvents0, awayLastEvents1), 5),` |  |
| 359 | `11` | `if (starting.length < 11) {` |  |
| 372 | `11` | `if (starting.length >= 11) break;` |  |
| 389 | `4` | `pickN(byPos.D, Math.max(0, 4 - currentD));` |  |
| 390 | `3` | `pickN(byPos.M, Math.max(0, 3 - currentM));` |  |
| 391 | `3` | `pickN(byPos.F, Math.max(0, 3 - currentF));` |  |
| 394 | `11` | `if (starting.length < 11) {` |  |
| 396 | `11` | `if (starting.length >= 11) break;` |  |
| 407 | `9` | `const remainingForSubs = pool.filter(p => !usedIdx.has(p.player?.id)).slice(0, 9);` |  |
| 427 | `11` | `if (starterCount >= 11) {` |  |
| 485 | `1000` | `const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);` |  |
| 662 | `5` | `const topScorers = (topPlayersData.topPlayers?.goalscorer?.players \|\| []).slice(0, 5);` |  |
| 670 | `5` | `if (apps >= 5 && goals > 0) {` |  |
| 683 | `1000` | `const ts = eventData.event.startTimestamp * 1000;` |  |
| 728 | `5` | `* @param {number} count - Kaç maçın deep-dive verisi çekileceği (varsayılan 5)` |  |
| 730 | `5` | `async function fetchRecentMatchDetails(eventsArray, count = 5) {` |  |
| 771 | `11` | `* İlk 11 + tüm yedekler — M067 (Yedek Rating) ve M088 (Bench/Starter değer oranı) için tam veri gere` |  |
| 776 | `11` | `const starters = players.filter(p => !p.substitute).slice(0, 11);` |  |
| 834 | `5` | `* h2hEvents.events içindeki son 5 bitmiş maçın incidents + statistics'ini çeker,` |  |
| 841 | `5` | `.slice(0, 5);` |  |

### `src\engine\score-profile.js` — 19 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 49 | `7` | `const g = 7;` |  |
| 51 | `0.99999999999980993` | `0.99999999999980993, 676.5203681218851, -1259.1392167224028,` |  |
| 51 | `676.5203681218851` | `0.99999999999980993, 676.5203681218851, -1259.1392167224028,` |  |
| 51 | `-1259.1392167224028` | `0.99999999999980993, 676.5203681218851, -1259.1392167224028,` |  |
| 52 | `771.32342877765313` | `771.32342877765313, -176.61502916214059, 12.507343278686905,` |  |
| 52 | `-176.61502916214059` | `771.32342877765313, -176.61502916214059, 12.507343278686905,` |  |
| 52 | `12.507343278686905` | `771.32342877765313, -176.61502916214059, 12.507343278686905,` |  |
| 53 | `-0.13857109526572012` | `-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7` |  |
| 53 | `9.9843695780195716e-6` | `-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7` |  |
| 53 | `1.5056327351493116e-7` | `-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7` |  |
| 79 | `20` | `function extractTeamScoreProfile(lastEvents, teamId, location = null, maxMatches = 20, nowMs = Date.` |  |
| 86 | `3` | `.slice(0, maxMatches * 3);` |  |
| 99 | `1000` | `const ts = e.startTimestamp ? e.startTimestamp * 1000 : null;` |  |
| 107 | `86400000` | `const MS_DAY = 86400000;` |  |
| 141 | `2.5` | `if (total > 2.5) over25_w += w;` |  |
| 142 | `1.5` | `if (total > 1.5) over15_w += w;` |  |
| 192 | `10` | `function extractMatchScoreProfile(h2hEventsData, homeTeamId, awayTeamId, maxMatches = 10) {` |  |
| 271 | `0.1` | `const minR = lambda * 0.1;` |  |
| 347 | `4` | `const _maxGoals = maxGoals ?? Math.ceil(Math.max(lambdaHome, lambdaAway) * 4);` |  |

### `src\metrics\referee-impact.js` — 19 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 8 | `5` | `const MIN_EVENTS_REQUIRED = 5; // Güvenilir analiz için minimum maç sayısı (15 çok agresifti — API ç` |  |
| 73 | `2.5` | `if (total > 2.5) refOver25Count++;` |  |
| 151 | `4` | `if (_rows.length >= 4) {` |  |
| 161 | `11` | `const starters = (lineup?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 198 | `11` | `const starters = (lineup?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 272 | `4` | `const _lgYPG = _rows.length >= 4` |  |
| 274 | `4` | `const _lgRPG = _rows.length >= 4` |  |
| 293 | `50` | `M117 = refSeverity > 0 ? Math.max(0, Math.min(100, 50 * (rawSeverity / refSeverity))) : 50;` |  |
| 293 | `50` | `M117 = refSeverity > 0 ? Math.max(0, Math.min(100, 50 * (rawSeverity / refSeverity))) : 50;` |  |
| 300 | `50` | `M117 = 50; // Kariyer tek kaynaksa kendi ortalamasında = 50 nötr` |  |
| 324 | `50` | `cardBias = (homeCards / totalCards - 0.5) * 100 + 50;` |  |
| 328 | `50` | `penaltyBias = (refHomePenalties / totalRefPen - 0.5) * 100 + 50;` |  |
| 360 | `10` | `const leagueHomeWinAvg = totalHomePlayed >= 10` |  |
| 366 | `50` | `M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 100;` |  |
| 388 | `50` | `M119 = 50 * (foulsPerMatch / leagueAvgFoulsPerMatch);` |  |
| 424 | `50` | `? Math.round(Math.min(100, Math.max(0, (rawSeverity / _lgNeutralSeverity) * 50)))` |  |
| 464 | `3` | `const _carN = (careerGames ?? 0) * 3;` |  |
| 495 | `109` | `for (let i = 109; i <= 122; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |
| 495 | `122` | `for (let i = 109; i <= 122; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |

### `src\engine\sim-config.js` — 18 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 26 | `0.01` | `LAMBDA:      { MIN: 0.01, MAX: null },           // Poisson λ > 0; üst sınır veriden` |  |
| 48 | `5` | `MAX: 5,` |  |
| 63 | `0.50` | `POSSESSION_SYMMETRY: 0.50,    // Topla Oynama (%50-%50 simetri)` |  |
| 64 | `50` | `WIN_PROBABILITY_SYMMETRY: 50, // Kazanma Olasılığı (%50 — bilgi yoksa eşit şans)` |  |
| 65 | `50` | `SQUAD_DEPTH_MEDIAN: 50,       // Kadro Derinliği (0-100 skalasının ortası)` |  |
| 72 | `95` | `MAX_UI_PROB: 95,              // Rapor ekranında olasılık tavanı (görsel)` |  |
| 73 | `0.2` | `HT_RESULT_THRESHOLD: 0.2,     // İlk yarı sonucu eşiği (rapor metni için)` |  |
| 75 | `80` | `FORM_HIGH: 80,                // Yüksek form eşiği (highlight için)` |  |
| 77 | `75` | `CONFIDENCE_HIGH: 75,          // Yüksek güven eşiği` |  |
| 125 | `4` | `? { MIN: Math.max(0, baseline.onTargetRate / 4), MAX: Math.min(1, baseline.onTargetRate * 4) }` |  |
| 125 | `4` | `? { MIN: Math.max(0, baseline.onTargetRate / 4), MAX: Math.min(1, baseline.onTargetRate * 4) }` |  |
| 130 | `4` | `? { MIN: Math.max(0, baseline.blockRate / 4), MAX: Math.min(1, baseline.blockRate * 4) }` |  |
| 130 | `4` | `? { MIN: Math.max(0, baseline.blockRate / 4), MAX: Math.min(1, baseline.blockRate * 4) }` |  |
| 135 | `4` | `? { MIN: Math.max(0, baseline.cornerPerMin / 4), MAX: Math.min(1, baseline.cornerPerMin * 4) }` |  |
| 135 | `4` | `? { MIN: Math.max(0, baseline.cornerPerMin / 4), MAX: Math.min(1, baseline.cornerPerMin * 4) }` |  |
| 140 | `4` | `? { MIN: Math.max(0, baseline.cornerGoalRate / 4), MAX: Math.min(1, baseline.cornerGoalRate * 4) }` |  |
| 140 | `4` | `? { MIN: Math.max(0, baseline.cornerGoalRate / 4), MAX: Math.min(1, baseline.cornerGoalRate * 4) }` |  |
| 145 | `5` | `? { YELLOW_MAX: Math.min(1, baseline.yellowPerMin * 90 / 5), RED_MAX: Math.min(1, baseline.redPerMin` |  |

### `src\engine\math-utils.js` — 12 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 24 | `2.5` | `* @param {number} threshold - Eşik değeri (ör: 2.5, 8.5)` |  |
| 24 | `8.5` | `* @param {number} threshold - Eşik değeri (ör: 2.5, 8.5)` |  |
| 46 | `20` | `do { k++; p *= Math.random(); } while (p > L && k < 20);` |  |
| 85 | `10` | `return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };` |  |
| 85 | `10` | `return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };` |  |
| 91 | `10` | `return { current: parseInt(percMatch[1], 10), total: 100 };` |  |
| 247 | `3` | `* Positions: 'G' (0), 'D' (1), 'M' (2), 'F' (3).` |  |
| 253 | `3` | `const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };` |  |
| 261 | `0.85` | `if (distance === 1) return 0.85; // 15% penalty` |  |
| 262 | `0.60` | `if (distance === 2) return 0.60; // 40% penalty` |  |
| 263 | `3` | `if (distance === 3) return 0.10; // 90% penalty` |  |
| 263 | `0.10` | `if (distance === 3) return 0.10; // 90% penalty` |  |

### `src\metrics\h2h-analysis.js` — 9 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 30 | `5` | `const last5H2H = finishedForForm.slice(0, 5);` |  |
| 42 | `3` | `if (homeScore > awayScore) homePoints += 3;` |  |
| 45 | `3` | `if (awayScore > homeScore) homePoints += 3;` |  |
| 49 | `3` | `const M122 = m122Valid > 0 ? (homePoints / (m122Valid * 3)) * 100 : null;` |  |
| 69 | `2.5` | `if (hs + as > 2.5) h2hOver25++;` |  |
| 165 | `5` | `for (let i = 0; i < Math.min(5, finishedForForm.length); i++) {` |  |
| 187 | `5` | `const eventsToScan = events.slice(0, 5);` |  |
| 267 | `119` | `for (let i = 119; i <= 130; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |
| 267 | `130` | `for (let i = 119; i <= 130; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |

### `src\engine\league-fingerprint.js` — 7 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 20 | `86400000` | `const MS_PER_DAY = 86400000;` |  |
| 36 | `1000` | `const ts = e.startTimestamp ? e.startTimestamp * 1000 : null;` |  |
| 139 | `2.5` | `if (total > 2.5) over25_w += w;` |  |
| 140 | `1.5` | `if (total > 1.5) over15_w += w;` |  |
| 141 | `3.5` | `if (total > 3.5) over35_w += w;` |  |
| 219 | `3` | `if (leagueAvgGoals_std != null && pool.length >= 3) {` |  |
| 235 | `20` | `const teamCount = rows.length \|\| 20;` |  |

### `src\metrics\goalkeeper.js` — 7 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 115 | `20` | `if (x > 20) { // ceza sahası dışı (yaklaşık)` |  |
| 131 | `3` | `? (gkAttrs.attacking + gkAttrs.technical + gkAttrs.defending) / 3` |  |
| 141 | `10` | `const ratingNorm = (gkStats.rating != null) ? gkStats.rating * 10 : null; // 0-10 → 0-100` |  |
| 142 | `50` | `const xgPerf = (M098 != null) ? (M098 + 1) * 50 : null; // -1..+1 → 0-100 (xG kazancı)` |  |
| 177 | `10` | `const M108 = avgGkRating != null ? Math.min(Math.max(avgGkRating * 10, 0), 100) : null;` |  |
| 189 | `96` | `for (let i = 96; i <= 108; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |
| 189 | `108` | `for (let i = 96; i <= 108; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |

### `src\engine\calibration.js` — 6 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 46 | `0.01` | `const lr = opts.lr ?? 0.01;` |  |
| 47 | `1000` | `const epochs = opts.epochs ?? 1000;` |  |
| 94 | `25` | `* @param {number} [shrinkage=25]` |  |
| 97 | `25` | `function fitCompetitionCalibration(matches, shrinkage = 25) {` |  |
| 182 | `3` | `if (b.n < 3) continue;` |  |
| 342 | `18` | `if (minN < 18) {` |  |

### `src\engine\match-context.js` — 6 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 27 | `11` | `* İlk 11 starter'ın ortalama dinamik ratingini hesaplar.` |  |
| 31 | `11` | `const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);` |  |
| 42 | `11` | `const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);` |  |
| 62 | `3` | `if (/^M\d{3}[a-z]?$/i.test(key)) result[key] = val;` |  |
| 145 | `0.70` | `baseline.homeLineupQualityRatio *= 0.70;` |  |
| 149 | `0.70` | `baseline.awayLineupQualityRatio *= 0.70;` |  |

### `src\metrics\team-attack.js` — 6 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 23 | `20` | `const last20 = finishedEvents.slice(0, 20);` |  |
| 77 | `75` | `else if (minute <= 75) goalsByPeriod['61-75']++;` |  |
| 199 | `11` | `const starters = (lineupSide?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 316 | `11` | `const starters = (lineupSide?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 354 | `11` | `const starters = (lineupSide?.players \|\| []).filter(p => !p.substitute).slice(0, 11);` |  |
| 403 | `25` | `for (let i = 1; i <= 25; i++) {` |  |

### `src\services\schema-validator.js` — 5 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 36 | `4` | `} else if (standingsRows.length < 4) {` |  |
| 73 | `3` | `for (let i = 0; i < Math.min(data.homeRecentMatchDetails.length, 3); i++) {` |  |
| 101 | `5` | `for (const inc of data.homeIncidents.slice(0, 5)) {` |  |
| 110 | `4` | `if (Array.isArray(standingsRows) && standingsRows.length >= 4) {` |  |
| 111 | `3` | `for (const row of standingsRows.slice(0, 3)) {` |  |

### `src\metrics\momentum.js` — 4 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 82 | `-30` | `if (teamVal < -30) goalsUnderOppPressure++; // Rakip baskıda iken gol` |  |
| 206 | `3` | `if (x.length < 3 \|\| x.length !== y.length) return null;` |  |
| 225 | `146` | `for (let i = 146; i <= 155; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |
| 225 | `155` | `for (let i = 146; i <= 155; i++) m[`M${String(i).padStart(3, '0')}`] = null;` |  |

### `src\metrics\team-defense.js` — 4 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 20 | `20` | `const last20 = finishedEvents.slice(0, 20);` |  |
| 112 | `76` | `if (minute >= 76 && minute <= 90) conceded7690++;` |  |
| 224 | `-30` | `if (pressure < -30) goalsUnderPressure++; // Takım baskı altında` |  |
| 333 | `26` | `for (let i = 26; i <= 45; i++) {` |  |

### `src\engine\audit-helper.js` — 3 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 84 | `3` | `if (/^M\d{3}[a-z]?$/i.test(id)) {` |  |
| 125 | `5` | `if (summary.criticalMissingCount > 5) summary.fallbackThresholdsTriggered++;` |  |
| 126 | `20` | `if (summary.nullCount > 20) summary.fallbackThresholdsTriggered++;` |  |

### `src\engine\quality-factors.js` — 2 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 142 | `0.01` | `const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));` |  |
| 142 | `0.01` | `const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));` |  |

### `src\engine\metric-value.js` — 1 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 91 | `5` | `return Math.max(5, Math.round((teamCount - 1)));` |  |

### `src\services\as-of-filter.js` — 1 şüpheli literal

| Satır | Değer | Bağlam | Tasnif (manuel) |
|---|---|---|---|
| 52 | `1000` | `cutoffISO: new Date(cutoff * 1000).toISOString(),` |  |

