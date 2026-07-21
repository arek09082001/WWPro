import { redirect } from 'next/navigation';

/**
 * Root route: redirects straight to the project list.
 * @returns Never renders — always redirects.
 */
export default function Home() {
  redirect('/projects');
}
