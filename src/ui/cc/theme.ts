/**
 * Dark palette aligned with Claude Code `darkTheme` in vendor `utils/theme.ts`
 * (copied values only — no runtime import from vendor).
 */
export const CC_DARK = {
  /** AAR brand (thay cho cam Claude Code) */
  brand: "#014495",
  text: "rgb(255,255,255)",
  inverseText: "rgb(0,0,0)",
  inactive: "rgb(153,153,153)",
  subtle: "rgb(80,80,80)",
  permission: "rgb(177,185,249)",
  promptBorder: "rgb(136,136,136)",
  promptBorderShimmer: "rgb(166,166,166)",
  suggestion: "rgb(177,185,249)",
  userMessageBackground: "rgb(55, 55, 55)",
  messageActionsBackground: "rgb(44, 50, 62)",
  bashMessageBackgroundColor: "rgb(65, 60, 65)",
  clawd_body: "#014495",
  clawd_background: "rgb(0,0,0)",
  warning: "rgb(255,193,7)",
  error: "rgb(255,107,128)",
  success: "rgb(78,186,101)",
  background: "rgb(0,204,204)",
} as const;

export type CcColorKey = keyof typeof CC_DARK;
