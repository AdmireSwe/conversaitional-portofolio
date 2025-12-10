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
        // --- REAL ENTRIES ---
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

        // --- DUMMY ENTRIES FOR SCROLL TESTING ---
        {
          id: "dummy-1",
          title: "Lorem Ipsum Foundation Studies",
          subtitle: "Dolor Sit Amet Institute",
          period: "2020 – 2021",
          description:
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus pharetra, velit vitae porttitor fermentum.",
        },
        {
          id: "dummy-2",
          title: "Advanced Lorem Certification",
          subtitle: "Ipsum University",
          period: "2019 – 2020",
          description:
            "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.",
        },
        {
          id: "dummy-3",
          title: "Dolor Sit Amet Bootcamp",
          subtitle: "Amet Academy",
          period: "2018 – 2019",
          description:
            "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.",
        },
        {
          id: "dummy-4",
          title: "Placeholder Studies in Sit Amet Lorem",
          period: "2017 – 2018",
          description:
            "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.",
        },
        {
          id: "dummy-5",
          title: "Very Important Ipsum Research",
          subtitle: "Lorem Research Center",
          period: "2016 – 2017",
          description:
            "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.",
        },
        {
          id: "dummy-6",
          title: "Super Secret Ipsum Work",
          subtitle: "Restricted Archives",
          period: "2015 – 2016",
          description:
            "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium.",
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
      buttons: [{ id: "download_cv", label: "Download CV (mock)" }],
    },
  ],
};
