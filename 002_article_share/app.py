import os
import streamlit as st
import anthropic
import trafilatura
import json
from urllib.parse import quote
from pathlib import Path
from dotenv import load_dotenv, set_key
from bs4 import BeautifulSoup

ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

SYSTEM_PROMPT = """あなたはSNSマーケティングの専門家です。記事の内容を各プラットフォームに最適化された形で要約します。
- X(Twitter): 280文字以内、ハッシュタグ2〜3個含む、簡潔でインパクトのある文章
- Facebook: 制限なし、丁寧で読み応えのある文章、絵文字を適度に使用、段落を分けて読みやすく
- Threads: 500文字以内、Facebookと同様に丁寧で読み応えのある文章、絵文字を適度に使用"""


def extract_title_from_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        return og_title["content"].strip()
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    return "タイトル不明"


def fetch_article(url: str) -> tuple[str, str]:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError("URLからコンテンツを取得できませんでした")
    result = trafilatura.bare_extraction(downloaded)
    if not result:
        raise ValueError("記事コンテンツの抽出に失敗しました")
    if isinstance(result, dict):
        title = result.get("title") or ""
        text = result.get("text") or ""
    else:
        title = getattr(result, "title", None) or ""
        text = getattr(result, "text", None) or ""
    if not title:
        title = extract_title_from_html(downloaded)
    if not text:
        raise ValueError("記事本文を抽出できませんでした")
    return title, text


def summarize_article(client: anthropic.Anthropic, title: str, content: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": f"""以下の記事を各SNSプラットフォーム向けに要約してください。

タイトル: {title}

本文:
{content[:4000]}

以下のJSON形式のみで返してください（JSON以外は出力しないでください）:
{{
    "x": "X(Twitter)用テキスト（ハッシュタグ含む、280文字以内）",
    "facebook": "Facebook用テキスト（詳しく、絵文字使用可）",
    "threads": "Threads用テキスト（500文字以内、カジュアルなトーン）"
}}""",
            }
        ],
    )
    raw = response.content[0].text.strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    return json.loads(raw[start:end])


def make_share_links(texts: dict, url: str) -> dict:
    encoded_url = quote(url, safe="")
    return {
        "x": f"https://twitter.com/intent/tweet?text={quote(texts['x'], safe='')}&url={encoded_url}",
        "facebook": f"https://www.facebook.com/sharer/sharer.php?u={encoded_url}",
        "threads": f"https://www.threads.net/intent/post?text={quote(texts['threads'] + chr(10) + url, safe='')}",
    }


# --- UI ---
st.set_page_config(page_title="記事シェアアプリ", page_icon="📢", layout="wide")
st.title("📢 記事シェアアプリ")
st.caption("記事のURLを入力すると、X・Facebook・Threadsに最適化された要約を自動生成します")

with st.sidebar:
    st.header("⚙️ 設定")
    saved_key = os.getenv("ANTHROPIC_API_KEY", "")
    api_key = st.text_input(
        "Anthropic APIキー",
        value=saved_key,
        type="password",
        placeholder="sk-ant-...",
    )
    if api_key and api_key != saved_key:
        if st.button("💾 APIキーを保存", use_container_width=True):
            set_key(str(ENV_PATH), "ANTHROPIC_API_KEY", api_key)
            st.success("保存しました。次回から自動で読み込まれます。")
    elif saved_key:
        st.caption("✅ 保存済みのAPIキーを使用中")
        if st.button("🗑️ 削除", use_container_width=True):
            set_key(str(ENV_PATH), "ANTHROPIC_API_KEY", "")
            st.rerun()
    st.markdown(
        "APIキーをお持ちでない場合は [こちら](https://console.anthropic.com/) から取得できます（無料枠あり）。"
    )
    st.divider()
    st.caption("APIキーはこのPCの .env ファイルにのみ保存されます。")

url_input = st.text_input("📎 記事のURL", placeholder="https://example.com/article")

if st.button("✨ 要約を生成", type="primary", disabled=not (url_input and api_key)):
    with st.spinner("🔍 記事を取得中..."):
        try:
            title, content = fetch_article(url_input)
        except Exception as e:
            st.error(f"記事の取得に失敗しました: {e}")
            st.stop()

    st.info(f"📄 **{title}**")

    with st.spinner("🤖 Claudeが要約を生成中..."):
        try:
            client = anthropic.Anthropic(api_key=api_key)
            texts = summarize_article(client, title, content)
        except anthropic.AuthenticationError:
            st.error("APIキーが無効です。正しいキーを入力してください。")
            st.stop()
        except Exception as e:
            st.error(f"要約の生成に失敗しました: {e}")
            st.stop()

    share_links = make_share_links(texts, url_input)

    st.success("✅ 要約が完成しました！テキストは編集できます。")
    st.divider()

    def copy_button(text: str, key: str):
        escaped = json.dumps(text)
        st.components.v1.html(
            f"""<button id="btn_{key}" onclick="
              var t={escaped};
              if(navigator.clipboard){{
                navigator.clipboard.writeText(t).then(function(){{
                  var b=document.getElementById('btn_{key}');
                  b.innerText='✅ コピー済み';
                  setTimeout(function(){{b.innerText='📋 テキストをコピー'}},2000);
                }});
              }} else {{
                var ta=document.createElement('textarea');
                ta.value=t; ta.style.position='fixed'; ta.style.opacity=0;
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                var b=document.getElementById('btn_{key}');
                b.innerText='✅ コピー済み';
                setTimeout(function(){{b.innerText='📋 テキストをコピー'}},2000);
              }}"
            style="width:100%;padding:8px;background:#f0f2f6;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:14px">
            📋 テキストをコピー</button>""",
            height=45,
        )

    col1, col2, col3 = st.columns(3)

    with col1:
        st.subheader("𝕏 X (Twitter)")
        edited_x = st.text_area("", texts["x"], height=200, key="x_text")
        count_x = len(edited_x)
        st.markdown(f"文字数: {'🔴' if count_x > 280 else '🟢'} **{count_x} / 280**")
        st.link_button("𝕏 でシェア →", share_links["x"], use_container_width=True)

    with col2:
        st.subheader("📘 Facebook")
        edited_fb = st.text_area("", texts["facebook"], height=200, key="fb_text")
        st.markdown(f"文字数: 🟢 **{len(edited_fb)}**")
        copy_button(edited_fb, "fb")
        st.caption("① テキストをコピー → ② シェアボタンで開いて貼り付け")
        st.link_button("📘 Facebook でシェア →", share_links["facebook"], use_container_width=True)

    with col3:
        st.subheader("🧵 Threads")
        edited_threads = st.text_area("", texts["threads"], height=200, key="threads_text")
        count_t = len(edited_threads)
        st.markdown(f"文字数: {'🔴' if count_t > 500 else '🟢'} **{count_t} / 500**")
        st.link_button("🧵 Threads でシェア →", share_links["threads"], use_container_width=True)

elif not api_key:
    st.info("👈 左のサイドバーにAnthropicのAPIキーを入力してください。")
