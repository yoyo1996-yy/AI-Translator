import type { TranslationHistoryItem } from "../types/realtime";

export function TranslationHistory({ items }: { items: TranslationHistoryItem[] }) {
  return (
    <section className="history-section" aria-labelledby="history-title">
      <h2 id="history-title">最近翻译</h2>
      {items.length === 0 ? (
        <p className="history-empty">完成一句翻译后会显示在这里。</p>
      ) : (
        <ol className="history-list">
          {items.map((item) => (
            <li key={item.id} className="history-item">
              <span className={`history-direction history-direction-${item.direction}`}>
                {item.direction === "push_to_talk" ? "Push-To-Talk" : "Conversation"}
              </span>
              <p className="history-source">{item.source || "未返回原文"}</p>
              <p className="history-translation">{item.translation || "未返回译文"}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

