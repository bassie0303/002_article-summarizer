"""note.com への記事投稿モジュール（article_share 用）"""
import os
from typing import Literal, Optional

import requests

NoteStatus = Literal["draft", "published", "limited_price"]

ACCOUNTS = {
    "_mit": {
        "env_key": "NOTE_SESSION_MIT",
        "label": "ミヤザキ小技研究所（_mit）",
        "username": "_mit",
    },
}


class NotePublisher:
    """note.com に記事を投稿するクライアント"""

    BASE_URL = "https://note.com/api"

    def __init__(self, session_token: str, username: str = ""):
        self.session_token = session_token
        self.username = username
        self._session = requests.Session()
        self._session.cookies.set(
            "_note_session_v5", session_token, domain="note.com"
        )
        self._session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
            ),
            "Referer": "https://note.com/",
            "Origin": "https://note.com",
            "X-Requested-With": "XMLHttpRequest",
        })

    def publish(
        self,
        title: str,
        body: str,
        status: NoteStatus = "draft",
        price: int = 0,
        hashtags: Optional[list[str]] = None,
        image_urls: Optional[list[str]] = None,
    ) -> dict:
        """記事を新規投稿する。

        Returns:
            {"id": str, "url": str, "status": str}
        """
        # Step1: ノートを作成してIDを取得
        create_res = self._session.post(
            f"{self.BASE_URL}/v1/text_notes",
            json={"name": title, "price": price},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        if not create_res.ok:
            raise RuntimeError(
                f"note.com ノート作成失敗 ({create_res.status_code}): {create_res.text[:300]}"
            )
        note_data = create_res.json().get("data", {})
        note_id = note_data.get("id")
        note_key = note_data.get("key", "")
        print(f"  📝 ノート作成: id={note_id}, key={note_key}")

        # Step2: 本文を draft_save で保存
        html_body = _to_html(body, image_urls=image_urls)
        is_publishing = status in ("published", "limited_price")
        save_body = {
            "name": title,
            "body": html_body,
            "body_length": len(body),
            "index": is_publishing,
            "is_lead_form": False,
        }
        if is_publishing:
            save_body["status"] = status
            if status == "limited_price" and price > 0:
                save_body["price"] = price

        save_res = self._session.post(
            f"{self.BASE_URL}/v1/text_notes/draft_save",
            params={"id": note_id, "is_temp_saved": "false" if is_publishing else "true"},
            json=save_body,
            headers={
                "Content-Type": "application/json",
                "Referer": f"https://note.com/notes/{note_key}/edit/",
            },
            timeout=30,
        )
        if not save_res.ok:
            raise RuntimeError(
                f"note.com 下書き保存失敗 ({save_res.status_code}): {save_res.text[:300]}"
            )
        print(f"  💾 下書き保存完了")

        actual_status = status if is_publishing else "draft"
        if is_publishing:
            saved_status = save_res.json().get("data", {}).get("status", "")
            print(f"  📄 draft_save レスポンス status: '{saved_status}'")
            if saved_status not in ("published", "limited_price", "public"):
                actual_status = self._do_publish(note_id, note_key, status, price, html_body, title, len(body))

        note_url = (
            f"https://note.com/{self.username}/n/{note_key}"
            if self.username else f"https://note.com/n/{note_key}"
        )
        return {"id": note_key, "url": note_url, "status": actual_status}

    def get_note(self, note_key: str) -> dict:
        """note_key からノート情報（numeric id 含む）を取得する。"""
        for ver in ("v3", "v1"):
            r = self._session.get(
                f"{self.BASE_URL}/{ver}/notes/{note_key}",
                timeout=15,
            )
            if r.ok:
                data = r.json().get("data", r.json())
                return data
        raise RuntimeError(f"ノート情報取得失敗 (key={note_key})")

    def update(
        self,
        note_key: str,
        title: Optional[str] = None,
        body: Optional[str] = None,
        status: Optional[NoteStatus] = None,
        price: int = 0,
        image_urls: Optional[list[str]] = None,
    ) -> dict:
        """既存ノートを更新する。

        Returns:
            {"id": str, "url": str, "status": str}
        """
        note_data = self.get_note(note_key)
        note_id = note_data.get("id") or note_data.get("note_id")
        if not note_id:
            raise RuntimeError(f"ノートの numeric id が取得できませんでした: {note_data}")

        current_title = note_data.get("name", "")
        current_status = note_data.get("status", "draft")

        use_title = title if title is not None else current_title
        use_status = status if status is not None else current_status
        is_publishing = use_status in ("published", "limited_price")

        html_body = _to_html(body, image_urls=image_urls) if body is not None else None

        save_body: dict = {
            "name": use_title,
            "body_length": len(body) if body else 0,
            "index": is_publishing,
            "is_lead_form": False,
        }
        if html_body is not None:
            save_body["body"] = html_body
        if is_publishing:
            save_body["status"] = use_status
            if use_status == "limited_price" and price > 0:
                save_body["price"] = price

        save_res = self._session.post(
            f"{self.BASE_URL}/v1/text_notes/draft_save",
            params={"id": note_id, "is_temp_saved": "false" if is_publishing else "true"},
            json=save_body,
            headers={
                "Content-Type": "application/json",
                "Referer": f"https://note.com/notes/{note_key}/edit/",
            },
            timeout=30,
        )
        if not save_res.ok:
            raise RuntimeError(
                f"note.com 更新失敗 ({save_res.status_code}): {save_res.text[:300]}"
            )
        print(f"  💾 更新保存完了 (key={note_key}, status={use_status})")

        actual_status = use_status
        if is_publishing:
            saved_status = save_res.json().get("data", {}).get("status", "")
            if saved_status not in ("published", "limited_price", "public"):
                actual_status = self._do_publish(note_id, note_key, use_status, price)

        note_url = (
            f"https://note.com/{self.username}/n/{note_key}"
            if self.username else f"https://note.com/n/{note_key}"
        )
        return {"id": note_key, "url": note_url, "status": actual_status}

    def _do_publish(self, note_id, note_key: str, status: str, price: int,
                    html_body: str = "", title: str = "", body_length: int = 0) -> str:
        """下書き保存済みのノートを公開する。"""
        import time
        referer = f"https://note.com/notes/{note_key}/edit/"
        ts = int(time.time() * 1000)
        BASE_V3 = "https://note.com/api/v3"
        params = {"draft": "false", "draft_reedit": "false", "ts": ts}

        for method in ("put", "post"):
            r = getattr(self._session, method)(
                f"{BASE_V3}/notes/{note_key}",
                params=params,
                headers={"Content-Type": "application/json", "Referer": referer},
                timeout=30,
            )
            print(f"  🌐 公開試行 ({method.upper()} v3/notes/{note_key}): HTTP {r.status_code}")
            if r.ok:
                print(f"  ✅ 公開成功")
                return status

        print(f"  ⚠️  公開失敗 → 下書きのまま")
        return "draft"


def _to_html(text: str, image_urls: Optional[list[str]] = None) -> str:
    """プレーンテキストを note.com 向け簡易 HTML に変換する。"""
    html_parts = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    for p in paragraphs:
        lines = p.replace("\r\n", "\n").split("\n")
        html_parts.append("<p>" + "<br>".join(lines) + "</p>")

    if image_urls:
        html_parts.append("<p>📷 写真</p>")
        for i, url in enumerate(image_urls, 1):
            html_parts.append(
                f'<p><a href="{url}" target="_blank">📸 写真{i}を開く</a></p>'
            )
    return "\n".join(html_parts)


def get_publisher(account: str = "_mit") -> "NotePublisher":
    """アカウント名から NotePublisher を生成する。"""
    config = ACCOUNTS.get(account)
    if not config:
        raise ValueError(f"不明なアカウント: {account}（{list(ACCOUNTS.keys())}）")
    token = os.environ.get(config["env_key"])
    if not token:
        raise RuntimeError(
            f"環境変数 {config['env_key']} が設定されていません。\n"
            f".env に NOTE_SESSION_MIT=<セッショントークン> を追加してください。"
        )
    return NotePublisher(token, username=config.get("username", ""))
