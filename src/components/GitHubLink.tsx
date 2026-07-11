import { GitHubIcon } from './icons/GitHubIcon';
import styles from './GitHubLink.module.css';

const REPO_URL = 'https://github.com/froyonator/Pokemon-Card-Collector-';

export function GitHubLink() {
  return (
    <a
      className={styles.githubLink}
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View this project on GitHub"
    >
      <GitHubIcon />
    </a>
  );
}
