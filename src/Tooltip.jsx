import { useState, useRef, useEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// Tooltip component for wrapping any element
export const Tooltip = ({ children, content, delay = 400, align = 'center', followMouse = false }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timeoutRef = useRef(null)
  const mousePos = useRef({ x: 0, y: 0 })

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  const handleMouseMove = (e) => {
    if (followMouse) {
      mousePos.current = { x: e.clientX, y: e.clientY }
      if (isVisible) {
        updateTooltipPosition()
      }
    }
  }

  const updateTooltipPosition = () => {
    const tooltipEl = tooltipRef.current
    if (!tooltipEl) return
    
    const tooltipRect = tooltipEl.getBoundingClientRect()
    const padding = 12
    
    let x, y
    
    if (followMouse) {
      // Position relative to mouse
      x = mousePos.current.x + 12
      y = mousePos.current.y - tooltipRect.height - 8
      
      // If would go above viewport, show below mouse
      if (y < padding) {
        y = mousePos.current.y + 20
      }
    } else {
      // Position relative to trigger element
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      if (!triggerRect) return
      
      if (align === 'left') {
        x = triggerRect.left
      } else {
        x = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
      }
      y = triggerRect.top - tooltipRect.height - 10
      
      if (y < padding) {
        y = triggerRect.bottom + 10
      }
    }
    
    // Keep within viewport horizontally
    if (x < padding) x = padding
    if (x + tooltipRect.width > window.innerWidth - padding) {
      x = window.innerWidth - tooltipRect.width - padding
    }
    
    setCoords({ x, y })
  }

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      requestAnimationFrame(updateTooltipPosition)
    }
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isVisible, align, followMouse])

  if (!content) return children

  return (
    <>
      <div
        ref={triggerRef}
        className="tooltip-wrapper"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onMouseMove={handleMouseMove}
        onTouchStart={showTooltip}
        onTouchEnd={hideTooltip}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className="tooltip"
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
          }}
        >
          {typeof content === 'string' ? (
            <p>{content}</p>
          ) : (
            <div className="tooltip-content">{content}</div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

// Pre-built tooltip content layouts
export const TipTitle = ({ children }) => (
  <div className="tooltip-title">{children}</div>
)

export const TipText = ({ children }) => (
  <p className="tooltip-text">{children}</p>
)

export const TipLabel = ({ label, value }) => (
  <div className="tooltip-row">
    <span className="tooltip-label">{label}</span>
    <span className="tooltip-value">{value}</span>
  </div>
)

export const TipDivider = () => <div className="tooltip-divider" />

export const TipHint = ({ children }) => (
  <p className="tooltip-hint">{children}</p>
)

export default Tooltip

