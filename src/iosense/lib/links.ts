import type { MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';

export const listPath = () => '/iosense/workflows';
export const editorPath = (id: string, query = '') => `/iosense/workflows/${id}${query}`;
/** The workflow with its History drawer open. */
export const historyPath = (id: string) => `/iosense/workflows/${id}/executions`;
/** One run, shown on the workflow's canvas (its path, its logs, the node that failed). */
export const runPath = (id: string, execId: string) => editorPath(id, `?execution=${execId}`);

/**
 * Props for an FDS Button/LinkButton that navigates: a real `href` (open in a
 * new tab still works) with a plain click handled by the router, so session
 * state survives.
 */
export function linkProps(navigate: NavigateFunction, to: string) {
  return {
    href: to,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
