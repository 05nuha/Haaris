/** Shared line-icon set — 24px viewBox, stroked with currentColor. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const Svg = ({ size = 18, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base} {...rest}>
    {children}
  </svg>
)

export const ShieldIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
  </Svg>
)

export const ZapIcon = (p) => (
  <Svg {...p}>
    <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
  </Svg>
)

export const LayersIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
)

export const FileIcon = (p) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </Svg>
)

export const CheckCircleIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
  </Svg>
)

export const AlertTriangleIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4L2.5 20h19L12 4z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
)

export const XCircleIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Svg>
)

export const DownloadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 11.5L12 16l4.5-4.5" />
    <path d="M4 19h16" />
  </Svg>
)

export const ArchiveIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </Svg>
)

export const ArrowRightIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const ArrowLeftIcon = (p) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const ScaleIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4v16M8 20h8" />
    <path d="M6 7h12" />
    <path d="M6 7l-2.5 6a3 3 0 0 0 5 0L6 7zM18 7l-2.5 6a3 3 0 0 0 5 0L18 7z" />
  </Svg>
)

export const EyeIcon = (p) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
)

export const UsersIcon = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7" />
    <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.9M17.5 14.6c1.7.7 2.7 2.1 3 4.4" />
  </Svg>
)

export const HelpCircleIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 2-2.5 3.5M12 17v.01" />
  </Svg>
)
