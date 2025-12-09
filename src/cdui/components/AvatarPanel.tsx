// src/cdui/components/AvatarPanel.tsx
import React from "react";

interface AvatarPanelProps {
  narration: string;
  mood: "neutral" | "curious" | "excited" | "skeptical";
  animation: "idle" | "thinking" | "searching" | "presenting" | "celebrating";
}

function moodEmoji(mood: AvatarPanelProps["mood"]) {
  switch (mood) {
    case "excited":
      return "🚀";
    case "curious":
      return "🤔";
    case "skeptical":
      return "🛡️";
    default:
      return "🤖"; // neutral
  }
}

function animationLabel(animation: AvatarPanelProps["animation"]) {
  switch (animation) {
    case "thinking":
      return "thinking about how to reshape the interface…";
    case "searching":
      return "searching through projects and skills…";
    case "presenting":
      return "presenting the most relevant view…";
    case "celebrating":
      return "happy with the current configuration!";
    default:
      return "ready to change the UI.";
  }
}

export const AvatarPanel: React.FC<AvatarPanelProps> = ({
  narration,
  mood,
  animation,
}) => {
  return (
    <div className="avatar-panel">
      <div className="avatar-icon">{moodEmoji(mood)}</div>
      <div className="avatar-content">
        <div className="avatar-title">Interface Avatar</div>
        <div className="avatar-status">{animationLabel(animation)}</div>
        {narration && <div className="avatar-narration">{narration}</div>}
      </div>
    </div>
  );
};
