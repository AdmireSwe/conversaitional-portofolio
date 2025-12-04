// CDUI Core Types — v1 MVP

/** Every screen is a state the UI can be in */
export interface ScreenDescription {
  screenId: string;                 // Unique identifier for this screen
  layout: "column" | "row";         // Basic layout direction
  widgets: Widget[];                // What appears on this screen
}

/** A widget is a UI building block */
export type Widget =
  | TextWidget
  | ButtonRowWidget
  | ProjectListWidget;

/** Simple text element */
export interface TextWidget {
  type: "text";
  variant: "h1" | "body";
  content: string;
}

/** A horizontal row of buttons the user can click */
export interface ButtonRowWidget {
  type: "button_row";
  buttons: Button[];
}

export interface Button {
  id: string;       // action identifier
  label: string;    // text shown to the user
}

/** A list of projects (for your portfolio) */
export interface ProjectListWidget {
  type: "project_list";
  projects: ProjectSummary[];
}

/** Basic project info — more can be added later */
export interface ProjectSummary {
  id: string;
  name: string;
  techStack: string[];
}
