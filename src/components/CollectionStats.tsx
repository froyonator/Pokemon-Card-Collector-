import { useMemo } from 'react';
import { computeCollectionStats } from '../state/collectionStats';
import { useAppStore } from '../state/store';
import styles from './CollectionStats.module.css';

const GAUGE_CENTER_X = 60;
const GAUGE_CENTER_Y = 58;
const GAUGE_RADIUS = 50;

// A point on the gauge's semicircle for a given 0-100 percent, sweeping from
// the left (0%, pointing left) up over the top (50%, pointing straight up)
// to the right (100%, pointing right) -- the standard speedometer layout.
// SVG's y-axis increases downward, so "up" is `cy - r * sin(angle)`, not
// `cy + r * sin(angle)`.
function gaugePoint(percent: number, radius: number) {
  const angleDeg = 180 - (Math.max(0, Math.min(100, percent)) / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CENTER_X + radius * Math.cos(angleRad),
    y: GAUGE_CENTER_Y - radius * Math.sin(angleRad),
  };
}

// Renders the 0-100 semicircle as an SVG arc path from 0% up to `percent`.
// Always a minor arc (never more than a half-circle), so large-arc-flag is
// always 0; sweeping left-to-right over the top is clockwise on screen, so
// sweep-flag is always 1. At exactly 0% this degenerates to a zero-length
// arc (start === end), which the caller guards against separately.
function gaugeArcPath(percent: number, radius: number) {
  const start = gaugePoint(0, radius);
  const end = gaugePoint(percent, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

// The sidebar's at-a-glance collection-progress summary: how many owned
// Pokemon out of the current generation selection, a speedometer gauge for
// that same ratio, and a red "still missing" badge counting down from
// what's actually achievable right now (possibleCount), not from the full
// dex -- a Pokemon with no special card ever released isn't something the
// user can be missing. The counting logic itself lives in
// state/collectionStats.ts so it's unit-testable independently of rendering.
export function CollectionStats() {
  const owned = useAppStore((s) => s.owned);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const language = useAppStore((s) => s.language);

  // Deliberately NOT keyed on any cache-version signal: unlike DexGrid (which
  // owns the fetch and bumps its own dataVersion as data streams in), this
  // component only reads whatever's already cached. It naturally recomputes
  // whenever any of these store values change, and whenever its parent
  // Sidebar re-renders for any other reason (e.g. DexGrid's isLoading prop
  // flipping on load start/finish) -- close enough to "reflects the latest
  // fetch" without adding a second dataVersion plumbing path.
  const stats = useMemo(
    () =>
      computeCollectionStats(
        selectedGenerations,
        owned,
        language,
        groups,
        activeGroupIds,
        cardOverrides
      ),
    [selectedGenerations, owned, language, groups, activeGroupIds, cardOverrides]
  );

  const percent = stats.totalCount > 0 ? (stats.ownedCount / stats.totalCount) * 100 : 0;
  const backgroundArc = gaugeArcPath(100, GAUGE_RADIUS);
  const showProgressArc = percent > 0;
  const progressArc = showProgressArc ? gaugeArcPath(percent, GAUGE_RADIUS) : '';
  const needleTip = gaugePoint(percent, GAUGE_RADIUS - 8);

  return (
    <div className={styles.stats} data-tutorial="collection-stats">
      <div className={styles.ratioRow}>
        <span
          className={styles.ratio}
          title={`${stats.ownedCount} of ${stats.totalCount} Pokémon owned in the selected generations`}
        >
          {stats.ownedCount}/{stats.totalCount}
        </span>
        <span
          className={styles.missingBadge}
          role="img"
          aria-label={`${stats.missingCount} cards not yet owned out of ${stats.possibleCount} possible to own`}
          title={`${stats.missingCount} still missing, out of ${stats.possibleCount} possible to own right now`}
        >
          {stats.missingCount}
        </span>
      </div>

      <svg
        className={styles.gauge}
        viewBox="0 0 120 68"
        role="img"
        aria-label={`Collection progress gauge: ${Math.round(percent)} percent`}
      >
        {/* A `title` HTML attribute on `<svg>` itself is not reliably shown
            as a hover tooltip across browsers -- an SVG `<title>` child
            element is the standard, cross-browser way to get one. */}
        <title>{`Collection progress: ${Math.round(percent)}% (${stats.ownedCount} of ${stats.totalCount} owned)`}</title>
        <path d={backgroundArc} className={styles.gaugeTrack} fill="none" />
        {showProgressArc && <path d={progressArc} className={styles.gaugeFill} fill="none" />}
        <line
          x1={GAUGE_CENTER_X}
          y1={GAUGE_CENTER_Y}
          x2={needleTip.x}
          y2={needleTip.y}
          className={styles.gaugeNeedle}
        />
        <circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r="3" className={styles.gaugeHub} />
        <text x={GAUGE_CENTER_X} y={GAUGE_CENTER_Y - 4} textAnchor="middle" className={styles.gaugeLabel}>
          {Math.round(percent)}%
        </text>
      </svg>
    </div>
  );
}
