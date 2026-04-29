import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const TOUR_KEY = 'tutarbu_tour_v1';

// ── Spotlight ─────────────────────────────────────────────────────────────────
function Spotlight({ rect, padding = 10 }) {
  if (!rect) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.78)',
        zIndex: 9993,
        pointerEvents: 'none',
        border: '1.5px solid rgba(0, 242, 255, 0.6)',
        outline: '1px solid rgba(0, 242, 255, 0.15)',
        outlineOffset: 4,
        transition: 'top 0.35s cubic-bezier(0.4,0,0.2,1), left 0.35s cubic-bezier(0.4,0,0.2,1), width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}
    />
  );
}

// ── 4-quadrant blocking overlay ───────────────────────────────────────────────
function BlockingOverlay({ rect, padding = 10 }) {
  const blockStyle = { position: 'fixed', zIndex: 9991, background: 'transparent' };
  if (!rect) {
    return <div style={{ ...blockStyle, inset: 0, cursor: 'default' }} />;
  }
  const sx = rect.left - padding;
  const sy = rect.top - padding;
  const sw = rect.width + padding * 2;
  const sh = rect.height + padding * 2;
  return (
    <>
      <div style={{ ...blockStyle, top: 0, left: 0, right: 0, height: Math.max(0, sy) }} />
      <div style={{ ...blockStyle, top: sy + sh, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...blockStyle, top: sy, left: 0, width: Math.max(0, sx), height: sh }} />
      <div style={{ ...blockStyle, top: sy, left: sx + sw, right: 0, height: sh }} />
    </>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ step, rect, onPrev, onNext, onClose, isFirst, isLast, canNext, idx, total, isFirstVisit }) {
  const [pos, setPos] = useState({ top: -9999, left: -9999, opacity: 0 });
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    const tt = tooltipRef.current;
    if (!tt) return;
    const ttRect = tt.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 18;
    const GAP = 14;
    let top, left;

    if (!rect) {
      top = (vh - ttRect.height) / 2;
      left = (vw - ttRect.width) / 2;
    } else {
      const preferred = step.position || 'bottom';
      if (preferred === 'bottom') {
        top = rect.bottom + GAP;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
      } else if (preferred === 'top') {
        top = rect.top - ttRect.height - GAP;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
      } else if (preferred === 'right') {
        top = rect.top + rect.height / 2 - ttRect.height / 2;
        left = rect.right + GAP;
      } else if (preferred === 'left') {
        top = rect.top + rect.height / 2 - ttRect.height / 2;
        left = rect.left - ttRect.width - GAP;
      } else {
        top = rect.bottom + GAP;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
      }
      top = Math.max(MARGIN, Math.min(vh - ttRect.height - MARGIN, top));
      left = Math.max(MARGIN, Math.min(vw - ttRect.width - MARGIN, left));
    }

    setPos({ top, left, opacity: 1 });
  }, [rect, idx, step]);

  const progress = total > 1 ? (idx / (total - 1)) * 100 : 0;
  const showClose = !isFirstVisit;

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        opacity: pos.opacity,
        zIndex: 9999,
        background: 'rgba(6, 6, 14, 0.97)',
        border: '1px solid rgba(0, 242, 255, 0.3)',
        borderRadius: 14,
        padding: '20px 22px',
        maxWidth: 400,
        minWidth: 290,
        boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 40px rgba(0,242,255,0.07)',
        backdropFilter: 'blur(20px)',
        fontFamily: 'Outfit, sans-serif',
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, color: 'rgba(0,242,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.8 }}>
          Rehber {idx + 1} / {total}
        </span>
        {showClose && (
          <button
            onClick={onClose}
            title="Rehberi kapat"
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.35)', borderRadius: 6,
              padding: '2px 8px', cursor: 'pointer', fontSize: 11, lineHeight: 1.6,
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: 'linear-gradient(90deg, #00f2ff, #bc13fe)',
          borderRadius: 99, transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Title */}
      <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff', marginBottom: 8, lineHeight: 1.35, letterSpacing: 0.2 }}>
        {step.title}
      </div>

      {/* Body */}
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.68)', lineHeight: 1.7, marginBottom: 18, whiteSpace: 'pre-line' }}>
        {step.body}
      </div>

      {/* Wait indicator */}
      {step.waitFor && !canNext && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          padding: '8px 12px',
          background: 'rgba(0,242,255,0.04)',
          border: '1px solid rgba(0,242,255,0.18)',
          borderRadius: 8,
          fontSize: 11.5, color: '#00f2ff',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#00f2ff',
            animation: 'tourBlink 1.4s ease-in-out infinite',
            flexShrink: 0,
          }} />
          {step.waitLabel || 'Yükleniyor...'}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!isFirst && (
          <button
            onClick={onPrev}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.55)', borderRadius: 8,
              padding: '7px 15px', cursor: 'pointer', fontSize: 12,
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, letterSpacing: 0.2,
            }}
          >
            ← Geri
          </button>
        )}
        <button
          onClick={canNext ? onNext : undefined}
          disabled={!canNext}
          style={{
            background: canNext
              ? 'linear-gradient(135deg, rgba(0,242,255,0.18), rgba(188,19,254,0.18))'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${canNext ? 'rgba(0,242,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
            color: canNext ? '#00f2ff' : 'rgba(255,255,255,0.2)',
            borderRadius: 8, padding: '7px 20px',
            cursor: canNext ? 'pointer' : 'not-allowed',
            fontSize: 12, fontFamily: 'Outfit, sans-serif',
            fontWeight: 900, letterSpacing: 0.4,
            transition: 'all 0.2s',
          }}
        >
          {isLast ? '✓ Tamamla' : (step.waitFor && !canNext ? '⏳ Bekleniyor' : 'İleri →')}
        </button>
      </div>
    </div>
  );
}

// ── Full-screen modal step ────────────────────────────────────────────────────
function ModalStep({ step, onNext, onClose, isFirstVisit, idx, total }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(14px)',
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{
        background: 'rgba(6, 6, 14, 0.98)',
        border: '1px solid rgba(0,242,255,0.22)',
        borderRadius: 20, padding: '44px 48px',
        maxWidth: 520, width: '90%',
        boxShadow: '0 40px 100px rgba(0,0,0,0.85), 0 0 60px rgba(0,242,255,0.05)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>{step.icon || '⚡'}</div>
        <div style={{ fontSize: 22, fontWeight: 950, color: '#fff', marginBottom: 14, letterSpacing: 0.4 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.75, marginBottom: 30, whiteSpace: 'pre-line', textAlign: 'left' }}>
          {step.body}
        </div>
        {total > 1 && (
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.25)', marginBottom: 22, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Adım {idx + 1} / {total}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {!isFirstVisit && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.38)', borderRadius: 10,
                padding: '10px 22px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              }}
            >
              Atla
            </button>
          )}
          <button
            onClick={onNext}
            style={{
              background: 'linear-gradient(135deg, rgba(0,242,255,0.22), rgba(188,19,254,0.22))',
              border: '1px solid rgba(0,242,255,0.4)',
              color: '#00f2ff', borderRadius: 10, padding: '11px 34px',
              cursor: 'pointer', fontSize: 14,
              fontFamily: 'Outfit, sans-serif', fontWeight: 900, letterSpacing: 0.5,
              boxShadow: '0 0 20px rgba(0,242,255,0.1)',
            }}
          >
            {step.nextLabel || 'İleri →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main TourGuide ────────────────────────────────────────────────────────────
export default function TourGuide({
  steps,
  active,
  currentStep,
  onStepChange,
  onComplete,
  onClose,
  isFirstVisit,
  prediction,
  loading,
  modifiedLineup,
  workshopSide,
  tourWorkshopDone,
  tourSingleSimDone,
  tourMultiSimDone,
}) {
  const [targetRect, setTargetRect] = useState(null);
  const timerRef = useRef(null);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const tourState = {
    prediction, loading,
    modifiedLineup, workshopSide,
    tourWorkshopDone, tourSingleSimDone, tourMultiSimDone,
  };
  const canNext = !step?.waitFor || step.waitFor(tourState);

  // Update target rect whenever step changes
  const updateRect = useCallback(() => {
    if (!step || step.isModal || !step.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) { setTargetRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Wait for scroll to settle then capture rect
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fresh = document.querySelector(`[data-tour="${step.target}"]`);
      if (fresh) setTargetRect(fresh.getBoundingClientRect());
    }, 320);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('resize', updateRect);
    };
  }, [active, currentStep, updateRect]);

  if (!active || !step) return null;

  const handleNext = () => {
    if (!canNext) return;
    if (isLast) onComplete();
    else onStepChange(currentStep + 1);
  };

  const handlePrev = () => {
    if (!isFirst) onStepChange(currentStep - 1);
  };

  if (step.isModal) {
    return createPortal(
      <ModalStep
        step={step}
        onNext={isLast ? onComplete : handleNext}
        onClose={onClose}
        isFirstVisit={isFirstVisit}
        idx={currentStep}
        total={steps.length}
      />,
      document.body
    );
  }

  return createPortal(
    <>
      <BlockingOverlay rect={targetRect} />
      <Spotlight rect={targetRect} />
      <Tooltip
        step={step}
        rect={targetRect}
        onPrev={handlePrev}
        onNext={handleNext}
        onClose={onClose}
        isFirst={isFirst}
        isLast={isLast}
        canNext={canNext}
        idx={currentStep}
        total={steps.length}
        isFirstVisit={isFirstVisit}
      />
    </>,
    document.body
  );
}

// ── Tour state hook ───────────────────────────────────────────────────────────
export function useTour() {
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      setIsFirstVisit(true);
      setTourActive(true);
    }
  }, []);

  const startTour = useCallback(() => {
    setTourStep(0);
    setTourActive(true);
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1');
    setIsFirstVisit(false);
    setTourActive(false);
    setTourStep(0);
  }, []);

  const closeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1');
    setIsFirstVisit(false);
    setTourActive(false);
  }, []);

  return { tourActive, tourStep, setTourStep, isFirstVisit, startTour, completeTour, closeTour };
}
