/**
 * dsh-skill-picker 的 Web 客户端：输入框工具行的「Skill」按钮 + 可搜索弹层。
 *
 * 交互：
 *   点击按钮 → 拉取当前会话的 skill 目录（skills/list，single-flight 缓存）；
 *   弹层支持输入过滤、↑/↓ 移动高亮、Enter 选中、Esc 关闭、点击行选中；
 *   选中后在草稿光标处插入 `/name `（可撤销编辑，官方输入管线把它渲染成 skill chip）。
 *
 * 遵循 DSH 纯 JS 插件规则：不 require 其它 Harness Client 包；
 * 控件自绘，样式只用 --dsw-alias-* 主题令牌，并随组件卸载清理。
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-picker',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const SLOT = 'conversation.input.left'
    const NS = 'skill-picker'

    const ZH = {
      button: 'Skill',
      hint: '选择一个 skill，插入 /名称 到草稿',
      search: '搜索 skill…',
      empty: '当前会话没有可用的 skill',
      loading: '正在加载 skill 列表…',
      failed: 'skill 列表加载失败',
      userOnly: '仅用户',
      close: '关闭',
    }
    const EN = {
      button: 'Skill',
      hint: 'Pick a skill to insert /name into the draft',
      search: 'Search skills…',
      empty: 'No skills available in this session',
      loading: 'Loading skills…',
      failed: 'Failed to load skills',
      userOnly: 'User only',
      close: 'Close',
    }

    function translator(ctx) {
      const fallback = (key) => ZH[key] ?? key
      try {
        const locale = ctx.get ? ctx.get('locale') : undefined
        locale?.register?.(NS, 'zh', ZH)
        locale?.register?.(NS, 'en', EN)
        const bound = locale?.bind?.(NS)
        if (typeof bound === 'function') {
          return (key) => {
            try {
              const value = bound(key)
              if (typeof value === 'string' && value !== '' && value !== key) return value
            } catch {}
            return fallback(key)
          }
        }
      } catch {}
      return fallback
    }

    /** 简单的子序列模糊匹配：query 是 name/description 的大小写不敏感有序子序列。 */
    function fuzzyMatch(name, description, query) {
      if (query === '') return true
      const q = query.toLowerCase()
      if (name.toLowerCase().includes(q) || (description ?? '').toLowerCase().includes(q)) return true
      let at = 0
      for (const ch of name.toLowerCase()) {
        if (ch === q[at]) at++
        if (at === q.length) return true
      }
      return false
    }

    const styles = {
      button: (open, hover) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 28,
        padding: '0 9px',
        border: `1px solid ${open ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'}`,
        borderRadius: 999,
        background: hover && !open ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
        color: open ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background .12s ease, color .12s ease, border-color .12s ease',
      }),
      popup: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        width: 380,
        maxHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        boxShadow: '0 12px 32px var(--dsw-alias-shadow-1, rgba(0,0,0,.18))',
        overflow: 'hidden',
        zIndex: 40,
        font: 'inherit',
      },
      searchBox: {
        padding: '10px 10px 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        flexShrink: 0,
      },
      search: {
        width: '100%',
        boxSizing: 'border-box',
        height: 30,
        padding: '0 10px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 13,
        outline: 'none',
      },
      list: {
        overflowY: 'auto',
        padding: 4,
        flex: 1,
      },
      row: (active) => ({
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        cursor: 'pointer',
      }),
      rowName: {
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      },
      slash: {
        color: 'var(--dsw-alias-brand-primary)',
        fontFamily: 'ui-monospace, monospace',
        fontWeight: 500,
      },
      rowDesc: {
        marginTop: 2,
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      userOnly: {
        flexShrink: 0,
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
        fontWeight: 400,
      },
      status: {
        padding: '14px 12px',
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
        textAlign: 'center',
      },
      footer: {
        flexShrink: 0,
        padding: '6px 10px',
        borderTop: '1px solid var(--dsw-alias-border-l2)',
        fontSize: 11,
        color: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
        display: 'flex',
        gap: 10,
      },
    }

    /** 会话级目录缓存：sessionId → { skills, error }；拉取 single-flight。 */
    function createCatalogStore() {
      const cache = new Map()
      const inflight = new Map()
      return {
        get(sessionId) {
          return cache.get(sessionId)
        },
        async load(ctx, sessionId, signal) {
          const cached = cache.get(sessionId)
          if (cached !== undefined) return cached
          const running = inflight.get(sessionId)
          if (running) return running
          const promise = (async () => {
            try {
              const remote = ctx.remote
              const skills = remote?.skills
              if (!skills || typeof skills.list !== 'function') {
                throw new Error('skills remote unavailable')
              }
              const result = await skills.list({ sessionId }, signal)
              if (!result || !result.ok) {
                throw new Error(result?.error?.message || 'skills/list failed')
              }
              const entry = { skills: result.value.skills ?? [], error: '' }
              cache.set(sessionId, entry)
              return entry
            } catch (error) {
              const aborted = signal?.aborted === true
              const entry = { skills: [], error: aborted ? '' : (error?.message || 'skills/list failed') }
              if (!aborted) cache.set(sessionId, entry)
              return entry
            } finally {
              inflight.delete(sessionId)
            }
          })()
          inflight.set(sessionId, promise)
          return promise
        },
        drop(sessionId) {
          cache.delete(sessionId)
          const running = inflight.get(sessionId)
          running?.catch?.(() => {})
          inflight.delete(sessionId)
        },
        dropAll() {
          cache.clear()
          for (const running of inflight.values()) running?.catch?.(() => {})
          inflight.clear()
        },
      }
    }

    function makePickerButton(ctx, t, catalog) {
      // 插件管理器变更后目录全部失效（可能新增/移除了 skill 提供方）。
      try {
        ctx.effect(() => ctx.remote?.$on?.('plugin-manager/changed', () => catalog.dropAll()), 'skill-picker: pm watcher')
      } catch {}

      function SkillPickerButton(props) {
        const sessionId = props.sessionId
        const inputActions = props.inputActions
        const useInput = typeof props.useInput === 'function' ? props.useInput : null

        const [open, setOpen] = useState(false)
        const [query, setQuery] = useState('')
        const [entry, setEntry] = useState(null)
        const [active, setActive] = useState(0)
        const [hover, setHover] = useState(false)
        const rootRef = useRef(null)
        const searchRef = useRef(null)
        const listRef = useRef(null)
        const abortRef = useRef(null)

        // 切换会话即关闭并清空本地状态。
        useEffect(() => {
          setOpen(false)
          setQuery('')
          setEntry(null)
          setActive(0)
        }, [sessionId])

        // 卸载与弹层关闭时中止在途请求。
        useEffect(() => () => abortRef.current?.abort(), [])
        useEffect(() => {
          if (!open) abortRef.current?.abort()
        }, [open])

        // 点击弹层外部关闭。
        useEffect(() => {
          if (!open) return
          const onDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
          }
          document.addEventListener('mousedown', onDown, true)
          return () => document.removeEventListener('mousedown', onDown, true)
        }, [open])

        // 打开时拉目录并聚焦搜索框。
        useEffect(() => {
          if (!open || sessionId === undefined) return
          let cancelled = false
          const controller = new AbortController()
          abortRef.current = controller
          catalog.load(ctx, sessionId, controller.signal).then((loaded) => {
            if (!cancelled) setEntry(loaded)
          })
          const timer = setTimeout(() => searchRef.current?.focus?.(), 0)
          return () => {
            cancelled = true
            clearTimeout(timer)
          }
        }, [open, sessionId])

        const skills = entry?.skills ?? []
        const filtered = useMemo(() => {
          if (query.trim() === '') return skills
          return skills.filter((s) => fuzzyMatch(s.name ?? '', s.description ?? '', query.trim()))
        }, [skills, query])

        // 过滤结果变化时收敛高亮。
        useEffect(() => {
          setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)))
        }, [filtered.length])

        // 高亮行滚动进可视区。
        useEffect(() => {
          const list = listRef.current
          if (!list) return
          const row = list.querySelector('[data-active="true"]')
          row?.scrollIntoView?.({ block: 'nearest' })
        }, [active, filtered.length])

        const insertSkill = useCallback(
          (name) => {
            if (typeof inputActions?.captureInsertion !== 'function' || typeof inputActions?.insertText !== 'function') {
              setOpen(false)
              return
            }
            const span = inputActions.captureInsertion()
            const applied = inputActions.insertText(`/${name} `, span)
            // 编辑被拒（草稿已变/不可编辑）时保留结果不丢，交由用户重试。
            if (applied !== true) setOpen(false)
            else {
              setOpen(false)
              setQuery('')
            }
          },
          [inputActions],
        )

        const onKeyDown = useCallback(
          (event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const pick = filtered[active]
              if (pick) insertSkill(pick.name)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
            }
          },
          [filtered, active, insertSkill],
        )

        // 会话未就绪（空工作区）时不渲染。
        if (sessionId === undefined) return null

        return h(
          'div',
          { ref: rootRef, style: { position: 'relative', display: 'inline-flex' } },
          h(
            'button',
            {
              type: 'button',
              'data-skill-picker': open ? 'open' : 'closed',
              'aria-label': t('hint'),
              'aria-haspopup': 'listbox',
              'aria-expanded': open ? 'true' : 'false',
              title: t('hint'),
              style: styles.button(open, hover),
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => setOpen((v) => !v),
            },
            h('span', { 'aria-hidden': true, style: { fontSize: 12, lineHeight: 1 } }, '⌘'),
            h('span', null, t('button')),
          ),
          open &&
            h(
              'div',
              { style: styles.popup, role: 'dialog', 'aria-label': t('hint') },
              h(
                'div',
                { style: styles.searchBox },
                h('input', {
                  ref: searchRef,
                  style: styles.search,
                  value: query,
                  placeholder: t('search'),
                  onChange: (event) => {
                    setQuery(event.target.value)
                    setActive(0)
                  },
                  onKeyDown,
                }),
              ),
              h(
                'div',
                { ref: listRef, style: styles.list, role: 'listbox' },
                entry === null
                  ? h('div', { style: styles.status }, t('loading'))
                  : entry.error !== ''
                    ? h('div', { style: styles.status }, `${t('failed')}: ${entry.error}`)
                    : filtered.length === 0
                      ? h('div', { style: styles.status }, t('empty'))
                      : filtered.map((skill, index) =>
                          h(
                            'button',
                            {
                              key: skill.name,
                              type: 'button',
                              role: 'option',
                              'aria-selected': index === active ? 'true' : 'false',
                              'data-active': index === active ? 'true' : 'false',
                              style: styles.row(index === active),
                              onMouseEnter: () => setActive(index),
                              onMouseDown: (event) => event.preventDefault(),
                              onClick: () => insertSkill(skill.name),
                            },
                            h(
                              'div',
                              { style: styles.rowName },
                              h('span', { style: styles.slash }, `/${skill.name}`),
                              skill.modelInvocable === false && h('span', { style: styles.userOnly }, t('userOnly')),
                            ),
                            (skill.description ?? '') !== '' &&
                              h('div', { style: styles.rowDesc }, skill.description),
                          ),
                        ),
              ),
              h(
                'div',
                { style: styles.footer },
                h('span', null, '↑↓ 选择 · Enter 插入 · Esc 关闭'),
              ),
            ),
        )
      }

      return { component: SkillPickerButton }
    }

    function apply(ctx) {
      const t = translator(ctx)
      const picker = makePickerButton(ctx, t, createCatalogStore())
      const PickerButton = picker.component
      try {
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register({ name: SLOT, id: 'skill-picker', order: 15, label: 'Skill picker' }, PickerButton),
        )
      } catch (error) {
        console.warn('[skill-picker] composer button unavailable:', error)
      }
    }

    return { inject: ['slots', 'locale', 'remote', 'remote.skills'], apply }
  },
})
