# Epiphany デプロイ手順

構成: **バックエンド = Railway（FastAPI + Postgres）** / **フロント = Railway（Next.js）**。
（フロントは Vercel でも可。末尾の「代替」参照）

```
ブラウザ ──HTTPS──> Next.js (Railway) ──HTTPS/SSE──> FastAPI (Railway) ──> Postgres (Railway)
                                       直接叩く（NEXT_PUBLIC_API_BASE）
```

前提: `railway login` 済み（CLI v4+）。

---

## 1. バックエンド（FastAPI + Postgres）

```bash
cd 009_epiphany/backend

# プロジェクト作成（初回のみ）
railway init -n epiphany

# Postgres を追加（DATABASE_URL が自動で注入される）
railway add --database postgres

# バックエンドのサービスを作成しデプロイ
railway up

# 環境変数を設定（値は実際のキーに置き換え）
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..." \
  --set "OPENAI_API_KEY=sk-..." \
  --set "GEMINI_API_KEY=..." \
  --set "ENABLE_WEB_SEARCH=true"

# 公開ドメインを発行
railway domain
# → https://epiphany-backend-xxxx.up.railway.app を控える（= BACKEND_URL）

# 疎通確認
curl https://<BACKEND_URL>/api/health
# {"status":"ok","checkpointer":"postgres",...} が返れば成功
```

> `DATABASE_URL` は Postgres プラグインが自動注入。コードは `postgresql://` を検知して
> 自動で Postgres チェックポインタ＋セッション索引（sessions テーブル）を使う。

---

## 2. フロントエンド（Next.js）

```bash
cd 009_epiphany/frontend

# 同じ Railway プロジェクトに別サービスとして作成
railway service create epiphany-frontend   # or railway up で新サービス

# バックエンドURLをビルド時変数として設定（焼き込まれる）
railway variables --set "NEXT_PUBLIC_API_BASE=https://<BACKEND_URL>"

railway up
railway domain
# → https://epiphany-frontend-yyyy.up.railway.app（= FRONTEND_URL）
```

---

## 3. CORS を仕上げる（重要）

バックエンドにフロントの公開URLを許可させる:

```bash
cd 009_epiphany/backend
railway variables --set "CORS_ORIGINS=https://<FRONTEND_URL>"
# 反映のため再デプロイ
railway up
```

ブラウザで `https://<FRONTEND_URL>` を開き、審議が回れば完了。

---

## 環境変数まとめ

| サービス | 変数 | 値 |
|---|---|---|
| backend | ANTHROPIC_API_KEY | 必須 |
| backend | OPENAI_API_KEY / GEMINI_API_KEY | 任意 |
| backend | DATABASE_URL | Postgres プラグインが自動注入 |
| backend | CORS_ORIGINS | フロントの公開URL |
| backend | ENABLE_WEB_SEARCH | true |
| frontend | NEXT_PUBLIC_API_BASE | バックエンドの公開URL |

## トラブルシュート
- **health が memory/sqlite になる** … DATABASE_URL が postgres を指しているか確認
- **CORS エラー** … backend の CORS_ORIGINS にフロントURLが入っているか
- **SSE が途中で切れる** … フロントは必ず NEXT_PUBLIC_API_BASE 直結（プロキシ経由にしない）

## 代替: フロントを Vercel に
```bash
cd 009_epiphany/frontend
npm i -g vercel && vercel login
vercel --prod   # 環境変数 NEXT_PUBLIC_API_BASE をダッシュboardで設定
```
