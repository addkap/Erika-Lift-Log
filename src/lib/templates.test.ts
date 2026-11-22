import { describe, expect, it } from 'vitest';
import { SAMPLE_EXERCISES, SAMPLE_TEMPLATES } from './testFixtures';
import {
  addItem, draftMatchesTemplate, moveItem, nameTaken, removeItem, renameTemplate, setRange, templateFromDraft, visibleItems,
} from './templates';
import { buildDraft } from './draft';

const lower = SAMPLE_TEMPLATES.find((t) => t.id === 'lower')!;
const ids = (t: { items: { exerciseId: string }[] }) => t.items.map((i) => i.exerciseId);

describe('template editing', () => {
  it('adds an exercise once, at the end, with a default set range', () => {
    const t = addItem(lower, 'chest-press', 100);
    expect(ids(t).at(-1)).toBe('chest-press');
    expect(t.items.at(-1)).toEqual({ exerciseId: 'chest-press', minSets: 2, maxSets: 3 });
    expect(t.updatedAt).toBe(100);
    expect(addItem(t, 'chest-press', 200)).toBe(t); // no duplicates, no change
  });
  it('removes from the list only, and leaves the original template alone', () => {
    const before = JSON.stringify(lower);
    const t = removeItem(lower, 'hack-squat', 50);
    expect(ids(t)).not.toContain('hack-squat');
    expect(JSON.stringify(lower)).toBe(before);
  });
  it('moves up and down and stops at the ends', () => {
    const down = moveItem(lower, 'hack-squat', 1);
    expect(ids(down).slice(0, 2)).toEqual(['back-extension', 'hack-squat']);
    expect(moveItem(lower, 'hack-squat', -1)).toBe(lower);
    expect(moveItem(lower, 'calf-raises', 1)).toBe(lower);
  });
  it('hops over hidden (archived) neighbours when moving', () => {
    const hidden = new Set(['back-extension']);
    const t = moveItem(lower, 'hack-squat', 1, (id) => !hidden.has(id));
    expect(ids(t).slice(0, 3)).toEqual(['quad-extension', 'back-extension', 'hack-squat']);
  });
  it('keeps the set range sensible', () => {
    expect(setRange(lower, 'hack-squat', 4, 2).items[0]).toMatchObject({ minSets: 4, maxSets: 4 });
    expect(setRange(lower, 'hack-squat', 0, 0).items[0]).toMatchObject({ minSets: 1, maxSets: 1 });
    expect(setRange(lower, 'hack-squat', 2.4, 5).items[0]).toMatchObject({ minSets: 2, maxSets: 5 });
  });
  it('renames, ignoring blank names', () => {
    expect(renameTemplate(lower, '  Legs  ', 9)).toMatchObject({ name: 'Legs', updatedAt: 9 });
    expect(renameTemplate(lower, '   ')).toBe(lower);
  });
  it('hides archived and deleted exercises from the visible list', () => {
    const ex = SAMPLE_EXERCISES.map((e) => (e.id === 'hack-squat' ? { ...e, archived: true } : e.id === 'calf-raises' ? { ...e, deletedAt: 1 } : e));
    expect(visibleItems(lower, ex).map((i) => i.exerciseId)).toEqual(['back-extension', 'quad-extension', 'hamstring-curl']);
  });
  it('spots duplicate names, ignoring capitals and the exercise being edited', () => {
    expect(nameTaken(SAMPLE_EXERCISES, ' hack SQUAT ')).toBe(true);
    expect(nameTaken(SAMPLE_EXERCISES, 'hack squat', 'hack-squat')).toBe(false);
    expect(nameTaken(SAMPLE_EXERCISES, 'Plank')).toBe(false);
  });
});

describe('save today as the new default', () => {
  const draft = () => buildDraft('lower', '2026-11-21', lower, SAMPLE_EXERCISES, []);
  it('matches when nothing changed', () => {
    expect(draftMatchesTemplate(lower, draft().entries, SAMPLE_EXERCISES)).toBe(true);
  });
  it('notices a skipped exercise or a new order', () => {
    const d = draft();
    expect(draftMatchesTemplate(lower, d.entries.slice(1), SAMPLE_EXERCISES)).toBe(false);
    expect(draftMatchesTemplate(lower, [d.entries[1], d.entries[0], ...d.entries.slice(2)], SAMPLE_EXERCISES)).toBe(false);
  });
  it('copies the order, keeps known set ranges and drops what was skipped', () => {
    const d = draft();
    const entries = [d.entries[1], d.entries[0], d.entries[3]];
    const t = templateFromDraft(lower, entries, SAMPLE_EXERCISES, 77);
    expect(ids(t)).toEqual(['back-extension', 'hack-squat', 'hamstring-curl']);
    expect(t.items[1]).toEqual(lower.items[0]); // hack squat keeps 3-4
    expect(t.updatedAt).toBe(77);
  });
  it('keeps archived items at the end so restoring them works', () => {
    const ex = SAMPLE_EXERCISES.map((e) => (e.id === 'calf-raises' ? { ...e, archived: true } : e));
    const d = buildDraft('lower', '2026-11-21', lower, ex, []);
    const t = templateFromDraft(lower, d.entries.slice(0, 2), ex);
    expect(ids(t)).toEqual(['hack-squat', 'back-extension', 'calf-raises']);
  });
});
