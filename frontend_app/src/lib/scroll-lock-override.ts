// Runtime override to neutralise scrollbar-compensation styles injected by
// react-remove-scroll / Radix when overlays set `data-scroll-locked` on the
// body. This prevents small non-modal popovers/menus from causing visible
// page shifts by forcing zero padding/margin while preserving scroll-lock.

type SavedStyles = {
  paddingRight?: string;
  marginRight?: string;
  position?: string;
  removedVar?: string;
};

const LOCK_ATTR = 'data-scroll-locked';

let saved: SavedStyles | null = null;

function applyOverrides() {
  // Save previous inline values once
  if (!saved) {
    saved = {
      paddingRight: document.body.style.getPropertyValue('padding-right') || '',
      marginRight: document.body.style.getPropertyValue('margin-right') || '',
      position: document.body.style.getPropertyValue('position') || '',
      removedVar: document.body.style.getPropertyValue('--removed-body-scroll-bar-size') || '',
    };
  }

  // Use inline styles with !important to outrank dynamically injected styles
  document.body.style.setProperty('--removed-body-scroll-bar-size', '0px', 'important');
  document.body.style.setProperty('padding-right', '0px', 'important');
  document.body.style.setProperty('margin-right', '0px', 'important');
}

function restoreOverrides() {
  if (!saved) return;

  // Restore saved inline styles (or remove properties if none)
  if (saved.removedVar) {
    document.body.style.setProperty('--removed-body-scroll-bar-size', saved.removedVar);
  } else {
    document.body.style.removeProperty('--removed-body-scroll-bar-size');
  }

  if (saved.paddingRight) {
    document.body.style.setProperty('padding-right', saved.paddingRight);
  } else {
    document.body.style.removeProperty('padding-right');
  }

  if (saved.marginRight) {
    document.body.style.setProperty('margin-right', saved.marginRight);
  } else {
    document.body.style.removeProperty('margin-right');
  }

  if (saved.position) {
    document.body.style.setProperty('position', saved.position);
  } else {
    document.body.style.removeProperty('position');
  }

  saved = null;
}

function handleLockChange() {
  const val = parseInt(document.body.getAttribute(LOCK_ATTR) || '0', 10) || 0;
  if (val > 0) {
    applyOverrides();
  } else {
    restoreOverrides();
  }
}

// Observe attribute changes on body
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Run once at load in case attribute already present
  try {
    handleLockChange();

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m.attributeName === LOCK_ATTR || m.attributeName === 'class')) {
          handleLockChange();
        }
      }
    });

    mo.observe(document.body, { attributes: true });

    // Expose a debug hook in dev so we can easily toggle if needed
    if (import.meta.env.DEV) {
      (window as any).__scrollLockOverride = { applyOverrides, restoreOverrides };
    }
  } catch (err) {
    // Non-fatal - don't break app if observer fails
    console.debug('[scroll-lock-override] init failed', err);
  }
}

export {};
