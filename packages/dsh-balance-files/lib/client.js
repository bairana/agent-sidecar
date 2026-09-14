// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
/**
 * dsh-balance-files — Client half.
 *
 * A collapsible floating widget in the `shell.overlay` layer: DeepSeek
 * account balance + Files API manager (list / upload / delete). Colors use
 * the official `--dsw-alias-*` theme tokens, so light/dark follow the app.
 */
window.__ModuleLoader__.load({
  id: 'dsh-balance-files',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const CSS_TAG_ID = 'dsh-balance-files/styles'
    const css = `
.dsbf-root{position:fixed;right:16px;bottom:16px;z-index:9999;width:320px;max-width:calc(100vw - 32px);max-height:75vh;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;font-family:var(--dsw-font-family,inherit)}
.dsbf-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:grab;user-select:none}
.dsbf-head:active{cursor:grabbing}
.dsbf-title{font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsbf-icon{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dsbf-icon.err{background:var(--dsw-alias-state-error-primary)}
.dsbf-icon.warn{background:var(--dsw-alias-state-warn-primary)}
.dsbf-btn{flex:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;line-height:1.4}
.dsbf-btn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.dsbf-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px}
.dsbf-balance{display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px}
.dsbf-kv{display:flex;justify-content:space-between;gap:8px}
.dsbf-kv + .dsbf-kv{border-top:1px dashed var(--dsw-alias-label-secondary);margin-top:5px;padding-top:5px}
.dsbf-kv{display:flex;justify-content:space-between;gap:8px}
.dsbf-kv .k{color:var(--dsw-alias-label-secondary)}
.dsbf-kv .v{font-weight:600;text-align:right}
.dsbf-total{font-size:14px}
.dsbf-total .v{color:var(--dsw-alias-brand-primary)}
.dsbf-files{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:4px;max-height:min(36vh,190px);overflow-y:auto}
.dsbf-storage{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 8px;background:var(--dsw-alias-bg-layer-2)}
.dsbf-storage-text{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsbf-file{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 8px}
.dsbf-file .name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.dsbf-file .name:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.dsbf-file .meta{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap}
.dsbf-file .dsbf-perm{color:var(--dsw-alias-label-secondary)}
.dsbf-file .dsbf-expiry{color:var(--dsw-alias-state-warn-primary)}
.dsbf-file .del{flex:none;border:none;background:transparent;color:var(--dsw-alias-state-error-primary);cursor:pointer;font-size:11px;padding:0 2px}
.dsbf-file .del:hover{text-decoration:underline}
.dsbf-detail{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}
.dsbf-detail-head{display:flex;align-items:center;justify-content:space-between}
.dsbf-detail-title{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsbf-detail-row{display:flex;justify-content:space-between;gap:8px;font-size:11px}
.dsbf-detail-row .k{color:var(--dsw-alias-label-secondary);flex:none}
.dsbf-detail-row .v{color:var(--dsw-alias-label-primary);text-align:right;word-break:break-all}
.dsbf-detail-id{font-family:monospace;font-size:10px}
.dsbf-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:6px 0}
.dsbf-err{color:var(--dsw-alias-state-error-primary);word-break:break-all}
.dsbf-upload{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}
.dsbf-upload .k{color:var(--dsw-alias-label-secondary);font-size:10px}
.dsbf-input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;padding:4px 6px}
.dsbf-upload-actions{display:flex;gap:6px;justify-content:flex-end}
.dsbf-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsbf-foot{display:flex;gap:6px;align-items:center;padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsbf-foot .dsbf-btn{flex:none}
.dsbf-foot .hint{flex:1;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsbf-collapsed{position:fixed;right:16px;bottom:16px;z-index:9999;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 12px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);display:flex;align-items:center;gap:6px;user-select:none}
.dsbf-collapsed:hover{border-color:var(--dsw-alias-brand-primary)}
`
    // Always write the current CSS. HMR re-materializes this factory on every
    // edit, but the host only inventories injected <style> tags without ever
    // removing them — a create-once guard would pin the first revision forever
    // and CSS edits would need a manual page refresh.
    if (typeof document !== 'undefined') {
      let tag = document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`)
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-balance-files'
        tag.dataset.pluginCss = CSS_TAG_ID
        document.head.appendChild(tag)
      }
      tag.textContent = css
    }

    /** Same-origin JSON helper against the host routes. */
    async function apiFetch(path, init) {
      const response = await fetch(path, init)
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data?.error || `request failed: ${response.status}`)
      }
      return data
    }

    function formatBytes(bytes) {
      if (bytes === undefined || bytes === null) return '--'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    }

    function formatTime(epochSeconds) {
      if (!epochSeconds) return ''
      const d = new Date(epochSeconds * 1000)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    function formatGiB(bytes) {
      if (bytes === undefined || bytes === null) return '--'
      return (bytes / 1024 / 1024 / 1024).toFixed(2)
    }

    /**
     * The floating widget: balance card + file list, collapsible.
     * @param props - slot standard props (unused here).
     */
    const POS_KEY = 'dsh-balance-files/pos'
    /** `.dsbf-root` width; the collapsed pill is narrower, so fit is judged against the panel. */
    const PANEL_WIDTH = 320
    /** Viewport margin kept when clamping the widget into view. */
    const MARGIN = 8

    function loadPos() {
      try {
        const raw = window.localStorage.getItem(POS_KEY)
        if (!raw) return null
        const p = JSON.parse(raw)
        if (typeof p.left === 'number' && typeof p.top === 'number') return p
        return null
      } catch {
        return null
      }
    }

    function savePos(pos) {
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        // storage unavailable — position is per-session only
      }
    }

    function BalanceFilesWidget() {
      const [collapsed, setCollapsed] = React.useState(false)
      const [balance, setBalance] = React.useState(null)
      const [files, setFiles] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [pendingUpload, setPendingUpload] = React.useState(null)
      const [uploadName, setUploadName] = React.useState('')
      const [uploadExpiry, setUploadExpiry] = React.useState(0)
      const [detail, setDetail] = React.useState(null)
      const [detailError, setDetailError] = React.useState(null)
      const [storage, setStorage] = React.useState(null)
      const [storageBusy, setStorageBusy] = React.useState(false)
      const [pos, setPos] = React.useState(loadPos)
      const [anchor, setAnchor] = React.useState('top')
      const [bottomGap, setBottomGap] = React.useState(0)
      const dragRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const expandStateRef = React.useRef(null)
      const posRef = React.useRef(pos)
      posRef.current = pos
      const anchorRef = React.useRef(anchor)
      anchorRef.current = anchor
      const bottomGapRef = React.useRef(bottomGap)
      bottomGapRef.current = bottomGap
      const fileInputRef = React.useRef(null)

      /**
       * Smart anchor: the panel keeps ONE fixed edge while its content
       * grows/shrinks. After a drag (or on first mount with a saved pos),
       * pick the edge by distance — nearer the bottom => bottom-anchored
       * (grows upward, shrinks downward); nearer the top => top-anchored
       * (grows downward, shrinks upward). Expanding content may temporarily
       * nudge the panel into the viewport, and that nudge is undone when the
       * content closes, so the panel never drifts upward after collapsing.
       *
       * `pos` is intentionally NOT a dependency: position updates from the
       * clamp below must not re-run this effect (that would ping-pong the
       * panel). Read the current position through `posRef` instead.
       */
      const isExpanded = Boolean(pendingUpload) || Boolean(detail)
      const settleAnchor = React.useCallback(() => {
        const el = rootRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const toTop = rect.top
        const toBottom = window.innerHeight - rect.bottom
        if (toBottom < toTop) {
          setAnchor('bottom')
          setBottomGap(Math.max(8, toBottom))
        } else {
          setAnchor('top')
        }
      }, [])

      /**
       * Pull the panel back inside the viewport.
       *
       * `pos` stores absolute viewport pixels captured while dragging, so
       * shrinking the window would otherwise strand the panel past the right
       * or bottom edge. Horizontal overflow always clamps `left`; vertical
       * overflow clamps `top`, or `bottomGap` when the panel is bottom-anchored.
       * The equality guards make it safe to call on every resize: it writes
       * state only when it actually moved, so it cannot ping-pong.
       */
      const clampIntoViewport = React.useCallback(() => {
        const el = rootRef.current
        const current = posRef.current
        if (!el || !current) return
        const rect = el.getBoundingClientRect()
        const margin = MARGIN
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
        const left = Math.round(Math.min(Math.max(margin, current.left), maxLeft))

        if (anchorRef.current === 'bottom') {
          if (left !== current.left) {
            const next = { left, top: current.top }
            setPos(next)
            savePos(next)
          }
          if (rect.top < margin) setBottomGap(Math.max(margin, bottomGapRef.current - (margin - rect.top)))
          return
        }

        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin)
        const top = Math.round(Math.min(Math.max(margin, current.top), maxTop))
        if (left === current.left && top === current.top) return
        const next = { left, top }
        setPos(next)
        savePos(next)
      }, [])

      // Pick the anchor once on mount, then make sure a saved position is still
      // on-screen — it may have been stored in a wider/taller window.
      React.useLayoutEffect(() => {
        if (posRef.current) {
          clampIntoViewport()
          settleAnchor()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Shrinking the window must never leave the panel stranded off-screen.
      React.useEffect(() => {
        window.addEventListener('resize', clampIntoViewport)
        return () => window.removeEventListener('resize', clampIntoViewport)
      }, [clampIntoViewport])

      React.useLayoutEffect(() => {
        const current = posRef.current
        const el = rootRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const limit = window.innerHeight - 8

        if (isExpanded) {
          if (!current) return
          if (!expandStateRef.current) {
            expandStateRef.current = {
              left: rect.left,
              top: rect.top,
              anchor,
              bottomGap: window.innerHeight - rect.bottom,
            }
          }
          if (anchor === 'top' && rect.bottom > limit) {
            // Top-anchored and overflowing the bottom: temporary upward nudge.
            const over = rect.bottom - limit
            if (over > 0) setPos({ left: current.left, top: Math.max(0, current.top - over) })
          } else if (anchor === 'bottom' && rect.top < 8) {
            // Bottom-anchored and overflowing the top: temporary downward nudge.
            const over = 8 - rect.top
            if (over > 0) setBottomGap(Math.max(8, (expandStateRef.current?.bottomGap ?? 8) + over))
          }
        } else if (expandStateRef.current) {
          // Content closed: restore the exact pre-expansion position.
          const st = expandStateRef.current
          expandStateRef.current = null
          setAnchor(st.anchor || 'top')
          if (st.anchor === 'bottom') {
            setBottomGap(Math.max(8, st.bottomGap))
          } else {
            setPos({ left: st.left, top: st.top })
            savePos({ left: st.left, top: st.top })
          }
        }
      }, [isExpanded, storage, collapsed, anchor, settleAnchor])

      /**
       * Shared drag for the head bar and the collapsed pill.
       *
       * `onTap` runs when the pointer never crossed the movement threshold —
       * that is how the pill stays click-to-expand while also being draggable.
       */
      const startDrag = (e, el, onTap) => {
        if (e.button !== 0) return
        e.preventDefault()
        expandStateRef.current = null
        setAnchor('top')
        const startX = e.clientX
        const startY = e.clientY
        const rect = el.getBoundingClientRect()
        const baseLeft = pos ? pos.left : window.innerWidth - rect.width - 16
        const baseTop = pos ? pos.top : window.innerHeight - rect.height - 16
        let moved = false
        dragRef.current = { startX, startY, baseLeft, baseTop }
        const onMove = (ev) => {
          const d = dragRef.current
          if (!d) return
          if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 4) return
          moved = true
          const left = Math.max(0, Math.min(window.innerWidth - rect.width, d.baseLeft + ev.clientX - d.startX))
          const top = Math.max(0, Math.min(window.innerHeight - rect.height, d.baseTop + ev.clientY - d.startY))
          const next = { left: Math.round(left), top: Math.round(top) }
          setPos(next)
          savePos(next)
        }
        const onUp = () => {
          dragRef.current = null
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          if (moved) settleAnchor()
          else if (onTap !== undefined) onTap()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      /**
       * Expand from the pill.
       *
       * The pill is narrower than the panel, so one parked near the right edge
       * would push the expanded panel out of the viewport. Pull it back on
       * expand instead of restricting where the pill may be dragged.
       */
      const expandFromPill = () => {
        const current = posRef.current
        if (current !== null) {
          const panelWidth = Math.min(PANEL_WIDTH, window.innerWidth - 2 * MARGIN)
          const maxLeft = Math.max(MARGIN, window.innerWidth - panelWidth - MARGIN)
          if (current.left > maxLeft) {
            const next = { left: Math.round(maxLeft), top: current.top }
            setPos(next)
            savePos(next)
          }
        }
        setCollapsed(false)
      }

      const loadAll = React.useCallback(() => {
        setError(null)
        apiFetch('/api/ds/balance').then((b) => setBalance(b)).catch((e) => setError(e.message))
        apiFetch('/api/ds/files?limit=50&order=desc').then((f) => setFiles(f.data || [])).catch((e) => setError(e.message))
      }, [])

      /**
       * Walk every page of the file list and fold bytes + count
       * (limits: 25 GiB, 10000 files). Stable callback for auto-refresh.
       */
      const computeStorage = React.useCallback(() => {
        if (storageBusy) return
        setStorageBusy(true)
        const LIMIT = 1000
        let totalBytes = 0
        let count = 0
        let after = null
        const step = () => {
          const q = `limit=${LIMIT}&order=asc${after ? `&after=${encodeURIComponent(after)}` : ''}`
          return apiFetch(`/api/ds/files?${q}`)
            .then((page) => {
              const rows = page.data || []
              for (const row of rows) {
                totalBytes += row.bytes || 0
                count += 1
              }
              if (rows.length === LIMIT) {
                after = rows[rows.length - 1].id
                return step()
              }
              const QUOTA_BYTES = 25 * 1024 * 1024 * 1024
              const QUOTA_FILES = 10000
              setStorage({
                usedBytes: totalBytes,
                remainingBytes: Math.max(0, QUOTA_BYTES - totalBytes),
                count,
                remainingFiles: Math.max(0, QUOTA_FILES - count),
                quotaBytes: QUOTA_BYTES,
                quotaFiles: QUOTA_FILES,
              })
              setStorageBusy(false)
            })
            .catch((e) => {
              setStorageBusy(false)
              setError(e.message)
            })
        }
        step()
      }, [storageBusy])

      /** Load the list + recompute storage after a data mutation. */
      const refreshAfterMutation = React.useCallback(() => {
        loadAll()
        computeStorage()
      }, [loadAll, computeStorage])

      React.useEffect(() => {
        loadAll()
        computeStorage()
        const timer = window.setInterval(loadAll, 30000)
        const storageTimer = window.setInterval(computeStorage, 10 * 60 * 1000)
        const onVisibility = () => {
          if (document.visibilityState === 'visible') {
            loadAll()
            computeStorage()
          }
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          window.clearInterval(timer)
          window.clearInterval(storageTimer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [loadAll, computeStorage])

      const removeFile = (id, filename) => {
        if (!window.confirm(`删除文件 ${filename}？`)) return
        apiFetch(`/api/ds/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
          .then(() => {
            if (detail && detail.id === id) setDetail(null)
            refreshAfterMutation()
          })
          .catch((e) => setError(e.message))
      }

      const showDetail = (id) => {
        setDetailError(null)
        setDetail({ id, loading: true })
        apiFetch(`/api/ds/files/${encodeURIComponent(id)}`)
          .then((d) => setDetail({ id, loading: false, file: d }))
          .catch((e) => {
            setDetail({ id, loading: false, error: e.message })
            setDetailError(e.message)
          })
      }

      const uploadFile = () => {
        const file = pendingUpload
        if (!file) return
        setBusy(true)
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = String(reader.result).split(',')[1] || ''
          // Rename keeps the original extension when the user did not type one.
          const renamed = uploadName.trim()
          const originalExt = (file.name.match(/\.[^./\\]+$/) || [''])[0]
          const filename = renamed
            ? /\.\w+$/.test(renamed)
              ? renamed
              : `${renamed}${originalExt}`
            : file.name
          const body = { filename, contentBase64: base64 }
          if (uploadExpiry > 0) body.expiresAfter = { anchor: 'created_at', seconds: uploadExpiry }
          apiFetch('/api/ds/files', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
            .then(() => {
              setPendingUpload(null)
              setUploadName('')
              setUploadExpiry(0)
              refreshAfterMutation()
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false))
        }
        reader.onerror = () => {
          setError('读取文件失败')
          setBusy(false)
        }
        reader.readAsDataURL(file)
      }

      const widgetStyle = pos
        ? anchor === 'bottom'
          ? { left: `${pos.left}px`, right: 'auto', top: 'auto', bottom: `${bottomGap}px` }
          : { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto' }
        : undefined

      if (collapsed) {
        return React.createElement('div', {
          ref: rootRef,
          className: 'dsbf-collapsed',
          style: widgetStyle,
          onMouseDown: (e) => startDrag(e, e.currentTarget, expandFromPill),
          title: '拖动移动位置，点击展开',
        },
          React.createElement('span', { className: 'dsbf-icon' + (error ? ' err' : balance && balance.is_available === false ? ' warn' : '') }),
          React.createElement('span', null, 'DeepSeek 面板'),
        )
      }

      const balanceInfos = balance?.balance_infos || []
      const primary = balanceInfos.find((b) => b.currency === 'CNY') || balanceInfos[0]

      return React.createElement('div', { ref: rootRef, className: 'dsbf-root', style: widgetStyle },
        React.createElement('div', { className: 'dsbf-head', onMouseDown: (e) => startDrag(e, e.currentTarget.parentElement), title: '拖动移动位置' },
          React.createElement('span', {
            className: 'dsbf-icon' + (error ? ' err' : balance && balance.is_available === false ? ' warn' : ''),
          }),
          React.createElement('span', { className: 'dsbf-title' }, 'DeepSeek 余额 · 文件'),
          React.createElement('button', {
            className: 'dsbf-btn',
            onClick: (e) => {
              e.stopPropagation()
              refreshAfterMutation()
            },
          }, '刷新'),
          React.createElement('button', { className: 'dsbf-btn', onClick: (e) => { e.stopPropagation(); setCollapsed(true) } }, '收起'),
        ),
        React.createElement('div', { className: 'dsbf-body' },
          error && React.createElement('div', { className: 'dsbf-err' }, `⚠ ${error}`),
          React.createElement('div', { className: 'dsbf-balance' },
            primary
              ? [
                  React.createElement('div', { className: 'dsbf-kv dsbf-total', key: 'total' },
                    React.createElement('span', { className: 'k' }, '总余额'),
                    React.createElement('span', { className: 'v' }, `${primary.total_balance} ${primary.currency}`)),
                  React.createElement('div', { className: 'dsbf-kv', key: 'granted' },
                    React.createElement('span', { className: 'k' }, '赠金'),
                    React.createElement('span', { className: 'v' }, `${primary.granted_balance} ${primary.currency}`)),
                  React.createElement('div', { className: 'dsbf-kv', key: 'topped' },
                    React.createElement('span', { className: 'k' }, '充值'),
                    React.createElement('span', { className: 'v' }, `${primary.topped_up_balance} ${primary.currency}`)),
                ]
              : React.createElement('div', { className: 'dsbf-empty' }, balance === null && !error ? '加载中…' : '暂无余额数据'),
          ),
          detail && React.createElement('div', { className: 'dsbf-detail' },
            React.createElement('div', { className: 'dsbf-detail-head' },
              React.createElement('span', { className: 'dsbf-detail-title' }, '文件详情'),
              React.createElement('button', { className: 'dsbf-btn', onClick: () => setDetail(null) }, '关闭'),
            ),
            detail.loading
              ? React.createElement('div', { className: 'dsbf-empty' }, '查询中…')
              : detail.error
                ? React.createElement('div', { className: 'dsbf-err' }, `⚠ ${detail.error}`)
                : detail.file && (() => {
                    const f = detail.file
                    return [
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'id' },
                        React.createElement('span', { className: 'k' }, 'ID'),
                        React.createElement('span', { className: 'v dsbf-detail-id' }, f.id)),
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'name' },
                        React.createElement('span', { className: 'k' }, '文件名'),
                        React.createElement('span', { className: 'v' }, f.filename)),
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'size' },
                        React.createElement('span', { className: 'k' }, '大小'),
                        React.createElement('span', { className: 'v' }, formatBytes(f.bytes))),
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'purpose' },
                        React.createElement('span', { className: 'k' }, '用途'),
                        React.createElement('span', { className: 'v' }, f.purpose)),
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'created' },
                        React.createElement('span', { className: 'k' }, '创建时间'),
                        React.createElement('span', { className: 'v' }, formatTime(f.created_at))),
                      React.createElement('div', { className: 'dsbf-detail-row', key: 'expires' },
                        React.createElement('span', { className: 'k' }, '过期时间'),
                        React.createElement('span', { className: 'v' }, f.expires_at ? formatTime(f.expires_at) : '永久')),
                    ]
                  })(),
          ),
          pendingUpload && React.createElement('div', { className: 'dsbf-upload' },
            React.createElement('div', { className: 'dsbf-upload-name' },
              React.createElement('span', { className: 'k' }, '文件名（可选）'),
              React.createElement('input', {
                className: 'dsbf-input',
                type: 'text',
                placeholder: pendingUpload.name,
                value: uploadName,
                onChange: (e) => setUploadName(e.target.value),
              }),
            ),
            React.createElement('div', { className: 'dsbf-upload-expiry' },
              React.createElement('span', { className: 'k' }, '有效期（可选）'),
              React.createElement('select', {
                className: 'dsbf-input',
                value: String(uploadExpiry),
                onChange: (e) => setUploadExpiry(Number(e.target.value)),
              },
                React.createElement('option', { value: '0' }, '永久有效'),
                React.createElement('option', { value: '3600' }, '1 小时'),
                React.createElement('option', { value: '86400' }, '1 天'),
                React.createElement('option', { value: '604800' }, '7 天'),
                React.createElement('option', { value: '2592000' }, '30 天'),
              ),
            ),
            React.createElement('div', { className: 'dsbf-upload-actions' },
              React.createElement('button', {
                className: 'dsbf-btn',
                disabled: busy,
                onClick: () => {
                  setPendingUpload(null)
                  setUploadName('')
                  setUploadExpiry(0)
                },
              }, '取消'),
              React.createElement('button', {
                className: 'dsbf-btn dsbf-btn-primary',
                disabled: busy,
                onClick: uploadFile,
              }, busy ? '上传中…' : '确认上传'),
            ),
          ),
          React.createElement('div', { className: 'dsbf-files' },
            files === null
              ? React.createElement('div', { className: 'dsbf-empty' }, '加载文件列表…')
              : files.length === 0
                ? React.createElement('div', { className: 'dsbf-empty' }, '暂无文件（上传后可被对话引用）')
                : files.map((f) => React.createElement('div', { className: 'dsbf-file', key: f.id },
                    React.createElement('span', {
                      className: 'name',
                      title: `查看详情：${f.filename}`,
                      onClick: () => showDetail(f.id),
                    }, f.filename),
                    React.createElement('span', { className: 'meta' }, formatBytes(f.bytes)),
                    React.createElement('span', { className: 'meta' + (f.expires_at ? ' dsbf-expiry' : ' dsbf-perm') }, f.expires_at ? `⏳${formatTime(f.expires_at).slice(5)}` : '永久'),
                    React.createElement('button', {
                      className: 'del',
                      title: '删除',
                      onClick: () => removeFile(f.id, f.filename),
                    }, '✕'),
                  )),
          ),
        ),
        React.createElement('div', { className: 'dsbf-foot' },
          storage === null
            ? React.createElement('span', { className: 'dsbf-storage-text' }, storageBusy ? '统计中…' : '存储空间统计…')
            : React.createElement('span', { className: 'dsbf-storage-text' },
                `已用 ${formatGiB(storage.usedBytes)} / 25 GiB（剩 ${formatGiB(storage.remainingBytes)}） · 文件 ${storage.count} / ${storage.quotaFiles}`),
          React.createElement('button', {
            className: 'dsbf-btn',
            disabled: busy,
            onClick: () => fileInputRef.current?.click(),
          }, busy ? '上传中…' : '上传'),
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: 'image/jpeg,image/png,image/gif,image/webp',
            style: { display: 'none' },
            onChange: (e) => {
              const file = e.target.files && e.target.files[0]
              if (file) {
                setPendingUpload(file)
                setUploadName('')
                setUploadExpiry(0)
              }
              e.target.value = ''
            },
          }),
        ),
      )
    }

    /** Required services: the slot registry. */
    const inject = ['slots']

    function apply(ctx) {
      // Register through `slots.inject`: it ties the entry to the target slot's
      // declaration lifetime, so the overlay is claimed whenever ui-layout
      // declares `shell.overlay` — which can happen after this module
      // materializes. A bare `slots.register` here races that declaration and
      // drops the entry silently.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'balance-files',
        order: 200,
        label: 'DeepSeek 余额 · 文件',
      }, BalanceFilesWidget))
    }

    exports.BalanceFilesWidget = BalanceFilesWidget
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
