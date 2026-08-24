import { ArrowLeft, Volume2 } from "lucide-react";

type LargeTargetViewProps = {
  text: string;
  onBack: () => void;
  onReplay: () => void;
};

export function LargeTargetView({ text, onBack, onReplay }: LargeTargetViewProps) {
  return (
    <main className="large-target-view" aria-label="放大给对方看">
      <div className="large-target-actions">
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
