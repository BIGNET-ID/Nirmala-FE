'use client';

import { Component } from 'react';
import { Box } from '@mui/material';

/**
 * Error boundary for the WebGL weather scene. If three.js/WebGL fails on a
 * device, fall back to a static gradient so the login form stays usable.
 */
export default class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Box sx={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 30%, #0a1a3a 0%, #050811 60%)',
        }} />
      );
    }
    return this.props.children;
  }
}
