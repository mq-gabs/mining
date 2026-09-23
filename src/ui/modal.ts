export interface ModalAction {
  label: string;
  primary?: boolean;
  /** Extra button class, e.g. 'danger'. */
  className?: string;
  onClick: () => void;
}

const modal = () => document.getElementById('modal')!;
const card = () => document.getElementById('modal-card')!;

/** Shows a modal with arbitrary HTML body and a column of buttons. */
export function showModal(bodyHtml: string, actions: ModalAction[]) {
  card().innerHTML = bodyHtml;
  const row = document.createElement('div');
  row.className = 'modal-actions';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = ['btn', a.primary && 'primary', a.className].filter(Boolean).join(' ');
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      hideModal();
      a.onClick();
    });
    row.append(btn);
  }
  card().append(row);
  modal().hidden = false;
}

export function hideModal() {
  modal().hidden = true;
  card().innerHTML = '';
}

export function isModalOpen(): boolean {
  return !modal().hidden;
}
