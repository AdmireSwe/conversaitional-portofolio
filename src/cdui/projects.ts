// Central project registry for the CDUI portfolio

export type ProjectKind = "frontend" | "backend" | "fullstack" | "cli";

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  techStack: string[];
  shortDescription: string;
}

export const allProjects: Project[] = [
  {
    id: "java-vocab-trainer",
    name: "Java Vocab Trainer",
    kind: "cli",
    techStack: ["Java", "OOP"],
    shortDescription: "Console-based vocabulary trainer built in Java with OOP concepts.",
  },
  {
    id: "easytagsy",
    name: "EasyTagsy",
    kind: "fullstack",
    techStack: ["React", "TypeScript", "Firebase", "Stripe", "OpenAI"],
    shortDescription: "SaaS tool for Etsy sellers with React frontend and Firebase backend.",
  },
  {
    id: "cdui-portfolio",
    name: "CDUI Conversational Portfolio",
    kind: "frontend",
    techStack: ["React", "TypeScript", "Vite"],
    shortDescription: "This experimental portfolio itself, showcasing the Conversational Driven UI concept.",
  },
];
