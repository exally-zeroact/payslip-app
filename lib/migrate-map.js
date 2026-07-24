/* migrate-map.js — 他社給与ソフトのエクスポート(CSV/Excel)を「1ファイルで全員分」取り込むためのマッパ(純関数)。
 *  ★人数に比例した手間ゼロ＝1ファイル→全従業員。列名を柔軟に解釈し、従業員マスタ用フィールドと
 *    「先月の突合用の値(支給合計/差引/各控除)」へ写像するだけ。金額計算・保存・UIはここではやらない★。
 *  ・列名はキーワードで対応(表記ゆれに強い)。AI/手動での列訂正は overrides で上書きできる。
 *  ・写真/PDFのOCRやAIによる未知列の推定は上位(app/api)の役割。ここは決定論のみ=テスト可能。
 * 【利用】ブラウザ window.MigrateMap / Node require('./migrate-map.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.MigrateMap = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // CSV 1行→フィールド配列(ダブルクオート対応・"" エスケープ)。行内改行は非対応(単純CSV前提)。
  function splitLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
    }
    out.push(cur);
    return out.map(function (s) { return s.replace(/^﻿/, '').trim(); });
  }

  // 全角数字/カンマ/コロンを半角化しカンマ除去(金額桁・全角吸収)。
  function znum(v) {
    return String(v == null ? '' : v).replace(/[，]/g, ',')
      .replace(/[０-９．：]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/,/g, '');
  }
  function toNum(v) { var n = Number(znum(v)); return isNaN(n) ? 0 : n; }
  // 数値文字列を defEmp と同じ「文字列」で返す(空は '')。整数は小数点を落とす。
  function numStr(v) {
    var s = znum(v).trim(); if (s === '') return '';
    var m = s.match(/^\((.+)\)$/); if (m) s = '-' + m[1]; // 会計式の (1000) は負数
    var n = Number(s); if (isNaN(n)) return '';
    return String(n);
  }

  // 生年月日を YYYY-MM-DD へ正規化(YYYY/M/D・YYYY.M.D・YYYY-M-D・YYYY年M月D日・8桁)。不明/和暦は ''(勝手に埋めない)。
  function toYmd(v) {
    var s = String(v == null ? '' : v).trim().replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (!s) return '';
    var m = s.match(/(\d{4})\s*[\/\.\-年]\s*(\d{1,2})\s*[\/\.\-月]\s*(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }

  // 列見出し→正準タグ。1見出しが複数該当しないよう優先順(ID/合計/各控除を手当より先に判定)。
  //  返り値: null | 'name'|'no'|'birth'|'fuyou'|'pref'|'hourly'|'residentTax'|'base'|'commute'|'allowance'
  //          |'prevGross'|'prevNet'|'prevDeductTotal'|'prevHealth'|'prevKaigo'|'prevPension'|'prevEmploy'|'prevTax'
  function classify(h) {
    var s = String(h || '').replace(/\s|　/g, '');
    if (!s) return null;
    if ((/番号|コード|ＩＤ/i.test(s) || /\bID\b/i.test(s) || /ID/.test(s)) && /従業員|社員/.test(s)) return 'no';
    if (/氏名|名前|従業員名|社員名|担当者名/.test(s)) return 'name';
    if (/生年月日|誕生日/.test(s)) return 'birth';
    // 先月の合計・差引・各控除(手当・「〜給」より先に判定)
    if (/差引支給|差引|手取り?|振込額?|支給額計/.test(s)) return 'prevNet';
    if (/総支給|支給合計|支給総額|支給計/.test(s)) return 'prevGross';
    if (/控除合計|控除計|控除額計/.test(s)) return 'prevDeductTotal';
    if (/健康保険|健保/.test(s)) return 'prevHealth';
    if (/介護保険/.test(s)) return 'prevKaigo'; // 「介護保険」のみ。介護手当/介護休業手当 は手当(allowance)へ
    if (/厚生年金|厚年/.test(s)) return 'prevPension';
    if (/雇用保険/.test(s)) return 'prevEmploy';
    if (/(所得税|源泉徴収税|源泉)/.test(s) && !/調整|年末調整|過不足/.test(s)) return 'prevTax'; // 所得税調整/年末調整過不足は除外
    if (/住民税|市民税|市区町村民税|都道府県民税|道府県民税|特別区民税|区民税|地方税/.test(s)) return 'residentTax';
    // 従業員設定
    if (/扶養/.test(s)) return 'fuyou';
    if ((/都道府県|居住地|所在県|県名/.test(s)) && !/民税/.test(s)) return 'pref'; // 「都道府県民税」を県列に誤分類しない
    if (/時給|時間給/.test(s)) return 'hourly';
    if (/基本給|基本賃金|本給/.test(s)) return 'base';
    if (/通勤手当|通勤費|交通費/.test(s)) return 'commute';
    // 残りで「手当/歩合/役職/住宅/家族/資格/技能/職務/精勤/皆勤/地域/調整/○○給」を含む列は支給(手当)行
    if (/手当|歩合|役職|住宅|家族|資格|技能|職務|職能|精勤|皆勤|地域|調整|営業|食事|物価|(?:^|[^基本])給$/.test(s)) return 'allowance';
    return null;
  }

  var META_TAGS = { name: 1, no: 1, birth: 1, fuyou: 1, pref: 1, hourly: 1, residentTax: 1, base: 1, commute: 1 };
  var PREV_TAGS = { prevGross: 1, prevNet: 1, prevDeductTotal: 1, prevHealth: 1, prevKaigo: 1, prevPension: 1, prevEmploy: 1, prevTax: 1 };
  var PREV_KOJO_LABEL = { prevHealth: '健康保険', prevKaigo: '介護保険', prevPension: '厚生年金', prevEmploy: '雇用保険', prevTax: '所得税' };

  // 見出し配列→列マッピング。overrides={colIndex:tag|''} でAI/手動訂正を反映('' は「この列は使わない」)。
  //  返り: { meta:{tag:index}, allowances:[{index,label}], prev:{tag:index}, tags:[tag per col] }
  function buildMapping(headers, overrides) {
    overrides = overrides || {};
    var meta = {}, prev = {}, allowances = [], tags = [];
    headers.forEach(function (h, i) {
      var tag = Object.prototype.hasOwnProperty.call(overrides, i) ? (overrides[i] || null) : classify(h);
      tags[i] = tag || null;
      if (!tag) return;
      if (tag === 'allowance') { allowances.push({ index: i, label: String(h || '').trim() }); }
      else if (META_TAGS[tag]) { if (meta[tag] == null) meta[tag] = i; }
      else if (PREV_TAGS[tag]) { if (prev[tag] == null) prev[tag] = i; }
    });
    return { meta: meta, allowances: allowances, prev: prev, tags: tags };
  }

  // ヘッダ+データ行(2次元)→取込レコード。col値の取り出しは cols[index]。
  function buildRows(headers, dataRows, overrides) {
    var mp = buildMapping(headers, overrides);
    var m = mp.meta, warnings = [];
    if (m.name == null) warnings.push('「氏名」の列が見つかりません（氏名/名前/従業員名 等の見出しが必要）');
    var out = [];
    for (var r = 0; r < dataRows.length; r++) {
      var cols = dataRows[r] || [];
      var name = m.name != null ? String(cols[m.name] == null ? '' : cols[m.name]).trim() : '';
      if (!name) continue;
      var shikyu = [];
      var baseStr = m.base != null ? numStr(cols[m.base]) : '';
      if (baseStr !== '') shikyu.push({ label: '基本給', value: baseStr });
      mp.allowances.forEach(function (a) {
        var v = numStr(cols[a.index]);
        if (v !== '' && Number(v) !== 0) shikyu.push({ label: a.label, value: v });
      });
      var commuteStr = m.commute != null ? numStr(cols[m.commute]) : '';
      if (commuteStr !== '') shikyu.push({ label: '通勤手当', value: commuteStr });

      // 先月の突合値(あるものだけ)。kojo は個別控除が取れた分だけ。
      var prev = mp.prev, prevKojo = [];
      Object.keys(PREV_KOJO_LABEL).forEach(function (tag) {
        if (prev[tag] != null) { var pv = numStr(cols[prev[tag]]); if (pv !== '') prevKojo.push({ label: PREV_KOJO_LABEL[tag], value: pv }); }
      });
      var prevObj = {
        gross: prev.prevGross != null ? numStr(cols[prev.prevGross]) : '',
        net: prev.prevNet != null ? numStr(cols[prev.prevNet]) : '',
        kojoTotal: prev.prevDeductTotal != null ? numStr(cols[prev.prevDeductTotal]) : '',
        kojo: prevKojo
      };
      var hasPrev = prevObj.gross !== '' || prevObj.net !== '' || prevKojo.length > 0;

      out.push({
        name: name,
        no: m.no != null ? String(cols[m.no] == null ? '' : cols[m.no]).trim() : '',
        birthYmd: m.birth != null ? toYmd(cols[m.birth]) : '',
        fuyou: m.fuyou != null ? numStr(cols[m.fuyou]) : '',
        pref: m.pref != null ? String(cols[m.pref] == null ? '' : cols[m.pref]).trim() : '',
        hourly: m.hourly != null ? numStr(cols[m.hourly]) : '',
        base: baseStr,
        commute: commuteStr,
        residentTax: m.residentTax != null ? numStr(cols[m.residentTax]) : '',
        shikyu: shikyu,
        prev: hasPrev ? prevObj : null
      });
    }
    return { headers: headers, mapping: mp, rows: out, warnings: warnings };
  }

  // 見出し行の位置を推定(タイトル行対策)。先頭〜8行で「氏名」列を含む最初の行=見出し。無ければ0。
  function pickHeaderIdx(rows2d) {
    var lim = Math.min(rows2d.length, 8);
    for (var i = 0; i < lim; i++) {
      var row = rows2d[i] || [];
      if (row.some(function (c) { return classify(c) === 'name'; })) return i;
    }
    return 0;
  }

  // CSVテキスト → buildRows。opts.overrides で列訂正。タイトル行があっても見出し行を自動検出。
  function parseCsv(text, opts) {
    opts = opts || {};
    var lines = String(text == null ? '' : text).split(/\r\n|\r|\n/).filter(function (l) { return l.replace(/[,\s]/g, '') !== ''; });
    if (!lines.length) return { headers: [], mapping: buildMapping([], {}), rows: [], warnings: ['空のCSVです'] };
    var all = lines.map(splitLine);
    var hi = pickHeaderIdx(all);
    return buildRows(all[hi], all.slice(hi + 1), opts.overrides);
  }

  // Excelなどの2次元配列(AOA: [ [header...], [row...], ... ]) → buildRows。
  function parseAoa(aoa, opts) {
    opts = opts || {};
    var a = (aoa || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); })
      .map(function (r) { return (r || []).map(function (c) { return String(c == null ? '' : c).replace(/^﻿/, '').trim(); }); });
    if (!a.length) return { headers: [], mapping: buildMapping([], {}), rows: [], warnings: ['空のシートです'] };
    var hi = pickHeaderIdx(a);
    return buildRows(a[hi], a.slice(hi + 1), opts.overrides);
  }

  return {
    parseCsv: parseCsv, parseAoa: parseAoa, buildRows: buildRows, buildMapping: buildMapping,
    classify: classify, toYmd: toYmd, numStr: numStr, splitLine: splitLine,
    META_TAGS: META_TAGS, PREV_TAGS: PREV_TAGS
  };
});
