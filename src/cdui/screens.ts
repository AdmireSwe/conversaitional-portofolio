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
        type: "info_card",
        title: "Interface driven by conversation",
        body:
          "This portfolio is not a static page. It is a runtime that compiles natural language into structured UI. " +
          "You can ask for specific projects, switch views, or later even talk to a digital avatar that explains the work.",
      },
      {
        type: "tag_list",
        label: "Technologies behind this interface",
        tags: ["React", "TypeScript", "Vite", "CDUI runtime"],
      },
      {
        type: "skill_matrix",
        title: "Skill matrix snapshot",
        rows: [
          {
            area: "Frontend",
            skills: ["React", "TypeScript", "HTML", "CSS"],
            level: "solid foundation",
          },
          {
            area: "Backend / Fullstack",
            skills: ["Firebase", "REST APIs", "Auth", "Stripe basics"],
            level: "growing experience",
          },
          {
            area: "Programming languages",
            skills: ["Java", "C#", "Python (basics)"],
            level: "active learning",
          },
          {
            area: "Tooling",
            skills: ["Git", "GitHub", "VS Code", "Node.js"],
            level: "daily use",
          },
        ],
      },
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
      type: "info_card",
      title: "Why Java matters here",
      body:
        "Java is where the first console tools and OOP practice started. " +
        "This view highlights Java-heavy work that shows understanding of classes, methods, and basic tooling.",
    },
    {
      type: "tag_list",
      label: "Java-related technologies",
      tags: ["Java", "OOP", "CLI tools"],
    },
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
      type: "info_card",
      title: "Backend and infrastructure focus",
      body:
        "These projects touch APIs, authentication, data handling and deployment concerns. " +
        "Even when the UI is React, the interesting part here is how data flows and how external services are integrated.",
    },
    {
      type: "tag_list",
      label: "Backend-related technologies",
      tags: ["Firebase", "Stripe", "Auth", "APIs", "Fullstack thinking"],
    },
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
        type: "timeline",
        title: "Education & training timeline",
        entries: [
          {
            id: "wbs-ausbildung",
            title: "Umschulung – Fachinformatiker Anwendungsentwicklung",
            subtitle: "WBS Training (Germany)",
            period: "2024 – 2026 (in progress)",
            description:
              "Career change into software development, focusing on programming, databases and software engineering fundamentals.",
          },
          {
            id: "bth-web",
            title: "Webbprogrammering studies",
            subtitle: "Blekinge Tekniska Högskola (Sweden)",
            period: "2024 – (in progress)",
            description:
              "Higher education in web technologies, including Python, C#, JavaScript and modern web architecture.",
          },
          {
            id: "pre-it",
            title: "Previous professional experience",
            period: "Before 2024",
            description:
              "Background outside of IT that shapes soft skills, resilience and problem-solving – details will be in the full CV.",
          },
        ],
      },
      {
        type: "tag_list",
        label: "Core skill areas highlighted in this CV",
        tags: ["Java", "C#", "React", "TypeScript", "SQL", "Backend basics"],
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
  
