import type { ScreenDescription, ScreenMutation, Widget } from "./types";

export function applyMutation(
  screen: ScreenDescription,
  mutation: ScreenMutation
): ScreenDescription {
  switch (mutation.kind) {
    case "ADD_TAG":
      return addTag(screen, mutation.tag);
    case "REMOVE_TAG":
      return removeTag(screen, mutation.tag);
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
