/**
 * /browse — redirects to / (Home)
 *
 * The browse functionality was merged into the Home page.
 * This file exists only to handle any old bookmarks or links.
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function BrowsePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Preserve any ?q= search query when redirecting
    const q = searchParams.get('q');
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/', { replace: true });
  }, [navigate, searchParams]);

  return null;
}
