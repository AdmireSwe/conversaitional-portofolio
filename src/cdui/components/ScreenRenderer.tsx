// src/cdui/components/ScreenRenderer.tsx

import React, { useEffect, useRef } from "react";
import type {
  ScreenDescription,
  Widget,
  TextWidget,
  ProjectListWidget,
  ButtonRowWidget,
  InfoCardWidget,
  TagListWidget,
  TimelineWidget,
  SkillMatrixWidget,
} from "../types";

interface ScreenRendererProps {
  screen: ScreenDescription;
  onAction: (actionId: string) => void;
  focusTarget?: string | null;
}

/**
 * ScreenRenderer
 *
 * Renders a ScreenDescription using simple semantic HTML + CSS classes.
 * - Uses flex layout direction from screen.layout ("column" or "row").
 * - Adds a subtle fade-in transition for the project list whenever
 *   the number of projects changes (useful for FILTER_PROJECTS).
 * - If focusTarget is provided, certain widgets (like timeline entries)
 *   will visually highlight and scroll into view.
 */
export const ScreenRenderer: React.FC<ScreenRendererProps> = ({
  screen,
  onAction,
  focusTarget,
}) => {
  return (
    <div
      className="cdui-screen"
      style={{
        display: "flex",
        flexDirection: screen.layout === "row" ? "row" : "column",
        gap: "1.5rem",
        width: "100%",
      }}
    >
      {screen.widgets.map((widget, index) => (
        <WidgetRenderer
          key={index}
          widget={widget}
          screenId={screen.screenId}
          onAction={onAction}
          focusTarget={focusTarget}
        />
      ))}
    </div>
  );
};

interface WidgetRendererProps {
  widget: Widget;
  screenId: string;
  onAction: (actionId: string) => void;
  focusTarget?: string | null;
}

const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  widget,
  screenId,
  onAction,
  focusTarget,
}) => {
  switch (widget.type) {
    case "text":
      return <TextBlock widget={widget} />;

    case "project_list":
      return (
        <ProjectListBlock
          widget={widget}
          screenId={screenId}
          onAction={onAction}
        />
      );

    case "button_row":
      return <ButtonRowBlock widget={widget} onAction={onAction} />;

    case "info_card":
      return <InfoCardBlock widget={widget} />;

    case "tag_list":
      return <TagListBlock widget={widget} />;

    case "timeline":
      return <TimelineBlock widget={widget} focusTarget={focusTarget} />;

    case "skill_matrix":
      return <SkillMatrixBlock widget={widget} />;

    default:
      return null;
  }
};

// ---------- TEXT ----------

const TextBlock: React.FC<{ widget: TextWidget }> = ({ widget }) => {
  if (widget.variant === "h1") {
    return (
      <h1
        style={{
          fontSize: "1.6rem",
          margin: 0,
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        {widget.content}
      </h1>
    );
  }

  return (
    <p
      style={{
        margin: 0,
        fontSize: "0.98rem",
        color: "#334155",
        lineHeight: 1.6,
      }}
    >
      {widget.content}
    </p>
  );
};

// ---------- PROJECT LIST (with subtle transition) ----------

interface ProjectListBlockProps {
  widget: ProjectListWidget;
  screenId: string;
  onAction: (actionId: string) => void;
}

const ProjectListBlock: React.FC<ProjectListBlockProps> = ({
  widget,
  screenId,
}) => {
  // We key the list by screenId + project count so that when filtering changes
  // the number of projects, React remounts this block and the CSS animation
  // plays again (subtle fade-in).
  const key = `${screenId}-projects-${widget.projects.length}`;

  return (
    <div className="project-list" key={key}>
      {widget.projects.map((proj) => (
        <div key={proj.id} className="project-card">
          <div className="project-title">{proj.name}</div>
          {proj.techStack && proj.techStack.length > 0 && (
            <div className="project-tech">
              {proj.techStack.map((t) => (
                <span key={t} className="tag-chip project-tech-chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------- BUTTON ROW ----------

const ButtonRowBlock: React.FC<{
  widget: ButtonRowWidget;
  onAction: (actionId: string) => void;
}> = ({ widget, onAction }) => {
  return (
    <div className="button-row">
      {widget.buttons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          className="button-row-button"
          onClick={() => onAction(btn.id)}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

// ---------- INFO CARD ----------

const InfoCardBlock: React.FC<{ widget: InfoCardWidget }> = ({ widget }) => {
  return (
    <div className="info-card">
      <h2>{widget.title}</h2>
      <p>{widget.body}</p>
    </div>
  );
};

// ---------- TAG LIST ----------

const TagListBlock: React.FC<{ widget: TagListWidget }> = ({ widget }) => {
  return (
    <div className="tag-list">
      {widget.label && <p className="tag-list-label">{widget.label}</p>}
      <div className="tag-list-tags">
        {widget.tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------- TIMELINE (with focus + scroll) ----------

const TimelineBlock: React.FC<{
  widget: TimelineWidget;
  focusTarget?: string | null;
}> = ({ widget, focusTarget }) => {
  const focusedRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (focusedRef.current && focusTarget) {
      focusedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusTarget]);

  return (
    <div className="timeline">
      <h3 className="timeline-title">{widget.title}</h3>
      <ul className="timeline-list">
        {widget.entries.map((entry) => {
          const isFocused =
            !!focusTarget &&
            (focusTarget === entry.id ||
              focusTarget.toLowerCase().includes(entry.id.toLowerCase()));

          return (
            <li
              key={entry.id}
              className={
                "timeline-item" +
                (isFocused ? " timeline-item-focused" : "")
              }
              ref={isFocused ? focusedRef : null}
            >
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-period">{entry.period}</span>
                  <span className="timeline-title-text">{entry.title}</span>
                  {entry.subtitle && (
                    <span className="timeline-subtitle">
                      {entry.subtitle}
                    </span>
                  )}
                </div>
                {entry.description && (
                  <p className="timeline-description">{entry.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------- SKILL MATRIX ----------

const SkillMatrixBlock: React.FC<{ widget: SkillMatrixWidget }> = ({
  widget,
}) => {
  return (
    <div className="skill-matrix">
      <h3 className="skill-matrix-title">{widget.title}</h3>
      <div className="skill-matrix-grid">
        {widget.rows.map((row) => (
          <div key={row.area} className="skill-matrix-row">
            <div className="skill-matrix-area">{row.area}</div>
            <div className="skill-matrix-skills">
              {row.skills.map((skill) => (
                <span key={skill} className="skill-chip">
                  {skill}
                </span>
              ))}
            </div>
            <div className="skill-matrix-level">
              {row.level ?? " "}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
