/* admin.js — Exally 管理画面。管理者(exally_adminsに登録されたuid)だけが全ユーザーの利用状態を操作。
 *  セキュリティは Supabase RLS が本体(このJSはUIだけ)。service_roleキーは使わない=Webに置かない。
 *  ・ログイン → 管理者判定(exally_admins自分の行) → 全 exally_entitlements を一覧 → プランをワンタップ更新。
 */
(function () {
  'use strict';
  if (!(window.SUPA && window.supabase)) { document.getElementById('msg').textContent = 'Supabase設定が読めません'; return; }
  var sb = window.supabase.createClient(window.SUPA.url, window.SUPA.key);
  var $ = function (id) { return document.getElementById(id); };

  // 全件ページング(PostgREST既定 max_rows=1000 で全ユーザー/全法定行が黙って切れるのを根治)。
  // build=(from,to)=>.select(cols,{count:'exact'})...range(from,to) を付けた完成クエリ。返り={data,error,count}。
  function fetchAllQ(build) {
    var out = [], from = 0, size = 1000;
    function step() {
      return Promise.resolve(build(from, from + size - 1)).then(function (r) {
        if (r.error) return { data: null, error: r.error };
        var got = r.data || []; out = out.concat(got);
        if (!got.length || r.count == null || out.length >= r.count)
          return { data: out, error: null, count: (r.count == null ? out.length : r.count) };
        from += got.length; return step(); // ★実受信数で進める(上限<ページ幅でも漏れない)
      });
    }
    return step();
  }

  var PLANS = [
    { key: 'trial', label: 'お試し' },
    { key: 'paid', label: '有料' },
    { key: 'free', label: '無料' },
    { key: 'disabled', label: '停止' }
  ];
  var APP_LABEL = { payslip: '給料明細', invoice: '請求書', daiko: 'ダイコメ', suite: 'Exally' };
  var rows = [];        // 全 entitlements
  var curEmail = '';

  function show(id) { ['login', 'denied', 'panel'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); }); $('topbar').classList.toggle('hide', id === 'login'); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
  var toastT = null;
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); if (toastT) clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1800); }

  // ── ログイン ──
  $('signin').onclick = function () {
    var e = $('email').value.trim(), p = $('pw').value;
    if (!e || !p) { $('msg').textContent = 'メールとパスワードを入力'; return; }
    $('msg').textContent = 'ログイン中…';
    sb.auth.signInWithPassword({ email: e, password: p }).then(function (r) {
      if (r.error) { $('msg').textContent = /Invalid/.test(r.error.message) ? 'メールかパスワードが違います' : r.error.message; }
      else { $('msg').textContent = ''; boot(); }
    });
  };
  $('pw').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('signin').click(); });
  $('logout').onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
  $('refresh').onclick = function () { loadList(); };
  $('q').addEventListener('input', render);

  // ── 起動: セッション確認 → 管理者判定 ──
  function boot() {
    sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user; if (!u) { show('login'); return; }
      curEmail = u.email || ''; $('who').textContent = curEmail;
      // 管理者か? (exally_admins 自分の行が読めれば管理者)
      sb.from('exally_admins').select('account_id').eq('account_id', u.id).maybeSingle().then(function (a) {
        if (a.data) { show('panel'); loadList(); }
        else { show('denied'); }
      });
    });
  }

  function loadList() {
    $('stat').textContent = '読み込み中…';
    fetchAllQ(function (a, b) { return sb.from('exally_entitlements').select('account_id,app,plan,email,created_at', { count: 'exact' }).order('email', { ascending: true }).range(a, b); }).then(function (r) {
      if (r.error) { $('stat').textContent = '読み込みエラー: ' + r.error.message; rows = []; render(); return; }
      rows = r.data || []; render();
    });
  }

  function fmtDate(s) { if (!s) return ''; var d = String(s).slice(0, 10); return d; }

  function render() {
    var q = ($('q').value || '').trim().toLowerCase();
    // account_id 単位でまとめる(1人が複数アプリ)
    var byUser = {};
    rows.forEach(function (r) {
      var key = r.account_id;
      if (!byUser[key]) byUser[key] = { email: r.email || '', account_id: key, apps: [] };
      if (r.email && !byUser[key].email) byUser[key].email = r.email;
      byUser[key].apps.push(r);
    });
    var users = Object.keys(byUser).map(function (k) { return byUser[k]; });
    if (q) users = users.filter(function (u) { return (u.email || '').toLowerCase().indexOf(q) >= 0; });
    users.sort(function (a, b) { return (a.email || 'zzz').localeCompare(b.email || 'zzz'); });

    $('stat').textContent = 'ユーザー ' + users.length + '名 / 登録アプリ ' + rows.length + '件' + (q ? '（絞り込み中）' : '');
    if (!users.length) { $('list').innerHTML = '<div class="card empty">' + (rows.length ? '該当なし' : 'まだ登録ユーザーがいません') + '</div>'; return; }

    $('list').innerHTML = users.map(function (u) {
      var apps = u.apps.slice().sort(function (a, b) { return a.app.localeCompare(b.app); }).map(function (r) {
        var segs = PLANS.map(function (p) {
          var on = (r.plan === p.key);
          return '<button class="' + (on ? 'on ' + p.key : '') + '" data-set="' + attr(r.account_id) + '|' + attr(r.app) + '|' + p.key + '"' + (on ? ' disabled' : '') + '>' + p.label + '</button>';
        }).join('');
        var appName = APP_LABEL[r.app] || r.app;
        return '<div class="app"><span class="name">' + esc(appName) + '</span><span class="seg">' + segs + '</span></div>';
      }).join('');
      var emailShow = u.email ? esc(u.email) : '（メール未取得）';
      var created = fmtDate((u.apps[0] || {}).created_at);
      var appNames = u.apps.map(function (r) { return APP_LABEL[r.app] || r.app; }).join(' ・ ');
      var head = '<div class="app-head">登録アプリ（' + u.apps.length + '）: ' + esc(appNames) + '</div>';
      return '<div class="u"><div class="em">' + emailShow + '</div><div class="meta">登録 ' + esc(created) + ' ・ id ' + esc(String(u.account_id).slice(0, 8)) + '…</div>' + head + apps + '</div>';
    }).join('');

    // プラン変更ボタン配線
    Array.prototype.forEach.call($('list').querySelectorAll('button[data-set]'), function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute('data-set').split('|'); // account_id|app|plan
        setPlan(parts[0], parts[1], parts[2]);
      };
    });
  }

  function setPlan(account_id, app, plan) {
    sb.from('exally_entitlements').update({ plan: plan, updated_at: new Date().toISOString() })
      .eq('account_id', account_id).eq('app', app).then(function (r) {
        if (r.error) { toast('変更できませんでした: ' + r.error.message); return; }
        // ローカル反映(再取得せず即時)
        rows.forEach(function (x) { if (x.account_id === account_id && x.app === app) x.plan = plan; });
        var lbl = (PLANS.filter(function (p) { return p.key === plan; })[0] || {}).label || plan;
        toast((APP_LABEL[app] || app) + ' を「' + lbl + '」に変更しました');
        render();
      });
  }

  // ══════════════════════════════════════════════════════════════
  // 法定データ(中央 statutory)タブ — 差分を見て[反映]で全国配信
  // ══════════════════════════════════════════════════════════════
  var KIND_LABEL = {
    saitei_chingin: '最低賃金（都道府県別）', shakaihoken: '社会保険料率', koyo: '雇用保険料率',
    shotokuzei_densan: '所得税（源泉・電算）', shotokuzei_hei: '所得税（月額表）', shotokuzei_nichi: '所得税（日額表）',
    shoyo: '賞与の源泉徴収', nenmatsu: '年末調整', warimashi: '割増賃金率', shouhizei: '消費税率'
  };
  var statLoaded = false;

  // タブ切替
  $('tab-users').onclick = function () { switchTab('users'); };
  $('tab-statutory').onclick = function () { switchTab('statutory'); };
  function switchTab(t) {
    $('tab-users').classList.toggle('on', t === 'users');
    $('tab-statutory').classList.toggle('on', t === 'statutory');
    $('sec-users').classList.toggle('hide', t !== 'users');
    $('sec-statutory').classList.toggle('hide', t !== 'statutory');
    if (t === 'statutory' && !statLoaded) { statLoaded = true; loadStatutory(); }
  }
  $('statutory-refresh').onclick = function () { loadStatutory(); };

  // libの実体を解決(admin.htmlで先に読込済み。saitei/shakaihokenはconstグローバル=bare参照、他はwindow)
  function resolveLibs() {
    return {
      SHH: (typeof SHAKAIHOKEN_HYO !== 'undefined') ? SHAKAIHOKEN_HYO : window.SHAKAIHOKEN_HYO,
      SAI: (typeof SAITEI_CHINGIN !== 'undefined') ? SAITEI_CHINGIN : window.SAITEI_CHINGIN,
      KOYO: window.KoyoHoken, D: window.ShotokuzeiDensan, H: window.ShotokuzeiHei,
      NI: window.ShotokuzeiNichi, SZ: window.ShoyoZei, N: window.Nenmatsu, WM: window.Warimashi
    };
  }

  function loadStatutory() {
    $('statutory-stat').textContent = '読み込み中…';
    $('statutory-list').innerHTML = '';
    $('statutory-bulk').innerHTML = '';
    var SR = window.StatutoryRows;
    if (!SR) { $('statutory-stat').textContent = '法定lib(statutory-rows.js)が読めません'; return; }
    var desired;
    try { desired = SR.buildStatutoryRows(resolveLibs()); }
    catch (e) { $('statutory-stat').textContent = '内蔵値の生成に失敗: ' + e.message; return; }
    fetchAllQ(function (a, b) { return sb.from('statutory').select('kind,year,data', { count: 'exact' }).range(a, b); }).then(function (r) {
      if (r.error) { $('statutory-stat').textContent = '中央の読み込みエラー: ' + r.error.message; return; }
      var diffs = SR.diffRows(desired, r.data || []);
      renderStatutory(diffs);
    });
  }

  function renderStatutory(diffs) {
    var stale = diffs.filter(function (d) { return d.status !== 'same'; });
    $('statutory-stat').textContent = stale.length
      ? ('未反映/要更新 ' + stale.length + '件 — [反映]で全国配信')
      : 'すべて最新です（中央＝内蔵値）。法改正で差分が出ると各項目に[反映]ボタンが表示されます';

    $('statutory-list').innerHTML = diffs.map(function (d) {
      var label = KIND_LABEL[d.kind] || d.kind;
      var isStale = d.status !== 'same';
      var badge = d.status === 'same'
        ? '<span class="badge ok">✓ 最新</span>'
        : (d.status === 'new'
          ? '<span class="badge warn">⚠ 中央に未収録</span>'
          : '<span class="badge warn">⚠ 値が更新されています</span>');
      var applyBtn = isStale
        ? '<button class="apply" data-apply="' + attr(d.kind) + '|' + attr(String(d.year)) + '">反映</button>'
        : '';
      var src = d.source_url ? '<a class="src" href="' + attr(d.source_url) + '" target="_blank" rel="noopener">出典</a>' : '';
      return '<div class="st' + (isStale ? ' stale' : '') + '"><span class="nm">' + esc(label)
        + ' <span class="yr">' + esc(String(d.year)) + '</span></span>' + badge + src + applyBtn + '</div>';
    }).join('');

    // 一括反映
    if (stale.length) {
      $('statutory-bulk').innerHTML = '<button id="statutory-apply-all">差分をすべて反映（' + stale.length + '件）</button>';
      $('statutory-apply-all').onclick = function () { reflect(stale); };
    } else {
      $('statutory-bulk').innerHTML = '';
    }

    // 個別反映(該当行のdesiredを引く)
    Array.prototype.forEach.call($('statutory-list').querySelectorAll('button[data-apply]'), function (btn) {
      btn.onclick = function () {
        var p = btn.getAttribute('data-apply').split('|'); // kind|year
        var row = diffs.filter(function (d) { return d.kind === p[0] && String(d.year) === p[1]; })[0];
        if (row) reflect([row]);
      };
    });
  }

  // RPC statutory_upsert で中央へ書込(管理者のみ・RLSはサーバ側で強制)
  function reflect(list) {
    Array.prototype.forEach.call(document.querySelectorAll('#sec-statutory button'), function (b) { b.disabled = true; });
    var done = 0, errs = [];
    var jobs = list.map(function (d) {
      return sb.rpc('statutory_upsert', { p_kind: d.kind, p_year: d.year, p_data: d.data, p_source_url: d.source_url || null })
        .then(function (r) { if (r.error) errs.push((KIND_LABEL[d.kind] || d.kind) + ': ' + r.error.message); else done++; });
    });
    Promise.all(jobs).then(function () {
      if (errs.length) toast('反映エラー: ' + errs[0]);
      else toast(done + '件を中央に反映しました（全国配信）');
      loadStatutory(); // 再取得で状態更新(ボタンも復帰)
    });
  }

  // 初期表示
  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) boot(); else show('login'); });
})();
