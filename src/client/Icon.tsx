type IconName = 'plus' | 'arrow' | 'stop' | 'code' | 'trace' | 'challenge';

const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  stop: 'M6 6h12v12H6z',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14',
  trace: 'M5 5h5v5H5zM14 14h5v5h-5zM15 5h4v4M5 15v4h4M10 7h4v10',
  challenge: 'm12 3 9 9-9 9-9-9 9-9zm0 5v5m0 3v.01',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
