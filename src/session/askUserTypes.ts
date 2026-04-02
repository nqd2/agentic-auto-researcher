export type AskUserOption = { id: string; label: string };

export type AskUserQuestion = {
  id: string;
  prompt: string;
  options?: AskUserOption[];
  allow_multiple?: boolean;
  allow_free_text?: boolean;
};

export type AskUserRequest = {
  title?: string;
  questions: AskUserQuestion[];
};
