import { ArrowLeft, Volume2 } from "lucide-react";

type LargeJapaneseViewProps = {
  text: string;
  onBack: () => void;
  onReplay: () => void;
};

export function LargeJapaneseView({ text, onBack, onReplay }: LargeJapaneseViewProps) {
  return (
    <main className="large-japanese-view" aria-label="放大给对方看">
      <div className="large-japanese-actions">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
          返回
        </button>
        <button type="button" onClick={onReplay}>
          <Volume2 size={20} aria-hidden="true" />
          重新播放
        </button>
      </div>
      <p>{text}</p>
    </main>
  );
}
