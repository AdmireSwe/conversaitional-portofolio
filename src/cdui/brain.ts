export interface BrainRequest {
  text: string;
  currentScreen: any; // later ScreenDescription
  history: string[];
}

export interface BrainResponse {
  mutations: any[]; // later ScreenMutation[]
  systemPrompt?: string;
}
