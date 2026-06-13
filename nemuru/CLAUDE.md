# CLAUDE.md

このファイルは、本リポジトリのコードを扱う際の Claude Code（claude.ai/code）向けガイドです。

## 概要

`com.nemuru.app` という Android アプリ用に作成された Android Studio プロジェクトの**空の入れ物**。実体は `android/.idea/` 配下の IDE 設定 XML 2 ファイル（`workspace.xml` と `deploymentTargetSelector.xml`）のみで、Gradle ファイル・Kotlin/Java ソース・`AndroidManifest.xml`・`app/` モジュールの中身は**まだ存在しない**。

本ディレクトリで実装に着手する前に、同名アプリの実装一式が `../008_nemuru/`（`README.md`, `CLAUDE.md`, `docs/`, Gradle プロジェクトを含む `android/`, `preview/` 等）に既にある点を確認すること。重複作業を避けるための照合が必要。

## 重要な不変条件（壊してはいけない）

- **このディレクトリにはアプリ本体のソースが無い** — `.idea/` の IDE 設定だけが存在する状態。「コードが見当たらないので新規作成」と早合点して `app/` モジュールを立ち上げる前に、`../008_nemuru/` の実装と意図のすり合わせを行うこと。（→ *既知のクセ / コードに見えるが違うもの*）
- **アプリ ID とモジュール名は `workspace.xml` に固定されている** — モジュール名 `nemuru.app`、アプリ ID `com.nemuru.app`（テスト用 `com.nemuru.app.test`）、Run Configuration 名 `app`。新しく `build.gradle` 等を起こす場合はこれらと整合させる（IDE が既存の Run Configuration を引き続き使えるように）。（→ *プロジェクト構成*）
- **`workspace.xml` の `ChangeListManager` は無効な履歴を含む** — `../../article_share/...` を指す `beforePath` が残っているが、これらのパスは git 履歴上リネーム済み（`002_article_share/`）。IDE 表示の差分情報を信用しない。
- **Git リポジトリのルートはこのディレクトリではない** — `git rev-parse --show-toplevel` は `/Users/yusuke/claude_test` を返す。`git status` は `claude_test` 配下の他プロジェクト（`000_realestate_manager/` 等）も untracked として列挙する。本ディレクトリだけを対象にしたいときはパス指定が必要。
- **記述言語は日本語** — UI 文字列・コメント・コミットメッセージは日本語。`008_nemuru/` 側の既存スタイル（fix:/feat: プレフィックス + 日本語本文）に合わせる。

## コマンド

実行可能なビルド/テスト設定は**まだ存在しない**（`build.gradle` も `gradlew` も無い）。

Android Studio で開く場合、`workspace.xml` の `last_opened_file_path` は `/Users/yusuke/claude_test/nemuru/android` を指している。

テストスイート・リンター・フォーマッターは未設定。

## プロジェクト構成

| パス | 役割 |
| --- | --- |
| `android/.idea/workspace.xml` | Android Studio のワークスペース設定。モジュール名 `nemuru.app`、アプリ ID `com.nemuru.app`、Run Configuration `app` が定義されている |
| `android/.idea/deploymentTargetSelector.xml` | デプロイ先の選択状態。Pixel_8a AVD（`/Users/yusuke/.android/avd/Pixel_8a.avd`）が DEFAULT_BOOT として選択されている |

上記以外のソース・ビルド成果物・ドキュメントは無い。

## 既知のクセ / コードに見えるが違うもの

### `../008_nemuru/` との関係

`/Users/yusuke/claude_test/` 直下に `008_nemuru/` が別ディレクトリとして存在し、こちらには本物の Android プロジェクト（`android/build.gradle`, `android/app/build.gradle`, `android/gradle/libs.versions.toml`, `android/app/google-services.json` 等）と `CLAUDE.md`・`README.md`・`docs/`・`preview/` 一式が揃っている。本 `nemuru/` ディレクトリは IDE シェルだけで実装が無いため、機能追加の指示を受けた場合はまず両者の関係（どちらが正本か、移植中か、片方を破棄するのか）をユーザに確認すること。

### `workspace.xml` の参照する `beforePath` は古い

`ChangeListManager` セクションに `$PROJECT_DIR$/../../article_share/...` を起点とした変更履歴が残っているが、`article_share/` は git 履歴で `002_article_share/` にリネーム済み。IDE 表示の未コミット差分は当てにせず、`git status` / `git diff` を直接見る。
