import type { CSSProperties } from "react";
import type { MouthShape, RickyMood } from "../lib/realtime";

type RickyFaceProps = {
  mood: RickyMood;
  mouthShape: MouthShape;
};

export function RickyFace({ mood, mouthShape }: RickyFaceProps) {
  return (
    <div
      className={`face face-${mood}`}
      style={
        {
          "--mouth-open": mouthShape.open.toFixed(3),
          "--mouth-width": mouthShape.width.toFixed(3),
          "--mouth-round": mouthShape.round.toFixed(3),
          "--mouth-teeth": mouthShape.teeth.toFixed(3),
        } as CSSProperties
      }
      aria-label={`Jarvis mood: ${mood}`}
    >
      <div className="hud-grid" aria-hidden="true" />
      <div className="hud-core" aria-hidden="true" />
      <div className="hud-scan" aria-hidden="true" />
      <div className="hud-ring hud-ring-outer" aria-hidden="true" />
      <div className="hud-ring hud-ring-ticks" aria-hidden="true" />
      <div className="hud-ring hud-ring-inner" aria-hidden="true" />
      <div className="hud-callsign" aria-hidden="true">
        J.A.R.V.I.S.
      </div>
      <div className="eye-row">
        <div className="eye eye-left">
          <span />
        </div>
        <div className="eye eye-right">
          <span />
        </div>
      </div>
      <div className="mouth-wrap">
        <div className="mouth">
          <div className="mouth-teeth" />
          <div className="mouth-line" />
        </div>
      </div>
      <div className="hud-status-arc" aria-hidden="true" />
    </div>
  );
}
