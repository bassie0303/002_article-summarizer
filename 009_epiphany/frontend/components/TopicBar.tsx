"use client";

export default function TopicBar({
  topic,
  setTopic,
  onRun,
  busy,
}: {
  topic: string;
  setTopic: (v: string) => void;
  onRun: () => void;
  busy: boolean;
}) {
  return (
    <div className="topic-bar">
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onRun();
        }}
        placeholder="審議する議題を入力…（例：自社プロダクトに生成AI機能を導入すべきか）"
      />
      <button onClick={onRun} disabled={busy}>
        審議開始
      </button>
    </div>
  );
}
