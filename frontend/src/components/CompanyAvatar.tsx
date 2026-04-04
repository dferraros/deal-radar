const COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
]

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function CompanyAvatar({
  name,
  size = 28,
}: {
  name: string
  size?: number
}) {
  const initial = (name || '?')[0].toUpperCase()
  const color = hashColor(name || '')
  return (
    <div
      className={`${color} rounded-md flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </div>
  )
}
