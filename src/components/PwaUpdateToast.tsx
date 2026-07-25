import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (needRefresh) setVisible(true)
  }, [needRefresh])

  if (!visible) return null

  return (
    <div className="toast pwa-toast" role="status">
      <span>Update ready</span>
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: '0.45rem 0.9rem' }}
        onClick={() => updateServiceWorker(true)}
      >
        Refresh
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '0.45rem 0.9rem' }}
        onClick={() => {
          setVisible(false)
          setNeedRefresh(false)
        }}
      >
        Later
      </button>
    </div>
  )
}
