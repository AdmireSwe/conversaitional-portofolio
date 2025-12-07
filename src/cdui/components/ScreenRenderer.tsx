// CDUI Runtime — ScreenRenderer
// This component turns a ScreenDescription (JSON-like data) into visible React UI.

import React from "react";
import type { ScreenDescription, Widget } from "../types";

interface ScreenRendererProps {
  // The current screen to display
  screen: ScreenDescription;
  // Called when the user clicks a button, identified by its actionId
  onAction: (actionId: string) => void;
}

/**
 * ScreenRenderer
 * --------------
 * Renders the entire screen based on its layout ("column" or "row")
 * and iterates over all widgets to render them.
 */
export const ScreenRenderer: React.FC<ScreenRendererProps> = ({
  screen,
  onAction,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: screen.layout, // "column" or "row"
        gap: "1rem",
        padding: "1rem",
      }}
    >
      {screen.widgets.map((widget, index) => (
        <WidgetRenderer key={index} widget={widget} onAction={onAction} />
      ))}
    </div>
  );
};

interface WidgetRendererProps {
  widget: Widget;
  onAction: (id: string) => void;
}

/**
 * WidgetRenderer
 * --------------
 * Switches on widget.type and chooses the correct UI element
 * for each widget.
 */
const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  widget,
  onAction,
}) => {
  switch (widget.type) {
    case "text":
      return (
        <TextWidget content={widget.content} variant={widget.variant} />
      );

    case "button_row":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {widget.buttons.map((button) => (
            <button
              key={button.id}
              onClick={() => onAction(button.id)}
              style={{ padding: "0.4rem 0.8rem" }}
            >
              {button.label}
            </button>
          ))}
        </div>
      );

    case "project_list":
      return (
        <ul style={{ paddingLeft: "1.2rem" }}>
          {widget.projects.map((proj) => (
            <li key={proj.id}>
              <strong>{proj.name}</strong> — [{proj.techStack.join(", ")}]
            </li>
          ))}
        </ul>
      );

    case "info_card":
      return (
        <div className="info-card">
          <h2>{widget.title}</h2>
          <p>{widget.body}</p>
        </div>
      );

    case "tag_list":
      return (
        <div className="tag-list">
          {widget.label && (
            <p className="tag-list-label">{widget.label}</p>
          )}
          <div className="tag-list-tags">
            {widget.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}</span>
            ))}
          </div>
        </div>
      );

      case "timeline":
        return (
          <div className="timeline">
            <h2 className="timeline-title">{widget.title}</h2>
            <ul className="timeline-list">
              {widget.entries.map((entry) => (
                <li key={entry.id} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-period">{entry.period}</span>
                      <span className="timeline-title-text">{entry.title}</span>
                    </div>
                    {entry.subtitle && (
                      <div className="timeline-subtitle">{entry.subtitle}</div>
                    )}
                    {entry.description && (
                      <div className="timeline-description">
                        {entry.description}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
  

    default:
      // This should never happen if Widget union in types.ts is correct
      return <div>Unknown widget type</div>;
  }
};

interface TextWidgetProps {
  content: string;
  variant: "h1" | "body";
}

/**
 * TextWidget
 * ----------
 * Renders either a heading or body text.
 */
const TextWidget: React.FC<TextWidgetProps> = ({ content, variant }) => {
  if (variant === "h1") {
    return <h1>{content}</h1>;
  }

  return <p>{content}</p>;
};
