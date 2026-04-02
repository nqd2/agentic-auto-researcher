const activeSkillNamesBySession = new Map<string, string[]>();

export function getActiveSkillNames(sessionId: string): string[] {
  return [...(activeSkillNamesBySession.get(sessionId) ?? [])];
}

export function setActiveSkillNames(sessionId: string, names: string[]): void {
  activeSkillNamesBySession.set(sessionId, [...names]);
}

export function addActiveSkill(sessionId: string, name: string): void {
  const cur = activeSkillNamesBySession.get(sessionId) ?? [];
  if (!cur.includes(name)) cur.push(name);
  activeSkillNamesBySession.set(sessionId, cur);
}

export function clearActiveSkills(sessionId: string): void {
  activeSkillNamesBySession.delete(sessionId);
}
