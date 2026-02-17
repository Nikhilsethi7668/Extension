import React from 'react';

/** Catches errors in InternetWarning so a hook/React mismatch doesn't crash the app. Renders nothing on error. */
export class InternetWarningBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.warn('[InternetWarning] Failed to render (skipped):', err?.message);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
