import { t } from '../i18n';

export function mountVideoTab(root: HTMLElement) {
  root.innerHTML = `<div class="layout"><section class="panel"><p class="empty">${t('videoSoon')}</p></section></div>`;
}
