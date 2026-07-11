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
    // Collapsed by default (no `open` attribute), same reasoning as the two
    // inner sections below: with Binder Settings also open in the sidebar,
    // this plus Generations/Card rarity groups/Language all expanded at
    // once was tall enough to push the whole page into a body-level
    // scrollbar. Nesting <details> inside <details> is valid HTML -- when
    // this outer one is collapsed, the inner two's own open/closed state
    // simply doesn't matter until it's expanded again.
    <details className={styles.filtersSection}>
      <summary>Filters</summary>
      <div className={styles.bar}>
        <details className={styles.generationFilters}>
          <summary>Generations</summary>
          <div>
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
          </div>
        </details>

        <details className={styles.groupFilters}>
          <summary>Card rarity groups</summary>
          <div>
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
          </div>
        </details>

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
    </details>
  );
}
