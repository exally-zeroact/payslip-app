/* admin.js — Exally 管理画面。管理者(exally_adminsに登録されたuid)だけが全ユーザーの利用状態を操作。
 *  セキュリティは Supabase RLS が本体(このJSはUIだけ)。service_roleキーは使わない=Webに置かない。
 *  ・ログイン → 管理者判定(exally_admins自分の行) → 全 exally_entitlements を一覧 → プランをワンタップ更新。
 */
(function () {
  'use strict';
  if (!(window.SUPA && window.supabase)) { document.getElementById('msg').textContent = 'Supabase設定が読めません'; return; }
  var sb = window.supabase.createClient(window.SUPA.url, window.SUPA.key);
  var $ = function (id) { return document.getElementById(id); };

  var PLANS = [
    { key: 'trial', label: 'お試し' },
    { key: 'paid', label: '有料' },
    { key: 'free', label: '無料' },
    { key: 'disabled', label: '停止' }
  ];
  var APP_LABEL = { payslip: '給料明細', invoice: '請求書', daiko: 'ダイコメ' };
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
    sb.from('exally_entitlements').select('account_id,app,plan,email,created_at').order('email', { ascending: true }).then(function (r) {
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
      return '<div class="u"><div class="em">' + emailShow + '</div><div class="meta">登録 ' + esc(created) + ' ・ id ' + esc(String(u.account_id).slice(0, 8)) + '…</div>' + apps + '</div>';
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

  // 初期表示
  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) boot(); else show('login'); });
})();
