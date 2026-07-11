import { useState } from 'react';
import { GENERATIONS } from '../data/generations';
import { SUPPORTED_LANGUAGES } from '../types';
import { useAppStore } from '../state/store';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import styles from './FilterBar.module.css';

export function FilterBar() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const toggleActiveGroup = useAppStore((s) => s.toggleActiveGroup);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const toggleGeneration = useAppStore((s) => s.toggleGeneration);

  const [showManageGroups, setShowManageGroups] = useState(false);

  return (
    <div className={styles.bar}>
      <fieldset className={styles.generationFilters}>
        <legend>Generations</legend>
        {GENERATIONS.map((generation) => (
          <label key={generation.id}>
            <input
              type="checkbox"
              checked={selectedGenerations.includes(generation.id)}
              onChange={() => toggleGeneration(generation.id)}
            />
            {generation.label}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.groupFilters}>
        <legend>Card rarity groups</legend>
        {groups.map((group) => (
          <label key={group.id}>
            <input
              type="checkbox"
              checked={activeGroupIds.includes(group.id)}
              onChange={() => toggleActiveGroup(group.id)}
            />
            {group.name}
          </label>
        ))}
        <button type="button" onClick={() => setShowManageGroups(true)}>
          Manage groups
        </button>
      </fieldset>

      <label>
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>

      {showManageGroups && <ManageGroupsPanel onClose={() => setShowManageGroups(false)} />}
    </div>
  );
}
