import type {
    ScreenDescription,
    ScreenMutation,
    TimelineEntry,
  } from "./types";
  

export function applyMutation(
    screen: ScreenDescription,
    mutation: ScreenMutation
  ): ScreenDescription {
    switch (mutation.kind) {
      case "ADD_TAG":
        return addTag(screen, mutation.tag);
      case "REMOVE_TAG":
        return removeTag(screen, mutation.tag);
      case "ADD_SKILL":
        return addSkill(screen, mutation.area, mutation.skill);
      case "CHANGE_LEVEL":
        return changeLevel(screen, mutation.area, mutation.level);
      case "ADD_TIMELINE_ENTRY":
        return addTimelineEntry(screen, mutation.entry);
      case "FILTER_PROJECTS":
        return filterProjects(screen, mutation.tech);  
      default:
        return screen;
    }
  }
  

// -------- TAG OPERATIONS --------

function addTag(screen: ScreenDescription, tag: string): ScreenDescription {
  return {
    ...screen,
    widgets: screen.widgets.map((w) =>
      w.type === "tag_list"
        ? {
            ...w,
            tags: w.tags.includes(tag) ? w.tags : [...w.tags, tag],
          }
        : w
    ),
  };
}

function removeTag(screen: ScreenDescription, tag: string): ScreenDescription {
  return {
    ...screen,
    widgets: screen.widgets.map((w) =>
      w.type === "tag_list"
        ? {
            ...w,
            tags: w.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
          }
        : w
    ),
  };
}

// -------- SKILL MATRIX OPERATIONS --------

function addSkill(
    screen: ScreenDescription,
    area: string,
    skill: string
  ): ScreenDescription {
    const areaLower = area.toLowerCase();
  
    return {
      ...screen,
      widgets: screen.widgets.map((w) => {
        if (w.type !== "skill_matrix") return w;
  
        return {
          ...w,
          rows: w.rows.map((row) => {
            const rowMatches =
              row.area.toLowerCase() === areaLower ||
              row.area.toLowerCase().includes(areaLower);
  
            if (!rowMatches) return row;
  
            if (row.skills.includes(skill)) return row;
  
            return {
              ...row,
              skills: [...row.skills, skill],
            };
          }),
        };
      }),
    };
  }
  
  function changeLevel(
    screen: ScreenDescription,
    area: string,
    level: string
  ): ScreenDescription {
    const areaLower = area.toLowerCase();
  
    return {
      ...screen,
      widgets: screen.widgets.map((w) => {
        if (w.type !== "skill_matrix") return w;
  
        return {
          ...w,
          rows: w.rows.map((row) => {
            const rowMatches =
              row.area.toLowerCase() === areaLower ||
              row.area.toLowerCase().includes(areaLower);
  
            if (!rowMatches) return row;
  
            return {
              ...row,
              level,
            };
          }),
        };
      }),
    };
  }

  // -------- TIMELINE OPERATIONS --------

function addTimelineEntry(
    screen: ScreenDescription,
    entry: TimelineEntry
  ): ScreenDescription {
    return {
      ...screen,
      widgets: screen.widgets.map((w) => {
        if (w.type !== "timeline") return w;
  
        return {
          ...w,
          entries: [...w.entries, entry],
        };
      }),
    };
  }

  // -------- PROJECT FILTERING --------

function filterProjects(
    screen: ScreenDescription,
    tech: string
  ): ScreenDescription {
    const techLower = tech.toLowerCase();
  
    return {
      ...screen,
      widgets: screen.widgets.map((w) => {
        if (w.type !== "project_list") return w;
  
        return {
          ...w,
          projects: w.projects.filter((proj) =>
            proj.techStack.some((t) => t.toLowerCase().includes(techLower))
          ),
        };
      }),
    };
  }
  
  
  
