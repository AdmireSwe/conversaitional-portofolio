import React from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription } from "./cdui/types";

// A simple hardcoded screen so we can see CDUI working
const testScreen: ScreenDescription = {
  screenId: "home",
  layout: "column",
  widgets: [
    {
      type: "text",
      variant: "h1",
      content: "Welcome to the Conversational Portfolio (CDUI demo)",
    },
    {
      type: "project_list",
      projects: [
        {
          id: "proj1",
          name: "Java Vocab Trainer",
          techStack: ["Java", "OOP"],
        },
        {
          id: "proj2",
          name: "EasyTagsy",
          techStack: ["React", "Firebase", "Stripe"],
        },
      ],
    },
    {
      type: "button_row",
      buttons: [
        { id: "show_java", label: "Show only Java projects" },
        { id: "download_cv", label: "Download CV (mock)" },
      ],
    },
  ],
};

function App() {
  const handleAction = (actionId: string) => {
    // For now we just log; later this will trigger AI or screen changes
    console.log("Button clicked:", actionId);
    alert(`Button clicked: ${actionId}`);
  };

  return (
    <div>
      <ScreenRenderer screen={testScreen} onAction={handleAction} />
    </div>
  );
}

export default App;
