import { Link as RouterLink, Navigate as RouterNavigate } from 'react-router-dom';
import { Path, Params } from './routeConfig';

// Export standard React Router components with type safety
export const Link = RouterLink;
export const Navigate = RouterNavigate;

// Export types
export type { Path, Params };
