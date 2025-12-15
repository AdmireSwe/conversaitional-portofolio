// src/cdui/avatarClient.ts
import type { ScreenDescription, ScreenMutation } from "./types";
import type { SessionContext } from "./session";

export interface AvatarResponse {
  narration: string;
  intentSummary: string;
  focusTarget: string | null;
  tone: "neutral" | "curious" | "excited" | "warning";
}

interface CompilerContext {
  systemPrompt?: string;
  mutations?: ScreenMutation[];
  session?: SessionContext;
}

interface FactsPack {
  ownerName: string;
  headline: string;
  currentScreenId?: string;
  currentScreenTitle?: string;
  visitedScreenIds?: string[];
  screensSummary: Array<{
    screenId?: string;
    title?: string;
    kind?: string;
    widgets?: Array<{
      type?: string;
      title?: string;
      items?: Array<Record<string, unknown>>;
    }>;
  }>;
  factsText: string;
}

interface AvatarRequestBody {
  text: string;
  currentScreen: ScreenDescription;
  history: ScreenDescription[];
  compilerContext?: CompilerContext;
  portfolioContext?: {
    ownerName: string;
    headline: string;
  };
  factsPack?: FactsPack;
  strictFactsOnly?: boolean;
}

function summarizeWidget(widget: any) {
  const type = typeof widget?.type === "string" ? widget.type : undefined;
  const title =
    typeof widget?.title === "string"
      ? widget.title
      : typeof widget?.label === "string"
      ? widget.label
      : undefined;

  const itemsCandidate =
    (Array.isArray(widget?.entries) && widget.entries) ||
    (Array.isArray(widget?.projects) && widget.projects) ||
    (Array.isArray(widget?.items) && widget.items) ||
    (Array.isArray(widget?.cards) && widget.cards) ||
    (Array.isArray(widget?.sections) && widget.sections) ||
    null;

  const items =
    itemsCandidate?.slice?.(0, 40)?.map?.((it: any) => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(it ?? {})) {
        const v = (it as any)[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          if (
            k.toLowerCase().includes("title") ||
            k.toLowerCase().includes("name") ||
            k.toLowerCase().includes("period") ||
            k.toLowerCase().includes("date") ||
            k.toLowerCase().includes("role") ||
            k.toLowerCase().includes("summary") ||
            k.toLowerCase().includes("desc") ||
            k.toLowerCase().includes("stack") ||
            k.toLowerCase().includes("tech") ||
            k.toLowerCase().includes("link") ||
            k.toLowerCase().includes("url") ||
            k.toLowerCase().includes("id") ||
            k.toLowerCase().includes("company") ||
            k.toLowerCase().includes("school")
          ) {
            out[k] = v;
          }
        }
      }
      if (Object.keys(out).length === 0) {
        if (typeof it?.id === "string") out.id = it.id;
        if (typeof it?.title === "string") out.title = it.title;
        if (typeof it?.name === "string") out.name = it.name;
      }
      return out;
    }) ?? undefined;

  return { type, title, items };
}

function summarizeScreen(screen: any) {
  const screenId =
    typeof screen?.screenId === "string"
      ? screen.screenId
      : typeof screen?.id === "string"
      ? screen.id
      : undefined;

  const title =
    typeof screen?.title === "string"
      ? screen.title
      : typeof screen?.name === "string"
      ? screen.name
      : undefined;

  const kind = typeof screen?.kind === "string" ? screen.kind : undefined;

  const widgetsArr = Array.isArray(screen?.widgets) ? screen.widgets : [];
  const widgets = widgetsArr.slice(0, 30).map(summarizeWidget);

  return { screenId, title, kind, widgets };
}

function buildFactsText(pack: FactsPack): string {
  const lines: string[] = [];

  lines.push(`OWNER: ${pack.ownerName}`);
  lines.push(`HEADLINE: ${pack.headline}`);
  if (pack.currentScreenId) lines.push(`CURRENT_SCREEN_ID: ${pack.currentScreenId}`);
  if (pack.currentScreenTitle) lines.push(`CURRENT_SCREEN_TITLE: ${pack.currentScreenTitle}`);
  if (pack.visitedScreenIds?.length)
    lines.push(`VISITED_SCREENS: ${pack.visitedScreenIds.join(", ")}`);

  lines.push("");
  lines.push("SCREENS:");
  for (const s of pack.screensSummary) {
    lines.push(`- screenId=${s.screenId ?? "?"} title=${s.title ?? "?"}`);
    for (const w of s.widgets ?? []) {
      lines.push(`  - widget type=${w.type ?? "?"}${w.title ? ` title=${w.title}` : ""}`);
      const items = w.items ?? [];
      if (items.length) {
        for (const it of items.slice(0, 10)) {
          lines.push(`    - ${JSON.stringify(it)}`);
        }
        if (items.length > 10) lines.push(`    - ... (${items.length - 10} more)`);
      }
    }
  }

  lines.push("");
  lines.push(
    "RULES: The assistant MUST NOT invent any facts. If a detail is not in SCREENS above, say you don't have that info."
  );

  return lines.join("\n");
}

function buildFactsPack(currentScreen: ScreenDescription, history: ScreenDescription[]): FactsPack {
  const ownerName = "Admir Sabanovic";
  const headline = "Conversationally-Driven Portfolio (CDUI demo)";

  const currentSummary = summarizeScreen(currentScreen);
  const historySummaries = history.map(summarizeScreen);

  const visitedScreenIds = historySummaries
    .map((s) => s.screenId)
    .filter((x): x is string => typeof x === "string");

  const packBase: FactsPack = {
    ownerName,
    headline,
    currentScreenId: currentSummary.screenId,
    currentScreenTitle: currentSummary.title,
    visitedScreenIds,
    screensSummary: historySummaries,
    factsText: "",
  };

  packBase.factsText = buildFactsText(packBase);
  return packBase;
}

export async function callAvatar(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[],
  compilerContext?: CompilerContext
): Promise<AvatarResponse | null> {
  const factsPack = buildFactsPack(currentScreen, history);

  const body: AvatarRequestBody = {
    text,
    currentScreen,
    history,
    compilerContext,

    portfolioContext: {
      ownerName: factsPack.ownerName,
      headline: factsPack.headline,
    },

    factsPack,
    strictFactsOnly: true,
  };

  try {
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn("Avatar API returned non-OK status:", res.status);
      return null;
    }

    const data = (await res.json()) as Partial<AvatarResponse>;

    return {
      narration: data.narration ?? "",
      intentSummary: data.intentSummary ?? "",
      focusTarget: data.focusTarget ?? null,
      tone: data.tone ?? "neutral",
    };
  } catch (err) {
    console.error("Error calling avatar API:", err);
    return null;
  }
}
