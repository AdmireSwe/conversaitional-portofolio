// src/cdui/screens.ts

import type { ScreenDescription } from "./types";
import { allProjects } from "./projects";
import { projectListFromProjects } from "./types";

export const homeScreen: ScreenDescription = {
  screenId: "home",
  layout: "column",
  widgets: [
    {
      type: "text",
      variant: "h1",
      content: "Welcome to the Conversational Portfolio (CDUI demo)",
    },
    projectListFromProjects(allProjects),
    {
      type: "button_row",
      buttons: [{ id: "talk_to_interface", label: "Talk to the interface" }],
    },
  ],
};

export const javaScreen: ScreenDescription = {
  screenId: "java_projects",
  layout: "column",
  widgets: [
    {
      type: "text",
      variant: "h1",
      content: "Java-focused projects",
    },
    projectListFromProjects(
      allProjects.filter((p) => p.techStack.includes("Java"))
    ),
    {
      type: "button_row",
      buttons: [{ id: "talk_to_interface", label: "Ask for something else" }],
    },
  ],
};

export const backendScreen: ScreenDescription = {
  screenId: "backend_projects",
  layout: "column",
  widgets: [
    {
      type: "text",
      variant: "h1",
      content: "Backend-oriented projects",
    },
    projectListFromProjects(
      allProjects.filter(
        (p) =>
          p.kind === "backend" ||
          p.kind === "fullstack" ||
          p.kind === "cli"
      )
    ),
    {
      type: "button_row",
      buttons: [{ id: "talk_to_interface", label: "Refine the view" }],
    },
  ],
};

export const cvScreen: ScreenDescription = {
  screenId: "cv_download",
  layout: "column",
  widgets: [
    {
      type: "text",
      variant: "h1",
      content: "CV download",
    },
    {
      type: "text",
      variant: "body",
      content:
        "In a later version, a real CV PDF will be generated here on demand.",
    },
    {
      type: "button_row",
      buttons: [
        { id: "download_cv", label: "Download CV (mock)" },
        { id: "talk_to_interface", label: "Ask something else" },
      ],
    },
  ],
};
