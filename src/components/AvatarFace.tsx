import { getAvatar } from '../lib/avatars'

type Props = {
  avatarId?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AvatarFace({ avatarId, name = 'Friend', size = 'md', className = '' }: Props) {
  const avatar = getAvatar(avatarId)
  return (
    <span className={`avatar-face avatar-face-${size} ${className}`.trim()} title={name}>
      <img src={avatar.src} alt="" width={64} height={64} draggable={false} />
    </span>
  )
}
