import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '14px',
  radius = '4px',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`${styles.block} ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
