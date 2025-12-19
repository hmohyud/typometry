import { useState, useRef, useEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// Tooltip component for wrapping any element
export const Tooltip = ({ children, content, delay = 400 }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timeoutRef = useRef(null)

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

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const updatePosition = () => {
        const triggerRect = triggerRef.current.getBoundingClientRect()
        const tooltipEl = tooltipRef.current
        
        if (!tooltipEl) return
        
        const tooltipRect = tooltipEl.getBoundingClientRect()
        
        // Center horizontally on trigger
        let x = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
        // Position above trigger
        let y = triggerRect.top - tooltipRect.height - 10
        
        // Keep within viewport horizontally
        const padding = 12
        if (x < padding) x = padding
        if (x + tooltipRect.width > window.innerWidth - padding) {
          x = window.innerWidth - tooltipRect.width - padding
        }
        
        // If would go above viewport, show below
        if (y < padding) {
          y = triggerRect.bottom + 10
        }
        
        setCoords({ x, y })
      }
      
      // Initial position
      requestAnimationFrame(updatePosition)
    }
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isVisible])

  if (!content) return children

  return (
    <>
      <div
        ref={triggerRef}
        className="tooltip-wrapper"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
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

