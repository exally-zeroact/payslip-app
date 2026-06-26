/* supa-config.js — Supabase接続設定(倉庫=Exally・全アプリ共有プロジェクト)
 * URLとanon(公開鍵)はクライアント埋め込みで安全＝RLSで本人ぶんだけ保護(代行請求アプリと同方式)。
 * これが読み込まれ window.supabase(supabase-js) があれば store.js が自動でクラウドモードになる。
 */
window.SUPA = {
  url: 'https://tnfwipbgfgjaymlszeid.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek'
};
