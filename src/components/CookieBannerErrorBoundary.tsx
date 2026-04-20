/**
 * CookieBannerErrorBoundary — stub for local installs.
 * Analytics are not used locally; this renders children directly.
 */
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }

export default class CookieBannerErrorBoundary extends Component<Props> {
  render() { return this.props.children; }
}
