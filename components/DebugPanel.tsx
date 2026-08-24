"use client";

import { ChevronDown, Bug } from "lucide-react";
import type { DebugInfo } from "../types/realtime";

export function DebugPanel({ debugInfo }: { debugInfo: DebugInfo }) {
  return (
    <details className="debug-panel">
      <summary>
        <span>
          <Bug size={16} aria-hidden="true" />
          开发信息
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <dl className="debug-grid">
        <div>
          <dt>Browser WS</dt>
          <dd>{debugInfo.browserWs}</dd>
        </div>
        <div>
          <dt>Bailian WS</dt>
          <dd>{debugInfo.bailianWs}</dd>
        </div>
        <div>
          <dt>Microphone</dt>
          <dd>{debugInfo.microphone}</dd>
        </div>
        <div>
          <dt>AudioContext</dt>
          <dd>{debugInfo.audioContext}</dd>
        </div>
        <div>
          <dt>Realtime Session</dt>
          <dd>{debugInfo.realtimeSession}</dd>
        </div>
        <div>
          <dt>Direction</dt>
          <dd>{debugInfo.direction}</dd>
        </div>
        <div>
          <dt>Partner Language</dt>
          <dd>{debugInfo.partnerLanguage}</dd>
        </div>
        <div>
          <dt>Turn Detection</dt>
          <dd>{debugInfo.turnDetection}</dd>
        </div>
        <div>
          <dt>Push To Talk</dt>
          <dd>{debugInfo.pushToTalk}</dd>
        </div>
        <div>
          <dt>Audio forwarding</dt>
          <dd>{String(debugInfo.audioForwarding)}</dd>
        </div>
        <div>
          <dt>Playback Queue</dt>
          <dd>{debugInfo.playbackQueue === "empty" ? "空" : "播放中"}</dd>
        </div>
        <div>
          <dt>Last Event</dt>
          <dd>{debugInfo.lastServerEventType}</dd>
        </div>
      </dl>
    </details>
  );
}
