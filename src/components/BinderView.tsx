import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spriteUrl } from '../api/pokeapi';
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
} from '../state/binderLayout';
import { useAppStore } from '../state/store';
import type { DexEntry } from '../data/gen1Dex';
import { BinderSlot } from './BinderSlot';
import styles from './BinderView.module.css';

export interface BinderViewProps {
  dexEntries: DexEntry[];
  onSlotClick: (dexNumber: number, language: string) => void;
}

export function BinderView({ dexEntries, onSlotClick }: BinderViewProps) {
  const binders = useAppStore((s) => s.binders);
  const activeBinderId = useAppStore((s) => s.activeBinderId);
  const activeBinder = binders.find((b) => b.id === activeBinderId) ?? binders[0];
  const shouldReduceMotion = useReducedMotion();
  const [spreadIndex, setSpreadIndex] = useState(0);

  useEffect(() => {
    setSpreadIndex(0);
  }, [activeBinder.id]);

  const nameByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) map.set(entry.number, entry.name);
    return map;
  }, [dexEntries]);

  const sequence = activeBinder.customOrder ?? defaultBinderSequence(dexEntries);
  const pages = useMemo(
    () => computeBinderPages(sequence, activeBinder.config),
    [sequence, activeBinder.config]
  );
  const spreads = useMemo(
    () => computeSpreadPageIndices(activeBinder.config.pageCount),
    [activeBinder.config.pageCount]
  );
  const currentSpread = spreads[spreadIndex] ?? [];

  const pageMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, rotateY: -90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: 90 },
        transition: { duration: 0.35 },
      };

  return (
    <div className={styles.binder}>
      <div className={styles.nav}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={spreadIndex === 0}
          onClick={() => setSpreadIndex((i) => Math.max(0, i - 1))}
        >
          &larr;
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={spreadIndex >= spreads.length - 1}
          onClick={() => setSpreadIndex((i) => Math.min(spreads.length - 1, i + 1))}
        >
          &rarr;
        </button>
      </div>
      <div className={styles.spread}>
        <AnimatePresence>
          {currentSpread.map((pageIndex) => (
            <motion.div
              key={pageIndex}
              className={styles.page}
              aria-label={`Page ${pageIndex + 1}`}
              style={{
                gridTemplateColumns: `repeat(${activeBinder.config.columns}, 1fr)`,
                gridTemplateRows: `repeat(${activeBinder.config.rows}, 1fr)`,
              }}
              {...pageMotion}
            >
              {pages[pageIndex]?.flatMap((row, r) =>
                row.map((entry, c) => (
                  <BinderSlot
                    key={`${r}-${c}`}
                    entry={entry}
                    pokemonName={
                      entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined
                    }
                    spriteUrl={
                      entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined
                    }
                    onClick={(dexNumber) => onSlotClick(dexNumber, activeBinder.language)}
                  />
                ))
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
