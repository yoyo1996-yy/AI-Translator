import type { AppStatus } from "../types/realtime";

const statusText: Record<AppStatus, string> = {
  idle: "未连接",
  requesting_permission: "请求麦克风",
  connecting: "正在连接",
  connected: "已连接",
  listening: "正在听",
  translating: "正在翻译",
  playing: "正在播放",
  stopping: "正在停止",
  error: "连接异常"
};

export function ConnectionStatus({ status }: { status: AppStatus }) {
  return (
    <div className={`status-pill status-${status}`} aria-live="polite">
      <span aria-hidden="true">●</span>
      <span>{statusText[status]}</span>
    </div>
  );
}
