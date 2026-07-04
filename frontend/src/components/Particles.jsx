import { useMemo } from 'react'

/** Subtle floating particles for the hero — decorative only. */
export default function Particles({ count = 14 }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 2 + Math.random() * 4,
        duration: 7 + Math.random() * 9,
        delay: -Math.random() * 10,
        color: ['var(--c1)', 'var(--c2)', 'var(--c6)', 'var(--c7)'][i % 4],
      })),
    [count],
  )

  return (
    <div className="particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
