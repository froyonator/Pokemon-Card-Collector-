import { useState } from 'react';
import { fetchRarityList } from '../data/defaultRarityGroups';
import { getAllCachedRarities } from '../storage/cardCache';
import { useAppStore } from '../state/store';
import type { RarityGroup } from '../types';
import styles from './ManageGroupsPanel.module.css';

export interface ManageGroupsPanelProps {
  onClose: () => void;
}

const UNASSIGNED = 'unassigned';

export function ManageGroupsPanel({ onClose }: ManageGroupsPanelProps) {
  const groups = useAppStore((s) => s.groups);
  const setGroups = useAppStore((s) => s.setGroups);
  const [localGroups, setLocalGroups] = useState<RarityGroup[]>(groups);

  // Union of every rarity ever seen on a cached card with every rarity
  // already assigned to a (saved) group, so a rarity like 'Promo' -- never
  // auto-assigned to a default group -- still shows up as assignable here.
  // Deliberately keyed off `groups` (the saved store value) rather than
  // `localGroups` (this panel's staged, unsaved edits): the master list of
  // rarities shouldn't shrink or reshuffle just because the user has, say,
  // staged a group deletion mid-session without saving. Per-rarity current
  // assignment is still read from `localGroups` via groupIdForRarity below.
  const allRarities = Array.from(
    new Set([...getAllCachedRarities(), ...fetchRarityList(groups)])
  ).sort();

  function groupIdForRarity(rarity: string): string {
    const found = localGroups.find((g) => g.rarities.includes(rarity));
    return found ? found.id : UNASSIGNED;
  }

  function moveRarity(rarity: string, targetGroupId: string) {
    setLocalGroups((prev) =>
      prev.map((group) => {
        const withoutRarity = group.rarities.filter((r) => r !== rarity);
        if (group.id === targetGroupId) {
          return { ...group, rarities: [...withoutRarity, rarity] };
        }
        return { ...group, rarities: withoutRarity };
      })
    );
  }

  function renameGroup(groupId: string, name: string) {
    setLocalGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function addGroup() {
    const id = `custom-${crypto.randomUUID()}`;
    setLocalGroups((prev) => [...prev, { id, name: 'New Group', rarities: [] }]);
  }

  function deleteGroup(groupId: string) {
    setLocalGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleSave() {
    setGroups(localGroups);
    onClose();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Manage rarity groups">
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>Manage groups</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <ul className={styles.groupList}>
          {localGroups.map((group) => (
            <li key={group.id}>
              <input
                aria-label="Group name"
                value={group.name}
                onChange={(e) => renameGroup(group.id, e.target.value)}
              />
              <button
                type="button"
                aria-label={`Delete ${group.name}`}
                onClick={() => deleteGroup(group.id)}
              >
                Delete group
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addGroup}>
          Add group
        </button>
        <ul className={styles.rarityList}>
          {allRarities.map((rarity) => (
            <li key={rarity}>
              <span>{rarity}</span>
              <select
                aria-label={`Group for ${rarity}`}
                value={groupIdForRarity(rarity)}
                onChange={(e) => moveRarity(rarity, e.target.value)}
              >
                <option value={UNASSIGNED}>Unassigned</option>
                {localGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <button type="button" onClick={handleSave}>
          Save changes
        </button>
      </div>
    </div>
  );
}
