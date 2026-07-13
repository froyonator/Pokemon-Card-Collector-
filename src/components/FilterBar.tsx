import { useState } from 'react';
import { FORM_GENERATION_IDS, GENERATIONS } from '../data/generations';
import { SUPPORTED_LANGUAGES } from '../types';
import { useAppStore } from '../state/store';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import styles from './FilterBar.module.css';

// Split once, outside the component (GENERATIONS is a static module-level
// constant), rather than filtering on every render: the nine real,
// numbered generations render directly in the Generations list; the
// synthetic form families (Mega, VMAX, the four regional families) fold
// behind their own nested "Forms" disclosure -- see FilterBar.module.css's
// .formFilters comment for why (15 chips at once risked an internal
// sidebar scrollbar, explicitly unacceptable).
const NUMBERED_GENERATIONS = GENERATIONS.filter((g) => typeof g.id === 'number');
const FORM_GENERATIONS = GENERATIONS.filter((g) => FORM_GENERATION_IDS.includes(g.id));

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
            {NUMBERED_GENERATIONS.map((generation) => (
              <label key={generation.id}>
                <input
                  type="checkbox"
                  checked={selectedGenerations.includes(generation.id)}
                  onChange={() => toggleGeneration(generation.id)}
                />
                {generation.label}
              </label>
            ))}
            {/* Collapsed by default, same reasoning as the outer Filters/
                Generations disclosures: Mega/VMAX/the four regional
                families add up to 6 more chips, and having every one of
                them expanded alongside all nine numbered generations was
                tall enough to risk pushing the sidebar into an internal
                scrollbar. */}
            <details className={styles.formFilters}>
              <summary>Forms</summary>
              <div>
                {FORM_GENERATIONS.map((generation) => (
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
