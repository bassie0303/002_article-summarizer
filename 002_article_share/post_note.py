#!/usr/bin/env python3
"""note.com 投稿・更新 CLI

使い方:
  # 新規投稿（下書き）
  python post_note.py --title "タイトル" --body draft.txt

  # 新規投稿（即公開）
  python post_note.py --title "タイトル" --body draft.txt --status published

  # 既存記事を更新
  python post_note.py --update n1234abcd --title "新タイトル" --body draft.txt

  # 下書きを公開に変更
  python post_note.py --update n1234abcd --status published
"""
import argparse
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from note_publisher import get_publisher


def main():
    parser = argparse.ArgumentParser(description="note.com 投稿・更新CLI")
    parser.add_argument("--title", help="記事タイトル")
    parser.add_argument("--body", help="本文ファイルパス（.txt / .md）")
    parser.add_argument(
        "--status",
        choices=["draft", "published"],
        default="draft",
        help="投稿ステータス（デフォルト: draft）",
    )
    parser.add_argument("--update", metavar="NOTE_KEY", help="更新対象のノートキー（例: n1234abcd）")
    args = parser.parse_args()

    # 本文を読み込む
    body = None
    if args.body:
        body_path = Path(args.body)
        if not body_path.exists():
            print(f"❌ ファイルが見つかりません: {args.body}", file=sys.stderr)
            sys.exit(1)
        body = body_path.read_text(encoding="utf-8")

    try:
        publisher = get_publisher("_mit")
    except RuntimeError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)

    if args.update:
        # 更新モード
        print(f"🔄 ノート更新中: {args.update}")
        result = publisher.update(
            note_key=args.update,
            title=args.title,
            body=body,
            status=args.status if args.status else None,
        )
    else:
        # 新規投稿モード
        if not args.title or not body:
            print("❌ 新規投稿には --title と --body が必要です", file=sys.stderr)
            sys.exit(1)
        print(f"📤 新規投稿中: {args.title}")
        result = publisher.publish(
            title=args.title,
            body=body,
            status=args.status,
        )

    print(f"\n✅ 完了!")
    print(f"   ステータス : {result['status']}")
    print(f"   ノートキー : {result['id']}")
    print(f"   URL        : {result['url']}")


if __name__ == "__main__":
    main()
